CREATE TABLE "telegram_channel_state" (
	"channel" text PRIMARY KEY NOT NULL,
	"peer_id" text,
	"access_hash" text,
	"last_message_id" integer DEFAULT 0 NOT NULL,
	"backfill_min_id" integer,
	"backfill_done" boolean DEFAULT false NOT NULL,
	"resolve_fails" integer DEFAULT 0 NOT NULL,
	"next_resolve_at" timestamp with time zone,
	"last_fetch_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
-- Cross-adapter dedupe pre-filter support: the MTProto adapter checks whether a
-- t.me message already entered via the preview scraper (external_id "chan/123",
-- case differs between transports) before inserting. content_hash cannot catch
-- this — the adapter name is part of the hash.
CREATE INDEX IF NOT EXISTS "raw_documents_external_id_lower_idx"
  ON "raw_documents" (lower("external_id")) WHERE "external_id" IS NOT NULL;
