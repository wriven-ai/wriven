CREATE TABLE "core_svc"."ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"content_type_id" uuid,
	"entry_id" uuid,
	"field_key" text NOT NULL,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_status_check" CHECK ("core_svc"."ai_generations"."status" in ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "ai_generations_workspace_created_idx" ON "core_svc"."ai_generations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_entry_id_idx" ON "core_svc"."ai_generations" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "ai_generations_project_id_idx" ON "core_svc"."ai_generations" USING btree ("project_id");