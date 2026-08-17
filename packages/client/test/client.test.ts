import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, WrivenError, isWrivenError } from '../src/index';

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

test('a caller abort mid-flight is never retried', async () => {
  let calls = 0;
  const client = createClient({
    projectId: 'p',
    token: 't',
    retries: 2,
    fetch: (_u, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    },
  });
  const controller = new AbortController();
  const pending = client.getEntry('post', 'x', { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(
    () => pending,
    (err: unknown) => err instanceof WrivenError && err.code === 'ABORTED',
  );
  assert.equal(calls, 1); // no retry — the caller cancelled
});

test('getAllEntries follows pagination to the end', async () => {
  const pages = [
    { items: [{ id: '1' }, { id: '2' }], page: 1, limit: 2, total: 3 },
    { items: [{ id: '3' }], page: 2, limit: 2, total: 3 },
  ];
  let call = 0;
  const urls: string[] = [];
  const client = createClient({
    projectId: 'p',
    token: 't',
    fetch: async (u) => {
      urls.push(String(u));
      return ok(pages[call++]);
    },
  });
  const all = await client.getAllEntries('post', { select: ['title'] });
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((e) => e.id), ['1', '2', '3']);
  assert.match(urls[0], /limit=100/);
  assert.match(urls[0], /page=1/);
  assert.match(urls[1], /page=2/);
});

test('iterateEntries yields lazily page by page', async () => {
  const pages = [
    { items: [{ id: 'a' }, { id: 'b' }], page: 1, limit: 2, total: 2 },
  ];
  let calls = 0;
  const client = createClient({
    projectId: 'p',
    token: 't',
    fetch: async () => ok(pages[calls++]),
  });
  const seen: string[] = [];
  for await (const entry of client.iterateEntries('post')) seen.push(entry.id);
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(calls, 1); // one page — no over-fetch
});

test('getEntries computes hasNextPage from page/limit/total', async () => {
  let call = 0;
  const pages = [
    { items: [{ id: '1' }], page: 1, limit: 1, total: 2 },
    { items: [{ id: '2' }], page: 2, limit: 1, total: 2 },
  ];
  const client = createClient({
    projectId: 'p',
    token: 't',
    fetch: async () => ok(pages[call++]),
  });
  const first = await client.getEntries('post');
  assert.equal(first.hasNextPage, true);
  const last = await client.getEntries('post');
  assert.equal(last.hasNextPage, false);
});

test('isWrivenError separates SDK errors from foreign errors', async () => {
  const client = createClient({
    projectId: 'p',
    token: 't',
    fetch: async () =>
      new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'nope', statusCode: 404 } }), { status: 404 }),
  });
  try {
    await client.getEntry('post', 'x');
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(isWrivenError(err), true);
    assert.equal(isWrivenError(new Error('plain')), false);
    assert.equal(isWrivenError('string'), false);
  }
});
