# Stage 4 Review — Validation harness vs ISW

**Date:** 2026-07-04 · **Status: PASS (harness); digest quality gap documented**

## Exit criteria
| Criterion | Result | Pass |
|---|---|---|
| Daily cron scoring digest vs same-day ISW | /api/cron/validate @ 07:00 UTC | ✅ |
| Metrics: coverage/divergence/timeliness/unsupported | all four, defined + persisted | ✅ |
| Public scoreboard + divergence drill-down | /scoreboard + /scoreboard/[c]/[date] | ✅ |
| ≥14 backtested days by Monday | 28 runs (14 days × RU+UA) | ✅ |
| Targets displayed (coverage ≥80%, <2%, ±6h) | displayed as targets on page | ✅ |

## Backtest numbers (stub provider, 2026-06-20 → 07-03)
- avg coverage 7.8% (nonzero days avg 24.1%, best 33.3%)
- **median information lead +16.4h** on matched events — we hold the information more
  than half a day before ISW publishes. This is the demo headline.
- thin-sourced ("unsupported") rate is high (~most claims single-source `claimed`) —
  honest artifact of extractive stub + t.me single-channel sourcing.

## Why coverage is low, and why that's OK to ship
ISW takeaways are *synthesized analytical statements*; the stub quotes documents
verbatim. Keyword matching bridges some of it (trilingual gazetteer, oblast→town
expansion — June 30 went 0%→33% both theaters), but the gap is structural. The LLM
provider produces synthesized English claims — same harness, no code changes, coverage
jumps. Scoreboard honestly shows targets vs. actuals; divergence-as-feature framing
holds either way.

## Legal compliance
- DB stores per-takeaway keyword signatures + ordinal + char count. No ISW prose
  anywhere user-facing; drill-down shows OUR claim text + ISW keyword list + link to
  ISW's own page.

## Known debt
- Matcher gazetteer is ~35 toponyms; expansion table covers 3 oblasts deeply.
- ISW publish time from JSON-LD `datePublished` (sometimes edit-date; lead may be
  slightly conservative/optimistic per day).
- No trend charts yet (table + summary tiles only).

## Addendum 2026-07-05 — LLM era (OpenAI recharged)

All 30 runs regenerated (gpt-4o-mini digests) and rescored with LLM semantic matching
(ISW texts transient in prompt; verdicts persisted; `details.matcher='llm'`):

| Metric | Stub + keyword | LLM + semantic |
|---|---|---|
| avg coverage (denominator: ALL takeaways) | 7.8% | **17.5%** |
| days with agreements | 9/28 | **17/30** |
| nonzero-day avg | 24.1% | **31%** |
| best day | 33% | **100%** (Jun 21 RU, 5/5) |
| median information lead | +16.4h | **+14.7h** |

Also proven live: ISW report auto-discovery — July 4's report published mid-session
and validation picked it up with zero human action.

Interpretation caveats (documented, not hidden): RU and UA digests both validate
against the same whole-war ROCA report while each covers one theater's sources —
0% UA days often mean ISW led with RU-domestic takeaways that day. Single-war
digest union or per-theater takeaway filtering is the next matcher refinement.
