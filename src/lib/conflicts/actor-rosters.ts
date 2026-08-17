// Versioned actor rosters (Phase 3; contract §5 predicate 4, register #6).
//
// One roster per conflict, versioned (`ru-ua-roster-v1` / `iran-roster-v1`):
// deterministic, inspectable actor entries whose involvement makes a claim
// in-scope by ACTOR rather than by source geography. Rules baked into v1:
//
// - Entry ORDER is the roster's priority order. The classifier emits at most
//   ONE `actor:<id>` reason — the highest-priority STRONG hit — while ALL hits
//   are preserved on the record's `actorHits` for actor-level attribution
//   (the frozen geography-over-actor rule: an actor that loses the lane still
//   contributes to attribution).
// - `strength: "weak"` entries (ru-ua `russian-forces`) are scope FALLBACKS:
//   they are emitted as a reason only when the claim has NO geography hit and
//   NO strong actor hit (a bare "Russian ..." mention inside a geolocated
//   frontline claim adds nothing the geography did not already establish).
// - `requires` patterns demand co-occurring war/conflict context: the
//   nato-eu-decision entry hits "NATO approved an air-defense package for
//   Ukraine" but NOT "EU agriculture ministers debated dairy subsidies" —
//   region/actor membership alone never suffices (contract §5). The same rule
//   guards mediator entries (oman mirrors qatar) and belarus-enablement.
// - GUARDED OPERATING-AREA TOKENS (corrects a Gate-3 MAJOR): an actor entry
//   may carry a `guarded` pattern group — area tokens (the Houthi entry's Red
//   Sea / Al Hudaydah / Al Salif / Yemen) that hit ONLY alongside their own
//   attack/military/shipping co-occurrence context. A bare area mention is
//   NOT the actor: at classifier rung 3 (no geography-class hit) a strong
//   actor GOVERNS the lane, so an unguarded area token would grant scope AND
//   a lane to neutral claims ("Yemen's tourism ministry…") — the guards are
//   what contain scope; the earlier claim that this coarseness affected only
//   attribution diagnostics was wrong precisely in that rung-3 case. An
//   attack description in Houthi-associated waters still attributes to the
//   houthi entry without the group being named (v1 coarseness, kept).
//   Revising rosters is a version bump, never an in-place edit.
//
// Every entry's lane is validated against the conflict's frozen taxonomy at
// module load through the fail-closed helpers (Gate-1 carried condition).

import { deepFreeze } from "./freeze";
import { laneById, type ConflictLaneId } from "./lanes";
import { CONFLICT_REGISTRY } from "./definitions";
import type { ConflictId } from "./vocabulary";

export const ACTOR_ROSTER_VERSIONS: Readonly<Record<ConflictId, string>> = deepFreeze({
  russia_ukraine: "ru-ua-roster-v1",
  iran_regional: "iran-roster-v1",
});

export type ActorStrength = "strong" | "weak";

export interface ActorEntry {
  /** stable machine id, emitted as `actor:<id>` */
  id: string;
  label: string;
  /** lane this actor implies when it governs lane assignment; null = the
   *  actor establishes scope but never a lane (weak fallbacks) */
  lane: ConflictLaneId | null;
  /** any-of match patterns (word-boundary, case-insensitive) */
  patterns: readonly RegExp[];
  /** when present: at least one must ALSO match (co-occurrence context) for
   *  the `patterns` group to count */
  requires?: readonly RegExp[];
  /** additional patterns that hit ONLY alongside their own co-occurrence
   *  context (operating-area tokens: a bare area mention is not the actor) */
  guarded?: { patterns: readonly RegExp[]; requires: readonly RegExp[] };
  strength: ActorStrength;
}

function entry(
  conflictId: ConflictId,
  e: Omit<ActorEntry, "lane"> & { lane: ConflictLaneId | null },
): ActorEntry {
  // fail-closed lane validation at construction: an entry whose lane is not in
  // the conflict's frozen taxonomy version throws at module load
  if (e.lane !== null) {
    laneById(CONFLICT_REGISTRY[conflictId].laneTaxonomyVersion, e.lane);
  }
  return e;
}

