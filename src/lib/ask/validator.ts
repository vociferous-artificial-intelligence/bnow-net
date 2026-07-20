// AI Search Phase 3 Increment A: the pure AnswerValidator — every deterministic
// check that stands between model output and the rendered answer, extracted so
// the streaming (Increment B) and non-streaming paths share ONE implementation
// and cannot drift. No I/O, no LLM, no globals; everything fixture-testable.
//
// Contents:
//  1. citation parsing/filtering (the SACRED anti-fabrication filter),
//  2. the denial-prefix property (beginsWithDenial — moved from answer.ts),
//  3. deterministic insufficient copy (moved from answer.ts),
//  4. terminal completion classification (refusal/empty/truncation/content),
//  5. the §4 / standing-ruling-20 source-fidelity matrix for NAME-BEARING
//     sentences: identity, predicate, certainty/attribution, status/timing —
//     validated against the evidence actually cited. A failing sentence is
//     REPLACED by deterministic cited-claim wording; the NAME IS NEVER
//     SUPPRESSED (over-suppression is a contract failure, not a safe default).
//
// The fidelity checks are deliberately structural-deterministic (regex families
// over sentences + cited-claim text), not an LLM judge (the master prompt
// forbids a second LLM as sole validator). They are conservative in the
// replace-with-cited-wording direction: a replaced sentence still shows the
// evidence verbatim with its citation.

// Pure/deterministic evaluator constants — the pipeline and evaluator share the
// definition of denial language ON PURPOSE (ask.test.ts pins the coupling).
import { DENIAL_LANGUAGE_PATTERN, NEGATIVE_DENIAL_LEAD_CHARS } from "./eval-run";

// ---- 1. citations ---------------------------------------------------------------

export const CITATION_MARKER_RE = /\[c(\d+)\]/g;

/** Parse every [cN] marker in order (duplicates preserved). */
export function parseCitedIds(text: string): number[] {
  return [...text.matchAll(CITATION_MARKER_RE)].map((m) => parseInt(m[1], 10));
}

/** The anti-fabrication filter: keep only ids present in the evidence actually
 *  shown to the model, deduped preserving first occurrence. */
export function filterCitations(rawIds: number[], validIds: ReadonlySet<number>): number[] {
  return [...new Set(rawIds)].filter((id) => validIds.has(id));
}

// ---- 2. denial prefix (moved verbatim from answer.ts) ---------------------------

/** True when a v2 model reply BEGINS with the product's recognized
 *  insufficient-evidence language (the evaluator's own denial families, anchored
 *  near the start — a mid-answer "no reports of casualties" in a genuine answer
 *  must NOT trip this). A PREFIX property: decidable from the first
 *  NEGATIVE_DENIAL_LEAD_CHARS characters, which is what makes the Increment B
 *  250-char holdback sufficient. */
export function beginsWithDenial(text: string): boolean {
  const lead = text.trimStart().slice(0, NEGATIVE_DENIAL_LEAD_CHARS);
  const m = lead.match(DENIAL_LANGUAGE_PATTERN);
  return m !== null && (m.index ?? 0) <= 30;
}

// ---- 3. deterministic insufficient copy (moved verbatim from answer.ts) ---------

/** The ONLY prose an insufficient outcome may show (SYSTEM_V2 rule 4: generic
 *  covered theaters/topics and data currency, never a summary of retrieved
 *  claims). Contains no citation syntax by construction. */
export function insufficientEvidenceCopy(currency: string | null): string {
  return (
    `No claims in the covered data address this question. The corpus covers ` +
    `Russia/Ukraine/Iran (strikes, prosecutions, sanctions, trade)` +
    (currency != null ? ` and is current through ${currency} (UTC)` : "") +
    `. Try rephrasing toward a covered theater or topic.`
  );
}

// ---- 4. terminal completion classification --------------------------------------

export type CompletionClass = "refused" | "truncated" | "empty_refused" | "content";

/** Classify a chat completion's terminal condition — the mapping the answered
 *  path has always applied, named so streaming applies the identical one. */
