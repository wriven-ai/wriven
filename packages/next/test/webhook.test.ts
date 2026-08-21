import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { createWebhookRoute } from '../src/webhook';

const SECRET = 'whsec_test';

function signedRequest(
  payload: unknown,
  secret = SECRET,
  headers: Record<string, string> = {},
) {
  const raw = JSON.stringify(payload);
  const ts = new Date().toISOString();
  const signature =
    'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return new Request('http://x/api/wriven', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Wriven-Timestamp': ts,
      'X-Wriven-Signature': signature,
      ...headers,
    },
    body: raw,
  });
}

const PAYLOAD = {
  event: 'entry.published',
  projectId: 'p1',
  firedAt: new Date().toISOString(),
  entry: { id: 'e1', type: 'blog_post', slug: 'hello', status: 'published', publishedAt: null, updatedAt: '' },
};

function makeHandler(revalidate: Parameters<typeof createWebhookRoute>[0]['revalidate']) {
  const calls: { path: string; type?: string; tag?: string }[] = [];
  const { POST } = createWebhookRoute({
    secret: SECRET,
    revalidate,
    cache: {
      revalidatePath: (path, type) => calls.push({ path, type }),
      revalidateTag: (tag) => calls.push({ path: '', tag }),
    },
  });
  return { POST, calls };
}

test('401 on bad signature', async () => {
  const { POST } = createWebhookRoute({ secret: SECRET, cache: {} as never });
  const res = await POST(
    signedRequest(PAYLOAD, 'whsec_wrong'),
  );
  assert.equal(res.status, 401);
});

test('revalidates string paths and tags', async () => {
  const h = makeHandler(() => ({ paths: ['/jobs'], tags: ['proj_p1'] }));
  const res = await h.POST(signedRequest(PAYLOAD));
  assert.equal(res.status, 200);
  assert.deepEqual(h.calls, [
    { path: '/jobs', type: undefined },
    { path: '', tag: 'proj_p1' },
  ]);
});

test('object paths forward the route type', async () => {
  const h = makeHandler(() => ({
    paths: ['/blog', { path: '/blog/[slug]', type: 'page' as const }],
  }));
  await h.POST(signedRequest(PAYLOAD));
  assert.deepEqual(h.calls, [
    { path: '/blog', type: undefined },
    { path: '/blog/[slug]', type: 'page' },
  ]);
});

test('no revalidation when callback returns nothing', async () => {
  const h = makeHandler(() => undefined);
  const res = await h.POST(signedRequest(PAYLOAD));
  assert.equal(res.status, 200);
  assert.equal(h.calls.length, 0);
});
