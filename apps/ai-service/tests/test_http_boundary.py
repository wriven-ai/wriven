"""Boundary regression checks that require no configured provider account."""

import asyncio
import unittest

from fastapi import APIRouter
from fastapi.testclient import TestClient

from app import observability
from app.exceptions import InvalidSecretError
from app.routers.health import health, ready
from app.security import verify_internal_secret
from main import create_app


class HttpBoundaryTests(unittest.TestCase):
    def test_liveness_is_available_without_provider_configuration(self) -> None:
        response = asyncio.run(health())

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'"status":"ok"', response.body)

    def test_readiness_exposes_provider_configuration_separately_from_liveness(self) -> None:
        response = asyncio.run(ready())

        self.assertIn(response.status_code, (200, 503))
        self.assertIn(b'"providerConfigured":', response.body)

    def test_generate_rejects_callers_without_the_internal_secret(self) -> None:
        with self.assertRaises(InvalidSecretError):
            asyncio.run(verify_internal_secret(None))

    def test_unhandled_exception_is_counted_with_the_emitted_status(self) -> None:
        # Unhandled exceptions are answered by the generic handler (outside the
        # observability middleware), so the metric must be recorded there with
        # the status actually emitted — 502, not a guessed 500.
        app = create_app()
        boom = APIRouter()

        @boom.get("/boom")
        async def _boom() -> dict[str, str]:
            raise RuntimeError("boom")

        app.include_router(boom)
        before = observability._http_requests.get(("/boom", 502), 0)

        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/boom")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            observability._http_requests.get(("/boom", 502), 0), before + 1
        )
