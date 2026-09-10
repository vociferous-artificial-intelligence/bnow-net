import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EDITION_UNITS_VERSION,
  GAP_CONFIRM_MIN_DAY_AGE_HOURS,
  MIN_REPORT_BYTES,
  SERIES_ISW_THEATER,
  classifyProbe,
  confirmGapEligible,
  discoverEditions,
  editionAnchorsFrom,
  isCleanNotFound,
  normalizeUnitTextForHash,
  runSeriesDiscovery,
  seriesProbeUrls,
  unitSignaturesFrom,
  type EditionDiscoveryDeps,
} from "./edition-discovery";
import { selectDailyFinal } from "../conflicts/editions";
import type { ReportInstantExtraction } from "../conflicts/report-extract";
import { extractTakeawaysWithText } from "../validation/isw-extract";
import { RU_UA_V1 } from "../validation/gazetteer/ru-ua-v1";
import { InMemoryReferenceReportRepository } from "../conflicts/reference-repo";
import type { FetchResult } from "../fetch-cache";
import type { QueryFn } from "./load";

// Fixture-backed ONLY: understandingwar.org is never contacted here (the
// injected fetch is the only source of bodies). The three edition-shape files
// are synthetic (fixtures/isw/editions/README.md); the two ROCA/Iran pages are
// the real scraped ones the rest of the suite already uses.
const fixture = (rel: string) => readFileSync(join(process.cwd(), "fixtures/isw", rel), "utf8");

const MORNING_HTML = fixture("editions/iran-morning-2026-08-12.html");
const EVENING_HTML = fixture("editions/iran-evening-2026-08-12.html");
const PLAIN_HTML = fixture("editions/iran-plain-2026-05-02.html");
const OVERSIZE_HTML = fixture("editions/oversize-not-a-report.html");
const UNDERSIZED_HTML = fixture("editions/undersized-200.html");
const ROCA_HTML = fixture("roca-2026-06-30.html");
const IRAN_SPECIAL_HTML = fixture("iran-update-2026-07-24.html");

const DAY = "2026-08-12";
const IRAN = "https://understandingwar.org/research/middle-east/";
const U = {
  special: `${IRAN}iran-update-special-report-august-12-2026/`,
  evening: `${IRAN}iran-update-evening-special-report-august-12-2026/`,
  morning: `${IRAN}iran-update-morning-special-report-august-12-2026/`,
  plain: `${IRAN}iran-update-august-12-2026/`,
};
/** far past the gap-confirmation age for DAY */
const LATE = new Date(`${DAY}T00:00:00Z`).getTime() + 10 * 86_400_000;

type Body = string | number; // html, or a bare status code with no body

function fakeFetch(map: Record<string, Body>) {
  const calls: string[] = [];
  const fn = async (url: string): Promise<FetchResult | null> => {
    calls.push(url);
    const body = map[url];
    if (body === undefined) return { url, html: "", fromCache: false, status: 404 };
    if (typeof body === "number") return body === 0 ? null : { url, html: "", fromCache: false, status: body };
    return { url, html: body, fromCache: false, status: 200 };
  };
  return { fn, calls };
}

function deps(
  map: Record<string, Body>,
  over: Partial<EditionDiscoveryDeps> & { iswRows?: Array<Record<string, unknown>> } = {},
): EditionDiscoveryDeps & { calls: string[]; repo: InMemoryReferenceReportRepository; queries: unknown[][] } {
  const { fn, calls } = fakeFetch(map);
  const queries: unknown[][] = [];
  const query: QueryFn = async (sql, params = []) => {
    queries.push([sql, params]);
    return over.iswRows ?? [];
  };
  const repo = (over.repo as InMemoryReferenceReportRepository) ?? new InMemoryReferenceReportRepository();
  return {
    repo,
    query,
    fetch: fn,
    now: over.now ?? (() => new Date(LATE)),
    calls,
    queries,
  };
}

