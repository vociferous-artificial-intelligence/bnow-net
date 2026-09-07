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

describe("migration 0030 — conflict validation observations (append-only)", () => {
  const statementsOf = (file: string) =>
    readFileSync(join(DIR, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

  const file = () => {
    const f = readdirSync(DIR).find((n) => n.startsWith("0030_"));
    expect(f).toBeTruthy();
    return f!;
  };

  it("exists, is purely additive (one new table + its indexes/FKs), and keeps 9999 last", () => {
    const f = file();
    for (const stmt of statementsOf(f)) {
      expect(stmt).toMatch(
        /^(CREATE TABLE "conflict_validation_observations"|CREATE (UNIQUE )?INDEX "conflict_validation_observations_[a-z_]+_idx" ON "conflict_validation_observations"|ALTER TABLE "conflict_validation_observations" ADD CONSTRAINT)/,
      );
      // the FK's default referential actions are the ONLY place drizzle-kit
      // spells those words (the 0028 pattern) — strip before the scan
      const scanned = stmt.replace(/ON DELETE no action ON UPDATE no action/g, "");
      expect(scanned).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b|\bINSERT\b/i);
    }
    expect(f < "9999_claim_source_trigger.sql").toBe(true);
  });

  // "every column is id / number / enum / instant / day / key / version /
  // jsonb-or-id-array" (PLAN-WS-3 §3.1b). The table below is EXHAUSTIVE in both
  // directions: a column the migration adds without an entry here fails, and an
  // entry with no column fails. A prose column has no kind to declare, so it
  // cannot be added quietly.
  const COLUMN_KINDS: Record<string, keyof typeof KIND_TYPE> = {
    id: "id",
    conflict_id: "enum",
    reference_edition_id: "id",
    series: "key",
    report_date: "day",
    edition_key: "key",
    evaluation_kind: "enum",
    contributing_digest_ids: "id-array",
    result: "jsonb",
    unit_attribution: "jsonb",
    matcher_rung: "enum",
    matcher_model: "version",
    votes_k: "number",
    dispatch: "jsonb",
    methodology_epoch: "version",
    lane_taxonomy_version: "version",
    evidence_policy_version: "version",
    lane_classifier_version: "version",
    actor_roster_version: "version",
    scope_version: "version",
    gazetteer_version: "version",
    unit_flags_version: "version",
    edition_norm_version: "version",
    daily_final_policy: "version",
    extractor_versions: "version-array",
    registry_version: "version",
    window_end_source: "enum",
    run_group_key: "key",
    cron_run_id: "id",
    observed_at: "instant",
  };

  const KIND_TYPE = {
    id: /^(serial PRIMARY KEY NOT NULL$|integer\b)/,
    number: /^integer\b/,
    enum: /^text\b/,
    key: /^text\b/,
    version: /^text\b/,
    day: /^date\b/,
    instant: /^timestamp with time zone\b/,
    jsonb: /^jsonb\b/,
    "id-array": /^integer\[\]/,
    "version-array": /^text\[\]/,
  } as const;

  it("declares only columns of an allowed kind, and no others", () => {
    const create = statementsOf(file()).find((s) => s.startsWith("CREATE TABLE"))!;
    const body = create.slice(create.indexOf("(") + 1);
    const columns = new Map<string, string>();
    for (const line of body.split("\n")) {
      const m = /^\s*"([a-z_]+)"\s+(.*?),?$/.exec(line);
      if (m && !line.trimStart().startsWith("CONSTRAINT")) columns.set(m[1], m[2].trim());
    }
    expect([...columns.keys()].sort()).toEqual(Object.keys(COLUMN_KINDS).sort());
    for (const [name, type] of columns) {
      expect(type, `${name} (${COLUMN_KINDS[name]})`).toMatch(KIND_TYPE[COLUMN_KINDS[name]]);
    }
    // enum columns are enums because a CHECK bounds them
    for (const [name, kind] of Object.entries(COLUMN_KINDS)) {
      if (kind !== "enum") continue;
      expect(create).toMatch(
        new RegExp(`CONSTRAINT "conflict_validation_observations_${name}[a-z_]*_check" CHECK`),
      );
    }
  });

  it("is APPEND-ONLY: the only unique key is the per-cron-run duplicate guard", () => {
    const statements = statementsOf(file());
    const uniques = statements.filter((s) => s.startsWith("CREATE UNIQUE INDEX"));
    expect(uniques).toHaveLength(1);
    // C6 = (b): keyed on the cron invocation as well, so repeated runs of the
    // same day APPEND. A unique key on (conflict_id, reference_edition_id)
    // alone would destroy the soak's across-run variance instrument.
    expect(uniques[0]).toContain(`("conflict_id","reference_edition_id","cron_run_id")`);
    expect(uniques[0]).toMatch(/WHERE cron_run_id IS NOT NULL;?$/);
    expect(uniques[0]).not.toMatch(/\("conflict_id","reference_edition_id"\)/);
    // the two read indexes the plan specifies
    const idx = statements.filter((s) => s.startsWith("CREATE INDEX")).join("\n");
    expect(idx).toContain(`"conflict_id","report_date" DESC NULLS LAST,"observed_at" DESC NULLS LAST`);
    expect(idx).toContain(`"conflict_validation_observations_run_group_idx"`);
    expect(idx).toContain(`("run_group_key")`);
  });

  it("binds the observation to a durable edition and to its ruling-10 cron row", () => {
    const fks = statementsOf(file()).filter((s) => s.includes("FOREIGN KEY"));
    expect(fks).toHaveLength(2);
    expect(fks.join("\n")).toContain(
      `FOREIGN KEY ("reference_edition_id") REFERENCES "public"."benchmark_report_editions"("id")`,
    );
    expect(fks.join("\n")).toContain(
      `FOREIGN KEY ("cron_run_id") REFERENCES "public"."cron_runs"("id")`,
    );
    // deleting a scored edition or its cron row must BLOCK, never cascade an
    // observation away nor null its provenance
    for (const fk of fks) expect(fk).not.toMatch(/ON DELETE (cascade|set null)/i);
  });

  it("adds no prose column and touches no frozen table (ruling 1, design §4 item 7)", () => {
    const sql = readFileSync(join(DIR, file()), "utf8");
    expect(sql).not.toMatch(/"(title|text|summary|body|prose|takeaway|quote|excerpt)"/);
    for (const table of [
      "isw_reports",
      "source_citations",
      "sources",
      "source_theater_stats",
      "validation_runs",
      "benchmark_report_editions",
      "benchmark_series_days",
      "cron_runs",
      "runtime_logs",
    ]) {
      expect(sql).not.toMatch(new RegExp(`(ALTER|DROP) TABLE "${table}"`));
    }
  });
});
