import { ERROR_CODES } from '@wriven/contracts';
import { of } from 'rxjs';
import { DeliveryController } from './delivery.controller';
import type * as contracts from '@wriven/contracts';
import type { Response } from 'express';
import type { UsageBufferService } from '../usage/usage-buffer.service';
import type { UsageEnforceService } from '../usage/usage-enforce.service';

type Key = contracts.ApiKeyResolution;

function key(overrides: Partial<Key> = {}): Key {
  return {
    id: 'key-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    scope: 'read',
    ...overrides,
  };
}

function makeController(sendResult: unknown = of({ items: [{ id: 'e1' }, { id: 'e2' }] })) {
  // Typed params so `send.mock.calls[0][1]` is indexable.
  const send = jest.fn((_pattern: string, _payload: unknown) => sendResult);
  const core = { send } as never;
  const usageEnforce = { assertRequests: jest.fn().mockResolvedValue(undefined) };
  const usageBuffer = { bump: jest.fn() };
  const controller = new DeliveryController(
    core,
    usageEnforce as unknown as UsageEnforceService,
    usageBuffer as unknown as UsageBufferService,
  );
  return { controller, send, usageEnforce, usageBuffer };
}

function res() {
  return { setHeader: jest.fn() } as unknown as Response & { setHeader: jest.Mock };
}

describe('DeliveryController — project pinning', () => {
  it('path project ≠ key project → FORBIDDEN, core never called', async () => {
    const { controller, send } = makeController();

    await expect(
      controller.list(key(), 'OTHER-PROJECT', 'posts', {}, res()),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN.code,
      message: expect.stringContaining('cannot access the requested project'),
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('DeliveryController.list — published (read) reads', () => {
  it('forwards the key project, sets CDN cache tags per entry, bumps usage', async () => {
    const { controller, send, usageEnforce, usageBuffer } = makeController();
    const r = res();

    await controller.list(key(), 'p1', 'posts', { limit: 5 }, r);

    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: 'p1', apiId: 'posts', preview: false }),
    );
    const tags = 'proj_p1 type_posts entry_e1 entry_e2';
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    expect(r.setHeader).toHaveBeenCalledWith('Surrogate-Key', tags);
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Tag', tags);
    expect(usageEnforce.assertRequests).toHaveBeenCalledWith('ws-1');
    expect(usageBuffer.bump).toHaveBeenCalledWith('ws-1');
  });
});

describe('DeliveryController — preview keys (non-read scope)', () => {
  it('draft reads are never cacheable: private, no-store, no tags', async () => {
    const { controller, send } = makeController(of({ id: 'e1' }));
    const r = res();

    await controller.get(key({ scope: 'preview' }), 'p1', 'posts', 'draft-slug', {}, r);

    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: 'draft-slug', preview: true }),
    );
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    const setHeaders = r.setHeader.mock.calls.map((c) => c[0]);
    expect(setHeaders).not.toContain('Surrogate-Key');
    expect(setHeaders).not.toContain('Cache-Tag');
  });

  it('manage scope is also preview (drafts visible)', async () => {
    const { controller, send } = makeController(of({ id: 'e1' }));
    await controller.get(key({ scope: 'manage' }), 'p1', 'posts', 's', {}, res());
    expect(send.mock.calls[0][1]).toMatchObject({ preview: true });
  });
});

describe('DeliveryController.get — single entry', () => {
  it('tags the response with exactly its own entry id', async () => {
    const { controller } = makeController(of({ id: 'e9' }));
    const r = res();

    await controller.get(key(), 'p1', 'posts', 'hello-world', {}, r);

    expect(r.setHeader).toHaveBeenCalledWith('Surrogate-Key', 'proj_p1 type_posts entry_e9');
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Tag', 'proj_p1 type_posts entry_e9');
  });
});
