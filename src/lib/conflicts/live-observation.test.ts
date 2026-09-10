import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The observation pipeline's five binding pins (PLAN-WS-3 §3.3b).
//
// The vendor SDK is mocked at module level so "zero provider calls" is a
// literal fact; the database is an injected QueryFn that records every
// statement, so "what reached the row" is inspected directly rather than
// inferred from a return value.

const createSpy = vi.fn();
const ctorSpy = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createSpy } };
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { SCOPE_VERSIONS, type ReferenceEditionRecord } from "./editions";
import { CONFLICT_REGISTRY, CONFLICT_REGISTRY_VERSION } from "./definitions";
import type { CandidateClaim } from "./evidence-records";
import { observeConflictDay } from "./live-observation";
import { InMemoryReferenceReportRepository } from "./reference-repo";
import { UNIT_FLAGS_VERSION } from "./unit-flags";

const RU_UA = CONFLICT_REGISTRY.russia_ukraine;
const IRAN = CONFLICT_REGISTRY.iran_regional;
const DAY = "2026-08-20";
const SENTINEL = "SENTINELTAKEAWAYPROSE";

/** Two declared takeaways: one the keyword rung can score, one signal-less. The
 *  sentinel rides the FIRST one, so a leak into any persisted value is visible. */
const PAGE_HTML = `<html><body>
<h2>Key Takeaways</h2>
<ul>
  <li>${SENTINEL} Russian forces advanced near Kupiansk in Kharkiv Oblast on August 20.</li>
  <li>Officials commented on procedural matters of no territorial consequence.</li>
</ul>
</body></html>`;

/** Real ISW URL shapes: the record validator re-normalizes canonicalUrl and
 *  refuses a record whose URL does not resolve to its own edition key. */
const URLS: Record<string, string> = {
  "roca:daily": `https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-august-20-2026/`,
  "iran_update:morning": `https://understandingwar.org/research/middle-east/iran-update-morning-special-report-august-20-2026/`,
  "iran_update:evening": `https://understandingwar.org/research/middle-east/iran-update-evening-special-report-august-20-2026/`,
};

function edition(
  series: "roca" | "iran_update",
  label: string,
  over: Partial<ReferenceEditionRecord> = {},
): ReferenceEditionRecord {
  return {
    identity: {
      series,
      editionKey: `${series}:${DAY}:${label}`,
      reportDate: DAY,
      cutoffAt: `${DAY}T19:00:00Z`,
      publishedAt: `${DAY}T22:00:00Z`,
      scopeVersion: SCOPE_VERSIONS[series],
    },
    provider: "isw",
    canonicalUrl: URLS[`${series}:${label}`],
    normVersion: "isw-edition-norm-v1",
    designatedFinal: null,
    cutoffTreatment: "present",
    publishedTreatment: "present",
    parseStatus: "parsed",
    citationAnchorId: null,
    derived: {},
    ...over,
  };
}

function claim(claimId: number, theater: string, text: string): CandidateClaim {
  return {
    claimId,
    theater,
    track: "military",
    text,
    hedging: "confirmed",
    claimDate: DAY,
    docs: [
      {
        docId: 9000 + claimId,
        adapter: "rss",
        platform: null,
        sourceDomain: `synthetic-${theater}.example`,
        publishedAt: `${DAY}T06:00:00Z`,
        fetchedAt: `${DAY}T07:00:00Z`,
        mirrorOfDocId: null,
        sourceLanguage: null,
      },
    ],
    engine: "mapreduce",
    currentExtractorVersion: true,
    extractorVersion: "gpt-4o-mini:testversion",
    published: true,
    stub: false,
    sourceReliability: 0.8,
  };
}

const CLAIMS = [
  claim(1, "ru", "Russian forces advanced near Kupiansk on August 20."),
  claim(2, "ua", "Ukrainian forces reported an advance near Kupiansk on August 20."),
];

interface Captured {
  sql: string;
  params: unknown[];
}

