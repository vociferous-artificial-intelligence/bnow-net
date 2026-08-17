// Bounded candidate selection (Phase 3; contract §5 anti-gaming freeze:
// "Mix caps (per source/platform, reusing the house ~40% cap pattern) bound
// any single corpus from crowding the candidate set; deterministic ordering
// before any LLM sees candidates; prompt/input sizes bounded and measured").
//
// This reuses the SHAPE of src/lib/analysis/source-mix.ts (the OPEN-TASKS #16
// ~40% diversity quota): walk the reliability-ordered list, cap every bucket
// at ceil(cap × max), then fill remaining slots past the cap when the corpus
// lacks alternatives (coverage beats diversity on thin days). Differences,
// recorded:
//   - buckets are per SOURCE DOMAIN and per PLATFORM of each record's PRIMARY
//     document (the earliest-ingested non-mirror doc — deterministic), because
//     the unit here is a claim record, not a doc;
//   - a NULL platform is EXEMPT from platform bucketing (the realistic corpus
//     is mostly platform-null RSS: sharing one "none" bucket would cap ten
//     independent domains as if they were one platform — Gate-3 MAJOR). The
//     per-domain cap still applies to every record;
//   - pass-2 refill iterates deferrals ROUND-ROBIN across primary-doc domains
//     (the house source-mix.ts overflow rule: interleave so freed slots do
//     not re-concentrate in the top-reliability capped domain), and
//     cappedOut/budgetOut are re-sorted into the total order afterward;
//   - the final selected list is re-sorted into the ONE deterministic total
//     order (below), not interleaved — the digest's prefix-retry interleave
//     rationale does not apply to the conflict evaluator;
//   - every deferral and every displacement is RECORDED: a capped-out
//     candidate carries a visible diagnostic DISTINCT from ineligibility. The
//     cap NEVER changes an eligibility verdict — it only changes selection.
//
// DETERMINISTIC TOTAL ORDER (pinned by tests): sourceReliability DESCENDING
// with nulls last, then claimId ASCENDING (the stable key). Applied to the
// eligible set before selection and to the selected set before any LLM would
// see it.
//
// BOUNDS (measured + enforced): max record count, total UTF-8 text bytes, and
// a per-record text ceiling enforced at assembler intake. Defaults pinned
// here; caller limits may only NARROW — never widen past ANY pinned ceiling,
// including the mix-cap fraction itself (fail-closed guard, NaN refused).

import { deepFreeze } from "./freeze";
import { ConflictDomainError } from "./errors";
import { parseIsoInstantMs } from "./instants";
import type { CandidateDoc } from "./evidence-records";

/** max share of the selection any single source domain or platform may claim
 *  (the house ~40% pattern) */
export const EVIDENCE_MIX_CAP_FRACTION = 0.4;
/** hard ceiling on selected records (mirrors the digest batch grain) */
export const EVIDENCE_MAX_CANDIDATES = 100;
/** hard ceiling on total selected claim-text bytes (UTF-8) */
export const EVIDENCE_TEXT_BYTE_BUDGET = 48_000;
/** hard ceiling on ONE candidate's claim text (UTF-8), enforced at assembler
 *  intake. Real doc_claims.text_en runs ≤200 chars; a single multi-KB "claim"
 *  would swallow the shared byte budget (the count stays visible but the
 *  greedy fill starves everything behind it), so oversized candidates are a
 *  typed refusal, never selected around. */
export const EVIDENCE_MAX_RECORD_TEXT_BYTES = 4096;

export interface SelectableRecord {
  claimId: number;
  text: string;
  docs: readonly CandidateDoc[];
  sourceReliability: number | null;
}

export interface EvidenceSelectionLimits {
  maxCandidates: number;
  textByteBudget: number;
  mixCapFraction: number;
}

export const DEFAULT_SELECTION_LIMITS: EvidenceSelectionLimits = deepFreeze({
  maxCandidates: EVIDENCE_MAX_CANDIDATES,
  textByteBudget: EVIDENCE_TEXT_BYTE_BUDGET,
  mixCapFraction: EVIDENCE_MIX_CAP_FRACTION,
});

export interface CapEvent {
  claimId: number;
  bucketKind: "source" | "platform";
  bucket: string;
  capValue: number;
}

