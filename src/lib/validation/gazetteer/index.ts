// The gazetteer registry (48h step 06).
//
// One place answers "which toponym/action vocabulary scores this series or
// conflict, and under which version string". Every returned object carries its
// `version`, so a consumer can stamp what actually scored rather than assuming.
//
// FAIL-CLOSED, like conflicts/lanes.ts:161-169: an unknown key throws rather
// than returning a silently empty gazetteer, which would read as "nothing
// matched" instead of "nothing was looked up".
//
// KEYS ARE PLAIN STRINGS. src/lib/validation/** must not import
// src/lib/conflicts/** (see ./types.ts LAYERING), so this module accepts the
// reference-series ids (`roca`, `iran_update`) and conflict ids
// (`russia_ukraine`, `iran_regional`) as strings, plus the version ids
// themselves. It deliberately does NOT accept theater iso2 codes: mapping a
// contributor theater onto a gazetteer is a scoring-policy decision that
// belongs to the caller, and `ir` is not a reference series.
//
// The production keyword path does NOT come through here — ../keywords.ts
// binds ru-ua-v1 directly so the Iran tables stay out of its bundle
// (./layering.test.ts).

import { IRAN_LEVANT_V1 } from "./iran-levant-v1";
import { RU_UA_V1 } from "./ru-ua-v1";
import type { Gazetteer, GazetteerVersion } from "./types";

export type { Gazetteer, GazetteerVersion, IranTheater, MatchMode, RuUaTheater, Signature } from "./types";
export { IRAN_LEVANT_V1 } from "./iran-levant-v1";
export { RU_UA_V1, TOPONYM_THEATER, classifyTakeawayTheater } from "./ru-ua-v1";
export {
  MATCH_THRESHOLD,
  classifyTheaterWith,
  expandToponymsWith,
  extractSignatureWith,
  matchScore,
} from "./match";

export const GAZETTEERS: Readonly<Record<GazetteerVersion, Gazetteer>> = {
  "ru-ua-v1": RU_UA_V1,
  "iran-levant-v1": IRAN_LEVANT_V1,
};

/** Reference series id, conflict id, or version id -> gazetteer version. */
export const GAZETTEER_KEYS: Readonly<Record<string, GazetteerVersion>> = {
  roca: "ru-ua-v1",
  russia_ukraine: "ru-ua-v1",
  "ru-ua-v1": "ru-ua-v1",
  iran_update: "iran-levant-v1",
  iran_regional: "iran-levant-v1",
  "iran-levant-v1": "iran-levant-v1",
};

export class UnknownGazetteerError extends Error {
  constructor(key: string) {
    super(
      `unknown gazetteer key ${JSON.stringify(key)} (accepted: ${Object.keys(GAZETTEER_KEYS).join(", ")})`,
    );
    this.name = "UnknownGazetteerError";
  }
}

/** The gazetteer for a reference series, conflict id, or version id.
 *  Fail-closed: throws on anything else. */
export function gazetteerFor(key: string): Gazetteer {
  const gaz = tryGazetteerFor(key);
  if (gaz === null) throw new UnknownGazetteerError(key);
  return gaz;
}

/** Non-throwing form for callers that legitimately probe. */
export function tryGazetteerFor(key: string): Gazetteer | null {
  // own-property lookups only: a bare `GAZETTEER_KEYS[key]` resolves
  // "toString" / "__proto__" / "constructor" against Object.prototype, and the
  // inherited value is truthy — which would walk straight past the
  // fail-closed check and hand back `undefined` typed as a Gazetteer.
  if (!Object.hasOwn(GAZETTEER_KEYS, key)) return null;
  const version = GAZETTEER_KEYS[key];
  return Object.hasOwn(GAZETTEERS, version) ? GAZETTEERS[version] : null;
}
