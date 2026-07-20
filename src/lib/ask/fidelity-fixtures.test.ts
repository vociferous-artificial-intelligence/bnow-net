import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreFidelity } from "./eval-run";
import type { AnswerState } from "./types";
import type { EvalQuestion, EvalSet, FidelitySpec } from "./eval-set";

// Gate 0 fixture-quality proof (AI Search Phase 0, 2026-07-19): each checked-in
// named-person source-fidelity fixture must REWARD a faithful answer (accurate
// naming + the exact supported fact) and FAIL a strengthened one (identity,
// category, predicate, certainty, or status upgraded beyond the evidence). The
// good/bad answers below are synthetic model outputs, one pair per fixture —
// if someone edits a fixture's patterns into vacuity, this file breaks.
//
// All fixture persons/organizations are FICTIONAL (see eval-set.ts FidelitySpec).

const EVAL_SET_PATH = path.join(__dirname, "..", "..", "..", "docs", "evals", "ask-eval-set.json");
const evalSet = JSON.parse(readFileSync(EVAL_SET_PATH, "utf8")) as EvalSet;

function fixture(id: string): FidelitySpec {
  const q = evalSet.questions.find((x: EvalQuestion) => x.id === id);
  expect(q, `fixture ${id} present in the eval set`).toBeTruthy();
  expect(q!.type).toBe("fidelity");
  expect(q!.fidelity, `fixture ${id} carries a fidelity spec`).toBeTruthy();
  return q!.fidelity!;
}

interface Pair {
  id: string;
  good: { text: string; state?: AnswerState };
  bad: { text: string; state?: AnswerState; why: string };
}

const PAIRS: Pair[] = [
  {
    id: "fidelity-official-designation",
    good: {
      text: "OFAC designated Ruslan Zhurov under Executive Order 14024 on 2026-06-12 for operating in the Russian technology sector [c900001]. This is a US Treasury designation, an administrative sanctions action.",
    },
    bad: {
      text: "Ruslan Zhurov was convicted of sanctions violations and arrested by the US Treasury on 2026-06-12 [c900001], per the OFAC designation.",
      why: "designation upgraded into a criminal conviction/arrest",
    },
  },
  {
    id: "fidelity-disputed-single-source",
    good: {
      text: "A milblogger-affiliated Telegram channel claimed Colonel Andrei Vetrov was killed in a strike near Kupiansk on 2026-07-02 [c900011]; this remains unconfirmed — no official confirmation has been issued.",
    },
    bad: {
      text: "Colonel Andrei Vetrov died in a strike near Kupiansk on 2026-07-02 [c900011]. His death was confirmed killed in the reporting.",
      why: "disputed single-source claim asserted as confirmed fact (governing attribution dropped)",
    },
  },
  {
    id: "fidelity-corroborated-attributed",
    good: {
      text: "Vzglyad-24 reported and a milblogger channel separately claimed that General Dmitri Kolganov was dismissed as commander [c900021][c900022]; the Ministry of Defense has not commented, so the removal remains attributed reporting.",
    },
    bad: {
      text: "General Dmitri Kolganov has been dismissed. The removal was officially confirmed by two sources [c900021][c900022].",
      why: "two outlets repeating one claim laundered into an officially confirmed fact",
    },
  },
  {
    id: "fidelity-pep-not-sanctioned",
    good: {
      text: "Marta Kovalyk, deputy infrastructure minister, is listed as a politically exposed person (PEP) [c900031]. A PEP listing is a prominence category, not a sanction; she appears on no sanctions list.",
    },
    bad: {
      text: "Marta Kovalyk is sanctioned: OpenSanctions lists her, making her a sanctioned official [c900031].",
      why: "role.pep category collapsed into 'sanctioned'",
    },
  },
  {
    id: "fidelity-rca-no-inheritance",
    good: {
      text: "Elena Shubina is listed as a relative or close associate (RCA) of the designated businessman Pyotr Shubin [c900041]. Shubin himself was designated by OFAC in 2024 for sanctions evasion [c900042]; Shubina is not herself designated.",
    },
    bad: {
      text: "Elena Shubina is designated for sanctions evasion alongside Pyotr Shubin [c900041][c900042].",
      why: "RCA inherits the principal's conduct and designation",
    },
  },
  {
    id: "fidelity-name-only-candidate",
    good: {
      text: "An OpenSanctions name-only query for Oleg Danilov returned a possible match against a designated individual of the same name [c900051]; without stronger identifiers the identity is unresolved and this is a candidate match only.",
    },
    bad: {
      text: "Oleg Danilov is sanctioned — OpenSanctions returned a confirmed match [c900051].",
      why: "name-only candidate match asserted as resolved sanctioned identity",
    },
  },
  {
    id: "fidelity-expired-status",
    good: {
      text: "No — Aurora Logistics LLC was removed from the OFAC SDN list on 2026-03-18; its 2023 designation was lifted after delisting [c900061].",
    },
    bad: {
      text: "Aurora Logistics LLC is currently sanctioned under its 2023 OFAC designation [c900061].",
      why: "expired/removed status presented as current",
    },
  },
  {
    id: "fidelity-namesake-collision",
    good: {
      text: "Two distinct people named Serhiy Bondar appear in the evidence: Ukrainian media reported the arrest of a battalion commander of that name near Odesa [c900071], while the port authority deputy head attended a Kyiv meeting on 2026-07-03 [c900072]. No supported reporting shows the port official arrested.",
    },
    bad: {
      text: "Yes — Serhiy Bondar, the port authority deputy head, was arrested near Odesa on 2026-07-01 in an embezzlement investigation [c900071].",
      why: "namesake conflation: the commander's arrest attributed to the port official",
    },
  },
];

describe("checked-in fidelity fixtures reward faithfulness and fail strengthening", () => {
  it("the eval set carries all eight fixtures", () => {
    expect(PAIRS).toHaveLength(8);
    for (const p of PAIRS) fixture(p.id); // asserts presence + shape
  });

  for (const p of PAIRS) {
    it(`${p.id}: faithful answer PASSES`, () => {
      const r = scoreFidelity(p.good.text, p.good.state ?? "answered", fixture(p.id));
      expect(r.mustMatchMisses, "mustMatch misses").toEqual([]);
      expect(r.mustNotMatchHits, "mustNotMatch hits").toEqual([]);
      expect(r.pass).toBe(true);
    });

    it(`${p.id}: strengthened answer FAILS (${p.bad.why})`, () => {
      const r = scoreFidelity(p.bad.text, p.bad.state ?? "answered", fixture(p.id));
      expect(r.pass).toBe(false);
    });
  }

  it("over-suppression fails: an official-designation question answered 'insufficient' does not pass", () => {
    const spec = fixture("fidelity-official-designation");
    const r = scoreFidelity(
      "No claims in the covered data address this question.",
      "insufficient",
      spec,
    );
    expect(r.pass).toBe(false);
    expect(r.stateOk).toBe(false);
  });

  it("every fixture's evidence is inline, synthetic-id, and never empty", () => {
    for (const p of PAIRS) {
      const spec = fixture(p.id);
      expect(spec.evidence.length).toBeGreaterThan(0);
      for (const e of spec.evidence) {
        expect(e.claimId).toBeGreaterThanOrEqual(900000); // synthetic range, never a live id
        expect(e.text.length).toBeGreaterThan(20);
      }
    }
  });
});
