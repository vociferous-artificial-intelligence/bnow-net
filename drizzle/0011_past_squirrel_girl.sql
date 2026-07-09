CREATE TABLE "doc_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_document_id" integer NOT NULL,
	"track" text NOT NULL,
	"extractor_version" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text_en" text NOT NULL,
	"quote_orig" text,
	"claim_type" text DEFAULT 'factual' NOT NULL,
	"hedging" "hedging" DEFAULT 'unknown' NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_hint" text,
	"claim_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_dedup" (
	"raw_document_id" integer PRIMARY KEY NOT NULL,
	"canonical_doc_id" integer NOT NULL,
	"method" text NOT NULL,
	"score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_map_state" (
	"raw_document_id" integer NOT NULL,
	"track" text NOT NULL,
	"extractor_version" text NOT NULL,
	"claim_count" integer DEFAULT 0 NOT NULL,
	"mapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_map_state_raw_document_id_track_extractor_version_pk" PRIMARY KEY("raw_document_id","track","extractor_version")
);
--> statement-breakpoint
ALTER TABLE "doc_claims" ADD CONSTRAINT "doc_claims_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_dedup" ADD CONSTRAINT "doc_dedup_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_dedup" ADD CONSTRAINT "doc_dedup_canonical_doc_id_raw_documents_id_fk" FOREIGN KEY ("canonical_doc_id") REFERENCES "public"."raw_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_map_state" ADD CONSTRAINT "doc_map_state_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_claims_doc_track_version_ordinal_idx" ON "doc_claims" USING btree ("raw_document_id","track","extractor_version","ordinal");--> statement-breakpoint
CREATE INDEX "doc_claims_track_date_idx" ON "doc_claims" USING btree ("track","claim_date");--> statement-breakpoint
CREATE INDEX "doc_dedup_canonical_idx" ON "doc_dedup" USING btree ("canonical_doc_id");--> statement-breakpoint
CREATE INDEX "doc_map_state_track_version_idx" ON "doc_map_state" USING btree ("track","extractor_version");