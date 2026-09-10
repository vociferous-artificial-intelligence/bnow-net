// Lane assignment for DECLARED REFERENCE UNITS (PLAN-WS-3 §3.3b).
//
// The lane classifier was built for CANDIDATE CLAIMS, where `off_scope` and
// `unclassified` are real dispositions: an out-of-scope claim is excluded from
// the population and never scored. A declared reference unit cannot be excluded
// — register #8 H1 keeps EVERY declared unit in the headline denominator, so a
// unit the classifier cannot place still has to sit in some lane row, or the
// lane table would stop partitioning the denominator (scorer.ts's lane-sum pin).
//
// So the two non-lane outcomes collapse to `other_in_scope` — EXPLICITLY, here,
// once, rather than as a `?? "other_in_scope"` scattered through the pipeline.
// `other_in_scope` is a member of both taxonomies (lanes.ts:29,40) and is
// exactly the honest label: "declared, in the reference's scope, no lane the
// taxonomy names". The collapse is recorded on the return value, so a caller
// can tell a placed unit from a defaulted one without re-running the classifier.
//
// Track: units are classified as `military`, the reference series' own track.
// Both series ARE military products (ROCA and the Iran Update), and the
// classifier's track rung is about the CLAIM's track, not the reference's — a
// nuclear-track BNOW claim can still satisfy a military-framed takeaway. Using
// the def's first contributor track instead would make the same unit land in
// different lanes for the two conflicts for no evidentiary reason.

import type { ConflictDefinition } from "./definitions";
import { classifyCandidate } from "./lane-classifier";
import type { ConflictLaneId } from "./lanes";

export interface ReferenceUnitLane {
  lane: ConflictLaneId;
  /** the classifier version that assigned it — stamped so a lane row stays
   *  interpretable against the vocabulary that produced it */
  classifierVersion: string;
  /** true when the classifier returned `off_scope`/`unclassified` and the lane
   *  above is the explicit `other_in_scope` collapse rather than a placement */
  defaulted: boolean;
}

/** The lane a declared reference unit belongs to. Total: never throws, never
 *  returns null, and never drops a unit. */
export function classifyReferenceUnit(def: ConflictDefinition, text: string): ReferenceUnitLane {
  const classification = classifyCandidate(def.id, { text, track: "military" });
  if (classification.kind === "classified") {
    return {
      lane: classification.lane,
      classifierVersion: classification.classifierVersion,
      defaulted: false,
    };
  }
  return {
    lane: "other_in_scope",
    classifierVersion: classification.classifierVersion,
    defaulted: true,
  };
}
