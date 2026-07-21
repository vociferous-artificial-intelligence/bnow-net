# AI Search/Ask production release + shadow soak — 2026-07-21

**Release branch:** `codex/ai-search-ask-release-20260721` (from integration tip
`1ccf986`) · **Merge target:** `codex/ai-search-ask-integration-20260719`, then
fast-forward of `main` after the production migration succeeds.
**Charter:** release the hardened Ask candidate (report:
`AI-SEARCH-RELEASE-HARDENING-2026-07-21.md`) to production with every new
behavior OFF, then begin a default-invisible `ASK_RUNS_SHADOW=1` soak.
Explicitly out of scope: progressive UX, Fast/Deep, billing eligibility,
sessions, streaming, exact cache, router, Ask analytics, any Paddle work, any
paid-provider test matrix.

## Binding operator configuration

| Setting | Value |
|---|---|
| `ASK_CONTENT_RETENTION_DAYS` | `30` |
| `ASK_EVENTS_RETENTION_DAYS` | `7` |
| `ASK_CACHE_TTL_DAYS` | `7` |
| `ASK_BILLING_CUTOVER_AT` | ABSENT (nothing ever billing-eligible) |
| `ASK_FIDELITY_FALLBACK` | default-ON (untouched) |
| `ASK_RUNS_SHADOW` | off at baseline; `1` only for the soak phase |
| `ASK_RUNS_ENFORCE` / `ASK_PROGRESSIVE` / `ASK_STREAM_ANSWER` / `ASK_EXACT_CACHE` / `ASK_SESSIONS` / `ASK_ROUTER` / Ask analytics | OFF / unset |

## Phase 1 — ancestry reconciliation (PASS)

- `origin/main` = `9d556cf` (docs commit atop production `f0d34d3`); strict
  ancestor of the integration branch — no incompatible advance.
- Local `main` = `6c21b17` = origin/main + 2 unpushed docs commits (`1ac2b85`,
  `6c21b17`), both already in integration history.
- Integration tip `1ccf986` contains hardening merge `9ade369` and
  implementation tip `0b0bad7`; working tree clean.
- Migrations: 0021–0027 are all NEW files vs origin/main (pure additive);
  `_journal.json` diff is append-only (zero deletions); the runner
  (`scripts/migrations-lib.ts`) is filename-sorted so `9999` applies last,
  atomic per file, marker-idempotent.

## Phase 2 — Privacy 1.3 before persistence

Privacy 1.2 §9 stated "We do not currently promise a fixed automatic deletion
period for stored questions" — incompatible with enabling any
persistence-backed Ask surface. Changes (this branch):

- `/privacy` §9 now discloses: question/answer/evidence content retained no
  longer than **30 days**; stream/progress events no longer than **7 days**;
  exact-answer cache entries no longer than **7 days**; billing/accounting
  metadata (timestamps, token/cost figures, provider/model, outcome status)
  may be retained separately where legally or operationally required and does
  not include or extend content retention. §5 cross-references the fixed
  periods.
- `CURRENT_PRIVACY_VERSION` 1.2 → **1.3**, effective **2026-07-21** (the
  actual production release date). Terms remain 1.1 (no Terms change).
- Re-acknowledgement: driven by the existing version-pair gate
  (`isCurrentVersions` → `requireAcceptedUser` → `/welcome/legal`); every
  existing user re-acknowledges on next visit. No mechanism changes.
- Truthfulness check: the disclosure matches the shipped sweep
  (`src/lib/ask/retention.ts`), which redacts/deletes ALL Ask content
  surfaces — `ask_runs` content, legacy `ask_usage.question`,
  `ask_run_events`, `ask_answer_cache`, idle `ask_sessions`/`ask_turns` —
  keyed on the RAW retention envs (survives full flag rollback). The sweep is
  throttled and piggybacked on the Ask money path; with ongoing Ask traffic
  content ages out on schedule, and verified deletion requests remain the
  backstop (§9 unchanged there).
- Tests updated: `policies.test.ts` (1.3 pin + re-acceptance pair checks),
  `privacy/page.test.tsx` (version/date + retention disclosure + removal of
  the 1.2-era claim).

## Final-tree gates (release commit, pre-deploy)

