CREATE TABLE "ask_answer_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"cache_key" text NOT NULL,
	"corpus_version" text NOT NULL,
	"question" text NOT NULL,
	"result" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ask_answer_cache_user_key_idx" ON "ask_answer_cache" USING btree ("user_email","cache_key");--> statement-breakpoint
CREATE INDEX "ask_answer_cache_created_idx" ON "ask_answer_cache" USING btree ("created_at");