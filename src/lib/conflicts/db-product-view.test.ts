import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VIEW_DAYS,
  evidenceClaimSql,
  loadDbBenchmarkDay,
  loadDbConflictProductView,
  loadDbEvidenceRows,
  loadDbEvidenceView,
  publishedUnionClaimIds,
} from "./db-product-view";
import {
  IRAN_LEGACY_GOLDEN,
  KEYWORD_GOLDEN,
  resultForEdition,
  storedObservation,
} from "./db-view.testkit";
import { STUB_ADAPTER_NAMES } from "./evidence-records";
import { InMemoryReferenceReportRepository } from "./reference-repo";
import { parseEditionRecord } from "./editions";
import type { QueryFn } from "../isw/load";
import type { StoredConflictObservation } from "./observation-store";
import type { ReferenceSeriesId } from "./vocabulary";

const NOW = () => new Date("2026-03-22T09:00:00Z");

// ---------------------------------------------------------------------------
// A QueryFn that answers the two statements the view issues, by shape
// ---------------------------------------------------------------------------

interface FakeDb {
  observations: readonly StoredConflictObservation[];
  claims?: ReadonlyArray<{ claim_id: number; text: string; claim_date: string }>;
  docs?: ReadonlyArray<Record<string, unknown>>;
}

function fakeQuery(db: FakeDb): { query: QueryFn; calls: string[] } {
  const calls: string[] = [];
  const query: QueryFn = async (sql) => {
    calls.push(sql);
    if (sql.includes("conflict_validation_observations")) {
      // the view never re-parses these; latestObservationsFor is mocked below
      return [];
    }
    if (sql.includes("FROM claims cl")) {
      return (db.claims ?? []) as unknown as Array<Record<string, unknown>>;
    }
    if (sql.includes("claim_sources cs")) {
      return (db.docs ?? []) as Array<Record<string, unknown>>;
    }
    return [];
  };
  return { query, calls };
}

// latestObservationsFor is the deployed statement's own read (proved by the
// integration test); here it is stubbed so the C4 selection rules can be
// exercised over exact row sets.
vi.mock("./observation-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./observation-store")>();
  return { ...actual, latestObservationsFor: vi.fn() };
});
const { latestObservationsFor } = await import("./observation-store");
const observationsMock = vi.mocked(latestObservationsFor);

function repoWith(
  editions: ReadonlyArray<{
    series: ReferenceSeriesId;
    reportDate: string;
    label: string;
    designatedFinal?: boolean | null;
  }>,
): InMemoryReferenceReportRepository {
  const repo = new InMemoryReferenceReportRepository();
  for (const e of editions) {
    repo.upsertEdition(
      parseEditionRecord({
        identity: {
          series: e.series,
          editionKey: `${e.series}:${e.reportDate}:${e.label}`,
          reportDate: e.reportDate,
          cutoffAt: null,
          publishedAt: null,
          scopeVersion: e.series === "roca" ? "roca-scope-v1" : "iran-update-scope-v1",
        },
        // provider "fixture": a real ISW edition must carry a canonical URL that
        // normalizes back to its own key, which is a discovery concern and not
        // what these selection tests are about
        provider: "fixture",
        canonicalUrl: null,
        normVersion: "isw-edition-norm-v1",
        designatedFinal: e.designatedFinal ?? null,
        cutoffTreatment: "missing",
        publishedTreatment: "missing",
        parseStatus: "pending",
        citationAnchorId: null,
        derived: {},
      }),
    );
  }
  return repo;
}

// ---------------------------------------------------------------------------
// C4: the daily-final winner, resolved at read time
// ---------------------------------------------------------------------------

