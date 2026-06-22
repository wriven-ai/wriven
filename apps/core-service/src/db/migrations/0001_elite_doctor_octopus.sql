CREATE TABLE "core_svc"."content_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_type_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "content_entries_status_check" CHECK ("core_svc"."content_entries"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "core_svc"."content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core_svc"."content_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"api_id" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core_svc"."media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"mime" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"alt" text,
	"original_filename" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_kind_check" CHECK ("core_svc"."media_assets"."kind" in ('image', 'video', 'file'))
);
--> statement-breakpoint
ALTER TABLE "core_svc"."content_entries" ADD CONSTRAINT "content_entries_content_type_id_content_types_id_fk" FOREIGN KEY ("content_type_id") REFERENCES "core_svc"."content_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_svc"."content_revisions" ADD CONSTRAINT "content_revisions_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "core_svc"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_ws_type_slug_uq" ON "core_svc"."content_entries" USING btree ("workspace_id","content_type_id","slug");--> statement-breakpoint
CREATE INDEX "content_entries_workspace_id_idx" ON "core_svc"."content_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_entries_type_idx" ON "core_svc"."content_entries" USING btree ("content_type_id");--> statement-breakpoint
CREATE INDEX "content_entries_status_idx" ON "core_svc"."content_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_entries_data_gin" ON "core_svc"."content_entries" USING gin ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_entry_version_uq" ON "core_svc"."content_revisions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "content_revisions_entry_id_idx" ON "core_svc"."content_revisions" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_types_ws_api_id_uq" ON "core_svc"."content_types" USING btree ("workspace_id","api_id");--> statement-breakpoint
CREATE INDEX "content_types_workspace_id_idx" ON "core_svc"."content_types" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "media_assets_workspace_id_idx" ON "core_svc"."media_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_ws_r2_key_uq" ON "core_svc"."media_assets" USING btree ("workspace_id","r2_key");