/**
 * Provider price resolution for AI cost accounting.
 *
 * Prices are keyed on the model the provider actually returned (`response.model`),
 * NOT the requested `AI_MODEL`: `openrouter/free` resolves to a different model
 * per call, so a single global price would be wrong. Resolution order:
 *
 *   1. exact model id  → its price
 *   2. longest matching suffix rule → its price (`…:free` is genuinely $0)
 *   3. caller-supplied env fallback pair
 *   4. `null` — price unknown
 *
 * `null` means *unknown* and must never be guessed from a name; `0` is a fact
 * (a free model costs nothing). A period that contains any `null`-priced
 * generation is reported as `cost.complete = false` upstream. See specs/21.
 */

/** micro-USD per 1,000,000 tokens, split by prompt vs completion. */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const FREE: ModelPrice = { inputPerMillion: 0, outputPerMillion: 0 };

/**
 * Exact `response.model` → price. Empty by default: on `openrouter/free` every
 * model matches the `:free` suffix rule below, so no paid entries are needed
 * until a paid model is configured. Add entries here (or via the env fallback)
 * when you point `AI_MODEL` at a paid model.
 */
const EXACT_PRICES: Readonly<Record<string, ModelPrice>> = {};

/**
 * Suffix rules, longest match wins. OpenRouter free model ids end in `:free`
 * (e.g. `meta-llama/llama-3.3-70b-instruct:free`), so this prices the entire
 * free tier at $0 without enumerating every model.
 */
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

/**
 * Spend for one generation in micro-USD, or `null` when the price is unknown.
 * `0` is returned for a priced-but-free model — distinct from `null`.
 */
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
