import { of, Subject, throwError, delay } from 'rxjs';
import {
  DEFAULT_TCP_TIMEOUT_MS,
  sendWithTimeout,
} from './send-with-timeout';

function makeClient(sendResult: unknown) {
  const send = jest.fn(() => sendResult);
  return { client: { send } as never, send };
}

describe('sendWithTimeout', () => {
  it('returns the downstream response on success', async () => {
    const { client, send } = makeClient(of({ ok: true }));
    await expect(
      sendWithTimeout(client, 'x.pattern', { a: 1 }),
    ).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith('x.pattern', { a: 1 });
  });

  it('throws the GATEWAY_TIMEOUT envelope when the send stalls', async () => {
    jest.useFakeTimers();
    // A send that never completes — the wedged-downstream shape.
    const { client } = makeClient(new Subject().pipe(delay(60_000)));
    const promise = sendWithTimeout<{ never: true }>(client, 'x.pattern', {});
    const assertion = expect(promise).rejects.toEqual({
      code: 'GATEWAY_TIMEOUT',
      message: 'The request timed out. Please try again.',
      statusCode: 504,
    });
    jest.advanceTimersByTime(DEFAULT_TCP_TIMEOUT_MS + 10);
    await assertion;
  });

  it('honors a per-call override', async () => {
    jest.useFakeTimers();
    const { client } = makeClient(new Subject().pipe(delay(60_000)));
    const promise = sendWithTimeout(client, 'x.pattern', {}, 1_000);
    const assertion = expect(promise).rejects.toMatchObject({
      statusCode: 504,
    });
    jest.advanceTimersByTime(1_010);
    await assertion;
  });

  it('passes downstream errors through untouched', async () => {
    const downstream = {
      code: 'WORKSPACE_NOT_FOUND',
      message: 'Workspace not found.',
      statusCode: 404,
    };
    const { client } = makeClient(throwError(() => downstream));
    await expect(
      sendWithTimeout(client, 'x.pattern', {}),
    ).rejects.toEqual(downstream);
  });
});

afterEach(() => {
  jest.useRealTimers();
});
