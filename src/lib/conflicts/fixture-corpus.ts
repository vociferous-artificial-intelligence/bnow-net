// Loader + in-memory evidence source for the frozen Phase 0 acceptance
// fixture corpus (fixtures/conflicts/*.json; README there is the schema
// authority). Phase 3's acceptance wiring: the scenarios' expected eligibility
// verdicts must be reproduced by the real engine (fixture-corpus.test.ts).
//
// FAIL-CLOSED loading: unknown conflict ids, tracks, hedging, engines, or
// malformed report/evidence shapes throw typed ConflictDomainError — a
// drifted fixture fails loudly, never silently reinterprets.
//
// STRUCTURAL ANTI-GAMING: candidates are REBUILT field-by-field against the
// CANDIDATE_*_KEYS allowlists (evidence-records.ts). Reference units are
// deliberately NOT loaded into any candidate or assembler input — the
// scenario's `report.units` stay behind `scenarioUnits()` for TEST assertions
// (denominator pins, sentinel-presence audits) and never reach the engine.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Track } from "../analysis/tracks";
import { ConflictDomainError } from "./errors";
import {
  isCandidateEngine,
  isHedgingValue,
  type CandidateClaim,
  type CandidateDoc,
} from "./evidence-records";
import type {
  AssemblerReport,
  CorpusRecallClaimSource,
  PublishedRetentionClaimSource,
} from "./evidence-assembler";
import { isConflictId, type ConflictId } from "./vocabulary";

export const CONFLICT_FIXTURE_FILES = [
  "roca-scenarios-v1.json",
  "iran-scenarios-v1.json",
  "crosscutting-scenarios-v1.json",
] as const;

