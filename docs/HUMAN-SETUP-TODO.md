# Human setup TODO — Russia/Ukraine useful-ASAP path

Date: 2026-07-07.

Goal: make the Russia/Ukraine product useful to analysts as soon as possible. This list
only covers human setup, account access, purchasing, and decisions. Engineering follow-up
is noted where a key unlocks an adapter or feature.

Update 2026-07-07: Gregory reports `OPENSANCTIONS_API_KEY` is now in `.env.local`
with a one-month 2,000-call quota. X access is via `api.twitterapi.io` using an
`x-api-key` header and intended env var `X_API_KEY`, not the official X API bearer-token
path originally assumed. Companies House application for `bnow.net` is submitted and
pending key issuance/approval.

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
- Current push blocker: GitHub `GH007` means the **Git commit author email** is private
  and GitHub account privacy is blocking command-line pushes that expose it. This is not
  the app reply-to address.
- Human task:
  - Get the GitHub no-reply email from GitHub Settings -> Emails.
  - Set repo/future commit email to that no-reply address.
  - Rewrite local unpublished commits to use the no-reply author/committer email, or
    temporarily disable GitHub's "Block command line pushes that expose my email" setting.
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

- Status: access is through `api.twitterapi.io` with header `x-api-key: $X_API_KEY`.
  The key is present locally and smoke-tested, but a small adapter implementation/change
  is required before this key can improve ingestion.
- Need level: **P1, biggest source-coverage unlock**.
- Human task:
  - Confirm `X_API_KEY` is present in the environment that deploys/runs the adapter.
  - Confirm the provider's plan, rate limits, and monthly cap.
  - Start with a small capped balance, then scale based on measured ingestion value.
- Pricing note: the earlier official-X estimate does not apply to `api.twitterapi.io`.
  Use that provider's dashboard/billing limits for actual budget control.
- Rough budget:
  - Unknown until provider rate card is confirmed.
  - Poll only the 166 ISW-cited accounts at first, dedupe by tweet id, and measure.
- Decision: proceed, but require a usage guard and explicit cap before production polling.
- Engineering after setup: implement/enable a `twitterapi.io` adapter using `X_API_KEY`,
  dedupe, and a usage guard.

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
- Decision: defer for normal ingestion. It may be worth a one-page proof-of-reachability
  test against zakupki because Firecrawl supports enhanced proxies and location settings,
  but do not treat it as the production procurement pipeline until legality, stability,
  robots/rate limits, and data-retention behavior are checked.

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
- Firecrawl note: it may be useful as a quick reachability test because enhanced proxies
  can sometimes access bot-walled sites, but procurement data should probably use a
  dedicated proxy/mirror path rather than a general scraper if it becomes a core signal.

## Entity/compliance data setup

### 13. OpenSanctions

- Status: `OPENSANCTIONS_API_KEY` is present locally; Gregory reports 2,000 free calls for
  one month. Stub data is hidden from users by design.
- Need level: **P1 for compliance buyer credibility**.
- Human task: clarify license/free-use basis before charging customers or using the data
  in broader public/commercial output.
- Env var: `OPENSANCTIONS_API_KEY`.
- Current pricing shape: OpenSanctions says non-commercial use is free; businesses need a
  data license or pay-as-you-go API. Their API metering page lists `/match` at `EUR 0.10`
  per query and `/entities` / `/statements` as free.
- Decision: use the current quota for internal/beta validation with regional experts if
  the account terms permit it; fill out the free-use/non-commercial form only if the beta
  posture actually qualifies. Assume paid licensing is required before commercial launch.
- Engineering after setup: ~~run enrichment with a strict call budget~~ ✅ DONE
  2026-07-07: 200 entities live-enriched under `OPENSANCTIONS_CALL_CAP=300` (121
  matched, 54 sanctioned; 4/5 hand spot-checks confirmed against opensanctions.org,
  1 flagged as name-collision — see docs/reviews/COVERAGE-SPRINT-RESULTS.md).
- **HARD GATE before charging customers: commercial licensing.** The 2,000-call quota
  is a one-month arrangement; sanction/PEP badges are beta/internal-only until a data
  license or pay-as-you-go commercial agreement is signed. Do not include compliance
  surfaces in any paid tier before this is resolved.

### 14. Companies House

- Status: application for app `bnow.net` has been submitted; API key issuance may be
  pending account/app approval.
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
  relevant if choosing Vertex/GCP. Gregory reports Gemini env is available via `.bashrc`,
  but using it would require a new provider implementation. Defer for product work.
- **Do we need GitHub repo setup?** Yes. Remote exists, CI exists, but GitHub has not been
  activated by push. Fix GH007 by using the GitHub no-reply email for commits, then push
  `main`, add Neon secrets, enable branch protection.
- **Do we need an Anthropic Claude key?** Useful, not mandatory. Add it for redundancy and
  quality comparison after X/Telegram.
- **Do we need Firecrawl?** Not for core production ingestion. It is optional for ad hoc
  research or feed-health debugging.
- **Do we need X API and what budget?** Yes. It is the biggest RU/UA coverage unlock.
  Use the already-provisioned `api.twitterapi.io` key, not official X. Confirm the
  provider-side monthly cap, then measure the 166-account pilot before expanding.
- **Other APIs?** P1: Telegram MTProto, OpenSanctions, Companies House. P2: zakupki
  proxy/mirror, Comtrade, OpenCorporates. P3: ACLED, AIS/maritime, satellite.

## Source links checked for volatile pricing/access

- twitterapi.io docs: https://docs.twitterapi.io/introduction and
  https://docs.twitterapi.io/api-reference/endpoint/get_user_by_username
- Firecrawl pricing: https://www.firecrawl.dev/pricing
- Anthropic pricing/models: https://platform.claude.com/docs/en/about-claude/pricing and
  https://platform.claude.com/docs/en/about-claude/models/overview
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- OpenSanctions API/licensing: https://www.opensanctions.org/docs/api/ and
  https://www.opensanctions.org/faq/api/metering/
- Companies House API: https://developer.company-information.service.gov.uk/get-started
- UN Comtrade developer portal: https://comtradedeveloper.un.org/
