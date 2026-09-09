import {
  claimSourceLabel,
  escapeClaimCopyHtml,
  evidencePlatform,
  safeHttpUrl,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
  type EvidencePlatform,
} from "@/components/claim-evidence-model";
import { formatEtDateTimeYear } from "@/lib/time/format-et";
import { ATTRIBUTION_LABEL, DISPUTED_HEDGING } from "@/lib/analysis/attribution-labels";
import {
  confidenceLabel,
  estimateDerivation,
  estimateForClaim,
  likelihoodLabel,
} from "@/lib/tradecraft/estimative";

// WS-7.2 — the ICS 206-01 citation artifact, as data.
//
// Pure and dependency-light on purpose: a later API route (src/app/api/ has only
// ask/auth/cron/locale today) must be able to emit the SAME object the clipboard
// emits, so the shape lives here rather than inside the clipboard serializer.
//
// Ruling 1 is structural, not a review step: this module reads only the
// whitelisted metadata fields below — label, title, URL, platform, timestamps,
// citation count — and never a document body or ISW takeaway prose. The
// sentinel fixture in ics206.test.ts proves it by handing the builder a doc
// carrying marked extra fields and asserting no marker reaches any output.
//
// The artifact is authoritative ENGLISH throughout, i18n-exempt for the same
// reason the legal documents and digest/claim text are (legal-document.tsx:8):
// it is content, not chrome, and a citation whose field names or classification
// vocabulary changed per viewer locale would not be reconstructible by the desk
// that receives it. Only the button/status chrome in claim-copy-model.ts is
// translated.

/** The digest-scoped synthesis dispatch identity, as persisted. Deliberately
 *  all-nullable: it is read back out of jsonb written months ago, so every field
 *  is validated rather than trusted, and a missing one renders UNSTAMPED. */
export interface Ics206Dispatch {
  workload: string | null;
  provider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  registryVersion: string | null;
  approval: string | null;
}

/**
 * What a digest can prove about the tools that produced its claims.
 *
 * DIGEST-scoped, never claim-scoped (PLAN-WS-7 §3 C1): `extractor_version` lives
 * only on doc_claims/doc_map_state (schema.ts:932, :1003); `claims` carries no
 * model, extractor or provider column and `claim_sources` is a bare join table.
 * The provider tag therefore names the map model CONFIGURED when the digest ran,
 * not the model that extracted each cited claim — and those diverge after a
 * remap. Asserting a per-claim prompt hash here would be a false provenance
 * claim, so the builder never does (T4-b rule 3).
 */
export interface ClaimToolStamp {
  /** digests.provider — "stub" | "openai:<model>" | "openai:<map>+mapreduce[+reduce=<x>]" */
  provider: string | null;
  /** structured.stats.reduce.dispatch, else structured.stats.llmDispatch */
  synthesis: Ics206Dispatch | null;
}

/**
 * The stamp AFTER the T4 disclosure policy has been applied server-side. This is
 * the only stamp shape that may enter a client payload: `tools` is null while
 * the disclosure is withheld, so no model name is serialized into the page's RSC
 * flight payload. See src/lib/citation/disclosure-policy.ts.
 */
export interface ClaimCitationStamp {
  /** The digest has attributable, non-stub provenance (ruling 3). */
  attributable: boolean;
  /** Non-null ONLY for a viewer entitled to the AI-tool disclosure. */
  tools: ClaimToolStamp | null;
}

export interface Ics206SourceEntry {
  index: number;
  author: string;
  title: string | null;
  url: string | null;
  mediaType: string;
  informationType: string;
  descriptor: string;
  published: string | null;
  /** T2 (2026-09-07): raw_documents.fetched_at, labeled "Accessed (BNOW ingest)",
   *  and ONLY in citation mode — a citation a reader must be able to reconstruct
   *  needs an access date. This narrowly reverses the 2026-07-16 decision to hide
   *  the ingest timestamp; every other surface still withholds it. */
  accessed: string | null;
}