describe("seriesProbeUrls (the frozen candidate list, normalized before any fetch)", () => {
  it("ROCA probes exactly one shape", () => {
    const probes = seriesProbeUrls("roca", "2026-06-30");
    expect(probes.map((p) => p.url)).toEqual([
      "https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-30-2026/",
    ]);
    expect(probes[0].normalized.editionKey).toBe("roca:2026-06-30:daily");
  });

  it("Iran probes all four observed shapes, in the production likelihood order", () => {
    const probes = seriesProbeUrls("iran_update", DAY);
    expect(probes.map((p) => p.url)).toEqual([U.special, U.evening, U.morning, U.plain]);
    expect(probes.map((p) => p.normalized.label)).toEqual(["special", "evening", "morning", "plain"]);
    for (const p of probes) expect(p.normalized.reportDate).toBe(DAY);
  });
});

describe("editionAnchorsFrom (extractor outcome -> stored anchor pair)", () => {
  const extraction = (published: Record<string, unknown>, cutoff: Record<string, unknown>) =>
    ({
      published: { publishedAtMs: null, publishedAt: null, conflicting: false, ...published },
      cutoff: {
        cutoffAtMs: null,
        cutoffAt: null,
        dstAmbiguousFirstOccurrence: false,
        patternVersion: "isw-cutoff-v1",
        ...cutoff,
      },
      cutoffAfterPublication: false,
    }) as unknown as ReportInstantExtraction;

  it("parsed -> present, absent -> missing, everything else -> malformed_treated_as_missing", () => {
    expect(
      editionAnchorsFrom(
        extraction({ outcome: "parsed", publishedAt: "2026-08-12T23:41:00.000Z" }, { outcome: "absent" }),
      ),
    ).toEqual({
      cutoffAt: null,
      cutoffTreatment: "missing",
      publishedAt: "2026-08-12T23:41:00.000Z",
      publishedTreatment: "present",
    });
    for (const outcome of ["malformed", "conflicting", "nonexistent_local_time"]) {
      expect(editionAnchorsFrom(extraction({ outcome: "absent" }, { outcome })).cutoffTreatment).toBe(
        "malformed_treated_as_missing",
      );
    }
  });

  it("never carries a raw declared string through — a non-parsed anchor is NULL", () => {
    const a = editionAnchorsFrom(extraction({ outcome: "malformed" }, { outcome: "conflicting" }));
    expect(a.publishedAt).toBeNull();
    expect(a.cutoffAt).toBeNull();
  });
});

describe("unitSignaturesFrom (ruling 1: signatures and hashes only)", () => {
  it("derives ordinal + sha256 + canonical keys + length from a REAL ROCA page", () => {
    const units = unitSignaturesFrom(ROCA_HTML);
    expect(units.length).toBeGreaterThan(3);
    expect(units.map((u) => u.ordinal)).toEqual(units.map((_, i) => i));
    for (const u of units) {
      expect(u.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(u.chars).toBeGreaterThan(0);
      for (const token of [...u.toponyms, ...u.actions]) expect(token).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    }
    expect(units.some((u) => u.toponyms.length > 0)).toBe(true);
  });

  it("hashes the whitespace-normalized text, so re-parsing the same page is stable", () => {
    expect(normalizeUnitTextForHash("  a \n\t b  ")).toBe("a b");
    expect(unitSignaturesFrom(EVENING_HTML)).toEqual(unitSignaturesFrom(EVENING_HTML));
  });

  it("a page with no Key Takeaways block yields zero units (not a throw)", () => {
    expect(unitSignaturesFrom(OVERSIZE_HTML)).toEqual([]);
  });

  it("carries NO prose: on a REAL Iran page every stored string is a hash or a canonical key", () => {
    const units = unitSignaturesFrom(IRAN_SPECIAL_HTML);
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      // the shape is closed — a future extra field would fail here AND in
      // validateEditionDerived, which is what keeps prose out structurally
      expect(Object.keys(u).sort()).toEqual(["actions", "chars", "ordinal", "sha256", "toponyms"]);
      expect(u.sha256).toMatch(/^[0-9a-f]{64}$/);
      for (const token of [...u.toponyms, ...u.actions]) expect(token).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    }
    // the signature tokens are drawn from the CLOSED gazetteer vocabulary — an
    // arbitrary word from the page cannot appear there. (A key such as
    // `casualties` may coincide with a word in the text; membership, not
    // absence, is the guarantee that matters.)
    const vocabulary = new Set([...Object.keys(RU_UA_V1.toponyms), ...Object.keys(RU_UA_V1.actions)]);
    for (const u of units) {
      for (const token of [...u.toponyms, ...u.actions]) expect(vocabulary.has(token)).toBe(true);
    }
    // and no multi-word fragment of any bullet survives into the payload
    const { transientTexts } = extractTakeawaysWithText(IRAN_SPECIAL_HTML);
    const serialized = JSON.stringify(units);
    for (const text of transientTexts.slice(0, 5)) {
      const words = normalizeUnitTextForHash(text).split(" ");
      expect(words.length).toBeGreaterThan(3);
      for (let i = 0; i + 3 <= words.length; i++) {
        expect(serialized).not.toContain(words.slice(i, i + 3).join(" "));
      }
    }
  });
});

