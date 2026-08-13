"""Output guardrails for free-text fields (text / richtext).

`select` and `compose` already validate+repair their structured output in
`generator` (a closed option set / a JSON key set). Free-text fields had no such
check, so a weak free model that ignores the system prompt could leak its
chain-of-thought, a chatty preamble ("Here is the revised…"), or a quote of the
instructions straight into the field.

Two cooperating helpers:
  - `sanitize`: strip a surrounding markdown code fence and one leading preamble
    line. Runs on every free-text answer — clean ones pass through untouched.
  - `is_unusable`: high-precision detector for a leak (the output contains a
    phrase copied from our own system/compose prompt) or chain-of-thought (the
    first line is reasoning, not content). Triggers one repair turn in the
    generator, exactly like a `select` option miss.

Precision over recall: a false positive blocks a customer's legitimate field
content, so the markers/patterns are narrowly drawn. Anything ambiguous is left
alone and returned best-effort.
"""

import re

# Phrases lifted verbatim from our own system + compose prompts. Legitimate field
# content essentially never contains these, so their presence means the model is
# echoing the prompt rather than writing content.
_PROMPT_LEAK_MARKERS: tuple[str, ...] = (
    "UNTRUSTED DATA",
    "Output ONLY the field content",
    "EXACTLY ONE of these options",
    "semantic HTML using only these tags",
    "Do NOT use markdown",
    "Keep it accurate and concise",
    "content assistant for a CMS",
    "Return ONLY a JSON object",
    "<voice_guide>",
    "<target_content>",
    "<entry_context>",
)

# A markdown code fence the model wraps a richtext answer in despite the HTML-only
# rule:  ```html\n … \n```  (optional language tag).
_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9]*\s*\n?([\s\S]*?)\n?```\s*$")

# One chatty preamble line ending in a colon: "Here is the revised description:".
# Line length is bounded so a real (long) first paragraph is never stripped.
_PREAMBLE_RE = re.compile(
    r"^\s*(?:"
    r"here(?:'s| is)?|below(?:'s| is)?|sure!|certainly[,!]|of course[,!]|"
    r"the (?:revised|updated|rewritten|new|final|generated)\s+\w+|"
    r"this is the (?:revised|updated|rewritten|new|final)\s+\w+"
    r")[^\n]{0,80}:\s*\n",
    re.IGNORECASE,
)

# Chain-of-thought tells on the first non-empty line: numbered bold steps,
# self-narration, or an AI-style disclaimer. Narrowly drawn — first-person prose
# like "I will be leading the team" is intentionally NOT matched.
_COT_FIRST_LINE_RE = re.compile(
    r"^\s*(?:"
    r"\d+[\.\)]\s+\*{1,2}"                       # "1. **Identify…"
    r"|\*{2}(?:step|note|important|identify|plan|reasoning|analysis|summary)\b"
    r"|step\s*\d+"
    r"|let me\b|i (?:should|need to|must|am going to)\b"
    r"|as an ai\b|i am an ai\b|i can(?:not|'t)\b"
    r")",
    re.IGNORECASE,
)


def sanitize(text: str, field_type: str) -> str:
    """Strip a code fence (richtext) + one leading preamble line + whitespace.

    Clean answers pass through unchanged. Conservative: at most one preamble
    line is removed, and only when it ends in a colon.
    """
    out = text
    if field_type == "richtext":
        match = _FENCE_RE.match(out)
        if match:
            out = match.group(1)
    out = _PREAMBLE_RE.sub("", out, count=1)
    return out.strip()


def _first_nonempty_line(text: str) -> str:
    for line in text.splitlines():
        if line.strip():
            return line
    return ""


def looks_like_prompt_leak(text: str) -> bool:
    return any(marker in text for marker in _PROMPT_LEAK_MARKERS)


def looks_like_cot(text: str) -> bool:
    first = _first_nonempty_line(text)
    return bool(_COT_FIRST_LINE_RE.match(first))


def is_unusable(text: str) -> bool:
    """True when the sanitized output is reasoning / a prompt echo, not content."""
    return looks_like_prompt_leak(text) or looks_like_cot(text)


def text_correction(target: str) -> str:
    """Repair instruction appended on a guardrail miss (mirrors select/compose)."""
    return (
        "Your previous answer was not the field content — it read like reasoning, "
        "a note to yourself, or a quote of the instructions. "
        f"Return ONLY the final {target}, ready to publish. No preamble, no "
        "explanation, no steps."
    )
