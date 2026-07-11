import { describe, expect, it } from "vitest";
import {
  LEXICAL_ONLY_SEMANTIC,
  NULL_DATE_DECAY,
  RECENCY_HALF_LIFE_DAYS,
  scoreCandidate,
  type CandidateScoreInput,
} from "./composite";

const NOW = new Date(Date.UTC(2026, 6, 11, 12)); // 2026-07-11
const base: CandidateScoreInput = { vectorScore: null, lexicalHit: false, claimDate: null, confidence: null };

describe("composite constants", () => {
  it("are the documented values", () => {
    expect(LEXICAL_ONLY_SEMANTIC).toBe(0.55);
    expect(RECENCY_HALF_LIFE_DAYS).toBe(30);
    expect(NULL_DATE_DECAY).toBe(0.25);
  });
});

describe("scoreCandidate — exact fixed cases (mode v2)", () => {
  it("perfect: vectorScore 1, today, confidence 1 -> 1.0", () => {
    const s = scoreCandidate(
      { ...base, vectorScore: 1, claimDate: "2026-07-11", confidence: 1 },
      NOW,
      "v2",
    );
    expect(s).toBeCloseTo(1.0, 10);
  });

  it("one half-life old (30d), vectorScore 0.5, confidence 0.5 -> 0.5*0.5*0.75", () => {
    const s = scoreCandidate(
      { ...base, vectorScore: 0.5, claimDate: "2026-06-11", confidence: 0.5 },
      NOW,
      "v2",
    );
    expect(s).toBeCloseTo(0.5 * 0.5 * 0.75, 10);
  });

  it("lexical-only candidate (no vectorScore) uses LEXICAL_ONLY_SEMANTIC", () => {
    const s = scoreCandidate({ ...base, lexicalHit: true, claimDate: "2026-07-11", confidence: 1 }, NOW, "v2");
    expect(s).toBeCloseTo(0.55 * 1 * 1, 10);
  });

  it("undated claim uses NULL_DATE_DECAY for recency", () => {
    const s = scoreCandidate({ ...base, vectorScore: 1, claimDate: null, confidence: 1 }, NOW, "v2");
    expect(s).toBeCloseTo(1 * NULL_DATE_DECAY * 1, 10);
  });

  it("null confidence -> neutral 0.5 -> reliabilityFactor 0.75", () => {
    const s = scoreCandidate({ ...base, vectorScore: 1, claimDate: "2026-07-11", confidence: null }, NOW, "v2");
    expect(s).toBeCloseTo(0.75, 10);
  });

  it("future claim date floors ageDays at 0 (recency 1)", () => {
    const s = scoreCandidate({ ...base, vectorScore: 1, claimDate: "2026-08-01", confidence: 1 }, NOW, "v2");
    expect(s).toBeCloseTo(1.0, 10);
  });
});

describe("scoreCandidate — v2-lexical-only mode", () => {
  it("semantic is 1 for every candidate regardless of vectorScore", () => {
    const s = scoreCandidate({ ...base, vectorScore: null, claimDate: "2026-07-11", confidence: 1 }, NOW, "v2-lexical-only");
    expect(s).toBeCloseTo(1 * 1 * 1, 10);
  });
});

describe("scoreCandidate — ordering properties", () => {
  it("newer beats older at equal similarity + reliability", () => {
    const newer = scoreCandidate({ ...base, vectorScore: 0.8, claimDate: "2026-07-11", confidence: 0.6 }, NOW, "v2");
    const older = scoreCandidate({ ...base, vectorScore: 0.8, claimDate: "2026-05-11", confidence: 0.6 }, NOW, "v2");
    expect(newer).toBeGreaterThan(older);
  });

  it("higher similarity beats lower at equal age + reliability", () => {
    const hi = scoreCandidate({ ...base, vectorScore: 0.9, claimDate: "2026-07-01", confidence: 0.6 }, NOW, "v2");
    const lo = scoreCandidate({ ...base, vectorScore: 0.4, claimDate: "2026-07-01", confidence: 0.6 }, NOW, "v2");
    expect(hi).toBeGreaterThan(lo);
  });

  it("reliability breaks ties at equal similarity + age", () => {
    const rel = scoreCandidate({ ...base, vectorScore: 0.7, claimDate: "2026-07-01", confidence: 0.9 }, NOW, "v2");
    const unrel = scoreCandidate({ ...base, vectorScore: 0.7, claimDate: "2026-07-01", confidence: 0.1 }, NOW, "v2");
    expect(rel).toBeGreaterThan(unrel);
  });
});
