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
// BOUNDS (measured + enforced): max record count and total UTF-8 text bytes.
// Defaults pinned here; callers may narrow (never widen past the pinned
// ceiling — fail-closed guard).

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

export type CapStatus = "selected" | "capped_out" | "budget_out";

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
export function selectEvidence<T extends SelectableRecord>(
  records: readonly T[],
  limits: EvidenceSelectionLimits = DEFAULT_SELECTION_LIMITS,
): EvidenceSelection<T> {
  if (
    limits.maxCandidates < 1 ||
    limits.maxCandidates > EVIDENCE_MAX_CANDIDATES ||
    limits.textByteBudget < 1 ||
    limits.textByteBudget > EVIDENCE_TEXT_BYTE_BUDGET ||
    limits.mixCapFraction <= 0 ||
    limits.mixCapFraction > 1
  ) {
    throw new ConflictDomainError(
      "invalid_evidence_request",
      `selection limits out of pinned bounds: ${JSON.stringify(limits)}`,
    );
  }

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

  // pass 1: reliability order under the mix cap
  for (let i = 0; i < ordered.length; i++) {
    const rec = ordered[i];
    const primary = primaryDoc(rec.docs);
    const domain = primary?.sourceDomain ?? "(no-independent-doc)";
    const platform = primary?.platform ?? "none";
    const d = byDomain.get(domain) ?? 0;
    const p = byPlatform.get(platform) ?? 0;
    if (d >= cap) {
      capEvents.push({ claimId: rec.claimId, bucketKind: "source", bucket: domain, capValue: cap });
      deferredIdx.push(i);
      continue;
    }
    if (p >= cap) {
      capEvents.push({ claimId: rec.claimId, bucketKind: "platform", bucket: platform, capValue: cap });
      deferredIdx.push(i);
      continue;
    }
    if (!fits(rec)) {
      deferredIdx.push(i);
      continue;
    }
    byDomain.set(domain, d + 1);
    byPlatform.set(platform, p + 1);
    selectedIdx.push(i);
    totalBytes += Buffer.byteLength(rec.text, "utf8");
  }

  // pass 2: fill remaining capacity past the cap (coverage beats diversity on
  // thin corpora — the house rule), still deterministic and still bounded
  const cappedOut: T[] = [];
  const budgetOut: T[] = [];
  for (const i of deferredIdx) {
    const rec = ordered[i];
    if (fits(rec)) {
      selectedIdx.push(i);
      totalBytes += Buffer.byteLength(rec.text, "utf8");
    } else {
      const wasCapDeferred = capEvents.some((e) => e.claimId === rec.claimId);
      (wasCapDeferred ? cappedOut : budgetOut).push(rec);
    }
  }

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
