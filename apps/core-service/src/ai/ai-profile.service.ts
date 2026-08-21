import { Inject, Injectable } from '@nestjs/common';
import { AiProfileView, UpdateAiProfileDto } from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const { aiProfiles } = schema;

/**
 * Per-project AI voice config. Absent row = empty profile, never auto-created
 * (upsert creates on first edit). `projects` is an auth-service table, so the
 * gateway-injected workspaceId is authoritative — the client's X-Workspace-Id
 * header is never persisted for this row.
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

  async upsert(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: UpdateAiProfileDto;
  }): Promise<AiProfileView> {
    // glossary is NOT NULL jsonb but @IsOptional() lets null past the DTO —
    // treat null as clear in both paths (a raw NULL 500'd on Postgres 23502).
    const glossary = p.dto.glossary ?? [];
    const [row] = await this.db
      .insert(aiProfiles)
      .values({
        workspaceId: p.workspaceId,
        projectId: p.projectId,
        brandVoice: p.dto.brandVoice ?? null,
        glossary,
        language: p.dto.language ?? null,
        updatedBy: p.userId,
      })
      .onConflictDoUpdate({
        target: aiProfiles.projectId,
        set: {
          ...(p.dto.brandVoice !== undefined ? { brandVoice: p.dto.brandVoice } : {}),
          ...(p.dto.glossary !== undefined ? { glossary } : {}),
          ...(p.dto.language !== undefined ? { language: p.dto.language } : {}),
          updatedBy: p.userId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.toView(row);
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
