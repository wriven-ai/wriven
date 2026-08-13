"""Pydantic models for the core-service -> ai-service payload.

The wire shape is camelCase to match `AiGenerateRequest` on the TypeScript side
(core-service). `alias_generator=to_camel` + `populate_by_name=True` maps
camelCase JSON fields onto snake_case Python attrs, and FastAPI serializes
responses with aliases (so `prompt_tokens` -> `promptTokens`).

Request models use `extra="ignore"` deliberately: during a rolling deploy a
newer core-service may send a field this build does not know yet, and rejecting
it would turn every generation into a 502 until ai-service catches up. Unknown
fields are dropped instead. (Deploy order is still ai-service first.)

KEEP `OPERATIONS` IN SYNC with `AI_OPERATIONS` in
`libs/shared/contracts/src/lib/dto/ai.dto.ts` (9 values). Python cannot import
the TS contract, so the literal is reproduced here; a parity test in
`tests/test_schemas_and_contract.py` reads the TS file and asserts they match.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# Mirror the gateway's class-validator caps (libs/shared/contracts ai.dto.ts) so
# the internal boundary rejects oversized payloads even if a caller bypasses core.
_MAX_FIELD_KEY = 60
_MAX_LABEL = 120
_MAX_CONTENT_TYPE = 120
_MAX_INSTRUCTION = 2000
_MAX_SOURCE_CONTENT = 24_000
_MAX_TURN_CONTENT = 8000
_MAX_OPTIONS = 100
_MAX_SIBLING_VALUES = 50
_MAX_HISTORY_TURNS = 8
_MAX_COMPOSE_FIELDS = 40

Option = Annotated[str, Field(min_length=1, max_length=_MAX_LABEL)]

# Mirror of `AI_OPERATIONS` (@wriven/contracts). See module docstring.
OPERATIONS = (
    "generate",
    "compose",
    "refine",
    "expand",
    "shorten",
    "rewrite",
    "tone",
    "summarize",
    "continue",
)
Operation = Literal[
    "generate",
    "compose",
    "refine",
    "expand",
    "shorten",
    "rewrite",
    "tone",
    "summarize",
    "continue",
]

# Operations that transform content the author already has. Each requires
# `source_content`; core enforces this first, this is defence in depth.
REFINEMENT_OPERATIONS = frozenset(
    {"refine", "expand", "shorten", "rewrite", "tone", "summarize", "continue"}
)

TargetKind = Literal["field", "entry"]

# Tier-1 field types only — core-service validates this before calling, so a
# non-Tier-1 here is a programmer error (Pydantic 422 -> core maps to AI_GENERATION_FAILED).
FieldType = Literal["text", "richtext", "select"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class FieldDefIn(CamelModel):
    key: str = Field(max_length=_MAX_FIELD_KEY)
    label: str = Field(max_length=_MAX_LABEL)
    type: FieldType
    options: list[Option] | None = Field(default=None, max_length=_MAX_OPTIONS)

    @model_validator(mode="after")
    def validate_select_options(self) -> "FieldDefIn":
        if self.type == "select":
            if not self.options:
                raise ValueError("select fields require options")
            if any(option != option.strip() for option in self.options):
                raise ValueError("select options must not have leading or trailing whitespace")
            if len(set(self.options)) != len(self.options):
                raise ValueError("select options must be unique")
        elif self.options:
            raise ValueError("only select fields accept options")
        return self


class SiblingValue(CamelModel):
    label: str = Field(max_length=_MAX_LABEL)
    value: str = Field(max_length=_MAX_TURN_CONTENT)


class AiTurnIn(CamelModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=_MAX_TURN_CONTENT)


class GlossaryTermIn(CamelModel):
    term: str = Field(min_length=1, max_length=_MAX_LABEL)
    prefer: str = Field(min_length=1, max_length=_MAX_LABEL)


class ProfileIn(CamelModel):
    brand_voice: str | None = Field(default=None, max_length=2000)
    glossary: list[GlossaryTermIn] | None = Field(default=None, max_length=50)
    language: str | None = Field(default=None, max_length=20)


class GenerateRequest(CamelModel):
    """One generation turn. `operation` is derived by core, never by the client.

    A single-field turn carries `field`; a whole-entry `compose` carries
    `compose_fields` (the eligible field schema to fill) and `target_kind:'entry'`.
    """

    operation: Operation
    target_kind: TargetKind = "field"
    content_type_name: str = Field(max_length=_MAX_CONTENT_TYPE)
    field: FieldDefIn | None = None
    compose_fields: list[FieldDefIn] | None = Field(default=None, max_length=_MAX_COMPOSE_FIELDS)
    source_content: str | None = Field(default=None, max_length=_MAX_SOURCE_CONTENT)
    sibling_values: list[SiblingValue] | None = Field(default=None, max_length=_MAX_SIBLING_VALUES)
    history: list[AiTurnIn] | None = Field(default=None, max_length=_MAX_HISTORY_TURNS)
    instruction: str | None = Field(default=None, max_length=_MAX_INSTRUCTION)
    profile: ProfileIn | None = None

    @model_validator(mode="after")
    def validate_operation_input(self) -> "GenerateRequest":
        if self.operation == "compose":
            if self.target_kind != "entry":
                raise ValueError("compose requires target_kind 'entry'")
            if not self.compose_fields:
                raise ValueError("compose requires compose_fields")
            return self
        # Every non-compose operation targets one field.
        if self.field is None:
            raise ValueError("a target field is required")
        if self.field.type == "select" and self.operation != "generate":
            raise ValueError("select fields only support the generate operation")
        if self.operation in REFINEMENT_OPERATIONS and not (self.source_content or "").strip():
            raise ValueError("refinement operations require source content")
        return self

    def input_chars(self) -> int:
        """Count user-controlled input before prompt assembly.

        Individual caps prevent pathological fields; this aggregate count backs
        the budget check in `generator.generate`, which stops otherwise-valid
        history + sibling context + draft combinations from becoming an
        unexpectedly expensive provider prompt. Enforced there (not in this
        validator) so the failure maps to `AI_INPUT_TOO_LARGE` rather than a
        generic schema rejection.
        """
        pieces = [
            self.operation,
            self.content_type_name,
            self.source_content or "",
            self.instruction or "",
        ]
        for definition in ([self.field] if self.field else []) + (self.compose_fields or []):
            pieces.extend((definition.key, definition.label, *(definition.options or [])))
        for sibling in self.sibling_values or []:
            pieces.extend((sibling.label, sibling.value))
        for turn in self.history or []:
            pieces.extend((turn.role, turn.content))
        if self.profile:
            pieces.append(self.profile.brand_voice or "")
            pieces.append(self.profile.language or "")
            for term in self.profile.glossary or []:
                pieces.extend((term.term, term.prefer))
        return sum(len(piece) for piece in pieces)


class UsageOut(CamelModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ScalarOutput(CamelModel):
    kind: Literal["scalar"] = "scalar"
    text: str


class RecordOutput(CamelModel):
    kind: Literal["record"] = "record"
    fields: dict[str, str]


class GenerateResponse(CamelModel):
    output: ScalarOutput | RecordOutput = Field(discriminator="kind")
    model: str
    usage: UsageOut
    provider_request_id: str | None = None
    finish_reason: str | None = None
    attempt_count: int = Field(ge=1)


# Re-exported for `app.llm` (internal construction, not serialized directly).
class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
