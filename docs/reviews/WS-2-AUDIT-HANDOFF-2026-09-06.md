# Step 17 — WS-2 + WS-4 adversarial audit: HANDOFF (paused for budget)

**Written 2026-09-06 22:31 EDT (2026-09-07T02:31Z).** Session: 48-hour program step 17 (Fable / xhigh / ultracode),
worktree `/Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905`, branch
`48h/audit-ws2-20260905-finding-register`, audited SHA **`98294c5`** (main after CP2b), PR #67 at
**`697aea4`**. Prompt: `docs/prompts/2026-09-05-48h-17-audit-ws2.md` in its FULL form (taken from
`origin/main` `a821695`; the worktree file is the older sketch). The operator stopped the audit
workflow when its agent count reached 227 at roughly $30 spent. Nothing here is a finding
register yet; the register (`docs/reviews/WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md`) is still to be
written from the material preserved below.

## 1. Where things stand

| Item | State |
|---|---|
| Worktree / branch | proven (toplevel = worktree, branch ≠ main); HEAD `98294c5`; register branch cut; `package-lock.json` churn restored per COMMON §1 |
| Baseline | `npm test` at `98294c5` = **3,914 tests / 263 files** green (12.3 s); `697aea4` = 3,940 / 263 (#67's report; re-measured by the #67 mutation agent) |
| Evidence pack | one diff per merge (#52 `d74d588`, #57 `8ac41d2`, #59 `8a00ea2`, #60 `fed1d03`, #61 `ef0bba8`, #62 `c75bd99`, #64 `1e06112`, #65 `7f267bd`) + PR #67 branch diff; regenerable with `git diff <merge>^1 <merge>` (the scratchpad copy is session-temporary) |
| Workflow `wf_d653ae1a-f22` | **Round 1 COMPLETE**: 13 lens finders → 81 raw findings → dedup → **71 distinct findings (8 major / 25 minor / 38 note)**. **Refutation PARTIAL**: 13 of 213 planned refuter votes finished before the stop (all 13 non-refuted: 5 "stands", 8 "stands with severity change"); 16 refuters were killed mid-run (no partial output survives). Completeness critic and round 2 never started. |
| Cost at stop | ≈$30 (operator's reading). The plan was 13 finders + 1 dedup + 71×3 refuters + 1 critic + round 2 ≈ 227 agents; observed ≈$0.7–1 per completed agent. |
| Durable artifacts | (a) **`docs/reviews/WS-2-AUDIT-ROUND1-RAW-2026-09-06.json`** (this commit; ≈600 KB): every finder's full structured result (findings, verified_clean, mutation_log, coverage_notes), the dedup output, and the 13 verdicts — secret-scanned, only fixture strings. (b) Workflow journal + per-agent transcripts (durable, outside the repo): `~/.claude/projects/-Users-go-code-bnow-net-worktrees-48h-audit-ws2-20260905/965b7ef9-302a-423a-b621-fc19a6841b03/subagents/workflows/wf_d653ae1a-f22/` (`journal.jsonl`, `agent-<id>.jsonl`). (c) Script: `…/965b7ef9-…/workflows/scripts/ws2-audit-step17-wf_d653ae1a-f22.js`. (d) Appendix A below = the register's drafted static sections (scope, method, PR table, re-verified citations). (e) Appendix B = the 71 findings condensed + the 13 verdicts. |
| Scratch worktrees | 17 detached worktrees (12 for finders/mutations, 5 created by refuters) under the session scratchpad were restored and REMOVED; `git worktree prune` run; the shared repo's worktree list is back to its prior state. Two refuter worktrees held half-applied probes (`src/lib/ask/limits.ts`, `probe-f08.ts`) — discarded with them. |
| Audit tree integrity | no source, test, migration or standing-doc file changed; only `docs/PROGRESS.md` (plan block + execution bullets) and the two new files in this commit. |
| Spend / access | $0 provider spend; no deploy; no Vercel read/write; no DB connection (see disclosure); no fork. |

**Disclosure — `.env.local`.** The prompt says "no `.env.local` in this worktree"; a trimmed one
(`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY` — names only were
read; gitignored) was already present and was left in place. One baseline `npm test` ran in the
audit worktree before it was noticed; two test files spawn `scripts/analysis-eval.ts`, which
side-effect-imports `scripts/env.ts` (dotenv), so `DATABASE_URL` was in those subprocesses'
environment. No connection was opened: the eval CLI never reads `DATABASE_URL`
(`scripts/analysis-eval.ts:49-50`; live mode reads `EVAL_DATABASE_URL` only behind
`--execute-live` + `--db-ack`, `src/lib/evals/live-runner.ts:210-249`) and every spawned mode in
those tests is a refusal / `--offline` / `--estimate` / `--report` / `--validate-dataset` /
`--capture-reconcile` invocation. Every later test, probe and mutation ran in detached scratch
worktrees with no `.env.local`.

## 2. What changed (this session)

- **Repo (this commit, branch `48h/audit-ws2-20260905-finding-register`):** `docs/PROGRESS.md`
  (step-17 plan block + execution bullets), this file, and
  `docs/reviews/WS-2-AUDIT-ROUND1-RAW-2026-09-06.json`. **No code, test, migration, AGENTS.md or
  OPEN-TASKS change.** Commit message is plain (no vendor branding, repo CLAUDE.md rule).
- **Git objects:** `origin/48h/ws2-routing-20260905-auto-scorecard-gate` fetched (PR #67). No
  branch other than the register branch created; no push other than this branch.
- **Machine:** scratch worktrees created and removed (above). The session scratchpad
  (`/private/tmp/claude-501/…/scratchpad`) still holds the diffs, the #67 report copy and the
  per-agent result JSONs, but it is session-temporary — everything needed is in the raw bundle.
- **Workflow:** `wjfdnw69x` / run `wf_d653ae1a-f22` stopped with TaskStop; no agent is running.

## 3. Findings so far — the eight majors (pre-refutation severities; votes noted)

| id | PR | one line | refuter votes so far |
|---|---|---|---|
| WS2-F01 | #64 | No signature test flips one byte of a valid HMAC; a mutant comparing only the first 4 bytes survives all 60 unit tests and the itest's only forgery case (wrong secret). Fix: byte-flip cases at head/middle/tail + a 403 route case. | factual: stands→**minor**; remediation: stands→**minor** (2 of 3; both say the code at `drain.ts:115-116` is correct and only the pin is missing) |
| WS2-F02 | #64/#62 | `stripQuery` collapses the four `/api/cron/ingest?which=…` jobs onto one `request_path`; the design's §9(c) `cron_runs` JOIN cannot separate the deliberately overlapping :01/:02/:03 ingest runs, and "recoverable from `cron_runs.job`" is not executable from the stored columns. | factual: stands **major**; impact: stands→minor; remediation: stands→minor (3 of 3 non-refuted; split on severity) |
| WS2-F03 | #64 | A NUL (U+0000) in any text field makes the whole multi-row INSERT fail (Postgres rejects 0x00), the route answers 500, Vercel retries the identical batch — the batch is lost; `status_code` has no int4 clamp. Postgres rejection asserted from documented behaviour, not reproduced on a fork. | factual: stands **major**; remediation: stands→minor (2 of 3) |
| WS2-F04 | #64/#62 | The enablement order (secret → deploy → register → verify) omits the manual `npm run db:migrate` step (nothing applies migrations on deploy: `build` = `next build`, no buildCommand); registering the drain before it makes every delivery 500 + retry. | factual: stands **major**; impact: stands **major**; remediation: stands→minor (3 of 3) |
| WS2-F05 | #65 | The only pin that the CLI runs `assertBaseAck` before the driver is an `indexOf` over the source; a commented-out or `try{}catch{}`-wrapped call passes (69/69). Guard itself works end to end. | factual: stands→minor; impact: stands→minor (2 of 3) |
| WS2-F06 | #67 (pre-existing since `cea8cac`) | `ASK_PIPELINE=legacy` (the documented rollback) dispatches a paid chat completion with **no SpendGuard at all** — no `tryReserve`/`record`/`provider_usage` row; bounded only by the fail-open $10/day `ask_usage` SUM gate. #67's disclosure names only the missing scorecard gate. Rated major (pre-existing, env unset in production). | factual: stands **major** (1 of 3) |
| WS2-F07 | #67 | The "exact cache refuses `unscorecarded`" pin is vacuous (no `evidence_snapshot` mock → `cacheStore` skipped before the provider predicate); the pre-existing stub/budget pin is vacuous the same way. Production code at `limits.ts:733` is correct. | none completed (3 killed in flight) |
| WS2-F08 | PLAN-WS-2 | Two of PLAN-WS-2's proposed AGENTS.md changes are wrong/superseded and must not be applied by step 25 (its ruling-13 addendum contradicts the code — the provider is NOT in the extractor basis; its Architecture text presumes B1 merged). | none completed |

Under the prompt's rule a finding survives with ≥2 non-refutations: F02 and F04 already
survive (with F02's severity split major/minor/minor → minor on the median); F01, F03, F05 have
2 of 3 (survive if the third does not refute); F06 has 1; F07, F08 none. Every vote so far is a
non-refutation, which is a strong prior for the rest but is not the protocol.

Other findings worth the operator's eye before any deploy (minor unless noted): F13 (#59's
refusal has a THIRD production caller, `digest-persist.ts` embed fail-open, not described),
F15 (#59 weakened the "uses ASK_EMBED_MODEL" pin rather than moving it), F17/F18/F43/F44
(ruling-13 latent hazards in the post-widening shape and a pre-existing "lock-blocked map model
still moves the version"), F20 (WS-2-2 mutation counts do not reproduce exactly: 15/8 files not
13/6), F22 (`.length === 1` pin evadable by a defaulted parameter), F25/F26 (drain `posInt`
accepts 0.5 → 0; `LOG_DRAIN_MAX_ROWS` > 5,461 breaks every INSERT on the 65,535-parameter
bind cap), F28/F33/F70/F71 (stale standing text for step 25, incl. `AGENTS.md:116` drizzle
range and the Live/repository bullet). Full table: Appendix B.

## 4. Exact next steps

Pick one path, then finish with the common tail.

**Path A — no further agent spend (recommended if the budget is the constraint).** The lead
session writes the register directly from the raw bundle: re-verify each of the 8 majors and
25 minors by hand at `98294c5` (read-only; the raw JSON carries file:line, reproduction and
remediation for each), assign final severities, carry the 38 notes with lighter verification,
and record in the register's Scope that the three-refuter protocol ran for 6 findings only (13
votes, listed in Appendix B) and was stopped for budget — a stated deviation from the prompt,
not a hidden one. ≈1.5–2 h of lead time.

**Path B — bounded agents, this session only.** Edit the script so majors get 3 refuters, minors
1 (factual lens), notes 0, and delete the critic/round-2 stages; then
`Workflow({scriptPath: "<script path above>", resumeFromRunId: "wf_d653ae1a-f22"})`. Cache hits
require byte-identical `agent()` prompts, and the prompts embed the session scratchpad path
(`S` constant), so the 13 finders, the dedup and the 13 finished votes are reused **only in this
session** (or one whose scratchpad path is identical). New agents ≈ 11 (remaining major votes)
+ 25 (minors) = **36 ≈ $25–35**. Before resuming: recreate scratch worktrees (Path recipe below),
because the mutation-lens prompts and refuters reference them.

**Path C — hybrid:** Path B for the 8 majors only (11 agents ≈ $8–11), Path A for the rest.

**Common tail (any path):** write `docs/reviews/WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md` with
the prompt's Output contract (per finding: id, severity, PR, file:line, claim, reproduction,
refutation summary, exact remediation; per-PR verdict merge-stands / fix-before-deploy / revert;
stale-standing-text list for step 25; mutation log; COMMON §5 sections — Appendix A is the
drafted Scope/Method/Citations); secret-scan it; append the "Execution (same block)" bullets in
PROGRESS.md; commit on this branch; `gh pr create --base main --head
48h/audit-ws2-20260905-finding-register`; step 23 remediates.

**Per-PR verdict sketch from the round-1 evidence (NOT final — the register decides):** #52,
#57, #59, #60, #61, #65 → merge-stands with test/docs fixes for step 23; #64 → fix-before-deploy
(F03 NUL/int4 hardening; F04 enablement order must add the migrate step; F01/F23 pins; F02
design correction) — the receiver is inert without `LOG_DRAIN_SECRET`, so the merge itself is
safe; #62 → docs corrections (F02, F04, F51, F55); #67 → merge-after-fix for the F07 vacuous pin
and an accurate F06 disclosure (the legacy-path guard gap is pre-existing and needs its own
OPEN-TASKS entry, not a #67 change). No blocker was raised.

### Restart recipe (from a clean shell)

```
cd /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905
git rev-parse --show-toplevel && git branch --show-current     # must be this worktree, branch 48h/audit-ws2-20260905-finding-register
git fetch origin && git status --short                            # expect clean (or only register work)
git log -1 --format=%h HEAD^                                      # parent of the handoff commit = 98294c5
S=/tmp/ws2-audit-scratch && mkdir -p $S/diffs
for pr in 52:d74d588 57:8ac41d2 59:8a00ea2 60:fed1d03 61:ef0bba8 62:c75bd99 64:1e06112 65:7f267bd; do n=${pr%%:*}; m=${pr##*:}; git diff $m^1 $m > $S/diffs/pr$n.diff; done
git fetch origin 48h/ws2-routing-20260905-auto-scorecard-gate && git diff 98294c5 697aea4 > $S/diffs/pr67.diff
# scratch worktrees (only if running agents / mutations): NEVER run vitest in the audit worktree (it carries a trimmed .env.local)
for i in 1 2 3; do git worktree add --detach $S/mut$i 98294c5 && ln -s $PWD/node_modules $S/mut$i/node_modules; done
git worktree add --detach $S/mut4 697aea4 && ln -s $PWD/node_modules $S/mut4/node_modules
# raw material: docs/reviews/WS-2-AUDIT-ROUND1-RAW-2026-09-06.json  (fields: finders[].{lens,findings,verified_clean,mutation_log,coverage_notes}, dedup.findings[] (71, ids WS2-F01..F71, with merged_from/lenses), verdicts[] (who = finding:lens))
# when done: git worktree remove --force $S/mut*; git worktree prune
```

## 5. Decisions needed from the operator

1. **Budget for the remaining refutation** (Path A / B / C above). Recommendation: A, or C if
   ~$10 is acceptable — the 13 votes so far were unanimous non-refutations, so the marginal
   value of full three-vote coverage on notes is low.
2. **May the register state the protocol deviation** (three refuters not run for every finding)
   rather than the audit being re-run in full? Recommendation: yes, stated in Scope and in the
   PR body; step 26's final audit can re-refute anything step 23 disputes.
3. **WS2-F06 ownership**: the unguarded `ASK_PIPELINE=legacy` money path predates every audited
   PR; it should become an OPEN-TASKS entry (next free number after #107) and a step-23 fix, not
   a #67 blocker. Recommendation: file it; fix in step 23 (one hunk + one pin).

## Appendix A — register static sections as drafted

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-17-audit-ws2.md` in its full form (`origin/main`
  `a821695`, "steps 17 and 18 written in full"), read after `docs/prompts/2026-09-05-48h-COMMON.md`
  §3 and §4.10. The worktree itself was at the sketch version; the full prompt was taken from
  `origin/main` and is the one executed.
- Lane / worktree: `audit-ws2`, `/Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905`
  (verified: `git rev-parse --show-toplevel` is the worktree, branch never `main`), HEAD already
  at the audited SHA `98294c5` — no reset was needed.
- Register branch: `48h/audit-ws2-20260905-finding-register` (cut from `98294c5`).
- Mode: **Fable / xhigh / ultracode**, attended interactive session. Read-only: the only edits in
  the audit worktree are this register and the PROGRESS.md block; `package-lock.json` churn from
  the worktree's `npm install` was restored with `git checkout -- package-lock.json` before
  anything ran (COMMON §1).
- Spend: **$0.** No provider call, no deploy, no Vercel read or write, no fork, no production
  write, no migration, no cron invoked.
- **Disclosure — `.env.local` in the audit worktree.** The prompt says "no `.env.local` in this
  worktree"; one was present when the session started (451 bytes, dated 2026-09-06 21:04, the
  COMMON §4.10 trimmed shape: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`,
  `NEON_API_KEY` — names read, values never read or printed; it is gitignored,
  `.gitignore:3`). It was left in place, not deleted. One baseline `npm test` ran in the audit
  worktree before it was noticed; two unit test files (`src/lib/evals/conflict-cli-refusals.test.ts`,
  `src/lib/evals/injection-dataset.test.ts`) spawn `scripts/analysis-eval.ts`, which
  side-effect-imports `scripts/env.ts` (dotenv over `.env.local`), so `DATABASE_URL` was present
  in those subprocesses' environment. No connection was opened: the eval CLI never reads
  `DATABASE_URL` (`scripts/analysis-eval.ts:49-50`, `src/lib/evals/live-runner.ts:210-213` —
  live mode reads `EVAL_DATABASE_URL` only, behind `--execute-live` + `--db-ack`), and every
  spawned mode in those tests is a refusal, `--offline`, `--estimate`, `--report`,
  `--validate-dataset` or `--capture-reconcile` invocation. Every later test, probe and mutation
  run happened in detached scratch worktrees under the session scratchpad
  (`git worktree add --detach … 98294c5` / `697aea4`, `node_modules` symlinked, no `.env.local`),
  all removed at the end of the session.

## 0. Method

- **Lenses** (the prompt's eight, plus PR #67 under lenses 1, 2 and 6): one finder agent per
  lens read the whole diff of every PR in its lens plus every touched file in full at the audited
  SHA. Lens 6 (tests as evidence) ran as five agents: four mutation groups, each in its own
  scratch worktree (#59/#60/#57 · #64/#65 · #52/#61 · #67 at `697aea4`), and one read-only
  "no pin deleted rather than extended" assertion diff over every modified test file.
- **Refutation rule** (prompt): every raw finding was deduplicated across lenses, then given to
  three independent refuters with distinct lenses — factual reproduction, impact/severity,
  remediation/test-evidence — each instructed to default to "refuted" unless its own
  re-verification at the SHA sustained the claim. A finding survives with ≥2 non-refutations.
- **Completeness critic**: after round 1, a critic compared the finders' coverage against the
  prompt's lens list and the reports' claims; the gaps it named were closed by a second finder
  round and refuted the same way.
- **Evidence pack**: one full diff per merge (`git diff <merge>^1 <merge>`), the cumulative
  `2203150..98294c5` diff, and PR #67's `98294c5..697aea4` diff; the seven reports named in the
  prompt plus PR #67's `docs/reviews/WS-2-1-AUTO-GATE-2026-09-06.md` (taken from its branch).
- **Baseline**: `npm test` at `98294c5` = **3,914 tests / 263 files** green (12.3 s); at
  `697aea4` = 3,940 / 263 (per PR #67's report, re-measured by the mutation agent).

## 1. Under audit (base `98294c5`)

| PR | Step | Merge | What | Report |
|---|---|---|---|---|
| #52 | 09 | `d74d588` | Anthropic seam hardening — `ANTHROPIC_NOT_REGISTERED` typed refusal, key-alone branch deleted, well-formed slice | `ANTHROPIC-SEAM-HARDENING-2026-09-05.md` |
| #57 | 11 | `8ac41d2` | read-only Ask attribution report over `ask_usage` + hygiene #44/#82 | `WS-2-1-ASK-PARITY-2026-09-06.md` |
| #59 | 11 | `8a00ea2` | model-aware embedding pricing; unpriced embed model refused before reservation | `WS-2-1-ASK-PARITY-2026-09-06.md` |
| #60 | 12 | `fed1d03` | provider dimension on analysis dispatch; allowlist `{openai}`; `pricedFor`; identity stamped with provider | `WS-2-2-PROVIDER-CORE-2026-09-06.md` |
| #61 | 12 | `ef0bba8` | offline eval results identity decoupled from the live registry constant | `WS-2-2-PROVIDER-CORE-2026-09-06.md` |
| #62 | 16 | `c75bd99` | log-drain design (docs — audited against #64) | `LOG-DRAIN-2026-09-06.md`, `docs/designs/LOG-DRAIN.md` |
| #64 | 16 | `1e06112` | `/api/logs/drain` receiver, HMAC-SHA1, `runtime_logs` migration 0029, retention sweep | `LOG-DRAIN-2026-09-06.md` |
| #65 | 22 | `7f267bd` | `scripts/map-remap.ts` `--base-ack` fail-closed guard + runbook | `MAP-REMAP-RUNBOOK-2026-09-06.md` |
| #67 | 11b | open, tip `697aea4` | `hasScorecard()` gate on the Auto money path (baseline pinned unchanged) — audited under lenses 1, 2, 6 | `WS-2-1-AUTO-GATE-2026-09-06.md` (branch) |

Merge SHAs confirmed from `git log --merges 2203150..98294c5` (and `d74d588` directly — #52
merged before `2203150`). PR #67 was open (`gh pr list`: mergeStateStatus UNSTABLE, checks
`gate` SUCCESS and `integration` SUCCESS) when the audit started, so it is the ninth item.

## Citations re-verified (at `98294c5` unless marked; corrected where moved)

| Cited (prompt / report) | Verified |
|---|---|
| `model-config.ts:156-159` map-lock predicate | moved → **`:236-237`** (predicate) and **`:241`** (`MAP ACTIVATION BLOCKED` message); `MAP_BASELINE` const `:96`; text byte-identical to `2203150` |
| `map-prompts.ts:254-266` extractor basis | ✅ `mapExtractorVersion` `:254`, `content=` term `:260`; file untouched by any PR under audit |
| `quality-funnel.ts:474-475` opaque dispatch read | ✅ exact; sentinel `PRE_HARDENING_DISPATCH` `:449` |
| `schema.ts:615` `ask_usage.provider` comment | ✅ `:615` at `98294c5` (`openai:<model>|stub|none|error`); #67 edits the comment at `697aea4` |
| `scripts/map-remap.ts:215-227` `assertBaseAck` | ✅ `:215-223`; CLI call `:695`; `LOOPBACK_HOSTS` `:186`; `remapBaseHost` `:192` |
| `answer.ts:573` / `rerank.ts:204` / `answer-stream.ts:125` (PLAN) | at `697aea4`: `askAnswerModel()` `:574`, gate `:588`; `askRerankModel()` `:205`, gate `:214`; stream gate `:149` before `askGuardFromEnv()` `:152` / `init()` `:153` / `tryReserve()` `:154` |
| `limits.ts:733` `startsWith("openai")` | ✅ exact |
| `live-runner.ts:161` literal `"openai"` (WS-2-2 Handoff) | **`:164`**; the `REASONING_MODEL` mirror `:114` |
| `llm-guard.ts:11,16,22,194` row-key constants (PLAN) | **`:19`, `:24`, `:30`, `:202`** after #60's comment insert |
| `retrieve-v2.ts:160-166` catch → lexical-only | ✅ `:160-166` |
| `run-guards.ts:86-99` shared row / `:48-50` embed ceiling | shared row `:87-101`; `embedCeilingUsd` **`:53`** |
| `llm/openai.ts:142` SDK ctor / `:160` reservation | ctor **`:37`** (`new OpenAI({ maxRetries: 0 })`), embed reservation `:160`, record `:185` |
| `analysis-registry.ts:129-152` finder; five `provider: "openai"` | ✅ `analysisApproval` `:129`; entries `:62,:74,:86,:98,:110`; version literal `:38` |
| `analysis-registry.ts` version `analysis-reg-v1` | ✅ `:38`, unchanged |
| `entity-audit/route.ts` 503 before guard | `workloadDispatchConfig` `:66`, 503 `:69`, `tryReserve` `:78` |
| `drizzle/` chain | journal tail `28 0028_lumpy_dragon_lord | 29 0029_runtime_logs`; `0029_snapshot.prevId === 0028_snapshot.id` (CHAIN-OK); `9999_claim_source_trigger.sql` last |

## Appendix B — round-1 findings after dedup (71) and the 13 completed refuter votes

Severity is the finder's pre-refutation judgment; "lenses" names the finder(s). Full text of every
finding (claim, reproduction, remediation, disclosure) is in `WS-2-AUDIT-ROUND1-RAW-2026-09-06.json`
under `dedup.findings[]`.

| id | sev | PR | file:line | claim (condensed) | lenses |
|---|---|---|---|---|---|
| WS2-F01 | major | #64 | src/lib/logs/drain.test.ts:83-100 (rejection cases); src/lib/logs/drain.ts:115-116 (compar | No signature test alters a byte of an otherwise-valid HMAC: every rejection case uses a wholly different digest (wrong secret :83, altered body :88) or a non-hex/wrong-length header (:93-100). A mutant comparing only the first 4 b | 6b |
| WS2-F02 | major | #64 (and #62 design) | docs/designs/LOG-DRAIN.md:228-229, :490-500 (§9(c) JOIN), :543; docs/reviews/LOG-DRAIN-202 | The design's deciding argument for sink (a) — 'correlation with cron_runs in one JOIN' on request_path = '/api/cron/<job>' plus a logged_at window, with the query-string discriminator 'recoverable from cron_runs.job' — is false fo | 7 |
| WS2-F03 | major | #64 | src/lib/logs/drain.ts:196-201 (str), :250-256 (message), :203-205 (int); src/app/api/logs/ | A single entry whose message/id/path contains U+0000 makes the whole delivery permanently unstorable: normalizeEntry passes NUL through, PostgreSQL text columns reject it ('invalid byte sequence for encoding UTF8: 0x00'), the sing | 7 |
| WS2-F04 | major | #64 (and #62 design doc) | docs/designs/LOG-DRAIN.md:407-411 (§8 step 3); docs/reviews/LOG-DRAIN-2026-09-06.md:265-26 | The enablement ordering the operator is told to follow (secret -> deploy -> register -> verify) omits the mandatory manual migration step. Design §8 step 3 says 'The migration applies with the deploy in the usual way' and the revi | 8 |
| WS2-F05 | major | #65 | scripts/map-remap.test.ts:958-972 (source pin); scripts/map-remap.ts:695 (guarded call) | The only test establishing that the CLI runs assertBaseAck before driveMapRemap is an indexOf over the file text (:965-967). It passes when the call is commented out or wrapped in `try { ... } catch {}` — in both the guard is iner | 6b |
| WS2-F06 | major | #67 (pre-existing since cea8cac 2026-07-11; byte-identical at 98294c5 and 697aea4; #67's disclosure understates it) | src/lib/ask/answer.ts:202-214 @697aea4 (== :201-213 @98294c5; openaiLegacyChatCompletion c | The documented Ask rollback configuration ASK_PIPELINE=legacy dispatches a paid OpenAI chat completion with NO SpendGuard at all: no askGuardFromEnv(), init(), tryReserve(), record(), or provider_usage row. It does not fail closed | 1, 9 |
| WS2-F07 | major | #67 | src/lib/ask/limits.test.ts:1103-1116 @697aea4 (new 'the exact cache REFUSES it' case) and  | The report says the exact cache's refusal of provider 'unscorecarded' is pinned ('limits.ts:733 admits only openai* ... Every one of those is pinned'). The pin is vacuous: the test never installs a queryMock for the `SELECT eviden | 6d |
| WS2-F08 | major | PLAN-WS-2 (the WS-2 specification, predates #52/#60) | docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md:1273-1275 (ruling-13 bullet) and :1264 | Two of PLAN-WS-2's proposed AGENTS.md changes are now wrong or superseded and must NOT be applied by step 25. (1) Its ruling-13 addendum 'a provider change would also change the extractor-version basis and is therefore covered by  | 8 |
| WS2-F09 | minor | #52 (d74d588; branch commit dc7d47e) | docs/SETUP-NEXT-WEEK.md:176 and :194-195 at 98294c5 (pr52.diff hunks @@ -172,7 +173,7 @@ a | PR #52's docs commit silently reverted the macOS port of the operator smoke-test script: `cd /Users/go/code/bnow-net` became `cd ~/code/bnow.net` (nonexistent path) and the two BSD `date -u -v-1d +%F` lines (with the 'BSD date, e. | 6c |
| WS2-F10 | minor | #52 (d74d588) | src/lib/analysis/anthropic-seam.test.ts:135-137 (pin) vs src/lib/analysis/provider.ts:79-8 | The report states 'ANTHROPIC_NOT_REGISTERED is exported and its exact message is test-pinned'. It is not: the identity test compares e.message to a template built from the imported constant itself (self-referential), so only the c | 6c |
| WS2-F11 | minor | #52 | AGENTS.md:27-29 (Architecture paragraph) | Standing text still says the Anthropic seam is 'auto-selected if an Anthropic key exists and no OpenAI key does'. That branch was deleted by #52: getProvider() (src/lib/analysis/provider.ts:116-131) throws a typed AnalysisProvider | 8 |
| WS2-F12 | minor | #57 | scripts/ask-eval-harvest.ts:184-200, :207-216 at 98294c5; src/lib/ask/eval-set.ts:275-286; | HYG-82 routes the paid --generate pass through analysisOpenAiClient(), a bare `new OpenAI({ maxRetries: 0 })` with no guard or metering; the disclosure ('the $1 estimate gate plus the cumulative-spend stop are its only brakes') is | 2 |
| WS2-F13 | minor | #59 | src/lib/analysis/digest-persist.ts:339-359 (embedInsertedClaimsFailOpen) at 98294c5; src/l | The report, the client docblock and .env.example describe the new EmbedModelUnpricedError as reaching exactly two sites (Ask vector arm -> v2-lexical-only; backfill script -> exit 2), but embedTexts has a THIRD production caller:  | 2 |
| WS2-F14 | minor | #59 | src/lib/llm/pricing.test.ts:39-44 (pin) and src/lib/llm/pricing.ts:82-87 (contract comment | The `toBe` bit-identity pin for estimateEmbedCostUsd cannot detect the grouping regression it exists to prevent: changing `tokens * (price / 1e6)` to `(tokens * price) / 1e6` survives the ENTIRE suite because the groupings are bit | 6a |
| WS2-F15 | minor | #59 (8a00ea2) | src/lib/embeddings/client.test.ts:109-125 @98294c5 (pre-image 8a00ea2^1:100-113); src/lib/ | The pre-existing pin 'uses ASK_EMBED_MODEL when set' was WEAKENED, not moved. At 8a00ea2^1 it set ASK_EMBED_MODEL=text-embedding-3-large and asserted the SDK call carried that model and out.provider === 'openai:text-embedding-3-la | 6e |
| WS2-F16 | minor | #60 | src/lib/evals/live-runner.ts:137 (pricing check), :114 and :142 (REASONING_MODEL mirror),  | evalDispatchConfig checks pricing with `Object.prototype.hasOwnProperty.call(PRICES_PER_MTOK, model)` rather than the provider-qualified pricedFor("openai", model) #60 introduced as the single price predicate, keeps its own REASON | 1, 5 |
| WS2-F17 | minor | #60 | src/lib/llm/model-config.ts:198-201 (model blanking) and :225-226 (explicit-model rung); s | Latent ruling-13 hazard in the post-widening shape: for an ALLOWED non-openai provider with <W>_MODEL absent or blank, resolveWorkloadModel returns model "" (`provider === "openai" // !providerAllowed ? (workloadModel ?? globalMod | 3, 4 |
| WS2-F18 | minor | #60 (code + WS-2-2 report) | src/lib/llm/model-config.ts:198-206 (`analysisReasoningCapable(provider, model)` at :206); | The 'refused configuration keeps the historical OpenAI-shaped resolution' claim — and the proposed ruling-13 addendum 'a REFUSED provider does not move it either ... for any configuration it blocks' — is exact for the resolved MOD | 3, 8 |
| WS2-F19 | minor | #60 (WS-2-2 report) and #65 (runbook) | docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md 'Citations re-verified' table (model-confi | Stale line citations a later session would apply mechanically. WS-2-2 says the lock predicate/message are 'now :219-222, :226', WORKLOAD_ENV 'now :64-73', the dispatchBlocked chain 'now :147-260', identity 'now :288-306'; at the P | 3 |
| WS2-F20 | minor | #60 | docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md:135 and :406 (count claims), 'Mutation pro | Mutation-kill counts stated as fact do not reproduce exactly, and one killing test is a cascade. 'allowlist check removed -> 13 failures across six files' measures 15 failures across 8 files (11 across the six named files — model- | 3, 6a |
| WS2-F21 | minor | #60 | src/lib/llm/import-graph.test.ts:75 (regex) and :72 (directory list); same weakness pre-ex | The new @anthropic-ai/* specifier scan matches only whitespace-separated binding forms and only a fixed directory list. It misses the unspaced `from"@anthropic-ai/sdk"` form (the weakness isolation.test.ts:30 already fixed with \s | 5 |
| WS2-F22 | minor | #60 | src/lib/llm/model-config.test.ts:631-639 (arity pin) and src/lib/llm/model-config.ts:290-2 | The `workloadDispatchConfig.length === 1` pin does not guarantee no allowlist injection point exists on the dispatch entry point: a second parameter WITH a default value (`allowlist = WORKLOAD_PROVIDER_ALLOWLIST`) keeps .length == | 6a |
| WS2-F23 | minor | #64 | src/app/api/logs/drain/route.ts:25-27 and :72-74 (ordering claims), :56-83 (secret check,  | Three documented ordering properties the report and design present as security properties are prose only, not test-pinned: (i) 'secret unset -> 503, body never read'; (ii) 'verified before any parse, any allocation past the raw bo | 6b, 7 |
| WS2-F24 | minor | #64 | src/lib/logs/drain.ts:121-130 (REDACTIONS), :127 (key=value rule) | The key=value redaction rule anchors on \b before api_key/secret/token/password, so the most realistic accidental-dump shape — an UPPER_SNAKE env name ending in _SECRET/_TOKEN/_API_KEY followed by = or : — is NOT redacted (no word | 7 |
| WS2-F25 | minor | #64 | src/lib/logs/drain.ts:72-77 (posInt), :82-93; .env.example:105-107; src/lib/logs/drain.tes | posInt checks n > 0 BEFORE Math.floor, so any value in (0,1) — e.g. LOG_DRAIN_RETENTION_DAYS=0.5 (a plausible 'twelve hours') — floors to 0 and is ACCEPTED, contradicting .env.example ('invalid, blank or <=0 falls back to 14 days' | 7 |
| WS2-F26 | minor | #64 | src/lib/logs/drain.ts:85-87 (maxRows), :339-368 (insertRuntimeLogs); docs/designs/LOG-DRAI | LOG_DRAIN_MAX_ROWS has no upper clamp while insertRuntimeLogs binds 12 parameters per row in ONE statement; the PostgreSQL extended-protocol Bind message caps parameters at 65,535, so any configured value above 5,461 turns every d | 7 |
| WS2-F27 | minor | #64 | docs/reviews/LOG-DRAIN-2026-09-06.md:229-238, :5, :179-185, :315-318 | Report text is stale or misattributed: (a) the 'Migration number' debt paragraph still opens 'Numbered 0030 ... the journal therefore has an idx gap 27 -> 30' and only its last sentence records the CP2b regeneration as 0029 (the r | 7 |
| WS2-F28 | minor | #64 | AGENTS.md:116; docs/reviews/LOG-DRAIN-2026-09-06.md:331-334 | AGENTS.md's directory map still reads 'drizzle/ migrations 0000–0028 + 9999_claim_source_trigger.sql' while drizzle/0029_runtime_logs.sql is on main (added by #64 at CP2b). COMMON §4.7 allows that single standing line to be correc | 8 |
| WS2-F29 | minor | #65 | scripts/map-remap.ts:365-368 (banner `via MAP_BACKFILL_BASE=${opts.base}`) and :385-389 (` | The runbook discloses one verbatim opts.base print (the banner) as a pre-existing credential-print hazard; there is a SECOND verbatim print in the remap-capability handshake error at :386-388, so the disclosure is understated. rem | 3 |
| WS2-F30 | minor | #67 | src/lib/ask/answer.ts:480/:489-495 at 697aea4 (assembleV2: `rerankModel = ranked.rerankUsa | The WS-2-1-AUTO-GATE report's Ruling 3 bullet ('answer_model/rerank_model are NULL, answer_cost_usd is NULL') is false for rerank_model whenever the rerank stage billed — the normal product path (pool > K=60; rerankCandidates with | 4, 9 |
| WS2-F31 | minor | #67 | src/lib/ask/router.ts:80-83, :86-89, :146-148; src/lib/ask/limits.ts:448-451 | auto_scorecard_missing is never persisted: routePolicyString() serialises only `${policyVersion}:${mode}:${answerModel}:k${evidenceK}` and limits.ts stores only that string in ask_usage.route_policy, so the `reason` field exists o | 9 |
| WS2-F32 | minor | #67 | src/lib/ask/eval-run.ts:212-227; scripts/ask-eval.ts:254-256, :427-434 | R14 covers the answer-model matrix only. A rerank-stage refusal — the new gate at rerank.ts:214, and the pre-existing budget/offline fallbacks — returns rerankUsed=false with provider 'openai:gpt-5', which isDegradedResult() does  | 9 |
| WS2-F33 | minor | all (cumulative main state at 98294c5) | AGENTS.md:127-137 (Live/repository bullet); AGENTS.md:372-373; docs/CURRENT-STATE.md:29-35 | The Live/repository bullet asserts 'main has since moved to 883e5e3 ... both touch only src/lib/evals/ ... code-ahead of production by these two eval-plane-only PRs'. At 98294c5 main is 20+ PRs past 883e5e3 and carries runtime cod | 8 |
| WS2-F34 | note | #52 | docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md:252, :262, :272, :279-281 | The proposed block's AGENTS.md anchors are stale at 98294c5 (26-29 -> 27-29; 284-286 -> 309-312; 982 -> 1016; the 'do not edit' 954-956 -> 981) because AGENTS.md grew after the report was written, and item 3's replacement credenti | 8 |
| WS2-F35 | note | #52 / #65 | docs/prompts/2026-09-05-48h-COMMON.md:113-121 (§4.8); docs/reviews/MAP-REMAP-RUNBOOK-2026- | Both passages are written as 'Until PR #52 (step 09) merges ... blank ANTHROPIC_API_KEY too'. #52 merged as d74d588 at 2026-09-06 18:24 -0400, before #65 (19:38 -0400), so the runbook's conditional was already resolved when writte | 8 |
| WS2-F36 | note | #57 | src/lib/ask/attribution.ts:110-135 (attributeAskUsage; touched() at :81-83) and :146-158 ( | An 'unscorecarded' ask_usage row (introduced by #67) buckets as embed -> model null and rerank -> rerank_model (when rerank ran); the answer stage produces NO bucket because all four answer columns are NULL, so it is not counted a | 4 |
| WS2-F37 | note | #57 | src/lib/ask/attribution.test.ts:175 (comment stripper) and :177-182 (write-verb scan) | The comment-stripped read-only scan can be blinded by a "/*" string literal: the block-comment regex treats the literal as a comment opener and swallows real code (including a write verb) up to the next "*/". Contrived — needs del | 6a |
| WS2-F38 | note | #57 / #59 (WS-2-1 report) vs #67 | docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md:274 (item 1 anchor '≈:96-99') and :306-308 (d | The WS-2-1 decision-log draft records the Auto scorecard gate as HELD; #67 (step 11b) has since built it after R3 was answered and ships its own draft entry. Applied verbatim in sequence the two entries are chronologically consist | 8 |
| WS2-F39 | note | #59 | src/lib/embeddings/client.ts:163 (explicit refusal) and :173 (`costPerToken: embedCostUsd( | Deleting only the explicit refusal at :163 survives the entire suite — an EQUIVALENT mutant, not a test gap: embedCostUsd(1, model) at :173 throws the identical EmbedModelUnpricedError while the openaiEmbedBatches argument object  | 6a |
| WS2-F40 | note | #59 | docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md:132-134 (mutation 2 claim); src/lib/embedding | The report's 'Moving the embed price refusal to after openaiEmbedBatches ... fails exactly the two refusal-position pins (SDK constructor and reservation) and nothing else' is right on the count but misdescribes which assertion di | 6a |
| WS2-F41 | note | #60 | src/lib/llm/model-config.ts:162-168 (test-only `allowlist` parameter), :290-292 (single-ar | The `.length === 1` pin closes the threading vector (no dispatch site can pass an allowlist THROUGH workloadDispatchConfig) and TypeScript closes argument-confusion (a string model or literal in the provider slot of analysisApprov | 1, 3 |
| WS2-F42 | note | #60 | src/lib/analysis/digest.ts:166-176 at 98294c5; src/lib/analysis/reduce-dispatch-refusal.te | The ladder-rethrow guarantee is mis-attributed twice. (1) digest.ts's ladder never reads `code`: it retries on `msg.includes("truncated")` (:171) and rethrows everything else, so the protecting property is message content, not the | 2 |
| WS2-F43 | note | #60 | src/lib/llm/model-config.ts:96 (MAP_BASELINE) and :234-237 (lock predicate); src/lib/analy | The map activation lock has no provider dimension: MAP_BASELINE is {model, reasoningEffort} and the predicate compares only those, while the extractor-version basis deliberately excludes provider. Under a widened map allowlist, MA | 3 |
| WS2-F44 | note | #60 | src/lib/llm/model-config.ts:184-201 (MAP_MODEL -> OPENAI_MODEL -> default), :234-241 (lock | Pre-existing, not a #60 regression: a lock-BLOCKED map model still moves the extractor version. In the 112-row matrix, 56 rows are blocked-but-moved and every one resolves to gpt-5-nano via MAP_MODEL or the GLOBAL OPENAI_MODEL; no | 3 |
| WS2-F45 | note | #60 | docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md:417-422 (checklist item 7); pr60.diff line | Checklist item 7 ('git diff should show zero removed expect( lines outside the three toEqual identity literals') is literally false in both halves: the three toEqual literals (model-config.test.ts:385, openai-provider.test.ts:94,  | 6a, 6e |
| WS2-F46 | note | #60 | src/lib/llm/analysis-registry.ts:136-138 (finder) and src/lib/llm/analysis-registry.test.t | Making the registry finder accept an approval whose `provider` is undefined as matching ANY provider survives the full suite. Equivalent at runtime on shipped data: all five seeded entries and the SYNTHETIC fixture carry provider: | 6a |
| WS2-F47 | note | #61 (adjacent, pre-existing) | scripts/analysis-eval.ts:397-402 (loadResultsAtPath pre-schema guard); src/lib/evals/runne | The pre-schema guard that turns an old results file into an exit-2 'predates the completeness/identity header' refusal checks datasetContentHash, requestedRepetitions and scope but not `identity`. A file carrying those three keys  | 5 |
| WS2-F48 | note | #61 (adjacent, pre-existing) | src/lib/evals/runner.ts:1447-1451 (judged identity line prints registry=) vs :1461-1466 (b | #61 makes registryVersion load-bearing for LIVE files through resume refusal only. The scorecard report prints the registry version for the judged file but not for the paired baseline file, so a report pairing a pre-bump live base | 5 |
| WS2-F49 | note | #61 (ef0bba8) | src/lib/evals/runner.ts:184-186 (headerIsLive = provider !== "stub"); src/lib/evals/contra | headerIsLive mutated to `provider === "openai"` or `.startsWith("openai")` survives the entire suite. Equivalent TODAY because the identity union has two members, but WS-2-2 and PLAN-WS-2 §5.2 hand step 20 / PR-2.4-1 (eval --provi | 6c |
| WS2-F50 | note | #61 (ef0bba8) | src/lib/evals/runner.ts:514-516 (`if (headerIsLive(existing) // headerIsLive(current))`);  | The left operand of the `//` is not discriminated: keying the skip on headerIsLive(current) alone survives the full suite (the report's table records only the existing-only mutant, which is killed). Outcome-equivalent — cmp("provi | 6c |
| WS2-F51 | note | #62 | docs/designs/LOG-DRAIN.md:271-277 (§5 item 1); src/app/api/logs/drain/route.ts:72-81 | Design §5 says 'Vercel's own function request-size limit already sits below this [4,000,000]'. Vercel's published serverless request-body limit is 4.5 MB (auditor knowledge; not verifiable in-repo), ABOVE the 4,000,000-byte cap, s | 7 |
| WS2-F52 | note | #64 | src/lib/logs/drain.ts:112-115 | The hex regex /^[0-9a-fA-F]+$/ admits an odd-length header and Buffer.from(hex, "hex") silently drops the dangling nibble, so a 41-character header consisting of the correct 40-char signature plus any one hex char verifies TRUE (3 | 6b |
| WS2-F53 | note | #64 | src/lib/logs/drain.ts:241-244 (timestamp validation) and src/app/api/logs/drain/route.ts:6 | The receiver checks only that timestamp is a positive finite number; there is no freshness/replay window and no timestamp header is read, so a captured signed delivery replays as 200 indefinitely. While the rows exist the PK + ON  | 6b |
| WS2-F54 | note | #64 | src/app/api/logs/drain/route.ts:61-68; src/lib/logs/drain.ts:106-117 | The HMAC is computed over the UTF-8 RE-ENCODING of req.text(), not the raw request bytes: a body containing an invalid UTF-8 sequence is decoded with U+FFFD replacement, the signed bytes differ, verification fails and the route an | 7 |
| WS2-F55 | note | #64 (and #62) | docs/designs/LOG-DRAIN.md:293; src/app/api/logs/drain/route.ts:61-66, :97-105, :113-118 | The failure-policy row 'Anything else thrown -> 200 with stored: 0' is not implemented as a catch-all: the only try/catch blocks wrap req.text(), the insert, and the sweep. A throw from parseDrainBody/normalizeBatch/maxRows would  | 7 |
| WS2-F56 | note | #64 | src/lib/logs/drain.ts:335-338, :363-365; docs/designs/LOG-DRAIN.md:196-199 | With a valid signature, deployment_id / request_path / request_id / id are stored as sent — the shared secret is the entire trust boundary — and because the INSERT is ON CONFLICT (id) DO NOTHING (first writer wins, never DO UPDATE | 7 |
| WS2-F57 | note | #64 | src/lib/logs/drain.ts:219-224 (isSelfIngestion), :212-217 (stripQuery) | The self-ingestion drop is exact-match after stripping query/fragment and one trailing slash. Dropped: exact, ?x=1, trailing '/', '/?x=1', '#frag', trailing whitespace, and the proxy.path fallback. NOT dropped: '/API/LOGS/DRAIN',  | 7 |
| WS2-F58 | note | #64 | src/lib/logs/drain.ts:388-402 (claimSweepSlot), src/app/api/logs/drain/route.ts:112-119 | The 'at most once per hour' sweep throttle is a module-level variable, so it is per warm process: every cold start resets it (a sweep on the first stored delivery of each new instance) and N concurrent instances can each sweep in  | 7 |
| WS2-F59 | note | #64 | docs/RELEASE-CHECKLIST.md:48-53 (step 5) and :94-103 (step 11) | The release checklist has no line for LOG_DRAIN_SECRET or migration 0029. Step 5 covers 'every NEW cap/flag env'; LOG_DRAIN_SECRET is neither, yet design §8 and .env.example:86-93 give it ruling-4 ordering (set in Production BEFOR | 8 |
| WS2-F60 | note | #65 | scripts/map-remap.ts:192-198 (remapBaseHost) and :215-223 (assertBaseAck), especially :218 | An empty or unparseable host matches an empty ack. remapBaseHost returns "" for bases whose WHATWG hostname is empty (file:///etc; `localhost:3000` parses as scheme `localhost:`) or for the empty string, and the raw trimmed string | 3 |
| WS2-F61 | note | #65 | scripts/map-remap.ts:186 (LOOPBACK_HOSTS = 127.0.0.1 / localhost / ::1 / [::1]) | Over-strict (safe) refusals: `http://[::ffff:127.0.0.1]:3000` (WHATWG serializes as `[::ffff:7f00:1]`), `http://localhost.:3000` (trailing dot) and `http://0.0.0.0:3000` are refused without an ack; acks differing from the host by  | 3 |
| WS2-F62 | note | #65 | docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md:672 (Mutation proofs row) vs scripts/map-rema | The report says 'comparing the ack against the base URL instead of the host fails 2'. Replacing `=== host` with `=== base.trim().toLowerCase()` fails 3 — 'naming the exact host is consent' (:925), 'the ack is matched against the H | 6b |
| WS2-F63 | note | #65 | scripts/map-remap.ts:193-197 (remapBaseHost) and :218 (ack compare) | Three low-significance unpinned variants, all in the fail-closed direction: dropping .toLowerCase() in remapBaseHost's URL branch is an equivalent mutant (WHATWG URL already lowercases hostnames); dropping it in the fallback branc | 6b |
| WS2-F64 | note | #65 | AGENTS.md:1051-1052 (Next steps item 2); docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md:778  | AGENTS.md says the #33 remap operator 'has never been RUN'; after #65 it was rehearsed end to end in estimate mode (432 dry route calls, $0, against a fork-bound local server — runbook §10.5). 'Never EXECUTED' (no --execute, zero  | 8 |
| WS2-F65 | note | #67 | src/lib/ask/answer.ts:574, :588 at 697aea4 (`const model = askAnswerModel();` / `if (!hasS | No test pins that the gate consults the RESOLVED model (the value later dispatched) rather than a parallel env read: replacing `model` in the predicate with `process.env.ASK_ANSWER_MODEL ?? "gpt-5"` survives the entire src/lib/ask | 6d |
| WS2-F66 | note | #67 | WS-2-1-AUTO-GATE-2026-09-06.md 'Rulings touched -> Ruling 4'; tests: src/lib/ask/answer-st | The sentence 'spies on init/tryReserve/record and on the OpenAI ctor/create assert zero calls in all three modules, including an injected run guard (opts.guards.answer)' overstates: only the answer-stream R3 block passes `guards:  | 6d |
| WS2-F67 | note | #67 (697aea4, open) | src/lib/ask/router.test.ts:45-66 @697aea4; src/lib/ask/router.ts:80-83, :101 @697aea4 | The removed G4 assertion `expect(route({mode:"auto"}).reason).toBe("auto_env_override")` (router.test.ts:47 @98294c5, ASK_ANSWER_MODEL=gpt-4o) was MOVED from a route()-level integration assertion to the pure function autoPolicyRea | 6e |
| WS2-F68 | note | #67 | WS-2-1-AUTO-GATE-2026-09-06.md sections Scope ('no environment variable read back') and Ha | The production-unaffected claim rests on prior records, not on a read-back this session performed, and the report does not cite its basis. The most recent explicit record that no *_MODEL variable exists in any Vercel environment i | 9 |
| WS2-F69 | note | #67 | src/lib/ask/registry.ts:49-57 (gpt-5-mini scorecard ref); docs/evals/ASK-EVAL-2026-07-11.m | The rerank default's scorecard — now an ENFORCEMENT input for production rerank — cites a document that never names the rerank stage or gpt-5-mini; its 'pass' is an inference that the 2026-07-11 v2-k60 pipeline run used gpt-5-mini | 9 |
| WS2-F70 | note | #59 / #60 / #64 / #67 (cumulative) | AGENTS.md:30-34 (routing sentence), :78-81 (src/lib/llm/ line; no src/lib/logs/ line in :6 | Stale-by-omission standing text, none false, all incomplete after this audit set: ruling 4 has no provider dimension ('a (workload, model, effort) with no analysis-reg-v1 approval'; code approves per (workload, provider, model, ef | 8 |
| WS2-F71 | note | all | AGENTS.md:368-372 (Quality/ops); docs/CURRENT-STATE.md:599-603 | Test counts are stale: AGENTS.md says 3,590 unit tests / 246 files and 160/25 integration; CURRENT-STATE says 3,451/239. At 98294c5 the unit suite is 3,914/263 (3,940/263 at 697aea4 per the orchestrator's baseline and #67's report | 8 |


### Refuter votes completed before the stop (13; finding : refuter lens)

| finding : refuter lens | refuted | verdict | suggested severity | reason (first 260 chars) |
|---|---|---|---|---|
| WS2-F01:factual | false | stands-severity-change | minor | Re-read every cited line at 98294c5 and reproduced both mutants in a detached scratch worktree (git worktree add --detach ... 98294c5; node_modules symlinked; no .env.local present). FACTUAL CHECK OF THE CLAIM: src/lib/logs/drain.ts:106-117 is verifyDrainSigna |
| WS2-F01:remediation | false | stands-severity-change | minor | Every factual element of the claim re-verified at 98294c5; the remediation was also applied and proven to kill the mutant without regressing any pin. (1) Code: src/lib/logs/drain.ts:115 `if (got.length !== expected.length) return false;` and :116 `return timin |
| WS2-F02:factual | false | stands | major | Re-verified at 98294c5 (audit worktree, read-only) and reproduced in a detached scratch worktree (removed afterwards). (1) src/lib/logs/drain.ts:207-217 `stripQuery` cuts at the first '?' or '#'; its doc comment at :211 says "The cron discriminator lost here i |
| WS2-F02:impact | false | stands-severity-change | minor | Every load-bearing element of the claim re-verified at 98294c5. (1) vercel.json:4-16 addresses all four ingest crons as /api/cron/ingest?which={fast,telegram,x,mtproto}. (2) src/lib/logs/drain.ts:207-217 stripQuery cuts at the first '?' or '#'; :247-248 applie |
| WS2-F02:remediation | false | stands-severity-change | minor | Every factual leg re-verified at 98294c5. (1) vercel.json:3-17: the four ingest entries differ only by `?which=fast/telegram/x/mtproto`; the four digest entries differ only by `?mode=`/`&slot=`. (2) src/lib/logs/drain.ts:212-217 `stripQuery` cuts at the first  |
| WS2-F03:factual | false | stands | major | Re-read every cited line at 98294c5 and reproduced the probe. drain.ts:196-201 str() = trim + wellFormedSlice; well-formed-slice.ts:13,39-72 only strips D800-DFFF surrogates, so U+0000 passes through. drain.ts:250-256 message path = redactSecrets -> sha256 ->  |
| WS2-F03:remediation | false | stands-severity-change | minor | Re-verified at 98294c5. (1) Code: drain.ts:196-201 `str()` = trim + wellFormedSlice, drain.ts:250-256 message = redactSecrets -> sha256 -> wellFormedSlice, drain.ts:203-205 `int()` = Math.trunc with no range check; none of these removes U+0000 or clamps to int |
| WS2-F04:factual | false | stands | major | Every element of the claim reproduces at 98294c5. (1) Nothing applies migrations on deploy: `git show 98294c5:package.json` line 10 `"build": "next build"`, line 17 `"db:migrate": "tsx scripts/migrate.ts"`; no `postbuild`/`vercel-build`/`prebuild` script; `ver |
| WS2-F04:impact | false | stands | major | Re-verified every element at 98294c5. (1) Nothing applies migrations on deploy: `git show 98294c5:package.json` line 10 `"build": "next build"`, line 17 `"db:migrate": "tsx scripts/migrate.ts"`; `vercel.json` holds only the `crons` array (no `buildCommand`); ` |
| WS2-F04:remediation | false | stands-severity-change | minor | Re-verified at 98294c5. (1) Mechanism: `git show 98294c5:package.json` line 10 `"build": "next build"`, line 17 `"db:migrate": "tsx scripts/migrate.ts"`; vercel.json is crons-only, no buildCommand; `git grep runMigrations(` hits only docs/comments, scripts/mig |
| WS2-F05:factual | false | stands-severity-change | minor | Every factual element reproduced at 98294c5 in a detached scratch worktree (removed afterwards). (1) scripts/map-remap.test.ts:958-972: the only CLI-boundary test is a readFileSync + indexOf over the source: `main.indexOf('assertBaseAck(base, argVal("--base-ac |
| WS2-F05:impact | false | stands-severity-change | minor | CLAIM VERIFIED at 98294c5. (1) scripts/map-remap.test.ts:958-972 "the CLI calls the guard BEFORE constructing the driver (source pin)": readFileSync of map-remap.ts (:963), slice from `async function main()` (:964), `indexOf("assertBaseAck(base, argVal(\"--bas |
| WS2-F06:factual | false | stands | major | Re-read every cited site at both SHAs and reproduced the behaviour with a live vitest probe in a detached scratch worktree at 697aea4 (removed afterwards). Code facts: src/lib/ask/answer.ts @98294c5 — legacyAnswer :176-236, `const model = process.env.OPENAI_MO |
