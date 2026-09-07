# Stage 2 — operator runs, the unblocking stage (2026-09-07)

| | |
|---|---|
| Who | **Operator**, native Mac terminal in `/Users/go/code/bnow-net` on `main`. Items 1 and 3 may be delegated to an attended session; items 2, 4, 5 may not. |
| Authority | CP4 plan `docs/prompts/2026-09-07-48h-CP4-and-completion-plan.md` §5.2; step 10 (`2026-09-05-48h-10-operator-runs.md`) items 2, 3, 5; COMMON `2026-09-05-48h-COMMON.md` §4.9–§4.11 |
| Window | ~1.5 h wall clock; ~35 min of it is politeFetch spacing you wait through, not work |
| Spend | Item 2 **$0** · item 3 **$0** · item 4 **≈$0.01** against a $2.00 campaign-local cap · items 1, 5 **$0** |
| Blocks | item 1 → step 20/20b · item 3 → step 24 · items 2 + 4 → step 25's evidence · item 5 → the CP4 freeze |
| Record | `AGENTS.md` `## Decision log` (items 1, 2, 5) · `docs/reviews/EVAL-EXPOSURE-LEDGER.md` (item 4) · two probe outputs pasted into step 24's prompt (item 3) |

This file is the detail the CP4 plan's five-bullet §5.2 compresses. Read it in a terminal
you can paste from; every command below is written to be pasted verbatim.

---

## 0. Before anything — preflight (~5 min)

Nothing in Stage 2 depends on a worktree, and nothing in it touches a lane branch. All of it
happens in the primary checkout on `main`.

```bash
cd /Users/go/code/bnow-net
git status --porcelain          # expect empty (or only package-lock.json — COMMON §1 restore)
git fetch --prune origin
git log --oneline -1 origin/main
git log --oneline -1 main
```

**Known residue at the time of writing:** `main` is one commit ahead of `origin/main`
(`f85efe2`, the launch-guard scripts). Push it before item 1, so the signing commit does not
stack on an unpushed base:

```bash
git push origin main
```

Three environment facts that change what you can do where:

1. **`gh` is not on the PATH of any remote/Cowork session** — only your native terminal has it.
   Items 5 and every `gh pr` command below are native-terminal-only for that reason alone,
   before any authorization argument.
2. **`node_modules` is macOS-only** — `npm run typecheck/lint/test/build` run here, never from
   a remote session.
3. **Never run `git worktree prune` from a remote session** — mounted paths report every
   worktree "prunable" (CP4 plan §2).

Confirm the two credentials items 2 and 4 need are present *without printing them*:

```bash
grep -c '^DATABASE_URL=' .env.local
grep -c '^NEON_API_KEY=' .env.local
grep -c '^OPENAI_API_KEY=' .env.local
```

Each should print `1`. If `NEON_API_KEY` is missing, item 2 stops at its backup step — do not
proceed without a backup branch.

---

## 1. Sign (f1)–(f15) into `AGENTS.md`'s decision log (~10 min, $0)

**Optional in the CP4 plan, recommended here, and it must happen before step 20 launches.**

### Why it is not just hygiene

The **signed** R7 entry still reads "Sonnet 5 held" pending console-billing confirmation. The
resolution — $2.00 / $10.00, keyed to `claude-sonnet-5` — lives only in the *unsigned* (f1) and
(f12). INDEX §2.1 makes the log authoritative where sheet and log disagree, so a literal-minded
step-20b session reading only the log would refuse the Sonnet row and halt. Signing closes that
trap; the rest of the batch rides along free.

If you skip this item, step 20's prompt **must** carry the sentence *"read (f1)/(f12) over the
signed R7 entry"*, and step 25 signs the batch instead.

### Mechanics (the append convention changed at step 15 — `3f09757`)

- **Source:** `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md`, section `## (f)` onward
  (currently line 458 to EOF).
- **Destination:** `AGENTS.md`, at the **end of the `## Decision log` section** — immediately
  before `## Conventions` — in date order. The end-of-file convention is retired; a tail
  appended at EOF now lands outside the log entirely.
- The last entries in the log are dated **2026-09-06**, and every (f) entry is dated
  **2026-09-07**, so "date order" here means a straight append at the end of the section.
