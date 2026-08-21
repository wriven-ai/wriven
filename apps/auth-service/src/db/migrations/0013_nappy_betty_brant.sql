CREATE TABLE "auth_svc"."workspace_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"project_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_activity_log" ADD CONSTRAINT "workspace_activity_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth_svc"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_activity_log" ADD CONSTRAINT "workspace_activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth_svc"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_svc"."workspace_activity_log" ADD CONSTRAINT "workspace_activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "auth_svc"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_activity_log_ws_created_idx" ON "auth_svc"."workspace_activity_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_activity_log_ws_user_idx" ON "auth_svc"."workspace_activity_log" USING btree ("workspace_id","user_id");