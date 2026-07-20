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

---

## ADDENDUM — supplementary independent pass (2026-07-20, recovery session)

The queued independent multi-agent pass ran during the 2026-07-20 recovery
(the original background attempt died with the session and left no captured
findings — see `AI-SEARCH-RECOVERY-2026-07-20.md`). **Method:** three
independent reviewer agents with divided lenses — (1) SSE/event state machine
+ reconnect/replay, (2) money/idempotency/one-POST, (3) UX/accessibility/
evidence truth — each given the exact Phase 2 diff (`82f93a8..a0c6e85`), the
recovery hardening commit `5afdb33`, both frozen contracts, and this report's
fixed findings (excluded from re-reporting). Reviewers were required to
produce file/line evidence and executable reproduction, and to attempt
refutation before reporting; one finding (G2S-1) was proven by an executed
probe against the real route module (2/2). The implementation lead re-traced
every finding against the code before fixing. Workflow `wf_2695dde0-5bb`;
442,864 subagent tokens; all probes read-only, $0.

### Supplementary verdict

**The original PASS stands.** No blocker and no high finding: every money
invariant (free GET, one POST per gesture, read-only $0 replay, reserve-first/
settle-once) was independently re-verified clean by the money lens. The pass
surfaced **7 medium and 4 low** robustness/honesty defects in edge windows
(deduplicated across lenses), all fixed forward on the Phase 3 branch in the
same recovery session with regression tests. No history was rewritten.

### Findings and dispositions (all verified by the lead before fixing)

| # | Sev | Finding (dedup across lenses) | Disposition |
|---|---|---|---|
| G2S-1 | med | The events route's tail cursor advanced through a replayed `cancel_requested` marker (seq 1e6), blinding every later poll to the orchestrator's 1..N events — including the terminal — until the 50 s cutoff (executed probe 2/2; the client reducer had the range guard, the server tail did not) | **fixed**: marker-range rows never advance the poll cursor and forward exactly once (`CANCEL_SEQ_BASE` exported from events.ts); route test pins marker-then-later-terminal delivery |
| G2S-2 | med | `run.ref` is sent before `askWithLimits` commits the ask_runs row, and the client treated every reconnect 404 as terminal — a drop/refresh inside the creation window cleared the resume ref and orphaned a billing, executing run (defeating register #43's intent) | **fixed**: a 404 is terminal only when CONSECUTIVE (one confirmation retry after backoff); tests pin 404→200 recovery, non-consecutive reset, and repeated-404 terminal |
| G2S-3 | med | Replayed-idempotency-key runs stream under a transport run id with no ask_runs row; the client hydrated `/result` with that id → guaranteed 404 → the cited-source panels silently vanished exactly when the dedupe protection fired | **fixed**: hydration prefers the terminal payload's own `result.runId` (the ORIGINAL run, same owner); jsdom test pins the URL |
| G2S-4 | med | A billed, finalized success whose terminal `run.completed` INSERT failed was streamed AND persisted as `run.failed` — the paid answer became unreachable and the failure copy invited a re-billed resubmission | **fixed**: a pipeline success is never rewritten; on terminal-persist failure the terminal is delivered on the wire unpersisted (run-row `/result` remains the durable replay truth); route test pins no-run.failed |
| G2S-5 | med | Terminal gap: at `run.completed` the progress panel (and Phase 3's released sections) unmounted, idle example chips flashed back, and the form re-enabled — all during the `/result` round trip; a new paid gesture was dispatchable over a just-billed run | **fixed**: the hydration window stays busy (`terminalHydrating`), the panel holds with a "finalizing" status + retained sections, chips stay hidden; jsdom test pins the gap |
| G2S-6 | med | Terminal failure/cancel/exhaustion copy was never announced to assistive tech (the live region unmounts at that exact moment; the message was a plain `<p>`) — including the money-relevant "no extra charge" guidance | **fixed**: `role="status"` on the terminal message |
| G2S-7 | med | Mount-resume silently swallowed a one-click home intent (consumed the single-use entry, then dropped the dispatched submit on the runningRef guard) and rendered the resumed run under a different question's prefill with no attribution | **fixed**: the intent effect bails BEFORE consuming when a resume owns the form (entry survives for a manual submit); the progress panel now displays the active run's stored question; jsdom test pins both |
| G2S-8 | low | The cancel route's "double-cancel idempotent" claim was false — every Stop click appended a marker row (also widening G2S-1's poisoning batch) | **fixed**: guarded INSERT writes at most one marker per run; test pins `WHERE NOT EXISTS` |
| G2S-9 | low | The detached `lexical_partial` emit could commit AFTER `retrieval.completed` (its own Pool), so a tailing client's cursor passed the uncommitted partial forever; its rejection was also silently swallowed against the sink contract | **fixed**: `retrieveV2` awaits the partial's settlement before returning (dispatch concurrency unchanged, failures still swallowed by design); two tests pin await + rejection safety |
| G2S-10 | low | The events GET kept polling Postgres for up to 50 s after client disconnect (no `req.signal` check) | **fixed**: the tail loop breaks on `req.signal.aborted` |
| G2S-11 | low | One-size "connection lost" copy mislabelled non-connection failures (expired session, `route_throw`, reconnect 404) | **partially fixed**: `reconnect_404` gets distinct honest copy (`ask.progress.run_gone`); the session-expiry redirect detection split is registered debt (register #47) |

Checked clean by the supplementary pass (highlights): gate composition order on
the POST route identical to the action; auth cannot be bypassed by malformed
JSON; enqueue-after-close cannot mask a terminal for normal runs
(persist-then-emit); reserve-first/settle-once untouched by Phase 2; cancel
ownership 404 precedes any write; failed-submit key regeneration matches
register #19's blessed semantics; recovery-commit subjects (registers #42/#43)
re-verified without new defects; analytics remain content-free; locale
fallback sound for the new keys. **Operator note (register #44):**
`ASK_PROGRESSIVE=1` should be enabled together with `ASK_RUNS_ENFORCE=1` —
the runs route's replay semantics hold only under enforce.

Fix commit: see the recovery session's `ask: harden progressive transport
after the supplementary Gate 2 review` commit on
`codex/ai-search-ask-p3-validation-stream`. Verification after fixes: focused
85/85 (4 suites), typecheck clean, lint 0 errors, full unit suite
**1,841/1,841, 148 files** (ledger P3-6..P3-8).
