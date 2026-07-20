CREATE TABLE "ask_run_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ask_runs" ADD COLUMN "evidence_snapshot" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "ask_run_events_run_seq_idx" ON "ask_run_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "ask_runs_open_created_idx" ON "ask_runs" USING btree ("created_at") WHERE finished_at IS NULL;