import { describe, expect, it } from "vitest";
import type { QueryFn } from "../isw/load";
import {
  ANCHOR_JOURNAL_LIMIT,
  EDITION_URL_INDEX,
  EDITION_MERGE_SELECT,
  EDITION_SELECT,
  EDITION_UPSERT_SQL,
  MERGE_ATTEMPT_LIMIT,
  SqlReferenceReportRepository,
  anchorJournalEntriesFor,
  parseStoredAnchorJournal,
  toIsoDay,
} from "./reference-repo-sql";
import { parseEditionRecord } from "./editions";
import { ConflictDomainError } from "./errors";

// The SQL backend casts report_date::text in every SELECT, so the normal
// input is the literal yyyy-mm-dd string; the Date branch is defense in
// depth against an uncast read (Gate-2 MAJOR: node-postgres and
// @neondatabase/serverless parse a Postgres `date` into a JS Date at LOCAL
// midnight, and reading that back through toISOString() shifts the day
// backward on any host east of UTC).

describe("EDITION_SELECT (deployed SELECT list)", () => {
  it("casts report_date::text so a western-TZ dev host cannot mask a regression", () => {
    // A bare `date` read only fails east of UTC, so the always-run suite pins
    // the cast itself (Gate-2 re-review NOTE R-2).
    expect(EDITION_SELECT).toContain("report_date::text AS report_date");
  });

  it("the merge path reads the audit journal alongside the record columns", () => {
    expect(EDITION_MERGE_SELECT.startsWith(EDITION_SELECT)).toBe(true);
    expect(EDITION_MERGE_SELECT).toContain("anchor_journal");
  });
});

describe("toIsoDay (driver date parsing is host-TZ-sensitive)", () => {
  it("passes through the ::text-cast yyyy-mm-dd string", () => {
    expect(toIsoDay("2027-07-10")).toBe("2027-07-10");
    expect(toIsoDay("2027-07-10T00:00:00")).toBe("2027-07-10"); // defensive slice
  });

  it("reads a driver-constructed LOCAL-midnight Date via local accessors, correct in any host zone", () => {
    // exactly how the drivers build oid-1082 `date` values: local midnight.
    // toISOString() would render the PRIOR day anywhere east of UTC; the
    // local accessors recover the intended calendar day in every host zone.
    expect(toIsoDay(new Date(2027, 6, 10))).toBe("2027-07-10");
    expect(toIsoDay(new Date(2027, 0, 1))).toBe("2027-01-01"); // year boundary
  });
});

describe("EDITION_URL_INDEX (the name the typed error is keyed on)", () => {
  it("matches the index migration 0028 creates", () => {
    // a rename on one side only would silently turn the typed refusal back into
    // a raw driver error; migrations.test.ts pins the same literal in the SQL
    expect(EDITION_URL_INDEX).toBe("benchmark_report_editions_url_idx");
  });
});

