# AI Search/Ask workstream index — started 2026-07-19

Living index of the unattended phased implementation authorized by the 2026-07-19
decision-log entries (AGENTS.md) and executed per
`docs/prompts/2026-07-19-ai-search-ask-phased-implementation.md`. Corrected in place as
phases complete.

## Branch topology

```text
main (6c21b17 at branch time)
  └─ codex/ai-search-ask-integration-20260719   (integration; passing phases merge here --no-ff)
       └─ codex/ai-search-ask-p0-measure         (Phase 0)
```

Nothing merges to `main`, pushes, or deploys without operator instruction. Phase branches
are retained after merge for inspection.

## Phase status

| Phase | Branch | Status | Gate | Reports |
|---|---|---|---|---|
| 0 — measurement, UX honesty, eval foundation | `codex/ai-search-ask-p0-measure` | **PASSED Gate 0 after fixes** (`598dcb2`); merged to integration | Gate 0 (adversarial multi-lens; 2 high + 6 med confirmed, all fixed; 0 refuted) | `AI-SEARCH-PHASE-0-measure-2026-07-19.md`, `AI-SEARCH-GATE-0-2026-07-19.md` |
| 1 — runs, idempotency, atomic reservations | `codex/ai-search-ask-p1-runs` | **PASSED Gate 1 after fixes** (`1309d46`; 1 high + 6 med confirmed, 1 refuted); merged to integration | Gate 1 (independent adversarial money review; contract frozen first: `docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md`) | `AI-SEARCH-PHASE-1-runs-2026-07-19.md`, `AI-SEARCH-GATE-1-2026-07-19.md` |
| 2 — progressive retrieval | `codex/ai-search-ask-p2-progressive` | **PASSED Gate 2 after fixes** (`04e0318`), **supplementary independent pass COMPLETED 2026-07-20 (PASS stands)**: 3 lens-divided reviewers, 0 blocker/high, 7 med + 4 low (G2S-1..11) all fixed forward on the P3 branch; merged to integration | Gate 2 (inline §5-fallback pass + banked proofs + 2026-07-20 supplementary addendum) | `AI-SEARCH-PHASE-2-progressive-2026-07-19.md`, `AI-SEARCH-GATE-2-2026-07-19.md` (with addendum) |
| 3 — validator + validated streaming | `codex/ai-search-ask-p3-validation-stream` | **PASSED Gate 3 after fixes** (red-team fixes `e48149c` + browser-battery fix `27ed1de`; 2 high + 7 med + 4 low confirmed by executed probes + 1 browser-only high-class, all fixed and pinned); unit 1,860/1,860, itest 52/52, browser 10/10+4/4+4/4; merged to integration | Gate 3 (independent 3-battery red-team, executed probes + production-build browser battery) | `AI-SEARCH-PHASE-3-validation-stream-2026-07-20.md`, `AI-SEARCH-RECOVERY-2026-07-20.md`, `AI-SEARCH-GATE-3-2026-07-20.md` |
| 4 — routing + exact cache | `codex/ai-search-ask-p4-routing-cache` | **PASSED Gate 4 after fixes** (`a335cd4` impl + `3f4242c` fixes; 0 blocker/high, 3 med + 6 low all fixed); unit 1,896/1,896, itest 56/56; merged to integration | Gate 4 (independent 2-lens review, executed probes) | `AI-SEARCH-PHASE-4-routing-cache-2026-07-20.md`, `AI-SEARCH-GATE-4-2026-07-20.md` |
| 5 — provider gateway | `codex/ai-search-ask-p5-provider-gateway` | **PASSED Gate 5 after fixes** (`2e01e9c` + `c701970`; 0 blocker/high, 1 med + 4 low; SDK byte-parity probe over all 7 moved dispatches); unit 1,915/1,915, itest 56/56; merged to integration | Gate 5 (1 independent reviewer + inline pass + mechanical equivalence) | `AI-SEARCH-PHASE-5-provider-gateway-2026-07-20.md`, `AI-SEARCH-GATE-5-2026-07-20.md` |
| 6 — investigation sessions | `codex/ai-search-ask-p6-sessions` | **PASSED Gate 6 after fixes** (`c98786a` + `10f9d54`; 1 high + 5 med + 3 low all fixed); unit 1,945/1,945, itest 61/61; merged to integration. NO UI; rollout retention-blocked | Gate 6 (1 independent reviewer, executed probes) | `AI-SEARCH-PHASE-6-sessions-2026-07-20.md`, `AI-SEARCH-GATE-6-2026-07-20.md` |
| 7 — entitlements (Ask side) | `codex/ai-search-ask-p7-entitlements` | **Subset PASSED Gate 7 after fixes** (`9578584` + `528731e`); **JOINT boundary leg BLOCKED on the absent billing contract** (checklist in the gate report); unit 1,963/1,963, itest 61/61; merged to integration | Gate 7 (independent subset review; joint leg blocked, honestly recorded) | `AI-SEARCH-PHASE-7-entitlements-2026-07-20.md`, `AI-SEARCH-GATE-7-2026-07-20.md` |
| RH — release hardening 2026-07-21 | `codex/ai-search-ask-release-hardening-20260721` | 11-area operator-directed hardening pass (retry/spend, feature resolver, retention, durable terminals, connection lifecycle, transactional sessions, cache TTL, billing cutover metadata, atomic migrations, defaults, cleanup); merged to integration | full gate battery re-run (see report) | `AI-SEARCH-RELEASE-HARDENING-2026-07-21.md` |
| REL — production release + shadow soak 2026-07-21 | `codex/ai-search-ask-release-20260721` | Privacy 1.3 (fixed Ask retention disclosure, effective 2026-07-21) ahead of persistence; operator retention config 30/7/7; production migration 0021–0027+9999; flags-off baseline deploy; `ASK_RUNS_SHADOW=1` soak. Everything else stays off (no progressive/enforce/stream/cache/sessions/router/analytics/billing/Paddle) | full final-tree gates + production baseline verification (see report) | `AI-SEARCH-RELEASE-2026-07-21.md` |

