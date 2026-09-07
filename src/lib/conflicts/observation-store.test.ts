import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConflictDomainError } from "./errors";
import type { ConflictResultV1, ConflictScoredResultV1 } from "./eval-profile";
import {
  LATEST_OBSERVATIONS_SQL,
  OBSERVATION_INSERT_SQL,
  assertNoProseInStoredResult,
  latestObservationsFor,
  persistObservation,
  type ConflictObservationInput,
} from "./observation-store";
import { GOLDEN_RESULTS_FILE } from "./goldens";

// The committed goldens are REAL scorer output (byte-pinned by goldens.test.ts),
// so every fixture below is a result the production scorer can actually mint —
// not a hand-built shape that only this test believes in.
const GOLDENS = JSON.parse(readFileSync(join(process.cwd(), GOLDEN_RESULTS_FILE), "utf8")) as Record<
  string,
  ConflictResultV1
>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const golden = (key: string) => clone(GOLDENS[key]);

/** a real KEYWORD-rung scored result (the ladder scenario's zero-valid-rounds
 *  variant) — the rung the live report-only pipeline will actually use */
const KEYWORD_RESULT = () =>
  golden("cc-matcher-failclosed-013b#B-zero-valid-rounds") as ConflictScoredResultV1;
/** a real LLM-rung scored result (one valid round) */
const LLM_RESULT = () =>
  golden("cc-matcher-failclosed-013b#A-one-valid-round") as ConflictScoredResultV1;

const STAMPS = {
  gazetteerVersion: "ru-ua-v1",
  unitFlagsVersion: "unit-flags-v0",
  editionNormVersion: "isw-edition-norm-v1",
  dailyFinalPolicy: "designated-final-v1",
  registryVersion: "conflict-registry-v1",
} as const;

function input(over: Partial<ConflictObservationInput> = {}): ConflictObservationInput {
  return { referenceEditionId: 7, result: KEYWORD_RESULT(), ...STAMPS, ...over };
}

/** in-memory QueryFn recording every statement it is asked to run */
function recorder(rows: Array<Record<string, unknown>> = [{ id: 101 }]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    return rows;
  };
  return { calls, query };
}

async function refusedWithoutWriting(over: Partial<ConflictObservationInput>): Promise<ConflictDomainError> {
  const { calls, query } = recorder();
  const err = await persistObservation(query, input(over)).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected a refusal").toBeInstanceOf(ConflictDomainError);
  expect(calls, "a refusal must happen BEFORE any write").toHaveLength(0);
  return err as ConflictDomainError;
}

describe("append-only by construction (C6 = (b))", () => {
  it("the module contains no UPDATE, DELETE or ON CONFLICT path at all", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/conflicts/observation-store.ts"), "utf8")
      // strip comments first: the prose above explains the rule and would
      // otherwise satisfy — or wrongly fail — this scan
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [/\bON CONFLICT\b/i, /\bDO UPDATE\b/i, /\bUPDATE\s+conflict/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bMERGE\s+INTO\b/i]) {
      expect(source, `${forbidden} must not appear`).not.toMatch(forbidden);
    }
  });

  it("the insert binds every column it names, and names every column it binds", () => {
    const columns = OBSERVATION_INSERT_SQL.slice(
      OBSERVATION_INSERT_SQL.indexOf("(") + 1,
      OBSERVATION_INSERT_SQL.indexOf(")"),
    )
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const placeholders = new Set([...OBSERVATION_INSERT_SQL.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    expect(columns).toHaveLength(28);
    expect(placeholders.size).toBe(columns.length);
    expect(Math.max(...placeholders)).toBe(columns.length);
  });

  it("the insert statement carries no conflict clause", () => {
    expect(OBSERVATION_INSERT_SQL).toMatch(/^INSERT INTO conflict_validation_observations/);
    expect(OBSERVATION_INSERT_SQL).not.toMatch(/ON CONFLICT/i);
    expect(OBSERVATION_INSERT_SQL).toMatch(/RETURNING id$/);
  });
});

