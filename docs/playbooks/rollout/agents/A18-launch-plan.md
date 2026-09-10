# A18 — Launch plan

**Phase:** 6 Launch · **Owner:** AGENT → OPERATOR (dates and go decision in O7) · **Depends
on:** O2, A11 (channels), A15 (copy), A16 (packet), A17 (instrumentation), O5 (partners) ·
**Feeds:** O7, A19 · **Budget:** read-only.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Sequence the rollout from private partners to the public, with owners, dates, assets and a
claims review, so launch is a plan the operator executes rather than a day that happens.

## Inputs

- `O2`, `A11` §7 (channels, first pieces), `A15` (what copy exists), `A16` (packet), `A17`
  (what is measured), `O5` report (partners and their feedback cadence), `A0` register (what is
  still MISSING), any claims/legal rulings register in the project.

## Method

1. **Audiences and waves** — wave 1 design partners and validators; wave 2 the beachhead
   segment (named lists from the outreach roster, counts); wave 3 adjacent segments;
   wave 4 public. For each: goal, gate to proceed to the next wave (a number from A17), and
   the date window.
2. **Channel plan by wave** — from A11 §7: piece, owner, date, asset dependency.
3. **Asset checklist** — every page, email, memo, deck, post, listing, profile; status
   (exists / draft / missing), owner, due date.
4. **Claims review** — the A15/A16 claim tables consolidated; any GATED item that touches a
   launch asset with its blocking decision; the honesty rules for the weakest numbers.
5. **Operational readiness** — request-review SLA and who answers, sender domain, support
   path, rate limits and spend caps on launch-day traffic, status page, rollback plan (what
   to revert, how fast).
6. **Risks** — top five with mitigation and owner.
7. **Day-of runbook** — hour-by-hour for wave 4; what to watch in A17 dashboards; stop
   criteria.

## Output — `<<OUT>>/6-launch/A18-launch-plan-<<DATE>>.md`

COMMON header (Status: SYNTHESIS). Sections 1–7 · Sources.

## Done when

Every wave has a gate metric and window; every asset has an owner and status; the claims
review has no unresolved GATED item in a wave-1 asset; rollback is written.

## Do not

- Do not set the go date; O7 does.
- Do not include channels that A11 rejected.
