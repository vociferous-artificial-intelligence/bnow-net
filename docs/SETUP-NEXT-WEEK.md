# SETUP-NEXT-WEEK — the operator checklist

Rewritten 2026-07-07 (hardening session). One ordered list of every known operator
action. The app is live and self-sufficient without any of these — they unlock coverage,
quality, deliverability, and revenue. Do them top-to-bottom; each says the env var,
where to get it, cost, and what it unlocks. Finish with the smoke test at the bottom.

Orientation: live app **https://bnow-net.vercel.app** (Vercel `bnow-net`, team
`vociferous`) · DB: Neon project **bnow** (`crimson-wave-84127605`, us-east-1, PG17) ·
state: `AGENTS.md` · blockers detail: `docs/BLOCKERS.md` · plain-language summary:
`docs/STATUS-REPORT.md`.

Adding any env var to production: `npx vercel env add <NAME> production` then redeploy
(`npx vercel@latest deploy --prod --yes`). Also mirror into `.env.local` for scripts.

---

## 1. LLM credit watch — $0, 5 min, keeps everything running

| | |
|---|---|
| Env var | `OPENAI_API_KEY` (already live) |
| Where | platform.openai.com/settings/organization/billing |
| Cost | gpt-4o-mini usage — whole backtest cost ≈ $2; ~$0.50/day steady state |
| Unlocks | everything: digests, validation matching, /ask, entity audit |

The account died once mid-weekend and everything silently degraded to the extractive
stub. Check the balance; set an auto-recharge or a billing alert.
**Alternative now supported:** put `ANTHROPIC_API_KEY` (console.anthropic.com) in prod —
the provider seam auto-uses Claude (`claude-sonnet-5` default, `ANTHROPIC_MODEL` to
override) when no OpenAI key exists, or force it with `ANALYSIS_PROVIDER=anthropic`.

## 2. Fresh VERCEL_TOKEN — $0, 5 min

| | |
|---|---|
| Env var | `VERCEL_TOKEN` (local `.env.local` + GitHub Actions secret if CI deploys) |
| Where | vercel.com/account/tokens |
| Cost | $0 |
| Unlocks | scripted/CI deploys; the old token (scenefiend env) is expired — weekend deploys used the machine's CLI session |

Verify: `npx vercel whoami --token $VERCEL_TOKEN` → `go-vociferous`.

## 3. bnow.net DNS + domain attach — ~$0, 10 min + propagation

| | |
|---|---|
| Env var | `NEXT_PUBLIC_SITE_URL=https://bnow.net` (production) |
| Where | Vercel dashboard → bnow-net → Settings → Domains → add `bnow.net` + `www` ; registrar: `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com` |
| Cost | domain already owned |
| Unlocks | real brand URL in emails/shares; prerequisite for Postmark migration (step 4) |

## 4. Postmark sending identity → bnow.net — $0, 20 min

Email is LIVE but borrowing the scenefiend Postmark domain — magic links and digests
send from scenefiend's identity. After step 3:

1. Postmark dashboard → Sender Signatures / Domains → add `bnow.net`.
2. Add the DKIM + Return-Path DNS records Postmark shows at the registrar; verify.
3. Update prod env: `POSTMARK_FROM_EMAIL="BNOW.NET <digest@bnow.net>"` (keep
   `POSTMARK_SERVER_TOKEN`/`POSTMARK_MESSAGE_STREAM`; a bnow-dedicated server token in
   the same account is cleaner — create server → swap token).
4. Redeploy; sign in once end-to-end.

Cost: Postmark free tier 100 emails/mo, then $15/mo. Unlocks: deliverability +
brand-correct sender. (Resend remains a supported alternative in the seam.)

## 5. Telegram MTProto — $0, 20 min + ~1h adapter work

