import type { ConfigService } from '@nestjs/config';

/** Plain-object ConfigService stand-in: `get(key)` returns map[key] ?? default. */
export function configStub(map: Record<string, unknown> = {}) {
  return {
    get: jest.fn(
      (key: string, defaultValue?: unknown) =>
        (key in map ? map[key] : defaultValue) as unknown,
    ),
  } as unknown as ConfigService & { get: jest.Mock };
}
