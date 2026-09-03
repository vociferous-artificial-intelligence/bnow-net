// Analysis-eval control plane, C2: REDUCE clustering + DIGEST synthesis
// evaluators. Pure and fixture-tested — no DB, no network, no LLM.
//
// Both evaluators run the REAL production pipeline functions on the fixtures —
// clusterClaims / rankGroups (reduce.ts), parseVote / mergeVotes /
// finalizeEvents (synthesize.ts; ruling 18's K=5 majority semantics come from
// those functions, never re-declared here), guardPublishedEvents
// (publication-guard.ts) — and score the pipeline's ACTUAL behavior. The only
// model-produced artifact in this workload is the synthesis vote set, which is
// what a live candidate would supply and what the committed fixtures stand in
// for offline.

import {
  clusterClaims,
  rankGroups,
  type ClaimGroup,
  type ReduceClaim,
} from "../analysis/reduce";
import {
  reduceGroupsFed,
  finalizeEvents,
  mergeVotes,
  parseVote,
  type VoteEvent,
} from "../analysis/synthesize";
import { guardPublishedEvents, type PublicationGuardStats } from "../analysis/publication-guard";
import type { PersistEvent } from "../analysis/digest-persist";
import { firesAffirmatively } from "../ask/eval-run";
import type { DigestEvalCase, ReduceEvalCase } from "./contracts";
import { evidenceRecencySummary, type EvidenceRecencySummary } from "./evidence-recency-summary";

function mirrorMap(pairs?: Array<[number, number]>): Map<number, number> | undefined {
  return pairs && pairs.length > 0 ? new Map(pairs) : undefined;
}

// ============================================================================
// Reduce (deterministic clustering) scoring
// ============================================================================

export interface ReduceCaseChecks {
  pass: boolean;
  failures: string[];
  groupCount: number;
  claimsIn: number;
  metaDropped: number;
  togetherViolations: number;
  apartViolations: number;
  groupExpectationFailures: number;
  /** clusterClaims run twice on the same input — byte-identical output */
  reproducible: boolean;
  recency: EvidenceRecencySummary | null;
  recencyMismatches: string[];
}

export interface ScoredReduceCase {
  checks: ReduceCaseChecks;
  /** deterministic pipeline output (reproducibility witness / digest input) */
  serializedOutput: string;
}

function groupContaining(groups: ClaimGroup[], memberId: number): ClaimGroup | null {
  return groups.find((g) => g.memberIds.includes(memberId)) ?? null;
}

