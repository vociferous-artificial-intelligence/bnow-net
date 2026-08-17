import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import type { CandidateDoc } from "./evidence-records";
import {
  compareEvidenceOrder,
  DEFAULT_SELECTION_LIMITS,
  EVIDENCE_MAX_CANDIDATES,
  EVIDENCE_MIX_CAP_FRACTION,
  EVIDENCE_TEXT_BYTE_BUDGET,
  primaryDoc,
  selectEvidence,
  type SelectableRecord,
} from "./evidence-selection";

let nextDocId = 1;
function doc(overrides: Partial<CandidateDoc> = {}): CandidateDoc {
  return {
    docId: nextDocId++,
    adapter: "rss",
    platform: null,
    sourceDomain: "wire.example",
    publishedAt: "2026-08-10T06:00:00Z",
    fetchedAt: "2026-08-10T07:00:00Z",
    mirrorOfDocId: null,
    sourceLanguage: null,
    ...overrides,
  };
}

function rec(
  claimId: number,
  overrides: Partial<SelectableRecord> & { domain?: string; platform?: string | null } = {},
): SelectableRecord {
  const { domain, platform, ...rest } = overrides;
  return {
    claimId,
    text: `claim ${claimId} text`,
    docs: [doc({ sourceDomain: domain ?? "wire.example", platform: platform ?? null })],
    sourceReliability: null,
    ...rest,
  };
}

describe("deterministic total ordering (pinned: reliability desc nulls-last, then claimId asc)", () => {
  it("orders by reliability descending, nulls last, claimId as the stable key", () => {
    const records = [
      rec(4, { sourceReliability: null }),
      rec(3, { sourceReliability: 0.9 }),
      rec(2, { sourceReliability: null }),
      rec(1, { sourceReliability: 0.5 }),
      rec(5, { sourceReliability: 0.9 }),
    ];
    const sorted = [...records].sort(compareEvidenceOrder).map((r) => r.claimId);
    expect(sorted).toEqual([3, 5, 1, 2, 4]);
  });

  it("selection output order is independent of input order (LLM-facing determinism)", () => {
    const a = [rec(1), rec(2, { domain: "b.example" }), rec(3, { domain: "c.example" })];
    const b = [a[2], a[0], a[1]];
    expect(selectEvidence(a).selected.map((r) => r.claimId)).toEqual(
      selectEvidence(b).selected.map((r) => r.claimId),
    );
  });
});

