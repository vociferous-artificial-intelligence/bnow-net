// Digest engine dispatch (MR sprint 3, TASK 4). DIGEST_ENGINE selects the
// pipeline; the default is LEGACY until the operator flips it, and the legacy
// path stays callable for rollback.
//
// The mapreduce engine only applies where the map has coverage: a theater with
// no doc_claims in the window (gulf theaters — the map worker runs ru/ua/ir —
// or a genuinely unmapped day) makes generateMapReduceDigest return null, and
// the dispatcher FALLS BACK to legacy so no theater ever silently loses its
// digest. Extending the map worker to gulf theaters is a follow-up OPEN-TASK,
// not this sprint.

import { generateDigest, type DigestResult } from "./digest";
import type { DigestSkipped } from "./digest-persist";
import { generateMapReduceDigest, type SynthesizeOptions } from "./synthesize";
import type { Track } from "./tracks";

export type DigestEngine = "legacy" | "mapreduce";

export function digestEngine(): DigestEngine {
  return process.env.DIGEST_ENGINE === "mapreduce" ? "mapreduce" : "legacy";
}

export type DigestOutcome = DigestResult | DigestSkipped | null;

export interface EngineOptions {
  /** window mode forwarded to the mapreduce engine (legacy ignores it) */
  window?: SynthesizeOptions["window"];
  /** injectable engines (tests) */
  engines?: {
    legacy?: (iso2: string, date: string, track: Track) => Promise<DigestOutcome>;
    mapreduce?: (
      iso2: string,
      date: string,
      track: Track,
      opts?: SynthesizeOptions,
    ) => Promise<DigestOutcome>;
  };
}

/** Generate one digest through the configured engine, falling back from
 *  mapreduce to legacy when the map has nothing for this (theater, window). */
export async function generateDigestWithEngine(
  countryIso2: string,
  date: string,
  track: Track = "military",
  opts: EngineOptions = {},
): Promise<DigestOutcome> {
  const legacy = opts.engines?.legacy ?? generateDigest;
  const mapreduce = opts.engines?.mapreduce ?? generateMapReduceDigest;
  if (digestEngine() === "mapreduce") {
    const r = await mapreduce(countryIso2, date, track, { window: opts.window });
    if (r !== null) return r;
    // no doc_claims for this cell — the legacy batch path still can extract
    // from raw documents (gulf theaters, pre-map history)
    return legacy(countryIso2, date, track);
  }
  return legacy(countryIso2, date, track);
}
