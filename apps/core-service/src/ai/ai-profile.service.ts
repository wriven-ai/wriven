import { Inject, Injectable } from '@nestjs/common';
import { AiProfileView, UpdateAiProfileDto } from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const { aiProfiles } = schema;

/**
 * Per-project AI "voice" config: brand voice, glossary, default language. Read
 * on every generation and edited from the project's AI settings. Absent row =
 * empty profile (no guidance) — today's neutral behavior. Never auto-created;
 * {@link upsert} creates on first edit.
 *
 * `projects` is an auth-service table, so this service cannot re-verify the
 * project/workspace binding; the gateway's ProjectGuard already did. The
 * workspaceId is threaded from that resolution so the row is scoped correctly
 * without trusting the client for it.
 */
@Injectable()
export class AiProfileService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Read a project's profile, or an empty view when none exists yet. */
  async read(projectId: string): Promise<AiProfileView> {
    const row = await this.db.query.aiProfiles.findFirst({
      where: eq(aiProfiles.projectId, projectId),
    });
    if (!row) return { brandVoice: null, glossary: [], language: null, updatedAt: null };
    return this.toView(row);
  }

  /** Create or update a project's profile (validated by the gateway DTO). */
  async upsert(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: UpdateAiProfileDto;
  }): Promise<AiProfileView> {
    const [row] = await this.db
      .insert(aiProfiles)
      .values({
        workspaceId: p.workspaceId,
        projectId: p.projectId,
        brandVoice: p.dto.brandVoice ?? null,
        glossary: p.dto.glossary ?? [],
        language: p.dto.language ?? null,
        updatedBy: p.userId,
      })
      .onConflictDoUpdate({
        target: aiProfiles.projectId,
        set: {
          ...(p.dto.brandVoice !== undefined ? { brandVoice: p.dto.brandVoice } : {}),
          ...(p.dto.glossary !== undefined ? { glossary: p.dto.glossary } : {}),
          ...(p.dto.language !== undefined ? { language: p.dto.language } : {}),
          updatedBy: p.userId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.toView(row);
  }

  /** Resolve a profile for the generation path (no 404 — empty view when absent). */
  async resolve(projectId: string): Promise<AiProfileView> {
    return this.read(projectId);
  }

  private toView(row: typeof aiProfiles.$inferSelect): AiProfileView {
    return {
      brandVoice: row.brandVoice ?? null,
      glossary: (row.glossary ?? []) as { term: string; prefer: string }[],
      language: row.language ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
