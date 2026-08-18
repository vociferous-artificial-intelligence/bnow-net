// Golden expected-result computation for the frozen fixture corpus (Phase 4;
// contract §13 P4: "golden results for both conflicts, including lane and
// contribution totals").
//
// scoreFixtureScenario is the ONE wiring used by the acceptance tests, the
// golden regeneration, and the offline-report tests: fixture loader → P3
// assemblies (both populations) → the deterministic fixture oracle (or an
// injected matcher) → the pure scorer. Golden files are BYTE-STABLE: the
// value is canonicalized through the fail-closed Phase-1 stableStringify
// (recursively sorted keys), then pretty-printed for reviewability — equal
// results always produce identical bytes, so any scorer drift is a failing
// byte-compare, never a silent re-baseline.
//
// The golden set covers (prompt §12 item F): both conflicts, both
// populations (every scored result carries both), a publication-gap day, the
// gulf incomparable lane, the compound-partial scenario, the retention-gap
// scenario, quiet-day, the matcher-ladder scenario (both vote variants,
// scored through the live-compatible adapter with the fixture votes
// injected — rungs llm and keyword), the five headline-pinned scenarios, and
// the register-#9 vague-claim scenario.

import { CONFLICT_REGISTRY } from "./definitions";
import { ConflictDomainError } from "./errors";
import type { ConflictResultV1 } from "./eval-profile";
import {
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  type EvidenceRequest,
} from "./evidence-assembler";
import {
  assemblerReportOf,
  selectedScenarioReport,
  FixtureEvidenceSource,
  type ConflictFixtureScenario,
} from "./fixture-corpus";
import { declaredUnitsOf, FixtureOracleMatcher } from "./fixture-matcher";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { LlmCompatibleMatcher } from "./llm-compatible-matcher";
import type { ConflictMatcher } from "./match-contract";
import { scoreConflictReport, type ConflictScoreRequest } from "./scorer";
import { stableStringify } from "./serialization";
import type { EvaluationKind } from "./vocabulary";

// ---------------------------------------------------------------------------
// The shared fixture→scorer wiring
// ---------------------------------------------------------------------------

export interface FixtureScoreOptions {
  kind?: EvaluationKind;
  /** default: the deterministic fixture oracle for the scenario */
  matcher?: ConflictMatcher;
  /** Phase 5: a verified ConflictSnapshotRefV1 to stamp into the result
   *  (resolve it through resolveConflictSnapshot first). ABSENT by default —
   *  the golden path passes nothing, so committed golden bytes carry
   *  `snapshot: { ref: null }` unchanged. */
  snapshotRef?: import("./snapshot-ref").ConflictSnapshotRefV1;
}

export async function scoreFixtureScenario(
  scenario: ConflictFixtureScenario,
  options: FixtureScoreOptions = {},
): Promise<ConflictResultV1> {
  const kind = options.kind ?? "retrospective";
  const selected = selectedScenarioReport(scenario);
  const source = new FixtureEvidenceSource(scenario);
  const evidenceRequest: EvidenceRequest = {
    conflictId: scenario.conflictId,
    kind,
    report: assemblerReportOf(selected),
    snapshot: null,
  };
  const corpus = await assembleCorpusRecallEvidence(evidenceRequest, source);
  const retention = await assemblePublishedRetentionEvidence(evidenceRequest, source);
  const matcher = options.matcher ?? new FixtureOracleMatcher(scenario, selected);

  const scoreRequest: ConflictScoreRequest =
    selected === null
      ? {
          conflictId: scenario.conflictId,
          evaluationKind: kind,
          report: null,
          gap: {
            series: CONFLICT_REGISTRY[scenario.conflictId].referenceSeries,
            gapDate: gapDateOf(scenario),
          },
          // Same spread as the report branch: a caller-supplied ref must reach
          // the scorer's every-path validation even on gap days (a garbage ref
          // silently dropped here would bypass the ops-MINOR-1 hoist).
          ...(options.snapshotRef !== undefined ? { snapshot: options.snapshotRef } : {}),
        }
      : {
          conflictId: scenario.conflictId,
          evaluationKind: kind,
          report: {
            series: selected.series,
            editionKey: selected.editionKey,
            reportDate: selected.reportDate,
            cutoffAt: selected.cutoffAt,
            publishedAt: selected.publishedAt,
            units: declaredUnitsOf(scenario.conflictId, selected),
          },
          gap: null,
          ...(options.snapshotRef !== undefined ? { snapshot: options.snapshotRef } : {}),
        };
  return scoreConflictReport(scoreRequest, corpus, retention, matcher);
}