describe("persistObservation — the row is a projection of the result", () => {
  it("issues exactly ONE insert, storing the exact serialized result", async () => {
    const { calls, query } = recorder();
    const result = KEYWORD_RESULT();
    const id = await persistObservation(query, input({ result, cronRunId: 55 }));

    expect(id).toBe(101);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe(OBSERVATION_INSERT_SQL);
    expect(calls[0].params[7]).toBe(JSON.stringify(result));
  });

  it("reads every result-determined column OFF the result, never off the caller", async () => {
    const { calls, query } = recorder();
    const result = LLM_RESULT();
    await persistObservation(query, input({ result, contributingDigestIds: [3, 9], cronRunId: 55 }));
    const p = calls[0].params;

    expect(p[0]).toBe(result.conflictId);
    expect(p[1]).toBe(7); // referenceEditionId — caller-supplied, the FK identity
    expect(p[2]).toBe(result.report.series);
    expect(p[3]).toBe(result.report.reportDate);
    expect(p[4]).toBe(result.report.editionKey);
    expect(p[5]).toBe("retrospective");
    expect(p[6]).toEqual([3, 9]);
    expect(p[9]).toBe(result.matcherRung);
    expect(p[10]).toBe(result.matcher!.model);
    expect(p[11]).toBe(result.matcher!.votesK);
    expect(p[13]).toBe(result.methodologyEpoch);
    expect(p[14]).toBe(result.laneTaxonomyVersion);
    expect(p[15]).toBe(result.evidencePolicyVersion);
    expect(p[16]).toBe(result.versions!.laneClassifierVersion);
    expect(p[17]).toBe(result.versions!.actorRosterVersion);
    expect(p[18]).toBe(result.versions!.scopeVersion);
    expect(p[19]).toBe(STAMPS.gazetteerVersion);
    expect(p[20]).toBe(STAMPS.unitFlagsVersion);
    expect(p[23]).toEqual(result.versions!.extractorVersions);
    expect(p[24]).toBe(STAMPS.registryVersion);
    expect(p[25]).toBe(result.windowEndSource);
    expect(p[26]).toBe(result.runGroupKey);
    expect(p[27]).toBe(55);
  });

  it("defaults the optional columns without inventing values", async () => {
    const { calls, query } = recorder();
    await persistObservation(query, input());
    const p = calls[0].params;
    expect(p[6]).toEqual([]); // contributing_digest_ids
    expect(p[8]).toBe("{}"); // unit_attribution
    expect(p[12]).toBeNull(); // dispatch — null on the keyword rung
    expect(p[27]).toBeNull(); // cron_run_id — the partial unique is inert
  });

  it("carries the C3 attribution map and the paid-rung dispatch identity when given", async () => {
    const { calls, query } = recorder();
    await persistObservation(
      query,
      input({
        result: LLM_RESULT(),
        unitAttribution: { u1: "ru", u2: "both" },
        dispatch: { model: "gpt-4o-mini", reasoningEffort: null, registryVersion: "analysis-reg-v1", approval: "baseline", votesK: 5 },
      }),
    );
    expect(JSON.parse(calls[0].params[8] as string)).toEqual({ u1: "ru", u2: "both" });
    expect(JSON.parse(calls[0].params[12] as string).model).toBe("gpt-4o-mini");
  });
});

describe("persistObservation — refusals, all before any write", () => {
  it("refuses a publication-gap result: a gap is a day status, never an observation", async () => {
    const err = await refusedWithoutWriting({ result: golden("cc-publication-gap-002") });
    expect(err.code).toBe("invalid_observation_row");
    expect(err.message).toMatch(/day status/);
  });

  it("refuses a fixture-oracle rung — the live path can never mint one", async () => {
    const err = await refusedWithoutWriting({ result: golden("roca-ua-only-001b") });
    expect(err.code).toBe("unpersistable_result");
    expect(err.message).toMatch(/fixture-oracle/);
  });

  it("refuses a non-retrospective evaluation kind (register #5)", async () => {
    const result = KEYWORD_RESULT();
    (result as { evaluationKind: string }).evaluationKind = "at_publication";
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
  });

  it("refuses a result missing a binding stamp (the assertPersistable gate runs here)", async () => {
    const result = KEYWORD_RESULT();
    delete (result as Partial<ConflictScoredResultV1>).runGroupKey;
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
    expect(err.message).toMatch(/runGroupKey/);
  });

  it.each([
    ["referenceEditionId", { referenceEditionId: 0 }],
    ["a fractional edition id", { referenceEditionId: 1.5 }],
    ["cronRunId", { cronRunId: -1 }],
    ["a digest id", { contributingDigestIds: [1, 0] }],
    ["an empty version stamp", { gazetteerVersion: "" }],
    ["a version stamp with a space", { unitFlagsVersion: "unit flags v0" }],
    ["an over-long version stamp", { registryVersion: "v".repeat(65) }],
    ["a prose attribution value", { unitAttribution: { u1: "Russian forces advanced" } }],
    ["a nested dispatch payload", { dispatch: { nested: { model: "x" } } as never }],
  ])("refuses %s", async (_label, over) => {
    const err = await refusedWithoutWriting(over as Partial<ConflictObservationInput>);
    expect(err.code).toBe("invalid_observation_row");
  });
});

