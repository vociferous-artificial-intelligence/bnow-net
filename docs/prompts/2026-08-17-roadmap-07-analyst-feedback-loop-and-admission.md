# Roadmap 07 — analyst feedback loop + first-cohort admission readiness

Prepares the product and the operator for real third-party analysts: a structured label
loop that turns analyst feedback into eval-set growth, plus the engineering half of the
admission checklist. Launch as soon as roadmap 03's combined scoreboard ships; do not
serialize behind 05/06.

## Read first

`AGENTS.md` · OPEN-TASKS #75 (closure note requires re-opening before real users), #13,
#20/#21/#59/#64 (i18n gates), #12 · the quality-foundation Worktree D report if D
shipped (extend it; do not duplicate) or its reviewed design if not ·
`src/lib/gate.ts`, `/welcome/legal`, `policy_acceptances` · the eval dataset contracts ·
`docs/reviews/POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md` · `/access` +
`/admin/access` flow.

## Authorization boundaries

Authorized with operator confirmation: admin-only label surface (additive migration only
if D didn't already create the table); copy changes on /access once the operator sets a
response window; one deploy. Not authorized: admitting anyone (operator action);
Terms/Privacy version bumps without explicit operator direction; any label path that
mutates claims/events/entities/digests (labels are annotations, append-only,
supersession-linked); sending outreach; PostHog scope changes.

## Part A — label loop

1. If Worktree D shipped: verify its gates still hold in production (requireAdmin first
   statement, RSC leak tests, append-only) and extend its subject types to cover the
   beta taxonomy below. If not: build the minimal version per D's reviewed design.
2. Label taxonomy (bounded enum + note): missed event · irrelevant event · wrong hedge ·
   wrong entity · insufficient corroboration · wrong/missing citation · useful lead.
   Subjects: digest event/claim, validation miss/agreement, Ask answer, signal.
3. One-click labelling FROM the surfaces analysts actually use (digest detail,
   scoreboard divergence detail) for admin/analyst roles — smallest honest UI, no new
   public routes.
4. **Weekly promotion pipeline:** a script that exports adjudicated labels in the eval
   dataset contract; promotion into held-out gate sets remains a deliberate operator
   action, exactly as the control plane requires. Document the weekly cadence in a
   short runbook.

## Part B — admission engineering

1. Re-open #75 as its closure note instructs: with real third-party users, acceptance
   records become load-bearing — verify the acceptance flow, records, and re-acceptance
   forcing on version bump against a fresh non-owner test account end to end.
2. /access response-window copy (operator supplies the promise; none is currently made).
3. Invite journey re-verification: request → approve → magic link → legal acceptance →
   signed-in home, on production, with the standing test methodology.
4. Cohort instrumentation: confirm the PostHog dashboard answers "did analyst N return,
   ask, read digests, label anything" within consent constraints; add missing insights.

## Part C — operator checklist (non-code deliverable)

Produce `docs/reviews/FIRST-COHORT-CHECKLIST-<date>.md` for the operator: counsel review
of sanctions exposure (#13) and the named-person Signals posture; cohort selection
criteria (3–5 analysts) and the lead-generation-not-finished-intelligence framing copy;
conflict-pages flag decision for the cohort; i18n native-review gates ONLY if admitting
non-English-market analysts; support/response expectations; the go/no-go criteria for
widening (≥3 external analysts active ≥2 weeks, ≥50 adjudicated labels, no unresolved
safety finding).

## Gates and completion

Standard gates; production-build authorization test for every new gated route. Fresh
reviewers: (1) authorization/leak lens (bare GET + RSC: 1 on every new surface, label
append-only, no source-text duplication); (2) product lens (labelling is one click, not
a chore — a loop analysts won't use is a failed deliverable). Fix BLOCKER/MAJOR;
re-review.

Status: `implementation-pass / admission-awaits-operator`, with the checklist complete.
