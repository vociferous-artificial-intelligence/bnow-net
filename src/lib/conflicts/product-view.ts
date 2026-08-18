// Phase 6 product data provider — the NARROW, fixture-backed interface the
// conflict pages consume (prompt §14 item E). Data sources are EXACTLY the
// committed Phase 0–4 artifacts: the frozen fixture corpus
// (fixtures/conflicts/*.json via the Phase-3 loader) and the committed golden
// results (fixtures/conflicts/goldens/golden-results-v1.json). NO runtime DB
// dependency: importing this module performs no IO; every read happens inside
// a function call, after the pages' guards have already run.
//
// FAIL-CLOSED: every golden result is re-validated on load (identity validator
// + the binding persistence gate for scored results) — a tampered or drifted
// artifact throws a typed ConflictDomainError instead of rendering.
//
// LEGAL/ACCESS BOUNDARIES built into the shape of what this module returns:
// - reference-unit TEXT never leaves this module (units surface as ids +
//   lane/flags only — the fixture scenarios' unit text is read for NOTHING);
// - claim TEXT is returned ONLY by publishedEvidenceRows(), the gated
//   evidence-view feed, and ONLY for claims that genuinely appeared in a
//   designated published digest (published === true, non-stub, ≥1 doc);
// - corpus-recall-only doc_claims support COUNTS in the results themselves;
//   nothing here exposes their text (register #7 pin).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFLICT_REGISTRY, type ConflictDefinition } from "./definitions";
import { ConflictDomainError } from "./errors";
import {
  assertPersistableConflictResultV1,
  validateConflictResultIdentityV1,
  type ConflictResultV1,
  type ConflictScoredResultV1,
} from "./eval-profile";
import type { CandidateDoc, HedgingValue } from "./evidence-records";
import { GOLDEN_RESULTS_FILE } from "./goldens";
import type { ConflictLaneId } from "./lanes";
import type { MatchCoverage } from "./match-contract";
import {
  loadConflictFixtureScenarios,
  type ConflictFixtureScenario,
} from "./fixture-corpus";
import type { Track } from "../analysis/tracks";
import { isConflictId, type ConflictId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Route identity: stable public slugs ⇄ conflict ids
// ---------------------------------------------------------------------------

/** Stable public URL slugs (IA decision, P6 report §1). Never re-keyed. */
export const CONFLICT_SLUGS: Readonly<Record<string, ConflictId>> = {
  "russia-ukraine": "russia_ukraine",
  "iran-regional": "iran_regional",
};

export function conflictIdForSlug(slug: string): ConflictId | null {
  const id = CONFLICT_SLUGS[slug];
  return id === undefined ? null : id;
}

export function slugForConflictId(id: ConflictId): string {
  for (const [slug, cid] of Object.entries(CONFLICT_SLUGS)) {
    if (cid === id) return slug;
  }
  // unreachable while CONFLICT_SLUGS covers CONFLICT_IDS; fail closed anyway
  throw new ConflictDomainError("unknown_conflict", `no slug for conflict ${id}`);
}

/** Benchmark URL key = golden result key with the ladder-variant `#`
 *  replaced by the URL-safe `~` (IA decision: fixture-backed benchmark
 *  observations are addressed by their stable golden key; when real results
 *  exist at enablement the same opaque-key route accepts a report/edition
 *  key without a route change). */
export function benchmarkKeyOf(goldenKey: string): string {
  return goldenKey.replace("#", "~");
}

const BENCHMARK_KEY_SHAPE = /^[a-z0-9][a-z0-9-]*(~[A-Za-z0-9][A-Za-z0-9-]*)?$/;

export function goldenKeyOfBenchmarkKey(benchmarkKey: string): string | null {
  if (!BENCHMARK_KEY_SHAPE.test(benchmarkKey)) return null;
  return benchmarkKey.replace("~", "#");
}

// ---------------------------------------------------------------------------
// Loading + validation
// ---------------------------------------------------------------------------

/** The fixture files' REQUIRED legal-safety markers (register #7), surfaced so
 *  every conflict page can render the synthetic-corpus disclaimer verbatim. */
export interface CorpusMarkers {
  synthetic: true;
  provenance: string;
  disclaimer: string;
}

export function loadCorpusMarkers(): CorpusMarkers {
  // All three fixture files carry the markers (the loader refuses files that
  // lost them); the roca file is read as the canonical copy and the shared
  // disclaimer text is what renders.
  const path = join(process.cwd(), "fixtures", "conflicts", "roca-scenarios-v1.json");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).synthetic !== true ||
    typeof (parsed as Record<string, unknown>).provenance !== "string" ||
    typeof (parsed as Record<string, unknown>).disclaimer !== "string"
  ) {
    throw new ConflictDomainError(
      "invalid_fixture_scenario",
      "fixture corpus is missing the synthetic/provenance/disclaimer legal markers",
    );
  }
  const record = parsed as Record<string, unknown>;
  return {
    synthetic: true,
    provenance: record.provenance as string,
    disclaimer: record.disclaimer as string,
  };
}

