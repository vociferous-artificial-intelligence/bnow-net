// Analysis-workload QUALITY registry (release hardening 2026-08-17): the
// scorecard/approval gate for the analysis routing seam. Pricing alone is not
// quality approval — an entry in PRICES_PER_MTOK says a model can be METERED,
// an entry HERE says a specific (workload, model, effort) combination is
// approved to serve production. Production analysis dispatch requires BOTH
// (enforced in model-config.ts workloadDispatchConfig(), which fails closed
// BEFORE any SpendGuard reservation or provider construction).
//
// Analogous in purpose to the Ask registry (src/lib/ask/registry.ts) but kept
// SEPARATE: Ask's scorecards measure answer/rerank quality against the Ask
// eval suite; analysis workloads have their own gates (the mapreduce A/B, the
// validation majority-vote design, the digest production baseline). Do not
// merge the two.
//
// Approval semantics (all test-pinned):
// - approval is per (workload, model): a model approved for one workload is
//   NOT approved for another;
// - allowed efforts are per approval: an effort approved for one
//   (workload, model) never authorizes another effort — `null` in the list
//   means "absent effort" (no reasoning_effort parameter), which is the only
//   effort the current baselines allow;
// - status "baseline" = the grandfathered production configuration this
//   registry was seeded with (evidence cited where checked-in evidence exists;
//   NOT a claim that a fresh candidate evaluation ran);
// - status "evaluated_candidate" = a future entry added only after the paid
//   representative evaluation in the routing report's activation checklist —
//   NO such entry exists today, and there is NO production bypass for
//   unevaluated candidates (a future evaluation harness dispatches candidates
//   outside production routes under its own authorization).

import type { AnalysisReasoningEffort, AnalysisWorkload } from "./model-config";

/** Bump on ANY approval change — persisted with every dispatch identity so an
 *  output row can be traced to the registry state that authorized it. */
export const ANALYSIS_ROUTING_REGISTRY_VERSION = "analysis-reg-v1";

export type AnalysisApprovalStatus = "baseline" | "evaluated_candidate";

export interface AnalysisApproval {
  workload: AnalysisWorkload;
  /** exact model id/snapshot string as dispatched */
  model: string;
  /** efforts this approval covers; null = absent (no reasoning_effort param) */
  allowedEfforts: ReadonlyArray<AnalysisReasoningEffort | null>;
  status: AnalysisApprovalStatus;
  /** what the approval rests on — accurate citation, never a fabricated
   *  scorecard. date = when the cited evidence was produced (baseline entries)
   *  or when the evaluation passed (future candidates). */
  evidence: { ref: string; date: string; note: string };
}

/** The grandfathered production baseline: gpt-4o-mini with NO reasoning
 *  effort, per workload — exactly what production has always dispatched. */
export const ANALYSIS_APPROVALS: readonly AnalysisApproval[] = [
  {
    workload: "map",
    model: "gpt-4o-mini",
    allowedEfforts: [null],
    status: "baseline",
    evidence: {
      ref: "docs/reviews/MAP-SHADOW-RESULTS.md",
      date: "2026-07-09",
      note: "production baseline; shadow-stage results measured on gpt-4o-mini (grandfathered, not a fresh candidate scorecard)",
    },
  },
  {
    workload: "reduce",
    model: "gpt-4o-mini",
    allowedEfforts: [null],
    status: "baseline",
    evidence: {
      ref: "docs/reviews/MR3-REDUCE-RESULTS.md",
      date: "2026-07-09",
      note: "A/B gate that shipped the mapreduce engine (K=5 votes, majority-gid fill) ran on gpt-4o-mini — the strongest checked-in evidence for this baseline",
    },
  },
  {
    workload: "digest",
    model: "gpt-4o-mini",
    allowedEfforts: [null],
    status: "baseline",
    evidence: {
      ref: "docs/reviews/PIPELINE-AUDIT-2026-07.md",
      date: "2026-07-09",
      note: "grandfathered production baseline (the audit documents behavior and cost, not a quality scorecard)",
    },
  },
  {
    workload: "validation",
    model: "gpt-4o-mini",
    allowedEfforts: [null],
    status: "baseline",
    evidence: {
      ref: "docs/OPEN-TASKS.md",
      date: "2026-07-09",
      note: "grandfathered production baseline; #15 documents the run-to-run matcher nondeterminism that the MATCH_VOTES=5 majority design compensates for",
    },
  },
  {
    workload: "entity_audit",
    model: "gpt-4o-mini",
    allowedEfforts: [null],
    status: "baseline",
    evidence: {
      ref: "docs/reviews/PIPELINE-AUDIT-2026-07.md",
      date: "2026-07-09",
      note: "grandfathered production baseline (propose-only route; every proposal is human-reviewed before apply — ruling 6)",
    },
  },
];

export type ApprovalVerdict =
  | { approved: true; status: AnalysisApprovalStatus; evidenceRef: string }
  | { approved: false; reason: string };

/** Is (workload, model, effort) approved to dispatch in production?
 *  `registry` is injectable for tests ONLY — production callers always use
 *  the checked-in ANALYSIS_APPROVALS default. */
export function analysisApproval(
  workload: AnalysisWorkload,
  model: string,
  effort: AnalysisReasoningEffort | null,
  registry: readonly AnalysisApproval[] = ANALYSIS_APPROVALS,
): ApprovalVerdict {
  const entry = registry.find((a) => a.workload === workload && a.model === model);
  if (!entry) {
    return {
      approved: false,
      reason: `model "${model}" has no ${ANALYSIS_ROUTING_REGISTRY_VERSION} approval for workload "${workload}" — pricing alone is not quality approval; run the activation checklist (evaluation + registry entry) first`,
    };
  }
  if (!entry.allowedEfforts.includes(effort)) {
    return {
      approved: false,
      reason: `reasoning effort ${effort === null ? "absent" : `"${effort}"`} is not approved for (${workload}, ${model}) — approved: ${entry.allowedEfforts.map((e) => e ?? "absent").join("|")}`,
    };
  }
  return { approved: true, status: entry.status, evidenceRef: entry.evidence.ref };
}