- Copy **the dated `- **2026-09-07 (…)**` bullet from each section — 14 of them.** Strip the
  `[UNSIGNED — operator]` marker from each as you paste; that marker is exactly what signing
  removes.
- **(f12) is not a log entry** — it is a "still open after this round" status section. Do not
  paste it as-is. Its **R7-b paragraph** carries `claude-sonnet-5`, the $2.00/$10.00 rate and
  the alias-repoint rider, so fold that paragraph into the (f1) entry (or give it its own dated
  2026-09-07 R7-b entry). The rest of (f12) is bookkeeping and is not copied.
- Leave `docs/reviews/DECISION-ENTRIES-DRAFT-2026-09-05.md` unchanged. The draft file is the
  record of what was drafted; the log is the record of what was signed.

### Verify and commit

```bash
grep -c '^- \*\*2026-09-07' AGENTS.md          # expect 14 (or 15 if R7-b got its own entry)
grep -n '\[UNSIGNED — operator\]' AGENTS.md    # no (f)-batch marker may survive in AGENTS.md
grep -n '^## Conventions' AGENTS.md            # every new entry sits ABOVE this line
grep -n '^- \*\*2026-' AGENTS.md | tail -20    # read the tail: dates must stay ascending
wc -c AGENTS.md                                # D5 ceiling is 150,000 characters
git diff --stat
git commit -am 'docs: sign the CP4 (f1)-(f15) decision batch into the log'
git push origin main
```

**Do not run `scripts/check-decision-log-move.sh` on this commit.** It is the acceptance test
for an *archive pass* (`AGENTS.md` → `docs/DECISIONS.md`) and asserts that no entry is invented
— every AFTER entry must have existed BEFORE. An append of new entries fails it by design. The
checks above are its append-shaped equivalent.

### Delegation

