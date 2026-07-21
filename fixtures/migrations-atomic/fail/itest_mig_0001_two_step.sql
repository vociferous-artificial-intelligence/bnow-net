ALTER TABLE itest_mig_atomic_probe ADD COLUMN note text;--> statement-breakpoint
SELECT * FROM itest_mig_definitely_missing_table;