Release commit: `b293712` on the release branch; integration tip after the
`--no-ff` merge: **`356cba5`** (the release candidate deployed to production).

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 0 warnings |
| `npm test` | **2,028/2,028** across 159 files (2,027 + the new retention-disclosure test) |
| `npm run test:integration` | **72/72** across 14 files on a disposable Neon branch (created → migrated → exercised → deleted) |
| `npm run build` | PASS (production build; the smoke ran against it) |
| `git diff --check` | clean |
| Legal-version/reacceptance tests | 54/54 targeted (policies, acceptance, welcome/legal form+actions+page, privacy page, account) — also inside `npm test` |
| Production-build browser smoke | **6/6** scenarios on `next start` :3131 against a disposable Neon fork (host verified ≠ production; deleted after): privacy13 (1.3 copy + old claim gone) · routes (/, /search, /terms, /signin, /access, /countries all 200) · freeget (`?q=` + forged `?intent=` → ZERO POSTs) · search (zero POSTs, zero /api/ask) · askpost (server-action answer with `LLM_DISABLE=1`; `POST /api/ask/runs` → 404; **0 ask_runs rows after**) · welcome (/welcome/legal → /signin for anonymous). Zero console/page errors everywhere. |
| Migration dry-run (same fork = copy of production) | 0021–0027 applied cleanly (22 → 29 markers, each exactly once); re-run idempotent ("migrations up to date"); `billing_eligible` boolean NOT NULL DEFAULT false; `claim_must_have_source` trigger intact; existing rows intact (1,698 claims / 189,098 raw_documents) |

## Phase 3 — production database migration (PASS)

- **Backup:** Neon branch `backup-pre-ask-release-2026-07-21`
  (`br-small-poetry-atf9x253`, parent = production `br-lively-haze-atvkarvn`),
  created BEFORE migration and retained — the copy-on-write recovery point.
- **Pre-state (recorded read-only):** 22 `_migrations` rows (0000–0020 + 9999);
  `ask_runs`/`ask_answer_cache` absent; 1,698 claims / 189,221 raw_documents /
  40 ask_usage / 5 users / 6 policy_acceptances.
- **Apply:** `npm run db:migrate` applied 0021–0027 in order, atomic per file.
  Second run: "migrations up to date" — **idempotency proven on production**.
- **Post-verification:** 29 markers, 0021–0027 each EXACTLY once, no
  duplicates; `ask_runs.billing_policy` (text, nullable) +
  `ask_runs.billing_eligible` (boolean NOT NULL **DEFAULT false**);
  `claim_must_have_source` trigger present and enabled; 0 claims without a
  source link; all row counts intact; `ask_runs` empty; 0 billing-eligible
  rows. (9999 was already marker-recorded in production — the runner
  correctly skips it; the trigger it installs was verified present.)
- The same chain had been dry-run REHEARSED the same day on a disposable
  fork of production (see gates above) with identical results.

## Phase 4 — baseline production deployment, all new features off (PASS)

- **Environment (Production):** added `ASK_CONTENT_RETENTION_DAYS=30`,
  `ASK_EVENTS_RETENTION_DAYS=7`, `ASK_CACHE_TTL_DAYS=7` (values verified by
  `vercel env pull`; pull file deleted). Confirmed ABSENT/off:
  `ASK_RUNS_SHADOW` (at baseline), `ASK_RUNS_ENFORCE`, `ASK_PROGRESSIVE`,
  `ASK_PROGRESSIVE_COHORT`, `ASK_STREAM_ANSWER`, `ASK_EXACT_CACHE`,
  `ASK_SESSIONS`, `ASK_ROUTER`, `ASK_BILLING_CUTOVER_AT`,
  `NEXT_PUBLIC_ANALYTICS_ASK_STARTED`. `ASK_FIDELITY_FALLBACK` untouched
  (default-ON). Existing caps unchanged.
- **Deployment path:** the Vercel project has NO Git integration (verified
  via project inspect) — a Git push cannot create a competing deployment;
  the CLI is the single authoritative path.
- **Deploy:** `dpl_GNuFfB2qqX61cRtuMdjpJTT2sLfR`
  (bnow-q9kkewfhx-vociferous.vercel.app) from main `836b46e`, Ready, aliased
  to bnow.net. `git push origin main` afterwards (9d556cf → 836b46e; pre-push
  gate re-ran green). Origin == local == deployed.
