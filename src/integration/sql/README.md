# DISPOSABLE integration-test SQL — never migrations

Every `.sql` file in this directory is **disposable test DDL**: integration
tests (`src/integration/*.itest.ts`) execute it against a throwaway Neon
branch fork and drop everything it creates. Nothing here is applied to
production, nothing here is a numbered Drizzle migration, and nothing here
edits the migration journal (AGENTS.md ruling 5).

**This directory is currently empty of SQL.** Its one file,
`conflict-benchmark-reports.sql` (the conflict reference-report edition and
series-day tables, schema option 3 of
`docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md`), was promoted into
`src/db/schema.ts` + `drizzle/0028_*.sql` and DELETED: keeping a second,
drifting copy of a shape that now has a durable migration would be worse than
removing it. `src/integration/conflict-reference-repo.itest.ts` applies the real
migrations with `scripts/migrations-lib.ts` `runMigrations()` instead — which is
also the apply-once/reapply-safe proof the design recorded as a later gate.

The README stays as the standing rule for any future disposable DDL: put it
here, name it in a table below, and never let it become a migration by
accident.
