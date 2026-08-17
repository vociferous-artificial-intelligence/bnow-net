import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_FINAL_POLICY,
  EDITION_FINALITY_RANK,
  EDITION_NORMALIZATION_VERSION,
  FIXTURE_FINAL_LABEL,
  NORMALIZED_EDITION_LABELS,
  SCOPE_VERSIONS,
  dayUnavailableReason,
  editionLabel,
  editionRecordFromFixtureReport,
  nextStoredDayStatus,
  normalizeIswEditionUrl,
  orderEditionsByFinality,
  parseEditionRecord,
  selectDailyFinal,
  type ReferenceEditionRecord,
} from "./editions";
import { ConflictDomainError } from "./errors";

// the production slug builders (frozen validation stack, read-only import):
// normalization must cover every URL the validation cron can probe
const { iranUpdateUrlCandidatesForDate, iswUrlForDate } = await import("../validation/run");

const crosscutting = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/conflicts/crosscutting-scenarios-v1.json"), "utf8"),
) as { scenarios: Array<{ id: string; reports?: unknown[]; expected: Record<string, unknown> }> };

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ConflictDomainError ? e.code : "not-a-domain-error";
  }
}

describe("normalizeIswEditionUrl (versioned normalization table)", () => {
  it("covers every production Iran Update probe shape with distinct labels", () => {
    const urls = iranUpdateUrlCandidatesForDate("2026-07-04");
    const labels = urls.map((u) => normalizeIswEditionUrl(u));
    expect(labels.map((l) => l.label)).toEqual(["special", "evening", "morning", "plain"]);
    for (const l of labels) {
      expect(l.series).toBe("iran_update");
      expect(l.reportDate).toBe("2026-07-04");
      expect(l.editionKey).toBe(`iran_update:2026-07-04:${l.label}`);
      expect(l.normVersion).toBe(EDITION_NORMALIZATION_VERSION);
      expect(NORMALIZED_EDITION_LABELS.iran_update).toContain(l.label);
    }
  });

  it("covers the production ROCA slug", () => {
    const n = normalizeIswEditionUrl(iswUrlForDate("2026-06-30"));
    expect(n).toMatchObject({
      series: "roca",
      reportDate: "2026-06-30",
      label: "daily",
      editionKey: "roca:2026-06-30:daily",
    });
  });

  it("tolerates www, http, and a missing trailing slash", () => {
    const n = normalizeIswEditionUrl(
      "http://www.understandingwar.org/research/middle-east/iran-update-special-report-july-4-2026",
    );
    expect(n.editionKey).toBe("iran_update:2026-07-04:special");
  });

  it("REFUSES unknown shapes — no silent acceptance, no invented label", () => {
    const cases: Array<[string, string]> = [
      ["https://example.com/research/middle-east/iran-update-july-4-2026/", "wrong host"],
      ["not a url", "not a URL"],
      [
        "https://understandingwar.org/research/middle-east/iran-update-weekly-review-july-4-2026/",
        "unknown shape",
      ],
      [
        "https://understandingwar.org/research/middle-east/iran-update-notamonth-4-2026/",
        "unknown month word",
      ],
      [
        "https://understandingwar.org/research/middle-east/iran-update-february-30-2026/",
        "impossible calendar date",
      ],
      ["https://understandingwar.org/research/other/iran-update-july-4-2026/", "wrong path root"],
    ];
    for (const [url] of cases) {
      expect(code(() => normalizeIswEditionUrl(url))).toBe("invalid_edition_url");
    }
  });
});

const identity = (over: Partial<Record<string, unknown>> = {}) => ({
  series: "iran_update",
  editionKey: "iran_update:2026-08-05:evening",
  reportDate: "2026-08-05",
  cutoffAt: "2026-08-05T16:30:00Z",
  publishedAt: "2026-08-05T21:00:00Z",
  scopeVersion: SCOPE_VERSIONS.iran_update,
  ...over,
});

const record = (over: Partial<Record<string, unknown>> = {}): ReferenceEditionRecord =>
  parseEditionRecord({
    identity: identity(),
    provider: "isw",
    canonicalUrl:
      "https://understandingwar.org/research/middle-east/iran-update-evening-special-report-august-5-2026/",
    normVersion: EDITION_NORMALIZATION_VERSION,
    designatedFinal: null,
    cutoffTreatment: "present",
    publishedTreatment: "present",
    parseStatus: "parsed",
    citationAnchorId: null,
    ...over,
  });