/**
 * WS-7.4's estimative block (operator decision T3). Presentation only: the
 * mapping is deterministic, reads no model and is not persisted, so a citation
 * carrying it stays reconstructible from the claim's own hedging class and its
 * evidence counts — which is why `basis` is printed beside the two values.
 *
 * The AJP-2.1 information-credibility code is deliberately ABSENT here. It is a
 * derived EXPORT field and never the primary presentation (decision T1), and
 * this artifact is a product surface, not an export format.
 */
export interface Ics206Estimative {
  /** "likely (55–80%)", or "not assessable" when no evidence document exists. */
  likelihood: string;
  /** "moderate" — corroboration-derived, NEVER an analyst's confidence. */
  confidence: string;
  /** Source classification, corroboration tier and mapping version. */
  basis: string;
}

export interface Ics206Disclosure {
  /** True while operator decision T4 holds the AI-tool disclosure dark. */
  withheld: boolean;
  extraction: string;
  synthesis: string;
}

export interface Ics206Citation {
  /** False while the tool disclosure is withheld — the artifact must not call
   *  itself ICS 206-01-conformant without it (T4-b rule 4; PLAN-WS-7 §7). */
  conformant: boolean;
  headline: string;
  claimText: string;
  classification: string;
  /** Ruling 19's fixed attribution label, verbatim, for a disputed claim. */
  attribution: string | null;
  estimative: Ics206Estimative;
  corroboration: string;
  asOf: string;
  canonicalUrl: string;
  publisher: string;
  sources: Ics206SourceEntry[];
  disclosure: Ics206Disclosure;
}

/** Structural input — ClaimCopyPayload satisfies it without this module
 *  importing claim-copy-model.ts, which imports this one. */
export interface Ics206Input {
  claimId: number;
  text: string;
  hedging: string;
  asOf: string | null;
  countryName: string;
  countryIso2: string;
  claimUrl: string | null;
  docs: readonly ClaimSourceDoc[];
  citation?: ClaimCitationStamp;
}

export const ICS206_UNSTAMPED = "unstamped — pre-analysis-reg-v1";
export const ICS206_WITHHELD_MARKER = "tool disclosure withheld";
export const ICS206_EXTRACTION_UNRECORDED = "not recorded for this digest";

/** Field labels for the WS-7.4 block. English constants, like every other
 *  label in this artifact: "Corroboration-derived confidence" is the honesty
 *  constraint stated in the label itself and must survive verbatim. */
const LIKELIHOOD_FIELD = "Likelihood (ICD 203)";
const CONFIDENCE_FIELD = "Corroboration-derived confidence";
const ESTIMATIVE_BASIS_FIELD = "Estimative basis";

const HEADLINE_CONFORMANT = "BNOW.NET — ICS 206-01 source citation";
const HEADLINE_WITHHELD = `BNOW.NET — source citation (ICS 206-01 fields; ${ICS206_WITHHELD_MARKER})`;

const CLASSIFICATION: Record<string, string> = {
  confirmed: "Confirmed",
  assessed: "Assessed",
  claimed: "Claimed",
  unverified: "Unverified",
  unknown: "Unknown",
};

/** ICS 206-01 media type per transport. Kept beside the PAI/CAI map below so a
 *  new adapter cannot acquire a media type without also declaring which it is. */
const MEDIA_TYPE: Record<EvidencePlatform, string> = {
  rss_news: "news media",
  gdelt: "news-index aggregation",
  telegram: "messaging-channel post",
  x: "microblog post",
  procurement: "government procurement record",
  other: "other open source",
};

/** Every current adapter ingests information published openly, so every entry is
 *  PAI. The map is exhaustive rather than a default so that adding a commercial
 *  or contract-acquired feed forces the CAI decision at the type level. */
