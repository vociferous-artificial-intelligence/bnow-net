# BNOW.NET — Go-to-Market Strategy

Strategy doc (2026-07-06). Positioning, segments, motion, packaging, launch sequence,
and the data-stream gaps that must be filled to serve each buyer. Companion to
COMPETITIVE-AND-DEMAND.md (vendor landscape) and BUSINESS-PLAN.md (team/market/pricing).

> **Last reconciled against CURRENT-STATE.md: 2026-08-17.** The product pivoted to a
> **private analyst beta** on 2026-07-13/15 (public `/access` request page; `/pricing`
> 308-redirects there; sign-in invite-only in Production; no public purchase path) — §5–6
> below are rewritten to describe that reality. Billing direction is Paddle-as-MoR per
> `docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`, superseding all Stripe
> references. §7 statuses updated: X and MTProto ingestion SHIPPED; OpenSanctions live
> but admin-only + rights-gated.

## 1. Positioning (one line)

**"Every number is clickable to its evidence, and we publish our own accuracy."**
The category is conflict/geopolitical OSINT intelligence; our wedge is *provenance +
validated accuracy* in a market where incumbents sell conclusions you must take on faith.

Three proof points no competitor pairs:
1. Transparent, data-derived source-reliability ratings (from ISW's own citation behavior).
2. Database-enforced claim→source traceability (no black box).
3. A public daily accuracy scoreboard vs expert analysis (**+14.7h median information
   lead**; measured 2026-07-05 backtest).

**Scoreboard honesty (2026-08-17):** lead with the info-lead and the *transparency of
publishing at all* — not the raw coverage percentage. Run-average coverage is ~17.5%
(~31% on nonzero days) vs the brief's ≥80% Phase-2 target; the 2026-08-15 Iran recovery
lifted Iran comparable-day coverage 20.8% → **43.5%** (16-day mean 38.0%), which is the
trajectory evidence. Any published accuracy claim must also footnote the 2026-07-29→08-15
map-worker outage (418 starved runs; digests fell back to legacy) as a scored-history
discontinuity. A methodology reviewer (PARTNER-STRATEGY.md §6) will ask about the
80%-target gap first — have the nonzero-day/comparable-day framing ready, and reframe the
brief's target as a corpus-depth roadmap number, not a current claim.

## 2. Ideal customer profiles (ranked by fit × willingness-to-pay)

| Rank | ICP | Trigger to buy | Our decisive feature |
|---|---|---|---|
| 1 | **Bank / MNC sanctions-compliance** | counterparty exposure; audit defensibility | entity pressure index + OpenSanctions + ownership graph + prosecution-before-designation early warning; provenance survives audit |
| 2 | **Commodity trading desks** (energy/grain/metals) | supply-shock P&L | ASTRA strike feed + mirror-trade evasion watch + procurement + timeliness lead |
| 3 | **Political-risk consultancies / advisory** | resell as their raw layer | API + entity dossiers + citations they can quote |
| 4 | **Insurers** (war/marine/aviation) | underwrite & adjudicate | geolocated corroborated event feed + Hormuz/shadow-fleet risk |
| 5 | **Government / MOD / MFA** | posture, warning, attribution | full fusion + Kremlinology/nuclear tracks + regional/ethnic strain |
| 6 | **Journalists / NGOs / researchers** | investigate, cite | traceable evidence chains, entity timelines, data-dark tracker (low ARPU, high credibility/marketing) |

**Beachhead: compliance + commodity.** Both have hard budgets, a measurable ROI (a single
avoided bad counterparty / a single supply call pays the subscription), and both are served
by data we already produce. Consultancies (#3) are a force-multiplier — they resell us.

**Sequencing correction (2026-08-17):** ICP #1's decisive feature is currently **not
sellable or even visible**: OpenSanctions commercial rights are unresolved (BLOCKERS
2026-07-07; HUMAN-SETUP-TODO §7 — beta/internal only), and since the 2026-07-22
match-safety release OpenSanctions presentation is **admin-only** — non-admin surfaces
render zero OpenSanctions markup and Ask receives no OpenSanctions-derived assertion.
Companies House key still pending; ownership edges stub-only. That engineering posture is
correct, but it means **the executable beachhead today is commodity/trading (ICP #2) and
consultancies (#3)** on the strike/mirror-trade/procurement surfaces, with compliance (#1)
re-promoted the moment rights + keys land. Design-partner recruiting should reflect that
order now.

## 3. Wedge sequence (land → expand)

1. **Land** on one theater + one module the buyer already needs (compliance → entity/
   sanctions + ownership; commodity → trade-evasion + strike feed).
2. **Expand** to more theaters (Iran/Gulf live), more tracks, API access, more seats.
3. **Embed** via API into the buyer's own workflow/reports (highest retention, highest
   switching cost) — but license embedding explicitly (see BUSINESS-PLAN §4).

## 4. Channels & motion

- **Content-led credibility**: the public scoreboard, data-dark tracker, and trade-evasion
  watch ARE the marketing — they demonstrate the product working, in public. Publish a
  weekly derived-insight brief (never source prose) to build the list.
- **Expert-led sales**: analysts buy from analysts. A subject-matter salesperson (ex-gov/
  ex-analyst) converts far better than generic SaaS sales (see BUSINESS-PLAN §1).
- **Regional partner motion**: treat experts as validators + door-openers first, public
  amplifiers second. The first ask is a private methodology critique and 2-3 design-buyer
  introductions, not an endorsement tweet. See PARTNER-STRATEGY.md.
- **Design-partner / founding-subscriber program** (already scaffolded: subscribe_intents):
  10–20 hand-onboarded accounts at founding pricing in exchange for feedback + logos.
- **Consultancy channel**: white-label / API resale to political-risk firms → they carry us
  into their client base.
- **Conferences / procurement lists**: OSINT, compliance (ACAMS), commodity (energy risk).

## 5. Packaging (see BUSINESS-PLAN §4–4.1 for pricing rationale and the open decision)

Working tier shape (NOT frozen — three incompatible models are live in the docs;
BUSINESS-PLAN §4.1 / OPEN-TASKS #12 is the decision gate before any priced conversation):

- **Standby** ($400/mo) — monitoring: digests + scoreboard + limited history. Intended
  land motion *when checkout opens*; today there is deliberately no self-serve path.
- **Professional** ($2–4k/mo) — full feeds, all tracks, entity graph, buyer-profile
  lenses, history. The core tier. (Registry explorer is admin-only since 2026-07-12 —
  what Professional exposes of it is part of the packaging freeze.)
- **Enterprise** (custom, $50k–150k+/yr) — API, embedding rights, multiple theaters, SLA,
  named analyst, custom modules. Where the ARR concentrates. Sales-assisted/invoiced.
- **API / usage** add-on — for consultancies & embedders (per-call or committed volume).

Note the unresolved bundle question: the brief sells regional bundles ("Gulf"), these
tiers are geography-blind. Decide deliberately (BUSINESS-PLAN §4.1).

## 6. Launch sequence (rewritten 2026-08-17 to the private-beta motion that exists)

**Current funnel:** public marketing surfaces (landing, scoreboard, signals teaser,
countries, critical-materials) → `/access` beta-request form (email + use-case; reviewed
at `/admin/access`) → operator-approved invite → invite-only magic-link sign-in
(`SIGNIN_MODE=invite`, Production since 2026-07-15) → accepted-user product. No prices
shown anywhere; `/pricing` 308-redirects to `/access`. **This is correct today** (the
Paddle plan endorses it) — the list-builder is the access queue, not a checkout.

1. **Private analyst beta** (now): hand-invite 10–20 design partners — commodity +
   consultancy first, compliance staged behind data rights (§2 sequencing correction).
   Beta grants are explicit and audited; `subscribe_intents` seeds the sales lead list,
   never an entitlement.
2. **Partner/validator motion** (unblocked since 2026-07-15 — bnow.net live, Postmark
   DKIM/SPF/DMARC pass): run PARTNER-STRATEGY.md §6 outreach with the honest scoreboard
   framing from §1. Not started as of 2026-08-17.
3. **Freeze packaging** (BUSINESS-PLAN §4.1) → Paddle AUP submission + sandbox (plan
   Phases A–C, ~2–3 wks eng) → checkout behind flags (Phases D–F, Standby self-serve
   first, Professional/Enterprise sales-assisted).
4. **Publish the weekly derived brief** once partner feedback confirms the framing; open
   the API in private beta to 1–2 consultancies under explicit license terms
   (BUSINESS-PLAN §3).
5. Add Gulf theaters to "live" as sourcing deepens; maritime pilot only if a buyer signs
   (no speculative AIS spend).

## 7. Data-stream gaps to fill (the honest list)

Grouped by what unlocks which buyer. **P = priority (1 highest).**

### Coverage gaps (breadth/accuracy of what we ingest) — statuses 2026-08-17
- ~~**P1 — X / Twitter via twitterapi.io**~~ ✅ **SHIPPED 2026-07-14**: lease-aware
  insert-gated poller over 364 registry accounts; 175,842 X docs total / ~3,600/day as of
  2026-08-14; spend ~$0.15/1K tweets, running $0.74–1.66/day under a $2.50/day cap
  (cumulative $43.81 of the $75 all-time cap). Bounded auto-recovery production-proven
  Aug 10–14. Remaining lever is roster/conversion tuning (OPEN-TASKS #19), not access.
- ~~**P1 — Telegram MTProto**~~ ✅ **SHIPPED 2026-07-11**: live hourly cron, ROCA-top-120
  roster, cross-transport dedupe; free API.
- **P2 — Maritime / AIS** (paid: aisstream/MarineTraffic/Kpler-wholesale): shadow-fleet +
  Hormuz tanker tracking. Unlocks insurers + deepens commodity. Consolidation note: Kpler
  bought Spire Maritime (2025) and Windward went private (FTV, $271M) — wholesale-data
  conversations now route through bigger owners; do not buy speculatively (partner rule).
- **P2 — zakupki procurement** (blocked egress): unchanged; needs RU-region proxy
  (~$10–50/mo) or commercial mirror. Highest-value RU capability/casualty signal.
- **P3 — ACLED** (`ACLED_API_KEY`): unchanged (fixture stub, unwired).
- **P3 — Satellite imagery** (Planet/Umbra, expensive): unchanged; nation-state/insurer
  tier only.

### Depth gaps (making existing streams richer) — statuses 2026-08-17
- **P1 — OpenSanctions**: live PAYG enrichment (€0.10/query; July: 780 req / $85.80) with
  claim-linked spend gating. **But commercial rights remain unresolved and presentation is
  admin-only since the 2026-07-22 match-safety release** — compliance surfaces are
  beta/internal until a license lands (HUMAN-SETUP-TODO §7). The GTM-critical item is now
  the *license*, not the key.
- **P2 — Companies House / OpenCorporates keys**: unchanged (application submitted, key
  pending / freemium unevaluated); ownership edges stub-only. Narrows the Kharon/Sayari
  gap for compliance once live.
- **P2 — UN Comtrade key**: keyless annual works (2,785 rows live). Premium pricing
  verified 2026-08-17: **$2,000/yr individual / $12,000/yr for-profit institutional** for
  monthly-frequency + higher limits — a real budget line, buy against a named design
  partner, not speculatively.
- **P3 — Financial-market context** (integrate Bloomberg/Refinitiv, don't rebuild):
  unchanged.

### Structural gaps (capabilities we don't have at all)
- **G1 — Human verification layer**: no expert-in-the-loop confirmation. The scoreboard is
  our proxy for accuracy, but high-stakes buyers (gov/insurer) will want a "verified by
  analyst" tier. Requires regional experts (BUSINESS-PLAN §1). This is the biggest gap.
  **Status 2026-08-17: still the open decision** (HUMAN-SETUP-TODO §13) — and it now also
  gates the Paddle AUP category (whether analyst services are "ancillary"), the premium
  tier, and the first-hire trigger (BUSINESS-PLAN §6). One decision, four dependencies,
  open since 2026-07-06. Decide it next.
- **G2 — Historical archive depth**: ingestion only goes back to our start window; the ISW
  registry is deep but raw-doc history is shallow. Backfill or accept "from date X".
- **G3 — Alerting / real-time push**: we generate daily digests; Dataminr's edge is
  instant alerts. A streaming-alert tier (webhook/email on threshold events) is needed for
  commodity + insurer time-sensitivity.
- **G4 — Per-source country + language ground-truth**: registry lacks per-source country;
  minority-language coverage is heuristic. Fine now, matters at scale.
- **G5 — Ground-truth for the Gulf theaters**: no daily expert reference beyond Iran (ISW
  Iran Update). Gulf validation needs UKMTO/Ambrey or an analyst benchmark. *(Iran itself
  materially improved 2026-08-15: citations current, 6 new ir feeds, comparable-day
  coverage 43.5%.)*

### What we deliberately will NOT build (integrate instead)
Market-data terminals (Bloomberg), deep corporate-registry graphs at Sayari scale, cyber
threat intel (Recorded Future). We fuse and cite these, we don't rebuild them.
