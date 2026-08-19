"""Regression tests for the provider-free generation orchestration."""

import asyncio
import unittest
from unittest.mock import patch

from app.config import settings
from app.exceptions import ComposeMissError, SelectMissError, TextGuardrailError
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

    async def chat(self, messages: list[dict[str, str]], *_: object, **_kwargs: object) -> tuple[str, str, Usage, str | None, str | None]:
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



class DeadlineAwareClient:
    """FakeClient that also records each call's timeout bound (repair budget)."""

    def __init__(self, responses: list[tuple[str, str, Usage, str | None, str | None]]) -> None:
        self.responses = list(responses)
        self.calls = 0
        self.call_timeouts: list[float | None] = []

    def configured(self) -> bool:
        return True

    async def chat(
        self, messages: list[dict[str, str]], *_: object, **kwargs: object
    ) -> tuple[str, str, Usage, str | None, str | None]:
        self.call_timeouts.append(kwargs.get("timeout_s"))  # type: ignore[arg-type]
        result = self.responses[self.calls]
        self.calls += 1
        return result


class RepairBudgetTests(unittest.TestCase):
    """The generation deadline: repairs must not outlive core's request timeout."""

    def test_select_repair_skipped_when_deadline_exhausted(self) -> None:
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "status", "label": "Status", "type": "select", "options": ["draft", "ready"]},
        )
        client = DeadlineAwareClient(
            [("invalid", "model-a", Usage(prompt_tokens=10, completion_tokens=2, total_tokens=12), "req-1", "stop")]
        )

        with patch.object(settings, "ai_generation_deadline_ms", 0):
            with self.assertRaises(SelectMissError) as ctx:
                asyncio.run(generate(request, client))

        # Only the first call happened, and its spend rides on the error.
        self.assertEqual(client.calls, 1)
        self.assertEqual(ctx.exception.usage.total_tokens, 12)
        self.assertEqual(ctx.exception.attempt_count, 1)

    def test_guardrail_repair_skipped_when_deadline_exhausted(self) -> None:
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "body", "label": "Body", "type": "text"},
        )
        client = DeadlineAwareClient(
            [("Let me think about this.\nSome text.", "model-a", Usage(prompt_tokens=10, completion_tokens=2, total_tokens=12), "req-1", "stop")]
        )

        with patch.object(settings, "ai_generation_deadline_ms", 0):
            with self.assertRaises(TextGuardrailError) as ctx:
                asyncio.run(generate(request, client))

        self.assertEqual(client.calls, 1)
        self.assertEqual(ctx.exception.usage.total_tokens, 12)

    def test_compose_repair_skipped_when_deadline_exhausted(self) -> None:
        request = GenerateRequest(
            operation="compose",
            targetKind="entry",
            contentTypeName="Article",
            composeFields=[{"key": "title", "label": "Title", "type": "text"}],
        )
        client = DeadlineAwareClient(
            [("not json at all", "model-a", Usage(prompt_tokens=10, completion_tokens=2, total_tokens=12), "req-1", "stop")]
        )

        with patch.object(settings, "ai_generation_deadline_ms", 0):
            with self.assertRaises(ComposeMissError) as ctx:
                asyncio.run(generate(request, client))

        self.assertEqual(client.calls, 1)
        self.assertEqual(ctx.exception.usage.total_tokens, 12)

    def test_repair_call_is_bounded_by_remaining_deadline(self) -> None:
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "status", "label": "Status", "type": "select", "options": ["draft", "ready"]},
        )
        client = DeadlineAwareClient(
            [
                ("invalid", "model-a", Usage(prompt_tokens=10, completion_tokens=2, total_tokens=12), "req-1", "stop"),
                ("ready", "model-a", Usage(prompt_tokens=11, completion_tokens=3, total_tokens=14), "req-2", "stop"),
            ]
        )

        result = asyncio.run(generate(request, client))

        # First call unbounded (client default), repair bounded by what's left
        # of the (default) 32s deadline.
        self.assertIsNone(client.call_timeouts[0])
        self.assertIsInstance(client.call_timeouts[1], float)
        self.assertGreater(client.call_timeouts[1], 0)
        self.assertLessEqual(client.call_timeouts[1], 32)
        self.assertEqual(result.attempt_count, 2)


class ComposeNormalizationTests(unittest.TestCase):
    def test_compose_select_values_are_canonicalized_onto_options(self) -> None:
        request = GenerateRequest(
            operation="compose",
            targetKind="entry",
            contentTypeName="Article",
            composeFields=[
                {"key": "status", "label": "Status", "type": "select", "options": ["draft", "ready"]},
                {"key": "title", "label": "Title", "type": "text"},
            ],
        )
        client = FakeClient(
            [('{"status": "  draft  ", "title": "Hello"}', "model-a", Usage(prompt_tokens=10, completion_tokens=5, total_tokens=15), "req-1", "stop")]
        )

        result = asyncio.run(generate(request, client))

        self.assertEqual(result.output.fields["status"], "draft")
        self.assertEqual(result.output.fields["title"], "Hello")
