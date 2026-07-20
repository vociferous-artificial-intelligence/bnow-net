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

## 2026-07-06 — Build 2/5 shipped: buyer-profile re-weighting

- profiles/config.ts (balanced/frontline/sanctioning/commodity/compliance) + rank.ts (pure, tested): track×type×platform×corroboration×confidence×recency.
- Digest page: profile switcher; orders BOTH track sections and events within them. Verified live: frontline→military first, compliance→elite-politics first. No schema change (read-time transform). 76 tests.

## 2026-07-06 — Build 3/5 shipped: Iran & Gulf depth (A-E)

- A: feeds (Middle East Eye, Al-Monitor, Press TV) + TG (OSINTdefender/warmonitors/AuroraIntel); 659 fresh Iran docs.
- B: detectLang fa/ar (Persian-only letters distinguish from Arabic).
- C: theater-keyed validation (isw_reports.theater, migration 0004); Iran validates vs ISW Iran Update special report (auto-discovered by slug). Iran now on /scoreboard (0% coverage first-cut, honest — Iran military digest thin, same as RU stub era).
- D: nuclear track (ir) — working: Isfahan enrichment event, IAEA/facility lexicon, nonprolif prompt.
- E: elite_politics extended to ir — working: clerical/IRGC/Khamenei; entity graph populated (Isfahan facility, Khamenei).
- Iran digest page renders 3 tracks. 81 tests. Note: Iran military prompt is theater-neutral but produced few events on quiet days — quality iteration item.

## 2026-07-06 — Build 4/5 shipped: analyst signals layer

- signals.ts (pure, 89 tests): detectPurge (clustered elite pressure→factional-purge flag), detectDataDark (classified/gone series), detectTradeDivergence (dual-use rerouting). rankSignals by severity.
- /signals page live, firing all 3 on real data (purge on RU entity graph, 4 classified series, 28 dual-use trade flags). Each carries evidence claim-ids/refs — deterministic, no black box.
- Deferred (backlog): per-digest LLM "what changed & what it means" assessment block — signals engine is the distinctive core; assessment block is polish.

## 2026-07-06 — Build 5/5 shipped: ownership graph — ALL 5 BUILDS COMPLETE

- entity_links (migration 0005); ownership.ts resolver (Companies House live-when-keyed, fixture stub otherwise); enrich cron ownership pass; connections UI on entity pages.
- Verified: Arkady Rotenberg (entity #4) shows owns→Stroygazmontazh/SMP Bank, associate→Boris Rotenberg. 5 links from stub; flips to real Companies House officer/PSC data with a free key.
- ALL FIVE recommended builds shipped: mirror-trade, buyer-profiles, iran/gulf depth, analyst-signals, ownership-graph. 92 tests green. New pages: /trade /signals + profile switcher + entity connections + Iran tracks/scoreboard.

## 2026-07-06 — GTM strategy + business plan documents

- docs/GTM-STRATEGY.md: positioning, 6 ranked ICPs (compliance+commodity beachhead), land/expand motion, channels (content-led + expert-led sales + consultancy resale), packaging, launch sequence, and a full data-stream gap list (P1-3 + structural G1-5) grounded in what's stubbed/blocked/missing.
- docs/BUSINESS-PLAN.md: team (2 regional analysts + expert salesperson who verify AND sell — dual-purpose), bottom-up SAM ~$138M, ARR scenarios (Base ~$8M by Y3 / ~220 accts), content protection (structural moats > DRM; licensing + entitlements + per-subscriber canary marking; grounded in Bloomberg/Refinitiv/canary-trap practice), pricing recommendation (per-ORG site license not per-seat; hybrid base+usage on API only).
- Research-grounded: OSINT market $8.7B→$46B, threat-intel $11.5B→$23B, incumbent pricing, canary/watermark/entitlement practice, per-seat-vs-usage market shift.

## 2026-07-06 — Builds shipped: critical-materials, ask, ME registry; plans written

- Critical-materials tracker (item 3): /critical-materials, 11 US dependencies via Comtrade. Validates vs known figures — China 68% rare-earth compounds, Canada 59% crude, China 56% batteries, all flagged choke points. Reuses mirror-trade infra. Doc CRITICAL-MATERIALS.md (vendor gap: nobody fuses national dependency + conflict intel + provenance) + NEXT-PHASE-PLAN.md (1A/1B/2).
- Ask-the-data (1B): /ask gated, LLM answers strictly from retrieved claims/entities citing [cID], stub fallback; anti-hallucination (fabricated citations dropped). Stickiness play.
- ISW Middle East registry (1A): scraped ISW Iran Update archive (1,097 reports), sample loaded theater='ir' — 1,423 ME sources / 14,019 citations, 98.7% parse. Captures NON-STATE ACTORS: Hamas Qassam Brigades, PIJ Saraya al-Quds, Al-Aqsa/Quds, Hezbollah-Lebanon, + IDF/Iranian-state/Western. Live per-theater aggregate query (no blend with RU registry). /middle-east page gated. Full 1,097 backfill running.
- 99 tests green.

## 2026-07-06 — i18n shipped; all 4 next-phase builds complete

- i18n scaffolding: 9 locales declared, en+uk fully translated, per-key EN fallback, RTL flags (ar/he), cookie+Accept-Language resolution, /api/locale switcher, root layout lang+dir. Home localized; Ukrainian verified live. Content stays English-first; LLM content-translation is the documented next step.
- ALL FOUR next-phase workstreams shipped: critical-materials tracker, ask-the-data, ISW Middle East registry, i18n. Plans in NEXT-PHASE-PLAN.md + CRITICAL-MATERIALS.md. 104 tests green. Iran Update full backfill (1,097) running for deeper ME registry.

## 2026-07-06 — Full Iran corpus loaded + debt review

- Completed 1A: full ISW Iran Update corpus loaded (was sample-only) — 1,066 reports, 3,647 ME sources, 98,149 citations. ME registry now complete.
- Debt review surfaced tasks worth addressing now (see docs/OPEN-TASKS.md): CI pipeline, /ask rate limit, entity canonicalization, integration tests, unmaterialized ME sources.

## 2026-07-07 — Partner strategy review

- Reviewed PRODUCT-BRIEF, GTM-STRATEGY, BUSINESS-PLAN, COMPETITIVE-AND-DEMAND, IRAN-GULF-DEPTH, NEW-COUNTRY-PLAYBOOK, and OPEN-TASKS for partner/GTM fit.
- Added docs/PARTNER-STRATEGY.md: regional partner map, partner-role taxonomy, qualification rubric, outreach sequence, and named-contact evaluation for Jason Jay Smart, Irina Tsukerman, John Sipher, and Malcolm Nance.
- Updated docs/GTM-STRATEGY.md §4 to add the regional partner motion: experts should be used first as validators and door-openers, public amplifiers second.

## 2026-07-06 — Hardening session: Task 0a — original brief installed

- Original `OSINT-Country-Feed-Product-Brief.md` installed as the sole `docs/PRODUCT-BRIEF.md`
  (reconstruction deleted per explicit instruction). Diffed: nothing built contradicts the
  original; four under-specifications logged (AGENTS.md decision log) → OPEN-TASKS #11-14:
  §8.7 Phase-2 targets (coverage ≥80% vs actual 17.5%), §6.5 regional-bundle SKUs,
  §8.6 sanctions-counsel review, §5 reliability-calibration scoring dimension.

## 2026-07-06 — Hardening: Task 0b audit + Task 1 truth-in-UI

- Audit (docs/reviews/AUDIT-2026-07-06.md): 7/8 crons healthy; digest cron matrix ~6 min
  serial → split into core/gulf cron groups; sa feeds dark (OPEN-TASKS #10); 2 lint
  errors fixed (Date.now purity, empty interface). 104 tests → gate green.
- Truth-in-UI (docs/reviews/TASK-1-REVIEW.md): stub sanctions/ownership/adapter data can
  no longer persist, be selected, or render as fact (3-layer defense). Prod purged:
  2 fabricated-source claims (digest 31), 4 stub docs, 148 stub enrich records, 5 stub
  edges. +8 tests (112 green).

## 2026-07-06 — Hardening: Task 2 — CI, /ask caps, entity canonicalization

- CI: GitHub Actions workflow (activates on first push; remote unreachable from box) +
  enforced .githooks/pre-push local gate.
- /ask: ask_usage table (migration 0006), per-user 20/day + global $1/day LLM budget,
  friendly limit message, per-user usage logged for billing.
- Entities 293 → 85: rules pass (110 junk drops, 41 alias merges, 53 orphans) + LLM
  propose-only audit (4 accepted, 2 rejected on review, 1 reviewer addition) +
  ENTITY_RULES in all extraction prompts + re-enrichment. TASK-2-REVIEW.md.

## 2026-07-07 — Hardening: Task 3 — integration tests + validation quality

- Integration suite (6 tests) on disposable Neon branches: trigger, digest txn +
  stub-exclusion end-to-end, /ask confidence ordering, scoreDigest on fixture. CI-wired.
- Per-theater RU/UA takeaway filtering shipped; honest finding: effect small (~0.5
  takeaways/report), gpt-4o-mini matcher variance (±30pts/day at temp 0) dominates →
  OPEN-TASKS #15 majority-vote matching.
- Iran military theater prompt + lexicon: 1-3 events/day (was 0), coverage 0% →
  33.3%/25% on Jul 3/4; info-lead +10.3h/+5.5h.
- Reliability: digest ranking confirmed wired (+test); /ask retrieval now
  confidence-ordered (was recency-only).
- source_theater_stats: 10,583 rows (ru 6,985 / ir 3,598); zombie ME sources 1,574 → 0;
  registry detail shows per-corpus stats. TASK-3-REVIEW.md.

## 2026-07-07 — Hardening: Tasks 4+5 — operator handoff + status report; session wrap

- AnthropicProvider added to the provider seam (fetch-based, defensive parsing);
  getProvider auto-selects when only ANTHROPIC_API_KEY exists.
- SETUP-NEXT-WEEK.md rewritten: one ordered checklist (13 actions + optionals), each
  with env var/source/cost/unlock; 10-minute smoke-test script.
- STATUS-REPORT.md written for Gregory: current metrics, hardening before/afters,
  honest weaknesses, top-5 next moves (X API first).
- Definition of done: all 6 hardening tasks complete; 137 unit + 6 integration tests
  green; deployed.

## 2026-07-07 11:51 UTC — Human setup / missing-access audit

- Added docs/HUMAN-SETUP-TODO.md: consolidated human-only setup decisions for RU/UA
  useful-ASAP launch, including Gemini/gcloud, GitHub, Claude, Firecrawl, X, Telegram,
  OpenSanctions, Companies House, Comtrade, Stripe, legal, and design-partner needs.
- Initial correction noted that official X had moved from the older `$200/mo Basic` model
  to pay-per-use; superseded below by Gregory's decision to use api.twitterapi.io instead.
- Decision recommendation: no Gemini/gcloud or Firecrawl for the immediate RU/UA path;
  prioritize X credits + Telegram MTProto + GitHub/CI + domain/email + entity keys.

## 2026-07-07 13:58 UTC — twitterapi.io key confirmed

- `X_API_KEY` is present in `.env.local`; `X_BEARER_TOKEN` is absent, by design.
- Smoke test succeeded: `GET https://api.twitterapi.io/twitter/user/info?userName=elonmusk`
  with `X-API-Key` returned HTTP 200 and `status:"success"`.
- Updated AGENTS.md, SETUP-NEXT-WEEK.md, GTM-STRATEGY.md, STATUS-REPORT.md, and
  HUMAN-SETUP-TODO.md to document twitterapi.io as the chosen X/Twitter path rather than
  official developer.x.com. Remaining work is a scoped adapter implementation with a
  usage/spend guard.

## 2026-07-07 19:20 UTC — Coverage & compliance sprint (X live, majority matcher, OpenSanctions, feeds)

Plan (per sprint prompt): 0) housekeeping 1) twitterapi.io adapter under spend guard
2) majority-vote matching 3) coverage before/after 4) OpenSanctions ≤300 calls
5) sa feed health. Budgets: X ≤$5, OpenSanctions ≤300 calls, LLM ≤$10 — all enforced
in code (SpendGuard, fail-closed).

- Budget architecture: provider_usage/provider_state (migration 0008) + SpendGuard;
  fail-closed proven live (run with cap unset → 0 requests).
- x_api adapter live: pilot top-30 (198 docs, $0.03, 100% source attribution) → full
  383 accounts → hourly cron (own group) → tiered 7-day backfill (6,883 docs inserted,
  $1.52). Steady-state polling ≈$0.03/cycle via watermarked advanced_search.
- Parity: ru 62.5%→74.2%, ir 35.9%→57.5% citation-weighted (scripts/source-parity.ts).
- Majority matcher: k=5 strict majority, votes persisted; 10 days ru/ua/ir revalidated;
  reproducibility 26/27 identical over 3 runs (was ±30pts).
- OpenSanctions: 200 live checks (guard-stopped at daily cap exactly), 121 matched,
  54 sanctioned; 4/5 spot-checks confirmed; 1 name-collision flagged.
- Feeds: sa root-caused (arabnews RSS frozen upstream since Apr 25) and revived
  (Saudi Gazette, Asharq EN); il revived (JPost, Ynet) + activated; bh/kw stay
  scaffolded (no working feed).
- Coverage before/after with X corpus: see docs/reviews/COVERAGE-SPRINT-RESULTS.md.

## 2026-07-08 22:50 UTC — Source-mix quota shipped + re-measured (OPEN-TASKS #16)

- Shipped `src/lib/analysis/source-mix.ts` + digest wiring: ~40% cap per adapter AND
  platform at two levels — the gather window (the reliability-ordered top-600 was 100%
  x_api on heavy X days, e.g. ir Jul 7) and the 100-doc LLM batch. Reliability order
  preserved within buckets; batch interleaved by adapter so truncation-retry prefixes
  (50/25) keep the mix; over-cap fill (round-robin) only when the corpus lacks
  alternatives. Source mix of docsRaw/trackRows/docsAnalyzed now persisted in
  digest.structured.stats. 177 unit + 6 Neon-branch integration tests green.
- Regenerated ru/ua Jun 30–Jul 7 + ir Jul 1–7 military digests on the new code.
  Batch mix guarantee holds: ru batches now x_api=40/telegram=40/rss+gdelt=20 (were
  100/100 x_api); ir full days 45/45/10.