describe("mix caps (house ~40% pattern shape; per source domain and per platform)", () => {
  it("caps a dominant domain, records cap events, then fills past the cap on thin corpora", () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) =>
        rec(i + 1, { sourceReliability: 0.9, domain: "big.example", platform: "x" }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        rec(100 + i, { sourceReliability: 0.1, domain: "small.example", platform: "telegram" }),
      ),
    ];
    const limits = { maxCandidates: 5, textByteBudget: 10_000, mixCapFraction: 0.4 };
    const result = selectEvidence(records, limits);
    // cap = ceil(5 * 0.4) = 2 per bucket; pass 1 picks 2 big + 2 small, pass 2
    // fills the 5th slot from the highest-ordered deferral (big #3)
    expect(result.selected.map((r) => r.claimId)).toEqual([1, 2, 3, 100, 101]);
    expect(result.capEvents.length).toBeGreaterThan(0);
    expect(result.capEvents[0]).toEqual({
      claimId: 3,
      bucketKind: "source",
      bucket: "big.example",
      capValue: 2,
    });
    // displaced records are visibly capped_out — NOT ineligible
    expect(result.cappedOut.map((r) => r.claimId)).toEqual([4, 5, 6, 7, 8, 9, 10, 102]);
    expect(result.budgetOut).toEqual([]);
    // partition property: selection never changes eligibility
    expect(result.selected.length + result.cappedOut.length + result.budgetOut.length).toBe(
      records.length,
    );
    expect(result.bounds.eligibleCount).toBe(13);
    expect(result.bounds.selectedCount).toBe(5);
  });

  it("platform buckets cap independently of domains", () => {
    const records = [
      rec(1, { domain: "a.example", platform: "x" }),
      rec(2, { domain: "b.example", platform: "x" }),
      rec(3, { domain: "c.example", platform: "x" }),
      rec(4, { domain: "d.example", platform: "telegram" }),
    ];
    const limits = { maxCandidates: 4, textByteBudget: 10_000, mixCapFraction: 0.4 };
    const result = selectEvidence(records, limits);
    // platform cap = 2: the third x-platform record defers in pass 1 and is
    // recorded, then refills (thin corpus)
    expect(
      result.capEvents.some((e) => e.bucketKind === "platform" && e.bucket === "x" && e.claimId === 3),
    ).toBe(true);
    expect(result.selected).toHaveLength(4);
  });

  it("Gate-3 reviewer probe: a wire-service flood over an ALL-NULL-platform corpus yields a mixed selection, never 20/0", () => {
    // the REALISTIC corpus shape: RSS records carry platform null. Under the
    // old shared-"none" platform bucket, the ten independent domains were
    // capped as one platform and the refill re-concentrated the flood → 20/0.
    const flood = Array.from({ length: 80 }, (_, i) =>
      rec(i + 1, { sourceReliability: 0.99, domain: "flood.example", platform: null }),
    );
    const rest = Array.from({ length: 10 }, (_, i) =>
      rec(200 + i, { sourceReliability: 0.2, domain: `indie-${i}.example`, platform: null }),
    );
    const limits = { maxCandidates: 20, textByteBudget: 20_000, mixCapFraction: 0.4 };
    const result = selectEvidence([...flood, ...rest], limits);
    // cap = 8: pass 1 takes 8 flood + ALL 10 independents; pass 2 refills the
    // 2 free slots from the only capped domain
    expect(result.selected.filter((r) => r.claimId >= 200)).toHaveLength(10);
    expect(result.selected.filter((r) => r.claimId <= 80)).toHaveLength(10);
    expect(result.selected).toHaveLength(20);
  });

  it("null platform is exempt from platform bucketing; explicit platforms still cap", () => {
    const flood = Array.from({ length: 80 }, (_, i) =>
      rec(i + 1, { sourceReliability: 0.99, domain: "flood.example", platform: "x" }),
    );
    const rest = Array.from({ length: 10 }, (_, i) =>
      rec(200 + i, { sourceReliability: 0.2, domain: `indie-${i}.example`, platform: null }),
    );
    const limits = { maxCandidates: 20, textByteBudget: 20_000, mixCapFraction: 0.4 };
    const result = selectEvidence([...flood, ...rest], limits);
    // no platform cap event may name a null platform, and all independents land
    expect(result.selected.filter((r) => r.claimId >= 200)).toHaveLength(10);
    expect(result.capEvents.every((e) => e.bucketKind === "source" || e.bucket !== "none")).toBe(
      true,
    );
    expect(result.selected).toHaveLength(20);
  });

  it("pass-2 refill round-robins across capped domains (house source-mix overflow rule)", () => {
    // two capped domains, A more reliable than B: the two freed slots must
    // split A5+B5, never re-concentrate as A5+A6
    const a = Array.from({ length: 8 }, (_, i) =>
      rec(i + 1, { sourceReliability: 0.9, domain: "a.example", platform: null }),
    );
    const b = Array.from({ length: 8 }, (_, i) =>
      rec(100 + i, { sourceReliability: 0.8, domain: "b.example", platform: null }),
    );
    const limits = { maxCandidates: 10, textByteBudget: 20_000, mixCapFraction: 0.4 };
    const result = selectEvidence([...a, ...b], limits);
    const ids = result.selected.map((r) => r.claimId);
    expect(ids.filter((id) => id < 100)).toHaveLength(5); // a1-4 + a5 refill
    expect(ids.filter((id) => id >= 100)).toHaveLength(5); // b1-4 + b5 refill
    expect(ids).toContain(5);
    expect(ids).toContain(104);
  });
});