describe("confirmGapEligible (a gap is never asserted from one run)", () => {
  const now = new Date(LATE);
  it("refuses without a prior stored probe_failed", () => {
    expect(confirmGapEligible("unknown", DAY, now)).toBe(false);
    expect(confirmGapEligible("published", DAY, now)).toBe(false);
    expect(confirmGapEligible("publication_gap", DAY, now)).toBe(false);
  });
  it("accepts a prior probe_failed on an old enough day", () => {
    expect(confirmGapEligible("probe_failed", DAY, now)).toBe(true);
  });
  it("refuses while the day is younger than the confirmation age", () => {
    const dayStart = Date.parse(`${DAY}T00:00:00Z`);
    const justUnder = new Date(dayStart + GAP_CONFIRM_MIN_DAY_AGE_HOURS * 3_600_000 - 1);
    const exactly = new Date(dayStart + GAP_CONFIRM_MIN_DAY_AGE_HOURS * 3_600_000);
    expect(confirmGapEligible("probe_failed", DAY, justUnder)).toBe(false);
    expect(confirmGapEligible("probe_failed", DAY, exactly)).toBe(true);
  });
});

describe("discoverEditions — every shape probed, no collapse (C4)", () => {
  it("records BOTH same-day editions and selectDailyFinal picks the evening one", async () => {
    const d = deps({ [U.evening]: EVENING_HTML, [U.morning]: MORNING_HTML });
    const out = await discoverEditions(d, "iran_update", DAY);

    expect(d.calls).toEqual([U.special, U.evening, U.morning, U.plain]); // never breaks
    expect(out.editions.map((e) => e.label)).toEqual(["evening", "morning"]);
    expect(out.editions.every((e) => e.action === "inserted")).toBe(true);
    expect(out.dayStatus).toBe("published");
    expect(out.dayStatusAction).toBe("editions_found");
    expect(out.probeFailures).toBe(0);

    const day = await d.repo.editionsForDay("iran_update", DAY);
    expect(day).toHaveLength(2);
    expect(selectDailyFinal(day).selected.identity.editionKey).toBe(`iran_update:${DAY}:evening`);
  });

  it("pins the probe cost: 4 fetches for an Iran day, 1 for a ROCA day", async () => {
    const iran = deps({});
    await discoverEditions(iran, "iran_update", DAY);
    expect(iran.calls).toHaveLength(4);

    const rocaUrl =
      "https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-30-2026/";
    const roca = deps({ [rocaUrl]: ROCA_HTML });
    const out = await discoverEditions(roca, "roca", "2026-06-30");
    expect(roca.calls).toEqual([rocaUrl]);
    expect(out.editions).toHaveLength(1);
    expect(out.editions[0].editionKey).toBe("roca:2026-06-30:daily");
    expect(out.editions[0].parseStatus).toBe("parsed");
    expect(out.editions[0].units).toBeGreaterThan(3);
  });

  it("a replay of the same day is `unchanged` and writes no duplicate", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const first = deps({ [U.evening]: EVENING_HTML }, { repo });
    await discoverEditions(first, "iran_update", DAY);
    const again = deps({ [U.evening]: EVENING_HTML }, { repo });
    const out = await discoverEditions(again, "iran_update", DAY);
    expect(out.editions.map((e) => e.action)).toEqual(["unchanged"]);
    expect(await repo.editionsForDay("iran_update", DAY)).toHaveLength(1);
  });

  it("stores the derived unit payload with its version stamp, and nothing else", async () => {
    const d = deps({ [U.evening]: EVENING_HTML });
    await discoverEditions(d, "iran_update", DAY);
    const stored = await d.repo.getEdition(`iran_update:${DAY}:evening`);
    expect(stored!.derived.unitsVersion).toBe(EDITION_UNITS_VERSION);
    expect(stored!.derived.units).toHaveLength(3);
    expect(Object.keys(stored!.derived).sort()).toEqual(["units", "unitsVersion"]);
    // the fixture's distinctive bullet wording never reaches the record
    expect(JSON.stringify(stored)).not.toContain("coastal facility");
  });

  it("carries the parsed anchors and their treatments onto the record", async () => {
    const d = deps({ [U.evening]: EVENING_HTML, [U.plain]: PLAIN_HTML });
    await discoverEditions(d, "iran_update", DAY);
    const evening = await d.repo.getEdition(`iran_update:${DAY}:evening`);
    expect(evening!.publishedTreatment).toBe("present");
    expect(evening!.identity.publishedAt).toBe("2026-08-12T23:41:00.000Z");
    expect(evening!.cutoffTreatment).toBe("present");
    const plain = await d.repo.getEdition(`iran_update:${DAY}:plain`);
    expect(plain!.cutoffTreatment).toBe("missing"); // the fixture declares none
    expect(plain!.identity.cutoffAt).toBeNull();
  });

  it("an oversize page with no takeaways is an edition with parse_status failed", async () => {
    const d = deps({ [U.special]: OVERSIZE_HTML });
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(OVERSIZE_HTML.length).toBeGreaterThan(MIN_REPORT_BYTES);
    expect(out.editions).toEqual([
      expect.objectContaining({ label: "special", parseStatus: "failed", units: 0 }),
    ]);
    expect((await d.repo.getEdition(`iran_update:${DAY}:special`))!.derived).toEqual({});
  });

  it("an UNDERSIZED 200 never registers an edition and is not a clean 404", async () => {
    const d = deps({ [U.special]: UNDERSIZED_HTML });
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(UNDERSIZED_HTML.length).toBeLessThanOrEqual(MIN_REPORT_BYTES);
    expect(out.editions).toEqual([]);
    expect(out.probeFailures).toBe(1);
    expect(out.dayStatus).toBe("probe_failed");
  });
});