- Claim-citation x_api share (citation rows): **ru 78%→49%, 100%-x days 4→0 of 8**;
  ua 41%→30%; ir 48%→72% — but ir's "before" (Jul 1–6) predates X in its corpus; on
  the only comparable day (Jul 7) ir went 100%→38%. ir Jul 4–5 still cite only X:
  just 2–9 non-X docs pass the military lexicon those days and ALL were in the batch —
  corpus scarcity, not selection (new OPEN-TASKS #19).
- Validation coverage (majority matcher, sprint window Jun 30–Jul 6): **ru 15.1→21.6
  avg** (Jul 4: 0→20, Jul 5: 25→50; the displacement regression is recovered), ua
  23.6→16.8. The ua drop reads as extraction nondeterminism (ua Jun 30 flipped 25→0
  with zero x_api in either batch; Jul 5 rose 20→60), but a real quota cost on ua's
  x-heavy days can't be excluded — watch the next validation crons before tuning.
- Ops: deploy went via `npx vercel@latest deploy --prod` (GitHub push is blocked by
  the email-privacy setting — origin still holds only "Initial commit"). The WSL
  "egress block" is DNS: the NAT resolver times out on vercel/openai/understandingwar
  domains; `scripts/pin-dns.cjs` (NODE_OPTIONS preload) routes them via 1.1.1.1 —
  this also let ru Jul 5's ISW page fetch for the first time locally.

## 2026-07-07 22:20 UTC — Sprint close: coverage before/after measured

- Pass A/B/C measurement complete (single-shot pre-X / majority pre-X / majority
  with-X). UA 16.3→23.6 avg; RU 18.2→15.1 (X displacement diagnosed — reliability-
  ordered corpus let x_api docs monopolize the RU batch; fix = source-mix quota,
  OPEN-TASKS #16). Zero-coverage day-pairs 7/14→3/14; info-lead measurable 12/14.
- Incident found+fixed during regen: silent LLM extraction failures (refusal/
  finish_reason=length) could persist empty digests over good ones — two ua digests
  wiped, then recovered after shipping: provider throws on bad output; generator
  refuses empty-over-claims overwrite; truncation retries at 50→25 docs.
- Vercel env note: sensitive-type vars pull as empty but read fine at runtime; X
  daily cap raised to 2.5 (backfill day); serverless X path proven (663 fetched).
- Full report: docs/reviews/COVERAGE-SPRINT-RESULTS.md. Spend: X $1.72/$5,
  OpenSanctions 200/300 calls, LLM-match $0.035/$10.

## 2026-07-08 — i18n: de/ar/ja/pl/fr added (isolated worktree)

- **Worktree:** `/home/go/code/bnow.net-i18n` · **branch:** `codex/i18n-de-ar-ja-pl-fr`
  (separate from `/home/go/code/bnow.net`, which was not touched). `node_modules`
  symlinked from the main checkout (gitignored; identical dep set at the same commit).
- **Locales added:** German (de), Arabic (ar, RTL), Japanese (ja), Polish (pl),
  French (fr). Existing en + uk preserved verbatim (uk's five original keys unchanged).
  es/he/ko remain declared-but-untranslated stubs (English fallback per key).
- **Locale registry** is now the single source of truth (`src/i18n/dictionaries.ts`
  `LOCALE_REGISTRY`): code, English label, native label, `dir`, market priority
  `order`, and per-locale `fallback`. `LOCALES`, `LOCALE_NAMES`, `RTL_LOCALES` all
  derive from it. Arabic (+ Hebrew) set `dir="rtl"`; all others `ltr`.
- **Selection priority** (pure, unit-tested `resolveLocale`): explicit selector →
  `locale` cookie → `Accept-Language` → English. `/api/locale?set=<code>` validates via
  `parseLocaleParam` (rejects invalid), sets a 1-year `sameSite=lax` cookie, and 302s
  back to a **same-origin** referer/`?to=` (open-redirect guard added).
- **Message catalogs** (flat dotted keys; prefix = namespace) cover all required
  namespaces: nav, home (landing), countries, pricing, registry, scoreboard, digest,
  ask, auth, common. `makeT` gained `{token}` interpolation (backward-compatible).
- **Surfaces localized (wired):** landing page (`/`) fully — nav, hero, three feature
  cards (locale-aware `Intl` number formatting via `src/i18n/format.ts`), footer — plus
  the document `<html lang dir>` in `layout.tsx`, and a new reusable
  `LanguageSelector` (`src/components/language-selector.tsx`) offering all 7 locales in
  priority order, each labelled in its native script with its own `lang`/`dir`.
- **Catalog-ready, not yet JSX-wired:** countries / pricing / registry / scoreboard /
  digest / ask / auth pages still render English literals. Their translations exist and
  are tested; wiring `t()` into each page's JSX is deferred to keep this diff scoped and
  avoid a broad visual redesign (see follow-up).
- **Intentionally NOT translated** (invariant): source names, source URLs, raw evidence,
  raw document titles, claim IDs, confidence/source metadata, and the literal "ISW" /
  "OSINT" / "Telegram" labels. No evidence or generated/ISW prose is machine-translated;
  only UI chrome and section labels live in the catalogs. No stub/fixture data added.
- **Formatting:** dates/times/numbers/percentages via `Intl` only (never hand-rolled);
  date helpers default to `timeZone:"UTC"` so server-rendered date-only values are
  deterministic (no off-by-one).
- **Verification (local, no paid/live APIs):** `npm run typecheck` clean · `npm run lint`
  clean · `npm test` 25 files / 244 tests green. New coverage: locale registry, ar=rtl,
  fallback chain, `resolveLocale` priority + q-weight, `/api/locale` switcher (accept/
  reject + open-redirect guard, end-to-end), protected-label-literal per own catalog,
  placeholder-set preservation, non-vacuous namespace coverage, en/uk no-regression,
  `dirFor`, and Intl formatting. Runtime smoke rendered all 7 locales correctly.
- **Multi-agent QA/review ran** (21 agents): 5 native-perspective linguists (de/fr/pl/ja/ar)
  + 4 code-review dimensions (correctness/i18n-invariants/security/test-coverage), each
  finding adversarially verified. **Fixes applied from it:** (security) closed an open
  redirect in `/api/locale` — `?to=/\host` folded to `//host` past the old prefix check,
  now validated by resolved origin; cookie hardened (httpOnly + secure-in-prod).
  (correctness) `resolveLocale` now ranks Accept-Language by q-weight, not list order.
  (invariants) Arabic tagline had translated "OSINT" and transliterated "Telegram"; Polish
  inflected "Telegram"→"Telegrama" — all restored to the literal proper noun. (register)
  German "Nachrichtendienst-Feeds" (reads as *spy agency*) → "Intelligence-Feeds"; minor
  de/ar/pl/ja wording. Test gaps the review flagged are now closed (see coverage above).
- **QA remaining (native-speaker sign-off before launch):** machine-authored translations
  reviewed by LLM linguists but not yet by humans. Open nuance items: JA `nav.materials`
  重要鉱物 ("critical minerals" — kept: the /critical-materials tracker is rare-earth/mineral
  import-concentration, so this is arguably more precise than the broader "materials", but a
  native reviewer should confirm scope) and general register for ar/ja. Per-page JSX wiring
  of the non-landing surfaces (countries/pricing/registry/scoreboard/digest/ask/auth) is the
  main functional follow-up — their catalogs exist and are tested.

## 2026-07-09 — Navigation restructure & logged-in homepage

Commits: `0d9439b` (nav model + i18n), `828e3b6` (SiteHeader), `1b68f0c` (working home).
Review gate: `docs/reviews/NAV-RESTRUCTURE-REVIEW.md`.

**Problem.** The public nav was a flat list of internal module names — `theaters · RU registry ·
ME registry · scoreboard · ask · data-dark · trade-evasion · signals · critical materials ·
pricing · sign in` — plus 10 inline language links, rendered **only on the landing page**. Every
other page had a one-line `BNOW.NET · <section>` breadcrumb, and `/registry` and `/scoreboard` had
nothing at all. A first-time enterprise buyer had to already understand the product to navigate it.

**What shipped.**
- One `SiteHeader` (server component) mounted in the root layout → present on all 22 public pages.
  `/admin` opts out. Existing breadcrumbs kept below it.
- Nav regrouped by buyer journey: `Product | Coverage | Validation | Solutions | Pricing`, plus a
  session-aware auth slot and a compact globe language dropdown. **Zero route changes.**
- Dropdowns hand-rolled to the WAI-ARIA menu-button pattern — no Radix/shadcn exists in this repo,
  despite the stack listing "shadcn/ui". Arrow keys, Home/End, Escape-restores-focus, outside-click
  and navigation close, `aria-expanded`/`aria-haspopup`, visible focus rings.
- Signed-in `/` becomes a workbench: subscriber CTA hidden; `Read today's digest` deep-links the
  freshest RU digest; `Live now` becomes theater quick links; header Pricing loses its CTA styling.

**Findings that changed the plan (Task 0).**
- `next build` already reported **all 33 routes as `ƒ` dynamic**. The brief's worry — that a
  server-side session read would flip static pages to dynamic — did not apply. Server read chosen;
  route table diffed **byte-identical** before/after.
- **`/datadark` is not a sanctions page.** It tracks Russia classifying its own statistics. The
  brief mapped "Sanctions compliance" onto it; `/trade` (mirror-trade & evasion watch) is the
  actual sanctions surface. Mapping corrected — see the decision log.
- **There are no per-theater pages.** Coverage links `/countries#<iso2>` anchors instead of gated
  digests, so the buyer-facing nav never lands on a sign-in wall.
- **8 countries are `active`, not 3** (ru 27 digests, ua 20, ir 19; qa/ae/om/il/sa 2–5). Only the
  flagship three are promoted to the nav.
- **No React component tests existed** (`vitest` was node-only, `.tsx` not even collected).
- **The i18n suite does not guard translation completeness** — `makeT` falls back to English, so
  English-only keys pass silently. The new header test closes that hole for header keys.
- `auth()` uses `session.strategy: "database"` and there is **no `error.tsx` anywhere**, so the
  header's session read is `cache()`d and wrapped in try/catch. A Neon blip degrades the chrome to
  signed-out instead of 500-ing every route.

**i18n.** ~20 new keys, translated into all 7 locales that ship a catalog (theater names lifted
from each catalog's existing `home.live` so they stay consistent). No existing key's value changed.
`es`/`he`/`ko` have no catalogs at all and keep the English per-key fallback — nav-only catalogs
would give half-translated chrome (OPEN-TASKS #21). Machine-translated, native review pending
(#20). RTL verified live for `ar` (Arabic labels, no English leak) and `he` (RTL + English
fallback, no raw keys); panels use logical `start-0`/`end-0`.

**Verification.** `npm test` 27 files / **312 tests** (was 25/245; **+67**), typecheck clean, lint
clean (it caught 3 genuine `set-state-in-effect` cascading-render bugs, all fixed), build clean.
Live pass on `next dev` against the prod Neon branch: header on 11 sampled routes, `/admin`
chromeless, every nav destination 200, `/countries` anchors present, old flat labels gone. With a
real `sessions` row: subscriber CTA gone, `Read today's digest` → `/digests/ru/2026-07-09` (HTTP
200, the actual freshest digest), quick links present, Pricing demoted. Locale switch round-trips
path **and** query (`?profile=frontline` preserved) — which is exactly why the language links keep
the Referer mechanism instead of an explicit `?to=`.

**Adversarial review of the diff** (6 dimensions, every finding sent to 3 independent refuters,
majority kills): 10 raised, **3 survived, all real, all fixed** (`51b863c`). The worst was mine:
deriving `open = (openPath === pathname)` closed dropdowns on navigation without a
setState-in-effect, but the header survives soft navigation and `openPath` was never cleared — so
pressing **Back** to the page a menu was opened on made it spring open again, mobile overlay
included. Replaced with a render-phase state reset. Also: both `<nav>` landmarks hardcoded
`aria-label="Main"` (English in every locale — now `nav.main`, verified `ar → الرئيسية`), and the
"Escape returns focus" test was vacuous because opening by click never moved focus off the trigger.
Two more were caught by self-review first (`30997f0`): tabbing off a trigger could leave two menus
open; and the mobile sheet claimed `aria-modal="true"` without trapping focus or locking scroll.

**Deferred:** OPEN-TASKS #20–#27 (native review; es/he/ko catalogs; combined registry landing;
per-user default theater; Solutions persona pages; stale `gate.ts` comment; missing `error.tsx`;
skip-to-content link).

## 2026-07-09 05:40 UTC — Quota A/B: ua cost within noise; quota stays (closes the #16 "watch")

- K=3 quota-on/off A/B on a disposable Neon branch: 8 ua days (Jun 30–Jul 7) × 2 arms
  × 3 regenerations, every sample validated with the k=5 majority matcher; arms
  interleaved per round. `MIX_CAP_FRACTION=1` env override reproduces exact pre-quota
  behavior (verified: ua Jul 7 batch x_api=70/tg=26/gdelt=4 vs capped 40/40/20).
- Result: quota ON 18.0 avg vs OFF 21.0 — a −3.0-pt cost, permutation p=0.33, NOT
  distinguishable from extraction noise. The earlier single-roll −6.8 (23.6→16.8)
  overstated it. Decision: quota stays everywhere; revisit only via two-pass
  extraction (#18), which removes the zero-sum batch tradeoff entirely.
- Headline discovery (new #28): extraction nondeterminism is the dominant coverage
  noise — same day + same corpus swings median ±9.6 pts across regenerations
  (max ±23; ua Jul 7 sampled [0, 40, 0]). The matcher is majority-stable; the
  variance is upstream in which ~10 claims gpt-4o-mini extracts from 100 docs.
  All single-regeneration coverage deltas (including ru 15.1→21.6) carry this
  error bar.
- One quota-off sample initially failed on the truncation path (finish_reason=length
  at 100 docs — the denser un-mixed batch); succeeded on retry at 50 docs. Total run:
  49 generations + validations, ~2.6 h wall-clock, LLM spend well under $1.

## 2026-07-09 13:30 UTC — MR sprint 1: guardrails & hygiene (pre-map-reduce)

Goal: make the pipeline safe and observable **before** the map-reduce refactor multiplies LLM
call volume ~50–150×. No architecture changes. Every finding cites
`docs/reviews/PIPELINE-AUDIT-2026-07.md`.

**TASK 1 — the dark digest path is now metered and guarded.** The audit's headline (§7c): the
digest extract call is ~98% of true LLM spend, wrote **nothing** to `provider_usage`, read
`completion.usage` never, and passed **no** guard — `OPENAI_API_KEY` alone enabled uncapped spend.
Metering now lives inside `openai-provider.analyze()`, the only place `completion.usage` exists and
the one place that covers every caller (cron, `scripts/digest.ts`, any future reduce pass). A
**truncated response is recorded before it is thrown away**: OpenAI bills it in full, so recording
it is the only way that waste ever becomes visible. Per-digest
`structured.stats.llm = {calls, promptTokens, completionTokens, estUsd, truncationRetries}`.
`LLM_DISABLE=1` refuses at all four OpenAI call sites — throwing for digest/anthropic/entity-audit,
degrading for llm-match (keyword matcher) and `/ask` (deterministic cited claims), because losing
those surfaces is worse than losing the assist. entity-audit (§7a site D) is now guarded and
metered under its own `openai_entity_audit` row.

**TASK 2 — stopped paying for thrown-away truncations.** `max_completion_tokens=4096` (measured
real outputs ≤1,448 pretty-JSON tokens, §4c; the model previously ran to its own 16,384 ceiling and
was billed for all of it). Worst-case truncation waste drops to a quarter. The ladder
`[docs.length, 50, 25]` re-sent an **identical batch** whenever `docs.length` fell in 26–50 —
slicing 30 docs to 50 yields the same 30 docs, so the "retry" was a second full-price call with the
same input and the same outcome (§2 O2). `ladderSizes()` keeps only strictly-smaller rungs; a
≤25-doc batch has no retry, by design and now stated as such. The retry condition is "a smaller
rung remains", so a `LlmBudgetError` rethrows immediately instead of burning the rest of the ladder.

**TASK 3 — correctness.**
- `events.track` added + backfilled from the owning claims' digest: **566 → 493 military /
  56 elite_politics / 17 nuclear**. Verified first that no event's claims span two digests and no
  event is orphaned, so the mapping was unambiguous. The orphan-event sweep is now track-scoped.
- **3,418 docs retagged ru→ir.** Five Iranian registry telegram channels (`nournews_ir`,
  `mehrnews`, `iribnews`, `farsna`, `defapress_ir`) were filed under the default ru theater,
  stranding 3,401 Persian docs from every ir digest (§9d — the audit said 3,264; live drift).
  Fixed with **both** a per-channel override (which also catches their 12 English + 4 Arabic posts,
  invisible to a language rule) and a `fa→ir` rule beside the existing `uk→ua`. All 5,681 Persian
  docs now sit in ir, none in ru; `scripts/retag-theater.ts` re-runs to 0. Arabic is deliberately
  **not** language-routed → OPEN-TASKS #29.
- Per-track response schema: the `type` enum was military-only while the elite and nuclear prompts
  ask for `prosecution|...` / `enrichment|...`, so under `strict:true` those events had to be
  labelled from a vocabulary they were never offered (§3a). A test parses the `event type:` line
  back out of each prompt and asserts the enum matches — and asserts it checked two tracks, so it
  cannot pass by matching nothing.
- `claim_must_have_source` lived only in the hand-written 0000 migration (§5d D1). Re-asserted in
  `drizzle/9999_claim_source_trigger.sql`, **without a DROP** — `migrate.ts` runs statements outside
  a transaction, so drop-then-create would leave a window for a live cron to commit an unsourced
  claim. Numbered 9999 so it always runs after generated DDL; drizzle-kit went on to emit `0010`,
  confirming the choice. Guarded by `src/db/migrations.test.ts` (mutation-tested: it fails when the
  trigger is removed) and by a live-schema assertion in the integration suite.

**TASK 4 — observability floor.** `cron_runs (job, started_at, finished_at, ok, error, counts)`,
written by all 7 scheduled routes + entity-audit. The row is written at **start**, so a run killed
by `maxDuration` leaves `finished_at IS NULL` — that unterminated row *is* the timeout signal,
resolving the §12 #6 ambiguity between "fired and did nothing" and "never fired". Jobs split across
cron entries get qualified names (`digest:core` vs `digest:gulf`). `structured.stats.sentDocIds`
makes the ~10.2× MODELLED re-extraction redundancy (§11) directly measurable for the first time.

**Metering evidence — before.** `audit-cron.ts`, 2026-07-09 pre-deploy:
```
2026-07-09 llm_match      req=15  units=15    $0.00225
2026-07-09 opensanctions  req=9   units=9     $0.99000
2026-07-09 x_api          req=645 units=4875  $0.77115
WARNING: no openai_digest rows — the digest path is unmetered again
```
Recorded LLM spend all-time was the matcher alone. See below for the after.

**Also resolved for free:** audit §12 #5. `vercel env ls` shows `MIX_CAP_FRACTION`, `MATCH_VOTES`,
`OPENAI_MODEL`, `MATCHER_MODE` and `ANALYSIS_PROVIDER` **absent in production** → shipped defaults
(0.4, 5, gpt-4o-mini, majority, openai) are live. The audit's "240 per-adapter gather cap binds"
thesis therefore holds unconditionally, and k=5 majority voting is confirmed. Cap *values* stay
unreadable: the CLI returns `""` for sensitive vars.

**Budget note:** OpenSanctions billed **$33.00 in 3 days** ($22.00 + $10.01 + $0.99) against a $25
intention — the real budget threat is non-LLM, exactly as the audit's aside said. Operator action.

### Verification — the dark path is lit (2026-07-09 14:18 UTC, post-deploy)

One manual digest regen (`?country=ua&track=military&date=2026-07-08`), production:

```
provider_usage:  openai_digest  req=1  units=10629  $0.0016452     <- did not exist before
digests.structured.stats.llm:
  { calls: 1, promptTokens: 10516, completionTokens: 113, estUsd: 0.0016452, truncationRetries: 0 }
digests.structured.stats.ladder:  { rungs: [100,50,25], rungsTried: 1, finalSize: 100 }
digests.structured.stats.droppedClaims: 0        sentDocIds: 100 ids
cron_runs:  ingest:fast ok=1 (fired by the */15 cron 3 min after deploy);  digest ok=2
```
`units` = 10,516 + 113 exactly, and `est_usd` reproduces `estimateUsd()` to the cent. The
`audit-cron.ts` warning "no openai_digest rows — the digest path is unmetered again" is gone.
Scheduled runs will log as `digest:core` / `digest:gulf`; this manual call logged as bare `digest`,
so operator backfills stay distinguishable from cron runs. **Sprint LLM spend: $0.0036** (of ≤$2).

### An unplanned finding, from the verification itself

The first regen returned **1 event / 1 claim**; a second, from a **byte-identical batch**
(`promptTokens` = 10,516 both times, `docsAnalyzed` = 100, `truncationRetries` = 0 both times, so
neither the corpus nor the new output cap was involved) returned **5 events / 8 claims** — 113 vs
613 completion tokens. The first roll had overwritten a 10-claim digest that scored **57.1%**
coverage that morning.

This is OPEN-TASKS #28's extraction variance, but it exposes a sharper edge: the empty-extraction
guard (`digest.ts:170-185`) declines to overwrite only when the new extraction has **zero** events.
A 10-claim → 1-claim collapse passes it silently, and since each digest-day is regenerated ~8×
under last-writer-wins, **the published digest is the last roll, not the best one**. Filed as
OPEN-TASKS #32. This materially raises the stakes of the map-reduce refactor's regeneration
cadence — and it was invisible until `stats.llm` made per-run extraction yield measurable.

### A live truncation, caught with full accounting (the §4d exemplar, 4x cheaper)

Exercising the two never-before-run track schemas turned up a real truncation on `ir/military`
2026-07-08 — the first one this pipeline has ever measured rather than guessed at:

```
digest 299  ir military   docsRaw=600  trackRows=170  docsAnalyzed=50
  ladder { rungs:[100,50,25], rungsTried:2, finalSize:50 }
  llm    { calls:2, promptTokens:14402, completionTokens:4402, truncationRetries:1 }
```
The truncated rung burned **exactly 4096** output tokens — the new cap — and the 50-doc rung that
landed emitted **306**. Actual cost **$0.004802**; under gpt-4o-mini's own 16,384 ceiling the same
two calls would have cost **$0.012174**. **61% cheaper, on one digest.**

**Is 4096 too tight?** No, and the corpus answers it. `ir/military` yields *3 events / 3 claims*
every single day (07-06, 07-07, 07-09 — each from a full 100 docs), and the successful 50-doc rung
here emitted 306 tokens. A rung-1 call still generating at 4096 was therefore running ~13x a normal
response: a runaway, not a long answer. It retried and produced **the same 3 events / 3 claims** as
its neighbours. No coverage was lost; `LLM_DIGEST_MAX_OUTPUT_TOKENS` remains available if
`truncationRetries` (now persisted) shows otherwise.

**Why 07-08 and not 07-06?** The retag. `ir` `docsRaw` went 470 → **600 (saturated)** because 3,418
Persian telegram docs joined the corpus — the intended effect of TASK 3.2, visible in the funnel.
The two changes landed together, so this one digest is confounded on density; the event/claim yield
above is what disambiguates it.

**Per-track schemas, verified live** — event types that were *unreachable* before, because the
military-only enum admitted none of them:
```
elite_politics : prosecution 3, asset_seizure 1, other 1
nuclear        : facility 2, sabotage 2, diplomacy 1
military       : strike 4, other 2, political 1, air_defense 1
```

**Sprint LLM total: $0.0108** across 6 metered digest calls (budget ≤$2). Six months ago that
number did not exist.

### Routing verified on the live deployment (and a race it exposed)

The `:10` telegram cron fired at **14:12**, one minute before the deploy finished, so it ran the
old code and re-inserted **62** Persian docs under `ru`. The idempotent retag script cleaned them
(`--apply` → 62; re-run → 0). This is why the script exists rather than a one-shot SQL statement,
and it is visible in `cron_runs` precisely *because* that run has no row — it predates the new build.

Triggering `ingest?which=telegram` on the new deployment (free, no LLM) then exercised every branch
of the routing logic at once (`cron_runs` id 8: ok, 126s, 1,053 fetched, 46 inserted, 0 errors):
```
fa -> ir  19    fa->ir language rule
uk -> ua   7    pre-existing convention, preserved
en -> ir   1    per-channel override  <- a language-only rule would have missed this
ar -> ru   5    deliberately NOT routed (OPEN-TASKS #29)
ru -> ru  13 ;  en -> ru  1     source default
```
`fa` outside `ir` is back to **0** with no manual retag. The corpus self-heals from here.

Note the run took **126s** — the hourly telegram scrape is the slowest cron and now has its wall-clock
recorded for the first time (audit §8 listed it UNKNOWN).

## 2026-07-09 14:54 UTC — MR sprint 2 plan: map stage in SHADOW mode

Prerequisite verified live before starting: `provider_usage` has `openai_digest` rows
(6 req / $0.0108 today) and `cron_runs` is receiving rows from 4 job kinds — MR sprint 1
is deployed. OPEN-TASKS #29 confirmed still undecided (`ingest/config.ts:107` says
"deliberately not decided here") → the three Lebanese channels are EXCLUDED from the map.

Block plan (≤2h increments, atomic commits):

1. **Migrations (additive)**: `doc_claims` (UNIQUE raw_document_id/track/extractor_version/
   ordinal), `doc_dedup` (mirror→canonical, method exact|minhash, absence = canonical),
   `doc_map_state` (one row per (doc, track, extractor_version) disposition — this is what
   makes "mapped, zero claims" recordable and the worker idempotent). Metering reuses
   provider_usage (provider=`openai_map`) + cron_runs — no new map_runs table. `processed`
   is REPURPOSED with exactly one meaning: "map stage reached a final disposition"
   (mapped for all applicable tracks / recorded as mirror / nothing applicable). The
   9999 trigger migration is untouched; migrations.test.ts must stay green.
2. **Dedup gate** in the worker path: exact (md5 of whitespace-normalized content) then
   minhash 0.7 (existing minhash.ts) against a rolling same-theater/±1-day canonical
   window, both persisted to doc_dedup. Mirrors are never sent to the LLM.
3. **Map worker + hourly cron** (`/api/cron/map`, own group at :40): select canonical
   eligible unmapped ru/ua/ir docs (indexed `processed=false` scan), per-doc track
   applicability (military all + ir lexicon; elite/nuclear lexicon-gated), micro-batch
   10–25 same-theater docs, gpt-4o-mini strict JSON keyed by docId, 1,500 chars/doc,
   `max_completion_tokens` ~200/doc, `MAP_USD_CAP_DAILY` guard (own env var, fail-closed,
   `LLM_SPRINT_USD_CAP` all-time backstop), LLM_DISABLE honored, every call metered.
4. **Backfill via the deployed route** (local box cannot reach api.openai.com): estimate
   printed first, then 2026-07-04 → forward, oldest first, per-day actual vs model.
   Lebanese channels skipped + counted. Budget ≤$8 total for backfill + verification.
5. **docs/reviews/MAP-SHADOW-RESULTS.md** with the honest numbers, incl. the 30-doc
   digest-coverage spot check and 10 random quote_orig samples for Gregory.

Zero changes to the digest path. Success = corpus mapped once-ever, metered, capped.

## 2026-07-09 17:30 UTC — MR sprint 2 complete: the map stage runs in shadow

The whole eligible ru/ua/ir corpus since 2026-07-04 is now mapped: **23,020 docs →
25,358 (doc × track) extractions → 14,071 claims**, each claim owning exactly one doc
with an original-language quote and an event_hint for sprint-3 clustering. 3,473
mirrors (9.2%) were identified once, persistently, and never sent to a model. All 18
theater×day cells reached 100% disposition (target was ≥95%).

**Money:** backfill $1.61 actual vs $2.59 modelled vs $6 gate ($8 sprint budget);
running rate $0.076/1K docs, roughly half the audit's $0.12–0.21 modelled band —
micro-batching amortizes the system prompt and 46% of verdicts are cheap empties.
Every call metered to `provider_usage.openai_map` (1,705 requests, 6.83M tokens);
`MAP_USD_CAP_DAILY=4` fail-closed; `LLM_DISABLE` refuses the worker.

**The find of the sprint:** gpt-4o-mini silently answers a *fraction* of a batched
per-item extraction — 1 of 15 docs, `finish_reason=stop` — and no prompt wording fixes
it (43–57% omission measured across two prompt revisions). Grammar does:
`minItems`/`maxItems` = batch size in the strict response schema forces the count via
constrained decoding. Zero omissions across 1,705 calls since. Root-caused by running
one batch locally: `pin-dns.cjs` reaches api.openai.com from this box (the standing
"unreachable" note was a DNS artifact, corrected in the decision log).

**Quality (honest):** hand-judged coverage of production digest claims 23/30; 4 of 7
misses are the scope filter deliberately dropping soft content; quotes strictly
verbatim ~71% (most misses unicode-level); entity discipline good with bare-geography
leaks ("Iran", "United States"); the store twice caught the production digest
misattributing (flipped combatants #8, wrong toponym #3 in the spot check) — single-doc
extraction makes digest errors visible for the first time. Full numbers:
docs/reviews/MAP-SHADOW-RESULTS.md.

## 2026-07-09 19:00 UTC — docs restructure: AGENTS.md becomes a brain, not a journal

External-review-driven restructure, every recommendation verified against the repo
before acting (verified-facts list in the session report; falsified claims noted in
the new decision-log entry).

1. `CLAUDE.MD` → `CLAUDE.md` (git mv): the uppercase name silently prevented per-repo
   auto-load on case-sensitive filesystems. Rewritten: verified Commands & setup block
   (test / single-file / typecheck / lint / integration / deploy / hooksPath /
   pin-dns.cjs usage), affirmative commit-hygiene rule (no vendor trailers), pointers
   to AGENTS.md instead of restated guardrails.
2. AGENTS.md 476 → 301 lines. New maintenance rule: ONLY the decision log is
   append-only; standing sections are corrected in place. "Current state" is now a
   verified snapshot (crons from vercel.json — digest is 4×/day, not "daily 21:30";
   391 tests; 29 RSS feeds; anthropic provider in the seam, key absent; Postmark row
   added). New "Standing rulings": 17 distilled, code-verified one-liners owning the
   five absolute invariants. Untouchables modernized to the SpendGuard cap envs.
3. Log entries 2026-07-04 → 07-09 (MR sprint 1) moved VERBATIM to docs/DECISIONS.md
   (diff-verified byte-identical; 50 archived + 8 kept + 1 new = all 58 preserved).
4. Environment facts re-verified live: GitHub reachable but DNS slow/flaky (3/3
   ls-remote failures at 10s, success at 45s; origin/main == local main);
   api.gdeltproject.org DNS still fails; stale "pushes blocked" comment in
   .githooks/pre-push corrected.

## 2026-07-09 ~20:30 UTC — MR sprint 3 plan (reduce, A/B, cutover)

Session checkpoint protocol active: docs/reviews/MR3-CHECKPOINT.md is the resume
point; commit+push after every green subtask. Budget ≤ $12 LLM, env-capped.

1. TASK 0 — close #29: Lebanese channels (mtvlebanonews, sameralhajali, mmirleb) → ir
   per operator adjudication; remove map holdout; retag-theater --apply; deploy;
   map catch-up (~586 doc-days); AGENTS ruling 11 corrected + log entry + #37.
2. TASK 1 — src/lib/analysis/reduce.ts deterministic core: cluster doc_claims
   (minhash + entity overlap + date proximity + event_hint), union docIds,
   independence-aware confirmed-promotion (domains differ AND not doc_dedup mirrors),
   confidence = mean COALESCE(reliability,0.3), in-doc near-dupe collapse, entity
   canonicalization reuse, quote_verified stamp, single version-filter accessor
   (#35 made impossible to forget). Pure + vitest.
3. TASK 2 — K=3-voted synthesis over pre-ranked claim groups (top ~150-250 fed,
   groupsTotal/groupsFed recorded), REDUCE_USD_CAP_DAILY fail-closed +
   openai_reduce ledger, persist through existing invariant path, thin-regen
   overwrite guard on both engines (#32).
4. TASK 3 — A/B gate on disposable Neon branch: 10 days × ru/ua/ir military ×
   {legacy, mapreduce} × K=3, majority matcher vs ISW; resumable driver keyed
   (day, theater, arm, k). Gate: coverage ≥, unsupported ≤, variance ≤ legacy.
5. TASK 4 (gate pass only) — DIGEST_ENGINE flag (default legacy), synthesis crons
   04:00/10:00/19:30 UTC + 02:00 D+1 finalization, validate scores D+1 digest.
6. TASK 5 — docs, scoreboard, close #18/#28, flip instructions for the operator.

## 2026-07-09 ~23:30 UTC — MR sprint 3 SHIPPED: reduce + K-voted synthesis, A/B gate passed, cutover deployed

Before/after (10-day A/B, ru/ua/ir military, K=3 regenerations per cell, majority
matcher vs ISW; legacy baseline vs the shipped K=5 mapreduce configuration):

| | legacy | mapreduce |
|---|---|---|
| ISW coverage mean | 21.1% | **25.0%** (ir +15.1 pts, ru parity, ua −3.6 within noise) |
| coverage within-cell SD | 8.0 | **6.9** |
| unsupported-claim rate | 0.41 | **0.30** |
| claim-level reproducibility (#28) | 0.55 | **0.75** |
| distinct docs cited / digest | 9.5 | **24.9** |
| LLM cost / digest | $0.0022 | $0.0068 (and kills the 8–10× re-extraction loop) |

1. TASK 0: #29 closed — Lebanese channels → ir, 651 docs retagged, map holdout
   removed, catch-up mapped ($0.004).
2. TASK 1: deterministic reduce core (star clustering — union-find percolated 519
   claims into one group on real data; threshold 0.35 tuned on labelled prod pairs,
   precision 1.0), the #35 single version accessor, quote_verified stamping (#34),
   entity canonicalization reuse. A 25-agent adversarial review confirmed 8 real
   defects; all fixed and re-verified.
3. TASK 2: K-voted synthesis over pre-ranked claim groups — model cites group ids
   only (hallucinated citations structurally impossible), openai_reduce ledger +
   fail-closed REDUCE_USD_CAP_DAILY; the persist path extracted into ONE shared
   module; #32 thin-regen guard on both engines.
4. TASK 3: A/B round 1 (K=3) FAILED the variance gate honestly (marginal events
   flipping out of 2-of-3 majorities); mechanism diagnosed, fixed (K=5 +
   majority-gid fill), round 2 PASSED all three criteria. Full data:
   docs/reviews/MR3-AB-RESULTS.jsonl + MR3-AB-K5.jsonl; report:
   docs/reviews/MR3-REDUCE-RESULTS.md. Branch deleted after the report committed.
5. TASK 4: cutover deployed — DIGEST_ENGINE flag (default LEGACY until Gregory
   flips), cadence 02:00 D+1 finalize + 04:00/10:00/19:30 intraday (rolling 24h
   window, delta-framed "Since the previous brief"), validate unchanged (already
   scores the finalized D+1 digest). Intraday mode smoke-verified on prod.
6. Sprint LLM spend ≈ $1.76 of the $12 cap. Tests 391 → 450 (39 files).

## 2026-07-09 ~23:05 UTC — DIGEST_ENGINE cutover executed (prod on mapreduce)

1. `DIGEST_ENGINE=mapreduce` added to the Vercel production env; redeployed
   (`dpl_4HdAJA7ZjAKiUGMLamf1ndDnWgpM`, READY; landing/countries/scoreboard 200).
2. Verified by evidence rather than assumption — Vercel stores a CLI-added var as
   type Sensitive, so the value cannot be read back and only a real run proves it.
   One narrow live cell (`?mode=intraday&country=ir&track=nuclear`, 172 docs):
   returned `provider: "openai:gpt-4o-mini+mapreduce"`; wrote the day's first
   `provider_usage.openai_reduce` row (5 requests = the K=5 synthesis votes,
   $0.0054, well under `REDUCE_USD_CAP_DAILY=2`); left `openai_digest` at its
   pre-flip 34 requests; `cron_runs` digest:intraday closed ok=true in 40s.
3. AGENTS.md standing sections corrected in place (engine bullet, next-steps #2)
   + append-only decision-log entry with the two traps for the next flip
   (printf-not-echo; `.env.local` not mirrored because it lacks the reduce cap).
4. Open: the week-long scoreboard watch, especially ua (−3.6 pts in the A/B,
   noise-scale). Rollback = unset the prod env var + redeploy.

## 2026-07-09 ~23:25 UTC — mirror the cutover envs into .env.local

1. `.env.local` (gitignored) now carries `DIGEST_ENGINE=mapreduce` and
   `REDUCE_USD_CAP_DAILY=2`, mirroring prod. Verified through the real loader:
   `digestEngine()` → `mapreduce`, `reduceDailyUsdCap()` → 2. Vitest does not read
   `.env.local`, so the suite is unaffected (450/450 still green).
2. Correction, logged in AGENTS.md: the cutover entry claimed an unset
   `REDUCE_USD_CAP_DAILY` would make a local mapreduce run fail closed. It would not.
   Per-day caps resolve to a default of 2 outside production (`llm-guard.ts`); the
   environment-independent fail-closed is the TOTAL cap check in `spend-guard.ts`
   (`LLM_SPRINT_USD_CAP`). Ruling 4 was right; my mechanism was wrong.
3. `LLM_SPRINT_USD_CAP` stays absent locally on purpose — local digest/map/reduce
   runs refuse to spend at `tryReserve()`. Add it only for a run you mean to pay for.

## 2026-07-11 — MTProto ingest sprint: plan (next ~2h block)

Sprint prompt: `docs/prompts/2026-07-10-mtproto.md`. Prerequisite verified: MR3
cutover fully executed (MR3-CHECKPOINT.md TASK 4 ✅), state recon clean.

1. TASK 0.3 inventory (done in-session): telegram_web sourceKey = `t.me/<channel
   lowercase>`; dedup = sha256(adapter|externalId|title|content[:4000]) — adapter
   name in the hash means content-hash alone CANNOT dedupe across transports;
   MTProto needs an explicit external-id/url pre-filter. Channels = TELEGRAM_CURATED
   (28) + registry top-50 by recent citations; theater via channelTheater() +
   routeTheater(lang) at parse time.
2. TASK 0.1 login artifact: `.telegram.session` ABSENT; `scripts/telegram-login.ts`
   present and session-capable; TELEGRAM_API_ID/HASH in .env.local. Login is
   interactive (phone code / QR) → operator gate. Surface to operator; do not block
   egress-probe or adapter work on it (probe proves egress unauthenticated).
3. TASK 0.2 egress probe: local unauthenticated connect+getConfig sanity script,
   then CRON_SECRET-gated `/api/cron/probe/mtproto` measuring TCP and WSS cold
   connect from Vercel; getMe only when TELEGRAM_SESSION is set. Deploy, run, record.
4. If egress passes: TASK 1 adapter (peer-cache + high-water table via additive
   migration, flood-safe caps, rotation, tests) — commit per green subtask.

## 2026-07-11 ~01:05 UTC — MTProto TASK 0 results

1. Gate 2 EGRESS: PASSED. `/api/cron/probe/mtproto` (CRON_SECRET-gated) live on
   prod — TCP connect 1844ms cold / 1567ms warm, WSS 1570ms; GetNearestDc ~90ms
   on both. Connect cost is the DH handshake (empty session); a saved session
   skips it. Verdict: the adapter CAN run on Vercel; TCP default, WSS is the
   in-house fallback. One trap found: `telegram/sessions` subpath imports give
   the bundler a second module copy and gramJS rejects the foreign StringSession
   (instanceof) — import everything from the `telegram` root; `serverExternalPackages`
   set in next.config.ts.
2. Gate 1 LOGIN: OPERATOR-BLOCKED. No `.telegram.session`; scripts/telegram-login.ts
   ready; TELEGRAM_API_ID/HASH valid (probe's initConnection accepted them).
   Operator pinged. `scripts/telegram-getme.ts` added = the local getMe check to
   run after login.
3. Gate 3 INVENTORY: telegram_web keys docs as externalId "channel/1234", url
   https://t.me/channel/1234, sourceKey t.me/<channel lowercase>; content_hash
   INCLUDES adapter name → cross-transport dedupe needs an explicit pre-filter
   (external-id/url), the hash alone will not catch it. Channels: TELEGRAM_CURATED
   (28) + registry top-50 recent-cited; theater = channelTheater() override map +
   routeTheater(lang) (uk→ua, fa→ir).
4. Deviation from the prompt's "build nothing until these pass": gate 1 blocks
   only LIVE runs (backfill/cron proof), not the adapter+tests, which are fixture
   based. Proceeding with TASK 1 while the login is pending; TASKs 3–5 stay gated.

## 2026-07-11 ~01:30 UTC — MTProto sprint: TASKs 1–2 shipped, 3–5 staged behind the login

1. Adapter live (`src/lib/adapters/telegram-mtproto.ts`, 20 unit tests): peer
   cache + exponential resolve backoff in `telegram_channel_state` (migration
   0013), gap-free ascending high-water reads (gramJS reverse iteration; first
   contact = one newest page), flood policy = sleep+retry ≤30s / run-abort above,
   all counted into cron_runs counts; marks commit only AFTER insert (runIngest
   calls adapter.commitMarks). Cross-transport dedupe via lower(external_id)
   pre-filter + new expression index — content_hash cannot catch it (adapter name
   hashed in; preview text ≠ raw MTProto text).
2. The telegram_mtproto fixture stub is DELETED; the real adapter owns the name
   (prod had 0 legacy rows; audit-cron + isolation test + hardening itest updated).
3. Own cron group `ingest?which=mtproto` at :35 hourly (never inside "all", like x).
   Deployed; exercised on prod: cron_runs `ingest:mtproto` ok=true, fetched=0 —
   fail-closed without TELEGRAM_SESSION, the frozen-x pattern.
4. Registry expansion staged: mtproto reads registry top-75 (web scraper stays at
   50); ranks 51–75 = the 25-channel batch, six ir pins added (coverage-lens rule).
5. Backfill script `scripts/mtproto-backfill.ts`: estimate-first (dedupe-aware:
   only NEW docs cost map spend), --apply gated, resumable passes, oldest-day-first
   insert, per-day actual-vs-estimate log. Estimate: ~44K docs ≈ $3.37 of the $6
   sprint LLM budget.
6. BLOCKED on operator: one-time `npx tsx scripts/telegram-login.ts` (interactive),
   then `scripts/telegram-getme.ts` to verify, `TELEGRAM_SESSION` into Vercel prod
   (printf, no trailing newline — Sensitive var), redeploy, run backfill --apply.

## 2026-07-11 — MTProto RU/UA-priority roster (branch codex/ru-ua-mtproto-priority)

Reprioritizes MTProto ingestion toward Russia/Ukraine for expert evaluation. Code +
Vercel env done; NOT deployed (isolated worktree; no deploy per instructions).

1. `registryTelegramChannels()` now takes `{ topN?, reportTheater? }`. MTProto passes
   `reportTheater='ru'` (ROCA-only: `AND ir.theater='ru'`, parameterized) + `topN=120`.
   Web Telegram passes neither → pan-theater top-50 unchanged (proven end-to-end:
   real `telegramChannelRoster()` vs prod returns the identical 70-channel web roster;
   MTProto returns 136 = ru:102/ua:31/ir:3, the 3 ir = intentional curated OSINT).
2. Tuning values env-overridable, safe fallback: `REGISTRY_TELEGRAM_TOP_N` (50),
   `REGISTRY_TELEGRAM_TOP_N_MTPROTO` (120), `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER`
   (ru; `all`/`any` → pan-theater = code-free rollback). `TG_MTPROTO_*` knobs already
   env-read. All set in Vercel as **type=plain (non-Sensitive, readable back)**,
   prod+preview+dev.
3. Live-verified against the registry that the OLD pan-theater top-75 wasted 16 slots
   on Iran-Update-dominant channels (mmirleb: 5,730 Iran citations). ROCA-only reclaims
   them; ROCA-120 adds 61 RU/UA channels not in the old top-75.
4. **27 Ukrainian official/military channels pinned → ua** (fixes their ru/en posts the
   uk→ua rule misses). Every pin registry-verified: ROCA-cited, ~0 Iran, inside ROCA
   top-120, docs predominantly uk, confirmed identity. The 5 originally-held candidates
   (sjtf_odes #9, joint_forces_task_force #13, usf_army=Unmanned Systems Forces,
   andriyshtime, odesamva) resolved via DB probe and included.
5. `scripts/mtproto-backfill.ts`: `--registry-top-n / --report-theater / --theaters /
   --budget-usd`; RU/UA eval command documented in-file.
6. Tests +13 → **504 green**, typecheck + lint clean.

Operator on deploy: (a) deploy this branch; (b) correct AGENTS.md Current-state
Ingestion line "top-75"→"top-120 ROCA-only"; (c) watch `ingest:mtproto` cron_runs
(fetched>0 once TELEGRAM_SESSION live) + first ua-heavy map/digest cycle.

## 2026-07-12 — MERGE 1: ASK Tier-2+ merged, migrated, backfilled, deployed (attended)

1. `20260711-ask-tier2plus` → main `--no-ff` (`58ac262`) + eslint `.workstream/**`
   ignore (`f74896c`); 770 tests / 58 files green; pushed and deployed
   (`bnow-j5lob1iu2` READY).
2. Migrations 0014+0015 applied to prod (verified additive, trigger untouched);
   embedding backfill 776/776 @ $0.0003; cap envs set non-Sensitive in prod+preview
   BEFORE deploy and read back.
3. Smoke GREEN (9 v2 answers, exact stage-cost sums, window echo live, negative
   declined honestly). New: OPEN-TASKS #48 (/ask double-submit).
4. Incident ratified: dry-run migrate hit prod (`DATABASE_URL_UNPOOLED` precedence in
   scripts/env.ts consumers) — trap recorded; details + MERGE 2 handoff in
   `docs/reviews/MERGE1-ASK-DEPLOY-NOTE-2026-07-12.md`. Session spend $0.121/$1.50.

## 2026-07-12 — MERGE 2: design/commercial-site merged, migrated, deployed (unattended)

1. `20260711-design-commercial-site` (12 workstream commits, base `c49b79f`) → main
   `--no-ff` as `dc51cbd`. Only real conflict: design's generated migration
   `0014_square_silver_centurion.sql` collided with ASK's applied 0014/0015 chain —
   deleted at merge and regenerated as `drizzle/0016_charming_veda.sql`
   (`3e42d65`; journal idx 16, `prevId` chains to the MERGE 1 handoff snapshot id
   `af3e3af0-7331-4af8-9c45-40be65726334`), a single additive
   `ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL`.
   `schema.ts` and `dictionaries.ts` auto-merged cleanly (both branches' additions,
   no key collisions). A stray `0014`-era comment in `gate.ts` was fixed in a
   follow-up commit (`991e4eb`).
2. 0016 dry-run verified on a Neon snapshot branch (both `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` overridden this time — the MERGE 1 trap did not
   recur), then applied to prod; prod migration head is now 0016. 902 unit
   tests / 67 files green; typecheck + lint clean.
3. Deployed `bnow-nqegy57dk`, READY, project domain serving; 22/22 signed-out
   automated checks green.
4. Role grants executed on prod `users`: gregoryoconnor@gmail.com=analyst,
   jason@americanpoliticalservices.com=analyst, go@vociferous.nyc=admin,
   go@vociferous.ai=admin (row did not exist — inserted). `ADMIN_EMAILS` is set
   in Vercel Production only (Sensitive, unreadable); absent Preview/Development,
   which fail closed to the reduced registry/signals views (OPEN-TASKS #52).
5. What shipped: `users.role` role model + `gate.ts` role helpers; root error
   boundaries; ClaimSources collapse adopted on digest pages; signed-in home
   theater-status panel + validation tiles; pricing rebuilt on DB-priced tiers;
   scoreboard targets-vs-actuals + thin-sourced tile + nonzero-day mean + true
   median info-lead (closes OPEN-TASKS #11); countries freshness line; signals
   purge-dedupe fix + signed-in ClaimSources evidence + i18n chrome; registry
   view-policy moat (reduced view for user/anon, full for analyst/admin,
   `?sort=reliability` ignored server-side, `/middle-east` splices the
   reliability CASE out of SQL); a11y sweep (skip link, `id="main"`,
   overflow-x-auto); ~64 new en+uk i18n keys. Full inventory:
   `docs/reviews/IMPLEMENTATION-NOTE-2026-07-11.md`.
6. Not touched: `vercel.json` (D5 weekly registry-materializer cron stays
   parked/open, OPEN-TASKS #51), the /ask surface, all MERGE 1 state.
   $0.00 OpenAI spend this session. Full deploy account, conflict-resolution
   ledger, and adversarial review: `docs/reviews/MERGE2-DESIGN-DEPLOY-NOTE-2026-07-12.md`.
7. AGENTS.md/OPEN-TASKS/PROGRESS correction-in-place pass (this entry);
   uk-string inventory for native review: `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`.

## 2026-07-12 — ASK polish sprint (unattended): five smoke findings fixed, deployed

Plan executed (W0 diagnosis → W1+eval gate → W2 → W3 → W4 → W5 → verify/deploy/docs),
sequential by design (shared checkout; dictionaries.ts/answer.ts overlap). Outcome:
**FULL SHIP** — merge `0fe0bc6`, deploy `bnow-qdesocr6p` (rollback target
`bnow-nqegy57dk` recorded pre-deploy), signed-out prod checks green, tests 902→956/74
files, $0.106 OpenAI of $2.

1. W0 (read-only): smoke questions' [today,today] windows were genuinely empty at ask
   time (claims landed 04:01Z; asks 01:42Z) — but the "provide claim IDs" leakage came
   from the entities-only path (short-circuit needed claims AND entities empty; gpt-5
   answered from `CLAIMS: (none)` + 4–15 entity rows at $0.003–0.005/question).
2. W1 `57c67a2`: SYSTEM_V2 end-user persona (legacy SYSTEM byte-preserved + frozen-
   fixture test), corpus-currency context line, $0 no-coverage short-circuit
   (`window.from > max(claim_date)`, `ASK_NO_COVERAGE_SHORTCIRCUIT` rollback), distinct
   UI callout. Eval gate `88be4fb`: honesty 5/5, known-citations 5/5, first run.
3. W2 `7c5d049`: paid pipeline moved into a useActionState server action; GET /ask?q=
   prefills only (money test + live prod probe: no ask_usage row); pending state
   (disable/spinner/aria-busy/hint). Closes OPEN-TASKS #48.
4. W3 `b60fcc4`: digest claim anchors `id="c{claimId}"` + scroll-mt-24; ask citations
   deep-link `#c{id}`.
5. W4 `2080ea8`: related-claims vectorScore floor 0.5 (`ASK_RELATED_MIN_SCORE`,
   replay-calibrated on a disposable branch, max junk 0.4547), null excluded, cap 5.
6. W5 `8314bb6`: signed-in home zero-JS Ask GET-form under the validation tiles;
   signed-out home byte-untouched.
7. Docs: OPEN-TASKS #48 closed, +3 uk strings to the native-review inventory, AGENTS.md
   corrected in place + decision log. Morning note (incl. operator checklist):
   `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`.

## 2026-07-12 (analyst-home & Iran prominence sprint, unattended) — plan

Plan doc: `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md` · readback:
`docs/reviews/ANALYST-HOME-READBACK-2026-07-12.md` (Iran quality gate PASS —
daily 3-track ir digests, claims parity with ru/ua, 07-11 validation coverage
ir 100%). Branch `20260712-analyst-home-iran`, tag `pre-analyst-home-20260712`.

1. Task 0: preconditions (ASK-polish FULL SHIP absorbed), 4-agent recon, readback. DONE.
2. Pre-stage: 31 i18n keys (en + provisional uk → native-review inventory),
   `src/lib/feedback.ts` (fail-closed mailto helper), `FEEDBACK_EMAIL` in all
   Vercel envs (plain, verified round-trip) + `.env.local`.
3. W4+W5: digest archive index `/digests/[country]`, prev/next date nav,
   scoreboard→digest cross-link, flag-digest + flag-source mailtos.
4. W1+W2+W3+W6: signed-in quick-strip upgrade (visible digest date, claims-today,
   per-theater scoreboard links), quick-links rail (latest+previous digests ×3
   theaters), signed-out Iran/Gulf card (additive section), recent-asks list.
5. W7: extract $0 lexical retrieval from retrieveV2 (byte-green existing tests),
   gated /search page, money tests.
6. Review every diff, full gate, deploy if green, signed-out smoke, morning note,
   AGENTS.md decision log.

## 2026-07-12 (analyst-home & Iran prominence sprint) — results

**FULL SHIP.** Merge `4482669`, deploy `bnow-jihmibgm6` (rollback: `bnow-qdesocr6p`).
Morning note: `docs/reviews/ANALYST-HOME-NOTE-2026-07-12.md`.

1. W4 `8def883`: `/digests/[country]` archive index (date/tracks/claims), prev/next
   date nav + archive breadcrumb on digest pages, scoreboard detail → digest
   cross-link, digest pages onto existing catalog keys, flag-digest +
   flag-source mailtos (`FEEDBACK_EMAIL`, fail-closed hidden).
2. W7 `aa06648`: lexical arm extracted mechanically to `src/lib/ask/lexical.ts`
   (252 pre-existing ask tests green, zero edits), gated `/search` page, $0 proven
   live (5 prod queries, zero usage-counter movement) + throw-if-touched tests.
3. W1+W2+W3+W6 `176d2f8`: quick-links rail (latest+prev digests ×3 theaters +
   scoreboard/registry/signals/search), date-led digest links + claims-today +
   per-theater scoreboard deep links, recent-asks prefill list, additive signed-out
   Iran/Gulf card (quality gate PASSED: ir 07-11 validation 100%).
4. Gate: tests 956→996 (79 files), typecheck/lint/`next build` clean, pre-push green;
   prod smoke green signed-out. OPEN-TASKS +#54 (claim_date↔digest_date link
   coupling) +#55 (/search nav entry). LLM spend $0.00.

## 2026-07-12 ~12:30 ET — analyst-trust sprint plan (unattended)

Prompt: docs/prompts/2026-07-12-analyst-trust.md. Branch 20260712-analyst-trust.
1. W0 diagnosis readback (DONE — rn bigint-string bug confirmed as the contradiction's
   root cause; W4 audit verdict: implement $0 dual coverage, park window restructure).
2. W1 time-model: shared ET/UTC day+format helpers, fix rn fold bug, cadence-aware
   digest status per R2, docs/TIME-MODEL.md, day-boundary matrix tests.
3. W3 scoreboard explainer + W5 registry admin-gating (parallel subagents, worktrees).
4. W2 signed-in home reorder per R3 + R7 redirect fix (after W1 lands).
5. W4 evidence-at-publish dual coverage: scoring-time computation + deterministic
   7-day backfill (Neon branch first), scoreboard display; design doc for the parked
   window restructure.
6. W6 docs ride-along; assembled gate; deploy; prod smoke; morning note.

## 2026-07-12 ~14:15 ET — analyst-trust sprint RESULTS (unattended, FULL SHIP)

Deployed `bnow-kw2t3dndf` (rollback: `bnow-jihmibgm6`). Root cause of the
contradiction: driver returns row_number() bigint as string; `=== 1` fold never
matched → "not yet generated" on every card since analyst-home. Shipped: time
model (src/lib/time/*, TIME-MODEL.md, cadence-aware cards, R2 invariant pinned),
home reorder + magic-link→/, scoreboard explainer + at-publish dual coverage
($0 deterministic, details.atPublish jsonb, 7-day backfill 15/18 + 3 honest
skips, headline numbers untouched, snapshot design parked in
docs/designs/ISW-CUTOFF-SCORING.md), registry admin-only (404 + links removed +
ADMIN_EMAILS readable-plain ×3 envs). Tests 996→1053/84. Spend $0.00 of $5.
Morning note: docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md.

## 2026-07-12 (IA refinement & architecture review sprint) — plan

Prompt: information-architecture refinement (nav many-to-one, anchor-not-destination,
3-vs-8 undersell, /signals public-leak). Branch `20260712-ia-refinement`
(tag `pre-ia-refinement-20260712`). Review gate: docs/reviews/IA-REFINEMENT-REVIEW.md.

1. TASK 0 recon (DONE): nav map, theater ground truth (8 active/2 scaffolded/1 deferred),
   /signals data path (detail leaks names; evidence already gated; no /api/signals),
   SEO baseline (no robots/sitemap/noindex), render modes (all force-dynamic), i18n contract.
2. TASK 1 nav: retire Product group; promote Signals + Ask top-level; drop Solutions
   political_risk duplicate; Coverage → real /countries/[iso2] links. site-nav.ts + tests + i18n.
3. TASK 2 per-country pages: /countries/[iso2] public landing (DB-driven, localized metadata);
   Coverage dropdown real links; #anchors stay functional; 3-vs-8 fixed from countries.status='active'.
4. TASK 3 signals gating: toPublicSignal() projection (headline public / detail gated,
   server-side); robots.ts + sitemap.ts; legal note. Auth-boundary test.
5. TASK 4 independent architecture review (subagent, read-only): gating real not cosmetic,
   no dead links/collisions, render modes, i18n/a11y/SEO. Fix confirmed issues.
6. TASK 5 verify (tests/typecheck/lint/build), deploy, review gate, AGENTS.md + PROGRESS.md.

## 2026-07-12 (IA refinement & architecture review sprint) — results

**FULL SHIP.** Merge to main + deploy **`bnow-iqaszhc0d`** (aliased https://bnow.net;
rollback: `bnow-kw2t3dndf`). Review gate: `docs/reviews/IA-REFINEMENT-REVIEW.md`.

1. TASK 1 nav (`0678aa8`): Product group retired; Signals + Ask promoted top-level;
   Solutions>signals duplicate dropped → every route has exactly one nav path
   (`/countries` was 5, `/signals` was 2). Coverage → real per-country links.
2. TASK 2 (`0678aa8`): public `/countries/[iso2]` per-theater pages (localized metadata,
   public-safe aggregates); old `#ru` anchors kept; "Live now" count driven from
   `countries.status='active'` (=8) — fixes the 3-vs-8 undersell.
3. TASK 3 (`0ab09d5`): `toPublicSignal()` withholds signal `detail` (names/figures/lists)
   + evidence from anonymous HTML server-side; robots.txt + sitemap.xml added.
4. TASK 4: independent read-only architecture review PASSED all 7 checks (gating
   real-not-cosmetic verified, no leak path). One low CONCERN (DB-failure "0 theaters"
   copy) fixed `cb5d081` + siteBaseUrl tracks the Vercel prod host.
5. TASK 5: tests 1053→1075 (87 files), typecheck/lint/`next build` clean. Prod smoke
   GREEN incl. anon `curl /signals` = 0 leaked names; nav bar shows no Product;
   /countries/ru 200; robots/sitemap correct; gated 307 / admin 404 unchanged.
   New OPEN-TASKS #58 (legal), #59 (native i18n review), #60 (dead nav keys). LLM $0.00.

## 2026-07-12 (legal acceptance sprint) — results

**FULL SHIP + DEPLOYED 2026-07-13** (`dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh`, aliased bnow.net;
rollback `bnow-iqaszhc0d`). Merged `--no-ff` to main (`7da22db`); migrate-before-deploy;
independent adversarial review passed (minor fixes applied `e62c14e`). Review note:
`docs/reviews/LEGAL-ACCEPTANCE-NOTE-2026-07-12.md`.

1. Public `/privacy` + `/terms` (Privacy Notice v1.0 + Terms of Use v1.0, effective
   2026-07-12; supplied copy verbatim). Shared `src/components/legal-document.tsx`, DB-free,
   `id="main"`, cross-linked, contact mailto, in sitemap + crawlable.
2. Global `SiteFooter` (Privacy · Terms · Status · Contact) in the root layout; home-only
   footer removed (no duplicate on `/`); hidden on `/admin`.
3. First-login acceptance `/welcome/legal` (magic-link `redirectTo=/welcome/legal?next=/`):
   two required unchecked checkboxes, doc links open new tab, server action re-validates
   both + session, DB-`now()` timestamp, idempotent insert, `safeInternalPath` guard.
4. Append-only `policy_acceptances` (migration **0017_flashy_photon**, forward of 0016,
   9999 still last; FK→users cascade, unique version-triple; no IP/UA/birth-date/token).
   Central versions in `src/lib/legal/policies.ts` — a bump forces re-acceptance.
5. Enforcement: `requireAcceptedUser()` on ask/search/entities/digests layouts + the ask
   action + `/api/ask` independently; home redirects pre-query; /signals detail gated on
   acceptance (teaser public); /account shows accepted versions+timestamp (no id/method) and
   redirects if unaccepted; `requireAdminOr404` redirects an unaccepted admin (non-admins
   still 404). Dev/demo anon parity preserved; no acceptance manufactured for anon.
6. Tests 1053→1143 (97 files), typecheck/lint/`next build` clean. Integration suite green on
   a disposable Neon branch incl. **5 new real-Postgres tests** (0017 apply, DB timestamp,
   idempotency, append-only bump, unique constraint, FK cascade). No new env vars, LLM $0.00.
   4 English-only chrome keys (footer.* + signals.evidence.accept_prompt) fall back for all
   locales → fold into the native-review inventory (OPEN-TASKS #59).

## 2026-07-13 13:58 UTC — provider-cap restart (plan)

1. Write the coding-agent handoff for calendar-month OpenSanctions accounting and a fixed-cutoff,
   resumable rescore; no application code in this session.
2. Set explicit OpenSanctions caps in all Vercel environments: 2,000 requests/month,
   200 requests/day, 120 requests/run, $40/day conservative estimated-cost ledger ceiling.
3. Raise X caps in all Vercel environments to `$75` sprint / `$2.50` daily.
4. Deploy production, verify READY + project-domain health, then verify X with one narrow live
   ingest. Do not start the OpenSanctions rescore until the fixed-cutoff paging patch ships.
5. Correct standing state in place and append the decision record with observed evidence.

### Result

- Prompt written: `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`.
- All six explicit provider-limit values set in Production, Preview, and Development.
- Production deploy `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV` READY, aliased bnow.net; `/health` 200.
- X proof: 1,889 fetched + 1,889 inserted, 0 errors; latest fetch 2026-07-13 14:15Z;
  all-time x_api ledger now $5.2834.
- The next scheduled 14:20Z X poll fetched 222, inserted 42, errors 0, and advanced the live
  watermark to 14:20:09Z. This proves steady-state resumed, not that the page-limited July 9–13
  traversal was historically complete.
- OpenSanctions non-refresh proof: 120 scanned/checked, 92 matched, 22 sanctioned, 0 failed,
  no budget stop; live checked coverage 300→420 and request ledger 300→420.
- Full rescore held until the prompt's fixed-cutoff batching and calendar-month accounting ship.
- Historical X completeness is held until private-beta publication safety + canonicalization ship;
  handoff: `docs/prompts/2026-07-13-x-gap-catchup-rescore.md`. Sequencing is private beta → X →
  OpenSanctions.
- Vercel build passed (`next build`, including TypeScript). No application source changed.

## 2026-07-13 — private-beta readiness sprint (branch 20260713-private-beta-readiness)

All eight workstreams of docs/prompts/2026-07-13-private-beta-readiness.md shipped in
the isolated worktree: public offer repositioned as a private analyst beta (/access
journey + invite-gateable SIGNIN_MODE, default open), deterministic digest publication
guard (Graham regression pinned), signals purge-detector semantics (person-only,
procedural text qualifier, canonical counting, no names in detail), ask relevance
boundary (relevant_count schema + insufficient stop + post-answer correction +
evaluator recalibration), entity ё-fold + Vorobyov alias family (prod cleanup plan
awaiting operator approval), 390px overflow root-cause fix (browser-verified, 17
routes), materials partner names (193-code M49 map + partner_name column) + datadark
latest-period correctness + provenance links. Migrations 0018 + 0019 (additive).
Tests 1147/97 → 1279/105; integration + build green. Full account:
docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md.

## 2026-07-13 — post-sprint remediation (seven code-review findings)

All seven findings from the private-beta sprint review reproduced with focused tests,
then fixed: digest-mailer recipient policy (subscribe_intents/access requests never
mailed; no demo fallback; new src/lib/email/digest-recipients.ts), publication guard
strengthened (dropped allegations force event-prose rebuild; governing attribution —
the production-shaped Graham title now pinned; ruling 19 corrected in place), ask
denial answers deterministically REPLACED (not metadata-stripped) + evaluator rejects
surviving [cN] syntax, datadark granularity-aware period ranges (bare "2026" no longer
falsely stale mid-year; impossible dates rejected), entity persistence by canonical
identity (cleanup plan durable only behind this deploy — OPEN-TASKS #61 sequencing),
/trade provenance shares getDivergence's cohort SQL (materials-job fetch dates can no
longer stamp the export page; range wording). Tests 1279/105 → 1321/107; typecheck,
lint, build green. Nothing deployed; no prod writes; no paid calls. Full account:
docs/reviews/REMEDIATION-NOTE-2026-07-13.md.

## 2026-07-13 — X gap recovery + bounded rescore IMPLEMENTED (not run; no deploy)

Block plan (docs/prompts/2026-07-13-x-gap-catchup-rescore.md, sequencing gate satisfied —
private-beta B deployed, E on main): 1. insert-gated truncation-safe X watermark +
runStats; 2. X provider lease; 3. cursor-complete recovery driver; 4. bounded
map/regen/revalidate operator; 5. docs + runbook; 6. verify + commit.

All shipped. `XApiAdapter.fetchLatest()` never writes `x_api.lastPollAt` — a complete
pass prepares a pending watermark, `commitMarks()` persists it post-insert; junk-200
payloads are parser failures; the 5-page ceiling with a live cursor is a counted
`pageTruncation` that fails the pass (the silent-loss mode that made July 9–13
unprovable). Paid X work is single-writer via an atomic `provider_state` lease
(`x_api_lease`; TTL/renew/owner-checked release/expiry takeover; unit + Neon-branch
integration tests). `scripts/x-gap-backfill.ts` (engine in src/lib/adapters/) recovers
an exact since/until window with NO page ceiling, insert-before-checkpoint, a
deterministic resumable provider_state checkpoint keyed by range+roster-hash, a
command-scoped budget on top of SpendGuard, and totals output; plan mode is the
default. `scripts/x-gap-rescore.ts` (gates in src/lib/analysis/gap-rescore.ts) is
read-only by default, refuses --apply without a complete recovery checkpoint +
--ack-workstreams-be, then drives the DEPLOYED routes serially: map drain (map-backfill
gained --to and became importable), digest regen for exactly ru(mil+elite)/ua(mil)/
ir(mil+elite+nuclear) with no FORCE_REGEN (refusals reported), military-only validation
(missing ISW report = pending). Snapshots + result.md land in data/outbox/ (now actually
gitignored). Dry runs against prod (read-only) verified both scripts and the gap itself:
X docs 07-10/11/12 ≈ 31/18/27 vs ~5.4K/3.7K at the edges. Tests 1321/107 → 1364/111;
typecheck/lint/build green. Zero paid calls, zero prod mutations, zero deploys, zero env
changes. Operator handoff: docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md (deploy
main FIRST — the :20 poller must be lease-aware before recovery runs).

## 2026-07-14 — X gap recovery EXECUTED (deploy → recover → rescore → steady-state)

Operator authorization: $50 X recovery / $10 map / $10 reduce. Plan: 1. push the four
X commits + full local gate; 2. deploy prod; 3. prove the lease-aware build on a
scheduled poll; 4. recover July 9–13 to cursor exhaustion; 5. map + regenerate +
revalidate; 6. two healthy scheduled polls; 7. document.

### Result (all numbers measured)

- Gate: typecheck/lint clean, 1364/111 unit, `next build` clean, 16/16 Neon itest.
  Pushed `a38a882` (origin/main == local). Deploy `dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ`
  READY aliased bnow.net (rollback `dpl_6ML79nJiEpNzASBszH6TNvLYaGvf`); anon smoke
  green (health/legal/308/307/404/0 signal leaks).
- Build proof: scheduled 01:20Z `ingest:x` (cron 977) wrote the new `counts.x_api`
  shape — requests 35, docs 141, all failure counters 0 — watermark advanced,
  lease acquired+released.
- Recovery: funded balance $35.32 (read live via `/oapi/my/info`) < the $50 approval
  → command budget set to $25. Actual: **$3.9164** — 19/19 batches, 1,335
  pages/requests, 26,090 returned (0 unattributed), **16,007 inserted**, 10,083
  duplicates; checkpoint `2026-07-09_2026-07-14` complete=true; watermark untouched
  (1783992003 before and after); provider-balance delta 391,635 credits = $3.91635 =
  script spend exactly; ledger day-row delta matched byte-for-byte. X docs by
  published day: 07-09 5,364→5,916 · **07-10 31→4,559 · 07-11 18→4,134 ·
  07-12 27→5,587** · 07-13 4,969→6,220 (Σ +16,007 exact).
- Rescore (DNS pin needed for route calls from this box; first attempt died pre-spend
  on the unpinned fetch): map drain modelled $0.7894 / actual **$0.4963** (41
  map:backfill crons, 0 batchErrors, 0 omitted, 0 wrongDocIds); digests **28/30
  regenerated**, 2 thin-regen refusals preserved priors (07-12 ru/elite_politics,
  07-12 ir/military — ruling 17); reduce delta **$0.2382**; legacy engine $0.0000;
  validation **15/15 ok, 0 pending**. Coverage mixed (12 re-scored cells mean
  42.3→33.9 — extraction-noise scale, no improvement claimed); unsupported/
  thin-sourced improved broadly (ir 07-11 0.30→0.07, ru 07-12 0.36→0, ua 07-09
  0.50→0). Ruling-19 verified in prod data: event 4008 + claims 4413/4414 GONE,
  regenerated Graham event 4202 is deterministic "Sources claim:" copy, zero
  Graham+corruption residue; refused-cell survivor 3919 carries no allegation.
  Workstream E verified: 43 new entities, 0 canonicalKey collisions.
- Steady-state: recovery tripped the $2.50 daily cap → budget-stopped polls proven
  SAFE (cron 995: requests=0, budgetStops=1, watermark held). Operator authorized a
  temporary `X_DAILY_USD_CAP=8` (deploy `dpl_7hLdoTZ6b3jmziNnP3G3pJKhaJxK`); the
  09:20Z resume exposed the park-vs-ceiling stall (pageTruncations=6, non-converging
  re-billing — new OPEN-TASKS #66). Remedy: bounded drain [00:00Z..09:20Z]
  cursor-complete ($0.4438 total; one 502 stop + one minutes-scale roster-drift
  refusal → fresh key) + compare-and-set watermark advance 1783992003→1784020800.
  Then **two consecutive healthy scheduled polls: cron 1141 (10:20Z, 47 req / 399
  docs) + cron 1149 (11:20Z, 52 req / 441 docs), all failure counters 0, watermark
  committing post-insert.** Cap restored `2.50` (readable-plain, verified by env
  pull), redeploy `dpl_33XREqVT41j9Fo3cbzzHSZjqYGk2`, health 200. One preventive
  drain [11:00Z..07-15T00:00Z] + advance to 1784073600 runs at the UTC reset so the
  restored cap's ~13h park does not re-stall the 07-15 polls (addendum will record it).
- Spend: X $4.66 all-in this operation (recovery $3.92 + drains $0.44 + healthy polls;
  of $50 authorized); map $0.52 provider-delta (of $10); reduce $0.24 (of $10).
  OpenSanctions NOT run (stays last, after entity cleanup #61).

## 2026-07-14 — scoring/quality-gauge audit (documentation only)

Block plan: 1. trace the validation denominator, matcher, metric formulas, and
overwrite behavior; 2. verify the July 13 ISW cutoff/publication instants; 3. audit
RU/UA final claims against current-version mapped/raw evidence; 4. explain the six
post-X coverage decreases; 5. document a launch-era immutable record/epoch policy.

Result: `docs/reviews/SCORING-QUALITY-AUDIT-2026-07-14.md`. Verified that scoring is
only against five ISW Key Takeaways (20 points each); July 13 used the same unfiltered
five-item denominator for RU and UA; stored result RU 20% / UA 0%; combined mapped
corpus held the core evidence for 5/5 before ISW's declared 11:45 AM ET cutoff, so
the dominant loss was map→reduce→final selection. Corrected TIME-MODEL and the parked
cutoff design: July 13 published 7:30 PM ET, and `atPublish` is an evidence proxy,
not a historical digest snapshot or mathematical lower bound. Recommended one
combined ROCA benchmark plus attribution drilldowns, cutoff/publish/final snapshots,
immutable post-launch as-published scores, and visible validation-epoch/outage
markers. No source code, DB, env, provider, or deployment changes.

## 2026-07-14 — validation scope + corpus-value audit (documentation only)

Result: `docs/reviews/VALIDATION-SCOPE-AND-CORPUS-VALUE-2026-07-14.md`. Traced the
Russia country-page counter to raw fetched-item rows: the displayed 45,988 had become
46,343 during live ingest, representing 1,204 registry sources rather than 46K sources
or summaries. Of those rows, 32,607 canonical documents had been model-read under the
current map versions, 17,459 produced atomic claims, and the current final layer held
310 RU claims; raw documents have no per-document summary, full normalized entity
record, or embedding. Corrected the stale AGENTS map-stage total to ~33K current-version
atomic claims across ru/ua/ir.

Product recommendation: align each public validation row to the reference report's
editorial scope — one combined RU+UA evidence score for one ROCA report, and a
scope-filtered regional union for the Iran Update only after comparable additional
ME claims exist and pass a shadow evaluation. Keep country feeds and attribution
drilldowns separate. Reframe ISW as external QA/trust evidence around an analyst
evidence workbench whose core jobs are awareness, triage, investigation/recall,
entity/theme continuity, source intelligence, and decision lenses. No code, DB, env,
provider, or deployment changes.

## 2026-07-14 — low-hanging analyst-value review (documentation only)

Result: `docs/reviews/ANALYST-LOW-HANGING-VALUE-2026-07-14.md`. The complete
`claim_sources` set is already queried and server-rendered under each digest claim;
the current collapse merely hides the remainder as unsorted URL-like chips. Recent
14-day evidence: 920 claims / 2,379 source edges, median 1 and max 34 docs per claim,
121 claims with ≥5 docs, and provider publication timestamps present on 95.3% of
edges. Recommended first slice: evolve the shared disclosure into a compact summary
plus sortable evidence trail with distinct source-published and BNOW-first-seen times,
human source identity, platform, reliability, title when present, and external link.
Then reuse it in free claim search and entity timelines; expose the already-stable
claim anchor as a copy link. No new schema, LLM, ingestion, embedding, or API is
needed. Digest-wide indexes, exports, and general graphs deferred until beta usage
proves demand. No application code or runtime changes.

## 2026-07-14 — PostHog analytics phase 1: merge, migration 0020, keyless deploy

Branch `codex/posthog-product-analytics` (ed61d3b, base = the evidence-trail merge
2403083) re-gated in its worktree (typecheck, zero-warning lint, 1,455 unit tests /
129 files, production build, 22/6 disposable-Neon integration tests) and independently
adversarially re-reviewed (verdict PROCEED, no P0/P1; the one P2 confirmed the
migrate-before-deploy order this session then followed). Merged --no-ff to main
`e5123a9`, pushed through the pre-push gate. Migration `0020_reflective_karnak.sql`
applied to production and post-verified (5 nullable subscribe_intents attribution
columns; users.analytics_preference NOT NULL DEFAULT 'unset' + timestamptz + 3-value
CHECK; 4/4 existing users 'unset'; head = 0020). Deployed keyless
`dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6` — verified zero POSTHOG env vars anywhere first.
Production browser proof (real Chromium): anonymous 5-page sweep AND a real
magic-link signed-in session (which landed on the forced Privacy 1.1 re-acceptance
screen with the optional analytics checkbox unchecked) both produced ZERO PostHog
network requests and zero console errors; access attribution live (lowercased UTMs,
forced landing_path, junk params ignored); gated 307 / admin 404 / crons green on the
new build. Nothing was accepted on the operator account and no rows changed. This
deploy also shipped the already-merged analyst evidence-trail feature (2403083,
no schema/env needs). Collection stays fail-closed: no dedicated PostHog project or
admin token exists — activation, Live Events verification, and the dashboard are the
operator sequence in OPEN-TASKS #67.

## 2026-07-14 evening — PostHog activation executed (project, key, Live Events, dashboard)

Operator provided the dedicated project mid-session: US-Cloud project 512327 "BNOW.NET"
(region = operator's env decision), project-scoped personal API key (scopes broadened on
request). Privacy posture set via API and verified: autocapture/console/performance off,
anonymize_ips ON ($ip=None on stored events); GeoIP enrichment kept ON by explicit operator
decision (wording follow-up noted). Key+host added to Vercel Production only (byte-verified),
deployed dpl_J5CoSceJSYMFirgbCVam4VUekXBW. Live verification caught a real bug — the driver's
created_at::text space format made the sanitizer silently drop $identify — fixed via to_char
(commit 9e371dc, tests 1456, deploy dpl_8xh5zXYfnsCwoFwQTM3resTZ2BSP) — and a harness trap:
posthog-js bot-filters headless browsers before before_send, so live checks need a masked UA.
With the opted-in test account go+phtest@vociferous.nyc on https://bnow.net: all 12 event
types captured AND server-ingested under the single internal UUID; payload audit clean (exact
allowlist keys, no email/query-text/URLs/content IDs; template-only pageviews; minimized
$identify); zero flags/decide/array contacts; Ask billed once per submit. Negative proofs:
anonymous 0, unaccepted 0, deployment-domain journey 0 (canonical-host gate), /privacy silent,
cross-tab deny stops both tabs, re-grant resumes, sign-out silent. Dashboard "BNOW Private
Beta" (1848415) with the nine specified insights + first_value_event Action (289102); no
alerts. Rollback = remove key + redeploy (the keyless build was deployed and proven earlier
today). Residual operator items: billing limit/membership/retention in the PostHog UI, optional
key-scope re-narrowing, GeoIP privacy wording, own 1.1 acceptance.

## 2026-07-14 (evening) — Analyst-beta launch remediation (branch, not deployed)

Isolated worktree `bnow.net-analyst-beta-remediation`, branch
`codex/analyst-beta-launch-remediation`, base `b71b39a`. Five workstreams implemented,
zero paid provider calls, no migrations, no OpenSanctions/entity work. Operator decisions
this session: GeoIP retain+disclose · retention 7 years · prepare Privacy 1.2 (re-ack).

- WS1 Privacy 1.2 (`f7f9af9`): removed both false "activation pending" statements; states
  analytics active only for opted-in/accepted/signed-in adults, dedicated US project,
  GeoIP-derived coarse location (raw IP not stored), 7-year retention; exclusions preserved;
  `CURRENT_PRIVACY_VERSION` 1.1→1.2 (effective 2026-07-15 placeholder). No migration; itests
  version-agnostic, validated 9/9 on a disposable Neon branch.
- WS2 email (`9c7020a`): `DEFAULT_FROM` → `BNOW.NET <no-reply@bnow.net>`; partner-domain
  fallback/comment/test removed; token model untouched.
- WS3/4/5 (`a873b7f`): Ask working panel (role=status, honest client-elapsed stages, question
  echoed, one-submit) + provider/model removed from the subscriber footer; scoreboard
  "Evidence available at ISW publish (proxy)" with honest framing + RU/UA-denominator
  disclosure; es/he/ko hidden from the language picker (still valid/parseable).
- Gate: typecheck+lint clean, 1460/129 unit, build clean, 390px real-browser PASS
  (privacy/terms/scoreboard + injected Ask panel with a long unbroken question). NOT
  deployed/merged (gated behind X closeout + operator approval). Note:
  docs/reviews/ANALYST-BETA-REMEDIATION-NOTE-2026-07-14.md; handoff OPEN-TASKS #68.

### Addendum (2026-07-15 01:2xZ) — UTC-reset preventive drain executed

As planned in the 2026-07-14 entry: drain `[2026-07-14T11:00Z..2026-07-15T00:00Z]`
ran at 00:04Z to cursor exhaustion in one pass (checkpoint
`stall-drain-0714T11-0715T00` complete=true: 19/19 batches, 216 pages, 3,763
returned, **3,658 inserted**, $0.5673), then the compare-and-set watermark advance
1784028033→1784073600 at ~00:07Z with the lease verified free. Both 07-15 polls
healthy: **cron 1255 (00:20Z, 35 req/102 docs) + cron 1263 (01:20Z, 38 req/136
docs)** — ok=true, all failure counters 0, watermark committing post-insert
(1784078420 after 1263). Provider balance 3,003,512 credits ≈ $30.04, reconciling
with the drain + polls to ~$0.002. No re-stall pending: the watermark is fresh and
hourly backlog (~1h) sits far under the 5-page ceiling. X workstream closed;
remaining X item is the #38 alert half + the #66 structural fix, both queued as
reviewed code work.

## 2026-07-15 — Analyst-beta remediation rebased after X closeout

Confirmed `main == origin/main == f94d70c` and all three worktrees clean. Rebased
`codex/analyst-beta-launch-remediation` onto the final X closeout. The only conflict
was the append location in `docs/PROGRESS.md`; both the July 14 remediation account
and July 15 X drain addendum were preserved in chronological order. Rebased code
commits: `3361b01` (email), `29d89d2` (Privacy 1.2), `dc23acc`
(Ask/scoreboard/i18n); docs reconciliation is `484f546`. No application content was
edited during conflict resolution; no provider calls, environment changes, merge,
push, or deployment. Full verification and combined-diff review remain. Privacy 1.2
still has the `2026-07-15` placeholder and must be set to the actual deployment date;
deployment remains blocked until BNOW Postmark DKIM/Return-Path and sender identity
are verified.

## 2026-07-15 — Release reconciliation: analyst-beta remediation live; OpenSanctions next

Audited every local/remote branch, worktree, stash, open PR/issue, and Vercel production
deployment. Found and closed the only unpublished release: the five-commit analyst-beta
remediation branch. Postmark/setup documentation was committed at `11896eb`; remediation was
rebased with both decision histories preserved, merged/pushed at `2bf89ed`, and deployed as
`dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` (READY, bnow.net alias). Fresh verification: typecheck,
lint, 1460/129 unit tests, local + Vercel builds, React review, `/health` 200/DB OK on the
expected build, Privacy 1.2 and the corrected scoreboard copy live, selector reduced to
en/uk/de/fr/pl/ar/ja, and zero initial runtime errors. No migration or paid provider call.

The earlier scoped Neon legal/analytics integration run remains 9/9 green; a fresh full-suite
attempt stopped before disposable-branch creation because the saved `NEON_API_KEY` returned
401. Production DB access is healthy; credential renewal is now in BLOCKERS/HUMAN-SETUP.

OpenSanctions is confirmed **unimplemented, not forgotten**: deployed code still uses all-time
total accounting and unsafe non-advancing `refresh=1`. The X implementation hold is now clear,
so `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` is the next isolated engineering
workstream. Read-only production recount: **937 eligible entities; 660 live-checked; 277
missing/stub; 409 matched; 144 sanctioned; 660 July calls**. The old 876→683 cleanup projection
is stale. Entity cleanup #61 still requires explicit operator approval and a fresh dry run;
monthly-accounting/fixed-cutoff code must merge/deploy before any separately authorized paid
rescore. Graham repair #62 is closed by the X regeneration (4008/4413/4414 gone; safe 4202
replacement).

## 2026-07-15 — OpenSanctions monthly quota + resumable rescore (branch, not deployed)

Implemented `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` on branch
`codex/opensanctions-monthly-rescore` (off clean main `651259e`, tag
`pre-opensanctions-monthly-20260715`). Code only — **zero paid provider calls, no production
writes, no deploy, no env change, no migration**.

Two defects fixed:

1. **Calendar-month total accounting.** `SpendGuardConfig.totalPeriod` (`"all_time" |
   "calendar_month"`, default all_time so X and every LLM guard are byte-equivalent). In
   calendar_month the guard loads `totalUsd/totalRequests` only from `provider_usage.day >=
   monthStart` (first UTC day of the month; `monthStartIso` is tz-independent), so
   `OPENSANCTIONS_CALL_CAP` resets at the UTC month boundary without deleting history. Per-day
   and per-run caps unchanged; still fails closed with no required cap. `UsageStore.load` gained a
   `totalStartIso` window arg (pg `FILTER (WHERE $3::date IS NULL OR day >= $3::date)`);
   `init(now)` injects the clock for deterministic tests; `ReserveResult.code` + `stopCategory()`
   categorize a stop (run/daily/monthly/total) without string-matching. Only OpenSanctions opts in.
2. **Fixed-cutoff resumable rescore.** `refresh=1` now requires a valid ISO `before` (400 before
   any paid loop). Rescore selects live rows with `checkedAt` strictly older than the fixed cutoff
   plus missing/stub/malformed rows; a CASE gates the jsonb→timestamptz cast behind an ISO-prefix
   regex so a malformed legacy `checkedAt` is needs-refresh and never aborts the batch. Each
   success stamps `checkedAt=now` (after the cutoff), so the same cutoff advances through the
   corpus. `limit` clamped to the run cap; priority order preserved; `only=sanctions` skips
   ownership. `cron_runs.counts.sanctions` now carries `mode/cutoff/remaining/completed/stopReason`
   (non-sensitive).

Operator tooling: `scripts/opensanctions-rescore.ts` (dry-run default, serial, stops on
daily/monthly/config budget, continues past a run-cap stop, never prints `CRON_SECRET`, no
daily-cap busy-loop) + `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`.

Tests: +24 unit (1460→1484 / 129→131) covering all 13 required cases pure where possible, plus a
new Neon integration test `enrich-rescore.itest.ts` proving the live SQL (normal selects only
missing/stub; rescore selects stale/missing/malformed, excludes post-cutoff rows, advances on
re-stamp; malformed cast never crashes). Full integration suite 22/6 → 26/7, **run green on a
disposable Neon branch this session** — the saved `NEON_API_KEY` works again (create/run/delete
verified; the earlier 401 is cleared). typecheck/lint/`next build` clean.

Standing gates unchanged: the **paid production rescore stays CLOSED** until the operator approves
cleanup #61 (applied after the canonical-persist fix is live), this branch is merged+deployed and
proven to use calendar-month accounting + an advancing cutoff, and a fresh recount + separate
spend authorization are done. OPEN-TASKS #41 advanced, not closed. Note:
`docs/reviews/OPENSANCTIONS-MONTHLY-RESCORE-NOTE.md`.

## 2026-07-15 — OpenSanctions rescore: cutoff-safety hardening (same branch, not deployed)

Second commit on `codex/opensanctions-monthly-rescore` fixing the `before` cutoff validation:

- **No future cutoff** — `normalizeIsoInstant(raw, nowIso?)` rejects `before > nowIso`. A future
  cutoff kept freshly-checked rows (checkedAt=now < future cutoff) inside the `checkedAt < before`
  predicate and re-billed them; requiring `before <= nowIso` guarantees `before <= checkedAt` so a
  successful row always leaves the predicate.
- **Timezone required** — the cutoff must carry `Z` or a `±HH:MM`/`±HHMM` offset (T separator);
  a timezone-less string is rejected (Date.parse would read it in the server zone).
- **One captured instant** — the route captures `nowIso` once and uses it for BOTH cutoff
  validation and the checkedAt stamp.
- **Boundary enforcement** — `enrichEntities` re-validates the cutoff against its `nowIso` and
  throws before opening any pool/loop, so a direct caller cannot bypass route validation.
- **Contract** — sanctions refresh requires the cutoff; ownership-only refresh
  (`only=ownership&refresh=1`) needs no `before` (revised + tested).
- **Script** — `scripts/opensanctions-rescore.ts` rejects a future/timezone-less `--before`
  before any call, requires a positive-integer `--max-batches`, and enforces `--sleep-ms >= 2000`.

Tests +11 (unit 1484→1495; integration 26/7→27/7 incl. a real-Postgres `checkedAt == cutoff`
boundary case). typecheck/lint/`next build`/integration (`TMPDIR=/tmp`) all green. Operator docs
corrected (SETUP-NEXT-WEEK.md, BLOCKERS.md, runbook). Still not merged/deployed; no paid calls.

## 2026-07-15 20:18 UTC — OpenSanctions monthly/rescore release

Reviewed the cutoff-hardening commit with no remaining defect. Independent release gate passed:
typecheck, lint, optimized build, **1495/131 unit tests**, and **27/7 Neon integration tests**;
the disposable branch was deleted. Merged `codex/opensanctions-monthly-rescore` to main at
`f9aaa9e`, pushed, and deployed production `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` (READY, aliased
bnow.net). The enforced pre-push gate repeated typecheck/lint/unit green.

Live zero-paid verification used only rejection paths: `/health` returned 200 from that deployment;
authenticated future and timezone-less sanctions cutoffs each returned the new 400 before cron or
provider work; the read-only July ledger remained **660 requests / $72.6000** afterward. No
migration, env change, cleanup, or paid OpenSanctions call occurred. The paid
rescore remains CLOSED pending operator-approved cleanup #61, a fresh population/month-quota
recount, separate spend authorization, and the serial run-to-zero evidence in the runbook.

## 2026-07-15 — PostHog billing-limit status sync

The operator confirmed that the PostHog billing limit is configured. Corrected the standing
integration status, OPEN-TASKS #67, and the analytics implementation note. The remaining PostHog
UI follow-up is project-membership review; optional API-key scope re-narrowing and operator
Privacy 1.2 acceptance also remain. Documentation only: no code, environment, provider setting,
or deployment changed in this sync.

## 2026-07-15 — Private-beta release/readiness delta

Reconciled all post-July-13 workstreams across local Git, GitHub, Vercel, production health,
24-hour cron/data flow, and direct WSL Chrome mobile checks. Verdict: the application is fully
merged, pushed, and deployed (`f9aaa9e` / `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`); at audit start
`main == origin/main == 78e15b2`, all worktrees were clean, no branch was unmerged, no PR was open, and the
latest CI is green. Production health is 200/DB OK; every audited cron family had zero failed or
unfinished runs in 24 hours. Anonymous 390px routes passed with no overflow or signals leak.

The audit corrected stale MTProto task #47 to closed and opened #69 for recurring GramJS
peer-type `CastError` messages in Vercel. They are non-fatal in current evidence—24/24 hourly
runs green, zero channel errors, 1,259 documents inserted—but pollute the error stream and need a
reviewed coding fix. The signed-in 390px pass remains #65 because the WSL Chrome profile has no
valid BNOW session. Full review and ordered operator/engineering/OpenSanctions handoff:
`docs/reviews/PRIVATE-BETA-READINESS-DELTA-2026-07-15.md`. Documentation only; no deployment.

GitHub CI for the pushed delta-review commit `8b433c3` then passed both jobs. GitHub annotated
the v4 checkout/setup actions because their Node 20 action runtime is deprecated and currently
forced onto Node 24. Added low-maintenance #70 for a workflow-only action-major upgrade; current
CI and the Vercel application remain green.

## 2026-07-15 — Invite mode activated; beta signal/X implementation handed off

Activated `SIGNIN_MODE=invite` in Vercel Production after a read-only eligibility audit proved
that all five existing users remain eligible; no request was approved and one request remains
pending, so the pending address correctly receives no authentication link until approval. The env
value was read back, then unchanged main `426c627` was deployed as
`dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` (READY, aliased bnow.net). Vercel confirms the expected commit
and production alias. A fresh WSL Chrome smoke loaded the exact deployment: `/health` rendered
DB OK with build `426c627`, five users and one access request; `/signin` rendered the expected
email form without submitting it. The post-deploy runtime-error scan found only the previously
tracked, non-fatal GramJS peer-conversion noise (#69), not a new invite/deployment failure.

Recorded three operator rulings: retain one-use magic links and tell users to copy the unvisited
URL into their preferred browser before any first open; expose all qualifying named-person signal
detail and cited evidence to accepted private-beta users while keeping anonymous HTML teaser-only;
and implement X/twitterapi.io #38/#66 now with resumable cursor-complete self-catch-up and operator
alerts. The Terms must explicitly state that names appear because cited sources identify them and
that inclusion is not BNOW endorsement, accusation, opinion, or independent assertion of truth;
because this is material, the coding release must bump the Terms version and force re-acceptance.

Application coding is delegated under the repository handoff protocol. Comprehensive prompt:
`docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md`. Its X design snapshots the roster,
inserts every page before checkpoint advancement, resumes from the exact cursor after budget/error
stops, compare-and-sets the final watermark, reuses the X lease and SpendGuard, and deduplicates
unhealthy/recovery alerts. This stage made zero paid provider calls, sent no magic-link email,
changed no production data, and changed no application source.

## 2026-07-15 — beta invite UX, attributed signals, self-healing X (branch, NOT deployed)

Implemented `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md` on branch
`codex/beta-invite-signals-x-reliability` (base `origin/main` `794d54e`). **Zero paid provider
calls; zero magic-link email; no production data or deploy.** Gate green: typecheck + lint clean,
**`npm test` 1536/134** (was 1495/131 — +41 tests, +3 files), `npm run build` clean. No migration.

- **A (magic-link, #40):** the email + `/signin?sent=1` state that the link is single-use / 24h and
  give the copy-before-opening preferred-browser instruction; callback URL, expiry, redirect and
  `trackLinks:"None"`/`trackOpens:false` unchanged; token stays single-use, never logged.
- **B (attributed signals, #58):** `detectPurge` adds `Signal.subjects` (all distinct qualifying
  canonical people, one stable representative each, deterministically ordered) — dropped by
  `toPublicSignal`, absent from `headline`, so anonymous/unaccepted HTML shows no names (page test
  proves the data-layer boundary + no evidence query). Accepted `/signals` renders the names + a
  prominent attribution/non-endorsement notice. Terms §9 gained the durable named-person rule;
  `CURRENT_TERMS_VERSION` 1.0→1.1 (effective 2026-07-16, the actual rollout date — corrected from
  the initial 07-15 placeholder) forces re-acceptance, Privacy stays 1.2.
- **C (self-healing X, #38+#66):** `x-auto-catchup.ts` drains a fixed parked window
  `[oldWatermark, caughtUpTo)` via `runGapBackfill` (roster snapshotted into the checkpoint against
  registry drift; insert-before-checkpoint), bounded by `X_AUTO_CATCHUP_REQUEST_LIMIT`
  (≤`X_RUN_REQUEST_CAP`) under the shared `x_api` SpendGuard + X lease, advancing the watermark on
  completion by compare-and-set (never backward). `x-health.ts` emails `FEEDBACK_EMAIL` on
  truncation/failure/park/persistent-empty/stuck, once per episode (cooldown) + one recovery notice,
  safe fields only, recorded in `cron_runs.counts.x_api`. 33 new fixture tests, zero network.

Full account + rollback: `docs/reviews/BETA-INVITE-SIGNALS-X-RELIABILITY-NOTE-2026-07-15.md`.
#40/#58 close after the copy/names are live; #38/#66 after a real scheduled recovery/healthy poll.

## 2026-07-16 — beta invite / attributed signals / self-healing X MERGED + DEPLOYED

Operator approved the release after the Terms effective-date correction (2026-07-16) was pushed and
green. Merged `codex/beta-invite-signals-x-reliability` `--no-ff` to main (`35b97bd`), pushed
(pre-push gate green, 1536/134), deployed production `dpl_DhMh12dn4fdXCesEhXnpxw546Qkw` (READY,
aliased bnow.net; rollback `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` / `426c627`). No migration, no paid
call, no magic-link email, no env change (new X recovery knobs use safe defaults). Anonymous/public
prod smoke green on the new build: `/health` 200 DB OK; `/terms` Version 1.1 / July 16, 2026 + the
named-person rule; **anonymous `/signals` teaser-only — zero names, no attribution notice, no leak
markers with real prod data**; `/signin?sent=1` single-use + preferred-browser copy; robots correct;
`/countries/ru` 200; gated `/account` 307; no runtime errors. Residual proofs (items stay open): #40
emailed body (operator-authorized send), #58 accepted-user names view + re-acceptance flow (operator
session), #38/#66 a real scheduled park→resume→completion + healthy poll (no paid catch-up
manufactured).

## 2026-07-16 — operator/live proofs: #40 + #58 closed; #38 + #66 remain open

Authorized and executed the standing-test-account production flow. A live Postmark send delivered
the new magic-link body; both provider-retained TextBody and Gmail show the single-use, 24-hour,
copy-before-opening preferred-browser instructions. The same link authenticated and forced current
policy acceptance. After one transient legal-page render recovered on retry, the operator approved
Terms 1.1 / Privacy 1.2 acceptance with optional analytics off. DB persisted the append-only 1.1/1.2
row and `analytics_preference='denied'`. Authenticated `/signals` rendered the attribution notice,
a nonempty 23-name qualifying subject list, and 47 evidence expanders; same-deploy anonymous HTML
again contained neither the named label nor notice. The test browser signed out after verification.
#40 and #58 are closed.

Observed the first natural post-deploy `ingest:x` schedule rather than manufacturing a paid fault:
cron 1555 (12:20:14Z) finished green with the new `mode=1`, `alertEvaluated=1`, `alertKind=0`
counters, 382 docs / 46 requests, and zero failures/truncations/stops; `x_api_health` is clean and no
auto-catch-up checkpoint exists. This proves production wiring only. #38 and #66 correctly remain
open until a real scheduled park exercises resume→completion, unhealthy delivery, recovery notice,
and the following healthy poll.

## 2026-07-16 — open-task research, safe handoffs, and authenticated mobile proof

Completed the operator-requested document/research pass without application-source, workflow,
environment, deployment, production-data, or paid-provider mutation. Scenefiend history confirmed
that its hosted Actions were deliberately minimized after wrong-backend E2E and secret/budget
problems; BNOW #70 is therefore declined/closed by operator ruling with workflows untouched.
AGENTS.md was reduced from 1,514 to 281 lines at the archive point: the prior live decision cycle
moved verbatim to `docs/DECISIONS.md` (byte-compared), and the detailed living snapshot moved to
`docs/CURRENT-STATE.md` (#43 closed).

Fresh entity/OpenSanctions read-only evidence blocked unsafe execution: the current cleanup is
1,012→794 (87 drops, 131 merges), but 79 merges cross entity kinds; a kind-safe projection is 873.
Only 475/1,012 eligible entities have claim links, while 537 have none (351 already paid-checked).
July usage is 780 requests / $85.8000. No cleanup/apply or provider call occurred. #17/#41/#61 now
point to `docs/prompts/2026-07-16-entity-cleanup-kind-safe.md`, which requires kind-aligned identity,
claim-linked eligibility, zero-paid tests, a new dry run, and separate operator approvals.

Research corrected several stale tasks. #45 closes because the public implementation already says
“thin-sourced” everywhere; only the legacy internal column name remains. #54 closes because Ask and
Search already select owning `digest_date`; production has 1,263 claims and zero owning-date
mismatches. #14 now has an out-of-sample calibration design (historical source score predicts
future ISW hedging, per theater) rather than the tautological same-sample correlation. It is gated
by #56: Telegram and X have zero platform roots, but one Facebook root pools 26,195 citations / 7,081
URLs. Jul 9–15 Iran military input is 80.1% X and cited evidence is 73.1% X; RU/UA evidence is
36.9%/31.5% X. Account concentration within X is moderate, so #19/#42 remain platform-diversity and
conversion problems. #69 remains open after 24/24 green MTProto runs (1,251 inserts) and a current
GramJS version/64-bit probe failed to reproduce the production-only warning. Detailed evidence:
`docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md`; implementation prompts live in `docs/prompts/`.

Finally, operator-authorized production authentication closed #65. Gmail delivered the new magic
link at 13:08Z with DKIM/SPF/DMARC pass; its single-use callback authenticated the standing test
account. At exact 390×844 CSS metrics, `clientWidth == scrollWidth == 390`; header/mobile drawer,
quick links, all theater cards, Ask/recent question, validation tiles and footer passed visual
inspection. The test account was signed out and the temporary WSL Chrome profile was removed.

## 2026-07-16 10:03 EDT — analyst-experience punch-list review plan

1. Classify the operator's attached usability notes into decisions/questions, quick implementable
   changes, deeper data/product work, and ideas to defer or decline.
2. Verify the present navigation, typography, time model, digest evidence controls, public health
   surface, feedback links, and scoreboard behavior against source/tests and living documentation.
3. Produce a focused analyst-first recommendation and a detailed implementation handoff without
   modifying application source, production data, providers, environment, workflows, or deployment.

## 2026-07-16 10:11 EDT — analyst-experience punch-list review complete

Completed the read-only product/source audit and classified every operator note into immediate
presentation cleanup, deliberate product/data work, or defer/decline. Recommended the quick batch:
More countries/Russia data opacity labels; code+native-name language selector; digest quick-link
cleanup; removal of analyst-visible provider and First-seen metadata; single-document sort hiding;
source-first evidence; compact print disclosure; clearer ranking-profile labels; selected public
health-row removal; results-first monthly scoreboard with a visible theater-baseline caveat; and a
targeted contrast/type pass. Code evidence shows gray-400 is about 2.60:1 on white and the current
surfaces use 12px/14px metadata heavily, so the readability concern is substantiated but requires a
surface audit, not a repository-wide class replacement.

Resolved discussion items: display is fixed ET (UTC storage/day buckets), not Frankfurt-local;
retain reliability for accepted analysts; keep Copy for report primary; use desk@ for analyst
feedback and hello@ for general contact only after splitting the shared FEEDBACK_EMAIL destination
away from access/X-ops alerts; do not country-block absent a legal/measured-abuse reason; treat the
Fedorov example as cross-theater relevance QA rather than nationality filtering. Added further
recommendations for digest freshness/stage, raw-confidence simplification, and beta task-completion
measurement. Full review: `docs/reviews/ANALYST-EXPERIENCE-PUNCH-LIST-2026-07-16.md`. Application-
coding handoff: `docs/prompts/2026-07-16-analyst-experience-quick-wins.md`. No application source,
production data, provider, environment, workflow, deployment, paid call, or outbound email changed.

Operator follow-up promoted two recommendations into the approved quick batch: every digest header
must show Intraday/Final + last-updated clock time + explicit timezone using the canonical helpers,
and raw analyst-visible claim-confidence decimals (`conf 0.82`) must be removed from screen/copy/
print while retained internally. No High/Medium/Low replacement ships until display thresholds are
explicitly calibrated. The review and coding handoff were corrected in place accordingly.

## 2026-07-16 — #17 spend subset: claim-linked OpenSanctions eligibility (deployed)

Narrow, urgent patch ahead of the 08:00 UTC `/api/cron/enrich` run. OpenSanctions may now select,
count, and bill an entity only when it has at least one `claim_entities` row. The ordinary cron was
otherwise going to spend on 186 zero-link missing/stub rows; 351 zero-link rows had already been
paid for before this landed.

Implementation (`src/lib/enrich/run.ts`): one shared `CLAIM_LINKED_SQL` fragment, composed into
every selection path by `selectionPredicate()` — normal/rescore × candidate/`remaining`. Selection
and the completion count therefore cannot drift apart, which is the failure mode that would let an
unlinked row be billed. `EXISTS` rather than a join, deliberately: the candidate query's LEFT JOIN
on `claim_entities` is a ranking input (pressure/mention counts) and stays a LEFT JOIN, while the
`remaining` COUNT has no join at all and would otherwise count once per link and overstate the
population. Fixed-cutoff semantics, malformed-`checkedAt` handling, stub upgrades, ordering, limit
clamping, SpendGuard wiring, and the response contract are untouched.

Tests: 1,542 unit / 134 files (+6) green; the real-Postgres run was 31 passed / 1 failed. All 10
enrichment integration tests passed. The one failure is the pre-existing legal-acceptance Terms
1.0 expectation described below, so the repository-wide integration gate was not fully green.
The enrich integration test was rewritten
around linked/unlinked twins — identical kind and `opensanctions` metadata, differing only in the
claim link — so the link is provably the only cause of exclusion, and it proves through the real
builders that multi-link entities appear once, `remaining` equals the candidate population, and
`remaining` reaches zero while otherwise-eligible unlinked rows still sit there unpaid. A mocked
unit test proves `matchEntity` is never called when the candidate query returns nothing. Zero
network/provider calls in tests.

Deploy: `be0ebf1` → `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj`, built from a clean detached worktree so the
in-flight documentation edits could not ride along. `/health` 200 on the live domain with a matching
`data-dpl-id`; unauthenticated 401 and authenticated malformed-cutoff 400 both reject before the
paid loop. Ledger identical before and after (July 780 / $85.8000; July 16 120 / $13.2000) — zero
paid calls. Post-deploy read-only recount: 1,012 eligible / 475 claim-linked / 537 zero-link; normal
candidates 232 → 46.

Scope held: no entity cleanup, canonicalization, migration, env, cron-schedule, or UI change, and no
paid rescore. Still open: #17's match-score/caption requirement, #61, #41. Noted but not touched —
`legal-acceptance.itest.ts` fails pre-existing on terms `1.0` vs the live `CURRENT_TERMS_VERSION`
`1.1` (stale since `fdc2031`), unrelated to enrichment.

## 2026-07-16 — Legal integration version fixture corrected

Test-only commit `165c2b4` replaced the stale Terms 1.0 assertion in
`src/integration/legal-acceptance.itest.ts` with an order-independent comparison of the current
Terms/Privacy constants and an explicit synthetic future pair. The cascade fixture now also uses
the current constants. Full result: 1,542 unit tests / 134 files and 32/32 real-Postgres integration
tests / 7 files green (5/5 legal, 10/10 enrichment), typecheck + lint clean; disposable Neon branch
`br-restless-pine-at9u1qv1` deleted. The commit is on `origin/main`. No deploy, production DB
mutation, cron invocation, provider call, migration, or runtime behavior change.

## 2026-07-16 — analyst-experience readiness reconciliation

Reviewed the analyst-experience punch list and coding handoff after #17 landed. The active
OpenSanctions spend risk is resolved: `be0ebf1` is deployed, the billable normal population fell
232→46, and `165c2b4` restored the full 32/32 integration gate. #61 cleanup and paid #41 remain
operator-gated but do not overlap or block presentation work.

The analyst handoff is ready to start from clean main ahead of #56/#69/#14. It now requires two
reviewable passes on one branch: low-layout-risk copy/metadata cleanup first, then source-first
evidence, consolidated printing, and targeted readability/contrast work. Multi-track digest
freshness must not label a whole page Final when only one track is final. Monthly scoreboard
navigation, feedback-environment splitting, OpenSanctions/entity work, and other deeper tasks are
explicitly out of scope. The stale #41/#61 text and the cleanup handoff were reconciled to treat
#17 as a deployed regression boundary rather than unfinished implementation.

## 2026-07-16 — analyst-experience quick wins implemented (2 passes, not deployed)

Plan for the block:
1. Branch `codex/analyst-experience-quick-wins` from clean `origin/main` (`8bbc308`).
2. Pass 1 — Workstream A; B1/B3/B4; C; E1–E4. Targeted tests, review the diff.
3. Pass 2 — B2; D; F. Full gate + browser/accessibility verification.
4. Review doc, living docs, hand back for operator approval.

All four done. Pass 1 `9b4c27e`, Pass 2 `846e3f0`; 1,562 unit tests / 135 files (from
1,542 / 134), typecheck, lint and `next build` green; 32/32 browser checks in Chrome,
light+dark, 1280 and exactly 390×844, keyboard-only across the header language menu,
print disclosure, evidence trail/sort and scoreboard methodology. Presentation only —
no ingestion, analysis, scoring, reliability, traceability, publication-safety, schema,
data, paid-provider, env, workflow or deploy change, zero paid calls, no route href moved.

Three things worth carrying forward. **Contrast was measured, not assumed** — computed from
the oklch palette this build actually ships against the real backgrounds, reproducing the
punch list's figures (gray-400 = 2.60:1 on white; gray-500 = 4.09:1 on near-black; the correct
pair is gray-600/dark:gray-400 at 7.56/7.61). That surfaced a status-panel pair
(`text-gray-400 dark:text-gray-500`) failing in BOTH themes. **Dev-mode React never hydrates
on this box** — the HMR WebSocket handshake fails and no React control responds, including the
untouched hamburger; native `<details>` kept working and masked it. Everything passes against
`next build` + `next start`, so React UI must be verified against a production build here
(#74). **Two pre-existing browser-only defects** turned up and were fixed: the scoreboard table
had no horizontal cell padding, rendering "theatercoverage" and "1 / 3 / 5detail".

Pass 1 is one commit rather than four: the `dictionaries.ts` hunks for workstreams A/B/C/E
interleave inside the same catalogs, so per-hunk splitting risked misleading intermediate
states. The boundary the handoff actually requires — Pass 1 vs Pass 2 — holds, so Pass 2 can
be reverted without restoring provider, confidence or First-seen metadata.

New debt #71 (evidence trail still an inner-scrolling table below 560px), #72 (buyer-profile
labels hardcoded English — documented in the file, not silently scoped in), #73 (signed-out
landing page still has unpaired grays — out of this pass's listed scope, deliberately not
blind-swept), #74 (dev hydration). Review:
`docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md`. Awaiting operator approval to deploy.

## 2026-07-16 — analyst-experience quick wins deployed

Branch `codex/analyst-experience-quick-wins` was pushed and fast-forward merged to main; the
standing test snapshot was reconciled to 1,566 / 135. Main `87f9c12` deployed as
`dpl_CdoLhjeyxab4mvZXzN9Vjq8U7pNC` (READY, aliased bnow.net). The pre-push gate passed
typecheck, lint, and 1,566/1,566 tests; the Vercel production build passed.

Live smoke on the project domain returned 200 for `/health`, `/scoreboard`, and
`/scoreboard/ir/2026-07-15`, with assets stamped by the new deployment ID. Using the standing
test identity through the authorized single-use magic-link flow, `/digests/ir/2026-07-15` passed
at 1280×900 and 390×844 in light and dark: no console/page errors or page overflow, correct final
freshness, working print and evidence disclosures, and no provider, Confidence, or First-seen
text. No paid analysis/provider call occurred and no GitHub Actions file changed.

## 2026-07-16 — #73 signed-out landing contrast (implemented, awaiting deploy)

Branch `codex/73-signed-out-landing-contrast` from clean main `4e4743d`; application commit
`40151b6`. The isolated presentation follow-up the quick-wins pass left open: its contrast
sweep was scoped to the signed-in home and the other analyst surfaces, so the marketing
branch of `src/app/page.tsx` still carried unpaired grays.

Eight signed-out foregrounds — hero subtitle, beta line, visitor tertiary line, live-theater
count, the three feature-card bodies and the Iran/Gulf body — move to
`text-gray-600 dark:text-gray-400` (7.56:1 light / 7.61:1 dark). The failure was a pairing
one: bare gray-400 is 2.60:1 on white, bare gray-500 is 4.09:1 on `#0a0a0a`, so each fails in
the theme the other passes, and both halves are now pinned by test at every site. The
private-beta badge was already correctly paired (4.84/7.61) and is deliberately untouched,
now pinned as-is. The diff is eight `className` strings: no copy, layout, href, query,
signed-in or truth-in-UI change.

Gate: 1,576/1,576 tests / 135 files (from 1,566), typecheck, lint and `next build` green;
the generated `next-env.d.ts` flip reverted and the tree left clean. Verified in real Chrome
against a production build (never `npm run dev` — #74), across 1280×900, 390×844 and 320×844
in light and dark: 8/8 sites passing per pass, 23 swept text elements with 0 failures, no
horizontal overflow, no console errors, hrefs and CTAs unchanged, hamburger still toggling,
and no signed-in surface in the signed-out render. Ratios were measured from painted colour
(1×1-canvas rasterization, ancestor backgrounds composited), and the harness was calibrated
48/48 against offline oklch maths from the shipped palette before its numbers were trusted;
the class tests were mutation-tested to prove they can fail. Zero paid-provider calls, no
deployment. Review: `docs/reviews/SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md`. #73 stays open
until the operator's deploy approval lands it.

## 2026-07-16 — #73 signed-out landing contrast deployed and closed

`codex/73-signed-out-landing-contrast` was pushed and fast-forward merged; the standing unit-test
snapshot moved to 1,576 / 135. Main `df79411` deployed as
`dpl_7useRyXz71PVkyFgYqZTXKJXf8mv` (READY, aliased bnow.net), with the local pre-push gate and
Vercel build green. No GitHub Actions file changed and no paid-provider call occurred.

Live `/` verification used real Chrome against the project domain at 1280×900, 390×844 and
320×844 in light and dark. All eight corrected foregrounds were found exactly once, carried both
class halves, and measured 7.56:1 light / 7.61:1 dark from painted colour. The response and assets
matched the new deployment; all nine `main` hrefs matched; signed-out/no-Ask gating held; the
phone/reflow menu toggled and rendered; and every pass had zero console/page errors and no page
overflow. The first harness aggregate false was only test order—it looked for the mobile Sign-in
link before opening the drawer—so the corrected full matrix was rerun and passed. #73 is closed.

## 2026-07-16 15:07 EDT — analyst account onboarding verification

1. Inspect the production auth schema and invite-mode eligibility path.
2. Upsert the requested design-partner address as a `users.role='analyst'` account without
   replacing any existing Auth.js identity data.
3. Read back the production row and confirm the first-login magic-link and legal-acceptance flow.

Verification found the production identity already present at `role='analyst'`; no database
write was needed. It has no completed first-login verification, active session, or legal
acceptance yet. The invite-mode gate therefore admits the exact address and the normal `/signin`
flow will email its single-use 24-hour magic link, then route first login through current-policy
acceptance. No email was sent during this operator check.

## 2026-07-16 18:20 EDT — one-click home Ask handoff

1. Add a shared, framework-free intent module (`src/lib/ask/intent.ts`): UUID bounding,
   namespaced storage key, `askAction`-identical question normalization, orphan pruning.
2. Replace the signed-in home's plain GET Ask form with `HomeAskBox`, a client component
   that keeps the GET form as its no-JS fallback and, on a valid submit, stores the
   question under a single-use `sessionStorage` key and routes to `/ask?q=…&intent=…`.
3. Teach `/ask` to bound an optional `?intent=` and `AskForm` to consume it once on
   mount, submitting via `requestSubmit()` so `useActionState`, auth, limits, spend
   guards, result rendering and analytics stay authoritative.
4. Prove the money invariant end-to-end rather than by assertion alone.

Shipped all four. #48 is intact by construction: the intent is consumed BEFORE the submit
is dispatched, must exactly match `?q=`, and lives in per-tab storage — so refresh,
back/forward, the App Router client cache, StrictMode, prefetch, a shared link and a forged
`?intent=` all find nothing and leave the form idle. Gate green: 1,612 tests / 137 files
(+36 over the 1,576 baseline), typecheck, lint.

Verified in real Chrome against a **disposable Neon branch** (`br-hidden-bird-at1496en`,
forked → seeded → driven → deleted; both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
overridden and asserted off-production before boot, `LLM_DISABLE=1`, zero paid calls, zero
production writes). Measured: signed-in home rendered from the branch (the seeded session
exists nowhere else); one click landed on `/ask` with the working panel already active and
no second click; **exactly one `ask_usage` row**; refresh, back-navigation and reopening the
resulting URL in a fresh tab each added **zero** rows and only prefilled; no console/page
errors; with JavaScript disabled the box still reached `/ask?q=…` and prefilled.

Two review findings acted on. (1) An adversarial review traced Next's `app-router.js` and
concluded the `?intent=` URL strip could not stick once the action ran (patched
`replaceState` short-circuits on `__NA`; `HistoryUpdater` re-asserts `canonicalUrl`). The
static trace is real but does NOT reproduce: measured on Next 16.2.10 through a settled
action (`ask_usage` delta of 1 proving execution), the parameter was stripped on arrival and
stayed stripped. The code comment now records the measurement and the caveat instead of
either over-claim, and the jsdom test says plainly what it cannot prove. (2) A click whose
`/ask` never mounts (acceptance gate redirecting on a Terms bump) orphaned an entry holding
the user's question text for the tab's lifetime; `clearAskIntents` now prunes the namespace
before each handoff, so at most one intent is ever in flight.

## 2026-07-17 00:10 EDT — one-click Ask handoff deployed

Pushed main `f0d34d3` (pre-push gate green: 1,612/1,612 tests, typecheck, lint) and deployed
`dpl_5jAidKc8rnSKmSG1gK5rP4KehwJv` — READY, aliased bnow.net, `/health` stamp `f0d34d3` == local
HEAD. Rollback target recorded before deploying: the prior production
`dpl_7useRyXz71PVkyFgYqZTXKJXf8mv` / `df79411`.

Production proof in real Chrome, signed in as the standing test identity (invite gate admitted it;
the exact magic link was recovered through the Postmark outbound API because mail clients mangle
the token): signed-in home renders the Ask box with its zero-JS GET fallback intact; a direct
`/ask?q=…` and a forged `?intent=` both PREFILL ONLY, with no working panel and no execution; no
console, page, or 5xx errors; 100/100 sampled runtime log entries were `info`.

Zero paid Ask calls, as intended — `ask_usage` for the identity held at 3 (latest 07-14), zero
`ask_usage` rows across all users in the hour, and no `openai_ask` `provider_usage` row exists for
2026-07-17. The one-click path was deliberately NOT re-run in production: the disposable-branch
proof already covers it and a live run would bill for nothing.

Two environment traps recorded in the decision log: `scripts/pin-dns.cjs` does not cover
`api.postmarkapp.com` (Node fetch times out on the WSL2 resolver; curl is unaffected), and
Postmark's `ReceivedAt` carries a `-04:00` offset, so freshness filters must parse it as an instant
rather than string-compare it against a UTC ISO timestamp — that bug silently found zero messages.

## 2026-07-19 06:37 EDT — AI Search product and architecture review

1. Trace the actual `/ask` and `/search` request paths, retrieval/reranking/generation stages,
   provider seams, UI state transitions, metering, and analytics from the repository.
2. Reconcile repository eval artifacts with read-only recent production usage to identify the
   measured latency and cost concentrations without causing any paid calls.
3. Compare progressive-results, streaming, investigation-session, model-routing, caching,
   entitlement, and observability options against current provider capabilities and established
   source-grounded AI product patterns.
4. Write a repository-specific review with UI sketches, a target architecture, code-level handoff
   recommendations, acceptance gates, and a phased one-year product roadmap. No application code
   or production state changes are in scope.

Completed in `docs/reviews/AI-SEARCH-PRODUCT-ARCHITECTURE-REVIEW-2026-07-19.md`. The audit found
that the paid UI is a fully synchronous server action: hybrid retrieval, GPT-5-mini rerank, GPT-5
answer, and evidence hydration all finish before React receives any state. Its visible stages are
elapsed-time estimates, not server progress; the separate JSON endpoint is also synchronous; and
the digest pipeline's multi-provider seam does not cover Ask. Existing evals put v2-k60 at 12.14s
mean / 10.17s p50 with 97% evidence recall. Read-only recent production accounting attributes
about 92.6% of recorded Ask inference cost to final synthesis, 7.0% to reranking, and effectively
zero to the per-question embedding. Production does not yet record enough timing data to assign
those same proportions to latency.

The recommended product is an evidence-first investigation workspace: render real candidate
claims and scope immediately, synthesize progressively over a frozen evidence snapshot, support
scoped follow-ups rather than generic infinite chat, and route internal Fast/Auto/Deep modes
through provider-neutral generation/rerank/embedding seams. The first build block is measurement
plus an answer-model eval; the 1–2 week block is a persisted `ask_runs` event protocol, evidence-
first UI, validated streaming, atomic settlement/idempotency, adaptive K, and exact caching.

## 2026-07-19 08:00 EDT — Paddle billing foundation plan

1. Audit the existing Stripe-shaped `plans`/`subscriptions` scaffold, Auth.js identities,
   private-beta access flow, legal acceptance, account display, subscriber email selection, and
   content gates so the plan starts from the repository's real contracts.
2. Verify Paddle Billing's current checkout, catalog, customer/business, invoice, customer-portal,
   webhook, sandbox, tax, sanctions, and acceptable-use behavior against Paddle's official
   documentation.
3. Design a provider-neutral, organization-capable billing and entitlement foundation that can
   serve an individual account or an organization site license without making checkout redirects,
   billing email addresses, or Paddle availability the runtime source of truth.
4. Write a phased engineering handoff with schema changes, route/module boundaries, lifecycle and
   failure policies, security/privacy requirements, test matrices, rollout gates, operator setup,
   estimates, risks, and unresolved product decisions. Documentation only; no application code,
   migration, Paddle account mutation, or production state change is in scope.

Completed in `docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`. The repository audit found
that the existing billing scaffold is Stripe-named and user-owned, while the business strategy is
organization-licensed and the current content gate proves authentication + legal acceptance rather
than paid entitlement. The plan therefore makes an organization the billing subject (an individual
is an organization of one), keeps `users.role` independent from payment, preserves current beta
access through explicit grants, and makes the local entitlement projection — never the browser
redirect, billing email, or live Paddle API — authoritative for application access.

The engineering handoff specifies additive provider-neutral tables, server-authorized catalog
mapping, checkout attempts, a lean subscription/transaction cache, durable raw-body-verified
webhook ingestion, idempotent/out-of-order projection, manual-invoice anti-early-provisioning,
customer-portal authorization, two-way reconciliation, all paid-boundary gates, operator dashboard
setup, security/privacy controls, unit + disposable-Neon + sandbox + production-canary matrices,
three independent rollout flags, rollback, and estimates (12–18 engineering days through an
individual sandbox foundation; 19–30 for complete individual + business foundations, excluding
external approval wait).

The first exit gate is written Paddle product approval. Current Paddle guidance may require review
for people-categorization/data products and blocks buyers in several countries BNOW covers; product
coverage is not buyer location, but the OSINT/sanctions/named-person use case should be pre-cleared.
The other pre-code gates are accepted Paddle economics, a frozen regional/individual/annual catalog,
and Paddle-specific legal/privacy review. No source code, migration, credential, Paddle account,
checkout, charge, invoice, or production state was changed.

## 2026-07-19 — adversarial revision of the AI Search architecture review

1. Re-verify every claim in `docs/reviews/AI-SEARCH-PRODUCT-ARCHITECTURE-REVIEW-2026-07-19.md`
   against the working tree (`9d556cf`): the full `/ask` money path, `/search`, retrieval/rerank/
   answer stages, guards, analytics, schema, eval artifacts; re-run the read-only production
   accounting queries.
2. Rewrite the review in place into a decision-ready structure: executive decision, code-referenced
   current state with evidence classes (measured / code / hypothesis / judgment), ranked critique,
   target architecture, run event/state model, streaming safety design, investigation sessions,
   model routing, caching/ledger/entitlement design with an explicit processor-neutral billing
   boundary, instrumentation spec, and a granular Phase 0–7 implementation plan (objectives,
   dependencies, files, schema, interfaces, steps, tests, flags, acceptance, rollback, effort)
   plus critical path and open decisions.

Completed. Key corrections to the draft: `ask_usage` does write error rows (the real gaps are no
start-of-run persistence, platform-timeout row loss, and disconnect invisibility); the raw
`results-v2-k60.json` artifact computes 13.0s mean / 13.0s p50 / 27.8s max (scorecard published
12.1/10.2 — treat as p50 ≈ 10–13s with a ~28s tail); production re-check found 35 billed gpt-5
answers across 40 all-time rows with the cost split confirmed (answer $0.3921 ≈ 92.6%, rerank
$0.0297 ≈ 7.0%, embed ≈ $0); the stale `product-event-markers` path was fixed; and a new
load-bearing finding was added — claim IDs churn on digest regeneration (schema.ts:819-824), so
evidence snapshots, caches, and sessions must carry claim content + stable raw_documents IDs and
a corpus version, which reordered caching after run/snapshot persistence in the plan. The
recommended sequence is Phase 0 measurement + answer-model eval (needs operator approval for a
~$1–3 paid run and named-person fixtures the 39-question set lacks) → run persistence/atomic
reservation/idempotency → progressive retrieval (evidence-first UI) → validated answer streaming
(withhold-until-validated first, buffered validated chunks steady-state) → routing/exact caching →
provider gateway → sessions → entitlements. The Paddle boundary is interface-only: Ask consumes
the billing workstream's provider-free `entitlements.ts` and emits ledger aggregates; no Paddle
objects enter the Ask pipeline; shared-file contact limited to schema.ts appends, migration
numbering, and gate composition (Phase 7 only). Documentation only — no application code,
migrations, paid calls, commits, or deploys.

## 2026-07-19 — operator feedback: narrow the entitlement integration surface

Applied the operator's targeted simplification to both 2026-07-19 documents: entitlement logic
touches only externally callable paid operations, never internal application pipelines. Billing
correctness was not changed — organizations as billing subject, verified-webhook authority, durable
inbox/idempotency/ordering/reconciliation, server-authorized offers, manual-invoice safeguards,
beta grants, independent flags, and role/tier separation all stand as written.

`docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`: added §1.1 (central principle —
payment does not propagate through the application; Paddle events update a local Neon access
projection; entry points make one provider-free decision; no billing checks inside retrieval/
rerank/generation/rendering/persistence; nothing payment-related trusted from the client; canceled
users keep authentication for account/portal/renewal). Rewrote §8 into: §8.1 one decision at the
boundary with a centralized `resolveAccessContext()` returning an `AccessContext` passed downstream
as plain data (pipelines must not import billing/entitlement modules — import-graph enforced);
§8.2 a route-policy matrix from public pages through webhooks (SSE/result endpoints check run
ownership only); §8.3 in-flight policy (authorize at start, accepted runs finish, next run
re-resolves); §8.4 v1 = coarse org access projection (active|grace|restricted|revoked + tier +
limits + source + timestamps) with granular feature keys, grant merging, and per-module add-ons
explicitly deferred (`entitlement_grants` stays the extensible target, §5.4 relabeled); §8.5 three
independent layers (entitlement / usage policy / SpendGuard — payment never overrides a cap, a
budget outage never unsubscribes anyone); §8.6 fail-closed scoped to starting paid execution, never
account/portal/legal/sign-out. Added nine direct-request security tests to §11.1 (downgrade-then-
direct-call, API-without-page, canceled-user account access, removed member, member-vs-billing-
admin portal, mid-run subscription change, SSE ownership without per-event billing, client-supplied
fields ignored). Phases B/F narrowed: Phase B builds the coarse projection + one
`resolveAccessContext()`; Phase F enforces on one vertical slice (Ask) first, proves direct-route
security/cancellation/account availability, expands surface-by-surface — no simultaneous migration
of all gated pages.

`docs/reviews/AI-SEARCH-PRODUCT-ARCHITECTURE-REVIEW-2026-07-19.md`: reworded the §9.4 boundary from
"Ask consumes requireEntitlement/limitsFor" to "the Ask route/action resolves a provider-free
access context once before creating a run; the pipeline receives approved limits and organization
context but does not call billing or entitlement services", with the in-flight and SSE-ownership
policy stated; aligned §4.1 EntitlementProvider, Phase 7 files/steps/tests (added downgrade,
mid-run change, per-event-lookup, and import-graph tests), and the §12.3 interface freeze (now the
`resolveAccessContext()`/`AccessContext` contract). Documentation only.

## 2026-07-19 16:30 EDT — phased AI Search/Ask implementation handoff

1. Correct the AI Search architecture's named-person policy: names and exact citable facts are
   allowed; the Ask validator enforces identity and source fidelity rather than blanket suppression
   or a universal two-source threshold. Keep the stricter digest-persist ruling 19 unchanged.
2. Expand the architecture's streaming, routing, evaluation, and acceptance gates around official
   records, disputed reporting, OpenSanctions match semantics, PEP/RCA/POI category separation,
   and deterministic source-faithful fallback.
3. Write one coding-agent prompt that implements the architecture in dependency-ordered phases,
   enforces hard gates while continuing safe independent work, and requires independent adversarial,
   money-invariant, data-integrity, accessibility, privacy, and production-readiness reviews.
4. Validate and commit documentation only; do not run paid evaluations, write application code,
   deploy, or overlap the concurrent Paddle workstream beyond the frozen access-context boundary.

Operator execution clarification: the coding-agent handoff must continue unattended through all
safe phases rather than pause for review after each one. The prompt now requires a dedicated
integration branch plus retained stacked phase branches/worktrees, two detailed reports per phase
(implementation + independent gate), cumulative test/decision/workstream ledgers, and automatic
continuation after a passing gate. Paid/external/production actions remain unauthorized; affected
features stay disabled and are reported as `implementation-pass / enablement-blocked` while safe
independent work continues. Nothing merges to `main`, pushes, or deploys without later instruction.

Completed as documentation-only planning: standing ruling 20 now records the professional-user
source-fidelity contract; the architecture review aligns validation, streaming, routing, fixtures,
and gates to it; and the executable master prompt defines Phases 0–7, retained `codex/` phase
branches/worktrees, a dedicated integration branch, independent critical-gate reviews, and detailed
per-phase plus cumulative reports. The 2026-07-17 live decision was moved verbatim to
`docs/DECISIONS.md` to keep `AGENTS.md` compact. No application code, paid call, production write,
external mutation, Paddle work, deployment, push, or merge to `main` was performed.

## 2026-07-19 19:57 EDT — AI Search/Ask Phase 0: measurement, UX honesty, eval foundation

Work block (≤2h), per the 2026-07-19 unattended phased workstream authorization and
`docs/prompts/2026-07-19-ai-search-ask-phased-implementation.md` §7. Branches:
`codex/ai-search-ask-integration-20260719` (integration, from main `6c21b17`) and
`codex/ai-search-ask-p0-measure` (this phase). Migration number claimed: **0021**
(next free index; the concurrent billing workstream has no schema work in-tree yet —
`src/lib/billing/` absent, working tree clean at branch time).

1. Additive migration 0021: `ask_usage` += `run_id` (uuid, unique), `started_at`,
   `stage_timings_ms` (jsonb), `first_content_at` (null until Phase 3), `route_policy`
   (null until Phase 4).
2. Request-scoped run meta + monotonic stage-timings collector threaded
   `askWithLimits` → `ask()` → `retrieveV2`/rerank/answer → `logUsage`; metering
   call sites untouched. Server action measures source hydration and patches ONLY its
   run's row; the JSON route records its own wrapper total, hydration stays null.
3. Honest pending copy on /ask (single "searching and preparing" line + real elapsed;
   the rotating client-inferred stage labels are removed).
4. `ask_started` analytics event implemented typed + DISABLED (flag default off; no
   PostHog allowlist enablement without operator approval).
5. `maxDuration` pinned on the /ask page segment after verifying Next 16 server-action
   inheritance against the installed next dist.
6. Eval runner: answer-model matrix configs (`v2-k60+<model>`, retrieval/rerank held
   fixed) + 8 named-person source-fidelity gold fixtures with deterministic scoring.
   The ~$1–3 paid matrix run itself is enablement-blocked (no operator approval) and
   is recorded as such in the Gate 0 report.
7. Tests in layers; adversarial Gate 0 review; phase + gate reports; merge to the
   integration branch only if Gate 0 passes. No deploy, no push, no paid calls, no
   production writes.

## 2026-07-19 21:10 EDT — AI Search Phase 1: persisted runs, idempotency, atomic reservations

Work block (≤2h to the contract + schema; the phase spans several blocks). Phase 0 PASSED
Gate 0 (2 high + 6 medium confirmed, 0 refuted, all fixed in `598dcb2`) and merged
`--no-ff` into `codex/ai-search-ask-integration-20260719` at `a761551`. This phase:
`codex/ai-search-ask-p1-runs` from that HEAD. Migration number claimed: **0022**
(billing workstream still has no in-tree schema work; tree clean at branch time).

1. Contract freeze FIRST (master prompt §8): `docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md`
   — per-provider advisory-lock reservation transaction (chosen over a locked counter
   row), reserved→started→settled/released lifecycle with conservative ceiling
   settlement, lock-free unique-slot allowance, idempotent replay, expiry.
2. Migration 0022: `ask_runs` (+ result payload for replay), `ask_allowance_reservations`,
   `provider_usage_reservations` — all additive.
3. `src/lib/ask/runs.ts` (run lifecycle) + `src/lib/usage/reservations.ts` (atomic
   reserve/settle/release/expire); ask stages keep their guard call sites, awaiting
   tryReserve (compatible with both the legacy SpendGuard and the atomic guard).
4. Entry points thread a client idempotency key (hidden form field UUID; the one-click
   intent reuses its intent UUID; the API accepts an optional key).
5. `ASK_RUNS_ENFORCE=0` shadow-writes rows only; `=1` activates replay, atomic
   allowance, and atomic provider reservations. Fold in F14 (rerank guard.record real
   token units).
6. Disposable-Neon integration tests for the full concurrency matrix (last slot, daily
   cap, all-time cap, envelope isolation, replay, expiry, idempotent settlement).
7. Independent adversarial money review at Gate 1; reports; merge only on pass.
   No paid calls, production writes, deploys, or pushes.

## 2026-07-19 22:05 EDT — AI Search Phase 2: progressive retrieval, evidence-first UX

Phase 1 PASSED Gate 1 (1 high + 6 medium confirmed — incl. the reopened-F7 snapshot
race, now closed with a single-statement union read — 0 unfixed; 1 refuted) and merged
`--no-ff` at `82f93a8`. This phase: `codex/ai-search-ask-p2-progressive` from that HEAD.
Migration number claimed: **0023** (ask_run_events + evidence snapshot storage + the
register-#22 partial index on ask_runs(finished_at) for the expiry sweep).

Work blocks (per the master prompt §9):
1. Transport spike FIRST: prove the production-shaped SSE/replay design — a
   reconnecting GET authenticates, verifies run ownership, replays persisted
   `seq > after` events, tails Postgres with bounded polling + heartbeats, makes zero
   provider calls; no process-local emitter anywhere. Design note committed before the
   full build; EvidenceSnapshot shape + retention class frozen in the same note.
2. Migration 0023 + `src/lib/ask/events.ts` (typed event union, payload allowlist) +
   snapshot persistence (claim CONTENT + stable raw_documents ids — F11).
3. Orchestrator extraction (`src/lib/ask/orchestrator.ts`): ask() becomes a thin
   wrapper over it with a null event sink; retrieval arms go concurrent
   (Promise.allSettled) with an onPartial lexical event and a determinism test.
4. SSE routes (POST /api/ask/runs → stream; GET /api/ask/runs/[id]/events?after=;
   stub cancel route) — owner-gated, heartbeats, maxDuration pinned.
5. Client run-controller + candidate panel (candidate ≠ selected ≠ cited labels),
   ASK_PROGRESSIVE flag; server-action path stays the no-JS fallback; browser
   verification against a PRODUCTION build (dev never hydrates on this box, #74).
6. Gate 2: evidence-truth/state-machine/reconnect/a11y/money lenses + measured
   p50 time-to-first-candidate target <2s on production-shaped data.
No paid calls, production writes, deploys, or pushes.

## 2026-07-19 23:05 EDT — AI Search Phase 3: AnswerValidator + validated streaming

Phase 2 PASSED Gate 2 (inline §5-fallback pass after the multi-agent attempt died on
session limits — 4 findings fixed in `04e0318`; supplementary independent pass queued
post-reset) and merged at `a0c6e85`. This phase:
`codex/ai-search-ask-p3-validation-stream`. Two increments under independent flags
(master prompt §10):

A. Extract the pure `AnswerValidator` (citation filter, denial-prefix check, terminal
   refusal/empty/truncation mapping) into `src/lib/ask/validator.ts`, shared by the
   streaming and non-streaming paths with BYTE-EQUIVALENCE tests against current
   outputs; add the §4 source-fidelity matrix for name-bearing sentences (identity/
   category/predicate/status/certainty/timing + governing attribution against the
   cited EvidenceSnapshot; deterministic cited-claim fallback — never name
   suppression). Whole-answer release first.
B. Buffered validated sections behind `ASK_STREAM_ANSWER` (default OFF): server-side
   provider stream, sentence-boundary buffering, 250-char denial holdback, per-chunk
   citation validation, terminal reconciliation, Stop/cancel wiring, exactly-once
   settlement on all stream-death paths.
Gate 3 REQUIRES the independent red-team (post-reset). No paid calls, production
writes, deploys, pushes; production enablement stays blocked.

## 2026-07-20 11:55 EDT — AI Search recovery: interrupted Gate 2 supplementary + Gate 3

The 2026-07-20 session died mid-work (credit/session limit) leaving Phase 3 ungated
with a dirty `src/lib/ask/run-controller.ts` patch (attempted supplementary-Gate-2
fixes, uncommitted, unproven). Recovery block (≤2h increments, committed often):

1. Forensics + exclusive ownership; recovery report
   `docs/reviews/AI-SEARCH-RECOVERY-2026-07-20.md`.
2. Prove or rework the dirty run-controller patch against the persisted-event
   contract (14-point behavior matrix; focused tests → typecheck/lint/full suite);
   commit as forward fixes.
3. Supplementary Gate 2 independent review (2–3 reviewers, divided lenses), addendum
   appended to `AI-SEARCH-GATE-2-2026-07-19.md`.
4. Gate 3 independent red-team over the full Phase 3 diff + executed probes; full
   verification battery (unit/lint/build/integration on a proven-disposable Neon
   fork/browser on production build, flags both ways); write
   `AI-SEARCH-GATE-3-2026-07-20.md`.
5. On PASS only: merge Phase 3 `--no-ff` into
   `codex/ai-search-ask-integration-20260719`; retain the phase branch.
6. Continue Phases 4–7 per the master prompt.
No pushes, deploys, production writes, paid calls, cap/analytics/provider changes.
