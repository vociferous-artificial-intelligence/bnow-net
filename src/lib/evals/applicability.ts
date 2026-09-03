// Analysis-eval control plane: structural capacity applicability (corpus-v2).
//
// Pure. A capacity case's expectations are authored against a declared
// capacity configuration (contracts.ts capacityMeta). The scorer ALWAYS runs
// the production-aligned pipeline under the ACTUALLY applied knobs — it is
// never widened per case — so a run whose applied knobs cannot satisfy the
// case's declared requirement is classified STRUCTURALLY INAPPLICABLE up
// front: recorded durably, never scored, never a binding quality failure
// against facts the configuration could not even read (and never a flattering
// pass from a fixture authored for a bigger configuration).
//
// Semantics (validated in contracts.ts):
// - map minMapContentChars: MIN — applicable when the applied depth reads at
//   least that far (facts past the applied depth are unreadable).
// - digest exactReduceGroupsFed: EXACT — fed-cutoff survivor/dead
//   expectations break in BOTH directions when the cutoff moves.

import type { AnalysisEvalCase, DigestEvalCase, EvalEnvKnobs, MapEvalCase } from "./contracts";

export interface CaseApplicability {
  applicable: boolean;
  /** null when the case declares no capacity requirement */
  requirement: {
    kind: "minMapContentChars" | "exactReduceGroupsFed";
    /** the EvalEnvKnobs field the requirement is checked against */
    knob: "mapContentChars" | "reduceGroupsFed";
    required: number;
    actual: number;
  } | null;
  /** human-readable explanation when inapplicable */
  reason: string | null;
}

export function classifyCaseApplicability(
  evalCase: AnalysisEvalCase,
  knobs: EvalEnvKnobs,
): CaseApplicability {
  if (evalCase.workload === "map") {
    const required = (evalCase as MapEvalCase).capacityMeta?.minMapContentChars;
    if (required !== undefined) {
      const actual = knobs.mapContentChars;
      const requirement = { kind: "minMapContentChars" as const, knob: "mapContentChars" as const, required, actual };
      if (actual < required) {
        return {
          applicable: false,
          requirement,
          reason: `mapContentChars ${actual} < required ${required} — facts past the applied depth are unreadable`,
        };
      }
      return { applicable: true, requirement, reason: null };
    }
  }
  if (evalCase.workload === "digest") {
    const required = (evalCase as DigestEvalCase).capacityMeta?.exactReduceGroupsFed;
    if (required !== undefined) {
      const actual = knobs.reduceGroupsFed;
      const requirement = { kind: "exactReduceGroupsFed" as const, knob: "reduceGroupsFed" as const, required, actual };
      if (actual !== required) {
        return {
          applicable: false,
          requirement,
          reason: `reduceGroupsFed ${actual} != required ${required} — fed-cutoff expectations are authored against exactly that cutoff`,
        };
      }
      return { applicable: true, requirement, reason: null };
    }
  }
  return { applicable: true, requirement: null, reason: null };
}
