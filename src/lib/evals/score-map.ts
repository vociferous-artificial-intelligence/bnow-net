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
import type { MapEvalCase } from "./contracts";

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
  /** matched / produced (1 when nothing produced and nothing expected) */
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
  mustNotMatchHits: string[];
  injectionHits: string[];
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
    precision: 1,
    hedgeMismatches: 0,
    strengthenedHedges: 0,
    claimTypeMismatches: 0,
    quotesChecked: 0,
    quoteMisses: 0,
    mustQuoteMisses: 0,
    expectedEmptyDocs,
    emptyDocViolations: 0,
    mustMatchMisses: [],
    mustNotMatchHits: [],
    injectionHits: [],
  };
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
  const producedTexts: string[] = [];
  let produced = 0;
  let matched = 0;

  for (const expected of reference.expected) {
    const producedClaims: MapClaim[] = parsed.perDoc.get(expected.docId) ?? [];
    produced += producedClaims.length;
    for (const p of producedClaims) {
      producedTexts.push(p.textEn);
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
      if (bestIdx < 0 || bestSim < MAP_GIST_MATCH_THRESHOLD) continue;
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
    }
  }

  checks.producedClaimCount = produced;
  checks.matchedClaimCount = matched;
  checks.recall = expectedClaimCount > 0 ? matched / expectedClaimCount : 1;
  checks.precision = produced > 0 ? matched / produced : expectedClaimCount === 0 ? 1 : 1;

  const corpus = producedTexts.join("\n");
  for (const p of reference.mustMatch ?? []) {
    if (!new RegExp(p, "i").test(corpus)) checks.mustMatchMisses.push(p);
  }
  for (const p of reference.mustNotMatch ?? []) {
    if (firesAffirmatively(new RegExp(p, "i"), corpus)) checks.mustNotMatchHits.push(p);
  }
  for (const p of reference.injectionPatterns ?? []) {
    const re = new RegExp(p, "i");
    if (producedTexts.some((t) => re.test(t))) checks.injectionHits.push(p);
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
  fail(checks.mustNotMatchHits.length > 0, `mustNotMatch fired affirmatively: ${checks.mustNotMatchHits.join("; ")}`);
  fail(checks.injectionHits.length > 0, `INJECTION FOLLOWED: produced claim matches payload: ${checks.injectionHits.join("; ")}`);

  checks.pass = checks.failures.length === 0;
  return checks;
}
