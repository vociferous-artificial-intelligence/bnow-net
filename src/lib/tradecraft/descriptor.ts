// Templated source descriptors — ICD 206 mechanism 2 and the ICS 206-01 "brief
// narrative quality descriptor per source", generated deterministically from
// registry and citation data and labeled as generated (WS-7.3).
//
// This module creates NO new analytic judgment. Every sentence it emits restates a
// count, a date span, a platform, a status or a share that `scripts/registry-materialize.ts`
// already computed from ISW's own citation and hedging behaviour. It is a renderer,
// not an assessor.
//
// Three constraints are structural, not stylistic:
//
//   1. NO SCORE, BY CONSTRUCTION. `DescriptorSource` and `DescriptorStats` have no
//      reliability field, so no code path can leak the reliability number through a
//      descriptor — on the registry pages that number stays behind
//      `registryView().showReliability`, and on claim surfaces behind `showScores`.
//      Withholding it here is stronger than gating it here: there is nothing to gate.
//      For the same reason no hedging WEIGHT constant appears anywhere in this file
//      (the moat field, `src/lib/registry/view-policy.ts`); the profile reports the
//      observed distribution, never the weights that turn it into a score.
//
//   2. RULING 16 IS QUOTED, NOT PARAPHRASED AWAY. `unknown` is an unhedged ISW
//      declarative held at mid-trust by design, and the descriptor says so wherever it
//      reports that class. Rendering it as "unknown reliability" would invert the
//      meaning of the largest class in most profiles.
//
//   3. PLATFORM ROOTS FAIL CLOSED (OPEN-TASKS #56). A pooled root — `facebook.com`
//      pools 26,195 citations across 7,081 distinct raw URLs — is not a publisher, so
//      its hedging distribution is not a source assessment. A root gets the caveat and
//      NO profile.
//
//      CORRECTION to PLAN-WS-7 §4's fallback, on evidence. The plan proposed treating any
//      "canonical_url with no path segment" as a root. `canonicalSource()`
//      (`src/lib/isw/urls.ts:85-122`) makes that rule vacuous in the wrong direction: it
//      special-cases ONLY t.me and x.com into per-identity keys and returns the BARE HOST
//      as the key for every other source, so `pravda.com.ua` and `facebook.com` have the
//      identical shape. Applying the path rule would suppress the profile of essentially
//      the whole registry while catching nothing #56 has not already segmented. Detection
//      is therefore: a known multi-tenant host cited AT its root, a per-identity platform
//      (telegram / x) carrying no channel or account segment, or an unparseable identity.
//      Residual risk, recorded rather than hidden: an unlisted multi-tenant host would get
//      a profile. Only #56's segmentation migration closes that; a URL heuristic cannot,
//      which is why #56 exists.
//
// Content strings are English-first and are not routed through i18n — the house rule
// for generated content (`src/lib/conflicts/product-copy.ts`, `legal-document.tsx:8`):
// UI chrome is translated, product content is not.
//
// Purity: no database, no provider, no environment read, no clock. Pinned by
// `descriptor-import-hygiene.test.ts`.

/** Bumped whenever any emitted sentence changes. Rendered beside the descriptor. */
export const DESCRIPTOR_VERSION = "descriptor-v1";

/** The generated-not-judged label, rendered wherever a descriptor is. */
export const DESCRIPTOR_LABEL =
  "Generated from citation data, descriptor template v1 — not an analyst judgment.";

/** The five ISW hedging classes, in the registry's display order. */
export const HEDGING_CLASSES = [
  "confirmed",
  "assessed",
  "unknown",
  "claimed",
  "unverified",
] as const;

export type HedgingClass = (typeof HEDGING_CLASSES)[number];

export type HedgingCounts = Readonly<Record<HedgingClass, number>>;

/**
 * Registry identity of one source. Deliberately a narrow projection of the `sources`
 * row (`src/db/schema.ts:74-103`): the caller may pass a wider row, but only these
 * fields are read, which is what the sentinel test asserts.
 */
export interface DescriptorSource {
  canonicalUrl: string;
  domain: string | null;
  /** `platform` enum value (`schema.ts:29-36`); unknown values degrade to a generic phrase. */
  platform: string | null;
  /** `source_status` enum value (`schema.ts:46-50`). */
  status: string | null;
  decayed: boolean;
}

