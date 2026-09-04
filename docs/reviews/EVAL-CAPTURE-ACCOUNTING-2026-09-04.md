# Eval capture + interrupted-attempt accounting — implementation report (2026-09-04, PR 1 of 2)

Scope: the first of two narrowly scoped, offline, reviewed PRs authorized after the
2026-09-04 methodology adjudication packet
(`/Users/go/code/bnow-net-eval-campaign-20260903-artifacts/METHODOLOGY-ADJUDICATION-2026-09-04.md`,
§4 "Diagnostic capture — design only"). The packet is treated as reviewed evidence and
proposals, not blanket authorization.

**Untouched, by construction:** the frozen campaign worktree
`bnow-net-worktrees/eval-campaign-20260903` (detached `774906f`, `git status` clean apart
from ignored files), every original dataset/result/manifest/report/ledger artifact, the
disposable Neon branch, production, Vercel, the registry, every scorer, gate, label, corpus
and heldout row. Zero paid calls. No deploy. Work happened in a fresh worktree
`bnow-net-worktrees/eval-capture-20260904` on branch `claude/eval-capture-accounting-20260904`
from verified `origin/main` `774906f`. The 2026-09-03 campaign remains stopped: map
baseline FAIL (fidelity 14, injection rows 3), digest baseline FAIL (fidelity 6),
validation baseline insufficient_data, ledger 365 requests / ≈$0.1518, with the two
abandoned votes of `dig-c2-cap-002-fed200-rank230-dead#r2` accounted separately and NOT
backfilled into any artifact.

## 1. What was built

| piece | file | behaviour |
|---|---|---|
| Capture module | `src/lib/evals/capture.ts` (new) | Opt-in per-attempt JSONL capture. I/O-free: every fs primitive is injected (`CaptureFs`), the CLI passes `node:fs`. Config resolution with refusals; append-only sink with one file per split; secret-safe messages; readers for reconciliation (both splits, metadata only) and calibration (development only). |
| Dispatch threading | `src/lib/evals/live-runner.ts` `dispatchOnce` | Takes an optional `DispatchContext` (runId, caseId, split, repetition, voteIndex, voteCount). With capture on and no context it refuses before any reservation. Per physical attempt: `tryReserve` → `budget_stop` line on refusal → `attempt_start` line → request → on response `guard.record` FIRST (ruling 8) then `attempt_end(response)`; on error `attempt_end(error)` then the existing 429 retry / rethrow. `LiveDeps` gains `usage` (in-memory metered tokens/USD) and `capture` (sink or null). |
| Sweep orchestrator | `src/lib/evals/live-runner.ts` `runLiveSweep` (new; the CLI loop moved here) | Durable per-case persistence as before, plus: a budget stop or capture-write failure mid-case records an `abandonedAttempts` entry and folds its meter delta into the file meter, with NO result key; `provider_error` rows carry `partialUsage`; the capture-run record is stamped `incomplete` before the first dispatch and `complete` with file hashes only on a normal finish. |
| Contracts (additive) | `src/lib/evals/contracts.ts` | Optional `EvalResultsFile.abandonedAttempts[]`, `EvalResultsFile.captureRuns[]`, `EvalCaseResult.partialUsage`. Never materialized on a file that lacks them unless an entry is actually added. |
| Merge | `src/lib/evals/runner.ts` `mergeEvalResults(..., extras)` | Appends abandoned entries; upserts the capture record by runId; header immutability and `resumeIdentityMismatch` unchanged (the new fields are not identity). Capture API re-exported so the CLI's static import surface stays contracts+runner (isolation pin). |
| CLI | `scripts/analysis-eval.ts` | `--execute-live` resolves capture right after preflight (refusals exit 2 before the ledger URL is applied and before any client/DB construction), constructs the sink with the scorer source hash + git HEAD, runs `runLiveSweep`, exits 1 on abort. New `--capture-reconcile` and `--capture-inspect [--show-raw]` modes (no DB, no provider). Non-live modes print a notice when `EVAL_CAPTURE_DIR` is set and touch nothing. |
| gitignore | `.gitignore` | `docs/evals/analysis/capture/` — the default in-repo capture location is never committable. |

### Line format (v1)

- `run` — once per file: runId, workload, configKey, datasetVersion, datasetContentHash,
  the full `CandidateDispatchIdentity`, envKnobs, `scorer {module, sourceSha256}` (sha256
  of the scorer module's SOURCE at run time — no `scorerVersion` constant exists yet; that
  is contract-v3 work), git HEAD, this file's split, and whether this file may hold raw.
- `attempt_start` — caseId, split, repetition, voteIndex/voteCount, attemptIndex (0, or 1
  for the explicit 429 retry), run-wide `attemptSeq`, requested model. Written BEFORE the
  request.
