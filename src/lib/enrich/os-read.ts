// Fail-closed read model for persisted `entities.meta.opensanctions`.
//
// Production may contain contradictory legacy rows written by the pre-2026-07-21
// matcher bug: `matched: false` with `sanctioned: true` and rejected-candidate
// topics promoted to the top level. This module is the ONE authority every render
// path uses to interpret stored OpenSanctions metadata, so a stale or malformed
// row can never resurface as a sanctions/PEP assertion. A usable ACCEPTED match
// requires ALL of: not stub-derived, not an `NK-stub…` id, and `matched === true`.
// Neither `sanctioned: true` nor a topic alone is ever sufficient.
//
// The parsed views are candidate-identity screening data (name + entity-type query
// only, no human review) — presentation stays admin-only and must label the score
// as identity-match confidence, never risk.

export interface OsAcceptedView {
  /** derived strictly: accepted AND topics contain the exact "sanction" topic */
  sanctioned: boolean;
  topics: string[];
  datasets: string[];
  osId: string | null;
  /** algorithmic identity-match confidence 0-1 (never risk/severity) */
  score: number | null;
  caption: string | null;
  checkedAt: string | null;
}

export interface OsRejectedCandidateView {
  caption: string | null;
  score: number | null;
  topics: string[];
  osId: string | null;
}

export type OsReadView =
  /** no record, stub-derived, NK-stub id, or unparseable — render NOTHING */
  | { state: "none" }
  /** the algorithm accepted no candidate; `rejected` = non-assertive diagnostics
   *  of the top rejected candidate (never facts about the entity), when present */
  | { state: "rejected"; checkedAt: string | null; rejected: OsRejectedCandidateView | null }
  | { state: "accepted"; checkedAt: string | null; accepted: OsAcceptedView };

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function asScore(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

function rejectedCandidate(v: unknown): OsRejectedCandidateView | null {
  const r = asRecord(v);
  if (!r) return null;
  return {
    caption: asStringOrNull(r.caption),
    score: asScore(r.score),
    topics: asStringArray(r.topics),
    osId: asStringOrNull(r.osId),
  };
}

/** Interpret an entity's `meta` object (reads `meta.opensanctions`) under the
 *  fail-closed invariant above. Anything uncertain — wrong shapes, missing
 *  fields, stub provenance — degrades toward `none`/`rejected`, never `accepted`. */
export function readOsMeta(meta: unknown): OsReadView {
  const os = asRecord(asRecord(meta)?.opensanctions);
  if (!os) return { state: "none" };

  // truth-in-UI: stub answers and stub-fabricated ids never render, even to admins
  if (os.stub === true) return { state: "none" };
  const osId = asStringOrNull(os.osId);
  if (osId?.startsWith("NK-stub")) return { state: "none" };

  const checkedAt = asStringOrNull(os.checkedAt);

  if (os.matched !== true) {
    // The stale bug shape lands here: matched:false with sanctioned:true and
    // promoted rejected-candidate fields at the top level. Those fields are
    // rejected-candidate diagnostics, never entity facts — surface them ONLY
    // under the explicit rejected label. New rows carry them in `rejected`.
    const nested = rejectedCandidate(os.rejected);
    const legacyTopics = asStringArray(os.topics);
    const legacyCaption = asStringOrNull(os.caption);
    const legacy: OsRejectedCandidateView | null =
      legacyTopics.length > 0 || legacyCaption !== null || osId !== null
        ? { caption: legacyCaption, score: asScore(os.score), topics: legacyTopics, osId }
        : null;
    return { state: "rejected", checkedAt, rejected: nested ?? legacy };
  }

  const topics = asStringArray(os.topics);
  return {
    state: "accepted",
    checkedAt,
    accepted: {
      // derived from the exact topic, not the stored boolean — a contradictory
      // stored `sanctioned` flag can never widen the assertion
      sanctioned: topics.includes("sanction"),
      topics,
      datasets: asStringArray(os.datasets),
      osId,
      score: asScore(os.score),
      caption: asStringOrNull(os.caption),
      checkedAt,
    },
  };
}