/**
 * A citation profile in ONE reference corpus, or the global aggregate. Shape is the
 * intersection of `sources` and `source_theater_stats` (`schema.ts:109-131`, which per
 * C7 carries no platform/name/status — those come from `DescriptorSource`).
 */
export interface DescriptorStats {
  citationCount: number;
  firstCitedReportDate: string | null;
  lastCitedReportDate: string | null;
  hedging: HedgingCounts;
}

/** Which corpus the stats describe. `global` aggregates across every theater. */
export type DescriptorScope = { kind: "global" } | { kind: "theater"; theater: string };

export interface DescriptorHedgingShare {
  hedging: HedgingClass;
  count: number;
  /** integer percent of the profile total; shares are largest-remainder adjusted to sum to 100 */
  percent: number;
}

export interface SourceDescriptor {
  version: typeof DESCRIPTOR_VERSION;
  /** true when the source is a pooled platform root (#56): no profile is emitted */
  platformRoot: boolean;
  /** empty when there is no citation history, or when the source is a platform root */
  shares: readonly DescriptorHedgingShare[];
  /** ordered sentences; `text` is these joined by a single space */
  sentences: readonly string[];
  text: string;
  label: typeof DESCRIPTOR_LABEL;
}

/**
 * Reference-corpus names, as ISW publishes them. Proper nouns — never translated.
 * A theater with no daily reference corpus (the Gulf lens; `validation/run.ts:45-57`
 * returns null for it) never reaches here: those sources fall back to the global scope.
 */
const CORPUS_LABEL: Readonly<Record<string, string>> = {
  ru: "the ISW Russian Offensive Campaign Assessment",
  ir: "the ISW/CTP Iran Update",
};

/** Platform enum → reader-facing phrase. An unrecognized value degrades, never throws. */
const PLATFORM_LABEL: Readonly<Record<string, string>> = {
  telegram: "a Telegram channel",
  x: "an X account",
  state_media: "a state-media outlet",
  independent_media: "an independent media outlet",
  gov: "a government source",
  other: "a source of unclassified type",
};

/**
 * Known pooled platform roots (#56). `t.me` and `x.com` are already segmented into
 * per-channel and per-account identities and hold zero root rows today
 * (`docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md:63-66`), but they stay on this list
 * so a future re-pooled root cannot acquire a profile by regression. The list is a
 * SUPPLEMENT to the structural test below, never a replacement for it.
 */
export const KNOWN_PLATFORM_ROOTS: readonly string[] = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "t.me",
  "telegram.me",
  "x.com",
  "twitter.com",
  "youtube.com",
  "vk.com",
  "ok.ru",
  "tiktok.com",
];

const PLATFORM_ROOT_CAVEAT =
  "Platform root — not a single publisher. This identity pools the citations of many " +
  "distinct pages, so no per-source profile is reported for it (OPEN-TASKS #56).";

const NON_INDEPENDENCE_CAVEAT =
  "This profile describes how ISW cited and hedged this source, not an independent audit " +
  "of it; BNOW performs no separate verification of the source itself.";

const RULING_16_NOTE =
  "“unknown” is an unhedged ISW declarative — a statement ISW carried without a hedging " +
  "cue — and is held at mid-trust by design, not a missing classification.";

/** Cue vocabulary, per hedging class. One clause each, no weights. */
const CUE_PHRASE: Readonly<Record<HedgingClass, string>> = {
  confirmed: "confirmed (ISW attached geolocation or independent confirmation)",
  assessed: "assessed (ISW carried it as its own analytic judgment)",
  unknown: "unknown (an unhedged ISW declarative)",
  claimed: "claimed (ISW attributed it to the source without confirming it)",
  unverified: "unverified (ISW carried it and marked it unconfirmed)",
};

const STATUS_SENTENCE: Readonly<Record<string, string>> = {
  active: "The registry carries it as active.",
  decayed:
    "The registry carries it as decayed — ISW has not cited it recently enough for the " +
    "current profile to be treated as live.",
  dead: "The registry carries it as dead — it is no longer reachable or no longer publishes.",
};

