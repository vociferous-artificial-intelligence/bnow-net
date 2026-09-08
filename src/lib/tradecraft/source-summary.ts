// Per-digest source summary statement — ICD 206 mechanism 3, generated deterministically
// from the claim-to-document join a digest page already holds (WS-7.3).
//
// Computed at READ time and persisted nowhere (PLAN-WS-7 §3 C8): the digest page already
// runs the join and already groups it, so the summary costs no extra query and no
// migration. If persistence is ever wanted it goes to `digests.structured.stats`, additive,
// the `evidenceRecency` precedent — never a column.
//
// THE CAP FACT IS READ FROM THE DIGEST'S OWN RECORD, OR NOT REPORTED.
// The digest pipeline's 40% source/platform cap is `selectSourceMix` / `MIX_CAP_FRACTION`
// (`src/lib/analysis/source-mix.ts:15,26`), and the only durable trace of it is the counts
// the legacy engine persists at `structured.stats.sourceMix` (`digest.ts:202-206`). A digest
// with no such record gets "not recorded for this digest" — the mix is NEVER re-derived from
// the rows this page renders, because those are the PUBLISHED claims' documents, a different
// and much smaller population than the gathered analysis batch the cap acted on. Reporting
// one as the other would be a fabricated provenance figure.
// The recorded counts also cannot say whether the cap DEFERRED a document (held it back and
// admitted it later) or DISPLACED one (dropped it from the batch) — `selectSourceMix` keeps
// no such trace — so the summary reports the observed shares against the threshold and says
// plainly that the deferral-versus-displacement fact is not recorded.
//
// No new judgment: every number is a count or a share of counts. No reliability score, no
// composite, no letter grade. Content strings are English-first, like every other generated
// product string (`src/lib/conflicts/product-copy.ts`).
//
// Purity: no database, no provider, no environment read, no clock. Pinned by
// `descriptor-import-hygiene.test.ts`.

import {
  claimChannelKey,
  claimSourceLabel,
  evidencePlatform,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
} from "@/components/claim-evidence-model";
import { MIX_CAP_FRACTION } from "@/lib/analysis/source-mix";
import type { HedgingClass } from "./descriptor";

export const SOURCE_SUMMARY_VERSION = "summary-v1";

export const SOURCE_SUMMARY_LABEL =
  "Generated from citation data, summary template v1 — not an analyst judgment.";

/** Hedging classes ISW carried WITHOUT confirming — the weak-single-document test. */
const WEAK_HEDGING: readonly HedgingClass[] = ["claimed", "unverified"];

/** One published claim and the documents cited for it. Claim TEXT is deliberately absent. */
export interface SummaryClaim {
  hedging: string;
  docs: readonly ClaimSourceDoc[];
}

/** `structured.stats.sourceMix.docsAnalyzed` as `sourceMixStats()` writes it. */
export interface RecordedSourceMix {
  byAdapter: Readonly<Record<string, number>>;
  byPlatform: Readonly<Record<string, number>>;
}

export interface MixShare {
  label: string;
  count: number;
  /** integer percent of the recorded analysis batch */
  percent: number;
}

export interface SourceMixFact {
  batchDocuments: number;
  capPercent: number;
  largestPlatform: MixShare | null;
  largestAdapter: MixShare | null;
}

export interface CorroborationCount {
  claims: number;
  percent: number;
}

export interface TopSource {
  label: string;
  claims: number;
  /** registry source id, or null for a document with no registry row (the render
   *  target needs it to look up the source's descriptor; an unregistered channel
   *  has no citation profile and correctly gets none) */
  sourceId: number | null;
}

export interface SourceSummaryV1 {
  version: typeof SOURCE_SUMMARY_VERSION;
  claims: number;
  documents: number;
  channels: number;
  platforms: number;
  multiDocumentClaims: CorroborationCount;
  multiChannelClaims: CorroborationCount;
  multiPlatformClaims: CorroborationCount;
  topSources: readonly TopSource[];
  singleDocumentWeakClaims: number;
  /** null when the digest recorded no source-mix figures */
  mix: SourceMixFact | null;
  sentences: readonly string[];
  text: string;
  label: typeof SOURCE_SUMMARY_LABEL;
}

const RULING_12_NOTE =
  "Near-duplicate records from the same theater within a day of each other are collapsed " +
  "before a claim is written, so a second document here is a surviving distinct record, " +
  "not an independent confirmation.";

