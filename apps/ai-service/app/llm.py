"""The LLM seam — the only place the `openai` SDK is imported.

`LlmClient` wraps `AsyncOpenAI` configured from `settings` (any OpenAI-compatible
Chat Completions endpoint: OpenRouter, OpenAI, Groq, … swapped via env, not code).
It constructs one client with an explicit timeout (never the SDK default) and
collapses upstream failures to a short, leak-free `ProviderError`.

A missing key does NOT crash the service — `configured()` returns False and the
generator raises `NotConfigured` per call (503), so the service always boots.
"""

import json
import logging
import time

from openai import NOT_GIVEN, AsyncOpenAI, OpenAIError, RateLimitError

from app.config import settings
from app.exceptions import ProviderError
from app.observability import record_provider_call, record_provider_throttle
from app.prompts import ChatMessage
from app.schemas import Operation, Usage

logger = logging.getLogger("ai-service.llm")

# Product policy: bounded output per action. AI_MAX_OUTPUT_TOKENS is the
# deployment-wide ceiling; an operation may only lower it. Keep verbose actions
# bounded even if an operator increases the global ceiling for another use case.
# Caps are deliberately generous: on the default free provider spend is $0
# while a truncated answer is a direct UX hit.
_OPERATION_OUTPUT_TOKEN_CAPS: dict[str, int] = {
    "generate": 3_000,
    "compose": 6_000,
    "refine": 3_000,
    "expand": 4_000,
    "shorten": 1_200,
    "rewrite": 3_000,
    "tone": 2_400,
    "summarize": 1_200,
    "continue": 3_000,
}


def _parse_headers(raw: str) -> dict[str, str]:
    """Parse the optional `AI_HEADERS` JSON env into a header record; tolerant."""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


class LlmClient:
    def __init__(self) -> None:
        self._model = settings.ai_model
        self._client: AsyncOpenAI | None = (
            AsyncOpenAI(
                api_key=settings.ai_api_key,
                base_url=settings.ai_base_url or None,
                timeout=settings.ai_timeout_ms / 1000,
                # Core's request deadline must bound the full generation. Retrying
                # here can outlive that deadline and cause duplicate paid work when
                # the caller retries, so durable-job retry policy owns retries.
                max_retries=0,
                default_headers=_parse_headers(settings.ai_headers),
            )
            if settings.ai_api_key
            else None
        )

    def configured(self) -> bool:
        return self._client is not None and bool(self._model.strip())

    async def chat(
        self,
        messages: list[ChatMessage],
        temperature: float,
        operation: Operation,
        *,
        timeout_s: float | None = None,
    ) -> tuple[str, str, Usage, str | None, str | None]:
        """Run one Chat Completions call. Raises `ProviderError` on any failure.

        `timeout_s` narrows the client default for a single call (a repair turn
        bounded by the remaining generation deadline); `None` keeps the default.
        """
        if self._client is None:
            # Defensive — the generator checks configured() first and raises NotConfigured.
            raise ProviderError("AI provider not configured")  # pragma: no cover

        try:
            started_at = time.perf_counter()
            res = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                # NOT_GIVEN (not None — which the SDK reads as "no timeout")
                # keeps the client-level default when the caller sets no bound.
                timeout=timeout_s if timeout_s is not None else NOT_GIVEN,
                max_tokens=min(
                    settings.ai_max_output_tokens,
                    # `.get` (not `[…]`) so adding an operation to the contract can
                    # never turn into a KeyError -> opaque 502 at request time.
                    _OPERATION_OUTPUT_TOKEN_CAPS.get(
                        operation, settings.ai_max_output_tokens
                    ),
                ),
            )
        except RateLimitError:
            # Shared provider key exhausted (~RPM) — friendlier copy, still a failed gen.
            record_provider_throttle()
            record_provider_call("throttled", int((time.perf_counter() - started_at) * 1000))
            raise ProviderError("The AI provider is busy — try again shortly.")
        except OpenAIError as exc:
            # Log the exception type only — `str(exc)` embeds the provider
            # response body, which can quote request content (governance:
            # never log raw provider error bodies).
            record_provider_call("error", int((time.perf_counter() - started_at) * 1000))
            logger.warning("AI generation failed: %s", type(exc).__name__)
            raise ProviderError("AI generation failed.")

        if not res.choices:
            record_provider_call("invalid_response", int((time.perf_counter() - started_at) * 1000))
            logger.warning("AI provider returned a completion without choices")
            raise ProviderError("AI generation failed.")

        choice = res.choices[0]
        record_provider_call("success", int((time.perf_counter() - started_at) * 1000))
        # Token totals and finish reason only — never prompt or completion text.
        logger.info(
            "provider ok op=%s model=%s duration_ms=%d tokens=%d finish=%s",
            operation,
            res.model,
            int((time.perf_counter() - started_at) * 1000),
            res.usage.total_tokens if res.usage else 0,
            choice.finish_reason,
        )

        text = choice.message.content or ""
        u = res.usage
        return (
            text,
            res.model,
            Usage(
                prompt_tokens=u.prompt_tokens if u else 0,
                completion_tokens=u.completion_tokens if u else 0,
                total_tokens=u.total_tokens if u else 0,
            ),
            res.id or None,
            choice.finish_reason,
        )


# Module-level singleton — the client is built once at import (config is static).
llm_client = LlmClient()
