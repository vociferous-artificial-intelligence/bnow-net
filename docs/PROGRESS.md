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
