# MAP REMAP RUNBOOK + $0 ESTIMATE DRY RUN (OPEN-TASKS #33) — 2026-09-06

**This document is both the operator runbook and step 22's closing report.** §§1–9 are the
runbook (executable cold, from a clean clone); §10 is the dry run that was actually executed
against a disposable Neon fork on 2026-09-06, with its verbatim output; §11 is the
lock-replacement design note; §§12–17 are the report sections the program's COMMON §5 requires.

**D7 DISCHARGED 2026-09-08 — see §19**, which is the record of the measured run and supersedes
every `AWAITING AUTHORIZATION: D7` marker below. §§1–9 remain written as instructions (that is
what makes them executable cold); §10 is the 2026-09-06 $0 dry run; **§19 is the paid run that
was actually performed**, on fork `br-royal-resonance-atvgety1`, at a measured $0.046263.

---

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-22-remap-dry-run-runbook.md` (+ `…-48h-COMMON.md`);
  specification: `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md` §6.
- Lane / worktree: `ws2-remap` · `/Users/go/code/bnow-net-worktrees/48h-ws2-remap-20260905`.
- Branch: `48h/ws2-remap-20260905-map-remap-runbook` (off `48h/ws2-remap-20260905`).
- Base SHA: `2203150bfd2892aa5730c6d6d772777855bb3c9a` (`origin/main`, "Merge PR #56:
  Iran/Levant versioned gazetteer").
- Spend: **$0.** No paid provider call was made, by this session or by the fork-bound server.

---

## 1. What remap is, and what it is not

`scripts/map-remap.ts` drives `/api/cron/map?remap=1`. Remap mode (`map-worker.ts:582-601`)
replaces the hourly worker's `processed = false` eligibility with a **current-extractor-version
anti-join**: it selects canonical (no `doc_dedup` row), already-dispositioned documents
(`processed = true OR a doc_map_state row exists`) whose applicable track(s) have **no**
`doc_map_state` row at the version `mapExtractorVersion()` returns today, and maps those
doc-track pairs.

It never resets `processed`, never deletes or rewrites a historical `doc_claims` /
`doc_map_state` row, and never mutates a historical extractor version. Superseded rows stay as
append-only history — which is also the rollback: revert the version basis and every
current-version consumer (ruling 13, `src/lib/analysis/map-versions.ts`) sees the old rows again.

**The tool has never been executed against PRODUCTION** — production `cron_runs` still holds
zero `map:remap` rows (per the 2026-08-23 and 2026-08-24 decision-log entries, re-verified
2026-09-08). It was rehearsed in estimate mode on a fork 2026-09-06 (§10) and **executed in
`--execute` mode on a fork 2026-09-08** (§19: one ir/military day, 701 pairs, $0.046263). Both
targets were a local server bound to a disposable Neon fork.

### 1.1 Flags, corrected against the source

There is **no** `--estimate`, `--resume`, `--dry-run` or `--base` flag. Verified on
`scripts/map-remap.ts` at this base:

| | |
|---|---|
| Estimate mode | the **default** — omit `--execute` (`:405-408`) |
| Paid mode | `--execute`, which **requires** `--budget <USD>` (`:676`) |
| Route target | `MAP_BACKFILL_BASE` env **only**, default `https://bnow-net.vercel.app` = **production** (`:694`) |
| Resume | implicit, via the checkpoint file under `data/remap-state/<key>.json` (gitignored, `.gitignore:15`) |
| Flags | `--theater` (required) · `--track` · `--from` / `--to` · `--budget` · `--cap` · `--limit` · `--state` · `--base-ack` · `--wait-daily` · `--execute` |

Every numeric flag is parsed fail-closed before the driver is constructed
(`parseUsdFlag` / `parseCountFlag`, `scripts/map-backfill.ts:150-176`): a NaN bound would compare
false against every threshold and silently remove the ceiling.

### 1.2 `--base-ack` (new in this step's companion PR)

`MAP_BACKFILL_BASE` is the only target input and its default is production, so a forgotten
export aims a remap at the live corpus. `assertBaseAck` (`scripts/map-remap.ts:215-227`) refuses
at the CLI boundary — before the driver is constructed and therefore before any route call,
estimate runs included — unless the target host is loopback (`127.0.0.1`, `localhost`, `::1`) or
`--base-ack <exact host>` names it. An unparseable base fails closed.

```
$ MAP_BACKFILL_BASE=https://bnow-net.vercel.app npx tsx scripts/map-remap.ts --theater ir
map-remap: base "bnow-net.vercel.app" is not loopback — pass --base-ack bnow-net.vercel.app
to target a deployed route (production is the default target; a checkpoint is bound to the target)
```

---

## 2. The measurement-path decision (R4)

Under the deployed baseline, **remap has zero pending work**: every dispositioned document
already carries a current-version `doc_map_state` row, so the anti-join is empty and the driver
would print `REMAP COMPLETE (nothing was eligible …)` over nothing. A rehearsal needs a version
change. The three candidates, from PLAN-WS-2 §6.1:

- **(a) `MAP_CONTENT_CHARS=1499` on the fork-bound server only — used here.**
  `mapExtractorVersion()`'s basis is `[model, system prompt, frame rev, content=mapContentChars()]`
  (`src/lib/analysis/map-prompts.ts:254-266`), so a one-code-unit change to the content budget
  yields four new extractor versions with **zero code change**, no branch divergence, the
  baseline model untouched (so `estDispatchBlocked` stays null and the map activation lock is
  never approached), and full reversibility by unsetting the env. The four literal version pins
  in `src/lib/analysis/map-prompts.test.ts:211-226` `delete` `MAP_CONTENT_CHARS` first, so they
  are unaffected.
- (b) prompt-hash code bump on an unmerged branch — same effect, but the run's identity then
  lives in an unmerged commit and the version-pin test fails on that branch by design.
- (c) scoped relaxation of the map activation lock — **forbidden this window**
  (COMMON §3: `src/lib/llm/model-config.ts:155-162` is never edited). It was not edited;
  `git diff origin/main -- src/lib/llm/model-config.ts` is empty.

**R4 is not formally signed in the decision log.** The prompt's correction block names PLAN-WS-2
§WS-2.3 — "including its recommended R4 path (`MAP_CONTENT_CHARS` on the fork-bound server only)"
— as the specification, so option (a) was executed on that basis. It costs $0, changes no code,
and touches nothing outside a disposable fork; §15 still lists R4 for a formal entry.

> **The bump is deliberately artificial.** `MAP_CONTENT_CHARS=1499` is a *rehearsal* version, not
> a proposed production one. It exists to make the anti-join non-empty so the driver can be
> exercised end to end. A real remap would be driven by a real prompt/model revision.

---

## 3. Preconditions

1. `git status` clean on the branch you intend to run from; `npm install` done in this worktree.
2. PR #50 (step 02, the reworded driver header) merged — it is, at this base.
3. This step's `--base-ack` guard merged, or present on the branch you run from.
4. `.env.local` present in the worktree (`cp /Users/go/code/bnow-net/.env.local .`; gitignored,
   never committed) with `NEON_API_KEY` + `NEON_PROJECT_ID`. Confirm `git status` still shows it
   untracked/ignored.
5. Port 3000 free: `lsof -ti :3000` prints nothing. An orphaned server from an earlier run would
   otherwise be graded as if it were yours (`src/integration/authz-page-gate.itest.ts:167-181`
   makes the same check for the same reason).
6. `npm run typecheck && npm run lint && npm test` green.

---

## 4. Create the disposable fork

```
npx tsx scripts/neon-branch.ts create
# -> {"branchId":"br-…","connectionString":"postgres://…"}
```

Record the `branchId` — you need it to delete the fork, and the decision-log entry names it.
The name is auto-generated (`itest-<epoch-ms>`, `scripts/neon-branch.ts:28`); there is no
`--name` flag.

A Neon branch is an instant copy-on-write fork of production: schema **and** data **and** roles.
Consequences that matter here:

- It is already migrated through 0027 — **do not run `npm run db:migrate`**.
- It copies `provider_usage`, including the `openai_map` all-time total and today's row. That is
  what §8's cap arithmetic is computed from, and it is why a measured run's caps must be set
  *relative to the copied totals* rather than to the ceiling you are willing to spend.
- Everything you write during the rehearsal is written to the fork and dies with it.

Never put the connection string in a file that git tracks. Below it is read from a
`chmod 600` file outside the repo.

