import { describe, expect, it } from "vitest";
import {
  buildKnownAnswerQuestion,
  chatParamsForModel,
  computeCorpusStats,
  estimateGenerationCostUsd,
  generationCostUsd,
  generationMaxCompletionTokens,
  generationResponseSchema,
  generationUserMessage,
  mergeEvalSet,
  normalizedPrefix,
  stratifiedSample,
  type EvalQuestion,
  type EvalSet,
  type HarvestClaimRow,
} from "./eval-set";

function row(overrides: Partial<HarvestClaimRow> & { id: number }): HarvestClaimRow {
  return {
    text: `claim text ${overrides.id}`,
    countryIso2: "ru",
    track: "military",
    claimDate: "2026-07-01",
    entities: [],
    ...overrides,
  };
}

describe("computeCorpusStats", () => {
  it("computes count and date range, ignoring nulls", () => {
    const rows = [
      row({ id: 1, claimDate: "2026-07-05" }),
      row({ id: 2, claimDate: "2026-06-20" }),
      row({ id: 3, claimDate: null }),
      row({ id: 4, claimDate: "2026-07-11" }),
    ];
    expect(computeCorpusStats(rows)).toEqual({ claimCount: 4, minDate: "2026-06-20", maxDate: "2026-07-11" });
  });

  it("handles an empty corpus", () => {
    expect(computeCorpusStats([])).toEqual({ claimCount: 0, minDate: null, maxDate: null });
  });
});

describe("normalizedPrefix", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizedPrefix("Strikes hit the  power-grid!!  near Kyiv.", 100)).toBe(
      "strikes hit the power grid near kyiv",
    );
  });

  it("truncates to the requested length", () => {
    expect(normalizedPrefix("abcdefghij", 5)).toBe("abcde");
  });

  it("treats near-duplicate texts (different casing/punctuation) as the same prefix", () => {
    const a = normalizedPrefix("Russian forces advanced near Bakhmut, officials said.", 30);
    const b = normalizedPrefix("russian forces advanced near bakhmut - officials said", 30);
    expect(a).toBe(b);
  });
});

describe("stratifiedSample", () => {
  it("spreads picks across theater/track/date buckets rather than clumping", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row({ id: i + 1, countryIso2: "ru", claimDate: "2026-07-01" })),
      row({ id: 100, countryIso2: "ua", claimDate: "2026-07-02" }),
      row({ id: 101, countryIso2: "ir", claimDate: "2026-07-03" }),
    ];
    const sample = stratifiedSample(rows, { targetSize: 3 });
    const theaters = new Set(sample.map((r) => r.countryIso2));
    // with 3 distinct buckets and target 3, the round-robin should pick one from each
    expect(theaters).toEqual(new Set(["ru", "ua", "ir"]));
  });

  it("prefers claims with entities and longer text within a bucket", () => {
    const rows = [
      row({ id: 1, text: "short", entities: [] }),
      row({ id: 2, text: "a much longer claim text that clearly passes the length preference threshold", entities: ["Wagner Group"] }),
    ];
    const sample = stratifiedSample(rows, { targetSize: 1 });
    expect(sample).toHaveLength(1);
    expect(sample[0].id).toBe(2);
  });

  it("excludes near-duplicate texts via normalized-prefix dedupe", () => {
    const rows = [
      row({ id: 1, text: "Strikes hit the power grid near Kyiv overnight." }),
      row({ id: 2, text: "strikes hit the power grid near kyiv overnight" }), // near-dupe of id 1
      row({ id: 3, text: "Completely unrelated claim about sanctions on a bank." }),
    ];
    const sample = stratifiedSample(rows, { targetSize: 3, dedupePrefixChars: 40 });
    const ids = sample.map((r) => r.id).sort();
    expect(ids).toEqual([1, 3]); // id 2 dropped as a near-dupe of id 1
  });

  it("never returns more than targetSize even with a large corpus", () => {
    const rows = Array.from({ length: 200 }, (_, i) => {
      const day = String((i % 20) + 1).padStart(2, "0");
      return row({
        id: i + 1,
        countryIso2: i % 3 === 0 ? "ru" : i % 3 === 1 ? "ua" : "ir",
        claimDate: `2026-07-${day}`,
      });
    });
    const sample = stratifiedSample(rows, { targetSize: 25 });
    expect(sample.length).toBeLessThanOrEqual(25);
  });

  it("is deterministic for a fixed input", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: i + 1, countryIso2: i % 2 === 0 ? "ru" : "ua" }));
    const a = stratifiedSample(rows, { targetSize: 10 }).map((r) => r.id);
    const b = stratifiedSample(rows, { targetSize: 10 }).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it("never starves a theater when bucket count exceeds targetSize (round-1 regression)", () => {
    // Bug shape (supervisor round 1): with a flat rotation over theater|track|date
    // bucket keys, ~90 buckets > targetSize 25 meant the first pass filled every
    // slot from the alphabetically-first buckets — the live estimate printed
    // ae=8/il=5/ir=12 with ZERO ru/ua picks despite ru+ua being ~440 of 765 claims.
    // Reproduce: 3 theaters x 30 date buckets each (90 buckets > target 25), the
    // alphabetically earliest ("ir") alone holding enough candidates to fill the
    // target on its own.
    const rows: HarvestClaimRow[] = [];
    let id = 1;
    for (const iso2 of ["ir", "ru", "ua"]) {
      for (let d = 1; d <= 30; d++) {
        const day = String(d).padStart(2, "0");
        rows.push(
          row({
            id: id++,
            countryIso2: iso2,
            claimDate: `2026-06-${day}`,
            text: `Day ${day} ${iso2} report: strikes and force movements described in a distinct claim`,
          }),
        );
      }
    }
    const sample = stratifiedSample(rows, { targetSize: 25 });
    expect(sample).toHaveLength(25);
    const counts = new Map<string, number>();
    for (const r of sample) counts.set(r.countryIso2, (counts.get(r.countryIso2) ?? 0) + 1);
    for (const iso2 of ["ir", "ru", "ua"]) {
      const n = counts.get(iso2) ?? 0;
      expect(n, `theater ${iso2} must be represented`).toBeGreaterThan(0);
      // roughly even: 25 over 3 theaters -> 9/8/8, allow +-2 around the mean
      expect(Math.abs(n - 25 / 3), `theater ${iso2} share ${n} not roughly even`).toBeLessThanOrEqual(2);
    }
  });
});

