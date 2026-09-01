import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { rpcError } from '../common/rpc-error';

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

/**
 * SSRF guard for tenant-supplied webhook URLs. core-service fetches these
 * from inside the Render private network where auth/core/ai (and any cloud
 * metadata endpoint) are reachable, so a webhook target must resolve to a
 * PUBLIC address. Checked at create/update (fail fast with a validation
 * error) AND at dispatch time — the authoritative check, because DNS can be
 * rebound between create and fire, and because rows written before the guard
 * existed are still delivered.
 */

const PRIVATE = 'Webhook URL must resolve to a public address.';

function isPrivateV4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
  const [a, b] = octets;
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) // private
  );
}

function isPrivateV6(ip: string): boolean {
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(v6)) return true; // link-local fe80::/10
  if (v6.startsWith('::ffff:')) return isPrivateV4(v6.split(':').pop() ?? '');
  return false;
}

function isPrivateAddress(address: string, family: number): boolean {
  return family === 6 ? isPrivateV6(address) : isPrivateV4(address);
}

export async function assertPublicHttpUrl(
  raw: string,
  resolve: Resolver = async (host) => lookup(host, { all: true }),
): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw rpcError('VALIDATION_ERROR', 'Webhook URL must be a valid http(s) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw rpcError('VALIDATION_ERROR', 'Webhook URL must be an http(s) URL.');
  }
  if (url.username || url.password) {
    throw rpcError('VALIDATION_ERROR', PRIVATE);
  }
  const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');

  const family = isIP(host);
  if (family !== 0) {
    if (isPrivateAddress(host, family)) throw rpcError('VALIDATION_ERROR', PRIVATE);
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw rpcError(
      'VALIDATION_ERROR',
      `Webhook URL host could not be resolved: ${host}`,
    );
  }
  // ANY private resolution rejects — a round-robin DNS mixing public and
  // internal addresses must not slip the internal one through.
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address, a.family))) {
    throw rpcError('VALIDATION_ERROR', PRIVATE);
  }
}