---

## 5. Start the fork-bound server

The server is the thing that talks to the provider, so the **server's** env is where the cost
safety lives (COMMON §4.8; the pattern is `src/integration/authz-page-gate.itest.ts:38-56,148-163`).
`next build` / `next start` run `@next/env` themselves, which loads `.env.local`; `@next/env`
never overrides a var that is already **present**, and `""` is present — so paid keys must be
**blanked, not unset**, or `.env.local` puts the real ones back.

```bash
cat > /tmp/remap-server-env.sh <<'EOF'
export DATABASE_URL="$(cat /tmp/fork_url)"      # the fork, never production
export CRON_SECRET="$(cat /tmp/remap_cron_secret)"   # openssl rand -hex 16, local only
export OPENAI_API_KEY=""
export ANTHROPIC_API_KEY=""
export POSTMARK_SERVER_TOKEN=""
export RESEND_API_KEY=""
export X_API_KEY=""
export OPENSANCTIONS_API_KEY=""
export LLM_DISABLE=1
export MAP_CONTENT_CHARS=1499                   # R4 (a): the rehearsal version bump
export AUTH_SECRET="remap-dry-run-local-secret" # silences an Auth.js MissingSecret log line
export NODE_ENV=production
EOF
chmod 600 /tmp/remap-server-env.sh

source /tmp/remap-server-env.sh && ./node_modules/.bin/next build
source /tmp/remap-server-env.sh && ./node_modules/.bin/next start -p 3000 > /tmp/remap-server.log 2>&1 &
until curl -fsS http://localhost:3000/health >/dev/null; do sleep 1; done
```

Why each of those matters:

- `ANTHROPIC_API_KEY=""` alongside `OPENAI_API_KEY=""` is required until PR #52 (step 09) is on
  `main`: before it, `getProvider()` selects the Anthropic provider whenever the OpenAI key is
  blank — a path with no `SpendGuard` and no registry approval (COMMON §4.8).
- `POSTMARK_SERVER_TOKEN=""` because `withCronRun`'s start path runs the map watchdog outside
  vitest and can email from fork state.
- `LLM_DISABLE=1` is belt-and-braces for the estimate phase; a dry run never reaches
  `assertLlmEnabled` anyway (`map-worker.ts:856`, after the `dryRun` return at `:822-855`).
- `MAP_CONTENT_CHARS` must be on the **server**, not the driver: the route computes the versions.
- `next build` rewrites `next-env.d.ts`; snapshot it (`cp next-env.d.ts /tmp/`) and restore it
  afterwards so the working tree is untouched.

Confirm `/health` reports `DB OK` and that the row counts are the production-scale copy, i.e.
that you are talking to the fork and not to an empty database.

---

## 6. Estimate mode ($0)

The driver's env is separate from the server's: it needs the same `CRON_SECRET` and the target.

```bash
export CRON_SECRET=$(cat /tmp/remap_cron_secret)
export MAP_BACKFILL_BASE=http://localhost:3000     # loopback: no --base-ack needed

npx tsx scripts/map-remap.ts --theater ir --track military --from 2026-08-25 --to 2026-08-31
```

Phase 1 issues **one dry route call per day** with `dry=1&cap=20000` (`scripts/map-remap.ts:373`).
A dry run takes no lease, writes nothing anywhere, makes no provider call, and is deliberately
absent from `cron_runs` (`src/app/api/cron/map/route.ts:100-104`). Read the printout as:

| Printed | Source | Meaning |
|---|---|---|
| `eligible=` | `counts.selected` | documents the remap predicate selected that day (**not** work — it includes documents with no applicable track) |
| `pairs=` | `counts.docTrackPairs` (`map-worker.ts:819`) | doc-track pairs that actually need mapping — **the unit of work** |
| `batches=` | `counts.batches` | micro-batches at `mapBatchSize()` = 20 (`map-worker.ts:87-91`) |
| `est=` | `counts.estUsd` (`map-worker.ts:822-841`) | chars-based model: 650 prompt tokens/call + 0.32 tok/char per doc line (capped at `mapContentChars()+60`), 135 completion tokens/pair, priced by `src/lib/llm/pricing.ts` |
| `TARGET model=` | `counts.estModel` | the model a live run would dispatch |
| `version <track>:<theater> ->` | `counts.remapVersions` (`map-worker.ts:854`) | the extractor version the work would be written under |
| `ELIGIBLE … ESTIMATE TOTAL` | driver totals | range totals |

**Acceptance gate: `estDispatchBlocked` must be absent/null.** The driver prints
`!! THIS CONFIGURATION WOULD BE REFUSED AT EXECUTION: …` when the server's resolved map
configuration is unpriced, unapproved, or activation-locked (`map-worker.ts:853`,
`scripts/map-remap.ts:399-401`). If it appears, stop: the paid run would refuse every batch.

Two printout details that are correct but read oddly:

- `(budget $0)` appears when `--budget` is omitted. That is fine in estimate mode — the
  estimate-over-budget gate is only reached under `--execute` (`:410-412`), and `--execute`
  without `--budget` is refused outright (`:676`).
- `ELIGIBLE: N docs` repeats the same `N` across every track of one theater, because `selected`
  is a per-day document count and the track filter applies later, at the pair stage.

Run it once per live (theater, track) pair. Today those are exactly six:
ru/military, ua/military, ir/military, ru/elite_politics, ir/elite_politics, ir/nuclear
(`src/lib/analysis/tracks.ts:202,213,221`).

### 6.1 Sanity checks before believing the numbers

1. **Zero eligible is ambiguous.** The driver says so itself: "already current under these
   versions" and "never in scope" are the same observation (`:352-359`). If the range prints
   zero, re-check theater/track/dates before reading any COMPLETE as coverage.
2. **The version really moved.** Cross-check the route's `remapVersions` against the local
   calculator, and check that the env-absent basis still reproduces the four pinned
   deployed-corpus versions:
   ```
   MAP_CONTENT_CHARS=1499 npx tsx -e 'import {mapExtractorVersion} from "./src/lib/analysis/map-prompts"; …'
   npx tsx -e '…'   # same, with the env absent
   ```
3. **No day is truncated by the dry cap.** Phase 1 uses `cap=20000`; if any day's eligible
   document count reaches it, that day's estimate is a floor. Check on the fork:
   `SELECT max(n) FROM (SELECT count(*) n FROM raw_documents … GROUP BY date) t`.

---

## 7. Cost formulas

Two units, and they answer different questions. Report both; the second is the one that scales.

```
per-1k-documents-scanned  =  estUsd / eligible docs      × 1000
per-1k-pairs-mapped       =  estUsd / docTrackPairs      × 1000
```

Corpus-scale projection for a (theater, track):

```
projected USD  =  (eligible doc-track pairs over the whole epoch range)  ×  per-1k-pairs / 1000
```

Take the pair count from a **full-range dry run** (`--from 2026-07-04` = `MAP_EPOCH`,
`map-worker.ts:~70`) rather than extrapolating a week: document mix, language mix and the
lexicon hit rate vary by day and by theater, so a week-scaled projection is a band, not a point.

Measured (D7 only), computed on the fork:

```
measured per-1k-pairs = (fork provider_usage.openai_map delta) / pairs dispositioned × 1000
```

cross-checked against the driver's own `actual $…` line and `claims` count. The two will not be
identical — the driver sums the route's `estUsd`, which for a *live* call is the metered figure
recorded by the guard, so they should agree closely; a large divergence means a call was
double-counted or a batch was billed and discarded (lease loss), and both are worth chasing.

---

## 8. The measured run — **only** with a signed D7 entry naming a ceiling `C`

Do not run any of this without it. **D7 was signed 2026-09-07 and this procedure was executed
2026-09-08 — the record is §19.** The steps below stay in the imperative because they are the
procedure for the *next* measured run (another theater/track, or the full epoch range), each of
which needs its own authorization; D7's $10 outer bound already covers a second (theater, track)
day without new approval.

1. **Restart the server** with `OPENAI_API_KEY` set, `LLM_DISABLE` unset, `MAP_CONTENT_CHARS=1499`
   unchanged, everything else in §5 unchanged. Keep `POSTMARK_SERVER_TOKEN` blank.
