CREATE TABLE "ask_allowance_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"day" date NOT NULL,
	"slot" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"question" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"state" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorized_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expired" boolean DEFAULT false NOT NULL,
	"reserved_ceiling_usd" double precision,
	"settled_cost_usd" double precision,
	"error_class" text
);
--> statement-breakpoint
CREATE TABLE "provider_usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"ceiling_usd" double precision NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"actual_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ask_allowance_user_day_slot_idx" ON "ask_allowance_reservations" USING btree ("user_email","day","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_allowance_run_idx" ON "ask_allowance_reservations" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_runs_user_idem_idx" ON "ask_runs" USING btree ("user_email","idempotency_key");--> statement-breakpoint
CREATE INDEX "ask_runs_status_created_idx" ON "ask_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_resv_run_stage_attempt_idx" ON "provider_usage_reservations" USING btree ("run_id","stage","attempt");--> statement-breakpoint
CREATE INDEX "provider_resv_provider_status_day_idx" ON "provider_usage_reservations" USING btree ("provider","status","day");--> statement-breakpoint
CREATE INDEX "provider_resv_status_created_idx" ON "provider_usage_reservations" USING btree ("status","created_at");