export interface EvidenceBounds {
  /** eligible records offered to selection */
  eligibleCount: number;
  selectedCount: number;
  /** UTF-8 bytes of the SELECTED records' claim texts */
  totalTextBytes: number;
  maxRecordTextBytes: number;
  limits: EvidenceSelectionLimits;
}

export interface EvidenceSelection<T extends SelectableRecord> {
  /** the LLM-facing candidate list, in the deterministic total order */
  selected: readonly T[];
  /** eligible but displaced by the mix cap — VISIBLE, and still eligible */
  cappedOut: readonly T[];
  /** eligible but displaced by the count/byte bounds */
  budgetOut: readonly T[];
  /** every cap deferral, including ones later filled past the cap */
  capEvents: readonly CapEvent[];
  bounds: EvidenceBounds;
}

/** The pinned deterministic total order: reliability desc (nulls last), then
 *  claimId asc. Stable, total, wall-clock free. */
export function compareEvidenceOrder(a: SelectableRecord, b: SelectableRecord): number {
  const ra = a.sourceReliability;
  const rb = b.sourceReliability;
  if (ra !== null || rb !== null) {
    if (ra === null) return 1;
    if (rb === null) return -1;
    if (ra !== rb) return rb - ra;
  }
  return a.claimId - b.claimId;
}

/** The record's PRIMARY document: earliest-ingested non-mirror doc (parseable
 *  fetchedAt first, then docId as the stable tie-break). Falls back to the
 *  lowest-docId non-mirror doc when no fetchedAt parses; null only for a
 *  record with no non-mirror docs (which eligibility already excludes as
 *  mirror_only, so selection treats it fail-closed as its own bucket). */
export function primaryDoc(docs: readonly CandidateDoc[]): CandidateDoc | null {
  let best: { doc: CandidateDoc; ms: number | null } | null = null;
  for (const doc of docs) {
    if (doc.mirrorOfDocId !== null) continue;
    const ms = doc.fetchedAt === null ? null : parseIsoInstantMs(doc.fetchedAt);
    if (best === null) {
      best = { doc, ms };
      continue;
    }
    const better =
      ms !== null && best.ms !== null
        ? ms < best.ms || (ms === best.ms && doc.docId < best.doc.docId)
        : ms !== null && best.ms === null
          ? true
          : ms === null && best.ms === null
            ? doc.docId < best.doc.docId
            : false;
    if (better) best = { doc, ms };
  }
  return best?.doc ?? null;
}

/**
 * Select a bounded, mix-capped, deterministically ordered subset of eligible
 * records. NEVER changes eligibility: every input record reappears in exactly
 * one of selected/cappedOut/budgetOut.
 */
/** Fail-closed limits validation, shared by selectEvidence and the
 *  assembler's prepare() (which refuses BEFORE any source fetch). Limits may
 *  only NARROW the pinned ceilings — a mixCapFraction above the frozen
 *  EVIDENCE_MIX_CAP_FRACTION would LOOSEN the diversity quota (1.0
 *  neutralizes it entirely), so the frozen fraction is itself the ceiling.
 *  NaN fails every </> comparison silently, so finiteness is explicit. */
export function assertSelectionLimits(limits: EvidenceSelectionLimits): void {
  if (
    !Number.isFinite(limits.maxCandidates) ||
    !Number.isFinite(limits.textByteBudget) ||
    !Number.isFinite(limits.mixCapFraction) ||
    limits.maxCandidates < 1 ||
    limits.maxCandidates > EVIDENCE_MAX_CANDIDATES ||
    limits.textByteBudget < 1 ||
    limits.textByteBudget > EVIDENCE_TEXT_BYTE_BUDGET ||
    limits.mixCapFraction <= 0 ||
    limits.mixCapFraction > EVIDENCE_MIX_CAP_FRACTION
  ) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `selection limits out of pinned bounds: ${JSON.stringify(limits)}`,
    );
  }
}

/** Round-robin ordering of deferral indices across primary-doc DOMAINS (the
 *  house source-mix.ts overflow semantics): each domain's best deferral
 *  first, then each domain's second-best, … so refilled slots never
 *  re-concentrate in the top-reliability capped domain. Within a domain the
 *  total order is preserved. */
