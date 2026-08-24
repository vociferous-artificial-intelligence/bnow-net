# DISPOSABLE integration-test SQL — never migrations

Every `.sql` file in this directory is **disposable test DDL**: integration
tests (`src/integration/*.itest.ts`) execute it against a throwaway Neon
branch fork and drop everything it creates. Nothing here is applied to
production, nothing here is a numbered Drizzle migration, and nothing here
edits the migration journal (AGENTS.md ruling 5; the conflict-evaluations
workstream creates NO numbered migration — contract §12).

The REAL forward migration for these shapes is generated later, on the
operator-selected integration base, once all concurrent schema work is
known. Its exact intended operations are recorded in
`docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md`. Final migration
uniqueness/idempotency proof REMAINS that later integration gate —
disposable SQL cannot certify it.

| File | Used by | Purpose |
|---|---|---|
| `conflict-benchmark-reports.sql` | `conflict-reference-repo.itest.ts` | provider-neutral benchmark report editions + series day-status tables (schema option 3 of the design doc) |
