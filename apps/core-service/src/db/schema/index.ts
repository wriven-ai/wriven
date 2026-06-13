import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** All core-service tables live in the `core_svc` Postgres schema. */
export const coreSchema = pgSchema('core_svc');

/**
 * Placeholder content table. The full content model (pages, media metadata,
 * status workflow) is still TBD — see BACKEND.md. This exists so Drizzle has a
 * schema to manage and the `core_svc` schema is created on first migration.
 */
export const posts = coreSchema.table('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  authorId: uuid('author_id').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').notNull().default('draft'), // draft | published
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
