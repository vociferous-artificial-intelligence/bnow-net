import { describe, expect, it } from "vitest";
import {
  collectSignalEvidenceIds, detectDataDark, detectPurge, detectTradeDivergence,
  evidenceForSignal, groupEvidenceRows, rankSignals, toPublicSignal,
  type PressureClaim, type Signal, type SignalEvidenceRow,
} from "./signals";

const NOW = "2026-07-06T12:00:00Z";

describe("detectPurge", () => {
  const mk = (id: number, name: string, role: string, date: string): PressureClaim => ({
    claimId: id, entityName: name, entityKind: "person", role, claimDate: date,
  });
  it("fires on >=3 distinct targets in window", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-07-03"),
      mk(3, "Sidorov", "target", "2026-07-05"),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("purge");
    expect(s!.evidenceClaimIds).toEqual([1, 2, 3]);
  });
  it("dedupes evidenceClaimIds when one claim names >1 watched entity (B1)", () => {
    // mirrors the live shape: 32 (claim, entity, role) edges over 30 distinct claims —
    // scaled down here to 2 claims each carrying 2 entity edges among 4 single-edge
    // claims, so 8 edges collapse to 6 distinct ids.
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(1, "Sidorov", "defendant", "2026-07-01"), // same claim, second watched entity
      mk(2, "Petrov", "dismissed", "2026-07-02"),
      mk(2, "Orlova", "target", "2026-07-02"), // same claim, second watched entity
      mk(3, "Volkov", "defendant", "2026-07-03"),
      mk(4, "Zaitsev", "target", "2026-07-04"),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s).not.toBeNull();
    expect(s!.evidenceClaimIds).toEqual([1, 2, 3, 4]); // 6 edges -> 4 distinct claim ids
    expect(s!.evidenceClaimIds).toHaveLength(new Set(s!.evidenceClaimIds).size);
  });
  it("does not fire below threshold or outside window", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-05-01"), // outside 14d
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })).toBeNull();
  });
  it("ignores non-pressure roles", () => {
    const claims = [
      mk(1, "A", "prosecutor", "2026-07-01"),
      mk(2, "B", "beneficiary", "2026-07-02"),
      mk(3, "C", "other", "2026-07-03"),
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })).toBeNull();
  });
  it("escalates severity when doubled", () => {
    const claims = Array.from({ length: 6 }, (_, i) =>
      mk(i + 1, `P${i}`, "defendant", "2026-07-02"));
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s!.severity).toBe("elevated");
  });
});

describe("detectDataDark", () => {
  it("fires on classified/gone series, escalates on recent change", () => {
    const s = detectDataDark(
      [
        { key: "a", label: "Demographics", status: "classified", changedRecently: true },
        { key: "b", label: "Oil output", status: "gone", changedRecently: false },
        { key: "c", label: "CBR rate", status: "ok", changedRecently: false },
      ],
      "ru", NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.severity).toBe("elevated");
    expect(s!.evidenceRefs).toEqual(["a", "b"]);
  });
  it("silent when nothing dark", () => {
    expect(detectDataDark([{ key: "c", label: "x", status: "ok", changedRecently: false }], "ru", NOW)).toBeNull();
  });
});

describe("detectTradeDivergence", () => {
  it("fires on dual-use flags, ignores All goods", () => {
    const s = detectTradeDivergence(
      [
        { reporterName: "UAE", hsLabel: "Computers", reason: "12.9× baseline" },
        { reporterName: "China", hsLabel: "All goods", reason: "1.7×" },
      ],
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.detail).toContain("UAE");
    expect(s!.detail).not.toContain("All goods");
  });
});

describe("rankSignals", () => {
  it("orders elevated before watch before info", () => {
    const sig = (sev: Signal["severity"], kind: string): Signal => ({
      key: kind, kind, theater: "ru", severity: sev, headline: "", detail: "",
      evidenceClaimIds: [], evidenceRefs: [], at: NOW,
    });
    const ranked = rankSignals([sig("info", "a"), sig("elevated", "b"), sig("watch", "c")]);
    expect(ranked.map((s) => s.severity)).toEqual(["elevated", "watch", "info"]);
  });
});

describe("collectSignalEvidenceIds", () => {
  const sig = (ids: number[]): Signal => ({
    key: "k", kind: "purge", theater: "ru", severity: "watch", headline: "", detail: "",
    evidenceClaimIds: ids, evidenceRefs: [], at: NOW,
  });
  it("unions ids across signals, deduped, dropping empty (evidenceRefs-only) signals", () => {
    expect(collectSignalEvidenceIds([sig([1, 2]), sig([2, 3]), sig([])])).toEqual([1, 2, 3]);
  });
  it("empty when no signal carries claim evidence", () => {
    expect(collectSignalEvidenceIds([sig([])])).toEqual([]);
  });
});

