# BNOW.NET — Go-to-Market Strategy

Strategy doc (2026-07-06). Positioning, segments, motion, packaging, launch sequence,
and the data-stream gaps that must be filled to serve each buyer. Companion to
COMPETITIVE-AND-DEMAND.md (vendor landscape) and BUSINESS-PLAN.md (team/market/pricing).

## 1. Positioning (one line)

**"Every number is clickable to its evidence, and we publish our own accuracy."**
The category is conflict/geopolitical OSINT intelligence; our wedge is *provenance +
validated accuracy* in a market where incumbents sell conclusions you must take on faith.

Three proof points no competitor pairs:
1. Transparent, data-derived source-reliability ratings (from ISW's own citation behavior).
2. Database-enforced claim→source traceability (no black box).
3. A public daily accuracy scoreboard vs expert analysis (+~14h median information lead).

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

## 5. Packaging (see BUSINESS-PLAN §5 for full pricing rationale)

- **Standby** ($400/mo) — monitoring: digests + scoreboard + limited history. Self-serve,
  land motion, list-builder.
- **Professional** ($2–4k/mo) — full feeds, registry explorer, all tracks, entity graph,
  buyer-profile lenses, history. The core tier.
- **Enterprise** (custom, $50k–150k+/yr) — API, embedding rights, multiple theaters, SLA,
  named analyst, custom modules. Where the ARR concentrates.
- **API / usage** add-on — for consultancies & embedders (per-call or committed volume).

## 6. Launch sequence (next ~2 quarters)

1. Harden RU/UA + Iran to "reference-grade": lift ISW coverage (X + MTProto keys), fill
   the priority data gaps in §7, add the per-digest assessment layer.
2. Stand up billing (Stripe is modeled + flagged; wire checkout) + entitlements + the
   anti-redistribution controls (BUSINESS-PLAN §4).
3. Run the founding-subscriber program (10–20 design partners, compliance + commodity).
4. Publish the weekly derived brief; open the API in private beta to 1–2 consultancies.
5. Add the Gulf theaters to "live" as sourcing deepens; open a maritime pilot if a buyer signs.

## 7. Data-stream gaps to fill (the honest list)

Grouped by what unlocks which buyer. **P = priority (1 highest).**

### Coverage gaps (breadth/accuracy of what we ingest)
- **P1 — X / Twitter via twitterapi.io** (`X_API_KEY`, paid): 166 recently-ISW-cited
  accounts we don't ingest. Single biggest purchasable accuracy gain; lifts scoreboard
  coverage. Chosen path is the third-party `api.twitterapi.io` API, not official
  developer.x.com, for materially lower testing/beta cost.
- **P1 — Telegram MTProto** (`TELEGRAM_API_ID/HASH`): channels with web-preview disabled
  (some MoD/siloviki), plus history depth. Cheap (free API), 20 min to obtain.
- **P2 — Maritime / AIS** (paid: aisstream/MarineTraffic/Windward): shadow-fleet + Hormuz
  tanker tracking. Unlocks insurers + deepens commodity. Kpler's moat — buy or partner.
- **P2 — zakupki procurement** (blocked egress): highest-value RU capability/casualty
  signal; needs RU-region proxy or commercial mirror.
- **P3 — ACLED** (`ACLED_API_KEY`): structured event cross-check for validation.
- **P3 — Satellite imagery** (Planet/Umbra, expensive): facility activity, damage
  assessment (Iran nuclear, refineries). Nation-state/insurer tier only.

### Depth gaps (making existing streams richer)
- **P1 — OpenSanctions API key**: flips entity enrichment from seeded stub to full
  real-time sanction/PEP coverage across all entities. Compliance-critical.
- **P2 — Companies House / OpenCorporates keys**: real ownership/officer edges (build 5 is
  wired, stub-only now). Narrows the Kharon/Sayari gap for compliance.
- **P2 — UN Comtrade key**: raises rate limits + monthly-frequency mirror-trade (currently
  keyless annual). Sharpens the evasion watch for commodity/compliance.
- **P3 — Financial-market context** (integrate Bloomberg/Refinitiv, don't rebuild): ruble/
  bond/commodity price overlays on events for trading desks.

### Structural gaps (capabilities we don't have at all)
- **G1 — Human verification layer**: no expert-in-the-loop confirmation. The scoreboard is
  our proxy for accuracy, but high-stakes buyers (gov/insurer) will want a "verified by
  analyst" tier. Requires regional experts (BUSINESS-PLAN §1). This is the biggest gap.
- **G2 — Historical archive depth**: ingestion only goes back to our start window; the ISW
  registry is deep but raw-doc history is shallow. Backfill or accept "from date X".
- **G3 — Alerting / real-time push**: we generate daily digests; Dataminr's edge is
  instant alerts. A streaming-alert tier (webhook/email on threshold events) is needed for
  commodity + insurer time-sensitivity.
- **G4 — Per-source country + language ground-truth**: registry lacks per-source country;
  minority-language coverage is heuristic. Fine now, matters at scale.
- **G5 — Ground-truth for the Gulf theaters**: no daily expert reference beyond Iran (ISW
  Iran Update). Gulf validation needs UKMTO/Ambrey or an analyst benchmark.

### What we deliberately will NOT build (integrate instead)
Market-data terminals (Bloomberg), deep corporate-registry graphs at Sayari scale, cyber
threat intel (Recorded Future). We fuse and cite these, we don't rebuild them.
