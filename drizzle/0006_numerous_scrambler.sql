CREATE TABLE "ask_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"question" text NOT NULL,
	"provider" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ask_usage_email_created_idx" ON "ask_usage" USING btree ("user_email","created_at");--> statement-breakpoint
CREATE INDEX "ask_usage_created_idx" ON "ask_usage" USING btree ("created_at");