describe("classifyProbe (WS3-F01 / #114: a 403 is INDETERMINATE, never a clean not-found)", () => {
  const probe = (status: number | null, bytes = 0) => ({ url: "https://x/", status, bytes });

  it("partitions every probe outcome into exactly one of the three classes", () => {
    expect(classifyProbe(probe(404))).toBe("clean_not_found");
    expect(classifyProbe(probe(200, MIN_REPORT_BYTES + 1))).toBe("edition");
    // the host's measured throttle response, plus every other outcome that
    // leaves the shape's EXISTENCE unknown rather than disproved
    for (const status of [403, 429, 500, 502, 503, null, 301, 302, 400, 418]) {
      expect(classifyProbe(probe(status)), String(status)).toBe("indeterminate");
    }
    // an undersized 200: the URL resolved, but not to a report
    expect(classifyProbe(probe(200, MIN_REPORT_BYTES))).toBe("indeterminate");
  });

  it("isCleanNotFound stays 404-ONLY — widening it to 403 is the M10 mutant", () => {
    expect(isCleanNotFound(probe(404))).toBe(true);
    for (const status of [403, 429, 500, null, 200]) {
      expect(isCleanNotFound(probe(status)), String(status)).toBe(false);
    }
  });
});

describe("discoverEditions — throttling is reported as indeterminate (WS3-F01, D-a)", () => {
  it("a 403 is counted as indeterminate and does not read as a clean not-found", async () => {
    const d = deps({ [U.special]: 403, [U.evening]: 403 });
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(out.probeIndeterminate).toBe(2);
    expect(out.probeIndeterminateReasons).toEqual({ throttled: 2, unparseable_body: 0 });
    expect(out.probes.filter(isCleanNotFound)).toHaveLength(2); // morning + plain
    expect(out.dayStatus).toBe("probe_failed");
    expect(out.dayStatusReason).toBe("throttled");
  });

  it("a throttled day is NOT confirmable, however many runs it sees (#114 consequence a)", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const first = await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    expect(first.dayStatus).toBe("probe_failed");
    expect(first.dayStatusReason).toBeNull(); // every shape answered cleanly

    // the host trips: one shape now answers 403 instead of 404
    for (let i = 0; i < 3; i++) {
      const out = await discoverEditions(deps({ [U.evening]: 403 }, { repo }), "iran_update", DAY);
      expect(out.dayStatus).toBe("probe_failed");
      expect(out.dayStatusReason).toBe("throttled");
      expect(out.probeIndeterminate).toBe(1);
    }
  });

  it("an all-clean-404 day still confirms, and carries no reason", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    const out = await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    expect(out.dayStatus).toBe("publication_gap");
    expect(out.dayStatusReason).toBeNull();
    expect(out.probeIndeterminate).toBe(0);
  });

  it("a published day carries no reason and no indeterminate probes", async () => {
    const out = await discoverEditions(deps({ [U.evening]: EVENING_HTML }), "iran_update", DAY);
    expect(out.dayStatus).toBe("published");
    expect(out.dayStatusReason).toBeNull();
    expect(out.probeIndeterminate).toBe(0);
  });
});

