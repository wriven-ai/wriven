import type { AiIntent, AiRefinePreset } from '@/lib/types';

/** One turn of multi-turn refinement (client-held). Mirrors contracts AiTurn. */
export type AiTurn = { role: 'user' | 'assistant'; content: string };

export type ApplyMode = 'replace' | 'append' | 'prepend';

/** A Tier-1, single-value, non-sensitive field (an AI target). */
export type TargetField = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  multiple?: boolean;
  aiPrivate?: boolean;
};

export type Result = {
  generationId: string;
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  remaining: number | null;
  truncated?: boolean;
  targetKey: string;
  targetType: string;
  intent: AiIntent;
  preset?: AiRefinePreset;
  instruction: string;
  sourceContent?: string;
};

export type GenerationInput = {
  requestId: string;
  targetKey: string;
  targetType: string;
  sourceContent?: string;
  intent: AiIntent;
  preset?: AiRefinePreset;
  instruction: string;
  history: AiTurn[];
};

/** A drafted field of a whole-entry compose. */
export type ComposeField = { key: string; label: string; type: string; value: string };

export const TIER1 = ['text', 'richtext', 'select'];

/**
 * Refine shortcuts. These only prefill the author's intent — the server maps each
 * to a tuned prompt, so they are chips beside one instruction box rather than a
 * list of co-equal modes.
 */
export const REFINE_PRESETS: { key: AiRefinePreset; label: string }[] = [
  { key: 'shorten', label: 'Shorten' },
  { key: 'expand', label: 'Expand' },
  { key: 'rewrite', label: 'Rewrite' },
  { key: 'tone', label: 'Change tone' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'continue', label: 'Continue' },
];

/** Placeholder copy per preset, so the instruction box always tells the author what to type. */
export const PRESET_HINTS: Record<AiRefinePreset, string> = {
  shorten: 'e.g. cut it to two sentences',
  expand: 'e.g. add a paragraph about pricing',
  rewrite: 'e.g. make it clearer for beginners',
  tone: 'Describe the tone — e.g. confident and concise',
  summarize: 'e.g. summarize as three bullets',
  continue: 'e.g. keep going for one more paragraph',
};

/** Friendly copy per contract error code — shared by the field + compose flows. */
export const ERR_MESSAGES: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI is not configured on this workspace.',
  AI_QUOTA_UNAVAILABLE: 'AI usage could not be verified. Please try again shortly.',
  PLAN_LIMIT_REACHED: 'Monthly AI generation limit reached for your plan.',
  RATE_LIMITED: 'Too many AI requests — please slow down.',
  AI_GENERATION_FAILED: 'Generation failed. Try again or rephrase.',
  AI_INPUT_TOO_LARGE:
    'This request is too large. Shorten the field content or clear the conversation.',
  AI_GENERATION_IN_PROGRESS: 'This generation is still in progress. Retry safely in a moment.',
  IDEMPOTENCY_KEY_REUSED: 'That generation request cannot be reused. Start a new generation.',
  AI_RESULT_EXPIRED: 'The stored draft for this request expired. Start a new generation.',
  VALIDATION_ERROR: 'That request is not valid — check the selected field and instruction.',
};
