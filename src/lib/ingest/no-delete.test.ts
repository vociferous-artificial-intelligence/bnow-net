import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// PRESERVATION ASSERTION (WS-7.6; docs/RETENTION-AND-PRESERVATION.md).
//
// ICD 206 requires that the sources behind a disseminated analytic product stay retrievable,
// and ICS 206-01 puts a one-year floor under it for dynamic sources. BNOW meets both by never
// deleting a source document — a property that held by accident of design and that a single
// future cleanup script could end silently. This scan makes it a gate: no production module
// under src/ and no script under scripts/ may delete from `raw_documents`.
//
// Shape copied from src/lib/evals/isolation.test.ts — the same src/ + scripts/ walk with a
// per-path allowlist and a rationale beside each exemption. Sibling precedents:
// src/lib/llm/import-graph.test.ts, src/db/migrations.test.ts (per-statement destructive-SQL
// ban over drizzle/).
//
// EXEMPTIONS, by path and named:
//
//  1. `*.itest.ts` — integration tests run against DISPOSABLE Neon fork branches that are
//     created and deleted per run (scripts/test-integration.sh), so their seed teardown never
//     touches production data. The pattern is exempt, but the CURRENT set of itest deleters is
//     also pinned by name below: a tenth deleter fails this test until someone adds it, so a
//     new deletion cannot arrive unread.
//  2. `scripts/cleanup-stub-data.ts` — the only non-test deleter in the repository. It is a
//     truth-in-UI cleanup (standing ruling 3), STUB_LIKE-guarded and transactional: it removes
//     fixture rows that must never render as fact. It is a manual operator script on no
//     schedule, and it is a ruling-3 obligation, not a retention decision.
//  3. this file — it necessarily contains the forbidden patterns as regex sources.
//
// TO CHANGE THE POLICY: see docs/RETENTION-AND-PRESERVATION.md §6. Amend the document and this
// allowlist in the same commit; do not weaken the patterns.

const SRC_DIR = join(__dirname, "..", "..");
const REPO_ROOT = join(SRC_DIR, "..");
const SCRIPTS_DIR = join(REPO_ROOT, "scripts");

/** SQL deletion of the source-document table, in any spacing or casing. */
const SQL_DELETE_RE = /\bDELETE\s+FROM\s+"?raw_documents"?/i;
/** The drizzle query-builder equivalent. */
const DRIZZLE_DELETE_RE = /\.\s*delete\s*\(\s*rawDocuments\s*\)/;
/** Wholesale removal, which no path has any reason to perform. */
const TRUNCATE_RE = /\bTRUNCATE\b[^;]{0,80}\braw_documents\b/i;

const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["DELETE FROM raw_documents", SQL_DELETE_RE],
  [".delete(rawDocuments)", DRIZZLE_DELETE_RE],
  ["TRUNCATE raw_documents", TRUNCATE_RE],
];

/** Exempt by path, each with its reason in the header above. */
const EXEMPT_SRC = new Set(["lib/ingest/no-delete.test.ts"]);
const EXEMPT_SCRIPTS = new Set(["cleanup-stub-data.ts"]);
const isItest = (rel: string) => /\.itest\.ts$/.test(rel);

/**
 * The integration tests that delete `raw_documents` today, pinned so a NEW one is visible in
 * a diff rather than absorbed by the `*.itest.ts` pattern. Paths are relative to src/.
 */
