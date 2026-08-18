// Candidate-claim and evidence-record shapes for the Phase 3 relevance-filtered
// cross-theater evidence union (contract §5, §6.1; workstream prompt §11).
//
// ANTI-GAMING (contract §5, frozen): evidence eligibility is computed WITHOUT
// the reference report's content. Enforcement, stated precisely:
//   - the only report-derived inputs the eligibility engine receives are the
//     report's TIME ANCHORS (reportDate/cutoffAt/publishedAt), which
//     parameterize the frozen evaluation window — never its content;
//   - CandidateClaim/CandidateDoc have no field that could carry a reference
//     unit or takeaway text, and the fixture loader REBUILDS candidates
//     against the key allowlists below (unknown keys dropped), so a poisoned
//     fixture cannot smuggle unit text into a candidate (pinned by tests);
//   - structural typing alone CANNOT keep a wider report object out of the
//     request (a units-bearing fixture report shape is assignable to
//     AssemblerReport), so the assembler's prepare() ALSO refuses any report
//     object carrying keys outside the ASSEMBLER_REPORT_KEYS allowlist at
//     runtime;
//   - assembly outputs copy only the report's editionKey/reportDate, and
//     output cleanliness is test-audited (the fixture sentinel appears in
//     inputs and never in any serialized assembly).
//
// The two pipeline populations (contract §6.1, register #4) get SEPARATE record
// types with incompatible discriminants:
//   - CorpusRecallRecord: engine is the LITERAL "mapreduce" and
//     currentExtractorVersion the LITERAL true — a legacy-engine or superseded
//     claim cannot be a corpus-recall record at the type level;
//   - PublishedRetentionRecord: carries provenance "mapreduce"|"legacy" and the
//     `legacy` label — legacy digest claims are members HERE, labeled, never
//     map-equivalent.
// Conflating the two assemblies is the exact defect §6.1 forbids; the types
// make the conflation a compile error (see evidence-assembler.ts).

