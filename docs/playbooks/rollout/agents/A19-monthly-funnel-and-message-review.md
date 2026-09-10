# A19 — Monthly funnel & message review (recurring)

**Phase:** 7 Measure · **Owner:** AGENT → OPERATOR (decides on changes) · **Depends on:**
A17 live, at least one month of data · **Feeds:** A0 re-score, A15/A16 revisions, O2
revisions · **Budget:** read-only on analytics; no spend.

(Prepend `COMMON.md`. Fill placeholders; set `<<MONTH>>`.)

## Objective

Every month, say what the funnel did, which message or page is underperforming, what
partners and support said, and what to change — with an owner per change. Then re-score the
gap register.

## Inputs

- A17 dashboards / exports for the month and the prior month; `O5` partner feedback notes;
  support and inbound email themes; `A18` wave gates; `A11` §8 targets; `A15` claim table (to
  check no claim has become false).

## Method

1. **Funnel table** — each stage: this month, last month, target, delta, by segment and by
   source. Absolute numbers and conversion rates.
2. **Message-level findings** — proof-page views vs landing views; variant results if
   running; time on the core proof surface; access-request use-case text themes (anonymised,
   counted); which segment converts and which bounces.
3. **Qualitative** — partner feedback themes with counts; support/inbound themes; quotes
   (anonymised).
4. **Claim freshness** — every SAYABLE claim on the site re-checked against its evidence;
   anything now false listed for immediate fix.
5. **Proposed changes** — ≤ 5, each: what, why (evidence), expected effect, owner, effort.
6. **Register re-score** — run A0's scoring on any step touched this month and update
   `GAP-REGISTER.md`.

## Output — `<<OUT>>/7-measure/A19-review-<<MONTH>>.md`

COMMON header (Status: REPORT). Sections 1–6.

## Done when

Numbers reconcile to the tool; every proposed change has an owner; the claim freshness
check has been run; the register is updated.

## Do not

- Do not change copy or pricing directly; propose, and let the operator decide.
