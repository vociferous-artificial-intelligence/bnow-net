# AI Search/Ask test ledger — started 2026-07-19

Every verification command run during the unattended workstream, with exact counts and
environment. Append per phase; reruns after fixes get their own rows.

## Phase 0 (branch `codex/ai-search-ask-p0-measure`, WSL2 dev box)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| 1 | `npm run typecheck` | FAIL (3 errors) | ~30s | expected: eval-run.test.ts factories missing new `fidelityPass`/`fidelity` fields — fixed in-place |
| 2 | `npm run typecheck` | PASS | ~30s | after factory fixes |
| 3 | `npm test` | FAIL — 1610/1612 (2 failed) | 5.6s | expected contract updates: askMock now called with `{timings}`; working-panel copy changed — assertions updated |
| 4 | `npm test` | FAIL — 1676/1678 (2 failed) | 5.0s | (a) new actions test missed resolver mock rows; (b) **fixture-quality test caught a real fixture defect**: namesake-collision mustNotMatch fired on a *negated* mention in a faithful answer — fixture patterns sharpened to affirmative `was arrested` constructions |
| 5 | `npm test` | **PASS — 1678/1678, 140 files** | 5.1s | +66 tests over the 1,612 baseline |
| 6 | `npm run lint` | PASS | ~40s | |
| 7 | `npm run build` | PASS | ~90s | built functions-config manifest confirms `/ask` and `/api/ask` both carry `maxDuration: 60` |
| 8 | `npm run test:integration` | **PASS — 32/32, 7 files** | 13.6s | disposable Neon branch `br-wild-scene-atbj7jfu`, deleted. NOTE: the harness forks prod (pre-0021) and does NOT migrate, so this run proves no-regression, not the migration |
| 9 | fork → `scripts/migrate.ts` → contract probe → delete | **PASS** | ~60s | disposable branch `br-jolly-unit-atpw8f0z`: 0021 applied (6 statements); 5 columns with exact types; real logUsage INSERT shape ok; recordEntryTimings jsonb-merge preserved pipeline keys; duplicate run_id rejected by `ask_usage_run_id_idx` while NULL rows coexist; `_migrations` shows 0021 recorded and `9999_claim_source_trigger.sql` last; branch deleted |

Environment: local WSL2, node 24.14.0, next 16.2.10, vitest; no paid provider calls, no
production writes, no deploys anywhere in this phase. The eval matrix run is deliberately
NOT executed (operator approval required — see the decision register).

## Phase 1 (branch `codex/ai-search-ask-p1-runs`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P1-1 | `npm run typecheck` + `npm test` (after wiring) | FAIL — 9 (then 1) failed | ~90s | expected fallout: new askWithLimits opts arg (actions/route tests), pool-count assertions (shadow writes add pools — changed to created==ended pairing), the F14 fix's own old pin (units 1 → 1050), one copy assertion |
| P1-2 | `npm test` | **PASS — 1,724/1,724, 142 files** | 5.1s | +26 over Phase 0 (runs.ts mode logic, reservations fail-closed paths, enforce-mode replay/allowance/guard-threading, shadow byte-equivalence) |
| P1-3 | `npm run lint` | PASS | ~40s | |
| P1-4 | `npm run test:integration` | **PASS — 45/45, 8 files** | 23.5s | disposable branch `br-raspy-cloud-atxhsqbu`, deleted. New `ask-runs.itest.ts` (13 tests) proves the contract §7 matrix on REAL Postgres: daily-cap race, all-time-cap race, and last-allowance-slot race each lose exactly one; envelope isolation; own-settled-reservation not double-counted; idempotent settlement (actuals written once) and terminalization; release-unstarted vs started; expiry (release/ceiling-settle, allowance retained); cap-unset fail-closed with zero rows; $0 end-to-end enforce replay (1 run, 1 usage row, stored result, zero provider calls). The fork is migrated to head (0021+0022) by the new `runMigrations` export before testing |
| P1-5 | `npm run build` | PASS | ~90s | |

