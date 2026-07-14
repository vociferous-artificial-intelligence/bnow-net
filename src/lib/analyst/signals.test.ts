import { describe, expect, it } from "vitest";
import {
  collectSignalEvidenceIds, detectDataDark, detectPurge, detectTradeDivergence,
  evidenceForSignal, groupEvidenceRows, isPressureClaim, rankSignals, toPublicSignal,
  type PressureClaim, type Signal, type SignalEvidenceRow,
} from "./signals";

const NOW = "2026-07-06T12:00:00Z";

// Factory: defaults model the common qualifying case (person, defendant role,
// prosecution text). Overrides drive every negative below.
const mk = (
  id: number,
  name: string,
  role: string,
  date: string,
  over: Partial<PressureClaim> = {},
): PressureClaim => ({
  claimId: id, entityId: id * 100, entityName: name, entityKind: "person", role,
  claimDate: date, text: `${name} was arrested pending trial`, hedging: "claimed",
  ...over,
});

describe("isPressureClaim (the audited qualifier)", () => {
  it("qualifies a prosecution defendant and a dismissed official by role alone", () => {
    expect(isPressureClaim(mk(1, "Ivanov", "defendant", "2026-07-01", { text: "unrelated text" }))).toBe(true);
    expect(isPressureClaim(mk(2, "Petrov", "dismissed", "2026-07-01", { text: "unrelated text" }))).toBe(true);
  });

  it("never qualifies organizations, governments, courts, agencies or countries — whatever the role", () => {
    for (const [name, kind] of [
      ["NATO", "org"],
      ["Israeli government", "agency"],
      ["Supreme Court of Israel", "org"],
      ["Iran", "org"],
      ["Al Udeid Air Base", "org"],
      ["Freedom of Russia Legion", "faction"],
    ] as const) {
      expect(
        isPressureClaim(mk(1, name, "target", "2026-07-01", { entityKind: kind })),
        `${kind}:${name} must not qualify`,
      ).toBe(false);
      expect(
        isPressureClaim(mk(1, name, "defendant", "2026-07-01", { entityKind: kind })),
      ).toBe(false);
    }
  });

  it("role='target' alone is not evidence — a military strike target never qualifies", () => {
    expect(
      isPressureClaim(
        mk(1, "Oleg Sidorov", "target", "2026-07-01", {
          text: "Drone strike targeted the command post where Oleg Sidorov was located",
        }),
      ),
    ).toBe(false);
  });

  it("role='target' qualifies only when the text carries procedural pressure semantics", () => {
    expect(
      isPressureClaim(
        mk(1, "Ivan Petrov", "target", "2026-07-01", {
          text: "Ivan Petrov was detained on embezzlement charges",
        }),
      ),
    ).toBe(true);
  });

  it("topic nouns without a proceeding do not qualify (the Graham death story)", () => {
    expect(
      isPressureClaim(
        mk(1, "Lindsey Graham", "target", "2026-07-01", {
          text: "US Senator Lindsey Graham died unexpectedly amid reports of corruption schemes",
        }),
      ),
    ).toBe(false);
  });

  it("acting parties (prosecutor, patron, appointee, free-text titles) never qualify even with pressure text", () => {
    for (const role of ["prosecutor", "beneficiary", "patron", "appointee", "President of Ukraine"]) {
      expect(
        isPressureClaim(mk(1, "A", role, "2026-07-01", { text: "announced the arrest of three officials" })),
        `role ${role} must not qualify`,
      ).toBe(false);
    }
  });
});

