CREATE TABLE "provider_state" (
	"provider" text PRIMARY KEY NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"est_usd" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_usage_provider_day_idx" ON "provider_usage" USING btree ("provider","day");