const TRACK_VALUES = ["military", "elite_politics", "nuclear"] as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function fail(scenarioId: string, message: string): never {
  throw new ConflictDomainError(
    "invalid_fixture_scenario",
    `fixture scenario ${scenarioId}: ${message}`,
  );
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface FixtureReportShape extends AssemblerReport {
  designatedFinal: boolean | null;
  /** unit ids + flags for TEST-side pins; unit TEXT stays here too but is
   *  consumed only by tests (sentinel audit, denominator counts) — never by
   *  the engine */
  units: readonly { unitId: string; text: string; lane: string; compound: boolean; negative: boolean }[];
}

export interface ConflictFixtureScenario {
  id: string;
  title: string;
  acceptanceRef: string;
  conflictId: ConflictId;
  /** null = publication gap scenario */
  report: FixtureReportShape | null;
  /** multi-edition scenarios only */
  reports: readonly FixtureReportShape[] | null;
  editionPolicy: string | null;
  gapDate: string | null;
  digestRegeneratedAt: string | null;
  evidence: readonly CandidateClaim[];
  /** the frozen expected block — consumed and narrowed by tests */
  expected: Record<string, unknown>;
  /** matcher-fixture block (Phase 4's input) — carried opaque */
  matcherFixture: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Parsing (allowlist rebuild)
// ---------------------------------------------------------------------------

function parseDoc(scenarioId: string, raw: unknown): CandidateDoc {
  if (!isRecord(raw)) fail(scenarioId, "doc is not an object");
  const { docId, adapter, platform, sourceDomain, publishedAt, fetchedAt, mirrorOfDocId } = raw;
  if (typeof docId !== "number") fail(scenarioId, "doc.docId must be a number");
  if (typeof adapter !== "string") fail(scenarioId, "doc.adapter must be a string");
  if (platform !== null && typeof platform !== "string") fail(scenarioId, "doc.platform must be string|null");
  if (typeof sourceDomain !== "string") fail(scenarioId, "doc.sourceDomain must be a string");
  if (publishedAt !== null && typeof publishedAt !== "string") fail(scenarioId, "doc.publishedAt must be string|null");
  if (fetchedAt !== null && typeof fetchedAt !== "string") fail(scenarioId, "doc.fetchedAt must be string|null");
  if (mirrorOfDocId !== null && typeof mirrorOfDocId !== "number") fail(scenarioId, "doc.mirrorOfDocId must be number|null");
  const sourceLanguage = typeof raw.sourceLanguage === "string" ? raw.sourceLanguage : null;
  // REBUILD against the allowlist: unknown keys are dropped
  return { docId, adapter, platform, sourceDomain, publishedAt, fetchedAt, mirrorOfDocId, sourceLanguage };
}

function parseClaim(scenarioId: string, raw: unknown): CandidateClaim {
  if (!isRecord(raw)) fail(scenarioId, "claim is not an object");
  const { claimId, theater, track, text, hedging, claimDate, docs, engine } = raw;
  if (typeof claimId !== "number") fail(scenarioId, "claim.claimId must be a number");
  if (typeof theater !== "string") fail(scenarioId, "claim.theater must be a string");
  if (typeof track !== "string" || !(TRACK_VALUES as readonly string[]).includes(track)) {
    fail(scenarioId, `claim.track invalid: ${JSON.stringify(track)}`);
  }
  if (typeof text !== "string") fail(scenarioId, "claim.text must be a string");
  if (!isHedgingValue(hedging)) fail(scenarioId, `claim.hedging invalid: ${JSON.stringify(hedging)}`);
  if (typeof claimDate !== "string") fail(scenarioId, "claim.claimDate must be a string");
  if (!Array.isArray(docs)) fail(scenarioId, "claim.docs must be an array");
  if (!isCandidateEngine(engine)) fail(scenarioId, `claim.engine invalid: ${JSON.stringify(engine)}`);
  if (typeof raw.currentExtractorVersion !== "boolean") fail(scenarioId, "claim.currentExtractorVersion must be a boolean");
  if (typeof raw.published !== "boolean") fail(scenarioId, "claim.published must be a boolean");
  if (typeof raw.stub !== "boolean") fail(scenarioId, "claim.stub must be a boolean");
  return {
    claimId,
    theater,
    track: track as Track,
    text,
    hedging,
    claimDate,
    docs: docs.map((d) => parseDoc(scenarioId, d)),
    engine,
    currentExtractorVersion: raw.currentExtractorVersion,
    extractorVersion: null, // fixtures carry only the boolean (README convention)
    published: raw.published,
    stub: raw.stub,
    sourceReliability: null, // fixtures carry none; ordering falls to claimId
  };
}

function parseReport(scenarioId: string, raw: unknown): FixtureReportShape {
  if (!isRecord(raw)) fail(scenarioId, "report is not an object");
  const { series, editionKey, reportDate, cutoffAt, publishedAt, units } = raw;
  if (typeof series !== "string") fail(scenarioId, "report.series must be a string");
  if (typeof editionKey !== "string") fail(scenarioId, "report.editionKey must be a string");
  if (typeof reportDate !== "string") fail(scenarioId, "report.reportDate must be a string");
  if (cutoffAt !== null && typeof cutoffAt !== "string") fail(scenarioId, "report.cutoffAt must be string|null");
  if (publishedAt !== null && typeof publishedAt !== "string") fail(scenarioId, "report.publishedAt must be string|null");
  if (!Array.isArray(units)) fail(scenarioId, "report.units must be an array");
  const parsedUnits = units.map((u) => {
    if (!isRecord(u)) fail(scenarioId, "unit is not an object");
    const { unitId, text, lane, compound, negative } = u;
    if (typeof unitId !== "string" || typeof text !== "string" || typeof lane !== "string") {
      fail(scenarioId, "unit unitId/text/lane must be strings");
    }
    return { unitId, text, lane, compound: compound === true, negative: negative === true };
  });
  return {
    series,
    editionKey,
    reportDate,
    cutoffAt,
    publishedAt,
    designatedFinal: typeof raw.designatedFinal === "boolean" ? raw.designatedFinal : null,
    units: parsedUnits,
  };
}

function parseScenario(fileConflictId: string, raw: unknown): ConflictFixtureScenario {
  if (!isRecord(raw)) {
    throw new ConflictDomainError("invalid_fixture_scenario", "scenario is not an object");
  }
  const id = typeof raw.id === "string" ? raw.id : "(missing id)";
  if (typeof raw.id !== "string") fail(id, "id must be a string");
  if (!isConflictId(raw.conflictId)) fail(id, `conflictId invalid: ${JSON.stringify(raw.conflictId)}`);
  if (fileConflictId !== "mixed" && raw.conflictId !== fileConflictId) {
    fail(id, `scenario conflictId ${raw.conflictId} disagrees with file conflictId ${fileConflictId}`);
  }
  if (!Array.isArray(raw.evidence)) fail(id, "evidence must be an array");
  if (!isRecord(raw.expected)) fail(id, "expected must be an object");
  const hasReports = Array.isArray(raw.reports);
  const report =
    raw.report === null || raw.report === undefined
      ? null
      : parseReport(id, raw.report);
  const reports = hasReports ? (raw.reports as unknown[]).map((r) => parseReport(id, r)) : null;
  if (report === null && reports === null && raw.gapDate === undefined) {
    fail(id, "scenario has neither report, reports, nor gapDate");
  }
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    acceptanceRef: typeof raw.acceptanceRef === "string" ? raw.acceptanceRef : "",
    conflictId: raw.conflictId,
    report,
    reports,
    editionPolicy: typeof raw.editionPolicy === "string" ? raw.editionPolicy : null,
    gapDate: typeof raw.gapDate === "string" ? raw.gapDate : null,
    digestRegeneratedAt: typeof raw.digestRegeneratedAt === "string" ? raw.digestRegeneratedAt : null,
    evidence: (raw.evidence as unknown[]).map((c) => parseClaim(id, c)),
    expected: raw.expected,
    matcherFixture: isRecord(raw.matcherFixture) ? raw.matcherFixture : null,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadConflictFixtureFile(
  fileName: string,
  // overridable base directory so tests can exercise IO/parse failures on a
  // TEMP dir — production callers never pass it
  baseDir: string = join(process.cwd(), "fixtures", "conflicts"),
): ConflictFixtureScenario[] {
  // IO and JSON failures surface as TYPED domain errors (house style), with
  // the underlying driver/parser message preserved
  let rawText: string;
  try {
    rawText = readFileSync(join(baseDir, fileName), "utf8");
  } catch (e) {
    throw new ConflictDomainError(
      "invalid_fixture_scenario",
      `${fileName}: unreadable fixture file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new ConflictDomainError(
      "invalid_fixture_scenario",
      `${fileName}: malformed fixture JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new ConflictDomainError("invalid_fixture_scenario", `${fileName}: not an object`);
  }
  // legal-safety markers are REQUIRED (register #7) — refuse a fixture file
  // that lost them
  if (parsed.synthetic !== true || typeof parsed.provenance !== "string" || typeof parsed.disclaimer !== "string") {
    throw new ConflictDomainError(
      "invalid_fixture_scenario",
      `${fileName}: missing the synthetic/provenance/disclaimer legal markers`,
    );
  }
  if (!Array.isArray(parsed.scenarios)) {
    throw new ConflictDomainError("invalid_fixture_scenario", `${fileName}: scenarios must be an array`);
  }
  const fileConflict = typeof parsed.conflictId === "string" ? parsed.conflictId : "mixed";
  return parsed.scenarios.map((s) => parseScenario(fileConflict, s));
}

/** All 40 scenarios across the three frozen files. */
export function loadConflictFixtureScenarios(): ConflictFixtureScenario[] {
  return CONFLICT_FIXTURE_FILES.flatMap((f) => loadConflictFixtureFile(f));
}

// ---------------------------------------------------------------------------
// Deterministic report selection (fixture edition policy)
// ---------------------------------------------------------------------------

/** The scenario's ONE evaluated report: the designated-final edition under
 *  the explicit fixture policy — never rows[0] of an unordered set — or null
 *  for a publication gap. */
export function selectedScenarioReport(scenario: ConflictFixtureScenario): FixtureReportShape | null {
  if (scenario.reports !== null) {
    if (scenario.editionPolicy !== "designated_final") {
      fail(scenario.id, `multi-edition scenario requires editionPolicy designated_final, got ${JSON.stringify(scenario.editionPolicy)}`);
    }
    const finals = scenario.reports.filter((r) => r.designatedFinal === true);
    if (finals.length !== 1) {
      fail(scenario.id, `expected exactly one designatedFinal edition, got ${finals.length}`);
    }
    return finals[0];
  }
  return scenario.report;
}

/** Project a fixture report shape onto the CLEAN AssemblerReport key set —
 *  the honest request wiring: `units` (test-side reference text) and
 *  `designatedFinal` never ride into the assembler, whose prepare() also
 *  refuses any extra report key at runtime. */
export function assemblerReportOf(report: FixtureReportShape | null): AssemblerReport | null {
  if (report === null) return null;
  return {
    series: report.series,
    editionKey: report.editionKey,
    reportDate: report.reportDate,
    cutoffAt: report.cutoffAt,
    publishedAt: report.publishedAt,
  };
}

// ---------------------------------------------------------------------------
// Fixture-backed evidence source (both repository interfaces)
// ---------------------------------------------------------------------------

/** In-memory source over one scenario. Corpus-recall candidates are ALL of
 *  the scenario's evidence rows (the fixture convention: expected.eligibility
 *  covers every claim, including the ones the engine must refuse);
 *  published-retention candidates are the rows that GENUINELY appeared in a
 *  designated digest (published === true; register #4). */
export class FixtureEvidenceSource
  implements CorpusRecallClaimSource, PublishedRetentionClaimSource
{
  constructor(private readonly scenario: ConflictFixtureScenario) {}

  async corpusRecallCandidates(): Promise<readonly CandidateClaim[]> {
    return this.scenario.evidence;
  }

  async publishedRetentionCandidates(): Promise<readonly CandidateClaim[]> {
    return this.scenario.evidence.filter((c) => c.published);
  }
}
