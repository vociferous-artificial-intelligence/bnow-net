ALTER TABLE "subscribe_intents" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "use_case" text;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "request_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD COLUMN "source" text;