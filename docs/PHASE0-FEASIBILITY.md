# Phase 0 Feasibility Report — ISW-derived Source Registry

**Date:** 2026-07-04 · **Verdict: FEASIBLE, exit criteria exceeded**

## Numbers (full-archive run)

| Metric | Target (brief §8.7) | Actual |
|---|---|---|
| Reports discovered | ~1,500 | **1,578** (Yoast sitemap enumeration) |
| Reports fetched | — | **1,577** (1 persistent timeout) |
| Endnote parse rate | >90% | **97.65%** (1,540/1,577) |
| Citations extracted | — | **280,738** raw → **251,112** deduped rows |
| Deduped sources | ≥2,000 | **6,985** (3.5×) |
| Registry queryable in app | yes | **/registry live** (filter/sort/search) |

## Registry composition

| Platform | Sources | Avg reliability | Decayed |
|---|---|---|---|
| telegram | 3,019 | 0.600 | 1,804 |
| other | 2,355 | 0.493 | 1,776 |
| x | 1,299 | 0.658 | 930 |
| gov | 260 | 0.481 | 165 |
| independent_media | 30 | 0.501 | 3 |
| state_media | 22 | 0.472 | 1 |

Signals worth noting:
- **Telegram dominates ISW's sourcing** (43% of registry) — validates the product's
  Telegram-first ingestion strategy.
- **X sources rate highest** (0.658) — the geolocation/footage-verification community
  drives `confirmed` hedging.
- **Decay is massive** (60% of telegram sources absent ≥12 months) — source churn is
  real and the decay flag earns its place in the schema.
- Hedging classification coverage: 53–72% of citations per year carry an explicit
  hedge cue; the remainder are ISW unhedged declaratives, deliberately kept `unknown`.

## Parse failures (2.35%)

- 26 pages with no endnote block (mostly short "update"-format posts).
- 11 with undateable titles (e.g. "…Assessment, April 1" — no year anywhere in title;
  year inference from sitemap neighbor is a known-debt fix, ~30 min).
- 1 URL times out consistently (Feb 27, 2022 warning update).

## Method notes

- New WP site layout (mid-2025 redesign) is uniform across migrated 2022–2026 content:
  endnotes in an accordion as `[N] url ; url` plain text.
- ISW obfuscates hostile-state domains as "president dot gov.ua" — de-obfuscated in parse.
- Source identity is channel/account/outlet-level (t.me posts collapse to channel,
  x statuses to account, articles to domain).
- Reliability v1 = hedging-weighted mean (confirmed 1.0 / assessed .75 / unknown .5 /
  claimed .4 / unverified .15). Documented in registry-materialize.ts.
- Legal: DB stores citation URLs, classifications, and ≤60-char cue phrases only.
  Report prose lives exclusively in the internal HTML cache.