function harness(editions: readonly ReferenceEditionRecord[], editionRowIds: Record<string, number>) {
  const calls: Captured[] = [];
  let nextObservationId = 500;
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM benchmark_report_editions/.test(sql)) {
      const id = editionRowIds[String(params[0])];
      return id === undefined ? [] : [{ id }];
    }
    if (/INSERT INTO conflict_validation_observations/.test(sql)) {
      nextObservationId += 1;
      return [{ id: nextObservationId }];
    }
    return [];
  };
  const repo = new InMemoryReferenceReportRepository();
  const seeded = (async () => {
    for (const e of editions) await repo.upsertEdition(e);
  })();
  return {
    calls,
    seeded,
    deps: {
      repo,
      query,
      corpusSource: { corpusRecallCandidates: async () => CLAIMS },
      retentionSource: { publishedRetentionCandidates: async () => CLAIMS },
      contributingDigestIds: () => [11, 12],
      fetch: async (url: string) => ({ url, html: PAGE_HTML, fromCache: true, status: 200 }),
    },
  };
}

function insertParams(calls: readonly Captured[]): unknown[][] {
  return calls
    .filter((c) => /INSERT INTO conflict_validation_observations/.test(c.sql))
    .map((c) => c.params);
}

const SAVED = new Map<string, string | undefined>();
function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (!SAVED.has(k)) SAVED.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  createSpy.mockReset();
  ctorSpy.mockReset();
  setEnv({
    OPENAI_API_KEY: "sk-test",
    ANALYSIS_PROVIDER: undefined,
    LLM_DISABLE: undefined,
    LLM_SPRINT_USD_CAP: "10",
    CONFLICT_MATCH_USD_CAP_DAILY: undefined,
  });
});

afterEach(() => {
  for (const [k, v] of SAVED) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  SAVED.clear();
});

describe("observeConflictDay — the inert money path", () => {
  it("with CONFLICT_MATCH_USD_CAP_DAILY unset, the paid rung builds NO client and makes ZERO calls", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    const out = await observeConflictDay(h.deps, RU_UA, DAY);
    expect(out.matcherRefusal).toBe("daily_usd_cap_unset");
    expect(out.matcherRung).toBe("keyword");
    expect(ctorSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(out.observationId).not.toBeNull();
  });

  it("with LLM_DISABLE=1 an observation is STILL persisted, on the keyword rung (ruling 9)", async () => {
    setEnv({ LLM_DISABLE: "1", CONFLICT_MATCH_USD_CAP_DAILY: "2" });
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    const out = await observeConflictDay(h.deps, RU_UA, DAY);
    expect(out.matcherRefusal).toBe("llm_disabled");
    expect(out.matcherRung).toBe("keyword");
    expect(out.observationId).toBe(501);
    expect(createSpy).not.toHaveBeenCalled();
    // the kill switch degrades the day, it does not lose it
    expect(insertParams(h.calls)).toHaveLength(1);
  });
});

describe("observeConflictDay — what reaches the row", () => {
  it("persists NO reference prose anywhere in the statement (ruling 1)", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    await observeConflictDay(h.deps, RU_UA, DAY);
    const [params] = insertParams(h.calls);
    const serialized = JSON.stringify(params);
    expect(serialized).not.toContain(SENTINEL);
    expect(serialized).not.toContain("Key Takeaways");
    expect(serialized).not.toContain("Kharkiv Oblast");
    // and nothing in the returned outcome either — the route puts it in counts
    expect(JSON.stringify(await observeConflictDay(h.deps, RU_UA, DAY))).not.toContain(SENTINEL);
  });

  it("stamps the five out-of-result versions and the retrospective kind", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    await observeConflictDay(h.deps, RU_UA, DAY);
    const [params] = insertParams(h.calls);
    expect(params[1]).toBe(42); // reference_edition_id — resolved, not chosen
    expect(params[5]).toBe("retrospective"); // evaluation_kind
    expect(params[6]).toEqual([11, 12]); // contributing_digest_ids
    expect(params[19]).toBe("ru-ua-v1"); // gazetteer_version
    expect(params[20]).toBe(UNIT_FLAGS_VERSION);
    expect(params[21]).toBe("isw-edition-norm-v1"); // edition_norm_version
    expect(params[22]).toBe("designated-final-v1"); // daily_final_policy
    expect(params[24]).toBe(CONFLICT_REGISTRY_VERSION);
    expect(params[12]).toBeNull(); // dispatch — no paid rung ran
  });

  it("records the unit attribution map keyed by unit id, never as a filter", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    const out = await observeConflictDay(h.deps, RU_UA, DAY);
    const [params] = insertParams(h.calls);
    const attribution = JSON.parse(String(params[8])) as Record<string, string>;
    expect(Object.keys(attribution).sort()).toEqual(["u0", "u1"]);
    // the denominator is EVERY declared takeaway — attribution changed nothing
    expect(out.units).toBe(2);
    const result = JSON.parse(String(params[7])) as { headline: { corpusRecall: { denominator: number } } };
    expect(result.headline.corpusRecall.denominator).toBe(2);
  });

  it("resolves the edition row id from the KEY, and refuses to guess when it is absent", async () => {
    const h = harness([edition("roca", "daily")], {}); // no row for that key
    await h.seeded;
    const out = await observeConflictDay(h.deps, RU_UA, DAY);
    expect(out.skipped).toBe("edition_row_missing");
    expect(out.observationId).toBeNull();
    expect(insertParams(h.calls)).toHaveLength(0);
    const lookup = h.calls.find((c) => /FROM benchmark_report_editions/.test(c.sql))!;
    expect(lookup.params).toEqual([`roca:${DAY}:daily`, "roca", DAY]);
  });
});

