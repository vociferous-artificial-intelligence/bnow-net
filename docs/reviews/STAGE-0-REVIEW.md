# Stage 0 Review — Scaffold & first deploy

**Date:** 2026-07-04 · **Status: PASS**

## Built
- Next.js 16.2.10 (App Router, TS strict) + Tailwind v4; scaffolded via CNA, copied selectively (kept our AGENTS.md/README).
- Neon project `bnow` (crimson-wave-84127605, aws-us-east-1, PG17) created via API; pgvector enabled.
- Full Drizzle schema spine (14 tables + 7 enums): countries, sources, isw_reports, source_citations, raw_documents (vector(1536) embedding), events, claims, claim_sources, digests, validation_runs, auth (Auth.js shape), plans/subscriptions/subscribe_intents.
- **Traceability invariant enforced in-schema**: deferred constraint trigger `claim_must_have_source` — verified by live smoke test (orphan insert rejected at COMMIT, sourced insert accepted).
- Idempotent migration runner (`scripts/migrate.ts`, tracks `_migrations`) + idempotent seed (11 countries: ru/ua active, 8 Gulf/IL/IR scaffolded, cn deferred; 3 plans per brief §6.5).
- `/health` page with live row counts; minimal landing placeholder.
- Vercel project `bnow-net` linked; DATABASE_URL/CRON_SECRET/OPENAI_API_KEY/AUTH_SECRET set for production+preview.

## Exit criteria
| Criterion | Result |
|---|---|
| Live Vercel URL renders | ✅ https://bnow-net.vercel.app |
| Green DB check | ✅ `bg-green-600`, countries=11 |

## Decisions
- Vercel CLI 46 too old for deploy endpoint → use `npx vercel@latest` (54.x) for all deploys.
- Deployment-URL access is SSO-protected (302); the project domain bnow-net.vercel.app is public — use it everywhere.
- vercel.json/crons deferred to Stage 2 when the routes exist (also: account may be Hobby → daily-only crons; frequent ingestion runs locally this weekend).

## Known debt / risks
- No tests yet (vitest configured, zero test files) — Stage 1 parsers bring the first real suite.
- `next-auth@beta.31` pinned for Next 16 peer support; watch for breakage in Stage 5.
- Health page does sequential count queries (fine at this scale).