const INFORMATION_TYPE: Record<EvidencePlatform, string> = {
  rss_news: "publicly available information (PAI)",
  gdelt: "publicly available information (PAI)",
  telegram: "publicly available information (PAI)",
  x: "publicly available information (PAI)",
  procurement: "publicly available information (PAI)",
  other: "publicly available information (PAI)",
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The single canonical-claim-URL validator, moved here from claim-copy-model.ts
 * so the clipboard serializer and any future API route share one gate: https +
 * bnow.net + exactly /digests/<iso2>/<YYYY-MM-DD> + the #c<id> fragment, with no
 * port, credentials or query.
 */
export function canonicalClaimUrl(ref: {
  claimUrl: string | null;
  countryIso2: string;
  claimId: number;
}): string | null {
  const safe = safeHttpUrl(ref.claimUrl);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const parts = url.pathname.split("/");
    const hasCanonicalPath =
      parts.length === 4 &&
      parts[1] === "digests" &&
      parts[2] === ref.countryIso2.toLocaleLowerCase() &&
      /^\d{4}-\d{2}-\d{2}$/.test(parts[3]);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "bnow.net" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      !hasCanonicalPath ||
      url.hash !== `#c${ref.claimId}`
    ) {
      return null;
    }
    return safe;
  } catch {
    return null;
  }
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? nonEmpty(value) : null;
}

function readDispatch(raw: unknown): Ics206Dispatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  return {
    workload: readString(source, "workload"),
    provider: readString(source, "provider"),
    model: readString(source, "model"),
    reasoningEffort: readString(source, "reasoningEffort"),
    registryVersion: readString(source, "registryVersion"),
    approval: readString(source, "approval"),
  };
}

/**
 * Builds the stamp from the digest header row. Precedence is mapreduce first
 * (structured.stats.reduce.dispatch, synthesize.ts:701) then legacy
 * (structured.stats.llmDispatch, digest.ts:218); a stub digest has neither,
 * which is exactly why `provider` is carried alongside rather than inferred.
 */
export function readClaimToolStamp(row: {
  provider?: unknown;
  reduceDispatch?: unknown;
  llmDispatch?: unknown;
}): ClaimToolStamp {
  return {
    provider: typeof row.provider === "string" ? nonEmpty(row.provider) : null,
    synthesis: readDispatch(row.reduceDispatch) ?? readDispatch(row.llmDispatch),
  };
}

/**
 * Ruling 3, fail-closed: a stub-provider digest — and a digest whose provenance
 * cannot be read at all — never copies as a citation.
 *
 * Known limitation, recorded rather than papered over: mapreduceProviderTag()
 * (synthesize.ts:443-449) hard-codes the literal "openai:" prefix and is
 * provider-blind, so the tag alone cannot detect a non-OpenAI or stub synthesis
 * under a mapreduce digest. The dispatch identity's own `provider` field is
 * therefore checked as well, which is strictly stronger than the tag.
 */
export function isStubToolStamp(stamp: ClaimToolStamp): boolean {
  if (stamp.synthesis?.provider?.trim().toLocaleLowerCase() === "stub") return true;
  const provider = stamp.provider?.trim().toLocaleLowerCase();
  if (!provider) return true;
  return provider.split(/[:+]/)[0] === "stub";
}

function descriptorFor(doc: ClaimSourceDoc, countryIso2: string): string {
  // WS-7.3 replaces this stub with the real ICS 206-01 source descriptor.
  const parts = [MEDIA_TYPE[evidencePlatform(doc)], `coverage lens: ${countryIso2.toLocaleLowerCase()}`];
  const cited = doc.citationCount;
  if (typeof cited === "number" && Number.isFinite(cited) && cited > 0) {
    parts.push(`ISW-cited ${plural(cited, "time", "times")}`);
  }
  return parts.join(" · ");
}

function sourceEntry(doc: ClaimSourceDoc, index: number, countryIso2: string): Ics206SourceEntry {
  const kind = evidencePlatform(doc);
  return {
    index: index + 1,
    author: claimSourceLabel(doc),
    title: nonEmpty(doc.title),
    url: safeHttpUrl(doc.url),
    mediaType: MEDIA_TYPE[kind],
    informationType: INFORMATION_TYPE[kind],
    descriptor: descriptorFor(doc, countryIso2),
    published: formatEtDateTimeYear(doc.publishedAt, "en"),
    accessed: formatEtDateTimeYear(doc.firstSeenAt, "en"),
  };
}