const RULING_14_NOTE =
  "Evidence for this digest is gathered from this theater's own document corpus only, " +
  "ordered by the registry's citation history.";

const MIX_NOT_RECORDED =
  "Source-mix figures were not recorded for this digest, so the platform and adapter cap " +
  "cannot be reported for it.";

const MIX_UNTRACED =
  "Whether that cap held a document back or dropped one from the batch is not recorded.";

/**
 * `selectSourceMix` fills remaining slots PAST the cap when the corpus lacks alternatives
 * (`source-mix.ts:1-7`, "coverage beats diversity on thin days"). Without this sentence a
 * recorded share above the ceiling reads as a contradiction of the ceiling.
 */
const MIX_OVER_CAP =
  "A share above that ceiling means the day's corpus did not hold enough alternatives to " +
  "fill the batch within it, so the remaining slots were filled past the cap.";

const EMPTY_SUMMARY_SENTENCE =
  "This digest has no published claims, so there is nothing to summarize.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    counts[key] = Math.floor(n);
  }
  return counts;
}

/**
 * Fail-closed parse of `digests.structured.stats.sourceMix.docsAnalyzed`. Anything that is
 * not two non-negative count maps returns null, which renders as "not recorded" — a
 * malformed record must never become a confident share.
 */
export function readRecordedSourceMix(value: unknown): RecordedSourceMix | null {
  if (!isRecord(value)) return null;
  const analyzed = isRecord(value.docsAnalyzed) ? value.docsAnalyzed : null;
  if (!analyzed) return null;
  const byAdapter = readCounts(analyzed.byAdapter);
  const byPlatform = readCounts(analyzed.byPlatform);
  if (!byAdapter || !byPlatform) return null;
  const total = Object.values(byPlatform).reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;
  return { byAdapter, byPlatform };
}

function largestShare(counts: Readonly<Record<string, number>>, total: number): MixShare | null {
  let best: MixShare | null = null;
  // deterministic on ties: highest count, then lexicographic label
  for (const label of Object.keys(counts).sort()) {
    const count = counts[label];
    if (count <= 0) continue;
    if (!best || count > best.count) {
      best = { label, count, percent: Math.round((count / total) * 100) };
    }
  }
  return best;
}

export function sourceMixFact(mix: RecordedSourceMix | null): SourceMixFact | null {
  if (!mix) return null;
  const total = Object.values(mix.byPlatform).reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;
  return {
    batchDocuments: total,
    capPercent: Math.round(MIX_CAP_FRACTION * 100),
    largestPlatform: largestShare(mix.byPlatform, total),
    largestAdapter: largestShare(mix.byAdapter, total),
  };
}

function share(claims: number, total: number): CorroborationCount {
  return { claims, percent: total > 0 ? Math.round((claims / total) * 100) : 0 };
}

function platformKey(doc: ClaimSourceDoc): string {
  const visible = evidencePlatform(doc);
  return visible === "other" ? `other:${doc.adapter.trim().toLocaleLowerCase()}` : visible;
}

function topSources(claims: readonly SummaryClaim[], limit: number): TopSource[] {
  // A source supports a claim ONCE however many of its documents are cited for it —
  // otherwise a channel that posted three times outranks three independent outlets.
  const byChannel = new Map<string, TopSource>();
  for (const claim of claims) {
    const seen = new Set<string>();
    for (const doc of claim.docs) {
      const key = claimChannelKey(doc);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = byChannel.get(key);
      if (entry) entry.claims += 1;
      else byChannel.set(key, { label: claimSourceLabel(doc), claims: 1, sourceId: doc.sourceId });
    }
  }
  return [...byChannel.values()]
    .sort((a, b) => b.claims - a.claims || a.label.localeCompare(b.label, "en"))
    .slice(0, limit);
}

