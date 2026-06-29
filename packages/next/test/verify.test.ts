import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWrivenSignature } from '../src/verify';

const sign = (secret: string, ts: string, body: string) =>
  'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

test('accepts a valid signature', () => {
  const ts = new Date().toISOString();
  const body = '{"event":"entry.published"}';
  const secret = 'whsec_test';
  const headers = { 'x-wriven-timestamp': ts, 'x-wriven-signature': sign(secret, ts, body) };
  assert.equal(verifyWrivenSignature(body, headers, secret), true);
});

test('rejects a tampered body', () => {
  const ts = new Date().toISOString();
  const secret = 'whsec_test';
  const headers = { 'x-wriven-timestamp': ts, 'x-wriven-signature': sign(secret, ts, '{"a":1}') };
  assert.equal(verifyWrivenSignature('{"a":2}', headers, secret), false);
});

test('rejects a stale timestamp (replay guard)', () => {
  const ts = new Date(Date.now() - 10 * 60_000).toISOString();
  const body = 'x';
  const secret = 'whsec_test';
  const headers = { 'x-wriven-timestamp': ts, 'x-wriven-signature': sign(secret, ts, body) };
  assert.equal(verifyWrivenSignature(body, headers, secret), false);
});

test('rejects the wrong secret', () => {
  const ts = new Date().toISOString();
  const body = 'x';
  const headers = { 'x-wriven-timestamp': ts, 'x-wriven-signature': sign('right', ts, body) };
  assert.equal(verifyWrivenSignature(body, headers, 'wrong'), false);
});

test('rejects missing headers', () => {
  assert.equal(verifyWrivenSignature('x', {}, 'whsec_test'), false);
});