2. **Compute campaign-local caps from the fork's COPIED ledger, not from `C` alone.** The fork
   carries production's `openai_map` history, and both caps are compared against *cumulative*
   totals, so setting them to `C` would refuse the very first reservation.
   ```sql
   SELECT sum(est_usd) AS t FROM provider_usage WHERE provider = 'openai_map';                   -- T
   SELECT est_usd AS d FROM provider_usage WHERE provider = 'openai_map' AND day = CURRENT_DATE; -- D
   ```
   Set on the server: `MAP_SPRINT_USD_CAP = T + C` and `MAP_USD_CAP_DAILY = D + C`.
   `LLM_SPRINT_USD_CAP` is *not* the lever — map reads `MAP_SPRINT_USD_CAP` first and falls back
   to the shared backstop only when it is unset (`src/lib/usage/llm-guard.ts:167-170`).
   Deleting the fork's `openai_map` rows would give cleaner arithmetic but the fork would stop
   being an honest copy; not recommended.
3. **Reservation semantics are threshold-based**, not predictive: `tryReserve` refuses when
   `already-spent + this-run >= cap` (`src/lib/usage/spend-guard.ts:121-140`, `>=`). Terminal
   spend can therefore exceed `C` by up to one batch's cost. The decision-log entry must say so.
4. **Run one day, bounded twice over:**
   ```
   npx tsx scripts/map-remap.ts --theater ir --track military \
     --from <day> --to <day> --execute --budget C --limit 1000
   ```
   Never `--execute` without both `--budget` and `--limit`. `--budget` bounds modelled *and*
   actual spend (`:410-412`, `:501-512`); `--limit` bounds attempted doc-track pairs (`:534-545`).
   Both aborts are resumable and neither can re-bill: `doc_map_state` — not the checkpoint — is
   the no-rebill authority.
5. **Record**: the driver's final `REMAP …` line, the fork's `provider_usage` `openai_map` row
   before and after, `doc_map_state` rows created at the new version, and the claims count.
6. **Delete the fork** (§9). The ledger row dies with it; nothing touched production's.

Two operator caveats that carry over from the driver header and apply to any *production* remap
later (they do not bite on a fork): remap meters to the **same** `openai_map` row and the **same**
`MAP_USD_CAP_DAILY` as the hourly `:40` cron, so a large remap can push the next scheduled run
into a `daily_cap` stop (which by the 2026-08-15 contract records `cron_runs.ok=false` and alerts);
and a day's `complete` flag is not invalidated by that day's document population changing, so a
late-arriving back-dated document is silently skipped by a re-run until the checkpoint file is
deleted.

---

## 9. Abort / rollback

```
pkill -f "next start -p 3000"
npx tsx scripts/neon-branch.ts delete <branchId>
cp /tmp/next-env.d.ts.bak next-env.d.ts     # if next build changed it
rm -rf data/remap-state/                    # gitignored scan checkpoints
```

Nothing on production changes, and the properties that make that true are structural, not
procedural: the route target was loopback (`MAP_BACKFILL_BASE=http://localhost:3000`, printed in
the driver banner on every run), the checkpoint key is bound to both the extractor versions and
the normalized target (`scripts/map-remap.ts:136-176,415-437`), and `MAP_CONTENT_CHARS` lived
only in one shell's exported env.

If a *production* remap ever needs rolling back: unset the version bump. The old-version rows
were never touched, so every `map-versions.ts` consumer immediately reads them again (ruling 13).

---

## 10. The dry run that was executed (2026-09-06)

Fork `br-wispy-frog-at07iym7` (created and deleted this session — see §10.5), local
`next build && next start -p 3000` with the §5 env, `MAP_CONTENT_CHARS=1499`, every paid key
blank, `LLM_DISABLE=1`. `MAP_BACKFILL_BASE=http://localhost:3000` on every command; the
production route was never contacted. **$0.**

### 10.1 The version bump landed, and the baseline is unchanged

Route-reported (`counts.remapVersions`) and independently recomputed locally — identical:

| track:theater | deployed baseline (env absent) | rehearsal (`MAP_CONTENT_CHARS=1499`) |
|---|---|---|
| military:ru | `gpt-4o-mini:d73cc83ed8df` | `gpt-4o-mini:8c4c54320590` |
| military:ua | `gpt-4o-mini:d73cc83ed8df` | `gpt-4o-mini:8c4c54320590` |
| military:ir | `gpt-4o-mini:75e0ff6403db` | `gpt-4o-mini:1bfad9e5e447` |
| elite_politics:ru | `gpt-4o-mini:15a6078371bd` | `gpt-4o-mini:64ac8d322a3d` |
| elite_politics:ir | `gpt-4o-mini:15a6078371bd` | `gpt-4o-mini:64ac8d322a3d` |
| nuclear:ir | `gpt-4o-mini:19c06260f149` | `gpt-4o-mini:1ce0dde33ac6` |

The env-absent column reproduces the four strings `map-prompts.test.ts:220-225` pins as the
versions the deployed corpus was written under — so the bump is confined to the exported env and
`git diff origin/main -- src/lib/analysis/` is empty. `alreadyMapped: 0` on every dry call
confirms the anti-join now finds the whole corpus pending, which is exactly the condition a real
version bump creates.

### 10.2 Verbatim output — one week, all six live (theater, track) pairs

```
$ export CRON_SECRET=$(cat /tmp/remap_cron_secret)
$ export MAP_BACKFILL_BASE=http://localhost:3000
$ npx tsx scripts/map-remap.ts --theater ru --track military --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ru track=military via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=2960  pairs=2960  batches=148  est=$0.3156
2026-08-26  eligible=2855  pairs=2855  batches=143  est=$0.3055
2026-08-27  eligible=2750  pairs=2750  batches=138  est=$0.2956
2026-08-28  eligible=2872  pairs=2872  batches=144  est=$0.3049
2026-08-29  eligible=2296  pairs=2296  batches=115  est=$0.2438
2026-08-30  eligible=2438  pairs=2438  batches=122  est=$0.2571
2026-08-31  eligible=2810  pairs=2810  batches=141  est=$0.3000

TARGET model=gpt-4o-mini (no reasoning effort)
  version military:ru -> gpt-4o-mini:8c4c54320590
ELIGIBLE: 18981 docs / 18981 doc-track pairs · ESTIMATE TOTAL: $2.0225 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)

$ npx tsx scripts/map-remap.ts --theater ua --track military --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ua track=military via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=886  pairs=886  batches=45  est=$0.0918
2026-08-26  eligible=762  pairs=762  batches=39  est=$0.0796
2026-08-27  eligible=839  pairs=839  batches=42  est=$0.0862
2026-08-28  eligible=802  pairs=802  batches=41  est=$0.0838
2026-08-29  eligible=686  pairs=686  batches=35  est=$0.0715
2026-08-30  eligible=649  pairs=649  batches=33  est=$0.0659
2026-08-31  eligible=693  pairs=693  batches=35  est=$0.0717

TARGET model=gpt-4o-mini (no reasoning effort)
  version military:ua -> gpt-4o-mini:8c4c54320590
ELIGIBLE: 5317 docs / 5317 doc-track pairs · ESTIMATE TOTAL: $0.5505 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)

$ npx tsx scripts/map-remap.ts --theater ir --track military --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ir track=military via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=4115  pairs=701  batches=36  est=$0.0765
2026-08-26  eligible=3840  pairs=631  batches=32  est=$0.0682
2026-08-27  eligible=3834  pairs=634  batches=32  est=$0.0678
2026-08-28  eligible=3398  pairs=603  batches=31  est=$0.0646
2026-08-29  eligible=2931  pairs=441  batches=23  est=$0.0488
2026-08-30  eligible=3337  pairs=689  batches=35  est=$0.0718
2026-08-31  eligible=4144  pairs=851  batches=43  est=$0.0901

TARGET model=gpt-4o-mini (no reasoning effort)
  version military:ir -> gpt-4o-mini:1bfad9e5e447
ELIGIBLE: 25599 docs / 4550 doc-track pairs · ESTIMATE TOTAL: $0.4878 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)

$ npx tsx scripts/map-remap.ts --theater ru --track elite_politics --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ru track=elite_politics via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=2960  pairs=416  batches=21  est=$0.0511
2026-08-26  eligible=2855  pairs=373  batches=19  est=$0.0458
2026-08-27  eligible=2750  pairs=364  batches=19  est=$0.0451
2026-08-28  eligible=2872  pairs=388  batches=20  est=$0.0475
2026-08-29  eligible=2296  pairs=263  batches=14  est=$0.0333
2026-08-30  eligible=2438  pairs=238  batches=12  est=$0.0298
2026-08-31  eligible=2810  pairs=366  batches=19  est=$0.0446

TARGET model=gpt-4o-mini (no reasoning effort)
  version elite_politics:ru -> gpt-4o-mini:64ac8d322a3d
ELIGIBLE: 18981 docs / 2408 doc-track pairs · ESTIMATE TOTAL: $0.2972 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)

$ npx tsx scripts/map-remap.ts --theater ir --track elite_politics --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ir track=elite_politics via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=4115  pairs=112  batches=6  est=$0.0128
2026-08-26  eligible=3840  pairs=157  batches=8  est=$0.0177
2026-08-27  eligible=3834  pairs=140  batches=7  est=$0.0158
2026-08-28  eligible=3398  pairs=139  batches=7  est=$0.0154
2026-08-29  eligible=2931  pairs=96  batches=5  est=$0.0114
2026-08-30  eligible=3337  pairs=163  batches=9  est=$0.0176
2026-08-31  eligible=4144  pairs=198  batches=10  est=$0.0211

TARGET model=gpt-4o-mini (no reasoning effort)
  version elite_politics:ir -> gpt-4o-mini:64ac8d322a3d
ELIGIBLE: 25599 docs / 1005 doc-track pairs · ESTIMATE TOTAL: $0.1118 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)

$ npx tsx scripts/map-remap.ts --theater ir --track nuclear --from 2026-08-25 --to 2026-08-31
map remap — 2026-08-25 … 2026-08-31 theater=ir track=nuclear via MAP_BACKFILL_BASE=http://localhost:3000

== phase 1: estimate (dry runs — no LLM calls, no writes) ==
2026-08-25  eligible=4115  pairs=66  batches=4  est=$0.0076
2026-08-26  eligible=3840  pairs=104  batches=6  est=$0.0113
2026-08-27  eligible=3834  pairs=59  batches=3  est=$0.0066
2026-08-28  eligible=3398  pairs=53  batches=3  est=$0.0059
2026-08-29  eligible=2931  pairs=35  batches=2  est=$0.0039
2026-08-30  eligible=3337  pairs=140  batches=7  est=$0.0148
2026-08-31  eligible=4144  pairs=133  batches=7  est=$0.0150

TARGET model=gpt-4o-mini (no reasoning effort)
  version nuclear:ir -> gpt-4o-mini:1ce0dde33ac6
ELIGIBLE: 25599 docs / 590 doc-track pairs · ESTIMATE TOTAL: $0.0651 (budget $0)

estimate only — rerun with --execute to remap (dispatch stays fail-closed server-side)
```

