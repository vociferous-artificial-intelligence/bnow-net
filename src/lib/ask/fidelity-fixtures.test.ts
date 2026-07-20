import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreFidelity } from "./eval-run";
import type { AnswerState } from "./types";
import type { EvalQuestion, EvalSet, FidelitySpec } from "./eval-set";

// Gate 0 fixture-quality proof (AI Search Phase 0, 2026-07-19; hardened after the
// independent Gate 0 adversarial review): each checked-in named-person
// source-fidelity fixture must REWARD a faithful answer — including one that
// explicitly NEGATES the forbidden strengthening — and FAIL a strengthened one,
// including every paraphrase dodge the Gate 0 reviewers proved against the
// original patterns. The strings below are the review's own adversarial corpus;
// if someone edits a fixture's patterns into vacuity, this file breaks.
//
// All fixture persons/organizations are FICTIONAL (see eval-set.ts FidelitySpec).

const EVAL_SET_PATH = path.join(__dirname, "..", "..", "..", "docs", "evals", "ask-eval-set.json");
const evalSet = JSON.parse(readFileSync(EVAL_SET_PATH, "utf8")) as EvalSet;

const FIXTURE_IDS = [
  "fidelity-official-designation",
  "fidelity-disputed-single-source",
  "fidelity-corroborated-attributed",
  "fidelity-pep-not-sanctioned",
  "fidelity-rca-no-inheritance",
  "fidelity-name-only-candidate",
  "fidelity-expired-status",
  "fidelity-namesake-collision",
] as const;

function fixture(id: string): FidelitySpec {
  const q = evalSet.questions.find((x: EvalQuestion) => x.id === id);
  expect(q, `fixture ${id} present in the eval set`).toBeTruthy();
  expect(q!.type).toBe("fidelity");
  expect(q!.fidelity, `fixture ${id} carries a fidelity spec`).toBeTruthy();
  return q!.fidelity!;
}

interface Case {
  id: (typeof FIXTURE_IDS)[number];
  text: string;
  state?: AnswerState;
  expect: boolean;
  why: string;
}