export function classifyCompletion(choice?: {
  message?: { content?: string | null; refusal?: string | null };
  finish_reason?: string;
}): CompletionClass {
  const refusal = choice?.message?.refusal;
  const content = choice?.message?.content;
  const emptyContent = content == null || content.trim() === "";
  if (refusal != null && refusal.trim() !== "") return "refused";
  if (emptyContent && choice?.finish_reason === "length") return "truncated";
  if (emptyContent) return "empty_refused";
  return "content";
}

// ---- 5. named-person source-fidelity matrix (§4 / ruling 20) --------------------

/** The evidence view the fidelity checks need — CandidateClaim and
 *  SnapshotClaim both satisfy it structurally. */
export interface FidelityEvidence {
  claimId: number;
  text: string;
  hedging: string;
}

export type FidelityFailureKind =
  | "identity" // named person absent from every cited claim
  | "predicate" // asserted act/status family unsupported by the cited claims
  | "certainty" // hedged-only evidence asserted without governing attribution
  | "status"; // expired/removed status presented as current

export interface SentenceFidelityFailure {
  sentence: string;
  kind: FidelityFailureKind;
  /** the first cited claim available for the deterministic replacement */
  fallbackClaimId: number | null;
}

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

/** Capitalized First Last pairs — the name-bearing heuristic. Union'd with the
 *  cited claims' own detected names so entity-list names always count. */
const NAME_PAIR_RE = /\b[A-Z][\p{L}'’-]+ [A-Z][\p{L}'’-]+\b/gu;

/** Words that must not start a "name": sentence-lead artifacts. */
const NAME_STOPWORDS = new Set([
  "The", "This", "These", "Those", "According", "Sources", "No", "It", "In", "On",
  "United", "European", "Russian", "Ukrainian", "Iranian", "Islamic", "General",
  "Colonel", "President", "Minister", "Prime",
]);

export function extractNameCandidates(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(NAME_PAIR_RE)) {
    const [first] = m[0].split(" ");
    if (!NAME_STOPWORDS.has(first)) names.push(m[0]);
  }
  return [...new Set(names)];
}

/** Assertion families: if a sentence asserts the LEFT pattern about a named
 *  person, at least one cited claim must match the RIGHT evidence family.
 *  Deliberately narrow — these encode the §4 strengthening modes (conviction,
 *  confirmed death, sanction/designation, arrest), not general paraphrase. */
const PREDICATE_FAMILIES: Array<{ asserts: RegExp; evidence: RegExp; }> = [
  { asserts: /\bconvict(?:ed|ion)\b/i, evidence: /\bconvict/i },
  { asserts: /\bconfirmed (?:dead|killed)\b|\bdeath (?:is|was|has been) confirmed\b/i, evidence: /\bconfirm[^.]{0,40}(dead|killed|death)|\b(dead|killed|death)[^.]{0,40}confirm/i },
  { asserts: /\b(?:is|was|remains) (?:sanctioned|designated)\b|\bunder sanctions\b/i, evidence: /\bsanction|\bdesignat/i },
  { asserts: /\b(?:was|is|been) (?:arrested|detained)\b/i, evidence: /\barrest|\bdetain/i },
  { asserts: /\bcharged with\b/i, evidence: /\bcharge/i },
];

/** Attribution markers that GOVERN an assertion (§4.4): their presence in the
 *  sentence keeps hedged single/multi-source reporting honest. */
const ATTRIBUTION_RE = /\b(?:according to|reportedly|reported(?:ly)?|claimed?|allegedly|sources? (?:say|said|claim)|per\b)/i;

/** Current-status assertions vs expired/removed evidence (§4.8). */
const CURRENT_STATUS_RE = /\b(?:is|remains?) (?:currently |still )?(?:sanctioned|designated|listed|on the .{0,20}list)\b/i;
const EXPIRED_EVIDENCE_RE = /\b(?:removed|delisted|lifted|expired|former|revoked|overturned)\b/i;

const HEDGED = new Set(["claimed", "unverified"]);

/** Validate every name-bearing CITED sentence of an answer against the claims
 *  it cites. Sentences without a name or without citations pass through — this
 *  matrix governs named-person fidelity only; the general citation filter
 *  already ran. Returns per-sentence failures with replacement material. */
