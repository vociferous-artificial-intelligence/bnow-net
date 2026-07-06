# BLOCKERS — things only Gregory can unblock

Dated log of missing credentials/capabilities. Each has a stub in place; nothing here stops the build.

## 2026-07-04

1. **Original PRODUCT-BRIEF.md missing.** Not found anywhere on this machine. Reconstructed
   from the execution prompt at `docs/PRODUCT-BRIEF.md` (clearly marked). **Action: drop in
   the original and diff.**
2. **VERCEL_TOKEN expired.** The token in `~/code/scenefiend/.env.local` returns 403.
   Deploys this weekend use the machine's logged-in Vercel CLI session (`go-vociferous`).
   **Action: generate a fresh token at vercel.com/account/tokens → `VERCEL_TOKEN` (needed for
   CI, not for local CLI deploys).**
3. **No ANTHROPIC_API_KEY.** `OPENAI_API_KEY` is present and is used as the live
   `AnalysisProvider` (≤$25 cap). **Action (optional): add `ANTHROPIC_API_KEY` at
   console.anthropic.com → flips provider per env config.**
4. **No Telegram MTProto creds.** Web-preview scraping (`t.me/s/<channel>`) is live; the
   GramJS MTProto adapter is stubbed. **Action: my.telegram.org → `TELEGRAM_API_ID`,
   `TELEGRAM_API_HASH`.**
5. **No X/Twitter API keys.** Adapter stubbed with fixtures. **Action: developer.x.com (paid).**
6. **No ACLED key.** Adapter stubbed with fixtures. **Action: acleddata.com/register →
   `ACLED_API_KEY`, `ACLED_EMAIL`.**
7. **No Stripe keys.** Plans modeled in DB; checkout behind `FEATURE_STRIPE=false`.
   **Action: dashboard.stripe.com → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_*`.**
8. **No Resend key.** Digest emails render to `data/outbox/` files. **Action: resend.com →
   `RESEND_API_KEY` (Postmark creds exist in scenefiend env but belong to scenefiend's
   sending domain — decided not to borrow them).**
9. **OPENAI_API_KEY exhausted (2026-07-04 ~15:20).** The key connects fine (from Vercel;
   local WSL2 egress to api.openai.com is blocked anyway) and generated one full UA digest
   (digestId 1, 9 events/9 claims) before returning `insufficient_quota` on every call.
   `ANALYSIS_PROVIDER=stub` (deterministic extractive) is now set in prod + local.
   **Action: add credits at platform.openai.com/billing OR provide ANTHROPIC_API_KEY and
   set ANALYSIS_PROVIDER unset/auto. LLM spend this weekend: ~$0.02.**
10. **GDELT DOC API flaky/unreachable (2026-07-04).** 429'd then connection-refused from
    build host AND returns empty from Vercel egress. Adapter is wired and degrades
    gracefully; data resumes automatically when GDELT recovers. Alternate path if it
    stays dead: data.gdeltproject.org raw 15-min export files (heavier parse, no API).

## 2026-07-05

- **Blocker #9 RESOLVED:** OpenAI account recharged. `ANALYSIS_PROVIDER=stub` override
  removed from prod + local env; all 30 backtest digests regenerated with
  `openai:gpt-4o-mini` via the Vercel digest route (local egress to OpenAI still
  blocked — that part of #9 stands as an environment note). Validation rerun after.

- **Blocker #8 RESOLVED (2026-07-05):** Postmark account (scenefiend domain) authorized and
  wired as primary email provider — magic links + digests now deliver for real.
  `POSTMARK_SERVER_TOKEN/MESSAGE_STREAM/EMAIL_FROM` set in prod. Resend remains a
  supported alternative when bnow.net gets its own sending domain.
- **New (2026-07-05):** RFE/RL regional RSS APIs (idelreal/azatliq/kavkazr/sibreal
  `/api/z*`) return empty item lists — content ingested via their telegram mirrors
  instead. Kommersant RSS + Iran International (malformed XML) + News of Bahrain/Arab
  Times (invalid XML) logged by the adapter; alternates queued.

## 2026-07-06

- **OpenSanctions API key needed** for live entity enrichment. `api.opensanctions.org`
  is reachable from Vercel; the `/match` endpoint returns 401 without a key (commercial
  API; bulk data is non-commercial only). Adapter + entity badges work in stub mode now
  (seeded fixtures); set `OPENSANCTIONS_API_KEY` (opensanctions.org/api/) then
  `GET /api/cron/enrich?refresh=1` to populate real sanction/PEP status across all
  entities. **Action: register at opensanctions.org, add key.**
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
