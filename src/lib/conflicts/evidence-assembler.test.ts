import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  eligibilityByClaim,
  timeAnchorTreatments,
  EVIDENCE_MAX_INTAKE,
  type AssemblerReport,
  type CorpusRecallAssembly,
  type CorpusRecallClaimSource,
  type EvidenceRequest,
  type PublishedRetentionAssembly,
  type PublishedRetentionClaimSource,
} from "./evidence-assembler";
import type { CandidateClaim, CandidateDoc } from "./evidence-records";

let nextDoc = 1;
function doc(overrides: Partial<CandidateDoc> = {}): CandidateDoc {
  return {
    docId: nextDoc++,
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

let nextClaim = 1;
function claim(overrides: Partial<CandidateClaim> = {}): CandidateClaim {
  return {
    claimId: nextClaim++,
    theater: "ua",
    track: "military",
    text: "Ukrainian units repelled Russian assaults near Kupiansk on August 10.",
    hedging: "claimed",
    claimDate: "2026-08-10",
    docs: [doc()],
    engine: "mapreduce",
    currentExtractorVersion: true,
    extractorVersion: null,
    published: true,
    stub: false,
    sourceReliability: null,
    ...overrides,
  };
}

const ROCA_REPORT: AssemblerReport = {
  series: "roca",
  editionKey: "roca:2026-08-10:final",
  reportDate: "2026-08-10",
  cutoffAt: "2026-08-10T19:45:00Z",
  publishedAt: "2026-08-10T23:30:00Z",
};

const IRAN_REPORT: AssemblerReport = {
  series: "iran_update",
  editionKey: "iran_update:2026-08-08:final",
  reportDate: "2026-08-08",
  cutoffAt: "2026-08-08T16:00:00Z",
  publishedAt: "2026-08-08T21:30:00Z",
};

function sourceOf(claims: readonly CandidateClaim[]): CorpusRecallClaimSource &
  PublishedRetentionClaimSource {
  return {
    async corpusRecallCandidates() {
      return claims;
    },
    async publishedRetentionCandidates() {
      return claims.filter((c) => c.published);
    },
  };
}

function request(overrides: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    conflictId: "russia_ukraine",
    kind: "retrospective",
    report: ROCA_REPORT,
    snapshot: null,
    ...overrides,
  };
}

describe("the two assemblies are structurally separate (contract §6.1; register #4)", () => {
  it("population discriminants are incompatible at the type level", async () => {
    const source = sourceOf([claim()]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    const retention = await assemblePublishedRetentionEvidence(request(), source);
    if (corpus.status !== "assembled" || retention.status !== "assembled") {
      throw new Error("expected assembled");
    }
    const c: CorpusRecallAssembly = corpus.assembly;
    const r: PublishedRetentionAssembly = retention.assembly;
    expect(c.population).toBe("corpus_recall");
    expect(r.population).toBe("published_retention");
    // @ts-expect-error a corpus-recall assembly can never BE a retention assembly
    const wrong1: PublishedRetentionAssembly = corpus.assembly;
    // @ts-expect-error nor the reverse
    const wrong2: CorpusRecallAssembly = retention.assembly;
    void wrong1;
    void wrong2;
    // record types are incompatible too
    // @ts-expect-error corpus-recall records are not retention records
    const wrongRec: (typeof r.records)[number] = c.records[0];
    void wrongRec;
  });

  it("evidence existence never implies retention: unpublished corpus members are absent from retention", async () => {
    const kept = claim({ published: false });
    const source = sourceOf([kept]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    const retention = await assemblePublishedRetentionEvidence(request(), source);
    if (corpus.status !== "assembled" || retention.status !== "assembled") {
      throw new Error("expected assembled");
    }
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([kept.claimId]);
    expect(retention.assembly.records).toHaveLength(0);
  });
});

describe("fail-closed refusals (before any candidate access)", () => {
  it("publication gap → unavailable publication_gap; the source is never consulted", async () => {
    const source: CorpusRecallClaimSource = {
      async corpusRecallCandidates() {
        throw new Error("source must not be consulted on a gap");
      },
    };
    const result = await assembleCorpusRecallEvidence(request({ report: null }), source);
    expect(result).toEqual({
      status: "unavailable",
      population: "corpus_recall",
      conflictId: "russia_ukraine",
      kind: "retrospective",
      reason: "publication_gap",
    });
  });

  it("snapshot-anchored kinds refuse with no_proven_snapshot (register #5)", async () => {
    const source = sourceOf([claim()]);
    for (const kind of ["operational_cutoff", "at_publication", "finalized"] as const) {
      const result = await assembleCorpusRecallEvidence(request({ kind }), source);
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") expect(result.reason).toBe("no_proven_snapshot");
      const retention = await assemblePublishedRetentionEvidence(request({ kind }), source);
      expect(retention.status).toBe("unavailable");
    }
  });

  it("a non-null snapshot is a typed refusal (ConflictSnapshotRef is Phase 5)", async () => {
    const source = sourceOf([claim()]);
    await expect(
      assembleCorpusRecallEvidence(
        request({ snapshot: { fake: true } as unknown as null }),
        source,
      ),
    ).rejects.toThrow(ConflictDomainError);
  });

  it("a cross-wired report series is a typed refusal (iran_regional + ROCA report)", async () => {
    const source = sourceOf([claim()]);
    await expect(
      assembleCorpusRecallEvidence(
        request({ conflictId: "iran_regional", report: ROCA_REPORT }),
        source,
      ),
    ).rejects.toThrow(/reference series/);
    await expect(
      assemblePublishedRetentionEvidence(
        request({ conflictId: "iran_regional", report: ROCA_REPORT }),
        source,
      ),
    ).rejects.toThrow(ConflictDomainError);
    // …and the mirror-image wiring refuses too
    await expect(
      assembleCorpusRecallEvidence(request({ report: IRAN_REPORT }), source),
    ).rejects.toThrow(/reference series/);
  });

  it("a duplicate claimId within one candidate batch is a typed refusal", async () => {
    const dup = claim();
    const source = sourceOf([dup, { ...dup }]);
    await expect(assembleCorpusRecallEvidence(request(), source)).rejects.toThrow(
      /duplicate claimId/,
    );
    await expect(assemblePublishedRetentionEvidence(request(), source)).rejects.toThrow(
      ConflictDomainError,
    );
  });

  it("candidate intake refuses NaN reliability, non-integer claimIds, and oversized text", async () => {
    await expect(
      assembleCorpusRecallEvidence(request(), sourceOf([claim({ sourceReliability: NaN })])),
    ).rejects.toThrow(/sourceReliability/);
    for (const claimId of [0, -3, 1.5, NaN]) {
      await expect(
        assembleCorpusRecallEvidence(request(), sourceOf([claim({ claimId })])),
      ).rejects.toThrow(/claimId/);
    }
    await expect(
      assembleCorpusRecallEvidence(request(), sourceOf([claim({ text: "x".repeat(4097) })])),
    ).rejects.toThrow(/EVIDENCE_MAX_RECORD_TEXT_BYTES/);
    // at the ceiling is fine
    const ok = await assembleCorpusRecallEvidence(
      request(),
      sourceOf([claim({ text: "земля".repeat(409) + "x" })]), // 4091 UTF-8 bytes
    );
    expect(ok.status).toBe("assembled");
  });

  it("intake ceiling: 1000 candidates accepted, 1001 refused visibly (never truncated)", async () => {
    expect(EVIDENCE_MAX_INTAKE).toBe(1000);
    const mk = (n: number) => Array.from({ length: n }, (_, i) => claim({ claimId: 500_000 + i }));
    const atLimit = await assembleCorpusRecallEvidence(request(), sourceOf(mk(1000)));
    expect(atLimit.status).toBe("assembled");
    if (atLimit.status === "assembled") {
      expect(atLimit.assembly.eligibleCount).toBe(1000); // nothing silently dropped
    }
    await expect(assembleCorpusRecallEvidence(request(), sourceOf(mk(1001)))).rejects.toThrow(
      /EVIDENCE_MAX_INTAKE/,
    );
  });

  it("bad selection limits refuse in prepare(), BEFORE any source fetch", async () => {
    let calls = 0;
    const counting: CorpusRecallClaimSource = {
      async corpusRecallCandidates() {
        calls++;
        return [claim()];
      },
    };
    await expect(
      assembleCorpusRecallEvidence(
        request({ limits: { maxCandidates: 10, textByteBudget: 100, mixCapFraction: 0.5 } }),
        counting,
      ),
    ).rejects.toThrow(ConflictDomainError);
    await expect(
      assembleCorpusRecallEvidence(
        request({ limits: { maxCandidates: NaN, textByteBudget: 100, mixCapFraction: 0.4 } }),
        counting,
      ),
    ).rejects.toThrow(ConflictDomainError);
    expect(calls).toBe(0); // a bad limits object never costs a candidate query
  });

  it("a prose-bearing editionKey is a typed refusal (output-smuggling channel closed)", async () => {
    const source = sourceOf([claim()]);
    for (const editionKey of [
      "roca:2026-08-10:final PLUS smuggled prose about invented events",
      "arbitrary caller text with no key shape at all",
      "roca:2026-08-11:final", // date segment disagrees with reportDate
    ]) {
      await expect(
        assembleCorpusRecallEvidence(request({ report: { ...ROCA_REPORT, editionKey } }), source),
      ).rejects.toThrow(/report identity invalid/);
    }
  });

  it("a report object carrying keys beyond the AssemblerReport allowlist is refused", async () => {
    const source = sourceOf([claim()]);
    // a units-bearing fixture-shaped report IS structurally assignable to
    // AssemblerReport — the runtime allowlist is the defense in depth
    const poisoned = {
      ...ROCA_REPORT,
      units: [{ unitId: "u1", text: "reference unit text that must never enter" }],
    } as unknown as AssemblerReport;
    await expect(
      assembleCorpusRecallEvidence(request({ report: poisoned }), source),
    ).rejects.toThrow(/allowlist/);
    await expect(
      assemblePublishedRetentionEvidence(request({ report: poisoned }), source),
    ).rejects.toThrow(ConflictDomainError);
  });

  it("unknown conflict ids and malformed report dates throw typed errors", async () => {
    const source = sourceOf([claim()]);
    await expect(
      assembleCorpusRecallEvidence(
        request({ conflictId: "middle_east" as never }),
        source,
      ),
    ).rejects.toThrow(ConflictDomainError);
    await expect(
      assembleCorpusRecallEvidence(
        request({ report: { ...ROCA_REPORT, reportDate: "08/10/2026" } }),
        source,
      ),
    ).rejects.toThrow(ConflictDomainError);
  });
});

describe("comparability honesty (contract §5)", () => {
  const legacyBh = () =>
    claim({
      theater: "bh",
      engine: "legacy",
      currentExtractorVersion: false,
      text: "Gulf reporting claimed increased interceptor stocks at a base in Bahrain.",
      claimDate: "2026-08-08",
      published: true,
    });

  it("legacy claims CANNOT enter corpus recall; the lane reports unavailable_incomparable", async () => {
    const source = sourceOf([legacyBh()]);
    const corpus = await assembleCorpusRecallEvidence(
      request({ conflictId: "iran_regional", report: IRAN_REPORT }),
      source,
    );
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records).toHaveLength(0);
    expect(corpus.assembly.excluded[0].record).toEqual({
      included: false,
      reason: "legacy_incomparable",
    });
    expect(corpus.assembly.laneDiagnostics).toEqual({ maritime: "unavailable_incomparable" });
    expect(corpus.assembly.incomparableTheaters).toEqual([
      "il",
      "sa",
      "ae",
      "qa",
      "om",
      "bh",
      "kw",
    ]);
  });

  it("a lane with comparable mapped evidence does NOT report the diagnostic even beside legacy exclusions", async () => {
    const mapped = claim({
      theater: "ir",
      text: "IRGC Navy fast boats shadowed a tanker in the Strait of Hormuz.",
      claimDate: "2026-08-08",
    });
    const source = sourceOf([legacyBh(), mapped]);
    const corpus = await assembleCorpusRecallEvidence(
      request({ conflictId: "iran_regional", report: IRAN_REPORT }),
      source,
    );
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([mapped.claimId]);
    expect(corpus.assembly.laneDiagnostics).toEqual({});
  });

  it("legacy claims ARE retention members, labeled legacy, never map-equivalent", async () => {
    const source = sourceOf([legacyBh()]);
    const retention = await assemblePublishedRetentionEvidence(
      request({ conflictId: "iran_regional", report: IRAN_REPORT }),
      source,
    );
    if (retention.status !== "assembled") throw new Error("expected assembled");
    expect(retention.assembly.records).toHaveLength(1);
    expect(retention.assembly.records[0].legacy).toBe(true);
    expect(retention.assembly.records[0].provenance).toBe("legacy");
    expect(retention.assembly.legacyMemberCount).toBe(1);
  });
});

describe("Gate-3 adversarial shapes at the assembly level", () => {
  it("a high-volume irrelevant region cannot crowd out one relevant claim", async () => {
    const noise = Array.from({ length: 60 }, (_, i) =>
      claim({
        claimId: 5000 + i,
        theater: "ir",
        text: `A Gulf retail chain posted record quarterly earnings, filing ${i}.`,
        claimDate: "2026-08-08",
        docs: [doc({ sourceDomain: "gulf-business-daily.example" })],
      }),
    );
    const relevant = claim({
      claimId: 4999,
      theater: "ir",
      text: "Hezbollah claimed rocket salvos against positions in the Galilee.",
      claimDate: "2026-08-08",
    });
    const source = sourceOf([...noise, relevant]);
    const corpus = await assembleCorpusRecallEvidence(
      request({ conflictId: "iran_regional", report: IRAN_REPORT }),
      source,
    );
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([4999]);
    expect(corpus.assembly.excluded).toHaveLength(60);
    expect(corpus.assembly.excluded.every((e) => e.record.reason === "off_scope")).toBe(true);
    expect(corpus.assembly.selection.selected.map((r) => r.claimId)).toEqual([4999]);
  });

  it("cross-theater relevance: a ua-corpus claim serves the combined conflict; ru is equally valid", async () => {
    const uaClaim = claim({ theater: "ua" });
    const ruClaim = claim({
      theater: "ru",
      text: "Russian troops advanced southeast of Siversk toward the rail line.",
    });
    const source = sourceOf([uaClaim, ruClaim]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.theater).sort()).toEqual(["ru", "ua"]);
  });

  it("cross-day recurring templates: identical text on distant days is separated by the window, not collapsed (ruling 12 shape)", async () => {
    const text = "Russian shelling struck a market building in Kostiantynivka.";
    const near = claim({ text, claimDate: "2026-08-10" });
    const far = claim({ text, claimDate: "2026-08-03" });
    const source = sourceOf([near, far]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([near.claimId]);
    const excluded = corpus.assembly.excluded.find((e) => e.claimId === far.claimId)!;
    expect(excluded.record).toEqual({ included: false, reason: "off_window" });
    // the assembler carries NO unit verdicts: same-event vs recurring-template
    // for IN-window claims is the Phase 4 matcher's decision
    expect("unitVerdicts" in corpus.assembly).toBe(false);
  });

  it("mirrors across adapters: mirror-only claims are excluded; mirror links survive on records", async () => {
    const canonical = claim({
      docs: [doc({ docId: 800, adapter: "rss" })],
      text: "A drone strike damaged port infrastructure in Odesa overnight.",
    });
    const mirror = claim({
      docs: [doc({ adapter: "telegram-web", platform: "telegram", mirrorOfDocId: 800 })],
      text: "A repost described the same Odesa port drone strike.",
    });
    const source = sourceOf([canonical, mirror]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([canonical.claimId]);
    expect(
      corpus.assembly.excluded.find((e) => e.claimId === mirror.claimId)?.record,
    ).toEqual({ included: false, reason: "mirror_only" });
  });

  it("superseded versions never double-count beside current ones", async () => {
    const current = claim();
    const superseded = claim({
      currentExtractorVersion: false,
      text: current.text,
      claimDate: current.claimDate,
    });
    const source = sourceOf([current, superseded]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(corpus.assembly.records.map((r) => r.claimId)).toEqual([current.claimId]);
    expect(
      corpus.assembly.excluded.find((e) => e.claimId === superseded.claimId)?.record,
    ).toEqual({ included: false, reason: "superseded_version" });
  });
});

describe("assembly mechanics", () => {
  it("selection is deterministic and bounded; bounds are measured on the result", async () => {
    const claims = Array.from({ length: 8 }, (_, i) =>
      claim({
        claimId: 100 + i,
        docs: [doc({ sourceDomain: `d${i}.example` })],
      }),
    );
    const source = sourceOf(claims);
    const limits = { maxCandidates: 5, textByteBudget: 10_000, mixCapFraction: 0.4 };
    const first = await assembleCorpusRecallEvidence(request({ limits }), source);
    const second = await assembleCorpusRecallEvidence(request({ limits }), source);
    expect(first).toEqual(second);
    if (first.status !== "assembled") throw new Error("expected assembled");
    expect(first.assembly.selection.selected.map((r) => r.claimId)).toEqual([
      100, 101, 102, 103, 104,
    ]);
    expect(first.assembly.selection.bounds.selectedCount).toBe(5);
    expect(first.assembly.selection.bounds.totalTextBytes).toBeGreaterThan(0);
    // eligibility is NOT changed by selection: displaced records stay eligible
    expect(first.assembly.eligibleCount).toBe(8);
    expect(
      first.assembly.selection.selected.length +
        first.assembly.selection.cappedOut.length +
        first.assembly.selection.budgetOut.length,
    ).toBe(8);
  });

  it("eligibilityByClaim projects the fixture expected.eligibility shape", async () => {
    const inc = claim();
    const exc = claim({ stub: true });
    const source = sourceOf([inc, exc]);
    const corpus = await assembleCorpusRecallEvidence(request(), source);
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    const map = eligibilityByClaim(corpus.assembly);
    expect(map[String(inc.claimId)].included).toBe(true);
    expect(map[String(exc.claimId)]).toEqual({ included: false, reason: "stub_fixture" });
  });

  it("assembly output is deterministic: shuffled candidate order deep-equals unshuffled", async () => {
    const claims = [
      claim({ sourceReliability: 0.9 }),
      claim({ sourceReliability: null }),
      claim({ sourceReliability: 0.4, stub: true }), // excluded: stub_fixture
      claim({ theater: "xx" }), // excluded: off_scope
      claim({ sourceReliability: 0.7 }),
    ];
    const shuffled = [claims[3], claims[1], claims[4], claims[0], claims[2]];
    const a = await assembleCorpusRecallEvidence(request(), sourceOf(claims));
    const b = await assembleCorpusRecallEvidence(request(), sourceOf(shuffled));
    expect(b).toEqual(a);
    const ra = await assemblePublishedRetentionEvidence(request(), sourceOf(claims));
    const rb = await assemblePublishedRetentionEvidence(request(), sourceOf(shuffled));
    expect(rb).toEqual(ra);
    if (a.status !== "assembled") throw new Error("expected assembled");
    // records follow the pinned total order (reliability desc nulls-last,
    // claimId asc), and exclusions follow claimId ascending — not source order
    expect(a.assembly.records.map((r) => r.sourceReliability)).toEqual([0.9, 0.7, null]);
    expect(a.assembly.excluded.map((e) => e.claimId)).toEqual(
      [claims[2].claimId, claims[3].claimId].sort((x, y) => x - y),
    );
  });

  it("assemblies are BYTE-deterministic under shuffled candidates, per-claim doc order, and mirror order", async () => {
    // toEqual is key-order-blind; these assertions are JSON.stringify equality
    const mkDocs = (base: number, domain: string): CandidateDoc[] => [
      doc({ docId: base + 1, sourceDomain: domain, fetchedAt: "2026-08-10T07:00:00Z" }),
      // the SAME instant, byte-different spelling — must resolve by docId
      doc({ docId: base + 2, sourceDomain: domain, fetchedAt: "2026-08-10T07:00:00.000+00:00" }),
      doc({ docId: base + 3, sourceDomain: "mirror.example", mirrorOfDocId: base + 1 }),
    ];
    const c1 = claim({ sourceReliability: 0.9, docs: mkDocs(100, "a.example") });
    const c2 = claim({ sourceReliability: 0.4, docs: mkDocs(200, "b.example") });
    const c3 = claim({ stub: true, docs: mkDocs(300, "c.example") }); // excluded
    const shuffleDocs = (c: CandidateClaim): CandidateClaim => ({
      ...c,
      docs: [c.docs[2], c.docs[1], c.docs[0]], // mirror first, ingest-tie reversed
    });
    const A = [c1, c2, c3];
    const B = [shuffleDocs(c3), shuffleDocs(c1), shuffleDocs(c2)];
    const a1 = await assembleCorpusRecallEvidence(request(), sourceOf(A));
    const b1 = await assembleCorpusRecallEvidence(request(), sourceOf(B));
    expect(JSON.stringify(b1)).toBe(JSON.stringify(a1));
    const a2 = await assemblePublishedRetentionEvidence(request(), sourceOf(A));
    const b2 = await assemblePublishedRetentionEvidence(request(), sourceOf(B));
    expect(JSON.stringify(b2)).toBe(JSON.stringify(a2));
    if (a1.status !== "assembled") throw new Error("expected assembled");
    // canonical per-record doc order (docId asc, mirrors included) and the
    // docId tie-break on the equal-instant ingest pair
    expect(a1.assembly.records[0].sourceDocumentIds).toEqual([101, 102, 103]);
    expect(a1.assembly.records[0].earliestIngestAt).toBe("2026-08-10T07:00:00Z");
  });

  it("laneDiagnostics keys are lane-sorted and byte-stable under candidate reordering", async () => {
    // two legacy claims classifying into two DIFFERENT iran lanes, no
    // comparable records: both lanes report unavailable_incomparable and the
    // serialized key order is the sorted lane order either way
    const maritime = claim({
      theater: "bh",
      engine: "legacy",
      currentExtractorVersion: false,
      text: "Gulf reporting claimed increased interceptor stocks at a base in Bahrain.",
      claimDate: "2026-08-08",
    });
    const kinetic = claim({
      theater: "sa",
      engine: "legacy",
      currentExtractorVersion: false,
      text: "A drone strike reportedly struck a depot near a Saudi base on August 8.",
      claimDate: "2026-08-08",
    });
    const req = request({ conflictId: "iran_regional", report: IRAN_REPORT });
    const fwd = await assembleCorpusRecallEvidence(req, sourceOf([maritime, kinetic]));
    const rev = await assembleCorpusRecallEvidence(req, sourceOf([kinetic, maritime]));
    expect(JSON.stringify(rev)).toBe(JSON.stringify(fwd));
    if (fwd.status !== "assembled") throw new Error("expected assembled");
    const lanes = Object.keys(fwd.assembly.laneDiagnostics);
    expect(lanes.length).toBeGreaterThanOrEqual(2);
    expect(lanes).toEqual([...lanes].sort());
  });

  it("extra keys on source doc objects never leak into assembly output (docs rebuilt)", async () => {
    const poisonedDoc = {
      ...doc({ sourceDomain: "poison.example" }),
      unitText: "SMUGGLEDREFERENCETEXT that must never serialize",
    } as unknown as CandidateDoc;
    const c = claim({ docs: [poisonedDoc] });
    const corpus = await assembleCorpusRecallEvidence(request(), sourceOf([c]));
    const retention = await assemblePublishedRetentionEvidence(request(), sourceOf([c]));
    const out = JSON.stringify({ corpus, retention });
    expect(out).not.toContain("SMUGGLEDREFERENCETEXT");
    expect(out).not.toContain("unitText");
    expect(out).toContain("poison.example"); // the real fields DID survive
  });

  it("timeAnchorTreatments surfaces the window's anchor classification", async () => {
    const source = sourceOf([claim()]);
    const corpus = await assembleCorpusRecallEvidence(
      request({ report: { ...ROCA_REPORT, cutoffAt: "3:45 pm ET", publishedAt: null } }),
      source,
    );
    if (corpus.status !== "assembled") throw new Error("expected assembled");
    expect(timeAnchorTreatments(corpus.assembly)).toEqual({
      cutoffAt: "malformed_treated_as_missing",
      publishedAt: "missing",
    });
    expect(corpus.assembly.windowEndSource).toBe("report_day");
  });
});