describe("detectPurge", () => {
  it("fires on >=3 distinct qualifying people in window", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-07-03"),
      mk(3, "Sidorov", "target", "2026-07-05", { text: "Sidorov charged with fraud" }),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("purge");
    expect(s!.evidenceClaimIds).toEqual([1, 2, 3]);
  });

  it("dedupes evidenceClaimIds when one claim names >1 watched entity (B1)", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(1, "Sidorov", "defendant", "2026-07-01"), // same claim, second watched entity
      mk(2, "Petrov", "dismissed", "2026-07-02"),
      mk(2, "Orlova", "defendant", "2026-07-02"), // same claim, second watched entity
      mk(3, "Volkov", "defendant", "2026-07-03"),
      mk(4, "Zaitsev", "defendant", "2026-07-04"),
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

  it("counts canonical people — alias spellings and honorifics do not inflate the count", () => {
    // Three spellings of one person (the live ir triple-count) + one other person = 2 people.
    const claims = [
      mk(1, "Ali Khamenei", "defendant", "2026-07-01"),
      mk(2, "Ayatollah Ali Khamenei", "defendant", "2026-07-02"),
      mk(3, "Ayatollah Seyyed Ali Khamenei", "defendant", "2026-07-03"),
      mk(4, "Hossein Salami", "defendant", "2026-07-04"),
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ir", nowIso: NOW })).toBeNull();
    const s = detectPurge(claims, { windowDays: 14, minCount: 2, theater: "ir", nowIso: NOW });
    expect(s!.headline).toMatch(/^2 officials/);
  });

  it("evidence list contains ONLY qualifying claims — strike/junk edges never ride along", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-07-02"),
      mk(3, "Volkov", "defendant", "2026-07-03"),
      // Non-qualifying edges that share the window:
      mk(50, "Oleg Sidorov", "target", "2026-07-04", {
        text: "Drone strike targeted the command post where Oleg Sidorov was located",
      }),
      mk(51, "NATO", "target", "2026-07-04", { entityKind: "org" }),
      mk(52, "Lindsey Graham", "target", "2026-07-05", {
        text: "US Senator Lindsey Graham died unexpectedly amid reports of corruption schemes",
      }),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s!.evidenceClaimIds).toEqual([1, 2, 3]);
  });

  it("ignores non-pressure roles", () => {
    const claims = [
      mk(1, "A", "prosecutor", "2026-07-01", { text: "no proceeding text" }),
      mk(2, "B", "beneficiary", "2026-07-02", { text: "no proceeding text" }),
      mk(3, "C", "other", "2026-07-03", { text: "no proceeding text" }),
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })).toBeNull();
  });

  it("escalates severity when doubled", () => {
    const claims = Array.from({ length: 6 }, (_, i) =>
      mk(i + 1, `Person${i}`, "defendant", "2026-07-02"));
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s!.severity).toBe("elevated");
  });

  it("detail carries role/count language + review qualification — never names, never 'purge' as a conclusion", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-07-03"),
      mk(3, "Volkov", "defendant", "2026-07-05"),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })!;
    expect(s.detail).toContain("Analyst review required");
    expect(s.detail).toContain("prosecutions/dismissals");
    expect(s.detail.toLowerCase()).not.toContain("purge");
    expect(s.detail).not.toContain("Targets incl.");
    for (const name of ["Ivanov", "Petrov", "Volkov"]) {
      expect(s.detail.toLowerCase()).not.toContain(name.toLowerCase());
    }
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
    country_iso2: "ru", country_name: "Russia", digest_date: "2026-07-01",
    doc_id: 1, doc_url: "https://example.com/1", doc_title: "t", adapter: "rss",
    source_id: 1, source_name: "Source One", source_key: "src1", source_domain: "example.com",
    reliability: "0.75", source_platform: "rss",
    published_at: "2026-07-01T00:00:00Z", fetched_at: "2026-07-01T00:02:00Z",
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
    expect(byClaim.get(1)!.countryName).toBe("Russia");
    expect(byClaim.get(1)!.digestDate).toBe("2026-07-01");
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
  const pc = (claimId: number, name: string, role: string, date: string): PressureClaim => ({
    claimId, entityId: claimId, entityName: name, entityKind: "person", role,
    claimDate: date, text: `${name} was arrested pending trial`, hedging: "claimed",
  });
  const purge = detectPurge(
    [
      pc(11, "Ivanov", "defendant", "2026-07-01"),
      pc(12, "Petrov", "dismissed", "2026-07-03"),
      pc(13, "Sidorov", "defendant", "2026-07-05"),
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

  it("leaks no named individual at any layer — since 2026-07-13 even `detail` carries no names", () => {
    const signalJson = JSON.stringify(purge).toLowerCase();
    const publicJson = JSON.stringify(toPublicSignal(purge)).toLowerCase();
    for (const name of ["ivanov", "petrov", "sidorov"]) {
      // Names live ONLY in the evidence claim texts fetched separately for
      // accepted users — not in the signal object, not in the projection.
      expect(publicJson).not.toContain(name);
      expect(signalJson.replace(/"evidenceclaimids":\[[^\]]*\]/, "")).not.toContain(name);
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