export function scoreReduceCase(evalCase: ReduceEvalCase): ScoredReduceCase {
  const { input, reference } = evalCase;
  const mirrorOf = mirrorMap(input.mirrorOf);
  const groups = clusterClaims(input.claims as ReduceClaim[], { mirrorOf });
  const groupsAgain = clusterClaims(input.claims as ReduceClaim[], { mirrorOf });
  const serializedOutput = JSON.stringify(groups);
  const reproducible = serializedOutput === JSON.stringify(groupsAgain);

  const failures: string[] = [];
  let togetherViolations = 0;
  let apartViolations = 0;
  let groupExpectationFailures = 0;

  for (const [a, b] of reference.expectTogether ?? []) {
    const ga = groupContaining(groups, a);
    const gb = groupContaining(groups, b);
    if (!ga || !gb || ga.key !== gb.key) {
      togetherViolations++;
      failures.push(`claims ${a} and ${b} expected in the SAME group, got ${ga?.key ?? "dropped"} vs ${gb?.key ?? "dropped"}`);
    }
  }
  for (const [a, b] of reference.expectApart ?? []) {
    const ga = groupContaining(groups, a);
    const gb = groupContaining(groups, b);
    if (ga && gb && ga.key === gb.key) {
      apartViolations++;
      failures.push(`claims ${a} and ${b} expected in DIFFERENT groups, both in ${ga.key}`);
    }
  }
  for (const exp of reference.expectGroups ?? []) {
    const g = groupContaining(groups, exp.memberId);
    if (!g) {
      groupExpectationFailures++;
      failures.push(`no group contains claim ${exp.memberId}`);
      continue;
    }
    const mismatch = (field: string, want: unknown, got: unknown) => {
      groupExpectationFailures++;
      failures.push(`group of ${exp.memberId}: ${field} expected ${String(want)}, got ${String(got)}`);
    };
    if (exp.hedging !== undefined && g.hedging !== exp.hedging) mismatch("hedging", exp.hedging, g.hedging);
    if (exp.promoted !== undefined && g.promoted !== exp.promoted) mismatch("promoted", exp.promoted, g.promoted);
    if (exp.independentSources !== undefined && g.independentSources !== exp.independentSources) {
      mismatch("independentSources", exp.independentSources, g.independentSources);
    }
    if (exp.text !== undefined && g.text !== exp.text) mismatch("text", exp.text, g.text);
  }
  if (reference.expectGroupCount !== undefined && groups.length !== reference.expectGroupCount) {
    failures.push(`group count expected ${reference.expectGroupCount}, got ${groups.length}`);
  }
  const survivingIds = new Set(groups.flatMap((g) => g.memberIds));
  const metaDropped = input.claims.filter((c) => !survivingIds.has(c.id)).length;
  for (const id of reference.expectMetaDropped ?? []) {
    if (survivingIds.has(id)) failures.push(`claim ${id} expected meta-dropped but survived clustering`);
  }
  if (!reproducible) failures.push("clusterClaims is NOT reproducible on this input (two runs differ)");

  // evidence-recency probe (independent of the clustering)
  let recency: EvidenceRecencySummary | null = null;
  const recencyMismatches: string[] = [];
  if (input.recencyDocs && input.recencyAsOf) {
    recency = evidenceRecencySummary(input.recencyDocs, input.recencyAsOf);
    for (const [key, want] of Object.entries(reference.expectRecency ?? {})) {
      const got = (recency as unknown as Record<string, unknown>)[key];
      if (got !== want) {
        recencyMismatches.push(`${key}: expected ${String(want)}, got ${String(got)}`);
      }
    }
    if (recencyMismatches.length > 0) {
      failures.push(`recency summary mismatches: ${recencyMismatches.join("; ")}`);
    }
  }

  return {
    checks: {
      pass: failures.length === 0,
      failures,
      groupCount: groups.length,
      claimsIn: input.claims.length,
      metaDropped,
      togetherViolations,
      apartViolations,
      groupExpectationFailures,
      reproducible,
      recency,
      recencyMismatches,
    },
    serializedOutput,
  };
}

// ============================================================================
// Digest (synthesis votes -> merge -> finalize -> publication guard) scoring
// ============================================================================

export interface DigestCaseChecks {
  pass: boolean;
  failures: string[];
  groupsFed: number;
  votesRequested: number;
  votesUsable: number;
  /** votes whose raw JSON failed to parse (production counts these as failed
   *  votes; they are still billed — metering is the live runner's job) */
  failedVotes: number;
  droppedGidRefs: number;
  /** usable votes < majority — the production engine refuses this digest */
  pipelineRefusal: boolean;
  eventCount: number;
  claimCount: number;
  guardStats: PublicationGuardStats | null;
  reproducible: boolean;
  mustMatchMisses: string[];
  mustNotMatchHits: string[];
  /** fixture-conditional expectations were skipped (live candidate votes) */
  candidateInvariantOnly: boolean;
  // ---- corpus-v2 capacity diagnostics (REPORT-ONLY: never failures, never
  // gates; undefined = the case declares no capacity metadata or the
  // pipeline refused) ----
  /** over capacityMeta.decisiveEvents: survived = the fed decisive event's
   *  titlePattern matches a surviving event; unfed = its rank sits past the
   *  applied cutoff (a capacity limitation, EXCLUDED from any ratio and
   *  reported on its own) */
  tailEventRecall?: { survived: number; fed: number; unfed: number };
  /** over capacityMeta.lateClaimIds: total = distinct FED groups holding at
   *  least one declared late claim; cited = those whose representative text a
   *  surviving event's claims carry (the expectClaimCitingGid mechanism);
   *  unfed = late groups past the applied cutoff (reported, not in the ratio) */
  lateDocumentRecall?: { cited: number; total: number; unfed: number };
}

export interface ScoredDigestCase {
  checks: DigestCaseChecks;
  serializedOutput: string;
}

interface DigestPipelineRun {
  fed: ClaimGroup[];
  /** the FULL deterministic rank order (fed = its prefix) — capacity
   *  diagnostics need rank positions past the cutoff */
  ranked: ClaimGroup[];
  votesUsable: VoteEvent[][];
  failedVotes: number;
  droppedGidRefs: number;
  pipelineRefusal: boolean;
  events: PersistEvent[];
  guardStats: PublicationGuardStats | null;
}

