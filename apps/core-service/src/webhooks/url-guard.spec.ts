import { assertPublicHttpUrl } from './url-guard';

/** Fake DNS resolver — no network in unit tests. */
const resolves =
  (...addresses: { address: string; family: number }[]) =>
  async () =>
    addresses;

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return (err as { message: string }).message;
  }
  throw new Error('expected rejection');
}

describe('assertPublicHttpUrl — literal IPs need no DNS', () => {
  it.each([
    'http://127.0.0.1:8080/cb',
    'http://10.1.2.3/cb',
    'http://172.16.0.1/cb',
    'http://172.31.255.255/cb',
    'http://192.168.1.10/cb',
    'http://169.254.169.254/latest/meta-data', // cloud metadata
    'http://0.0.0.0/cb',
    'http://100.64.0.1/cb', // CGNAT
  ])('rejects private/loopback literal %s', async (url) => {
    const msg = await rejection(assertPublicHttpUrl(url));
    expect(msg).toContain('public address');
  });

  it('rejects IPv6 loopback and ULA literals', async () => {
    expect(await rejection(assertPublicHttpUrl('http://[::1]/cb'))).toContain(
      'public address',
    );
    expect(await rejection(assertPublicHttpUrl('http://[fd00::1]/cb'))).toContain(
      'public address',
    );
    // v4-mapped v6 is unwrapped and checked as v4
    expect(
      await rejection(assertPublicHttpUrl('http://[::ffff:10.0.0.1]/cb')),
    ).toContain('public address');
  });

  it('accepts a public literal IP', async () => {
    await expect(
      assertPublicHttpUrl('https://93.184.216.34/cb'),
    ).resolves.toBeUndefined();
  });
});

describe('assertPublicHttpUrl — hostnames are resolved', () => {
  it('internal service hostnames (Render private network) are rejected', async () => {
    const resolve = resolves({ address: '10.0.0.5', family: 4 });
    const msg = await rejection(
      assertPublicHttpUrl('http://wriven-auth:5001/x', resolve),
    );
    expect(msg).toContain('public address');
  });

  it('localhost resolves to loopback and is rejected', async () => {
    const resolve = resolves({ address: '127.0.0.1', family: 4 });
    expect(
      await rejection(assertPublicHttpUrl('http://localhost:3000/cb', resolve)),
    ).toContain('public address');
  });

  it('a hostname resolving to ANY private address is rejected (round-robin DNS)', async () => {
    const resolve = resolves(
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.0.5', family: 4 },
    );
    expect(
      await rejection(assertPublicHttpUrl('https://hooks.example/cb', resolve)),
    ).toContain('public address');
  });

  it('a fully public hostname passes', async () => {
    const resolve = resolves(
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    );
    await expect(
      assertPublicHttpUrl('https://hooks.example/cb', resolve),
    ).resolves.toBeUndefined();
  });

  it('an unresolvable hostname is a validation error', async () => {
    const resolve = async () => {
      throw new Error('ENOTFOUND');
    };
    expect(
      await rejection(assertPublicHttpUrl('https://no-such-host.example/cb', resolve)),
    ).toContain('could not be resolved');
  });
});

describe('assertPublicHttpUrl — URL shape', () => {
  it('rejects non-http(s) schemes and embedded credentials', async () => {
    expect(await rejection(assertPublicHttpUrl('ftp://hooks.example/cb'))).toContain(
      'http(s)',
    );
    expect(
      await rejection(assertPublicHttpUrl('https://user:pass@hooks.example/cb')),
    ).toContain('public address');
  });
});
