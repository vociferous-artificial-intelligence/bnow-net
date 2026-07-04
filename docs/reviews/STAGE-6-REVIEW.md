# Stage 6 Review — Hardening & Monday handoff

**Date:** 2026-07-04 · **Status: PASS — Definition of Done met**

## Quality gate
- `npm run lint` clean · `npm run typecheck` clean · `npm test` 37/37 ·
  `npm run build` green · final deploy live.
- Route audit: 11/11 public+admin routes 200; cron endpoints 401 without secret;
  /health green.

## Definition of Done (execution prompt) — audit

| Item | Status |
|---|---|
| Deployed Vercel app on Neon, main green, tests passing | ✅ https://bnow-net.vercel.app |
| Registry ≥2,000 sources w/ hedging, explorable | ✅ 6,985 sources / 251,112 citations, /registry |
| Live ingestion ≥6 keyless feeds, deduped | ✅ 8 RSS + 25 TG channels, 6,930 docs, hash-deduped |
| Daily RU/UA digest on cron, claims traceable | ✅ 30 digests, 349 claims, 358 source links, DB-enforced |
| Scoreboard ≥14 backtested days vs ISW | ✅ 28 runs (14 days × 2 theaters) |
| Auth + pricing + intent capture; Stripe/email flagged off | ✅ |
| AGENTS.md / PROGRESS / reviews / BLOCKERS / SETUP-NEXT-WEEK current | ✅ |

## Budget & guardrails
- LLM spend: ~$0.02 (one gpt-4o-mini digest before the account's own quota died).
- Scraping: 2.1s/host, robots-compliant UA, everything disk-cached once.
- No ISW/source prose in any user-facing output (keyword signatures only).

## Final DB state
1,565 ISW reports · 6,985 sources · 251,112 citations · 6,930 raw documents ·
30 digests · 349 claims · 358 claim-source links · 28 validation runs.

## Handoff
docs/SETUP-NEXT-WEEK.md is the Monday runbook: LLM credits/key → DNS → token →
MTProto → Resend → Stripe, each with its expected result.
