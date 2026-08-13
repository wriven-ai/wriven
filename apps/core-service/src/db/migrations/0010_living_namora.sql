ALTER TABLE "core_svc"."ai_generations" ALTER COLUMN "field_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "target_kind" text DEFAULT 'field' NOT NULL;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "applied_field_keys" jsonb;--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD CONSTRAINT "ai_generations_target_kind_check" CHECK ("core_svc"."ai_generations"."target_kind" in ('field', 'entry'));