describe("daily-final selection (memo C4) at read time", () => {
  it("renders the DAILY-FINAL edition's observation on a multi-edition day", async () => {
    const morning = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-05", "morning");
    const evening = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-05", "evening");
    observationsMock.mockResolvedValue([
      // deliberately morning-FIRST and morning-NEWER: a "latest row wins" read
      // model would pick it, and that is exactly the substitution C5-m measured
      storedObservation(morning, { id: 2, observedAt: "2026-03-05T23:00:00Z" }),
      storedObservation(evening, { id: 1, observedAt: "2026-03-05T12:00:00Z" }),
    ]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "iran_regional", {
      now: NOW,
      repo: repoWith([
        { series: "iran_update", reportDate: "2026-03-05", label: "morning" },
        { series: "iran_update", reportDate: "2026-03-05", label: "evening" },
      ]),
    });

    expect(view.days).toHaveLength(1);
    expect(view.days[0].editionKey).toBe("iran_update:2026-03-05:evening");
    expect(view.days[0].multiEdition).toBe(true);
    expect(view.days[0].orderedEditionKeys).toEqual([
      "iran_update:2026-03-05:evening",
      "iran_update:2026-03-05:morning",
    ]);
    expect(view.pending).toEqual([]);
  });

  it("reports a day whose FINAL edition is unobserved as pending — never promotes the other edition", async () => {
    const morning = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-10", "morning");
    observationsMock.mockResolvedValue([storedObservation(morning)]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "iran_regional", {
      now: NOW,
      repo: repoWith([
        { series: "iran_update", reportDate: "2026-03-10", label: "morning" },
        { series: "iran_update", reportDate: "2026-03-10", label: "evening" },
      ]),
    });

    expect(view.days).toEqual([]);
    expect(view.featured).toBeNull();
    expect(view.pending).toEqual([
      {
        reportDate: "2026-03-10",
        reason: "final_edition_unobserved",
        finalEditionKey: "iran_update:2026-03-10:evening",
        observedEditionKeys: ["iran_update:2026-03-10:morning"],
      },
    ]);
  });

  it("reports an undetermined daily final rather than choosing one", async () => {
    const evening = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-11", "evening");
    observationsMock.mockResolvedValue([storedObservation(evening)]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "iran_regional", {
      now: NOW,
      // two editions BOTH designated final — selectDailyFinal refuses
      repo: repoWith([
        { series: "iran_update", reportDate: "2026-03-11", label: "morning", designatedFinal: true },
        { series: "iran_update", reportDate: "2026-03-11", label: "evening", designatedFinal: true },
      ]),
    });

    expect(view.days).toEqual([]);
    expect(view.pending[0].reason).toBe("daily_final_undetermined");
    expect(view.pending[0].finalEditionKey).toBeNull();
  });

  it("reports a day whose edition rows cannot be read, rather than rendering the observation anyway", async () => {
    const daily = resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-12", "daily");
    observationsMock.mockResolvedValue([storedObservation(daily)]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "russia_ukraine", {
      now: NOW,
      repo: repoWith([]),
    });

    expect(view.days).toEqual([]);
    expect(view.pending[0]).toEqual({
      reportDate: "2026-03-12",
      reason: "editions_unavailable",
      finalEditionKey: null,
      observedEditionKeys: ["roca:2026-03-12:daily"],
    });
  });
});

// ---------------------------------------------------------------------------
// Window, featured, labels
// ---------------------------------------------------------------------------

