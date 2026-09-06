// Trilingual (en/ru/uk) signature extraction for event matching.
// Deterministic v1 matcher: shared toponym + compatible action class.
// An LLM provider can replace matching later; the metric definitions stay.
//
// THIS FILE IS A BINDING SHIM (48h step 06). The RU/UA tables moved VERBATIM to
// ./gazetteer/ru-ua-v1.ts and the algorithm to ./gazetteer/match.ts; every
// export below keeps its exact prior name, signature and behaviour. The proof
// is fixtures/validation/gazetteer-snapshot-v1.json, generated from the
// pre-split file and byte-compared by ./gazetteer-snapshot.test.ts, plus the
// independent legacy-oracle differential in ./gazetteer/ru-ua-v1.test.ts.
//
// Import sites are unchanged on purpose — including
// src/lib/conflicts/backtest-matrix.ts:94, whose purity test pins the literal
// `from "../validation/keywords"` (backtest-matrix.test.ts:88).
//
// THIS FILE BINDS ru-ua-v1 ONLY, and must never import ./gazetteer/index or
// ./gazetteer/iran-levant-v1: the production keyword path stays RU/UA-shaped,
// and the Iran tables stay out of every bundle that reaches extractSignature
// (src/lib/analysis/stub-provider.ts:1 is inside the Next build). Callers that
// WANT another gazetteer ask ./gazetteer for it by name.
// Pinned by ./gazetteer/layering.test.ts.

import { RU_UA_V1 } from "./gazetteer/ru-ua-v1";
import { expandToponymsWith, extractSignatureWith } from "./gazetteer/match";
import type { Signature } from "./gazetteer/types";

export type { Signature } from "./gazetteer/types";
export { TOPONYM_THEATER, classifyTakeawayTheater } from "./gazetteer/ru-ua-v1";
export { matchScore, MATCH_THRESHOLD } from "./gazetteer/match";

export function extractSignature(text: string): Signature {
  return extractSignatureWith(RU_UA_V1, text);
}

/** Expand oblast-level toponyms to include member towns (for the ISW side). */
export function expandToponyms(toponyms: Set<string>): Set<string> {
  return expandToponymsWith(RU_UA_V1, toponyms);
}
