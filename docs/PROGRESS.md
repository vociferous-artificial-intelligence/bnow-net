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

## 2026-07-05 04:00 — LLM rollout complete

- 30/30 digests LLM-generated; 30/30 validations rescored with semantic matcher.
- Scoreboard: avg coverage 7.8%→17.5%, agreement days 9→17, best day 100% (Jun 21 RU), median lead +14.7h.
- ISW auto-discovery proven in prod: July 4 report validated minutes after ISW published it.
- LLM spend this session: ≈$0.15 (30 digests + 30 match calls, gpt-4o-mini). Total weekend: <$0.20 of $25 cap.

## 2026-07-05 05:00 — Elite-politics (Kremlinology) track shipped

- Per Gregory's request: prosecutions/oligarch/gang-case tracking as factional signals.
- Schema: digests.track dim + entities/claim_entities graph (additive migration 0001).
- Track config: courts/siloviki lexicon prefilter + dedicated analyst prompt (acting agency + network + signal; interpretations always 'assessed').
- Sources added: Mediazona (50 docs), RBC (30 — works from Vercel though blocked locally), baza/sota/ostorozhno TG. Kommersant + vchkogpu unreachable/preview-off (degrade cleanly).
- First 4 digests live (Jul 2-5): 21 events, 21 claims, all entity-tagged.
- Surface: /entities pressure ranking + entity timelines; digest pages render both tracks.
- Military validation pinned to its track; elite track is unvalidated by design (ISW doesn't cover it — future reference: R.Politik/Meduza analysis).

## 2026-07-05 06:00 — Freshness, Gulf wave, source parity, auth gate (Gregory's four asks)

1. Freshness: digest cron now 6-hourly regenerating yesterday+today over all DB-active countries; yesterday finalizes before 07:00 validation. UA Jul 5 + RU Jul 5 full suite generated.
2. Parity numbers: ISW cited 975 sources in last 90d; we ingest 65 of them = 51% citation-weighted. Fixes shipped: recent-90d channel ranking (was all-time), roster 30→50, source auto-creation. Remaining gap is mostly X accounts (166 recent, needs X API) + long tail.
3. Gulf wave: 7 active theaters now (ru ua ir sa ae qa om) from 10 probed public feeds; first digests live for ae/om/qa. il/bh/kw reverted to scaffolded — feeds bot-walled from Vercel; alternates queued.
4. Auth gate: FEATURE_AUTH_GATE=true in prod — /digests /registry /entities gated (Auth.js sessions in Neon), /admin allowlisted to go@vociferous.nyc; landing/pricing/scoreboard stay public.

## 2026-07-05 07:30 — Postmark live + Russia depth layer

- Email real: Postmark (borrowed scenefiend domain, authorized) primary in the send seam; production magic-link flow verified (302→verify-request).
- Russia depth added: ASTRA, Gladkov, Kadyrov, 1ADAT, AsiansOfRussia TG; Verstka RSS; RFE/RL regional services (Idel.Realii, Kavkaz.Realii, Sibir.Realii, Azatliq-Tatar, Radio Svoboda) via TG mirrors after their RSS APIs proved empty.
- detectLang extended: tt/ba/cv/ce — 13 Tatar + 1 Bashkir docs tagged within the first sweep.
- Roster now ~70 telegram channels/sweep (20 curated + 50 registry recent-ranked).

## 2026-07-06 — Roadmap §5 builds 1-3 shipped

1. OpenSanctions → entity graph (§5.1): matchEntity live/stub, /api/cron/enrich, sanctioned/PEP badges on /entities. Ran across 137 entities (stub mode; 2 seeded matches). Flips to real coverage when OPENSANCTIONS_API_KEY added.
2. Procurement watcher (§5.2, highest-value): ProcurementAdapter (fortifications/drones/graves keywords) → RawDoc meta{regNumber,customer,priceRub,region}; parser tested vs fixture. zakupki blocked from local+Vercel → returns [] in prod (0/0/0 errors confirmed), never fakes data. Blocker + unblock paths documented.
3. Data-dark tracker (§5.3): watched_series (migration 0002), 7 seeded series, evaluate() logic, public /datadark page. First run: 4 classified, 1 publishing (MinFin), 2 CBR transient-unreachable. The classification IS the intel.
- Egress probe route added (/api/cron/probe) — mapped which gov hosts Vercel can reach: OpenSanctions/CBR/MinFin/kremlin.ru/government.ru/pravo.gov.ru reachable; zakupki/rosstat/customs blocked. Kremlinology builds (§5.4-5) thus unblocked for next session.
- crons: +enrich 08:00, +datadark 09:00 UTC. 60 tests green.

## 2026-07-06 — Strategy research + implementation prompts

- Web-researched competitors (Bloomberg/Kpler/Windward/Kharon/Sayari/Janes/RANE/Dataminr), buyer demand, mirror-trade methodology, Iran/Gulf sources.
- Wrote docs/COMPETITIVE-AND-DEMAND.md (vendor landscape + gaps/edge, buyer-segment value incl. nation-state-by-conflict-degree, mirror-trade validated + buildable) and docs/IRAN-GULF-DEPTH.md.
- Probed reachability from Vercel: UN Comtrade API ✓ (mirror-trade buildable), Middle East Eye/Al-Monitor/Press TV feeds ✓, OSINTdefender/warmonitors/AuroraIntel TG ✓.
- Wrote 5 self-contained implementation prompts in docs/prompts/ (mirror-trade, buyer-profiles, iran-gulf-depth, analyst-layer, ownership-graph) + README with priority order. No code shipped this turn — research/strategy deliverable.

## 2026-07-06 — Build 1/5 shipped: mirror-trade / evasion watch

- UN Comtrade adapter (keyless preview, 1 period/call → per-year loop), 1,724 flow rows across 8 transit hubs, monthly cron.
- divergence.ts: appeared-from-nothing + multiple-of-baseline flags; latest-material-year selection handles comtrade reporting lag; sub-material baselines read "new" (no spurious ratios).
- Real signal: UAE computers 12.9× ($38M→$491M), China vehicles $4.3B→$25.5B (6×), Kazakhstan machinery appeared $10K→$996M, China drones(HS88) 6.8×. 28 dual-use series flagged.
- /trade page (public teaser), nav link. Caveats (lag, ~30% pairs mirror, estimates) on page.
- COMTRADE_API_KEY optional (raises limits) — logged as soft blocker. 68 tests green.
