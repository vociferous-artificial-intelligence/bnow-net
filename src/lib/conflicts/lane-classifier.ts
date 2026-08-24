// Deterministic per-conflict lane/scope classifier (Phase 3; contract §5
// predicates 3-5, register #6).
//
// Pure keyword/actor/geography classification of one candidate claim's TEXT +
// TRACK against one conflict's frozen taxonomy. Versioned
// (`ru-ua-classifier-v1` / `iran-classifier-v1`); every lane a rule can emit is
// validated against the conflict's lane taxonomy at module load AND again by
// the eligibility engine through laneById (Gate-1 carried condition: all lane
// assignment routes through the fail-closed helpers).
//
// LANE PRECEDENCE (deterministic ladder; the geography-over-actor rung is the
// FROZEN register #6 rule, the rest is this classifier's versioned policy):
//   1. event GEOGRAPHY lane (a laned gazetteer class hit);
//   2. specialty TRACK lane (iran_regional: nuclear → nuclear_diplomacy,
//      elite_politics → domestic_security);
//   3. top-priority strong ACTOR lane;
//   4. topic KEYWORD lane (ordered rule list, first match wins);
//   5. frontline-toponym fallback (ru-ua: a frontline-class toponym with no
//      other lane signal reads as front-line maneuver);
//   6. `other_in_scope` — REQUIRES an actor or geography hit plus a generic
//      security signal (contract §5: other_in_scope needs an actor/geography
//      hit; topic-less region mentions never reach it).
// If no rung yields a lane: `off_scope` when the text shows region/actor
// membership without conflict relevance (the test-mandated "unrelated
// Israeli domestic politics / generic Gulf business news / unrelated EU news"
// exclusions), else `unclassified` — an EXPLICIT outcome, never a silent drop.
//
// SAME ACTOR/PLACE, WRONG EVENT — the classifier boundary (Gate-3 required
// case): this classifier decides SCOPE and LANE only. Two distinct events by
// the same actor at the same place on the same day classify identically and
// BOTH enter the candidate union; deciding whether a claim describes the SAME
// event as a reference unit is the Phase 4 matcher's job (contract §6.3), and
// no structure produced here claims otherwise (assemblies carry no unit
// verdicts at all).
//
// GEO REASON LABELS: the emitted `geo:<tag>` is the top gazetteer class hit.
// The ru-ua frontline class is dual-labeled by design: it reads
// `geo:ua-frontline` when the final lane is frontline_maneuver and downgrades
// to the generic `geo:ua` otherwise (a strike ON a frontline town is an
// in-country strike, not a maneuver-geography statement) — pinned by the
// fixture corpus (same town, different event classes).

import type { Track } from "../analysis/tracks";
import { matchActors } from "./actor-rosters";
import { CONFLICT_REGISTRY } from "./definitions";
import { deepFreeze } from "./freeze";
import { laneById, type ConflictLaneId } from "./lanes";
import type { ConflictId } from "./vocabulary";

export const LANE_CLASSIFIER_VERSIONS: Readonly<Record<ConflictId, string>> = deepFreeze({
  russia_ukraine: "ru-ua-classifier-v1",
  iran_regional: "iran-classifier-v1",
});

// ---------------------------------------------------------------------------
// Gazetteer (event geography; class order = priority)
// ---------------------------------------------------------------------------

interface GeoClass {
  /** emitted as `geo:<tag>` (frontline class: see downgradeTag) */
  tag: string;
  /** lane this geography implies when it governs; null = scope-only */
  lane: ConflictLaneId | null;
  patterns: readonly RegExp[];
  /** ru-ua frontline dual label: tag applies only when the final lane is
   *  frontline_maneuver; otherwise the downgrade tag is emitted */
  frontline?: boolean;
  downgradeTag?: string;
}

function geoClass(conflictId: ConflictId, g: GeoClass): GeoClass {
  if (g.lane !== null) laneById(CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion, g.lane);
  return g;
}

const RU_UA_GEO: readonly GeoClass[] = [
  geoClass("russia_ukraine", {
    tag: "occupied-crimea",
    lane: "occupied_crossborder",
    patterns: [/\bcrimea\b/i, /yevpatoriia/i, /sevastopol/i],
  }),
  geoClass("russia_ukraine", {
    tag: "cross-border",
    lane: "occupied_crossborder",
    patterns: [/\bborder\b/i, /sabotage group/i, /\bkursk\b/i, /\bbelgorod\b/i],
  }),
  geoClass("russia_ukraine", {
    tag: "occupied-zaporizhia",
    lane: null,
    patterns: [/\btokmak\b/i],
  }),
  geoClass("russia_ukraine", {
    tag: "ua-frontline",
    lane: null,
    frontline: true,
    downgradeTag: "ua",
    patterns: [
      /kupiansk|siversk|novopavlivka|robotyne|\bborova\b|\blyman\b|velyka novosilka/i,
      /kostiantynivka|\boskil\b|avdiivka|bakhmut|pokrovsk|\bvovcha\b/i,
    ],
  }),
  geoClass("russia_ukraine", {
    tag: "ua",
    lane: null,
    patterns: [/kharkiv|\bsumy\b|\bodesa\b|\bizmail\b|\bkyiv\b|zaporizh/i],
  }),
  geoClass("russia_ukraine", {
    tag: "russia",
    lane: null,
    patterns: [/volgograd|\bmoscow\b|\brostov\b|\bbryansk\b/i],
  }),
];

