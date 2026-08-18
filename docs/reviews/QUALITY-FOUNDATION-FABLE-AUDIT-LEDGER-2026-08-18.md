# Quality-foundation independent final audit — evidence ledger (2026-08-18)

Companion to `QUALITY-FOUNDATION-FABLE-FINAL-AUDIT-2026-08-18.md`. This file records
the exact commands, environments, and raw results of the audit's own verification
runs. Every row was executed by the auditing session against the FROZEN immutable
target unless a later section says otherwise.

## 0. Audit identity

- Auditing session model/effort: `claude-fable-5`, effort `xhigh` (UI label
  "ultracode"; `/effort` output: "xhigh + dynamic workflow orchestration");
  large-context session (harness-reported session budget 15M tokens).
- Audit date: 2026-08-18.
- Audit worktree: `/Users/go/code/bnow-net-worktrees/quality-foundation-final-audit-20260818`,
  branch `codex/quality-foundation-final-audit-20260818`.
- Immutable target: `QF_SOURCE_BRANCH=codex/quality-foundation-integration-20260817`,
  `QF_AUDIT_TARGET_SHA=7150b494d1399dddada6e7f917b1c0e76114d458` (the branch resolved to
  exactly the observed `7150b49`; zero additional commits; branch did not advance during
  the audit).
- Node used for all gates: Zed-bundled node v24.11.0 (`~/Library/Application
  Support/Zed/node/node-v24.11.0-darwin-arm64/bin`) — the only node on this machine.
  (The QF program's own gates recorded Node v24.14.0 on a different box; version skew
  noted, all gates green under both.)

## 1. Ref resolution and graph verification (read-only)

| Check | Command essence | Result |
|---|---|---|
| Branch tip | `git rev-parse codex/quality-foundation-integration-20260817` | `7150b494d1399dddada6e7f917b1c0e76114d458` — equals observed `7150b49` |
| origin/main | `git rev-parse origin/main` | `9c5e9cb162b0e81202eef1fe2fcb4eea7d27164a` (unmoved) |
| e5757ea ∈ 7150b49 | `git merge-base --is-ancestor` | YES; `e5757ea..7150b49` is exactly ONE commit (the verdict-record docs commit) |
| 05fdd2c parents | `git log -1 --format=%p 05fdd2c` | `9c5e9cb` + `0e469f7` — matches claimed integration-base merge |
| A merge `eee6a91` | parents | `846afcf` + `74d0f40` |
| B merge `b4b0299` | parents | `eee6a91` + `c40060e` |
| C merge `fa81c1b` | parents | `c7ed40f` + `ce3c985` (A→B→C order holds in the graph) |
| Feature forks | `git merge-base 05fdd2c <tip>` | all three = `05fdd2c` exactly (created from the integration base) |
| Worktree branch tips | `git rev-parse` A/B/C branches | `74d0f40` / `c40060e` / `ce3c985` — match report §2 |
| Conflict descendant | `git merge-base --is-ancestor 7150b49 a2ddca8` | YES — the conflict branch contains the exact QF tree (as of audit start) |
| No pushes | `git for-each-ref refs/remotes/origin` | no QF/evidence/map-reliability/analysis-eval ref on origin |
| QF worktrees clean | `git -C <wt> status --porcelain` ×4 | 0 lines each (integration, A, B, C) |
| `.env.local` in worktrees | ls ×5 | absent everywhere (incl. audit worktree) |

## 2. Evidence package verification

- `/Users/go/code/bnow-net-audit-evidence-20260818/MANIFEST.sha256`: **26/26 files verify OK**
  (`shasum -a 256 -c`, zero failures).
- Package reviewer transcripts are the CONFLICT program's reviewers (final targets
  `b8341e9`/`6b35622`/`a2ddca8`; models predominantly `claude-opus-5` per
  `provenance/agent-provenance.json`). **None of the QF program's own reviewers (A4,
  B×2, C×2, D, final safety/ops, final quality/science on `e5757ea`) are preserved in
  the package.**

## 3. Governing prompt preservation (mandatory attack 1)