- `attempt_end` — same identity + `attemptSeq`; outcome response|error; requested vs
  returned model; response id; system fingerprint; finish reason; refusal; truncated;
  usage; est USD; `metered` (true iff `guard.record` completed before this line);
  rawSha256 + rawBytes; `raw` only when authorized for the split; sanitized error.
- `budget_stop` — a reservation refusal (no attempt made): code + sanitized reason.
- `run_end` — outcome complete|aborted, reason, line count.

## 2. Guarantees (each test-pinned)

1. **Default off, byte-identical.** Absent `EVAL_CAPTURE_DIR` ⇒ `deps.capture === null` ⇒
   zero filesystem calls (in-memory fs fake records none) and the pre-existing meter
   contract holds. Production dispatch modules import nothing from `src/lib/evals`
   (`isolation.test.ts`, unchanged and green).
2. **Identity on every line** — run/config/dataset/scorer, case/repetition/vote, physical
   attempt ordinal, requested/returned model, response id, finish/refusal, usage, raw hash.
3. **Raw is separately opt-in** (`EVAL_CAPTURE_RAW=1`, development only). **Heldout raw is a
   third opt-in**: env `EVAL_CAPTURE_RAW_HELDOUT=1` AND the explicit
   `--allow-heldout-raw-capture` flag; an ack without the env, or the env without
   development raw, refuses. The sink additionally forces `raw: null` on heldout lines
   whenever the config does not authorize it. When raw is off, heldout lines still carry
   the full accounting metadata and the sha256, so reconciliation never depends on raw.
4. **Separate artifacts + calibration refusal.** `<runId>.dev.jsonl` vs
   `<runId>.heldout.jsonl`; the dev file never names a heldout case. The calibration
   reader refuses by file name, by declared split in the run line, and by any
   heldout-split line — a renamed or relabelled file cannot slip through.
5. **Local, restricted, secret-free.** In-repo dirs must be gitignored (refused otherwise,
   checked via `git check-ignore`); dir created 0700 and refused when group/other bits are
   set; files 0600; a runId is never reused. The exact API key / eval DB URL / unpooled DB
   URL strings and common credential shapes (`sk-…`, bearer tokens, URL userinfo,
   `api_key=`) are redacted from every message that lands in a line, an abandoned record,
   or a provider_error row.
6. **Interrupted multi-vote history is preserved without inventing a result.** The
   campaign's exact shape is a test: `runRequestCap=2` on a 5-vote digest case ⇒ two votes
   metered, third refused ⇒ `abandonedAttempts[0] = {responsesReceived: 2, voteCount: 5,
   meter: {2,2,2,0}, tokens, USD}`, file meter 2/2/2/0, `results == {}`, `budget_stop` line
   names vote 2/5, `pendingWork` lists the case again, and a resumed sweep under a new
   runId completes only the pending case (completed keys are never re-dispatched) while the
   abandoned entry and the first run's `incomplete` capture record are retained.
7. **Capture failure stops dispatch while retaining evidence.** Failure on `attempt_start`
   aborts before the request (nothing reserved-counted, nothing billed). Failure on
   `attempt_end` surfaces `CaptureWriteError{responseMetered: true}` — the ordering
   `guard.record` → capture write is pinned by a shared call log — and the sweep records the
   metered call as abandoned (`capture_write_failure`), persists, finishes the capture as
   `aborted`, and dispatches nothing further.
8. **Separate reconciliation classes.** Reservations (attempts + budget stops), physical
   attempts (`attempt_start`), responses, errored attempts, metered (`metered:true`),
   unresolved (start without end), budget stops, and per-case dispositions completed /
   provider_error / abandoned / orphan. Every discrepancy is printed; none is resolved
   automatically. Capture-line count is documented as NOT equal to
   `provider_usage.requests`.
9. **Historical compatibility.** A committed pre-accounting results file round-trips
   through `mergeEvalResults` byte-identically (same key set, same rows, same meter); the
   2026-09-03 campaign header shape (meter 240/240/240/0, no new fields) is accepted
   verbatim and gains fields only when an entry is actually appended; the campaign's two
   abandoned votes are never backfilled. `resumeIdentityMismatch` ignores the new fields.
   `--capture-reconcile` on such a file prints "has no abandonedAttempts field … the ledger
   is the only witness".

## 3. Remaining limitations — the crash window, stated plainly

No atomicity exists, and none is claimed, between (a) the provider accepting and billing a
request, (b) `SpendGuard.record` writing `provider_usage`, and (c) the capture line. They
are sequential. Concretely:

