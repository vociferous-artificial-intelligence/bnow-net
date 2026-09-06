# Evaluation exposure ledger

Append-only: add dated session entries; never rewrite an earlier entry. Execution of
checks is distinct from reading their inputs. A program date in an artifact name is
not evidence of the actual authorship date.

## Prior history — pointer recorded 2026-09-06

[CORPUS-V2-ADMISSION-2026-09-03.md §3](CORPUS-V2-ADMISSION-2026-09-03.md#3-heldout-freeze)
contains the prior exposure history (the permitted passage is lines 95–108). That
history belongs to its authors, not to this session. Only that passage was opened;
no heldout content or case identities were copied into this ledger.

## 2026-09-06 — ws1-injection-20260906 — step 07 / WS-1.1

- **Session/author:** fresh API assistant session in
  `/Users/go/code/bnow-net-worktrees/48h-ws1-injection-20260905`, operator-designated
  **Astra** author role under INDEX D9. Runtime identity disclosed to this session:
  Codex, GPT-6-based assistant; the exact serving model identifier is not exposed.
  No separate paid authoring API call or delegated author was used.
- **Prompt:** `docs/prompts/2026-09-05-48h-07-injection-cases.md` plus COMMON.
  Actual drafting date **2026-09-06**; the requested `authored-2026-09-05` provenance
  denotes the program cohort and also explicitly records the actual drafting date.
- **Branch/base:** `48h/ws1-injection-20260905-injection-cases` from
  `dff58f25009da8e3dd8f759c4a5b563c2bb4dc96` (`origin/main` after fetch).
- **Written authorization:** INDEX §2 E1/E3 operator answers in
  `4e5b00f97daaf86423b5177da912643555b706e8`, explicitly confirmed by the user in this
  session as authorization for `docs/evals/analysis/map-inj-dev-v1.json` and this
  ledger. The step prompt also authorizes its one committed offline-results file.
  No missing decision-log transcription was treated as a new permission requirement.
- **Heldout IDs seen:** **none**. No heldout case content or live failure string seen.
- **Raw-capture flags:** `EVAL_CAPTURE_DIR`, `EVAL_CAPTURE_RAW`,
  `EVAL_CAPTURE_RAW_HELDOUT` were verified unset-or-empty after loading CLI env.
  No heldout raw acknowledgement supplied. Every command was offline, an estimate,
  or a credential-free refusal test. The synthetic reconciliation test sets only a
  temporary `EVAL_CAPTURE_DIR`; development and heldout raw remain blank.

### Exact files read

Governance files (required by COMMON):

- `AGENTS.md` (initial whole-file tool read was output-truncated; standing rulings
  and operating protocol were then read at their specific ranges).
- `CLAUDE.md`.
- `docs/prompts/2026-09-05-48h-COMMON.md`.
- `docs/prompts/2026-09-05-cto-roadmap-handoff.md` (initial tool output truncated).
- `docs/prompts/2026-09-05-48h-00-INDEX.md` (§§1–2 and authorization diff at `4e5b00f`).
- `docs/prompts/2026-09-05-48h-07-injection-cases.md` (first read from the operator's
  specified main-checkout path; edits/tests/commits stayed in the named worktree).

Permitted implementation/context files (only these existing files were opened):

- `src/lib/evals/contracts.ts` — map/base/capacity/dataset contracts and validator.
- `src/lib/evals/score-map.ts` — lines 240–251 and 342–363 only.
- `src/lib/evals/runner.ts` — requested aggregation/selection ranges, plus corrected
  prompt-building, scope, offline-scoring and export locations used by the new tests.
- `src/lib/evals/gates.ts` — hard counter/threshold, completeness and verdict symbols.
- `scripts/analysis-eval.ts` — requested ranges plus moved/related CLI mode, selector,
  results I/O, capture-reconciliation and entry-point code necessary for the edit.
- `scripts/evals/corpus-v2/check-regen.sh` — shell only.
- `scripts/evals/corpus-v2/run-admit.ts` — lines 1–21 only.
- `src/lib/evals/capacity-fidelity.test.ts` — lines 141–166 and the added line's diff.
- `src/lib/evals/contracts.test.ts` — full file; tests refer to frozen files but no
  frozen case content or heldout ID is embedded in the read test source.
- `docs/reviews/CORPUS-V2-ADMISSION-2026-09-03.md` — lines 95–108 only.
- `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md` — lines 11–29, 47–51, 59–67 only.
- `docs/reviews/EVAL-CAPTURE-ACCOUNTING-2026-09-04.md` — lines 23–98 only.
- `docs/OPEN-TASKS.md` — #106, lines 1658–1667 only.
- `src/lib/analysis/map-prompts.ts` — lines 108–114 and 242–266 only.
- `docs/evals/analysis/map-v2.json` — **filtered development/adversarial output only**,
  through the exact authorized command below; never opened directly.

New/own outputs read: `docs/evals/analysis/map-inj-dev-v1.json`,
`docs/evals/analysis/results/map-inj-dev-v1-offline-fixtures.json`,
`src/lib/evals/injection-dataset.test.ts`, this ledger,
`docs/reviews/INJECTION-CASES-DEV-2026-09-05.md`, this session's appended
`docs/PROGRESS.md` block/diff, `/tmp/author-map-inj-dev-v1.cjs`, and this session's
install/typecheck/lint/test logs. Test-created temporary roots contain only the new
development dataset, its offline results/report, and synthetic development metadata.
The CLI test's `scripts/env.ts` is an empty stub; no production env file is loaded
there. Test source symlinks are executed, not opened to inspect heldout data.

### Files explicitly NOT read

- `scripts/evals/corpus-v2/build-draft.py` (any line).
- `src/lib/evals/corpus-v2-admit.ts`.
- `docs/evals/analysis/corpus-c2/*`.
- `docs/evals/analysis/map-v2.json` directly, or any unfiltered frozen dataset.
- `docs/evals/analysis/results/live-*.json` (any file, including old campaigns).
- `RECONCILIATION-KEY.json`, `AI-DIAGNOSTIC-ANALYSIS.md`.
- Anything under `/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/`,
  `/Users/go/code/bnow-net-eval-campaign-20260903-artifacts/`, or the frozen worktree
  `/Users/go/code/bnow-net-worktrees/eval-campaign-20260903/`.
- Any other heldout-split case content. No provider response or capture from a real
  evaluation campaign was inspected. Env secret values were not printed.

### Commands run against dataset files

Exact command forms are recorded below; repetitions are retries/no-op verification,
not new evaluation campaigns. Programmatic execution by tests/regen is not an author
read of its frozen inputs. Full-suite logs were redirected and only pass/fail counts
and non-content diagnostics inspected. The one case-detail failure log inspected
was the new development-only test's synthetic report.

```sh
node -e 'const d=require("./docs/evals/analysis/map-v2.json");for(const c of d.cases.filter(c=>c.split==="development"&&c.partition==="adversarial"))console.log(JSON.stringify(c,null,1))'
node /tmp/author-map-inj-dev-v1.cjs
npx tsx scripts/analysis-eval.ts --validate-dataset --dataset map-inj-dev-v1
npx tsx scripts/analysis-eval.ts --offline --workload map --dataset map-inj-dev-v1
npx tsx scripts/analysis-eval.ts --offline --workload map --dataset map-inj-dev-v1 --fresh --fresh-ack map-inj-dev-v1
rm docs/evals/analysis/results/map-inj-dev-v1-offline-fixtures.json
npx tsx scripts/analysis-eval.ts --offline --workload map --dataset map-inj-dev-v1
npx tsx scripts/analysis-eval.ts --estimate --workload map --model gpt-4o-mini --dataset map-inj-dev-v1 --dev --repetitions 3
npx tsx scripts/analysis-eval.ts --estimate --workload map --model gpt-4o-mini --dataset map-inj-dev-v1 --dev --repetitions 3 --capacity map-depth-full
bash scripts/evals/corpus-v2/check-regen.sh > /tmp/check-regen.out 2>&1
grep -E "PASSED|matches|FAIL" /tmp/check-regen.out
```

The `--fresh-ack` command refused (correct required acknowledgement was
`map/offline-fixtures`); it changed nothing. Only the new, uncommitted results file
was then removed and rebuilt after splitting case 006's report/denial into atomic
claims during author self-review. No existing dataset/result was removed or edited.
The temporary author script writes ONLY the new dataset from literal synthetic
content; it never imports a frozen dataset. It ran twice during initial drafting.

**Regeneration execution note:** `check-regen.sh` executed `build-draft.py` and
`run-admit.ts`/the admission module in temporary directories, without exposing their
source or generated case contents. Only the prescribed grep output was read:

```text
draft regeneration matches the preserved-originals manifest.
corpus-v2 regeneration proof PASSED (drafts + fragments + v2 datasets byte-exact).
```

Test entry commands (all execute fixture machinery; no real provider dispatch):

```sh
npm test > /tmp/injection-baseline-tests.out 2>&1
npx vitest run src/lib/evals/injection-dataset.test.ts src/lib/evals/contracts.test.ts > /tmp/injection-targeted-tests.out 2>&1
npx vitest run src/lib/evals/injection-dataset.test.ts -t 'validates only' > /tmp/injection-cli-debug.out 2>&1
npx vitest run src/lib/evals/injection-dataset.test.ts -t 'reconciliation' > /tmp/injection-reconcile-test.out 2>&1
npm test > /tmp/injection-final-tests.out 2>&1
```

The exact nested subprocess vectors are committed in
`src/lib/evals/injection-dataset.test.ts`: fourteen early-refusal vectors; selected
validation; missing-default-file witness; selected offline generation and no-op
resume; selected `--only` for new case 001; report to a temporary path; estimates at
baseline/full depth; and reconciliation of one fabricated development metadata row
belonging to a different dataset. The test creates a private `inj-selector-*` root
with only the new dataset; its default-file witness cannot open `map-v2.json`.
These tests run inside the unit suite and the pre-push hook as well.

Additional `node -` commands used only the new dataset/results: (1) SHA-256 of
`JSON.stringify(c)` for each of its six cases; (2) SHA-256 of revised case 006 and the
new dataset file bytes; (3) JSON summary of dataset name/count, results scope/count,
meter/identity and per-doc content lengths. No frozen input was opened by these
commands. A `tsx -e` check imported `scripts/env` and printed only the
set/unset-or-empty status of the three capture flags named above. `git diff --stat`
/ `--name-status` / `--check` and the staged secret scan inspect only changed paths.

### Outcome

Six provisional synthetic development/adversarial map cases; no overlap with the
default map population. Three failing fixtures hit the unchanged injection matcher,
three resisting fixtures pass: **6/6 machinery matches**, valid schemas throughout.
Scope is **dev**, meter is **0/0/0/0**, spend **$0**. Baseline delivers five payloads;
the sixth is at U16 4,888/5,053 and is delivered only at `map-depth-full`. A clipped
deep-tail live pass must never be reported as resistance. E2 is design-only in the
closing report. No heldout exposure incident occurred.

### 2026-09-06 22:37Z — same-session resumption and verification correction

Resumed after a rate-limit interruption with the same context and exposure boundary;
no author reset or new author is claimed. Repeated typecheck/lint/unit commands above.
A proposed addition to the frozen capacity matrix's test table failed its existing
matrix-shape assertion. Its failure contents were not opened. Removed only that new
table entry and added an independent committed-supplement identity/whole-checks test
in `injection-dataset.test.ts`; the existing capacity test file is now byte-unchanged.
No dataset or scorer revision resulted. The earlier prior-history link's fragment
was not independently verified; the reliable pointer is the
[admission report](CORPUS-V2-ADMISSION-2026-09-03.md), §3, permitted lines 95–108.

### 2026-09-06 — final local proof

Same-session final gate: 3,639 tests / 248 files PASS, typecheck PASS, lint zero errors
(three warnings in untouched files). Repeated the listed selected validate/offline
commands (no-op resume) and prescribed redirected regeneration command/grep: PASS.
The new independent test also reads only the new committed offline result and
compares its identity, whole checks and output digests to recomputed fixture results.
The final staged path audit and secret scan include only this step's eight files;
only the new dataset and its new offline result are under `docs/evals/analysis/`.
No additional heldout exposure or paid call occurred.

### 2026-09-06 — review handoff

Implementation committed as `02eeeafd5006f63891dab73ccfd1eb58a58fefa8`, pushed after
its enforced typecheck/lint/3,639-test pre-push gate, and opened as
[PR #58](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/58).
A final `node -` command read only the new dataset bytes/new offline results and
asserted `datasetContentHash` equals their SHA-256:
`c531e300d98f6e7a3b6f3305aee5177268462207ea94431a5a1e8d9ee29ef1aa`.
The report's PR-link-only follow-up changes no evaluation semantics. No merge,
deployment, paid capture, external message or heldout read was performed.
