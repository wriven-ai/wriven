import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, WrivenError } from '../src/index';

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('builds URL with query params and encodes path segments', async () => {
  let url = '';
  const client = createClient({
    projectId: 'p1',
    token: 't',
    fetch: async (u) => {
      url = String(u);
      return ok({ items: [], page: 1, limit: 20, total: 0 });
    },
  });
  await client.getEntries('blog post', {
    filter: { cat: 'news' },
    sort: '-publishedAt',
    select: ['title', 'slug'],
    include: 1,
    limit: 5,
  });
  assert.match(url, /\/v1\/projects\/p1\/content\/blog%20post\?/);
  assert.match(url, /filter%5Bcat%5D=news/);
  assert.match(url, /sort=-publishedAt/);
  assert.match(url, /select=title%2Cslug/);
  assert.match(url, /include=1/);
  assert.match(url, /limit=5/);
});

test('sends Bearer auth header', async () => {
  let auth: unknown;
  const client = createClient({
    projectId: 'p',
    token: 'wrk_live_abc',
    fetch: async (_u, init) => {
      auth = (init?.headers as Record<string, string>).Authorization;
      return ok({ id: '1' });
    },
  });
  await client.getEntry('post', 'hello');
  assert.equal(auth, 'Bearer wrk_live_abc');
});

test('unwraps the { success, data } envelope', async () => {
  const client = createClient({
    projectId: 'p',
    token: 't',
    fetch: async () => ok({ id: '42' }),
  });
  const entry = await client.getEntry('post', 'x');
  assert.equal(entry.id, '42');
});

test('throws a typed WrivenError on 4xx without retrying', async () => {
  let calls = 0;
  const client = createClient({
    projectId: 'p',
    token: 't',
    retries: 2,
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'nope' } }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  await assert.rejects(
    () => client.getEntry('post', 'x'),
    (err: unknown) =>
      err instanceof WrivenError && err.status === 404 && err.code === 'NOT_FOUND',
  );
  assert.equal(calls, 1);
});

test('retries on 5xx then succeeds', async () => {
  let calls = 0;
  const client = createClient({
    projectId: 'p',
    token: 't',
    retries: 2,
    fetch: async () => {
      calls++;
      return calls < 2 ? new Response('err', { status: 500 }) : ok({ id: 'ok' });
    },
  });
  const entry = await client.getEntry('post', 'x');
  assert.equal(entry.id, 'ok');
  assert.equal(calls, 2);
});

test('rejects an already-aborted signal', async () => {
  const client = createClient({
    projectId: 'p',
    token: 't',
    retries: 0,
    fetch: (_u, init) => {
      if (init?.signal?.aborted) return Promise.reject(new Error('aborted'));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    },
  });
  await assert.rejects(() =>
    client.getEntry('post', 'x', { signal: AbortSignal.abort() }),
  );
});
