ALTER TABLE "ask_usage" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "stage_timings_ms" jsonb;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "first_content_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "route_policy" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ask_usage_run_id_idx" ON "ask_usage" USING btree ("run_id");