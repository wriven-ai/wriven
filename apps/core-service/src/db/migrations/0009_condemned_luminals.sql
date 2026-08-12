ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "output" text;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "prompt_version" text DEFAULT 'text-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "finish_reason" text;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "cost_microusd" integer;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "applied_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generations_workspace_creator_idempotency_uq" ON "core_svc"."ai_generations" USING btree ("workspace_id","created_by","idempotency_key");