# AI Search workstream recovery — 2026-07-20

The 2026-07-19/20 unattended session stopped mid-work (credit/session limit) between
the Phase 3 implementation report commit and the two outstanding reviews (the
supplementary Gate 2 independent pass and the Gate 3 red-team). This report records
the forensic state at recovery, the ownership decision, and every recovery action.
It is appended as recovery proceeds; nothing here is rewritten.

## 1. Forensic checkpoint at recovery (2026-07-20 ~11:50 EDT / 15:50 UTC)

Reality matched the expected checkpoint exactly:

| Item | Expected | Found |
|---|---|---|
| Branch | `codex/ai-search-ask-p3-validation-stream` | same |
| HEAD | `8b9bcb3077f6c436492807171d974b0eab331dc9` | same |
| Integration branch | `codex/ai-search-ask-integration-20260719` at `a0c6e85` | same (`a0c6e85356d876dbf790286273bc1affd896aa81`) |
| Increment A / B / report commits | `71e557a` / `9418f13` / `8b9bcb3` | same |
| Dirty paths | `src/lib/ask/run-controller.ts` only | same (git status: 1 modified file, nothing staged, no untracked workstream files) |
| `git diff --check` | — | clean (no whitespace/conflict markers) |
| Gate 3 report | missing | missing (`docs/reviews/AI-SEARCH-GATE-3-2026-07-20.md` absent) |
| Supplementary Gate 2 addendum | missing | missing (gate report ends at the inline-pass acceptance table) |

Worktrees: the primary checkout plus four unrelated retained worktrees
(`-73-landing-contrast`, `-analyst-beta-remediation`, `-analyst-evidence`,
`-beta-invite-signals-x-reliability`) — none on a workstream branch, none touched.

## 2. Process / activity evidence and the ownership decision

- `src/lib/ask/run-controller.ts` mtime **2026-07-20 00:56:02 EDT**; `.git/index`
  mtime 00:47:02 EDT. Recovery began ~11:50 EDT — the tree has been untouched for
  ~11 hours. No file under `src/` or `docs/` is newer than `.git/index` except the
  one expected dirty file.
- Running processes at recovery: several `claude`/`codex` CLI sessions started
  Jul 19 on other pseudo-terminals, plus two `tsserver` instances rooted in this
  checkout (editor language service — read-only). No test runner, no build, no
  process writing the tree.
- **Decision: the prior session is stale, not live.** No process was killed; no
  file it might own was contended. Ownership taken; recovery proceeds in this
  checkout on the existing branch.

Per instructions: nothing was stashed, reset, rebased, checked out, or discarded.
The dirty patch is preserved in place and treated as hypotheses under review.

## 3. The dirty patch — contents at recovery (hypotheses, not accepted fixes)

`git diff` over `src/lib/ask/run-controller.ts` (+46/−16 lines) contains five
attempted supplementary-Gate-2 fixes, each labelled "G2S" in its comments:

1. **Section replay dedupe:** `RunViewState.sections` entries gain a `seq` key
   (from the SSE record id); the `answer.section` reducer skips a payload whose
   seq is already present. Missing/invalid record id maps to a single shared
   sentinel `seq = -1`.
2. **Rejected stream reads:** `consumeStream`'s read loop is wrapped in
   try/catch; a `reader.read()` rejection returns the state accumulated so far
   (stream-drop semantics) instead of propagating an unhandled rejection.
3. **Full-replay mount recovery:** `resumeRun` without a seed starts its replay
   at `after=0` (not the stored `lastSeq`) so candidates/retrieval/sections/phase
   all rebuild; live-continuation calls (seed given) still resume incrementally.
4. **Immediate resume UI state:** `resumeRun` pushes its seed state through
   `onState` before the first fetch so the form disables instantly on mount.
5. **404-vs-transient split:** only HTTP 404 is terminal on reconnect; any other
   non-ok/bodiless response retries within the attempt budget instead of
   destroying the resume reference.

Step 2 of this recovery evaluates each against the persisted-event contract and
the 14-point behavior matrix before any commit; findings and dispositions are
recorded in §4 below and in the Gate 2 addendum.

## 4. Recovery actions log

- **11:55 EDT** — PROGRESS.md recovery work block appended; this report opened.
  Required reading completed in full (AGENTS.md, master prompt, architecture
  review, workstream index, test ledger, decision register, Gate 2 report,
  Phase 3 report, both design notes, run-controller code + dirty diff).
