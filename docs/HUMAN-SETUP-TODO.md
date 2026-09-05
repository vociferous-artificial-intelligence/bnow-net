# Human setup TODO — pending items only

Verified: 2026-08-17 (reconciliation pass; prior verification 2026-07-15).

This file contains only human setup, purchasing, account-access, and product decisions that
remain open. Completed setup belongs in `AGENTS.md`, `docs/PROGRESS.md`, and review notes—not
in this queue.

## Executive priority (reordered 2026-08-17 — decision items first; they gate everything commercial)

1. **Freeze packaging** (BUSINESS-PLAN §4.1 / OPEN-TASKS #12): bundles vs flat tiers, one
   catalog matrix. Gates the Paddle AUP submission, checkout, and any priced outreach.
2. **Decide the human trust layer (G1)** — "automated analyst aid" vs "analyst-verified"
   (§13). Gates first hire, premium tier, Paddle category, marketing claims.
3. **Start partner outreach** — its DNS/Postmark blocker cleared 2026-07-15; nothing has
   been sent (PARTNER-STRATEGY.md §6–8).
4. **Resolve compliance-data rights.** Secure commercial OpenSanctions terms before charging
   for compliance surfaces; finish Companies House access. (§7–8)
5. **Complete paid-launch gates.** Work the Paddle plan's §2 gates (product approval, unit
   economics sign-off, legal/privacy review) — **not Stripe** (§11).
6. **Keep OpenAI funded and capped**; replace the expired Vercel token; confirm branch
   protection + CI secrets. (§1, §3–4)
7. **Choose a procurement-access path.** RU-region/residential proxy (~$10–50/mo),
   commercial zakupki mirror/API, or official OpenData path. (§6)
8. **Recruit design partners** from the /access queue — commodity + consultancy first
   while compliance rights are pending (GTM-STRATEGY §2). (§14)

## Accounts and operating setup

### 1. OpenAI billing and limits

- Status: `OPENAI_API_KEY` is live and production calls are spend-guarded.
- Human task: set an auto-recharge or low-balance alert in OpenAI billing.
- Budget expectation: roughly `$0.50/day` steady state for the original digest/validation
  workload; monitor current provider-usage rows because Ask and map/reduce add usage.

### 2. Anthropic fallback key — optional

- Status: provider support exists, but no `ANTHROPIC_API_KEY` is configured.
- Human task: add a key only if provider redundancy or a quality comparison is desired;
  optionally set `ANTHROPIC_MODEL`.
- Priority: useful fallback, not a launch blocker while OpenAI is healthy.

### 3. Vercel automation token

- Status: the authenticated local Vercel CLI session works; the saved `VERCEL_TOKEN` is
  expired.
- Human task: create a fresh token, store it in local `.env.local`, and add it to GitHub
  Actions only if CI-driven deployment is desired.
- Why: scripted/CI deploys. It is not required for deployments from this authenticated box.

### 4. GitHub CI administration

- Status: `origin/main` and local `main` are synchronized; pushes work and CI configuration
  exists. **Update 2026-08-17:** the saved `NEON_API_KEY` works again (disposable branches
  created/deleted cleanly; 107 integration tests green locally) — confirm the GitHub
  Actions secret matches the working local key.
- Human task:
  - Confirm branch protection for `main`.
  - Confirm Actions secrets for disposable-Neon integration tests:
    `NEON_API_KEY`, `NEON_PROJECT_ID`, and `DATABASE_URL`.
  - Add `VERCEL_TOKEN` only if CI should deploy.
  - Ensure local clones use `git config core.hooksPath .githooks`.

## Coverage and external data

### 5. ACLED access — optional/P3

- Status: no live key; the fixture adapter is intentionally not wired into production.
- Human task: register at ACLED and add `ACLED_API_KEY` plus `ACLED_EMAIL` if a partner wants
  ACLED comparison or a secondary validation baseline.
- Priority: defer unless requested by a design partner.

### 6. zakupki.gov.ru procurement access

- Status: the tested production adapter cannot reach zakupki or known mirrors from current
  egress.
- Human decision: choose and approve one path:
  - RU-region or residential proxy;
  - commercial zakupki mirror/API; or
  - reachable official OpenData/FTP infrastructure.
