"""Regression tests for the provider-free generation orchestration."""

import asyncio
import unittest

from app.generator import generate
from app.schemas import GenerateRequest, Usage


class FakeClient:
    def __init__(self, responses: list[tuple[str, str, Usage, str | None, str | None]]) -> None:
        self.responses = responses
        self.calls = 0

    def configured(self) -> bool:
        return True

    async def chat(self, *_: object) -> tuple[str, str, Usage, str | None, str | None]:
        result = self.responses[self.calls]
        self.calls += 1
        return result


class GeneratorTests(unittest.TestCase):
    def test_select_retry_aggregates_every_provider_attempt(self) -> None:
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "status", "label": "Status", "type": "select", "options": ["draft", "ready"]},
        )
        client = FakeClient(
            [
                ("invalid", "model-a", Usage(prompt_tokens=10, completion_tokens=2, total_tokens=12), "req-1", "stop"),
                ("ready", "model-a", Usage(prompt_tokens=11, completion_tokens=3, total_tokens=14), "req-2", "stop"),
            ]
        )

        result = asyncio.run(generate(request, client))

        self.assertEqual(result.text, "ready")
        self.assertEqual(result.attempt_count, 2)
        self.assertEqual(result.usage.total_tokens, 26)
        self.assertEqual(client.calls, 2)

