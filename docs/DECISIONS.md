# DECISIONS.md — append-only decision-log archive

This is the archive of the AGENTS.md decision log. When the live log outgrows
AGENTS.md's ~300-line budget, the oldest entries move here **verbatim** — moving
preserves history; editing or summarizing entries does not and is forbidden. Entries
here are never edited or deleted; a wrong entry is corrected by a new dated entry in
the live log in AGENTS.md.

Split as of 2026-07-09 (second archive pass, taken after the DIGEST_ENGINE cutover):
entries from 2026-07-04 through the MR-sprint-2 map-stage entries — including the
tooling and restructure entries — live here; AGENTS.md keeps the current sprint cycle
(MR sprint 3 and the cutover onward). Durable one-line versions of the still-binding
decisions live in AGENTS.md § Standing rulings. This preamble records where the split
currently sits, so it is corrected on each pass; the entries below it never are.

## Decision log (archived entries, oldest first)

- **2026-07-04** Original product brief absent from machine → reconstructed from execution
  prompt; marked as such. (Blocker #1.)
- **2026-07-04** VERCEL_TOKEN in scenefiend env is expired (403). Use machine's logged-in
  Vercel CLI session for weekend deploys; token regen goes in SETUP-NEXT-WEEK.
- **2026-07-04** No Anthropic key; OPENAI_API_KEY present → `AnalysisProvider` ships with
  `openai` implementation live (≤$25 cap) + deterministic `stub`. Interface unchanged if/when
  Anthropic key arrives.
- **2026-07-04** Postmark creds exist (scenefiend's) but NOT borrowed — bnow email goes
  through a Resend-shaped adapter stubbed to file output. Avoids cross-product sender-domain
  mess.
- **2026-07-04** ISW site redesigned vs prompt's assumption: reports live at
  `/research/russia-ukraine/russian-offensive-campaign-assessment-<month>-<day>-<year>/`.
  Crawler targets new structure; criticalthreats.org stays the fallback.
- **2026-07-04** Per repo-root CLAUDE.md: no vendor branding in commits/files; no
  deletes/renames outside this repo; small, test-covered diffs.
- **2026-07-04** TASS/RIA/Lenta RSS TCP-unreachable from host → their content enters
  via their official telegram channels (tass_agency, rian_ru).
- **2026-07-04** OpenAI quota died after one successful prod digest → stub provider
  (deterministic extractive) as designed; ANALYSIS_PROVIDER=stub in prod env.
- **2026-07-04** ISW "Key Takeaways" stored as keyword signatures only (toponyms +
  action classes + char count) — no prose in DB, satisfying §8.6 while enabling matching.
- **2026-07-04** Unhedged ISW declaratives stay hedging='unknown' (mid-trust 0.5) —
  forcing them into the 4 classes would corrupt the reliability signal.
- **2026-07-04** Matching is trilingual keyword-based (gazetteer + oblast→town
  expansion), NOT LLM — deterministic, testable; LLM upgrade slots into same seam.
- **2026-07-04** Vercel account supports frequent crons (*/15 registered fine) — no
  local scheduler needed; everything steady-state runs serverless.
- **2026-07-04** RU/UA digest corpora are strictly per-theater (rd.country_iso2 = X);
  uk-language telegram posts auto-tag ua (registry lacks per-source country, debt).
- **2026-07-05** OpenAI recharged → stub override removed; 30 digests regenerated via
  Vercel route (local OpenAI egress still blocked). LLM semantic matching added for
  validation: ISW takeaway texts enter the prompt transiently, only verdicts persist
  (§8.6 holds); keyword matcher remains as fallback; details.matcher records which ran.
- **2026-07-05** Validate flow auto-discovers new ISW reports from the predictable
  slug (…-assessment-<month>-<day>-<year>) — corpus updates no longer need local runs.
- **2026-07-05** Elite-politics track added (Gregory's request): digests.track dimension,
  entities/claim_entities graph, lexicon prefilter + Kremlinology prompt. Unvalidated by
  design (ISW out of scope); factional interpretations always hedging='assessed'.
  Kommersant RSS + t.me/vchkogpu unreachable (blocked / preview off) — degrade cleanly.
- **2026-07-06** Original product brief installed as `docs/PRODUCT-BRIEF.md`, replacing the
  2026-07-04 reconstruction (delete explicitly instructed by Gregory's hardening prompt;
  scoped exception to the no-delete default). Diff findings — nothing built CONTRADICTS the
  original, but the reconstruction under-specified it in four material ways:
  (1) §8.7 Phase 2/3 targets were missing: event coverage ≥80% of ISW events same-day
  (actual: 17.5% avg / 31% nonzero-day), unsupported-claim rate <2%, timeliness ±6h,
  10 design partners + 1 gov pilot. Now tracked in OPEN-TASKS #11.
  (2) §6.5 pricing is crisis-cycle + REGIONAL-BUNDLE SKUs (sell "Gulf" not per-country;
  à-la-carte country ≈40% of bundle; global $10–15K/mo; standby $300–500; NO surge
  pricing). Implemented per-country tiers ($400/$2–4K) sit inside the ranges, but the
  bundle packaging layer is absent. OPEN-TASKS #12.
  (3) §8.6 risk list includes sanctions-exposure counsel review for handling RU
  state-media content — operator action, added to SETUP-NEXT-WEEK. OPEN-TASKS #13.
  (4) §5 scoring dimensions include source-reliability CALIBRATION (does our weighting
  match ISW hedging?) — not currently a scored validation dimension. Ties into the
  reliability-weighting audit (OPEN-TASKS #6).
  China placement: original Tier 1 lists China as second flagship, but its §8.4 build
  plan recommends Gulf as region #2 — our China deferral follows the build plan; no
  contradiction. Phase 0 exits (≥2,000 sources, >90% parse) exceeded: 6,985 / 97.65%.
- **2026-07-06** Truth-in-UI hardening: stub/fixture data may never persist or render as
  fact. Stub enrichment persists only sanitized `{matched:false, stub:true}`; stub
  ownership edges never written; stub adapters unwired from production ingest; digest
  corpus excludes `[STUB FIXTURE]%` at query level; entity/ask surfaces null out stub
  fields. Prod purged (2 fabricated-source claims, 4 stub docs, 148 stub enrich records,
  5 stub edges). Policy: HIDE stub data entirely rather than demo-label it.
- **2026-07-06** Digest cron split into ?group=core (ru+ua, :30) and ?group=gulf (rest,
  :50): serial matrix measured ~6 min (RU military digest alone 3m40s under TPM
  throttle); killed runs silently dropped last-sorting theaters. Audit:
  docs/reviews/AUDIT-2026-07-06.md.
- **2026-07-06** CI: .github/workflows/ci.yml (typecheck+lint+test) activates on first
  push; GitHub unreachable from this box, so the enforced local gate is
  .githooks/pre-push via `git config core.hooksPath .githooks` (run once per clone).
- **2026-07-06** /ask capped: ask_usage table logs every question (billing-ready);
  ASK_USER_DAILY_LIMIT (20/day) + ASK_GLOBAL_DAILY_BUDGET_USD ($1/day) enforced in
  askWithLimits() wrapping both the page and the API route.
- **2026-07-06** Entity graph canonicalized 293 → 85: deterministic rules pass
  (geography/collectives/objects dropped; alias clusters merged with claim/link
  repointing) + LLM propose-only audit route (/api/cron/entity-audit) with human
  review before apply (docs/reviews/ENTITY-AUDIT-2026-07-06.jsonl). ENTITY_RULES
  block added to all extraction prompts. Policy: LLM proposals are never auto-applied.
- **2026-07-07** Integration tests run on disposable Neon branches (fork prod, test,
  delete — scripts/test-integration.sh); *.itest.ts excluded from the unit suite.
- **2026-07-07** RU/UA validation filters ISW takeaways per theater
  (classifyTakeawayTheater). Measured effect small (~0.5 takeaways/report filtered);
  the dominant coverage noise is gpt-4o-mini matcher nondeterminism even at temp 0
  (±30pts/day on unchanged digests) → OPEN-TASKS #15 (majority-vote matching).
- **2026-07-07** Iran military runs a theater prompt + lexicon
  (TrackConfig.lexiconByCountry/systemPromptByCountry); "quiet days are normal" is
  explicit in the prompt. Iran coverage off 0%: 33.3/25% on 2 of 4 scored days.
- **2026-07-07** Reliability weighting: digest event ranking confirmed wired
  (confidence = mean source reliability); /ask retrieval now orders by confidence
  within a day (was recency-only — state-media claims could lead the evidence set).
- **2026-07-07** registry-materialize is theater-aware: source_theater_stats (ru/ir)
  + global all-theater aggregates on sources; ME zombie rows 1,574 → 0.
- **2026-07-07 (sprint)** Paid-provider budget architecture: provider_usage +
  provider_state tables (migration 0008) + SpendGuard (src/lib/usage/spend-guard.ts).
  Every paid call passes tryReserve() first; FAIL-CLOSED when the provider's total-cap
  env is unset (X_SPRINT_USD_CAP / LLM_SPRINT_USD_CAP / OPENSANCTIONS_CALL_CAP). Caps:
  total USD or total calls, daily USD, daily+per-run requests — all env-tunable.
- **2026-07-07 (sprint)** Live X adapter is `x_api` (api.twitterapi.io), NOT the "x"
  fixture stub name — audit tooling treats adapter='x' rows as stub contamination.
  Steady-state polling uses advanced_search batched `from:` OR-queries since a
  persisted watermark (pay only new tweets + $0.00015/request minimums); last_tweets
  (newest ~20, all billed) reserved for backfill. Own cron group (?which=x, hourly
  :20), excluded from "all" so casual local ingest can't spend. 383 ISW-cited accounts
  (last 90d), dominant-theater tagged; uk-language tweets re-tag ua (telegram-web
  convention).
- **2026-07-07 (sprint)** Majority-vote validation matching (OPEN-TASKS #15): k=5
  gpt-4o-mini rounds, takeaway↔claim match requires strict majority on the SAME claim;
  per-vote audit trail in details.votes; matcher records llm-majority|llm|keyword.
  Measured: 26/27 country-day results identical across 3 full reruns (was ±30pts
  single-shot); worst case one marginal takeaway (16.7pts on a 6-takeaway day).
  MATCHER_MODE=single is the fallback flag.
- **2026-07-07 (sprint)** OpenSanctions live: 200 entities enriched day-one under
  OPENSANCTIONS_CALL_CAP=300 (121 matched, 54 sanctioned; daily-cap guard stopped run 2
  at exactly 200 — by design). Priority: pressure-signal entities > persons > companies.
  Stub-checked rows count as unchecked (live key upgrades them). Spot-check 4/5 correct;
  1 name-collision flagged → matches are name-based, badges are beta-only until
  commercial licensing (HUMAN-SETUP-TODO hard gate).
- **2026-07-07 (sprint)** sa was never bot-walled: arabnews.com RSS froze upstream
  2026-04-25 (still 200/valid XML). sa → Saudi Gazette + Asharq Al-Awsat EN; il revived
  (JPost + Ynet, flipped active); bh/kw stay scaffolded (no working feed found).
- **2026-07-07 (sprint)** Citation-weighted parity after X adapter: ru 62.5%→74.2%,
  ir 35.9%→57.5% (scripts/source-parity.ts; the moving baseline vs the logged 51% is
  telegram roster growth since 07-05).
- **2026-07-09 (nav)** Server-side session read in the shared header, because `next build`
  already reported ALL 33 routes as `ƒ` dynamic — there was no static/ISR output to sacrifice,
  so the client-island alternative would have bought a hydration swap for nothing. Route table
  diffed byte-identical before/after. `currentUserEmail()` (src/lib/session.ts) wraps `auth()` in
  React `cache()` (the layout, the page and any gate layout would each fire a separate
  `strategy:"database"` session query) **and** a try/catch: there is no `error.tsx` anywhere, so a
  layout-level throw would 500 the whole site. Chrome degrades to signed-out; `requireUser()` is
  untouched and stays fail-closed.
- **2026-07-09 (nav)** Solutions labels corrected against page content, over the brief's sketch:
  `/datadark` is the **Data-dark tracker** (Russia has classified 400+ statistical series; the
  suppression is the signal) — it is NOT sanctions compliance, and labelling it so would have been
  a false product claim. `/trade` is the mirror-trade & evasion watch and takes the sanctions
  label. `critical-materials` is import-concentration/choke-points, not price risk. Final:
  Sanctions & trade evasion→/trade, Commodity & supply-chain risk→/critical-materials, Economic
  data suppression→/datadark, Political risk & signals→/signals.
- **2026-07-09 (nav)** Coverage links to `/countries#<iso2>`, not to theater pages: **there are no
  per-theater pages** — the per-theater surface is the digest, which sits behind
  FEATURE_AUTH_GATE. Pointing a top-of-funnel nav item at a sign-in wall defeats the restructure.
  Digest deep links live on the signed-in homepage, where the gate is already satisfied. Also
  keeps zero DB queries in the header.
- **2026-07-09 (nav)** Nav promotes only ru/ua/ir although `countries.status='active'` holds eight
  rows: il/sa/ae/om/qa carry 2–5 digests vs 27/20/19. Consistent with the standing `home.live`
  copy; promoting a 2-digest theater would overstate coverage depth (truth-in-UI policy).
- **2026-07-09 (nav)** Locale links stay plain `<a href="/api/locale?set=xx">` with **no `?to=`**.
  The route prefers an explicit `?to=` over the Referer, so threading `?to={usePathname()}` would
  silently drop `?profile=` on digest pages. Verified live: Referer round-trips path AND query.
- **2026-07-09 (nav)** es/he/ko keep the English per-key fallback rather than receiving nav-only
  catalogs — half-translated chrome is worse than uniform fallback. OPEN-TASKS #21. The existing
  i18n suite does NOT guard translation completeness (English fallback satisfies it); the new
  header test does, for header keys.
- **2026-07-09 (MR sprint 1)** **Deployed env values read from the Vercel dashboard**, closing
  audit §12 #5: `MIX_CAP_FRACTION`, `MATCH_VOTES`, `OPENAI_MODEL`, `MATCHER_MODE` and
  `ANALYSIS_PROVIDER` are all **absent in production** → the shipped defaults are live (0.4, 5,
  gpt-4o-mini, majority, openai). So the audit's "240 per-adapter gather cap binds" thesis holds
  unconditionally, and k=5 majority voting is confirmed. `LLM_SPRINT_USD_CAP`, `X_SPRINT_USD_CAP`,
  `X_DAILY_USD_CAP`, `OPENSANCTIONS_CALL_CAP` are set but their **values stay unreadable** — the
  CLI returns `""` for sensitive vars, so `vercel env pull` cannot confirm them. Values remain an
  operator task.
- **2026-07-09 (MR sprint 1)** The digest guard's **daily** cap is `LLM_DIGEST_USD_CAP` and its
  **all-time** backstop is the existing `LLM_SPRINT_USD_CAP`. SpendGuard's fail-closed rule keys
  off the total cap only, so a daily-cap-only guard would have had no fail-closed path; rather than
  invent a second total-cap env that would be unset in prod (and so kill every digest on deploy),
  the digest path honours the sprint ceiling llm_match already honours. `dailyUsdCap` is now
  `number | null`, null = fail closed; every existing caller passes a number, so x_api /
  opensanctions / llm_match behaviour is unchanged. `LLM_DIGEST_USD_CAP=2` set in Vercel
  (production, preview, development) **before** deploying — an unset cap in production fails
  closed, which would have stopped all digests.
- **2026-07-09 (MR sprint 1)** Metering lives **inside** `openai-provider.analyze()`, not in
  `digest.ts`: only the provider holds `completion.usage`, and a guard there covers every caller
  (cron, `scripts/digest.ts`, any future map-reduce reduce pass) rather than one call site. A
  truncated response is **recorded before it is thrown away** — OpenAI bills it in full, so
  recording it is the only way the waste ever becomes visible. One guard instance per `analyze()`;
  the daily/total caps are DB-backed and therefore hold across serverless invocations.
- **2026-07-09 (MR sprint 1)** `LLM_DISABLE=1` refuses at all four OpenAI call sites, but **not
  identically**: digest / anthropic / entity-audit throw a typed `LlmDisabledError`, while
  llm-match degrades to the keyword matcher and `/ask` to its deterministic cited-claims path.
  Throwing at those two would cost a whole validation run and 500 a user surface — strictly worse
  than losing the LLM assist, which is all the switch is meant to stop.
- **2026-07-09 (MR sprint 1)** entity-audit shares `LLM_DIGEST_USD_CAP`'s per-day envelope but
  writes its **own** `provider_usage` row (`openai_entity_audit`). Folding an unscheduled manual
  route into `openai_digest` would corrupt the digest ledger that this sprint exists to create.
- **2026-07-09 (MR sprint 1)** The truncation-ladder retry condition is "a smaller rung remains",
  not `size > 25`. `LlmBudgetError` / `LlmDisabledError` messages contain no "truncated", so a
  budget stop rethrows immediately instead of burning the remaining rungs at full price.
- **2026-07-09 (MR sprint 1)** `drizzle/9999_claim_source_trigger.sql` re-asserts the traceability
  trigger **without dropping it**: `scripts/migrate.ts` runs statements one at a time outside a
  transaction, so a DROP/CREATE pair would leave a window in which a live digest cron could commit
  an unsourced claim. Numbered 9999 so it always applies after generated DDL and can never collide
  with drizzle-kit's numbering, which counts from `meta/_journal.json` (it emitted `0010` next,
  confirming the choice). `src/db/migrations.test.ts` fails if a regeneration ever drops it.
- **2026-07-09 (MR sprint 1)** Persian routing is **two rules, both needed**: `TELEGRAM_CHANNEL_THEATER`
  pins the five Iranian registry channels to ir (this is what catches their 12 English + 4 Arabic
  posts), and `routeTheater()` adds fa→ir beside the existing uk→ua (this catches Persian on any
  future channel). **Arabic is deliberately not routed by language** — it spans ir/sa/ae/qa/om/il,
  and the 635 Arabic docs still filed under ru are Lebanese (mtvlebanonews 471, sameralhajali 109,
  mmirleb 19), not Iranian. Whether Lebanon/Hezbollah belongs to the ir theater is an editorial
  call for Gregory, not a mechanical fix → OPEN-TASKS #29.
- **2026-07-09 (MR sprint 1)** `cron_runs` rows are written at **start**, not on completion: a run
  killed by `maxDuration` then leaves `finished_at IS NULL`, and that unterminated row is the
  timeout signal. Recording only on completion would have made a timeout indistinguishable from a
  cron that never fired — the exact ambiguity audit §12 #6 flagged.
- **2026-07-09 (MR sprint 1)** **The empty-extraction guard is weaker than it looks.** Verifying the
  metering, two regens of ua/2026-07-08 from a byte-identical batch (`promptTokens`=10,516 both
  times) yielded 1 claim then 8 claims; the first overwrote a 10-claim, 57.1%-coverage digest.
  `digest.ts:170-185` refuses an overwrite only at **zero** events, so a 10→1 collapse passes, and
  with ~8 regenerations/digest-day under last-writer-wins the published digest is the *last* roll,
  not the best. Not fixed here (out of sprint scope, and the fix — compare claim counts, or K-run
  extraction — belongs with OPEN-TASKS #18/#28). → OPEN-TASKS #32. Only became visible because
  `stats.llm` now makes per-run extraction yield measurable.
- **2026-07-09 (MR sprint 1) — two standing notes in this file are now WRONG, corrected here rather
  than edited above (the log is append-only):**
  (a) "GitHub unreachable from this box" (2026-07-06 CI entry) — `git ls-remote origin` succeeds.
  `origin/main` is at `be13063`, pushed 2026-07-09 08:53.
  (b) The "~100 unpushed commits / email-privacy push blocker" handed down from the earlier
  session is **stale**: only the 11 MR-sprint-1 commits are unpushed, and the one commit carrying a
  private email (`e29d220` "Initial commit", `gregoryoconnor@gmail.com`) is already an **ancestor of
  origin/main** — it was pushed long ago, so GH007 cannot fire on it. Every other commit uses the
  `6955+gregoryo@users.noreply.github.com` noreply address. There is no push blocker.
- **2026-07-09 (MR sprint 2)** Map stage ships in SHADOW: `doc_claims`/`doc_dedup`/`doc_map_state`
  + hourly `/api/cron/map` (:40, own group). The digest pipeline is byte-untouched — the only
  shared-file changes are additive (`llm-guard.ts` map guard, `vercel.json` cron, `schema.ts`).
  `doc_map_state` exists beyond the task list's tables because "mapped, zero relevant claims" must
  be distinguishable from "never mapped" — claim rows alone cannot say it, and it is what makes the
  worker idempotent (anti-join) and resumable after a crash.
- **2026-07-09 (MR sprint 2)** `raw_documents.processed` repurposed to exactly ONE meaning: the map
  worker reached a final disposition (mapped every applicable track / recorded as mirror / no
  applicable track). It exists so the hourly scan is an indexed `processed=false` probe instead of
  an anti-join over the whole corpus. Consequence, recorded as OPEN-TASKS #33: version bumps need
  their own remap path — the flag deliberately does not reset itself.
- **2026-07-09 (MR sprint 2)** Dedup gate verdicts are SAME-THEATER and ±1 DAY for exact **and**
  minhash matches. Same-theater because the map key is theater-scoped (mirroring a ru doc to an ir
  canonical silently drops the ru claims); ±1 day because identical content on distant days is
  usually a recurring template (telegram air-raid alerts, audit §9a) describing a *different* day's
  events — collapsing those would misdate claims. The ±1-day rule was specified for minhash only;
  extending it to exact matches is this sprint's call, flagged here for review.
- **2026-07-09 (MR sprint 2)** **gpt-4o-mini silently answers a fraction of a multi-doc batch**:
  with the response schema unbounded it returned 1 of 15 requested per-doc entries and stopped
  clean (`finish_reason=stop`); prompt wording ("return exactly N entries", explicit id checklist)
  did not fix it (43% omission in backfill round 1, 57% in round 2). The fix is grammar-level:
  `minItems`/`maxItems` = batch size on the results array — **strict mode accepts array bounds and
  the API's constrained decoding then forces the count** (15/15, correct ids, in order). Any future
  batched per-item extraction should start from this.
- **2026-07-09 (MR sprint 2)** Map prompts are versioned: `extractor_version` = model + sha256 of
  (resolved system prompt, user-frame revision, content budget), 12 hex chars. Two superseded
  versions from the sprint's own prompt iterations remain in the store as history (append-only) —
  consumers filter to `mapExtractorVersion()` current versions or double-count (OPEN-TASKS #35).
- **2026-07-09 (MR sprint 2)** **A standing note in this file is now WRONG:** "api.openai.com
  TCP-unreachable from this WSL2 box" (Local-host quirks, 2026-07-04). It was never TCP — the WSL2
  NAT *resolver* times out on those domains, and `scripts/pin-dns.cjs` (routes vercel/openai DNS
  through 1.1.1.1) makes local OpenAI calls work fine. That is precisely how the omission bug above
  was root-caused: reproducing one map batch locally and reading the raw response. LLM bulk work
  still runs via Vercel routes (prod env, metering, crons), but local single-call debugging is
  available and cheap.
- **2026-07-09 (MR sprint 2)** Map spend rails: `MAP_USD_CAP_DAILY=4` set in all three Vercel envs
  BEFORE the deploy (fail-closed like the digest cap, but its OWN env — never shared with
  `LLM_DIGEST_USD_CAP`, so a backfill can neither starve nor be starved by production digests);
  `LLM_SPRINT_USD_CAP` stays the all-time backstop; ledger row `provider_usage.openai_map`;
  `LLM_DISABLE=1` refuses the worker (typed throw). `MAP_CONCURRENCY=6` (prod env) after measuring
  ~45K tok/min at the default 3 — latency-bound, not TPM-bound.
 - **2026-07-09 (tooling)**  Added repo-root CLAUDE.md granting the scoped delete/rename/move 
  exception that ~/CLAUDE.md requires (imports AGENTS.md via @). Supersedes the 2026-07-04 
  "no deletes/renames" understanding, which mis-attributed a global-~/CLAUDE.md rule to a 
  nonexistent repo-root file. Applied-migration additivity and 
  decision-log append-only are explicitly preserved.
- **2026-07-09 (restructure)** AGENTS.md reorganized from journal to brain, 476 → 301
  lines. New maintenance rule at top: only this log is append-only; standing sections are
  corrected in place. Entries 2026-07-04 → 07-09 (MR sprint 1) moved verbatim to
  `docs/DECISIONS.md`; durable decisions distilled into § Standing rulings. Stale
  standing facts corrected in place: digest cron is 4×/day at 0/6/12/18 UTC (was "daily
  21:30"); "openai/gdelt TCP-unreachable" rewritten as the WSL2 DNS quirk (gdelt DNS
  still fails — not pinned); GitHub reachable but DNS slow (ls-remote: 3/3 fail at 10s,
  ok at 45s); directory map matched to the real tree; RSS count 8 → 29; anthropic
  provider exists in the seam (key absent); Postmark added to credentials (live but
  missing from the table); untouchables now name the SpendGuard cap envs, not the
  launch-weekend "$25 cap / deployed by Sunday". `CLAUDE.MD` → `CLAUDE.md` (auto-load
  is case-sensitive) and rewritten: verified commands/setup, commit hygiene, pointers
  instead of restated guardrails. 391/391 tests green at time of writing.
