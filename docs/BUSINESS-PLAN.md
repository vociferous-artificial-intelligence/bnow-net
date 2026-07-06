# BNOW.NET — Business Plan

Strategy doc (2026-07-06). Team/org needs, market sizing & ARR model, content-protection
strategy, and pricing-mechanism recommendation. Companion to GTM-STRATEGY.md.

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

### Market context (grounded)
- OSINT market: **$8.7B (2024) → ~$46B (2034), ~18% CAGR** ([Exactitude](https://www.globenewswire.com/news-release/2025/05/29/3090509/0/en/Open-Source-Intelligence-OSINT-Market-to-Reach-USD-46-12-Billion-by-2034-Exhibiting-18-01-CAGR-Growth-Exactitude-Consultancy.html)).
- Threat-intelligence market: **$11.5B (2025) → $23B (2030), ~14.7% CAGR** ([MarketsandMarkets](https://www.marketsandmarkets.com/Market-Reports/threat-intelligence-security-market-150715995.html)).
- Geopolitical-risk intelligence is a fast-growing subset; incumbents price $20k–150k+/yr
  (RANE ~$50k, Dataminr $20–100k, Kpler/Kharon enterprise).

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

### Expansion levers (how ARPU rises within an account)
Add theaters → add modules → add API/embedding rights → add the "analyst-verified" premium
tier. Each is a price step that doesn't require counting seats.

---

## 5. One-page summary

- **Team:** stay lean on eng; hire ~2 regional analysts (Russia, Iran/Gulf) + 1 expert
  salesperson early — they verify AND sell; experts are the credibility that closes deals.
- **Market:** bottom-up SAM ~$138M in the conflict/sanctions-OSINT slice; **Base-case
  ~$8M ARR by Year 3** (~220 accounts), enterprise/API mix is the swing factor.
- **IP protection:** structural moats (live feed + provenance + validated record + registry)
  beat DRM; enforce with **licensing terms + entitlements + per-subscriber canary marking**;
  the live value is inseparable from the login.
- **Pricing:** **per-organization site license** by tier/theaters/modules, **not per-seat**;
  hybrid base+usage only on the API layer. Enterprise priced by value drivers.
