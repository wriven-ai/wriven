CREATE TABLE "auth_svc"."stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_created_at" timestamp with time zone,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "auth_svc"."subscriptions" ADD COLUMN "stripe_event_created_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stripe_events_type_idx" ON "auth_svc"."stripe_events" USING btree ("event_type");