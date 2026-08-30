import { StorageService } from './storage.service';
import { configStub } from '../testing/config-stub';

const FULL_R2 = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'wriven-media',
  R2_PUBLIC_URL: 'https://cdn.example.com/pub/',
};

function makeService(map: Record<string, unknown> = {}) {
  return new StorageService(configStub(map));
}

describe('StorageService.publicUrl (keys-not-URLs)', () => {
  it('reconstructs the URL from R2_PUBLIC_URL, stripping its trailing slash', () => {
    const service = makeService({ R2_PUBLIC_URL: 'https://cdn.example.com/pub/' });
    expect(service.publicUrl('projects/p1/a.png')).toBe(
      'https://cdn.example.com/pub/projects/p1/a.png',
    );
  });

  it('empty public base → just the key path joined', () => {
    const service = makeService({});
    expect(service.publicUrl('avatars/u1/x.png')).toBe('/avatars/u1/x.png');
  });
});

describe('StorageService — lazy client gating', () => {
  it('unconfigured storage → clear INTERNAL_ERROR, not an SDK crash', async () => {
    const service = makeService({}); // no R2_* env at all
    await expect(
      service.presignUpload('projects/p1/a.png', 'image/png'),
    ).rejects.toThrow('Media storage is not configured.');
  });

  it('missing only the bucket → still unconfigured', async () => {
    const service = makeService({
      R2_ACCOUNT_ID: 'acct123',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      // no bucket
    });
    await expect(
      service.presignUpload('k', 'image/png'),
    ).rejects.toThrow('not configured');
  });
});

describe('StorageService.presignUpload (configured)', () => {
  it('signs locally against the derived R2 endpoint and key', async () => {
    const service = makeService(FULL_R2);
    const url = await service.presignUpload('projects/p1/a.png', 'image/png');

    // Virtual-host style: bucket subdomain of the derived account endpoint.
    expect(url.startsWith('https://wriven-media.acct123.r2.cloudflarestorage.com/')).toBe(true);
    expect(url).toContain('/projects/p1/a.png?');
    expect(url).toContain('X-Amz-Signature');
    expect(url).toContain('X-Amz-Expires=300');
  });

  it('explicit R2_ENDPOINT wins over the account-id derivation', async () => {
    const service = makeService({ ...FULL_R2, R2_ENDPOINT: 'https://r2proxy.example' });
    const url = await service.presignUpload('k', 'image/png');
    expect(url).toContain('r2proxy.example');
  });
});

describe('StorageService.delete', () => {
  it('swallows client errors — never throws (row is already soft-deleted)', async () => {
    const service = makeService({}); // unconfigured → getClient throws
    await expect(service.delete('projects/p1/a.png')).resolves.toBeUndefined();
  });
});

describe('StorageService.presignUpload — content-length binding', () => {
  it('signs the declared content length into the URL', async () => {
    const service = makeService(FULL_R2);
    const url = await service.presignUpload('projects/p1/a.png', 'image/png', {
      contentLength: 1234,
    });
    // SigV4 signs the content-length header → storage rejects a PUT whose
    // body length differs from the quota-charged declaration.
    expect(url).toContain('X-Amz-SignedHeaders=content-length%3Bhost');
  });

  it('omits the binding when no length is given (back-compat)', async () => {
    const service = makeService(FULL_R2);
    const url = await service.presignUpload('k', 'image/png');
    expect(url).toContain('X-Amz-SignedHeaders=host');
    expect(url).not.toContain('content-length');
  });
});
