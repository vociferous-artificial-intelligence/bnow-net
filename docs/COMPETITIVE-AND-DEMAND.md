# Competitive Landscape, Buyer Demand & Analytical Depth

Strategy doc (2026-07-06). Answers three questions: where we sit vs commercial
vendors, what different buyers actually pay for (and how to raise analytical value),
and the mirror-trade opportunity. Companion to RUSSIA-DATA-ROADMAP.md.

## 1. Competitive landscape — who sells what, our gaps, our edge

Segments (they rarely overlap; nobody does all of it):

| Vendor | What they sell | Price band | Their edge | Their gap (our opening) |
|---|---|---|---|---|
| **Bloomberg / Refinitiv** | terminal: prices, filings, some news/geo | $$$$ ($30k+/seat) | market data depth, distribution | conflict OSINT is thin; no source-reliability transparency; no Telegram/mil-blogger layer |
| **Kpler / Windward** | maritime + commodity flow intel; shadow-fleet vessel scoring ([Kpler](https://www.kpler.com/blog/assessing-the-impact-of-sanctions-on-russias-shadow-fleet), [Windward](https://windward.ai/blog/enforcement-shock-accelerates-russias-dark-fleet-reflagging/)) | $$$–$$$$ | AIS/vessel behavioral models; 302 high-risk vessels flagged Oct 2025 | narrow to maritime; no political/factional layer; no ISW-style validation |
| **Kharon / Sayari** | sanctions networks, layered ownership, evasion facilitators ([Kharon](https://www.kharon.com/brief/russia-news-2025-sanctions-rosneft-lukoil-shadow-fleet)) | $$$$ | deep entity-network graphs, compliance-grade | slow (investigations, not daily); no frontline event feed |
| **Janes** | defense/military OSINT, orbats, equipment | $$$$ | authoritative mil reference | not real-time; ministries not desks; no reliability scoring exposed |
| **RANE / Stratfor** | analyst-written geo forecasts, weekly/quarterly ([RANE](https://www.ranenetwork.com/platform/products/geopolitical-intelligence)) | $50k+/yr enterprise; $31/wk individual | human analytical narrative | no raw data/provenance; "trust us" not "here's the source"; no live feed |
| **Dataminr** | real-time event detection from social/news, AI ([overview](https://regionalert.com/blog/best-security-intelligence-platforms-2026.html)) | $20k–$100k+/yr | speed, breadth, alerting | black-box relevance; no reliability ratings; no analytical synthesis |
| **Recorded Future** | cyber threat intel, dark web | $$$$ | cyber depth | not geopolitical/conflict analysis |
| **ISW / think tanks** | free daily expert assessment | free | authority, method | not a data product; not queryable; one theater cadence; no API |

**What everyone is missing that we have:**
1. **Transparent, data-derived source-reliability ratings** — nobody exposes *how much
   to trust each source*, derived from an expert's own citation behavior. Bloomberg,
   Dataminr, RANE all present conclusions; we present the evidence chain with a trust score.
2. **Claim→source traceability enforced at the database level** — every claim clicks
   through to raw documents. RANE says "we assess"; we say "here are the 3 sources, rated."
3. **Public daily validation vs an expert benchmark** (ISW scoreboard, +14h median lead).
   No competitor publishes their own accuracy. This is a *trust* differentiator and a
   *marketing* asset simultaneously.
4. **Cross-layer fusion in one product**: frontline + elite politics + regional/ethnic +
   courts + data-transparency — Kpler is maritime-only, Kharon is sanctions-only, Janes
   is military-only. We span them at desk speed.

**What competitors have that we lack (the honest gap list → build backlog):**
- **Maritime/AIS** (Kpler/Windward): shadow-fleet + Hormuz tanker tracking. High value
  for commodity + insurer buyers. Needs paid AIS (MarineTraffic/Windward feed) — see §3.
- **Deep ownership-network graphs** (Kharon/Sayari): our entity graph is shallow vs their
  corporate-registry depth. OpenSanctions (shipped) + UK Companies House + OpenCorporates
  closes part of it cheaply.
- **Financial-market data** (Bloomberg): not our game; integrate, don't rebuild.
- **Analyst-written narrative** (RANE): we generate structured claims, not prose essays.
  A thin "analyst layer" on top (see §2) captures some of this without becoming a
  consultancy.
- **Scale of curated sources**: Intel Desk runs ~199 sources for Iran alone; we run ~70
  for RU/UA. Closeable via the registry flywheel.

## 2. Buyer demand — what raises analytical value, segmented

The core insight: **raw events are a commodity; the premium is in the analytical layer
that answers a specific buyer's decision.** Same event, different value-add per buyer.

### Buyer segments and their decisive question

| Buyer | Decision they're making | What turns our data into their answer |
|---|---|---|
| **Commodity trading desk** | position energy/grain/metals; price supply-shock risk | refinery/port/pipeline outage feed (ASTRA) + **mirror-trade flow reconstruction** (§3) + procurement/export-quota signals; "what's the supply delta and when" |
| **Bank / MNC compliance** | onboard/exit a counterparty; sanctions exposure | entity pressure index + OpenSanctions + ownership graph + **prosecution-before-designation early warning**; "is this name about to become toxic" |
| **Insurer (war/marine/aviation)** | underwrite & price; adjudicate claims | geolocated event feed w/ corroboration + timeliness lead + Hormuz/shadow-fleet risk; "did X happen, where, how sure" |
| **Nation-state / MOD / MFA** | posture, warning, attribution | full fusion + factional/Kremlinology layer + regional mobilization/ethnic strain; degree-of-conflict tailoring (see below) |
| **Political-risk consultancy** | advise clients; write their own reports | our data as *their* raw layer — API + entity dossiers + provenance they can cite |
| **Journalists / researchers / NGOs** | investigate, publish | traceable evidence chains, entity timelines, data-dark tracker |

### The nation-state nuance you raised: value differs by *degree of conflict with Russia*

A single feed, three audiences, three emphases (config, not new code):
- **Frontline / directly threatened states** (Baltics, Poland, Finland, Ukraine): want
  **warning + mobilization/logistics indicators** — troop movements, rail loadings,
  regional recruitment bonuses, border-region governor signals. Latency and coverage matter most.
- **Sanctioning-but-distant states** (US, UK, Western Europe): want **evasion + economic-
  attrition + elite-cohesion** signals — mirror-trade, shadow fleet, factional fracture,
  data-dark suppressions. "Is pressure working, who's cracking."
- **Non-aligned / transactional states** (Gulf, India, Turkey, China-adjacent): want
  **opportunity + risk-of-secondary-sanctions + counterparty** intelligence — who to
  trade with safely, where the enforcement is heading. Compliance-flavored.

Implementation: a `buyer_profile` (or per-tenant view config) that re-weights and
re-orders the *same* claim set by these emphases. Cheap, high perceived value, and it's
how RANE justifies enterprise tiers (dedicated regional coverage) — we do it with data.

### Should we provide more analysis? Yes — but as a *thin, sourced* layer

Not consultancy prose (that's RANE's model and doesn't scale). Add:
1. **Assessments with confidence + evidence** — we already mark `hedging='assessed'`;
   surface a daily "what changed / what it means" per track, every sentence citing claims.
2. **Trend & anomaly detection** — pressure-index spikes, procurement surges, data-dark
   events, mirror-trade divergence widening. The *delta* is the insight.
3. **Scenario flags** — rules over the entity graph ("3+ siloviki-linked prosecutions in
   14 days" → factional-purge flag). Cheap, distinctive, and defensible because it's traceable.
The guardrail stays: every analytical claim carries confidence + source links, or it
doesn't ship. That IS the moat vs black-box competitors.

## 3. Mirror-trade reconstruction — YES, high value, and buildable now

Your instinct is exactly right and it's the standard technique for seeing through
Russia's customs blackout. **Russia's Federal Customs Service stopped publishing since
Jan 2022** ([ExportPlanning](https://www.exportplanning.com/en/magazine/article/2023/03/22/reconstruction-of-russian-trade-data-by-double-reporting/)),
so analysts reconstruct RU trade from **partner-country "mirror" reports** — what
everyone else says they exported to / imported from Russia ([S&P](https://www.spglobal.com/market-intelligence/en/news-insights/research/navigating-sanctions-evasion-trade-analysis-of-high-priority-goods-exports-to-russia), [CEPR](https://cepr.org/voxeu/columns/export-bans-werent-really-bans-how-russia-kept-importing-military-goods)).
The gap between mirror data and any Russian self-report (or between a transit hub's
imports-from-Russia and its onward-exports) exposes **sanctions evasion and rerouting**
through third countries (Armenia, Kazakhstan, UAE, Turkey, China, Kyrgyzstan).

**Data spine: UN Comtrade API — confirmed reachable from our infra (200).** Free tier
(rate-limited) covers monthly bilateral flows by HS code; a key raises limits.

Product concept (a fourth "track" / data module):
- Pull monthly partner-reported flows with Russia (reporterCode=643 as partner) for the
  evasion-relevant HS codes (dual-use electronics, machine tools, chips, drone parts).
- **Divergence metric**: transit-hub imports-from-Russia vs their reported onward-exports;
  or partner exports-to-Russia YoY jumps in third countries with no domestic use.
- Surface as a "trade-evasion watch" page + alerts; feeds commodity + compliance buyers
  directly, and it's a natural companion to the data-dark tracker (both are "seeing what
  Russia hides"). This is a distinct, defensible, non-maritime complement to Kpler/Kharon.

Effort: M (Comtrade adapter + monthly cron + divergence calc + page). Caveats to bake in:
mirror data lags ~2–3 months; only ~30% of country-pairs mirror cleanly ([S&P/UNCTAD](https://www.spglobal.com/market-intelligence/en/news-insights/research/navigating-sanctions-evasion-trade-analysis-of-high-priority-goods-exports-to-russia)); needs
importer-reliability weighting. Present as trend/estimate with confidence, per our norms.

## 4. Recommended next builds (from this analysis)

1. **Mirror-trade / evasion watch** (M) — UN Comtrade adapter + divergence page. Unique,
   buildable now (API reachable), serves commodity + compliance. Pairs with data-dark.
2. **Buyer-profile re-weighting** (S) — config-driven emphasis (frontline/sanctioning/
   non-aligned) over the existing claim set. Turns one feed into three products.
3. **Thin analyst layer** (S–M) — daily "what changed & what it means" per track, all
   sourced; scenario/anomaly flags over the entity graph.
4. **Ownership-graph deepening** (M) — UK Companies House + OpenCorporates onto entities,
   narrowing the Kharon/Sayari gap cheaply.
5. **Maritime/AIS** (L, paid) — shadow-fleet + Hormuz; highest commodity/insurer value but
   needs a paid AIS feed. Evaluate vs buying Kpler data wholesale.

## 5. Iran & Gulf depth — see docs/IRAN-GULF-DEPTH.md
