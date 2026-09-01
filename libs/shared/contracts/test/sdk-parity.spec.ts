import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SDK parity tripwire. The publishable @wriven-ai/* packages deliberately do
 * NOT import @wriven/contracts (stable published surface), so their types are
 * hand-mirrored copies of the contract types. Without a mechanical link, a
 * coordinated server-side rename ships with every SDK test green and breaks
 * published npm consumers at runtime.
 *
 * This spec parses BOTH sides' source as text and compares field sets — no
 * imports either way, so it never adds a dependency edge to the nx project
 * graph (the same technique the ai-service suite uses for TS cap parity).
 */

const ROOT = join(__dirname, '../../../../');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CONTRACTS_CMS = read('libs/shared/contracts/src/lib/types/cms.types.ts');
const CONTRACTS_WEBHOOK = read('libs/shared/contracts/src/lib/types/webhook.types.ts');
const CLIENT_TYPES = read('packages/client/src/types.ts');
const NEXT_TYPES = read('packages/next/src/types.ts');

/** Field names of `interface Name { … }` (one nesting level; comments stripped). */
function interfaceFields(source: string, name: string): string[] {
  // `[^{]*` spans nested generics (e.g. <T = Record<string, unknown>>).
  const m = source.match(new RegExp(`interface ${name}[^{]*\\{`));
  if (!m) throw new Error(`interface ${name} not found`);
  const start = m.index! + m[0].length;
  let depth = 1;
  let end = start;
  while (end < source.length && depth > 0) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  const body = source.slice(start, end - 1);
  // Only the TOP level of the block: nested object literals are indented.
  return body
    .split('\n')
    .filter((l) => /^[A-Za-z_]\w*\s*[?]?:/.test(l.trim()))
    // Field NAMES only — the two sides deliberately use different type aliases
    // for identical shapes (WebhookEvent vs WrivenWebhookEvent).
    .map((l) => l.trim().replace(/[?:].*$/, '').trim());
}

/** Union literal members of `type Name = 'a' | 'b';`. */
function unionMembers(source: string, name: string): string[] {
  const m = source.match(new RegExp(`type ${name}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`type ${name} not found`);
  return m[1]
    .split('|')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .sort();
}

describe('@wriven-ai SDK parity with @wriven/contracts (text-level)', () => {
  it('client: WrivenEntry mirrors DeliveryEntry field-for-field', () => {
    expect(interfaceFields(CLIENT_TYPES, 'WrivenEntry')).toEqual(
      interfaceFields(CONTRACTS_CMS, 'DeliveryEntry'),
    );
  });

  it('client: WrivenMedia mirrors DeliveryMedia field-for-field', () => {
    expect(interfaceFields(CLIENT_TYPES, 'WrivenMedia')).toEqual(
      interfaceFields(CONTRACTS_CMS, 'DeliveryMedia'),
    );
  });

  it('client: SDK Paginated carries every server field (plus computed hasNextPage)', () => {
    const server = interfaceFields(CONTRACTS_CMS, 'Paginated');
    const sdk = interfaceFields(CLIENT_TYPES, 'Paginated');
    // The SDK may ADD fields; it may never drop or rename a server field.
    expect(sdk).toEqual(expect.arrayContaining(server));
    expect(sdk).toContain('hasNextPage');
  });

  it('next: WrivenWebhookPayload mirrors WebhookPayload field-for-field', () => {
    expect(interfaceFields(NEXT_TYPES, 'WrivenWebhookPayload')).toEqual(
      interfaceFields(CONTRACTS_WEBHOOK, 'WebhookPayload'),
    );
  });

  it('next: the inline webhook entry sub-shapes match', () => {
    // Both files inline the entry object — compare their nested field sets by
    // slicing each interface body's `entry: { … }` block.
    const subShape = (src: string, iface: string) => {
      const outer = src.match(
        new RegExp(`interface ${iface}[^{]*\\{([\\s\\S]*?)\\n\\}`),
      );
      if (!outer) throw new Error(`${iface} not found`);
      const entryBlock = outer[1].match(/entry:\s*\{([^}]*)\}/);
      if (!entryBlock) throw new Error(`${iface}.entry inline shape not found`);
      return entryBlock[1]
        .split('\n')
        .filter((l) => /^[A-Za-z_]\w*\s*[?]?:/.test(l.trim()))
        .map((l) => l.trim().replace(/:.*/, '').replace('?', '').trim());
    };
    expect(subShape(NEXT_TYPES, 'WrivenWebhookPayload')).toEqual(
      subShape(CONTRACTS_WEBHOOK, 'WebhookPayload'),
    );
  });

  it('next: webhook event-name unions match', () => {
    expect(unionMembers(NEXT_TYPES, 'WrivenWebhookEvent')).toEqual(
      unionMembers(CONTRACTS_WEBHOOK, 'WebhookEvent'),
    );
  });
});
