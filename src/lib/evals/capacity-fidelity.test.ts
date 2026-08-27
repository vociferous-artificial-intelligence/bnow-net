import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { DigestEvalInput, EvalResultsFile } from "./contracts";
import { applyCapacityProfile } from "./capacity-profiles";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { buildDigestVotePrompt, offlineIdentity } = await import("./runner");
const { validateAnalysisEvalDataset } = await import("./contracts");

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

/** A synthetic digest input with `n` dissimilar single-claim groups, in the
 *  real ReduceClaim shape the datasets use. */
function digestInput(n: number): DigestEvalInput {
  const claims = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    docId: 1000 + i,
    // dissimilar texts so clusterClaims yields ~one group per claim
    // token-disjoint per claim so clusterClaims (threshold 0.35) cannot merge
    textEn: `alpha${i}x bravo${i}y charlie${i}z delta${i}q echo${i}r foxtrot${i}s`,
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual",
    hedging: "claimed",
    entities: [],
    eventHint: null,
    claimDate: "2027-01-10",
    sourceDomain: `source-${i}.example`,
    sourceKey: `source-${i}.example`,
    reliability: 0.5,
    adapter: "rss",
    platform: "web",
    publishedAt: "2027-01-10T08:00:00Z",
  }));
  return {
    theater: "ru",
    track: "military",
    date: "2027-01-10",
    claims,
  } as unknown as DigestEvalInput;
}

function countGroupLines(user: string): number {
  return (user.match(/^\[\d+\] \(/gm) ?? []).length;
}

describe("SCI-N6 closed: buildDigestVotePrompt applies the production fed cutoff", () => {
  it("feeds at most reduceGroupsFed() groups (default 200) past the cutoff", () => {
    const prompt = buildDigestVotePrompt(digestInput(230));
    expect(countGroupLines(prompt.user)).toBeLessThanOrEqual(200);
    // groupsTotal in the message header still reports the full population
    expect(prompt.user).toMatch(/of 2\d\d clustered/);
  });

  it("is a no-op below the cutoff (identity-neutral for v1 datasets)", () => {
    const prompt = buildDigestVotePrompt(digestInput(40));
    expect(countGroupLines(prompt.user)).toBeGreaterThanOrEqual(35); // clustering may merge a few
  });

  it("the reduce-fed-400 capacity profile widens the cutoff", () => {
    restore = applyCapacityProfile("reduce-fed-400");
    const prompt = buildDigestVotePrompt(digestInput(430));
    const n = countGroupLines(prompt.user);
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThanOrEqual(400);
  });
});

describe("committed results identity stability (the SCI-N6 fix must not drift v1 promptHash)", () => {
  it("offlineIdentity over each committed dataset matches its committed results header", () => {
    const dir = "docs/evals/analysis";
    const datasets = ["map-v1.json", "reduce-v1.json", "digest-v1.json", "validation-v1.json"];
    let checked = 0;
    for (const f of datasets) {
      const ds = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      expect(validateAnalysisEvalDataset(ds)).toEqual([]); // the real validator blesses it
      const resultsFile = readdirSync(`${dir}/results`).find(
        (r) => r === `${ds.workload}-offline-fixtures.json`,
      );
      expect(resultsFile, `committed results for ${ds.workload}`).toBeDefined();
      const rf = JSON.parse(readFileSync(`${dir}/results/${resultsFile}`, "utf8")) as EvalResultsFile;
      const now = offlineIdentity(ds);
      expect(now.promptHash, `${ds.workload} promptHash drift`).toBe(rf.identity.promptHash);
      expect(now.schemaVersion, `${ds.workload} schemaVersion drift`).toBe(rf.identity.schemaVersion);
      checked++;
    }
    expect(checked).toBe(4);
  });
});