const RU_UA_ROSTER: readonly ActorEntry[] = [
  entry("russia_ukraine", {
    id: "dprk-military-support",
    label: "North Korean military support to Russia",
    lane: "russia_partners",
    patterns: [/\bdprk\b/i, /\bnorth korea/i],
    strength: "strong",
  }),
  entry("russia_ukraine", {
    id: "belarus-enablement",
    label: "Belarusian enablement of Russia",
    lane: "russia_partners",
    patterns: [/\bbelarus/i],
    // enablement context required: a bare Belarus mention (potato-harvest
    // news) is not war enablement
    requires: [
      /militar|troop|missile|drone|weapon|forces|deploy|exercis|\bbase[sd]?\b|basing|transfer|launch|strike|attack|air[ -]defen[cs]e|enable/i,
    ],
    strength: "strong",
  }),
  entry("russia_ukraine", {
    id: "iran-enablement",
    label: "Iranian materiel support to Russia",
    lane: "russia_partners",
    patterns: [/\biran(ian)?\b/i],
    requires: [/shahed|drone (deliver|transfer|shipment)|missile (deliver|transfer|shipment)|suppl/i],
    strength: "strong",
  }),
  entry("russia_ukraine", {
    id: "nato-eu-decision",
    label: "NATO/EU/member-state decisions shaping the war",
    lane: "foreign_support",
    patterns: [/\bnato\b/i, /\bEU\b/, /european union/i, /\bgerman/i, /\bpol(and|ish)\b/i, /\bmoldov/i],
    requires: [
      /ukrain/i,
      /air[ -]defen[cs]e|artillery|ammunition|interceptor|military aid|weapons|sanction/i,
    ],
    strength: "strong",
  }),
  entry("russia_ukraine", {
    id: "russian-forces",
    label: "Russian forces/state (weak scope fallback)",
    lane: null,
    patterns: [/\brussian?\b/i, /\brussia['’]s\b/i],
    strength: "weak",
  }),
];

const IRAN_ROSTER: readonly ActorEntry[] = [
  entry("iran_regional", {
    id: "irgc",
    label: "IRGC (incl. IRGC Navy / Aerospace)",
    lane: "direct_kinetic",
    patterns: [/\birgc\b/i, /revolutionary guard/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "hezbollah",
    label: "Hezbollah / Lebanese Hezbollah",
    lane: "proxy_partner",
    patterns: [/\bhezbollah\b/i, /\bhizballah\b/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "iraqi-militia",
    label: "Iranian-aligned Iraqi militias",
    lane: "proxy_partner",
    patterns: [/iraqi militia/i, /militias? in iraq/i, /islamic resistance in iraq/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "houthi",
    label: "Houthi movement (incl. GUARDED Houthi-associated maritime zones — see header)",
    lane: "proxy_partner",
    patterns: [/\bhouthi/i],
    guarded: {
      // operating-area tokens count only with attack/military/shipping
      // context — a tourism/fishing/aid mention of the same places is not
      // the actor
      patterns: [/\byemen/i, /hudaydah/i, /al salif/i, /red sea/i],
      requires: [
        /attack|strike|missile|drone|deton|explos|anti-ship|intercept|hijack|seiz|militar|\bforces\b|\bnaval\b|shipping|\bvessel\b|\btanker\b|maritime/i,
      ],
    },
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "e3",
    label: "E3 (France/Germany/UK) nuclear diplomacy",
    lane: "nuclear_diplomacy",
    patterns: [/\be3\b/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "iaea",
    label: "IAEA",
    lane: "nuclear_diplomacy",
    patterns: [/\biaea\b/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "mediator-oman",
    label: "Omani mediation",
    lane: "regional_effects",
    patterns: [/\boman/i, /\bmuscat\b/i],
    // mediation context required (mirrors mediator-qatar): "Oman Air announced
    // new direct flights" is not Omani mediation
    requires: [/mediat|talks|negotiat|de-escalat/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "mediator-qatar",
    label: "Qatari mediation",
    lane: "regional_effects",
    patterns: [/\bqatar/i],
    requires: [/mediat|talks|negotiat|de-escalat/i],
    strength: "strong",
  }),
  entry("iran_regional", {
    id: "israel-us-forces",
    label: "Israeli / US military forces (direct-fight counterpart)",
    lane: "direct_kinetic",
    patterns: [/israeli (air|forces|strike|defen[cs]e)/i, /\bus (forces|navy|military)\b/i, /\bcentcom\b/i],
    strength: "strong",
  }),
];

export const ACTOR_ROSTERS: Readonly<Record<ConflictId, readonly ActorEntry[]>> = deepFreeze({
  russia_ukraine: RU_UA_ROSTER,
  iran_regional: IRAN_ROSTER,
});

export interface ActorMatch {
  entry: ActorEntry;
  /** roster index — lower = higher priority */
  priority: number;
}

/** All roster hits for a claim text, in roster priority order. Pure and
 *  deterministic. An entry hits when its direct `patterns` group matches
 *  (with entry-wide `requires` co-occurrence satisfied, if any) OR its
 *  `guarded` group matches together with the guarded group's own context. */
export function matchActors(conflictId: ConflictId, text: string): ActorMatch[] {
  const out: ActorMatch[] = [];
  const roster = ACTOR_ROSTERS[conflictId];
  for (let i = 0; i < roster.length; i++) {
    const e = roster[i];
    const directHit =
      e.patterns.some((p) => p.test(text)) &&
      (e.requires === undefined || e.requires.some((p) => p.test(text)));
    const guardedHit =
      e.guarded !== undefined &&
      e.guarded.patterns.some((p) => p.test(text)) &&
      e.guarded.requires.some((p) => p.test(text));
    if (!directHit && !guardedHit) continue;
    out.push({ entry: e, priority: i });
  }
  return out;
}
