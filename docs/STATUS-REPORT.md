# BNOW.NET — Status Report

**For:** Gregory · **Date:** 2026-08-17 · **Live app:** https://bnow.net
This is the plain-language summary. Technical state lives in `AGENTS.md` +
`docs/CURRENT-STATE.md`; your decision queue is `docs/HUMAN-SETUP-TODO.md`.
(Prior report of 2026-07-07 is preserved in git history; this file is corrected in place.)

## What exists (in one paragraph)

A deployed, self-running OSINT intelligence product at **bnow.net**, operating as a
**private analyst beta** (public request-access page; invite-only sign-in; no prices
shown). It covers Russia/Ukraine (flagship) and Iran (validated; Gulf ingesting), pulls
from RSS + registry-selected Telegram (web **and** MTProto) + **X via api.twitterapi.io**
(364 registry accounts, 175K+ documents), generates digests four times daily on a
map/reduce claims engine, scores itself publicly against ISW, and layers analyst tools on
top: source-reliability registry (~10,015 sources, ~351K ISW citations, 1,608 reports),
entity graph, mirror-trade evasion flags, critical-materials tracker, data-dark tracker,
automated signals, free claim search, and the Ask Q&A pipeline (~$0.011/query, hard spend
caps). Every claim links to its sources — DB-enforced. Versioned Terms/Privacy clickwrap,
opt-in-only analytics, and fail-closed OpenSanctions handling are live.

## Current numbers (2026-08-17)

| Metric | Value |
|---|---|
| Source registry | ~10,015 materialized sources · ~351K citations · 1,608 ISW reports (ru + ir current through 2026-08-14) |
| Ingestion | 34 RSS feeds + Telegram web + MTProto + X; X alone 175,842 docs, ~3,600/day |
| Digests | 4×/day (3 intraday + 02:00 finalize), mapreduce engine in prod; Gulf falls back to legacy |
| Validation | majority-vote LLM matching (k=5, 26/27 reproducible); coverage run-avg ~17.5% (~31% nonzero-day); **Iran comparable-day 43.5%** post-recovery (16-day mean 38.0%); median info-lead **+14.7h** |
| Access | invite-only Production sign-in since 2026-07-15; beta requests queue at /admin/access |
| Tests | 2,123 unit (166 files) + 107 integration (17 files), green; CI + enforced pre-push gate |
| Platform cost | **≈$200–300/mo all-in** (LLM + X + OpenSanctions + Neon + Vercel + Postmark), every paid path hard-capped — see BUSINESS-PLAN §5 |

## What changed since the 2026-07-07 report

1. **Domain + email are real:** bnow.net live; Postmark sends from no-reply@bnow.net with
   DKIM/SPF/DMARC passing. *(This was the stated blocker on partner outreach — cleared
   2026-07-15; outreach itself has not started.)*
2. **Commercial posture pivoted to private beta:** /pricing 308-redirects to /access;
   price cards and `src/lib/pricing/` deleted; sign-in invite-only. Correct posture —
   now recorded in the strategy docs (GTM-STRATEGY §6 rewrite).
3. **Billing direction changed: Paddle (Merchant of Record), not Stripe** — full plan in
   `docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md` behind a provider-neutral
   entitlement layer. Stripe references in older docs are superseded (banners added
   2026-08-17). Blocked on the packaging freeze (next moves #1).
4. **X and MTProto ingestion shipped** (the July report's #1 move): July 9–13 X gap
   recovered cursor-complete ($3.92); bounded auto-recovery production-proven Aug 10–14.
5. **Ask v2 + /search shipped**: hybrid retrieval, ~$0.011/query, 100/user/day; /search
   is the $0 deterministic sibling. One-click home handoff proven single-bill.
6. **OpenSanctions match-safety hardened (2026-07-22):** rejected candidates can no longer
   persist as sanctions assertions; presentation is admin-only; Ask receives no
   OpenSanctions-derived claims. Compliance data stays beta/internal until commercial
   rights are resolved.
7. **Map-stage outage and recovery (the honest one):** the map worker starved on a $10
   all-time budget backstop 2026-07-29 → 2026-08-15 (418 runs, zero claims; digests fell
   back to legacy) — masked as healthy by an observability defect, now repaired
   (budget stops mark runs failed; per-theater freshness alerts). Iran validation was
   rebuilt end-to-end: coverage 20.8% → 43.5% comparable-day. Scored history across the
   outage window carries a quality discontinuity — any published accuracy claim must
   footnote it.
8. **Legal/consent shipped:** versioned clickwrap (Terms 1.1 / Privacy 1.3, forced
   re-acceptance), opt-in-only PostHog analytics, append-only acceptance records.
9. **Cost discipline built:** SpendGuard + llm-guard caps on every paid path; Neon
   cron-clustering merged (est. ~17–19% DB-compute cut, deploy pending observation).

## Honest weaknesses

- **Coverage vs ISW remains far below the brief's 80% target** (~17.5% run-avg; ~31%
  nonzero-day; Iran 43.5% comparable-day is the trajectory proof). The lever is corpus
  depth + conversion (OPEN-TASKS #19), and the scoreboard framing must lead with the
  info-lead + transparency, not the raw percentage (GTM-STRATEGY §1).
- **The #1 ICP (compliance) is not currently sellable:** OpenSanctions commercial rights
  unresolved + admin-only presentation; Companies House key pending; ownership edges
  stub-only. Beachhead re-sequenced to commodity + consultancies (GTM-STRATEGY §2).
- **Three incompatible pricing models still live in the docs** (bundles vs flat tiers vs
  seed catalog) — the single most consequential unresolved business decision
  (BUSINESS-PLAN §4.1, OPEN-TASKS #12). Nothing priced can ship until it's frozen.
- **G1 (automated aid vs analyst-verified) undecided** — gates hiring, premium tier,
  Paddle AUP category, and GTM claims (GTM-STRATEGY §7 G1).
- **No revenue yet and no outreach started**; the access queue is the only funnel.
- Gulf beyond Iran is thin (no ground-truth benchmark; bh/kw scaffolded; sa fragile).
- Elite-politics and Gulf digests remain unvalidated by design (no ISW equivalent).

## Top 5 next moves (value order)

1. **Freeze packaging** (BUSINESS-PLAN §4.1 / OPEN-TASKS #12): pick bundles vs flat
   tiers, one catalog matrix. Unblocks the Paddle AUP submission, checkout build, and any
   priced conversation. Everything commercial queues behind this.
2. **Decide G1** — automated analyst aid vs analyst-verified (HUMAN-SETUP-TODO §13).
   Cascades to first hire, premium tier, Paddle category, and marketing claims.
3. **Start partner outreach** (PARTNER-STRATEGY §6–8; unblocked since 2026-07-15): Smart +
   Tsukerman for regional pressure-tests, Sipher for methodology review — using the honest
   scoreboard memo (GTM-STRATEGY §1 framing).
4. **Resolve compliance data rights**: OpenSanctions commercial license (PAYG €0.10/query
   is the bridge; flat license is quote-based — start the sales conversation) + land the
   Companies House key. Re-promotes the compliance ICP.
5. **Run Paddle Phases A–C** (approval + catalog + provider-neutral foundation, ~2–3 wks
   eng after #1) so the first design partner can pay without re-architecture. Keep beta
   invites flowing meanwhile — the queue is the founding-subscriber list.
