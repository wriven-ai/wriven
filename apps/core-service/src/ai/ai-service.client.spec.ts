import { Logger } from '@nestjs/common';
import { AiClientError } from './ai-client.interface';

beforeAll(() => {
  Logger.overrideLogger([]);
});

const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ post: mockPost })),
    isAxiosError: (e: unknown) => (e as { isAxios?: boolean })?.isAxios === true,
  },
  isAxiosError: (e: unknown) => (e as { isAxios?: boolean })?.isAxios === true,
}));

import { AiServiceClient as Client } from './ai-service.client';
import { configStub } from '../testing/config-stub';

function makeClient(map: Record<string, unknown> = { AI_SERVICE_URL: 'http://ai', INTERNAL_SECRET: 's' }) {
  return new Client(configStub(map) as never);
}

function axiosError(response?: {
  status: number;
  data?: Record<string, unknown>;
}): Error & { isAxios: boolean } {
  return Object.assign(new Error('http fail'), { isAxios: true, response });
}

function goodBody() {
  return {
    output: { kind: 'scalar', text: 'Hello' },
    model: 'm:free',
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  };
}

afterEach(() => {
  mockPost.mockReset();
});

describe('AiServiceClient.configured', () => {
  it('both AI_SERVICE_URL and INTERNAL_SECRET set → configured', () => {
    expect(makeClient().configured()).toBe(true);
  });

  it('either half missing → not configured (never a half-configured call)', () => {
    expect(makeClient({ AI_SERVICE_URL: 'http://ai' }).configured()).toBe(false);
    expect(makeClient({ INTERNAL_SECRET: 's' }).configured()).toBe(false);
    expect(makeClient({}).configured()).toBe(false);
  });
});

describe('AiServiceClient.generate — 2xx body validation (assertWellFormed)', () => {
  it('a well-formed scalar body returns the result; requestId rides the header', async () => {
    mockPost.mockResolvedValue({ data: goodBody() });
    const client = makeClient();

    const result = await client.generate({ requestId: 'req-9' } as never);

    expect(mockPost).toHaveBeenCalledWith(
      '/generate',
      expect.not.objectContaining({ requestId: 'req-9' }), // stripped from the body
      { headers: { 'X-Request-ID': 'req-9' } },
    );
    expect(result.output).toEqual({ kind: 'scalar', text: 'Hello' });
  });

  it('a well-formed record body (compose) passes', async () => {
    mockPost.mockResolvedValue({
      data: { ...goodBody(), output: { kind: 'record', fields: { title: 'T' } } },
    });
    const result = await makeClient().generate({ requestId: 'r' } as never);
    expect(result.output).toEqual({ kind: 'record', fields: { title: 'T' } });
  });

  it('HTML/string 2xx (proxy or stale deployment) → AI_GENERATION_FAILED', async () => {
    mockPost.mockResolvedValue({ data: '<html>bad gateway</html>' });
    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
    });
  });

  it('a record field with a non-string value → malformed', async () => {
    mockPost.mockResolvedValue({
      data: { ...goodBody(), output: { kind: 'record', fields: { n: 5 } } },
    });
    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toBeInstanceOf(
      AiClientError,
    );
  });

  it('non-finite usage numbers → malformed (NaN totalTokens must not reach billing)', async () => {
    mockPost.mockResolvedValue({
      data: {
        ...goodBody(),
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: Number.NaN },
      },
    });
    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
    });
  });
});

describe('AiServiceClient.generate — error mapping (toClientError)', () => {
  it('known ai-service code passes through with model/usage (spent tokens still metered)', async () => {
    mockPost.mockRejectedValue(
      axiosError({
        status: 422,
        data: {
          code: 'AI_INPUT_TOO_LARGE',
          message: 'too big',
          model: 'm:free',
          usage: { promptTokens: 9, completionTokens: 0, totalTokens: 9 },
          attemptCount: 2,
        },
      }),
    );

    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toMatchObject({
      code: 'AI_INPUT_TOO_LARGE',
      message: 'too big',
      status: 422,
      model: 'm:free',
      usage: { totalTokens: 9 },
      attemptCount: 2,
    });
  });

  it('unmapped code / 401 secret mismatch collapses to AI_GENERATION_FAILED', async () => {
    mockPost.mockRejectedValue(
      axiosError({ status: 401, data: { code: 'SOMETHING_ELSE', message: 'nope' } }),
    );
    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
      status: 401,
    });
  });

  it('network failure (no response) → AI_GENERATION_FAILED, never a raw axios rethrow', async () => {
    mockPost.mockRejectedValue(axiosError());
    const err = await makeClient()
      .generate({ requestId: 'r' } as never)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiClientError);
    expect(err.code).toBe('AI_GENERATION_FAILED');
    expect(String(err.message)).not.toContain('http fail'); // leak-free envelope
  });

  it('a non-axios throw also collapses to AiClientError', async () => {
    mockPost.mockRejectedValue(new Error('weird'));
    await expect(makeClient().generate({ requestId: 'r' } as never)).rejects.toBeInstanceOf(
      AiClientError,
    );
  });
});
