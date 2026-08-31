/**
 * SDK parity tripwire — the publishable @wriven-ai/* packages deliberately do
 * NOT depend on this package (stable published surface), so their types are
 * hand-mirrored copies of the contract types below. Without a mechanical
 * link, a coordinated server-side rename ships with every SDK test green and
 * breaks published npm consumers at runtime. This spec is that link: it
 * imports both declarations and asserts mutual assignability — drift on
 * either side fails COMPILATION here (ts-jest runs with diagnostics on).
 *
 * Runtime assertion is trivial (`expect(true)`) — the check is the type
 * system's; keep these imports in sync when SDK types move.
 */
import type { DeliveryEntry, DeliveryMedia, Paginated } from './types/cms.types';
import type { WebhookEvent, WebhookPayload } from './types/webhook.types';
import type {
  WrivenEntry,
  WrivenMedia,
  Paginated as SdkPaginated,
} from '../../../../../packages/client/src/types';
import type {
  WrivenWebhookEvent,
  WrivenWebhookPayload,
} from '../../../../../packages/next/src/types';

/** Strict type-level equality (both directions, including optionality). */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

const t = <const T>(v: T) => v;
void t;

describe('@wriven-ai SDK parity with @wriven/contracts', () => {
  it('client: WrivenEntry matches DeliveryEntry', () => {
    const check: Equal<WrivenEntry, DeliveryEntry> = true;
    expect(check).toBe(true);
  });

  it('client: WrivenMedia matches DeliveryMedia', () => {
    const check: Equal<WrivenMedia, DeliveryMedia> = true;
    expect(check).toBe(true);
  });

  it('client: SDK Paginated carries every server field (plus computed hasNextPage)', () => {
    // Server → SDK is assignable; the SDK is allowed to ADD fields, never to
    // drop or rename a server field.
    const serverPage: Paginated<DeliveryEntry> = {
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    };
    const sdkPage: SdkPaginated<WrivenEntry> = {
      ...serverPage,
      hasNextPage: false,
    };
    expect(sdkPage.hasNextPage).toBe(false);
  });

  it('next: WrivenWebhookPayload matches WebhookPayload', () => {
    const check: Equal<WrivenWebhookPayload, WebhookPayload> = true;
    expect(check).toBe(true);
  });

  it('next: webhook event-name unions match', () => {
    const check: Equal<WrivenWebhookEvent, WebhookEvent> = true;
    expect(check).toBe(true);
  });
});
