CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."country_status" AS ENUM('active', 'scaffolded', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."digest_status" AS ENUM('pending', 'generated', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hedging" AS ENUM('confirmed', 'claimed', 'unverified', 'assessed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('telegram', 'x', 'state_media', 'independent_media', 'gov', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'decayed', 'dead');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "claim_sources" (
	"claim_id" integer NOT NULL,
	"raw_document_id" integer NOT NULL,
	CONSTRAINT "claim_sources_claim_id_raw_document_id_pk" PRIMARY KEY("claim_id","raw_document_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"digest_id" integer,
	"event_id" integer,
	"text" text NOT NULL,
	"claim_type" text DEFAULT 'factual' NOT NULL,
	"hedging" "hedging" DEFAULT 'unknown' NOT NULL,
	"confidence" double precision,
	"claim_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"iso2" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "country_status" DEFAULT 'scaffolded' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_iso2_unique" UNIQUE("iso2"),
	CONSTRAINT "countries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"digest_date" date NOT NULL,
	"status" "digest_status" DEFAULT 'pending' NOT NULL,
	"structured" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_md" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"event_date" date NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"cluster_key" text,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "isw_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"report_date" date NOT NULL,
	"title" text,
	"fetched_at" timestamp with time zone,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"endnote_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"interval" "plan_interval" NOT NULL,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"adapter" text NOT NULL,
	"source_id" integer,
	"external_id" text,
	"url" text,
	"title" text,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"lang" text,
	"country_iso2" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(1536),
	"processed" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"raw_url" text NOT NULL,
	"endnote_index" integer,
	"hedging" "hedging" DEFAULT 'unknown' NOT NULL,
	"hedging_cue" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"domain" text NOT NULL,
	"platform" "platform" DEFAULT 'other' NOT NULL,
	"name" text,
	"country_id" integer,
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
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribe_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"plan_code" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"digest_id" integer NOT NULL,
	"isw_report_id" integer NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"coverage_pct" double precision,
	"unsupported_claim_rate" double precision,
	"timeliness_hours" double precision,
	"divergences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_documents" ADD CONSTRAINT "raw_documents_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_citations" ADD CONSTRAINT "source_citations_report_id_isw_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."isw_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_citations" ADD CONSTRAINT "source_citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribe_intents" ADD CONSTRAINT "subscribe_intents_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_isw_report_id_isw_reports_id_fk" FOREIGN KEY ("isw_report_id") REFERENCES "public"."isw_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_sources_doc_idx" ON "claim_sources" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "claims_country_date_idx" ON "claims" USING btree ("country_id","claim_date");--> statement-breakpoint
CREATE INDEX "claims_digest_idx" ON "claims" USING btree ("digest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digests_country_date_idx" ON "digests" USING btree ("country_id","digest_date");--> statement-breakpoint
CREATE INDEX "events_country_date_idx" ON "events" USING btree ("country_id","event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "isw_reports_url_idx" ON "isw_reports" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "isw_reports_date_idx" ON "isw_reports" USING btree ("report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_documents_hash_idx" ON "raw_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_documents_adapter_idx" ON "raw_documents" USING btree ("adapter");--> statement-breakpoint
CREATE INDEX "raw_documents_country_idx" ON "raw_documents" USING btree ("country_iso2");--> statement-breakpoint
CREATE INDEX "raw_documents_published_idx" ON "raw_documents" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "raw_documents_processed_idx" ON "raw_documents" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "source_citations_report_idx" ON "source_citations" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "source_citations_source_idx" ON "source_citations" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_citations_dedupe_idx" ON "source_citations" USING btree ("report_id","raw_url","endnote_index");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_canonical_url_idx" ON "sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "sources_domain_idx" ON "sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sources_platform_idx" ON "sources" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_runs_digest_report_idx" ON "validation_runs" USING btree ("digest_id","isw_report_id");
--> statement-breakpoint
-- TRACEABILITY INVARIANT: a claim cannot exist without at least one source document link.
-- Deferred constraint trigger: fires at COMMIT, so claim + claim_sources inserts in one
-- transaction succeed; a bare claim insert fails.
CREATE OR REPLACE FUNCTION enforce_claim_has_source() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM claim_sources WHERE claim_id = NEW.id) THEN
    RAISE EXCEPTION 'claim % has no source documents (traceability invariant)', NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_must_have_source
  AFTER INSERT ON claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_claim_has_source();