function gapDateOf(scenario: ConflictFixtureScenario): string {
  if (scenario.gapDate === null) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `scenario ${scenario.id} has neither a report nor a gapDate`,
    );
  }
  return scenario.gapDate;
}

// ---------------------------------------------------------------------------
// The matcher-fixture vote variants (cc-matcher-failclosed-013b)
// ---------------------------------------------------------------------------

export interface MatcherFixtureVariant {
  variantId: string;
  votes: readonly string[];
  expected: Record<string, unknown>;
}

/** Narrow the opaque matcherFixture ladder block (fail-closed). */
export function matcherFixtureVariantsOf(
  scenario: ConflictFixtureScenario,
): MatcherFixtureVariant[] {
  const block = scenario.matcherFixture;
  if (block === null || !Array.isArray(block.variants)) {
    throw new ConflictDomainError(
      "invalid_fixture_scenario",
      `scenario ${scenario.id} carries no matcherFixture ladder variants`,
    );
  }
  return block.variants.map((v) => {
    const record = v as Record<string, unknown>;
    if (
      typeof record.variantId !== "string" ||
      !Array.isArray(record.votes) ||
      !record.votes.every((x) => typeof x === "string") ||
      typeof record.expected !== "object" ||
      record.expected === null
    ) {
      throw new ConflictDomainError(
        "invalid_fixture_scenario",
        `scenario ${scenario.id}: malformed matcherFixture variant`,
      );
    }
    return {
      variantId: record.variantId,
      votes: record.votes as string[],
      expected: record.expected as Record<string, unknown>,
    };
  });
}

/** The live-compatible adapter fed by a variant's raw fixture votes (one
 *  round per committed vote string; both population calls replay the same
 *  set — deterministic, zero dispatch). */
export function voteVariantMatcher(variant: MatcherFixtureVariant): LlmCompatibleMatcher {
  return new LlmCompatibleMatcher({
    votesK: variant.votes.length,
    model: null,
    keywordFallback: new ConflictKeywordMatcher(),
    voteFn: async (round) => variant.votes[round],
  });
}

// ---------------------------------------------------------------------------
// The golden set
// ---------------------------------------------------------------------------

/** Oracle-scored golden scenarios (see header for the coverage argument). */
export const GOLDEN_SCENARIO_IDS = [
  // russia_ukraine
  "roca-ua-only-001b",
  "roca-quiet-day-010b",
  "roca-compound-partial-009b",
  "roca-retention-gap-008b",
  "cc-window-rung2-017",
  // iran_regional
  "iran-direct-kinetic-001",
  "iran-gulf-unavailable-010b",
  "iran-two-events-011",
  "cc-publication-gap-002",
  "cc-state-zero-empty-015",
  "cc-vague-claim-019",
  // the sentinel-bearing scenario (corpus README audit rule): scoring it into
  // the golden set gives the golden-file prose audit its input-presence
  // precondition — the sentinel provably entered the run, and the committed
  // bytes are then proven clean of it
  "cc-regen-after-instant-007",
] as const;

/** The matcher-ladder golden scenario, scored once per vote variant. */
export const GOLDEN_LADDER_SCENARIO_ID = "cc-matcher-failclosed-013b" as const;

export const GOLDEN_RESULTS_FILE = "fixtures/conflicts/goldens/golden-results-v1.json";

/** Compute the full golden result map (key: scenario id, or
 *  `<scenario id>#<variantId>` for the ladder variants). */
export async function computeGoldenResults(
  scenarios: readonly ConflictFixtureScenario[],
): Promise<Record<string, ConflictResultV1>> {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const out: Record<string, ConflictResultV1> = {};
  for (const id of GOLDEN_SCENARIO_IDS) {
    const scenario = byId.get(id);
    if (scenario === undefined) {
      throw new ConflictDomainError("invalid_score_request", `golden scenario ${id} not in corpus`);
    }
    out[id] = await scoreFixtureScenario(scenario);
  }
  const ladder = byId.get(GOLDEN_LADDER_SCENARIO_ID);
  if (ladder === undefined) {
    throw new ConflictDomainError(
      "invalid_score_request",
      `golden ladder scenario ${GOLDEN_LADDER_SCENARIO_ID} not in corpus`,
    );
  }
  for (const variant of matcherFixtureVariantsOf(ladder)) {
    out[`${GOLDEN_LADDER_SCENARIO_ID}#${variant.variantId}`] = await scoreFixtureScenario(ladder, {
      matcher: voteVariantMatcher(variant),
    });
  }
  return out;
}

/** Byte-stable golden serialization: canonical key order via the fail-closed
 *  Phase-1 stableStringify, pretty-printed for review, trailing newline. */
export function goldenBytes(value: unknown): string {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`;
}
