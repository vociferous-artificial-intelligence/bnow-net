# BLOCKERS — things only Gregory can unblock

Dated log of missing credentials/capabilities. Each has a stub in place; nothing here stops the build.

## 2026-07-04

1. **VERCEL_TOKEN expired.** The token in `~/code/scenefiend/.env.local` returns 403.
   Deploys this weekend use the machine's logged-in Vercel CLI session (`go-vociferous`).
   **Action: generate a fresh token at vercel.com/account/tokens → `VERCEL_TOKEN` (needed for
   CI, not for local CLI deploys).**
2. **No ANTHROPIC_API_KEY.** `OPENAI_API_KEY` is present and is used as the live
   `AnalysisProvider` (≤$25 cap). **Action (optional): add `ANTHROPIC_API_KEY` at
   console.anthropic.com → flips provider per env config.**
3. **No ACLED key.** Adapter stubbed with fixtures. **Action: acleddata.com/register →
   `ACLED_API_KEY`, `ACLED_EMAIL`.**
4. **No Stripe keys.** Checkout remains disabled pending packaging and payment setup.
   **Action: dashboard.stripe.com → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_*`.**
5. **GDELT DOC API flaky/unreachable (2026-07-04).** 429'd then connection-refused from
    build host AND returns empty from Vercel egress. Adapter is wired and degrades
    gracefully; data resumes automatically when GDELT recovers. Alternate path if it
    stays dead: data.gdeltproject.org raw 15-min export files (heavier parse, no API).

## 2026-07-05

- **RFE/RL regional RSS APIs** (idelreal/azatliq/kavkazr/sibreal
  `/api/z*`) return empty item lists — content ingested via their telegram mirrors
  instead. Kommersant RSS + Iran International (malformed XML) + News of Bahrain/Arab
  Times (invalid XML) logged by the adapter; alternates queued.

## 2026-07-06

- **zakupki.gov.ru (state procurement) unreachable** from BOTH the build host and Vercel
  egress (`fetch failed`; official mirrors opendata.zakupki / spending.gov.ru also dead;
  clearspending.ru returns an SPA shell). The ProcurementAdapter is complete, wired into
  ingest, and tested against a saved results fixture — but returns [] in production until
  a reachable path exists. It never injects fixture data as real. **Action: a RU-region
  or residential proxy, a commercial zakupki mirror/API, or the OpenData FTP would
  unblock the single highest-value Russia data source (fortifications/drones/graves =
  capability + casualty + regional-strain signal).**
- **rosstat.gov.ru / customs.gov.ru unreachable** from Vercel too → their series show as
  `classified`/`unreachable` in the data-dark tracker (which is itself the intended
  signal). MinFin + CBR are reachable and polled live.

- **COMTRADE_API_KEY (optional)** raises UN Comtrade rate limits + unlocks the
  authenticated endpoint (comtradeapi.un.org/data/v1). Keyless preview works now
  (1 period/call, looped) and populated 1,724 rows. Register at comtradeplus.un.org
  for higher volume / monthly-frequency pulls. Not blocking.

- **Ownership graph keys (build 5)**: Companies House (free,
  api.company-information.service.gov.uk) and OpenCorporates (freemium) are reachable but
  still need access decisions/keys. Adapter runs in stub mode now (seeded links for entities in-graph: Rotenberg,
  Rosnano). Add COMPANIES_HOUSE_API_KEY (free registration) → `GET /api/cron/enrich?only=ownership&refresh=1`
  populates real officer/PSC edges for company entities. (Ownership refresh needs no `before` cutoff — that
  is required only for a `only=sanctions` refresh, per branch `codex/opensanctions-monthly-rescore`.) Not blocking.

## 2026-07-07 (coverage & compliance sprint)

- **OpenSanctions commercial licensing remains unresolved.** The live quota is a one-month
  trial-shaped arrangement; commercial licensing MUST be resolved before charging customers
  for compliance surfaces (see `HUMAN-SETUP-TODO.md` §7). Treat current data as beta/internal.
- **Name-collision risk in OpenSanctions matches:** matching is name-based (we hold no
  DOB/nationality properties). Spot-check found 1 of 5 sampled matches unverifiable
  (common Russian name matched a Ukrainian-sanctions-listed businessman; our entity is
  an orphan with zero linked claims). Mitigation queued: require ≥1 linked claim before
  enriching, render match score + caption next to badges. Logged in
  docs/reviews/COVERAGE-SPRINT-RESULTS.md.
- **arabnews.com RSS frozen upstream since 2026-04-25** — root cause of "sa dark since
  Jul 5" (not bot-walling; feed is 200/valid XML but never updates). sa revived via
  Saudi Gazette + Asharq Al-Awsat EN; il revived via JPost + Ynet (timesofisrael still
  403 from Vercel but reachable from the build host). bh/kw: still no working feed
  (HTML-not-RSS / 404 / 405 / KUNA unreachable) — remain scaffolded.

## 2026-07-15

- **Saved `NEON_API_KEY` expired or revoked.** Production database access is healthy, but
  `npm run test:integration` cannot create its disposable Neon branch: the branch API returns
  401 before any test or database mutation. **Action:** issue a new Neon project API key, update
  local `.env.local` and the GitHub Actions secret, then rerun the 22-test integration suite.

## 2026-08-17 (business-docs reconciliation — status sweep of the log above)

Cleared since their entries were written:

- **Stripe keys (2026-07-04 #4) — SUPERSEDED, not missing.** The plan of record is Paddle
  as Merchant of Record (`docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`);
  `src/lib/pricing/` is deleted and no Stripe flag exists in `src/`. The live blocker is
  the **packaging freeze + Paddle AUP approval** (HUMAN-SETUP-TODO §11), not Stripe keys.
- **NEON_API_KEY (2026-07-15) — CLEARED.** The saved key works again; disposable-branch
  integration tests run (107/107 green as of 2026-08-16). Confirm the Actions secret.
- **X ingestion** — `X_API_KEY` live since July; 175,842 docs; bounded auto-recovery
  production-proven Aug 10–14. **MTProto** — `TELEGRAM_SESSION` live since 2026-07-11.
- **bnow.net DNS + Postmark** — live since 2026-07-15 (DKIM/SPF/DMARC pass). The partner-
  outreach motion this gated is unblocked (and unstarted — PARTNER-STRATEGY.md).

Still open and accurate as written: VERCEL_TOKEN (expired; CLI session works),
ANTHROPIC_API_KEY (optional), ACLED (optional), GDELT flakiness, zakupki egress (needs
proxy/mirror decision), rosstat/customs unreachable (intentionally surfaced as data-dark
signal), OpenSanctions **commercial licensing** (the binding compliance-ICP blocker;
PAYG €0.10/query verified 2026-08-17), Companies House key (application pending),
OpenCorporates (unevaluated), COMTRADE_API_KEY (optional — premium now priced at
$2k/$6k/$12k per year, see HUMAN-SETUP-TODO §10), bh/kw feeds, sa fragility.