describe("bounds (measured and enforced)", () => {
  it("pins the default limits", () => {
    expect(EVIDENCE_MAX_CANDIDATES).toBe(100);
    expect(EVIDENCE_TEXT_BYTE_BUDGET).toBe(48_000);
    expect(EVIDENCE_MIX_CAP_FRACTION).toBe(0.4);
    expect(DEFAULT_SELECTION_LIMITS).toEqual({
      maxCandidates: 100,
      textByteBudget: 48_000,
      mixCapFraction: 0.4,
    });
  });

  it("measures selected text bytes (UTF-8) and enforces the byte budget", () => {
    const records = [
      rec(1, { text: "a".repeat(100), domain: "a.example" }),
      rec(2, { text: "b".repeat(100), domain: "b.example" }),
      rec(3, { text: "c".repeat(100), domain: "c.example" }),
    ];
    const limits = { maxCandidates: 10, textByteBudget: 250, mixCapFraction: 0.4 };
    const result = selectEvidence(records, limits);
    expect(result.selected.map((r) => r.claimId)).toEqual([1, 2]);
    expect(result.budgetOut.map((r) => r.claimId)).toEqual([3]);
    expect(result.cappedOut).toEqual([]);
    expect(result.bounds.totalTextBytes).toBe(200);
    expect(result.bounds.maxRecordTextBytes).toBe(100);
  });

  it("counts multi-byte characters by UTF-8 bytes, not code units", () => {
    const records = [rec(1, { text: "п".repeat(50) })]; // 100 UTF-8 bytes
    const result = selectEvidence(records, {
      maxCandidates: 5,
      textByteBudget: 120,
      mixCapFraction: 0.4,
    });
    expect(result.bounds.totalTextBytes).toBe(100);
  });

  it("enforces the maxCandidates count bound with budget_out diagnostics", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      rec(i + 1, { domain: `d${i}.example`, platform: `p${i}` }),
    );
    const result = selectEvidence(records, {
      maxCandidates: 4,
      textByteBudget: 10_000,
      mixCapFraction: 0.4,
    });
    expect(result.selected).toHaveLength(4);
    expect(result.budgetOut.map((r) => r.claimId)).toEqual([5, 6]);
  });

  it("refuses limits outside the pinned ceilings (fail-closed; NaN refused; only NARROWING allowed)", () => {
    for (const limits of [
      { maxCandidates: 0, textByteBudget: 100, mixCapFraction: 0.4 },
      { maxCandidates: 101, textByteBudget: 100, mixCapFraction: 0.4 },
      { maxCandidates: 10, textByteBudget: 0, mixCapFraction: 0.4 },
      { maxCandidates: 10, textByteBudget: 48_001, mixCapFraction: 0.4 },
      { maxCandidates: 10, textByteBudget: 100, mixCapFraction: 0 },
      { maxCandidates: 10, textByteBudget: 100, mixCapFraction: 1.5 },
      // NaN passes every </> comparison silently — must be refused explicitly
      { maxCandidates: NaN, textByteBudget: 100, mixCapFraction: 0.4 },
      { maxCandidates: 10, textByteBudget: NaN, mixCapFraction: 0.4 },
      { maxCandidates: 10, textByteBudget: 100, mixCapFraction: NaN },
      // the frozen fraction is itself the ceiling: 0.5 would LOOSEN the quota
      { maxCandidates: 10, textByteBudget: 100, mixCapFraction: 0.5 },
    ]) {
      expect(() => selectEvidence([rec(1)], limits)).toThrow(ConflictDomainError);
    }
    // narrowing stays allowed
    expect(() =>
      selectEvidence([rec(1)], { maxCandidates: 10, textByteBudget: 100, mixCapFraction: 0.3 }),
    ).not.toThrow();
  });
});

describe("primary document (cap bucket identity)", () => {
  it("is the earliest-ingested non-mirror doc, docId tie-break, mirrors never primary", () => {
    const docs = [
      doc({ docId: 30, fetchedAt: "2026-08-10T05:00:00Z", mirrorOfDocId: 10, sourceDomain: "mirror.example" }),
      doc({ docId: 10, fetchedAt: "2026-08-10T08:00:00Z", sourceDomain: "late.example" }),
      doc({ docId: 20, fetchedAt: "2026-08-10T06:00:00Z", sourceDomain: "early.example" }),
    ];
    expect(primaryDoc(docs)?.sourceDomain).toBe("early.example");
    // unparseable fetchedAt loses to a parseable one; docId breaks full ties
    const docs2 = [
      doc({ docId: 2, fetchedAt: null, sourceDomain: "nofetch.example" }),
      doc({ docId: 1, fetchedAt: "2026-08-10T09:00:00Z", sourceDomain: "parsed.example" }),
    ];
    expect(primaryDoc(docs2)?.sourceDomain).toBe("parsed.example");
    expect(primaryDoc([doc({ mirrorOfDocId: 1 })])).toBeNull();
  });
});
