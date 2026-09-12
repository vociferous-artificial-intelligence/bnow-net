# September 2026 plan — from the deploy to month end (written 2026-09-12)

Production is `45fa81f` (deployed 2026-09-11); the 48-hour program's window is closed. This
file sets out the rest of September as dated cards in the completion plan's style: every card
says where it runs, what it needs, what to do and what to expect. Program work (the next
48-hour wave) is pointed at, not re-planned — its authority is
`docs/prompts/2026-09-07-next-48h-handoff.md` §8 and §9. Costs: every card is $0 unless it
says otherwise.

**Two decisions this plan needs from the operator, marked ▶ where they bite:** the soak start
date (§3, card 3.3) and the spend authorization for the paid Ask answer-model matrix (§4,
card 4.2). Neither blocks anything before 2026-09-21.

Standing rule for the month: **nothing in §3 or §4 starts until the three observation windows
are closed and recorded (§1)** — the handoff's gate.

---

## 1. This weekend — close the observation (2026-09-12 → 09-14)

### 1.1 Night 2 — 2026-09-13 not before 02:20Z

**Where:** `/Users/go/code/bnow-net-rel-20260823` on `main` (production DSNs).
**Requires:** `.env.local` there still points at `ep-jolly-glitter-at0968cv`.
**Do:** run `docs/prompts/2026-09-12-48h-step27-observation.md` (attended, Sonnet, or its
§1–§2 blocks by hand); the report header says `window 2`.
**Expect:** `digest:finalize` ok; `openai_embed` row for 09-13 with `requests > 0`;
the error-level `runtime_logs` groups pasted verbatim and classified (this is the open read
from window 1 — 240 of 531 rows; a `status_code -1` group is STOP-grade, a 4xx group on a
cron path is a credential or routing fault, a repeated stderr line from one path is a bug to
file). Paste the report to the planning session; it writes the tracker line.

### 1.2 Night 3 — 2026-09-14 not before 02:20Z

Same card as 1.1, header `window 3`. **Expect** the same, plus the two-day `/digests` and
`/search` page checks for #77 and #84 (a signed-in look at both pages, once each).
**After it:** the planning session appends one decision-log line closing the observation
(`#59 refusal did not fire on three nights`; `#77`/`#84` closed or not), marks tracker 5.5
CLOSED, and the handoff's gate is open.

### 1.3 Records the cleanup owes (any time this weekend)

**Where:** `/Users/go/code/bnow-net` on `main`, tree clean, nothing else running.
**Requires:** the outputs of the branch/worktree cleanup and the new Neon dev branch
(id + endpoint host), the Preview `DATABASE_URL` change if made.
**Do:** paste them to the planning session.
**Expect:** one docs commit — CURRENT-STATE Neon inventory and env posture, the AGENTS.md
"keep both until their windows clear" line corrected in place, #124 status, handoff §9
decisions closed, tracker line. Then `git push origin main`.

## 2. Week of 2026-09-14 — small fixes, no product change

### 2.1 #122 — OpenSanctions enrich fails loud (first PR of the next wave)

