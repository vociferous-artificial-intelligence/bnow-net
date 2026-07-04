# BNOW.NET — Product Brief

> **⚠️ RECONSTRUCTED DOCUMENT.** The original `PRODUCT-BRIEF.md` was not present on this
> machine when the autonomous build began (2026-07-04). This version is reconstructed from
> the execution prompt, which quoted or referenced the sections below (§4, §4.3, §6.5, §7.1,
> §8.4, §8.6, §8.7). Where the prompt gave exact numbers or language, they are preserved
> verbatim. Everything else is a faithful expansion consistent with those anchors.
> **Replace this file with the original when available** and diff for contradictions.

## 1. Product thesis

BNOW.NET is a subscription OSINT data-intelligence product: per-country intelligence feeds
built from open sources (news, Telegram, X/social), with **transparent, data-derived source
reliability ratings**, an automated daily analysis layer, and a public **validation harness**
that scores our output against expert human analysis — at launch, ISW's daily Russian
Offensive Campaign Assessments.

The core differentiator is **claim-to-source traceability**: every claim in every digest links
to the raw source documents that support it. No black-box analysis. This is the "BENGAL
answer" — the response to the question every analyst asks of automated intelligence: *how do
you know that?*

## 2. Who pays

Analysts, corporate security / geopolitical risk teams, journalists, NGOs, and trading desks
that need timely, source-transparent conflict monitoring at a price point below bespoke
intelligence subscriptions (Janes, Stratfor tier) but above raw feed aggregators.

## 3. Launch theater and scope

- **Live at launch:** Russia + Ukraine — fully ingested, daily digest, ISW-validated.
- **Next wave (scaffolded, config-driven, not live):** Israel, Iran, Saudi Arabia, UAE,
  Qatar, Oman, Bahrain, Kuwait — the Hormuz-crisis set.
- **Explicitly deferred:** China (unless it falls out nearly free from the architecture).

## 4. Phase 0 pilot: the ISW-derived source registry

Before building original analysis, mine ISW's public Russian Offensive Campaign Assessment
archive (Feb 2022–present, ~1,500 reports) for its **endnote citations**:

1. Crawl the archive; cache raw HTML (internal only).
2. Parse endnotes: citation URLs, platform classification (Telegram / X / state media /
   independent media / gov / other), position within report.
3. Extract the **hedging language** around each citation and classify it:
   `confirmed / claimed / unverified / assessed`. ISW's own hedging is a free, expert-labeled
   reliability signal for thousands of sources.
4. Materialize a **source registry**: per-source citation frequency, first/last cited,
   hedging distribution, decay flag (cited in 2022, absent 2024+).

The registry seeds (a) which Telegram/X channels we ingest, and (b) prior reliability weights
for the analysis layer.

### 4.3 Divergence as a feature

When our digest disagrees with ISW, that is not an embarrassment to hide — it is a product
feature. The divergence list ("we saw X, ISW says Y") is exactly what analysts want to review.
The scoreboard shows coverage, divergences, and timeliness publicly.

## 5. Architecture principles

- Config-driven countries: adding a theater is data + config, not code.
- Adapter interfaces for every external dependency; stub + fixtures when keys are missing.
- Idempotent, resumable collectors that run as cron or local scripts.
- Schema-enforced traceability: a claim row cannot exist without ≥1 source-document link.

## 6. Business model

### 6.5 Plans

| Plan | Price | Notes |
|---|---|---|
| `standby` | $400/mo | Monitoring tier: digests + scoreboard, limited history |
| `full_monthly` | $2,000–4,000/mo | Full feeds, registry explorer, API, all history |
| `full_annual` | 40–50% off monthly | Founding-subscriber annual commitment |

Stripe fully modeled in DB from day one, behind a feature flag until keys exist.

## 7. Positioning

### 7.1 Launch positioning

"Transparent source reliability ratings for conflict-zone OSINT — validated daily against
expert analysis." Every number on the site is clickable through to its evidence.

## 8. Risks and guardrails

### 8.4 New-country playbook

Document the repeatable process (registry seed → feed selection → ingestion config →
digest prompt pack → validation reference) so the Gulf set can launch without re-architecture.

### 8.6 Legal guardrails

- Scrape for **internal analysis only**. Honor robots.txt; ≥2s per-host spacing; cache
  everything so nothing is fetched twice.
- **Never store ISW prose in user-facing output. Never republish source text.**
- The derived artifacts — citation URLs, source registry, hedging classifications, scores —
  are the product. Raw HTML cache is internal-only.

### 8.7 Phase 0 exit criteria

- ≥2,000 deduped sources in the registry.
- Endnote parse rate >90% on the sampled reports.
- Registry queryable in the app.
