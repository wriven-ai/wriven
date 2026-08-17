"""Generation orchestration: build prompt -> call LLM -> validate structured output.

This is the port of the orchestration that lived in core-service's `AiService`
(before the provider call) — minus everything DB-bound (quota reserve, audit row,
sibling fetch), which stays in core. `generate()` is pure: same input -> same
LLM call, plus the structured-output validation retries.

Two structured paths use prompt + validate + one repair, never a provider
`response_format` (free models don't honour it reliably):
  - `select`  -> the answer must be one of the field's options.
  - `compose` -> the answer must be a JSON object keyed by the entry's field keys.
A second miss raises a *MissError carrying the spent tokens, so core meters the
cost on a `failed` row and charges no request quota.
"""

import json
import logging

from app.config import settings
from app.exceptions import (
    AiServiceError,
    ComposeMissError,
    InputTooLarge,
    NotConfigured,
    SelectMissError,
    TextGuardrailError,
)
from app.guardrails import is_unusable, sanitize, text_correction
from app.llm import LlmClient
from app.observability import record_generation_tokens
from app.prompts import build_compose_messages, build_messages, temperature_for
from app.schemas import (
    GenerateRequest,
    GenerateResponse,
    RecordOutput,
    ScalarOutput,
    Usage,
    UsageOut,
)

# Step-level trace logger. The correlation id (`request_id=…`) is attached by
# the HTTP middleware and matches core's and the gateway's logs for the same
# generation. Never log field content, instructions, or provider payloads.
logger = logging.getLogger("ai-service.generate")


def add_usage(*usages: Usage) -> Usage:
    """Aggregate every provider attempt so audit usage reflects real spend."""
    return Usage(
        prompt_tokens=sum(usage.prompt_tokens for usage in usages),
        completion_tokens=sum(usage.completion_tokens for usage in usages),
        total_tokens=sum(usage.total_tokens for usage in usages),
    )


def _attach_spend(
    exc: AiServiceError,
    *,
    usage: Usage,
    model: str,
    provider_request_id: str | None,
    finish_reason: str | None,
) -> None:
    """Fill the metering fields a transport-level failure leaves empty.

    When a REPAIR call dies provider-side (timeout, upstream error), the first
    attempt's spend would otherwise be discarded — violating "a failed provider
    call still burns tokens" (doc/ai-governance.md). Fill only empty fields so
    an error that already carries its own usage is never overwritten.
    """
    if exc.usage is None:
        exc.usage = usage
    if exc.model is None:
        exc.model = model
    if exc.provider_request_id is None:
        exc.provider_request_id = provider_request_id
    if exc.finish_reason is None:
        exc.finish_reason = finish_reason
    if exc.attempt_count is None:
        exc.attempt_count = 1


# Fixed framing allowance on top of the user-content cap: `input_chars()` also
# counts operation/content-type/label/profile framing, so budgeting the raw
# aggregate against `ai_max_input_chars` made an exactly-at-cap request always
# overshoot (an effective cap of ~23 994). The wrapper adds a small constant,
# bounded overhead.
_WRAPPER_ALLOWANCE_CHARS = 512


def _parse_record(text: str, allowed_keys: set[str]) -> dict[str, str] | None:
    """Best-effort parse of a JSON object, tolerant of a stray code fence.

    Returns a map limited to `allowed_keys` with string values, or None when the
    output is not a usable object. Unknown keys are dropped; at least one valid
    field is required by the caller.
    """
    candidate = text.strip()
    if candidate.startswith("```"):
        # Strip a ```json … ``` fence the model may add despite instructions.
        candidate = candidate.strip("`")
        newline = candidate.find("\n")
        if newline != -1:
            candidate = candidate[newline + 1 :]
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    out: dict[str, str] = {}
    for key, value in parsed.items():
        if key not in allowed_keys:
            continue
        # Coerce JSON scalars to their JSON literal text — Python `str()` on a
        # bool yields "True", which is not what a CMS field should store. Only
        # scalars are accepted; nested objects/arrays are dropped.
        if isinstance(value, bool):  # first: bool is an int subclass
            out[key] = "true" if value else "false"
        elif isinstance(value, (int, float)):
            out[key] = json.dumps(value)
        elif isinstance(value, str):
            out[key] = value
    return out or None


# Correction turns appended on a structured-output miss. Free models that fail a
# constrained request once usually fail the identical prompt again — feeding back
# the invalid answer + the exact constraint turns the retry into a real repair
# rather than a dice re-roll.
_COMPOSE_CORRECTION = (
    "Your previous answer was not a valid JSON object with the required keys. "
    "Return ONLY a JSON object (no prose, no markdown, no code fence) whose keys "
    "are exactly the field keys requested, each value a JSON string."
)


def _select_correction(options: list[str]) -> str:
    return (
        "Your previous answer was not one of the allowed options. "
        f"Respond with EXACTLY ONE of: {', '.join(options)}. Nothing else."
    )


async def generate(req: GenerateRequest, client: LlmClient) -> GenerateResponse:
    if not client.configured():
        raise NotConfigured()

    logger.info(
        "generate start op=%s target=%s field=%s",
        req.operation,
        req.target_kind,
        req.field.key if req.field else f"compose:{len(req.compose_fields or [])} fields",
    )

    # Enforced here rather than in the Pydantic validator so an over-budget
    # request surfaces as AI_INPUT_TOO_LARGE (actionable) instead of collapsing
    # into a generic schema rejection. Checked before any provider spend.
    if req.input_chars() > settings.ai_max_input_chars + _WRAPPER_ALLOWANCE_CHARS:
        logger.warning(
            "generate rejected op=%s reason=input-too-large chars=%d budget=%d",
            req.operation,
            req.input_chars(),
            settings.ai_max_input_chars,
        )
        raise InputTooLarge()

    if req.operation == "compose":
        return await _compose(req, client)
    return await _field(req, client)


