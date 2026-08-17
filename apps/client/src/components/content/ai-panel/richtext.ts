import { generateHTML, generateJSON } from '@tiptap/html';
import { RICH_TEXT_EXTENSIONS } from '@/components/editor/extensions';
import type { AiTurn, ApplyMode, GenerationInput } from './types';

/** Convert the editor's current value into the bounded source snapshot for AI. */
export function serializeSourceContent(value: unknown, fieldType: string): string | undefined {
  if (value == null) return undefined;
  if (fieldType !== 'richtext') {
    const text =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value).trim()
        : '';
    return text || undefined;
  }
  if (typeof value === 'string') return value.trim() || undefined;
  try {
    const html = generateHTML(
      value as Parameters<typeof generateHTML>[0],
      RICH_TEXT_EXTENSIONS,
    ).trim();
    return html || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply one generated value to a field (replace semantics), converting richtext
 * HTML to ProseMirror JSON. Returns the value actually written (for undo and
 * edit detection). Shared by the field flow and the whole-entry compose apply.
 */
export function applyGeneratedField(
  setField: (key: string, value: unknown) => void,
  key: string,
  value: string,
  type: string,
): unknown {
  if (type === 'richtext') {
    try {
      const doc = generateJSON(value, RICH_TEXT_EXTENSIONS);
      setField(key, doc);
      return doc;
    } catch {
      setField(key, value);
      return value;
    }
  }
  const trimmed = value.trim();
  setField(key, trimmed);
  return trimmed;
}

/** Plain-text preview of a possibly-HTML generated value, for the compose list. */
export function previewText(value: string, type: string): string {
  const text = type === 'richtext' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : value;
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

/** Keep application explicit: structured/select values only support replacement. */
export function combineContent(
  existing: string,
  generated: string,
  fieldType: string,
  mode: ApplyMode,
): string {
  if (mode === 'replace' || fieldType === 'select') return generated;
  if (fieldType === 'richtext') {
    return mode === 'prepend' ? `${generated}\n${existing}` : `${existing}\n${generated}`;
  }
  return mode === 'prepend' ? `${generated}\n\n${existing}` : `${existing}\n\n${generated}`;
}

export function generationTurnLabel(input: {
  intent: GenerationInput['intent'];
  preset?: GenerationInput['preset'];
  instruction: string;
}): string {
  const action = input.intent === 'refine' ? input.preset ?? 'refine' : 'generate';
  return `${action}${input.instruction ? `: ${input.instruction}` : ''}`.slice(0, 2_000);
}

/** Stable value identity for undo/edit detection (richtext is a JSON doc). */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Append one user/assistant turn pair to a per-field history, capped at 8 turns. */
export function appendTurn(history: AiTurn[], user: string, assistant: string): AiTurn[] {
  return [
    ...history,
    { role: 'user' as const, content: user },
    { role: 'assistant' as const, content: assistant },
  ].slice(-8);
}
