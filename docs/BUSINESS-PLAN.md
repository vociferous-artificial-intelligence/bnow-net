# BNOW.NET — Business Plan

Strategy doc (2026-07-06). Team/org needs, market sizing & ARR model, content-protection
strategy, and pricing-mechanism recommendation. Companion to GTM-STRATEGY.md.

> **Last reconciled against CURRENT-STATE.md: 2026-08-17.** Market figures refreshed and
> §5 (unit economics) + §6 (cash & runway) added from live operational spend data. Billing
> direction: the 2026-07-19 Paddle plan (`docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`)
> supersedes every earlier Stripe reference; packaging itself (bundles vs flat tiers,
> OPEN-TASKS #12) is still an open operator decision — see §4.1.

---

## 1. Team & experts — do we need a larger team?

**Yes — but sequenced, and the highest-leverage hires are domain experts who both verify
AND sell.** The product is now technically buildable by a very small eng team (the whole
platform runs on cron + Vercel + Neon). The binding constraints are *credibility* and
*distribution*, not code.

### The core insight: experts are dual-purpose (verify + sell)
In intelligence, **analysts buy from analysts.** A regional expert who publicly verifies
our Russia/Iran output is simultaneously (a) the quality layer high-stakes buyers demand
(GTM gap G1), (b) the credibility that closes enterprise deals, and (c) the author of the
weekly briefs that drive the content-led funnel. One hire, three jobs. This is why RANE/
Stratfor lead with named analysts — the person *is* the product's trust.

### Hiring sequence

| Phase | Hire | Why | Verify? | Sell? |
|---|---|---|---|---|
| Now (0–2) | **Founder + 1 eng** | keep shipping; integrations, theaters | — | founder-led |
| Seed (3–5) | **Russia/Eurasia analyst** (Russian, ideally ex-gov/think-tank) | prompt tuning, verification tier, briefs, deal credibility | ✅ | ✅ (SME sales) |
| Seed | **Enterprise sales lead** (ex-intel/compliance network) | relationship-driven enterprise motion | — | ✅ |
| A (6–12) | **Iran/Gulf analyst** (Farsi/Arabic) | Iran/Gulf verification + expansion | ✅ | ✅ |
| A | **2nd/3rd engineer** | maritime/AIS, API, entitlements, scale | — | — |
| A | **Customer success / analyst-onboarder** | retention, expansion, design-partner mgmt | partial | expand |
| B | **Compliance/data-licensing counsel** (fractional first) | licensing terms, data-rights, enforcement | — | — |

### Verification model (the human layer, GTM gap G1)
Not full manual review — that doesn't scale. Instead **expert-in-the-loop on the tail**:
the system auto-produces + auto-scores; experts spot-check flagged/high-severity signals,
tune the reliability weights and prompts, and sign off a "verified" badge on a premium
tier. Regional stringers/freelancers (per-theater, contract) extend language + ground-truth
coverage cheaply before full-time hires are justified.

**Bottom line:** you don't need a *large* team — you need ~2 credible regional analysts and
one expert salesperson before a big eng build-out. The experts pay for themselves as the
sales-credibility layer.

---

## 2. Market size & ARR projection

### Market context (grounded — refreshed 2026-08-17)
- OSINT market: estimates vary widely by scope. Current spread: **$12.7B (2025) → $133.6B
  (2035), ~26.7% CAGR** ([Global Market Insights](https://www.gminsights.com/industry-analysis/open-source-intelligence-osint-market));
  the 2025-era Exactitude figure ($8.7B → $46B/2034, ~18%) is now the conservative end.
  Treat "low-teens $B today, high-teens-to-high-twenties % CAGR" as the honest range.
- Threat-intelligence market: **$10.4B (2026) → $18.9B (2031), ~12.7% CAGR**
  ([Mordor](https://www.mordorintelligence.com/industry-reports/threat-intelligence-market));
  MarketsandMarkets' earlier $11.5B (2025) → $23B (2030) remains in the same band.
- Geopolitical-risk intelligence is a fast-growing subset; incumbents price $20k–150k+/yr
  (RANE ~$50k, Dataminr $20–100k, Kpler/Kharon enterprise). 2025–26 consolidation —
  Mastercard/Recorded Future closed, Windward taken private at $271M, Kpler absorbing
  Spire Maritime and Bridgeton on $1B of Sixth Street capital — confirms strategic
  buyers are paying up for exactly this category (detail: COMPETITIVE-AND-DEMAND.md §1).

These top-down numbers are context, not our number. We size **bottom-up** — the honest way.

### Bottom-up SAM (addressable accounts × realistic ARPU)

| Segment | Addressable accounts (global, premium) | Blended ARPU/yr | Segment SAM |
|---|---|---|---|
| Bank/MNC sanctions-compliance | ~1,500 | $40k | $60M |
| Commodity trading desks | ~400 | $50k | $20M |
| Political-risk consultancies | ~300 | $60k (incl. resale) | $18M |
| Insurers (war/marine/aviation) | ~200 | $40k | $8M |
| Government / MOD / MFA units | ~250 | $80k | $20M |
| Journalists / NGOs / academia | ~2,000 | $6k | $12M |
| **Total SAM** | | | **~$138M** |

This is the *conflict/sanctions-OSINT* slice we can credibly serve — not the whole OSINT
TAM. Adding theaters (China, more Gulf, Africa) and modules expands it materially.

### ARR model — three scenarios (stated assumptions)

Assumes: land-and-expand, blended ARPU rising as accounts move Standby→Pro→Enterprise,
enterprise/API concentrating ARR, ~85% gross retention improving with embedding.

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| **Conservative** — solo-ish, RU/UA only, self-serve + a few enterprise | 15 accts · ~$18k ARPU · **~$270k** | 45 · $22k · **~$1.0M** | 100 · $28k · **~$2.8M** |
| **Base** — 2 analysts + sales, Iran live, consultancy channel | 25 · $22k · **~$550k** | 90 · $30k · **~$2.7M** | 220 · $38k · **~$8.4M** |
| **Aggressive** — full team, maritime, API/embedding, multi-theater | 40 · $28k · **~$1.1M** | 160 · $40k · **~$6.4M** | 400 · $52k · **~$21M** |

**Read this as a range, not a promise.** The Base case reaching **~$8M ARR by Year 3 on
~220 accounts** is a defensible target for a focused conflict-intelligence product at
these price points — it's ~6% of the bottom-up SAM, which is realistic for a differentiated
entrant. The single biggest swing factor is the enterprise/API mix (embedding deals at
$100k+ move the whole curve) — which depends on the anti-redistribution controls in §4.

---

## 3. What protects us — and the redistribution problem

### The honest threat
Our user-facing artifacts (digests, entity dossiers, scores) are text — trivially
copy-pasteable. A subscriber could re-publish or a scraper could lift content and strip
attribution. This is the central IP risk. **Pure content is not defensible; the moats are
structural.**

### Our real moats (in order)
1. **The live, updating feed + provenance is the product, not any static snapshot.** A
   stolen digest is stale in 6 hours and carries no click-through to sources. The value is
   the continuously-scored, source-linked stream — which you can only get by subscribing.
2. **The validated accuracy record** — reproducing our scoreboard credibility requires
   re-running the whole pipeline against ISW for months. Uncopyable.
3. **The source-reliability registry** — 4.5 years of ISW-derived weights is a data asset
   competitors would have to rebuild from scratch.
4. **Traceability as a feature** — our value literally *is* the citation chain; stripping
   attribution destroys the thing that makes it worth stealing.

### How other data providers handle it (grounded)
- **Contractual licensing separation** — Bloomberg/Refinitiv split rights into internal-use
  / redistribution / resale / AI-training / retention, and price/restrict each; redistribution
  is contractually barred and *enforced* (the [Bloomberg–UBS](https://a-teaminsight.com/blog/bloomberg-and-ubs-settle-legal-dispute-about-breaches-of-data-licensing-agreements/) licensing suit is the template).
- **Entitlements** — access is gated per-user/per-entitlement; off-platform use needs a
  separate license ([Bloomberg data ToS](https://data.bloomberg.com/tos/)).
- **Forensic watermarking / canary traps** — each subscriber gets a functionally-identical
  but uniquely-fingerprinted copy; when leaked content surfaces, the source account is
  identifiable ([canary trap](https://en.wikipedia.org/wiki/Canary_trap)). Detective, not
  preventive — but it changes behavior once leaking is known to be traceable.
- **Honeytokens + fingerprinting** — seeded canary records + open-web scanning to detect
  lifted content even after cropping/re-encoding.

### Our anti-redistribution plan (layered, pragmatic)
1. **Licensing terms first** — explicit internal-use-only default; redistribution/resale/
   embedding/AI-training each a separate paid right. This is the primary control.
2. **Auth entitlements** (already have the gate) — per-account access, rate limits, no
   bulk export on lower tiers; API keys metered.
3. **Per-subscriber canary marking** — seed each account's feed with a unique invisible
   fingerprint (a benign marker in ordering / a canary entity / whitespace); if content
   leaks, trace the account. Cheap to add, high deterrence.
4. **Open-web fingerprint scanning** — periodically search for our distinctive derived
   phrasings/scores to catch redistribution; enforce via the license.
5. **Make the live value inseparable from the subscription** — the click-through,
   freshness, and scoreboard only work logged-in; static copies are inert.

**Decision:** invest in (1)+(2) now (they're table-stakes and mostly built), add (3) before
enterprise/API launch (it's what makes $100k embedding deals safe to sell), treat (4) as
periodic ops. Do not over-invest in DRM — it's detective everywhere and our structural
moats matter more.

---

## 4. Pricing mechanism — per-seat vs per-org vs usage

### What the market shows (grounded)
- **Per-seat** (ZoomInfo $15k+/seat) is under pressure: "seat-based pricing breaks down
  under AI workloads" where agents make thousands of calls per human task ([L.E.K.](https://www.lek.com/insights/tmt/us/ei/seats-calls-why-api-monetization-next-pricing-frontier-ai-age)).
- **Usage/credit** ties cost to output, wins for teams of 3+ and API/agent use ([Cleanlist](https://www.cleanlist.ai/blog/15-best-b2b-data-enrichment-providers-in-2025-ranked)).
- **Hybrid (base platform fee + usage)** is now the most common enterprise-API model —
  balances predictability and scale.

### Recommendation for BNOW: **per-organization site license, not per-seat**

Rationale specific to us:
1. **Intelligence is consumed team-wide, not per-desk.** A compliance or trading team
   shares the feed; per-seat friction suppresses exactly the internal spread that drives
   stickiness and word-of-mouth. Incumbents in *intelligence* (RANE, Kpler, Kharon) sell
   org/enterprise licenses, not per-seat — because the buyer is an org function.
2. **Per-seat invites credential-sharing** (the redistribution risk §4) and caps expansion.
3. **The value scales with the org's exposure/AUM, not headcount** — an org site license
   priced by tier/theaters/modules captures value better than counting logins.

**Structure:**
- **Standby** $400/mo — org, capped scope (1 theater, digests+scoreboard, no export/API).
- **Professional** $2–4k/mo — org site license, all theaters + tracks + registry + entity
  graph + lenses, reasonable-use, limited export.
- **Enterprise** custom ($50k–150k+/yr) — org-wide, API, embedding rights, SLA, named
  analyst, custom modules/theaters. **Priced by value drivers**: # theaters, modules
  (maritime, mirror-trade, ownership), API volume, embedding/redistribution rights.
- **API / usage add-on** — hybrid: committed base + metered overage, for consultancies and
  embedders (this is where usage-based fits, per the market signal).

**Avoid** pure per-seat (friction + sharing risk) and pure usage on the core feed (buyers
want budget predictability for a monitoring product). Use **org-tier base + usage only on
the API layer** — the hybrid the market has converged on.

### 4.1 Packaging status (2026-08-17) — one open decision, three live models

Three incompatible price structures exist in the repo simultaneously and **none is
decided** (OPEN-TASKS #12; Paddle plan §2.3 refuses to encode the mismatch):

| Source | Model |
|---|---|
| PRODUCT-BRIEF.md §6.5/§7.3 | Regional bundles: full $2–5k/mo, standby $300–500/mo, single country ~40% of bundle, global $10–15k/mo, annual-first at 40–50% off |
| This doc §4 / GTM-STRATEGY.md §5 | Standby $400/mo · Professional $2–4k/mo · Enterprise $50–150k/yr, per-org, geography-blind |
| Seed data (`scripts/seed.ts`) | standby $400/mo · full_monthly $3,000/mo · full_annual $19,800/yr |

The brief's bundle logic ("sell Gulf, not the Hormuz situation") is a *strategic* churn/
crisis-decay argument the later flat-tier model dropped silently rather than rebutted —
decide it deliberately, not by default. Freezing one catalog matrix is the gate for the
Paddle AUP submission, checkout, and any priced outreach.

**Payment provider fees (verified 2026-08-17):** Paddle as Merchant of Record at the
published 5% + $0.50 checkout rate / 3.5% bank-transfer invoicing. Net-revenue effect at
seed prices: $400 → ~$379.50, $3,000 → ~$2,849.50, $19,800 → ~$18,809.50 (checkout) or
~$19,107 (invoice). Model ARR at ~0.95× gross for self-serve, ~0.965× for invoiced
enterprise. No Stripe work should proceed — see the Paddle plan.

### Expansion levers (how ARPU rises within an account)
Add theaters → add modules → add API/embedding rights → add the "analyst-verified" premium
tier. Each is a price step that doesn't require counting seats.

---

## 5. Unit economics & cost model (NEW 2026-08-17 — from live operational data)

The ARR model above had ARPU on one side and nothing on the other. This section closes
that gap with measured production spend (sources: CURRENT-STATE.md, spend-guard ledgers,
provider pricing verified 2026-08-17).

### 5.1 Platform COGS today (fixed, serves every account)

| Line | Basis | ~$/mo |
|---|---|---|
| LLM — digests + validation | ~$0.50/day steady (gpt-5 family via OpenAI) | ~$15 |
| LLM — map stage | $0.076/1K docs, ~4–6K docs/day; capped $4/day | ~$12 |
| LLM — Ask | ~$0.011/query measured; beta volume, capped $2/day guard + $10/day budget | ~$3–10 |
| X ingestion (api.twitterapi.io) | ~$0.15/1K tweets; measured $0.74–$1.66/day (cap $2.50/day; $43.81 cumulative of $75 all-time) | ~$35 |
| OpenSanctions enrichment | €0.10/query PAYG; July actual 780 req / $85.80; claim-linked gating (#17) cut eligible candidates 232 → 46 | ~$25–85 |
| Neon Postgres | fixed 1 CU, ~45–46 active min/hr ≈ 550 CU-hr/mo × $0.106 (Launch rate) | ~$55–60 |
| Vercel (crons require Pro) | 1 seat | ~$20 |
| Postmark (magic links + digests) | 10K-email tier | ~$15 |
| Telegram (web + MTProto), RSS, GDELT, ISW, Comtrade keyless, PostHog free tier | $0 | $0 |
| **Total platform COGS** | | **~$190–250/mo** |

The entire deployed product — 3 live theaters, hourly ingestion, 4×/day digests, public
scoreboard, Ask — runs on **under $10/day**, with hard spend caps (SpendGuard + llm-guard)
bounding every paid path. The 2026-07-29→08-15 map outage was a $10 all-time backstop
firing, not runaway cost, and the recovery drained a 47K-doc Iran backlog for $1.87
(cumulative map spend $11.64 against its dedicated $40 cap).

**One Standby seat at $400/mo more than covers the entire current platform.**

### 5.2 Marginal cost per account (the tier-margin question)

Per-account marginal cost is Ask usage + email only — the pipeline is shared:

- **Standby $400/mo:** worst-case abuse = 100 Ask queries/day × $0.011 ≈ $33/mo; realistic
  analyst usage (~2–5 q/day) ≈ $1–2/mo. **Gross margin ≥ 91% worst-case, ~99% realistic**
  (after Paddle ~5%: ≥ 86% / ~94% net).
- **Professional $2–4k/mo:** same marginal profile + support time. ~99% gross before
  people costs; the real cost of this tier is the operator/analyst attention it buys.
- **Enterprise $50–150k/yr:** marginal cost is the API/export volume (meterable) + named-
  analyst time — price the analyst in explicitly when G1 (verification tier) is decided.

The margin risk is NOT per-query LLM cost; it is (a) fixed-cost growth as theaters are
added (each theater adds map/digest volume roughly linearly) and (b) people. A new theater
currently costs roughly $10–30/mo of additional LLM+ingest spend at today's doc volumes —
the marginal-theater economics the brief promised ("country #40 is cheap") are holding.

### 5.3 Metering integrity + cost-curve notes (verify before publishing margin claims)

- `src/lib/llm/pricing.ts` prices gpt-5 $1.25/$10 and gpt-5-mini $0.125/$1 per MTok.
  Two public trackers disagree on current gpt-5-mini list ($0.125/$1 vs $0.25/$2 — the
  latter is the Aug-2025 launch price); if the meter under-prices mini 2×, true Ask cost
  is ~$0.015–0.02/query — margins move immaterially. Confirm against
  platform.openai.com when next in the console, then pin.
- OpenAI's current flagship line is now the gpt-5.6 series (sol $2.50/$15 · terra $1/$6 ·
  luna $0.10/$0.60). The deployed gpt-5/gpt-5-mini are a generation back and still served;
  luna-class models undercut the current answerer ~10× on output — the in-flight
  model-routing/local-model evals are the right lever if Ask volume grows 100×.
- Paid-key upgrades not yet in COGS: Comtrade premium (verified 2026-08-17: **$2,000/yr
  individual, $12,000/yr for-profit institutional** — budget this before promising
  monthly-frequency mirror-trade), OpenSanctions flat internal-use license (quote-based;
  PAYG €0.10/query is the bridge), Companies House (free), AIS (deferred until a buyer
  signs — PARTNER-STRATEGY.md gulf-maritime row).

---

## 6. Cash & runway view (NEW 2026-08-17)

The brief's §8.5 estimated **$600K–1.2M year-one** for a 3–5 person team. Actual state:
**team = 1 operator, non-personnel burn ≈ $200–300/mo** (§5.1) plus one-off keys. At
current shape the venture is operator-time-bound, not cash-bound; there is no meaningful
cash runway constraint until the first hire.

**The first material cash event is the first analyst hire** (~$120–180K/yr loaded, per §1
sequencing), and it is gated on the G1 decision (automated aid vs analyst-verified —
HUMAN-SETUP-TODO §13), which also gates the premium tier and the Paddle AUP category.
Funding triggers, in order:

1. **Now → first revenue:** no raise needed; burn is noise. Spend decisions are key
   purchases (Comtrade premium, OpenSanctions license) justified by a named design partner.
2. **G1 = analyst-verified, or first enterprise deal in motion:** fund analyst #1 —
   from revenue if 2–3 Professional accounts exist (~$6–12k MRR covers a fractional-to-full
   analyst), else a small pre-seed.
3. **Base-case ARR ramp (§2) holding at ~$550k Yr-1:** seed round to add analyst #2 +
   sales lead per the §1 sequence; the brief's $600K–1.2M figure remains the right
   order of magnitude *for that stage*, not for today.

---

## 7. One-page summary

- **Team:** stay lean on eng; hire ~2 regional analysts (Russia, Iran/Gulf) + 1 expert
  salesperson early — they verify AND sell; experts are the credibility that closes deals.
- **Market:** bottom-up SAM ~$138M in the conflict/sanctions-OSINT slice; **Base-case
  ~$8M ARR by Year 3** (~220 accounts), enterprise/API mix is the swing factor.
- **IP protection:** structural moats (live feed + provenance + validated record + registry)
  beat DRM; enforce with **licensing terms + entitlements + per-subscriber canary marking**;
  the live value is inseparable from the login.
- **Pricing:** **per-organization site license** by tier/theaters/modules, **not per-seat**;
  hybrid base+usage only on the API layer. Enterprise priced by value drivers. Packaging
  freeze (bundles vs flat tiers, §4.1) is the open operator decision gating Paddle/checkout.
- **Unit economics:** platform COGS ~$200–300/mo all-in with hard caps; per-account
  marginal cost ≈ Ask + email; ≥90% gross margin at every tier (§5). Cash-bound only
  after the first analyst hire; G1 is the trigger (§6).
