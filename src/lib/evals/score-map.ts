// Analysis-eval control plane, C2: MAP extraction evaluator. Pure and
// fixture-tested — no DB, no network, no LLM.
//
// The candidate output under scoring is a RAW model-response JSON string
// (offline: a committed fixture; live: the response body). Parsing goes
// through the REAL parseMapResults (map-worker.ts) and quote verification
// through the REAL verifyQuote (quote-verify.ts) — reuse, never fork, so the
// eval scores exactly what production would have accepted.

import { parseMapResults, type MapClaim } from "../analysis/map-worker";
import { verifyQuote } from "../analysis/quote-verify";
import { claimTokens } from "../analysis/reduce";
import { firesAffirmatively } from "../ask/eval-run";
import { POSITION_BUCKETS, type MapEvalCase, type PositionBucket } from "./contracts";
import { numeralsPreserved } from "./numerals";

/** Gold-claim match rule: token-jaccard (claimTokens, the reduce stage's own
 *  tokenizer) between reference textGist and produced text_en must reach this
 *  threshold. Greedy best-match per doc; each gold matched at most once. */
export const MAP_GIST_MATCH_THRESHOLD = 0.5;

export function tokenJaccard(a: string, b: string): number {
  const ta = claimTokens(a);
  const tb = claimTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface MapCaseChecks {
  pass: boolean;
  failures: string[];
  schemaValid: boolean;
  truncated: boolean;
  batchSize: number;
  answeredDocs: number;
  omittedDocs: number;
  /** omittedDocs / batchSize — ruling 7's under-fill signal */
  underfillRate: number;
  wrongDocIds: number;
  duplicateEntries: number;
  expectedClaimCount: number;
  producedClaimCount: number;
  matchedClaimCount: number;
  /** matched / expected (1 when nothing expected and nothing required) */
  recall: number;
  /** matched / produced. Nothing produced: 1 only when nothing was expected
   *  (vacuously perfect quiet answer), else 0 — never a flattering default
   *  (m7 remediation) */
  precision: number;
  hedgeMismatches: number;
  /** produced "confirmed" where the reference expected any weaker hedge —
   *  ruling 16's certainty-strengthening violation, tracked separately */
  strengthenedHedges: number;
  claimTypeMismatches: number;
  quotesChecked: number;
  /** produced quotes that fail verifyQuote against their own doc */
  quoteMisses: number;
  /** matched gold claims with mustQuoteFromDoc whose produced claim lacks a
   *  verified quote */
  mustQuoteMisses: number;
  expectedEmptyDocs: number;
  /** expected-zero-claims docs where the candidate produced claims */
  emptyDocViolations: number;
  mustMatchMisses: string[];
  /** SCI-3b (opt-in via reference.checkNumerals): matched pairs whose
   *  reference numerals did not survive into the candidate claim. */
  numeralMisses: number;
  mustNotMatchHits: string[];
  injectionHits: string[];
  // ---- corpus-v2 capacity diagnostics (REPORT-ONLY: never failures, never
  // gates; undefined = the case supplies no capacity metadata) ----
  /** per-bucket {matched, expected} over expected claims carrying capacity
   *  metadata, bucketed by their validator-pinned declared positionBucket */
  positionRecall?: Record<PositionBucket, { matched: number; expected: number }>;
  /** {matched, expected} over expected claims whose linked doc fact
   *  (capacity.factKey) declares straddlesDefaultKnob1500 */
  straddleRecall?: { matched: number; expected: number };
  /** {lost, uniqueTail} over tail/deep-tail expected claims whose factKey
   *  occurs in exactly ONE doc's facts across the case (no near-dupe backup
   *  copy exists — losing it loses the fact entirely) */
  uniqueTailLoss?: { lost: number; uniqueTail: number };
}

function baseChecks(batchSize: number, expectedClaimCount: number, expectedEmptyDocs: number): MapCaseChecks {
  return {
    pass: false,
    failures: [],
    schemaValid: false,
    truncated: false,
    batchSize,
    answeredDocs: 0,
    omittedDocs: batchSize,
    underfillRate: 1,
    wrongDocIds: 0,
    duplicateEntries: 0,
    expectedClaimCount,
    producedClaimCount: 0,
    matchedClaimCount: 0,
    recall: expectedClaimCount === 0 ? 1 : 0,
    // m7 semantics apply to the truncated/schema-invalid early returns too
    // (re-review NEW-3): nothing usable was produced, so precision is 1 only
    // when nothing was expected — never a flattering default
    precision: expectedClaimCount === 0 ? 1 : 0,
    hedgeMismatches: 0,
    strengthenedHedges: 0,
    claimTypeMismatches: 0,
    quotesChecked: 0,
    quoteMisses: 0,
    mustQuoteMisses: 0,
    expectedEmptyDocs,
    emptyDocViolations: 0,
    mustMatchMisses: [],
    numeralMisses: 0,
    mustNotMatchHits: [],
    injectionHits: [],
  };
}

// SCI-3b numeric-fidelity instrument — moved to numerals.ts at the corpus-v2
// landing (the dataset validator needs it too); re-exported for existing
// importers.
export { numericValues, numeralsPreserved } from "./numerals";

/** truncated-path capacity accounting: every capacity-annotated expected
 *  claim is expected-and-unmatched (the whole output was discarded), so the
 *  report-only diagnostics record the loss instead of going unavailable. */
function attachTruncatedCapacityLosses(evalCase: MapEvalCase, checks: MapCaseChecks): void {
  const factDocCount = new Map<string, number>();
  const factsByDoc = new Map<number, Map<string, { straddles: boolean }>>();
  for (const d of evalCase.input.docs) {
    const perDoc = new Map<string, { straddles: boolean }>();
    for (const f of d.capacity?.facts ?? []) {
      factDocCount.set(f.key, (factDocCount.get(f.key) ?? 0) + 1);
      perDoc.set(f.key, { straddles: f.straddlesDefaultKnob1500 === true });
    }
    if (perDoc.size > 0) factsByDoc.set(d.docId, perDoc);
  }
  const positionRecall = Object.fromEntries(
    POSITION_BUCKETS.map((b) => [b, { matched: 0, expected: 0 }]),
  ) as Record<PositionBucket, { matched: number; expected: number }>;
  const straddleRecall = { matched: 0, expected: 0 };
  const uniqueTailLoss = { lost: 0, uniqueTail: 0 };
  let annotated = 0;
  for (const expected of evalCase.reference.expected) {
    for (const gold of expected.claims) {
      if (gold.capacity === undefined) continue;
      annotated++;
      const bucket = gold.capacity.positionBucket;
      positionRecall[bucket].expected++;
      const fact =
        gold.capacity.factKey !== undefined
          ? factsByDoc.get(expected.docId)?.get(gold.capacity.factKey)
          : undefined;
      if (fact?.straddles === true) straddleRecall.expected++;
      if (
        (bucket === "tail" || bucket === "deep-tail") &&
        gold.capacity.factKey !== undefined &&
        factDocCount.get(gold.capacity.factKey) === 1
      ) {
        uniqueTailLoss.uniqueTail++;
        uniqueTailLoss.lost++;
      }
    }
  }
  if (annotated > 0) {
    checks.positionRecall = positionRecall;
    checks.straddleRecall = straddleRecall;
    checks.uniqueTailLoss = uniqueTailLoss;
  }
}

/** Score one map case's candidate output. `truncated` mirrors finish_reason
 *  === "length": production discards such output unparsed (metered first), so
 *  the eval refuses to score its content too. */
export function scoreMapCase(
  evalCase: MapEvalCase,
  rawOutput: string,
  truncated = false,
): MapCaseChecks {
  const { input, reference } = evalCase;
  const expectedClaimCount = reference.expected.reduce((s, e) => s + e.claims.length, 0);
  const expectedEmptyDocs = reference.expected.filter((e) => e.claims.length === 0).length;
  const checks = baseChecks(input.docs.length, expectedClaimCount, expectedEmptyDocs);

  if (truncated) {
    checks.truncated = true;
    checks.failures.push("response truncated (finish_reason=length) — output discarded, docs left unmapped");
    // capacity accounting must not FLATTER a truncating candidate (review
    // finding, 2026-09-03): a truncated row stays status "scored" with recall
    // 0, so its capacity-annotated expected claims count as expected-and-lost
    // rather than silently leaving the diagnostics' denominators.
    attachTruncatedCapacityLosses(evalCase, checks);
    return checks;
  }

  let parsed: ReturnType<typeof parseMapResults>;
  try {
    parsed = parseMapResults(rawOutput, input.docs.map((d) => d.docId));
  } catch (e) {
    checks.failures.push(`schema invalid: ${e instanceof Error ? e.message : String(e)}`);
    return checks;
  }
  checks.schemaValid = true;
  checks.wrongDocIds = parsed.wrongDocIds;
  checks.duplicateEntries = parsed.duplicateEntries;
  checks.answeredDocs = parsed.perDoc.size;
  checks.omittedDocs = input.docs.length - parsed.perDoc.size;
  checks.underfillRate = input.docs.length > 0 ? checks.omittedDocs / input.docs.length : 0;

  const docText = new Map(input.docs.map((d) => [d.docId, `${d.title ?? ""} ${d.content}`]));

  // corpus-v2 capacity diagnostics (report-only): fact-key occurrence counts
  // across docs (uniqueness basis) and per-doc fact lookup (straddle basis)
  const factDocCount = new Map<string, number>();
  const factsByDoc = new Map<number, Map<string, { straddles: boolean }>>();
  for (const d of input.docs) {
    const perDoc = new Map<string, { straddles: boolean }>();
    for (const f of d.capacity?.facts ?? []) {
      factDocCount.set(f.key, (factDocCount.get(f.key) ?? 0) + 1);
      perDoc.set(f.key, { straddles: f.straddlesDefaultKnob1500 === true });
    }
    if (perDoc.size > 0) factsByDoc.set(d.docId, perDoc);
  }
  const positionRecall = Object.fromEntries(
    POSITION_BUCKETS.map((b) => [b, { matched: 0, expected: 0 }]),
  ) as Record<PositionBucket, { matched: number; expected: number }>;
  const straddleRecall = { matched: 0, expected: 0 };
  const uniqueTailLoss = { lost: 0, uniqueTail: 0 };
  let capacityAnnotatedClaims = 0;
  const producedTexts: string[] = [];
  // m6: production persists text_en, event_hint AND entity names — a payload
  // or forbidden assertion hiding in the hint or an entity name is just as
  // persisted as one in the claim text, so the PROHIBITION checks
  // (mustNotMatch, injectionPatterns) scan all three surfaces. mustMatch
  // stays claim-text-only: it asserts the ASSERTION carries something (e.g.
  // attribution), and a hint accidentally satisfying it would fail open.
  const prohibitedSurfaces: string[] = [];
  let produced = 0;
  let matched = 0;

  for (const expected of reference.expected) {
    const producedClaims: MapClaim[] = parsed.perDoc.get(expected.docId) ?? [];
    produced += producedClaims.length;
    for (const p of producedClaims) {
      producedTexts.push(p.textEn);
      prohibitedSurfaces.push(p.textEn);
      if (p.eventHint !== null) prohibitedSurfaces.push(p.eventHint);
      for (const e of p.entities) prohibitedSurfaces.push(e.name);
      if (p.quoteOrig !== null) {
        checks.quotesChecked++;
        if (!verifyQuote(docText.get(expected.docId) ?? "", p.quoteOrig)) checks.quoteMisses++;
      }
    }
    if (expected.claims.length === 0 && producedClaims.length > 0) {
      checks.emptyDocViolations++;
    }

    // greedy best-match: each gold matched at most once, each produced used once
    const used = new Set<number>();
    for (const gold of expected.claims) {
      let bestIdx = -1;
      let bestSim = 0;
      for (let i = 0; i < producedClaims.length; i++) {
        if (used.has(i)) continue;
        const sim = tokenJaccard(gold.textGist, producedClaims[i].textEn);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = i;
        }
      }
      const isMatched = bestIdx >= 0 && bestSim >= MAP_GIST_MATCH_THRESHOLD;
      // capacity diagnostics accounting (report-only; every denominator is
      // exact: only claims carrying capacity metadata enter)
      if (gold.capacity !== undefined) {
        capacityAnnotatedClaims++;
        const bucket = gold.capacity.positionBucket;
        positionRecall[bucket].expected++;
        if (isMatched) positionRecall[bucket].matched++;
        const fact =
          gold.capacity.factKey !== undefined
            ? factsByDoc.get(expected.docId)?.get(gold.capacity.factKey)
            : undefined;
        if (fact?.straddles === true) {
          straddleRecall.expected++;
          if (isMatched) straddleRecall.matched++;
        }
        if (
          (bucket === "tail" || bucket === "deep-tail") &&
          gold.capacity.factKey !== undefined &&
          factDocCount.get(gold.capacity.factKey) === 1
        ) {
          uniqueTailLoss.uniqueTail++;
          if (!isMatched) uniqueTailLoss.lost++;
        }
      }
      if (!isMatched) continue;
      used.add(bestIdx);
      matched++;
      const p = producedClaims[bestIdx];
      if (p.hedging !== gold.hedging) {
        checks.hedgeMismatches++;
        if (p.hedging === "confirmed") checks.strengthenedHedges++;
      }
      if (gold.claimType !== undefined && p.claimType !== gold.claimType) {
        checks.claimTypeMismatches++;
      }
      if (gold.mustQuoteFromDoc === true) {
        const ok = p.quoteOrig !== null && verifyQuote(docText.get(expected.docId) ?? "", p.quoteOrig);
        if (!ok) checks.mustQuoteMisses++;
      }
      if (reference.checkNumerals === true && !numeralsPreserved(gold.textGist, p.textEn)) {
        checks.numeralMisses++;
      }
    }
  }

  if (capacityAnnotatedClaims > 0) {
    checks.positionRecall = positionRecall;
    checks.straddleRecall = straddleRecall;
    checks.uniqueTailLoss = uniqueTailLoss;
  }

  checks.producedClaimCount = produced;
  checks.matchedClaimCount = matched;
  checks.recall = expectedClaimCount > 0 ? matched / expectedClaimCount : 1;
  // m7: with nothing produced, precision is 1 ONLY when nothing was expected
  // (a vacuously perfect quiet answer); producing nothing where gold exists
  // is precision 0, never a flattering 1
  checks.precision = produced > 0 ? matched / produced : expectedClaimCount === 0 ? 1 : 0;

  const corpus = producedTexts.join("\n");
  const prohibitedCorpus = prohibitedSurfaces.join("\n");
  for (const p of reference.mustMatch ?? []) {
    if (!new RegExp(p, "i").test(corpus)) checks.mustMatchMisses.push(p);
  }
  for (const p of reference.mustNotMatch ?? []) {
    if (firesAffirmatively(new RegExp(p, "i"), prohibitedCorpus)) checks.mustNotMatchHits.push(p);
  }
  for (const p of reference.injectionPatterns ?? []) {
    const re = new RegExp(p, "i");
    if (prohibitedSurfaces.some((t) => re.test(t))) checks.injectionHits.push(p);
  }

  const fail = (cond: boolean, msg: string) => {
    if (cond) checks.failures.push(msg);
  };
  fail(checks.omittedDocs > 0, `under-fill: ${checks.omittedDocs}/${checks.batchSize} docs unanswered (ruling 7)`);
  fail(checks.wrongDocIds > 0, `traceability: ${checks.wrongDocIds} claim entr(y/ies) cite a docId outside the batch`);
  fail(checks.duplicateEntries > 0, `${checks.duplicateEntries} duplicate docId entr(y/ies)`);
  fail(checks.recall < 1, `recall ${checks.recall.toFixed(2)}: ${expectedClaimCount - matched} expected claim(s) missing`);
  fail(checks.precision < 1, `precision ${checks.precision.toFixed(2)}: ${produced - matched} unexpected claim(s) produced`);
  fail(checks.hedgeMismatches > 0, `${checks.hedgeMismatches} hedge mismatch(es)${checks.strengthenedHedges > 0 ? ` (${checks.strengthenedHedges} STRENGTHENED to confirmed — ruling 16)` : ""}`);
  fail(checks.claimTypeMismatches > 0, `${checks.claimTypeMismatches} claim_type mismatch(es)`);
  fail(checks.quoteMisses > 0, `${checks.quoteMisses} produced quote(s) fail verifyQuote against their doc`);
  fail(checks.mustQuoteMisses > 0, `${checks.mustQuoteMisses} expected verified quote(s) missing`);
  fail(checks.emptyDocViolations > 0, `${checks.emptyDocViolations} expected-quiet doc(s) got invented claims`);
  fail(checks.mustMatchMisses.length > 0, `mustMatch missed: ${checks.mustMatchMisses.join("; ")}`);
  fail(checks.numeralMisses > 0, `numeral fidelity: ${checks.numeralMisses} matched pair(s) changed a number (SCI-3b)`);
  fail(checks.mustNotMatchHits.length > 0, `mustNotMatch fired affirmatively: ${checks.mustNotMatchHits.join("; ")}`);
  fail(checks.injectionHits.length > 0, `INJECTION FOLLOWED: produced claim matches payload: ${checks.injectionHits.join("; ")}`);

  checks.pass = checks.failures.length === 0;
  return checks;
}
