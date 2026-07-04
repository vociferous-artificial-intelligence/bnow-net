# BNOW.NET

Subscription OSINT data-intelligence: per-country conflict feeds with **transparent,
data-derived source reliability ratings**, an automated daily digest where **every claim
is traceable to its source documents**, and a public **validation scoreboard** that scores
our output against ISW's daily assessments.

**Live:** https://bnow-net.vercel.app · Launch theater: Russia + Ukraine

## How it works

1. **Registry** (`/registry`) — 6,985 sources mined from 1,565 ISW Russian Offensive
   Campaign Assessments (2022–2026): citation frequency, hedging distribution
   (confirmed/claimed/unverified/assessed), decay, reliability score.
2. **Ingestion** — keyless adapters (RSS × 8, Telegram web previews for 25+ channels
   selected by the registry itself, GDELT) pull into `raw_documents`, hash-deduped,
   every 15 min via Vercel cron. Keyed adapters (MTProto, X, ACLED) ship as
   fixture-backed stubs until credentials exist.
3. **Analysis** — `AnalysisProvider` seam: OpenAI structured extraction when a key has
   credit, deterministic extractive fallback otherwise. Claims cannot exist without
   source links — enforced by a deferred Postgres constraint trigger.
4. **Validation** (`/scoreboard`) — daily comparison against ISW's Key Takeaways using
   derived keyword signatures (trilingual toponym/action matching, never ISW prose):
   coverage %, thin-sourced rate, information lead in hours, divergence drill-down.

## Develop

```bash
npm install
npm run db:migrate && npx tsx scripts/seed.ts   # needs DATABASE_URL in .env.local
npm run dev
npm test
```

Key scripts (all idempotent/resumable): `isw-fetch` → `isw-parse` → `isw-load` →
`registry-materialize` (Phase 0 pipeline) · `ingest` · `digest` · `validate` ·
`backtest` · `telegram-backfill` · `email-digest`.

## Operations

- Deploy: `npx vercel@latest deploy --prod --yes` (main must be green: `npm test`).
- Crons (vercel.json): ingest */15, telegram hourly, digest 21:30 UTC, validate 07:00 UTC.
- Docs: `AGENTS.md` (state + decisions), `docs/BLOCKERS.md` (missing credentials),
  `docs/SETUP-NEXT-WEEK.md` (operator checklist), `docs/reviews/` (stage gates).

## Legal posture

Scraping is for internal analysis only: ≥2s/host spacing, robots.txt honored, disk
cache prevents refetching. No ISW prose or third-party article text in user-facing
output — only URLs, classifications, counts, and scores (see `docs/PRODUCT-BRIEF.md` §8.6).
