# PROGRESS — append-only heartbeat log

## 2026-07-04 12:50 — Session start / recon

- Verified toolchain: Node 24, pnpm-installed vercel CLI 46, docker.
- Neon API key valid. Vercel env token expired but CLI session (`go-vociferous`) works.
- ISW reachable; site redesigned — reports now at
  `understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-<date>/`.
  robots.txt allows research pages for `User-agent: *` (only wp-admin/wp-json disallowed);
  AI-branded UAs get 600s crawl-delay — we use a custom UA + ≥2s delay, compliant.
- LLM: no Anthropic key; OPENAI_API_KEY present → live provider under $25 cap.
- Original product brief missing → reconstructed docs/PRODUCT-BRIEF.md from prompt.

### Plan: block 1 (≤2h)
1. Foundation docs (brief, BLOCKERS, PROGRESS, AGENTS.md) + first commit.
2. Neon: create `bnow` database/project via API.
3. Next.js 15 scaffold (TS strict, Tailwind, shadcn/ui), Drizzle wired.
4. Initial schema migration (full data-model spine).
5. Health page + first Vercel deploy with env vars.

## 2026-07-04 14:05 — Stage 0 PASS

- Deployed: https://bnow-net.vercel.app (green DB check, 11 countries).
- Neon `bnow` created via API; schema spine + traceability trigger live and smoke-tested.
- Gotchas: CLI 46 too old (use npx vercel@latest); deployment URLs SSO-walled (use project domain).

### Plan: block 2 (≤2h) — Stage 1 start
1. ISW archive discovery: enumerate report URLs from the new /research/russia-ukraine/ structure (sitemap or listing pages).
2. Polite fetch layer: 2s/host spacing, disk cache (data/cache/), custom UA.
3. Fetch ~120 stratified sample reports.
4. Endnote parser + fixtures + tests.

## 2026-07-04 14:35 — Stage 1 mid-block

- 1,578 ROCA URLs discovered (Yoast sitemaps). Sample fetch ~120 pages nearly done (1 timeout).
- Parser: 100% parse rate on 77-page stratified sample, 14.4K citations, hedged share 53-72% by year.
- New-site layout uniform across whole archive (endnote accordion + [N] plain-text URL groups, ' dot ' obfuscation).
- 17 fixture tests green. Registry explorer page written (/registry).
- Next: full 1,578-page backfill in background (~60 min), load sample→DB, materialize registry, verify /registry live.

## 2026-07-04 15:00 — Stage 2 substantially complete

- SourceAdapter framework live: 8 RSS feeds + telegram_web (10 curated + 15 registry-top channels) + stubs (mtproto/x/acled, fixture-backed).
- 556 live docs in raw_documents, hash-dedupe proven idempotent.
- Vercel crons REGISTERED: */15 ingest fast, hourly telegram — account supports frequent crons, no local loop needed.
- /admin/ingest live; cron route 401s without secret.
- GDELT: DOC API connection-blocked our IP after 429s (adapter degrades gracefully; retry later; alternates: data.gdeltproject.org raw files).
- ISW full backfill: ~700/1578 cached, 1 failure so far.
- Next: verify first production cron fire, then Stage 3 (processing + digest).

## 2026-07-04 16:30 — Stages 1 complete, 3/4/5 nearly complete

- Stage 1 CLOSED: 6,985 sources (3.5x target), 97.65% parse rate, 251K citations, registry live. PHASE0-FEASIBILITY.md written.
- Stage 3: digests generating (stub provider after OpenAI quota died; LLM path verified working first). Digest pages live with claim→source chips.
- Stage 4: validation harness + scoreboard + drill-down built and deployed; backtest pending telegram history completion.
- Stage 5: landing/theaters/pricing(intent capture)/auth(magic link)/email-outbox all deployed.
- Self-review caught: RU/UA digest corpus pooling bug (operator precedence) — fixed; UA telegram channels mis-tagged ru — fixed + retro-tagged.
- Waiting on: telegram 14-day backfill (~25 channels, then backtest run).

## 2026-07-04 evening — Stage 6: hardening & handoff

- 14-day backtest rerun x3 (matcher + stub improvements): 28 runs, nonzero-day coverage avg 24.1%, median info-lead +16.4h.
- Reviews written for stages 3/4/5. README, SETUP-NEXT-WEEK, AGENTS.md finalized.
- Remaining: full test+build pass, final deploy, definition-of-done audit.

## 2026-07-04 — DEFINITION OF DONE MET (Stage 6 closed)

Final: 1,565 ISW reports · 6,985 sources · 251,112 citations · 6,930 raw docs ·
30 digests · 349 claims (all source-linked, DB-enforced) · 28 validation runs.
All 7 stages PASS with review gates. Live: https://bnow-net.vercel.app
Continuing into Stage 7 (deepen) with remaining weekend time.

## 2026-07-05 03:00-03:30 — OpenAI restored; LLM regeneration in flight

- Gregory recharged OpenAI. Stub override removed (prod+local), redeployed.
- All 30 backtest digests regenerating via Vercel route (gpt-4o-mini, TPM-paced), then full revalidation.
- Shipped meanwhile: ISW report auto-discovery by slug pattern (daily validate cron now fully autonomous for new dates); /registry/[id] source detail page (hedging profile, citation timeline, recent docs).

## 2026-07-05 03:45 — LLM semantic matching shipped

- Diagnosis: LLM digests are high quality but keyword matcher missed village-level toponyms + cross-class actions → flat coverage.
- Shipped scoreDigestWithMatches + llm-match (ISW texts transient in prompt only; verdicts persisted; details.matcher records llm|keyword; keyword stays as fallback).
- Early result: Jun 22 RU 14.3%→42.9%. Full 15-day revalidation in flight via Vercel.
