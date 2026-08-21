/**
 * Prices for AI cost accounting, keyed on the model the provider RETURNED —
 * not the requested AI_MODEL (openrouter/free resolves to a different model
 * per call). Resolution: exact id → longest suffix rule → env fallback → null.
 * null means unknown and is never guessed from a name; 0 is a real free model.
 */

/** micro-USD per 1,000,000 tokens, split by prompt vs completion. */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const FREE: ModelPrice = { inputPerMillion: 0, outputPerMillion: 0 };

/** Empty because the :free suffix rule below covers every openrouter/free model;
 * add entries when AI_MODEL targets a paid model. */
const EXACT_PRICES: Readonly<Record<string, ModelPrice>> = {};

/** Longest match wins. Free-tier ids end in :free, so one rule prices the
 * whole free tier at $0. */
const SUFFIX_PRICES: ReadonlyArray<{ suffix: string; price: ModelPrice }> = [
  { suffix: ':free', price: FREE },
];

/** Resolve a per-million price for a returned model, else the fallback, else null. */
export function resolveModelPrice(
  model: string | undefined,
  fallback: ModelPrice | null = null,
): ModelPrice | null {
  if (model) {
    const exact = EXACT_PRICES[model];
    if (exact) return exact;
    const suffixMatch = SUFFIX_PRICES.filter((rule) => model.endsWith(rule.suffix)).sort(
      (a, b) => b.suffix.length - a.suffix.length,
    )[0];
    if (suffixMatch) return suffixMatch.price;
  }
  return fallback;
}

/** Spend in micro-USD, or null when the price is unknown (0 = free, not unknown). */
export function costMicrousdFor(
  usage: { promptTokens: number; completionTokens: number } | undefined,
  price: ModelPrice | null,
): number | null {
  if (!usage || !price) return null;
  return Math.round(
    (usage.promptTokens * price.inputPerMillion +
      usage.completionTokens * price.outputPerMillion) /
      1_000_000,
  );
}
