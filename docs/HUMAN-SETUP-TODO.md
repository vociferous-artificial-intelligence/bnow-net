# Human setup TODO — Russia/Ukraine useful-ASAP path

Date: 2026-07-07.

Goal: make the Russia/Ukraine product useful to analysts as soon as possible. This list
only covers human setup, account access, purchasing, and decisions. Engineering follow-up
is noted where a key unlocks an adapter or feature.

## Executive priority

1. **Keep OpenAI funded and capped.** The product is already live on OpenAI; if this fails,
   digests, validation, /ask, and entity audit degrade. Set auto-recharge or billing alerts.
2. **Buy X API credits and cap spend.** This is the biggest missing RU/UA coverage source:
   166 recently ISW-cited X accounts are currently unreadable.
3. **Get Telegram MTProto credentials.** Free and fast; unlocks history and channels where
   public web previews are blocked.
4. **Push the repo to GitHub and configure CI secrets.** CI exists but has not activated
   because this machine cannot reach GitHub.
5. **Point bnow.net at Vercel and migrate Postmark sender identity.** Needed before analyst
   outreach and magic-link credibility.
6. **Get OpenSanctions + Companies House keys.** Turns the entity graph from structure-only
   into compliance-grade evidence.
7. **Resolve procurement access.** zakupki.gov.ru is the highest-value Russia-specific
   source still blocked by network access.

## Immediate operating setup

### 1. OpenAI billing and limits

- Status: `OPENAI_API_KEY` is live.
- Human task: set an auto-recharge or low-balance alert in OpenAI billing.
- Budget expectation from current repo notes: roughly `$0.50/day` steady state for current
  digest/validation usage; backtest cost was about `$2`.
- Decision: keep `gpt-4o-mini` as default for now because it is cheap and already wired.
- Engineering after setup: none unless changing model or provider.

### 2. Anthropic Claude key

- Status: missing.
- Need level: **useful fallback, not first blocker**.
- Human task: create `ANTHROPIC_API_KEY`; optionally set `ANTHROPIC_MODEL`.
- Why: the provider is already implemented and auto-selected if OpenAI is absent, or forced
  with `ANALYSIS_PROVIDER=anthropic`. This gives redundancy and a quality comparison path.
- Budget note: current Anthropic docs list Claude Sonnet 5 introductory pricing at `$2/$10`
  per million input/output tokens through 2026-08-31.
- Decision: add the key after X/Telegram unless OpenAI reliability becomes a problem.

### 3. Gemini / gcloud

- Status: no Gemini or gcloud references in the repo.
- Need level: **not needed now**.
- Why: current code only has OpenAI, Anthropic, and deterministic stub providers. Adding
  Gemini would require application work and does not improve source coverage, which is the
  binding RU/UA problem.
- When to revisit: if we want Google Search grounding, very cheap high-volume translation,
  or Vertex/Google enterprise controls. The Gemini API can be used with an API key; gcloud
  is only necessary if choosing Vertex AI / GCP-managed deployment workflows.
- Decision: defer. Do not spend setup time here for the ASAP RU/UA launch.

### 4. Vercel token

- Status: Vercel CLI session works; old `VERCEL_TOKEN` is expired.
- Human task: create a fresh token at Vercel and add it to local `.env.local`; add as a
  GitHub Actions secret if CI deploys are desired.
- Env var: `VERCEL_TOKEN`.
- Why: scripted deploys and CI deployment automation. Not required for manual local CLI
  deploys from the already-authenticated machine.

### 5. GitHub repo setup

- Status: remote exists: `git@github.com:vociferous-artificial-intelligence/bnow-net.git`.
  Local branch is `main`; this checkout has local commits that have not reached GitHub.
- Human task:
  - Push `main` from a network that can reach GitHub.
  - Confirm branch protection for `main` once CI is green.
  - Add repo secrets for integration tests: `NEON_API_KEY`, `NEON_PROJECT_ID`,
    `DATABASE_URL`.
  - Optional deploy secret: `VERCEL_TOKEN`.
  - In local clones, run `git config core.hooksPath .githooks`.
- Why: `.github/workflows/ci.yml` already runs typecheck, lint, tests, and disposable-Neon
  integration tests when secrets exist.

### 6. Domain and email identity

- Status: app is live at `https://bnow-net.vercel.app`; email works but uses the
  scenefiend Postmark identity.
