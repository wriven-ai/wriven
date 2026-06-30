ALTER TABLE "auth_svc"."plans" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "price_yearly" integer;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "currency" text DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "stripe_price_id_monthly" text;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "stripe_price_id_yearly" text;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "trial_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_svc"."plans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;