**Where:** a fresh worktree from `origin/main` (the program's are gone; `git worktree add
/Users/go/code/bnow-net-worktrees/fix-122 -b fix/122-opensanctions-fail-loud origin/main`).
**Requires:** nothing on Vercel; the key stays blank.
**Do:** one PR: log the caught error class and HTTP status (never the key); meter only
non-null results; stop the run after 5 consecutive failures with a distinct `counts.reason`;
`cron_runs.ok=false` when `failed === scanned`; AUD-28's `OPENSANCTIONS_CALL_CAP` default
documented as a silent default. Unit tests for each. Gate, PR to `main`, merge.
**Expect:** gate green; unit count moves up (new tests) — record it. Not deployed until the
next release train (§4.4).

### 2.2 #124 — Preview off the production database

**Where:** Vercel dashboard, then `/Users/go/code/bnow-net`.
**Requires:** the dev Neon branch from the cleanup (`dev-2026-09-12`).
**Do:** set Preview's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the dev branch's pooled
and bare DSNs; trigger one preview deploy (any PR push does); open its `/health`.
**Expect:** `DB OK` on the preview URL; the production `neondb_owner` no longer reachable from
a preview. Record in OPEN-TASKS #124 (CLOSED) and CURRENT-STATE.

### 2.3 #123 — decide: does a forced digest re-run version or overwrite?

**Where:** a decision, then (if versioning) a PR in the next wave.
**Do:** read #123; choose (a) a re-run writes a new row and supersedes the old under the same
date (audit trail kept), or (b) keep rewrite-in-place but stamp `regenerated_at` and refuse
without `force=1`. Record the choice as a decision-log entry.
**Expect:** until decided, nobody runs the smoke test's step 5 (SETUP-NEXT-WEEK marks it
ONLY-ONCE).

### 2.4 Standing weekly items (SETUP-NEXT-WEEK §1, §2)

**Do:** the LLM credit watch (5 min, $0); a fresh `VERCEL_TOKEN` if the current one is near
expiry; `npx tsx scripts/audit-cron.ts` once mid-week from the release clone.
**Expect:** the audit's verdicts unchanged from window 3; the runtime-log coverage block
non-empty.

### 2.5 D5 archive window (opens 2026-09-13)

AGENTS.md is at ≈140.7 k of 150 k after the deploy entry; the 7-day window makes the
2026-09-06→09-07 entries eligible. **Do nothing unless a new entry would breach the ceiling;**
the thirteenth pass is a Sonnet job of 20 minutes when needed
(`scripts/check-decision-log-move.sh HEAD` proves it).

## 3. Week of 2026-09-21 — the next wave opens (program work; handoff §8 items 3–5)

### 3.1 `compound-v1` (handoff item 3)

**Where:** a program worktree and lane, launched with `scripts/launch/launch.sh` once
`steps.tsv` carries the next wave (the planning session writes it).
**Do:** the human-calibrated compound-unit classifier, with AUD-11's false-positive controls
in the same PR; it answers the open T3 grid question (handoff §4.0).
**Expect:** the one named prerequisite for WS-3.6 met; `CONFLICTS_UI` may follow it per the
C13-b/C10-b ruling, in its own PR, still dark on Vercel.

### 3.2 WS-1.3 — validation-v3 and the injection union into map-v3 (handoff item 5)

**Where:** a second lane, in parallel with 3.1 (no shared files).
**Requires:** the ledger, the memo and the six cases — all in place per handoff §5.
**Do:** the label-gated evaluation step 2; every run appends to
`docs/reviews/EVAL-EXPOSURE-LEDGER.md`.
**Expect:** the gate for every later label step; eval-plane only, `$0` in production.

### 3.3 ▶ WS-3.6 shadow-soak enablement (handoff item 4) — pick the start date

**Where:** operator steps from `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md`
§2.0–§2.4, after 3.1 merges and the migrations gate in §2.0 is confirmed on production
(they are applied — `_migrations` = 32).
**Do, in ruling-4 order:** `CONFLICT_MATCH_USD_CAP_DAILY` (and the two request caps if not
taking the 300/200 defaults) in **all** Vercel environments → redeploy → add the
`conflict-validate` cron line the checklist §5 prints to `vercel.json` in a PR → merge →
deploy. The soak then runs in shadow for its predeclared window (two weeks is the checklist's
sizing; its thresholds are the request caps, never `probe_failed` counts — §4.1).
**Expect:** a `llm_conflict_match` row in `provider_usage` on the first day, bounded by the
cap; `conflict_validation_observations` filling; nothing visible to users.
**Decision:** start 2026-09-28 (soak closes ≈10-12) or 2026-10-01 (closes ≈10-15). The later
date keeps September's `provider_usage` clean for the month review (§4.5).

## 4. Week of 2026-09-28 → month end

### 4.1 Standing-doc truth pass (handoff item 8)

**Where:** one Sonnet session in a docs worktree.
**Do:** the ≈20 AUD corrections the final audit register cites with doc and code
(AUD-23…AUD-31, AUD-36, AUD-37, AUD-40; AUD-04/06 are done), each with a verification grep.
**Expect:** a docs-only PR; `AGENTS.md` standing text corrected in place with "(corrected
<date>)" marks; no decision-log edits.

### 4.2 ▶ Paid Ask answer-model matrix (handoff item 6) — needs a spend authorization

**Where:** the eval plane (`EVAL_DATABASE_URL` = a disposable branch, `--db-ack`), never
production.
**Requires:** WS-1.3 merged (3.2); R14's escape hatch built in the same PR that schedules the
matrix; the operator's written authorization sized in requests and dollars (≈570 requests
chunked under the 300/day and 200/process caps → three days).
**Do:** the matrix; append the ledger; if a candidate passes `v2-k60`, the registry entry PR.
**Expect:** the first `evaluated_candidate` entries in the Ask registry — and still no env
change on Vercel until the ladder in `docs/OPERATOR-MODEL-ROUTING.md` §5 is complete.

### 4.3 Guard hardening (handoff item 7)

**Do:** AUD-17 (whole-directory `matcher-import-hygiene` with a positive control), AUD-07
(client-boundary scan over the full client closure), the remaining guard items the register
names. One PR, tests only.

### 4.4 Release train — second deploy of the month

**Where:** the release clone, `docs/RELEASE-CHECKLIST.md`, cards adapted from
`docs/prompts/2026-09-11-48h-step27-deploy-cards.md` (27.0's endpoint-ownership read, 27.5's
rehearsal on a fork, 27.12's records).
**Requires:** 2.1 (#122) merged at minimum; 3.1 and the soak cron line if 3.3 is scheduled
before the train; a fresh backup branch (which retires `br-shy-wave-ata4r6y0`).
**Do:** freeze SHA → backup → rehearse migrations if any → migrate → deploy → observe one
night. No migration is pending today; the train is code-only unless the soak PR adds one.
**Expect:** `/health` on the new SHA; the blank OpenSanctions key confirmed effective in the
enrich cron's `counts`; the release entry appended to the decision log.

### 4.5 Month-end review — 2026-09-30

**Where:** `/Users/go/code/bnow-net-rel-20260823`, read-only.
**Do:**

```
cd /Users/go/code/bnow-net-rel-20260823
npx tsx scripts/sqlq.ts "SELECT provider, sum(requests) AS requests, round(sum(est_usd)::numeric,2) AS usd FROM provider_usage WHERE day >= '2026-09-01' AND day < '2026-10-01' GROUP BY 1 ORDER BY 3 DESC"
npx tsx scripts/sqlq.ts "SELECT job, count(*) FILTER (WHERE ok) AS ok, count(*) FILTER (WHERE NOT ok) AS failed FROM cron_runs WHERE started_at >= '2026-09-01' GROUP BY 1 ORDER BY 3 DESC, 1"
npx tsx scripts/sqlq.ts "SELECT count(*) AS lines, count(*) FILTER (WHERE level IN ('error','fatal')) AS error_lines, count(*) FILTER (WHERE status_code = -1) AS crashed FROM runtime_logs WHERE logged_at >= now() - interval '14 days'"
npx tsx scripts/audit-cron.ts
```

**Expect:** the OpenSanctions line's September estimate stops growing after the release
train; `openai_*` totals reconciled against the OpenAI dashboard within the estimate's known
error; the result written as a short `docs/reviews/MONTH-2026-09.md` (spend by provider,
cron reliability, the drain's first two weeks, what shipped) — the first monthly record.

### 4.6 Product rollout thread (from PR #100, outside the engineering program)

`docs/rollout/PROJECT.md` and `docs/rollout/GAP-REGISTER.md` define a rollout program with
operator cards O4–O7 (identity sign-off, design-partner program, usability sessions, launch
readiness). None of it is scheduled against the engineering calendar above. **Do this month:**
read the gap register once and pick the first two gaps to close in October, so the October
plan can carry both threads. No engineering dependency.

## 5. Not this month

Model changes on any workload (no trigger has fired — `docs/OPERATOR-MODEL-ROUTING.md` §4);
`CONFLICTS_UI` on Vercel (waits for `compound-v1` and a decision); any eval-plane candidate
run outside 3.2/4.2; a map re-map; OpenSanctions commercial rights (HUMAN-SETUP-TODO §7)
unless access is granted — in which case set the new key on Vercel, redeploy, and reopen
the accounting per SETUP-NEXT-WEEK §7.
