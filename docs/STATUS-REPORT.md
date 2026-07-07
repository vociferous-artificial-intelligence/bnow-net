# BNOW.NET — Status Report

**For:** Gregory · **Date:** 2026-07-07 · **Live app:** https://bnow-net.vercel.app
This is the plain-language summary. Technical state lives in `AGENTS.md`; your to-do
list is `docs/SETUP-NEXT-WEEK.md`.

## What exists (in one paragraph)

A deployed, self-running OSINT intelligence product covering Russia/Ukraine (flagship)
and Iran/Gulf (second wave). It continuously ingests open sources (RSS + ~70 Telegram
channels selected by ISW's own citation behavior), generates daily AI digests per
country on three tracks (military, elite politics, Iran nuclear), scores itself publicly
against ISW's daily assessments, and layers analyst tools on top: a source-reliability
registry derived from 348K ISW citations, an entity/ownership graph, mirror-trade
evasion flags, a critical-materials tracker, a Russia data-blackout tracker, automated
analyst signals, and an ask-the-data Q&A. Every claim links to its source documents —
that traceability is enforced by the database itself, tested, and is the product's core
differentiator.

## Current numbers

| Metric | Value |
|---|---|
| Source registry | 10,502 sources, 348,586 ISW citations (1,567 ROCA + 1,069 Iran Update reports) |
| — Russia/Ukraine corpus | 6,985 sources with reliability scores (avg 0.57) |
| — Middle East corpus | 3,598 sources with reliability scores (avg 0.49) — includes Hamas/PIJ/Hezbollah channels |
| Ingestion | 15,358 documents total; ~4,000/day currently |
| Digests | 61 across 6 active countries (ru 24, ua 17, ir 13, ae/om/qa 7) |
| Claims | 353, every one source-linked (0 orphans — DB-enforced) |
| Validation runs | 36 scored against same-day ISW reports |
| Coverage vs ISW | ru ~12%, ua ~14% (day range 0–57%); Iran 33%/25% on 2 of 4 scored days (was flat 0%) |
| Info lead | when we match ISW, we publish ~5–15h before them |
| Entity graph | 97 clean entities (was 293 with junk) |
| Trade/materials | 2,785 Comtrade rows; 28 dual-use rerouting flags; 11 US import dependencies tracked; data fresh as of Jul 6 |
| Signals | all 3 detectors firing on real data (purge cluster, 4 classified RU data series, trade divergence) |
| Tests | 137 unit + 6 database-integration, all green; CI workflow ready |

## What this hardening pass fixed (before → after)

1. **Fabricated data can no longer reach users.** Demo fixtures were rendering as real
   "SANCTIONED" badges on real people, fake ownership edges, and 2 digest claims cited
   fixture documents. All purged from the database; three code layers now prevent stub
   data from being written, selected, or rendered; a database-level test proves a
   planted fixture doc cannot surface in a digest. *This was the most serious defect in
   a provenance-branded product.*
2. **The digest engine was silently dropping theaters.** The 6-hourly generation run
   grew past its time budget and died mid-run — Ukraine, a flagship theater, lost its
   same-day digest whenever that happened. Split into two independent cron runs
   (ru+ua / gulf); verified complete since.
3. **Iran was flatlined at 0%.** Its military digest ran a Russia-shaped prompt and
   filter. With an Iran-specific prompt (proxies, IRGC/CENTCOM, shipping, air defense):
   1–3 events/day and scoreboard days of 33%/25%.
4. **Entity graph cleaned 293 → 97**: geography ("Moscow"), collectives ("Five
   individuals", "Russian courts"), objects ("Su-27", "Ebola") deleted; 5 spellings of
   Khamenei merged, likewise Zelensky/Trump/Houthi/IRGC clusters — with all evidence
   repointed. Extraction prompts now forbid creating this junk; an LLM audit route
   proposes (never auto-applies) future cleanups.
5. **/ask can no longer run up the bill**: 20 questions/user/day + a global $1/day LLM
   budget, every question logged per user (billing-ready).
6. **3,598 Middle East sources had zero stats** in the registry (looked dead). All now
   carry real citation counts and reliability, per corpus.
7. **State-media claims no longer lead /ask evidence** — retrieval now down-weights
   low-reliability sourcing (digest ranking already did).
8. **Safety nets**: CI pipeline (activates on first GitHub push), enforced local
   pre-push test gate, database integration tests on disposable DB forks, a cron-audit
   script, and the original product brief installed as the authoritative spec.

## Honest weaknesses

- **Coverage vs ISW is far below the brief's 80% target** (~12–14% avg). The binding
  constraints: (a) source gap — the missing half of ISW's citation diet is mostly X
  accounts we can't read without an X API key ($200/mo, biggest unlock); (b) the
  LLM matcher is noisy run-to-run (±30pts on individual days), so the scoreboard moves
  for reasons other than product quality — fix queued (majority-vote matching);
  (c) ISW summarizes at a level our per-doc claims don't always reach.
- **Saudi feeds went dark Jul 5** (bot-walling suspected) — theater is active but empty.
  il/bh/kw were already scaffolded-only for the same reason.
- **Elite-politics and Gulf digests are unvalidated by design** (no ISW equivalent) —
  they're only as good as the prompt; treat as leads, not assessments.
- **Key-blocked**: real sanctions/ownership data (OpenSanctions/Companies House keys),
  MTProto/X ingestion, zakupki procurement (needs RU proxy), Stripe checkout.
- **Email still sends from the borrowed scenefiend domain** until bnow.net DNS +
  Postmark migration.
- gpt-4o-mini is the only live model; Anthropic support is now in the seam but unkeyed.

## Top 5 next moves (value order)

1. **X API key ($200/mo)** — 166 recently-ISW-cited accounts we currently can't read;
   directly attacks the coverage number, which is the product's public proof.
2. **Point bnow.net at the app + migrate Postmark sender** — brand-correct URL and
   email before any outreach (partner motion in PARTNER-STRATEGY.md depends on it).
3. **Majority-vote validation matching** — makes the public scoreboard reproducible;
   credibility of the core demo asset.
4. **OpenSanctions + Companies House keys** — turns the entity graph from
   structure-only into compliance-grade substance (badges/ownership now render nothing
   until real data exists).
5. **Push to GitHub** (CI live, code off this one machine) and **start the Stripe
   catalog** per the brief's bundle pricing (§6.5, OPEN-TASKS #12) so the first design
   partner can pay.