export interface ConflictBenchmarkEntry {
  /** URL-safe key for the benchmark detail route */
  benchmarkKey: string;
  /** the committed golden key (scenario id, or `<scenario>#<variant>`) */
  goldenKey: string;
  scenarioId: string;
  /** ladder-variant id when this entry is a matcher-rung variant */
  variantId: string | null;
  /** fixture scenario title — synthetic demonstration label, never prose */
  scenarioTitle: string;
  result: ConflictResultV1;
}

function loadGoldenResults(): Record<string, unknown> {
  // statically scoped literal path (a `join(process.cwd(), <variable>)` makes
  // Turbopack's file tracing treat the whole project as a dependency); the
  // goldens.ts constant is asserted equal so the two paths can never drift
  if (GOLDEN_RESULTS_FILE !== "fixtures/conflicts/goldens/golden-results-v1.json") {
    throw new ConflictDomainError("invalid_score_request", "golden results path drifted");
  }
  const path = join(process.cwd(), "fixtures", "conflicts", "goldens", "golden-results-v1.json");
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConflictDomainError("invalid_score_request", "golden results file is not an object");
  }
  return parsed as Record<string, unknown>;
}

function validatedResult(goldenKey: string, raw: unknown): ConflictResultV1 {
  const errs = validateConflictResultIdentityV1(raw);
  if (errs.length > 0) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `golden ${goldenKey} failed identity validation: ${errs.join("; ")}`,
    );
  }
  const result = raw as ConflictResultV1;
  // scored results must carry every binding stamp (the persistence gate)
  assertPersistableConflictResultV1(result);
  return result;
}

/** Sort: newest report/gap day first, then key for a stable total order. */
function entryDay(result: ConflictResultV1): string {
  if (result.state === "unavailable" && result.unavailableReason === "publication_gap") {
    return result.gapDate;
  }
  return result.report.reportDate;
}

/** All fixture-backed benchmark entries for one conflict, validated, newest
 *  first. */
export function loadConflictBenchmarks(conflictId: ConflictId): ConflictBenchmarkEntry[] {
  const goldens = loadGoldenResults();
  const scenarios = new Map(loadConflictFixtureScenarios().map((s) => [s.id, s]));
  const entries: ConflictBenchmarkEntry[] = [];
  for (const [goldenKey, raw] of Object.entries(goldens)) {
    const result = validatedResult(goldenKey, raw);
    if (result.conflictId !== conflictId) continue;
    const [scenarioId, variantId] = goldenKey.includes("#")
      ? [goldenKey.slice(0, goldenKey.indexOf("#")), goldenKey.slice(goldenKey.indexOf("#") + 1)]
      : [goldenKey, null];
    const scenario = scenarios.get(scenarioId);
    if (scenario === undefined) {
      throw new ConflictDomainError(
        "invalid_score_request",
        `golden ${goldenKey} has no fixture scenario ${scenarioId}`,
      );
    }
    entries.push({
      benchmarkKey: benchmarkKeyOf(goldenKey),
      goldenKey,
      scenarioId,
      variantId,
      scenarioTitle: scenario.title,
      result,
    });
  }
  entries.sort((a, b) => {
    const dayCmp = entryDay(b.result).localeCompare(entryDay(a.result));
    if (dayCmp !== 0) return dayCmp;
    return a.goldenKey.localeCompare(b.goldenKey);
  });
  return entries;
}

