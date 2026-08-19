"""Request-scoped, safe operational metadata for ai-service logs.

Generation payloads can contain private CMS content, so logs deliberately carry
only a sanitized correlation id plus HTTP metadata—never prompts or responses.
"""

import re
from contextvars import ContextVar
from logging import Filter, LogRecord
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.responses import Response

_request_id: ContextVar[str] = ContextVar("request_id", default="-")
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_http_requests: dict[tuple[str, int], int] = {}
_http_duration_ms: dict[str, tuple[int, int]] = {}
_provider_calls: dict[str, int] = {}
_provider_duration_ms: dict[str, tuple[int, int]] = {}
_generation_tokens_total = 0
_provider_throttles_total = 0


def request_id() -> str:
    return _request_id.get()


def record_http_request(path: str, status: int, duration_ms: int) -> None:
    """Count one finished HTTP request (any status).

    Shared by the observability middleware (normal responses) and the generic
    exception handler (unhandled exceptions never flow back through the
    middleware's success path, so they are counted where the status is known).
    """
    _http_requests[(path, status)] = _http_requests.get((path, status), 0) + 1
    count, total = _http_duration_ms.get(path, (0, 0))
    _http_duration_ms[path] = (count + 1, total + duration_ms)


def record_provider_call(outcome: str, duration_ms: int) -> None:
    _provider_calls[outcome] = _provider_calls.get(outcome, 0) + 1
    count, total = _provider_duration_ms.get(outcome, (0, 0))
    _provider_duration_ms[outcome] = (count + 1, total + duration_ms)


def record_generation_tokens(total_tokens: int) -> None:
    global _generation_tokens_total
    _generation_tokens_total += max(total_tokens, 0)


def record_provider_throttle() -> None:
    global _provider_throttles_total
    _provider_throttles_total += 1


def render_prometheus_metrics() -> str:
    """Small dependency-free Prometheus exposition for a private service."""
    lines = [
        "# HELP wriven_ai_http_requests_total AI service HTTP requests by route and status.",
        "# TYPE wriven_ai_http_requests_total counter",
    ]
    for (path, status), count in sorted(_http_requests.items()):
        lines.append(f'wriven_ai_http_requests_total{{path="{path}",status="{status}"}} {count}')
    lines.extend(
        [
            "# HELP wriven_ai_http_duration_ms_total Total AI service HTTP request duration in milliseconds.",
            "# TYPE wriven_ai_http_duration_ms_total counter",
        ]
    )
    for path, (count, total) in sorted(_http_duration_ms.items()):
        lines.append(f'wriven_ai_http_duration_ms_total{{path="{path}"}} {total}')
        lines.append(f'wriven_ai_http_duration_ms_count{{path="{path}"}} {count}')
    lines.extend(
        [
            "# HELP wriven_ai_provider_calls_total Provider calls by outcome.",
            "# TYPE wriven_ai_provider_calls_total counter",
        ]
    )
    for outcome, count in sorted(_provider_calls.items()):
        lines.append(f'wriven_ai_provider_calls_total{{outcome="{outcome}"}} {count}')
    for outcome, (count, total) in sorted(_provider_duration_ms.items()):
        lines.append(f'wriven_ai_provider_duration_ms_total{{outcome="{outcome}"}} {total}')
        lines.append(f'wriven_ai_provider_duration_ms_count{{outcome="{outcome}"}} {count}')
    lines.extend(
        [
            "# HELP wriven_ai_generation_tokens_total Provider-reported tokens (prompt + completion) across all generation attempts.",
            "# TYPE wriven_ai_generation_tokens_total counter",
            f"wriven_ai_generation_tokens_total {_generation_tokens_total}",
            "# HELP wriven_ai_provider_throttles_total Provider rate-limit responses.",
            "# TYPE wriven_ai_provider_throttles_total counter",
            f"wriven_ai_provider_throttles_total {_provider_throttles_total}",
        ]
    )
    return "\n".join(lines) + "\n"


class RequestIdFilter(Filter):
    """Adds the request id expected by the structured log formatter."""

    def filter(self, record: LogRecord) -> bool:
        record.request_id = request_id()
        return True


def install_request_observability(app: FastAPI) -> None:
    """Attach a correlation id and emit one logfmt line per request."""
    import logging
    import time

    logger = logging.getLogger("ai-service.http")

    @app.middleware("http")
    async def correlate(request: Request, call_next) -> Response:
        incoming = request.headers.get("x-request-id", "")
        correlation_id = incoming if _SAFE_REQUEST_ID.fullmatch(incoming) else str(uuid4())
        token = _request_id.set(correlation_id)
        started_at = time.perf_counter()
        # Visible to the generic exception handler (ServerErrorMiddleware), which
        # answers outside this middleware — it needs the start time to record the
        # request's true duration and status.
        request.state.started_at = started_at
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            # No metric here — the exception never rounds back through the else
            # branch, and this middleware cannot know the final status. The
            # generic handler in app.exceptions records it with the status it
            # actually emits.
            logger.exception(
                "event=http_request_failed method=%s path=%s duration_ms=%d",
                request.method,
                request.url.path,
                duration_ms,
            )
            raise
        else:
            response.headers["X-Request-ID"] = correlation_id
            path = request.url.path
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            record_http_request(path, response.status_code, duration_ms)
            logger.info(
                "event=http_request method=%s path=%s status=%d duration_ms=%d",
                request.method,
                path,
                response.status_code,
                duration_ms,
            )
            return response
        finally:
            _request_id.reset(token)