describe("edition records", () => {
  it("parses a canonical provider record and exposes the label", () => {
    const r = record();
    expect(editionLabel(r.identity)).toBe("evening");
    expect(Object.isFrozen(r)).toBe(true);
    // instant canonicalization: "+00:00"/"Z"/ms variants collapse to one form
    expect(r.identity.cutoffAt).toBe("2026-08-05T16:30:00.000Z");
    const offsetForm = record({
      identity: identity({ cutoffAt: "2026-08-05T12:30:00-04:00" }),
    });
    expect(offsetForm.identity.cutoffAt).toBe("2026-08-05T16:30:00.000Z");
  });

  it("provider isw requires canonicalUrl, normVersion, and a normalized label", () => {
    expect(code(() => record({ canonicalUrl: null }))).toBe("invalid_edition_record");
    expect(code(() => record({ normVersion: null }))).toBe("invalid_edition_record");
    expect(
      code(() =>
        record({
          identity: identity({ editionKey: "iran_update:2026-08-05:final" }),
        }),
      ),
    ).toBe("invalid_edition_record"); // "final" is fixture-reserved
  });

  it("cross-validates canonicalUrl against the editionKey under the current norm version", () => {
    // matching URL/key: accepted (the default record) — pinned explicitly
    expect(editionLabel(record().identity)).toBe("evening");
    // a URL that normalizes to a DIFFERENT key: refused (a record can never
    // claim a key its own URL contradicts)
    expect(
      code(() =>
        record({
          canonicalUrl:
            "https://understandingwar.org/research/middle-east/iran-update-morning-special-report-august-5-2026/",
        }),
      ),
    ).toBe("invalid_edition_record");
    // a URL outside the versioned table: refused under the current version
    expect(
      code(() =>
        record({
          canonicalUrl: "https://understandingwar.org/research/middle-east/iran-update-weekly-digest/",
        }),
      ),
    ).toBe("invalid_edition_record");
    // a NON-current normVersion skips cross-validation (its URLs cannot be
    // interpreted by this table) — the record stands on its other invariants
    const legacy = record({
      canonicalUrl: "https://understandingwar.org/research/middle-east/iran-update-weekly-digest/",
      normVersion: "isw-edition-norm-v0",
    });
    expect(legacy.normVersion).toBe("isw-edition-norm-v0");
  });

  it("provider fixture accepts normalized labels and the reserved final label only", () => {
    const fixture = (label: string) =>
      parseEditionRecord({
        identity: identity({ editionKey: `iran_update:2026-08-05:${label}` }),
        provider: "fixture",
        canonicalUrl: null,
        normVersion: null,
        designatedFinal: null,
        cutoffTreatment: "present",
        publishedTreatment: "present",
        parseStatus: "parsed",
        citationAnchorId: null,
      });
    expect(editionLabel(fixture(FIXTURE_FINAL_LABEL).identity)).toBe("final");
    expect(editionLabel(fixture("morning").identity)).toBe("morning");
    expect(code(() => fixture("directors-cut"))).toBe("invalid_edition_record");
  });

  it("anchor treatments must agree with the identity's instants", () => {
    expect(code(() => record({ cutoffTreatment: "missing" }))).toBe("invalid_edition_record");
    expect(
      code(() => record({ identity: identity({ cutoffAt: null }), cutoffTreatment: "present" })),
    ).toBe("invalid_edition_record");
    const ok = record({ identity: identity({ cutoffAt: null }), cutoffTreatment: "malformed_treated_as_missing" });
    expect(ok.cutoffTreatment).toBe("malformed_treated_as_missing");
  });

  it("builds records from the fixture-corpus report shape, classifying raw anchors", () => {
    const malformed = editionRecordFromFixtureReport({
      series: "roca",
      editionKey: "roca:2026-08-13:final",
      reportDate: "2026-08-13",
      cutoffAt: "cutoff 1500 hrs local time", // cc-window-rung2-017's malformed anchor
      publishedAt: "2026-08-14T01:15:00Z",
    });
    expect(malformed.identity.cutoffAt).toBeNull(); // treated as missing, never guessed
    expect(malformed.cutoffTreatment).toBe("malformed_treated_as_missing");
    // anchors canonicalize to UTC toISOString form: equal instants are
    // byte-identical regardless of the declared offset form
    expect(malformed.identity.publishedAt).toBe("2026-08-14T01:15:00.000Z");
    expect(malformed.provider).toBe("fixture");
    expect(malformed.identity.scopeVersion).toBe(SCOPE_VERSIONS.roca);

    const missing = editionRecordFromFixtureReport({
      series: "roca",
      editionKey: "roca:2026-08-12:final",
      reportDate: "2026-08-12",
    });
    expect(missing.cutoffTreatment).toBe("missing");
    expect(missing.publishedTreatment).toBe("missing");
  });
});