export const ZERO_CITATION_SENTENCE = "No ISW citation history in this reference corpus.";

/**
 * The reference corpus a country's evidence is cited against, as a descriptor scope.
 * MIRRORS `referenceFor()` (`src/lib/validation/run.ts:45-57`), which is the authoritative
 * country→corpus map: ru and ua both validate against ROCA, ir against the Iran Update, and
 * the Gulf lenses have no daily reference corpus at all. A Gulf source therefore falls back
 * to the GLOBAL aggregate rather than rendering an empty per-theater profile — the honest
 * reading, since `source_theater_stats` holds no row for it. Parity with `referenceFor` is
 * pinned by a test; the mirror exists so a page need not import the validation runner (which
 * pulls a database pool and the fetch cache).
 */
export function descriptorScopeForCountry(countryIso2: string): DescriptorScope {
  const iso2 = countryIso2.trim().toLocaleLowerCase();
  if (iso2 === "ru" || iso2 === "ua") return { kind: "theater", theater: "ru" };
  if (iso2 === "ir") return { kind: "theater", theater: "ir" };
  return { kind: "global" };
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLocaleLowerCase();
}

/** Platforms whose registry identity is a per-account path, so a bare host is pooled. */
const PER_IDENTITY_PLATFORMS = new Set(["telegram", "x"]);

/**
 * Fail-closed platform-root test (see constraint 3 in the header for why this is not the
 * bare "no path segment" rule). A false positive costs one suppressed profile; a false
 * negative would publish a pooled multi-publisher distribution as a source assessment, so
 * every uncertain case resolves toward the caveat.
 */
