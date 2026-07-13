import type { DigestAnalysis } from "./provider";

// Deterministic post-synthesis publication guard (Workstream B, 2026-07-13).
//
// The synthesis prompt asks the model to preserve attribution and hedging, but a
// prompt is a request, not a guarantee — this module is the enforcement. It runs
// inside persistDigest on the exact event shape being published, BEFORE the
// thin-overwrite verdict, so it covers BOTH engines (mapreduce, legacy) and any
// script that persists through the shared path. It never invents content: every
// transformation is a prefix from a fixed label set, a summary replaced by a
// cited claim's own text, or a drop.
//
// Production defect this pins (2026-07-13 analyst-session test): a Russia digest
// published "US Senator Lindsey Graham died unexpectedly, with reports suggesting
// his involvement in corruption schemes may have influenced the circumstances of
// his death" as declarative BNOW copy from ~0.47-confidence `claimed` groups
// sourced partly from Russian state media — then the scoreboard amplified it as
// "ours only (potential lead)".
//
// Explicit calibration (each rule unit-tested in publication-guard.test.ts):
//  R1 DROP    a disputed reputational allegation about a named person citing
//             fewer than ALLEGATION_MIN_DOCS documents is dropped, not polished.
//  R2 CLAIM   a disputed named-person allegation claim must carry attribution in
//             its own text (prefixed with the hedging's label if absent).
//  R3 EVENT   an event containing any disputed named-person allegation gets
//             deterministic copy: attributed title + summary REPLACED by the
//             representative claim text (freeform model prose — where speculative
//             causation lives — never survives on these events).
//  R4 EVENT   an event supported ONLY by disputed groups must not carry an
//             unqualified declarative title/summary: attributed model prose
//             passes untouched; unattributed prose gets the label treatment.
//  R5 WASH    R2/R3 apply per claim and per event independently, so one
//             confirmed subclaim never launders an unrelated disputed allegation.
//  R6 SAFE    confirmed/assessed-only events pass byte-identical; mixed events
//             without allegations keep their prose (per-claim hedging badges
//             carry the qualification in the UI).

type GuardEvent = DigestAnalysis["events"][number];
type GuardClaim = GuardEvent["claims"][number];

/** Hedging classes that mean "someone asserts this; BNOW has not confirmed it". */
export const DISPUTED_HEDGING: ReadonlySet<string> = new Set([
  "claimed",
  "unverified",
  "unknown",
]);

/** Fixed attribution labels — the only words this guard ever adds. */
export const ATTRIBUTION_LABEL: Record<string, string> = {
  claimed: "Sources claim:",
  unverified: "Unverified reporting:",
  unknown: "Unverified reporting:",
};

/** R1 threshold: a disputed reputational person-allegation needs at least this
 *  many cited documents to publish at all (attributed). */
export const ALLEGATION_MIN_DOCS = 2;

// Broad allegation lexicon: reputational-harm subjects around a named person
// (death, criminality, corruption, prosecution, sanctions, removal, health).
// Used for R2/R3 attribution.
const ALLEGATION_RE = new RegExp(
  [
    "\\bdie(?:d|s)\\b",
    "\\bdeaths?\\b",
    "\\bdead\\b",
    "\\bkilled\\b",
    "\\bsuicide\\b",
    "\\bassassinat\\w*",
    "\\bcorrupt\\w*",
    "\\bbriber\\w*",
    "\\bembezzl\\w*",
    "\\bfraud\\w*",
    "\\blaunder\\w*",
    "\\bcriminal\\w*",
    "\\barrest\\w*",
    "\\bdetain\\w*",
    "\\bprosecut\\w*",
    "\\bindict\\w*",
    "\\bcharged\\b",
    "\\bconvict\\w*",
    "\\bsentenced\\b",
    "\\btreason\\w*",
    "\\bespionage\\b",
    "\\bsanction\\w*",
    "\\bpurged?\\b",
    "\\bdismiss\\w*",
    "\\bfired\\b",
    "\\bousted\\b",
    "\\bhospitaliz\\w*",
    "\\bgravely ill\\b",
    "\\bcoma\\b",
    "\\boverdose\\b",
    "\\bpoison\\w*",
  ].join("|"),
  "i",
);

// Narrow reputational core for R1 (drop): defamation-grade subjects only.
// Deliberately EXCLUDES battlefield death vocabulary ("killed", "death") — a
// single-source report that a commander was killed is real signal that R2
// attribution handles; a single-source corruption/criminality/health story
// about a named person is not worth the harm of being wrong.
const REPUTATIONAL_RE =
  /\b(corrupt|briber|embezzl|fraud|launder|crimin|prosecut|indict|convict|treason|espionage|blackmail|suicide|overdose|poison|gravely ill|hospitaliz|coma)\w*/i;