- Human task:
  - Add `bnow.net` and `www.bnow.net` to Vercel project `bnow-net`.
  - Registrar DNS: `A @ 76.76.21.21`; `CNAME www cname.vercel-dns.com`.
  - Set `NEXT_PUBLIC_SITE_URL=https://bnow.net`.
  - Add `bnow.net` to Postmark, publish DKIM/Return-Path DNS records, verify.
  - Set `EMAIL_FROM` / Postmark sender to a bnow.net address.
- Why: needed before design-partner outreach and auth emails.
- Budget: Postmark free tier is enough for testing; current runbook expects about `$15/mo`
  once email volume rises.

## Coverage/API setup

### 7. X API

- Status: missing; adapter is stubbed and not wired into production ingest.
- Need level: **P1, biggest source-coverage unlock**.
- Human task:
  - Create X developer access.
  - Buy API credits, set a hard monthly spending limit, and add `X_BEARER_TOKEN`.
  - Start with a small capped balance, then scale based on measured ingestion value.
- Current pricing correction: X now documents pay-per-use credits, not fixed monthly
  subscriptions. Public docs list post reads at `$0.005` per returned post and user reads
  at `$0.010` per returned user; current rates are also shown in the X Developer Console.
- Rough budget:
  - Initial account lookup for 166 users: about `$1.66`.
  - Backfill 100 posts for each account: about `16,600 * $0.005 = $83`.
  - Daily polling depends on returned posts. If average relevant volume is 5 posts/account/day,
    cost is about `$4/day` or `$125/mo`; 20 posts/account/day is about `$16.60/day` or
    `$500/mo`.
- Decision: start with `$100-250` prepaid/capped credits, poll only the ISW-cited account
  list, and measure before expanding.
- Engineering after setup: implement/enable live X adapter, dedupe, and a usage guard.

### 8. Telegram MTProto

