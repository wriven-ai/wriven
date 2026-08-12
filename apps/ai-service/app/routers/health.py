"""Health + root endpoints (unauthenticated — used by health checks)."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse

from app.llm import llm_client
from app.observability import render_prometheus_metrics

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "ai-service"})


@router.get("/ready")
async def ready() -> JSONResponse:
    """Readiness is stricter than liveness: configuration must permit calls."""
    configured = llm_client.configured()
    return JSONResponse(
        {
            "status": "ready" if configured else "not_ready",
            "service": "ai-service",
            "providerConfigured": configured,
        },
        status_code=200 if configured else 503,
    )


@router.get("/metrics", include_in_schema=False)
async def metrics() -> PlainTextResponse:
    """Private Prometheus scrape endpoint; deploy it only on the internal network."""
    return PlainTextResponse(
        render_prometheus_metrics(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@router.get("/")
async def root() -> dict[str, str]:
    return {"service": "Wriven AI Service", "version": "0.2.0"}