// A text already carrying an attribution/hedging qualifier is never re-prefixed
// (idempotency + "a corroborated but attributed official claim remains attributed").
const ATTRIBUTED_RE =
  /\b(claims?|claimed|says?|said|stated?|announced?|reports?|reported(?:ly)?|according to|alleged(?:ly)?|denies|denied|asserts?|asserted|purported(?:ly)?|suggests?|suggested|unverified|unconfirmed)\b|^sources?\b/i;

export function hasAttribution(text: string): boolean {
  return ATTRIBUTED_RE.test(text);
}

/** Named-person allegation (broad lexicon) — requires a person entity derived
 *  from the claim's own groups (mapreduce) or provided by the extraction
 *  (legacy); a claim with no person entity is never treated as an allegation. */
export function isPersonAllegation(text: string, entities?: Array<{ kind: string }>): boolean {
  if (!entities?.some((e) => e.kind === "person")) return false;
  return ALLEGATION_RE.test(text);
}

function isReputational(text: string): boolean {
  return REPUTATIONAL_RE.test(text);
}

function isDisputed(hedging: string): boolean {
  return DISPUTED_HEDGING.has(hedging);
}

function labelFor(hedging: string): string {
  return ATTRIBUTION_LABEL[hedging] ?? ATTRIBUTION_LABEL.unknown;
}

/** The label for event-level treatment: strongest disputed hedging present. */
function eventLabel(claims: GuardClaim[]): string {
  return claims.some((c) => c.hedging === "claimed")
    ? ATTRIBUTION_LABEL.claimed
    : ATTRIBUTION_LABEL.unknown;
}

export interface PublicationGuardStats {
  attributedClaims: number;
  droppedClaims: number;
  droppedEvents: number;
  retitledEvents: number;
  replacedSummaries: number;
}

export interface GuardResult {
  events: GuardEvent[];
  stats: PublicationGuardStats;
}

/**
 * Apply the publication-safety rules to the events about to be persisted.
 * Pure and idempotent: running the guard on its own output is a no-op.
 */
export function guardPublishedEvents(events: GuardEvent[]): GuardResult {
  const stats: PublicationGuardStats = {
    attributedClaims: 0,
    droppedClaims: 0,
    droppedEvents: 0,
    retitledEvents: 0,
    replacedSummaries: 0,
  };
  const out: GuardEvent[] = [];

  for (const ev of events) {
    const claims: GuardClaim[] = [];
    let hasDisputedAllegation = false;

    for (const c of ev.claims) {
      const disputed = isDisputed(c.hedging);
      const allegation = disputed && isPersonAllegation(c.text, c.entities);

      // R1: drop weakly-corroborated reputational allegations outright.
      if (allegation && isReputational(c.text) && c.docIds.length < ALLEGATION_MIN_DOCS) {
        stats.droppedClaims++;
        continue;
      }

      let text = c.text;
      if (allegation) {
        hasDisputedAllegation = true;
        // R2: the allegation claim itself must carry attribution.
        if (!hasAttribution(text)) {
          text = `${labelFor(c.hedging)} ${text}`;
          stats.attributedClaims++;
        }
      }
      claims.push(text === c.text ? c : { ...c, text });
    }

    if (claims.length === 0) {
      stats.droppedEvents++;
      continue;
    }

    const everyDisputed = claims.every((c) => isDisputed(c.hedging));
    let title = ev.title;
    let summary = ev.summary;

    if (hasDisputedAllegation) {
      // R3: deterministic copy — freeform model prose never survives on an
      // event carrying a disputed named-person allegation. The summary becomes
      // the representative (longest) published claim's own text; the title is
      // attributed if it wasn't already.
      const label = eventLabel(claims);
      if (!hasAttribution(title)) {
        title = `${label} ${title}`;
        stats.retitledEvents++;
      }
      const rep = claims.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      const replacement = hasAttribution(rep.text) ? rep.text : `${label} ${rep.text}`;
      if (summary !== replacement) {
        summary = replacement;
        stats.replacedSummaries++;
      }
    } else if (everyDisputed) {
      // R4: wholly-disputed events must not read as unqualified declaratives.
      // Attributed model prose passes; unattributed prose gets the label.
      const label = eventLabel(claims);
      if (!hasAttribution(title)) {
        title = `${label} ${title}`;
        stats.retitledEvents++;
      }
      if (!hasAttribution(summary)) {
        const rep = claims.reduce((a, b) => (b.text.length > a.text.length ? b : a));
        summary = hasAttribution(rep.text) ? rep.text : `${label} ${rep.text}`;
        stats.replacedSummaries++;
      }
    }
    // R6: mixed non-allegation and confirmed/assessed events pass untouched.

    out.push(
      title === ev.title && summary === ev.summary && claims.every((c, i) => c === ev.claims[i]) && claims.length === ev.claims.length
        ? ev
        : { ...ev, title, summary, claims },
    );
  }

  return { events: out, stats };
}
