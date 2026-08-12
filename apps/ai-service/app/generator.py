"""Generation orchestration: build prompt -> call LLM -> `select` validation+retry.

This is the port of the orchestration that lived in core-service's `AiService`
(before the provider call) — minus everything DB-bound (quota reserve, audit row,
sibling fetch), which stays in core. `generate()` is pure: same input -> same
LLM call, plus the `select` option-validation retry.
"""

from app.exceptions import NotConfigured, SelectMissError
from app.llm import LlmClient
from app.observability import record_generation_tokens
from app.prompts import build_messages, temperature_for
from app.schemas import GenerateRequest, GenerateResponse, Usage, UsageOut


def add_usage(*usages: Usage) -> Usage:
    """Aggregate every provider attempt so audit usage reflects real spend."""
    return Usage(
        prompt_tokens=sum(usage.prompt_tokens for usage in usages),
        completion_tokens=sum(usage.completion_tokens for usage in usages),
        total_tokens=sum(usage.total_tokens for usage in usages),
    )


async def generate(req: GenerateRequest, client: LlmClient) -> GenerateResponse:
    if not client.configured():
        raise NotConfigured()

    operation = req.operation
    messages = build_messages(req, operation)
    temperature = temperature_for(operation, req.field.type)

    text, model, usage, provider_request_id, finish_reason = await client.chat(
        messages, temperature, operation
    )
    attempt_count = 1

    # `select`: validate against options + retry once (free models can't be
    # trusted with constrained output). A second miss -> SelectMissError (502)
    # carrying the spent model+usage so core can meter the consumed tokens on
    # the failed row; core marks the row failed and charges no request quota.
    if req.field.type == "select" and req.field.options:
        if text.strip() not in req.field.options:
            first_usage = usage
            text, model, retry_usage, provider_request_id, finish_reason = await client.chat(
                messages, temperature, operation
            )
            usage = add_usage(first_usage, retry_usage)
            attempt_count += 1
        if text.strip() not in req.field.options:
            # This request failed validation but the provider completed both
            # attempts, so its spend belongs in operational token metrics too.
            record_generation_tokens(usage.total_tokens)
            raise SelectMissError(
                model=model,
                usage=usage,
                provider_request_id=provider_request_id,
                finish_reason=finish_reason,
                attempt_count=attempt_count,
            )
        text = text.strip()

    record_generation_tokens(usage.total_tokens)
    return GenerateResponse(
        text=text,
        model=model,
        usage=UsageOut(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
        ),
        provider_request_id=provider_request_id,
        finish_reason=finish_reason,
        attempt_count=attempt_count,
    )