function synthesisLine(stamp: ClaimToolStamp): string {
  const tag = stamp.provider ?? ICS206_UNSTAMPED;
  const dispatch = stamp.synthesis;
  if (!dispatch) return `${tag} — ${ICS206_UNSTAMPED}`;
  const parts = [`model ${dispatch.model ?? ICS206_UNSTAMPED}`];
  if (dispatch.reasoningEffort) parts.push(`reasoning effort ${dispatch.reasoningEffort}`);
  parts.push(`routing registry ${dispatch.registryVersion ?? ICS206_UNSTAMPED}`);
  parts.push(`approval ${dispatch.approval ?? ICS206_UNSTAMPED}`);
  return `${tag} — ${parts.join(", ")}`;
}

function disclosureFor(stamp: ClaimCitationStamp): Ics206Disclosure {
  if (!stamp.tools) {
    return {
      withheld: true,
      extraction: ICS206_WITHHELD_MARKER,
      synthesis: ICS206_WITHHELD_MARKER,
    };
  }
  return {
    withheld: false,
    // NEVER back-filled with the digest-run map model: `claims` carries no
    // extractor column, so naming one here would invent provenance (T4-b rule 3).
    // Becomes real when PLAN-WS-7 §9.7 debt item 1 collects the contributing
    // doc_claims.extractor_version values into digests.structured.stats.
    extraction: ICS206_EXTRACTION_UNRECORDED,
    synthesis: synthesisLine(stamp.tools),
  };
}

/**
 * The citation object, or null when the mode is refused. Refusals, all
 * fail-closed: no as-of date or no canonical claim URL (the precondition every
 * citation-bearing copy mode already shares); no stamp on the payload, which is
 * how a surface that has not been plumbed yet declines rather than emitting a
 * stampless citation; and a non-attributable digest (ruling 3).
 */
export function buildIcs206Citation(input: Ics206Input): Ics206Citation | null {
  const url = canonicalClaimUrl(input);
  const asOf = nonEmpty(input.asOf);
  const stamp = input.citation;
  if (!url || !asOf || !stamp || !stamp.attributable) return null;

  const hedging = input.hedging.trim().toLocaleLowerCase();
  const summary = summarizeClaimEvidence(input.docs);
  const disclosure = disclosureFor(stamp);
  const estimate = estimateForClaim(input.hedging, summary);

  return {
    conformant: !disclosure.withheld,
    headline: disclosure.withheld ? HEADLINE_WITHHELD : HEADLINE_CONFORMANT,
    claimText: input.text,
    classification: CLASSIFICATION[hedging] ?? CLASSIFICATION.unknown,
    // Ruling 19's label verbatim and imported, never re-typed here, and carried
    // as its own field rather than prefixed onto the claim text: the publication
    // guard has already prefixed the claims it governs, so prefixing again would
    // double-label. The guard's own logic is untouched.
    attribution: DISPUTED_HEDGING.has(hedging)
      ? (ATTRIBUTION_LABEL[hedging] ?? ATTRIBUTION_LABEL.unknown)
      : null,
    estimative: {
      likelihood: likelihoodLabel(estimate),
      confidence: confidenceLabel(estimate),
      basis: estimateDerivation(input.hedging, estimate),
    },
    corroboration: [
      plural(summary.documents, "document", "documents"),
      plural(summary.channels, "channel", "channels"),
      plural(summary.platforms, "platform", "platforms"),
    ].join(" · "),
    asOf,
    canonicalUrl: url,
    publisher: `BNOW.NET, ${input.countryName} Daily Digest, claim c${input.claimId}`,
    sources: input.docs.map((doc, index) => sourceEntry(doc, index, input.countryIso2)),
    disclosure,
  };
}

function sourcePlainLines(entry: Ics206SourceEntry): string[] {
  const head = entry.title ? `${entry.author}. "${entry.title}".` : `${entry.author}.`;
  const lines = [
    `[${entry.index}] ${head} ${entry.mediaType}; ${entry.informationType}.`,
    `    Descriptor: ${entry.descriptor}.`,
    `    Published: ${entry.published ?? "not recorded"} · Accessed (BNOW ingest): ${entry.accessed ?? "not recorded"}`,
  ];
  if (entry.url) lines.push(`    ${entry.url}`);
  return lines;
}

