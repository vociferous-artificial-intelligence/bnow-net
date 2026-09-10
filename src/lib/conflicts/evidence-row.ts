// The gated evidence view's ROW TYPE, in its own module.
//
// It used to live in `product-view.ts`, the FIXTURE provider. The DB-backed
// provider (`db-product-view.ts`) renders the same rows from the live tables,
// and importing the type from the fixture module would have pulled the fixture
// loader — and its `readFileSync` of the synthetic corpus — into the real
// view's module graph. Ruling 3 is enforced here by SHAPE, not by review:
// `matcher-import-hygiene`-style tests assert that the DB view imports no
// fixture module at all, which is only possible because the shared type sits
// in a module that reads nothing.
//
// Type-only: importing this file performs no IO and pulls in no loader.

import type { Track } from "../analysis/tracks";
import type { CandidateDoc, HedgingValue } from "./evidence-records";
import type { ConflictLaneId } from "./lanes";
import type { MatchCoverage } from "./match-contract";

/** One claim in the published-retention union of a scored evaluation, joined
 *  back to its text and source trail. Rendered ONLY on the gated evidence
 *  surface, and only for claims that genuinely appeared in a designated
 *  published digest. */
export interface PublishedEvidenceRow {
  claimId: number;
  /** published digest claim text — renders ONLY on the gated surface */
  text: string;
  theater: string;
  track: Track;
  hedge: HedgingValue;
  legacy: boolean;
  claimDate: string;
  /** matcher-recorded confidence when this claim matched a takeaway */
  confidence: number | null;
  earliestIngestAt: string | null;
  /** takeaways this claim matched — ids/lanes only, never takeaway text */
  matchedUnits: readonly { unitId: string; lane: ConflictLaneId; coverage: MatchCoverage }[];
  /** lane label when this claim is an in-scope BNOW-only item */
  bnowOnlyLane: ConflictLaneId | null;
  /** full source trail from the originating documents */
  docs: readonly CandidateDoc[];
}
