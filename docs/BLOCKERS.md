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
