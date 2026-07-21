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

## Phase 3 — production migration · Phase 4 — baseline deploy · Phase 5 — shadow soak

(Recorded below as executed; this document is updated in place with evidence,
deployment IDs, and the final PASS/FAIL recommendation for cohort activation.)
