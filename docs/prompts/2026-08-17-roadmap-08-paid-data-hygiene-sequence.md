# Roadmap 08 — deferred paid data hygiene: #61 → #41 → #56 → #14, in order

Executes the long-parked, separately-authorized data-hygiene chain. Three standing
handoff prompts already exist and remain authoritative — this prompt SEQUENCES them with
fresh-state verification; it does not fork or rewrite them. Read each handoff in full
before its step and reconcile every figure it cites against current production (all its
counts are stale by weeks).

Existing handoffs, in execution order:

1. `docs/prompts/2026-07-16-entity-cleanup-kind-safe.md` (#61)
2. `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` (#41; runbook:
   `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`)
3. `docs/prompts/2026-07-16-facebook-source-segmentation.md` (#56)

Then #14 (source-reliability calibration) unblocks per
`docs/designs/SOURCE-RELIABILITY-CALIBRATION.md` +
`docs/prompts/2026-07-16-source-reliability-calibration.md`.

## Launch preconditions

Roadmap 02 landed (so cleanup/rescore run against the final merged schema). Independent
of roadmaps 03–07; schedule in any idle slot. Verify at launch: the #61 kind-safe fix's
deployment status; current entity population and dry-run projection (last known:
1,012 → 794 with 79 UNSAFE cross-kind merges — the reason apply is blocked); current
claim-linked OpenSanctions population and calendar-month quota (last known: 46
claim-linked missing/stub; July ledger figures are long stale).

## Hard sequencing rules (from the standing rulings — do not reorder)

- The kind-safe #61 fix must be DEPLOYED and a fresh read-only dry run reviewed before
  any cleanup approval. Zero cross-kind merges in the approved plan.
- Cleanup APPLY is an explicit operator approval of the reviewed plan, applied
  transactionally with the documented claim/source/orphan integrity checks.
- The OpenSanctions rescore runs ONLY after cleanup apply + population/quota recount +
  a separate operator spend authorization; serially to zero candidates; before/after
  totals recorded; the matcher's accepted-only and fail-closed read invariants are
  regression boundaries, not suggestions.
- Facebook segmentation (#56) is fail-closed shape-specific recovery — a share id is
  never a page; unrecoverable URL shapes stay unsegmented rather than guessed.
- #14 implements only after #56 lands, per its design's strictly-prior-citations
  methodology; do not publish a reliability score without its coverage gates.

## Authorization boundaries

Each numbered step gets its OWN operator confirmation and (where paid) spend envelope.
Nothing in this prompt authorizes skipping a handoff's internal gates. No step may
mutate `policy_acceptances`, digests, claims, or validation history. If a handoff's
premises no longer hold (schema drift from the 08-17 merges, changed populations),
STOP that step and write a reconciliation note rather than improvising.

## Completion

`docs/reviews/DATA-HYGIENE-SEQUENCE-<date>.md`: per-step fresh-state verification,
approvals, before/after populations, spend vs envelope, integrity-check results, and
updated OPEN-TASKS entries (#61, #41, #17 residuals, #56, #14). Status per step:
`complete`, `blocked / <reason>`, or `awaiting-operator`.
