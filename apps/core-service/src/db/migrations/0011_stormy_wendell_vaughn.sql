CREATE TABLE "core_svc"."ai_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"brand_voice" text,
	"glossary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_profiles_project_uq" ON "core_svc"."ai_profiles" USING btree ("project_id");