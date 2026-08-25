import {
  costMicrousdFor,
  resolveModelPrice,
  type ModelPrice,
} from './ai-model-prices';

const PAID: ModelPrice = { inputPerMillion: 3_000, outputPerMillion: 15_000 };
const FREE: ModelPrice = { inputPerMillion: 0, outputPerMillion: 0 };

describe('resolveModelPrice', () => {
  it('matches the :free suffix rule — every openrouter free model is $0', () => {
    expect(resolveModelPrice('meta-llama/llama-3.3-70b-instruct:free')).toEqual(FREE);
    expect(resolveModelPrice('x:free')).toEqual(FREE);
  });

  it('unknown paid model with no fallback → null (never guessed)', () => {
    expect(resolveModelPrice('gpt-9-turbo')).toBeNull();
    expect(resolveModelPrice(undefined)).toBeNull();
  });

  it('env fallback applies when the model is unrecognized', () => {
    expect(resolveModelPrice('gpt-9-turbo', PAID)).toEqual(PAID);
    expect(resolveModelPrice(undefined, PAID)).toEqual(PAID);
    expect(resolveModelPrice('anything:free', PAID)).toEqual(FREE); // suffix wins
  });
});

describe('costMicrousdFor', () => {
  it('null usage or unknown price → null (0 ≠ unknown)', () => {
    expect(costMicrousdFor(undefined, PAID)).toBeNull();
    expect(costMicrousdFor({ promptTokens: 10, completionTokens: 10 }, null)).toBeNull();
  });

  it('free model prices to exactly 0, not null', () => {
    expect(
      costMicrousdFor({ promptTokens: 12_345, completionTokens: 67_890 }, FREE),
    ).toBe(0);
  });

  it('rounds micro-USD spend from per-million prices', () => {
    // 1M input @ 3000 µ$/M = 3000; 500K output @ 15000 µ$/M = 7500 → 10500.
    expect(
      costMicrousdFor(
        { promptTokens: 1_000_000, completionTokens: 500_000 },
        PAID,
      ),
    ).toBe(10_500);
  });

  it('sub-micro-USD spend rounds to the nearest integer', () => {
    // 3 tokens @ 3000 µ$/M = 0.009 → 0.
    expect(
      costMicrousdFor({ promptTokens: 3, completionTokens: 0 }, PAID),
    ).toBe(0);
  });
});