describe("discoverEditions — day status monotonicity (gaps are never fabricated)", () => {
  it("first all-404 run records probe_failed; a SECOND confirms the gap", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const one = await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    expect(one.probes.every(isCleanNotFound)).toBe(true);
    expect(one.dayStatus).toBe("probe_failed");
    expect(one.dayStatusAction).toBe("set");

    const two = await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    expect(two.dayStatus).toBe("publication_gap");
    expect(two.dayStatusAction).toBe("set");
  });

  it("a young day never confirms, however many all-404 runs it sees", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const young = () => new Date(Date.parse(`${DAY}T00:00:00Z`) + 30 * 3_600_000);
    for (let i = 0; i < 3; i++) {
      const out = await discoverEditions(deps({}, { repo, now: young }), "iran_update", DAY);
      expect(out.dayStatus).toBe("probe_failed");
    }
  });

  it("a hard failure among the probes forbids confirmation even after a stored probe_failed", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({}, { repo }), "iran_update", DAY); // probe_failed
    const out = await discoverEditions(deps({ [U.evening]: 0 }, { repo }), "iran_update", DAY);
    expect(out.dayStatus).toBe("probe_failed");
    expect(out.dayStatusAction).toBe("unchanged");
    expect(out.probeFailures).toBe(1);
  });

  it("a confirmed gap is never un-confirmed by a later probe failure", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    await discoverEditions(deps({}, { repo }), "iran_update", DAY); // publication_gap
    const out = await discoverEditions(deps({ [U.plain]: 500 }, { repo }), "iran_update", DAY);
    expect(out.dayStatus).toBe("publication_gap");
    expect(out.dayStatusAction).toBe("kept_prior");
  });

  it("an edition arriving later clears the stored day row (published wins)", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({}, { repo }), "iran_update", DAY);
    const out = await discoverEditions(deps({ [U.evening]: EVENING_HTML }, { repo }), "iran_update", DAY);
    expect(out.dayStatus).toBe("published");
    expect(await repo.dayStatus("iran_update", DAY)).toBe("published");
  });
});

