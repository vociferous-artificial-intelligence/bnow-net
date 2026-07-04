# SETUP-NEXT-WEEK — Gregory's Monday checklist

Ordered. Each step says what to do, which env var it fills, and what you should see
afterward. The app is live and self-sufficient without any of these — they unlock
quality (LLM digests), reach (email/domain), and revenue (Stripe).

## 0. Five-minute orientation

- Live app: **https://bnow-net.vercel.app** (Vercel project `bnow-net`, team `vociferous`)
- DB: Neon project **bnow** (`crimson-wave-84127605`, us-east-1, PG17)
- Read `AGENTS.md` → current state + decision log, `docs/BLOCKERS.md` → everything below.
- Repo has an original-brief gap: `docs/PRODUCT-BRIEF.md` is **reconstructed** — drop in
  the real brief and diff (Blocker #1).

## 1. Restore LLM analysis (highest product impact, ~10 min)

The pipeline ran real LLM digests until the OpenAI account's credit died (Blocker #9).
Everything since uses the extractive stub — works, but quotes rather than synthesizes;
scoreboard coverage jumps when a real provider returns.

Option A (fastest): add credits at platform.openai.com/settings/organization/billing.
Option B (preferred per original plan): get `ANTHROPIC_API_KEY` at console.anthropic.com
   → then implement `anthropic` provider behind `src/lib/analysis/provider.ts` (seam is
   ready; ~1h with tests).

Then:
```bash
npx vercel env rm ANALYSIS_PROVIDER production   # removes the stub override
# regenerate recent digests with the LLM (any window you want):
set -a; source .env.local; set +a
curl -H "Authorization: Bearer $CRON_SECRET" "https://bnow-net.vercel.app/api/cron/digest?date=2026-07-05"
curl -H "Authorization: Bearer $CRON_SECRET" "https://bnow-net.vercel.app/api/cron/validate?date=2026-07-05"
```
**Expect:** /digests/... shows synthesized English claims with multi-doc citations;
scoreboard coverage on new days rises well above stub baseline (7.8% avg).

## 2. Point bnow.net at Vercel (~10 min + DNS propagation)

1. Vercel dashboard → bnow-net → Settings → Domains → add `bnow.net` + `www.bnow.net`.
2. At your registrar: `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com` (Vercel
   shows exact records after you add the domain).
3. Set env `NEXT_PUBLIC_SITE_URL=https://bnow.net` (production) — used in email links.
**Expect:** https://bnow.net serves the landing page with a cert within ~30 min.

## 3. Fresh VERCEL_TOKEN (5 min — CI/automation only)

The token in scenefiend's env is expired (Blocker #2); this weekend deployed via the
machine's CLI session. vercel.com/account/tokens → create → put in `.env.local` as
`VERCEL_TOKEN`. **Expect:** `vercel whoami --token $VERCEL_TOKEN` prints go-vociferous.

## 4. Telegram MTProto (~20 min, big ingestion upgrade)

my.telegram.org → API development tools → create app → `TELEGRAM_API_ID`,
`TELEGRAM_API_HASH` into `.env.local` + `vercel env add` (production).
Real adapter to implement behind `src/lib/adapters/stubs.ts` seam (GramJS; interface
ready). Until then t.me/s/ web scraping covers the top ~25 channels hourly.
**Expect after implementing:** /admin/ingest shows `telegram_mtproto` doc counts
climbing; channels with disabled previews (some MoD channels) start flowing.

## 5. Resend (~10 min)

resend.com → add domain bnow.net (SPF/DKIM records) → `RESEND_API_KEY`, 
`EMAIL_FROM="BNOW.NET <digest@bnow.net>"` in Vercel env.
**Expect:** magic-link sign-in emails deliver; `scripts/email-digest.ts` sends instead
of writing to `data/outbox/`.

## 6. Stripe (~30 min)

1. dashboard.stripe.com → create products matching `plans` table: standby $400/mo,
   full_monthly $3,000/mo, full_annual $19,800/yr.
2. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and per-plan price ids into
   `plans.stripe_price_id` (SQL update) + Vercel env.
3. Build checkout route behind the flag, then `FEATURE_STRIPE=true`.
**Expect:** /pricing buttons become live checkout. Intent list to convert manually:
`SELECT * FROM subscribe_intents ORDER BY created_at;`

## 7. Optional keys

- **ACLED** (acleddata.com/register → `ACLED_API_KEY`, `ACLED_EMAIL`): event data
  cross-check in validation.
- **X API** (developer.x.com, paid): only if the ~1,300 registry X sources justify it.
- **GDELT**: no key needed — API was flaky all weekend (Blocker #10); check
  /admin/ingest for a `gdelt` row appearing on its own.

## 8. Weekend-debt worth knowing about

- 37/1,577 ISW pages unparsed (year-less titles etc.) — fix path in PHASE0-FEASIBILITY.md.
- Registry has no per-source country column yet; UA-channel tagging is via language.
- Validation matcher is keyword-based; LLM matching upgrade rides on step 1B.
- Local WSL2 box cannot reach api.openai.com / api.gdeltproject.org (TCP timeouts) —
  anything LLM runs through Vercel; keep it that way or fix WSL networking (MTU?).
