"""Pydantic models for the core-service -> ai-service payload.

The wire shape is camelCase to match `AiGenerateRequest` on the TypeScript side
(core-service). `alias_generator=to_camel` + `populate_by_name=True` maps
camelCase JSON fields onto snake_case Python attrs, and FastAPI serializes
responses with aliases (so `prompt_tokens` -> `promptTokens`).

KEEP `OPERATIONS` IN SYNC with `AI_OPERATIONS` in
`libs/shared/contracts/src/lib/dto/ai.dto.ts` (7 values). Python cannot import
the TS contract, so the literal is reproduced here; any new operation must be
added on both sides.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.config import settings

# Mirror the gateway's class-validator caps (libs/shared/contracts ai.dto.ts) so
# the internal boundary rejects oversized payloads even if a caller bypasses core.
_MAX_FIELD_KEY = 60
_MAX_LABEL = 120
_MAX_CONTENT_TYPE = 120
_MAX_INSTRUCTION = 2000
_MAX_SOURCE_CONTENT = 8000
_MAX_TONE = 120
_MAX_TURN_CONTENT = 8000
_MAX_OPTIONS = 100
_MAX_SIBLING_VALUES = 50
_MAX_HISTORY_TURNS = 8

Option = Annotated[str, Field(min_length=1, max_length=_MAX_LABEL)]

# Mirror of `AI_OPERATIONS` (@wriven/contracts). See module docstring.
OPERATIONS = (
    "generate",
    "expand",
    "shorten",
    "rewrite",
    "tone",
    "summarize",
    "continue",
)
Operation = Literal[
    "generate",
    "expand",
    "shorten",
    "rewrite",
    "tone",
    "summarize",
    "continue",
]

# Tier-1 field types only — core-service validates this before calling, so a
# non-Tier-1 here is a programmer error (Pydantic 422 -> core maps to AI_GENERATION_FAILED).
FieldType = Literal["text", "richtext", "select"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


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


class GenerateRequest(CamelModel):
    operation: Operation
    content_type_name: str = Field(max_length=_MAX_CONTENT_TYPE)
    field: FieldDefIn
    source_content: str | None = Field(default=None, max_length=_MAX_SOURCE_CONTENT)
    sibling_values: list[SiblingValue] | None = Field(default=None, max_length=_MAX_SIBLING_VALUES)
    history: list[AiTurnIn] | None = Field(default=None, max_length=_MAX_HISTORY_TURNS)
    instruction: str | None = Field(default=None, max_length=_MAX_INSTRUCTION)
    tone: str | None = Field(default=None, max_length=_MAX_TONE)

    @model_validator(mode="after")
    def validate_refinement_input(self) -> "GenerateRequest":
        refinements = {"expand", "shorten", "rewrite", "tone", "summarize", "continue"}
        if self.field.type == "select" and self.operation != "generate":
            raise ValueError("select fields only support the generate operation")
        if self.operation in refinements and not (self.source_content or "").strip():
            raise ValueError("refinement operations require source content")
        if self.operation == "tone" and not (self.tone or "").strip():
            raise ValueError("tone operation requires a target tone")
        if self.input_chars() > settings.ai_max_input_chars:
            raise ValueError("generation input exceeds the configured context budget")
        return self

    def input_chars(self) -> int:
        """Count user-controlled input before prompt assembly.

        Individual caps prevent pathological fields; this aggregate cap prevents
        otherwise-valid history + sibling context + draft combinations from
        becoming an unexpectedly expensive provider prompt.
        """
        pieces = [
            self.operation,
            self.content_type_name,
            self.field.key,
            self.field.label,
            self.source_content or "",
            self.instruction or "",
            self.tone or "",
            *(self.field.options or []),
        ]
        for sibling in self.sibling_values or []:
            pieces.extend((sibling.label, sibling.value))
        for turn in self.history or []:
            pieces.extend((turn.role, turn.content))
        return sum(len(piece) for piece in pieces)


class UsageOut(CamelModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class GenerateResponse(CamelModel):
    text: str
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