export function findFidelityFailures(
  answerText: string,
  evidenceById: ReadonlyMap<number, FidelityEvidence>,
): SentenceFidelityFailure[] {
  const failures: SentenceFidelityFailure[] = [];
  for (const sentence of answerText.split(SENTENCE_SPLIT_RE)) {
    const citedIds = parseCitedIds(sentence).filter((id) => evidenceById.has(id));
    if (citedIds.length === 0) continue; // uncited sentences: the citation filter's domain
    const names = extractNameCandidates(sentence.replace(CITATION_MARKER_RE, ""));
    if (names.length === 0) continue;
    const cited = citedIds.map((id) => evidenceById.get(id)!);
    const citedText = cited.map((c) => c.text).join("\n");
    const fallbackClaimId = citedIds[0] ?? null;

    // (1) identity: every named person must appear in at least one cited claim.
    const missingName = names.find(
      (n) => !citedText.toLowerCase().includes(n.toLowerCase()),
    );
    if (missingName !== undefined) {
      failures.push({ sentence, kind: "identity", fallbackClaimId });
      continue;
    }
    // (2) predicate: asserted act/status families need matching evidence.
    const badPredicate = PREDICATE_FAMILIES.find(
      (f) => f.asserts.test(sentence) && !f.evidence.test(citedText),
    );
    if (badPredicate !== undefined) {
      failures.push({ sentence, kind: "predicate", fallbackClaimId });
      continue;
    }
    // (4) status/timing: expired evidence must not read as current.
    if (CURRENT_STATUS_RE.test(sentence) && EXPIRED_EVIDENCE_RE.test(citedText) && !EXPIRED_EVIDENCE_RE.test(sentence)) {
      failures.push({ sentence, kind: "status", fallbackClaimId });
      continue;
    }
    // (3) certainty: hedged-only evidence asserted with a strengthening
    // predicate needs governing attribution in the sentence itself.
    const allHedged = cited.every((c) => HEDGED.has(c.hedging));
    const asserting = PREDICATE_FAMILIES.some((f) => f.asserts.test(sentence));
    if (allHedged && asserting && !ATTRIBUTION_RE.test(sentence)) {
      failures.push({ sentence, kind: "certainty", fallbackClaimId });
      continue;
    }
  }
  return failures;
}

/** Deterministic cited-claim wording for a failed sentence — the §4.9 fallback.
 *  The claim text renders VERBATIM with its citation; nothing is invented and
 *  the person's name survives inside the quoted claim. */
export function citedClaimFallbackSentence(claim: FidelityEvidence): string {
  const text = claim.text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return `Sources state: "${text}." [c${claim.claimId}]`;
}

export interface FidelityApplication {
  text: string;
  replacedCount: number;
  failures: SentenceFidelityFailure[];
}

/** Replace each failing sentence with the deterministic cited-claim wording.
 *  Faithful answers pass through BYTE-IDENTICAL (the equivalence guarantee). */
export function applyFidelityFallback(
  answerText: string,
  evidenceById: ReadonlyMap<number, FidelityEvidence>,
): FidelityApplication {
  const failures = findFidelityFailures(answerText, evidenceById);
  if (failures.length === 0) return { text: answerText, replacedCount: 0, failures };
  let text = answerText;
  for (const f of failures) {
    const claim = f.fallbackClaimId !== null ? evidenceById.get(f.fallbackClaimId) : undefined;
    const replacement = claim
      ? citedClaimFallbackSentence(claim)
      : ""; // no cited claim available: drop the unsupported sentence entirely
    text = text.replace(f.sentence, replacement);
  }
  // tidy doubled whitespace left by replacements
  text = text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { text, replacedCount: failures.length, failures };
}

/** Rollback knob for the fidelity fallback (deterministic, $0; default ON).
 *  ASK_FIDELITY_FALLBACK=0/false/off disables the sentence replacement while
 *  keeping every pre-existing validator behavior. */
export function fidelityFallbackEnabled(): boolean {
  const v = process.env.ASK_FIDELITY_FALLBACK?.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}
