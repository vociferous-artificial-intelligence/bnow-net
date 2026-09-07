CREATE TABLE "conflict_validation_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"conflict_id" text NOT NULL,
	"reference_edition_id" integer NOT NULL,
	"series" text NOT NULL,
	"report_date" date NOT NULL,
	"edition_key" text NOT NULL,
	"evaluation_kind" text NOT NULL,
	"contributing_digest_ids" integer[] DEFAULT '{}' NOT NULL,
	"result" jsonb NOT NULL,
	"unit_attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matcher_rung" text NOT NULL,
	"matcher_model" text,
	"votes_k" integer,
	"dispatch" jsonb,
	"methodology_epoch" text NOT NULL,
	"lane_taxonomy_version" text NOT NULL,
	"evidence_policy_version" text NOT NULL,
	"lane_classifier_version" text NOT NULL,
	"actor_roster_version" text NOT NULL,
	"scope_version" text NOT NULL,
	"gazetteer_version" text NOT NULL,
	"unit_flags_version" text NOT NULL,
	"edition_norm_version" text NOT NULL,
	"daily_final_policy" text NOT NULL,
	"extractor_versions" text[] DEFAULT '{}' NOT NULL,
	"registry_version" text NOT NULL,
	"window_end_source" text NOT NULL,
	"run_group_key" text NOT NULL,
	"cron_run_id" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conflict_validation_observations_conflict_id_check" CHECK ("conflict_validation_observations"."conflict_id" ~ '^[a-z_]+$'),
	CONSTRAINT "conflict_validation_observations_evaluation_kind_check" CHECK ("conflict_validation_observations"."evaluation_kind" IN ('operational_cutoff', 'at_publication', 'finalized', 'retrospective')),
	CONSTRAINT "conflict_validation_observations_matcher_rung_check" CHECK ("conflict_validation_observations"."matcher_rung" IN ('llm-majority', 'llm', 'keyword')),
	CONSTRAINT "conflict_validation_observations_window_end_source_check" CHECK ("conflict_validation_observations"."window_end_source" IN ('cutoff', 'published', 'report_day'))
);
--> statement-breakpoint
ALTER TABLE "conflict_validation_observations" ADD CONSTRAINT "conflict_validation_observations_reference_edition_id_benchmark_report_editions_id_fk" FOREIGN KEY ("reference_edition_id") REFERENCES "public"."benchmark_report_editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_validation_observations" ADD CONSTRAINT "conflict_validation_observations_cron_run_id_cron_runs_id_fk" FOREIGN KEY ("cron_run_id") REFERENCES "public"."cron_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_validation_observations_run_idx" ON "conflict_validation_observations" USING btree ("conflict_id","reference_edition_id","cron_run_id") WHERE cron_run_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conflict_validation_observations_conflict_day_idx" ON "conflict_validation_observations" USING btree ("conflict_id","report_date" DESC NULLS LAST,"observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conflict_validation_observations_run_group_idx" ON "conflict_validation_observations" USING btree ("run_group_key");