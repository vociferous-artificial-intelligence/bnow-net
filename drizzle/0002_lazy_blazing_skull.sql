CREATE TABLE "watched_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"agency" text NOT NULL,
	"url" text NOT NULL,
	"cadence_days" integer DEFAULT 30 NOT NULL,
	"baseline_status" text DEFAULT 'live' NOT NULL,
	"note" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_seen_period" text,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_series_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "watched_series_agency_idx" ON "watched_series" USING btree ("agency");