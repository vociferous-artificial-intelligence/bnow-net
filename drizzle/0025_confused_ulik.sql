CREATE TABLE "ask_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ask_sessions_user_idx" ON "ask_sessions" USING btree ("user_email","last_active_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_turns_session_seq_idx" ON "ask_turns" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "ask_turns_run_idx" ON "ask_turns" USING btree ("run_id");