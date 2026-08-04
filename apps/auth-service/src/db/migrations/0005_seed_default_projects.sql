-- Custom SQL migration file, put your code below! --

-- 0005: Seed a default project per workspace.
-- 0004 created the projects table but left it empty. Every workspace needs a
-- "default" project so existing CMS content (core_svc 0003) can be re-scoped
-- under a project, and so the app always has a project to land on.
-- Idempotent: skips workspaces that already own a 'default' project.

INSERT INTO "auth_svc"."projects" ("workspace_id", "name", "slug", "created_by")
SELECT w."id", 'Default', 'default', w."created_by"
FROM "auth_svc"."workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "auth_svc"."projects" p
  WHERE p."workspace_id" = w."id" AND p."slug" = 'default'
);