## Migrations claimed

| Number | Name | Phase | Contents | Status |
|---|---|---|---|---|
| 0021 | `0021_blushing_shiver_man.sql` | 0 | ask_usage += run_id (uuid, unique idx), started_at, stage_timings_ms jsonb, first_content_at, route_policy — purely additive | generated via drizzle-kit; fork-verified; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`; marker exactly once; idempotent re-run proven) |

| 0022 | `0022_reflective_callisto.sql` | 1 | ask_runs + ask_allowance_reservations + provider_usage_reservations — purely additive, passive until `ASK_RUNS_ENFORCE=1` | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |
| 0023 | `0023_yielding_triathlon.sql` | 2 | ask_run_events (unique run_id+seq) + ask_runs.evidence_snapshot + the #22 partial expiry index — purely additive, passive until `ASK_PROGRESSIVE=1` | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |
| 0024 | `0024_marvelous_dark_beast.sql` | 4 | ask_answer_cache (unique user_email+cache_key, created_at index) — purely additive, passive until `ASK_EXACT_CACHE=1` | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |
| 0025 | `0025_confused_ulik.sql` | 6 | ask_sessions + ask_turns (unique session+seq; unique run) — purely additive, passive until `ASK_SESSIONS=1` | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |
| 0026 | `0026_lumpy_the_fallen.sql` | 7 | ask_runs.units (nullable) — purely additive; written at finalize by the units.ts policy | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |
| 0027 | `0027_numerous_lord_tyger.sql` | RH | ask_runs.billing_policy (text, NULL historical) + ask_runs.billing_eligible (boolean NOT NULL DEFAULT false) — purely additive; eligibility set ONLY by units.ts billingEligibility() (needs enforce + ASK_BILLING_CUTOVER_AT + units>0); aggregate billable figures filter on it strictly | generated via drizzle-kit; fork-exercised; **APPLIED TO PRODUCTION 2026-07-21** (release `836b46e`) |

> **HARD enablement order (Gate 0 finding F5; applies to 0022 equally) — SATISFIED 2026-07-21 (migrated before deploy):** apply migration 0021 to production
> (`npm run db:migrate`) BEFORE deploying any build containing the Phase 0 commits.
> logUsage's INSERT names the new columns and its failures are deliberately fail-soft, so
> a deploy-first window would silently freeze every ask_usage insert — and with it the
> per-user daily count and global-budget SUM — until migrate runs (SpendGuard provider
> caps still bound actual spend). No deploy was authorized inside the implementation workstream; the 2026-07-21 release applied 0021–0027 BEFORE deploying (see `AI-SEARCH-RELEASE-2026-07-21.md`).

`9999_claim_source_trigger.sql` still sorts and applies last (verified on the fork).
The concurrent Paddle/billing workstream had no schema work in-tree at claim time
(`src/lib/billing/` absent; working tree clean at branch point).

## Feature flags / enablement gates introduced

| Gate | Default | Enabling requires |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ASK_STARTED` | unset (event never emits) | operator approval of the new PostHog event + decision-log entry |
| Paid answer-model matrix eval run (~$1–3) | not run | operator approval (recorded as enablement-blocked in Gate 0) |
| `ASK_RUNS_ENFORCE` | unset (**OFF — release hardening: default no longer shadow-writes anything**) | operator enablement AFTER prod migration (0021+0022+0027) + valid `ASK_CONTENT_RETENTION_DAYS` (enforce is INEFFECTIVE without retention — features.ts) + deploy + an explicit `ASK_RUNS_SHADOW=1` soak |
| `ASK_RUNS_SHADOW` | **ON in Production since 2026-07-21** (soak; retention 30/7/7 set; one-probe shadow row verified complete, billing_eligible false) | rollback = unset + redeploy; keep retention envs |
| `ASK_PROGRESSIVE` | unset (server-action transport; the runs POST 404s at the boundary) | operator enablement after prod migration (0023) + SSE-through-production-proxy verification; **structurally requires effective `ASK_RUNS_ENFORCE` on v2** (features.ts enforces register #44); `ASK_PROGRESSIVE_COHORT` scopes the rollout to an allowlist server-side |
| `ASK_STREAM_ANSWER` | unset (whole-answer release) | Gate 3 pass + operator cohort decision; only effective with ASK_PROGRESSIVE |
| `ASK_FIDELITY_FALLBACK` | ON by default (deterministic, $0) | rollback knob only — set 0 to disable sentence replacement (binds BOTH the whole-answer and streaming paths since Gate 3) |
| `ASK_ROUTER` | unset (constants path; router never consulted) | recording-only telemetry — safe anytime after prod migration; routing models THROUGH the policy requires the paid scorecard + a hard autoPolicy scorecard check (register #52) |
| `ASK_EXACT_CACHE` | unset (no cache reads/writes) | operator enablement after prod migration (0024); structurally requires effective `ASK_PROGRESSIVE` + valid `ASK_CACHE_TTL_DAYS` (features.ts); TTL enforced at lookup; hits are snapshot-verified or demoted to misses |
| Fast/Deep routes + mode selector UI | not servable (scorecard refusals; no UI) | the paid answer-model matrix (~$1–3, operator-blocked) incl. the fidelity fixtures, then registry scorecard entries |
| `ASK_SESSIONS` | unset (every session path unreachable; no UI exists) | the operator retention decision (§7.7 — now the concrete `ASK_CONTENT_RETENTION_DAYS` env) + prod migration (0025) + UI build; structurally requires effective enforce on v2 (features.ts) |
| `ASK_BILLING_CUTOVER_AT` | unset (**nothing is ever invoice-eligible**) | the billing contract + Gate 7 joint leg + an explicit operator decision-log entry |

Phase 0's measurement columns are passive (no flag needed; rollback = stop writing them).

## Phase 0 commits (on `codex/ai-search-ask-p0-measure`)

| Commit | Summary |
|---|---|
| `6e94ede` | ask: run ids + monotonic stage timings on ask_usage; pin /ask maxDuration |
| `c8ee6ff` | ask: honest single-line working copy; typed but disabled ask_started event |
| `7fb6e23` | evals: answer-model matrix configs + named-person source-fidelity fixtures |
| `5f6aad1` | docs: Phase 0 implementation report + workstream ledgers |
| `598dcb2` | ask/evals: Gate 0 fixes — negation-aware fidelity scoring, fixture hardening, timing lows |

## Phase 1 commits (on `codex/ai-search-ask-p1-runs`)

| Commit | Summary |
|---|---|
| `0512797` | docs: freeze the Phase 1 allowance/reservation transaction contract |
| `a942b3f` | ask: persisted runs, idempotent replay, atomic allowance + provider reservations |
| `2aea195` | docs: Phase 1 implementation report + ledger/register/index updates |
| `1309d46` | ask: Gate 1 fixes — single-snapshot cap check, reservation-day settlement, honest replay semantics, secrets isolation |

## Cumulative ledgers

- Tests: `AI-SEARCH-TEST-LEDGER-2026-07-19.md`
- Decisions/assumptions/deferred items: `AI-SEARCH-DECISION-REGISTER-2026-07-19.md`

## Final completion audit (2026-07-20, recovery session close)

- **Integration HEAD:** `ef11664` — eight `--no-ff` phase merges (0–7), all
  gates passed (Phase 7's JOINT leg honestly blocked on billing).
- **main:** `6c21b17`, UNTOUCHED. **origin:** never pushed. **Production:**
  zero writes; migrations 0021–0026 applied to disposable Neon forks ONLY.
- **Paid/external actions NOT performed:** the ~$1–3 answer-model matrix; any
  model/K default change; Anthropic key/caps; PostHog event enablement;
  Paddle/billing work of any kind; deploys; cap changes.
- **Every flag default-off:** ASK_RUNS_ENFORCE, ASK_PROGRESSIVE (couple with
  enforce — #44), ASK_STREAM_ANSWER, ASK_ROUTER, ASK_EXACT_CACHE,
  ASK_SESSIONS (retention-blocked), NEXT_PUBLIC_ANALYTICS_ASK_STARTED;
  ASK_FIDELITY_FALLBACK stays default-ON (rollback knob, binds both paths).
- **Rollback:** every phase = flag off / passive columns; migrations additive;
  9999 trigger last.
- **Final counts:** unit 1,963/1,963 (157 files); integration 61/61 (11
  files, disposable forks, all deleted); production-build browser battery
  10/10 + 4/4 + 4/4 (Phase 3, screenshots committed).
- **Phase branches retained:** p0-measure, p1-runs, p2-progressive,
  p3-validation-stream, p4-routing-cache, p5-provider-gateway, p6-sessions,
  p7-entitlements.