| | |
|---|---|
| Env vars | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` |
| Where | my.telegram.org → API development tools |
| Cost | $0 |
| Unlocks | full-history backfill + channels with disabled web previews (several MoD/milblogger channels the current t.me/s/ scraper cannot read). Interface ready (`SourceAdapter`); implement with GramJS behind it |

## 6. X/Twitter API via twitterapi.io — paid; the single biggest coverage unlock

| | |
|---|---|
| Env var | `X_API_KEY` |
| Where | api.twitterapi.io dashboard |
| Cost | third-party pay-as-you-go; docs currently advertise `$0.15 / 1,000 tweets` and `$0.18 / 1,000 profiles` |
| Unlocks | **166 X accounts ISW cited in the last 90 days** that we currently cannot read at all. Citation-weighted source parity is ~51%; the missing half is mostly X. Registry knows exactly which accounts to poll |

Status 2026-07-07: `X_API_KEY` is present locally and a smoke call succeeds:
`curl -H "X-API-Key: $X_API_KEY" "https://api.twitterapi.io/twitter/user/info?userName=elonmusk"`.
This is **not** the official X API; do not use `X_BEARER_TOKEN`/developer.x.com unless a
future compliance requirement mandates the official path. Engineering follow-up: replace
the fixture X adapter with a twitterapi.io adapter and a hard spend/rate guard.

## 7. OpenSanctions key — commercial, prices on request

| | |
|---|---|
| Env var | `OPENSANCTIONS_API_KEY` |
| Where | opensanctions.org/api/ (register; commercial use is paid, bulk data is non-commercial-only) |
| Cost | from ~€ low hundreds/mo (their pricing) |
| Unlocks | REAL sanctions/PEP badges on /entities (stub data no longer renders anything — hardened 2026-07-06). After adding: `curl -H "Authorization: Bearer $CRON_SECRET" "https://bnow-net.vercel.app/api/cron/enrich?refresh=1"` |

## 8. Companies House key — $0, 10 min

| | |
|---|---|
| Env var | `COMPANIES_HOUSE_API_KEY` |
| Where | developer.company-information.service.gov.uk (free registration) |
| Cost | $0 |
| Unlocks | real UK officer/PSC ownership edges on entity pages (stub edges no longer render). After adding: `.../api/cron/enrich?only=ownership&refresh=1` |

## 9. UN Comtrade key — $0 (free tier), 10 min

| | |
|---|---|
| Env var | `COMTRADE_API_KEY` |
| Where | comtradeplus.un.org → register → subscription key |
| Cost | free tier fine; premium only if volume demands |
| Unlocks | higher rate limits + monthly-frequency pulls for /trade mirror-flow analysis and /critical-materials (currently keyless preview: 1 period/call, annual only) |

## 10. Stripe activation — $0 setup, ~30 min

1. dashboard.stripe.com → products matching the `plans` table: standby $400/mo,
   full_monthly $3,000/mo, full_annual $19,800/yr.
2. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; put per-plan price ids into
   `plans.stripe_price_id` (SQL UPDATE).
3. Build the checkout route behind the flag, then set `FEATURE_STRIPE=true`.
4. Waiting buyers: `SELECT * FROM subscribe_intents ORDER BY created_at;`

Note from the original brief (§6.5): sell **regional bundles** and annual-first pricing;
see OPEN-TASKS #12 before finalizing the Stripe catalog.

## 11. zakupki.gov.ru access — the highest-value blocked RU source

zakupki (state procurement: fortifications/drones/graves tenders) is unreachable from
both the build host and Vercel egress; the adapter is complete and returns [] until a
path exists. Options, in preference order:
1. **RU-region or residential proxy** (e.g. a commercial residential-proxy service,
   ~$10-50/mo) — set it up as an HTTP proxy the adapter can use (small code change).
2. Commercial zakupki mirror/API (several RU-market data vendors resell it).
3. The official OpenData FTP dumps (ftp.zakupki.gov.ru), if reachable from a proxy.

## 12. Legal: sanctions-exposure counsel review — from the brief (§8.6)

Handling Russian state-media content may carry sanctions exposure. Get a counsel review
of ingesting/processing RU state-media (TASS, RIA via TG, Press TV) before charging
customers. One-time; also covers the ISW-derived-data posture (we store citations +
classifications, never prose — see AGENTS.md legal invariant).

## 13. Push to GitHub → CI goes live — $0, 2 min

The repo has a remote (github.com/vociferous-artificial-intelligence/bnow-net) but this
box cannot reach GitHub (SSH egress blocked); 90+ commits are local-only. From any
machine that can: `git push origin main`. That activates `.github/workflows/ci.yml`
(typecheck+lint+test on every push/PR). Optional secrets for the DB integration-test
job: `NEON_API_KEY`, `NEON_PROJECT_ID`, `DATABASE_URL`. Local clones: run
`git config core.hooksPath .githooks` once to get the enforced pre-push gate.

## Optional / when needed

- **ACLED** (`ACLED_API_KEY`, `ACLED_EMAIL` — acleddata.com/register, free for research):
  secondary event-data validation baseline.
- **GDELT**: no key; upstream flaky (blocker #10) — self-heals when their API recovers.
- **sa (Saudi) feeds are dark** since Jul 5 (OPEN-TASKS #10) — needs a feed-health pass,
  not a key.

---

## The 10-minute smoke test (run after EACH key you add)

```bash
cd ~/code/bnow.net && set -a && source .env.local && set +a
BASE=https://bnow-net.vercel.app   # or https://bnow.net after step 3

# 1. app up + public pages render
curl -s -o /dev/null -w "landing %{http_code}\n"    $BASE/
curl -s -o /dev/null -w "scoreboard %{http_code}\n" $BASE/scoreboard
curl -s -o /dev/null -w "trade %{http_code}\n"      $BASE/trade

# 2. crons authorized + healthy (also proves CRON_SECRET)
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/probe" | head -c 300; echo

# 3. ingestion flowing (docs in the last 2h)
npx tsx scripts/sqlq.ts "SELECT adapter, count(*) FROM raw_documents WHERE fetched_at > now() - interval '2 hours' GROUP BY 1"

# 4. digest + validation freshness (yesterday should be present per active theater)
npx tsx scripts/sqlq.ts "SELECT c.iso2, d.track, d.digest_date, d.provider FROM digests d JOIN countries c ON c.id=d.country_id WHERE d.digest_date >= (now() - interval '1 day')::date ORDER BY 3 DESC, 1"

# 5. after an LLM key change: force one digest+validation and eyeball it
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/digest?country=ua&date=$(date -u -d yesterday +%F)" | head -c 400; echo
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/validate?date=$(date -u -d yesterday +%F)&country=ua" | head -c 400; echo

# 6. after enrichment keys: refresh + check badges rendered from REAL data only
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/enrich?refresh=1"; echo

# 7. full cron audit (all 8 crons, stub-contamination check)
npx tsx scripts/audit-cron.ts

# 8. gates still green locally
npm test && npx tsc --noEmit && npm run lint
```

Expected: all 200s; ingest rows present; yesterday's digests exist for ru/ua/ir (+ gulf);
enrich reports matched/sanctioned counts consistent with which keys exist; audit script
shows every cron with recent evidence and **zero stub docs / zero claims citing them**.