describe("EDITION_UPSERT_SQL (insert + day clear atomicity)", () => {
  it("is ONE statement carrying both the insert and the day-row delete", () => {
    // the design's "wrap the insert + clear pair in ONE transaction" on a
    // transaction-less QueryFn: a data-modifying CTE commits or rolls back as
    // a unit, so a failed insert cannot erase a stored discovery record
    expect(EDITION_UPSERT_SQL).not.toContain(";");
    expect(EDITION_UPSERT_SQL).toMatch(/WITH ins AS \(\s*INSERT INTO benchmark_report_editions/);
    expect(EDITION_UPSERT_SQL).toMatch(/cleared AS \(\s*DELETE FROM benchmark_series_days/);
    expect(EDITION_UPSERT_SQL).toContain("ON CONFLICT (edition_key) DO NOTHING");
  });
});

// ---------------------------------------------------------------------------
// A minimal in-memory stand-in for the two tables. It models only what the
// repository issues: the CTE upsert (unique edition_key + the partial unique
// canonical_url index), the merge SELECT, and the compare-and-swap UPDATE.
// `onRead` lets a test land a concurrent writer between the read and the CAS.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const URL_INDEX = "benchmark_report_editions_url_idx";

class FakeEditionTables {
  readonly rows = new Map<string, Row>();
  readonly days = new Set<string>();
  readonly calls: { sql: string; params: unknown[] }[] = [];
  onRead?: (key: string) => void;

  readonly query: QueryFn = async (sql: string, params: unknown[] = []) => {
    this.calls.push({ sql, params });
    if (sql.includes("INSERT INTO benchmark_report_editions")) return this.upsert(params);
    if (sql.includes("FROM benchmark_report_editions WHERE edition_key")) {
      const key = String(params[0]);
      const row = this.rows.get(key);
      const out = row === undefined ? [] : [{ ...row }];
      this.onRead?.(key);
      return out;
    }
    if (sql.startsWith("UPDATE benchmark_report_editions")) return this.cas(params);
    throw new Error(`FakeEditionTables: unhandled sql ${sql.slice(0, 60)}`);
  };

  private upsert(params: unknown[]): Row[] {
    const [series, provider, key, label, reportDate, url, norm, scope, cutoff, published, ct, pt, df, ps, isw] =
      params;
    let inserted = 0;
    if (!this.rows.has(String(key))) {
      if (url !== null && [...this.rows.values()].some((r) => r.canonical_url === url)) {
        // the partial unique index, as the driver reports it
        throw Object.assign(
          new Error(`duplicate key value violates unique constraint "${URL_INDEX}"`),
          { code: "23505", constraint: URL_INDEX },
        );
      }
      this.rows.set(String(key), {
        series,
        provider,
        edition_key: key,
        edition_label: label,
        report_date: reportDate,
        canonical_url: url,
        norm_version: norm,
        scope_version: scope,
        cutoff_at: cutoff,
        published_at: published,
        cutoff_treatment: ct,
        published_treatment: pt,
        designated_final: df,
        parse_status: ps,
        isw_report_id: isw,
        anchor_journal: [],
      });
      inserted = 1;
    }
    // reached only when the insert did NOT throw — the CTE's all-or-nothing
    // behaviour, modelled
    const cleared = this.days.delete(`${String(series)}|${String(reportDate)}`) ? 1 : 0;
    return [{ inserted, cleared }];
  }

  private cas(params: unknown[]): Row[] {
    const key = String(params[0]);
    const row = this.rows.get(key);
    if (row === undefined) return [];
    const guards: [string, unknown][] = [
      ["canonical_url", params[11]],
      ["norm_version", params[12]],
      ["cutoff_at", params[13]],
      ["published_at", params[14]],
      ["cutoff_treatment", params[15]],
      ["published_treatment", params[16]],
      ["designated_final", params[17]],
      ["parse_status", params[18]],
      ["isw_report_id", params[19]],
    ];
    for (const [col, expected] of guards) {
      if ((row[col] ?? null) !== (expected ?? null)) return []; // lost the race
    }
    Object.assign(row, {
      canonical_url: params[1],
      norm_version: params[2],
      cutoff_at: params[3],
      published_at: params[4],
      cutoff_treatment: params[5],
      published_treatment: params[6],
      designated_final: params[7],
      parse_status: params[8],
      isw_report_id: params[9],
      anchor_journal: JSON.parse(String(params[10])),
    });
    return [{ id: 1 }];
  }
}

const DAY = "2027-07-10";
const CANONICAL_URL =
  "https://understandingwar.org/research/middle-east/iran-update-evening-special-report-july-10-2027/";

function edition(over: Record<string, unknown> = {}) {
  return parseEditionRecord({
    identity: {
      series: "iran_update",
      editionKey: `iran_update:${DAY}:evening`,
      reportDate: DAY,
      cutoffAt: null,
      publishedAt: null,
      scopeVersion: "iran-update-scope-v1",
      ...(over.identity as Record<string, unknown> | undefined),
    },
    provider: "isw",
    canonicalUrl: CANONICAL_URL,
    normVersion: "isw-edition-norm-v1",
    designatedFinal: null,
    cutoffTreatment: "missing",
    publishedTreatment: "missing",
    parseStatus: "pending",
    citationAnchorId: null,
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "identity")),
  });
}

