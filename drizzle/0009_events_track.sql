ALTER TABLE "events" ADD COLUMN "track" text DEFAULT 'military' NOT NULL;--> statement-breakpoint
-- Backfill: an event belongs to the track of the digest that owns its claims.
-- Every event is inserted fresh by one generateDigest() call, so all of an
-- event's claims share a digest; min() only makes the choice deterministic if
-- that ever stopped holding. Events with no claims keep the 'military' default
-- (the deferred claim_must_have_source trigger means none should exist).
UPDATE "events" e SET "track" = sub.track
FROM (
  SELECT c.event_id, min(d.track) AS track
  FROM claims c JOIN digests d ON d.id = c.digest_id
  WHERE c.event_id IS NOT NULL
  GROUP BY c.event_id
) sub
WHERE sub.event_id = e.id AND e.track <> sub.track;