- Budget expectation: a proxy may start around `$10–50/month`; commercial mirrors vary.
- Why: procurement can expose fortification, drone-parts, prosthetics, graves, and regional-
  strain signals.

## Entity and compliance data

### 7. OpenSanctions commercial rights

- Status: live API enrichment works under the current quota. Pricing verified 2026-08-17:
  pay-as-you-go is **€0.10/query** (July actual: 780 requests / $85.80 — consistent);
  the flat internal-use "Screening License" and reseller/OEM tiers are **quote-based**
  (sales conversation required). Presentation is admin-only since 2026-07-22; claim-linked
  spend gating limits billable candidates.
- Human task: obtain a commercial data license or pay-as-you-go agreement before charging
  customers for sanctions/PEP/compliance surfaces — start the sales conversation now; it
  is on the critical path for the compliance ICP (GTM-STRATEGY §2).
- Operator gates: review and explicitly approve entity cleanup #61 before `--apply`; after the
  monthly-accounting/fixed-cutoff patch is merged and deployed, authorize the paid rescore
  separately only after a fresh cleanup dry run and population/monthly-usage recount.
- Hard gate: treat current compliance data as beta/internal until commercial rights are clear.

### 8. Companies House

- Status: the `bnow.net` developer application was submitted; key issuance/approval may still
  be pending.
- Human task: complete approval and add `COMPANIES_HOUSE_API_KEY`.
- Budget: free official UK register API.

### 9. OpenCorporates — optional/P2

- Status: optional ownership code path exists; no key is configured.
- Human task: evaluate API access after Companies House, based on design-partner demand for
  non-UK ownership coverage.

### 10. UN Comtrade subscription key — optional/P2

- Status: keyless preview works but has lower limits. Premium pricing verified 2026-08-17
  (shop.un.org): **$2,000/yr individual · $6,000/yr non-profit institutional ·
  $12,000/yr for-profit institutional**.
- Human task: buy only against a named design partner who needs monthly-frequency
  mirror-trade — this is a real budget line, not a free key.

## Revenue, legal, and launch decisions

### 11. Billing (Paddle) and packaging — SUPERSEDES the earlier Stripe item

- Status: checkout remains disabled; there is deliberately no public purchase path.
  **Stripe is dead as the plan of record** — direction is Paddle Billing as Merchant of
  Record behind a provider-neutral entitlement layer
  (`docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`). Published Paddle rates
  (verified 2026-08-17): 5% + $0.50 checkout · 3.5% bank-transfer invoicing.
- Human task (= the Paddle plan's §2 gates + §16 decisions):
  - Freeze final packaging (executive priority #1; bundles-vs-tiers decided deliberately).
  - Submit the product description for written Paddle AUP approval (checkout + invoicing).
  - Sign off unit economics: accepted fees, gross-to-net by offer, refund exposure,
    payout currency, reconciliation owner (BUSINESS-PLAN §4.1/§5 has the numbers).
  - Approve grace/restriction policy, refund/chargeback policy, and whether "individual"
    is an organization-of-one Standby or a distinct SKU.
- Gate: do not enable checkout until packaging is frozen and Paddle approval is written.

### 12. Legal review

- Human task: obtain counsel review before charging customers, including Russian state-media
  handling, sanctions exposure, and the product posture of storing citations/classifications
  without rendering ISW prose or source full text.

### 13. Human verification / analyst process

- Human decision: define the launch promise as either “automated analyst aid” or
  “analyst-verified.”
- If analyst-verified: recruit a regional expert for tail-event review and define the manual
  verification standard.

### 14. Design partners

- Human task: recruit 10–20 representative design partners across compliance, commodities,
  political risk, and journalism.
- Decision: demonstrate RU/UA reference-grade quality first; do not broaden theater claims
  ahead of evidence depth.

## Relevant external references

- OpenSanctions API/licensing: https://www.opensanctions.org/docs/api/ and
  https://www.opensanctions.org/faq/api/metering/
- Companies House: https://developer.company-information.service.gov.uk/get-started
- UN Comtrade: https://comtradedeveloper.un.org/
- Anthropic pricing/models: https://platform.claude.com/docs/en/about-claude/pricing and
  https://platform.claude.com/docs/en/about-claude/models/overview
