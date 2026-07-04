# Stage 1 Review — ISW scraper + source registry

**Date:** 2026-07-04 · **Status: PASS (all exit criteria exceeded)**

## Exit criteria
| Criterion | Target | Actual | Pass |
|---|---|---|---|
| Deduped sources | ≥2,000 | 6,985 | ✅ |
| Endnote parse rate | >90% | 97.65% | ✅ |
| Registry queryable in app | — | /registry live in prod | ✅ |

Full numbers in docs/PHASE0-FEASIBILITY.md.

## Built
- Sitemap-based archive discovery (1,578 URLs), polite cached fetcher (2s/host, sha1
  disk cache, custom UA), full backfill in ~55 min.
- Parser (new WP layout + paragraph fallback), ' dot ' de-obfuscation, hedging
  classifier (rules-first), source canonicalization, batch DB loader,
  full-recompute registry materializer.
- 17 fixture tests on parser components.

## Key decisions
- Unhedged ISW declaratives stay `unknown` (mid-trust 0.5) rather than being forced
  into a hedge class — protects the reliability signal's honesty.
- Source = channel/outlet, not post — the registry is about *who*, citations keep *what*.
- Cue phrases capped at 60 chars in DB; prose only in internal cache (legal guardrail).

## Known debt
- 37 unparsed pages (2.35%): year-less titles + endnote-less update posts. Fix path
  documented in feasibility report; not blocking.
- Hedging rules coverage ~60%; LLM-assist refinement queued for Stage 7 / when key lands.
- criticalthreats.org mirror fallback unimplemented (primary never failed).

## Risks to later stages
- ISW layout change would break the parser → fixtures + parse-rate metric on /health
  would catch it; crawler is cache-first so nothing is lost.