describe("the view's shape", () => {
  const days = ["2026-03-12", "2026-03-13", "2026-03-14"];

  function threeDays() {
    return days.map((d, i) =>
      storedObservation(resultForEdition(KEYWORD_GOLDEN, "roca", d, "daily"), { id: i + 1 }),
    );
  }

  it("features the NEWEST resolved day and lists days newest-first", async () => {
    // latestObservationsFor returns newest-first; the view preserves it
    observationsMock.mockResolvedValue([...threeDays()].reverse());
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "russia_ukraine", {
      now: NOW,
      repo: repoWith(days.map((d) => ({ series: "roca" as const, reportDate: d, label: "daily" }))),
    });

    expect(view.days.map((d) => d.reportDate)).toEqual(["2026-03-14", "2026-03-13", "2026-03-12"]);
    expect(view.featured?.reportDate).toBe("2026-03-14");
    expect(view.windowDays).toBe(DEFAULT_VIEW_DAYS);
    expect(observationsMock).toHaveBeenCalledWith(query, "russia_ukraine", {
      days: DEFAULT_VIEW_DAYS,
      now: NOW,
    });
  });

  it("stops resolving after the requested number of days (the index surface)", async () => {
    observationsMock.mockResolvedValue([...threeDays()].reverse());
    const repo = repoWith(
      days.map((d) => ({ series: "roca" as const, reportDate: d, label: "daily" })),
    );
    const spy = vi.spyOn(repo, "editionsForDay");
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "russia_ukraine", {
      now: NOW,
      repo,
      stopAfterResolvedDays: 1,
    });

    expect(view.days).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1); // one edition read, not three
  });

  it("labels unit-flags-v0 rows as compound-undetermined and a later version as not", async () => {
    const result = resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-12", "daily");
    const repo = repoWith([{ series: "roca", reportDate: "2026-03-12", label: "daily" }]);
    const { query } = fakeQuery({ observations: [] });

    observationsMock.mockResolvedValue([storedObservation(result)]);
    const v0 = await loadDbConflictProductView(query, "russia_ukraine", { now: NOW, repo });
    expect(v0.compoundUndetermined).toBe(true);
    expect(v0.days[0].compoundUndetermined).toBe(true);

    observationsMock.mockResolvedValue([
      storedObservation(result, { unitFlagsVersion: "compound-v1" }),
    ]);
    const v1 = await loadDbConflictProductView(query, "russia_ukraine", { now: NOW, repo });
    expect(v1.compoundUndetermined).toBe(false);
    expect(v1.days[0].compoundUndetermined).toBe(false);
  });

  it("carries the memo-C8 legacy-only companion count", async () => {
    const iran = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-12", "plain");
    observationsMock.mockResolvedValue([storedObservation(iran)]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "iran_regional", {
      now: NOW,
      repo: repoWith([{ series: "iran_update", reportDate: "2026-03-12", label: "plain" }]),
    });
    expect(view.days[0].legacyOnlyMatched).toBe(1);
    expect(view.days[0].publishedUnionCount).toBe(1);
  });

  it("skips an observation whose series is not the conflict's benchmark", async () => {
    const wrong = resultForEdition(KEYWORD_GOLDEN, "iran_update", "2026-03-12", "plain");
    observationsMock.mockResolvedValue([storedObservation(wrong)]);
    const { query } = fakeQuery({ observations: [] });
    const view = await loadDbConflictProductView(query, "russia_ukraine", {
      now: NOW,
      repo: repoWith([{ series: "iran_update", reportDate: "2026-03-12", label: "plain" }]),
    });
    expect(view.days).toEqual([]);
    expect(view.pending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Addressing one day by its benchmark URL key
// ---------------------------------------------------------------------------

describe("loadDbBenchmarkDay", () => {
  const setup = () => {
    observationsMock.mockResolvedValue([
      storedObservation(
        resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", "2026-03-05", "evening"),
      ),
    ]);
    return {
      ...fakeQuery({ observations: [] }),
      repo: repoWith([
        { series: "iran_update", reportDate: "2026-03-05", label: "morning" },
        { series: "iran_update", reportDate: "2026-03-05", label: "evening" },
      ]),
    };
  };

  it("resolves the daily-final key", async () => {
    const { query, repo } = setup();
    const day = await loadDbBenchmarkDay(query, "iran_regional", "iran-update-2026-03-05-evening", {
      now: NOW,
      repo,
    });
    expect(day?.editionKey).toBe("iran_update:2026-03-05:evening");
    expect(day?.benchmarkKey).toBe("iran-update-2026-03-05-evening");
  });

  it("refuses a NON-final edition's key, an undecodable key, and an unobserved day", async () => {
    const { query, repo } = setup();
    for (const key of [
      "iran-update-2026-03-05-morning", // real edition, but not the day's final
      "iran-update-2026-03-06-evening", // no observation
      "iran_update:2026-03-05:evening", // the storage form, not the URL form
      "../../etc/passwd",
    ]) {
      expect(
        await loadDbBenchmarkDay(query, "iran_regional", key, { now: NOW, repo }),
        key,
      ).toBeNull();
    }
  });

  it("never inherits a resolution stop, which would 404 a day that exists", async () => {
    observationsMock.mockResolvedValue([
      storedObservation(resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-14", "daily"), { id: 2 }),
      storedObservation(resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-12", "daily"), { id: 1 }),
    ]);
    const { query } = fakeQuery({ observations: [] });
    const repo = repoWith([
      { series: "roca", reportDate: "2026-03-14", label: "daily" },
      { series: "roca", reportDate: "2026-03-12", label: "daily" },
    ]);
    const day = await loadDbBenchmarkDay(query, "russia_ukraine", "roca-2026-03-12-daily", {
      now: NOW,
      repo,
      stopAfterResolvedDays: 1,
    });
    expect(day?.reportDate).toBe("2026-03-12");
  });
});

// ---------------------------------------------------------------------------
// The gated evidence feed
// ---------------------------------------------------------------------------

describe("evidence rows", () => {
  const result = resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-12", "daily");
  const claimIds = publishedUnionClaimIds(result);
  const repo = () => repoWith([{ series: "roca", reportDate: "2026-03-12", label: "daily" }]);

  it("names exactly the published-retention union's claim ids, ascending and deduped", () => {
    expect(claimIds.length).toBeGreaterThan(0);
    expect([...claimIds].sort((a, b) => a - b)).toEqual(claimIds);
    expect(new Set(claimIds).size).toBe(claimIds.length);
  });

  it("takes TEXT and the source trail from the database and every analytical field from the result", async () => {
    observationsMock.mockResolvedValue([storedObservation(result)]);
    const { query } = fakeQuery({
      observations: [],
      claims: claimIds.map((id) => ({
        claim_id: id,
        text: `live text for claim ${id}`,
        claim_date: "2026-03-11",
      })),
      docs: claimIds.map((id) => ({
        claim_id: id,
        doc_id: 500 + id,
        adapter: "rss",
        url: "https://wire.example/a",
        published_at: "2026-03-11T06:00:00Z",
        fetched_at: "2026-03-11T07:00:00Z",
        lang: "en",
        platform: "independent_media",
        domain: "wire.example",
        mirror_of_doc_id: null,
      })),
    });
    const view = await loadDbEvidenceView(query, "russia_ukraine", "roca-2026-03-12-daily", {
      now: NOW,
      repo: repo(),
    });

    expect(view).not.toBeNull();
    expect(view!.rows).toHaveLength(claimIds.length);
    const row = view!.rows[0];
    expect(row.text).toBe(`live text for claim ${row.claimId}`);
    expect(row.docs[0].sourceDomain).toBe("wire.example");
    expect(view!.withheldClaimIds).toEqual([]);

    // the analytical fields are the evaluation's, not the row's
    const fromResult =
      (result.agreements?.publishedRetention ?? []).flatMap((a) => a.claims).find(
        (c) => c.claimId === row.claimId,
      ) ?? null;
    if (fromResult !== null) {
      expect(row.hedge).toBe(fromResult.hedge);
      expect(row.theater).toBe(fromResult.theater);
      expect(row.legacy).toBe(fromResult.legacy);
      expect(row.confidence).toBe(fromResult.confidence);
      expect(row.matchedUnits.length).toBeGreaterThan(0);
    }
  });

  it("COUNTS a claim the join no longer returns instead of rendering or hiding it", async () => {
    observationsMock.mockResolvedValue([storedObservation(result)]);
    const { query } = fakeQuery({ observations: [], claims: [], docs: [] });
    const day = await loadDbBenchmarkDay(query, "russia_ukraine", "roca-2026-03-12-daily", {
      now: NOW,
      repo: repo(),
    });
    const { rows, withheldClaimIds } = await loadDbEvidenceRows(query, day!);
    expect(rows).toEqual([]);
    expect(withheldClaimIds).toEqual(claimIds);
  });

  it("issues no claim query at all for an empty union", async () => {
    const empty = resultForEdition(KEYWORD_GOLDEN, "roca", "2026-03-12", "daily");
    empty.agreements = { corpusRecall: [], publishedRetention: [] };
    empty.bnowOnly = {
      corpusRecall: { count: 0 },
      publishedRetention: { count: 0, items: [] },
    };
    observationsMock.mockResolvedValue([storedObservation(empty)]);
    const { query, calls } = fakeQuery({ observations: [] });
    const day = await loadDbBenchmarkDay(query, "russia_ukraine", "roca-2026-03-12-daily", {
      now: NOW,
      repo: repo(),
    });
    calls.length = 0;
    expect(await loadDbEvidenceRows(query, day!)).toEqual({ rows: [], withheldClaimIds: [] });
    expect(calls).toEqual([]);
  });
});

describe("the evidence claim query enforces rulings 2 and 3 at the query", () => {
  const { sql, params } = evidenceClaimSql([1, 2]);

  it("requires a published digest, at least one source link, and no stub document", () => {
    expect(sql).toContain("JOIN digests d ON d.id = cl.digest_id");
    expect(sql).toContain("d.status::text = ANY($2::text[])");
    expect(sql).toContain("EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id = cl.id)");
    expect(sql).toContain("NOT EXISTS");
    expect(params[2]).toEqual([...STUB_ADAPTER_NAMES]);
    expect(params[1]).toEqual(["generated", "published"]);
  });

  it("passes claim ids as a bound parameter, never interpolated", () => {
    expect(sql).toContain("cl.id = ANY($1::int[])");
    expect(params[0]).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Ruling 3 by module graph
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const ALL_SOURCES = sourceFiles(SRC);
const isTest = (p: string) => /\.test\.tsx?$|\.itest\.ts$/.test(p);

/** Modules that read the frozen fixture corpus, directly or by re-export. */
const FIXTURE_MODULES = [
  "conflicts/product-view",
  "conflicts/fixture-corpus",
  "conflicts/fixture-matcher",
  "conflicts/goldens",
  "conflicts/db-view.testkit",
] as const;

describe("ruling 3: the real view cannot reach the fixture corpus", () => {
  it("db-product-view.ts imports no fixture module", () => {
    const source = readFileSync(join(SRC, "lib", "conflicts", "db-product-view.ts"), "utf8");
    for (const mod of FIXTURE_MODULES) {
      const short = mod.split("/")[1];
      expect(new RegExp(`from\\s+["'][^"']*${short}["']`).test(source), short).toBe(false);
    }
  });

  it("no conflict PAGE imports a fixture module, directly or through a component", () => {
    const pages = ALL_SOURCES.filter(
      (p) => p.includes(join("app", "conflicts")) && !isTest(p),
    );
    expect(pages.length).toBeGreaterThanOrEqual(4);
    // the page files themselves
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      for (const mod of FIXTURE_MODULES) {
        expect(source.includes(mod), `${relative(SRC, page)} → ${mod}`).toBe(false);
      }
    }
    // and every component a conflict page can reach
    const components = ALL_SOURCES.filter(
      (p) => p.includes(join("components", "conflicts")) && !isTest(p),
    );
    for (const component of components) {
      const source = readFileSync(component, "utf8");
      for (const mod of FIXTURE_MODULES) {
        expect(source.includes(mod), `${relative(SRC, component)} → ${mod}`).toBe(false);
      }
    }
  });

  it("the test-only builders are imported by tests ONLY", () => {
    const importers = ALL_SOURCES.filter((p) =>
      readFileSync(p, "utf8").includes("db-view.testkit"),
    );
    expect(importers.length).toBeGreaterThan(0);
    for (const importer of importers) {
      expect(isTest(importer), `${relative(SRC, importer)} imports the testkit`).toBe(true);
    }
  });
});