describe("discoverEditions — link-only citation anchoring (C5)", () => {
  const anchorRow = [{ id: 4242, url: U.evening }];

  it("anchors ONLY the edition whose canonical URL equals the isw_reports row's", async () => {
    const d = deps(
      { [U.evening]: EVENING_HTML, [U.morning]: MORNING_HTML },
      { iswRows: anchorRow },
    );
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(out.anchored).toBe(1);
    expect(out.editions.find((e) => e.label === "evening")!.anchoredReportId).toBe(4242);
    expect(out.editions.find((e) => e.label === "morning")!.anchoredReportId).toBeNull();
  });

  it("matches through a www./http/trailing-slash spelling of the same edition", async () => {
    const d = deps(
      { [U.evening]: EVENING_HTML },
      { iswRows: [{ id: 7, url: "http://WWW.understandingwar.org/research/middle-east/Iran-Update-Evening-Special-Report-August-12-2026" }] },
    );
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(out.editions[0].anchoredReportId).toBe(7);
  });

  it("reads isw_reports READ-ONLY, keyed on the series' theater, and writes nothing there", async () => {
    const d = deps({ [U.evening]: EVENING_HTML }, { iswRows: anchorRow });
    await discoverEditions(d, "iran_update", DAY);
    expect(d.queries).toHaveLength(1);
    const [sql, params] = d.queries[0] as [string, unknown[]];
    expect(sql).toMatch(/^\s*SELECT id, url FROM isw_reports WHERE theater = \$1 AND report_date = \$2\s*$/);
    expect(params).toEqual([SERIES_ISW_THEATER.iran_update, DAY]);
    expect(SERIES_ISW_THEATER).toEqual({ roca: "ru", iran_update: "ir" });
  });

  it("a stored URL this canonicalizer refuses simply does not anchor", async () => {
    const d = deps({ [U.evening]: EVENING_HTML }, { iswRows: [{ id: 9, url: "not a url" }] });
    const out = await discoverEditions(d, "iran_update", DAY);
    expect(out.editions[0].anchoredReportId).toBeNull();
  });
});

describe("discoverEditions — builder drift is refused BEFORE any network call", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("an unknown candidate shape throws invalid_edition_url and fetches nothing", async () => {
    vi.doMock("../validation/run", () => ({
      iswUrlForDate: () => "https://understandingwar.org/research/russia-ukraine/roca-weekly-june-30-2026/",
      iranUpdateUrlCandidatesForDate: () => ["https://understandingwar.org/research/middle-east/iran-update-weekly-august-12-2026/"],
    }));
    const mod = await import("./edition-discovery");
    const d = deps({});
    await expect(mod.discoverEditions(d, "iran_update", DAY)).rejects.toMatchObject({
      name: "ConflictDomainError",
      code: "invalid_edition_url",
    });
    expect(d.calls).toEqual([]);
    vi.doUnmock("../validation/run");
  });

  it("a candidate whose slug date disagrees with the requested day is refused too", async () => {
    vi.doMock("../validation/run", () => ({
      iswUrlForDate: (d: string) => `https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-june-30-2026/${d.slice(0, 0)}`,
      iranUpdateUrlCandidatesForDate: () => [U.evening],
    }));
    const mod = await import("./edition-discovery");
    // NB: vi.resetModules() gives this import its own copy of errors.ts, so the
    // pin is on the typed code, not on constructor identity
    expect(() => mod.seriesProbeUrls("roca", "2026-07-01")).toThrowError(
      /normalizes to roca:2026-06-30, not roca:2026-07-01/,
    );
    try {
      mod.seriesProbeUrls("roca", "2026-07-01");
    } catch (e) {
      expect((e as { name: string; code: string }).name).toBe("ConflictDomainError");
      expect((e as { name: string; code: string }).code).toBe("invalid_edition_url");
    }
    vi.doUnmock("../validation/run");
  });
});