describe("buildKnownAnswerQuestion", () => {
  it("builds an id from the claim id and freezes text/country/date into gold", () => {
    const r = row({ id: 1438, text: "Forces advanced near Bakhmut.", countryIso2: "ua", claimDate: "2026-07-01" });
    const q = buildKnownAnswerQuestion(r, "Where did forces reportedly advance recently?");
    expect(q).toEqual({
      id: "known-1438",
      type: "known-answer",
      question: "Where did forces reportedly advance recently?",
      gold: [{ claimIdAtHarvest: 1438, text: "Forces advanced near Bakhmut.", countryIso2: "ua", claimDate: "2026-07-01" }],
      acceptableAlternates: [],
    });
  });
});

describe("mergeEvalSet", () => {
  const corpus = { claimCount: 765, minDate: "2026-06-20", maxDate: "2026-07-11" };

  it("creates a fresh eval set when none exists", () => {
    const additions: EvalQuestion[] = [buildKnownAnswerQuestion(row({ id: 1 }), "q1?")];
    const merged = mergeEvalSet(null, additions, corpus);
    expect(merged.version).toBe(1);
    expect(merged.corpus).toEqual(corpus);
    expect(merged.questions).toEqual(additions);
    expect(typeof merged.createdAt).toBe("string");
  });

  it("preserves createdAt and merges by id, additions winning on collision", () => {
    const existing: EvalSet = {
      version: 1,
      createdAt: "2026-07-01T00:00:00.000Z",
      corpus,
      questions: [buildKnownAnswerQuestion(row({ id: 1, text: "old text" }), "old question?")],
    };
    const additions: EvalQuestion[] = [
      buildKnownAnswerQuestion(row({ id: 1, text: "new text" }), "new question?"),
      buildKnownAnswerQuestion(row({ id: 2 }), "q2?"),
    ];
    const merged = mergeEvalSet(existing, additions, corpus);
    expect(merged.createdAt).toBe("2026-07-01T00:00:00.000Z");
    expect(merged.questions).toHaveLength(2);
    expect(merged.questions.find((q) => q.id === "known-1")?.question).toBe("new question?");
  });
});

describe("chatParamsForModel", () => {
  it("gpt-5-family: omits temperature, uses max_completion_tokens", () => {
    expect(chatParamsForModel("gpt-5-mini", 500)).toEqual({ max_completion_tokens: 500 });
  });

  it("other models: temperature + max_tokens", () => {
    expect(chatParamsForModel("gpt-4o-mini", 500, 0.1)).toEqual({ temperature: 0.1, max_tokens: 500 });
  });
});

describe("generationMaxCompletionTokens", () => {
  it("scales with batch size but has a floor", () => {
    expect(generationMaxCompletionTokens(5)).toBe(1300);
    expect(generationMaxCompletionTokens(1)).toBeGreaterThanOrEqual(400);
  });
});

describe("generationResponseSchema", () => {
  it("pins minItems=maxItems to the exact batch size (ruling 7)", () => {
    const schema = generationResponseSchema(5);
    expect(schema.properties.results.minItems).toBe(5);
    expect(schema.properties.results.maxItems).toBe(5);
    expect(schema.properties.results.items.required).toEqual(["claimId", "question"]);
  });
});

describe("generationUserMessage", () => {
  it("lists claim ids in order and includes each claim's text", () => {
    const rows = [row({ id: 1, text: "alpha" }), row({ id: 2, text: "beta" })];
    const msg = generationUserMessage(rows);
    expect(msg).toContain("in this order: 1, 2");
    expect(msg).toContain("alpha");
    expect(msg).toContain("beta");
  });
});

describe("generationCostUsd / estimateGenerationCostUsd", () => {
  it("computes cost from gpt-5-mini list price", () => {
    // 1000 prompt @ $0.125/1M + 1000 completion @ $1/1M = 0.000125 + 0.001 = 0.001125
    expect(generationCostUsd(1000, 1000)).toBeCloseTo(0.001125, 6);
  });

  it("estimate scales with claim count and batches", () => {
    const est = estimateGenerationCostUsd(25, 5);
    expect(est.batches).toBe(5);
    expect(est.estCostUsd).toBeGreaterThan(0);
    expect(est.estCostUsd).toBeLessThan(1); // sanity: 25 claims must stay well under the $1 envelope
  });

  it("zero claims costs zero", () => {
    const est = estimateGenerationCostUsd(0);
    expect(est).toEqual({ batches: 0, estPromptTokens: 0, estCompletionTokens: 0, estCostUsd: 0 });
  });
});
