# Next-48h handoff — written at the close of the 2026-09-05 execution program (step 26)

**Written from:** the final adversarial audit of frozen `main` `2c66e94` against base `883e5e3`.
Full register: `docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md`. Read that first if you are
deciding what to deploy; read this if you are deciding what to do next.

**Shape of this document:** the same shape as `docs/prompts/2026-09-05-cto-roadmap-handoff.md` —
verified state, what is code-ahead of production, the deploy sequence, the open decisions with
the evidence now available, the readiness of the gated steps, and a first draft of the next
program's Wave 1. It is written to be read cold by a session that has none of this context.

---

## 1. Verified state at the freeze

Everything in this section was measured or executed during the audit, not copied from a report.

| Fact | Value | How it was established |
|---|---|---|
| Frozen `main` | `2c66e94` (`origin/main` is `0bc601b`, +1 docs commit) | `git log` |
| Base | `883e5e3` (2026-09-04) | `git log` |
| Merges in the window | **49** (PRs #47, #48, #49–#97; #82 and #83 never merged — re-landed as #85) | `git log --first-parent --merges` |
| Unit gate | **4,599 tests / 293 files, green** | `npm test`, run on the **full-secret main checkout** (CP5 carry) |
| Typecheck | clean | `npm run typecheck` at the frozen tree |
| Lint | **0 errors, 3 pre-existing `no-unused-vars` warnings** | `eslint .` at the frozen tree |
| Tree-wide build | **PASS** | `LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= POSTMARK_SERVER_TOKEN= DATABASE_URL=postgres://x:y@localhost/z npm run build` |
| Merge fidelity | **49/49 clean** | every merge tree recomputed from its parents; every PR's GitHub `headRefOid` equals the merge's second parent |
| Migrations on `main` | 0000–**0030** + `9999_claim_source_trigger.sql` last; chain 0027→0028→0029→0030 by `prevId` | `drizzle/meta/_journal.json`, snapshots |
| Migrations applied in production | **0027** — 0028/0029/0030 are UNAPPLIED (OPEN-TASKS #111) | standing docs; **not re-verified — needs a DB read this session was forbidden** |
| `vercel.json` | **byte-identical across the entire window** — 14 cron lines, no new one | `git diff 883e5e3..2c66e94 -- vercel.json` |
| Dependencies | **unchanged** — `package-lock.json` byte-identical; the only `package.json` change is `engines.node: ">=22"` | `git diff` |
| Worktree estate | 16 worktrees, **0 `/sessions/` gitdir paths, 0 prunable** | `git worktree list` on a native Mac terminal |
| Secrets in the window | **none** — 284 commits' patch text swept | see the audit §4 "checked and clean" |

**Production is unchanged and unaware of any of this:** deployment
`dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT`, built from **`8a19ade`** (2026-09-03), migrations through
0027, `CONFLICTS_UI` and every new cap env absent from every Vercel environment.

---

## 2. What is code-ahead of production

`main` is ahead of production by the entire 48-hour program. The honest way to read that is not
"49 PRs of risk" but this split, established PR by PR in the audit's §5:

- **20 PRs have zero production runtime effect** (docs, tooling, tests-only, or a comment-only
  change to a runtime file). They deploy as a no-op.
- **~20 PRs are runtime but INERT**, each behind a named gate that is absent today:
  `CONFLICTS_UI` unset (the whole conflict surface), `/api/cron/conflict-validate` absent from
  `vercel.json`, `LOG_DRAIN_SECRET` unset (the drain 503s before reading a body), no
  `analysis-reg-v1` Anthropic approval (every Anthropic dispatch refuses), `ASK_PIPELINE`
  defaulting to v2, `src/lib/evals/*` reachable from no route.
- **8 PRs actually change what a production request does.** Those are the only ones worth
  reasoning about, and they are listed with their worst plausible failure in the audit's §5.

The deploy unit is the **tree**, not the PR: Vercel ships `main`. The per-PR table exists to
identify anything that must be backed out before the tree ships — not to let you ship a subset.

---

## 3. The deploy sequence for step 27

From `docs/RELEASE-CHECKLIST.md`, in this order. The checklist is sound and A2(b)-compliant; the
additions below are what this audit found it does not cover.

**Before anything:**

0. **Fix the four pre-deploy items** the audit marks `go-after-fix` (audit §6). Three are docs;
   one is code. None is large.
1. **Refresh `DATABASE_URL` and `DATABASE_URL_UNPOOLED`** in `/Users/go/code/bnow-net-rel-20260823/.env.local`
   and `/Users/go/code/bnow-net/.env.local` from the Neon console — the local values carry the
   pre-rotation password, and `db:migrate` targets production through them. Prove it read-only:
   `npx tsx scripts/sqlq.ts "SELECT 1"`. If it prints `password authentication failed`, stop.
   **Caveat found by this audit (AUD-10):** if the new password contains `#`, `?` or `/`,
   `assertMigrationTarget` will refuse a *correct* migration and print both DSNs — password
   included — into the error. Choose a password without those three characters, or fix the guard
   first.

**The environment read-back (register gap G3 — the one never-run check that is still open):**

2. Read back, in **all three** Vercel environments, and record the answers in the release record:
   - **expected ABSENT:** `MAP_CONTENT_CHARS` (R4's binding hazard — if it ever reaches a Vercel
     environment the hourly worker silently re-maps the whole corpus at production spend),
     `DIGEST_PROVIDER`, `ANTHROPIC_API_KEY`, `CONFLICTS_UI`, `ASK_PIPELINE`, `OPENAI_MODEL`,
     and **all fifteen** routing variables — the ten `*_MODEL` / `*_REASONING_EFFORT` names
     **plus the five `*_PROVIDER` names** `MAP_PROVIDER`, `REDUCE_PROVIDER`, `DIGEST_PROVIDER`,
     `VALIDATION_PROVIDER`, `ENTITY_AUDIT_PROVIDER`. **AGENTS.md's list says ten and is wrong
     (AUD-04); use this list.**
   - **expected PRESENT and worth reading the value of:** `ASK_EMBED_MODEL`. This is the single
     env the audit could not settle from the repo and it decides whether PR #59 is inert or
     stops nightly embedding: `EMBED_PRICES_PER_MTOK` holds exactly one key,
     `text-embedding-3-small`. If `ASK_EMBED_MODEL` is unset or that value, #59 is inert. **Any
     other value and the 02:00 finalize embed step refuses instead of embedding, and Ask's
     vector arm silently degrades to lexical-only with no cron failure.**
   - **expected PRESENT:** `ASK_ANSWER_MODEL=gpt-5`, `ASK_RERANK_MODEL=gpt-5-mini` — only these
     two carry a scorecard, so any override degrades that stage (PR #67).

**Then the one hard ordering (decision A2(b), signed):**

3. Neon backup branch first.
4. `npm run db:migrate` from the release clone — 0028, 0029, 0030. **Apply it away from a cron
   minute:** 0028 and 0030 each `ALTER TABLE … ADD FOREIGN KEY`, which takes `SHARE ROW
   EXCLUSIVE` on `isw_reports` and on `cron_runs`, and `migrations-lib.ts` wraps the whole file
   in one transaction with no `lock_timeout`. Practically brief (both child tables are empty),
   but it can queue `cron_runs` inserts behind it, and a cron that cannot open its start row
   leaves `finished_at IS NULL` — ruling 10's timeout signal (AUD-09 family).
5. Deploy from the plain release clone only: `npx vercel@latest deploy --prod --yes`.
6. `LOG_DRAIN_SECRET` in Production **before** the deploy that reads it (checklist step 5's
   fail-closed-secret rule).
7. **Only then** register the drain in the Vercel dashboard, after confirming
   `SELECT name FROM _migrations WHERE name LIKE '0029%'` and `SELECT to_regclass('runtime_logs')`.
   Registering before 0029 is applied makes every signed delivery 500 and retry forever.
8. `npx tsx scripts/audit-cron.ts`.

**Post-deploy:** `/health` must stamp the deployed SHA exactly, with DB OK. **Rollback target =
`dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`** (the currently-live deployment). The standing
ladder still applies: **never roll below `52ea272`** — that reintroduces the map-flood failure.

**Observation windows, from the audit's §5:** three map cycles plus one digest cycle for PR #60
(the provider dimension — the longest window, because if `mapExtractorVersion()` ever shifted,
every `doc_claims` consumer would silently see zero current-version rows and every digest would
regress to legacy); the first night's 02:00 finalize for PR #59 (`openai_embed` request count
and `claim_embeddings` inserts must be non-zero); 2 days on the public digest page for #77, #80
and #84; the first crawl for #69.

---

## 4. Open decisions, with the evidence now available

Nothing in the program's own decision sheet is waiting on an answer. These are the decisions the
*audit* surfaced, each with what is now known.

0. **A T3 addendum: may the `claimed × C2/C3` cell carry a defamation-grade allegation at
   `likely (55–80%)`?** New, and the audit's one substantive product question. The estimative
   grid you signed caps every disputed hedging class at `likely / moderate` — but none of T3's
   six invariants mentions content class, and the only harm-shaped constraint is keyed on
   **document count**. Meanwhile the publication guard's `ALLEGATION_MIN_DOCS = 2` is *exactly*
   the count at which the `claimed` row reaches that ceiling, so there is no interval between
   "barely publishable as a defamation-grade allegation" and "likely, 55–80%". Ruling 19 is not
   circumvented (the allegation still cannot reach `confirmed`, which costs it two band steps and
   a confidence step), no surface is public, and the AJP-2.1 code is never rendered — which is
   why this is a decision and not a defect. Evidence and the measured grid:
   `PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` §4.1. **Cheapest remediation if you want one:** route
   a disputed person-allegation to the existing, already-tested `withheld` path
   (`likelihood: null`, "not assessable"). Nothing persists, so a V2 changes it with no backfill.
1. **May a `unit-flags-v0` number reach a PUBLIC surface at `CONFLICTS_UI` flag-on?** Raised by
   step 24 and still open. Evidence now available: `compound` is hard-coded `false`, which is the
   over-credit direction; D4/C13's binding condition says no `unit-flags-v0` number leaves the
   internal view; and the audit found (AUD-11) that the `negative` heuristic's own false-positive
   controls do not discriminate — a widened heuristic would pass the suite while silently turning
   matchable units into misses. **Recommendation: land `compound-v1` before flag-on**, and fix
   AUD-11's controls first, because that heuristic's precision is exactly what the soak measures.
2. **Does `engines.node: ">=22"` change the deploy runtime?** Unprovable from the repository:
   there is no Vercel Git integration, `gh api …/deployments` is empty, and CI never runs
   `npm run build`, so this line has never been evaluated by Vercel's version selector in *any*
   environment. **Recommendation: confirm the project's Node setting is already 22.x or newer
   before deploying, and consider pinning `22.x` instead of `>=22`** so the runtime is
   reproducible across deploys.
3. **Should `docs/operator-notes-20260905` be deleted?** The audit says yes and now (AUD-02).
4. **Should the `Co-Authored-By` trailer in `901078a` be left in history?** It cannot be removed
   without a rewrite. **Recommendation: leave it, record it** — a rewrite of pushed history costs
   more than the violation.

---

## 5. Readiness of the label-gated steps (WS-1.3 → WS-1.5)

These were deliberately out of scope for this window (INDEX §9). Their inputs are now in place:

- **Ledger.** `docs/reviews/EVAL-EXPOSURE-LEDGER.md` exists, is append-only and dated, and
  carries current entries for both authorized writers under `docs/evals/analysis/` — step 07's
  two files and step 19's E5 refresh. The step-19 entry self-discloses its heldout-*id* exposure
  and the `discardedRuns` side effect rather than omitting them.
- **Memo.** `docs/reviews/EVAL-VAL-TYP-005-ADJUDICATION-2026-09-05.md`, signed as E4: takeaway 1
  of `val-typ-005-majority` is `claimId: null`. WS-1.3 records this reason in the validation-v3
  admission; any changed reference needs a new case ID or `datasetVersion`.
- **Cases.** `docs/evals/analysis/map-inj-dev-v1.json` — six development-split injection cases,
  content hash `c531e300…9ee29ef1aa`, offline-proven, registered `developmentOnly: true` so it
  forces `scope: "dev"` and can never verdict. The ×3 capture run executed 2026-09-08 under D6
  (18 requests / $0.0039 actual on the kept branch `br-weathered-forest-atmfaetu`).
- **Versioning.** D3 is signed: the conflict-keyed dataset is **v4**, created *after* WS-1.3
  freezes the per-country v3. WS-3 stays off the label timeline; coordination is naming only.

**The one thing that is NOT ready, and it is a hard blocker for the paid answer-model matrix:**
PR #67's scorecard gate makes `answerFromEvidence` abort with
`ABORT: degraded result … provider=unscorecarded`, and `scripts/ask-eval.ts` drives its answer
stage through that same function — so the run that would *produce* a scorecard aborts on
question 1. Decision **R14** pre-committed the shape: the escape hatch is an eval-only,
route-unreachable in-code opt-in (`opts.evalUngated`, set only by `ask-eval.ts`, proven by a
source scan on the `isolation.test.ts` precedent). **`ASK_SCORECARD_GATE=0` is FORBIDDEN.** The
hatch is built in the PR that schedules the matrix, not before.

**WS-1.5 sizing note.** The planned matrix is **≈570 requests**. The eval guard's own defaults
are `EVAL_DAILY_REQUEST_CAP` **300/day** and `EVAL_RUN_REQUEST_CAP` **200/process**
(`src/lib/evals/eval-guard.ts:43-44`), and `EVAL_USD_CAP_DAILY` is fail-closed with no
out-of-production default (`:42`). **570 requests cannot run as one process or in one day** —
the run must be chunked across at least three processes and two days, or the per-process cap
raised deliberately and recorded. Plan for that before the matrix is scheduled, not during it.

---

## 6. WS-3.6 shadow-soak enablement state

Everything the soak needs is built and dormant. What stands between here and a soak:

1. **The enablement checklist has a hole (AUD-05, major).**
   `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` has **no migration precondition
   for 0028 or 0030** — its only migration gate is for 0029/`runtime_logs`, a different feature.
   Fix the checklist before anyone runs it. Without the fix, the first scheduled run fetches
   first and writes second, every cell throws `42P01`, the route catches per cell and marks
   degraded rather than failing — a soak that looks alive, burns the probe budget against a host
   already known to throttle, and records zero observations indefinitely.
2. **Ruling 4's ordering bites here, not at deploy.** `CONFLICT_MATCH_USD_CAP_DAILY` must exist
   in **all three** Vercel environments **before** the `conflict-validate` cron line is added to
   `vercel.json` (D4/C12, N1). Deploying the guard with it unset stops nothing — the paid rung
   refuses before any reservation and the keyword rung scores instead.
3. **N2 still forbids** a production `GET /api/cron/conflict-validate` with `CRON_SECRET` until
   the WS-3.6 scheduling entry, with one exception: a bounded operator smoke over a single date
   and a single conflict, signed in the log before it runs.
4. **The soak's own instrument has an unpinned heuristic** (AUD-11) and a meaningless token
   column (AUD-46: `llm_conflict_match` records 1 token per request by construction; USD is
   correct). Fix both before reading soak numbers.
5. **C15's reopening trigger is armed but never fired:** any `publication_gap` whose confirming
   `probe_failed` came from the same backfill run reopens the `first_observed_at` question. The
   2026-09-08 C5-m passes never exercised it (gap confirmation needs every probe to be a clean
   404, and under throttling none was).

---

## 7. What the operator can see working — exact commands

Each of these was executed during the audit at `2c66e94` and produced the stated result. Run
them from a worktree or the main checkout; none contacts a provider, a database or Vercel.

```bash
# 1. Routing surfaces, with the provider column (register gap G14).
npx tsx scripts/model-routing-inspect.ts
#   -> five workloads, all provider=openai gpt-4o-mini approved=baseline ok
#      Provider allowlist: map={openai} reduce={openai} digest={openai,anthropic}
#                          validation={openai} entity_audit={openai}
#      "No provider request was made by this inspection."

# 2. The map lock refuses a vendor before any reservation.
MAP_PROVIDER=anthropic npx tsx scripts/model-routing-inspect.ts
#   -> map ... BLOCKED: provider "anthropic" is not allowed for workload "map"
#      (allowed: openai) — failing closed

# 3. The Anthropic digest path is priced and wired, and still refuses.
DIGEST_PROVIDER=anthropic DIGEST_MODEL=claude-sonnet-5 npx tsx scripts/model-routing-inspect.ts
#   -> digest ... priced=yes approved=NO
#      BLOCKED: (anthropic, claude-sonnet-5) has no analysis-reg-v1 approval for
#      workload "digest" — pricing alone is not quality approval

# 4. The eval CLI refuses an Anthropic live run at preflight, before any client.
#    NOTE: the key refusal is reached only after the DB-ack gates, so pass them:
EVAL_DATABASE_URL='postgres://u:p@dummy.invalid:5432/evaldb' \
ANTHROPIC_API_KEY= OPENAI_API_KEY=sk-probe \
npx tsx scripts/analysis-eval.ts --execute-live --db-ack dummy.invalid:5432 \
  --workload digest --model claude-sonnet-5 --provider anthropic
#   -> REFUSED (before any client construction): analysis-eval: ANTHROPIC_API_KEY is not set
#    and the per-workload gate, with a key present:
#   --workload map ... -> REFUSED ... provider "anthropic" has no eval dispatch path
#                        for workload "map" in this build (it can evaluate: digest)

# 5. The gazetteer lane fixtures score offline, with zero provider contact.
npx tsx scripts/analysis-eval.ts --profile conflict --offline
#   -> [conflict/russia_ukraine] nothing to do — 8 result(s) already recorded
#      [conflict/iran_regional]  nothing to do — 6 result(s) already recorded
#      conflict offline scoring complete. ... Zero provider contact.

# 6. The corpus-v2 regeneration proof.
bash scripts/evals/corpus-v2/check-regen.sh
#   -> byte-identical regeneration verified.
#      corpus-v2 regeneration proof PASSED (drafts + fragments + v2 datasets byte-exact).

# 7. The worktree estate is clean (run from a NATIVE Mac terminal — a remote mount
#    shows every worktree as prunable, which is the mount, not the estate).
git worktree list
#   -> 16 worktrees, no /sessions/ path, nothing prunable

# 8. The gate at the frozen tree.
npm run typecheck && ./node_modules/.bin/eslint . && npm test
#   -> clean / 0 errors, 3 pre-existing warnings / 4,599 passed (293 files)
LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= POSTMARK_SERVER_TOKEN= \
  DATABASE_URL=postgres://x:y@localhost/z npm run build
#   -> PASS
```

**One command in the prompt's list that this audit could NOT run, and why:** *"a fresh fork
applies 0000–0030 idempotently."* That needs a disposable Neon branch and a real migration run;
this session was barred from every database. It belongs to step 27, immediately before the
production `db:migrate`, and it is the cheapest possible rehearsal of that command — **do it.**

---

## 8. First draft of the next program's Wave 1

Ordered by what blocks what, not by size. Each is one session in its own worktree.

| # | Step | Why first | Gate |
|---|---|---|---|
| 1 | **Deploy (step 27) and observe** | Everything below is easier to reason about once production and `main` are the same code. Nothing else in this list may start until the observation windows in §3 close. | operator; audit §6's four fixes applied |
| 2 | **The audit's `go-after-fix` items** (audit §6) | Four small fixes; three docs, one code. Cheap and they gate the deploy. | — |
| 3 | **`compound-v1`** — a human-calibrated compound-unit classifier | The one named prerequisite for WS-3.6, and the answer to the open decision in §4.1. Fix AUD-11's false-positive controls in the same PR. | — |
| 4 | **WS-3.6 soak enablement** | After 3. Fix AUD-05's checklist hole first, then `CONFLICT_MATCH_USD_CAP_DAILY` in all three environments, then the cron line. | 3; the migrations applied |
| 5 | **WS-1.3 — validation-v3 + the injection union into map-v3** | Its three inputs (ledger, memo, cases) are ready; it is the gate for every later label step. | — |
| 6 | **R14's escape hatch + the paid answer-model matrix** | Blocked today (§5). Build the hatch in the PR that schedules the matrix, chunk the ≈570 requests against the 300/day and 200/process caps. | 5; operator spend authorization |
| 7 | **Guard hardening from this audit** | Convert the ruling-3 scan to the whole-directory `matcher-import-hygiene` shape with a positive control (AUD-17); extend the client-boundary scan to the full client closure (AUD-07); add 0029's additivity pin (AUD-09); fix `assertMigrationTarget`'s hostname-only comparison and its credential-printing error path (AUD-10). | — |
| 8 | **Standing-doc truth pass** | AUD-04, AUD-06, AUD-23 through AUD-31, AUD-36, AUD-37, AUD-40 — about twenty corrections, each with doc and code cited in the register. Mechanical; a Sonnet session with a verification grep per item. | — |

**Two standing hazards to carry into any future program, both learned expensively here:**

1. **A raw NUL byte in a source file makes git treat it as binary and `grep -r` skip it
   silently** (AUD-32). One such file was added in this window and its PR diff rendered as
   `Bin 0 -> 1719 bytes` — literally unreviewable. A second, pre-existing one
   (`digest-persist.ts`) is invisible to every grep-based audit in this program, including parts
   of this one. Tracked as OPEN-TASKS #118; treat a grep-based sweep as incomplete until it is
   fixed.
2. **A closing report names its own base SHA, never its final tip**, because the report is
   committed on the branch it describes. Any future "compare the reviewed head to the merged
   head" check must get the tip from GitHub (`gh pr view --json headRefOid`) or from the merge
   commit's second parent — not from the report.