describe("deterministic daily-final selection (explicit TOTAL ordering)", () => {
  const iranEdition = (label: string, over: Partial<Record<string, unknown>> = {}) =>
    editionRecordFromFixtureReport({
      series: "iran_update",
      editionKey: `iran_update:2026-08-05:${label}`,
      reportDate: "2026-08-05",
      cutoffAt: "2026-08-05T16:30:00Z",
      publishedAt: "2026-08-05T21:00:00Z",
      ...over,
    });

  it("selects the fixture-pinned designated final of cc-editions-001", () => {
    const scenario = crosscutting.scenarios.find((s) => s.id === "cc-editions-001")!;
    const editions = scenario.reports!.map(editionRecordFromFixtureReport);
    const selection = selectDailyFinal(editions);
    expect(selection.selected.identity.editionKey).toBe(scenario.expected.selectedEditionKey);
    expect(selection.policy).toBe(DAILY_FINAL_POLICY);
    expect(selection.orderedKeys).toEqual([
      "iran_update:2026-08-05:evening",
      "iran_update:2026-08-05:morning",
    ]);
  });

  it("an explicit designation DOMINATES the label ranking", () => {
    const editions = [
      iranEdition("evening"),
      iranEdition("morning", { designatedFinal: true }),
    ];
    expect(selectDailyFinal(editions).selected.identity.editionKey).toBe(
      "iran_update:2026-08-05:morning",
    );
  });

  it("an edition EXPLICITLY declared not-final never outranks an undesignated sibling", () => {
    // Gate-2 probe: {evening: explicit false, special: undesignated} must
    // select special — "not the final" is a statement, not an absence
    const editions = [iranEdition("evening", { designatedFinal: false }), iranEdition("special")];
    const sel = selectDailyFinal(editions);
    expect(sel.selected.identity.editionKey).toBe("iran_update:2026-08-05:special");
    expect(sel.winnerExplicitlyNotFinal).toBe(false);
    // explicit true still dominates both levels
    const withTrue = selectDailyFinal([
      ...editions,
      iranEdition("morning", { designatedFinal: true }),
    ]);
    expect(withTrue.selected.identity.editionKey).toBe("iran_update:2026-08-05:morning");
    expect(withTrue.winnerExplicitlyNotFinal).toBe(false);
  });

  it("an all-explicitly-not-final day still selects deterministically, with the diagnostic VISIBLE", () => {
    const sel = selectDailyFinal([
      iranEdition("morning", { designatedFinal: false }),
      iranEdition("evening", { designatedFinal: false }),
    ]);
    expect(sel.selected.identity.editionKey).toBe("iran_update:2026-08-05:evening");
    expect(sel.winnerExplicitlyNotFinal).toBe(true);
  });

  it("a fully undesignated day keeps rank behavior with the diagnostic unset", () => {
    const sel = selectDailyFinal([iranEdition("morning"), iranEdition("evening")]);
    expect(sel.selected.identity.editionKey).toBe("iran_update:2026-08-05:evening");
    expect(sel.winnerExplicitlyNotFinal).toBe(false);
  });

  it("undesignated sets order by label finality rank: evening > special > plain > morning", () => {
    const editions = ["morning", "plain", "special", "evening"].map((l) => iranEdition(l));
    expect(orderEditionsByFinality(editions).map((e) => editionLabel(e.identity))).toEqual([
      "evening",
      "special",
      "plain",
      "morning",
    ]);
    expect(
      EDITION_FINALITY_RANK[FIXTURE_FINAL_LABEL],
    ).toBeGreaterThan(EDITION_FINALITY_RANK.evening);
  });

  it("is input-order independent (never rows[0] of an unordered set)", () => {
    const a = ["morning", "evening", "plain", "special"].map((l) => iranEdition(l));
    const b = [...a].reverse();
    expect(orderEditionsByFinality(a).map((e) => e.identity.editionKey)).toEqual(
      orderEditionsByFinality(b).map((e) => e.identity.editionKey),
    );
    expect(selectDailyFinal(a).selected.identity.editionKey).toBe(
      selectDailyFinal(b).selected.identity.editionKey,
    );
  });

  it("later publishedAt breaks equal-rank ties; nulls last; editionKey is the last resort", () => {
    // within ONE day equal ranks imply equal keys (label ⊂ key), so the
    // deeper comparator rungs are pinned across days — the comparator is a
    // TOTAL ordering over arbitrary record sets
    const day = (d: string, over: Partial<Record<string, unknown>> = {}) =>
      editionRecordFromFixtureReport({
        series: "iran_update",
        editionKey: `iran_update:${d}:evening`,
        reportDate: d,
        ...over,
      });
    const early = day("2026-08-05", { publishedAt: "2026-08-05T21:00:00Z" });
    const late = day("2026-08-06", { publishedAt: "2026-08-06T22:00:00Z" });
    const noAnchors = day("2026-08-07");
    expect(orderEditionsByFinality([noAnchors, early, late]).map((e) => e.identity.reportDate)).toEqual([
      "2026-08-06", // latest publishedAt first
      "2026-08-05",
      "2026-08-07", // null anchors sort last…
    ]);
    const alsoBare = day("2026-08-08");
    expect(orderEditionsByFinality([alsoBare, noAnchors]).map((e) => e.identity.reportDate)).toEqual([
      "2026-08-07", // …and equal-anchor records fall to editionKey ascending
      "2026-08-08",
    ]);
    // duplicate editionKeys are an upstream violation, refused loudly
    expect(code(() => orderEditionsByFinality([early, early]))).toBe("invalid_edition_selection");
  });

  it("refuses empty sets, mixed days, and contradictory designation", () => {
    expect(code(() => selectDailyFinal([]))).toBe("invalid_edition_selection");
    const otherDay = editionRecordFromFixtureReport({
      series: "iran_update",
      editionKey: "iran_update:2026-08-06:morning",
      reportDate: "2026-08-06",
    });
    expect(code(() => selectDailyFinal([iranEdition("evening"), otherDay]))).toBe(
      "invalid_edition_selection",
    );
    expect(
      code(() =>
        selectDailyFinal([
          iranEdition("evening", { designatedFinal: true }),
          iranEdition("morning", { designatedFinal: true }),
        ]),
      ),
    ).toBe("invalid_edition_selection");
  });

  it("fails closed on a label with no finality rank (defense in depth)", () => {
    const rogue = {
      ...iranEdition("evening"),
      identity: { ...iranEdition("evening").identity, editionKey: "iran_update:2026-08-05:mystery" },
    } as ReferenceEditionRecord;
    // two records so the comparator actually runs (sort skips 1-element input)
    expect(code(() => orderEditionsByFinality([rogue, iranEdition("morning")]))).toBe(
      "invalid_edition_selection",
    );
  });
});