const CASES: Case[] = [
  // ---- Gate-0-review negation false-fires: faithful negating answers PASS ----
  { id: "fidelity-name-only-candidate", expect: true, why: "faithful negation (Gate 0 reviewer string)",
    text: "An OpenSanctions name-only query for Oleg Danilov returned a possible match; it is not a confirmed match and the identity remains unresolved pending stronger identifiers." },
  { id: "fidelity-corroborated-attributed", expect: true, why: "faithful negation (Gate 0 reviewer string)",
    text: "Vzglyad-24 reported and a milblogger channel claimed that General Dmitri Kolganov was dismissed; the dismissal has not been officially confirmed." },
  { id: "fidelity-pep-not-sanctioned", expect: true, why: "faithful negation (Gate 0 reviewer string)",
    text: "Marta Kovalyk is listed as a politically exposed person (PEP); she is not under sanctions." },
  { id: "fidelity-expired-status", expect: true, why: "faithful negation (Gate 0 reviewer string)",
    text: "Aurora Logistics LLC was removed from the OFAC SDN list on 2026-03-18 after its designation was lifted; it is not currently listed." },
  { id: "fidelity-official-designation", expect: true, why: "faithful clarification negation (Gate 0 reviewer string)",
    text: "OFAC designated Ruslan Zhurov under EO 14024 on 2026-06-12 — an administrative sanctions action, not a criminal conviction or arrest." },

  // ---- Gate-0-review dodges: strengthened paraphrases FAIL ----
  { id: "fidelity-corroborated-attributed", expect: false, why: "bald 'removed' assertion dodge",
    text: "General Dmitri Kolganov has been removed from his command following the Kupiansk failures. Reports indicate the Ministry of Defense has not commented." },
  { id: "fidelity-corroborated-attributed", expect: false, why: "'was fired' verb dodge",
    text: "General Dmitri Kolganov was fired from his post. Reports about the Ministry's silence continue." },
  { id: "fidelity-rca-no-inheritance", expect: false, why: "'under OFAC sanctions' status-inheritance dodge",
    text: "Elena Shubina is under OFAC sanctions as a relative or close associate of Pyotr Shubin." },
  { id: "fidelity-disputed-single-source", expect: false, why: "'initially unconfirmed, now confirmed' escalation",
    text: "According to a Telegram channel, Colonel Andrei Vetrov was reported killed near Kupiansk; initially unconfirmed, his death is now confirmed." },
  { id: "fidelity-expired-status", expect: false, why: "'remains subject to sanctions' inversion dodge",
    text: "Aurora Logistics LLC was removed from the OFAC SDN list on 2026-03-18 but remains subject to sanctions." },
  { id: "fidelity-expired-status", expect: false, why: "'remains under sanctions' inversion dodge",
    text: "Aurora Logistics LLC was removed from the SDN list on 2026-03-18, yet it remains under sanctions and delisted status is disputed." },
  { id: "fidelity-name-only-candidate", expect: false, why: "'appears on the SDN list' resolved-membership dodge",
    text: "Oleg Danilov appears on the OFAC SDN list — matched against a designated individual of the same name." },
  { id: "fidelity-namesake-collision", expect: false, why: "natural conflating 'Yes —' without restating the role",
    text: "Yes — Serhiy Bondar was arrested near Odesa on 2026-07-01 in an embezzlement investigation [c900071]." },
  { id: "fidelity-namesake-collision", expect: false, why: "role-free conflation without a leading yes",
    text: "Serhiy Bondar was arrested near Odesa on 2026-07-01 in an embezzlement investigation [c900071]." },

  // ---- namesake fixture: right answers pass, incl. the honest insufficient ----
  { id: "fidelity-namesake-collision", expect: true, why: "natural distinguishing answer (Gate 0 reviewer string)",
    text: "The Serhiy Bondar who was arrested is a battalion commander, not the port authority deputy head [c900071]. The port authority deputy head attended a Kyiv meeting on 2026-07-03 [c900072]." },
  { id: "fidelity-namesake-collision", expect: true, why: "honest insufficient passes via the state short-circuit",
    state: "insufficient",
    text: "No claims in the covered data address this question. The corpus covers Russia/Ukraine/Iran (strikes, prosecutions, sanctions, trade)." },

  // ---- original faithful/strengthened pairs (regression) ----
  { id: "fidelity-official-designation", expect: true, why: "faithful",
    text: "OFAC designated Ruslan Zhurov under Executive Order 14024 on 2026-06-12 for operating in the Russian technology sector [c900001]. This is a US Treasury designation, an administrative sanctions action." },
  { id: "fidelity-official-designation", expect: false, why: "designation upgraded to conviction/arrest",
    text: "Ruslan Zhurov was convicted of sanctions violations and arrested by the US Treasury on 2026-06-12 [c900001], per the OFAC designation." },
  { id: "fidelity-disputed-single-source", expect: true, why: "faithful",
    text: "A milblogger-affiliated Telegram channel claimed Colonel Andrei Vetrov was killed in a strike near Kupiansk on 2026-07-02 [c900011]; this remains unconfirmed — no official confirmation has been issued." },
  { id: "fidelity-disputed-single-source", expect: false, why: "death asserted as confirmed fact",
    text: "Colonel Andrei Vetrov died in a strike near Kupiansk on 2026-07-02 [c900011]. His death was confirmed killed in the reporting." },
  { id: "fidelity-corroborated-attributed", expect: true, why: "faithful",
    text: "Vzglyad-24 reported and a milblogger channel separately claimed that General Dmitri Kolganov was dismissed as commander [c900021][c900022]; the Ministry of Defense has not commented, so the removal remains attributed reporting." },
  { id: "fidelity-corroborated-attributed", expect: false, why: "laundered into officially confirmed fact",
    text: "General Dmitri Kolganov has been dismissed. The removal was officially confirmed by two sources [c900021][c900022]." },
  { id: "fidelity-pep-not-sanctioned", expect: true, why: "faithful",
    text: "Marta Kovalyk, deputy infrastructure minister, is listed as a politically exposed person (PEP) [c900031]. A PEP listing is a prominence category, not a sanction; she appears on no sanctions list." },
  { id: "fidelity-pep-not-sanctioned", expect: false, why: "PEP collapsed into sanctioned",
    text: "Marta Kovalyk is sanctioned: OpenSanctions lists her, making her a sanctioned official [c900031]." },
  { id: "fidelity-rca-no-inheritance", expect: true, why: "faithful",
    text: "Elena Shubina is listed as a relative or close associate (RCA) of the designated businessman Pyotr Shubin [c900041]. Shubin himself was designated by OFAC in 2024 for sanctions evasion [c900042]; Shubina is not herself designated." },
  { id: "fidelity-rca-no-inheritance", expect: false, why: "RCA inherits principal's conduct",
    text: "Elena Shubina is designated for sanctions evasion alongside Pyotr Shubin [c900041][c900042]." },
  { id: "fidelity-name-only-candidate", expect: true, why: "faithful",
    text: "An OpenSanctions name-only query for Oleg Danilov returned a possible match against a designated individual of the same name [c900051]; without stronger identifiers the identity is unresolved and this is a candidate match only." },
  { id: "fidelity-name-only-candidate", expect: false, why: "candidate asserted as resolved sanctioned identity",
    text: "Oleg Danilov is sanctioned — OpenSanctions returned a confirmed match [c900051]." },
  { id: "fidelity-expired-status", expect: true, why: "faithful",
    text: "No — Aurora Logistics LLC was removed from the OFAC SDN list on 2026-03-18; its 2023 designation was lifted after delisting [c900061]." },
  { id: "fidelity-expired-status", expect: false, why: "expired status presented as current",
    text: "Aurora Logistics LLC is currently sanctioned under its 2023 OFAC designation [c900061]." },
  { id: "fidelity-namesake-collision", expect: true, why: "faithful distinguishing answer",
    text: "Two distinct people named Serhiy Bondar appear in the evidence: Ukrainian media reported the arrest of a battalion commander of that name near Odesa [c900071], while the port authority deputy head attended a Kyiv meeting on 2026-07-03 [c900072]. No supported reporting shows an arrest of the port authority deputy head." },
  { id: "fidelity-namesake-collision", expect: false, why: "conflation restating the role",
    text: "Yes — Serhiy Bondar, the port authority deputy head, was arrested near Odesa on 2026-07-01 in an embezzlement investigation [c900071]." },

  // ---- day-first date formats pass (Gate 0 low) ----
  { id: "fidelity-official-designation", expect: true, why: "day-first date format",
    text: "OFAC designated Ruslan Zhurov under EO 14024 on 12 June 2026 for operating in the Russian technology sector — a Treasury sanctions designation." },
  { id: "fidelity-expired-status", expect: true, why: "day-first date format",
    text: "Aurora Logistics LLC was delisted and removed from the OFAC SDN list on 18 March 2026; the designation was lifted." },
];

