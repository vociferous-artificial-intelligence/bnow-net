# A1 — Interview synthesis

**Phase:** 1 Discovery · **Owner:** AGENT · **Depends on:** ≥ 8 `O1-*` interview reports ·
**Feeds:** A9, A10, A11, A16, O2, O5 · **Budget:** read-only; no paid calls.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Turn the operator's interview reports into the buyer-evidence base every downstream step
cites. This is the file that stops positioning, copy and design from being invented.

## Inputs

- Every file matching `<<OUT>>/1-discovery/O1-*.md`. Read all of them completely. Do not
  sample.
- `<<STRATEGY_DOCS>>` — only to identify which *assumptions* the interviews confirm or refute.

## Method

1. **Index**: table of reports — id, date, segment, role, organisation type/size/region
   (anonymised), current tools named, recording consent, interviewer.
2. **Code the transcripts** against a fixed frame, one row per observation, always with the
   report id:
   - Job to be done (what they are trying to accomplish, in their words)
   - Trigger (what makes them look for a tool / switch)
   - Current solution and what it costs them (money, hours, risk)
   - Pains (ranked by how many reports raise them unprompted)
   - Evaluation criteria (how they judge a vendor; who else is in the decision)
   - Buying process (budget owner, procurement, security review, trial expectations,
     contract length)
   - Willingness-to-pay signals (numbers they said, comparators they used, what they pay now)
   - Reaction to our concept (only if the operator tested it — the O1 template records this
     separately from the discovery portion)
   - Language bank: exact phrases for the problem, the outcome, the category, the incumbents
3. **Count, don't opine.** For every theme: number of reports raising it / total, split by
   segment. A theme raised by one person is an anecdote and is labelled as such.
4. **Disconfirming evidence**: everything that contradicts `<<STRATEGY_DOCS>>` assumptions
   (ICP ranking, price points, the wedge, the category name). Quote it.
5. **Segment verdicts**: for each ICP — strength of pain, ability to pay, access to buyer,
   evidence count — and whether the interviews support it as beachhead. Say when the sample
   is too small to conclude.
6. **Questions for the next round** the operator should add to O1.

## Output — `<<OUT>>/1-discovery/A1-interview-synthesis-<<DATE>>.md`

COMMON header (Status: SYNTHESIS), then sections 1–6 above, plus:

7. **Ten verbatims** most likely to become copy, with report ids.
8. **Assumption ledger**: `| Assumption (doc §) | Confirmed / Refuted / Untested | Reports |`.

## Done when

Every claim carries report ids; theme counts are present; the assumption ledger covers the
ICP list, the wedge, the pricing model, and the category term; disconfirming evidence has its
own section even if empty ("none found in n reports").

## Do not

- Do not merge concept-reaction data with discovery data; keep them in separate tables.
- Do not fill gaps with desk research; if interviews did not cover it, say "not covered".
- Do not name interviewees or organisations outside the private index.
