# AI Search/Ask release hardening — 2026-07-21

**Branch:** `codex/ai-search-ask-release-hardening-20260721` (from integration HEAD
`063a32d`) · **Merge target:** `codex/ai-search-ask-integration-20260719` ONLY.
**Charter:** the operator's 11-area hardening directive turning the integration
branch into a production-safe Ask release candidate. Constraints held throughout:
no pushes, deploys, production writes/migrations, paid provider calls, Paddle
work, or edits to migrations 0021–0026/9999; rulings 1–5 and 20 preserved; free
`/search` and $0 `GET /ask` preserved (re-proven in the browser).

## Commits (small, area-prefixed, in order)

| SHA | Area | Summary |
|---|---|---|
| `b5150e9` | plan | work plan appended to PROGRESS |
| `d5e4568` | 1 | SDK auto-retries disabled (`maxRetries: 0` everywhere in the gateway adapter); per-attempt embed reservations; `withRetry` deleted; 429/5xx tests |
| `bddc585` | 2+3 | features.ts effective-flag resolver; opt-in shadow (`ASK_RUNS_SHADOW`); retention-gated persistence + throttled redaction/deletion sweeps; cohort allowlist; POST boundary gate |
| `dfa1a5c` | 5 | request-scoped Pools for the SSE money/tail routes; no per-event/per-poll construction; lifecycle tests |
| `304f231` | 4 | durable terminal results: bounded finalize/snapshot/terminal-event persistence retries (provider never rerun), coherent finalize→event ordering, honest `durable:false` wire fallback |
| `8fdf269` | 7 | exact-cache TTL enforced at lookup; snapshot-verified hits (else miss); progressive-only enforcement |
| `2065af3` | 6 | transactional sessions: atomic start-from-run/append/delete, FOR UPDATE serialization, typed refusals; concurrency itests |
| `fd919be` | 8 | migration **0027** (`0027_numerous_lord_tyger.sql`, additive): `ask_runs.billing_policy` + `billing_eligible DEFAULT false`; `billingEligibility()` cutover policy; `aggregateUnits` billable figures filter strictly on eligibility |
| `033a874` | 9 | migrations-lib: per-file atomic execution (statements + marker in one transaction); fixture-driven Neon-branch rollback/rerun proof |
| `c5b5ee8` | 11 | lint warning removed (replaced with a fail-loud no-POST guard) |
| `d302231` | battery fix | dispatch-window Stop classifies as CANCELLED (found by the battery's Stop scenario; unit-pinned + browser-re-proven) |

## Gate results (final tree)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — **0 errors, 0 warnings** (the pre-existing warning fixed) |
| `npm test` | **2,027/2,027** across 159 files (was 1,963/157 at integration HEAD) |
| `npm run test:integration` | **72/72** across 14 files on a disposable Neon branch (created → migrated 0021–**0027**+9999 → exercised → deleted); re-run on the final tree |
| `npm run build` | PASS (production build; the browser battery ran against it) |
| `git diff --check` | clean |
| Paid provider calls | **ZERO** — keys scrubbed in itests; the battery used `LLM_DISABLE=1` or a 127.0.0.1 mock provider with a fake key; mock request log proves 0 provider calls in the flags-off phase |

## Production-build browser battery (all 9 required scenarios)

Method: `next start` of the production build on :3130 against a **disposable
Neon fork** (`br-snowy-smoke-atrzwysn`; host verified ≠ production host before
use; migrated 0021–0027 fork-only; deleted after) with `FEATURE_AUTH_GATE`
off (anonymous identity) and either `LLM_DISABLE=1` or a local mock
OpenAI-compatible server (`OPENAI_BASE_URL=127.0.0.1:3210`, fake key, $0).
Driven by Playwright over system Chrome; console errors and page errors
collected on every page; screenshots in `docs/reviews/assets/rh-*.png`.

| # | Scenario | Verdict |
|---|---|---|
| 1 | Every new flag off | PASS — /ask answers via the server action; direct `POST /api/ask/runs` → 404 before any money path; zero mock-provider requests in the whole phase |
| 2 | Progressive + enforced runs, allowed user | PASS — progress events → terminal → /result hydration; exactly 1 paid POST; resume ref cleared |
| 3 | Non-allowlisted user on the legacy action path | PASS — with `ASK_PROGRESSIVE_COHORT` set, the (anonymous) outside-cohort identity renders the action-path form, makes 0 progressive POSTs, and a forged POST 404s. *Honesty note: with the local auth gate off this exercises the allowed-vs-refused policy branches with the anonymous identity, not two real signed-in users — the policy function itself is unit-tested for real email membership.* |
| 4 | Dropped SSE + read-only recovery | PASS — mid-run reload (8s mock delay); recovery replayed events read-only; exactly the 1 original paid POST across both page loads; DB shows one run row |
| 5 | Stop/cancel | PASS — Stop mid-generation → `run.cancelled` terminal + honest stopped copy + 1 paid POST. Found and fixed a real defect first: a Stop in the dispatch window (before the provider's first byte) classified as an error terminal; now cancelled (`d302231`). A Stop inside the run-creation race window remains silently lost (register #45 residual; the run simply completes at no extra charge) |
| 6 | Terminal persistence failure | PASS, both halves via fork triggers: (a) event-log INSERT of `run.completed` blocked → bounded retry exhausts → wire-only terminal; answer renders, /result hydrates, DB proves 0 terminal events yet a finalized row; (b) finalize UPDATE blocked → `durable:false` → answer renders from the live wire with **zero** /result fetches and no persisted terminal — no replay durability claimed anywhere |
| 7 | `GET /ask?q=` + forged `?intent=` | PASS — prefill only, ZERO POSTs (#48 holds) |
| 8 | `/search` | PASS — zero `/api/ask` requests, zero provider calls |
| 9 | Console/a11y | PASS — zero console errors and zero page errors across every scenario; `aria-busy` mirrors on the form; the `role=status aria-live=polite` region present during runs (targeted assertions; no full axe audit was run) |

## What changed, by requirement

1. **Retry/spend:** every gateway SDK client `maxRetries: 0`; embed retries
   reserve per attempt (definitive rejections settle $0 first; connection-class
   unknowns stay open for ceiling-settle expiry); tests prove a 429/5xx can
   never produce an unreserved second dispatch. Deviation recorded: the legacy
   pipeline's client also lost the SDK's hidden retries (register #72).
2. **Feature configuration:** `src/lib/ask/features.ts` is the one server-side
   resolver (page.tsx, runs POST boundary, limits, sessions, cache, streaming
   all consume it). Dependency lattice + fail-closed invalid combos tested;
   `ASK_PROGRESSIVE_COHORT` allowlist enforced at page AND API; events/result
   GETs and cancel stay owner-gated but flag-ungated for rollback safety.
3. **Persistence defaults/retention:** shadow is opt-in (`ASK_RUNS_SHADOW=1`,
   default OFF — a plain deploy stores nothing new); every persistence-backed
   feature requires valid retention envs; throttled sweeps redact run/usage
   content, rotate idempotency keys, and delete events/cache/idle sessions
   past their windows while accounting survives (unit + real-Postgres proof).
   ASK_SESSIONS remains off with no UI. **Privacy note:** with defaults off,
   the live Privacy Notice remains accurate; a retention disclosure must be
   added BEFORE any persistence-backed enablement (operator item).
4. **Durable terminals:** finalize + snapshot persists get bounded DB-write
   retries (provider never rerun); `durable` = finalized AND required snapshot
   persisted; terminal events persist only for durable results (coherence);
   otherwise wire-only + client renders without /result and claims nothing;
   replay never re-bills (pinned). Injected-failure tests at every layer.
5. **Connections:** one request-scoped Pool per SSE invocation (sink + tail
   polls); no import-time Pools; construction-count, disconnect, and cutoff
   cleanup tests. (Per-operation pools inside askWithLimits remain registered
   debt #26 — unchanged scope.)
6. **Sessions:** start/append/delete each fully transactional; `FOR UPDATE`
   serializes appends; cap enforced inside the INSERT; typed `run_in_session`
   refusal; concurrency + no-orphan proofs on real Postgres.
7. **Exact cache:** TTL enforced in the lookup predicate (expired = miss, no
   hit accounting); hits served only after verified snapshot persist, else
   demoted to a miss; progressive-mode requirement enforced server-side; TTL
   boundary/missing-snapshot/corpus-churn/persist-failure tests.
8. **Billing cutover:** additive migration 0027; eligibility requires enforce
   + `ASK_BILLING_CUTOVER_AT` (unset ⇒ never; invalid ⇒ unset) + units>0 with
   belt-and-braces payload re-checks; historical rows default false forever;
   `aggregateUnits` exposes billable figures ONLY via `billing_eligible`.
   No Paddle/entitlement code.
9. **Migrations:** per-file atomic (statements + marker, one transaction);
   fixture-proven rollback/rerun on the Neon branch; 9999 last; no existing
   migration edited.
10. **Defaults:** Fast/Deep/sessions/cache/streaming/router/analytics/Paddle
    all remain off; `ASK_FIDELITY_FALLBACK` remains **default-ON** (re-affirmed
    as the rollback knob); the adversarial named-person fidelity fixture suite
    ran inside `npm test` (fidelity-fixtures + validator suites), $0.
11. **Cleanup:** lint 0/0; ledgers/register/index updated; this report.

## Remaining operator decisions / blockers (unchanged unless noted)

- Retention values (`ASK_CONTENT_RETENTION_DAYS`, `ASK_EVENTS_RETENTION_DAYS`,
  `ASK_CACHE_TTL_DAYS`) — nothing persists until set; Privacy Notice retention
  disclosure before enablement.
- `ASK_PROGRESSIVE_COHORT` membership for the first internal rollout.
- `ASK_BILLING_CUTOVER_AT` — must stay unset until the billing contract +
  Gate 7 joint leg. Paddle/entitlements untouched.
- Production migrations 0021–0027 (apply BEFORE deploying these commits —
  the Gate 0 F5 ordering note now covers 0027 too), then deploy, then the
  explicit `ASK_RUNS_SHADOW=1` soak, then staged flag enablement.
- The paid answer-model matrix (~$1–3) before any Fast/Deep exposure.
- PostHog `ask_started` enablement.

## Release readiness

Implementation-complete and gate-green as a **release candidate on the
integration branch**: every new behavior is default-off, fail-closed, and
rollback = unset flag. Production exposure remains enablement-blocked on the
operator items above; nothing here changes production until migrations 0021–
0027 are applied and a deploy is separately authorized.