`estDispatchBlocked` was absent on every one of the 42 dry calls — no
`!! THIS CONFIGURATION WOULD BE REFUSED AT EXECUTION` line appears anywhere above. The
configuration resolves to the baseline (`gpt-4o-mini`, no reasoning effort), which is what
option (a) is designed to preserve: the map activation lock is never approached, because the
lock keys on model and effort (`src/lib/llm/model-config.ts:155-162`), not on the content budget.

### 10.3 Full epoch range — the corpus-scale estimate

Same six pairs, `--from 2026-07-04` (`MAP_EPOCH`, `map-worker.ts:70`) `--to 2026-09-06`, 65 days
each = **390 dry route calls**, still $0. Tails only (the per-day lines are 390 rows):

```
########## ru / military — full epoch range ##########
  version military:ru -> gpt-4o-mini:8c4c54320590
ELIGIBLE: 188810 docs / 188810 doc-track pairs · ESTIMATE TOTAL: $19.8131 (budget $0)
########## ua / military — full epoch range ##########
  version military:ua -> gpt-4o-mini:8c4c54320590
ELIGIBLE: 60224 docs / 60224 doc-track pairs · ESTIMATE TOTAL: $6.1307 (budget $0)
########## ir / military — full epoch range ##########
  version military:ir -> gpt-4o-mini:1bfad9e5e447
ELIGIBLE: 222404 docs / 51029 doc-track pairs · ESTIMATE TOTAL: $5.4022 (budget $0)
########## ru / elite_politics — full epoch range ##########
  version elite_politics:ru -> gpt-4o-mini:64ac8d322a3d
ELIGIBLE: 188810 docs / 23599 doc-track pairs · ESTIMATE TOTAL: $2.8543 (budget $0)
########## ir / elite_politics — full epoch range ##########
  version elite_politics:ir -> gpt-4o-mini:64ac8d322a3d
ELIGIBLE: 222404 docs / 10140 doc-track pairs · ESTIMATE TOTAL: $1.1102 (budget $0)
########## ir / nuclear — full epoch range ##########
  version nuclear:ir -> gpt-4o-mini:1ce0dde33ac6
ELIGIBLE: 222404 docs / 5867 doc-track pairs · ESTIMATE TOTAL: $0.6469 (budget $0)
```

Independently cross-checked with read-only SQL on the same fork: the remap eligibility predicate
(`map-worker.ts:582-601`, without the track filter) returns **ru 188,810 · ua 60,224 · ir 222,404
= 471,438** distinct documents, matching the `ELIGIBLE … docs` figures exactly. No day reached the
`cap=20000` dry ceiling (per-day maxima: ir 6,511 · ru 3,796 · ua 1,336), so no day's estimate is
truncated.

### 10.4 Cost per 1,000 — the answer #33 has never had

| theater / track | pairs (epoch range) | modelled USD | **$ / 1k pairs** |
|---|---:|---:|---:|
| ru / military | 188,810 | 19.8131 | **0.1049** |
| ua / military | 60,224 | 6.1307 | **0.1018** |
| ir / military | 51,029 | 5.4022 | **0.1059** |
| ru / elite_politics | 23,599 | 2.8543 | **0.1210** |
| ir / elite_politics | 10,140 | 1.1102 | **0.1095** |
| ir / nuclear | 5,867 | 0.6469 | **0.1103** |
| **all six** | **339,669** | **35.9574** | **0.1059** |

The one-week window (§10.2) yields the same unit cost pair-for-pair (0.1035–0.1234 $/1k pairs),
so the unit is stable across time and theater; what varies wildly is the *pair yield per document*
(ru/military 1.000, ir/military 0.178, ir/nuclear 0.026), which is why the per-1k figure must be
quoted per **pair**, not per document scanned. The per-document figure is included in §10.2's
arithmetic for completeness but is not a portable unit.

**Headline: a full-corpus remap of every live (theater, track) pair over the whole map epoch is
modelled at ≈$36 at gpt-4o-mini pricing.**

**Cross-check against real money, with its caveats.** The fork's copied ledger holds
`openai_map` all-time **$23.0763** over 44 day-rows, and `doc_map_state` holds **343,439** rows at
the four current baseline versions (311,260 distinct documents). That is $0.067 per 1k pairs
actually billed, i.e. the estimator is conservative by roughly 1.6×. Treat that ratio as a band,
not a correction factor: the ledger also paid for superseded-version work, for the ~57% of
micro-batches the provider rejected before the #86 repair (a 400 is not billed, but its retries
and the surrounding runs were), and for backfill/recovery runs, while `doc_map_state` counts
zero-claim dispositions that cost a share of a batch rather than a whole one. The honest reading
is: **the modelled $36 is an upper band; a real run should land below it.**

### 10.5 What was and was not done

- **$0.** No provider call, paid or free, on any path. The server ran the whole session with
  `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `POSTMARK_SERVER_TOKEN`, `RESEND_API_KEY`, `X_API_KEY`
  and `OPENSANCTIONS_API_KEY` blank and `LLM_DISABLE=1`.
- **No `--execute`, ever.** Every invocation above is estimate mode. `AWAITING AUTHORIZATION: D7`.
- **432 dry route calls** (42 in §10.2 + 390 in §10.3), all against `http://localhost:3000`.
  Dry runs take no lease, write nothing, and are absent from `cron_runs`
  (`route.ts:100-104`, `map-worker.ts:466-468`) — verified: `cron_runs` on the fork is unchanged.
- **Production was never contacted.** `MAP_BACKFILL_BASE=http://localhost:3000` on every command,
  echoed in every banner line quoted above.
- **No production write, no env change, no deploy, no migration, no remap execution.** Still zero
  `map:remap` rows anywhere.
