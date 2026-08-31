import { Logger } from '@nestjs/common';
import { CachePurgeService } from './cache-purge.service';
import { configStub } from '../testing/config-stub';

beforeAll(() => {
  Logger.overrideLogger([]);
});

afterEach(() => {
  jest.restoreAllMocks(); // fetch spies must never leak
});

const CONFIGURED = { CF_ZONE_ID: 'zone-1', CF_API_TOKEN: 'tok-1' };

function makeService(config: Record<string, string> = {}) {
  const service = new CachePurgeService(configStub(config));
  return { service };
}

describe('CachePurgeService — tag vocabulary (shared with the gateway emitter)', () => {
  it('purges entry_<id> + type_<apiId> for an entry', async () => {
    const { service } = makeService(CONFIGURED);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as never);

    await service.purgeEntry('post', 'e-1');

    // The gateway's delivery controller emits `proj_ type_ entry_` cache tags
    // (delivery.controller.ts) — this derivation must stay in lockstep or
    // published responses go stale / wrong tags purge.
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body as string)).toEqual({
      tags: ['entry_e-1', 'type_post'],
    });
  });
});

describe('CachePurgeService.purgeTags', () => {
  it('no CDN configured → no-op, never fetches (published responses unfronted)', async () => {
    const { service } = makeService(); // no CF_* keys
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(service.purgeTags(['entry_e-1'])).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('only one of the two keys configured → still a no-op', async () => {
    const { service } = makeService({ CF_ZONE_ID: 'zone-1' });
    const fetchSpy = jest.spyOn(global, 'fetch');

    await service.purgeTags(['entry_e-1']);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('empty tag list → early return, no fetch even when configured', async () => {
    const { service } = makeService(CONFIGURED);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await service.purgeTags([]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('non-ok response → logged, never thrown (best-effort contract)', async () => {
    const { service } = makeService(CONFIGURED);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as never);

    await expect(service.purgeTags(['entry_e-1'])).resolves.toBeUndefined();
  });

  it('network failure → logged, never thrown', async () => {
    const { service } = makeService(CONFIGURED);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.purgeTags(['entry_e-1'])).resolves.toBeUndefined();
  });
});
