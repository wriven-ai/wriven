CREATE TABLE "core_svc"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_scope_check" CHECK ("core_svc"."api_keys"."scope" in ('read', 'preview', 'manage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_token_hash_uq" ON "core_svc"."api_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_keys_project_id_idx" ON "core_svc"."api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_id_idx" ON "core_svc"."api_keys" USING btree ("workspace_id");