describe("SqlReferenceReportRepository — URL canonicalization before storage", () => {
  it("stores the canonical form of a scheme/www/trailing-slash variant", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    const variant = CANONICAL_URL.replace("https://", "http://www.").replace(/\/$/, "");
    expect(variant).not.toBe(CANONICAL_URL); // the pin is non-vacuous
    expect((await repo.upsertEdition(edition({ canonicalUrl: variant }))).action).toBe("inserted");
    expect(db.rows.get(`iran_update:${DAY}:evening`)!.canonical_url).toBe(CANONICAL_URL);
  });

  it("a variant replay of the SAME edition is `unchanged`, not an identity conflict", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(edition());
    const variant = CANONICAL_URL.replace("https://", "http://WWW.").replace(/\/$/, "");
    const replay = await repo.upsertEdition(edition({ canonicalUrl: variant }));
    expect(replay.action).toBe("unchanged"); // byte-level merge equality holds
    expect(db.rows.size).toBe(1);
  });

  it("a null canonicalUrl (fixture provider) is stored untouched", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(
      edition({ provider: "fixture", canonicalUrl: null, normVersion: null }),
    );
    expect(db.rows.get(`iran_update:${DAY}:evening`)!.canonical_url).toBeNull();
  });

  it("a non-isw provider's URL is stored as given — the table stays provider-neutral", async () => {
    // canonicalizeIswUrl refuses a non-ISW host, so applying it to every
    // provider would make the provider-neutral table ISW-only in practice
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    const other = "https://fixtures.example/reference/iran-update-evening-july-10-2027";
    await repo.upsertEdition(edition({ provider: "fixture", canonicalUrl: other, normVersion: null }));
    expect(db.rows.get(`iran_update:${DAY}:evening`)!.canonical_url).toBe(other);
  });
});

describe("SqlReferenceReportRepository — typed constraint errors", () => {
  it("maps a canonical_url partial-unique violation to edition_url_conflict", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(edition());
    const other = edition({
      identity: { editionKey: `iran_update:${DAY}:morning`, reportDate: DAY },
      normVersion: "isw-edition-norm-v0", // an older-version record: the app-layer
    }); //                                   URL<->key cross-check cannot interpret it
    const err = await repo.upsertEdition(other).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictDomainError);
    expect((err as ConflictDomainError).code).toBe("edition_url_conflict");
    // the index name stays in the message: it is the evidence of WHICH
    // constraint refused the write
    expect((err as Error).message).toContain(URL_INDEX);
  });

  it("a failed insert never clears a stored day-status row (one statement, all or nothing)", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(edition());
    db.days.add(`iran_update|${DAY}`);
    await expect(
      repo.upsertEdition(
        edition({
          identity: { editionKey: `iran_update:${DAY}:morning`, reportDate: DAY },
          normVersion: "isw-edition-norm-v0",
        }),
      ),
    ).rejects.toThrow(ConflictDomainError);
    expect(db.days.has(`iran_update|${DAY}`)).toBe(true);
  });
});

describe("SqlReferenceReportRepository — compare-and-swap merge", () => {
  const parsedCutoff = edition({
    identity: { cutoffAt: `${DAY}T18:00:00Z` },
    cutoffTreatment: "present",
  });
  const parsedPublished = edition({
    identity: { publishedAt: `${DAY}T23:00:00Z` },
    publishedTreatment: "present",
    parseStatus: "parsed",
  });

  it("two writers racing on the same row converge to the UNION of their repairs", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(edition());

    // the "concurrent" writer lands its repair after this writer's read and
    // before its UPDATE — exactly the window an unguarded UPDATE overwrites
    let fired = false;
    db.onRead = () => {
      if (fired) return;
      fired = true;
      const row = db.rows.get(`iran_update:${DAY}:evening`)!;
      row.published_at = `${DAY}T23:00:00.000Z`;
      row.published_treatment = "present";
      row.parse_status = "parsed";
    };

    const result = await repo.upsertEdition(parsedCutoff);
    expect(result.action).toBe("repaired");
    const row = db.rows.get(`iran_update:${DAY}:evening`)!;
    // BOTH repairs survive: the loser re-read and re-merged
    expect(row.cutoff_at).toBe(`${DAY}T18:00:00.000Z`);
    expect(row.published_at).toBe(`${DAY}T23:00:00.000Z`);
    expect(row.parse_status).toBe("parsed");
    expect(db.calls.filter((c) => c.sql.startsWith("UPDATE")).length).toBe(2); // one lost, one won
  });

  it("the guarded UPDATE carries the pre-read values, so a stale merge cannot land", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query);
    await repo.upsertEdition(edition());
    await repo.upsertEdition(parsedCutoff);
    const update = db.calls.find((c) => c.sql.startsWith("UPDATE"))!;
    expect(update.sql).toContain("IS NOT DISTINCT FROM $14"); // cutoff_at guard
    expect(update.params[13]).toBeNull(); // the value the merge was computed from
    expect(update.params[3]).toBe(`${DAY}T18:00:00.000Z`); // the value being written
  });

  it("refuses with edition_write_contention when the attempt budget is exhausted", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query, { mergeAttemptLimit: 3 });
    await repo.upsertEdition(edition());
    // a writer that ALWAYS lands between read and update: every CAS fails
    let n = 0;
    db.onRead = () => {
      const row = db.rows.get(`iran_update:${DAY}:evening`)!;
      row.norm_version = `isw-edition-norm-race-${n++}`;
    };
    const err = await repo.upsertEdition(parsedPublished).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictDomainError);
    expect((err as ConflictDomainError).code).toBe("edition_write_contention");
    expect(db.calls.filter((c) => c.sql.startsWith("UPDATE")).length).toBe(3);
  });

  it("MERGE_ATTEMPT_LIMIT is a bounded budget, never unlimited", () => {
    expect(MERGE_ATTEMPT_LIMIT).toBeGreaterThan(1);
    expect(Number.isFinite(MERGE_ATTEMPT_LIMIT)).toBe(true);
  });
});