export interface ConflictProductView {
  conflictId: ConflictId;
  definition: ConflictDefinition;
  markers: CorpusMarkers;
  entries: ConflictBenchmarkEntry[];
  /** newest scored entry (the overview's featured benchmark), null when the
   *  corpus holds none */
  featured: ConflictBenchmarkEntry | null;
}

export function loadConflictProductView(conflictId: ConflictId): ConflictProductView {
  const entries = loadConflictBenchmarks(conflictId);
  const featured = entries.find((e) => e.result.state === "scored") ?? null;
  return {
    conflictId,
    definition: CONFLICT_REGISTRY[conflictId],
    markers: loadCorpusMarkers(),
    entries,
    featured,
  };
}

export interface BenchmarkDetail {
  entry: ConflictBenchmarkEntry;
  definition: ConflictDefinition;
  markers: CorpusMarkers;
}

export function loadBenchmarkDetail(
  conflictId: ConflictId,
  benchmarkKey: string,
): BenchmarkDetail | null {
  const goldenKey = goldenKeyOfBenchmarkKey(benchmarkKey);
  if (goldenKey === null) return null;
  const entry = loadConflictBenchmarks(conflictId).find((e) => e.goldenKey === goldenKey);
  if (entry === undefined) return null;
  return { entry, definition: CONFLICT_REGISTRY[conflictId], markers: loadCorpusMarkers() };
}

// ---------------------------------------------------------------------------
// Per-population partial counts (Gate-4 binding obligation (a))
// ---------------------------------------------------------------------------

export interface PartialCounts {
  corpusRecall: number;
  publishedRetention: number;
  /** the headline diagnostic: the UNION of distinct partial units across both
   *  populations — never presented as a per-population number */
  union: number;
}

export function partialCountsOf(result: ConflictScoredResultV1): PartialCounts {
  const count = (verdicts: Readonly<Record<string, string>>): number =>
    Object.values(verdicts).filter((v) => v === "partial").length;
  return {
    corpusRecall: count(result.corpusRecall),
    publishedRetention: count(result.publishedRetention),
    union: result.headline.partialDiagnostic ?? 0,
  };
}

// ---------------------------------------------------------------------------
// The gated evidence feed (published-retention population ONLY)
// ---------------------------------------------------------------------------

export interface PublishedEvidenceRow {
  claimId: number;
  /** published digest claim text — renders ONLY on the gated surface */
  text: string;
  theater: string;
  track: Track;
  hedge: HedgingValue;
  legacy: boolean;
  claimDate: string;
  /** matcher-recorded confidence when this claim matched a takeaway */
  confidence: number | null;
  earliestIngestAt: string | null;
  /** takeaways this claim matched — ids/lanes only, never takeaway text */
  matchedUnits: readonly { unitId: string; lane: ConflictLaneId; coverage: MatchCoverage }[];
  /** lane label when this claim is an in-scope BNOW-only item */
  bnowOnlyLane: ConflictLaneId | null;
  /** full source trail from the originating documents */
  docs: readonly CandidateDoc[];
}

function publishedClaimOrThrow(
  scenario: ConflictFixtureScenario,
  claimId: number,
): ConflictFixtureScenario["evidence"][number] {
  const claim = scenario.evidence.find((c) => c.claimId === claimId);
  if (claim === undefined) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `evidence view: claim ${claimId} not in scenario ${scenario.id}`,
    );
  }
  // Belt-and-braces truth-in-UI/traceability re-checks (rulings 2/3): the P3
  // engine already excluded stub and sourceless candidates from the retention
  // population; refuse loudly if a joined row would violate that anyway.
  if (!claim.published || claim.stub || claim.docs.length === 0) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `evidence view: claim ${claimId} is not a renderable published claim (published=${claim.published}, stub=${claim.stub}, docs=${claim.docs.length})`,
    );
  }
  return claim;
}

