# Coverage & Compliance Sprint — Results (2026-07-07)

Sprint goal: convert the two new keys (twitterapi.io X, OpenSanctions) into measurable
product improvement, with the scoreboard's coverage-vs-ISW number as the public proof.
Budgets: X ≤ $5 · OpenSanctions ≤ 300 of 2,000 calls · LLM ≤ $10 — all enforced in code.

## Headline numbers

| Metric | Before | After |
|---|---|---|
| Citation-weighted source parity, ru theater | 62.5% | **74.2%** |
| Citation-weighted source parity, ir theater | 35.9% | **57.5%** |
| Scoreboard reproducibility (rerun same day) | ±30pts | **26/27 identical** |
| UA avg coverage, Jun 30–Jul 6 (majority matcher) | 16.3% | **23.6%** |
| RU avg coverage, Jun 30–Jul 6 (majority matcher) | 18.2% | **15.1%** ⚠ see diagnosis |
| Zero-coverage day-country pairs (of 14) | 7 | **3** |
| Days with an info-lead measurement (of 14) | 7 | **12** |
| Spend: X / OpenSanctions / LLM-match | — | $1.72 of $5 · 200 of 300 calls · $0.04 of $10 |

## Coverage before/after, day by day (ru/ua military, ISW ROCA reference)

Three measurement passes isolate each effect. A = original single-shot validation of
pre-X digests (captured before any change). B = same digests, majority-vote matcher
(isolates the matcher). C = digests regenerated with X in the corpus, majority-vote
matcher (isolates X sourcing).

| Date | ru A | ru B | ru C | ua A | ua B | ua C |
|---|---|---|---|---|---|---|
| 06-30 | 0 | 0 | **33.3** | 0 | 0 | **25** |
| 07-01 | 0 | 0 | 0 | 33.3 | 33.3 | **50** |
| 07-02 | 0 | 0 | **16.7** | 28.6 | 28.6 | 28.6 |
| 07-03 | 57.1 | 57.1 | **14.3** ↓ | 0 | 0 | **16.7** |
| 07-04 | 20 | 20 | **0** ↓ | 0 | 0 | 0 |
| 07-05 | 25 | 0 | **25** | 40 | 40 | **20** ↓ |
| 07-06 | 66.7 | 50 | **16.7** ↓ | 25 | 12.5 | **25** |
| **avg** | **24.1** | **18.2** | **15.1** | **18.1** | **16.3** | **23.6** |

## Honest reading

**What worked:** UA coverage rose 45% relative (16.3→23.6) and the floor lifted across
the board — zero-coverage day-pairs fell from 7/14 to 3/14, and info-lead is now
measurable on 12/14 days. X sourcing systematically fills days that used to be blind.

**What regressed and why:** RU average fell 18.2→15.1. The mechanism is visible in the
citation mix: after regeneration, X docs supply 8–11 of every 9–12 RU claims
(Jul 1–6) — ISW-cited X accounts carry the highest registry reliability scores, so the
reliability-ordered corpus (LIMIT 600 → top-100 to the LLM) let X displace the telegram
and RSS docs that were driving RU's best days (Jul 3: 57.1→14.3, Jul 6: 50→16.7). UA
kept a healthier mix (2–8 X citations of 8–10 claims) and improved. In short: the new
source class is additive only when it doesn't monopolize the analysis batch.

**Fix queued (next session):** source-mix quota in corpus selection — cap any single
adapter at ~40% of the analysis batch (or blend reliability with source-type diversity),
then re-measure. Tracked in OPEN-TASKS #16.

**Matcher effect (A→B):** majority voting is mildly deflationary (ru 24.1→18.2,
ua 18.1→16.3) — it kills matches that only appear in a minority of runs, which is the
point: those were the ±30pt noise. B and C are the comparable pair.

## Reproducibility (Task 2 gate)

3 days (Jul 2/5/6) × 3 theaters, each validated 3 times with the majority matcher
(k=5, gpt-4o-mini): 26 of 27 measurements identical; single flip: ru Jul 6 50↔66.7
(one marginal takeaway on a 6-takeaway day). Under single-shot, individual days swung
±30pts. Per-vote detail persists in `validation_runs.details.votes`
(`matcher: llm-majority`, `voteRounds: 5`); `MATCHER_MODE=single` restores one-shot.

## Task gates

### Task 0 — Housekeeping ✅
7 doc files committed; 137 unit tests green; cron audit healthy (ingest/digest/validate/
datadark all landing; no stub leakage; enrich stamps were sanitized-stub as expected).

### Task 1 — X adapter ✅
- `x_api` (api.twitterapi.io) behind `SourceAdapter`; fail-closed SpendGuard proven live
  (run without `X_SPRINT_USD_CAP` → 0 requests) BEFORE any paid call was possible.
