# WS-2 + WS-4 adversarial audit — finding register (48-hour program, step 17)

Every finding is listed with its verification outcome. Severities are this audit's judgment at the
frozen target **`98294c5`** (`98294c5c57dd808886ea40747ce8bbd50d14d37c`, `main` after CP2b);
PR #67, which was open, is audited at its branch tip **`697aea4`**
(`697aea4d98cb6e501c0ad8c27396ef9b9e1ef89c`, merge-base `98294c5`). This audit changed no code,
fixed nothing and decided nothing; step 23 remediates.

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-17-audit-ws2.md` in its full form (`origin/main` `a821695`,
  "steps 17 and 18 written in full"), read after `docs/prompts/2026-09-05-48h-COMMON.md` §3 and
  §4.10. The copy in the worktree was the earlier SKETCH; the full prompt is the one executed.
- Lane / worktree: `audit-ws2`, `/Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905`
  (verified: `git rev-parse --show-toplevel` is the worktree, branch never `main`). HEAD was
  already at the audited SHA, so no reset was required.
- Branch: `48h/audit-ws2-20260905-finding-register`, cut from `98294c5`. The only commits on it
  are this register, the handoff written when the run was paused, the raw round-1 results, and the
  `docs/PROGRESS.md` block.
- Mode: **Fable / xhigh / ultracode**, attended interactive session, 2026-09-06 → 2026-09-07.
- Spend: **$0.** No provider call, no deploy, no Vercel read or write, no database connection, no
  disposable fork, no production write, no migration, no cron invoked. The `package-lock.json`
  churn a fresh `npm install` leaves in a worktree was restored before anything ran (COMMON §1).

### Two disclosures

**1. `.env.local` was present in the audit worktree.** The prompt says "no `.env.local` in this
worktree"; one was already there (451 bytes, the COMMON §4.10 trimmed shape — `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY`; names were read, values never read or
printed; gitignored at `.gitignore:3`). It was left in place rather than deleted. One baseline
`npm test` ran in the audit worktree before this was noticed. Two unit test files
(`src/lib/evals/conflict-cli-refusals.test.ts`, `src/lib/evals/injection-dataset.test.ts`) spawn
`scripts/analysis-eval.ts`, which side-effect-imports `scripts/env.ts` (dotenv over `.env.local`),
so `DATABASE_URL` was present in those subprocesses' environment. **No connection was opened:**
the eval CLI never reads `DATABASE_URL` (`scripts/analysis-eval.ts:49-50`; live mode reads
`EVAL_DATABASE_URL` only, behind `--execute-live` + `--db-ack`, `src/lib/evals/live-runner.ts:210-249`),
and every mode those tests spawn is a refusal, `--offline`, `--estimate`, `--report`,
`--validate-dataset` or `--capture-reconcile` invocation. Every subsequent test, probe and mutation
ran in detached scratch worktrees (`git worktree add --detach`, `node_modules` symlinked, no
`.env.local`), all removed at the end.

**2. Forbidden-file exposure (recorded, never hidden — COMMON §3).** The secrets/docs lens's first
`grep` over the cumulative `2203150..98294c5` diff — which also contains PRs #58, #63 and #66, not
under audit — printed about fourteen fragment lines from the hunks of
`docs/evals/analysis/map-inj-dev-v1.json` and `docs/evals/analysis/results/map-inj-dev-v1-offline-fixtures.json`:
sha256 values (`datasetContentHash`, `promptHash`, `schemaVersion`, `rawOutputDigest`, per-case
output hashes) and the case IDs `map-inj-dev-001…006`. **No case content and no heldout material.**
All later scanning was done per-PR. No `results/live-*.json`, no heldout split, no
`RECONCILIATION-KEY.json`, no artifact directory and no `build-draft.py` was opened by any agent.

## Method

- **Lenses.** The prompt's eight lenses, plus PR #67 under lenses 1, 2 and 6. One finder agent per
  lens read the whole diff of every PR in its lens plus every touched file in full at the audited
  SHA. Lens 6 (tests as evidence) ran as five agents: four mutation groups, each in its own
  detached scratch worktree (#59/#60/#57 · #64/#65 · #52/#61 · #67 at `697aea4`), and one read-only
  "no pin deleted rather than extended" pass over the assertion diff of every modified test file.
  13 finders produced 81 raw findings, deduplicated to **71** (10 merges, no drops).
- **Refutation.** Each finding went to independent refuters with distinct lenses — factual
  reproduction, impact/severity, remediation/test-evidence — each instructed to default to
  "refuted" unless its own re-verification at the SHA sustained the claim, and to return
  `stands-severity-change` where the claim is right but the severity is not. A finding survives
  with **≥2 non-refutations**.
- **Verification budget, and the one protocol deviation, stated plainly.** The prompt's shape —
  three independent refuters for every one of 71 findings — is 213 refuter agents. The operator
  stopped the first run at that scale on cost. The audit was resumed under a bounded plan that
  keeps the three-refuter rule where it decides a deploy and relaxes it where it does not:
  **every major finding carries three independent refuter votes**; each **minor** carries one
  combined factual+impact verification, batched five ways by PR; each **note** carries one
  factual/duplication sanity check, batched three ways. A completeness critic then stated what the
  audit did not cover. This is a deviation from the prompt as written and is recorded here rather
  than buried: a minor or note in this register has been verified once, not three times.
- **Evidence pack.** One full diff per merge (`git diff <merge>^1 <merge>`), the cumulative
  `2203150..98294c5` diff, and PR #67's `98294c5..697aea4` diff; the seven reports the prompt names
  plus PR #67's `docs/reviews/WS-2-1-AUTO-GATE-2026-09-06.md` taken from its branch.
- **Baseline.** `npm test` at `98294c5` = **3,914 tests / 263 files** green (12.3 s). At `697aea4`
  = **3,940 / 263**. Every mutation count in this register was measured, not quoted.

## Under audit (base `98294c5`)

| PR | Step | Merge | What | Report |
|---|---|---|---|---|
| #52 | 09 | `d74d588` | Anthropic seam hardening — `ANTHROPIC_NOT_REGISTERED` typed refusal, key-alone selection branch deleted, well-formed doc-line slice | `ANTHROPIC-SEAM-HARDENING-2026-09-05.md` |
| #57 | 11 | `8ac41d2` | read-only Ask attribution report over `ask_usage` + hygiene #44 / #82 | `WS-2-1-ASK-PARITY-2026-09-06.md` |
| #59 | 11 | `8a00ea2` | model-aware embedding pricing; unpriced embed model refused before reservation | `WS-2-1-ASK-PARITY-2026-09-06.md` |
| #60 | 12 | `fed1d03` | provider dimension on analysis dispatch; per-workload allowlist `{openai}`; `pricedFor`; identity stamped with provider | `WS-2-2-PROVIDER-CORE-2026-09-06.md` |
| #61 | 12 | `ef0bba8` | offline eval results identity decoupled from the live registry constant | `WS-2-2-PROVIDER-CORE-2026-09-06.md` |
| #62 | 16 | `c75bd99` | log-drain design | `LOG-DRAIN-2026-09-06.md`, `docs/designs/LOG-DRAIN.md` |
| #64 | 16 | `1e06112` | `/api/logs/drain` receiver, HMAC-SHA1, `runtime_logs` migration 0029, retention sweep | `LOG-DRAIN-2026-09-06.md` |
| #65 | 22 | `7f267bd` | `scripts/map-remap.ts` `--base-ack` fail-closed guard + runbook | `MAP-REMAP-RUNBOOK-2026-09-06.md` |
| #67 | 11b | open, tip `697aea4` | `hasScorecard()` gate on the Auto money path — the ninth item, per the prompt's conditional | `WS-2-1-AUTO-GATE-2026-09-06.md` (on its branch) |

Merge SHAs are from `git log --merges 2203150..98294c5`; #52 merged before `2203150` and was taken
directly. PR #67 was open when the audit ran (`gh pr list` — `mergeStateStatus` UNSTABLE, checks
`gate` SUCCESS and `integration` SUCCESS), which is the condition under which the prompt folds it
in under lenses 1, 2 and 6.

## Result in one table

| | count |
|---|---|
| raw findings from 13 lens finders | 81 |
| distinct findings after dedup | **71** |
| refuted | **0** |
| survived verification | **71** |
| final severity — blocker | **0** |
| final severity — major | **3** (WS2-F04, WS2-F06, WS2-F07) |
| final severity — minor | **29** |
| final severity — note | **39** |
| severity changed by refutation | 6 (five major→minor, one minor→note) |
| mutations run and reverted | 151 |
| verified-clean report claims recorded | 255 |

Nothing in the audited set can spend money, activate a model, write production data, or move a map
extractor version. The three majors are: an enablement runbook that omits applying its own
migration (#64/#62), a pre-existing unguarded Ask rollback path whose disclosure understates it
(#67's report), and a test pin that passes for the wrong reason (#67).

## Findings — major

### WS2-F04 — The enablement ordering the operator is told to follow (secret -> deploy -> register -> verify) omits the

**PR** #64 (and #62 design doc) · **lenses** 8 · **severity** major (finder said major; votes major/major/minor)

**Where.** `docs/designs/LOG-DRAIN.md:407-411 (§8 step 3); docs/reviews/LOG-DRAIN-2026-09-06.md:265-269 ('For step 27' step 2)`

**Claim.** The enablement ordering the operator is told to follow (secret -> deploy -> register -> verify) omits the mandatory manual migration step. Design §8 step 3 says 'The migration applies with the deploy in the usual way' and the review says the deploy 'carries migration 0029 ... needs no window'; but nothing applies migrations on deploy — package.json `build` is `next build`, vercel.json has no buildCommand, and db:migrate is the manual `tsx scripts/migrate.ts` that RELEASE-CHECKLIST step 11 requires as its own line with a Neon backup first. Followed literally, the drain is registered against a DB with no runtime_logs table: every signed delivery hits insertRuntimeLogs, throws, 500s (the one retryable status), Vercel retries and fires the errored-drain notification.

**Reproduced.** git show 98294c5:package.json / grep -nE '"(build/db:migrate)"' -> `next build` / `tsx scripts/migrate.ts`; vercel.json has no buildCommand; git grep runMigrations( -> only scripts/migrate.ts:9; sed -n 407,411p design and 265,269p review print the claims; route.ts:97-105 returns 500 on insert failure.

**Refutation.** 3 independent votes, 3 non-refutations, 0 refuted — factual → stands (major); impact → stands (major); remediation → stands-severity-change (minor).

**Remediation (step 23).** Design §8: replace step 3's last two sentences with a step 3b: apply migration 0029 from the release clone as its own recorded line (RELEASE-CHECKLIST step 11) — Neon backup branch, `npm run db:migrate`, confirm `SELECT name FROM _migrations WHERE name LIKE '0029%'` returns one row; registering the drain before this makes every delivery 500. Mirror 3b into the review :265-269 between steps 2 and 3 and replace 'needs no window' with 'needs no observation window but DOES need the db:migrate line'.

**Disclosed in its report?** no

### WS2-F06 — The documented Ask rollback configuration ASK_PIPELINE=legacy dispatches a paid OpenAI chat completion wi

**PR** #67 (pre-existing since cea8cac 2026-07-11; byte-identical at 98294c5 and 697aea4; #67's disclosure understates it) · **lenses** 1, 9 · **severity** major (finder said major; votes major/major/major)

**Where.** `src/lib/ask/answer.ts:202-214 @697aea4 (== :201-213 @98294c5; openaiLegacyChatCompletion call at :207/:206); src/lib/llm/openai.ts:104-120; src/lib/ask/limits.ts:53-56, :34-36, :705-707; docs/CURRENT-STATE.md:453`

**Claim.** The documented Ask rollback configuration ASK_PIPELINE=legacy dispatches a paid OpenAI chat completion with NO SpendGuard at all: no askGuardFromEnv(), init(), tryReserve(), record(), or provider_usage row. It does not fail closed when LLM_SPRINT_USD_CAP / ASK_USD_CAP_DAILY are unset (ruling 4) and is bounded only by the first gate — the read-then-act ask_usage SUM check whose ASK_GLOBAL_DAILY_BUDGET_USD default is a fail-OPEN $10/day (limits.ts:53-56) plus 100 q/user/day. The model is `process.env.OPENAI_MODEL ?? "gpt-4o-mini"` with no price/registry/scorecard check, so an unpriced OPENAI_MODEL meters into ask_usage at the {in:5,out:15} fallback only. #67's report ('deliberately NOT gated ... gating it would break the rollback path') frames this as a scorecard-gate exception; it never says the path is also unreserved and unmetered, and its Ruling-4 section is silent on this entry. limits.ts:34-36 and :705-707 claim every paid stage is SpendGuard-backstopped — false here. Not tracked in OPEN-TASKS. Rubric blocker wording ('spend hazard reachable from a documented configuration') is met literally; rated major because it predates every audited PR, none widened it, production leaves ASK_PIPELINE unset (v2), and the $10/day first gate bounds it.

**Reproduced.** grep -n 'async function legacyAnswer\/openaiLegacyChatCompletion(\/process.env.OPENAI_MODEL\/askGuardFromEnv\/tryReserve\/guard\.record' src/lib/ask/answer.ts @98294c5 -> legacyAnswer :176, OPENAI_MODEL :202, openaiLegacyChatCompletion :206; the ONLY askGuardFromEnv use is :687 inside answerFromEvidence (v2). legacyAnswer (:177-237) = retrieve -> answerOffline() -> openaiLegacyChatCompletion({model, messages, temperature:0.1}) -> usage via estimateCostUsd, no guard object. openai.ts:104-120 docblock 'Do not normalize or guard here' and body `client().chat.completions.create(...)`. git log -S askGuardFromEnv -- answer.ts -> cea8cac 'dual-gate metering (legacy rollback preserved)' — unguarded from day one. CURRENT-STATE.md:453 documents the rollback; grep of OPEN-TASKS for legacyAnswer/ASK_PIPELINE=legacy -> no hit; ASK_PIPELINE absent from .env.example.

**Refutation.** 3 independent votes, 3 non-refutations, 0 refuted — factual → stands (major); impact → stands (major); remediation → stands (major).

**Remediation (step 23).** (a) Code, one hunk in legacyAnswer: before the call `const guard = askGuardFromEnv(); await guard.init(); const r = await guard.tryReserve();` and on refusal return the deterministic top-6 cited-claims fallback (as the offline branch at :191-201) with provider "budget"; after the call `await guard.record(1, pt + ct, estimateCostUsd(model, pt, ct))` before any body interpretation (ruling 8), request payload byte-identical. Pin in ask.test.ts: with ASK_PIPELINE=legacy tryReserve called exactly once before chat.completions.create and record(1, ...) once after; with a refusing guard provider === "budget" and create never called. Separate PR with a decision-log entry. (b) If the operator rules the rollback stays guard-free: OPEN-TASKS entry, ruling-4 exception in AGENTS.md, correct limits.ts:34-36 and :705-707, document ASK_PIPELINE in .env.example. Either way amend the #67 report's legacy bullet to state the path is also unreserved and unmetered.

**Disclosed in its report?** partially: scratchpad/WS-2-1-AUTO-GATE-2026-09-06.md 'Debt and risks' legacy bullet discloses only the missing scorecard gate; the absent SpendGuard reservation/metering is not disclosed there, in OPEN-TASKS, or in the report's Ruling-4 section

### WS2-F07 — The report says the exact cache's refusal of provider 'unscorecarded' is pinned ('limits.ts:733 admits on

**PR** #67 · **lenses** 6d · **severity** major (finder said major; votes major/major/minor)

**Where.** `src/lib/ask/limits.test.ts:1103-1116 @697aea4 (new 'the exact cache REFUSES it' case) and :899-907 (pre-existing 'degraded providers (stub/budget) are NEVER cached', unchanged since a335cd4); cause: limits.test.ts:144-148 (beforeEach queryMock) + src/lib/ask/limits.ts:735-741`

**Claim.** The report says the exact cache's refusal of provider 'unscorecarded' is pinned ('limits.ts:733 admits only openai* ... Every one of those is pinned'). The pin is vacuous: the test never installs a queryMock for the `SELECT evidence_snapshot FROM ask_runs` query, so beforeEach answers it with `{ rows: [{ user_count, global_cost }] }`, evidence_snapshot is undefined, and limits.ts:741 `if (snapshot)` skips cacheStore BEFORE the provider predicate at :733 has any effect; `expect(cacheStoreMock).not.toHaveBeenCalled()` passes for an unrelated reason. The pre-existing stub/budget test at :899-907 — the pattern #67 copied and the report relies on as established fact — is vacuous for the identical reason, so the file carries NO discriminating pin for the truth-in-UI cache exclusion of ANY degraded provider. Production code at :733 is correct (verified by reading and M12c); this is a false evidence claim, not a runtime defect.

**Reproduced.** mut4 @697aea4: (M12) limits.ts:733 predicate widened to also admit 'unscorecarded' -> src/lib/ask 701 passed; full suite 3940 passed. (M12b) provider predicate removed entirely (`payload.state === "answered"`) -> limits.test.ts 69 passed, zero failures. Contrast: the sibling 'accepts' test at :1049-1068 DOES install the evidence_snapshot mock and discriminates. (M12c) with the queryMock below inserted after :1112 the REFUSES case fails exactly under M12 (spy called 1 time) and passes 69/69 clean.

**Refutation.** 3 independent votes, 3 non-refutations, 0 refuted — factual → stands (major); impact → stands-severity-change (minor); remediation → stands (major).

**Remediation (step 23).** Insert after limits.test.ts:1112 (and likewise after :904 in the stub/budget test, using the describe-scoped SNAPSHOT const at :808) a queryMock implementation: INSERT INTO ask_usage -> { rows: [] }; a sql containing 'evidence_snapshot' -> { rows: [{ evidence_snapshot: { version: 1, candidates: [], selectedClaimIds: [] } }] }; otherwise { rows: [{ user_count: 0, global_cost: 0 }] }. Optionally add a 'budget' sibling so both literals in the pre-existing title are exercised. Then keep or correct the report sentence 'Every one of those is pinned'.

**Disclosed in its report?** no

## Findings — minor

Each carries one independent verification (see §Method). None was refuted.

| id | PR | file:line | finding | remediation | verification |
|---|---|---|---|---|---|
| WS2-F01 | #64 | `src/lib/logs/drain.test.ts:83-100 (rejection cases); src/lib/logs/drai` | No signature test alters a byte of an otherwise-valid HMAC: every rejection case uses a wholly different digest (wrong secret :83, altered body :88) or a non-hex/wrong-length header (:93-100). A mutant comparing only the first 4 bytes of the 20-byte digest sur | Add to the `drain signature` describe in drain.test.ts a case that flips ONE hex char of a valid signature at the tail, head and middle (index 39, 0, 20) and asserts verifyDra | 3 votes, stands (major→minor) |
| WS2-F02 | #64 (and #62 design) | `docs/designs/LOG-DRAIN.md:228-229, :490-500 (§9(c) JOIN), :543; docs/r` | The design's deciding argument for sink (a) — 'correlation with cron_runs in one JOIN' on request_path = '/api/cron/<job>' plus a logged_at window, with the query-string discriminator 'recoverable from cron_runs.job' — is false for the ingest family: vercel.js | Option A (in #64's files): in drain.ts:247-248 keep the query string for /api/cron/* paths only (use proxy.path when its stripped form equals the stripped entry path; strip '# | 3 votes, stands (major→minor) |
| WS2-F03 | #64 | `src/lib/logs/drain.ts:196-201 (str), :250-256 (message), :203-205 (int` | A single entry whose message/id/path contains U+0000 makes the whole delivery permanently unstorable: normalizeEntry passes NUL through, PostgreSQL text columns reject it ('invalid byte sequence for encoding UTF8: 0x00'), the single multi-row INSERT fails as a | drain.ts: add a NUL regex; str() line 200 -> `wellFormedSlice(t.replace(NUL, ""), limit)`; line 253 -> redactSecrets(entry.message.replace(NUL, "")); int() -> clamp to [-21474 | 3 votes, stands (major→minor) |
| WS2-F05 | #65 | `scripts/map-remap.test.ts:958-972 (source pin); scripts/map-remap.ts:6` | The only test establishing that the CLI runs assertBaseAck before driveMapRemap is an indexOf over the file text (:965-967). It passes when the call is commented out or wrapped in `try { ... } catch {}` — in both the guard is inert and an unacknowledged produc | (a) Tighten the textual pin: expect(main) to match a line consisting solely of `assertBaseAck(base, argVal("--base-ack"));` and NOT to match a `//` prefix or `try {` wrapper o | 3 votes, stands (major→minor) |
| WS2-F08 | PLAN-WS-2 (the WS-2 specific | `docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md:1273-1275 (ruling-` | Two of PLAN-WS-2's proposed AGENTS.md changes are now wrong or superseded and must NOT be applied by step 25. (1) Its ruling-13 addendum 'a provider change would also change the extractor-version basis and is therefore covered by the same lock' is false at 982 | Step 25: for ruling 13 apply WS-2-2 item 3 (with the WS2-F18 wording fix) and skip PLAN-WS-2's ruling-13 bullet; for Architecture apply ANTHROPIC-SEAM item 1 merged with WS-2- | 3 votes, stands (major→minor) |
| WS2-F09 | #52 (d74d588; branch commit  | `docs/SETUP-NEXT-WEEK.md:176 and :194-195 at 98294c5 (pr52.diff hunks @` | PR #52's docs commit silently reverted the macOS port of the operator smoke-test script: `cd /Users/go/code/bnow-net` became `cd ~/code/bnow.net` (nonexistent path) and the two BSD `date -u -v-1d +%F` lines (with the 'BSD date, e.g. macOS; GNU date users: swap | Restore the three lines verbatim from d74d588^1: line 176 -> `cd /Users/go/code/bnow-net && set -a && source .env.local && set +a`; re-insert the BSD/GNU comment before line 1 | 1 vote, stands |
| WS2-F10 | #52 (d74d588) | `src/lib/analysis/anthropic-seam.test.ts:135-137 (pin) vs src/lib/analy` | The report states 'ANTHROPIC_NOT_REGISTERED is exported and its exact message is test-pinned'. It is not: the identity test compares e.message to a template built from the imported constant itself (self-referential), so only the class prefix format and the two | In 'carries the typed refusal identity' add a literal pin: expect(ANTHROPIC_NOT_REGISTERED).toBe("provider anthropic is not registered/metered — see OPEN-TASKS #83: it passes  | 1 vote, stands |
| WS2-F12 | #57 | `scripts/ask-eval-harvest.ts:184-200, :207-216 at 98294c5; src/lib/ask/` | HYG-82 routes the paid --generate pass through analysisOpenAiClient(), a bare `new OpenAI({ maxRetries: 0 })` with no guard or metering; the disclosure ('the $1 estimate gate plus the cumulative-spend stop are its only brakes') is understated in two ways the P | In modeGenerate() before :199: import isLlmDisabled from ../src/lib/usage/llm-guard and `process.exit(2)` with a message when isLlmDisabled() or ANALYSIS_PROVIDER === "stub".  | 1 vote, stands |
| WS2-F13 | #59 | `src/lib/analysis/digest-persist.ts:339-359 (embedInsertedClaimsFailOpe` | The report, the client docblock and .env.example describe the new EmbedModelUnpricedError as reaching exactly two sites (Ask vector arm -> v2-lexical-only; backfill script -> exit 2), but embedTexts has a THIRD production caller: the post-COMMIT embed of every | (1) Docs: in WS-2-1 §Rulings (Ruling 9), client.ts:50-53 and .env.example:72-74 add the third site and its behaviour. (2) Code (optional, mirrors the stub branch): after the ` | 1 vote, stands |
| WS2-F14 | #59 | `src/lib/llm/pricing.test.ts:39-44 (pin) and src/lib/llm/pricing.ts:82-` | The `toBe` bit-identity pin for estimateEmbedCostUsd cannot detect the grouping regression it exists to prevent: changing `tokens * (price / 1e6)` to `(tokens * price) / 1e6` survives the ENTIRE suite because the groupings are bitwise equal for every n the sui | pricing.test.ts:41 `for (const n of [1, 77, 12_345])` -> `for (const n of [1, 3, 10, 77, 12_345])` (verified to kill the mutant while passing on shipped code). | 1 vote, stands |
| WS2-F15 | #59 (8a00ea2) | `src/lib/embeddings/client.test.ts:109-125 @98294c5 (pre-image 8a00ea2^` | The pre-existing pin 'uses ASK_EMBED_MODEL when set' was WEAKENED, not moved. At 8a00ea2^1 it set ASK_EMBED_MODEL=text-embedding-3-large and asserted the SDK call carried that model and out.provider === 'openai:text-embedding-3-large'. The rewrite sets the env | Append to client.test.ts a case that adds a test-only row `EMBED_PRICES_PER_MTOK["text-embedding-3-large"] = 0.13` (embedPriced reads the live object, pricing.ts:71-73; delete | 1 vote, stands |
| WS2-F16 | #60 | `src/lib/evals/live-runner.ts:137 (pricing check), :114 and :142 (REASO` | evalDispatchConfig checks pricing with `Object.prototype.hasOwnProperty.call(PRICES_PER_MTOK, model)` rather than the provider-qualified pricedFor("openai", model) #60 introduced as the single price predicate, keeps its own REASONING_MODEL regex instead of ana | live-runner.ts:46 import `{ estimateCostUsd, pricedFor }` from ../llm/pricing and analysisReasoningCapable from ../llm/providers; :137 -> `if (!pricedFor("openai", model))` (m | 1 vote, stands |
| WS2-F17 | #60 | `src/lib/llm/model-config.ts:198-201 (model blanking) and :225-226 (exp` | Latent ruling-13 hazard in the post-widening shape: for an ALLOWED non-openai provider with <W>_MODEL absent or blank, resolveWorkloadModel returns model "" (`provider === "openai" // !providerAllowed ? (workloadModel ?? globalModel ?? ANALYSIS_DEFAULT_MODEL)  | Replace model-config.ts:198-201 with `const model = workloadModel ?? globalModel ?? ANALYSIS_DEFAULT_MODEL;` (the :225 rung already keys on `workloadModel === null`, so a non- | 1 vote, stands |
| WS2-F18 | #60 (code + WS-2-2 report) | `src/lib/llm/model-config.ts:198-206 (`analysisReasoningCapable(provide` | The 'refused configuration keeps the historical OpenAI-shaped resolution' claim — and the proposed ruling-13 addendum 'a REFUSED provider does not move it either ... for any configuration it blocks' — is exact for the resolved MODEL and for every configuration | Reword WS-2-2 item 3 before step 25 applies it: 'The provider dimension does NOT enter the extractor-version basis, and a refused provider never changes the resolved MODEL, so | 1 vote, stands |
| WS2-F19 | #60 (WS-2-2 report) and #65  | `docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md 'Citations re-verified` | Stale line citations a later session would apply mechanically. WS-2-2 says the lock predicate/message are 'now :219-222, :226', WORKLOAD_ENV 'now :64-73', the dispatchBlocked chain 'now :147-260', identity 'now :288-306'; at the PR head (244b2df, model-config. | Correct the four 'now' citations in WS-2-2 to :234-237/:241, :72-81, :162-270, :312-330; correct the runbook's :215-227 -> :215-223, :856 -> :857, :861 -> :863, :155-162 -> :1 | 1 vote, stands |
| WS2-F20 | #60 | `docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md:135 and :406 (count cl` | Mutation-kill counts stated as fact do not reproduce exactly, and one killing test is a cascade. 'allowlist check removed -> 13 failures across six files' measures 15 failures across 8 files (11 across the six named files — model-config 5, map-worker-lease-wri | (a) map-prompts.test.ts SAVED_KEYS add "MAP_PROVIDER" (and "REDUCE_PROVIDER") so afterEach restores them. (b) WS-2-2 :135/:406 -> '15 failures across 8 files (11 across the si | 1 vote, stands |
| WS2-F21 | #60 | `src/lib/llm/import-graph.test.ts:75 (regex) and :72 (directory list); ` | The new @anthropic-ai/* specifier scan matches only whitespace-separated binding forms and only a fixed directory list. It misses the unspaced `from"@anthropic-ai/sdk"` form (the weakness isolation.test.ts:30 already fixed with \s* as NOTE-1), a bare side-effe | Replace :72-75 with a walk over src/ AND scripts/ (walk() already excludes *.test.ts) and a regex covering `from\s*`, line-leading `import\s*`, `require(` and dynamic `import( | 1 vote, stands |
| WS2-F22 | #60 | `src/lib/llm/model-config.test.ts:631-639 (arity pin) and src/lib/llm/m` | The `workloadDispatchConfig.length === 1` pin does not guarantee no allowlist injection point exists on the dispatch entry point: a second parameter WITH a default value (`allowlist = WORKLOAD_PROVIDER_ALLOWLIST`) keeps .length === 1 (JS counts only parameters | In the :631 test after the arity expect add a behavioural pin: set REDUCE_PROVIDER=anthropic, REDUCE_MODEL=claude-whatever and expect `(workloadDispatchConfig as unknown as (w | 1 vote, stands |
| WS2-F23 | #64 | `src/app/api/logs/drain/route.ts:25-27 and :72-74 (ordering claims), :5` | Three documented ordering properties the report and design present as security properties are prose only, not test-pinned: (i) 'secret unset -> 503, body never read'; (ii) 'verified before any parse, any allocation past the raw body'; (iii) 'Size cap AFTER the | route.test.ts: (1) 503 cases — build the request, `vi.spyOn(req, 'text')`, assert not called. (2) mock '@/lib/logs/drain' as a spy module wrapping parseDrainBody and verifyDra | 1 vote, stands |
| WS2-F24 | #64 | `src/lib/logs/drain.ts:121-130 (REDACTIONS), :127 (key=value rule)` | The key=value redaction rule anchors on \b before api_key/secret/token/password, so the most realistic accidental-dump shape — an UPPER_SNAKE env name ending in _SECRET/_TOKEN/_API_KEY followed by = or : — is NOT redacted (no word boundary after '_'): LOG_DRAI | Replace :127 with a rule matching the keyword at the END of an identifier allowing camelCase/UPPER_SNAKE prefixes (e.g. add `/([A-Z0-9]+_(?:SECRET/TOKEN/API_KEY/SESSION/PASSWO | 1 vote, stands |
| WS2-F25 | #64 | `src/lib/logs/drain.ts:72-77 (posInt), :82-93; .env.example:105-107; sr` | posInt checks n > 0 BEFORE Math.floor, so any value in (0,1) — e.g. LOG_DRAIN_RETENTION_DAYS=0.5 (a plausible 'twelve hours') — floors to 0 and is ACCEPTED, contradicting .env.example ('invalid, blank or <=0 falls back to 14 days') and the test's 'retention mu | drain.ts:76 floor first: `const n = Math.floor(Number(raw)); return Number.isFinite(n) && n > 0 ? n : fallback;` and extend the drain.test.ts:388 loop with "0.5" and "0.99". C | 1 vote, stands |
| WS2-F26 | #64 | `src/lib/logs/drain.ts:85-87 (maxRows), :339-368 (insertRuntimeLogs); d` | LOG_DRAIN_MAX_ROWS has no upper clamp while insertRuntimeLogs binds 12 parameters per row in ONE statement; the PostgreSQL extended-protocol Bind message caps parameters at 65,535, so any configured value above 5,461 turns every delivery larger than that into  | drain.ts:85-87 `return Math.min(posInt("LOG_DRAIN_MAX_ROWS", DEFAULT_MAX_ROWS), 5000);` plus a test 'clamps LOG_DRAIN_MAX_ROWS so one INSERT never exceeds the 65,535-parameter | 1 vote, stands |
| WS2-F27 | #64 | `docs/reviews/LOG-DRAIN-2026-09-06.md:229-238, :5, :179-185, :315-318` | Report text is stale or misattributed: (a) the 'Migration number' debt paragraph still opens 'Numbered 0030 ... the journal therefore has an idx gap 27 -> 30' and only its last sentence records the CP2b regeneration as 0029 (the renumber commit 711d112 left th | Rewrite :229-238 to: 'Migration number. Built as 0030 on a pre-0028 branch; regenerated at CP2b as 0029 on top of 0028 (snapshot prevId chain 0028->0029, journal idx 28->29, S | 1 vote, stands |
| WS2-F28 | #64 | `AGENTS.md:116; docs/reviews/LOG-DRAIN-2026-09-06.md:331-334` | AGENTS.md's directory map still reads 'drizzle/ migrations 0000–0028 + 9999_claim_source_trigger.sql' while drizzle/0029_runtime_logs.sql is on main (added by #64 at CP2b). COMMON §4.7 allows that single standing line to be corrected by the PR that makes it wr | AGENTS.md:116 -> `drizzle/ migrations 0000–0029 + 9999_claim_source_trigger.sql (applies last)`. In LOG-DRAIN-2026-09-06.md:331-334 change the 'before' line to 0000–0028 so st | 1 vote, stands |
| WS2-F29 | #65 | `scripts/map-remap.ts:365-368 (banner `via MAP_BACKFILL_BASE=${opts.bas` | The runbook discloses one verbatim opts.base print (the banner) as a pre-existing credential-print hazard; there is a SECOND verbatim print in the remap-capability handshake error at :386-388, so the disclosure is understated. remapTargetId (:168-181) and rema | Replace `${opts.base}` with `${remapTargetId(opts.base)}` at :367 and :387. Add a test: drive with base `https://user:sup3rsecret@example.test`, capture log lines and the thro | 1 vote, stands |
| WS2-F30 | #67 | `src/lib/ask/answer.ts:480/:489-495 at 697aea4 (assembleV2: `rerankMode` | The WS-2-1-AUTO-GATE report's Ruling 3 bullet ('answer_model/rerank_model are NULL, answer_cost_usd is NULL') is false for rerank_model whenever the rerank stage billed — the normal product path (pool > K=60; rerankCandidates with the default gpt-5-mini, which | (1) Report Ruling 3 bullet -> 'answer_model, answer_prompt_tokens, answer_completion_tokens and answer_cost_usd are NULL; rerank_model/rerank_cost_usd and embed_cost_usd refle | 1 vote, stands |
| WS2-F31 | #67 | `src/lib/ask/router.ts:80-83, :86-89, :146-148; src/lib/ask/limits.ts:4` | auto_scorecard_missing is never persisted: routePolicyString() serialises only `${policyVersion}:${mode}:${answerModel}:k${evidenceK}` and limits.ts stores only that string in ask_usage.route_policy, so the `reason` field exists on the in-memory RoutePolicy an | Either append the reason to the recorded string (router.ts:147 add `:${p.reason}`; update the routePolicyString pin; note historical rows lack the suffix) or correct the wordi | 1 vote, stands |
| WS2-F32 | #67 | `src/lib/ask/eval-run.ts:212-227; scripts/ask-eval.ts:254-256, :427-434` | R14 covers the answer-model matrix only. A rerank-stage refusal — the new gate at rerank.ts:214, and the pre-existing budget/offline fallbacks — returns rerankUsed=false with provider 'openai:gpt-5', which isDegradedResult() does not see (it checks retrievalMo | eval-run.ts: extend DegradedCheckInput with rerankExpected/rerankUsed and add `if (input.rerankExpected && !input.rerankUsed) return true;` (rerankExpected = key set && candid | 1 vote, stands |
| WS2-F33 | all (cumulative main state a | `AGENTS.md:127-137 (Live/repository bullet); AGENTS.md:372-373; docs/CU` | The Live/repository bullet asserts 'main has since moved to 883e5e3 ... both touch only src/lib/evals/ ... code-ahead of production by these two eval-plane-only PRs'. At 98294c5 main is 20+ PRs past 883e5e3 and carries runtime code (POST /api/logs/drain, the p | AGENTS.md:130-137 -> 'main has since moved well past 883e5e3 (48-hour program, 2026-09-05/06: PRs #47–#66 merged; #67 open): runtime code ahead of production includes the iner | 1 vote, stands |

## Findings — note

Recorded observations, each sanity-checked once for factual accuracy and duplication.

| id | PR | file:line | finding | remediation | verification |
|---|---|---|---|---|---|
| WS2-F11 | #52 | `AGENTS.md:27-29 (Architecture paragraph)` | Standing text still says the Anthropic seam is 'auto-selected if an Anthropic key exists and no OpenAI key does'. That branch was deleted by #52: getProvider() (src/lib/analysis/provider.ts:116-131) throws a typed AnalysisProviderError on ANALYSIS_PROVIDER=ant | Apply ANTHROPIC-SEAM item 1 wording plus WS-2-2 item 4's clause: '`anthropic` implemented in the seam but UNSELECTABLE — unmetered and unregistered, so getProvider() refuses A | 1 vote, stands (minor→note) |
| WS2-F34 | #52 | `docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md:252, :262, :272, :` | The proposed block's AGENTS.md anchors are stale at 98294c5 (26-29 -> 27-29; 284-286 -> 309-312; 982 -> 1016; the 'do not edit' 954-956 -> 981) because AGENTS.md grew after the report was written, and item 3's replacement credentials row keeps 'key absent' unq | Step 25 resolves anchors by content, not line number. Credentials row -> '/ Anthropic / ANTHROPIC_API_KEY / provider implemented but UNSELECTABLE — unmetered/unregistered, get | 1 vote, stands |
| WS2-F35 | #52 / #65 | `docs/prompts/2026-09-05-48h-COMMON.md:113-121 (§4.8); docs/reviews/MAP` | Both passages are written as 'Until PR #52 (step 09) merges ... blank ANTHROPIC_API_KEY too'. #52 merged as d74d588 at 2026-09-06 18:24 -0400, before #65 (19:38 -0400), so the runbook's conditional was already resolved when written and §4.8 now reads as histor | COMMON §4.8: replace the 'Until PR #52 (step 09) merges' sentence with 'PR #52 merged 2026-09-06 (d74d588): the key-alone branch no longer exists; blanking ANTHROPIC_API_KEY a | 1 vote, stands |
| WS2-F36 | #57 | `src/lib/ask/attribution.ts:110-135 (attributeAskUsage; touched() at :8` | An 'unscorecarded' ask_usage row (introduced by #67) buckets as embed -> model null and rerank -> rerank_model (when rerank ran); the answer stage produces NO bucket because all four answer columns are NULL, so it is not counted as an answer run and contribute | Optional, tooling only: extend the SELECT with `provider` and print a per-day provider histogram (rows whose provider is not LIKE 'openai:%', keyed by literal) under the cover | 1 vote, stands |
| WS2-F37 | #57 | `src/lib/ask/attribution.test.ts:175 (comment stripper) and :177-182 (w` | The comment-stripped read-only scan can be blinded by a "/*" string literal: the block-comment regex treats the literal as a comment opener and swallows real code (including a write verb) up to the next "*/". Contrived — needs deliberately crafted code — and t | In the 'scripts/ask-model-attribution.ts is read-only' describe add 'contains no write verb even in the RAW source': `expect(src.match(/\b(INSERT/UPDATE/DELETE/DROP/CREATE/ALT | 1 vote, stands |
| WS2-F38 | #57 / #59 (WS-2-1 report) vs | `docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md:274 (item 1 anchor '≈:96-` | The WS-2-1 decision-log draft records the Auto scorecard gate as HELD; #67 (step 11b) has since built it after R3 was answered and ships its own draft entry. Applied verbatim in sequence the two entries are chronologically consistent, but step 25 must not let  | When appending the WS-2-1 entry, change 'is HELD on R3' to 'was HELD on R3 at this step and landed as PR #67 (step 11b, next entry)' or append the #67 entry immediately after  | 1 vote, stands |
| WS2-F39 | #59 | `src/lib/embeddings/client.ts:163 (explicit refusal) and :173 (`costPer` | Deleting only the explicit refusal at :163 survives the entire suite — an EQUIVALENT mutant, not a test gap: embedCostUsd(1, model) at :173 throws the identical EmbedModelUnpricedError while the openaiEmbedBatches argument object is evaluated, still before the | No behavioural fix needed. Optionally add to the :158-162 comment 'embedCostUsd(1, model) below re-asserts this refusal; both must be removed to reach dispatch unpriced' — or  | 1 vote, stands |
| WS2-F40 | #59 | `docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md:132-134 (mutation 2 claim` | The report's 'Moving the embed price refusal to after openaiEmbedBatches ... fails exactly the two refusal-position pins (SDK constructor and reservation) and nothing else' is right on the count but misdescribes which assertion discriminates: under the test's  | Either reword the report line to 'fails the two unpriced-refusal tests (the error-type/message pins fire first; the ctor/reservation spies fire when a response is available)', | 1 vote, stands |
| WS2-F41 | #60 | `src/lib/llm/model-config.ts:162-168 (test-only `allowlist` parameter),` | The `.length === 1` pin closes the threading vector (no dispatch site can pass an allowlist THROUGH workloadDispatchConfig) and TypeScript closes argument-confusion (a string model or literal in the provider slot of analysisApproval, or a string as resolveWork | Extend openai-client.test.ts's ANALYSIS_DISPATCH_MODULES scan (adding lib/analysis/map-prompts.ts for this check) with a case asserting every `resolveWorkloadModel(...)` call  | 1 vote, stands |
| WS2-F42 | #60 | `src/lib/analysis/digest.ts:166-176 at 98294c5; src/lib/analysis/reduce` | The ladder-rethrow guarantee is mis-attributed twice. (1) digest.ts's ladder never reads `code`: it retries on `msg.includes("truncated")` (:171) and rethrows everything else, so the protecting property is message content, not the MODEL_CONFIG code the report  | digest.ts:171: `const code = (e as { code?: string }).code; if (msg.includes("truncated") && code === undefined && rungsTried < ladder.length)` (typed refusals all carry a cod | 1 vote, stands |
| WS2-F43 | #60 | `src/lib/llm/model-config.ts:96 (MAP_BASELINE) and :234-237 (lock predi` | The map activation lock has no provider dimension: MAP_BASELINE is {model, reasoningEffort} and the predicate compares only those, while the extractor-version basis deliberately excludes provider. Under a widened map allowlist, MAP_PROVIDER=anthropic + MAP_MOD | This window (predicate frozen by COMMON section 3): add a dedicated test `expect([...WORKLOAD_PROVIDER_ALLOWLIST.map]).toEqual(["openai"])` titled 'ruling 13: the MAP allowlis | 1 vote, stands |
| WS2-F44 | #60 | `src/lib/llm/model-config.ts:184-201 (MAP_MODEL -> OPENAI_MODEL -> defa` | Pre-existing, not a #60 regression: a lock-BLOCKED map model still moves the extractor version. In the 112-row matrix, 56 rows are blocked-but-moved and every one resolves to gpt-5-nano via MAP_MODEL or the GLOBAL OPENAI_MODEL; no provider value alone moves th | No code change this window. Record in docs/RELEASE-CHECKLIST.md (or ruling 13's text) that setting OPENAI_MODEL in any Vercel environment is a map extractor-version change cov | 1 vote, stands |
| WS2-F45 | #60 | `docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md:417-422 (checklist ite` | Checklist item 7 ('git diff should show zero removed expect( lines outside the three toEqual identity literals') is literally false in both halves: the three toEqual literals (model-config.test.ts:385, openai-provider.test.ts:94, llm-match-guard.test.ts:115) c | Replace item 7's text with 'the only removed expect( lines are the eight analysisApproval(...) arity rewrites in analysis-registry.test.ts (each re-added with the new "openai" | 1 vote, stands |
| WS2-F46 | #60 | `src/lib/llm/analysis-registry.ts:136-138 (finder) and src/lib/llm/anal` | Making the registry finder accept an approval whose `provider` is undefined as matching ANY provider survives the full suite. Equivalent at runtime on shipped data: all five seeded entries and the SYNTHETIC fixture carry provider: "openai", and provider is a r | Append to analysis-registry.test.ts 'an approval with no provider field matches NO provider': build NOPROV = [{ workload: "reduce", model: "gpt-5-mini", allowedEfforts: [null] | 1 vote, stands |
| WS2-F47 | #61 (adjacent, pre-existing) | `scripts/analysis-eval.ts:397-402 (loadResultsAtPath pre-schema guard);` | The pre-schema guard that turns an old results file into an exit-2 'predates the completeness/identity header' refusal checks datasetContentHash, requestedRepetitions and scope but not `identity`. A file carrying those three keys but no identity object (hand-e | analysis-eval.ts:398: extend the condition with `// rf.identity === undefined // typeof rf.identity.provider !== "string"` and extend the message with 'or lacks an identity'. | 1 vote, stands |
| WS2-F48 | #61 (adjacent, pre-existing) | `src/lib/evals/runner.ts:1447-1451 (judged identity line prints registr` | #61 makes registryVersion load-bearing for LIVE files through resume refusal only. The scorecard report prints the registry version for the judged file but not for the paired baseline file, so a report pairing a pre-bump live baseline (analysis-reg-v1) with a  | runner.ts:1463-1465: append ` registry=${sc.baselineIdentity.registryVersion}` and, when it differs from the judged one, ` — **REGISTRY DRIFT vs judged**` in the style of the  | 1 vote, stands |
| WS2-F49 | #61 (ef0bba8) | `src/lib/evals/runner.ts:184-186 (headerIsLive = provider !== "stub"); ` | headerIsLive mutated to `provider === "openai"` or `.startsWith("openai")` survives the entire suite. Equivalent TODAY because the identity union has two members, but WS-2-2 and PLAN-WS-2 §5.2 hand step 20 / PR-2.4-1 (eval --provider) the constraint 'headerIsL | Add to runner.test.ts 'resume semantics': `it("headerIsLive is 'not stub', not 'is openai'")` building a header whose identity provider is "anthropic" (cast until PR-2.4-1 wid | 1 vote, stands |
| WS2-F50 | #61 (ef0bba8) | `src/lib/evals/runner.ts:514-516 (`if (headerIsLive(existing) // header` | The left operand of the `//` is not discriminated: keying the skip on headerIsLive(current) alone survives the full suite (the report's table records only the existing-only mutant, which is killed). Outcome-equivalent — cmp("provider", ...) at :505 runs uncond | In runner.test.ts:272-281 add the symmetric direction: `const back = resumeIdentityMismatch(live, offline); expect(back).toContain("provider:"); expect(back).toContain("regist | 1 vote, stands |
| WS2-F51 | #62 | `docs/designs/LOG-DRAIN.md:271-277 (§5 item 1); src/app/api/logs/drain/` | Design §5 says 'Vercel's own function request-size limit already sits below this [4,000,000]'. Vercel's published serverless request-body limit is 4.5 MB (auditor knowledge; not verifiable in-repo), ABOVE the 4,000,000-byte cap, so the in-code cap is the bindi | Design :275-277: 'Vercel's request-body limit (4.5 MB) sits slightly ABOVE this cap, so the cap is the effective bound; it is enforced on the bytes actually read, not on Conte | 1 vote, stands |
| WS2-F52 | #64 | `src/lib/logs/drain.ts:112-115` | The hex regex /^[0-9a-fA-F]+$/ admits an odd-length header and Buffer.from(hex, "hex") silently drops the dangling nibble, so a 41-character header consisting of the correct 40-char signature plus any one hex char verifies TRUE (39, 42 and a flipped last char  | drain.ts:112 -> `/^[0-9a-fA-F]{40}$/` and add to drain.test.ts:93-100 `expect(verifyDrainSignature(body, sign(body) + "f", SECRET)).toBe(false)`. | 1 vote, stands |
| WS2-F53 | #64 | `src/lib/logs/drain.ts:241-244 (timestamp validation) and src/app/api/l` | The receiver checks only that timestamp is a positive finite number; there is no freshness/replay window and no timestamp header is read, so a captured signed delivery replays as 200 indefinitely. While the rows exist the PK + ON CONFLICT (id) DO NOTHING makes | Optional: give normalizeBatch a `cutoff: Date` parameter, count rows with loggedAt < cutoff as `stale` (dropped, reported), and have route.ts pass retentionCutoff(new Date(),  | 1 vote, stands |
| WS2-F54 | #64 | `src/app/api/logs/drain/route.ts:61-68; src/lib/logs/drain.ts:106-117` | The HMAC is computed over the UTF-8 RE-ENCODING of req.text(), not the raw request bytes: a body containing an invalid UTF-8 sequence is decoded with U+FFFD replacement, the signed bytes differ, verification fails and the route answers 403 — which Vercel treat | route.ts:61-66: `const buf = Buffer.from(await req.arrayBuffer());` then verifyDrainSignature(buf, header, secret) with drain.ts:113 accepting Buffer / string; `const raw = bu | 1 vote, stands |
| WS2-F55 | #64 (and #62) | `docs/designs/LOG-DRAIN.md:293; src/app/api/logs/drain/route.ts:61-66, ` | The failure-policy row 'Anything else thrown -> 200 with stored: 0' is not implemented as a catch-all: the only try/catch blocks wrap req.text(), the insert, and the sweep. A throw from parseDrainBody/normalizeBatch/maxRows would surface as a framework 500 (re | Either wrap lines 75-93 in a try/catch returning `{ ok: true, received: 0, stored: 0, dropped: 0, reason: 'unhandled' }` with status 200, or delete the design row and state th | 1 vote, stands |
| WS2-F56 | #64 | `src/lib/logs/drain.ts:335-338, :363-365; docs/designs/LOG-DRAIN.md:196` | With a valid signature, deployment_id / request_path / request_id / id are stored as sent — the shared secret is the entire trust boundary — and because the INSERT is ON CONFLICT (id) DO NOTHING (first writer wins, never DO UPDATE), a secret-holder can pre-ins | Add to design §10/§11 and .env.example: 'The secret is the only trust boundary: anyone holding it can insert arbitrary rows under any deployment_id and can pre-empt genuine id | 1 vote, stands |
| WS2-F57 | #64 | `src/lib/logs/drain.ts:219-224 (isSelfIngestion), :212-217 (stripQuery)` | The self-ingestion drop is exact-match after stripping query/fragment and one trailing slash. Dropped: exact, ?x=1, trailing '/', '/?x=1', '#frag', trailing whitespace, and the proxy.path fallback. NOT dropped: '/API/LOGS/DRAIN', '/api/logs/drain//', '//api/lo | Optional hardening at drain.ts:222: collapse trailing slashes, collapse a leading '//' to '/', lowercase, plus a test for '//' and case variants; not required for correctness. | 1 vote, stands |
| WS2-F58 | #64 | `src/lib/logs/drain.ts:388-402 (claimSweepSlot), src/app/api/logs/drain` | The 'at most once per hour' sweep throttle is a module-level variable, so it is per warm process: every cold start resets it (a sweep on the first stored delivery of each new instance) and N concurrent instances can each sweep in the same hour. Each pass is st | Design :167 -> 'at most once per hour per warm instance'. No code change needed. | 1 vote, stands |
| WS2-F59 | #64 | `docs/RELEASE-CHECKLIST.md:48-53 (step 5) and :94-103 (step 11)` | The release checklist has no line for LOG_DRAIN_SECRET or migration 0029. Step 5 covers 'every NEW cap/flag env'; LOG_DRAIN_SECRET is neither, yet design §8 and .env.example:86-93 give it ruling-4 ordering (set in Production BEFORE the receiver deploys, or eve | Step 5: append '— and any fail-closed SECRET a release reads for the first time (precedent: LOG_DRAIN_SECRET, docs/designs/LOG-DRAIN.md §8: set in Production before the deploy | 1 vote, stands |
| WS2-F60 | #65 | `scripts/map-remap.ts:192-198 (remapBaseHost) and :215-223 (assertBaseA` | An empty or unparseable host matches an empty ack. remapBaseHost returns "" for bases whose WHATWG hostname is empty (file:///etc; `localhost:3000` parses as scheme `localhost:`) or for the empty string, and the raw trimmed string for unparseable bases (`http: | In assertBaseAck before the loopback check: parse with new URL (throw 'does not parse as an http(s) URL — refusing' on failure), require protocol http:/https:, require a non-e | 1 vote, stands |
| WS2-F61 | #65 | `scripts/map-remap.ts:186 (LOOPBACK_HOSTS = 127.0.0.1 / localhost / ::1` | Over-strict (safe) refusals: `http://[::ffff:127.0.0.1]:3000` (WHATWG serializes as `[::ffff:7f00:1]`), `http://localhost.:3000` (trailing dot) and `http://0.0.0.0:3000` are refused without an ack; acks differing from the host by port, trailing dot, userinfo o | Optional only. If operators bind local servers to 0.0.0.0 or use IPv4-mapped IPv6, extend :186 with "0.0.0.0" and "[::ffff:7f00:1]" plus accepted-spelling pins; otherwise leav | 1 vote, stands |
| WS2-F62 | #65 | `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md:672 (Mutation proofs row)` | The report says 'comparing the ack against the base URL instead of the host fails 2'. Replacing `=== host` with `=== base.trim().toLowerCase()` fails 3 — 'naming the exact host is consent' (:925), 'the ack is matched against the HOST, not the whole base URL' ( | Docs only: :672 replace 'fails 2' with 'fails 3 (`=== base.trim().toLowerCase()`)' or name the exact mutant that produced 2. | 1 vote, stands |
| WS2-F63 | #65 | `scripts/map-remap.ts:193-197 (remapBaseHost) and :218 (ack compare)` | Three low-significance unpinned variants, all in the fail-closed direction: dropping .toLowerCase() in remapBaseHost's URL branch is an equivalent mutant (WHATWG URL already lowercases hostnames); dropping it in the fallback branch is unpinned and only matters | Optional pins in the 'non-loopback route targets' describe: `expect(() => assertBaseAck("LOCALHOST", undefined)).not.toThrow();` and — after deciding the policy — either `expe | 1 vote, stands |
| WS2-F64 | #65 | `AGENTS.md:1051-1052 (Next steps item 2); docs/reviews/MAP-REMAP-RUNBOO` | AGENTS.md says the #33 remap operator 'has never been RUN'; after #65 it was rehearsed end to end in estimate mode (432 dry route calls, $0, against a fork-bound local server — runbook §10.5). 'Never EXECUTED' (no --execute, zero map:remap rows) remains true,  | AGENTS.md:1051-1052 -> 'the #33 remap path (the operator EXISTS in the tree and was REHEARSED in estimate mode on a disposable fork on 2026-09-06 — 432 dry route calls, $0, fi | 1 vote, stands |
| WS2-F65 | #67 | `src/lib/ask/answer.ts:574, :588 at 697aea4 (`const model = askAnswerMo` | No test pins that the gate consults the RESOLVED model (the value later dispatched) rather than a parallel env read: replacing `model` in the predicate with `process.env.ASK_ANSWER_MODEL ?? "gpt-5"` survives the entire src/lib/ask suite (701/701). The only div | Append to ask.test.ts (near 'Auto money path — hasScorecard() gate (R3)') a case: envPaidV2(); vi.stubEnv("ASK_ANSWER_MODEL", " gpt-5 "); mock createMock with a completion; ca | 1 vote, stands |
| WS2-F66 | #67 | `WS-2-1-AUTO-GATE-2026-09-06.md 'Rulings touched -> Ruling 4'; tests: s` | The sentence 'spies on init/tryReserve/record and on the OpenAI ctor/create assert zero calls in all three modules, including an injected run guard (opts.guards.answer)' overstates: only the answer-stream R3 block passes `guards: { answer: injected }`; the ask | Either reword the report to 'including an injected run guard in the streaming module', or add the two missing variants: in ask.test.ts's gpt-5-nano case pass `{ guards: { answ | 1 vote, stands |
| WS2-F67 | #67 (697aea4, open) | `src/lib/ask/router.test.ts:45-66 @697aea4; src/lib/ask/router.ts:80-83` | The removed G4 assertion `expect(route({mode:"auto"}).reason).toBe("auto_env_override")` (router.test.ts:47 @98294c5, ASK_ANSWER_MODEL=gpt-4o) was MOVED from a route()-level integration assertion to the pure function autoPolicyReason("gpt-4o", true) (:62); the | Add a route()-level override case that makes a non-baseline model scorecarded for the answer suite via vi.doMock('./registry') wrapping hasScorecard (m === "gpt-4o" && s === A | 1 vote, stands |
| WS2-F68 | #67 | `WS-2-1-AUTO-GATE-2026-09-06.md sections Scope ('no environment variabl` | The production-unaffected claim rests on prior records, not on a read-back this session performed, and the report does not cite its basis. The most recent explicit record that no *_MODEL variable exists in any Vercel environment is the 2026-08-22/23 `vercel en | In the report Handoff cite the 2026-08-23 listing as the basis and add to the deploy request: 'pre-deploy: vercel env ls confirms ASK_ANSWER_MODEL, ASK_RERANK_MODEL and ASK_PI | 1 vote, stands |
| WS2-F69 | #67 | `src/lib/ask/registry.ts:49-57 (gpt-5-mini scorecard ref); docs/evals/A` | The rerank default's scorecard — now an ENFORCEMENT input for production rerank — cites a document that never names the rerank stage or gpt-5-mini; its 'pass' is an inference that the 2026-07-11 v2-k60 pipeline run used gpt-5-mini as the listwise reranker (imp | registry.ts:54-55 comment: add 'Pipeline-level evidence: the cited 2026-07-11 v2-k60 run used gpt-5-mini as the listwise reranker (ASK-TIER2PLUS-IMPLEMENTATION-NOTE-2026-07-11 | 1 vote, stands |
| WS2-F70 | #59 / #60 / #64 / #67 (cumul | `AGENTS.md:30-34 (routing sentence), :78-81 (src/lib/llm/ line; no src/` | Stale-by-omission standing text, none false, all incomplete after this audit set: ruling 4 has no provider dimension ('a (workload, model, effort) with no analysis-reg-v1 approval'; code approves per (workload, provider, model, effort) — analysis-registry.ts:1 | Step 25 applies, exactly once each: WS-2-2 items 1–3 (item 3 with WS2-F18 wording; PLAN-WS-2 bullets 3 and 5 duplicate WS-2-2 items 2 and 1 — skip them), PLAN-WS-2 bullet 2 (r | 1 vote, stands |
| WS2-F71 | all | `AGENTS.md:368-372 (Quality/ops); docs/CURRENT-STATE.md:599-603` | Test counts are stale: AGENTS.md says 3,590 unit tests / 246 files and 160/25 integration; CURRENT-STATE says 3,451/239. At 98294c5 the unit suite is 3,914/263 (3,940/263 at 697aea4 per the orchestrator's baseline and #67's report) and the last integration run | Step 25 re-measures on the merged tree (`npm test` from a scratch worktree, never the audit worktree) and writes the measured numbers with the SHA; do not copy any single lane | 1 vote, stands |

## Per-PR verdict — the column step 27 reads

| PR | major | minor | note | Verdict | What the verdict turns on |
|---|---|---|---|---|---|
| #52 | 0 | 3 | 3 | **merge-stands** | The activation bypass is genuinely closed: the key-alone branch is gone, `ANALYSIS_PROVIDER=anthropic` throws before the provider module is imported, and restoring either selection branch is mutation-killed. Findings are a docs regression the branch carried in (WS2-F09), a self-referential message pin (WS2-F10), and stale standing text. |
| #57 | 0 | 1 | 3 | **merge-stands** | The read-only scan discriminates (a write verb in code fails it; the same string in a comment does not), and the isolation scan now covers `ask-eval-harvest.ts` with no name-keyed hole. One contrived stripper loophole and the still-unguarded `--generate` pass (decision R9) are recorded. |
| #59 | 0 | 3 | 4 | **merge-stands** | The refusal really precedes both SDK construction and reservation, and the stub path still outranks it. Two weaknesses: the `toBe` bit-identity pin cannot see the grouping regression it exists to prevent (WS2-F14), and one pre-existing pin was weakened rather than moved (WS2-F15). A third production caller of the refusal is undocumented (WS2-F13). |
| #60 | 0 | 8 | 7 | **merge-stands** | The provider dimension fails closed at all five dispatch sites, the map lock and the extractor basis are byte-identical, and a 112-row matrix found no blocked configuration that moves a version. The findings are test-evidence and latent-corner issues for the widening PR, plus two mutation counts the report overstates. |
| #61 | 0 | 0 | 4 | **merge-stands** | The offline/live skip behaves as specified and the committed offline files resume byte-identically under a bumped registry constant. Every finding is a note about the shape a future eval `--provider` flag will inherit. |
| #62 | 1 | 1 | 2 | **fix-before-deploy** (documentation) | The design's enablement sequence omits the manual migration step (WS2-F04) and its deciding argument for the Neon sink — one `JOIN` on `request_path` — does not hold for the ingest family (WS2-F02). Both are corrections to text an operator will follow at step 27, so they should land before the deploy that carries the receiver. |
| #64 | 1 | 9 | 9 | **fix-before-deploy** (documentation); the CODE is merge-stands | The receiver is inert while `LOG_DRAIN_SECRET` is unset in every environment, so merging and deploying it changes no behaviour — the hazard is at REGISTRATION. Before the drain is registered: apply migration 0029 by hand (WS2-F04), and prefer landing the NUL/int4 hardening (WS2-F03) and the row-cap clamp (WS2-F26) first, because both turn a legitimate signed delivery into a permanent 500-and-retry. |
| #65 | 0 | 3 | 6 | **merge-stands** | The `--base-ack` guard works end to end and refuses the production default before the driver is constructed. Its only pin is a source scan that a commented-out call would pass (WS2-F05); the fix is a subprocess pin, and every unpinned host variant found errs toward refusing. |
| #67 (merged after this audit — see the correction below) | 2 | 3 | 7 | **fix-before-deploy** | The gate itself is correct and the baseline pin is honest (written against the unmodified tree, and both defaults are scorecarded, so production behaviour is unchanged). Two majors: the new exact-cache pin is vacuous and so is the pre-existing one it copied (WS2-F07) — a two-line test fix; and the report's disclosure of the ungated legacy path understates it (WS2-F06), which is a pre-existing defect needing its own task, not a change to this PR. |

**No blocker was found, and no PR is recommended for revert.** The two verdicts that are not
"merge-stands" both turn on documentation an operator follows and on test evidence, not on shipped
behaviour: nothing in the audited set can spend, activate a model, write production data, or move
an extractor version.

**One finding is not a PR's to fix.** WS2-F06 — the `ASK_PIPELINE=legacy` rollback path dispatches
a paid completion with no `SpendGuard` — predates every audited PR (it dates to `cea8cac`,
2026-07-11) and is byte-identical at `98294c5` and `697aea4`. It meets the blocker wording
literally ("a spend hazard reachable from a documented configuration") and is rated **major**
because production leaves `ASK_PIPELINE` unset, the path is bounded by a fail-open $10/day
`ask_usage` gate, and no audited PR widened it. It needs an OPEN-TASKS entry and its own fix
(decision A1).

### Correction — 2026-09-07: PR #67 merged while this audit was running

The audit read #67 at its open branch tip `697aea4`, as the prompt's conditional directs. It has
since merged to `main` as **`6b52c2c`** ("Merge PR #67: Auto scorecard gate on the Ask money
path"), inside the CP3 merge queue. **The merged tree is byte-identical to the tree audited** —
`git diff 697aea4 6b52c2c -- src/lib/ask .env.example` is empty, and the `src/db/schema.ts`
difference between the two is entirely PR #73's conflict-observations block — so every finding,
mutation count and verdict above transfers unchanged. Two consequences:

- **#67's verdict changes from "fix-before-merge" to "fix-before-deploy".** WS2-F07's vacuous
  cache pin is now a test fix on `main` rather than a merge condition. It is still a two-line
  change and it should land before step 27 deploys, because that pin is the only evidence that a
  degraded provider is never cached — a ruling-3 claim.
- **WS2-F06 is on `main` in exactly the sense it always was.** The unguarded `ASK_PIPELINE=legacy`
  path predates #67 and is unchanged by it; decision A1 still stands, and it is still not #67's
  defect to answer for.

Nothing else in the audited range moved: the eight merged PRs remain ancestors of `98294c5`, and
this register's base SHA is unchanged.


## What this audit established, and what it did not

Written by the completeness critic at the end of round 1 and corrected here where the finishing
round changed it. **Read this before treating the verdict column as a clearance.**

**Established, with mutation evidence.** No audited PR moves a `SpendGuard` reservation or a
metering site, adds or renames a cap env, edits an applied migration, touches `MAP_BASELINE` or the
extractor-version basis, or deletes a standing-ruling test pin. Two `#59` assertions were weakened
and one `#67` assertion moved; both are recorded as findings. Thirteen lens finders covered all
eight prompt lenses plus PR #67, read every file the nine diffs touch, and ran 151 mutations and
probes. The unit suite is green at both SHAs.

**Established about the findings.** Every one of the 71 findings was verified at least once by an
agent independent of the finder, and **none was refuted**. The three-refuter protocol ran in full
for all 8 findings the finders rated major (24 votes, all non-refutations); six of those were
downgraded on severity by their refuters and three remain major. The 63 minor and note findings
carry **one** verification each, batched by PR — the deviation §Method records. So the register's
majors are well-tested and its minors and notes are single-sourced.

**Not established — the honest limits.**

- **Nothing ran against a database.** Migrations 0028 and 0029 were never applied,
  `src/integration/runtime-logs.itest.ts` was read but never executed, and the #64 findings that
  turn on PostgreSQL behaviour (NUL rejection in WS2-F03, the 65,535-parameter bind cap in
  WS2-F26) are asserted from documentation, not measured. The prompt forbids a fork for this step.
- **No Vercel or Neon environment was read.** Every "absent in every environment" statement here is
  taken from the reports and AGENTS.md. The production values that #59 and #67 newly refuse
  (`ASK_EMBED_MODEL`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `LOG_DRAIN_SECRET`) are unknown to
  this audit.
- **Tree-wide `npm run lint` and `npm run build` were never run** by the audit itself; lint was
  exercised on single files, and at `697aea4` no gate other than the unit suite was run. (The
  register branch's pre-push hook ran typecheck + lint + test green, which is weaker evidence than
  a deliberate build.)
- **Three merges inside the audited range were out of scope**: #58 (eval plane), #63 (migration
  0028 and `src/db/migrations.test.ts`, the ruling-2 guard) and #66 (docs). #63 matters here
  because #64's ruling-5 evidence sits on top of 0028; it is step 18's to audit.
- **No network**, so Vercel's drain contract — header name, HMAC-SHA1, body shapes, retry policy,
  size limit — was checked only against the repository's own citation of it.
- **Merge fidelity was assumed, not checked**: no `range-diff` or tree-hash comparison confirms
  that what merged equals what each report reviewed.
- **Report figures left unmeasured**: the per-PR test counts in WS-2-1, WS-2-2 and the remap
  runbook; the runbook's fork-rehearsal spend figures; LOG-DRAIN's 175/26 integration count.
- **Evidence hygiene**: all thirteen finders shared one `node_modules` and ran concurrently, so
  mutation counts were measured under parallel load; two independent full-suite runs hit the same
  unexplained 5-second timeout in `src/lib/evals/injection-dataset.test.ts`, which passes alone.

**No blocker was found. That is a statement about what was looked at, not a clearance.**

### Coverage gaps, for whoever runs step 26

The critic named sixteen. **G1 is discharged** — it asked for the refutation votes that the
finishing round then completed. The rest stand as written; two are rated blocker-if-real by the
critic, and both are scope questions rather than defects in the audited code.

| # | lens | severity if real | the probe a later step should run | why it matters |
|---|---|---|---|---|
| G1 | all lenses — the refutation protocol itself | major | Complete the votes: for WS2-F07…F71 (and the missing votes on F01 factual-impact, F03 impact, F05 remediation, F06 impact+remediation), have an independent reader re-open the cited file:line at 98294c5 / 697aea4 and record refuted / stands / stands-severity-change, per the prompt's ≥2-non-refutation | The workflow stopped at 13 of 213 planned votes. Only WS2-F02 and WS2-F04 have three refuters; F01/F03/F05 have two, F06 has one, and 65 findings have zero. Every 'suggested_severity' outside those six, and the whole per-PR merge- |
| G2 | 5 (eval-plane isolation) + 8 (docs/standing truth) — scope of the audi | blocker | `git log --merges 2203150..98294c5` lists ten merges; audit the three that were never in scope. Priority: `c728b2b` (PR #63) — it edits `src/db/schema.ts`, `src/db/migrations.test.ts` (the ruling-2 claim-source-trigger guard) and lands migration 0028. Diff `migrations.test.ts` for a weakened or dele | #64's ruling-5 evidence was checked only as a static 0028→0029 snapshot diff, i.e. on top of an unaudited migration, and no migration was applied anywhere in this audit. Rulings 2 and 5 are invariant-grade and their two guards (th |
| G3 | 1 (ruling 4) + 8 (env truth) — no environment was ever read | major | Read back, in all three Vercel environments: `ASK_EMBED_MODEL`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `OPENAI_MODEL`, the five `<W>_PROVIDER` names and `LOG_DRAIN_SECRET`. `EMBED_PRICES_PER_MTOK` holds exactly one row (`text-embedding-3-small`), so ANY other value of `ASK_EMBED_MODEL` — including  | Lens 8 records verbatim: 'no Vercel or Neon access, so every "absent in every environment" claim is taken from the reports.' Two audited PRs change production behaviour conditionally on values nobody has read, and ruling 4's order |
| G4 | 6 (tests as evidence) + deploy readiness | major | In a scratch worktree, at 98294c5 and again at 697aea4: `npm run typecheck`, `npm run lint` (tree-wide), `npm test`, and `npm run build` with a dummy DATABASE_URL. Record counts and every lint warning. | The audit ran `npx eslint <one file>` only, never `npm run lint`; `npm run build` was never run at all, yet #64 adds a new App Router route exporting `runtime`/`dynamic`/`maxDuration`, and build failures are invisible to the pre-p |
| G5 | 7 (log-drain receiver) — nothing ran against Postgres | major | On a disposable Neon fork with 0029 applied: run `src/integration/runtime-logs.itest.ts` (read but NEVER executed by any finder) and confirm the LOG-DRAIN report's '175/26'. Then drive through `insertRuntimeLogs` (a) an entry whose message contains U+0000, (b) a `status_code` beyond int4, (c) a 6,00 | WS2-F03 (whole delivery permanently unstorable, 500 → Vercel retries the identical batch) and WS2-F26 (LOG_DRAIN_MAX_ROWS > ~5,461 breaks every INSERT) are the two findings driving #64's fix-before-deploy verdict, and both are ass |
| G6 | 7 (log-drain) — no network, so the external contract is unverified | major | Read Vercel's drains/security documentation and confirm, field by field, what #64 assumes: header `x-vercel-signature`, HMAC-SHA1 over the raw body, NDJSON/array/object body shapes, the field names `deploymentId`/`requestPath`/`proxy.path`/`statusCode`/`requestId`/`timestamp`, the retry semantics th | Lens 7 verified the contract only against 'the repo's own citation plus auditor knowledge (no network)'. If any element is wrong the receiver fail-closes to 403 or stores nothing, silently — the feature is inert and the WS-3.6 clo |
| G7 | 4 (identity) + 1 (ruling 4) — an orphan two lenses declined | blocker | `SpendGuard`'s `cfg.provider` is a bare `string` (src/lib/usage/spend-guard.ts:26), while `src/lib/usage/llm-guard.ts:11-22` now carries a comment warning that its `*_PROVIDER` row-key constants ('openai_map', …) share names with #60's `<W>_PROVIDER` routing envs (values 'openai' / 'anthropic' / …). | Lens 4 obs (1) and lens 5 obs (iii) both raised the collision and both explicitly declined to examine it, so no finding exists. A mis-keyed `provider_usage` row splits the all-time backstop, which ruling 4 compares against EACH pr |
| G8 | 6 (tests as evidence) + 4 (identity) — lens 4 ran zero mutations | minor | Mutate the two persisted legacy provider tags and run `npm test`: `src/lib/analysis/openai-provider.ts:147` (``openai:${…}`` → ``openai/${…}``) and `src/lib/analysis/synthesize.ts:443-449` (`mapreduceProviderTag`). Record the failing test names, or the absence of any. | Lens 4's mutation_log is empty by instruction — its 27 identity claims rest on code reading plus one throwaway tsx probe. These two strings are persisted in `digests.provider` and read by the scoreboard and quality-funnel, and ste |
| G9 | 6 (tests as evidence) — harness hygiene under which every kill count w | minor | Re-run the headline mutations serially in a worktree with its OWN `npm ci`: #60 allowlist (WS2-F20 measured 15 failures across 8 files, not the report's 13/6), #64 M1 (6), #65 M13a (1), #67 M8/M9 (34/55). Confirm the counts, and confirm the `src/lib/evals/injection-dataset.test.ts` 5-second timeout  | All 13 finders symlinked `node_modules` to the single audit-worktree copy and ran concurrently, so ~12 parallel vitest processes shared one `.vite` cache (and wrote into the nominally read-only audit worktree). Two independent fin |
| G10 | unassigned — ruling 3 (truth-in-UI) for #67's new degraded provider | minor | At 697aea4 read `src/app/ask/ask-result.tsx:67-74`: `deriveAnswerState` branches only on `provider === "limit"`, so an `unscorecarded` (deterministic, non-model) answer renders as an ordinary answered result with no degraded callout; `src/app/api/ask/route.ts:35` returns the raw provider to API clie | #67 introduces a new user-visible degraded path and no lens owned the UI — lens 9 obs (2) and lens 6d both flagged it as out-of-lens, and no WS2-F finding exists ('ask-result' appears only in coverage notes). The report's ruling-3 |
| G11 | 3 (map lock / #65 runbook) — spend claims taken on trust | major | Verify the runbook §10.2–10.4 rehearsal from the record: `provider_usage` (`openai_map`) shows zero paid requests for the 2026-09-06 window, the 432 dry calls cost $0, and the disposable fork was deleted. Then apply or reject step-25 item 12 (AGENTS.md:1051-1052 'has never been RUN' → 'rehearsed in  | Lens 3 records 'Not verified: the runbook's fork dry-run figures (10.2-10.4) — no DB access permitted'. Step 25 would write an unverified spend claim into standing text, and #65's whole safety argument is that the remap operator h |
| G12 | all — merge fidelity, never checked | major | For each audited merge, confirm the merged tree equals the tree that was actually reviewed: `git range-diff <base>...<reviewed head> <base>...<merge>`, or at minimum verify the merged `src` tree hash against the head each report names (the #67 agents did exactly this for `b602ff0`; nobody did it for | Every finder audited the merged tree and simultaneously graded the reports' claims against it, assuming without checking that the report describes the artifact that merged. Post-review drift would invalidate the 'verified TRUE' co |
| G13 | 8 (docs truth) — a defect class found once, by accident, never swept | minor | For every audited merge, `git diff <merge>^1 <merge> -- docs/ / grep '^-'` and classify each removed line as intentional or a silent revert. Start with the rest of `dc7d47e` (the #52 branch commit that reverted the macOS port of the operator smoke test in docs/SETUP-NEXT-WEEK.md — WS2-F09); lens 6c  | Every audited merge touches docs/PROGRESS.md and most touch docs/OPEN-TASKS.md, and those hunks were never diffed for REMOVALS. The one revert that was found surfaced only because a mutation agent happened to open that file; step  |
| G14 | 1/3 (routing surfaces) — the operator-facing script #60 rewrote was ne | minor | In a scratch worktree run `npx tsx scripts/model-routing-inspect.ts` with (a) no env, (b) `DIGEST_PROVIDER=anthropic`, (c) `MAP_PROVIDER=anthropic MAP_MODEL=gpt-5-mini`, and check that every printed row, refusal reason and the new allowlist/nameable-provider lines agree with `workloadDispatchConfig` | #60 rewrote every output line of the inspector; only its `.test.ts` was mutated (6a m12), never the script itself. This is the surface an operator reads before authorizing a model activation, and a wrong 'dispatch=ok' row there is |
| G15 | 9 (#67) — PR #67 was audited under lenses 1, 2 and 6 only | minor | Give #67 the lens-4/5/8 treatment: `grep -rn ask_usage scripts/ src/integration docs/ / grep -i provider` and check every enumeration of `ask_usage.provider` values for the new `unscorecarded` member (the #57 attribution report's buckets are WS2-F36; the rest are unchecked), and draft #67's own rows | #67 adds a new PERSISTED provider value and a documented enumeration in `src/db/schema.ts:614-619`; the prompt assigned it only to the spend/degradation/mutation lenses, so persisted-shape consumers outside `src/lib/ask` and the s |
| G16 | 8 (docs truth) — report numbers nobody re-measured | minor | Run `npm test` at each merge SHA (8ac41d2, 8a00ea2, fed1d03, ef0bba8, 7f267bd, 1e06112) and compare to the reports' stated per-PR counts (WS-2-1 3,735/256; WS-2-2 3,769/258; MAP-REMAP-RUNBOOK 3,723→3,731; LOG-DRAIN +60/+2 — the last is the only one verified). | Lens 3 and lens 5 both explicitly declined to re-measure per-PR counts; WS2-F71 corrects the STANDING counts but leaves the reports' own numbers unchecked, and step 25 copies report text into AGENTS.md and CURRENT-STATE.md. |

## Mutation log

Every claimed pin was mutated and run. **151 mutations** across the nine PRs, each applied in a
detached scratch worktree, run against its named test file(s) and — for the headline mutations —
the full suite, then reverted; **every one was restored** (`git checkout -- .` + `git clean -fd -e
node_modules`, `git status --short` clean apart from the `node_modules` symlink) before the next.
No mutation was left in place and the audit worktree was never mutated. The complete log, with the
exact edit and the failing test names for each, is in
`docs/reviews/WS-2-AUDIT-ROUND1-RAW-2026-09-06.json` under `finders[].mutation_log`.

| PR | mutations | killed | survived | other/control | notable survivor(s) → finding |
|---|---|---|---|---|---|
| #52 | 17 | 14 | 3 | 0 | anthropic-provider.ts:60-67: `anthropicDocLine` body replaced with the; anthropic-provider.ts: import SpendGuard and insert `new SpendGuard({ ; provider.ts:82: `bypass standing rulings 4 and 8` -> `bypass standing  |
| #57 | 13 | 11 | 1 | 1 | m20: scripts/ask-model-attribution.ts — insert `const g = "/*"; const  |
| #59 | 14 | 11 | 3 | 0 | src/lib/embeddings/client.ts:170 `model,` -> `model: EMBED_MODEL_DEFAU; m3: src/lib/embeddings/client.ts — delete only line 163 `if (!embedPri; m6: src/lib/llm/pricing.ts:86 `return (tokens * embedPricePerMtok(mode |
| #60 | 26 | 14 | 8 | 4 | prepended bare side-effect `import "@anthropic-ai/sdk";` to src/lib/an; prepended unspaced `import Anthropic from"@anthropic-ai/sdk";` to src/; prepended ordinary `import Anthropic from "@anthropic-ai/sdk";` to src |
| #61 | 14 | 8 | 3 | 3 | runner.ts:514: `if (headerIsLive(existing) // headerIsLive(current)) {; runner.ts:185: `return h.identity.provider !== "stub";` -> `return h.i; runner.ts:185: `return h.identity.provider !== "stub";` -> `return h.i |
| #64 | 23 | 16 | 7 | 0 | drain.ts:116 `return timingSafeEqual(got, expected);` -> `return timin; drain.ts:116 -> `return got.toString("hex") === expected.toString("hex; route.ts: the three-line verify block (:68-70) removed and re-inserted |
| #65 | 17 | 11 | 5 | 1 | map-remap.ts:695 -> `  // assertBaseAck(base, argVal("--base-ack"));`; map-remap.ts:695 -> `  try { assertBaseAck(base, argVal("--base-ack")); map-remap.ts:194 `new URL(base).hostname.toLowerCase()` -> `new URL(ba |
| #67 | 25 | 20 | 4 | 1 | src/lib/ask/router.ts:101 -> inline `(hasScorecard(answerModel, ASK_AN; src/lib/ask/limits.ts:733 `payload.provider.startsWith("openai")) {` →; src/lib/ask/limits.ts:733 → `if (cacheCtx && payload.state === "answer |
| other | 2 | 0 | 0 | 2 | — |
| **total** | **151** | **105** | **34** | **12** | |

"Survived" is not automatically a defect: of the 34 survivors, several are provably equivalent
mutants that the finders disclosed as such (for example deleting `client.ts:163`'s explicit embed
refusal, which `embedCostUsd` re-raises identically ten lines later, and `pricedFor`'s
`hasOwnProperty` guard on a table with no prototype rows). The survivors that DO indicate a missing
pin are the findings recorded above — chiefly WS2-F01 (a truncated HMAC compare), WS2-F05 (a
commented-out or `try/catch`-wrapped `assertBaseAck`), WS2-F07 (the vacuous cache pin), WS2-F14
(the grouping-blind `toBe` pin), WS2-F22 (a defaulted second parameter evading `.length === 1`) and
WS2-F65 (no pin that the Ask gate reads the resolved model).

Three report mutation-count claims were re-measured and are recorded as findings where they differ:
#60's "13 failures across six files" measures **15 across eight** (11 within the six named files),
#65's "comparing the ack against the base URL fails 2" measures **3**, and #52's and #61's counts
(1/3/4/1/2 and 1/2/1) and all nine of #67's (3/3/2/2/35/1/3/34/55) reproduced **exactly**.

## Stale standing text — the list step 25 applies

Produced by the secrets/env/docs lens and re-checked against the code at `98294c5`. Where two
reports propose wording for the same line, **apply exactly one** — the overlap is named.

1. AGENTS.md:27-29 Architecture — \"`anthropic` implemented in the seam (no key in any env yet — auto-selected if an Anthropic key exists and no OpenAI key does)\" → ANTHROPIC-SEAM item 1 + WS-2-2 item 4's providers.ts clause (see L8-6). Overlap: ANTHROPIC-SEAM 1 / WS-2-2 4 / PLAN-WS-2 bullet 1 (SUPERSEDED — presumes B1).
2. AGENTS.md:30-34 routing sentence — add PLAN-WS-2 bullet 2 (\"per (provider, model, effort); providers allowlisted per workload in src/lib/llm/providers.ts (all openai today)\") and #67 item 1 (Ask scorecard gate ENFORCED on the money path since 2026-09-06; call sites also never read *_PROVIDER).
3. AGENTS.md:78-81 src/lib/llm/ line — add providers.ts + \"provider/model/effort resolver\" (WS-2-2 item 1 ≡ PLAN bullet 5, apply once) and WS-2-1 item 1's pricing.ts gloss (chat + EMBED_PRICES_PER_MTOK).
4. AGENTS.md directory map (after :103 src/lib/cron/ or beside src/lib/usage/) — add `src/lib/logs/  Vercel log-drain receiver logic (runtime_logs projection, HMAC verify, retention sweep)` (LOG-DRAIN item 1).
5. AGENTS.md:116 — \"migrations 0000–0028\" → \"0000–0029\" (LOG-DRAIN item 2; note its 'before' text says 0027) — L8-4.
6. AGENTS.md:127-137 Live/repository — main-vs-production paragraph → L8-5 text (runtime code + unapplied 0028/0029 ahead of production; production still 8a19ade); AGENTS.md:372 append \"(main carries 0028 and 0029 unapplied)\".
7. AGENTS.md:309-312 #97 remaining sites → ANTHROPIC-SEAM item 2 (only the ASK_SESSIONS residuals remain).
8. AGENTS.md:368-372 Quality/ops counts → re-measure (3,914/263 at 98294c5; 3,940/263 at 697aea4; integration 175/26 per LOG-DRAIN) — L8-11.
9. AGENTS.md:410-417 ruling 4 → WS-2-2 item 2 (provider allowlist + priced-for-provider + \"(workload, provider, model, effort) with no registry approval\"; ≡ PLAN bullet 3, apply once) + WS-2-1 item 2 (embed refusal before tryReserve, Ask degrades lexical-only) + #67 item 2 (Ask quality gate, suites v2-k60 / v2-k60-rerank, bills zero units).
10. AGENTS.md:448-457 ruling 13 → WS-2-2 item 3 WITH the L8-3 rewording; do NOT apply PLAN-WS-2 bullet 4 (false — L8-2).
11. AGENTS.md:1016 Anthropic credentials row → ANTHROPIC-SEAM item 3 with the L8-8 qualifier (\"absent from every Vercel environment; present only in the operator's local .env.local, D2 = B\").
12. AGENTS.md:1051-1052 Next steps item 2 — \"has never been RUN\" → \"rehearsed in estimate mode on a disposable fork 2026-09-06 (432 dry calls, $0), never EXECUTED\" — L8-7.
13. docs/OPEN-TASKS.md:187 (end of #33 STATUS) — append runbook §18's 2026-09-06 addendum (#65 did not) — L8-7.
14. docs/CURRENT-STATE.md:29-35 and :656-660 — same main-vs-production correction as item 6; :599-603 test counts; :318-340 Model routing bullet gains the provider dimension; add paragraphs for the embed-pricing refusal, the inert drain receiver + 0029, the Ask scorecard gate (once #67 merges), the remap rehearsal — L8-5/L8-10/L8-11.
15. docs/RELEASE-CHECKLIST.md:48-53 step 5 and :94-103 step 11 — add the LOG_DRAIN_SECRET-before-deploy secret line and the 0028/0029 precedent — L8-12.
16. docs/designs/LOG-DRAIN.md:407-411 and docs/reviews/LOG-DRAIN-2026-09-06.md:265-269 — insert the manual `npm run db:migrate` (+ backup branch) step between deploy and drain registration — L8-1 (major).
17. docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md:1264-1275 — mark the Architecture and ruling-13 bullets SUPERSEDED — L8-2.
18. docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md:315-318 — reword item 3 — L8-3.
19. docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md:274 anchor (≈:96-99 → :78-81) and :306-308 \"HELD on R3\" → cross-reference #67 — L8-9.
20. docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md:252/:262/:272/:279 anchors (→ 27-29 / 309-312 / 1016 / 981) — L8-8.
21. docs/prompts/2026-09-05-48h-COMMON.md:113-121 §4.8 and MAP-REMAP-RUNBOOK §5 :180-182 — \"Until PR #52 merges\" → past tense — L8-13.
22. .env.example:32 \"NONE of these are set anywhere today (2026-08-17)\" and :59 \"ABSENT in every environment today\" — consistent with AGENTS.md but NOT verifiable offline (no Vercel access in this audit); step 27's env posture listing should re-confirm by name.
### Decision-log drafts


### Report "Proposed AGENTS.md changes" blocks — accuracy before step 25 applies them

- `ANTHROPIC-SEAM-HARDENING` items 1–4: accurate in substance; the AGENTS.md line anchors have all
  moved (WS2-F34) and item 3's credentials wording needs the qualifier that the key is absent from
  every Vercel environment but present in the operator's local `.env.local` (D2 = B).
- `WS-2-1-ASK-PARITY` items 1–3: accurate; item 1's anchor moved; the decision-log draft records
  the Auto gate as HELD, which #67 has since superseded (WS2-F38) — apply the two entries in
  chronological order or amend the first.
- `WS-2-2-PROVIDER-CORE` items 1–4: item 3's ruling-13 addendum overclaims ("a REFUSED provider
  does not move it either" is exact for the model but not for the effort term — WS2-F18); reword
  before applying. Item 4 duplicates the Architecture change ANTHROPIC-SEAM item 1 proposes.
- `LOG-DRAIN` items 1–3: accurate; item 2's drizzle range is now `0000–0029` (WS2-F28).
- `MAP-REMAP-RUNBOOK` §18: accurate; its OPEN-TASKS #33 addendum was not applied by #65 and is
  still outstanding (WS2-F64).
- `PLAN-WS-2` proposed block: **two bullets must NOT be applied** — its ruling-13 addendum
  contradicts the code and its Architecture text presumes PR-2.2-B1 has merged (WS2-F08).
- #67's proposed block: accurate at `697aea4`, and lands only if #67 merges.

## Tests

This audit ran no test of its own beyond verification. Measured, not quoted:

| Gate | Result |
|---|---|
| `npm test` at `98294c5` | **3,914 / 263 files** green (12.3 s) |
| `npm test` at `697aea4` (PR #67 tip) | **3,940 / 263** green |
| Mutations | **151**, all restored (see the mutation log) |
| `npm run typecheck` / `npm run lint` | not re-run by this audit; the pre-push gate ran both green on the register branch (`pre-push: all green`) |
| Fork integration tests | **none run** — the prompt forbids a fork for this step ("$0. No DB, no fork, no `.env.local` in this worktree") |
| Spend | **$0** |

## Rulings touched and how each is satisfied

- **Ruling 4.** The audit's central lens. No path was found by which a provider, model or effort
  outside the registry reaches `tryReserve()` or a client constructor **through the analysis
  seam**: the provider allowlist refusal precedes every site's reservation and client construction,
  spy-pinned at all five sites, and the map lock still fires on its own terms. The one live
  ruling-4 gap the audit did find is outside that seam and predates every audited PR — the
  `ASK_PIPELINE=legacy` rollback path dispatches unreserved and unmetered (WS2-F06).
- **Ruling 8.** No metering site moved. `git diff 2203150 98294c5` over the provider dispatch files
  is empty except for #59's embed rate argument and the entity-audit route's new test file.
- **Ruling 9.** Per-site degradation is unchanged and re-pinned: digest and reduce throw typed,
  `llm-match` degrades to the keyword matcher, entity-audit 503s, `/ask` degrades — including on
  the two new refusal paths (unpriced embed model → `v2-lexical-only`; unscorecarded model →
  deterministic cited-claims answer).
- **Ruling 13.** The lock predicate, its message and `MAP_BASELINE` are byte-identical to
  `2203150`; `map-prompts.ts` and `map-versions.ts` are untouched. A 112-row environment matrix
  confirmed that **no blocked configuration moves an extractor version** for the shipped
  `{openai}` allowlist. Two latent corners are recorded for the widening PR (WS2-F17, WS2-F18) and
  one pre-existing hazard is recorded as a note (WS2-F44).
- **Ruling 5.** Migration 0029 is additive, the journal is contiguous 27 → 28 → 29, each
  snapshot's `prevId` chains to the previous, and `9999_claim_source_trigger.sql` still applies
  last. The defect found is not in the migration but in the enablement order that omits applying
  it (WS2-F04).
- **Ruling 3, 10, 21.** The drain route opens no `cron_runs` row and is not a page; `unscorecarded`
  is kept distinct from `stub` and bills zero units. No gated page changed in any audited PR.

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


## Decisions needed

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **A1** (new) | Ownership of the unguarded `ASK_PIPELINE=legacy` money path (WS2-F06) — it predates every audited PR, so it is not #67's to fix | (a) file as OPEN-TASKS (next free number after #107) and fix in step 23: one hunk in `legacyAnswer` (guard → `init` → `tryReserve` → deterministic fallback on refusal → `record` after) plus a pin; (b) fix inside #67 before it merges; (c) accept as documented debt | **(a)**. It is a real ruling-4 gap, but charging it to #67 would hold a clean PR for a pre-existing defect, and the rollback path deserves its own reviewed change. |
| **A2** (new) | Whether #64 may deploy before its enablement order is corrected (WS2-F04) and its NUL/int4 hardening lands (WS2-F03) | (a) fix both, then deploy; (b) deploy the code (inert without `LOG_DRAIN_SECRET`) and fix the docs before the drain is REGISTERED | **(b)** is safe and (a) is better. The receiver cannot be reached until the operator sets the secret and creates the drain, so the merge is not the hazard — the registration is. Whichever path, the `db:migrate` step must be in the runbook before anyone registers a drain. |
| **A3** (new) | Whether the register's bounded verification (three refuters for majors, one for minors and notes) is accepted as this step's evidence | (a) accept, recorded as a stated deviation; (b) re-run full three-vote refutation on minors and notes | **(a)**. Every vote cast in this audit was a non-refutation, and step 26's final audit can re-refute anything step 23 disputes. |
| **R14** (carried, from #67's report) | Where the eval-only opt-in for the paid answer-model matrix lives, now that the scorecard gate blocks it | see `WS-2-1-AUTO-GATE-2026-09-06.md` | not this step's to decide |

## Debt and risks

- **The audit's own coverage is bounded** and the completeness critic's statement below says how.
  No Vercel or Neon access was available by design, so every "absent in every environment" claim in
  this register is taken from the reports and AGENTS.md, not verified against the platform. Step
  27's env posture listing is where that gets confirmed.
- **`.env.example` claims are unverifiable offline** — `:32` ("NONE of these are set anywhere
  today") and `:59` ("ABSENT in every environment today") are consistent with AGENTS.md but were
  not checked against Vercel.
- **The drain's missing-migration hazard is invisible to its own integration test** by
  construction: the itest applies migrations itself, so "route against an un-migrated database"
  is pinned nowhere (a consequence of WS2-F04 worth a test in step 23).
- **One flaky unit test was observed twice, unrelated to any audited PR**:
  `src/lib/evals/injection-dataset.test.ts > dataset selector > writes only its own dev result
  file…` timed out at ~5.1 s under full-suite subprocess load (vitest's 5 s default; the file takes
  ~15 s alone) and passes in isolation. Route to the eval-plane owner; it is not a #52/#61
  regression.
- **`CandidateDispatchIdentity.provider` is still `"openai" | "stub"`** (`contracts.ts:436`) even
  though #60 added a provider dimension to the analysis dispatch identity — the widening belongs
  with step 20 / PR-2.4-1, and #61's `headerIsLive` skip is keyed on that union (WS2-F49).
- **The scratch-worktree recipe has a trap worth recording**: `.gitignore`'s `node_modules/`
  pattern matches directories only, so the symlinked `node_modules` in a scratch worktree is
  untracked and a bare `git clean -fd` deletes it. Every agent that hit this recreated the symlink
  and switched to `git clean -fd -e node_modules`; a future audit should use that form from the
  start.

## Handoff

- **For step 23 (remediation).** The register above is the work list. Each finding carries a
  diff-level remediation; the majors and the minors that touch a spend path, a gate, a migration or
  a production-visible behaviour are the ones to take first. Every fix needs a test that fails on
  the pre-fix code, and the register's own reproduction is usually that test. WS2-F06 needs an
  OPEN-TASKS entry first (decision A1). WS2-F08 is a *do-not-apply* instruction for step 25, not a
  code fix.
- **For step 25 (docs sync).** The stale-standing-text list above is the complete set, with the
  overlaps named so exactly one proposal is applied per line. Two items are not optional: the
  drizzle range at `AGENTS.md:116` is wrong the moment 0029 is on `main`, and the Live/repository
  bullet's "main is code-ahead of production by two eval-plane-only PRs" is wrong by twenty PRs.
- **For step 27 (deploy).** Read the per-PR verdict column above. The only PR whose verdict is not
  "merge-stands" is #64, and its hazard is in the *enablement* sequence rather than the code: the
  receiver is inert until `LOG_DRAIN_SECRET` exists, and migration 0029 must be applied by hand
  (`npm run db:migrate` from the release clone, backup branch first) **before** any drain is
  registered.
- **For step 26 (final audit).** Everything this audit verified once rather than three times is
  marked in the register. The raw round-1 material — every finder's `verified_clean` list (255
  items), `mutation_log` (151 entries) and `coverage_notes` — is committed at
  `docs/reviews/WS-2-AUDIT-ROUND1-RAW-2026-09-06.json` so a later session can re-refute any finding
  without re-running the finders.

## Appendix — verifier notes from the batch rounds

Observations the batch verifiers recorded outside their assigned findings.


**minors #52 + #57.** ENVIRONMENTAL: the prescribed restore sequence `git checkout -- . && git clean -fd` DELETED the scratch worktree's node_modules symlink (it is untracked, so -fd removes it), which broke the next `npx vitest` run (it fell back to a fresh npx vite download and errored). I restored it as `ln -s /Users/go/code/bnow-net/node_modules node_modules` — deliberately pointing at the plain clone, not the audit worktree — and re-ran the mutation successfully. Final state of /private/tmp/.../w7: `git status --short` = `?? node_modules`, HEAD 98294c5. Suggest later agents use `git checkout -- .` alone, or `git clean -fd -e node_modules`. UNCOVERED OBSERVATIONS (no finding I verified covers these): - scripts/ask-eval-harvest.ts: `--force` bypasses BOTH the pre-flight estimate gate (:177) and the cumulative-spend stop (:210), so the documented paid pass can run with no spend brake at all; docs/evals/README.md:112 advertises `--force` without saying it removes the last brake, and OPEN-TASKS #82 / WS-2-1 R9 describe the two brakes as if they were unconditional. - scripts/ask-eval-harvest.ts:239-242 swallows a failed batch with `continue`, and :255-258 skips an empty (refused/truncated) response after metering it locally — the run then writes a partial ask-eval-set.json with no record in the file of how many batches were lost. Ruling 8's 'record before discarding' is honoured only in console output, since nothing durable is written. - src/lib/analysis/provider.ts:79-82's constant is the only copy of the refusal text in the tree, and anthropic-seam.test.ts is its only consumer; if the #83 wiring PR replaces the constant it will also silently drop the two regex pins at :116-117, because they match against the message rather than against a separate literal. - ANTHROPIC-SEAM-HARDENING-2026-09-05.md:252 anchors the AGENTS.md quote as 'AGENTS.md:26-29' while WS2-F11 and the actual file put the sentence at :27-29 — a one-line anchor drift in the step-25 proposal itself, worth fixing before step 25 applies it by line number. - No forbidden file was opened. I read only docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md, docs/reviews/WS-2-1-ASK-PARITY-2026-09-06.md, docs/reviews/WS-2-2-PROVIDER-CORE-2026-09-06.md, docs/OPEN-TASKS.md, docs/SETUP-NEXT-WEEK.md, docs/evals/README.md (prose sections only, no case JSON), AGENTS.md and the named source/test files. The audit worktree's .env.local was never read and no process other than git and plain file reads was run there.

**minors #59 + eval.** All four findings STAND at minor; none is refuted and none changes a deploy verdict. Cross-cutting observations no finding covers: (1) WS-2-1-ASK-PARITY's step-17 item 3 explicitly instructs the auditor to 'verify ... that estimateEmbedCostUsd groups as tokens * (price / 1e6)' — WS2-F14 is the answer to the report's own invitation: the pin that exists to enforce that grouping is non-discriminating, so the report points at a check it does not have. (2) WS2-F15's mut12 survives the FULL 3,914-test suite, not only the three files the finder ran — the coverage gap is wider than reported (I ran the whole suite for both F14's and F15's mutants). (3) PLAN-WS-2 §7.1 (PR-2.4-1) specifies re-pointing live-runner.ts:114's REASONING_MODEL mirror but says nothing about the pricing predicate, so F16's provider-blind `hasOwnProperty(PRICES_PER_MTOK, model)` check would survive PR-2.4-1 as currently written and be live once PR-2.2-B2/B3 land — worth writing into the step-20 prompt alongside the mirror. (4) WS-2-2-PROVIDER-CORE cites `live-runner.ts:161` for the analysisApproval call twice (:380, :433); the actual line at 98294c5 is :164 — pure line drift, no consequence. (5) src/app/api/cron/digest/route.ts contains no `embed` token at all, which makes F13's 'no cron_runs counts entry, no alert' consequence exact rather than approximate. ENVIRONMENTAL: (a) the prescribed reset `git checkout -- . && git clean -fd` DELETES the scratch worktree's node_modules SYMLINK (my first command removed it); I restored it with `ln -s /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905/node_modules node_modules` and thereafter reset with targeted `git checkout -- <file>` — later agents should use `git clean -fd -e node_modules`. (b) macOS `grep` silently matches NOTHING in src/lib/analysis/digest-persist.ts: `file` reports it as 'data' (some byte sequence defeats the UTF-8 sniff), so `grep -n embedInsertedClaimsFailOpen` returns rc=1 while `git grep` and `sed -n` both show the text at :339. Anyone verifying digest-persist by plain grep will get false 'not present' answers — use `grep -a`, `git grep`, or sed. No forbidden file was opened; the scratch worktree is restored to 98294c5 with `git status --short` showing only '?? node_modules'.

**minors #60.** All six findings STAND at minor; none refuted. Every stated reproduction reproduced exactly, including the finders' literal hash strings (:06f28eba85ce, gpt-5:44ba97563f24 / ae25f1a9d3f4, gpt-5-nano:ec1d0a2f1718 / 9e59e997c866) and failure counts (15/3899 over 8 files; m10 3; m10b 2; ack mutant 3/66 of 69; m13b 49/49 and 3914/3914; m13a 'expected 2 to be 1'). Scratch worktree restored to 98294c5 clean after every mutation; final `git status --short` shows only `?? node_modules` and baseline `npm test` is 3,914/3,914 over 263 files. ENVIRONMENTAL: the task's restore recipe `git checkout -- . && git clean -fd` DELETES the scratch worktree's node_modules symlink — .gitignore line 1 is `node_modules/` (trailing slash = directories only) and the entry is a symlink, so git reports it `?? node_modules` (untracked, not ignored) and cleans it; the next `npx vitest` then dies with "Cannot find module 'vitest/config'". I recreated it (`ln -s /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905/node_modules`) and used `git checkout -- .` plus explicit `rm` thereafter. Other verifiers following the literal recipe will hit this; recommend `git clean -fd -e node_modules`. Uncovered observations (no finding names these): - WS-2-2:137's mutant row does not just miscount ("3, incl. the extractor-version pin") — it misidentifies the killers: the third failure is the `mapModel > resolves at call time` cascade from the MAP_PROVIDER env leak, not a version pin. F20 covers the count, not the naming. - The recurrence pattern in F22 is worth recording as a lesson rather than a defect: WS-2-2:406-408 identifies "a pin that asserts only an outcome a later rung would also refuse" as the exact weakness the author found and fixed at the validation site, and the author's own arity pin at :631-639 has that shape (under the surviving default-parameter mutant the widened dispatch is caught by pricing, so the behavioural half at :638 still passes). - import-graph.test.ts:46's `from\s+` blindness for "openai" is pre-existing (control mutation 6 slipped an unspaced `from"openai"` into src/lib/ask/router.ts undetected) and is outside PR #60's scope; F21 mentions it, but any fix belongs in its own change, not a #60 follow-up. - No forbidden path was opened. Nothing was read from the audit worktree except git metadata and the named report/design/JSON files; no npm/npx/node ran there.

**minors #64 #65 standing.** All 8 findings stand at minor; none refuted, no severity changes. Uncovered observations: (1) AGENTS.md's directory map has no `src/lib/logs/` entry at all — the LOG-DRAIN report's proposed change item 1 is unapplied alongside the drizzle line F28 names. (2) AGENTS.md's decision log ends at 2026-09-04 and records no entry for any of the 18 merges in 883e5e3..98294c5 (consistent with the COMMON §4.7 write-lock deferring to step 25, but it means the append-only log currently carries no trace of the 48h window). (3) `client_secret=` survives redaction for the same word-boundary reason as the UPPER_SNAKE names — F24 lists it, and I confirmed lower-case camel/snake prefixes are affected too, not only shouty env names. (4) LOG_DRAIN_RETENTION_DAYS=1e9 is accepted and yields an `Invalid Date` cutoff whose sweep failure is swallowed by route.ts:116-118's empty catch, so an over-large retention value disables retention with no signal anywhere (adjacent to F25, whose remediation flags the clamp but not the silent-swallow interaction). Environmental note: the prescribed restore `git checkout -- . && git clean -fd` deletes the scratch worktree's `node_modules` SYMLINK, which broke the next vitest run with 'Cannot find module vitest/config'; I recreated the symlink to /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905/node_modules and used `git clean -fd -e node_modules` for the remaining restores. Final `git status --short` in the scratch worktree shows only `?? node_modules`; nothing was written in the audit worktree (git read-only plus cat/sed/awk/grep), and no forbidden file was opened.

**minors #67.** All three findings stand at minor; no refutations. Environmental note: `git clean -fd` in the scratch worktree DELETES the node_modules symlink (it is untracked), which breaks npx vitest; I restored it as a symlink to /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905/node_modules (matching the other w* worktrees) and re-verified `git status --short` shows only '?? node_modules' and that vitest runs. Later agents should use `git clean -fd -e node_modules`. Observations no finding covers: (1) ASK_ROUTER is `=== "1"` and absent in every Vercel environment, so ask_usage.route_policy is NULL for every production row — the router's whole telemetry surface, not just F31's `reason`, is currently unwritten. (2) In the gated path, `rerankModel` is stamped from `ranked.rerankUsage` and not from `rerankUsed`, so the usage-recorded composite fallbacks (unparseable rerank response, or fewer than ceil(k/2) valid ids) also persist rerank_model + rerank_cost_usd with rerank_used=false — a row shape no test pins on either side of the gate. (3) scripts/ask-eval.ts:268-271 sums embed+rerank+answer into the run's costUsd, so a gated eval question's real pre-gate spend is computed and then discarded when the sweep aborts at :425-435 — the abort message reports no cost. (4) The fidelity runner (ask-eval.ts:324) constructs `ranked = {claims, rerankUsed: false}` and never calls rerankCandidates, so any future rerank-degradation detector must be scoped to isV2Config runs. No forbidden file was opened; only the two report documents, source files, and the findings JSON were read.

**notes F34-F50.** All 17 notes verified statically at 98294c5; none refuted, none needing a severity change, no duplicates within the batch (F34/F35 are different documents, F39/F40 different claims about the same test file, F43/F44 different map-lock mechanisms, F49/F50 different halves of the resume skip). Verification constraint: the assigned scratch worktree w16 has NO node_modules (the symlink is absent), so no vitest/tsc run was possible; every verdict rests on reading the audited SHA plus git diff/log. The finder-reported mutation and probe outcomes in F40/F41/F43/F44/F46/F49/F50 were checked for mechanism, not re-executed. w16 left clean (`git status --short` empty). Uncovered observation 1: attribution.test.ts:175's line-comment arm is anchored `^[ \t]*//`, so a TRAILING `// UPDATE ask_usage` comment is not stripped and would fail the test titled "contains no write verb outside comments" — the inverse of F37's blindness, a false-positive direction no finding records. Uncovered observation 2: runner.ts:1462-1465's baseline identity line omits `provider` as well as registryVersion, so a stub-vs-live baseline/judged pairing is invisible in the scorecard too (F48 names only registryVersion). Uncovered observation 3: scripts/ask-model-attribution.ts also omits `state` from its SELECT, so degraded/refused Ask runs are invisible on two columns, not one (F36 names only `provider`). Uncovered observation 4: WS-2-2's step-17 checklist items 5, 7 and 8 are each answered by a note in this batch (F41, F45, F50 respectively) — item 7 is the only one whose stated expectation is factually wrong. No forbidden file was opened; no docs/evals/analysis/*.json, no eval-artifacts directory, no .env.local.

**notes F51-F64.** All 14 notes stand; none is a duplicate within this batch, none conceals a reachable spend, gate, data-loss or production-behaviour problem, and none is empty enough to drop. Scratch worktree hygiene: `git clean -fd` at start removed the node_modules SYMLINK the harness had placed; I recreated it (-> /Users/go/code/bnow-net-worktrees/48h-audit-ws2-20260905/node_modules) and finished with `git status --short` showing only `?? node_modules`. No file in either worktree was edited; no vitest/npm run was needed (node -e probes used only node:crypto and WHATWG URL, no repo imports). Uncovered observation 1: route.ts:44's header comment repeats the unbacked "anything else thrown -> 200, stored 0" contract that WS2-F55 finds only in LOG-DRAIN.md:293 — the mismatch exists in the code file itself, so a docs-only fix would leave it half-corrected. Uncovered observation 2: drain.ts:242 uses `int()` (drain.ts:202-204), which truncates rather than requiring an integer, so `timestamp: 1.9` normalizes to 1 and is accepted; harmless, but the "no usable timestamp" test set (drain.test.ts:239-244) has no fractional case. Uncovered observation 3: a Vercel entry whose path is only a query string ("?x=1") yields stripQuery "" and route.ts's `// null` stores requestPath NULL, so it escapes isSelfIngestion the same way a missing path does — same disclosed §7 residual class, one variant wider than the design states. Uncovered observation 4: `MAP_BACKFILL_BASE=""` (set-but-empty) defeats the `??` default at scripts/map-remap.ts:694 and yields base "" rather than production; it still refuses without an ack, so the direction is safe, but the "the default target is production" reasoning in the :200-212 comment does not hold for an empty-string export. Uncovered observation 5: the drain route reads the full body (route.ts:63) before verifying the signature (:68), so an unauthenticated caller can always force one full read plus one HMAC; bounded and deliberate (the cap is placed after the signature on purpose, :72-74), recorded only because WS2-F51 touches the same ordering from the docs side.

**notes F65-F71 (#67 + standing text).** All seven notes verified by reading at the audited SHAs; no test run, no mutation, no edit — scratch worktree w19 ends with `git status --short` showing only `?? node_modules`. Standing-text items were read from the audit worktree via `git show 98294c5:<path>` / plain grep only; no forbidden file was opened, and .env.local was never touched. Uncovered observation 1: `scorecard.date` is dead metadata — `grep -rn 'scorecard\.date' src/` returns nothing, so the enforcement gate can never notice an aged scorecard (adjacent to F69, not stated by it). Uncovered observation 2: AGENTS.md:116 @98294c5 still says "migrations 0000–0028" though drizzle/ holds 0029_runtime_logs.sql; F70's remediation implies the fix but its claim text does not cite that line. Uncovered observation 3: AGENTS.md:372-373 @98294c5 says "Production DB migrated through 0027", which the 0028/0029 landings in the tree will make wrong the moment they deploy; I could not settle production's applied-migration state read-only, so this is recorded, not asserted. Uncovered observation 4: docs/CURRENT-STATE.md:602-603 carries a stale 155/23 integration figure beside the 3,451/239 unit figure F71 cites (folded into F71's corrections). Uncovered observation 5: registry.ts:35-37's comment "absent = the model has NOT passed the Ask gate and no route may serve it" now describes enforced behaviour for the answer and rerank stages only; gpt-4o/gpt-4o-mini remain scorecard-less entries reachable by other consumers (e.g. pricing/limits), which the comment's absolute wording does not distinguish.