import type { Track } from "../analysis/tracks";
import type { ConflictLaneId } from "./lanes";
import type { ConflictId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Hedging (mirrors the DB hedging enum; never strengthened by anything here)
// ---------------------------------------------------------------------------

export const HEDGING_VALUES = ["confirmed", "claimed", "unverified", "assessed", "unknown"] as const;
export type HedgingValue = (typeof HEDGING_VALUES)[number];

export function isHedgingValue(value: unknown): value is HedgingValue {
  return typeof value === "string" && (HEDGING_VALUES as readonly string[]).includes(value);
}

export const CANDIDATE_ENGINES = ["mapreduce", "legacy"] as const;
export type CandidateEngine = (typeof CANDIDATE_ENGINES)[number];

export function isCandidateEngine(value: unknown): value is CandidateEngine {
  return typeof value === "string" && (CANDIDATE_ENGINES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Candidate inputs (repository/fixture output, eligibility-engine input)
// ---------------------------------------------------------------------------

export interface CandidateDoc {
  docId: number;
  adapter: string;
  platform: string | null;
  sourceDomain: string;
  /** source-declared publish instant — RAW string (may be malformed/missing in
   *  degraded ingest; classified, never guessed) */
  publishedAt: string | null;
  /** BNOW ingest instant — RAW string, same treatment */
  fetchedAt: string | null;
  /** non-null marks this doc a mirror/repost of another doc (doc_dedup
   *  semantics): NEVER independent corroboration */
  mirrorOfDocId: number | null;
  /** original source language when the claim derives from translation */
  sourceLanguage: string | null;
}

export interface CandidateClaim {
  claimId: number;
  /** iso2 theater code — a coverage lens, never a nationality (ruling 11) */
  theater: string;
  track: Track;
  /** the claim's own text (BNOW-side; needed for classification, byte bounds,
   *  and the later matcher input) — NEVER reference-report text */
  text: string;
  hedging: HedgingValue;
  /** yyyy-mm-dd day-granular event/claim date */
  claimDate: string;
  docs: readonly CandidateDoc[];
  engine: CandidateEngine;
  /** false on a mapreduce row = superseded extractor version (rulings 13/18) */
  currentExtractorVersion: boolean;
  /** extractor-version identity when known (a real repository fills this via
   *  src/lib/analysis/map-versions.ts); null in fixture-backed candidates,
   *  which carry only the currentExtractorVersion boolean */
  extractorVersion: string | null;
  /** the claim genuinely appeared in a designated user-facing digest
   *  (published-retention population membership signal; register #4) */
  published: boolean;
  /** stub/fixture provenance — always excluded (ruling 3) */
  stub: boolean;
  /** registry reliability of the claim's primary source when known (real
   *  repository); null in fixtures — ordering falls to the stable key */
  sourceReliability: number | null;
}

/** The exact own-key sets of the candidate input shapes. The fixture loader
 *  rebuilds candidates against these allowlists (unknown keys are DROPPED), so
 *  the structural no-reference-text guarantee cannot be bypassed by extra
 *  fields riding through JSON. Pinned by tests. */
export const CANDIDATE_CLAIM_KEYS = [
  "claimId",
  "theater",
  "track",
  "text",
  "hedging",
  "claimDate",
  "docs",
  "engine",
  "currentExtractorVersion",
  "extractorVersion",
  "published",
  "stub",
  "sourceReliability",
] as const;

export const CANDIDATE_DOC_KEYS = [
  "docId",
  "adapter",
  "platform",
  "sourceDomain",
  "publishedAt",
  "fetchedAt",
  "mirrorOfDocId",
  "sourceLanguage",
] as const;

/** Adapter names whose documents are FIXTURE STUBS (ruling 3: stub data never
 *  persists or renders as fact). SOURCE OF TRUTH: `src/lib/adapters/stubs.ts`
 *  — today exactly the two `FixtureStubAdapter` instances exported there
 *  (`xStub` name "x", `acledStub` name "acled"). Deliberately NOT
 *  `telegram_mtproto`: that name once belonged to a stub but the REAL MTProto
 *  adapter owns it since 2026-07-11, and stubs.ts warns in-file that it must
 *  not be treated as stub contamination.
 *
 *  This constant exists so the documented corpus-recall query contract can
 *  name a real symbol instead of a prose placeholder (Gate-7 safety M-1). A
 *  future DB mapper populates `CandidateClaim.stub` from it — a row whose
 *  `raw_documents.adapter` is in this list is `stub: true` — and the
 *  assembler's intake validation refuses a candidate that omits the boolean,
 *  so an untyped mapper cannot let a stub through as `undefined`. Keep this
 *  list in sync with stubs.ts whenever an adapter is stubbed or unstubbed. */
export const STUB_ADAPTER_NAMES = ["x", "acled"] as const;

// ---------------------------------------------------------------------------
// Per-claim availability diagnostics (contract §6.4; at-publish proxy semantics)
// ---------------------------------------------------------------------------

/** BNOW ingest time (earliest fetchedAt) vs the report's declared anchors.
 *  null = truthfully unknown (anchor missing/malformed, or no parseable ingest
 *  instant) — never coerced to false; unavailable is distinct from no. */
export interface ClaimAvailability {
  atCutoff: boolean | null;
  atPublication: boolean | null;
}

// ---------------------------------------------------------------------------
// The two population record types (SEPARATE; contract §6.1)
// ---------------------------------------------------------------------------

interface EvidenceRecordBase {
  claimId: number;
  conflictId: ConflictId;
  /** assigned through the fail-closed taxonomy helpers (lanes.ts) — never a
   *  raw string (Gate-1 carried condition) */
  lane: ConflictLaneId;
  /** contributing theater (coverage lens) and track */
  theater: string;
  track: Track;
  hedge: HedgingValue;
  /** event time (day-granular claim date) */
  claimDate: string;
  text: string;
  sourceDocumentIds: readonly number[];
  /** full docs with mirror relationships PRESERVED for independent-source
   *  diagnostics */
  docs: readonly CandidateDoc[];
  /** count of this record's own non-mirror documents (mirrors add zero) */
  independentSourceCount: number;
  /** earliest BNOW ingest instant (raw string of the earliest-parsing doc),
   *  null when no doc carries a parseable fetchedAt */
  earliestIngestAt: string | null;
  /** free-form inclusion diagnostics (`actor:`/`geo:`/`lane:`/`track:`/
   *  `window:` prefixes — the fixture corpus vocabulary) */
  inclusionReasons: readonly string[];
  /** ALL actor-roster hits (the frozen geography-over-actor rule keeps the
   *  actor contributing to actor-level attribution even when it does not
   *  govern the lane or the emitted reason) */
  actorHits: readonly string[];
  availability: ClaimAvailability;
  sourceReliability: number | null;
}

/** Corpus-recall population member (pipeline question 1): current-version
 *  mapped claims ONLY. The literals make legacy/superseded membership a type
 *  error, not a runtime hope. */
export interface CorpusRecallRecord extends EvidenceRecordBase {
  population: "corpus_recall";
  engine: "mapreduce";
  currentExtractorVersion: true;
  extractorVersion: string | null;
}

/** Published-retention population member (pipeline question 2): claims that
 *  GENUINELY appeared in designated user-facing digests. Legacy digest claims
 *  are members here — included but LABELED, never map-equivalent. */
export interface PublishedRetentionRecord extends EvidenceRecordBase {
  population: "published_retention";
  provenance: CandidateEngine;
  /** true iff provenance === "legacy" — the mandatory visible label */
  legacy: boolean;
  extractorVersion: string | null;
}