- **~12:00 EDT — Step 2 verdict on the dirty patch.** Four of the five
  hypothesis fixes verified contract-correct and kept: read-rejection try/catch
  (drop semantics), full replay from 0 on mount recovery, immediate seed-state
  push, 404-vs-transient reconnect split. **One defect confirmed and reworked:**
  the section dedupe mapped a missing SSE id to a shared sentinel `seq = -1`,
  so a second id-less section would be silently dropped as a "duplicate" of the
  first — exactly the collapse failure the recovery brief flagged. Reworked
  contract (register #42): id-less prose never renders (fail-safe drop, phase
  advance kept, terminal reconciliation covers the text); valid seqs dedupe.
  **One policy gap fixed:** reconnect exhaustion previously cleared the resume
  ref, orphaning a possibly still-running billed run; the ref is now retained
  with honest copy (register #43; en+uk strings added). `backoffMs` became
  injectable for wall-clock-free tests. Proof: 47/47 focused (14-point matrix),
  typecheck+lint clean, full suite 1,832/1,832 (ledger P3-3..P3-5). The stale
  session's scratchpad probes (`/tmp/.../3e412ae5-*/scratchpad/probe-*.ts`)
  were found but treated as untrusted hypothesis sources only — no result from
  them is claimed anywhere.

- **~12:30 EDT — Step 3: supplementary Gate 2 independent pass COMPLETED.**
  Three lens-divided independent reviewers (SSE/state machine, money/
  idempotency, UX/a11y/evidence truth; workflow `wf_2695dde0-5bb`) over the
  Phase 2 diff + recovery hardening. Verdict: **the original PASS stands** —
  0 blocker/high; 7 medium + 4 low findings (G2S-1..11, one proven by an
  executed probe), all lead-verified and fixed forward on the P3 branch with
  regression tests: marker-safe tail cursor, consecutive-404 resume contract,
  replay hydration via result.runId, no-run.failed-rewrite terminal fallback,
  terminal-gap busy window, terminal-copy announcements, intent-preserved-
  during-resume + active-question display, idempotent cancel marker, partial-
  emit commit ordering, disconnect-aware tail, reconnect_404 copy. Full
  addendum appended to `AI-SEARCH-GATE-2-2026-07-19.md`; registers #44–#47;
  ledger P3-6..P3-8 (85/85 focused; 1,841/1,841 full).

- **~14:00 EDT — Step 4: Gate 3 red-team COMPLETED, PASS after fixes.** Three
  independent battery agents (fidelity / streaming-terminal-a11y / money;
  workflow `wf_6422c025-876`) with EXECUTED probes confirmed 2 high + 7 med +
  4 low findings — all fixed (`e48149c`) and regression-pinned (+17 tests).
  The full verification battery followed: unit 1,858 → 1,860, integration
  52/52 on a disposable fork, production build, and a three-pass browser
  battery on a second disposable fork with a LOCAL mock provider — which
  caught one further high-class defect (graceful abort teardown finalizing a
  Stopped run as answered in the Next runtime; fixed `27ed1de`, re-proven
  10/10). Two zombie `next-server` processes (the dead session's on :3100,
  then this session's own kill-survivor) were identified by PID/port evidence
  and removed — the second had been serving a STALE pre-fix build, which
  masqueraded as a fix failure until the served bundle was fingerprinted.
  Gate report: `AI-SEARCH-GATE-3-2026-07-20.md`; registers #48–#51; ledger
  P3-9..P3-15. Zero paid calls; zero production writes; both forks deleted.

- **~16:45 EDT — RECOVERY + WORKSTREAM COMPLETE.** After the five recovery
  steps, Phases 4–7 ran to completion under the master prompt: Phase 4
  (router/registry/exact cache, Gate 4 PASS after 3 med + 6 low), Phase 5
  (provider gateway extraction, Gate 5 PASS after 1 med + 4 low, SDK
  byte-parity proven), Phase 6 (sessions core, Gate 6 PASS after 1 high +
  5 med + 3 low — incl. completing §7.7 deletion across four content
  surfaces), Phase 7 (Ask-owned units, Gate 7 subset PASS after 1 high +
  4 med + 3 low; the JOINT billing leg blocked and recorded). Final
  integration HEAD `ef11664`; main/origin/production/Paddle/paid APIs
  untouched; final audit in the workstream index.
