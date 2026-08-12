"""Wriven AI service — FastAPI entrypoint.

App factory + uvicorn runner. The service owns no database tables and makes no
DB connections; it is a stateless LLM proxy reached only by core-service over
HTTP (`POST /generate`), authenticated by a shared `INTERNAL_SECRET`.
"""

import logging.config

from fastapi import FastAPI

from app import __version__
from app.config import settings
from app.exceptions import register_exception_handlers
from app.observability import install_request_observability
from app.routers import generate, health

# Explicit logging config — prod services don't rely on the root lastResort
# handler. One stderr stream handler, INFO on the app logger, WARNING elsewhere.
logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s %(levelname)s %(name)s request_id=%(request_id)s :: %(message)s",
            },
        },
        "filters": {
            "request_id": {"()": "app.observability.RequestIdFilter"},
        },
        "handlers": {
            "stderr": {
                "class": "logging.StreamHandler",
                "formatter": "default",
                "filters": ["request_id"],
                "stream": "ext://sys.stderr",
            },
        },
        "loggers": {
            "ai-service": {"level": "INFO", "handlers": ["stderr"], "propagate": False},
        },
        "root": {"level": "WARNING", "handlers": ["stderr"]},
    }
)


def create_app() -> FastAPI:
    prod = settings.environment == "production"
    app = FastAPI(
        title="Wriven AI Service",
        description="AI-powered content generation for Wriven CMS",
        version=__version__,
        # Internal service — don't publish the schema / interactive docs in prod.
        docs_url=None if prod else "/docs",
        redoc_url=None if prod else "/redoc",
        openapi_url=None if prod else "/openapi.json",
    )
    install_request_observability(app)
    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(generate.router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.port)