describe("anchor-change journal", () => {
  const at = "2027-07-11T00:00:00.000Z";

  it("journals a present -> DIFFERENT-present move only, never a fill-in", () => {
    const base = edition();
    const filled = edition({
      identity: { cutoffAt: `${DAY}T18:00:00Z` },
      cutoffTreatment: "present",
    });
    expect(anchorJournalEntriesFor(base, filled, at)).toEqual([]); // null -> value
    const moved = edition({
      identity: { cutoffAt: `${DAY}T19:30:00Z` },
      cutoffTreatment: "present",
    });
    expect(anchorJournalEntriesFor(filled, moved, at)).toEqual([
      { at, field: "cutoff", from: `${DAY}T18:00:00.000Z`, to: `${DAY}T19:30:00.000Z` },
    ]);
  });

  it("a moved anchor leaves a queryable trace instead of destroying the old instant", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query, { now: () => new Date(at) });
    await repo.upsertEdition(
      edition({ identity: { cutoffAt: `${DAY}T18:00:00Z` }, cutoffTreatment: "present" }),
    );
    const moved = await repo.upsertEdition(
      edition({ identity: { cutoffAt: `${DAY}T19:30:00Z` }, cutoffTreatment: "present" }),
    );
    expect(moved.anchorChanged).toBe(true);
    expect(await repo.anchorJournal(`iran_update:${DAY}:evening`)).toEqual([
      { at, field: "cutoff", from: `${DAY}T18:00:00.000Z`, to: `${DAY}T19:30:00.000Z` },
    ]);
  });

  it("keeps the most recent entries only (bounded column)", async () => {
    const db = new FakeEditionTables();
    const repo = new SqlReferenceReportRepository(db.query, { now: () => new Date(at) });
    await repo.upsertEdition(
      edition({ identity: { cutoffAt: `${DAY}T00:00:00Z` }, cutoffTreatment: "present" }),
    );
    for (let i = 1; i <= ANCHOR_JOURNAL_LIMIT + 5; i++) {
      await repo.upsertEdition(
        edition({
          identity: { cutoffAt: `${DAY}T${String(i % 24).padStart(2, "0")}:${String(i).padStart(2, "0")}:00Z` },
          cutoffTreatment: "present",
        }),
      );
    }
    const journal = await repo.anchorJournal(`iran_update:${DAY}:evening`);
    expect(journal.length).toBe(ANCHOR_JOURNAL_LIMIT);
    // the LAST move is retained (the oldest are the ones dropped)
    expect(journal[journal.length - 1].to).toBe(
      `${DAY}T${String((ANCHOR_JOURNAL_LIMIT + 5) % 24).padStart(2, "0")}:${ANCHOR_JOURNAL_LIMIT + 5}:00.000Z`,
    );
  });

  it("reads fail closed: anything that is not an {at, field, from, to} instant entry is refused", () => {
    expect(parseStoredAnchorJournal(null)).toEqual([]);
    expect(parseStoredAnchorJournal([])).toEqual([]);
    const good = [{ at, field: "published", from: at, to: "2027-07-12T00:00:00.000Z" }];
    expect(parseStoredAnchorJournal(good)).toEqual(good);
    expect(parseStoredAnchorJournal(JSON.stringify(good))).toEqual(good); // driver text
    for (const bad of [
      {},
      "not-an-array",
      [{ at, field: "cutoff", from: at, to: at, note: "ISW says the cutoff moved" }],
      [{ at, field: "prose", from: at, to: at }],
      [{ at, field: "cutoff", from: "yesterday", to: at }],
      [{ at: "2027-07-11T00:00:00+00:00", field: "cutoff", from: at, to: at }], // non-canonical
      [{ at, field: "cutoff", from: at }],
    ]) {
      expect(() => parseStoredAnchorJournal(bad)).toThrow(ConflictDomainError);
    }
  });
});
