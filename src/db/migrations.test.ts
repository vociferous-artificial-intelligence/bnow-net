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

describe("migration 0027 — billing policy/eligibility metadata (release hardening)", () => {
  it("exists, is purely additive (ADD COLUMN only), and defaults eligibility to FALSE", () => {
    const file = readdirSync(DIR).find((f) => f.startsWith("0027_"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(DIR, file!), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^ALTER TABLE "ask_runs" ADD COLUMN/);
      expect(stmt).not.toMatch(/DROP|DELETE|TRUNCATE|UPDATE/i);
    }
    expect(sql).toContain(`"billing_policy" text`);
    expect(sql).toContain(`"billing_eligible" boolean DEFAULT false NOT NULL`);
    // filename ordering keeps 9999 last
    expect(file! < "9999_claim_source_trigger.sql").toBe(true);
  });
});

describe("migration 0028 — benchmark report editions + series days (conflict reference reports)", () => {
  it("exists, is purely additive (new tables/indexes only), and keeps 9999 last", () => {
    const file = readdirSync(DIR).find((f) => f.startsWith("0028_"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(DIR, file!), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const stmt of statements) {
      // only three shapes may appear: CREATE TABLE for the two NEW tables,
      // CREATE [UNIQUE] INDEX on them, and the ADD CONSTRAINT that attaches the
      // isw_reports FK to the NEW table
      expect(stmt).toMatch(
        /^(CREATE TABLE "benchmark_(report_editions|series_days)"|CREATE (UNIQUE )?INDEX "benchmark_report_editions_[a-z_]+_idx" ON "benchmark_report_editions"|ALTER TABLE "benchmark_report_editions" ADD CONSTRAINT)/,
      );
      // drizzle-kit spells the FK's default referential actions as
      // "ON DELETE no action ON UPDATE no action" — that clause is the ONLY
      // place those words may appear, so strip it before the destructive scan
      const scanned = stmt.replace(/ON DELETE no action ON UPDATE no action/g, "");
      expect(scanned).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b|\bINSERT\b/i);
    }
    // the two tables and the four indexes the design specifies (§4 items 1-6)
    expect(sql).toContain(`CREATE TABLE "benchmark_report_editions"`);
    expect(sql).toContain(`CREATE TABLE "benchmark_series_days"`);
    for (const idx of ["key_idx", "url_idx", "series_date_idx", "final_idx"]) {
      expect(sql).toContain(`"benchmark_report_editions_${idx}"`);
    }
    // the two partial indexes are what let same-date editions coexist while at
    // most one is designated final
    expect(sql).toContain(`("canonical_url") WHERE canonical_url IS NOT NULL`);
    expect(sql).toContain(`("series","report_date") WHERE designated_final`);
    // ruling 1: no prose column — the only free-text-ish columns are URLs, keys,
    // enums, versions and the two bounded jsonb audit columns
    expect(sql).not.toMatch(/"(title|text|summary|body|prose|takeaway)"/);
    // the frozen registry tables are not touched at all (design §4 item 7)
    for (const table of [
      "isw_reports",
      "source_citations",
      "sources",
      "source_theater_stats",
      "validation_runs",
    ]) {
      expect(sql).not.toMatch(new RegExp(`(ALTER|DROP) TABLE "${table}"`));
    }
    // filename ordering keeps 9999 last
    expect(file! < "9999_claim_source_trigger.sql").toBe(true);
  });
});
