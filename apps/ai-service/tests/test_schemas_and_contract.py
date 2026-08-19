"""Boundary caps plus a lightweight contract-drift tripwire for AI operations."""

import asyncio
from pathlib import Path
import re
import unittest

from pydantic import ValidationError

from app.exceptions import InputTooLarge
from app.generator import generate
from app.schemas import OPERATIONS, GenerateRequest


class _NeverCalledClient:
    """Configured client that fails the test if the provider is ever reached."""

    def configured(self) -> bool:
        return True

    async def chat(self, *_: object, **_kwargs: object) -> object:
        raise AssertionError("the provider must not be called for a rejected request")


class SchemaAndContractTests(unittest.TestCase):
    def test_aggregate_context_budget_rejects_valid_but_expensive_history(self) -> None:
        # Each turn is individually legal; together they blow the context budget.
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "title", "label": "Title", "type": "text"},
            history=[
                {"role": "user", "content": "x" * 8_000},
                {"role": "assistant", "content": "x" * 8_000},
                {"role": "user", "content": "x" * 8_000},
                {"role": "assistant", "content": "x" * 8_000},
            ],
        )

        # The budget is enforced in the generator (mapped to AI_INPUT_TOO_LARGE),
        # before any provider spend.
        with self.assertRaises(InputTooLarge):
            asyncio.run(generate(request, _NeverCalledClient()))

    def test_refinement_requires_target_content(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
                operation="rewrite",
                contentTypeName="Article",
                field={"key": "title", "label": "Title", "type": "text"},
            )

    def test_freeform_refine_requires_target_content(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
                operation="refine",
                contentTypeName="Article",
                field={"key": "title", "label": "Title", "type": "text"},
                instruction="make it punchier",
            )

    def test_select_fields_only_accept_generate(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
                operation="shorten",
                contentTypeName="Article",
                field={
                    "key": "status",
                    "label": "Status",
                    "type": "select",
                    "options": ["draft", "ready"],
                },
                sourceContent="draft",
            )

    def test_unknown_fields_are_ignored_for_rolling_deploy_safety(self) -> None:
        # A newer core may send a field this build predates; dropping it keeps
        # generation working instead of 502-ing until ai-service is redeployed.
        request = GenerateRequest(
            operation="generate",
            contentTypeName="Article",
            field={"key": "title", "label": "Title", "type": "text"},
            someFutureField="ignored",
        )

        self.assertFalse(hasattr(request, "some_future_field"))

    def test_python_operation_contract_matches_shared_typescript_contract(self) -> None:
        root = Path(__file__).resolve().parents[3]
        source = (root / "libs/shared/contracts/src/lib/dto/ai.dto.ts").read_text()
        block = re.search(r"export const AI_OPERATIONS = \[(.*?)\] as const", source, re.DOTALL)
        self.assertIsNotNone(block)
        typescript_operations = tuple(re.findall(r"'([a-z]+)'", block.group(1)))
        self.assertEqual(OPERATIONS, typescript_operations)

    def test_request_shape_matches_typescript_client_interface(self) -> None:
        """Every camelCase wire field the Python model expects must exist on the
        TS `AiGenerateRequest` interface, so a rename on either side fails CI
        instead of silently deserializing to None in production.
        """
        root = Path(__file__).resolve().parents[3]
        source = (
            root / "apps/core-service/src/ai/ai-client.interface.ts"
        ).read_text()
        block = re.search(
            r"export interface AiGenerateRequest \{(.*?)\n\}", source, re.DOTALL
        )
        self.assertIsNotNone(block, "AiGenerateRequest interface not found")
        ts_fields = set(re.findall(r"^\s*([a-zA-Z]+)\??\s*:", block.group(1), re.MULTILINE))

        # The camelCase aliases GenerateRequest deserializes from (Pydantic's
        # to_camel). `requestId` is TS-only — it travels as an HTTP header, not a
        # body field — so it's expected to be absent from the Python model.
        py_fields = {
            GenerateRequest.model_fields[name].alias or name
            for name in GenerateRequest.model_fields
        }
        missing = py_fields - ts_fields
        self.assertFalse(
            missing,
            f"Python request fields missing from TS AiGenerateRequest: {missing}",
        )
