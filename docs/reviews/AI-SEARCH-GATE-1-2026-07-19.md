# AI Search Gate 1 — independent adversarial money review report

**Date:** 2026-07-19 · **Subject:** branch `codex/ai-search-ask-p1-runs`
(commits `0512797` contract, `a942b3f` implementation, `2aea195` docs) vs integration
HEAD `a761551`
**Method:** five independent lenses (transaction atomicity; end-to-end billing paths;
run/reservation state machines; frozen-contract conformance + test sufficiency;
privacy/retention/ops), each reviewer blind to authorship, every non-low finding
adversarially verified by a separate refuter. 18 agents, ~1.40M tokens, 278 tool
calls. **One finding refuted** (the reserve-as-started deviation was in fact
registered — register #12); everything else survived verification.

## Verdict

**PASS after fixes** (fix commit recorded in the workstream index). The confirmed
high and every confirmed medium are fixed and proven — most on real Postgres; the
remaining lows are fixed where cheap or explicitly registered (register #19–#28).
Post-fix: typecheck/lint clean, **1,738/1,738 unit**, **49/49 integration** on a
fresh disposable fork.

## Confirmed findings and dispositions

| # | Sev | Finding | Disposition |
|---|---|---|---|
| G1-1 | **high** (3 lenses independently) | Reserve fit-check read settled actuals and active ceilings in TWO READ COMMITTED statements while settlement (which moves spend between those tables) takes no advisory lock — a settle committing between the two snapshots vanished from BOTH sums, permitting bounded cap overshoot: the F7 race class reopened in miniature | **fixed**: the union (settled + active + run-count) is now ONE statement = ONE snapshot; a concurrently settling call is counted exactly once — as ceiling pre-commit or as actuals post-commit, never neither |
| G1-2 | med | Settlement wrote actuals to the settle-time UTC day while the fit-check windows used the reservation's day — midnight-straddling in-flight calls escaped day D's windows and inflated D+1 | **fixed**: settlement (and therefore ceiling-expiry) writes to the RESERVATION's stored day (`RETURNING day`); register #28 |
| G1-3 | med (3 lenses) | Replay of an EXPIRED (crashed/timed-out) run permanently returned the in-flight copy — "the original submission will return the answer" — a false promise, forever, on a wedged key | **fixed**: terminal-without-result replays return honest "did not complete… submit again" copy (state error, provider duplicate); proven on real Postgres |
| G1-4 | med | Replay matched (user, key) only — a reused key with a DIFFERENT question silently returned the wrong question's stored answer with full citation chrome | **fixed**: the stored question is compared; a mismatch refuses honestly (Stripe-style key-binds-payload semantics); register #19; proven on real Postgres incl. the original question still replaying correctly |
| G1-5 | med | `buildAskRunGuards` wiring (providers/ceilings/caps) tested nowhere — an envelope collision or zero ceiling would have shipped green and surfaced only on enforcement day | **fixed**: `run-guards.test.ts` pins providers/stages/ceilings/cap-envs (guard opts made public readonly); a new itest drives a REAL reservation through the real `openai_ask`/`openai_embed` envelopes on the fork, settles it, and checks the ledger |
| G1-6 | med | Contract §7.6 only partially proven: the concurrent createRun race on one key was never exercised on real Postgres, and the entry-point key chain (mount mint, intent reuse, extraction regexes) was untested — a silent chain regression would restore Phase 0 double-billing invisibly | **fixed**: concurrent-create itest (exactly one inserts, both resolve the same run); form tests pin the mount-minted UUID key and the intent-UUID reuse in the submitted FormData; action/route tests pin valid-key passthrough + malformed-key rejection |
| G1-7 | med | The itest's import of `scripts/migrate` side-loaded ALL of `.env.local` (OpenAI/Neon/Postmark/X keys, prod DATABASE_URL) into the vitest worker — one future test edit away from real paid calls in a suite documented $0 | **fixed**: `runMigrations` extracted to env-free `scripts/migrations-lib.ts` (the CLI layers dotenv on top); the itest imports the lib and additionally scrubs every paid-provider key at module load (defense in depth) |
| G1-8 | low (downgraded from med) | A bfcache-restored burned key could bind a NEW question to an OLD answer | **fixed by G1-4's question comparison** (the scenario now refuses honestly) |

Also fixed from the low list: replayed payloads no longer let the replay gesture
overwrite the ORIGINAL run's entry timings (`replayed: true` marker, both entry
points skip the patch — register #27); the e2e itest pins the global budget env so
prod-fork history cannot flake it. Registered, not coded: register #20–#26 (legacy
embed callers, orphaned slot on authorize-update failure, unused 'running' status +
sweep-index debt → 0023, the degenerate legacy+enforce combination, enforcement-flip
day, dev-only anonymous namespace, per-request overhead).

## Refuted

- "Reserve-as-started deviation is registered nowhere" — register #12 exists and the
  code comment's citation resolves; the deviation was registered before the review.

## Gate criteria re-check (post-fix)

| Criterion (master prompt §8) | Verdict |
|---|---|
| Concurrent last-slot / daily-cap / all-time-cap: exactly one wins | pass (real Postgres; the fit-check race G1-1 closed) |
| Duplicate POST / intent replay / refresh / retry: one run, one charge | pass (sequential + CONCURRENT create proven; key chain pinned end-to-end) |
| Expiry: releases unstarted, conservatively settles started | pass (+ honest replay copy for expired keys) |
| Settlement/terminalization idempotent | pass |
| Cap-unset fails closed | pass |
| Existing pipelines unaffected (flag off) | pass (1,738 unit green; shadow byte-equivalence pinned) |
| `openai_embed`/`openai_ask` isolation | pass (structural + now proven through the REAL wiring) |
| Independent adversarial money review | this report |

Enforcement remains OFF. Enablement checklist (operator-gated, in order): migrate
production (0021+0022) → deploy → shadow soak → set `ASK_RUNS_ENFORCE=1`.