describe("ruling 1 — no reference prose may reach the table", () => {
  it("every committed golden scored result passes the audit unchanged", () => {
    const scored = Object.entries(GOLDENS).filter(([, r]) => r.state === "scored");
    expect(scored.length).toBeGreaterThanOrEqual(10);
    for (const [key, result] of scored) {
      expect(() => assertNoProseInStoredResult(result), key).not.toThrow();
    }
  });

  it("admits the bounded raw time anchor the corpus actually carries", () => {
    const withRawAnchor = GOLDENS["cc-window-rung2-017"] as ConflictScoredResultV1;
    expect(withRawAnchor.window!.cutoffAtRaw).toBe("cutoff 1500 hrs local time");
    expect(() => assertNoProseInStoredResult(withRawAnchor)).not.toThrow();
  });

  it("refuses a sentence smuggled into the raw anchor", async () => {
    const result = KEYWORD_RESULT();
    result.window!.cutoffAtRaw =
      "Russian forces advanced near Pokrovsk. ISW assessed the claim as unconfirmed.";
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
    expect(err.message).toMatch(/window\.cutoffAtRaw/);
  });

  it("refuses a sentinel string ANYWHERE outside the allowed classes, naming the path", async () => {
    const result = KEYWORD_RESULT();
    (result.contributionTotals as { byTheater: Record<string, number> }).byTheater = {
      "Ukrainian forces struck a Russian ammunition depot": 1,
    };
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
    expect(err.message).toMatch(/contributionTotals\.byTheater/);
    // the refused value is never echoed — it could be the very prose refused
    expect(err.message).not.toMatch(/Ukrainian/);
  });

  it("refuses a sentinel deep inside an array member", async () => {
    const result = KEYWORD_RESULT();
    const entry = Object.values(result.contribution)[0] as unknown as { theaters: string[] };
    entry.theaters = ["ISW assessed that Russian forces seized the settlement"];
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
    expect(err.message).toMatch(/contribution\./);
    expect(err.message).not.toMatch(/settlement/);
  });

  it("refuses a headline label that is not the fixed public constant", async () => {
    const result = KEYWORD_RESULT();
    result.headlineLabel = "Key Takeaway accuracy" as never;
    const err = await refusedWithoutWriting({ result });
    expect(err.code).toBe("unpersistable_result");
  });

  it("refuses non-finite numbers and non-plain values", () => {
    expect(() => assertNoProseInStoredResult({ n: Number.NaN })).toThrow(ConflictDomainError);
    expect(() => assertNoProseInStoredResult({ at: new Date() })).toThrow(ConflictDomainError);
  });
});

describe("latestObservationsFor — the headline is derived at read time", () => {
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    conflict_id: "russia_ukraine",
    reference_edition_id: 7,
    series: "roca",
    report_date: "2026-08-08",
    edition_key: "roca:2026-08-08:daily",
    matcher_rung: "keyword",
    run_group_key: "rg",
    unit_flags_version: "unit-flags-v0",
    gazetteer_version: "ru-ua-v1",
    cron_run_id: null,
    observed_at: "2026-08-09T01:00:00.000Z",
    result: KEYWORD_RESULT(),
    ...over,
  });

  it("asks for the latest row per edition over a report-date window", async () => {
    const { calls, query } = recorder([]);
    await latestObservationsFor(query, "russia_ukraine", {
      days: 7,
      now: () => new Date("2026-08-10T04:00:00Z"),
    });
    expect(calls[0].sql).toBe(LATEST_OBSERVATIONS_SQL);
    expect(calls[0].params).toEqual(["russia_ukraine", "2026-08-04"]);
    expect(LATEST_OBSERVATIONS_SQL).toMatch(/DISTINCT ON \(reference_edition_id\)/);
    expect(LATEST_OBSERVATIONS_SQL).toMatch(/observed_at DESC, id DESC/);
  });

  it("derives the headline from the stored result and orders newest day first", async () => {
    const stored = KEYWORD_RESULT();
    const { query } = calls3(stored);
    const out = await latestObservationsFor(query, "russia_ukraine");
    expect(out.map((o) => o.reportDate)).toEqual(["2026-08-09", "2026-08-08", "2026-08-07"]);
    expect(out[0].headline).toEqual({
      corpusRecall: stored.headline.corpusRecall,
      publishedRetention: stored.headline.publishedRetention,
    });
    expect(out[0].unitFlagsVersion).toBe("unit-flags-v0");
  });

  function calls3(stored: ConflictScoredResultV1) {
    return recorder([
      row({ id: 1, reference_edition_id: 7, report_date: "2026-08-07", result: stored }),
      row({ id: 2, reference_edition_id: 8, report_date: "2026-08-09", result: stored }),
      row({ id: 3, reference_edition_id: 9, report_date: "2026-08-08", result: stored }),
    ]);
  }

  it("parses a jsonb column handed back as a string", async () => {
    const { query } = recorder([row({ result: JSON.stringify(KEYWORD_RESULT()) })]);
    const out = await latestObservationsFor(query, "russia_ukraine");
    expect(out[0].result.state).toBe("scored");
  });

  it("REFUSES a stored row carrying prose rather than rendering it", async () => {
    const poisoned = KEYWORD_RESULT();
    (poisoned.contributionTotals as { bySource: Record<string, number> }).bySource = {
      "ISW reported that Russian forces advanced": 1,
    };
    const { query } = recorder([row({ result: poisoned })]);
    await expect(latestObservationsFor(query, "russia_ukraine")).rejects.toThrow(ConflictDomainError);
  });

  it("refuses a non-positive window", async () => {
    const { query } = recorder([]);
    await expect(latestObservationsFor(query, "russia_ukraine", { days: 0 })).rejects.toThrow(
      ConflictDomainError,
    );
  });
});
