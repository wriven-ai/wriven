CREATE TABLE "auth_svc"."admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_svc"."admin_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_svc"."admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"totp_secret" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_users_role_check" CHECK ("auth_svc"."admin_users"."role" in ('admin', 'moderator', 'member'))
);
--> statement-breakpoint
CREATE TABLE "auth_svc"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_monthly" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_svc"."workspace_plans" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"overrides" jsonb,
	"assigned_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_svc"."admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "auth_svc"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "auth_svc"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_plans" ADD CONSTRAINT "workspace_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth_svc"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_plans" ADD CONSTRAINT "workspace_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "auth_svc"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_user_id_idx" ON "auth_svc"."admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_target_idx" ON "auth_svc"."admin_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "auth_svc"."admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_refresh_tokens_token_hash_uq" ON "auth_svc"."admin_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_refresh_tokens_admin_user_id_idx" ON "auth_svc"."admin_refresh_tokens" USING btree ("admin_user_id");