- `/Users/go/code/bnow-net/docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`:
  760 lines, SHA-256 `7a556210e1ebbdcea964982c922c957b4cb64555e2fb10cf08a70261f33e6fcc`.
- `git log --all -- 'docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md'` → EMPTY:
  the governing prompt exists in NO git ref. `docs/prompts/` is not gitignored;
  24+ sibling prompts are tracked; AGENTS.md's decision-log entry cites the prompt as a
  repo path. Precedent: the CONFLICT program's Gate-0 review remediated this same class
  of defect for itself (`f7127e2` "commit the prompt").

## 4. Exact-tip delta verification (mandatory attack 2)

- `git diff e5757ea..7150b49 -- ':!*.md' ':!.env.example'` → **0 lines** (the tip
  commit's own claim reproduced byte-exactly).
- Files touched by `7150b49`: `.env.example` (+13 commented eval-cap lines), `AGENTS.md`
  (decision-log entry relocation — extracted old vs new entry text: **verbatim
  identical**), integration report (§2 final-reviewed-SHA row + §12 verdict rows + §13
  residual additions).
- Materiality: no runtime file, no test, no schema. `.env.example` additions document
  envs the code at `e5757ea` already read (`EVAL_USD_CAP_DAILY` etc. in
  `assertLivePreflight`/`eval-guard.ts`); comments only, no behavior.

## 5. NUL-byte scan reproduction (mandatory attack 3)

- Byte-accurate perl scan over every `.ts`/`.tsx` changed in `05fdd2c..7150b49`:
  exactly ONE file carries a literal 0x00 — `src/lib/analysis/digest-persist.ts:286`
  (`` `${kind}\x00${ck}` ``), in a file the program changed (+48/−5).
- The byte is **pre-existing**: present at `origin/main` `9c5e9cb`
  (`digest-persist.ts:243`, identical code). NOT introduced by QF.
- `map-worker.ts`: 2 NUL lines at `origin/main` → 0 at the tip (commit `c40060e`
  escape-only fix, made precisely because a NUL makes grep treat the file as binary and
  silently skip it in source scans).
- Verdict on the report claim "zero NUL bytes in changed .ts files" (integration report
  §11): **FALSE as stated.** Most plausible mechanism: the scan itself used grep, which
  silently skipped the NUL-carrying file as binary — the same failure mode the program
  documented for map-worker.ts. The byte is a working separator, not a runtime defect;
  its real significance is scan-integrity (grep-based source scans silently skip
  `digest-persist.ts`).

## 6. Full gates on the UNCHANGED immutable target (Phase 3)

Environment for all rows: audit worktree at `7150b49`, `npm install` (778 packages),
paid keys blanked where applicable, no `.env.local` present.

| # | Gate | Command / environment | Result |
|---|---|---|---|
| 1 | Clean worktree | `git status --porcelain` | clean (before audit deliverables were added) |
| 2 | Whitespace | `git diff --check` | clean, exit 0 |
| 3 | Conflict markers | `git grep -nE '^(<{7}|>{7}|={7})( |$)'` | none |
| 4 | NUL scan | perl byte scan (see §5) | 1 pre-existing NUL, scope stated honestly |
| 5 | Typecheck | `npm run typecheck` | clean |
| 6 | Lint | `npm run lint` | clean (0 errors, 0 warnings) |
| 7 | Unit suite | `npm test` | **2,402 passed / 2,402 (185 files)** — exact match to the report claim; includes every targeted A/B/C unit test file and the in-suite source scans (`openai-client.test.ts`, `isolation.test.ts`, `map-worker-spend.test.ts`, `llm-match-guard.test.ts`) |
| 8 | Production build | `DATABASE_URL=postgresql://build:build@localhost:5432/build LLM_DISABLE=1` + blanked `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`X_API_KEY`/`OPENSANCTIONS_API_KEY`/`POSTMARK_SERVER_TOKEN`/`NEON_API_KEY`, `npm run build` | **PASS (exit 0)** |
| 9 | Integration suite | `npm run test:integration` with inline `NEON_API_KEY`/`NEON_PROJECT_ID` (read inline from the operator checkout env file, never copied), paid keys blanked, `LLM_DISABLE=1` | **119 passed / 119 (19 files)** on disposable Neon branch `br-aged-river-atcvvwhl` — created and deleted by the harness (deletion confirmed in the log). Includes map-lease concurrency/takeover/metered-then-discarded and remap eligibility/resume cases |
| 10 | `--validate-dataset` | no DB/key env | OK: map 18 / reduce 14 / digest 10 / validation 14, heldout-per-partition printed, exit 0, nothing written |
| 11 | `--estimate` | no DB/key env, `--model gpt-5-mini --repetitions 2` | plan printed, grand total $0.4716, "no DB connection, no client construction", exit 0 |
| 12 | Offline golden identity | scratch worktree at same SHA: `--offline` (resume path) | **byte-identical** — zero tracked-file changes |
| 13 | `--fresh` re-roll identity | scratch worktree: `--offline --fresh` | only the `updatedAt` header line differs in each of the 4 results files; every score byte-identical; restored via `git checkout --` |
| 14 | `--report` identity | scratch worktree: `--report` | only `generatedAt` differs in md+json; verdicts render map FAIL-by-design / others insufficient_data as committed; restored |
| 15 | Live refusal R1 | `--execute-live`, nothing set | REFUSED pre-client: EVAL_DATABASE_URL not set (exit 2 verified on the R4b–R9 reruns; R1–R3/R6 text identical shape) |
| 16 | R2/R3 db-ack | unroutable `EVAL_DATABASE_URL`, missing/wrong `--db-ack` | REFUSED pre-client: exact-host acknowledgement required (`127.0.0.1:1`) |
| 17 | R4b no key | ack correct, no `OPENAI_API_KEY` | REFUSED pre-client, **exit 2** |
| 18 | R5b caps unset | fake key, no caps | REFUSED pre-client: `LLM_SPRINT_USD_CAP` fail-closed, **exit 2** |
| 19 | R6 kill-switch | caps set, `LLM_DISABLE=1` | REFUSED pre-client, kill-switch honored |
| 20 | R8 unpriced model | `--model not-a-real-model` | REFUSED pre-client: "refusing to dispatch unpriced, even for evaluation", **exit 2** |
| 21 | R9 invalid effort | `--effort bogus` | REFUSED pre-client: allowlist printed, **exit 2** |
| 22 | R10 hard network kill | full valid preflight (fake key, caps, exact ack) + unroutable eval DSN + `OPENAI_BASE_URL=http://127.0.0.1:9/v1` | preflight passes → `SpendGuard.init` contacts the ACKNOWLEDGED eval host FIRST and aborts on the unroutable DSN (exit 1). OpenAI endpoint never contacted; zero tracked-file changes; zero `live-*` artifacts |
| 23 | Funnel refusal | `quality-funnel-report.ts --theater ir --from 2026-08-16`, no `DATABASE_URL` | clean error, exit 1, no client construction |
| 24 | Routing inspector | `model-routing-inspect.ts`, no DB | matrix: all five workloads gpt-4o-mini/default/approved=baseline/ok; Ask models reported read-only; exit 0 |
| 25 | Secret scan | perl over the full program diff (`sk-…`/`npg_…` patterns) | zero hits; committed env files = `.env.example` only; zero `results/live-*` artifacts tracked |

`NOT RUN`: none — every gate in the audit prompt's Phase-3 list executed. (The
integration suite ran once, not twice; the map itests manage their own LLM env per the
harness design.)

## 7. Post-gate audit actions

- Two fresh exact-SHA reviewer worktrees created at `7150b49` (detached):
  `qf-audit-reviewer-safety-20260818`, `qf-audit-reviewer-science-20260818`.
- One scratch worktree (CLI smokes) under the session scratchpad; restored clean after
  every artifact-writing smoke.
- Twelve targeted attack/reconstruction agents ran against the frozen audit worktree
  (read-only discipline). Their results are dispositioned in the final audit report and
  finding register.

(Sections above are frozen evidence; the final report interprets them.)
