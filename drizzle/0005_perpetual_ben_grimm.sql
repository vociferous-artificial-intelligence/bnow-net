CREATE TABLE "entity_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_entity_id" integer NOT NULL,
	"to_entity_id" integer NOT NULL,
	"relation" text NOT NULL,
	"source" text NOT NULL,
	"since" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_links_key_idx" ON "entity_links" USING btree ("from_entity_id","to_entity_id","relation","source");--> statement-breakpoint
CREATE INDEX "entity_links_from_idx" ON "entity_links" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "entity_links_to_idx" ON "entity_links" USING btree ("to_entity_id");