const KNOWN_ITEST_DELETERS = [
  "integration/ask-events.itest.ts",
  "integration/authz-page-gate.itest.ts",
  "integration/enrich-rescore.itest.ts",
  "integration/hardening.itest.ts",
  "integration/map-batch-error-classification.itest.ts",
  "integration/map-budget-stop.itest.ts",
  "integration/map-flood-bounds.itest.ts",
  "integration/map-remap.itest.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (base: string, f: string) => f.slice(base.length + 1).replace(/\\/g, "/");
const srcFiles = walk(SRC_DIR).map((f) => rel(SRC_DIR, f));
const scriptFiles = walk(SCRIPTS_DIR).map((f) => rel(SCRIPTS_DIR, f));

function hits(base: string, rels: string[]): Array<{ file: string; pattern: string }> {
  const found: Array<{ file: string; pattern: string }> = [];
  for (const r of rels) {
    const src = readFileSync(join(base, r), "utf8");
    for (const [label, re] of FORBIDDEN) if (re.test(src)) found.push({ file: r, pattern: label });
  }
  return found;
}

describe("raw_documents is never deleted by a production path (ICD 206 / ICS 206-01 preservation)", () => {
  it("finds the files it is supposed to scan", () => {
    // a broken walk would make every assertion below vacuously pass
    expect(srcFiles.length).toBeGreaterThan(200);
    expect(scriptFiles.length).toBeGreaterThan(20);
    expect(srcFiles).toContain("lib/ingest/run.ts");
    expect(scriptFiles).toContain("cleanup-stub-data.ts");
  });

  it("no module under src/ deletes source documents, outside the named exemptions", () => {
    const scanned = srcFiles.filter((f) => !EXEMPT_SRC.has(f) && !isItest(f));
    const offenders = hits(SRC_DIR, scanned);
    expect(
      offenders,
      `preservation policy broken — see docs/RETENTION-AND-PRESERVATION.md §6:\n${offenders
        .map((o) => `  src/${o.file} contains ${o.pattern}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("no script deletes source documents, outside the named exemption", () => {
    const scanned = scriptFiles.filter((f) => !EXEMPT_SCRIPTS.has(f));
    const offenders = hits(SCRIPTS_DIR, scanned);
    expect(
      offenders,
      `preservation policy broken — see docs/RETENTION-AND-PRESERVATION.md §6:\n${offenders
        .map((o) => `  scripts/${o.file} contains ${o.pattern}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("the exempted operator script still deletes only STUB_LIKE rows, inside a transaction", () => {
    const src = readFileSync(join(SCRIPTS_DIR, "cleanup-stub-data.ts"), "utf8");
    // the exemption is granted for a ruling-3 cleanup; if the guard goes, so does the reason
    expect(src).toMatch(/DELETE FROM raw_documents WHERE content LIKE \$1/);
    expect(src).toContain("STUB_LIKE");
    expect(src).toContain("BEGIN");
  });

  it("pins the integration tests that delete, so a new one cannot arrive unread", () => {
    const deleting = hits(
      SRC_DIR,
      srcFiles.filter((f) => isItest(f)),
    ).map((o) => o.file);
    expect([...new Set(deleting)].sort()).toEqual([...KNOWN_ITEST_DELETERS].sort());
  });

  it("the ingest library contains no deletion and no archival step at all", () => {
    const ingest = srcFiles.filter((f) => f.startsWith("lib/ingest/"));
    expect(ingest.length).toBeGreaterThan(2);
    for (const f of ingest) {
      if (EXEMPT_SRC.has(f)) continue;
      const src = readFileSync(join(SRC_DIR, f), "utf8");
      // SQL-shaped only: `delete process.env[k]` in config.test.ts is the JS operator,
      // not a deletion of anything durable
      expect(/\bDELETE\s+FROM\b/i.test(src), `src/${f} issues a SQL DELETE`).toBe(false);
      expect(/\.\s*delete\s*\(/.test(src), `src/${f} calls a query-builder delete`).toBe(false);
      // no Wayback-style archival exists; OPEN-TASKS #108 tracks it as design-only, and this
      // pin is what makes §4 item 1 of the policy a fact rather than a recollection
      expect(/web\.archive\.org|archive\.(ph|today)|wayback/i.test(src)).toBe(false);
    }
  });

  it("the Ask retention sweep never reaches source documents or the claim graph", () => {
    const src = readFileSync(join(SRC_DIR, "lib/ask/retention.ts"), "utf8");
    for (const table of ["raw_documents", "claim_sources", "doc_claims", "doc_dedup"]) {
      expect(src.includes(table), `Ask retention must not touch ${table}`).toBe(false);
    }
    // `claims` appears only inside ask_* column/table names, never as the claims table
    expect(/\b(FROM|UPDATE|DELETE\s+FROM|JOIN)\s+claims\b/i.test(src)).toBe(false);
  });
});

describe("the preservation policy document tracks the code", () => {
  const POLICY = readFileSync(join(REPO_ROOT, "docs/RETENTION-AND-PRESERVATION.md"), "utf8");

  it("names both exemptions and the one-year floor", () => {
    expect(POLICY).toContain("scripts/cleanup-stub-data.ts:60");
    expect(POLICY).toContain("no-delete.test.ts");
    expect(POLICY).toContain("one year from the issuance of any product that cites them");
  });

  it("states the count of itest deleters this test pins", () => {
    // if the pinned list grows, the document's inventory sentence is wrong too
    expect(POLICY).toContain(`**${KNOWN_ITEST_DELETERS.length}** \`*.itest.ts\` files`);
  });

  it("states the three caveats that keep the claim honest", () => {
    expect(POLICY).toContain("published claims ARE replaced on regeneration");
    expect(POLICY).toContain("a dedup key over a prefix, not an integrity seal");
    expect(POLICY).toContain("snapshot of the preview, not of the post");
  });
});
