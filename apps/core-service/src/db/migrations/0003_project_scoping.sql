-- 0003: Move CMS content under the new Project layer.
-- All content tables gain project_id (NOT NULL); the primary scoping key changes
-- from workspace_id to project_id. workspace_id is retained as denormalized
-- scoping. Unique constraints become project-scoped.
--
-- Existing rows (if any in dev) are handled by backfilling a sentinel project
-- id per distinct workspace; if none exists the migration still succeeds for
-- empty tables. In production this migration runs after the auth_svc 0004
-- migration, which guarantees at least one project per workspace.

-- ── content_types ───────────────────────────────────────────────────────────
ALTER TABLE "core_svc"."content_types" ADD COLUMN "project_id" uuid;--> statement-breakpoint
-- Backfill project_id from the workspace's default project (slug = 'default').
UPDATE "core_svc"."content_types" ct
SET "project_id" = (
  SELECT p.id FROM "auth_svc"."projects" p
  WHERE p.workspace_id = ct.workspace_id AND p.slug = 'default'
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "core_svc"."content_types" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "core_svc"."content_types_ws_api_id_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "content_types_project_api_id_uq" ON "core_svc"."content_types" USING btree ("project_id","api_id");--> statement-breakpoint
CREATE INDEX "content_types_project_id_idx" ON "core_svc"."content_types" USING btree ("project_id");--> statement-breakpoint

-- ── content_entries ─────────────────────────────────────────────────────────
ALTER TABLE "core_svc"."content_entries" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "core_svc"."content_entries" ce
SET "project_id" = (
  SELECT p.id FROM "auth_svc"."projects" p
  WHERE p.workspace_id = ce.workspace_id AND p.slug = 'default'
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "core_svc"."content_entries" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "core_svc"."content_entries_ws_type_slug_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_project_type_slug_uq" ON "core_svc"."content_entries" USING btree ("project_id","content_type_id","slug");--> statement-breakpoint
CREATE INDEX "content_entries_project_id_idx" ON "core_svc"."content_entries" USING btree ("project_id");--> statement-breakpoint

-- ── media_assets ────────────────────────────────────────────────────────────
ALTER TABLE "core_svc"."media_assets" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "core_svc"."media_assets" ma
SET "project_id" = (
  SELECT p.id FROM "auth_svc"."projects" p
  WHERE p.workspace_id = ma.workspace_id AND p.slug = 'default'
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "core_svc"."media_assets" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "core_svc"."media_assets_ws_r2_key_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_project_r2_key_uq" ON "core_svc"."media_assets" USING btree ("project_id","r2_key");--> statement-breakpoint
CREATE INDEX "media_assets_project_id_idx" ON "core_svc"."media_assets" USING btree ("project_id");
