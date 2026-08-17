ALTER TABLE "core_svc"."ai_generations" ALTER COLUMN "prompt_version" SET DEFAULT 'text-v3';--> statement-breakpoint
ALTER TABLE "core_svc"."ai_generations" ADD COLUMN "error_code" text;