import { Logger } from '@nestjs/common';
import { WEBHOOK_EVENTS, WebhookPayload } from '@wriven/contracts';
import { createHmac } from 'node:crypto';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { WebhooksService } from './webhooks.service';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';

beforeAll(() => {
  Logger.overrideLogger([]);
});

afterEach(() => {
  jest.restoreAllMocks(); // spies on global.fetch must never leak between tests
  jest.useRealTimers();
});

function makeService() {
  const db = createDbMock();
  const entitlements = {
    assertWebhookQuota: jest.fn().mockResolvedValue(undefined),
  };
  const service = new WebhooksService(
    asDb(db),
    entitlements as unknown as CoreEntitlementsService,
  );
  return { service, db, entitlements };
}

function webhookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    url: 'https://hooks.example/cb',
    events: ['entry.published'],
    secret: 'whsec_test',
    active: true,
    lastStatus: null,
    lastFiredAt: null,
    createdBy: 'u1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}): WebhookPayload {
  return {
    event: 'entry.published',
    projectId: 'p1',
    firedAt: '2026-01-15T10:00:00.000Z',
    entry: {
      id: 'e1',
      type: 'post',
      slug: 'hello',
      status: 'published',
      publishedAt: '2026-01-15T09:00:00.000Z',
      updatedAt: '2026-01-15T10:00:00.000Z',
    },
    ...overrides,
  } as WebhookPayload;
}

describe('WebhooksService.create', () => {
  it('mints a whsec_ secret, asserts quota first, returns both once', async () => {
    const { service, db, entitlements } = makeService();
    db.insert.mockImplementationOnce(() => chain([webhookRow()]));

    const result = await service.create({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { url: 'https://hooks.example/cb', events: ['entry.published'] } as never,
    });

    expect(entitlements.assertWebhookQuota).toHaveBeenCalledWith('ws-1');
    expect(result.secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(result.webhook.id).toBe('wh-1');
  });

  it('empty events list subscribes to every WEBHOOK_EVENTS entry', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => chain([webhookRow()]));

    await service.create({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { url: 'https://hooks.example/cb', events: [] } as never,
    });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ events: [...WEBHOOK_EVENTS] }),
    );
  });
});

describe('WebhooksService.update — partial patch', () => {
  it('only provided fields are written; url untouched when only active sent', async () => {
    const { service, db } = makeService();
    db.query.webhooks.findFirst.mockResolvedValue(webhookRow());
    db.update.mockImplementationOnce(() => chain([webhookRow({ active: false })]));

    await service.update({
      projectId: 'p1',
      id: 'wh-1',
      dto: { active: false } as never,
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ active: false });
  });

  it('unknown id → NOT_FOUND before any write', async () => {
    const { service, db } = makeService();
    db.query.webhooks.findFirst.mockResolvedValue(undefined);

    await expect(
      service.update({ projectId: 'p1', id: 'nope', dto: {} as never }),
    ).rejects.toThrow('Webhook not found');
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('WebhooksService.dispatch', () => {
  it('delivers only to active subscribers of the event', async () => {
    const { service, db } = makeService();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as never);
    // The DB where-clause owns the active filter (mocks return all rows), so
    // the inactive fixture also carries a non-matching event here; the service-
    // side filter under test is the events.includes() check.
    db.query.webhooks.findMany.mockResolvedValue([
      webhookRow(), // subscribed
      webhookRow({ id: 'wh-2', events: ['entry.deleted'] }), // wrong event
      webhookRow({ id: 'wh-3', events: ['entry.deleted'] }), // would-be-inactive row
    ]);
    db.update.mockImplementation(() => chain([webhookRow()]));

    await service.dispatch('p1', payload());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.example/cb');
    expect(init.method).toBe('POST');
  });

  it('signs the body HMAC-SHA256 with the stored secret over ts.body', async () => {
    const { service, db } = makeService();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as never);
    db.query.webhooks.findMany.mockResolvedValue([webhookRow()]);
    db.update.mockImplementation(() => chain([webhookRow()]));

    const event = payload();
    await service.dispatch('p1', event);

    const init = fetchSpy.mock.calls[0][1] as RequestInit & {
      headers: Record<string, string>;
    };
    const expected = createHmac('sha256', 'whsec_test')
      .update(`${event.firedAt}.${init.body as string}`)
      .digest('hex');

    expect(init.headers['X-Wriven-Event']).toBe('entry.published');
    expect(init.headers['X-Wriven-Timestamp']).toBe(event.firedAt);
    expect(init.headers['X-Wriven-Signature']).toBe(`sha256=${expected}`);
  });

  it('network error → status 0 persisted, dispatch resolves (best-effort)', async () => {
    const { service, db } = makeService();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));
    db.query.webhooks.findMany.mockResolvedValue([webhookRow()]);
    db.update.mockImplementation(() => chain([webhookRow()]));

    jest.useFakeTimers();
    const dispatched = service.dispatch('p1', payload());
    await jest.advanceTimersByTimeAsync(3000); // burn the 500+2000ms backoff
    await dispatched;
    jest.useRealTimers();

    expect(fetchSpy).toHaveBeenCalledTimes(3); // all attempts failed
    expect(chainOf(db.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: 0 }),
    );
  });

  it('no subscribers → zero fetch calls', async () => {
    const { service, db } = makeService();
    const fetchSpy = jest.spyOn(global, 'fetch');
    db.query.webhooks.findMany.mockResolvedValue([]);

    await service.dispatch('p1', payload());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