async def _field(req: GenerateRequest, client: LlmClient) -> GenerateResponse:
    """Single-field generate/refine, with the `select` validate-and-retry path."""
    operation = req.operation
    assert req.field is not None  # guaranteed by GenerateRequest validation
    messages = build_messages(req, operation)
    temperature = temperature_for(operation, req.field.type)

    text, model, usage, provider_request_id, finish_reason = await client.chat(
        messages, temperature, operation
    )
    attempt_count = 1

    if req.field.type == "select" and req.field.options:
        if text.strip() not in req.field.options:
            logger.info("select repair op=%s reason=option-miss", operation)
            first_usage = usage
            # Repair, not a re-roll: echo the invalid answer back and restate the
            # exact constraint so the model corrects course.
            retry_messages = messages + [
                {"role": "assistant", "content": text},
                {"role": "user", "content": _select_correction(req.field.options)},
            ]
            try:
                text, model, retry_usage, provider_request_id, finish_reason = await client.chat(
                    retry_messages, temperature, operation
                )
            except AiServiceError as exc:
                # The repair died transport-level — attempt 1's spend must still
                # reach core's failed audit row.
                _attach_spend(
                    exc,
                    usage=usage,
                    model=model,
                    provider_request_id=provider_request_id,
                    finish_reason=finish_reason,
                )
                raise
            usage = add_usage(first_usage, retry_usage)
            attempt_count += 1
        if text.strip() not in req.field.options:
            logger.warning("select failed op=%s reason=double-miss attempts=2", operation)
            record_generation_tokens(usage.total_tokens)
            raise SelectMissError(
                model=model,
                usage=usage,
                provider_request_id=provider_request_id,
                finish_reason=finish_reason,
                attempt_count=attempt_count,
            )
        text = text.strip()

    # Free-text guardrail (text / richtext). `select` validated above. Sanitize
    # every answer; if the result still looks like reasoning or a prompt echo,
    # give the model one repair turn — same shape as the select/compose loops.
    if req.field.type != "select":
        text = sanitize(text, req.field.type)
        if is_unusable(text):
            logger.info("guardrail repair op=%s reason=unusable-output", operation)
            first_usage = usage
            retry_messages = messages + [
                {"role": "assistant", "content": text},
                {"role": "user", "content": text_correction(req.field.label)},
            ]
            try:
                text, model, retry_usage, provider_request_id, finish_reason = await client.chat(
                    retry_messages, temperature, operation
                )
            except AiServiceError as exc:
                # The repair died transport-level — attempt 1's spend must still
                # reach core's failed audit row.
                _attach_spend(
                    exc,
                    usage=usage,
                    model=model,
                    provider_request_id=provider_request_id,
                    finish_reason=finish_reason,
                )
                raise
            usage = add_usage(first_usage, retry_usage)
            attempt_count += 1
            text = sanitize(text, req.field.type)
            if is_unusable(text):
                logger.warning("guardrail failed op=%s reason=double-miss attempts=2", operation)
                record_generation_tokens(usage.total_tokens)
                raise TextGuardrailError(
                    model=model,
                    usage=usage,
                    provider_request_id=provider_request_id,
                    finish_reason=finish_reason,
                    attempt_count=attempt_count,
                )

    record_generation_tokens(usage.total_tokens)
    return GenerateResponse(
        output=ScalarOutput(text=text),
        model=model,
        usage=_usage_out(usage),
        provider_request_id=provider_request_id,
        finish_reason=finish_reason,
        attempt_count=attempt_count,
    )


async def _compose(req: GenerateRequest, client: LlmClient) -> GenerateResponse:
    """Whole-entry draft: JSON object keyed by field key, validated + repaired once."""
    allowed = {definition.key for definition in req.compose_fields or []}
    messages = build_compose_messages(req)
    temperature = temperature_for("compose", "")

    text, model, usage, provider_request_id, finish_reason = await client.chat(
        messages, temperature, "compose"
    )
    fields = _parse_record(text, allowed)
    attempt_count = 1

    if fields is None:
        logger.info("compose repair reason=invalid-json")
        first_usage = usage
        # Repair: echo the invalid output + restate the JSON-only constraint.
        retry_messages = messages + [
            {"role": "assistant", "content": text},
            {"role": "user", "content": _COMPOSE_CORRECTION},
        ]
        try:
            text, model, retry_usage, provider_request_id, finish_reason = await client.chat(
                retry_messages, temperature, "compose"
            )
        except AiServiceError as exc:
            # The repair died transport-level — attempt 1's spend must still
            # reach core's failed audit row.
            _attach_spend(
                exc,
                usage=usage,
                model=model,
                provider_request_id=provider_request_id,
                finish_reason=finish_reason,
            )
            raise
        usage = add_usage(first_usage, retry_usage)
        attempt_count += 1
        fields = _parse_record(text, allowed)

    if fields is None:
        logger.warning("compose failed reason=double-miss attempts=2")
        record_generation_tokens(usage.total_tokens)
        raise ComposeMissError(
            model=model,
            usage=usage,
            provider_request_id=provider_request_id,
            finish_reason=finish_reason,
            attempt_count=attempt_count,
        )

    record_generation_tokens(usage.total_tokens)
    return GenerateResponse(
        output=RecordOutput(fields=fields),
        model=model,
        usage=_usage_out(usage),
        provider_request_id=provider_request_id,
        finish_reason=finish_reason,
        attempt_count=attempt_count,
    )


def _usage_out(usage: Usage) -> UsageOut:
    return UsageOut(
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        total_tokens=usage.total_tokens,
    )