- Status: missing; web-preview scraper is live, MTProto adapter is stubbed.
- Need level: **P1, cheap and fast**.
- Human task: create API credentials at my.telegram.org.
- Env vars: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`.
- Why: full history, better backfill, and channels where `t.me/s/` previews are disabled.
- Budget: `$0`.
- Engineering after setup: implement/enable GramJS/MTProto adapter and run targeted
  backfill for RU/UA channels.

### 9. ACLED

- Status: missing; adapter fixture exists.
- Need level: **P3 for ASAP**, useful as a secondary validation baseline.
- Human task: register for ACLED access.
- Env vars: `ACLED_API_KEY`, `ACLED_EMAIL`.
- Why: structured human-curated conflict events; the original brief names ACLED as a
  secondary baseline for validation contamination.
- Decision: defer until X/Telegram are in motion, unless a partner specifically asks for
  ACLED comparison.

### 10. GDELT

- Status: no key required; adapter exists but upstream has been flaky/unreachable from
  some egress paths.
- Human task: none unless we decide to build a raw 15-minute file fallback.
- Decision: do not spend account/setup time here. Treat as opportunistic feed.

### 11. Firecrawl

- Status: not used anywhere in the repo.
- Need level: **not needed for core RU/UA ingestion**.
- Why: the product’s advantage is known-source ingestion with registry reliability,
  source-level provenance, and repeatable adapters. Firecrawl may help ad hoc research,
  one-off web extraction, or bot-walled pages, but it does not replace X, Telegram MTProto,
  ACLED, or procurement data.
- Current pricing shape: Firecrawl prices scrape/crawl/map/monitor at `1 credit/page`,
  search at `2 credits/10 results`, and browser interaction by browser-minute; plans/credits
  should be checked before production use.
- Decision: defer. Consider only for analyst research tooling or targeted feed-health
  debugging after P1 coverage gaps are fixed.

### 12. zakupki.gov.ru procurement access

- Status: adapter exists and is tested, but production egress cannot reach the site or
  mirrors.
- Need level: **P1/P2 for Russia depth**.
- Human decision:
  - Buy a RU-region or residential proxy and approve use for this source, or
  - Buy access to a commercial zakupki mirror/API, or
  - Find a reachable official OpenData FTP path through approved network infrastructure.
- Why: fortifications, drone parts, prosthetics, graves, and regional-strain procurement
  are high-value early signals.
- Budget expectation: residential/proxy path may start around `$10-50/mo`; commercial
  mirrors vary.
- Engineering after setup: add proxy/mirror configuration and run the procurement watcher.

## Entity/compliance data setup

### 13. OpenSanctions

- Status: missing; live endpoint returns unauthorized without a key; stub data is hidden
  from users by design.
- Need level: **P1 for compliance buyer credibility**.
- Human task: get a commercial API key/license.
- Env var: `OPENSANCTIONS_API_KEY`.
- Current pricing shape: OpenSanctions says non-commercial use is free; businesses need a
  data license or pay-as-you-go API. Their API metering page lists `/match` at `EUR 0.10`
  per query and `/entities` / `/statements` as free.
- Engineering after setup: run `/api/cron/enrich?refresh=1`.

### 14. Companies House

- Status: missing.
- Need level: **P1/P2**, easy win.
- Human task: create a free Companies House developer application and API key.
- Env var: `COMPANIES_HOUSE_API_KEY`.
- Why: real UK officer/PSC edges for entity pages.
- Budget: `$0`; official UK API catalogue describes public register data as free.
- Engineering after setup: run ownership enrichment.

### 15. OpenCorporates

- Status: code path exists as an optional ownership source, but no key is present.
- Need level: **P2**.
- Human task: evaluate plan/API access after Companies House.
- Env var: `OPENCORPORATES_API_KEY`.
- Why: broader cross-jurisdiction company graph than UK-only Companies House.
- Decision: defer until we know which compliance design partners care about non-UK
  ownership depth.

### 16. UN Comtrade

- Status: keyless preview works; 2,785 rows already exist per status report.
- Need level: **P2/P3 for RU/UA ASAP**, stronger for commodity/compliance buyers.
- Human task: register for a Comtrade developer subscription key.
- Env var: `COMTRADE_API_KEY`.
- Why: higher limits and monthly-frequency mirror-trade/critical-material pulls.
- Decision: get it because it is cheap/free, but do not let it block X/Telegram.

## Revenue and launch decisions

### 17. Stripe

- Status: pricing/intents exist; checkout is behind `FEATURE_STRIPE=false`.
- Need level: **not required for analytic usefulness, required before paid launch**.
- Human task:
  - Decide final packaging: original brief says regional bundles, annual-first, no surge
    pricing.
  - Create Stripe products/prices.
  - Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and price IDs.
- Decision: do not wire checkout until bundle packaging is decided.

### 18. Legal review

- Status: open operator action from the original brief.
- Need level: **required before charging customers**.
- Human task: get counsel review of handling Russian state-media content and sanctions
  exposure. Include the posture that the app stores citations/classifications and does
  not render ISW prose or source full text.

### 19. Human verification / analyst process

- Status: missing; scoreboard is the current proof layer.
- Need level: **important for trust, especially gov/insurer/compliance buyers**.
- Human decision:
  - Define whether the launch product is "automated analyst aid" or "analyst-verified".
  - If analyst-verified, recruit a regional expert for tail-event review and define what
    gets manually checked.
- Why: business docs identify this as the largest GTM credibility gap.

### 20. Design partners

- Status: not a code blocker, but needed to calibrate usefulness.
- Human task: identify 10-20 design partners, especially compliance, commodity, political
  risk, and journalism users.
- Decision: use RU/UA reference-grade quality as the first demo; defer broad theater
  expansion until coverage improves.

## Explicit answers to current questions

- **Do we need Gemini or gcloud?** No, not for ASAP. Gemini is not wired; gcloud is only
  relevant if choosing Vertex/GCP. Defer.
- **Do we need GitHub repo setup?** Yes. Remote exists, CI exists, but GitHub has not been
  activated by push from this machine. Push `main`, add Neon secrets, enable branch
  protection.
- **Do we need an Anthropic Claude key?** Useful, not mandatory. Add it for redundancy and
  quality comparison after X/Telegram.
- **Do we need Firecrawl?** Not for core production ingestion. It is optional for ad hoc
  research or feed-health debugging.
- **Do we need X API and what budget?** Yes. It is the biggest RU/UA coverage unlock.
  Start with `$100-250` prepaid/capped credits, then adjust after measuring returned-post
  volume. Backfill and daily polling could range from low hundreds/month to more if
  polling broad/high-volume accounts aggressively.
- **Other APIs?** P1: Telegram MTProto, OpenSanctions, Companies House. P2: zakupki
  proxy/mirror, Comtrade, OpenCorporates. P3: ACLED, AIS/maritime, satellite.

## Source links checked for volatile pricing/access

- X API pricing: https://docs.x.com/x-api/getting-started/pricing
- Firecrawl pricing: https://www.firecrawl.dev/pricing
- Anthropic pricing/models: https://platform.claude.com/docs/en/about-claude/pricing and
  https://platform.claude.com/docs/en/about-claude/models/overview
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- OpenSanctions API/licensing: https://www.opensanctions.org/docs/api/ and
  https://www.opensanctions.org/faq/api/metering/
- Companies House API: https://developer.company-information.service.gov.uk/get-started
- UN Comtrade developer portal: https://comtradedeveloper.un.org/