- **Baseline verification, all on https://bnow.net (never a deployment URL),
  Playwright over Chrome, zero console/page errors in every scenario:**
  - `/health` renders **build 836b46e** and DB OK.
  - Public routes 200: `/`, `/countries`, `/terms`, `/signin`, `/access`,
    `/scoreboard`; `/privacy` shows Version 1.3 / July 21, 2026 / the three
    retention windows; the 1.2-era "no fixed period" copy is gone.
  - Signed-out `GET /ask?q=` and forged `?intent=` → redirect to /signin,
    ZERO POSTs. `/search?q=` executes with zero POSTs and zero `/api/ask`.
  - Signed-in (standing verification identity, magic link recovered via the
    Postmark outbound API): stale 1.1+1.2 acceptance was FORCED to
    `/welcome/legal` showing v1.3; accepted with the optional analytics box
    left unchecked (recorded pair now Terms 1.1 + Privacy 1.3; acceptances
    6 → 7; append-only history preserved).
  - Signed-in `GET /ask?q=` → prefill only, zero `/api/ask` POSTs (#48).
  - ONE real Ask POST (server action): answered normally; `POST
    /api/ask/runs` never fired; **ask_runs stayed at 0 rows**; ask_usage
    40 → 41; `openai_ask` metered 2 requests / $0.0089 (spend-guarded, no
    reservations). No billing-eligible rows.

## Phase 5 — shadow soak started (PASS at start; 48–72 h window OPEN)

- `ASK_RUNS_SHADOW=1` added to Production; the SAME commit redeployed:
  **`dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT`** (bnow-1jkmympcu-vociferous.vercel.app),
  Ready, aliased; `/health` still stamps `836b46e`.
- Verification (fresh signed-in session; zero console errors):
  - No reacceptance re-prompt (1.3 pair already current) — the acceptance
    record survives sessions.
  - Free `GET /ask?q=`, forged `?intent=`, and `/search` → zero `/api/ask`
    POSTs and **zero new ask_runs rows**.
  - ONE real Ask POST → user-visible behavior identical to legacy (server
    action; no runs POST), and EXACTLY ONE shadow row: status `finished`,
    terminal state `answered`, result persisted, `finished_at` set,
    `settled_cost_usd` 0.0161, `units` 1, `billing_policy`
    `ask-units-v1:shadow`, **`billing_eligible` false**, idempotency key
    present; `reserved_ceiling_usd` NULL and `authorized_at` NULL (shadow
    never reserves — legacy gates stayed authoritative; snapshot is
    progressive-only by design).
  - Reservations tables (allowance + provider) at 0; `ask_run_events` 0;
    `ask_answer_cache` 0; `ask_sessions` 0.
  - Provider usage rose only by the probe's own metered calls
    (`openai_ask` 2→4 requests; $0.0161) — shadow persistence itself added
    zero provider calls and zero reservations.
  - Retention: sweeps key on the RAW retention envs (proven by unit +
    real-Postgres tests in the hardening pass); nothing in production is
    older than any window yet (oldest Ask content 2026-07-11), so current
    sweep passes are no-ops by design. `scripts/ask-shadow-soak-check.ts`
    flags any content that outlives its window.
  - Crons across both deploy boundaries: green (only the known non-fatal
    GramJS `CastError` noise, OPEN-TASKS #69). First
    `ask-shadow-soak-check` pass: **PASS — no blocking findings**.

## Soak monitoring (48–72 h)

Run `npx tsx scripts/ask-shadow-soak-check.ts` at least daily. It inspects:
run creation/finalization counts, stuck runs (>15 min non-terminal),
billing-eligible rows (must stay 0), finished-without-state /
answered-without-result (persistence failures), retention-window breaches,
reservation counts (must stay 0 in shadow), ask/embed provider spend, and
cron errors. Also watch Vercel runtime logs and the Ask/Search UX for
regressions. Exit code 2 = blocking finding.

## Rollback

- **Shadow off:** remove `ASK_RUNS_SHADOW` from Production env + redeploy
  (`npx vercel@latest deploy --prod --yes` from main `836b46e`). KEEP the
  three retention envs — the sweep keys on raw config so existing content
  keeps aging out.
- **Code rollback:** promote the previous production deployment
  `dpl_5jAidKc8rnSKmSG1gK5rP4KehwJv` (`f0d34d3`) and verify `/health`
  (additive migrations are backward-compatible; do NOT roll back or edit
  applied migrations).
- **DB recovery point:** Neon branch `backup-pre-ask-release-2026-07-21`
  (`br-small-poetry-atf9x253`) — retained.
- Privacy 1.3 does NOT roll back with a flag change: the disclosure remains
  accurate with shadow on or off.

## Recommendation

**Release + shadow start: PASS.** Every gate and production verification
passed; no unexpected errors; billing eligibility structurally impossible
(`ASK_BILLING_CUTOVER_AT` absent, defaults false).

**Cohort activation: NOT YET — HOLD.** Conditions before enabling
`ASK_PROGRESSIVE` (with `ASK_RUNS_ENFORCE=1`):
1. Clean 48–72 h soak (daily `ask-shadow-soak-check` all-PASS; no stuck
   runs, persistence failures, retention breaches, or error-rate/latency
   regressions in Vercel logs).
2. A REVIEWED, NONEMPTY `ASK_PROGRESSIVE_COHORT` allowlist (an empty value
   means ALL accepted users — never enable progressive without it).
3. An explicit operator decision-log entry. Progressive is never enabled
   automatically by the soak's success.