describe("day status (gaps are never fabricated)", () => {
  it("transition table", () => {
    expect(nextStoredDayStatus(null, "probe_failed")).toEqual({ status: "probe_failed", action: "set" });
    expect(nextStoredDayStatus(null, "publication_gap")).toEqual({
      status: "publication_gap",
      action: "set",
    });
    expect(nextStoredDayStatus("probe_failed", "publication_gap")).toEqual({
      status: "publication_gap",
      action: "set",
    }); // a probe failure may be CONFIRMED into a gap
    expect(nextStoredDayStatus("publication_gap", "probe_failed")).toEqual({
      status: "publication_gap",
      action: "kept_prior",
    }); // a later failed probe never un-confirms a gap
    expect(nextStoredDayStatus("probe_failed", "probe_failed")).toEqual({
      status: "probe_failed",
      action: "unchanged",
    });
    expect(code(() => nextStoredDayStatus(null, "published" as never))).toBe("invalid_day_status");
  });

  it("only a CONFIRMED gap maps to the Phase 1 publication_gap unavailable reason", () => {
    expect(dayUnavailableReason("publication_gap")).toBe("publication_gap");
    expect(dayUnavailableReason("probe_failed")).toBeNull();
    expect(dayUnavailableReason("unknown")).toBeNull();
    expect(dayUnavailableReason("published")).toBeNull();
  });
});
