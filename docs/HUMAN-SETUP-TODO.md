# Human setup TODO — pending items only

Verified: 2026-07-15.

This file contains only human setup, purchasing, account-access, and product decisions that
remain open. Completed setup belongs in `AGENTS.md`, `docs/PROGRESS.md`, and review notes—not
in this queue.

## Executive priority

1. **Keep OpenAI funded and capped.** Set auto-recharge or a low-balance alert.
2. **Finish deployment/CI administration.** Replace the expired Vercel token and Neon branch API
   key, confirm GitHub branch protection, and confirm required CI secrets.
3. **Resolve compliance-data rights.** Secure commercial OpenSanctions terms before charging
   for compliance surfaces; finish Companies House access.
4. **Choose a procurement-access path.** Approve a RU-region/residential proxy, commercial
   zakupki mirror/API, or reachable official OpenData path.
5. **Complete paid-launch gates.** Decide packaging, configure Stripe, and obtain legal review.
6. **Define the human trust layer and recruit design partners.** Decide whether the product is
   automated-only or analyst-verified, then recruit representative beta users.

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
  exists. The saved `NEON_API_KEY` currently returns 401, so disposable-branch integration
  tests are blocked until it is renewed; production database access is unaffected.
- Human task:
  - Confirm branch protection for `main`.
  - Renew and confirm Actions/local secrets for disposable-Neon integration tests:
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

- Status: live API enrichment works under the current quota.
- Human task: obtain a commercial data license or pay-as-you-go agreement before charging
  customers for sanctions/PEP/compliance surfaces.
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

- Status: keyless preview works but has lower limits.
- Human task: register for `COMTRADE_API_KEY` if higher-volume or monthly-frequency pulls are
  needed.

## Revenue, legal, and launch decisions

### 11. Stripe and packaging

- Status: checkout remains disabled.
- Human task:
  - Decide final packaging and whether annual-first regional bundles remain the plan.
  - Create Stripe products/prices.
  - Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and selected price IDs.
- Gate: do not enable checkout until packaging is decided.

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