- **Fork `br-wispy-frog-at07iym7` deleted at 2026-09-06T22:47:11Z** (`neon-branch.ts delete`
  confirmed `deleted br-wispy-frog-at07iym7`); the server was killed, `next-env.d.ts` verified
  byte-unchanged, and `data/remap-state/` removed.

## 11. Lock-replacement design note (plan only — no code was written)

Today the map activation lock is unconditional (`src/lib/llm/model-config.ts:155-162`): any map
model or effort other than `MAP_BASELINE` is refused, and there is no env override. That is
correct as a default, because a version bump alone strands the persisted corpus — but it also
means an approved, scorecarded map candidate stays unusable *forever*, which is not a state
anyone wants to keep. The replacement the operator will eventually decide on (after step 4 of
the eval program) turns "never" into "not until the corpus has caught up":

```ts
// replaces the unconditional clause at model-config.ts:155-162
workload === "map" && !(approval.approved && remapComplete(extractorVersionsFor(model, effort)))
```

Three pieces are missing, and none of them is trivial:

**(1) A durable remap-complete marker.** A `provider_state` row `map_remap_complete` holding
jsonb keyed by `<track>:<theater>`:

```json
{ "military:ru": { "extractorVersion": "gpt-4o-mini:…", "completedAt": "…Z",
                   "days": ["2026-07-04", "2026-09-06"], "docs": 0, "pairs": 0,
                   "usd": 0, "target": "https://bnow-net.vercel.app" } }
```

written by the driver when **every** day in the authorized range reached `complete` under the
same extractor versions **and** the same route target. The checkpoint already tracks exactly
those two bindings (`RemapCheckpoint.versionsDigest` / `.target`, `scripts/map-remap.ts:136-176`),
so the marker is a promotion of state the driver already holds — not new bookkeeping. It must be
written from the *route* (which has the DB) rather than the driver (which has only HTTP), or the
driver needs a new authenticated write endpoint; that is a real design choice, not a detail.
The marker must also record *coverage*, not just completion: "every day from `MAP_EPOCH` to the
day of the activation" is the only honest predicate, and days that arrive later (back-dated
documents — the driver header's own caveat) invalidate nothing, because the hourly worker maps
them under the new version anyway once the version is live.

**(2) A reading path — the hard part.** `resolveWorkloadModel` is **synchronous and env-only**
by contract ("NEVER throws — safe for read-side consumers", `:126-130`), and
`mapExtractorVersion()` calls it on every batch. It cannot become async or DB-backed without
turning version computation into an IO operation. Two shapes:

- read the marker once at process start into module state — cheap, but a cold Vercel lambda
  reads it per instance, and a *stale* read fails **open** if the marker is cached as present
  after a rollback; or