function countSentence(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function listSources(sources: readonly TopSource[]): string {
  const parts = sources.map((s) => `${s.label} (${countSentence(s.claims, "claim", "claims")})`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Build the per-digest summary. Total function: an empty digest, a digest whose claims cite
 * one document each, and a digest with no recorded source mix all have defined renderings.
 */
export function summarizeDigestSources(
  claims: readonly SummaryClaim[],
  recordedMix: RecordedSourceMix | null,
): SourceSummaryV1 {
  const mix = sourceMixFact(recordedMix);
  const distinctDocs = new Map<number, ClaimSourceDoc>();
  for (const claim of claims) for (const doc of claim.docs) distinctDocs.set(doc.docId, doc);
  const totals = summarizeClaimEvidence([...distinctDocs.values()]);

  let multiDocument = 0;
  let multiChannel = 0;
  let multiPlatform = 0;
  let singleDocumentWeakClaims = 0;
  for (const claim of claims) {
    const docs = new Map(claim.docs.map((doc) => [doc.docId, doc]));
    if (docs.size >= 2) multiDocument += 1;
    if (new Set([...docs.values()].map(claimChannelKey)).size >= 2) multiChannel += 1;
    if (new Set([...docs.values()].map(platformKey)).size >= 2) multiPlatform += 1;
    const hedging = claim.hedging.trim().toLocaleLowerCase() as HedgingClass;
    if (docs.size === 1 && WEAK_HEDGING.includes(hedging)) singleDocumentWeakClaims += 1;
  }

  const claimCount = claims.length;
  const sources = topSources(claims, 3);
  const sentences: string[] = [];

  if (claimCount === 0 || totals.documents === 0) {
    sentences.push(EMPTY_SUMMARY_SENTENCE);
    if (mix) sentences.push(mixSentence(mix));
    else sentences.push(MIX_NOT_RECORDED);
  } else {
    sentences.push(
      `This digest publishes ${countSentence(claimCount, "claim", "claims")} resting on ` +
        `${countSentence(totals.documents, "distinct document", "distinct documents")} from ` +
        `${countSentence(totals.channels, "channel", "channels")} across ` +
        `${countSentence(totals.platforms, "platform", "platforms")}.`,
    );
    sentences.push(RULING_14_NOTE);
    sentences.push(
      `${multiDocument} of ${claimCount} claims (${share(multiDocument, claimCount).percent}%) ` +
        `cite two or more documents, ${multiChannel} ` +
        `(${share(multiChannel, claimCount).percent}%) cite two or more channels, and ` +
        `${multiPlatform} (${share(multiPlatform, claimCount).percent}%) cite two or more ` +
        `platforms.`,
    );
    sentences.push(RULING_12_NOTE);
    if (sources.length > 0) {
      sentences.push(
        `The ${sources.length === 1 ? "source" : `${sources.length} sources`} supporting the ` +
          `most claims ${sources.length === 1 ? "is" : "are"} ${listSources(sources)}.`,
      );
    }
    sentences.push(
      singleDocumentWeakClaims === 0
        ? "No claim rests on a single document that ISW's vocabulary carries as claimed or unverified."
        : `${countSentence(singleDocumentWeakClaims, "claim rests", "claims rest")} on a single ` +
          `document carried as claimed or unverified.`,
    );
    sentences.push(mix ? mixSentence(mix) : MIX_NOT_RECORDED);
  }

  return {
    version: SOURCE_SUMMARY_VERSION,
    claims: claimCount,
    documents: totals.documents,
    channels: totals.channels,
    platforms: totals.platforms,
    multiDocumentClaims: share(multiDocument, claimCount),
    multiChannelClaims: share(multiChannel, claimCount),
    multiPlatformClaims: share(multiPlatform, claimCount),
    topSources: sources,
    singleDocumentWeakClaims,
    mix,
    sentences,
    text: sentences.join(" "),
    label: SOURCE_SUMMARY_LABEL,
  };
}

function mixSentence(mix: SourceMixFact): string {
  const parts: string[] = [
    `The analysis batch behind this digest was capped at ${mix.capPercent}% per platform and ` +
      `per adapter; of the ${countSentence(mix.batchDocuments, "document", "documents")} it ` +
      `contained,`,
  ];
  const shares: string[] = [];
  if (mix.largestPlatform) {
    shares.push(`the largest platform share was ${mix.largestPlatform.percent}% (${mix.largestPlatform.label})`);
  }
  if (mix.largestAdapter) {
    shares.push(`the largest transport share was ${mix.largestAdapter.percent}% (${mix.largestAdapter.label})`);
  }
  parts.push(shares.length > 0 ? `${shares.join(" and ")}.` : "no per-platform share is recorded.");
  const overCap =
    (mix.largestPlatform?.percent ?? 0) > mix.capPercent ||
    (mix.largestAdapter?.percent ?? 0) > mix.capPercent;
  return `${parts.join(" ")} ${overCap ? `${MIX_OVER_CAP} ` : ""}${MIX_UNTRACED}`;
}
