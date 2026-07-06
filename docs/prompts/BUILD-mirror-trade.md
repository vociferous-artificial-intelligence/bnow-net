# BUILD: Mirror-trade / sanctions-evasion watch

Paste into a fresh Claude Code session in /home/go/code/bnow.net. Read AGENTS.md and
docs/COMPETITIVE-AND-DEMAND.md §3 first. Rationale: Russia's customs data went dark
Jan 2022; partner-country "mirror" reports reconstruct RU trade and expose evasion via
transit hubs. This is unique, buildable now, serves commodity + compliance buyers.

## Goal
A "trade-evasion watch" module: pull partner-reported bilateral trade with Russia from
UN Comtrade, compute divergence metrics that flag rerouting through third countries,
surface on a public/gated page with trend + alerts.

## Data source (confirmed reachable from Vercel egress, 200)
UN Comtrade API: `https://comtradeapi.un.org/public/v1/preview/C/M/HS?...`
- Russia partnerCode/reporterCode = 643. Flows: X (export) / M (import).
- Free preview tier is rate-limited; `COMTRADE_API_KEY` (register at comtradeplus.un.org)
  raises limits — treat as keyed adapter + fixture stub (project convention), key optional.
- Local WSL2 host is blocked from many hosts — verify Comtrade locally; if blocked, run
  the fetch via a Vercel cron route like the other external pulls.

## Build steps
1. Migration (additive): `trade_flows` table — {reporter_code, partner_code, flow, hs_code,
   period (YYYY-MM), value_usd, qty, source, fetched_at}, unique on the natural key.
   Optionally `trade_divergences` for computed results, or compute on read.
2. `src/lib/trade/comtrade.ts` — fetch monthly flows for a config list of HS codes
   (dual-use focus: 8542 chips, 8471 computers, 8479/8466 machine tools, 8802/8806 drones/
   UAV, 8703 vehicles) and transit partners (Armenia 51, Kazakhstan 398, Kyrgyzstan 417,
   UAE 784, Turkey 792, China 156, Georgia 268). Keyed/stubbed.
3. `src/lib/trade/divergence.ts` (pure, tested) — metrics:
   - partner exports-to-Russia YoY jump with no domestic-use basis (rerouting proxy);
   - transit-hub imports-from-Russia vs onward-exports gap;
   - flag when divergence > threshold. Return {partner, hs, period, metric, value, flag}.
4. `scripts/trade-pull.ts` + `/api/cron/trade` (CRON_SECRET) — monthly cron in vercel.json.
5. Page `/trade` (or `/evasion`) — divergence table, per-partner trend, "widening" flags.
   Decide gated vs public (recommend gated core, teaser public — it's premium).
6. Tests: divergence math on fixtures; adapter parse on a saved Comtrade JSON fixture.

## Caveats to bake in (present honestly, per project norms)
Mirror data lags ~2-3 months; only ~30% of country-pairs mirror cleanly; needs importer-
reliability weighting. Label everything estimate/trend with confidence. Cite S&P/CEPR/
UNCTAD methodology in the page footer. Do NOT present as real-time or exact.

## Definition of done
Migration applied; Comtrade adapter live-or-stubbed; divergence page deployed with real
data for ≥3 transit partners; monthly cron registered; tests green; docs/PROGRESS +
decision log updated; blocker noted if COMTRADE_API_KEY needed for full coverage.