const IRAN_GEO: readonly GeoClass[] = [
  geoClass("iran_regional", {
    tag: "hormuz",
    lane: "maritime",
    patterns: [/hormuz/i],
  }),
  geoClass("iran_regional", {
    tag: "red-sea",
    lane: "maritime",
    patterns: [/red sea/i, /hudaydah/i],
  }),
  geoClass("iran_regional", {
    tag: "iran",
    lane: null,
    patterns: [/kermanshah|bandar abbas|\btehran\b|\btabriz\b|isfahan|\bqom\b/i],
  }),
];

const GEO_CLASSES: Readonly<Record<ConflictId, readonly GeoClass[]>> = deepFreeze({
  russia_ukraine: RU_UA_GEO,
  iran_regional: IRAN_GEO,
});

// ---------------------------------------------------------------------------
// Topic keyword rules (ordered; first match wins) + track lanes + scope tokens
// ---------------------------------------------------------------------------

interface KeywordRule {
  lane: ConflictLaneId;
  pattern: RegExp;
}

function keywordRule(conflictId: ConflictId, lane: ConflictLaneId, pattern: RegExp): KeywordRule {
  laneById(CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion, lane);
  return { lane, pattern };
}

const RU_UA_KEYWORDS: readonly KeywordRule[] = [
  keywordRule(
    "russia_ukraine",
    "force_generation",
    /factor|production|enlistment|mobiliz|recruit|military industry|bonus/i,
  ),
  // "strike" alone is ambiguous (labor strikes are the classic false hit);
  // only military-strike collocations count
  keywordRule(
    "russia_ukraine",
    "strikes_air_defense",
    /drone strike|air strike|glide bomb|shell(ing|ed)|\bstruck\b|missile|attack drone|intercept|air[ -]defen[cs]e|\bstrikes? (on|against|series)\b/i,
  ),
  keywordRule(
    "russia_ukraine",
    "frontline_maneuver",
    /assault|advanc|repell|\brepel\b|regain|counterattack/i,
  ),
];

const IRAN_KEYWORDS: readonly KeywordRule[] = [
  keywordRule(
    "iran_regional",
    "domestic_security",
    /security services|detain|succession|internal security|\barrest/i,
  ),
  keywordRule(
    "iran_regional",
    "maritime",
    /interceptor|anti-ship|\bnaval\b|\btanker\b|shipping|\bvessel\b|maritime/i,
  ),
  keywordRule(
    "iran_regional",
    "direct_kinetic",
    /drone strike|air strike|\bstruck\b|missile|drone attack|intercepted|air[ -]defen[cs]e|\bstrikes? (on|against|series)\b/i,
  ),
];

const KEYWORD_RULES: Readonly<Record<ConflictId, readonly KeywordRule[]>> = deepFreeze({
  russia_ukraine: RU_UA_KEYWORDS,
  iran_regional: IRAN_KEYWORDS,
});

/** Specialty-track default lanes (iran_regional multi-track contributor set).
 *  ru-ua designates only the military track, so it has no entries. */
const TRACK_LANES: Readonly<Record<ConflictId, Partial<Record<Track, ConflictLaneId>>>> =
  deepFreeze({
    russia_ukraine: {},
    iran_regional: {
      nuclear: "nuclear_diplomacy",
      elite_politics: "domestic_security",
    },
  });

// fail-closed validation of every track-lane mapping at module load
for (const [conflictId, lanes] of Object.entries(TRACK_LANES) as [
  ConflictId,
  Partial<Record<Track, ConflictLaneId>>,
][]) {
  for (const lane of Object.values(lanes)) {
    laneById(CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion, lane);
  }
}

/** Region-membership tokens: recognizing THAT a claim is about the region
 *  without any conflict signal → off_scope, never in-scope (contract §5
 *  test-mandated exclusions). */
const REGION_TOKENS: Readonly<Record<ConflictId, readonly RegExp[]>> = deepFreeze({
  russia_ukraine: [/\bEU\b/, /european/i, /\bmoldov/i, /\bgerman/i, /\bpol(and|ish)\b/i],
  iran_regional: [/\bgulf\b/i, /israel/i, /\bsaudi\b/i, /bahrain/i, /emirat/i, /\bqatar/i, /kuwait/i, /\boman/i, /\biraq/i, /\byemen/i, /lebanon/i, /\biran/i],
});

