ALTER TABLE itest_mig_atomic_probe ADD COLUMN note text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS itest_mig_atomic_probe_note_idx ON itest_mig_atomic_probe (note);
