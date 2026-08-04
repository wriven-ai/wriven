-- 0004: Refactor tenancy from User → Org → Workspace to User → Workspace → Project.
-- Workspaces become the top-level tenancy unit (owned directly by a user), orgs
-- are removed, and a new Project layer is introduced under workspaces.
-- Id-preserving: existing workspace ids are kept; created_by is backfilled from
-- each workspace's org owner before the org tables are dropped.

-- ── Backfill workspaces.created_by from each workspace's org owner ───────────
ALTER TABLE "auth_svc"."workspaces" ADD COLUMN "created_by" uuid;--> statement-breakpoint
UPDATE "auth_svc"."workspaces" w
SET "created_by" = (
  SELECT om.user_id
  FROM "auth_svc"."org_members" om
  WHERE om.org_id = w.org_id AND om.role = 'owner'
  ORDER BY om.created_at
  LIMIT 1
);--> statement-breakpoint
UPDATE "auth_svc"."workspaces"
SET "created_by" = (SELECT id FROM "auth_svc"."users" ORDER BY created_at LIMIT 1)
WHERE "created_by" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspaces" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspaces"
  ADD CONSTRAINT "workspaces_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "auth_svc"."users"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspaces"
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- ── Slug is unique per owner (each user can have their own "default") ─────────
DROP INDEX "auth_svc"."workspaces_org_slug_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_created_by_slug_uq"
  ON "auth_svc"."workspaces" USING btree ("created_by","slug");--> statement-breakpoint

-- ── Detach workspaces from orgs ──────────────────────────────────────────────
ALTER TABLE "auth_svc"."workspaces" DROP CONSTRAINT "workspaces_org_id_orgs_id_fk";--> statement-breakpoint
ALTER TABLE "auth_svc"."workspaces" DROP COLUMN "org_id";--> statement-breakpoint

-- ── Workspace is now top-level tenancy: roles become owner|admin|member ──────
-- Drop the old check first so the role rewrites below don't violate it.
ALTER TABLE "auth_svc"."workspace_members" DROP CONSTRAINT "workspace_members_role_check";--> statement-breakpoint
UPDATE "auth_svc"."workspace_members" SET "role" = 'member'
  WHERE "role" IN ('editor', 'viewer');--> statement-breakpoint
UPDATE "auth_svc"."workspace_members" wm
SET "role" = 'owner'
FROM "auth_svc"."workspaces" w
WHERE wm.workspace_id = w.id AND wm.user_id = w.created_by;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_members" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_members"
  ADD CONSTRAINT "workspace_members_role_check"
  CHECK ("auth_svc"."workspace_members"."role" in ('owner', 'admin', 'member'));--> statement-breakpoint

-- ── Projects (new layer) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "auth_svc"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_uq" ON "auth_svc"."projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "projects_workspace_id_idx" ON "auth_svc"."projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "auth_svc"."projects" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "auth_svc"."projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth_svc"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth_svc"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ── Project members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "auth_svc"."project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_uq" ON "auth_svc"."project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_id_idx" ON "auth_svc"."project_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "auth_svc"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "auth_svc"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth_svc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."project_members" ADD CONSTRAINT "project_members_role_check" CHECK ("auth_svc"."project_members"."role" in ('admin', 'editor', 'viewer'));--> statement-breakpoint

-- ── Drop the org layer ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS "auth_svc"."org_members";--> statement-breakpoint
DROP TABLE IF EXISTS "auth_svc"."orgs";
