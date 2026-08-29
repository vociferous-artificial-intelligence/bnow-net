# #97 Ask-family release — merge, deploy, observation record (2026-08-29)

One resumed session executed the finite tail of the #97 Ask-family release: baseline
reconstruction, the 19:30Z predeploy observation gate, the PR #35 merge, a plain-clone
production deploy, immediate smoke, and a 5.7-hour natural-cadence observation window
closing at the 07:00Z validate. Zero manual paid calls; zero manual cron invocations;
zero env/cap/flag/model/migration/routing changes; the dirty primary checkout, the PR
feature worktree, and the corpus-v2 drafts untouched throughout. All database instants
below were derived from epoch extracts (the Neon driver's naive-timestamp rendering is
not trusted).

## 1. Baseline reconstruction (Phase 1)

Session resumed 2026-08-29 01:22Z (2026-08-28 21:22 EDT). Verified against the handoff:

- PR #35 OPEN, head exactly `f3d45b43b7759edd45f5ec5e6a36d3ec07d33e5e`, both checks
  (`gate`, `integration`) SUCCESS, `MERGEABLE`/`CLEAN`, last update 2026-08-28T12:24:34Z,
  the only open PR.
- `origin/main` = `ff9a7f1` (PR #34 docs merge), unchanged after a fresh fetch.
- Production = `dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6`: `/health` 200, stamp `b62da02`,
  DB OK, alias serving that `data-dpl-id`; latest Vercel production deploy 20h old.
- PR worktree (`bnow-net-worktrees/97-ask-wellformed-20260828`) clean at `f3d45b4`;
  release clone `/Users/go/code/bnow-net-rel-20260823` a plain clone (`.git` directory),
  clean at `bf0061b`.
- Env posture: **zero `EVAL_*` and zero `CONFLICTS_UI`** variables in Production,
  Preview, and Development (name listing + explicit grep, all three envs); Ask flags
  and retention unchanged (`ASK_RUNS_SHADOW`, 30/7/7 retention trio, daily caps; no
  enforce/progressive/stream/cache/sessions/router/billing flag present). The expired
  `MAP_USD_CAP_DAILY_OVERRIDE_*` pair remains installed (known hygiene item; the guard
  reverts by code).

Note on resuming in a fresh session: the primary checkout sits on an old branch, so its
working-tree docs are stale — current standing docs must be read from `origin/main` git
objects (`git show origin/main:...`), not the primary tree. The apparent absence of
OPEN-TASKS #97 there was checkout staleness, not repository drift.

## 2. 19:30Z predeploy observation gate (Phase 2) — PASS

- **The gate row:** `digest:intraday` run 10379, started 2026-08-28 19:31:09Z, finished
  19:36:21Z (312s), `ok=true`, `error` NULL, `counts.errors=0`, 11 digests / 8
  countries / 3 tracks, `overwriteRefusals=0`. The week's intraday digest-count band is
  8–11; 11 is in band.
- **All cron activity from the #98 deployment (2026-08-28 ~05:10Z) to session start:**
  166 runs (81 fast, 20 each telegram/X/MTProto/map, finalize+3 intradays, validate,
  enrich, datadark) — zero `ok=false`, zero unfinished, zero `error IS NOT NULL`.
- **Map:** 20/20 leases `acquired` and released, 0 `lease.lost`, 0 `batchErrors`.
- **Prior-session rows re-verified clean:** 07:00Z validate (run 10273: `ok`, errors 0,
  validated 3, unvalidated 0 — the new benign split present and quiet) and 10:00Z
  intraday (run 10300: `ok`, 10 digests, 0 errors). The 02:00Z finalize (run 10231) was
  `ok` with one `sa thin-regen` overwrite refusal — the expected persist-guard class.
- **Known bounded conditions classified, not glossed:** the OpenSanctions
  `monthly_cap` stop (enrich run 10282: `ok=true`, `stopReason: monthly_cap`, 2000/2000
  requests) is the known calendar-month cap, not a #97 regression. No GDELT failure
  occurred (all fast runs `errors=0`), so nothing needed classification there.
- **Sweep inventory:** exactly the nine historical swept rows (`finished_at` NULL +
  `ok=false`, newest = the real 08-27T18:01:42Z telegram hang) — no new sweeps.
- **Spend:** X $58.98 cumulative of $75 ($1.0320 on 08-28 of $2.50/day); map $19.95 of
  $40; reduce/digest/embed/llm_match all in their normal daily bands.

## 3. Merge (Phase 3)

The PR diff was re-inspected file-by-file before merging and matches the reviewed
Ask-family scope exactly: shared idempotent `normalizeAskQuestion` (trim →
`wellFormedSlice` 400 → trim) at all six question boundaries (`ask/actions.ts`,
`api/ask/route.ts`, `api/ask/runs/route.ts`, `ask-form.tsx` progressive submit,
`/ask?q=` prefill, home box via `intent.ts`); the array-`?q=` `typeof` guard;
`wellFormedSlice` on the runs/cache/limits identity clips (including the idempotency
question-mismatch comparison) and the sessions-history + rerank-snippet provider-bound
truncations; tests; three docs files. No unrelated files.

Merged 2026-08-29T01:27:43Z as **`6ba72b5`** ("Merge PR #35: ...", parents exactly
`ff9a7f1` + `f3d45b4`). PR #35 MERGED; `f3d45b4` contained in `origin/main`; no
unrelated commit entered `main`; zero open PRs after; the feature branch and worktree
were kept.

## 4. Release-clone preflight (Phase 4)

`bnow-net-rel-20260823` (plain clone, clean) fast-forwarded `bf0061b..6ba72b5`, clean
after. **`git diff 6ba72b5 f3d45b4` is EMPTY** — the merged tree is byte-identical to
the reviewed head, so the PR branch's green `integration` check (155/155 on disposable
Neon forks) and build evidence apply directly to the deployed tree. Fresh gates on the
clone at `6ba72b5`: `git diff --check` clean over `ff9a7f1..6ba72b5` · typecheck clean ·
lint 0 errors (3 pre-existing `no-unused-vars` warnings in
`api/cron/validate/route.test.ts`, `lib/evals/hardening.test.ts`,
`lib/usage/cron-run.test.ts` — all files PR #35 never touched, present since the
#29/#30/#32 landings) · **unit 3,451/3,451 (239 files)**. Env posture re-verified as in
§1. Rollback deployment recorded before deploying: `dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6`.

## 5. Production deployment (Phase 5)

One attempt, no retry needed. `npx vercel@latest deploy --prod --yes` from the release
clone: CLI started 01:29:30Z, deployment **`dpl_FT3Hdpt2ece4kxQHudxT2FST162p`** created
2026-08-29T01:29:35Z, READY with the CLI returning at 01:30:20Z (~45s build, in the
recent 37–49s band), `target=production`, aliased `bnow.net` + `bnow-net.vercel.app` +
`bnow-net-vociferous.vercel.app`. `/health` through the alias: HTTP 200, build stamp
**`6ba72b5`** (plain-clone deploy ⇒ real git metadata, no #78 caveat), matching
`data-dpl-id`, DB OK.

This deploy also takes the previously dormant eval/conflict code (PRs #31/#32/#33,
`bf0061b`) into the production artifact for the first time. It remains INERT: no
`EVAL_*` env exists, `CONFLICTS_UI` is absent, and the conflict surfaces were
live-verified fail-closed (§6). `main` and production are now the same commit.

## 6. Immediate smoke (Phase 6) — all green

- **Authorization matrix** (anonymous bare GET + `RSC: 1`, bodies inspected, statuses
  not trusted): `/admin/access`, `/admin/ingest`, `/digests/ru`,
  `/digests/ru/2026-08-28`, `/search?q=…`, `/entities`, `/registry`, `/middle-east` —
  all refuse as expected (307→`/signin` or 404), zero privileged tokens in any body.
  Every grep hit was classified benign: "claim" matched inside the word "dis**claim**er"
  (footer labels); "Sanctions" is the public nav Solutions item; "reliability/coverage"
  are public chrome; "benchmark/coverage/evidence" on conflict URLs are Next.js
  router-state path-segment echoes of the requested URL, not content.
- **Conflict dormancy:** `/conflicts`, `/conflicts/ru-ua`,
  `/conflicts/ru-ua/benchmark/coverage` all 404 (feature-off guard first);
  `/conflicts/ru-ua/benchmark/coverage/evidence` 307-gated; no conflict data tokens;
  `CONFLICTS_UI` absent everywhere.
- **Ask free-GET contract:** five shapes probed — bare `/ask`, ordinary `?q=`, an
  encoded astral-boundary `?q=` (🟥🟦test🟧…), a forged UUID `intent`, and array-style
  `?q=a&q=b&q=c` (the new guard's shape). All prefill-path refusals (anonymous 307);
  and across the entire probe set: `ask_runs` 1→1, `ask_usage` 42→42, reservations
  0→0, `openai_ask`+`openai_embed` requests 2077→2077 — **zero paid work, zero
  persistence**. The form was not submitted; no paid path was exercised manually.
- **Bounded runtime-log scan** (>60s after READY, no `--follow`; a 50s bounded tail —
  the CLI exposes only a recent-tail view, an accepted observability gap): info-level
  GETs only (the probes themselves), no errors, no 5xx.

## 7. Observation window (Phase 7) — 01:30Z → 07:12Z, CLOSED PASS

One finite background monitor (health-probe every ≤10 min, silent unless anomalous;
checkpoint wakes at 02:12Z / 04:12Z / 07:12Z; exits after the last) — no duplicate
watchers, no blocking sleeps.

**Monitor false-positive, disclosed:** the first monitor variant matched raw HTML for
the substring "DB OK" and fired "DB not OK" at ~01:43Z. Immediate verification showed
production healthy (HTTP 200, correct dpl id, flight payload `["DB ","OK"]`) — React
renders the status as two text nodes split by a comment, so the raw substring can never
match. The monitor was replaced with a text-extraction check (comments/tags stripped;
"DB DOWN" or unrecognized shape = anomaly) and the fix proven against the saved
response before re-arming. No production anomaly ever existed.

Window results (all on `dpl_FT3Hdpt2ece4kxQHudxT2FST162p` unless stated):

- **50 scheduled runs, zero failed / unfinished / errored:** fast 23, telegram 6, X 6,
  MTProto 6, map 6, finalize 1, intraday 1, validate 1. (>5.7h ≥ the 4h minimum.)
- **Map: 6 natural cycles** (01:40→06:40Z, ≥3 required): all leases acquired+released,
  0 lost, **`batchErrors=0`**, 332 claims total, ~$0.005–0.007/run.
- **02:00Z `digest:finalize`** — the first scheduled digest after deployment, and it
  ran on the NEW release (deployment completed 01:30Z, before it): run 10430, `ok`,
  `errors=0`, 10 digests / 8 countries / 3 tracks, one `ae thin-regen` overwrite
  refusal (expected persist-guard class, same as the prior day's `sa`).
- **04:00Z `digest:intraday`:** run 10448, `ok`, `errors=0`, 10 digests, 0 refusals.
- **07:00Z `validate`:** run 10473 (07:00:21Z, 19s), `ok`, `errors=0`, date
  2026-08-28, **validated 3 / unvalidated 0** — the benign/thrown split behaved
  correctly (all three theaters had an ISW report; no false alarm, no benign→failure
  flip).
- **Engine mix in band:** 2026-08-28 digests = 6 mapreduce cells (ru/ua/ir) + 5 legacy
  gulf cells (ae/il/om/qa/sa), the normal post-#88 matrix; digest counts 10–11 in the
  8–11 band.
- **No malformed-Unicode/provider-body errors:** zero nested/degraded errors, zero
  provider 400s, zero `batchErrors` anywhere in the window.
- **No new timeout sweeps:** inventory still exactly the nine historical rows.
- **Spend continuity:** Aug-29 partials in band (map $0.0472, reduce $0.0894, digest
  $0.0058, llm_match $0.0021, X $0.1973); **X $59.12 of $75 all-time** (~$15.9
  headroom, ~14–15 days at the recent ~$1.03–1.15/day — #101's runway estimate holds).
- **`/health` at close:** HTTP 200, `dpl_FT3Hdpt2ece4kxQHudxT2FST162p`, build
  `6ba72b5`, DB OK.
- **Bounded runtime-error scan at close:** the only error-stream lines are the known
  **#69 GramJS `CastError` noise** during healthy MTProto runs (documented since
  2026-07-15, present on prior releases; the corresponding cron rows are all `ok=true`
  with zero recorded errors) — classified unrelated, no rollback warranted.
- **No natural Ask occurred** (`ask_usage`/`ask_runs`/reservations unchanged all
  window). Live paid-path exercise of the new normalization is therefore
  **future-observable**: the next real user Ask is the first live traversal of
  `normalizeAskQuestion` on the money path. The construction is test-pinned
  (boundary sweep + 7 mutation kills) and the GET/prefill side was live-probed; no
  paid Ask was manufactured, per authorization.

## 8. What shipped / what remains under #97

Shipped and LIVE: the Ask family — all six user-question boundaries normalized
(user-controlled input, the umbrella's highest-exposure site set), identity clips and
session/rerank provider-bound truncations well-formed, array-`?q=` guard. Remaining
under the OPEN #97 umbrella, in priority order: `src/lib/embeddings/client.ts:58`
(`truncateInput` before paid `openai_embed`), `src/lib/validation/llm-match.ts:86,88`
(degrades to keyword on failure — quiet, ruling 9), and
`src/lib/analysis/anthropic-provider.ts:70` (inert, no key — #83); plus the documented
flag-off sessions residuals and deliberate exclusions recorded in OPEN-TASKS #97.

## 9. Ledger

- Paid calls: zero manual; only ordinary scheduled pipeline activity (map/reduce/
  digest/match/X per §7 spend lines).
- Production writes: none beyond those scheduled pipelines; every session query was a
  read-only SELECT.
- Untouched, verified: primary dirty checkout, PR #35 feature branch + worktree,
  corpus-v2 drafts and the 26-case operator packet, all env vars/caps/flags/models/
  crons, database configuration, migrations (none exist in the release).
- Rollback target (not needed): `dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` / `b62da02`.
