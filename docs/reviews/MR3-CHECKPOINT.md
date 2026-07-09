# MR Sprint 3 — session checkpoint

**SPRINT COMPLETE (2026-07-09 ~23:45 UTC).** Nothing to resume. This file is kept
as the sprint's session record; the authoritative results are in
`MR3-REDUCE-RESULTS.md` (report), `MR3-AB-RESULTS.jsonl` + `MR3-AB-K5.jsonl`
(raw A/B data), the AGENTS.md decision log (2026-07-09 MR sprint 3 entry), and
`docs/PROGRESS.md`.

## What shipped

- TASK 0 ✅ #29 closed (Lebanese channels → ir; 651 docs retagged; map caught up).
- TASK 1 ✅ reduce core (star clustering, threshold 0.35 tuned on labelled prod
  pairs; #35 version accessor; quote_verified #34; entity canonicalization;
  25-agent adversarial review — 8 confirmed defects fixed).
- TASK 2 ✅ K-voted synthesis engine (group-id-only citations; openai_reduce
  ledger + fail-closed REDUCE_USD_CAP_DAILY; shared persist path; #32 guard on
  both engines).
- TASK 3 ✅ A/B: round 1 (K=3) FAILED variance honestly; diagnosed (marginal-event
  vote flips); fixed (K=5 + majority-gid fill); round 2 PASSED all three gate
  criteria. Neon branch br-proud-sun-atn3fch0 DELETED after the report committed.
- TASK 4 ✅ cutover deployed: DIGEST_ENGINE flag (default LEGACY), cadence
  02:00 finalize + 04:00/10:00/19:30 intraday (rolling window, delta framing);
  intraday mode smoke-verified on prod. REDUCE_USD_CAP_DAILY=2 in all Vercel envs.
- TASK 5 ✅ docs current; #18/#28/#32/#34/#35 closed; rulings 17 corrected, 18 added.

## Flip instructions (operator) — ✅ EXECUTED 2026-07-09 ~23:05 UTC

To switch ru/ua/ir digests to the map-reduce engine:
1. `vercel env add DIGEST_ENGINE production` → value `mapreduce`
   — pipe it with `printf` (no trailing newline); the CLI stores it as a
   **Sensitive** var whose value can never be read back, so a stray `\n` would
   silently serve legacy. See the AGENTS.md cutover log entry.
2. Redeploy: `npx vercel@latest deploy --prod --yes`
3. Watch for a day: cron_runs (job `digest:finalize` / `digest:intraday`),
   provider_usage `openai_reduce` (expect ≈ $0.10–0.30/day), /scoreboard coverage
   (ua ran −3.6 pts in the A/B — noise-scale, but watch it).
Rollback: remove the env (or set `legacy`) and redeploy. Gulf theaters always
use legacy regardless (no doc_claims → automatic fallback, tested).

Done: deploy `dpl_4HdAJA7ZjAKiUGMLamf1ndDnWgpM`. Verified live on ir/nuclear —
`provider: "openai:gpt-4o-mini+mapreduce"`, 172 docs, first `openai_reduce` ledger
row (5 requests = K=5 votes, $0.0054), `openai_digest` un-incremented. The
week-long ua coverage watch (step 3) is now the open item.

## Open follow-ups (tracked in OPEN-TASKS)

#33 remap path for extractor-version bumps · #36 map cron sizing · #37
multi-theater source tagging · gulf theaters onto the map worker (new candidate) ·
ua coverage watch post-flip · per-country mix policy.
