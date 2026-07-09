import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The claim -> source traceability invariant is enforced by a constraint trigger
// that Drizzle does not model: schema.ts carries it as a comment, and it was born
// in the hand-written 0000 migration. A `drizzle-kit generate` that ever replaced
// that curated file would drop the invariant with no error anywhere
// (PIPELINE-AUDIT-2026-07 §5d D1). These tests fail loudly if that happens.

const DIR = join(process.cwd(), "drizzle");

/** Migration SQL with `--` comments stripped, so a commented-out trigger cannot
 *  satisfy any assertion below. */
function migrationSql(): { file: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(join(DIR, file), "utf8").replace(/^\s*--.*$/gm, ""),
    }));
}

describe("claim_must_have_source survives schema regeneration", () => {
  it("finds migration files at all (guards the guard)", () => {
    expect(migrationSql().length).toBeGreaterThan(1);
  });

  it("some migration defines enforce_claim_has_source()", () => {
    const hits = migrationSql().filter((m) =>
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.)?enforce_claim_has_source/i.test(m.sql),
    );
    expect(hits.map((h) => h.file)).toContain("9999_claim_source_trigger.sql");
  });

  it("some migration creates the constraint trigger on claims", () => {
    const hits = migrationSql().filter((m) =>
      /CREATE\s+CONSTRAINT\s+TRIGGER\s+claim_must_have_source/i.test(m.sql),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.file)).toContain("9999_claim_source_trigger.sql");
  });

  it("the trigger is deferred to COMMIT, so claim+source land in one transaction", () => {
    const sql = migrationSql().find((m) => m.file === "9999_claim_source_trigger.sql")!.sql;
    expect(sql).toMatch(/AFTER\s+INSERT\s+ON\s+claims/i);
    expect(sql).toMatch(/DEFERRABLE\s+INITIALLY\s+DEFERRED/i);
    expect(sql).toMatch(/FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+enforce_claim_has_source/i);
  });

  it("re-asserts the trigger without dropping it", () => {
    // migrate.ts runs statements outside a transaction: a DROP/CREATE pair would
    // briefly leave live crons free to commit an unsourced claim.
    const sql = migrationSql().find((m) => m.file === "9999_claim_source_trigger.sql")!.sql;
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it("runs last, after any table DDL drizzle-kit emits", () => {
    const files = migrationSql().map((m) => m.file);
    expect(files[files.length - 1]).toBe("9999_claim_source_trigger.sql");
  });
});
