# Critical-Materials Choke-Point Tracker — analysis & build case

Doc (2026-07-06). Should we build a critical-materials / supply-chain dependency tracker?
Research, competitive gap, GTM case, and build design.

## The idea

Track US (and, later, other nations') **structural trade dependencies** — the choke points
where imports of a critical good are concentrated in one or few geopolitically-exposed
suppliers — and **fuse the dependency data with our live conflict/sanctions/event
intelligence**. E.g.: "US imports 92% of advanced-node chips from Taiwan; here is the
concentration metric, and here are the live Taiwan-Strait / export-control signals that
threaten it, each source-linked."

The user's dependency list maps to trade goods:

| Dependency | Chokepoint | HS code(s) |
|---|---|---|
| Advanced chips | Taiwan, S. Korea | 8542 (integrated circuits), 8541 |
| Memory / EV battery cells | S. Korea, China | 8507 (Li-ion batteries) |
| Chip chemicals / wafers | Japan | 3818 (doped wafers), 3707 (photoresist chemicals) |
| Rare earths & magnets | China | 2805, 2846 (REE metals/compounds), 8505.11 (permanent magnets) |
| Gallium / germanium | China | 8112, 2804 |
| Active pharma ingredients | China, India | 2941 (antibiotics), 2933/2934 |
| Semiconductor back-end (packaging/test) | Malaysia, Vietnam, Thailand | 8542 (re-export share) |
| Crude oil | Canada | 2709 |
| Uranium (nuclear fuel) | Canada, Kazakhstan | 2844 |

## Does anyone sell this? (competitive gap)

- **Benchmark Mineral Intelligence, CRU, SFA Oxford** ([Benchmark](https://www.benchmarkminerals.com/rare-earths)) —
  deep *mineral-specific* data: prices, cost curves, value-chain, forecasts. Commodity-
  analyst products (expensive). **Not fused with geopolitical-event intelligence, and
  narrow to minerals.**
- **Interos, Everstream, Sourcemap, SupplyWisdom, Z2Data** ([Interos](https://www.interos.ai/), [Everstream](https://www.everstream.ai/)) —
  *corporate supply-chain risk* platforms: map YOUR suppliers tier-by-tier, alert on
  disruptions across 300M+ companies. Enterprise procurement tools. **Bottom-up from a
  company's own BOM, not top-down national trade-dependency + conflict fusion; and no
  transparent provenance / reliability scoring.**
- **Bloomberg / govt (USGS, USTR, CRS)** — publish dependency stats, but static reports,
  not a live fused product.

**The gap we fill:** nobody pairs (a) national trade-dependency concentration metrics with
(b) live, source-traced conflict/sanctions/export-control event intelligence and (c) our
reliability/provenance model. Benchmark tells you the price of dysprosium; Interos maps
your vendors; **we tell you which choke point is under geopolitical stress right now, with
the evidence.** That fusion is our defensible, distinctive angle — and it reuses machinery
we already have (Comtrade + event pipeline + entity graph + signals).

## GTM case — is it substantial?

**Yes, and it widens the buyer base beyond conflict-desks:**
- Opens **corporate strategy / procurement / risk** teams (every large manufacturer, auto,
  defense, pharma, electronics) — a far larger market than conflict-OSINT alone.
- Opens **government economic-security / industrial-policy** units (CHIPS Act, critical-
  minerals strategy, allied supply-chain initiatives).
- Different nations weight differently (the user's insight): US → chips/rare-earths/pharma;
  EU → energy/rare-earths; Japan/Korea → energy/food; China → food/energy/semis-equipment.
  A *configurable-per-nation* dependency lens is a product in itself.
- It's a **strong sales artifact even while worldwide coverage is incomplete**: the
  dependency data (Comtrade) is global from day one; the *event-fusion* deepens as our
  theater coverage grows. So it sells now and improves with the roadmap.

**Caveat (honest):** the "live event stress" layer is only as good as our theater coverage.
Taiwan/Korea/Japan/China event coverage is thin today (we're RU/UA/Iran-deep). So v1 leads
with the *dependency + concentration data* (strong, global, immediate) and *labels* the
event-fusion as it fills in. This is fine — the dependency map alone is a compelling,
unique artifact, and it creates the pull to expand coverage to Asia.

## Build design (v1 — reuses Comtrade)

**Data:** UN Comtrade (already integrated, reachable). For each critical HS code, pull
**US imports (reporter=842, flow=M) from all partners** for recent years → compute:
- **Top-supplier share** (largest partner's % of US imports of that good).
- **Concentration** (HHI / top-3 share) — the choke-point severity.
- **Exposure flag**: high concentration in a geopolitically-sensitive supplier (Taiwan/
  China/Russia/etc.).

**Schema:** reuse `trade_flows` (general: reporter/partner/flow/hs/period/value). No new
table needed for v1; add a `critical_materials` config (HS + label + chokepoint context).

**Compute (pure, tested):** `src/lib/materials/concentration.ts` — from flows for a good,
return {topSupplier, topShare, hhi, top3Share, flag}. Analogous to divergence.ts.

**Page:** `/critical-materials` — per-good dependency cards (top supplier, concentration,
trend) + (where available) linked live signals/events for the chokepoint country. Public
teaser (great marketing), gated detail.

**Cron:** fold into the monthly trade pull (`/api/cron/trade` extended, or a sibling).

**Later:** per-nation lens (EU/JP/KR reporters), event-fusion as coverage grows, alerting
when a chokepoint's concentration + live-stress crosses a threshold.

## Verdict

Build v1 now. It's low-cost (reuses Comtrade), widens the market materially (corporate +
gov economic-security), is a strong standalone sales artifact today, and its weakness
(thin Asia event coverage) is exactly the pull that justifies expanding theaters. High
GTM leverage per unit of build effort.
