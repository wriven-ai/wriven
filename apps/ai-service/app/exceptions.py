"""Domain errors + FastAPI exception handlers.

Every error surfaces as a flat JSON body `{"code": str, "message": str}` whose
HTTP status matches the contract core-service expects (so core can pass the
code straight through):

  - `AI_NOT_CONFIGURED`   503  — provider key missing on this service
  - `AI_GENERATION_FAILED` 502 — provider error / timeout / upstream 429 /
                                  `select` option miss after retry
  - `AI_INPUT_TOO_LARGE`   422 — aggregate input exceeds the context budget
  - `INVALID_INTERNAL_SECRET` 401 — missing/mismatched `X-Internal-Secret`

Messages are short and leak-free (never the raw provider payload). Unhandled
exceptions + Pydantic validation errors collapse to a generic
`AI_GENERATION_FAILED` so a stack trace / schema detail never escapes.

When the LLM call succeeded but validation still fails (the `select` option
miss), the consumed `model` + `usage` ride along on the error so core can still
record them on the `failed` audit row (metering data integrity — tokens were
spent).
"""

import logging
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.observability import record_http_request
from app.schemas import Usage

logger = logging.getLogger("ai-service.errors")


class AiServiceError(Exception):
    """Base. `code` + `status_code` are set by subclasses."""

    code: str = "AI_GENERATION_FAILED"
    status_code: int = 502

    def __init__(
        self,
        message: str = "AI generation failed.",
        *,
        model: str | None = None,
        usage: Usage | None = None,
        provider_request_id: str | None = None,
        finish_reason: str | None = None,
        attempt_count: int | None = None,
    ) -> None:
        self.message = message
        self.model = model
        self.usage = usage
        self.provider_request_id = provider_request_id
        self.finish_reason = finish_reason
        self.attempt_count = attempt_count
        super().__init__(self.message)


class NotConfigured(AiServiceError):
    code = "AI_NOT_CONFIGURED"
    status_code = 503

    def __init__(self) -> None:
        super().__init__("AI generation is not configured for this workspace.")


class ProviderError(AiServiceError):
    """Upstream provider failure / timeout / 429."""

    code = "AI_GENERATION_FAILED"
    status_code = 502


class SelectMissError(AiServiceError):
    """`select` output missed `options[]` even after the one retry.

    Carries the consumed `model` + `usage` so core can meter the spent tokens
    on the `failed` row (failed rows don't count against the request quota, but
    the token totals are still recorded for audit).
    """

    code = "AI_GENERATION_FAILED"
    status_code = 502

    def __init__(
        self,
        *,
        model: str,
        usage: Usage,
        provider_request_id: str | None,
        finish_reason: str | None,
        attempt_count: int,
    ) -> None:
        super().__init__(
            "The model could not produce a valid option. Please try again.",
            model=model,
            usage=usage,
            provider_request_id=provider_request_id,
            finish_reason=finish_reason,
            attempt_count=attempt_count,
        )


class ComposeMissError(AiServiceError):
    """Whole-entry `compose` invalid after retry; same metering contract as
    `SelectMissError` (model + usage ride on the error)."""

    code = "AI_GENERATION_FAILED"
    status_code = 502

    def __init__(
        self,
        *,
        model: str,
        usage: Usage,
        provider_request_id: str | None,
        finish_reason: str | None,
        attempt_count: int,
    ) -> None:
        super().__init__(
            "The model could not draft a valid entry. Please try again.",
            model=model,
            usage=usage,
            provider_request_id=provider_request_id,
            finish_reason=finish_reason,
            attempt_count=attempt_count,
        )


class TextGuardrailError(AiServiceError):
    """Free-text output unusable after retry; same metering contract as
    `SelectMissError`."""

    code = "AI_GENERATION_FAILED"
    status_code = 502

    def __init__(
        self,
        *,
        model: str,
        usage: Usage,
        provider_request_id: str | None,
        finish_reason: str | None,
        attempt_count: int,
    ) -> None:
        super().__init__(
            "The model could not produce usable field content. Please try again.",
            model=model,
            usage=usage,
            provider_request_id=provider_request_id,
            finish_reason=finish_reason,
            attempt_count=attempt_count,
        )


class InvalidSecretError(AiServiceError):
    code = "INVALID_INTERNAL_SECRET"
    status_code = 401

    def __init__(self) -> None:
        super().__init__("Missing or invalid internal secret.")


class InputTooLarge(AiServiceError):
    """Aggregate user-controlled input exceeds the configured context budget.

    Distinct from a generic failure so the author gets an actionable message
    ("shorten the draft or clear the conversation") instead of "try again".
    """

    code = "AI_INPUT_TOO_LARGE"
    status_code = 422

    def __init__(self) -> None:
        super().__init__(
            "This request is too large. Shorten the field content or clear the conversation."
        )


def _body(code: str, message: str, **extra: object) -> dict[str, object]:
    out: dict[str, object] = {"code": code, "message": message}
    out.update(extra)
    return out


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AiServiceError)
    async def _handle_ai_error(_: Request, exc: AiServiceError) -> JSONResponse:
        extra: dict[str, object] = {}
        if exc.model is not None:
            extra["model"] = exc.model
        if exc.usage is not None:
            # camelCase to match AiTokenUsage on the TS side
            extra["usage"] = exc.usage.model_dump(by_alias=True)
        if exc.provider_request_id is not None:
            extra["providerRequestId"] = exc.provider_request_id
        if exc.finish_reason is not None:
            extra["finishReason"] = exc.finish_reason
        if exc.attempt_count is not None:
            extra["attemptCount"] = exc.attempt_count
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message, **extra))

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:  # noqa: ARG001
        # Never leak Pydantic field-level detail across the boundary.
        return JSONResponse(
            status_code=422,
            content=_body("AI_GENERATION_FAILED", "Invalid generation request."),
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:  # noqa: BLE001
        # Never leak the real cause — collapse to a generic generation failure.
        logger.exception("event=unexpected_generation_error")
        # The unhandled exception bypassed the observability middleware's success
        # path (it re-raises past this handler's caller chain), so the request is
        # counted here with the status actually emitted — not a guessed 500.
        started_at = getattr(request.state, "started_at", None)
        record_http_request(
            request.url.path,
            502,
            int((time.perf_counter() - started_at) * 1000) if started_at is not None else 0,
        )
        return JSONResponse(
            status_code=502,
            content=_body("AI_GENERATION_FAILED", "AI generation failed."),
        )
