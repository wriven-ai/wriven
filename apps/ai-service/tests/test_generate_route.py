"""HTTP contract tests for `POST /generate` (TestClient + fake LLM client).

Locks the wire core-service consumes: the `{code, message}` envelope on errors,
camelCase metadata (`usage`/`model`/`providerRequestId`/`finishReason`/
`attemptCount`) on both success and error bodies, success aliasing, and the
output discriminator union. The camelCase error-body `usage` guards a real past
regression: it shipped snake_case once, and core computed NaN cost from it on
failed rows.
"""

import unittest
from unittest import mock

from fastapi.testclient import TestClient

from app.config import settings
from app.exceptions import ProviderError
from app.schemas import Usage
from main import create_app

SECRET = "test-internal-secret"


def _payload(**overrides: object) -> dict:
    payload: dict = {
        "operation": "generate",
        "targetKind": "field",
        "contentTypeName": "Post",
        "field": {"key": "body", "label": "Body", "type": "richtext"},
    }
    payload.update(overrides)
    return payload


def _completion(
    text: str = "Draft body.",
    model: str = "provider/model:free",
    prompt: int = 10,
    completion: int = 5,
) -> tuple[str, str, Usage, str, str]:
    return (
        text,
        model,
        Usage(
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=prompt + completion,
        ),
        "req_123",
        "stop",
    )


class FakeLlm:
    """Stands in for `app.routers.generate.llm_client`."""

    def __init__(self, results: list) -> None:
        # One entry per `chat()` call: a return tuple or an exception to raise.
        self._results = list(results)
        self.calls: list = []

    def configured(self) -> bool:
        return True

    async def chat(self, messages, temperature, operation):
        self.calls.append((messages, temperature, operation))
        outcome = self._results.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class GenerateRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        # raise_server_exceptions=False so registered handlers render 5xx bodies.
        self.client = TestClient(create_app(), raise_server_exceptions=False)
        patch = mock.patch.object(settings, "internal_secret", SECRET)
        patch.start()
        self.addCleanup(patch.stop)

    def _post(self, payload: dict, headers: dict | None = None):
        merged = {"X-Internal-Secret": SECRET}
        merged.update(headers or {})
        return self.client.post("/generate", json=payload, headers=merged)

    def _with_fake(self, results: list) -> FakeLlm:
        fake = FakeLlm(results)
        patcher = mock.patch("app.routers.generate.llm_client", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    # ── auth ────────────────────────────────────────────────────────────────

    def test_missing_secret_is_401_with_contract_code(self) -> None:
        res = self.client.post("/generate", json=_payload())
        self.assertEqual(res.status_code, 401)
        body = res.json()
        self.assertEqual(body["code"], "INVALID_INTERNAL_SECRET")
        self.assertIn("message", body)

    def test_non_ascii_secret_is_still_401_not_500(self) -> None:
        # Header values arrive latin-1-decoded (httpx refuses non-ASCII str, so
        # send the raw bytes). `compare_digest` on the str overload raises
        # TypeError for such input; the boundary must still answer 401, never
        # collapse to a generic 502.
        res = self.client.post(
            "/generate", json=_payload(), headers={"X-Internal-Secret": b"caf\xe9"}
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["code"], "INVALID_INTERNAL_SECRET")

    # ── success wire ────────────────────────────────────────────────────────

    def test_success_serializes_aliases_and_scalar_output(self) -> None:
        self._with_fake([_completion(prompt=11, completion=7)])
        res = self._post(_payload())
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["output"], {"kind": "scalar", "text": "Draft body."})
        self.assertEqual(body["model"], "provider/model:free")
        self.assertEqual(
            body["usage"],
            {"promptTokens": 11, "completionTokens": 7, "totalTokens": 18},
        )
        self.assertEqual(body["providerRequestId"], "req_123")
        self.assertEqual(body["finishReason"], "stop")
        self.assertEqual(body["attemptCount"], 1)

    def test_compose_success_serializes_record_output(self) -> None:
        self._with_fake(
            [_completion(text='{"title": "Hello", "body": "World"}')]
        )
        res = self._post(
            _payload(
                operation="compose",
                targetKind="entry",
                field=None,
                composeFields=[
                    {"key": "title", "label": "Title", "type": "text"},
                    {"key": "body", "label": "Body", "type": "richtext"},
                ],
            )
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(
            body["output"],
            {"kind": "record", "fields": {"title": "Hello", "body": "World"}},
        )

    # ── error wire (the P0 guards) ──────────────────────────────────────────

    def test_select_double_miss_error_body_carries_camelcase_usage(self) -> None:
        self._with_fake(
            [
                _completion(text="NotAnOption", prompt=10, completion=5),
                _completion(text="StillNotAnOption", prompt=20, completion=7),
            ]
        )
        res = self._post(
            _payload(
                field={
                    "key": "category",
                    "label": "Category",
                    "type": "select",
                    "options": ["News", "Opinion"],
                }
            )
        )
        self.assertEqual(res.status_code, 502)
        body = res.json()
        self.assertEqual(body["code"], "AI_GENERATION_FAILED")
        self.assertEqual(body["model"], "provider/model:free")
        # Both attempts' spend, aggregated, under the AiTokenUsage field names
        # core reads. snake_case here is the P0 regression.
        self.assertEqual(
            body["usage"],
            {"promptTokens": 30, "completionTokens": 12, "totalTokens": 42},
        )
        self.assertEqual(body["attemptCount"], 2)

    def test_repair_transport_failure_still_meters_attempt_one_usage(self) -> None:
        # Attempt 1 returns unusable JSON; the repair call dies transport-level.
        # The error body must still carry attempt 1's spend.
        self._with_fake(
            [
                _completion(text="not json at all", prompt=8, completion=4),
                ProviderError("AI generation failed."),
            ]
        )
        res = self._post(
            _payload(
                operation="compose",
                targetKind="entry",
                field=None,
                composeFields=[{"key": "title", "label": "Title", "type": "text"}],
            )
        )
        self.assertEqual(res.status_code, 502)
        body = res.json()
        self.assertEqual(body["code"], "AI_GENERATION_FAILED")
        self.assertEqual(
            body["usage"],
            {"promptTokens": 8, "completionTokens": 4, "totalTokens": 12},
        )

    def test_oversized_input_is_actionable_422(self) -> None:
        budget = mock.patch.object(settings, "ai_max_input_chars", 1_000)
        budget.start()
        self.addCleanup(budget.stop)
        self._with_fake([])  # must fail before any provider call
        res = self._post(
            _payload(
                operation="refine",
                sourceContent="x" * 24_000,
                instruction="shorten",
            )
        )
        self.assertEqual(res.status_code, 422)
        body = res.json()
        self.assertEqual(body["code"], "AI_INPUT_TOO_LARGE")
        self.assertIn("message", body)

    def test_pydantic_rejection_collapses_to_generic_code(self) -> None:
        # Non-compose operation without a field — schema detail must not leak.
        res = self._post(_payload(field=None))
        self.assertEqual(res.status_code, 422)
        body = res.json()
        self.assertEqual(body["code"], "AI_GENERATION_FAILED")
        self.assertNotIn("ctx", body)
        self.assertNotIn("loc", body)


if __name__ == "__main__":
    unittest.main()
