ALTER TABLE "subscribe_intents" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "landing_path" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "referrer_host" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "analytics_preference" text DEFAULT 'unset' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "analytics_preference_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_analytics_preference_check" CHECK ("users"."analytics_preference" IN ('unset', 'granted', 'denied'));