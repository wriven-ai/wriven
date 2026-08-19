"""Regression tests for `LlmClient.chat` itself — the SDK seam.

The generator tests fake `chat()` entirely, so a crash on the success path
(e.g. referencing a local before assignment) would never surface there.
These tests stub the AsyncOpenAI client and exercise the real method.
"""

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from openai import NOT_GIVEN

from app.exceptions import ProviderError
from app.llm import LlmClient


def _client_with_response(res: object) -> LlmClient:
    """Build a LlmClient whose SDK client returns `res` from create()."""
    client = LlmClient.__new__(LlmClient)  # skip __init__ (settings/SDK build)
    client._model = "test-model"
    sdk = SimpleNamespace()
    sdk.chat = SimpleNamespace(
        completions=SimpleNamespace(create=AsyncMock(return_value=res))
    )
    client._client = sdk
    return client


def _completion(
    text: str = "hello",
    *,
    choices: list | None = None,
    usage: SimpleNamespace | None = SimpleNamespace(
        prompt_tokens=5, completion_tokens=2, total_tokens=7
    ),
) -> SimpleNamespace:
    return SimpleNamespace(
        choices=choices
        if choices is not None
        else [SimpleNamespace(message=SimpleNamespace(content=text), finish_reason="stop")],
        model="test-model",
        usage=usage,
        id="req-abc",
    )


class LlmClientChatTests(unittest.TestCase):
    def test_success_path_returns_tuple(self) -> None:
        # Regression: the success-path logger referenced `choice` before its
        # assignment, so every successful provider call crashed with
        # UnboundLocalError and surfaced as an opaque 502 AI_GENERATION_FAILED.
        client = _client_with_response(_completion("generated text"))

        text, model, usage, provider_request_id, finish_reason = asyncio.run(
            client.chat([{"role": "user", "content": "hi"}], 0.7, "generate")
        )

        self.assertEqual(text, "generated text")
        self.assertEqual(model, "test-model")
        self.assertEqual(usage.total_tokens, 7)
        self.assertEqual(provider_request_id, "req-abc")
        self.assertEqual(finish_reason, "stop")

    def test_missing_content_becomes_empty_string(self) -> None:
        client = _client_with_response(
            _completion(choices=[SimpleNamespace(message=SimpleNamespace(content=None), finish_reason="stop")])
        )

        text, *_ = asyncio.run(
            client.chat([{"role": "user", "content": "hi"}], 0.7, "generate")
        )

        self.assertEqual(text, "")

    def test_completion_without_choices_raises_provider_error(self) -> None:
        client = _client_with_response(_completion(choices=[]))

        with self.assertRaises(ProviderError):
            asyncio.run(
                client.chat([{"role": "user", "content": "hi"}], 0.7, "generate")
            )

    def test_timeout_override_is_passed_to_the_provider(self) -> None:
        # Repair turns are bounded by the remaining generation deadline.
        client = _client_with_response(_completion())

        asyncio.run(
            client.chat(
                [{"role": "user", "content": "hi"}], 0.7, "generate", timeout_s=12.5
            )
        )

        self.assertEqual(
            client._client.chat.completions.create.call_args.kwargs["timeout"], 12.5
        )

    def test_default_call_leaves_the_client_timeout_untouched(self) -> None:
        # `timeout=None` would mean "no timeout" to the SDK — the default must
        # be the NOT_GIVEN sentinel so the client-level timeout applies.
        client = _client_with_response(_completion())

        asyncio.run(client.chat([{"role": "user", "content": "hi"}], 0.7, "generate"))

        self.assertIs(
            client._client.chat.completions.create.call_args.kwargs["timeout"], NOT_GIVEN
        )
