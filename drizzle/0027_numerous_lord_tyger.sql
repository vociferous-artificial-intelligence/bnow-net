ALTER TABLE "ask_runs" ADD COLUMN "billing_policy" text;--> statement-breakpoint
ALTER TABLE "ask_runs" ADD COLUMN "billing_eligible" boolean DEFAULT false NOT NULL;