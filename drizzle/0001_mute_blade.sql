CREATE TABLE "claim_entities" (
	"claim_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	CONSTRAINT "claim_entities_claim_id_entity_id_pk" PRIMARY KEY("claim_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'person' NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "digests_country_date_idx";--> statement-breakpoint
ALTER TABLE "digests" ADD COLUMN "track" text DEFAULT 'military' NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_entities" ADD CONSTRAINT "claim_entities_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_entities" ADD CONSTRAINT "claim_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_entities_entity_idx" ON "claim_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_kind_name_idx" ON "entities" USING btree ("kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "digests_country_date_track_idx" ON "digests" USING btree ("country_id","digest_date","track");