export function serializeIcs206Plain(citation: Ics206Citation): string {
  const lines = [
    citation.headline,
    "",
    `Claim: ${citation.claimText}`,
    `Classification: ${citation.classification}${
      citation.attribution ? ` — BNOW attribution: "${citation.attribution}"` : ""
    }`,
    `${LIKELIHOOD_FIELD}: ${citation.estimative.likelihood}`,
    `${CONFIDENCE_FIELD}: ${citation.estimative.confidence}`,
    `${ESTIMATIVE_BASIS_FIELD}: ${citation.estimative.basis}`,
    `Corroboration: ${citation.corroboration}`,
    `Retrieved as of: ${citation.asOf}`,
    `Publisher: ${citation.publisher}`,
    `Canonical: ${citation.canonicalUrl}`,
    "",
    "Sources",
    ...citation.sources.flatMap(sourcePlainLines),
    "",
    "Tool disclosure",
  ];
  if (citation.disclosure.withheld) lines.push(ICS206_WITHHELD_MARKER);
  else {
    lines.push(`Extraction: ${citation.disclosure.extraction}`);
    lines.push(`Synthesis: ${citation.disclosure.synthesis}`);
  }
  return lines.join("\n");
}

function sourceHtmlEntry(entry: Ics206SourceEntry): string {
  const e = escapeClaimCopyHtml;
  const head = entry.title ? `${e(entry.author)}. &quot;${e(entry.title)}&quot;.` : `${e(entry.author)}.`;
  const parts = [
    `${head} ${e(entry.mediaType)}; ${e(entry.informationType)}.`,
    `<br><strong>Descriptor:</strong> ${e(entry.descriptor)}.`,
    `<br><strong>Published:</strong> ${e(entry.published ?? "not recorded")} · <strong>Accessed (BNOW ingest):</strong> ${e(entry.accessed ?? "not recorded")}`,
  ];
  if (entry.url) parts.push(`<br><a href="${e(entry.url)}">${e(entry.url)}</a>`);
  return `<li>${parts.join("")}</li>`;
}

export function serializeIcs206Html(citation: Ics206Citation): string {
  const e = escapeClaimCopyHtml;
  const disclosure = citation.disclosure.withheld
    ? `<p>${e(ICS206_WITHHELD_MARKER)}</p>`
    : `<p><strong>Extraction:</strong> ${e(citation.disclosure.extraction)}<br>` +
      `<strong>Synthesis:</strong> ${e(citation.disclosure.synthesis)}</p>`;
  return [
    `<p><strong>${e(citation.headline)}</strong></p>`,
    `<p><strong>Claim:</strong> ${e(citation.claimText)}<br>`,
    `<strong>Classification:</strong> ${e(citation.classification)}${
      citation.attribution ? ` — BNOW attribution: &quot;${e(citation.attribution)}&quot;` : ""
    }<br>`,
    `<strong>${e(LIKELIHOOD_FIELD)}:</strong> ${e(citation.estimative.likelihood)}<br>`,
    `<strong>${e(CONFIDENCE_FIELD)}:</strong> ${e(citation.estimative.confidence)}<br>`,
    `<strong>${e(ESTIMATIVE_BASIS_FIELD)}:</strong> ${e(citation.estimative.basis)}<br>`,
    `<strong>Corroboration:</strong> ${e(citation.corroboration)}<br>`,
    `<strong>Retrieved as of:</strong> ${e(citation.asOf)}<br>`,
    `<strong>Publisher:</strong> ${e(citation.publisher)}<br>`,
    `<a href="${e(citation.canonicalUrl)}">${e(citation.canonicalUrl)}</a></p>`,
    `<p><strong>Sources</strong></p><ol>${citation.sources.map(sourceHtmlEntry).join("")}</ol>`,
    `<p><strong>Tool disclosure</strong></p>`,
    disclosure,
  ].join("");
}