| crash point | provider | ledger | capture | how it shows |
|---|---|---|---|---|
| after `attempt_start`, before the response | maybe billed (request may or may not have reached the provider) | no | start only | `unresolved` |
| after the response, before `guard.record` completes | billed | no | start only | `unresolved` — the ONE case where the ledger under-counts |
| after `guard.record`, before `attempt_end` | billed | yes | start only | `unresolved` — the ledger is authoritative; capture under-counts |
| process killed between cases | — | complete | complete for finished attempts; no `run_end` | "no run_end line"; the interrupted case is an `orphan` if it had attempts and no durable record (only a kill/crash can produce an orphan; budget stops and capture failures produce `abandoned`) |

Therefore: `Σ metered (capture)` ≤ `provider_usage.requests` ≤ `Σ attempts (capture)` is the
expected relation for a fully captured run, with equality on both sides only when there are
no errored and no unresolved attempts. The reconciliation tool states the ledger comparison
for the operator to perform; it reads no database (OPEN-TASKS #107).

Other limits: capture exists only for runs from this runner onward (the 2026-09-03 campaign
has none — its raw outputs remain unrecoverable, as the packet records); the scorer
identity is a source hash, not a semantic version (contract-v3 work); `--capture-inspect
--show-raw` prints raw development output to the terminal, which is the intended
calibration channel and nothing else.

## 4. Tests (deterministic; all mocked; zero provider/DB/real-fs contact)

New files: `src/lib/evals/capture.test.ts` (17), `src/lib/evals/live-sweep.test.ts` (18);
extended: `src/lib/evals/hardening-cli.test.ts` (+3 subprocess pins). Required coverage →
test:

| requirement | test |
|---|---|
| capture disabled | live-sweep "capture disabled: no filesystem call of any kind…"; runLiveSweep "without capture … no captureRuns/abandonedAttempts field" |
| successful responses | "a successful response writes start+end with model/response identity…" (also pins `guard.record` → `attempt_end` order) |
| refusals/truncation | "raw content is captured only with rawDevelopment; refusal and truncation are recorded as returned" |
| retry and provider errors | "a 429 retry is two physical attempts…"; "a non-429 provider error writes an error end line and rethrows…"; sweep "a provider error records a provider_error row carrying the case's partial metered usage…" |
| capture-write failure | dispatch "…on attempt_start aborts BEFORE dispatch"; "…AFTER a response surfaces with responseMetered:true"; sweep "capture write failure mid-run stops further dispatch and records the metered call as abandoned evidence"; capture.test sink "a write failure surfaces as CaptureWriteError…" |
| cap stop during a multi-vote case | sweep "cap stop during a multi-vote digest case…" |
| interrupted-run recovery | sweep "interrupted-run recovery: a resumed sweep completes the abandoned case under a new runId…" |
| heldout isolation | capture.test sink "heldout goes to a separate file with raw forced off", "heldout raw appears only with the explicit config", calibration refusals; sweep "heldout isolation in the sweep…"; CLI "--capture-inspect refuses a heldout capture file by name" |
| secret-safe error reporting | capture.test `sanitizeMessage`; dispatch "non-429 provider error … message is secret-safe"; sweep provider_error row redaction; CaptureWriteError message redaction |
| historical artifact compatibility | live-sweep "a committed pre-accounting results file round-trips…"; "the 2026-09-03 campaign header shape … accepted verbatim"; capture.test reconcile "historical results file … never rewritten" |
| config refusals / live-only | capture.test `resolveCaptureConfig` (7 cases); CLI "non-live mode … creates NOTHING"; CLI "--execute-live with an un-ignored in-repo EVAL_CAPTURE_DIR refuses AFTER preflight but BEFORE any client construction or DB use" |

Gates on the branch tip: `npm run typecheck` clean · `npm run lint` 0 errors (3
pre-existing warnings) · `npm test` **3,590 / 3,590 (246 files)**. Baseline measured on
`origin/main` `774906f` in a scratch worktree the same day: 3,552 / 244. This PR adds 38
tests: two new files (capture.test.ts 17, live-sweep.test.ts 18) and 3 subprocess pins in
hardening-cli.test.ts.

## 5. Methodology boundaries honoured

- No global `required=true` hard gate; no scorer/gate change of any kind (score-*.ts and
  gates.ts untouched — the scorer source hash in every `run` line will witness that).
- The "increased" vs "active" val-typ-005 label is NOT changed; OPEN-TASKS #105 records it
  as requiring semantic adjudication.
- No blanket exclusion of offline `expectation=fail` fixtures.
- Injection failures retained as an unresolved evaluation safety finding (#106); not a
  scorer defect; no confirmed production incident is claimed.

## 6. Independent review

Recorded in §7 below after the review round; the PR merges only after CI and a
reviewed-tree comparison (merge tree ≡ reviewed branch tip).

## 7. Review round and merge record

_(filled in at merge)_