function runDigestPipeline(evalCase: DigestEvalCase, votesRaw: string[]): DigestPipelineRun {
  const { input } = evalCase;
  const mirrorOf = mirrorMap(input.mirrorOf);
  const groups = clusterClaims(input.claims as ReduceClaim[], { mirrorOf });
  // rank recency against the window end, exactly like the day-window engine
  const nowMs = Date.parse(`${input.date}T00:00:00Z`) + 86_400_000;
  // SCI-N6 (scorer side): the same production cutoff synthesize.ts:642 applies —
  // a vote citing an unfed group's gid must be stripped here exactly as the
  // engine strips it, or >cutoff capacity cases mis-score.
  const ranked = rankGroups(groups, nowMs);
  const fed = ranked.slice(0, reduceGroupsFed());
  const fedGids = new Set(fed.map((g) => g.key));
  const groupByKey = new Map(fed.map((g) => [g.key, g]));

  const votesUsable: VoteEvent[][] = [];
  let failedVotes = 0;
  let droppedGidRefs = 0;
  for (const raw of votesRaw) {
    try {
      const vote = parseVote(raw, fedGids);
      votesUsable.push(vote.events);
      droppedGidRefs += vote.droppedGidRefs;
    } catch {
      failedVotes++;
    }
  }
  const majorityNeeded = Math.floor(votesRaw.length / 2) + 1;
  if (votesUsable.length < majorityNeeded) {
    return { fed, ranked, votesUsable, failedVotes, droppedGidRefs, pipelineRefusal: true, events: [], guardStats: null };
  }
  const merged = mergeVotes(votesUsable);
  const finalized = finalizeEvents(merged, groupByKey);
  const guarded = guardPublishedEvents(finalized);
  return {
    fed,
    ranked,
    votesUsable,
    failedVotes,
    droppedGidRefs,
    pipelineRefusal: false,
    events: guarded.events,
    guardStats: guarded.stats,
  };
}

function proseCorpus(events: PersistEvent[]): string {
  return events
    .map((ev) => [ev.title, ev.summary, ...ev.claims.map((c) => c.text)].join("\n"))
    .join("\n");
}

/** Score one digest case over a vote set. `candidateInvariantOnly` (live
 *  candidate votes) skips the fixture-conditional expectations — surviving/
 *  dead titles, exact counts, gid fill, guard-stat pins, hedging-by-text —
 *  which were authored against the committed fixture votes; the safety
 *  mustMatch/mustNotMatch patterns and structural verdicts still apply. */
