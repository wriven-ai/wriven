"""Boundary regression checks that require no configured provider account."""

import asyncio
import unittest

from app.exceptions import InvalidSecretError
from app.routers.health import health, ready
from app.security import verify_internal_secret


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
