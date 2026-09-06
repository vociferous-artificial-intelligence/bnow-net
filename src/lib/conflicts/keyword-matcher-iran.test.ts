// Per-lane keyword-rung probes for iran-lanes-v1 under iran-levant-v1
// (48h step 06).
//
// The recorded pre-soak blocker (CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101)
// is that the keyword rung reuses the RU/UA gazetteer, so an Iran evaluation
// day scores 0/N with every unit flagged. These probes assert the repair per
// lane, and the last case asserts the BLOCKER itself is real by re-running the
// identical probes through the default gazetteer.
//
// Probe text is synthetic and repo-authored (fixtures/gazetteer/
// iran-lane-probes-v1.json), deliberately outside fixtures/conflicts/ so it can
// never enter a conflict dataset's identity.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gazetteerFor } from "../validation/gazetteer";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { IRAN_LANE_IDS } from "./lanes";
import type { MatchableUnit, MatcherClaim } from "./match-contract";

interface ProbeClaim {
  claimId: number;
  text: string;
  hedging: MatcherClaim["hedging"];
}
interface ProbeLane {
  lane: string;
  claims: ProbeClaim[];
  positive: { unitId: string; text: string; claimId: number }[];
  negative: { unitId: string; text: string; why: string }[];
}
interface ProbeFixture {
  synthetic: boolean;
  gazetteerVersion: string;
  laneTaxonomyVersion: string;
  lanes: ProbeLane[];
  signalLess: { unitId: string; lane: string; text: string }[];
}

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/gazetteer/iran-lane-probes-v1.json"), "utf8"),
) as ProbeFixture;

const iranMatcher = new ConflictKeywordMatcher(gazetteerFor("iran_regional"));
const defaultMatcher = new ConflictKeywordMatcher(); // ru-ua-v1, the pre-repair state

function unitsOf(lane: ProbeLane): MatchableUnit[] {
  return [...lane.positive, ...lane.negative].map((u, i) => ({
    unitId: u.unitId,
    ordinal: i,
    text: u.text,
    lane: lane.lane as MatchableUnit["lane"],
    compound: false,
    negative: false,
  }));
}

describe("iran-lanes-v1 keyword-rung probes", () => {
  it("the fixture is synthetic, declares the versions under test, and covers EVERY lane", () => {
    expect(FIXTURE.synthetic).toBe(true);
    expect(FIXTURE.gazetteerVersion).toBe("iran-levant-v1");
    expect(FIXTURE.laneTaxonomyVersion).toBe("iran-lanes-v1");
    expect(FIXTURE.lanes.map((l) => l.lane).sort()).toEqual([...IRAN_LANE_IDS].sort());
    for (const lane of FIXTURE.lanes) {
      expect(lane.positive.length, lane.lane).toBeGreaterThanOrEqual(2);
      expect(lane.negative.length, lane.lane).toBeGreaterThanOrEqual(1);
    }
  });

  for (const lane of FIXTURE.lanes) {
    it(`${lane.lane}: every positive unit scores, the negative unit misses, and NOTHING is insufficient_data`, async () => {
      const outcome = await iranMatcher.match(unitsOf(lane), lane.claims);

      // acceptance: the lane scores at least one unit, and in fact all its
      // positives, with the expected claim
      expect(
        outcome.matches.map((m) => ({ unitId: m.unitId, claimId: m.claimId })),
        lane.lane,
      ).toEqual(lane.positive.map((p) => ({ unitId: p.unitId, claimId: p.claimId })));
      for (const m of outcome.matches) expect(m.coverage).toBe("full");

      // the negative unit is a MISS, not a "cannot be scored": it carries real
      // signal, so it is absent from both the count and the class
      const negatives = lane.negative.map((n) => n.unitId);
      for (const id of negatives) {
        expect(outcome.matches.map((m) => m.unitId), `${lane.lane}/${id}`).not.toContain(id);
      }
      expect(outcome.keywordUnmatchable, lane.lane).toBe(0);
      expect(outcome.insufficientData, lane.lane).toEqual([]);
      expect(outcome.gazetteerVersion).toBe("iran-levant-v1");
    });

    it(`${lane.lane}: the SAME probes score NOTHING under the default RU/UA gazetteer (the blocker, reproduced)`, async () => {
      const outcome = await defaultMatcher.match(unitsOf(lane), lane.claims);
      expect(outcome.matches, lane.lane).toEqual([]);
      expect(outcome.gazetteerVersion).toBe("ru-ua-v1");
    });
  }

  it("signal-less units are named in insufficient_data, and the count stays exactly its length", async () => {
    const lane = FIXTURE.lanes[0];
    const units: MatchableUnit[] = [
      ...unitsOf(lane).slice(0, 1),
      ...FIXTURE.signalLess.map((s, i) => ({
        unitId: s.unitId,
        ordinal: 1 + i,
        text: s.text,
        lane: s.lane as MatchableUnit["lane"],
        compound: false,
        negative: false,
      })),
    ].map((u, i) => ({ ...u, ordinal: i }));

    const outcome = await iranMatcher.match(units, lane.claims);
    expect(outcome.insufficientData).toEqual(FIXTURE.signalLess.map((s) => s.unitId));
    expect(outcome.keywordUnmatchable).toBe(outcome.insufficientData!.length);
    // denominator-unchanged: they are still ordinary automatic misses, and the
    // scored unit is unaffected by their presence
    expect(outcome.matches.map((m) => m.unitId)).toEqual([lane.positive[0].unitId]);
  });
});
