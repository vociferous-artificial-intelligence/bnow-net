CREATE TABLE "source_theater_stats" (
	"source_id" integer NOT NULL,
	"theater" text NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"first_cited_report_date" date,
	"last_cited_report_date" date,
	"hedging_confirmed" integer DEFAULT 0 NOT NULL,
	"hedging_claimed" integer DEFAULT 0 NOT NULL,
	"hedging_unverified" integer DEFAULT 0 NOT NULL,
	"hedging_assessed" integer DEFAULT 0 NOT NULL,
	"hedging_unknown" integer DEFAULT 0 NOT NULL,
	"reliability_score" double precision,
	"decayed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "source_theater_stats_source_id_theater_pk" PRIMARY KEY("source_id","theater")
);
--> statement-breakpoint
ALTER TABLE "source_theater_stats" ADD CONSTRAINT "source_theater_stats_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_theater_stats_theater_idx" ON "source_theater_stats" USING btree ("theater");