/** Generic security signal gating `other_in_scope` (rung 6). */
const GENERIC_SECURITY = /militar|forces|exercise|drill|troops|weapon|security|\bstrikes?\b|defen[cs]e|attack|missile|\bnaval\b/i;

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type LaneClassification =
  | {
      kind: "classified";
      lane: ConflictLaneId;
      /** which ladder rung assigned the lane (diagnostic) */
      laneSource: "geography" | "track" | "actor" | "keyword" | "frontline_fallback" | "other_in_scope";
      /** `actor:`/`geo:`/`lane:`/`track:` reason strings (fixture vocabulary);
       *  window reasons are the eligibility engine's to add */
      reasons: readonly string[];
      /** ALL actor hits (attribution; top-first) */
      actorHits: readonly string[];
      classifierVersion: string;
    }
  | { kind: "off_scope"; classifierVersion: string; actorHits: readonly string[] }
  | { kind: "unclassified"; classifierVersion: string };

export interface ClassifierInput {
  text: string;
  track: Track;
}

/** Classify one candidate's text+track for one conflict. Pure, deterministic,
 *  total — and structurally blind to reference-report content (the input has
 *  no field that could carry it). */
export function classifyCandidate(conflictId: ConflictId, input: ClassifierInput): LaneClassification {
  const classifierVersion = LANE_CLASSIFIER_VERSIONS[conflictId];
  const taxonomyVersion = CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion;
  const text = input.text;

  // geography: top class hit in priority order
  const geoHit = GEO_CLASSES[conflictId].find((g) => g.patterns.some((p) => p.test(text))) ?? null;

  // actors: all hits, priority order
  const actors = matchActors(conflictId, text);
  const strongActors = actors.filter((a) => a.entry.strength === "strong");
  const weakActors = actors.filter((a) => a.entry.strength === "weak");
  const actorHits = actors.map((a) => a.entry.id);

  // track lane (specialty tracks only)
  const trackLane = TRACK_LANES[conflictId][input.track] ?? null;

  // keyword lane (ordered, first match wins)
  const keywordLane = KEYWORD_RULES[conflictId].find((r) => r.pattern.test(text))?.lane ?? null;

  // the ladder
  let lane: ConflictLaneId | null = null;
  let laneSource: Extract<LaneClassification, { kind: "classified" }>["laneSource"] | null = null;
  if (geoHit?.lane) {
    lane = geoHit.lane;
    laneSource = "geography";
  } else if (trackLane) {
    lane = trackLane;
    laneSource = "track";
  } else if (strongActors.length > 0 && strongActors[0].entry.lane) {
    lane = strongActors[0].entry.lane;
    laneSource = "actor";
  } else if (keywordLane) {
    lane = keywordLane;
    laneSource = "keyword";
  } else if (geoHit?.frontline) {
    lane = laneById(taxonomyVersion, "frontline_maneuver").id;
    laneSource = "frontline_fallback";
  } else if ((geoHit !== null || actors.length > 0) && GENERIC_SECURITY.test(text)) {
    lane = laneById(taxonomyVersion, "other_in_scope").id;
    laneSource = "other_in_scope";
  }

  if (lane === null) {
    const regionHit =
      geoHit !== null ||
      actors.length > 0 ||
      REGION_TOKENS[conflictId].some((p) => p.test(text));
    return regionHit
      ? { kind: "off_scope", classifierVersion, actorHits }
      : { kind: "unclassified", classifierVersion };
  }

  // fail-closed: the assigned lane must be in the conflict's frozen taxonomy
  const laneObj = laneById(taxonomyVersion, lane);

  // reasons (fixture vocabulary): at most one actor, at most one geo, the
  // lane, the specialty track — window reasons are appended by eligibility
  const reasons: string[] = [];
  const emittedActor =
    strongActors.length > 0
      ? strongActors[0].entry.id
      : geoHit === null && weakActors.length > 0
        ? weakActors[0].entry.id
        : null;
  if (emittedActor !== null) reasons.push(`actor:${emittedActor}`);
  if (geoHit !== null) {
    const tag =
      geoHit.frontline && laneObj.id !== "frontline_maneuver"
        ? (geoHit.downgradeTag ?? geoHit.tag)
        : geoHit.tag;
    reasons.push(`geo:${tag}`);
  }
  reasons.push(`lane:${laneObj.id}`);
  if (trackLane !== null) reasons.push(`track:${input.track}`);

  return { kind: "classified", lane: laneObj.id, laneSource: laneSource!, reasons, actorHits, classifierVersion };
}