## Phase 2 (branch `codex/ai-search-ask-p2-progressive`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P2-1 | `npm test` (server-side increment `1d44370`) | **PASS — 1,738/1,738** | ~90s | events/routes/concurrency compiled + no regressions before the new tests landed |
| P2-2 | `npx vitest run` (events + ask + retrieve-v2 + routes suites) | PASS | ~40s | allowlist fail-closed, persist-then-emit ordering, ask() event ordering + snapshot freeze, concurrent-arm determinism with a slow vector arm, route ownership/replay/tail/cancel semantics |
| P2-3 | `npm run test:integration` | **PASS — 52/52, 9 files** | ~26s | new `ask-events.itest.ts`: exact persisted sequence with monotonic seqs; replay equality + after= filter; snapshot carries claim CONTENT + stable raw_documents ids + selection; reads write nothing. **Measured TTFC (lexical partial) on production-shaped fork data: p50 = 180ms** (samples 169/179/180/359/185) vs the <2s acceptance target |
| P2-4 | `npm test` + `npm run lint` + `npm run build` (client commit `67b93bd`) | **PASS — 1,778/1,778, 146 files** | ~3min | run-controller reducer/parser/transport tests (one POST per gesture; dropped stream resumes read-only; failed submit no-retry; resume-from-storage; ownership 404), jsdom progressive form tests (one POST + zero action calls + hydrated render; mount-resume zero POSTs; flag off fully inert) |
| P2-5 | Browser verification, PRODUCTION build (`next start`, disposable branch `br-nameless-shadow-atvw230x`, LLM_DISABLE=1 + empty key overrides beating .env.local, ASK_PROGRESSIVE=1, anonymous gate-off) | **PASS — 8/8 checks** | ~4min | real Chrome (`/usr/bin/google-chrome`): terminal render via the progressive path (both outcomes exercised: the no-coverage callout for a "this week" window past currency, then the full stub answer + cited-evidence panels for a non-temporal question); exactly ONE paid POST; resume ref cleared on terminal; GET ?q= prefill-only zero POSTs; forged ?intent= zero calls; unknown-run events 404; zero unexpected console errors. Screenshots: `docs/reviews/assets/p2-ask-{idle,terminal}.png`. Branch deleted; server stopped |

## Phase 3 (branch `codex/ai-search-ask-p3-validation-stream`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P3-1 | `npm test` (Increment A, `71e557a`) | **PASS — 1,796/1,796, 147 files** | ~90s | validator extraction byte-equivalent (existing ask suite unchanged); 15 validator tests covering the red-team classes at unit level (identity/predicate/certainty/status + over-suppression-must-not-happen) |
| P3-2 | `npm test` + `npm run lint` + `npm run build` (Increment B, `9418f13`) | **PASS — 1,819/1,819, 148 files** | ~3min | +23: SectionReleaser §6.3 matrix (holdback, denial-led releases nothing, partial marker never renders, unresolved held-then-stripped, fidelity replacement at release), streamAnswer money paths (reserve-before, exactly-once settle on clean/death/abort/dispatch-fail, refusal suppresses release, ceiling on missing usage frame), cancel watcher, ask()-level flag wiring (ON+sink streams; OFF or no sink byte-identical) |

Gate 3 red-team (independent, executed-probe instructions) + the supplementary Gate 2
independent pass run in background; their rows and verdicts append on completion.
**2026-07-20 recovery note:** that background attempt died with the session (no findings
were captured); the recovery session re-ran both reviews — rows P3-3 onward.