describe("observeConflictDay — one row per (conflict, winner, run)", () => {
  it("a day with two editions persists ONE observation, keyed to the finality winner", async () => {
    // ROCA's label vocabulary has exactly one member, so a genuine
    // multi-edition day is an Iran Update day (NORMALIZED_EDITION_LABELS)
    const editions = [edition("iran_update", "morning"), edition("iran_update", "evening")];
    const h = harness(editions, {
      [`iran_update:${DAY}:morning`]: 42,
      [`iran_update:${DAY}:evening`]: 43,
    });
    await h.seeded;
    const out = await observeConflictDay(h.deps, IRAN, DAY);
    expect(out.editionsSeen).toBe(2);
    // the finality ORDERING picks the winner, not the probe order (memo C4)
    expect(out.editionKey).toBe(`iran_update:${DAY}:evening`);
    const inserts = insertParams(h.calls);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toBe(43);
    expect(inserts[0][4]).toBe(`iran_update:${DAY}:evening`); // edition_key, read off the result
    expect(inserts[0][19]).toBe("iran-levant-v1"); // scored under the Iran gazetteer
  });

  it("a re-run under a NEW cron_run_id APPENDS — that is the soak's variance sample", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    await observeConflictDay({ ...h.deps, cronRunId: 7 }, RU_UA, DAY);
    await observeConflictDay({ ...h.deps, cronRunId: 8 }, RU_UA, DAY);
    const inserts = insertParams(h.calls);
    expect(inserts).toHaveLength(2);
    expect(inserts.map((p) => p[27])).toEqual([7, 8]); // cron_run_id
    expect(inserts[0][7]).toEqual(inserts[1][7]); // same result bytes, two rows
    // no UPDATE and no ON CONFLICT anywhere in the statements issued
    for (const call of h.calls) {
      expect(/ON CONFLICT|UPDATE |DELETE /i.test(call.sql)).toBe(false);
    }
  });

  it("treats a runId of null as unattributed, never as an error (ruling 10)", async () => {
    const h = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await h.seeded;
    const out = await observeConflictDay({ ...h.deps, cronRunId: null }, RU_UA, DAY);
    expect(out.observationId).not.toBeNull();
    expect(insertParams(h.calls)[0][27]).toBeNull();
  });
});

describe("observeConflictDay — days that are not observations", () => {
  it("records no_editions and writes nothing (a gap is never fabricated)", async () => {
    const h = harness([], {});
    await h.seeded;
    const out = await observeConflictDay(h.deps, RU_UA, DAY);
    expect(out.skipped).toBe("no_editions");
    expect(out.editionKey).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("records fetch_failed and no_units without scoring a zero", async () => {
    const failed = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await failed.seeded;
    expect(
      (await observeConflictDay({ ...failed.deps, fetch: async () => null }, RU_UA, DAY)).skipped,
    ).toBe("fetch_failed");

    const empty = harness([edition("roca", "daily")], { [`roca:${DAY}:daily`]: 42 });
    await empty.seeded;
    const out = await observeConflictDay(
      {
        ...empty.deps,
        fetch: async (url: string) => ({ url, html: "<html><body>no takeaways</body></html>", fromCache: true, status: 200 }),
      },
      RU_UA,
      DAY,
    );
    expect(out.skipped).toBe("no_units");
    expect(insertParams(empty.calls)).toHaveLength(0);
  });
});

describe("the route stays unscheduled", () => {
  it("vercel.json contains no conflict-validate cron line", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: Array<{ path: string }>;
    };
    for (const cron of vercel.crons ?? []) {
      expect(cron.path).not.toContain("conflict-validate");
    }
  });
});