- Pilot: top-30 accounts → 198 docs, 10 requests, $0.03, 100% source attribution.
- Full list: 383 ISW-cited accounts (last 90d; 164 ru-theater ≈ the "166", 226 ir),
  dominant-theater tagged, uk-language re-tag to ua.
- Steady state: hourly cron (`?which=x`, own group), watermarked advanced_search
  batches — pays only for new tweets + $0.00015/request minimums (~$0.03–0.10/cycle).
  Serverless path proven end-to-end (663 fetched/457 inserted in one prod run).
- Backfill: 7 days, tiered by citation rank (50×6p / 100×3p / 233×1p), 6,883 docs,
  $1.52. Total X spend $1.72 of $5. Daily cap raised 1.5→2.5 (backfill day only).
- Budget behavior verified twice in production: daily-USD-cap refusal (post-backfill)
  and resume-after-raise. Watermark only advances on complete passes → no data loss
  across budget stops.

### Task 2 — Majority-vote matching ✅
Shipped + measured (see Reproducibility). LLM vote calls guarded under
`LLM_SPRINT_USD_CAP` (provider `llm_match`): 290 calls, $0.035 total.

### Task 3 — Coverage measurement ✅ (this document)
Includes the negative finding (RU displacement) per the sprint's honesty requirement.

### Task 4 — OpenSanctions ✅
- 200 live `/match` calls (cap 300; daily-cap guard stopped run 2 at exactly 200 —
  by design; 5 residual entities complete via the 08:00 cron).
- 121 matched, 54 sanctioned across 205 claim-graph entities, priority: pressure-signal
  (defendant/target/dismissed) > persons > companies.
- Hand spot-check vs opensanctions.org: **4/5 confirmed** (Shapsha: 13 sanction lists;
  PJAK: OFAC CT; McKenzie: mil/not-sanctioned incl. "Frank"→Kenneth alias; Rutte:
  PEP/not-sanctioned). **1/5 flagged:** our "Andrei Fedorov" (orphan entity, zero linked
  claims) name-matched a Ukrainian-NSDC-sanctioned Russian businessman at score 1.0 —
  name-only matching on common names is a real false-positive channel. Mitigations
  queued: require ≥1 linked claim before spending a call; show score+caption beside
  badges. Licensing hard gate recorded in HUMAN-SETUP-TODO §13 and BLOCKERS.
- Truth-in-UI held: stub-era rows were sanitized `{matched:false,stub:true}` and were
  upgraded (not trusted) by live checks.

### Task 5 — Feed health ✅
- sa "dark since Jul 5" root-caused: arabnews.com RSS **frozen upstream since Apr 25**
  (HTTP 200, valid XML, never updates) — not bot-walling. sa revived with Saudi Gazette
  + Asharq Al-Awsat EN (350 fresh docs day one).
- il revived (JPost + Ynet reachable from Vercel; timesofisrael 403 from Vercel but OK
  from build host) and flipped scaffolded→active.
- bh/kw: every candidate failed (HTML-not-RSS / 404 / 405 / TCP) — honestly scaffolded.

## Incidents & hardening shipped during the sprint

1. **Empty-digest overwrite (found + fixed):** X-corpus regeneration silently wiped two
   good ua digests. Root cause: gpt-4o-mini hit `finish_reason=length` on dense
   uk-language X corpora; the provider's silent-empty fallback persisted 0-event
   digests, deleting prior claims. Fixes shipped: provider now THROWS on refusal/
   truncation/unparseable JSON; digest generator refuses to overwrite a claim-bearing
   digest with an empty extraction; truncation retries with 50→25 doc batches
   (both ua days then regenerated successfully at 50 docs).
2. **Vercel env pull shows sensitive vars as empty** — runtime reads them fine; verified
   by live behavior, documented here so nobody panics at `vercel env pull` output.

## Steady-state cost picture

- X polling: ~$0.03–0.10/cycle hourly ≈ **$0.7–2.4/day** worst case, bounded by
  `X_DAILY_USD_CAP=2.5` and `X_SPRINT_USD_CAP=5` (raise both to scale; ledger in
  `provider_usage`).
- LLM matching: ~$0.001/validation-day × k=5 — negligible.
- OpenSanctions: 100 calls left in sprint budget; ~1,800 in monthly quota.

## Follow-ups (added to OPEN-TASKS)

16. Source-mix quota in digest corpus selection (fix RU displacement), then re-measure.
17. Enrich only claim-linked entities; surface match score/caption on badges.
18. Watch the truncation-retry warning rate; if frequent, cap events in the prompt
    or move extraction to a two-pass (events → claims) flow.
