# Step 10 — Operator runs (Wave 2, human)

| | |
|---|---|
| Who | Operator, native Mac terminal in `/Users/go/code/bnow-net` on `main` after Checkpoint 1 merges |
| Window | H8 → H10 |
| Depends on | 03 (runbook merged), 07 (dataset PR merged), decisions O2, D6 recorded |
| Spend | #79: $0 (network only). WS-1.1 run: ≈18 map calls ≈$0.01 under D6's campaign-local cap. |
| Record | Decision-log entries per the runbooks; `docs/reviews/EVAL-EXPOSURE-LEDGER.md` entry; program log line |

No agent runs this step. It exists so the program has one place that says what only the
operator may do in Wave 2, in what order, and what evidence each action leaves.

1. **Sign the drafts.** Copy the signed entries from
   `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md` (step 01) into AGENTS.md's decision log
   (append at end of file until step 15 lands). At minimum: PR #46 merge record; step-1A
   execution + step-1 authorization; D1, D2, D5, D6, D8, D9, D11, D12, E1, E3, R5; the program
   entry.
2. **#79 RU citation drain** — follow `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`
   exactly: preflight SELECT → Neon backup branch → `--dry` → drain → `--retry-failed` if
   needed → `registry-materialize` → verify → decision-log entry with counts. Keep the backup
   branch until the entry is written, then delete it and say so.
3. **WS-1.1 ×3 capture run** — the run card in `docs/reviews/INJECTION-CASES-DEV-2026-09-05.md`:
   `--estimate` first; `EVAL_DATABASE_URL` = the kept disposable branch (never production;
   `--db-ack` its host); `EVAL_CAPTURE_DIR` outside the repo, `EVAL_CAPTURE_RAW=1`
   (development split only; heldout raw stays off); campaign-local `LLM_SPRINT_USD_CAP` per D6 ($0.50–$2.00 authorized; the run card recommends the value and the closeout explains its effect — the kept branch's `openai_eval` ledger already holds ≈$0.15 that counts against it);
   run; `--capture-reconcile`; append the ledger entry; do not read the results file for
   verdicts (scope `dev` cannot verdict) — record counts only. Decision-log entry.
4. **Neon key** — if the Wave-0 probe was skipped, do it now; tell step 25 the result.
5. **PR #48** — if D1 = remove: on the PR branch, `git rm docs/OUTREACH-ROSTER-2026-08-23.md`,
   amend the PR description, merge. The file's content stays in the branch history only
   until the branch is deleted; say in the log entry that the roster now lives in operator
   notes outside git.
6. Append the Checkpoint-1 program-log line (INDEX §10).

Evidence expected by step 25: the two decision-log entries, the ledger entry, and the counts.