describe("groupEvidenceRows + evidenceForSignal", () => {
  const row = (over: Partial<SignalEvidenceRow>): SignalEvidenceRow => ({
    claim_id: 1, text: "claim text", hedging: "assessed", claim_date: "2026-07-01",
    doc_id: 1, doc_url: "https://example.com/1", doc_title: "t", adapter: "rss",
    source_id: 1, source_key: "src1", reliability: "0.75", source_platform: "rss",
    doc_at: "2026-07-01T00:00:00Z",
    ...over,
  });

  it("groups multiple doc rows for the same claim into one EvidenceClaim with all docs", () => {
    const rows = [
      row({ claim_id: 1, doc_id: 1 }),
      row({ claim_id: 1, doc_id: 2, source_key: "src2" }),
      row({ claim_id: 2, doc_id: 3, text: "other claim" }),
    ];
    const byClaim = groupEvidenceRows(rows);
    expect(byClaim.size).toBe(2);
    expect(byClaim.get(1)!.docs.map((d) => d.docId)).toEqual([1, 2]);
    expect(byClaim.get(2)!.text).toBe("other claim");
  });

  it("coerces the wire-string numeric reliability to a number, preserving null", () => {
    const byClaim = groupEvidenceRows([row({ reliability: "0.75" }), row({ claim_id: 2, reliability: null, doc_id: 2 })]);
    expect(byClaim.get(1)!.docs[0].reliability).toBe(0.75);
    expect(byClaim.get(2)!.docs[0].reliability).toBeNull();
  });

  it("evidenceForSignal returns claims in the signal's own id order and skips ids missing from the map", () => {
    const byClaim = groupEvidenceRows([row({ claim_id: 5 }), row({ claim_id: 2, doc_id: 2 })]);
    const signal: Signal = {
      key: "k", kind: "purge", theater: "ru", severity: "watch", headline: "", detail: "",
      evidenceClaimIds: [2, 999, 5], // 999 never came back from the query
      evidenceRefs: [], at: NOW,
    };
    expect(evidenceForSignal(signal, byClaim).map((c) => c.claimId)).toEqual([2, 5]);
  });
});

describe("toPublicSignal — the teaser withheld of specifics (IA refinement TASK 3)", () => {
  // A realistic purge signal whose detail names living individuals.
  const purge = detectPurge(
    [
      { claimId: 11, entityName: "Ivanov", entityKind: "person", role: "defendant", claimDate: "2026-07-01" },
      { claimId: 12, entityName: "Petrov", entityKind: "person", role: "dismissed", claimDate: "2026-07-03" },
      { claimId: 13, entityName: "Sidorov", entityKind: "person", role: "target", claimDate: "2026-07-05" },
    ],
    { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW },
  )!;

  it("keeps only the safe teaser fields and an aggregate evidence count", () => {
    const pub = toPublicSignal(purge);
    expect(pub).toEqual({
      key: purge.key,
      kind: "purge",
      theater: "ru",
      severity: purge.severity,
      headline: purge.headline,
      evidenceCount: 3,
    });
  });

  it("drops `detail`, `evidenceClaimIds` and `evidenceRefs` entirely", () => {
    const pub = toPublicSignal(purge) as unknown as Record<string, unknown>;
    expect("detail" in pub).toBe(false);
    expect("evidenceClaimIds" in pub).toBe(false);
    expect("evidenceRefs" in pub).toBe(false);
  });

  it("leaks no named individual — the projection's serialized JSON contains no target name", () => {
    // detail names the targets (detectPurge lower-cases them); the projection must not,
    // at any depth or case.
    expect(purge.detail.toLowerCase()).toContain("ivanov");
    const json = JSON.stringify(toPublicSignal(purge)).toLowerCase();
    for (const name of ["ivanov", "petrov", "sidorov"]) {
      expect(json).not.toContain(name);
    }
  });

  it("headline itself is a count-only teaser (no target name)", () => {
    const pub = toPublicSignal(purge);
    for (const name of ["ivanov", "petrov", "sidorov"]) {
      expect(pub.headline.toLowerCase()).not.toContain(name);
    }
    expect(pub.headline).toMatch(/officials under prosecution\/dismissal/);
  });
});