export function isPlatformRoot(
  source: Pick<DescriptorSource, "canonicalUrl" | "domain" | "platform">,
): boolean {
  const identity = normalizeIdentity(source.canonicalUrl);
  if (!identity) return true; // no usable identity at all
  const host = identity.split(/[/?#]/, 1)[0];
  const pathless = !identity.slice(host.length).replace(/^[/?#]/, "");

  // a known multi-tenant host, cited AT its root (a segmented page below it is a publisher)
  if (KNOWN_PLATFORM_ROOTS.includes(host)) return pathless;
  const domain = normalizeIdentity(source.domain);
  if (domain && KNOWN_PLATFORM_ROOTS.includes(domain) && identity === domain) return true;

  // a Telegram channel or an X account with no channel/account segment is pooled by
  // definition, whatever host it was recorded under
  const platform = (source.platform ?? "").trim().toLocaleLowerCase();
  if (PER_IDENTITY_PLATFORMS.has(platform)) return pathless;

  return false;
}

function totalCitations(hedging: HedgingCounts): number {
  return HEDGING_CLASSES.reduce((sum, klass) => sum + Math.max(0, hedging[klass] ?? 0), 0);
}

/**
 * Integer percentages that sum to exactly 100 (largest-remainder). A profile whose
 * shares visibly sum to 99 reads as an arithmetic defect to the buyer this is written
 * for, so the rounding is fixed here rather than at each render site.
 */
export function hedgingShares(hedging: HedgingCounts): DescriptorHedgingShare[] {
  const counts = HEDGING_CLASSES.map((hedgingClass) => ({
    hedging: hedgingClass,
    count: Math.max(0, hedging[hedgingClass] ?? 0),
  }));
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return counts.map((row) => ({ ...row, percent: 0 }));

  const exact = counts.map((row) => ({ ...row, raw: (row.count / total) * 100 }));
  const floored = exact.map((row) => ({ ...row, percent: Math.floor(row.raw) }));
  let remainder = 100 - floored.reduce((sum, row) => sum + row.percent, 0);
  const order = [...floored.keys()].sort(
    (a, b) =>
      (exact[b].raw - floored[b].percent) - (exact[a].raw - floored[a].percent) ||
      exact[b].count - exact[a].count ||
      a - b,
  );
  for (const index of order) {
    if (remainder <= 0) break;
    floored[index].percent += 1;
    remainder -= 1;
  }
  return floored.map(({ hedging: hedgingClass, count, percent }) => ({
    hedging: hedgingClass,
    count,
    percent,
  }));
}

function corpusPhrase(scope: DescriptorScope): string {
  if (scope.kind === "global") return "ISW reporting";
  return CORPUS_LABEL[scope.theater] ?? `the ISW reference corpus for ${scope.theater}`;
}

function platformPhrase(platform: string | null): string {
  const key = (platform ?? "").trim().toLocaleLowerCase();
  return PLATFORM_LABEL[key] ?? PLATFORM_LABEL.other;
}

function statusSentence(source: DescriptorSource): string {
  const key = (source.status ?? "").trim().toLocaleLowerCase();
  const sentence = STATUS_SENTENCE[key];
  if (sentence) return sentence;
  // `decayed` is a separate boolean on both tables; honour it when status is unusable
  return source.decayed ? STATUS_SENTENCE.decayed : STATUS_SENTENCE.active;
}

function dateOnly(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  return match ? match[0] : null;
}

function citationSentence(scope: DescriptorScope, stats: DescriptorStats): string {
  const total = totalCitations(stats.hedging);
  // The profile total is the denominator every share is taken over; when it disagrees
  // with citation_count (a stale materialization) the honest reading is the smaller,
  // fully-classified figure — so the sentence reports the profile total it actually used.
  const count = Math.min(Math.max(0, stats.citationCount), total || Math.max(0, stats.citationCount));
  const first = dateOnly(stats.firstCitedReportDate);
  const last = dateOnly(stats.lastCitedReportDate);
  const cited = `Cited in ${corpusPhrase(scope)} ${count.toLocaleString("en-US")} ${
    count === 1 ? "time" : "times"
  }`;
  if (first && last && first !== last) return `${cited} between ${first} and ${last}.`;
  if (first || last) return `${cited} on ${first ?? last}.`;
  return `${cited}; no citation date span is recorded.`;
}

function profileSentence(shares: readonly DescriptorHedgingShare[]): string {
  const rendered = shares
    .filter((share) => share.count > 0)
    .map((share) => `${share.percent}% ${CUE_PHRASE[share.hedging]}`)
    .join(", ");
  return `ISW hedged those citations ${rendered}.`;
}

/**
 * Build the descriptor. Total function: every input shape — zero citations, a pooled
 * root, an unknown platform, a missing date span — has a defined, non-empty rendering.
 */
export function describeSource(
  source: DescriptorSource,
  stats: DescriptorStats,
  scope: DescriptorScope,
): SourceDescriptor {
  const sentences: string[] = [];
  const platformRoot = isPlatformRoot(source);
  const total = totalCitations(stats.hedging);
  const cited = Math.max(0, stats.citationCount) > 0 || total > 0;

  sentences.push(`${source.canonicalUrl} is ${platformPhrase(source.platform)}.`);

  if (platformRoot) {
    sentences.push(PLATFORM_ROOT_CAVEAT);
    sentences.push(statusSentence(source));
    const text = sentences.join(" ");
    return {
      version: DESCRIPTOR_VERSION,
      platformRoot: true,
      shares: [],
      sentences,
      text,
      label: DESCRIPTOR_LABEL,
    };
  }

  if (!cited) {
    sentences.push(ZERO_CITATION_SENTENCE);
    sentences.push(statusSentence(source));
    const text = sentences.join(" ");
    return {
      version: DESCRIPTOR_VERSION,
      platformRoot: false,
      shares: [],
      sentences,
      text,
      label: DESCRIPTOR_LABEL,
    };
  }

  const shares = hedgingShares(stats.hedging);
  sentences.push(citationSentence(scope, stats));
  if (total > 0) {
    sentences.push(profileSentence(shares));
    if ((stats.hedging.unknown ?? 0) > 0) sentences.push(RULING_16_NOTE);
  } else {
    // citation_count > 0 with no classified citations: report the gap, never 0%-everything
    sentences.push("No hedging classification is recorded for those citations.");
  }
  sentences.push(statusSentence(source));
  sentences.push(NON_INDEPENDENCE_CAVEAT);

  const text = sentences.join(" ");
  return {
    version: DESCRIPTOR_VERSION,
    platformRoot: false,
    shares: total > 0 ? shares : [],
    sentences,
    text,
    label: DESCRIPTOR_LABEL,
  };
}
