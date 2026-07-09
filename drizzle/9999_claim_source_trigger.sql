-- TRACEABILITY INVARIANT, re-asserted. The `claim_must_have_source` constraint
-- trigger lives only in the hand-written 0000 migration; schema.ts carries it as a
-- comment, not a Drizzle object. A fresh `drizzle-kit generate` that ever replaces
-- the curated 0000 would therefore drop the invariant silently
-- (PIPELINE-AUDIT-2026-07 §5d D1). This migration is idempotent and runs last, so
-- the trigger survives any regeneration of the table DDL above it.
--
-- Deliberately NO `DROP TRIGGER ... ; CREATE TRIGGER ...`: scripts/migrate.ts
-- executes statements one at a time, outside a transaction, so a drop/recreate
-- pair would leave a window in which a live digest cron could commit a claim with
-- no source. CREATE OR REPLACE FUNCTION is atomic, and the trigger is only created
-- when absent.
--
-- Numbered 9999 on purpose. scripts/migrate.ts applies drizzle/*.sql in filename
-- order, so this always runs after whatever table DDL drizzle-kit emits; and
-- drizzle-kit numbers new migrations from meta/_journal.json, so it can never
-- collide with this name the way a hand-written 0010 would.
CREATE OR REPLACE FUNCTION enforce_claim_has_source() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM claim_sources WHERE claim_id = NEW.id) THEN
    RAISE EXCEPTION 'claim % has no source documents (traceability invariant)', NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'claim_must_have_source'
      AND tgrelid = 'public.claims'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE CONSTRAINT TRIGGER claim_must_have_source
      AFTER INSERT ON claims
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_claim_has_source();
  END IF;
END $$;
