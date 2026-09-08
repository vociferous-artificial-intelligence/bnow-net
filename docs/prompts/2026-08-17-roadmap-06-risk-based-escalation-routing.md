# Roadmap 06 — risk-based escalation routing (feature-off build)

Adds risk-shaped escalation on top of the workload routing: routine work stays on the
efficient model; high-risk shapes — named-person/reputational claims, ambiguous
merge/split decisions, low-confidence validation matches — escalate to a stronger
verifier or into the adjudication queue. Escalation ADDS a check; it never replaces the
deterministic publication guard, which remains the final authority. Everything ships
feature-off and scorecard-gated.

## Read first

`AGENTS.md` · the routing seams review · `src/lib/analysis/publication-guard.ts` ·
`src/lib/analysis/synthesize.ts` + reduce merge logic · `src/lib/validation/run.ts` ·
the control-plane contracts (dispatch identity, scorecards) · roadmap 05's baseline
report (hard prerequisite: escalation thresholds must be set from measured baselines,
not intuition) · the adjudication surface if Worktree D shipped.

## Launch preconditions

Roadmap 05 Stage 2 complete (baselines exist). If Stage 3 approved a stronger verifier
model, use it; otherwise design against the strongest already-approved model.

## Authorization boundaries

Authorized: local code, tests, fixtures, docs, commits; local merges; one production
deploy feature-off with operator confirmation. Not authorized: enabling any escalation
flag in production; paid calls (prove escalation paths with mocks + the control plane's
offline modes); new models in the registry; weakening the publication guard, K=5
semantics, or fail-closed spend; auto-applying anything to entities or claims.

## Build

1. **Escalation policy as versioned config**, not scattered conditionals: per workload,
   a bounded set of triggers → action (verify-with-stronger-model | route-to-adjudication
   | annotate-only). Initial triggers, refined against the acceptance corpus:
   - reduce/digest: any event/claim carrying a disputed named-person allegation; merge
     decisions whose corroboration is single-platform or mirror-only.
   - validation: majority votes at the decision boundary (e.g. 3-2), and keyword-fallback
     results (annotate-only — they are already labelled, never silently upgraded).
   - map: documents whose extraction failed schema/quote checks on first attempt.
2. **Verifier stage contract:** the stronger model re-examines ONLY the flagged item with
   its sources; it may confirm, weaken (hedge/attribution), or route to adjudication; it
   may never strengthen certainty, add uncited facts, or bypass the publication guard.
   Every verifier call: fresh SpendGuard reservation, metered, `maxRetries: 0`, full
   dispatch identity persisted on the artifact.
3. **Spend model:** escalation volume is bounded by construction (cap per digest run +
   daily cap env, fail-closed); estimate expected volume from production data read-only
   and record it before any enablement proposal.
4. **Scorecard gate:** extend the control-plane datasets with escalation-shaped cases
   (the cross-cutting adversarial corpus already covers most shapes); the policy passes
   only if escalated-item outcomes improve named-person safety and hedge preservation
   without regressing coverage or reproducibility on the fixture matrix.
5. **Observability:** escalation counts/outcomes in `cron_runs.counts` and the funnel
   report so the operator can see rate and effect before and after enablement.

## Gates and completion

Standard gates + two fresh reviewers: (1) safety — attempt to construct an escalation
path that strengthens a claim, skips the guard, double-bills, or mutates state on the
feature-off path; (2) evaluation-science — thresholds chosen from baselines, no gaming
of the scorecard by over-escalation. Fix BLOCKER/MAJOR; re-review.

`docs/reviews/RISK-ESCALATION-<date>.md`: policy config, expected volume/cost, scorecard
evidence, enablement proposal with rollback (flag off). Status:
`implementation-pass / flag-awaits-operator-confirmation`.