- move the activation gate out of `model-config.ts` into `runMapCycle`, before the first
  reservation, and leave `model-config.ts` a pure configuration refusal for unpriced/unapproved
  candidates. This keeps the synchronous contract intact and puts the DB read where a DB already
  is. **Recommended**, at the cost of the gate no longer being visible in the single routing
  authority — which is exactly the property ruling 4 was written to protect, so the move needs
  its own decision-log entry, and `estDispatchBlocked` (the operator's dry-run decision surface)
  would have to learn about it too or the dry run stops telling the truth.

**(3) An activation authorization entry** recording: the candidate identity (model, effort,
provider); its `evaluated_candidate` row in `src/lib/llm/analysis-registry.ts` with the paid
representative scorecard behind it (#81); the executed remap's completion record (fork or
production, range, docs, pairs, USD, versions); the caps posture during the remap; and the
rollback — unset the env, old-version rows are untouched and every `map-versions.ts` consumer
reads them again.

Two ruling-level gates ride along and belong in the runbook for **any** future candidate run:

- **Ruling 13.** Every `doc_claims` consumer filters to `mapExtractorVersion()` through
  `src/lib/analysis/map-versions.ts`. A remap writes the NEW version only; old rows persist as
  history. So a *partial* remap leaves the corpus split across two versions with only the new
  half visible to reduce/reports — which is a silent coverage regression, not an error. Do not
  flip the version live until the marker says the range is complete.
- **Ruling 7.** Batched per-item extraction must pin `minItems`/`maxItems` = batch size, because
  gpt-4o-mini silently under-fills (43–57% omission measured) and prompt wording does not fix it.
  A new map model has NOT inherited that measurement. Re-measure omission (`counts.omittedDocs` /
  `counts.emptyDocs`, and `wrongDocIds` / `duplicateEntries`) on the candidate before approving
  it, on the fork, at the batch size production uses.

---

## 12. Rulings touched and how each is satisfied

| Ruling | How |
|---|---|
| **4 (fail-closed spend)** | **§10 (2026-09-06): zero paid calls** — the estimate path returns before `assertLlmEnabled` and before `workloadDispatchConfig` (`map-worker.ts:822-855` vs `:856-861`), so no reservation and no client construction happens; the server ran with every paid key blanked and `LLM_DISABLE=1`. **§19 (2026-09-08): $0.046263 under signed D7**, metered through `SpendGuard` on the fork's own copied `openai_map` ledger, with both map caps set from that ledger as `T + C` / `D + C` (§19.1) — never a literal ceiling, which would have refused the first reservation. No budget stop of any category fired. `--base-ack` adds a refusal *before* the first route call; it removes no existing refusal. §8 states the threshold (`>=`) reservation semantics rather than promising `C` is a hard ceiling, and the run stayed at 4.6% of `C` so the semantics were never tested at the boundary. |
| **7 (batch under-fill)** | Not exercised in §10 (no dispatch). **Exercised clean in §19**: `omitted=0` on every one of the 36+ live batches at the production batch size of 20, on the baseline model. Still recorded in §11 as an explicit gate for any future *candidate* run — a new model does not inherit this measurement. |
| **13 (map versioning + hard lock)** | `src/lib/llm/model-config.ts` is byte-unchanged (`git diff origin/main -- src/lib/llm/model-config.ts` empty); `MAP_BASELINE` untouched. The version bump came only from an exported env on one local server, and the four literal pins still reproduce the deployed-corpus versions with the env absent (§10.1). The remap driver dispatches through `workloadDispatchConfig("map")` server-side, so the lock is not relaxed by the tool. |
| **5 (migrations)** | None. The fork is already migrated through 0027; `db:migrate` was not run. |
| **8, 9, 19, 21** | Not touched — no provider call, no page, no digest persist. |

---

## 13. Tests

| | |
|---|---|
| Unit | **3,723 → 3,731** (255 files, unchanged) — 8 new cases in `scripts/map-remap.test.ts`. Base count measured on this branch with the working tree stashed. |
| Typecheck | clean |
| Lint | 0 errors (3 pre-existing warnings, none in changed files) |
| Fork integration | No `*.itest.ts` run — this step's code change is a pure CLI-boundary guard. The fork was used for the dry run itself (§10). |
| Mutation proofs | Deleting the CLI call to `assertBaseAck` fails exactly 1 test (the source-scan pin); making every host loopback fails 4; comparing the ack against the base URL instead of the host fails 2. |
| Spend | **$0** for the step-22 PR itself (§10 dry run). **$0.046263** for the 2026-09-08 measured run (§19), on a fork ledger that was deleted with the fork. |

---

## 14. Citations re-verified

All line numbers below were read on this base (`2203150`), after this step's edit to
`scripts/map-remap.ts` where relevant.

| Cited as | Verified |
|---|---|
| prompt: driver has no `--estimate`/`--resume`/`--dry-run`/`--base` | correct; the flag list is `scripts/map-remap.ts:79-85` |
| prompt: `map-remap.ts:641` default target production | **moved** → `:694` after this step's edit (was `:643` at the base; the prompt's `:641` predates PR #50) |
| prompt: `map-remap.ts:168` stale comment | **was `:170`**, now fixed to name `MAP_BACKFILL_BASE` |
| prompt: `map-remap.ts:22-27` dispatches through `workloadDispatchConfig('map')` | correct (comment); the actual call is `map-worker.ts:861` |
| PLAN §6.2: banner at `:314` | **moved** → `:366-369` |
| PLAN §6.4 / COMMON §3: map lock predicate `model-config.ts:156-159` | **`:155-162`** (the clause spans one more line than cited) |
| `map-prompts.ts:242-266` version basis | correct — doc comment `:242`, body `:254-266` |
| `map-versions.ts` single accessor (ruling 13) | correct, `:1-8` |
| `authz-page-gate.itest.ts` fork-bound `next build && next start` pattern | correct — `PAID_KEYS` `:48-56`, `serverEnv()` `:148-163`, port guard `:167-181`, spawn `:345-350` |
| OPEN-TASKS #33 "tool deployed, never executed" | correct, `docs/OPEN-TASKS.md:176` (STATUS line) |
| `llm-guard.ts:177-188` map cap precedence | the precedence itself is **`:167-170`** (`mapTotalUsdCap`); `:177-188` is `mapGuardFromEnv` which consumes it |
| `spend-guard.ts:127-136` threshold reservation | **`:121-140`** (the `>=` comparisons for total and daily) |
| `neon-branch.ts create` is auto-named | correct, `:28` (`itest-<epoch-ms>`) |
| `.gitignore` `data/remap-state/` | correct, `:15` |

Cross-check that the estimate figures are honest: the driver's `ELIGIBLE … docs` totals were
reproduced from the fork with an independent SQL restatement of the remap predicate (§10.3), and
the route-reported `remapVersions` were reproduced from `mapExtractorVersion()` locally (§10.1).
Neither check goes through the code path it is checking.

---

## 15. Decisions needed

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D7** (CP2, **SIGNED 2026-09-07 · DISCHARGED 2026-09-08 — see §19**) | Authorize the measured remap run | (a) defer — the modelled figure in §10.4 stands as the answer to "what does a remap cost"; (b) authorize a ceiling `C` on the fork's own `openai_map` ledger, one day, `--limit 1000`, per §8 | **(b) with `C = $1.00`.** One ir/military day is ~700 pairs ≈ $0.075 modelled and ≈ $0.05 actual by the §10.4 cross-check, so $1.00 buys the measurement several times over and still bounds a runaway. The value it adds over the estimate is not the price — it is the first-ever proof that the drain loop, the lease, the sweep-completion proof and the no-rebill property behave on real data. That is what #33 has never had. |
| **R4** (CP2, **SIGNED 2026-09-07** — hazard binding discharged in §19.8) | Measurement path | (a) `MAP_CONTENT_CHARS` on the fork-bound server; (b) prompt-hash bump on a branch; (c) lock relaxation | **(a)** — executed on the prompt's instruction that PLAN-WS-2 §WS-2.3 is the specification. Needs a decision-log line to become a signed answer; nothing about (a) changed code or touched production, so this is record-keeping, not a re-run. |
| **R16** (new; after eval step 4) | Where the map activation gate lives once the lock is replaced | keep it in `resolveWorkloadModel` with a process-start cached marker read / move it into `runMapCycle` before the first reservation, leaving `model-config.ts` a pure config refusal | **move it** (§11 (2)) — it keeps `resolveWorkloadModel`'s synchronous, never-throws contract, but it moves a ruling-4 refusal out of the single routing authority, so it needs its own decision-log entry and `estDispatchBlocked` has to learn about it or the operator's dry-run decision surface stops telling the truth. |
| **R17** (new; with any real remap) | Whether the version bump goes live before or after the remap completes | flip the version, then remap (the corpus is split and only the new half is visible to reduce/reports until it drains) / remap on a shadow version first | **operator fact-finding needed.** Ruling 13 makes the interim state a silent coverage regression, not an error, and there is currently no shadow-version mechanism. This is the real cost of a map model change and it is not in the $36. |

---

## 16. Debt and risks

- ~~**The measured run is still the gap.**~~ **CLOSED 2026-09-08 (§19)** for one
  (theater, track, day): the chars-based model (`map-worker.ts:822-841`) is now calibrated
  against a real remap and is conservative by **1.65×** ($0.0660/1k measured vs $0.1091/1k
  modelled on the same day), confirming the ledger cross-check's "≈$36 modelled, probably ≈$23
  real" — measured projection ≈$22.4. **Residual gap:** one day of one pair is calibrated; the
  other five live (theater, track) pairs and the full epoch range remain modelled only, and
  ir/military may not be representative (its pair yield per document, 0.178, is the lowest of
  the three military pairs).
- **The estimate models zero waste — now quantified.** Truncation splits (`extractBatch`
  recurses twice, each recursion metering its own request), transport retries, and lease-lost
  discards all cost money the model does not count. §19.5 measured it: **38 dispatches against
  36 modelled batches, a 5.6% count overrun** — which the 1.65× cost conservatism still
  absorbs. A real run should be read against `provider_usage`, not against the driver's
  `modelled $…`.
- **`--base-ack` is a CLI-boundary guard, not a driver invariant.** `driveMapRemap` itself still
  accepts any base; the existing 61 driver tests target `https://example.test` deliberately.
  Moving the check into the driver would be stronger and would cost ~50 test edits — deliberately
  not taken here, and recorded so a later session can decide rather than discover.
- **The banner prints `opts.base` verbatim**, so a base with embedded userinfo would print a
  credential. Pre-existing (it printed `via ${opts.base}` before this step) and out of scope;
  `remapTargetId`/`remapBaseHost` already strip credentials everywhere a value is *persisted* or
  *compared*. Worth a one-line fix in a later hygiene PR.
- **`MAP_CONTENT_CHARS=1499` is a rehearsal artefact.** It exists only inside one shell's env and
  one disposable fork. Nothing in the repository, in any Vercel environment, or in production
  carries it. If a future session finds the four `8c4c…`/`1bfa…`/`64ac…`/`1ce0…` versions in a
  real corpus, something has gone wrong and this document is the place to start.
- **The `sa`/`ae`/`qa`/`om`/`bh`/`kw`/`il` theaters are configured for `military`
  (`tracks.ts:202`) but were not estimated** — they are the shallow/scaffolded theaters that are
  not on the map worker (AGENTS.md "gulf theaters onto the map worker" is still a next step), so
  their remap cost is zero today and will not be until that lands.
- **Deleting a fork does not delete a stale checkpoint.** `data/remap-state/*.json` survives the
  fork; the target/version binding (`:415-437`) means a stale file resets rather than lies, but
  §9 deletes it anyway.

---

## 17. Handoff

**For step 25 (docs sync).** Nothing in `AGENTS.md` becomes wrong because of this step. The
proposed additions are in §18 below.

**For `docs/OPEN-TASKS.md` #33.** Its STATUS line ("TOOL DEPLOYED, NEVER EXECUTED") is still
accurate and this step does not change it — the tool has now been *rehearsed against a fork in
estimate mode*, which is strictly less than "executed". Step 25 may append the one-line status
addendum in §18. #33 stays OPEN.

**For the operator, at CP2.** Both questions are now answered with numbers.
*"What does a full remap cost?"* → ≈$36 modelled, and after §19's calibration **≈$22.4
measured-rate** for 339,669 doc-track pairs across the six live pairs at gpt-4o-mini pricing.
*"Is the tool sound?"* → **yes, for the single-holder happy path, proven on real data**
(§19): the sweep drain completed, the confirming sweep returned `pairs=0`, the four
reconciliation reads agree exactly, old-version rows were untouched, and no-rebill survived
deliberate checkpoint deletion. Still unproven: contention, takeover, lease-loss and discard
(#95), and five of the six live (theater, track) pairs.

**For the prompt that follows this one.** Step 22's prompt should be rewritten as follows if it
is ever re-run:

> Replace *"execute the runbook up to and including the estimate-mode run"* with *"execute the
> measured run per `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` §8, on a fresh fork, under the
> signed D7 ceiling"*, and drop item 1 (the runbook exists). Add: *"the estimate-mode baseline to
> compare the measured figures against is §10.4 of that runbook — $0.1059 per 1k doc-track pairs
> modelled; report the measured figure against it and explain any divergence above ±30%."*

---

## 18. Proposed AGENTS.md changes (step 25 applies these; this session made none)

**Standing text.** None. No standing section becomes wrong.

**Proposed decision-log entry (append at the bottom):**

> - **2026-09-06 (OPEN-TASKS #33 — remap rehearsed in estimate mode on a disposable fork; the
>   first cost figure the tool has ever produced; `--base-ack` guard; NO paid run)** The
>   version-aware remap driver, deployed 2026-08-21 and never executed, was rehearsed end to end
>   in its default estimate mode against a local `next build && next start` bound to disposable
>   Neon fork `br-wispy-frog-at07iym7` (created and deleted this session), with every paid key
>   blank, `LLM_DISABLE=1`, and `MAP_BACKFILL_BASE=http://localhost:3000` on every command —
>   production was never contacted and still holds **zero `map:remap` rows**. Pending work was
>   created by decision **R4 option (a)**: `MAP_CONTENT_CHARS=1499` exported to the fork-bound
>   server only, which moves `mapExtractorVersion()`'s `content=` basis term
>   (`map-prompts.ts:254-266`) and yields four new extractor versions with **zero code change**,
>   the baseline model preserved (so `estDispatchBlocked` was null on all 432 dry calls and the
>   map activation lock was never approached), and the four literal deployed-corpus version pins
>   still reproducing exactly with the env absent. `src/lib/llm/model-config.ts` is byte-unchanged.
>   **Result — the first per-1k figure #33 has ever had:** over `MAP_EPOCH`→2026-09-06 (65 days,
>   390 dry calls) the six live (theater, track) pairs hold **339,669 pending doc-track pairs**
>   across **471,438** eligible documents, modelled at **$35.96 total = $0.1059 per 1,000
>   doc-track pairs** at gpt-4o-mini pricing, stable within 0.102–0.121 across every pair and
>   reproduced on an independent one-week window. The driver's `ELIGIBLE … docs` totals were
>   re-derived by independent SQL against the fork and match exactly. Cross-checked against real
>   money: the fork's copied ledger holds `openai_map` all-time **$23.0763** against **343,439**
>   current-version `doc_map_state` rows = $0.067/1k, so the estimator is conservative by ≈1.6× —
>   **the $36 is an upper band**, and the divergence is not a defect (the ledger also paid for
>   superseded work, pre-#86 rejected-batch retries, and backfill runs). Companion PR: a
>   fail-closed `--base-ack` guard — `MAP_BACKFILL_BASE` is the driver's only target input and its
>   default is PRODUCTION, so a non-loopback target now refuses at the CLI boundary, before the
>   driver is constructed and before any route call, unless the operator names the exact host;
>   loopback needs none; three mutations killed. **What this does NOT establish:** phase 2 was
>   never entered, so the sweep drain, the map lease under a real remap, the completion proof and
>   the no-rebill property remain test-proven only — `AWAITING AUTHORIZATION: D7`, and the
>   recommendation is $1.00 on a fork ledger for one ir/military day. #33 stays OPEN; the map
>   activation lock is untouched and its replacement design is §11 of the runbook (durable
>   `map_remap_complete` marker + a gate that cannot make `resolveWorkloadModel` async +
>   an activation authorization entry), for the operator's decision after eval step 4.
>   Runbook + report: `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`.

**Proposed `docs/OPEN-TASKS.md` #33 status addendum** (append to the existing STATUS paragraph;
this session did not edit the file):

> **2026-09-06 — REHEARSED IN ESTIMATE MODE, still never executed.** Driven cold against a local
> `next start` on a disposable Neon fork with an env-only version bump; 432 dry route calls, $0,
> zero writes. First cost figure: **339,669 pending doc-track pairs / $0.1059 per 1k modelled
> (≈$36 for the whole epoch range)**, ledger cross-check ≈$0.067/1k. Phase 2 (the paid drain) is
> still unexercised — it is what D7 buys. Runbook: `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`.

---

**ID correction, 2026-09-07 (operator).** The two decisions in §15 were originally minted as
**R14** and **R15**. Both identifiers were already in use elsewhere in the 48-hour program —
R14 is the Ask scorecard-gate escape hatch (INDEX §2.1, from step 11b / PR #67) and R15 is the
unscorecarded embed+rerank spend note (INDEX §2.3). They are **renumbered here to R16 and R17**;
the decisions themselves are unchanged. Cite the map activation gate as **R16** and the
version-bump-vs-remap ordering as **R17**.

---

## 19. The measured run that was executed (2026-09-08) — D7 discharged

**This section is the record §8 was written as instructions for.** D7 was signed 2026-09-07
(`AGENTS.md`, "measured WS-2.3 remap run authorized on a disposable fork"): operative
`--budget` **C = $1.00**, $10 recorded as the outer bound. R4 option (a) was signed the same
day. The run below is the first time `scripts/map-remap.ts` has ever entered phase 2.

Fork **`br-royal-resonance-atvgety1`** (created and deleted this session), local
`next build && next start -p 3000` with the §5 env, `MAP_CONTENT_CHARS=1499`,
`MAP_BACKFILL_BASE=http://localhost:3000` on every command. Production was never contacted.
Pre-push gate green on the branch before the run: typecheck clean · lint clean ·
**4,082 unit tests / 270 files**.

### 19.1 Cap arithmetic, computed off the fork's copied ledger

Per §8 step 2 the caps are `T + C` and `D + C`, never a literal `C`:

| | read on the day | cap set on the server |
|---|---:|---:|
| `T` = `openai_map` all-time | $23.940010 (46 day-rows) | `MAP_SPRINT_USD_CAP=24.9400` |
| `D` = `openai_map` today | $0.455843 (374 requests) | `MAP_USD_CAP_DAILY=1.4559` |

Headroom $0.99999 and $1.00006 — C on both, as intended. `T` had moved from the 2026-09-06
reading of $23.0763/44 rows, which is why (f10) says to re-read it rather than reuse a constant.

### 19.2 Version bump reproduced §10.1 exactly

Both columns of §10.1's table were recomputed locally before the run and matched
byte-for-byte — the env-absent basis still reproduces the four deployed-corpus pins, and
`MAP_CONTENT_CHARS=1499` still yields the four rehearsal versions. Target for this run:
**`gpt-4o-mini:1bfad9e5e447`** (military:ir).

### 19.3 Estimate phase reproduced §10.2 exactly

The ir/military week 2026-08-25 → 08-31 was re-estimated on the fresh fork and returned
**every figure identical to §10.2** — per-day eligible/pairs/batches/est and the
`25599 docs / 4550 pairs · $0.4878` total. No
`!! THIS CONFIGURATION WOULD BE REFUSED AT EXECUTION` line appeared, so `estDispatchBlocked`
was null and §6's acceptance gate passed. Two days and one fork later, the estimator is
reproducible.

### 19.4 The measured run

```
npx tsx scripts/map-remap.ts --theater ir --track military \
  --from 2026-08-25 --to 2026-08-25 --execute --budget 1.00 --limit 1000

2026-08-25 DONE  claims=382  $0.0463

REMAP COMPLETE — pairs attempted 701 · claims 382 · actual $0.0463 (modelled $0.0765)
old extractor-version rows are untouched (append-only history; rollback = revert the version).
```

Twelve `s1` sweeps drained the day's 4,115 eligible documents 400 at a time; **twelve `s2`
sweeps then returned `pairs=0` across the board** — the sweep-completion proof, exercised on
real data for the first time. `omitted=0` on every batch (ruling 7's under-fill signature
absent at the production batch size of 20). Of the 701 pairs, 341 produced no claims and 360
produced 382.

### 19.5 Reconciliation — driver against the database

| | driver | independent DB read | agree |
|---|---:|---:|:--:|
| spend | $0.0463 | $0.502106 − $0.455843 = **$0.046263** | yes |
| claims | 382 | `doc_claims` @ new version = **382** | yes |
| pairs | 701 | `doc_map_state` @ new version = **701** | yes |
| sweeps | 12 + 12 | `cron_runs` `job='map:remap'` = **24, all `ok`** | yes |

`doc_map_state` at the **baseline** version stayed at **53,006** rows across the whole run —
old-version history is untouched, so ruling 13's rollback (revert the version basis and every
`map-versions.ts` consumer reads the old rows again) is now demonstrated, not just asserted.

**One divergence, and it is the interesting one.** `provider_usage.requests` went
**374 → 412 = 38 dispatches against 36 modelled batches**. The estimator models one call per
micro-batch and zero waste; the two extra calls are the §16 "estimate models zero waste"
caveat showing up in a real run (truncation splits recurse and meter their own request). It
is a 5.6% count overrun that the *cost* model still over-covers, per §19.6.

### 19.6 The number #33 has never had — measured, not modelled

```
measured per-1k-pairs = $0.046263 / 701 pairs × 1000 = $0.0660 per 1,000 doc-track pairs
modelled per-1k-pairs = $0.0765   / 701 pairs × 1000 = $0.1091 per 1,000 doc-track pairs
```

**The estimator is conservative by 1.65×** ($0.0765 / $0.046263). §10.4 predicted "≈1.6×"
from the ledger cross-check and named $0.067/1k as the real-money figure; the measured
$0.0660/1k lands **within 1.5% of that prediction**. The two independent routes to the same
number is the strongest evidence in this document.

Against §17's handoff instruction — *"report the measured figure against $0.1059/1k modelled
and explain any divergence above ±30%"* — the divergence is **−37.7%**, and the explanation is
not a defect: it is the chars-based token approximation in `estimateCostUsd`
(`map-worker.ts:822-841`) over-predicting prompt size, exactly as §10.4 anticipated. **The
$36 corpus figure stands as an upper band; the measured rate projects the same 339,669 pairs
at ≈$22.4.**

### 19.7 No-rebill, proven the hard way

The runbook claims `doc_map_state` — not the checkpoint file — is the no-rebill authority.
That was test-proven only. Here it was proven against real data: the checkpoint
`data/remap-state/remap_ir_military_2026-08-25_2026-08-25.json` was **deleted**, and the
identical `--execute` command re-run:

```
REMAP COMPLETE — pairs attempted 0 · claims 0 · actual $0.0000 (modelled $0.0000)
```

Ledger unchanged at $0.502106 / 412 requests; rows unchanged at 701 / 382. A lost or deleted
checkpoint costs a re-scan, never a re-bill.

### 19.8 `MAP_CONTENT_CHARS` absence — both checks, as (f10) requires

Read with `vercel env ls <env> --project bnow-net --scope vociferous`, each listing carrying a
positive control (`MAP_SPRINT_USD_CAP`, expected present) so that a failed listing cannot be
misread as an absence:

| | rows returned | positive control | `MAP_CONTENT_CHARS` |
|---|---:|---:|---|
| **BEFORE** production / preview / development | 46 / 28 / 20 | 1 / 1 / 1 | **absent from all three** |
| **AFTER** production / preview / development | 46 / 28 / 20 | 1 / 1 / 1 | **absent from all three** |

The variable lived only in one shell's exported env, on one local server, bound to one
disposable fork. Nothing in the repository, in any Vercel environment, or in production
carries it.

*Method note, worth keeping:* the first attempt at this check ran `vercel env ls` without
`--project`/`--scope` from the worktree, which errors with "codebase isn't linked" — and a
grep for `MAP_CONTENT_CHARS` over an error message returns zero, which reads exactly like a
clean absence. **An absence check without a positive control is not a check.**

### 19.9 What was and was not done

- **Spend: $0.046263**, all of it on the fork's own copied `openai_map` ledger, which died
  with the fork. Against C = $1.00 (4.6% of the ceiling) and far under the $10 outer bound.
  No cap was approached; no budget stop of any category fired.
- **Production untouched**: never contacted, no write, no env change, no deploy, no
  migration. `/health` re-verified 200 / `DB OK` after teardown. Production still holds
  **zero `map:remap` rows** — the 24 recorded here are the fork's.
- **Fork `br-royal-resonance-atvgety1` deleted** (`neon-branch.ts delete` returned
  `deleted br-royal-resonance-atvgety1`); server killed, port 3000 free, `data/remap-state/`
  removed, `next-env.d.ts` verified byte-unchanged, `git status` clean.
- **The map activation lock is untouched.** `src/lib/llm/model-config.ts` was not edited; the
  run resolved to the baseline `gpt-4o-mini` with no reasoning effort throughout.
- **Not done, still open:** contention, takeover, lease-loss and discard paths never fired
  (single holder throughout, as in the #77 soak) — #95 stands. Phase 2 is now exercised for
  **one theater/track/day**; the other five live pairs and the full epoch range remain
  modelled only.

### 19.10 §15 dispositions after this run

- **D7 — DISCHARGED.** Recommendation (b) was authorized and executed. What the money bought,
  as predicted: the sweep drain, the completion proof, the lease under a real remap, and the
  no-rebill property, all confirmed on real data.
- **R4 — SIGNED and executed.** Option (a) behaved exactly as designed; the hazard binding
  (absence from all three Vercel environments, before and after) is discharged in §19.8.
- **R16 / R17 — unchanged.** Both still await the operator, after eval step 4. Nothing in this
  run bears on where the activation gate lives or on version-bump ordering; R17's interim
  split-corpus cost remains outside the $36 and outside the $22.4.

### 19.11 Proposed decision-log entry (step 25 applies it; this session edited no AGENTS.md)

> - **2026-09-08 (OPEN-TASKS #33 — the remap driver EXECUTED for the first time; D7 discharged
>   on a disposable fork; the measured cost figure)** Under the signed D7 (`C = $1.00`
>   operative, $10 outer bound) and R4 option (a), the version-aware remap driver — deployed
>   2026-08-21, rehearsed in estimate mode 2026-09-06, never executed — was run in `--execute`
>   mode for the first time against a local `next start` bound to disposable Neon fork
>   **`br-royal-resonance-atvgety1`** (created and deleted this session), `MAP_CONTENT_CHARS=1499`
>   on the fork-bound server only, `MAP_BACKFILL_BASE=http://localhost:3000` on every command.
>   Caps were computed off the fork's COPIED ledger as (f10) requires — `MAP_SPRINT_USD_CAP =
>   T + C = 24.9400` against `T = $23.940010`, `MAP_USD_CAP_DAILY = D + C = 1.4559` against
>   `D = $0.455843` — never a literal ceiling. **One ir/military day (2026-08-25), bounded twice
>   over (`--budget 1.00 --limit 1000`): 701 doc-track pairs attempted, 382 claims, actual
>   $0.046263 against $0.0765 modelled.** Twelve drain sweeps then twelve confirming sweeps
>   returning `pairs=0` — the sweep-completion proof exercised on real data; `omitted=0` on
>   every batch (ruling 7 clean at batch size 20). Reconciliation is exact on all four
>   independent reads: ledger delta $0.046263 == driver $0.0463; `doc_claims` @
>   `gpt-4o-mini:1bfad9e5e447` == 382; `doc_map_state` @ that version == 701; `cron_runs`
>   `map:remap` == 24, all ok. `doc_map_state` at the BASELINE version stayed at 53,006 rows,
>   so ruling 13's rollback is demonstrated rather than asserted. **Measured unit cost
>   $0.0660 per 1,000 doc-track pairs — the estimator is conservative by 1.65×**, landing
>   within 1.5% of the $0.067/1k the 2026-09-06 ledger cross-check predicted; the $36
>   full-corpus figure is confirmed as an upper band and the measured rate projects the same
>   339,669 pairs at ≈$22.4. **No-rebill proven the hard way:** the checkpoint file was deleted
>   and the identical command re-run — 0 pairs, $0.0000, ledger and rows unchanged, so
>   `doc_map_state` is the authority and a lost checkpoint costs a re-scan, never a re-bill.
>   One honest divergence: `provider_usage.requests` 374 → 412 = 38 dispatches against 36
>   modelled batches (truncation splits meter their own request), a 5.6% count overrun the
>   cost model still over-covers. `MAP_CONTENT_CHARS` verified ABSENT from all three Vercel
>   environments before AND after, each listing carrying a positive control. Production was
>   never contacted and still holds zero `map:remap` rows; no env change, no deploy, no
>   migration, no code change; the map activation lock is untouched. Fork deleted, server
>   killed, `data/remap-state/` removed, tree clean. **#33's status changes from "TOOL
>   DEPLOYED, NEVER EXECUTED" to "EXECUTED ON A FORK, one (theater, track, day)"** — the other
>   five live pairs and the full epoch range remain modelled only, and #95 still stands (no
>   contention, takeover, lease-loss or discard path fired). Record: §19 of
>   `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`.

### 19.12 Proposed `docs/OPEN-TASKS.md` #33 status replacement (step 25 applies it)

> **2026-09-08 — EXECUTED on a fork (was: TOOL DEPLOYED, NEVER EXECUTED).** One ir/military
> day drained end to end under signed D7: 701 pairs, 382 claims, **$0.046263 actual vs $0.0765
> modelled = $0.0660 per 1k pairs**, estimator conservative by 1.65×. Sweep-completion proof
> and the no-rebill property (checkpoint deleted, re-run cost $0.0000) both confirmed on real
> data; baseline-version rows untouched. Still modelled-only: the other five live (theater,
> track) pairs and the full epoch range. #95 stands. Record: §19 of
> `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md`.
