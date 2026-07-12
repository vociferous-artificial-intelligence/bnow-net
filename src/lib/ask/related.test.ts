import { afterEach, describe, expect, it } from "vitest";
import {
  ASK_RELATED_MIN_SCORE_DEFAULT,
  RELATED_MAX,
  askRelatedMinScore,
  selectRelatedClaimIds,
} from "./related";
import type { CandidateClaim } from "./types";

function candidate(o: Partial<CandidateClaim> & { claimId: number }): CandidateClaim {
  return {
    claimId: o.claimId,
    text: o.text ?? `claim ${o.claimId}`,
    hedging: o.hedging ?? "unknown",
    claimDate: o.claimDate === undefined ? "2026-07-05" : o.claimDate,
    countryIso2: o.countryIso2 ?? "ru",
    track: o.track === undefined ? null : o.track,
    entities: o.entities ?? [],
    confidence: o.confidence === undefined ? null : o.confidence,
    vectorScore: o.vectorScore === undefined ? null : o.vectorScore,
    lexicalHit: o.lexicalHit ?? true,
    compositeScore: o.compositeScore ?? 0,
  };
}

afterEach(() => {
  delete process.env.ASK_RELATED_MIN_SCORE;
});

describe("constants", () => {
  it("match the calibrated/documented values", () => {
    expect(RELATED_MAX).toBe(5);
    expect(ASK_RELATED_MIN_SCORE_DEFAULT).toBe(0.5);
  });
});

describe("askRelatedMinScore", () => {
  it("defaults to 0.5 when unset", () => {
    delete process.env.ASK_RELATED_MIN_SCORE;
    expect(askRelatedMinScore()).toBe(0.5);
  });

  it("respects a valid in-range override", () => {
    process.env.ASK_RELATED_MIN_SCORE = "0.65";
    expect(askRelatedMinScore()).toBe(0.65);
  });

  it("boundary values 0 and 1 are both valid", () => {
    process.env.ASK_RELATED_MIN_SCORE = "0";
    expect(askRelatedMinScore()).toBe(0);
    process.env.ASK_RELATED_MIN_SCORE = "1";
    expect(askRelatedMinScore()).toBe(1);
  });

  it("rejects out-of-range and non-numeric values back to the default (never <0 or >1)", () => {
    for (const bad of ["-0.1", "1.1", "5", "not-a-number", ""]) {
      process.env.ASK_RELATED_MIN_SCORE = bad;
      expect(askRelatedMinScore()).toBe(ASK_RELATED_MIN_SCORE_DEFAULT);
    }
  });
});

describe("selectRelatedClaimIds", () => {
  it("drops candidates with vectorScore null even though nothing else disqualifies them", () => {
    const claims = [candidate({ claimId: 1, vectorScore: null }), candidate({ claimId: 2, vectorScore: 0.9 })];
    expect(selectRelatedClaimIds(claims, new Set())).toEqual([2]);
  });

  it("drops candidates below the floor, keeps candidates at/above it (inclusive boundary)", () => {
    const claims = [
      candidate({ claimId: 1, vectorScore: 0.5 }), // exactly the default floor -> kept
      candidate({ claimId: 2, vectorScore: 0.4999 }), // just under -> dropped
      candidate({ claimId: 3, vectorScore: 0.9 }),
    ];
    expect(selectRelatedClaimIds(claims, new Set())).toEqual([1, 3]);
  });

  it("excludes cited ids regardless of score", () => {
    const claims = [candidate({ claimId: 1, vectorScore: 0.9 }), candidate({ claimId: 2, vectorScore: 0.9 })];
    expect(selectRelatedClaimIds(claims, new Set([1]))).toEqual([2]);
  });

  it("preserves ranked (input) order, does not re-sort by score", () => {
    const claims = [
      candidate({ claimId: 3, vectorScore: 0.6 }),
      candidate({ claimId: 1, vectorScore: 0.99 }),
      candidate({ claimId: 2, vectorScore: 0.5 }),
    ];
    expect(selectRelatedClaimIds(claims, new Set())).toEqual([3, 1, 2]);
  });

  it("caps at RELATED_MAX even when more candidates qualify", () => {
    const claims = Array.from({ length: RELATED_MAX + 3 }, (_, i) =>
      candidate({ claimId: i + 1, vectorScore: 0.9 }),
    );
    const ids = selectRelatedClaimIds(claims, new Set());
    expect(ids).toHaveLength(RELATED_MAX);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns [] when the pool is entirely lexical-only (vectorScore null on every candidate) —\
 the documented v2-lexical-only behavior: related is always empty", () => {
    const claims = [candidate({ claimId: 1 }), candidate({ claimId: 2 }), candidate({ claimId: 3 })];
    expect(selectRelatedClaimIds(claims, new Set())).toEqual([]);
  });

  it("respects an ASK_RELATED_MIN_SCORE env override", () => {
    process.env.ASK_RELATED_MIN_SCORE = "0.8";
    const claims = [candidate({ claimId: 1, vectorScore: 0.7 }), candidate({ claimId: 2, vectorScore: 0.85 })];
    expect(selectRelatedClaimIds(claims, new Set())).toEqual([2]);
  });
});