describe("runSeriesDiscovery (the --series window driver and the C5 measurement)", () => {
  const DAY2 = "2026-08-13";
  const U2 = {
    special: `${IRAN}iran-update-special-report-august-13-2026/`,
    evening: `${IRAN}iran-update-evening-special-report-august-13-2026/`,
  };
  const plan = (over: Partial<{ dry: boolean }> = {}) => ({
    series: "iran_update" as const,
    from: DAY,
    to: DAY2,
    dry: false,
    ...over,
  });

  it("walks the window, counts multi-edition days, and reports anchor≠final", async () => {
    const lines: string[] = [];
    const d = deps(
      {
        [U.evening]: EVENING_HTML,
        [U.morning]: MORNING_HTML,
        [U2.special]: IRAN_SPECIAL_HTML,
      },
      // production anchored the MORNING edition of DAY (probe order beats
      // finality — exactly the C5 case) and nothing on DAY2
      { iswRows: [{ id: 11, url: U.morning }] },
    );
    const summary = await runSeriesDiscovery(plan(), d, (l) => lines.push(l));

    expect(summary.days).toBe(2);
    expect(summary.editions).toBe(3);
    expect(summary.multiEditionDays).toBe(1);
    expect(summary.anchorNotFinalDays).toBe(1); // morning anchored, evening final
    expect(summary.unanchoredDays).toBe(1); // DAY2's special has no anchor row
    expect(summary.publishedDays).toBe(2);
    expect(summary.probes).toBe(8); // 4 shapes × 2 days
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("anchor≠final(morning vs evening)");
    expect(lines[1]).toContain("anchor=none");
  });

  it("counts gap and probe-failure days separately", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({}, { repo }), "iran_update", DAY); // seeds probe_failed
    const d = deps({ [U2.special]: 500 }, { repo });
    const summary = await runSeriesDiscovery(plan(), d, () => {});
    expect(summary.publicationGapDays).toBe(1); // DAY confirms on this second run
    expect(summary.probeFailedDays).toBe(1); // DAY2's 500 is not a clean 404
    expect(summary.editions).toBe(0);
    expect(summary.probeFailures).toBe(1);
  });

  it("--dry writes NOTHING while reporting what a live run would have done", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const lines: string[] = [];
    const d = deps({ [U.evening]: EVENING_HTML, [U.morning]: MORNING_HTML }, { repo });
    const summary = await runSeriesDiscovery(plan({ dry: true }), d, (l) => lines.push(l));

    expect(summary.editions).toBe(2);
    expect(summary.multiEditionDays).toBe(1);
    expect(lines[0]).toContain("DRY");
    expect(lines[0]).toContain("evening:inserted");
    // the repository is untouched: no edition rows, no day rows
    expect(await repo.editionsForDay("iran_update", DAY)).toEqual([]);
    expect(await repo.dayStatus("iran_update", DAY)).toBe("unknown");
    expect(await repo.dayStatus("iran_update", DAY2)).toBe("unknown");
  });

  it("--dry reports `repaired`/`unchanged` against rows that already exist", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions(deps({ [U.evening]: EVENING_HTML }, { repo }), "iran_update", DAY);
    const before = await repo.getEdition(`iran_update:${DAY}:evening`);

    const lines: string[] = [];
    const d = deps({ [U.evening]: EVENING_HTML, [U.morning]: MORNING_HTML }, { repo });
    await runSeriesDiscovery({ ...plan({ dry: true }), to: DAY }, d, (l) => lines.push(l));
    expect(lines[0]).toContain("evening:unchanged");
    expect(lines[0]).toContain("morning:inserted");
    // still only the one real row, unchanged
    expect(await repo.editionsForDay("iran_update", DAY)).toHaveLength(1);
    expect(await repo.getEdition(`iran_update:${DAY}:evening`)).toEqual(before);
  });
});
