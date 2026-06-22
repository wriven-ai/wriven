ALTER TABLE "auth_svc"."users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_provider_id_uq" ON "auth_svc"."users" USING btree ("provider","provider_id");--> statement-breakpoint
ALTER TABLE "auth_svc"."org_members" ADD CONSTRAINT "org_members_role_check" CHECK ("auth_svc"."org_members"."role" in ('owner', 'admin', 'member'));--> statement-breakpoint
ALTER TABLE "auth_svc"."users" ADD CONSTRAINT "users_provider_check" CHECK ("auth_svc"."users"."provider" in ('local', 'google'));--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("auth_svc"."workspace_members"."role" in ('admin', 'editor', 'viewer'));