CREATE TABLE "benchmark_report_editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"provider" text NOT NULL,
	"edition_key" text NOT NULL,
	"edition_label" text NOT NULL,
	"report_date" date NOT NULL,
	"canonical_url" text,
	"norm_version" text,
	"scope_version" text NOT NULL,
	"cutoff_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"cutoff_treatment" text NOT NULL,
	"published_treatment" text NOT NULL,
	"designated_final" boolean,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"isw_report_id" integer,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anchor_journal" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "benchmark_report_editions_key_shape" CHECK ("benchmark_report_editions"."edition_key" = "benchmark_report_editions"."series" || ':' || to_char("benchmark_report_editions"."report_date", 'YYYY-MM-DD') || ':' || "benchmark_report_editions"."edition_label"),
	CONSTRAINT "benchmark_report_editions_cutoff_consistent" CHECK (("benchmark_report_editions"."cutoff_treatment" = 'present') = ("benchmark_report_editions"."cutoff_at" IS NOT NULL)),
	CONSTRAINT "benchmark_report_editions_published_consistent" CHECK (("benchmark_report_editions"."published_treatment" = 'present') = ("benchmark_report_editions"."published_at" IS NOT NULL)),
	CONSTRAINT "benchmark_report_editions_label_shape" CHECK ("benchmark_report_editions"."edition_label" ~ '^[a-z0-9][a-z0-9-]*$'),
	CONSTRAINT "benchmark_report_editions_isw_url" CHECK ("benchmark_report_editions"."provider" <> 'isw' OR "benchmark_report_editions"."canonical_url" IS NOT NULL),
	CONSTRAINT "benchmark_report_editions_cutoff_treatment_check" CHECK ("benchmark_report_editions"."cutoff_treatment" IN ('present', 'missing', 'malformed_treated_as_missing')),
	CONSTRAINT "benchmark_report_editions_published_treatment_check" CHECK ("benchmark_report_editions"."published_treatment" IN ('present', 'missing', 'malformed_treated_as_missing')),
	CONSTRAINT "benchmark_report_editions_parse_status_check" CHECK ("benchmark_report_editions"."parse_status" IN ('pending', 'parsed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "benchmark_series_days" (
	"series" text NOT NULL,
	"report_date" date NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "benchmark_series_days_series_report_date_pk" PRIMARY KEY("series","report_date"),
	CONSTRAINT "benchmark_series_days_status_check" CHECK ("benchmark_series_days"."status" IN ('publication_gap', 'probe_failed'))
);
--> statement-breakpoint
ALTER TABLE "benchmark_report_editions" ADD CONSTRAINT "benchmark_report_editions_isw_report_id_isw_reports_id_fk" FOREIGN KEY ("isw_report_id") REFERENCES "public"."isw_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_report_editions_key_idx" ON "benchmark_report_editions" USING btree ("edition_key");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_report_editions_url_idx" ON "benchmark_report_editions" USING btree ("canonical_url") WHERE canonical_url IS NOT NULL;--> statement-breakpoint
CREATE INDEX "benchmark_report_editions_series_date_idx" ON "benchmark_report_editions" USING btree ("series","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_report_editions_final_idx" ON "benchmark_report_editions" USING btree ("series","report_date") WHERE designated_final;