export function scoreDigestCase(
  evalCase: DigestEvalCase,
  votesRaw: string[],
  opts: { candidateInvariantOnly?: boolean } = {},
): ScoredDigestCase {
  const { reference } = evalCase;
  const invariantOnly = opts.candidateInvariantOnly === true;
  const run = runDigestPipeline(evalCase, votesRaw);
  const runAgain = runDigestPipeline(evalCase, votesRaw);
  const serializedOutput = JSON.stringify({ events: run.events, stats: run.guardStats });
  const reproducible = serializedOutput === JSON.stringify({ events: runAgain.events, stats: runAgain.guardStats });

  const failures: string[] = [];
  const corpus = proseCorpus(run.events);
  const claimCount = run.events.reduce((s, ev) => s + ev.claims.length, 0);

  if (!reproducible) failures.push("digest pipeline is NOT reproducible on this input (two runs differ)");

  if (reference.expectPipelineRefusal === true) {
    if (!run.pipelineRefusal) failures.push("expected pipeline REFUSAL (usable votes < majority) but it produced events");
  } else if (run.pipelineRefusal) {
    failures.push(`pipeline refused: only ${run.votesUsable.length}/${votesRaw.length} votes usable (majority needed)`);
  }

  if (!invariantOnly && !run.pipelineRefusal) {
    for (const p of reference.expectSurvivingTitles ?? []) {
      const re = new RegExp(p, "i");
      if (!run.events.some((ev) => re.test(ev.title) || re.test(ev.summary))) {
        failures.push(`expected surviving event matching /${p}/ not found`);
      }
    }
    for (const p of reference.expectDeadTitles ?? []) {
      if (new RegExp(p, "i").test(corpus)) {
        failures.push(`minority event content matching /${p}/ SURVIVED (majority rule violated)`);
      }
    }
    if (reference.expectEventCount !== undefined && run.events.length !== reference.expectEventCount) {
      failures.push(`event count expected ${reference.expectEventCount}, got ${run.events.length}`);
    }
    if (reference.expectDroppedGidRefs !== undefined && run.droppedGidRefs !== reference.expectDroppedGidRefs) {
      failures.push(`droppedGidRefs expected ${reference.expectDroppedGidRefs}, got ${run.droppedGidRefs}`);
    }
    for (const gid of reference.expectClaimCitingGid ?? []) {
      // finalizeEvents' majority-gid fill materializes the group's own
      // representative text as the claim; the group is the gid's group
      const group = run.fed.find((g) => g.key === gid);
      const found =
        group !== undefined &&
        run.events.some((ev) => ev.claims.some((c) => c.text === group.text || c.text.endsWith(group.text)));
      if (!found) failures.push(`majority-gid fill: no finalized claim carries group ${gid}'s representative text`);
    }
    for (const [key, want] of Object.entries(reference.expectGuardStats ?? {})) {
      const got = run.guardStats ? (run.guardStats as unknown as Record<string, number>)[key] : undefined;
      if (got !== want) failures.push(`guard stat ${key} expected ${want}, got ${String(got)}`);
    }
    for (const h of reference.expectHedging ?? []) {
      const re = new RegExp(h.textMatch, "i");
      const claim = run.events.flatMap((ev) => ev.claims).find((c) => re.test(c.text));
      if (!claim) failures.push(`expectHedging: no finalized claim matches /${h.textMatch}/`);
      else if (claim.hedging !== h.hedging) {
        failures.push(`expectHedging /${h.textMatch}/: expected ${h.hedging}, got ${claim.hedging}`);
      }
    }
  }

  // corpus-v2 capacity diagnostics (report-only; skipped on refusal — a
  // refused digest published nothing to measure recall against)
  let tailEventRecall: DigestCaseChecks["tailEventRecall"];
  let lateDocumentRecall: DigestCaseChecks["lateDocumentRecall"];
  const capMeta = evalCase.capacityMeta;
  if (capMeta !== undefined && !run.pipelineRefusal) {
    if (capMeta.decisiveEvents !== undefined) {
      const t = { survived: 0, fed: 0, unfed: 0 };
      for (const ev of capMeta.decisiveEvents) {
        if (ev.rank > run.fed.length) {
          t.unfed++;
          continue;
        }
        t.fed++;
        const re = new RegExp(ev.titlePattern, "i");
        if (run.events.some((e) => re.test(e.title) || re.test(e.summary))) t.survived++;
      }
      tailEventRecall = t;
    }
    if (capMeta.lateClaimIds !== undefined) {
      const lateIds = new Set(capMeta.lateClaimIds);
      const fedKeys = new Set(run.fed.map((g) => g.key));
      const l = { cited: 0, total: 0, unfed: 0 };
      for (const g of run.ranked) {
        if (!g.memberIds.some((id) => lateIds.has(id))) continue;
        if (!fedKeys.has(g.key)) {
          l.unfed++;
          continue;
        }
        l.total++;
        // the expectClaimCitingGid representative-text mechanism
        if (run.events.some((e) => e.claims.some((c) => c.text === g.text || c.text.endsWith(g.text)))) {
          l.cited++;
        }
      }
      lateDocumentRecall = l;
    }
  }

  const mustMatchMisses: string[] = [];
  const mustNotMatchHits: string[] = [];
  if (!run.pipelineRefusal) {
    for (const p of reference.mustMatch ?? []) {
      if (!new RegExp(p, "i").test(corpus)) mustMatchMisses.push(p);
    }
    for (const p of reference.mustNotMatch ?? []) {
      if (firesAffirmatively(new RegExp(p, "i"), corpus)) mustNotMatchHits.push(p);
    }
    if (mustMatchMisses.length > 0) failures.push(`mustMatch missed: ${mustMatchMisses.join("; ")}`);
    if (mustNotMatchHits.length > 0) failures.push(`mustNotMatch fired affirmatively: ${mustNotMatchHits.join("; ")}`);
  }

  return {
    checks: {
      pass: failures.length === 0,
      failures,
      groupsFed: run.fed.length,
      votesRequested: votesRaw.length,
      votesUsable: run.votesUsable.length,
      failedVotes: run.failedVotes,
      droppedGidRefs: run.droppedGidRefs,
      pipelineRefusal: run.pipelineRefusal,
      eventCount: run.events.length,
      claimCount,
      guardStats: run.guardStats,
      reproducible,
      mustMatchMisses,
      mustNotMatchHits,
      candidateInvariantOnly: invariantOnly,
      ...(tailEventRecall !== undefined ? { tailEventRecall } : {}),
      ...(lateDocumentRecall !== undefined ? { lateDocumentRecall } : {}),
    },
    serializedOutput,
  };
}
