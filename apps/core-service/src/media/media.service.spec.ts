import { RpcException } from '@nestjs/microservices';
import { MediaService } from './media.service';
import type { StorageService } from '../storage/storage.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';

function makeService() {
  const db = createDbMock();
  const storage = {
    presignUpload: jest.fn().mockResolvedValue('https://signed.example/put'),
    delete: jest.fn().mockResolvedValue(undefined),
    publicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
  };
  const entitlements = {
    storageLimitBytes: jest.fn().mockResolvedValue(null),
  };
  const service = new MediaService(
    asDb(db),
    storage as unknown as StorageService,
    entitlements as unknown as CoreEntitlementsService,
  );
  return { service, db, storage, entitlements };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string; message: string };
    }
    throw err;
  }
  throw new Error('expected rejection');
}

const MB = 1024 * 1024;

describe('MediaService.presign — type + size gates', () => {
  it('rejects unsupported content types', async () => {
    const { service } = makeService();
    const err = await failure(
      service.presign({
        workspaceId: 'ws-1',
        projectId: 'p1',
        userId: 'u1',
        dto: { filename: 'x.exe', contentType: 'application/octet-stream', size: 1 } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('Unsupported file type');
  });

  it('image/* capped at 5 MB, everything allowed at 25 MB', async () => {
    const { service } = makeService();
    const image = await failure(
      service.presign({
        workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
        dto: { filename: 'big.png', contentType: 'image/png', size: 6 * MB } as never,
      }),
    );
    expect(image.message).toContain('Max 5 MB');

    const pdf = await failure(
      service.presign({
        workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
        dto: { filename: 'big.pdf', contentType: 'application/pdf', size: 26 * MB } as never,
      }),
    );
    expect(pdf.message).toContain('Max 25 MB');
  });
});

describe('MediaService.presign — storage quota', () => {
  it('blocks when used + incoming size exceeds the plan cap', async () => {
    const { service, db, entitlements } = makeService();
    entitlements.storageLimitBytes.mockResolvedValue(100 * MB);
    db.select.mockImplementationOnce(() => chain([{ total: String(96 * MB) }]));

    const err = await failure(
      service.presign({
        workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
        dto: { filename: 'v.mp4', contentType: 'video/mp4', size: 5 * MB } as never,
      }),
    );

    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(err.message).toContain('100 MB');
  });

  it('null storage limit (unlimited/unresolvable) → skip the quota check', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() => chain([{ total: '999999' }]));

    const result = await service.presign({
      workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
      dto: { filename: 'v.mp4', contentType: 'video/mp4', size: 5 * MB } as never,
    });

    expect(result.uploadUrl).toBe('https://signed.example/put');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('key shape: projects/<projectId>/<uuid>.<ext-from-filename>', async () => {
    const { service } = makeService();
    const result = await service.presign({
      workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
      dto: { filename: 'Photo.JPG', contentType: 'image/jpeg' } as never,
    });

    expect(result.key).toMatch(/^projects\/p1\/[0-9a-f-]{36}\.jpg$/); // ext lowercased
  });
});

describe('MediaService.presignAvatar', () => {
  it('image-only, no quota call, avatars/<userId>/ prefix', async () => {
    const { service, entitlements } = makeService();
    const result = await service.presignAvatar({
      userId: 'u1',
      dto: { filename: 'me.png', contentType: 'image/png' } as never,
    });

    expect(result.key).toMatch(/^avatars\/u1\/[0-9a-f-]{36}\.png$/);
    expect(entitlements.storageLimitBytes).not.toHaveBeenCalled();
  });

  it('non-image → VALIDATION_ERROR', async () => {
    const { service } = makeService();
    const err = await failure(
      service.presignAvatar({
        userId: 'u1',
        dto: { filename: 'me.mp4', contentType: 'video/mp4' } as never,
      }),
    );
    expect(err.message).toContain('must be an image');
  });
});

describe('MediaService.deleteAvatar — key safety', () => {
  it('refuses keys outside avatars/ — never an arbitrary R2 object', async () => {
    const { service, storage } = makeService();
    await expect(
      service.deleteAvatar({ key: 'projects/p1/steal.png' }),
    ).rejects.toThrow('non-avatar');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('avatars/ key delegates to best-effort storage delete', async () => {
    const { service, storage } = makeService();
    await service.deleteAvatar({ key: 'avatars/u1/old.png' });
    expect(storage.delete).toHaveBeenCalledWith('avatars/u1/old.png');
  });
});

describe('MediaService.create — key pinning + conflict', () => {
  it('rejects keys outside the project prefix (never trust a raw key)', async () => {
    const { service, db } = makeService();
    const err = await failure(
      service.create({
        workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
        dto: { key: 'projects/OTHER/evil.png', kind: 'image' } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('duplicate key (23505) → friendly CONFLICT', async () => {
    const { service, db } = makeService();
    const dup = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'media_assets_r2_key_uq',
    });
    db.insert.mockImplementationOnce(() => {
      throw dup;
    });

    const err = await failure(
      service.create({
        workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
        dto: { key: 'projects/p1/a.png', kind: 'image' } as never,
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('already been uploaded');
  });

  it('kind is derived from the mime when present', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([{
      id: 'm-1', workspaceId: 'ws-1', projectId: 'p1',
      r2Key: 'projects/p1/a.png', kind: 'image', mime: 'image/png',
      sizeBytes: null, width: null, height: null, alt: null,
      originalFilename: null, uploadedBy: 'u1', deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }]));

    await service.create({
      workspaceId: 'ws-1', projectId: 'p1', userId: 'u1',
      dto: { key: 'projects/p1/a.png', mime: 'video/mp4', kind: 'image' } as never,
    });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video' }), // mime wins over the sent kind
    );
  });
});

describe('MediaService.presign — declared size is bound into the upload', () => {
  it('forwards the declared size as the signed content length', async () => {
    const { service, storage } = makeService();
    await service.presign({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { filename: 'a.png', contentType: 'image/png', size: 42 } as never,
    });
    expect(storage.presignUpload).toHaveBeenCalledWith(
      expect.any(String),
      'image/png',
      { contentLength: 42 },
    );
  });
});