function interleaveByDomain(
  indices: readonly number[],
  ordered: readonly SelectableRecord[],
): number[] {
  const sorted = [...indices].sort((x, y) => x - y); // restore the total order first
  const rankWithinDomain = new Map<string, number>();
  const decorated = sorted.map((i) => {
    const domain = primaryDoc(ordered[i].docs)?.sourceDomain ?? "(no-independent-doc)";
    const rank = rankWithinDomain.get(domain) ?? 0;
    rankWithinDomain.set(domain, rank + 1);
    return { i, rank };
  });
  decorated.sort((x, y) => x.rank - y.rank || x.i - y.i);
  return decorated.map(({ i }) => i);
}

export function selectEvidence<T extends SelectableRecord>(
  records: readonly T[],
  limits: EvidenceSelectionLimits = DEFAULT_SELECTION_LIMITS,
): EvidenceSelection<T> {
  assertSelectionLimits(limits);

  const ordered = [...records].sort(compareEvidenceOrder);
  const cap = Math.max(1, Math.ceil(limits.maxCandidates * limits.mixCapFraction));
  const byDomain = new Map<string, number>();
  const byPlatform = new Map<string, number>();
  const capEvents: CapEvent[] = [];

  const selectedIdx: number[] = [];
  const deferredIdx: number[] = [];
  let totalBytes = 0;

  const fits = (rec: T): boolean =>
    selectedIdx.length < limits.maxCandidates &&
    totalBytes + Buffer.byteLength(rec.text, "utf8") <= limits.textByteBudget;

  // pass 1: reliability order under the mix cap. A null platform is EXEMPT
  // from platform bucketing (platform-null RSS domains are independent
  // sources, not one shared platform); the domain cap still applies.
  for (let i = 0; i < ordered.length; i++) {
    const rec = ordered[i];
    const primary = primaryDoc(rec.docs);
    const domain = primary?.sourceDomain ?? "(no-independent-doc)";
    const platform = primary?.platform ?? null;
    const d = byDomain.get(domain) ?? 0;
    const p = platform === null ? 0 : (byPlatform.get(platform) ?? 0);
    if (d >= cap) {
      capEvents.push({ claimId: rec.claimId, bucketKind: "source", bucket: domain, capValue: cap });
      deferredIdx.push(i);
      continue;
    }
    if (platform !== null && p >= cap) {
      capEvents.push({ claimId: rec.claimId, bucketKind: "platform", bucket: platform, capValue: cap });
      deferredIdx.push(i);
      continue;
    }
    if (!fits(rec)) {
      deferredIdx.push(i);
      continue;
    }
    byDomain.set(domain, d + 1);
    if (platform !== null) byPlatform.set(platform, p + 1);
    selectedIdx.push(i);
    totalBytes += Buffer.byteLength(rec.text, "utf8");
  }

  // pass 2: fill remaining capacity past the cap (coverage beats diversity on
  // thin corpora — the house rule), ROUND-ROBIN across the capped domains
  // (source-mix.ts overflow semantics) so freed slots never re-concentrate in
  // the top-reliability capped domain; still deterministic, still bounded
  const cappedOut: T[] = [];
  const budgetOut: T[] = [];
  for (const i of interleaveByDomain(deferredIdx, ordered)) {
    const rec = ordered[i];
    if (fits(rec)) {
      selectedIdx.push(i);
      totalBytes += Buffer.byteLength(rec.text, "utf8");
    } else {
      const wasCapDeferred = capEvents.some((e) => e.claimId === rec.claimId);
      (wasCapDeferred ? cappedOut : budgetOut).push(rec);
    }
  }
  // displaced lists re-sorted into the pinned total order (the interleaved
  // walk above is an allocation order, not a presentation order)
  cappedOut.sort(compareEvidenceOrder);
  budgetOut.sort(compareEvidenceOrder);

  const selected = selectedIdx
    .sort((a, b) => a - b)
    .map((i) => ordered[i]);

  let maxRecordTextBytes = 0;
  for (const rec of selected) {
    maxRecordTextBytes = Math.max(maxRecordTextBytes, Buffer.byteLength(rec.text, "utf8"));
  }

  return {
    selected,
    cappedOut,
    budgetOut,
    capEvents,
    bounds: {
      eligibleCount: records.length,
      selectedCount: selected.length,
      totalTextBytes: totalBytes,
      maxRecordTextBytes,
      limits,
    },
  };
}
