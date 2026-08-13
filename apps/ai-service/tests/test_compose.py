"""Whole-entry `compose`: JSON parsing, key filtering, repair, and miss handling."""

import asyncio
import unittest

from app.exceptions import ComposeMissError
from app.generator import generate
from app.schemas import GenerateRequest, Usage

COMPOSE_FIELDS = [
    {"key": "title", "label": "Title", "type": "text"},
    {"key": "body", "label": "Body", "type": "richtext"},
]


def _compose_request() -> GenerateRequest:
    return GenerateRequest(
        operation="compose",
        targetKind="entry",
        contentTypeName="Post",
        composeFields=COMPOSE_FIELDS,
        instruction="a short post about otters",
    )


class FakeClient:
    def __init__(self, replies: list[str]) -> None:
        self.replies = replies
        self.calls = 0

    def configured(self) -> bool:
        return True

    async def chat(self, *_: object) -> tuple[str, str, Usage, str | None, str | None]:
        reply = self.replies[self.calls]
        self.calls += 1
        return (reply, "model-x", Usage(prompt_tokens=10, completion_tokens=5, total_tokens=15), "r", "stop")


class ComposeTests(unittest.TestCase):
    def test_parses_a_clean_json_object(self) -> None:
        client = FakeClient(['{"title": "Otters", "body": "<p>Cute.</p>"}'])

        result = asyncio.run(generate(_compose_request(), client))

        self.assertEqual(result.output.kind, "record")
        self.assertEqual(result.output.fields, {"title": "Otters", "body": "<p>Cute.</p>"})
        self.assertEqual(result.attempt_count, 1)

    def test_tolerates_a_code_fence_and_drops_unknown_keys(self) -> None:
        client = FakeClient(
            ['```json\n{"title": "Otters", "slug": "ignored", "body": "<p>Hi</p>"}\n```']
        )

        result = asyncio.run(generate(_compose_request(), client))

        self.assertEqual(result.output.fields, {"title": "Otters", "body": "<p>Hi</p>"})

    def test_repairs_once_then_succeeds(self) -> None:
        client = FakeClient(["not json at all", '{"title": "Otters"}'])

        result = asyncio.run(generate(_compose_request(), client))

        self.assertEqual(result.output.fields, {"title": "Otters"})
        self.assertEqual(result.attempt_count, 2)
        # Both attempts' tokens are metered so core can record the real spend.
        self.assertEqual(result.usage.total_tokens, 30)

    def test_double_miss_raises_with_aggregated_spend(self) -> None:
        client = FakeClient(["nope", "still nope"])

        with self.assertRaises(ComposeMissError) as ctx:
            asyncio.run(generate(_compose_request(), client))

        self.assertEqual(ctx.exception.code, "AI_GENERATION_FAILED")
        self.assertEqual(ctx.exception.usage.total_tokens, 30)
        self.assertEqual(ctx.exception.attempt_count, 2)
