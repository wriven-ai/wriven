"""Boundary caps plus a lightweight contract-drift tripwire for AI operations."""

from pathlib import Path
import re
import unittest

from pydantic import ValidationError

from app.schemas import OPERATIONS, GenerateRequest


class SchemaAndContractTests(unittest.TestCase):
    def test_aggregate_context_budget_rejects_valid_but_expensive_history(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
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

    def test_refinement_requires_target_content(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(
                operation="rewrite",
                contentTypeName="Article",
                field={"key": "title", "label": "Title", "type": "text"},
            )

    def test_python_operation_contract_matches_shared_typescript_contract(self) -> None:
        root = Path(__file__).resolve().parents[3]
        source = (root / "libs/shared/contracts/src/lib/dto/ai.dto.ts").read_text()
        block = re.search(r"export const AI_OPERATIONS = \[(.*?)\] as const", source, re.DOTALL)
        self.assertIsNotNone(block)
        typescript_operations = tuple(re.findall(r"'([a-z]+)'", block.group(1)))
        self.assertEqual(OPERATIONS, typescript_operations)

