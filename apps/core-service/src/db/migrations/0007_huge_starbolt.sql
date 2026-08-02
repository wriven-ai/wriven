CREATE TABLE "core_svc"."usage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"request_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_buckets_workspace_period_uq" ON "core_svc"."usage_buckets" USING btree ("workspace_id","period_start");--> statement-breakpoint
CREATE INDEX "usage_buckets_workspace_idx" ON "core_svc"."usage_buckets" USING btree ("workspace_id");