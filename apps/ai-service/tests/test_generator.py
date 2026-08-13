"""Regression tests for the provider-free generation orchestration."""

import asyncio
import unittest

from app.generator import generate
from app.schemas import GenerateRequest, Usage


class FakeClient:
    def __init__(self, responses: list[tuple[str, str, Usage, str | None, str | None]]) -> None:
        self.responses = responses
        self.calls = 0
        # Captures the messages passed to each chat() call, so tests can assert
        # that a retry carries feedback (correction turn), not an identical prompt.
        self.call_messages: list[list[dict[str, str]]] = []

    def configured(self) -> bool:
        return True

    async def chat(self, messages: list[dict[str, str]], *_: object) -> tuple[str, str, Usage, str | None, str | None]:
        self.call_messages.append(messages)
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

        self.assertEqual(result.output.kind, "scalar")
        self.assertEqual(result.output.text, "ready")
        self.assertEqual(result.attempt_count, 2)
        self.assertEqual(result.usage.total_tokens, 26)
        self.assertEqual(client.calls, 2)

    def test_select_retry_appends_a_correction_turn_not_an_identical_prompt(self) -> None:
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

        asyncio.run(generate(request, client))

        self.assertEqual(len(client.call_messages), 2)
        first, retry = client.call_messages
        # The retry must carry feedback — strictly longer, ending with the invalid
        # answer echoed as an assistant turn + a user correction.
        self.assertGreater(len(retry), len(first))
        self.assertEqual([m["role"] for m in retry[-2:]], ["assistant", "user"])
        self.assertEqual(retry[-2]["content"], "invalid")  # the bad answer echoed
        self.assertIn("draft, ready", retry[-1]["content"])  # constraint restated