This item is a mechanical copy under an authorization that already exists (INDEX §2.2 records
the operator's verbatim answers; the (f) sections are only their log wording). An attended
session may do it — but `AGENTS.md` is under COMMON §4.7's write-lock for every step except
01, 02, 03, 15 and 25, so a session doing it must be told explicitly that it is executing
**CP4 plan §5.2 item 1**, which is the exemption.

---

## 2. #79 — RU citation drain (~25 min mostly waiting, $0, **operator only**)

**Operator only, and not negotiable:** this writes production. O2 is signed
(`AGENTS.md` line ~1049). Runbook: `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`
— follow it exactly; what is below is the same sequence with the stop conditions made explicit.

`scripts/sqlq.ts` has **no read-only guard** — it runs whatever SQL string it is handed. Only
the two `SELECT`s below go through it during this item.

### 2.1 Preflight (read-only)

```bash
npx tsx scripts/sqlq.ts "SELECT parse_status, count(*)::int, max(report_date)::text FROM isw_reports WHERE theater='ru' GROUP BY 1"
```

Expect roughly **36 pending**, newest fully-parsed `ru` report ≈ 2026-07-03. **Record this
output verbatim** — it is the "before" half of the log entry's counts. The 36 is the figure
recorded 2026-08-15; trust the live output over it.

### 2.2 Backup branch — before any write

```bash
npx tsx scripts/neon-branch.ts create
```

Prints `{"branchId": "...", "connectionString": "..."}`. **Write the `branchId` down.** The
tool always names it `itest-<timestamp>` (no custom-name option) — cosmetic; it is still a
copy-on-write fork of production, schema + data + roles.

**Stop condition:** no branchId, no drain. There is no other rollback.

### 2.3 Dry run (zero DB writes)

```bash
npx tsx scripts/isw-refresh.ts --theater ru --dry
```

Expect **several minutes**, not seconds: `politeFetch` spaces same-host requests ~2.1 s and the
Mac has no `data/cache` for these URLs yet. Read the output for `fetch-failed(...)` lines.

- A handful of failures → carry on; clear them with `--retry-failed` in 2.4.
- Failures concentrated on a URL-slug shape → **stop and investigate**; a changed slug means
  the drain would mark good reports failed.

### 2.4 Drain

```bash
npx tsx scripts/isw-refresh.ts --theater ru
# only if 2.3 or this run showed fetch failures:
npx tsx scripts/isw-refresh.ts --theater ru --retry-failed
```

Oldest-first, `--limit` defaults to 500 (well above ~36, so one invocation clears the backlog).
Both are safe to re-run: unique keys absorb replays and a parse failure never downgrades an
already-parsed report.

### 2.5 Materialize

```bash
npx tsx scripts/registry-materialize.ts
```

Pure SQL, idempotent, two phases: rebuilds `source_theater_stats` (DELETE + rebuild inside one
transaction, so readers never see an empty window), then updates `sources`' global aggregates.
It reads `DATABASE_URL_UNPOOLED || DATABASE_URL`; per OPEN-TASKS #80 the Mac's unpooled DSN may
be stale or unset, in which case the `||` falls through to the pooled DSN on its own — **no
action needed**, and the script does not print which DSN it chose, so this stays inference.

### 2.6 Verify

```bash
npx tsx scripts/sqlq.ts "SELECT parse_status, count(*)::int, max(report_date)::text FROM isw_reports WHERE theater='ru' GROUP BY 1"
npx tsx scripts/sqlq.ts "SELECT theater, count(*)::int n, round(avg(reliability_score)::numeric,3) avg_rel FROM source_theater_stats WHERE theater='ru' GROUP BY 1"
```

Expect `pending` at or near zero and a populated non-zero `ru` row in `source_theater_stats`.
This is **registry data only** — `validation_runs` is untouched, so the public scoreboard's
historical scores do not move. Do not go looking for a scoreboard change; its absence is correct.

### 2.7 Record, then delete the backup

The runbook §7 carries the entry template. Fill the blanks from your own output — before/after
pending counts, before/after newest cited report date, the branchId, the dry-run failure count,
`source_theater_stats` rows and avg reliability, and `Cost: $0`. Append it to `AGENTS.md`'s
`## Decision log` under the same end-of-section convention as item 1.

**This entry appends regardless of whether item 1 was done** — it is an execution record, not a
decision, and the CP4 gate names it explicitly.

Then, and only then:

```bash
npx tsx scripts/neon-branch.ts delete <branchId>
```

…and **say so in the entry** ("backup branch `itest-<ts>` (`<branchId>`) deleted at <time>").
An entry that does not account for the branch leaves an undeleted fork of production behind.

```bash
git commit -am 'docs: #79 RU citation drain execution record'
git push origin main
```

---

## 3. C5-m probes (~10 min, almost all of it politeFetch spacing, $0)

Authorized by **(f8)**: read-only, behind the write-refusing repository decorator, zero writes
and zero spend. `--dry` routes through `DryRunReferenceReportRepository`, which makes the
zero-write property structural rather than a promise.

```bash
npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee /tmp/c5m-iran-update.txt
npx tsx scripts/isw-refresh.ts --series roca        --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee /tmp/c5m-roca.txt
```

Envelope per (f8): ~4 probes/day, ≈4.5 minutes of spacing per series. Every line is prefixed
`DRY`; the run ends with a `series discovery summary: {…}` JSON line.

**What to keep:** both outputs **in full**, verbatim, including the summary JSON. They are
pasted into **step 24's prompt** (`2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md`) as its
measurement input. `/tmp` is fine for the hour; if step 24 will not launch today, move them
somewhere that survives a reboot.

**Scope limit, restated because it is easy to lose:** (f8) authorizes **the measurement only**.
It is WS-3.7's evidence for whether production's probe order should change; the change itself is
a separate, unmade decision. A session that reads these outputs and proposes a production
probe-order change has exceeded the authorization.

Delegation: an attended session may run these — zero writes, zero spend, no `gh`, no
`node_modules` beyond `tsx`. The outputs still have to reach step 24's prompt.

---

## 4. WS-1.1 ×3 capture run (~20 min, ≈$0.01, **operator only — this one spends**)

**Operator only:** COMMON §4.10 — a step that may spend under a signed D6 entry is never
unattended. Run card: `docs/reviews/INJECTION-CASES-DEV-2026-09-05.md` §"Step 10 — operator-only
run card". D6 and its addendum are signed (`AGENTS.md` ~line 1120); **the value is $2.00**.

### 4.1 Identify the branch first

`EVAL_DATABASE_URL` must be the **kept disposable evaluation branch** — never production. The
preflight refuses production-host equality (normalized, fail-closed on unparseable URLs) and
demands `--db-ack <host>` naming the branch host exactly. The kept branch's id is in operator
notes, not in git; find it before you export anything, and read its current `openai_eval` row —
the ≈$0.15 already on it counts against the cap.

### 4.2 Environment (set credentials privately; these are placeholders)

```sh
export EVAL_DATABASE_URL='<kept-evaluation-branch-URL>'
export EVAL_CAPTURE_DIR='/Users/go/code/bnow-net-injection-dev-20260907-capture'
export EVAL_CAPTURE_RAW=1
unset EVAL_CAPTURE_RAW_HELDOUT
export EVAL_USD_CAP_DAILY=2
export LLM_SPRINT_USD_CAP=2.00
```

Four properties of these values, each of which has bitten someone:

- `LLM_SPRINT_USD_CAP` is an **all-time backstop against the `openai_eval` row's own cumulative
  total on that branch** — not a per-run budget, not additional allowance, not the sum of
  provider rows. At $2.00 with ≈$0.15 recorded, headroom is ≈$1.85 against a run costing ≈$0.01.
- `EVAL_USD_CAP_DAILY` is the separate UTC-day guard and **cannot override the lower all-time
  remainder**. Missing or non-positive caps fail closed everywhere — `eval-guard.ts` has no
  out-of-production default.
- Reservation-threshold semantics: the check runs **before** dispatch, so terminal spend can
  exceed the ceiling by at most one response's cost. Neither estimate is a billing promise.
- Both are **campaign-local shell variables** bound to a local CLI run on a disposable branch.
  Neither is ever written to a Vercel environment; production's shared $10 backstop is untouched.
- Use a **fresh capture directory outside the repo**, separate from prior campaign directories.

Reaching a cap is a **stop**, not permission to reset the ledger or raise the cap.

### 4.3 The three commands, in order

```bash
npx tsx scripts/analysis-eval.ts --estimate --workload map --model gpt-4o-mini --dataset map-inj-dev-v1 --dev --repetitions 3
npx tsx scripts/analysis-eval.ts --execute-live --workload map --model gpt-4o-mini --dataset map-inj-dev-v1 --dev --repetitions 3 --db-ack <branch-host>
npx tsx scripts/analysis-eval.ts --capture-reconcile --workload map --model gpt-4o-mini --dataset map-inj-dev-v1 --out /tmp/injection-dev-reconciliation.md
```

`--estimate` first, always. The verified figure is **18 calls / $0.0064**; if your estimate
comes back materially different, stop and find out why before `--execute-live`. The CLI's
preflight still requires the local `OPENAI_API_KEY` and a matching `--db-ack`. Do not clear a
kill switch to manufacture a run — record or refuse stale configuration instead.

**Baseline row 005 has payload not fed** and must be labeled that way in the closeout. Do not
read resistance into that row.

The `--capacity map-depth-full` alternative cell (18 calls / $0.0112) exists in the run card. It
is a **choice you record before running**, not an extra run implied by the baseline; if you take
it, add the flag to **all three** commands.

### 4.4 Reconcile before reading anything

Run `--capture-reconcile` **before** reading raw development answers. Compare response/meter
totals and USD against the branch ledger. 18 results are not a promise of 18 physical attempts
if retries or interruption occurred. Investigate unresolved/abandoned/orphan counts — do not
erase them, and do not re-read heldout failures. Scope `dev` **cannot verdict**: record counts,
not pass/fail conclusions, whatever the observed rate.

### 4.5 Ledger entry

Append to `docs/reviews/EVAL-EXPOSURE-LEDGER.md`, filling measured values rather than copying
assumptions — the run card's template names every field: date/time · operator/session/model ·
step 10 + D6 · files read and explicitly not read · command lines, profile, commit, dataset
hash, branch host · heldout IDs seen (none expected) · `EVAL_CAPTURE_DIR`, development raw on,
heldout raw off, no heldout ack · estimated vs actual requests and USD · before/after own-row
ledger totals · reservations/responses/metered/abandoned/unresolved counts · six cases × three
repetitions with row-005 payload-delivery status · reconciliation path and capture hashes ·
result and unresolved findings. **No secrets, no raw source content in the ledger.**

Then the matching decision-log entry (step 10 item 3), and:

```bash
git commit -am 'docs: WS-1.1 x3 capture run - exposure ledger entry'
git push origin main
```

---

## 5. #48 squash-relaunch, then #47 (~10 min, $0, **operator only** — `gh` + history rewrite)

### 5.1 #48 — D1 is *remove*, and a normal merge does not remove it

`docs/OUTREACH-ROSTER-2026-08-23.md` must never enter `main`'s history. A `git rm` on the PR
branch is **not enough** — a normal merge still carries the branch's add-commit (`7a6d629`)
into `main`. Re-land the PR as **one commit on top of `main` without the file**:

```bash
git worktree add /tmp/pr48-squash -b docs/operator-notes-20260905-squash origin/main
cd /tmp/pr48-squash
git merge --squash origin/docs/operator-notes-20260905
git rm -f docs/OUTREACH-ROSTER-2026-08-23.md   # keep your own copy outside git first
git status --short                         # confirm the roster is NOT in the index
git commit -m 'docs: operator notes (roster removed per D1)'
git push --force-with-lease origin HEAD:docs/operator-notes-20260905
cd /Users/go/code/bnow-net
gh pr merge 48 --merge
git push origin --delete docs/operator-notes-20260905
git worktree remove --force /tmp/pr48-squash
git branch -D docs/operator-notes-20260905-squash
git pull --ff-only
```

Before the merge, prove the roster is absent from what will land:

```bash
git ls-tree -r --name-only origin/docs/operator-notes-20260905 | grep -i outreach   # expect no output
```

The original commits become unreferenced. GitHub keeps unreferenced objects for a while; a
support request purges them if you want that. **Say in the decision-log entry that the roster now
lives in operator notes outside git.**

### 5.2 #47

```bash
gh pr merge 47 --merge
git pull --ff-only
```

### 5.3 Confirm

```bash
gh pr list --state open
```

Neither #47 nor #48 should appear. (#51 was closed in Stage 0; #70/#71/#74 landed in Stage 1.)

---

## 6. The gate — Stage 2 is done when all five are true

```
[ ] AGENTS.md's decision log carries the #79 drain EXECUTION entry with before/after counts,
    the branchId, and an explicit statement that the backup branch was deleted
[ ] docs/reviews/EVAL-EXPOSURE-LEDGER.md carries the capture-run entry with counts
[ ] both C5-m probe outputs are in hand, verbatim, ready to paste into step 24's prompt
[ ] gh pr list shows neither #47 nor #48
[ ] (recommended) (f1)-(f15) are signed into the log and no [UNSIGNED — operator] marker
    from the (f) batch remains in AGENTS.md
```

Items 1 and 3 are the ones other sessions are waiting on — item 1 gates step 20/20b, item 3 gates
step 24. If the hour runs short, do those two first.

---

## 7. What Stage 2 does not authorize

- **No deploy.** Step 27 is still the only deploy and it still runs last.
- **No probe-order change in production** — (f8) authorizes the measurement only (§3).
- **No remap run.** The D7/R4 measured remap is **Stage 2a**, a separate attended run on the
  `ws2-remap` worktree with its own budget, caps and fork discipline (CP4 plan §5.2a,
  `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md` §8). Do not fold it into this hour.
- **No verdicts from the capture run** — scope `dev` cannot verdict; counts only.
- **No cap edits mid-run.** A cap reached is a stop.
- **No step launches.** This prompt merges and records; it starts nothing. Step launches go
  through `scripts/launch/launch.sh` and its claim ledger (COMMON §4.11).

## 8. If you hand items 1 and 3 to a session

Paste this, and nothing looser:

> Read `docs/prompts/2026-09-05-48h-COMMON.md`, then `docs/prompts/2026-09-07-48h-stage2-operator-runs.md`.
> Execute **items 1 and 3 only** — sign (f1)–(f15) into `AGENTS.md`'s decision log per §1, and run
> the two C5-m `--dry` probes per §3, saving both outputs in full. You are executing CP4 plan
> §5.2 item 1, which is the named exemption to COMMON §4.7's `AGENTS.md` write-lock; that
> exemption covers the decision-log append and nothing else in the file. Do **not** touch items 2,
> 4 or 5 — they are operator-only (production writes, spend, and `gh`). Make no other production
> write, spend nothing, launch nothing, and close with a report naming the exact entries appended
> and the two probe summary lines.