/** The "what changed" union for one scored result: every published-retention
 *  claim the evaluation saw — matched agreements plus in-scope BNOW-only
 *  items — joined back to its fixture claim text and source trail. Ordered by
 *  claim day then id (deterministic). Corpus-recall-only claims NEVER appear
 *  here. */
export function publishedEvidenceRows(
  scenario: ConflictFixtureScenario,
  result: ConflictScoredResultV1,
): PublishedEvidenceRow[] {
  const byClaim = new Map<number, PublishedEvidenceRow>();
  for (const agreement of result.agreements?.publishedRetention ?? []) {
    for (const agreementClaim of agreement.claims) {
      const claim = publishedClaimOrThrow(scenario, agreementClaim.claimId);
      const existing = byClaim.get(claim.claimId);
      const unit = {
        unitId: agreement.unitId,
        lane: agreement.lane,
        coverage: agreementClaim.coverage,
      };
      if (existing) {
        byClaim.set(claim.claimId, {
          ...existing,
          matchedUnits: [...existing.matchedUnits, unit],
        });
        continue;
      }
      byClaim.set(claim.claimId, {
        claimId: claim.claimId,
        text: claim.text,
        theater: agreementClaim.theater,
        track: agreementClaim.track,
        hedge: agreementClaim.hedge,
        legacy: agreementClaim.legacy,
        claimDate: claim.claimDate,
        confidence: agreementClaim.confidence,
        earliestIngestAt: agreementClaim.earliestIngestAt,
        matchedUnits: [unit],
        bnowOnlyLane: null,
        docs: claim.docs,
      });
    }
  }
  for (const item of result.bnowOnly?.publishedRetention.items ?? []) {
    if (byClaim.has(item.claimId)) continue; // matched rows already carry it
    const claim = publishedClaimOrThrow(scenario, item.claimId);
    byClaim.set(item.claimId, {
      claimId: item.claimId,
      text: claim.text,
      theater: item.theater,
      track: item.track,
      hedge: item.hedge,
      legacy: item.legacy,
      claimDate: claim.claimDate,
      confidence: null,
      earliestIngestAt: null,
      matchedUnits: [],
      bnowOnlyLane: item.lane,
      docs: claim.docs,
    });
  }
  return [...byClaim.values()].sort(
    (a, b) => a.claimDate.localeCompare(b.claimDate) || a.claimId - b.claimId,
  );
}

/** The gated evidence view's full load: detail + scenario + joined rows.
 *  Returns null for unknown keys; a non-scored result yields rows: null (the
 *  page renders the unavailable explanation instead — never an empty list
 *  masquerading as "nothing changed"). */
export function loadEvidenceView(
  conflictId: ConflictId,
  benchmarkKey: string,
): (BenchmarkDetail & { rows: PublishedEvidenceRow[] | null }) | null {
  const detail = loadBenchmarkDetail(conflictId, benchmarkKey);
  if (detail === null) return null;
  if (detail.entry.result.state !== "scored") return { ...detail, rows: null };
  const scenario = loadConflictFixtureScenarios().find((s) => s.id === detail.entry.scenarioId);
  if (scenario === undefined) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `evidence view: scenario ${detail.entry.scenarioId} not in corpus`,
    );
  }
  return { ...detail, rows: publishedEvidenceRows(scenario, detail.entry.result) };
}

/** Guard against accidental misuse elsewhere: quick check that a conflict id
 *  string is valid before the registry lookup (pages resolve slugs first, but
 *  the provider stays fail-closed on its own). */
export function assertConflictId(id: string): ConflictId {
  if (!isConflictId(id)) {
    throw new ConflictDomainError("unknown_conflict", `unknown conflict id: ${JSON.stringify(id)}`);
  }
  return id;
}
