# AI Search Gate 2 — adversarial review report

**Date:** 2026-07-19 (late evening) · **Subject:** branch
`codex/ai-search-ask-p2-progressive` vs integration HEAD `82f93a8`
**Method — stated honestly:** the planned independent multi-agent review
(6 lenses + verifiers, workflow `wf_e38ef3d6-513`) **FAILED before producing any
finding**: all six lens agents errored on the session usage limit (resets 23:40
America/New_York). The empty result was treated as a failed attempt, NOT a clean
gate. Gate 2 was then completed via the master prompt §5 fallback — a separate
inline adversarial pass conducted from the diff, tests, and the frozen contract
with implementation assumptions explicitly re-derived (independent review is
MANDATORY only at Gates 1, 3, 4, and 7; Phase 2 permits the inline form). A
**supplementary independent multi-agent pass is queued for after the limit
reset** and will be recorded as an addendum here; any additional findings land as
follow-up commits on the integration branch.

## Verdict

**PASS after fixes** (fix commit `04e0318`), on the inline pass plus the
already-banked mechanical evidence: the real-Postgres transport spike (exact
sequences, replay equality, snapshot content, zero-provider-call reads, 180ms p50
TTFC), the 8/8 production-build browser verification, and 1,781/1,781 unit +
52/52 integration suites.

## Inline-pass findings (all fixed in `04e0318`)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| G2-1 | med | The client reducer could REGRESS phases: the lexical-partial emit is deliberately unawaited server-side, so its SSE forward can arrive after `retrieval.completed`; replayed duplicates could likewise re-apply — the stage line could move backwards (a UI-honesty defect for a panel whose whole contract is server-fact display) | **fixed**: phases are monotonic (`PHASE_RANK`), terminal states absorbing (a stray late `run.failed` cannot overwrite a rendered success); late candidate DATA still lands; three reducer tests pin regression, absorption, and duplicate idempotence |
| G2-2 | med | Form controls stayed enabled during a progressive run — `useFormStatus` never goes pending on that path, so the disabled-input/spinner one-submit affordance and `aria-busy` were lost (money was already safe via `runningRef`; the visible contract was not) | **fixed**: `AskFormFields` force-disables with spinner + aria-busy while the run transport is busy |
| G2-3 | med | The progress panel's `aria-live` region wrapped the WHOLE panel — every event re-announced the entire candidate list to screen readers (the token-spam class the phase's a11y lens exists to catch) | **fixed**: the live region is scoped to the status line; candidates/counts remain reachable but not force-announced |
| G2-4 | low | The failed-state copy said "this run did not complete" for connection-loss cases where the run may have completed server-side unseen — an overclaim | **fixed**: honest connection-lost copy; the money statement ("not charged twice") stays exact (en+uk) |

Checked clean on the inline pass (with fresh code re-reads, not memory): the POST
route composes the identical gate/money path as the action (auth → floor → key
validation → `askWithLimits`); replay/result/cancel are structurally read-only /
$0; one-POST-per-gesture holds across double-click, Enter, intent auto-submit, and
resume-racing-submit (`runningRef`); duplicate POSTs under enforce replay without
a second pipeline and under shadow retain documented legacy semantics with no seq
collision (per-request run ids); `preventDefault` verifiably stops the React form
action (jsdom-proven); sink-failure-after-billing settles spend in the stage
guards (register #34); event payloads carry nothing beyond /search-visible claim
text + the terminal result (allowlist enforced fail-closed); provider strings in
the result payload match the action path's existing posture and are not rendered;
snapshot content is untruncated with correct claim_sources ids; `run.ref` is
registered (#29); retention and connection-weight debts registered (#30/#33);
0023 additive with 9999 last; no-JS still posts to the server action with the
flag on. Noted as a measurement gap (not a defect): progressive runs record no
hydrateMs/totalMs entry timings — their wrapper scope will be defined with
Phase 3's streaming rework.

## Acceptance re-check (post-fix)

| Criterion | Verdict |
|---|---|
| p50 TTFC < 2s | pass — 180ms measured (ledger P2-3) |
| Stage UI only from server events | pass (+ G2-1 makes it robust to delivery order) |
| candidate ≠ selected ≠ cited | pass |
| Mid-run refresh resumes with zero paid calls | pass (jsdom + browser) |
| Flag off byte-identical | pass |
| Real stored non-stub candidates only | pass |
| Money invariants (free GET, one POST, read-only replay) | pass (browser 8/8 + route/itest proofs) |
| Browser verification (production build) | pass — screenshots committed |
