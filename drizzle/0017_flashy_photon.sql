CREATE TABLE IF NOT EXISTS "policy_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"adult_attested" boolean NOT NULL,
	"privacy_acknowledged" boolean NOT NULL,
	"acceptance_method" text DEFAULT 'first_login_clickwrap' NOT NULL,
	"locale" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_acceptances_user_versions_uq" ON "policy_acceptances" USING btree ("user_id","terms_version","privacy_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policy_acceptances_user_idx" ON "policy_acceptances" USING btree ("user_id");
