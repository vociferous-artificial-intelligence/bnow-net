CREATE TABLE "cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"error" text,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_idx" ON "cron_runs" USING btree ("job","started_at");