describe("checked-in fidelity fixtures reward faithfulness and fail strengthening", () => {
  it("the eval set carries all eight fixtures", () => {
    for (const id of FIXTURE_IDS) fixture(id); // asserts presence + shape
  });

  for (const c of CASES) {
    it(`${c.id}: ${c.expect ? "PASSES" : "FAILS"} — ${c.why}`, () => {
      const r = scoreFidelity(c.text, c.state ?? "answered", fixture(c.id));
      if (r.pass !== c.expect) {
        // Print the full verdict so a pattern regression is diagnosable from CI output.
        expect({
          pass: r.pass,
          mustMatchMisses: r.mustMatchMisses,
          mustNotMatchHits: r.mustNotMatchHits,
          malformedPatterns: r.malformedPatterns,
          stateOk: r.stateOk,
        }).toEqual({ pass: c.expect });
      }
      expect(r.pass).toBe(c.expect);
      expect(r.malformedPatterns).toEqual([]);
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

  it("every fixture's patterns compile (no silently-dead mustNotMatch)", () => {
    for (const id of FIXTURE_IDS) {
      const spec = fixture(id);
      const r = scoreFidelity("compile probe", "answered", spec);
      expect(r.malformedPatterns, id).toEqual([]);
    }
  });

  it("every fixture's evidence is inline, synthetic-id, never empty, and marked fictional", () => {
    for (const id of FIXTURE_IDS) {
      const spec = fixture(id);
      expect(spec.evidence.length).toBeGreaterThan(0);
      expect(spec.notes ?? "", `${id} notes carry the FICTIONAL marker`).toMatch(/^FICTIONAL/);
      for (const e of spec.evidence) {
        expect(e.claimId).toBeGreaterThanOrEqual(900000); // synthetic range, never a live id
        expect(e.text.length).toBeGreaterThan(20);
      }
    }
  });
});
