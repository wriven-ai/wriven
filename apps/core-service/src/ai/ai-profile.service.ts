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
 * project/workspace binding; the gateway resolves the authoritative workspace
 * from the project record and injects it into the TCP payload —
 * the client's `X-Workspace-Id` header is never persisted for this row.
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
    // `glossary` is a NOT NULL jsonb column: `@IsOptional()` lets `null` past
    // the DTO, so treat null as "clear" in BOTH paths — the conflict branch
    // previously wrote a raw NULL and 500'd on Postgres 23502.
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