Recovery (2026-07-20, same branch — the interrupted session's dirty run-controller
patch proven/reworked before commit):

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P3-3 | `npx vitest run run-controller.test.ts ask-form.test.tsx` | **PASS — 47/47** | 1.5s | the 14-point recovery matrix: section dedupe by persisted seq (dup renders once; distinct id-less sections drop fail-safe, never collapse), read-rejection → read-only resume (both entry points, GET-only asserted), full replay from 0 on mount (candidates/retrieval/selection/sections/phase rebuilt; overlap-replay deduped), busy state pushed before first network byte (controller order + jsdom disabled-input), transient 502 retry with ref retained, exhaustion retains ref (register #43), 404 terminal clears ref, gesture release after terminal (fresh idempotency key on explicit resubmit). One Phase 2 pin updated: mount-resume now asserts `after=0` (contract change, register #43) |
| P3-4 | `npm run typecheck` + `npm run lint` | PASS (1 pre-existing warning) | ~70s | |
| P3-5 | `npm test` | **PASS — 1,832/1,832, 148 files** | 6.1s | +13 over P3-2 |

Supplementary Gate 2 independent pass (2026-07-20; workflow `wf_2695dde0-5bb`, 3
lens-divided reviewer agents, 442,864 subagent tokens, all read-only/$0; findings
G2S-1..11 in the Gate 2 addendum) and its fixes:

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P3-6 | reviewer probe: events-route tail poisoning (executed against the real route module, faithful Pool mock) | **CONFIRMED 2/2** | ~1s | control (no marker) delivers the later terminal; poisoned (marker replayed first) polls blind at after=1e6 for the full 50s cutoff — basis of G2S-1 |
| P3-7 | `npx vitest run` (run-controller + ask-form + runs-routes + retrieve-v2) after fixes | **PASS — 85/85** | 2.4s | new pins: marker-safe tail cursor + single-forward, consecutive-404 contract (3 tests), replay hydration via result.runId, unpersisted-terminal fallback (no run.failed rewrite), cancel single-marker idempotency, partial-emit await + rejection safety, terminal-gap busy window, intent-unconsumed-during-resume + active-question display |
| P3-8 | `npm run typecheck` + `npm run lint` + `npm test` | **PASS — 1,841/1,841, 148 files** (lint 0 errors / 1 pre-existing warning) | ~7min | +9 over P3-5 |

Gate 3 red-team (2026-07-20; workflow `wf_6422c025-876`, 3 independent battery agents
with EXECUTED probes, 405,605 subagent tokens, $0 — findings G3-1..13 + browser G3-B1
in the gate report) and the verification battery:

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P3-9 | red-team probe batteries (fidelity ~31 cases, stream ~20, client 12, money 18, watch/flags 14 — `npx tsx`, fake guards/sinks/streams, dummy DB) | 2 high + 7 med + 4 low CONFIRMED; every §6.3/money invariant otherwise clean | ~15min | probes in the reviewers' scratchpads; findings re-verified by the lead before fixing |
| P3-10 | `npm test` after red-team fixes (`e48149c`) | **PASS — 1,858/1,858, 148 files** (+17 pins) | 5.9s | typecheck clean, lint 0 errors |
| P3-11 | `npm run test:integration` | **PASS — 52/52, 9 files** | ~26s | disposable branch `br-spring-cherry-atl050ks`, deleted; itests refuse to run without INTEGRATION_DATABASE_URL |
| P3-12 | `npm run build` | PASS | ~90s | |
| P3-13 | Browser pass A — PRODUCTION build, streaming (fork `br-spring-darkness-atutd2b1`, host ≠ prod verified, migrated 0021–0023 on fork, LOCAL mock provider via OPENAI_BASE_URL, ASK_PROGRESSIVE=1 + ASK_STREAM_ANSWER=1 + ASK_RUNS_ENFORCE=1) | first run **9/10** — Stop finalized `answered` (G3-B1: graceful abort teardown in the Next runtime); after fix `27ed1de` **10/10** | ~8min | sections stream before terminal; reconciliation replaces; ONE paid POST; read-only resume with attributed question; Stop → run.cancelled; zero extra POSTs; zero console errors; 4 screenshots committed |
| P3-14 | Browser passes B/C — flags on + LLM_DISABLE=1 (**4/4**); flags off + LLM_DISABLE=1 (**4/4**) | PASS | ~3min | offline deterministic through progressive (no sections, one POST); flag-off = zero runs-POSTs (server-action transport); screenshots committed. Fork branch deleted after |
| P3-15 | `npm run typecheck` + `npm run lint` + `npm test` (final, `27ed1de`) | **PASS — 1,860/1,860, 148 files** (lint 0 errors / 1 pre-existing warning) | ~7min | |

## Phase 4 (branch `codex/ai-search-ask-p4-routing-cache`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P4-1 | `npm test` (implementation `a335cd4`) | **PASS — 1,890/1,890, 152 files** (+30) | 5.9s | registry price parity + scorecard gate; router Auto-equivalence (defaults + env overrides) + Fast/Deep refusals; cache key sensitivity + fail-soft + field stripping; askWithLimits wiring (flag-off inert, $0 hit, store policy, cache-failure=miss, route recording); snapshot hydration (F11) |
| P4-2 | `npm run test:integration` | **PASS — 56/56, 10 files** (+4) | ~26s | disposable branch `br-spring-fire-atbf56eh`, deleted: real-Postgres store/lookup + hit accounting + isolation; corpus-bump miss (F11); end-to-end $0 enforce-mode hit (zero reservations, snapshot re-persisted); normalization sharing |
| P4-3 | `npm run typecheck` + `npm run lint` + `npm run build` | PASS (0 errors / 1 pre-existing warning) | ~4min | |
| P4-4 | Gate 4 reviewer probes (2 independent agents, executed: key-sensitivity 11 knobs, wiring byte-identity, hit-row accounting capture, scorecard-spoof attempt) | 0 blocker/high; 3 med + 6 low CONFIRMED (G4-1..9) | ~16min | verdicts + dispositions in the gate report |
| P4-5 | post-fix (`3f4242c`): `npm test` + `npm run test:integration` + typecheck/lint/build | **PASS — 1,896/1,896, 152 files** unit; **56/56** itest (branch `br-falling-flower-atkywyg1`, deleted) | ~8min | +6 pins: 10-knob key matrix, matchedPhrase folding, cache:exact hit rows, anonymous guard, envNum parity, auto_env_override, nameBearing fidelity leg, country-name resolution, retention sweep |

Post-Gate-1 reruns (fix commit `1309d46`):

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P1-6 | `npm run typecheck` + `npm test` | **PASS — 1,738/1,738, 143 files** | ~90s | +14 (expired/mismatch replay branches, replayed-skip at both entry points, key-chain form/action/route pins, run-guards wiring suite) |
| P1-7 | `npm run lint` | PASS | ~40s | |
| P1-8 | `npm run test:integration` | **PASS — 49/49, 8 files** | 25.8s | branch `br-mute-pond-atgio8r3`, deleted. +4 on real Postgres: CONCURRENT createRun race (exactly one inserts), real buildAskRunGuards reservation through openai_ask/openai_embed with ledger settlement, expired-replay honesty, question-mismatch refusal (+ original still replays) |

Post-gate reruns (fixes from Gate 0 findings):

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| 10 | `npx tsx scripts/.gate0-matrix.ts` (temp harness, removed after) | **PASS — 34/34 cases** | ~5s | every Gate-0-reviewer dodge FAILS and every reviewer faithful/negating phrasing PASSES through the real scorer against the reworked fixtures, before anything was committed |
| 11 | `npm run typecheck` + `npm test` + `npm run lint` (fix commit `598dcb2`) | **PASS — 1,698/1,698, 140 files** | ~80s total | +20 tests over row 5 (negation/state-short-circuit/malformed scorer tests + the 34-case permanent fixture matrix replacing the old pairs) |

## Phase 5 (branch `codex/ai-search-ask-p5-provider-gateway`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P5-1 | `npm test` (extraction `2e01e9c`) | **PASS — 1,915/1,915, 154 files** (+19; the 1,896 pre-existing pins ALL unchanged = byte-equivalence evidence) | 6s | contract suite (openai mocked + stub, 17 cases) + import-graph rule |
| P5-2 | `npm run test:integration` | **PASS — 56/56, 10 files** | ~26s | disposable branch `br-flat-sea-atuy9hp5`, deleted |
| P5-3 | Gate 5 reviewer probe: SDK prototype-patch byte-parity over all 7 moved dispatch constructions vs `0f79b4d` + import-graph evasion demo | parity PASS; 1 med + 4 low findings (G5-1..5) | ~11min | dispositions in the gate report |
| P5-4 | post-fix: `npm run typecheck` + `npm test` | **PASS — 1,915/1,915** | ~6min | regex hardening is test-file-only; LlmBudgetError.reason additive |

## Phase 6 (branch `codex/ai-search-ask-p6-sessions`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P6-1 | `npm test` (core `c98786a`) | **PASS — 1,937/1,937, 156 files** (+22) | 6s | classifier/compaction/ownership/delete-export/reuse-tripwire suites |
| P6-2 | `npm run test:integration` | **PASS — 61/61, 11 files** (+5) | ~27s | disposable branch `br-fancy-mud-atlv1npo`, deleted: sessions on real Postgres (start/ownership/reuse-$0/delete/export) |
| P6-3 | Gate 6 reviewer probes (CJS interception harness: SQL capture, enforce refusal payloads, pure batteries) | 1 high + 5 med + 3 low CONFIRMED (G6-1..9) | ~15min | gate report |
| P6-4 | post-fix (`10f9d54`): `npm test` + `npm run test:integration` + build | **PASS — 1,945/1,945** unit; **61/61** itest (branch `br-cold-frog-atewraaq`, deleted) | ~8min | +8 pins: complete §7.7 deletion (4 surfaces), refusal/replay turn semantics, $0 pre-checks, run_ineligible, race refusal, pipeline_legacy, deleted-replay copy, classifier |

## Phase 7 (branch `codex/ai-search-ask-p7-entitlements`)

| # | Command | Result | Duration | Notes |
|---|---|---|---|---|
| P7-1 | `npm test` (subset `9578584`) | **PASS — 1,960/1,960, 157 files** (+15) | 6s | unit policy table, aggregate shape, stub contract, import-graph |
| P7-2 | Gate 7 subset reviewer (executed probes: all 10 finalize-able payload classes, regex-evasion battery) | 1 high + 4 med + 3 low CONFIRMED (G7-1..8) | ~7min | JOINT leg BLOCKED on billing — gate report |
| P7-3 | post-fix (`528731e`): `npm test` + `npm run test:integration` + build | **PASS — 1,963/1,963** unit; **61/61** itest (branches `br-lingering-river-atf5i9a9` → fix → `br-divine-smoke-atpncuk3`, deleted) | ~8min | degraded=0 pins; unskippable finalize policy; hardened import-graph |

## Release hardening 2026-07-21 (codex/ai-search-ask-release-hardening-20260721)

- Unit: **2,027/2,027 across 159 files** (from 1,963/157). New/extended:
  llm/contracts (SDK maxRetries pin, per-attempt embed reservations,
  no-unreserved-second-dispatch), ask/features (dependency lattice +
  fail-closed combos + cohort), ask/retention (sweep decisions + throttle),
  limits (durability verdicts, finalize retry, snapshot-failure cache-miss
  demotion, off/shadow/enforce mode logic), runs-routes (boundary gate,
  terminal coherence, pool lifecycle incl. abort/404 cleanup), events (sink
  takes the invocation connection), cache (TTL-at-lookup, corrupt-snapshot
  miss, per-gesture-field stripping), sessions (transaction envelopes, typed
  refusals), units (billing eligibility lattice), migrations guard (0027
  additivity), ask-form (durable:false wire rendering, no-POST resume guard),
  answer-stream (dispatch-window Stop = cancelled), ask (snapshotPersisted
  threading).
- Integration: **72/72 across 14 files** on disposable Neon branches (new:
  ask-retention, ask-billing, migrations-atomic; extended: ask-sessions
  concurrency/no-orphan proofs, ask-cache TTL boundary). Final tree re-run;
  every branch deleted.
- Production-build browser battery: **9/9 scenarios** (report
  `AI-SEARCH-RELEASE-HARDENING-2026-07-21.md`); zero console errors; zero
  paid calls (mock provider / LLM_DISABLE; fork-only writes).
