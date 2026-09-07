# DECISIONS.md — append-only decision-log archive

This is the archive of the AGENTS.md decision log. When the live log outgrows
AGENTS.md's ~300-line budget, the oldest entries move here **verbatim** — moving
preserves history; editing or summarizing entries does not and is forbidden. Entries
here are never edited or deleted; a wrong entry is corrected by a new dated entry in
the live log in AGENTS.md.

Split as of **2026-08-31 (eighth archive pass, performed 2026-09-07)**: every entry dated
before 2026-08-31 lives here — 2026-07-04 through the 2026-08-29 #97 Ask-family release
closeout. AGENTS.md keeps a rolling 7-day inline window (decision D5, 2026-09-05), which is
what holds it under the 150,000-character tooling ceiling that decision also set.
Durable versions of still-binding decisions live in AGENTS.md § Standing rulings. This
preamble records where the split currently sits, so it is corrected on each pass; the
entries below it never are.

The fifth pass also restored this archive's ascending order for the five moved entries: two
of them had been appended to the top of the live log rather than the bottom. Only their
position relative to one another changed — every entry's text is byte-identical to what it
said in AGENTS.md.

The eighth pass did the same twice more, on the same principle — reordering is sanctioned,
editing is not. (1) One archived 2026-07-14 entry sat out of date order and was moved into
place. (2) In AGENTS.md the log had split into two blocks, the second appended below
`## Operating protocol`, leaving four standing sections wedged mid-log (OPEN-TASKS #92); the
29 entries moved in this pass came from both blocks and are interleaved here by date. Every
entry's text is byte-identical to what it said in AGENTS.md, asserted mechanically by
`scripts/check-decision-log-move.sh`, which is the acceptance test for this and every future
pass.

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

## Decision log archive pass — 2026-07-16

- **2026-07-09 (MR sprint 3, TASK 0)** OPEN-TASKS #29 adjudicated by the operator: the three
  Lebanese Arabic channels (mtvlebanonews, sameralhajali, mmirleb) route to **ir**. Rationale:
  theater is a coverage lens, not nationality — Hezbollah/Lebanon proxy-network content sits
  inside the IRAN_MILITARY_PROMPT's explicit scope and the ISW Iran Update validation baseline.
  Executed: three `TELEGRAM_CHANNEL_THEATER` pins, map holdout (`MAP_HOLDOUT_SOURCE_KEYS`)
  removed, `retag-theater --apply` moved 651 docs ru→ir, deployed, one catch-up map run drained
  the backlog (620 selected → 100% disposition, 41 claims, $0.0041, 0 integrity violations).
  This also removes the legacy-vs-mapreduce A/B asymmetry before the sprint-3 gate runs.
  Standing ruling 11 corrected in place; follow-up = multi-theater source tagging at Tier-2/3
  expansion (new OPEN-TASKS #37).

- **2026-07-09 (MR sprint 3)** Reduce + synthesis shipped; **A/B gate evaluated honestly across
  two rounds and passed; cutover deployed with the flag default LEGACY.** Round 1 (K=3 votes)
  FAILED the variance criterion (within-cell coverage SD 10.5 vs legacy 8.0, paired p=0.35):
  marginal events flip out of 2-of-3 vote majorities between generations, dropping exactly the
  frontline claims ISW scores (ru 07-07: 100→33→0). Fixes: K=5 (majority 3-of-5) + majority-gid
  fill (majority-supported groups dropped by the median roll get deterministic claims from group
  text). Round 2 passed all three criteria: coverage 25.0 vs 21.1 (ir +15.1 p=0.067, ru parity,
  ua −3.6 p=0.45 noise-scale — WATCH post-flip), SD 6.9 vs 8.0, unsupported 0.30 vs 0.41; #28
  reproducibility 0.75 vs 0.55; distinct docs cited 24.9 vs 9.5. New rulings 17 (corrected) + 18.
  Cadence: 02:00 D+1 finalize + 04:00/10:00/19:30 intraday (rolling 24h, delta-framed) replaces
  the 4×6h yesterday+today loop — the 8–10.2× re-extraction redundancy (audit §11) is retired on
  both engines (legacy now regenerates ≤4×/digest-day). REDUCE_USD_CAP_DAILY=2 set in all three
  Vercel envs BEFORE the deploy. A/B evidence: MR3-AB-RESULTS.jsonl + MR3-AB-K5.jsonl + report
  in MR3-REDUCE-RESULTS.md; sprint LLM spend ≈ $1.76 of $12. The A/B driver's one incident —
  the reduce guard's 500-req/day cap fail-closing round 2 mid-sweep — cost zero samples
  (resumable-by-key design); cap raised via env for the run, prod default unchanged.
  Closes OPEN-TASKS #18, #28, #32, #34, #35. Flip = operator sets DIGEST_ENGINE=mapreduce
  in Vercel prod env + redeploy; rollback = unset + redeploy.

- **2026-07-09 (cutover EXECUTED)** `DIGEST_ENGINE=mapreduce` added to the Vercel
  **production** env and redeployed (`dpl_4HdAJA7ZjAKiUGMLamf1ndDnWgpM`, READY, project
  domain serving 200). ru/ua/ir digests now generate through the reduce+synthesis engine;
  gulf theaters keep falling back to legacy (no doc_claims). Standing sections corrected in
  place. Verified by evidence, not assumption — one narrow live run
  (`?mode=intraday&country=ir&track=nuclear`, 172 docs) returned
  `provider: "openai:gpt-4o-mini+mapreduce"`, wrote a fresh `provider_usage.openai_reduce`
  row (5 requests = the K=5 synthesis votes of ruling 18, $0.0054), left `openai_digest`
  un-incremented, and closed its `cron_runs` row `ok=true` in 40s.
  **Two operational notes for the next flip.** (1) Vercel CLI 55 stores a CLI-added var as
  type **Sensitive**, which is write-only: `vercel env ls` shows only its name and
  `vercel env run -e production -- printenv DIGEST_ENGINE` prints nothing. You cannot read
  the value back to confirm it — the only proof the runtime sees the right string is an
  actual digest run. Add the value with `printf 'mapreduce' | vercel env add …` (no trailing
  newline): `digestEngine()` compares `=== "mapreduce"`, so a stray `\n` from `echo` would
  silently serve legacy forever while every dashboard reads "set". (2) `.env.local` was
  deliberately NOT mirrored: it lacks `REDUCE_USD_CAP_DAILY`, so a local mapreduce run would
  fail closed at the reduce guard (ruling 4). Mirror both envs together or neither.

- **2026-07-09 (env mirror; corrects the entry above)** `.env.local` now mirrors both prod vars,
  `DIGEST_ENGINE=mapreduce` + `REDUCE_USD_CAP_DAILY=2` (verified through the loader:
  `digestEngine()` → mapreduce, `reduceDailyUsdCap()` → 2). Value sourced from the entry above,
  not read back — both are stored Sensitive — and corroborated by `REDUCE_DAILY_USD_CAP_DEFAULT
  = 2`. **Note (2) above named the wrong guard; corrected here, since the log is append-only.**
  Per-day caps resolve `envCap(…) ?? (isProduction() ? null : 2)` (digest/map/reduce alike), so
  they fail closed ONLY in production; the environment-independent fail-closed is the TOTAL cap
  (`spend-guard.ts` refuses when `totalCapUsd` and `totalRequestCap` are both unset) — which is
  precisely what ruling 4 says. Ruling right, entry's mechanism wrong. So `LLM_SPRINT_USD_CAP`
  stays absent from `.env.local`: local digest/map/reduce runs refuse to spend at `tryReserve()`,
  which is what stops a stray local script billing the account. Set it only to pay for a run.

- **2026-07-11 (state recon, read-only, $0)** Full DB+git+disk reconciliation →
  `docs/reviews/STATE-2026-07-10.md`. Verified healthy in place: MR sprint 3 shipped and live
  (ru/ua/ir on `openai:gpt-4o-mini+mapreduce`, `votes=5/failedVotes=0`), all July-6 hardening debt
  shipped, 471/41 tests green, 92 post-07-07 commits all accounted (HEAD==origin/main `2884f50`),
  every cron 0-failed/0-killed, map coverage 99.87%, persist guard observed firing (2 ir thin-regen
  refusals), all-time paid spend $40.63 with no daily cap trending. **Two live drifts corrected in
  place above:** (1) **X ingestion FROZEN** since 07-09 20:21Z — `X_SPRINT_USD_CAP` reached, `ingest:x`
  green but fetched=0 (~32h dark, X≈27–29% of citations); (2) **OpenSanctions enrichment FROZEN** at
  the 300-call lifetime cap (confirmed live via `cron_runs` id 253). Both are correct fail-closed
  behavior, but the "live" labels were stale. Also: the `now() AT TIME ZONE 'UTC'` form in `sqlq`
  reads +4h (driver localizes the naive timestamp) — use raw `timestamptz`. New OPEN-TASKS #38–#46;
  stale-open #1/#2/#3 closed (CI, /ask caps, entity-canon — all had shipped); #30/#36 answered with
  measured data. Recommended next session: (b) MTProto ingest sprint (attacks the coverage gap +
  the frozen X dependency; primed by `bc30e2c`, gated on a one-time operator login).

- **2026-07-11 (MTProto ingest sprint, TASKs 0–2 + staging for 3–5)** Prompt:
  `docs/prompts/2026-07-10-mtproto.md`. **TASK 0 gates:** egress PASSED — MTProto works from
  Vercel functions on BOTH transports (`/api/cron/probe/mtproto`: TCP connect 1844ms cold/1567ms
  warm, WSS 1570ms; GetNearestDc ~90ms; empty-session handshake, so live connects with a saved
  session skip the DH cost). Bundler trap for the next gramJS consumer: import everything from
  the `telegram` ROOT module — a `telegram/sessions` subpath import creates a second module copy
  and the client constructor rejects the foreign StringSession by instanceof; `telegram` is in
  `serverExternalPackages`. Login artifact ABSENT → operator-gated (interactive phone-code/QR);
  API creds valid (probe's initConnection accepted them). **Adapter shipped** (TASK 1, 20 tests):
  `telegram_channel_state` table (migration 0013) caches peer id+access_hash (ResolveUsername is
  the flood-limited call; failures back off 1h→48h, capped resolves/run), per-channel
  last_message_id high-water with gramJS REVERSE iteration (ascending from the mark — a burst
  larger than the per-run cap resumes next run instead of silently losing the middle; first
  contact reads one newest page only), flood policy sleep+retry ≤30s / abort-run above (both
  counted in cron_runs counts), marks commit only AFTER insert (runIngest → adapter.commitMarks).
  **Cross-transport dedupe is an explicit lower(external_id) pre-filter** (+ expression index in
  0013): content_hash CANNOT catch it — the adapter name is hashed in, and preview-rendered text
  differs from raw MTProto text; doc_dedup at map stage is the near-dupe backstop. **The
  telegram_mtproto fixture stub is DELETED** and the real adapter owns the name (x kept the
  stub/live x/x_api split only because both names coexist in data; here prod had 0 legacy rows —
  audit-cron, stub-isolation test, hardening itest updated). **Cron**: own group
  `ingest?which=mtproto` :35 hourly, never inside "all" (flood budget = the spend-guard analog);
  verified on prod fail-closed (ok=true, fetched=0, no session). **Expansion staged** (TASK 4):
  mtproto reads registry top-75 vs the scraper's top-50; ranks 51–75 are the 25-channel batch;
  six Iran-Update-cited channels pinned → ir (rahbar_enghelab_ir, sepah_pasdaran, elamalmoqawama,
  bentzionm, presstv, manniefabian — coverage-lens rationale of the 07-09 #29 adjudication).
  **Backfill staged** (TASK 3): `scripts/mtproto-backfill.ts`, estimate-first and --apply-gated;
  dedupe-aware estimate counts only NEW docs toward map cost: ~44K docs ≈ $3.37 of the $6 sprint
  LLM budget (the naive both-transport count read $6.57 and would have wrongly refused).
  **Blocked on the operator login** (then: local getMe check via `scripts/telegram-getme.ts`,
  TELEGRAM_SESSION into Vercel prod via printf (Sensitive var — verify by exercising, not
  reading), redeploy, backfill --apply, first live cron day): TASKs 3–5 including the
  preview-scraper fate decision, which waits for a proven full MTProto day by design.

- **2026-07-11 (MTProto RU/UA-priority roster — branch `codex/ru-ua-mtproto-priority`, code+env
  done, DEPLOY PENDING)** Reprioritizes MTProto's registry roster to Russia/Ukraine. Before: MTProto
  read the registry's **pan-theater** top-75, which blended ROCA and Iran-Update citations —
  verified live that 16 of those 75 slots were Iran-Update-dominant channels (mmirleb alone has
  5,730 Iran citations). After: `registryTelegramChannels()` takes an options object
  `{ topN?, reportTheater? }`; MTProto passes `reportTheater='ru'` (ROCA-only, filters
  `isw_reports.theater='ru'`) + `topN=120`. Web Telegram passes neither → its pan-theater top-50 is
  **byte-for-byte unchanged** (proven: real `telegramChannelRoster()` against prod returns the same
  70-channel pan-theater roster; MTProto now returns 136 channels ru:102/ua:31/ir:3, the 3 ir being
  the intentional curated OSINT aggregators, zero Iran-Update *registry* channels). Tuning values are
  now env-overridable with safe fallback: `REGISTRY_TELEGRAM_TOP_N` (50), `REGISTRY_TELEGRAM_TOP_N_MTPROTO`
  (120), new `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER` (ru), plus the pre-existing `TG_MTPROTO_*`
  knobs — all set in Vercel as **type=plain (non-Sensitive, readable back)**, in prod+preview+dev,
  BEFORE deploy (the registry 3 are inert until this branch ships; `TG_MTPROTO_CHANNELS_PER_RUN=40` +
  `TG_MTPROTO_RESOLVES_PER_RUN=12` affect the current deployed cron immediately). **27 Ukrainian
  official/military channels pinned → ua** in `TELEGRAM_CHANNEL_THEATER` (the pin fixes their ru/en
  posts, which the uk→ua language rule alone misses — same coverage-lens mechanism as the ir pins).
  Every pin registry-verified: ROCA-cited, ~0 Iran citations, inside the ROCA top-120, docs
  predominantly Ukrainian-language, confirmed institutional identity. The five originally-held
  candidates (sjtf_odes rank 9, joint_forces_task_force rank 13, usf_army=Unmanned Systems Forces,
  andriyshtime, odesamva) were resolved by the DB probe and included — the candidate list is fully
  pinned. `scripts/mtproto-backfill.ts` gains `--registry-top-n / --report-theater / --theaters /
  --budget-usd` (RU/UA eval command documented in-file). Tests: +13 (config env-wiring, theater
  filter shape, ROCA-only vs pan-theater wiring, 27-pin routing, curated dedupe) → 504 green;
  typecheck+lint clean. Merged to main and **deployed 2026-07-11**; the standing "Current state"
  Ingestion line was corrected in place to "top-120 ROCA-only" as part of this deploy.
  Rollback is env-only, no redeploy: set the plain var
  `REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER=all` → pan-theater ranking again (unset/empty stays ru by
  design, so `all`/`any` is the deliberate opt-out; `envReportTheater`). The 27 ua pins are additive
  and harmless to leave. No migrations, no invariant changes.

- **2026-07-11 (deploy EXECUTED + first live MTProto fetch VERIFIED — supersedes the "DEPLOY PENDING"
  header of the entry above)** Merged `codex/ru-ua-mtproto-priority` → main (`646b5a4`) and deployed
  to prod (`dpl_w231oedey89E3S8A3b7vAB7HFNzk`, READY, aliased `bnow-net.vercel.app`; prod had been on
  the pre-`609c34b` build `6a486a1`, so this also shipped the intervening docs commit). Verified by
  evidence: two manual `ingest?which=mtproto` runs on the new build returned
  `channelsPicked=40 / resolves=12` (vs `25 / 8` on the runs minutes earlier on the old build) —
  proving the plain env vars `TG_MTPROTO_CHANNELS_PER_RUN=40` + `TG_MTPROTO_RESOLVES_PER_RUN=12` are
  read live — with `fetched=1999` then `1285`, `errors=0`, `skippedExisting=915/1379`
  (cross-transport dedupe firing). **This is also the FIRST PROVEN LIVE MTProto FETCH** (session +
  egress both work end-to-end; ~3.8K docs, all-time mtproto footprint ru:1580/ua:945/ir:647 where the
  647 ir are ONLY the 3 curated OSINT aggregators, zero registry Iran-Update channels — the ROCA-only
  filter working as designed). The 27 ua pins route correctly: 4 already ingesting
  (robert_magyar 249 / sjtf_odes 164 / joint_forces_task_force 130 / synegubov 27 docs, all tagged
  ua), the other 23 rolling in over the next few `:35` crons (resolve budget 12/run, `resolveBudgetSkips=28`).
  Backfill script re-verified in estimate mode with the RU/UA flags (133 ru/ua channels, ~$3.07 map
  cost < $6 budget); a live `--apply` backfill still runs only from a box with the session + Telegram
  egress (not this WSL2 dev box) or via the accumulating `:35` crons. Workstream
  `.workstream/codex-ru-ua-mtproto-priority` closed out.

- **2026-07-12 (MERGE 1: ASK Tier-2+ → main, migrations 0014+0015 on prod, v2 LIVE)** Attended
  gated session; full account in `docs/reviews/MERGE1-ASK-DEPLOY-NOTE-2026-07-12.md`. Branch
  `20260711-ask-tier2plus` merged `--no-ff` (`58ac262`, fork point `c49b79f`, 12 commits, zero
  conflicts), pushed with the eslint fix `f74896c` (`.workstream/**` ignore — the design
  worktree's `.next` was breaking main-checkout lint), deployed `bnow-j5lob1iu2` READY, project
  domain serving. Migrations 0014 (claim_embeddings + HNSW + GIN FTS) + 0015 (18 ask_usage
  columns) applied to prod and verified additive-only; trigger 9999 untouched; embedding
  backfill 776/776 claims @ $0.0003. Cap envs set non-Sensitive in Production AND Preview
  BEFORE the deploy and read back: `ASK_USD_CAP_DAILY=2`, `EMBED_USD_CAP_DAILY=1`,
  `ASK_GLOBAL_DAILY_BUDGET_USD=10`, `ASK_USER_DAILY_LIMIT=100`. Answer model stays gpt-5
  (operator R2); `ASK_PIPELINE` deliberately unset — v2 is code default, `legacy` is the
  instant rollback. Smoke GREEN: 9 paid v2 answers, per-stage costs sum exactly to cost_usd
  on every row, models recorded, temporal window echo parsed+rendered (07-05→07-12), negative
  control declined honestly (operator-confirmed), unauth /api/ask 307s to /signin. **Process
  incident, ratified:** the Phase-3 "dry-run" applied 0014+0015 to PROD instead of the Neon
  branch — `scripts/migrate.ts` resolves `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, and the
  branch override set only `DATABASE_URL` while `.env.local`'s UNPOOLED var (loaded by the
  script's own dotenv) silently won. Outcome was byte-identical to the gated plan (verified:
  additive DDL only, zero data impact, snapshot branch pre-dated the write); operator ratified
  as G2-done. **Standing trap: any branch-targeted migrate/scripts run MUST override BOTH
  `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.** New finding → OPEN-TASKS #48: /ask form has no
  pending-disable, so slow answers get double-submitted and double-billed (observed 2-3× on
  smoke questions; caps contain it). MERGE 2 handoff: Neon snapshot `premerge-20260712`
  (`br-solitary-frost-at6wlzi1`) is KEPT until MERGE 2 completes; prod migration head = 0015
  (snapshot id `af3e3af0-7331-4af8-9c45-40be65726334`) — the design branch's regenerated 0016
  must chain prevId to exactly that id, journal idx 16; do NOT run `drizzle-kit generate` for
  anything before MERGE 2 completes. Adversarial drizzle review (independent, read-only):
  no blockers; noted migrate.ts applies statements non-transactionally without IF NOT EXISTS —
  keep `DROP TABLE IF EXISTS claim_embeddings; DROP INDEX IF EXISTS claims_text_fts_idx;`
  handy if a future 0014-class apply dies mid-file. Session OpenAI spend $0.121 of the $1.50
  session cap (backfill $0.0003 + smoke $0.121). Branch backups: tag `pre-merge-ask-20260712`
  + `~/bnow-branches-20260712.bundle` (both local, both branches).

- **2026-07-12 (MERGE 2: design/site-structure → main, migration 0016 on prod, role
  grants, DEPLOYED)** Unattended session; full account in
  `docs/reviews/MERGE2-DESIGN-DEPLOY-NOTE-2026-07-12.md`. Branch
  `20260711-design-commercial-site` merged `--no-ff` (`dc51cbd`, fork point `c49b79f`);
  exactly two conflicts, both in the pre-authorized register set (journal + 0014
  snapshot → main's ASK side; design's `0014_square_silver_centurion.sql` deleted).
  Role migration **regenerated as `0016_charming_veda`** (`3e42d65`): journal idx 16,
  snapshot prevId `af3e3af0-…` (0015's id), SQL byte-identical to design's original —
  one additive ALTER; double-generate clean; Opus adversarial review PASS (zero
  blockers, security posture confirmed: fail-closed roles, server-side sort ignore,
  /middle-east SQL splice, signals currentUserEmail boundary, ASK surface untouched).
  Dry-run on the Neon snapshot branch applied exactly 0016 — **BOTH `DATABASE_URL` and
  `DATABASE_URL_UNPOOLED` overridden and verified through the real `scripts/env` loader
  before running (the MERGE 1 trap did not recur)** — then prod migrate: head = 0016,
  `users.role` live, 3 rows default 'user', count unchanged. **R4 grants executed:**
  gregoryoconnor@gmail.com + jason@americanpoliticalservices.com → analyst;
  go@vociferous.nyc → admin (defensive); go@vociferous.ai → admin (row CREATED, id
  `63ec7e25-…` — did not exist; awaiting operator confirmation of the .ai/.nyc pair).
  ADMIN_EMAILS: Production only (Sensitive/unreadable), absent Preview/Dev — proceeded
  per register step 3 (fail-closed). Gate 902 tests/67 files green; deployed
  `bnow-nqegy57dk`, 22/22 signed-out checks green after one adaptation: the check list
  expected 200 from `/registry`+`/middle-east`, but those routes have been layout-gated
  (`requireUser()`, commit `7e1f2c5`) since before the design branch — 307→/signin is
  pre-existing behavior, so no A3 rollback; instead the 307 flight-data bodies were
  audited (anon → reduced view, zero score values) and the server-side
  `?sort=reliability` ignore proven live. D5 weekly materializer cron stays PARKED.
  Neon snapshot branch `premerge-20260712` DELETED (green path); tags + bundle kept.
  $0.00 OpenAI. MERGE 1's "no drizzle-kit generate before MERGE 2" freeze is lifted.

- **2026-07-12 (ASK polish sprint, unattended — FULL SHIP, deployed)** Five live-smoke
  findings fixed on branch `20260712-ask-polish` (tag `pre-ask-polish-20260712`), merged
  `0fe0bc6`, deployed **`bnow-qdesocr6p`** (rollback target recorded pre-deploy:
  `bnow-nqegy57dk`); full account `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`.
  **W0 diagnosis refined the ticket:** the day-of smoke questions' windows were genuinely
  empty (first 07-12 claims landed 04:01Z, questions 01:42Z) BUT the "claim IDs" leakage
  came from entities-only evidence — the no-evidence short-circuit required claims AND
  entities empty, so gpt-5 was paid to answer from `CLAIMS: (none)` + entity rows.
  **Architecture ruling (R3 hard rule, absorbed into W2):** GET /ask?q= previously
  EXECUTED the paid pipeline (root cause of #48 double-billing + refresh/back-nav/
  shared-link re-billing); execution moved into a useActionState server action (auth
  re-checked inside), GET now only prefills — pinned by a money test AND a live prod-DB
  probe (GET wrote no ask_usage row). Tradeoff accepted: answers are not URL-addressable.
  **W1 gated per R1 on a disposable Neon branch** (both DATABASE_URL vars overridden +
  asserted; first attempt correctly failed closed on unset LLM_SPRINT_USD_CAP): honesty
  5/5, known-answer citations 5/5, first run, no metric edits (R2 clean). Legacy SYSTEM
  byte-preserved under a frozen-fixture test; new knobs `ASK_NO_COVERAGE_SHORTCIRCUIT`
  (default on) + `ASK_RELATED_MIN_SCORE` (default 0.5, calibrated: max observed junk
  vectorScore 0.4547 → smallest excluding floor rounded up; null vectorScore excluded, so
  v2-lexical-only mode renders no related block). W4 replay ran on its own disposable
  branch because guard metering WRITES provider_usage — "SELECT-only prod" honored by
  construction. Both branches deleted. OPEN-TASKS #48 closed (idempotency window stays
  parked); 3 uk strings appended to the native-review inventory. Tests 902→956 (74
  files). OpenAI spend $0.106 of $2. Operator checklist in the note §⑥.

- **2026-07-12 (analyst home & Iran prominence sprint, unattended — FULL SHIP, deployed)**
  Plan `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md` (installed this session; the executing
  prompt's full decision register never reached the repo — reversible defaults taken and
  ledgered in the readback, `docs/reviews/ANALYST-HOME-READBACK-2026-07-12.md`). All seven
  workstreams shipped; branch `20260712-analyst-home-iran` (tag
  `pre-analyst-home-20260712`) merged `4482669`, deployed **`bnow-jihmibgm6`** (rollback
  target recorded pre-deploy: `bnow-qdesocr6p`); morning note
  `docs/reviews/ANALYST-HOME-NOTE-2026-07-12.md`. **Iran quality gate PASSED on evidence**
  (daily 3-track ir digests, claim parity with ru/ua, validation 07-11 ir 100% vs ru 57.1 —
  the 07-10 "IR parity 57.5" concern is stale), so public Iran prominence shipped; no
  Iran-quality emergency follow-up warranted. Ship list: signed-in quick-links rail +
  quick-strip upgrades + recent-asks; additive signed-out Iran/Gulf card; digest archive
  `/digests/[country]` + prev/next nav (closes the "yesterday's digest unreachable" gap) +
  scoreboard→digest cross-link; feedback mailtos (new plain env `FEEDBACK_EMAIL` =
  go@vociferous.nyc in prod+preview+dev, verified by round-trip; affordances hidden when
  unset); **/search free claim search** — ASK v2's lexical arm extracted MECHANICALLY to
  `src/lib/ask/lexical.ts` (all 252 pre-existing ask tests green with zero edits; module
  carries a never-guard/never-provider/never-write invariant comment), $0 proven live
  against prod (5 queries: ask_usage 28→28, provider_usage 343→343) and pinned by
  throw-if-touched tests. **Deliberate contrast ruling: GET /search?q= EXECUTES ($0
  deterministic SQL) while GET /ask?q= only prefills (paid) — documented in the page
  source; do not "unify" them.** Tests 956→996 (79 files); typecheck/lint/`next build`
  green; prod smoke green signed-out (Iran card live, marketing sections byte-intact,
  /digests/ru + /search 307-gated). Deep links verified sound: claim_date==digest_date for
  all 846 claims (latent coupling → OPEN-TASKS #54; /search nav entry deferred → #55).
  31 uk strings appended to the native-review inventory. LLM spend $0.00.

- **2026-07-12 (analyst-trust sprint, unattended — FULL SHIP, deployed)** Prompt
  `docs/prompts/2026-07-12-analyst-trust.md`; branch `20260712-analyst-trust` (tag
  `pre-analyst-trust-20260712`) merged `2feb128`, deployed **`bnow-kw2t3dndf`**
  (rollback target recorded pre-deploy: `bnow-jihmibgm6`); morning note
  `docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md`. **W0 root cause of the operator's
  "not yet generated beside 14 claims" screenshot: the home digest query's
  `row_number() AS rn` comes back from the Neon driver as a STRING and the fold's
  `=== 1` never matched** — latestDate folded null on every theater since the
  analyst-home ship; unit tests passed because mocks used JS-number rn (now
  driver-realistic + regression-pinned). Shipped: W1 time model (src/lib/time/*,
  docs/TIME-MODEL.md, cadence-aware status naming bucket+stage, claims count keyed
  to the displayed bucket = R2 contradiction structurally impossible, ET-day params
  replace SQL current_date); W2 signed-in home reorder per R3 (compact headline, no
  hero/CTAs, whole-card stretched links, tiles last) + R7 (magic-link lands on `/`,
  was /account); W3 scoreboard explainer + per-metric how-to-read (definitions
  verified against scoring code); W4 **at-publish dual coverage** — evidence-in-hand
  (min fetched_at, NOT the source's publish claim) vs ISW's stored datePublished,
  same denominator as coverage_pct, persisted scoring-time to details.atPublish
  (jsonb, zero migration), deterministic 7-day backfill branch-rehearsed then prod
  (15/18 decorated, 3 honest skips where digests regenerated post-scoring; NO
  headline number changed; ir 07-11 = final 100% vs at-publish 0% — real), full
  cutoff/snapshot design PARKED in docs/designs/ISW-CUTOFF-SCORING.md per R6(d);
  W5 registry ADMIN-ONLY (requireAdminOr404 → 404 for analyst/user/anon, links
  removed everywhere, source mailto → digest footer; ADMIN_EMAILS now readable-plain
  in all three Vercel envs + .env.local = go@vociferous.nyc). **Vercel CLI trap
  resolved: this team's policy stores Production/Preview env adds as Sensitive
  (write-only) by default — `vercel env add NAME <env> --no-sensitive --value` is
  the readable form** (explains every Sensitive-var episode since 07-09). Tests
  996→1053 (84 files); spend $0.00 of $5. New OPEN-TASKS #56 (R8 platform-source
  segmentation) + #57 (/pricing promises registry access the product no longer
  grants — operator decision). 18 uk strings appended to the native-review
  inventory. `data/embed-backfill-checkpoint.json` untracked + data/*.json ignored
  (was swept into the merge by git add -A, then removed).

- **2026-07-12 (IA-refinement sprint, unattended — FULL SHIP, deployed)** Prompt: information-
  architecture refinement (four residual problems a live review found). Branch
  `20260712-ia-refinement` (tag `pre-ia-refinement-20260712`) merged `--no-ff` to main and
  deployed **`bnow-iqaszhc0d`** (`dpl_85zESfEja8Zt992u3o4c1DqHaa5C`, READY, **aliased
  https://bnow.net** — the custom domain is now the production alias; rollback target recorded
  pre-deploy: `bnow-kw2t3dndf`). Review gate: `docs/reviews/IA-REFINEMENT-REVIEW.md`.
  **Shipped: (1) Nav** — retired the Product dropdown (its three children duplicated
  destinations reachable elsewhere), promoted **Signals** + **Ask** to top-level links, dropped
  the Solutions>political_risk duplicate of /signals → **every route now has exactly one nav
  path** (`/countries` was the target of five, `/signals` of two). `src/lib/nav/site-nav.ts`
  SECTION_IDS = coverage/signals/ask/solutions/validation/pricing. **(2) Per-country pages** —
  new public, indexable `/countries/[iso2]` (one dynamic route, all non-deferred theaters,
  localized `generateMetadata`, public-safe aggregates only); Coverage dropdown + the
  `latestDigestHref` fallback point there via `theaterHref()`=`/countries/<iso2>` (was `#`
  anchors); the /countries index cards link onward and keep their `id={iso2}` anchors so old
  `/countries#ru` bookmarks still scroll (fragments can't be server-redirected — documented).
  **3-vs-8 undersell fixed:** signed-out `home.live` is now `"Live now: {n} theaters — daily
  depth in Russia, Ukraine and Iran"` with `{n}` from `count(*) countries WHERE
  status='active'` (=8), rendered only when >0 (truth-in-UI on DB failure). **(3) /signals
  gating** — `toPublicSignal()` (`src/lib/analyst/signals.ts`) projects a signal to its safe
  teaser (severity/theater/kind/headline-count/evidence-count) and drops `detail` (named
  individuals, dollar figures, target/flow lists), `evidenceClaimIds`, `evidenceRefs`; the
  page renders `detail`+evidence ONLY inside the `signedIn` branch, so the specifics never
  enter the anonymous server-rendered HTML (data-layer withholding, not CSS/DOM — no
  `/api/signals`, `computeSignals` server-only, `ClaimSources` server+signed-in-only).
  **(4) Crawl policy** — `src/app/robots.ts` (disallow gated/admin/API, allow teasers) +
  `sitemap.ts` (public surface + active theaters, DB-driven, degrades) + `siteBaseUrl()`
  (`src/lib/site-url.ts`, NEXT_PUBLIC_SITE_URL → VERCEL_PROJECT_PRODUCTION_URL → bnow.net).
  **Independent read-only architecture review PASSED all 7 checks** (gating real-not-cosmetic
  the highest, verified no leak path; no dead links/collisions; render modes preserved; i18n/
  a11y/SEO complete) with one low CONCERN (the "0 theaters" DB-failure copy) fixed in the same
  sprint. **Post-deploy prod smoke GREEN incl. the security-critical one: anon `curl
  https://bnow.net/signals` shows the teaser but ZERO occurrences of `Targets incl.`/`factional
  purge`/`Suppressed:` — names genuinely withheld in production**; home nav = the new bar with
  no Product; `/countries/ru` 200; robots.txt/sitemap.xml correct (8 active theaters, no gated
  leaks); public routes 200, gated 307, admin 404 — all unchanged. No migrations, no new env
  vars, no paid-provider calls (ruling 4 N/A), no invariant changes (ruling 15 corrected in
  place: theater pages now exist). Tests 1053→1075 (87 files); typecheck/lint/`next build`
  clean; LLM spend $0.00. New OPEN-TASKS #58 (legal review of named individuals on the signed-in
  /signals view), #59 (native review of the new i18n strings), #60 (dead nav i18n keys cleanup).
  Standing ruling 15 + the Surface/directory sections corrected in place.

- **2026-07-12 (legal acceptance sprint — versioned Privacy/Terms + first-login clickwrap +
  server-side enforcement, FULL SHIP, NOT deployed)** Added public `/privacy` + `/terms`
  (Privacy Notice v1.0 + Terms of Use v1.0, effective 2026-07-12, copy supplied verbatim; shared
  `src/components/legal-document.tsx`, DB-free, indexable + in sitemap), a global `SiteFooter`
  (Privacy · Terms · Status · Contact) in the root layout that replaced the home-only footer
  (removed to avoid a duplicate on `/`; hidden on `/admin`), a pre-auth 18+ disclosure on
  `/signin`, and a first-login acceptance screen `/welcome/legal`. **Central version config**
  `src/lib/legal/policies.ts` (bump `CURRENT_TERMS_VERSION`/`CURRENT_PRIVACY_VERSION` + the copy →
  users lacking the new pair re-accept); operator identity kept there (Vociferous.ai / New York /
  go@vociferous.nyc) so the future Delaware entity is a one-line change — no invented LLC.
  **Append-only record** `policy_acceptances` (migration **0017_flashy_photon**, forward of 0016,
  9999 still last; FK→users cascade, unique (user_id, terms_version, privacy_version); columns:
  user_id, terms/privacy version, DB-`DEFAULT now()` accepted_at, adult_attested,
  privacy_acknowledged, acceptance_method=`first_login_clickwrap`, nullable locale — and
  deliberately NO IP / user-agent / birth-date / token). The insert is idempotent (ON CONFLICT DO
  NOTHING) and reads back the DB timestamp; the server action re-validates BOTH checkboxes and the
  session (a forged/incomplete POST is rejected); `safeInternalPath` collapses any external/open-
  redirect `next` to `/`; acceptance is DB-derived, never a session flag, so it can't be marked
  before the insert lands. **Enforcement:** new `requireAcceptedUser()` (auth + current acceptance,
  fail-closed) wired into the ask/search/entities/digests **layouts** and — independently — the ask
  **server action** + **`/api/ask`** route; the signed-in **home** redirects before any subscriber
  query or recent-Ask render; **/signals** gates its `detail`/evidence on acceptance (anonymous +
  signed-in-unaccepted both see only the safe teaser); **/account** shows accepted versions +
  server timestamp (no id/method leaked) and redirects if unaccepted; `requireAdminOr404` redirects
  a confirmed admin who hasn't accepted while non-admins keep the 404 (registry gate unweakened).
  Magic-link `redirectTo` moved `/` → `/welcome/legal?next=/`; requesting a link is NOT the
  persisted acceptance (only the authenticated clickwrap is). **Truth-in-UI / factual constraints
  honored:** Privacy Notice states plainly that Ask questions are STORED (email + usage metadata,
  sent to OpenAI), never anonymous/ephemeral; no certifications, deletion-schedule, security or
  compliance guarantees; Stripe described conditionally; no analytics/cookie-consent added; no
  question storage changed and no retention job added. **Dev/demo parity:** with FEATURE_AUTH_GATE
  off, anonymous visitors are unaffected and no acceptance is manufactured for them, but a REAL
  authenticated user is still held to acceptance (identity-scoped, not gate-scoped). **Verified:**
  typecheck + lint clean; `next build` clean (all new routes compile); **1143 unit tests / 97 files**
  green (was 1053/84 — +57 legal + updated ask/home/signals/signin/gate/seo mocks); **integration
  suite green on a disposable Neon branch incl. 5 NEW real-Postgres tests** that apply 0017 and
  prove DB-generated timestamp, idempotency, append-only version bump, the unique constraint, and
  FK cascade. No new env vars, no paid-provider calls (ruling 4 N/A), invariants 1–5 untouched
  (migration additive; trigger 9999 unchanged; `migrations.test.ts` + new
  `policy-acceptances.migration.test.ts` both green). **NOT deployed** (per prompt); operator applies
  0017 via the gated migrate flow (override BOTH `DATABASE_URL` + `DATABASE_URL_UNPOOLED` for any
  branch-targeted run — the MERGE 1 trap) before/with the deploy. Note:
  `docs/reviews/LEGAL-ACCEPTANCE-NOTE-2026-07-12.md`.

- **2026-07-13 (legal acceptance — adversarial review + migration applied + deploy EXECUTED;
  supersedes the "NOT deployed" header of the entry above)** Branch `20260712-legal-acceptance`
  merged `--no-ff` to main (`7da22db`) and pushed (pre-push gate green). Order followed
  migrate-before-deploy (additive/expand migration: the new code reads `policy_acceptances` every
  gated request, so deploy-first would fail-closed-lock-out every subscriber). **Independent
  read-only adversarial review** (a second agent, full route/gate topology) returned **no
  blocker/major**; its minor findings were applied on a second commit (`e62c14e`): `requireAdmin`
  (the /admin console) now also holds a confirmed admin to acceptance (consistency with
  requireAdminOr404); `/ask` page uses `requireAcceptedUser` (was requireUser) so no gated render
  drops to auth-only; `recordAcceptance` refuses a non-attesting row (`invalid_attestation`,
  defense-in-depth). **Migration**: verified the target = prod (`ep-jolly-glitter…`, head 0016),
  then `npm run db:migrate` applied ONLY 0017; post-verified the table (9 cols, `accepted_at`
  DEFAULT now(), unique `policy_acceptances_user_versions_uq`, FK delrule=c, 0 rows,
  `_migrations` has 0017). **Deploy** `dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh` READY, aliased bnow.net
  (rollback = `bnow-iqaszhc0d`). **Anon prod smoke green**: /privacy + /terms 200 (v1.0, effective
  July 12 2026, "questions stored", no false-anonymity), global footer live, /signin 18+ notice,
  robots disallows /welcome/ + allows /privacy//terms, sitemap lists both, gated
  ask/account/search/digests/entities + /welcome/legal all 307→/signin, /pricing//scoreboard 200,
  /signals 200 with 0 leak markers, /admin 404. Tests 1147/97, typecheck/lint/`next build` clean.
  No new env vars; invariants 1–5 untouched. (WSL2 note: bnow.net isn't DNS-pinned so local curl
  intermittently 000'd; the DNS-pinned `bnow-net.vercel.app` project domain is the reliable
  local check.)

- **2026-07-13 (provider caps raised + production restart)** Operator confirmed the
  OpenSanctions account dashboard has exactly 300 `/match/default` requests in its 90-day view
  (200 on 07-07, 91 on 07-08, 9 on 07-09) against a 2,000-request/month allowance. Cap vars were
  made explicit in **all three Vercel environments** before deploy: OpenSanctions
  `OPENSANCTIONS_CALL_CAP=2000`, daily calls 200, run calls 120, daily estimated-USD ledger 40;
  X `X_SPRINT_USD_CAP=75`, `X_DAILY_USD_CAP=2.50`. Deploy
  `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV` READY + aliased bnow.net; project-domain `/health` 200.
  Runtime proof: manual `ingest:x` fetched+inserted 1,889 docs, 0 errors in 193s, moving the
  x_api ledger $5.0000→$5.2834; manual **non-refresh** OpenSanctions gap-fill checked 120/120,
  matched 92, sanctioned 22, failed 0, no budget stop, moving live coverage 300→420 and ledger
  300→420. The unsafe `refresh=1` path was deliberately NOT called. Current code still sums the
  OpenSanctions cap across all history and refresh batches repeat the same priority prefix; prompt
  `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` specifies calendar-month accounting +
  a fixed-cutoff resumable rescore. Until that patch ships, the raised 2,000 behaves as an all-time
  cap; ordinary unchecked gap-fill is live, full rescore is held. No application code changed.

- **2026-07-13 (X restart follow-up; standing state corrected)** The first normal scheduled
  `ingest:x` after the 1,889-document restart proof ran at 14:20Z: fetched 222, inserted 42,
  errors 0, and advanced `provider_state.x_api.lastPollAt` to 14:20:09Z. This proves current
  steady-state polling resumed, but does **not** prove the July 9–13 history is complete: the
  restart used the existing five-page batch ceiling, whose loop can end with another cursor and
  still save the new watermark. The historical gap remains an explicit audited-recovery task;
  prompt `docs/prompts/2026-07-13-x-gap-catchup-rescore.md`. Current-state text and #38 were
  corrected in place to distinguish live-now health from historical completeness.

- **2026-07-13 (private-beta readiness sprint — FULL SHIP, deployed)** Prompt:
  `docs/prompts/2026-07-13-private-beta-readiness.md`; branch
  `20260713-private-beta-readiness` (tag `pre-private-beta-20260713`, isolated
  worktree), merged `--no-ff` `86ef6ef`, pushed (pre-push green), **migrations 0018
  (subscribe_intents beta-request columns) + 0019 (trade_flows.partner_name) applied to
  prod BEFORE deploy and post-verified**; `SIGNIN_MODE=open` added readable-plain to all
  three Vercel envs and READ BACK before deploy. Deploy
  **`dpl_6ML79nJiEpNzASBszH6TNvLYaGvf`** READY (rollback target:
  `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV`). Full account:
  `docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md`. Ship list: public offer
  repositioned as a **private analyst beta** (/access request form + honeypot + dedupe +
  operator email + /admin/access review list; /pricing 308→/access; price cards, dollar
  amounts, founding-subscriber copy and src/lib/pricing DELETED; signed-in nav carries no
  commercial entry; invite-gateable sign-in at the deliverMagicLink seam — **prod stays
  `open`; flip is an operator decision**); **publication-safety guard** (new standing
  ruling 19) + scoreboard "BNOW-only reported item" framing; signals purge detector
  reworked (person-only, procedural-text qualifier, canonical counting, no names/"purge"
  in detail — expect the junk-built ir signal to disappear); ask relevance boundary
  (required bounded relevant_count in the rerank schema, insufficient stop before the
  answer model, post-answer denial correction, evaluator now requires zero citations for
  negative honesty); entity ё-fold + Vorobyov alias family (prod dry run 763→578,
  **cleanup plan awaiting operator approval** — ENTITY-CLEANUP-PLAN-2026-07-13.md, apply
  before the OpenSanctions rescore); 390px overflow ROOT-CAUSED in a real browser
  (Chromium floors flex-item <main> at min-content; root-layout block wrapper fixes all
  pages; 17 routes measured scrollWidth==390) + dropdown exclusivity proven under
  trusted input (synthetic-click gap documented, no global state); critical-materials
  partner names (193-code M49 map + partnerDesc persistence + includeDesc=true —
  live-verify on the next monthly pulls), datadark latest-period correctness (matchAll +
  latest date + age-based staleness + anomaly guard; prod cbr-key-rate 17.09.2013/ok row
  self-corrects on the next 09:00Z cron) + UN Comtrade provenance links (S&P/CEPR/KSE
  name-drops removed). Tests 1147/97 → **1279/105**; integration (Neon branch, 3/14) +
  `next build` green. **Anon prod smoke 36/36** (one initial FAIL was framework CSS hex
  matching the #NNN grep — real supplier labels verified named, e.g. Israel 10.4% was
  #376): /access 200 + neutral no-purchase wording, /pricing 308, gated 307, /admin 404,
  home badge + zero founding/pricing copy, signals zero leak markers, trade/materials
  provenance live, sitemap swapped. OPEN-TASKS: #57 closed, #58 advanced, +#61–#65.
  LLM spend $0.00 (no paid eval run — not operator-authorized). Operator items: beta
  wording confirmation, SIGNIN_MODE flip + grandfather set, /access response window,
  entity plan apply, Graham digest-row repair (#62), Postmark sender domain, THEN the X
  historical catch-up (B/E readiness satisfied: B deployed, E code deployed with the
  merge plan pending) and the OpenSanctions rescore LAST.

- **2026-07-13 (post-sprint remediation — seven code-review findings fixed, NOT deployed)**
  Review of the private-beta sprint surfaced seven defects; all seven reproduced by focused
  tests first, then fixed. **(1) Digest mail privacy:** `scripts/email-digest.ts` UNION-selected
  every `subscribe_intents` address — a /access beta REQUEST (or any legacy pricing intent)
  would have received a production digest on the next manual run, and zero recipients fell back
  to mailing `demo@bnow.net`. Recipient policy extracted to
  `src/lib/email/digest-recipients.ts`: users⋈subscriptions with status active/pending ONLY,
  never subscribe_intents (no documented opt-in ever existed — the UNION was one early-demo
  commit), zero eligible → send nothing (`--to=` = explicit operator test override).
  **(2+3) Ruling 19 strengthened (corrected in place):** an R1-dropped allegation now forces the
  event's title/summary rebuild (previously a safe subclaim kept the original prose, allegation
  included); event copy on allegation-bearing events is REBUILT for title AND summary, never
  prefix-patched; new `hasGoverningAttribution` — attribution must PRECEDE the allegation
  content, so the production-shaped Graham title ("died unexpectedly, with reports suggesting…")
  no longer passes as "attributed" (the old fixture's simplified title had not pinned that
  shape; note corrected). **(4) Ask honesty:** the post-answer denial correction replaced only
  metadata — the model's citing tail ([cN] markers + irrelevant claim summaries) stayed VISIBLE
  while the evaluator scored it honest off citedClaimIds=0. Now the answer text itself is
  replaced with the deterministic `insufficientEvidenceCopy` (shared with the relevance
  boundary), and `isNegativeAnswerHonest` rejects surviving citation syntax in the text.
  **(5) Datadark granularity:** `parsePeriodLabel` returns a RANGE aged from its END — a bare
  "2026" no longer maps to Jan 1 (which would have falsely staled cbr-statistics ~2026-04-01
  under 2× its 45-day cadence); impossible dates (31.02) rejected instead of rolling over.
  **(6) Entity durability:** the cleanup plan's "future persists fold at source" claim was
  WRONG — reduce-time folding can't help when evidence carries a single raw variant, and
  `persistDigest` matched entities by exact (kind, name). Persist now resolves by canonical
  identity (kind + `canonicalKey`, per-transaction cache, raw spellings appended to aliases);
  OPEN-TASKS #61 gains a hard sequencing rule: deploy this before applying the cleanup plan.
  **(7) /trade provenance:** `latestTradeFetch` had no flow filter, so the materials job's US
  import rows (flow M, partner 643) could stamp the export page's "last fetched" date; replaced
  by `tradeFetchWindow` sharing ONE cohort SQL fragment with `getDivergence`, rendered as a
  range ("fetched between A and B") when reporters refreshed at different times. Tests
  1279/105 → **1321/107**; typecheck/lint/`next build` green; no deploy, no prod writes, no
  paid calls, no migrations. Docs corrected: ruling 19 (in place), ENTITY-CLEANUP-PLAN §4,
  PRIVATE-BETA-READINESS-NOTE §B/§D annotations, OPEN-TASKS #61. Full account:
  `docs/reviews/REMEDIATION-NOTE-2026-07-13.md`.

- **2026-07-13 (X gap recovery + bounded rescore — IMPLEMENTED and tested, NOT run, NOT
  deployed)** Prompt `docs/prompts/2026-07-13-x-gap-catchup-rescore.md` (sequencing gate met:
  Workstream B deployed, E on main). Zero paid calls / prod mutations / deploys / env changes —
  production contact was read-only SQL only. **(1) Steady-state watermark is now INSERT-GATED
  and truncation-safe:** `XApiAdapter.fetchLatest()` never writes `x_api.lastPollAt`; a globally
  complete pass prepares a pending mark that `runIngest` persists via `commitMarks()` only after
  `insertDocs()` succeeds; junk-200 bodies are parser failures (`isSearchPayload`), and hitting
  the preserved 5-page ceiling with a live cursor is a counted `pageTruncation` that fails the
  pass — the silent-loss mode behind the unproven July 9–13 window is structurally closed. Every
  `ingest:x` run now writes numeric `cron_runs.counts.x_api` (`requests/units/budgetStops/
  pageTruncations/requestFailures/lockSkips/incomplete/docs`) — the raw signal for the still-open
  #38 alert. **(2) Paid X work is single-writer** via `src/lib/usage/x-lease.ts`: an atomic
  `provider_state` lease row `x_api_lease` (never the `x_api` watermark row) with owner/TTL/
  renewal/owner-checked-release/expiry-takeover; a poll finding it held makes zero paid calls
  (`lockSkips=1`). SQL covered by a new Neon-branch itest. **(3) Recovery driver**
  `scripts/x-gap-backfill.ts` (engine `src/lib/adapters/x-gap-backfill.ts`, 14 tests): exact
  since/until window, NO page ceiling, insert-before-checkpoint, resumable deterministic
  checkpoint `provider_state.x_gap_backfill:<key>` keyed to range+roster-hash+batch-size
  (mismatch refuses; complete rerun is a free no-op), SpendGuard + command budget cumulative
  across resumes, plan mode default. **(4) Rescore operator** `scripts/x-gap-rescore.ts` (gates
  `src/lib/analysis/gap-rescore.ts`): read-only default; `--apply` refused without a COMPLETE
  covering checkpoint + `--ack-workstreams-be`; drives DEPLOYED routes serially — map drain
  (`scripts/map-backfill.ts` gained bounded `--to`, importable `driveMapBackfill`), digest regen
  for exactly ru(mil+elite)/ua(mil)/ir(mil+elite+nuclear) with FORCE_REGEN never set (refusals
  reported per rulings 17/19), military-only validation with missing-ISW = pending; snapshots +
  result.md under `data/outbox/` (now actually in .gitignore — the directory map had claimed it).
  Dry runs against prod proved the scripts AND the gap: X docs 07-10/11/12 ≈ 31/18/27 vs ~5.4K
  (07-09) / ~3.7K (07-13). Tests 1321/107 → **1364/111**; typecheck/lint/build green. Standing
  #38/state text deliberately NOT closed/corrected — that waits for the authorized production
  run (cursor exhaustion + map + regen + validation + two healthy polls). Operator handoff:
  `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` — **deploy main first**: the :20 poller
  must be the lease-aware insert-gated build before recovery, and the rescore's `--ack` attests
  the remediation (ruling-19 guard + canonical entity persist) is live.

- **2026-07-14 (X gap recovery EXECUTED — push, deploy, recovery, rescore, steady-state;
  closes the "NOT run" headers of the two entries above)** Operator authorized $50 X / $10 map
  / $10 reduce. Full account: runbook §Execution results + PROGRESS 2026-07-14. **Push+deploy:**
  the four X commits pushed (origin/main `a38a882`), gates green (1364/111 unit, 16/16 itest,
  typecheck/lint/build), deployed `dpl_8DVZK3ac8ja1wi3xW9ALSaPGXJRJ` (rollback
  `dpl_6ML79nJiEpNzASBszH6TNvLYaGvf`), anon smoke green. **Build proof:** scheduled 01:20Z poll
  (cron 977) emitted the new `counts.x_api` shape, all failure counters 0, watermark advanced,
  lease acquired+released. **Recovery:** funded balance read via `/oapi/my/info` was $35.32 —
  BELOW the $50 approval, so the command budget was set to $25 (authorization is a ceiling);
  actual spend **$3.9164** for 19/19 batches / 1,335 pages / 26,090 returned / **16,007
  inserted** (10,083 dupes, 0 unattributed); checkpoint complete; live watermark untouched;
  provider balance delta = ledger delta to $0.00003. Gap days 07-10/11/12: 31/18/27 → **4,559 /
  4,134 / 5,587** docs. **Rescore** (map $0.4963 actual of $10; reduce $0.2382 of $10; DNS pin
  required for the vercel.app route calls on this box): 28/30 digests regenerated through the
  deployed guard, 2 thin-regen refusals preserved priors (07-12 ru/elite + 07-12 ir/military,
  ruling 17); validation 15/15 scored, 0 pending — coverage mixed (12 re-scored cells mean
  42.3→33.9, extraction-noise scale) while unsupported/thin-sourced improved broadly (ir 07-11
  0.30→0.07, ru 07-12 0.36→0). **Ruling-19 verified live:** defect rows (event 4008, claims
  4413/4414) gone; regenerated Graham event carries deterministic "Sources claim:" title+summary;
  zero corruption-causation residue; the one surviving pre-guard Graham event (3919, in the
  refused cell) carries no allegation. **Workstream E verified live:** 43 rescore-created
  entities, 0 canonicalKey collisions with existing rows. **Steady-state + structural finding:**
  recovery spend tripped the $2.50 daily cap → polls budget-stopped SAFELY (cron 995: requests=0,
  budgetStops=1, watermark held — the non-lossy pause working). Operator then authorized a
  temporary `X_DAILY_USD_CAP=8` (deploy `dpl_7hLdoTZ6b3jmziNnP3G3pJKhaJxK`); the resumed 09:20Z
  poll exposed a REAL limit: after an ~8h park the fixed 5-page/batch ceiling truncated 6 dense
  batches (`pageTruncations=6`, incomplete, watermark held) and each hourly retry re-bills the
  backlog without converging. Remedy executed: bounded drain `[07-14T00:00Z..09:20Z]`
  (cursor-complete key `stall-drain-0714T00-0714T0920-b`, $0.4438 total across a 502-stopped
  first attempt + a fresh key after a minutes-scale roster-drift refusal — drift is real, resume
  promptly) + **operator watermark advance 1783992003→1784020800** (compare-and-set, lease free,
  justified by the completed drain; the poller's 30-min overlap guarantees continuity). Then two
  consecutive healthy scheduled polls: **cron 1141 (10:20Z, 47 req/399 docs) and 1149 (11:20Z,
  52 req/441 docs), all failure counters 0, watermark committing post-insert.** Cap restored to
  `2.50` readable-plain + redeployed (`dpl_33XREqVT41j9Fo3cbzzHSZjqYGk2`, health 200). Because
  the restored cap re-parks the watermark ~13h (today's ledger $4.73), one preventive drain
  `[07-14T11:00Z..07-15T00:00Z]` + advance to 1784073600 runs at the UTC reset so the 07-15
  polls don't re-stall; its evidence lands as a same-day addendum. New OPEN-TASKS #66 (ceiling
  vs park interaction — needs a reviewed code path, e.g. env-tunable ceiling or bounded
  self-catch-up). X spend this operation $4.66 all-in (of $50); OpenSanctions NOT run (still
  LAST, after entity cleanup #61).

- **2026-07-14 (scoring/quality-gauge audit; documentation only)** Corrected the standing
  scoreboard description and time/cutoff design after a read-only July 13 audit. That ROCA
  declared an **11:45 AM ET** cutoff and published at **7:30 PM ET**; neither 11:30 AM nor
  6:00 PM is safe as a fixed assumption. Current headline validation scores the latest
  finalized last-writer-wins digest against only the report's Key Takeaways, not an immutable
  cutoff/publication snapshot. `details.atPublish` is an evidence-ingest proxy, not proof of
  what an overwritten digest said. July 13 used the same five-item denominator for RU+UA;
  stored result RU 20% / UA 0%, while the combined current-version mapped corpus contained
  the core evidence for all five before cutoff — the dominant loss was final selection.
  Pre-launch rescoring is recorded as alpha process evaluation; recommended launch policy
  (immutable as-published series + separate retrospectives + visible system/outage epochs)
  remains product/design work, not shipped code. Full evidence and handoff boundary:
  `docs/reviews/SCORING-QUALITY-AUDIT-2026-07-14.md`. No code/DB/env/deploy changes.

- **2026-07-14 (validation scope + corpus-value audit; documentation only)** Corrected the
  stale map-stage total in Current state from ~19K to ~33K current-version atomic claims.
  The Russia country-page headline was traced to raw row count, not sources or summaries:
  46,343 live items at ~13:23Z, 32,607 canonical docs model-read, 17,459 docs with retained
  atomic claims, and 310 current final RU claims. Recommended one score per reference-report
  scope (combined RU+UA evidence for ROCA; scope-filtered regional evidence for Iran Update),
  while retaining country attribution. Product conclusion: ISW is a quality gauge; the core
  value is a traceable analyst evidence workbench. Evidence and proposed rulings:
  `docs/reviews/VALIDATION-SCOPE-AND-CORPUS-VALUE-2026-07-14.md`. No code/DB/env/provider/
  deploy changes.

- **2026-07-14 (OpenSanctions readiness recheck; documentation only)** X's implementation and
  historical recovery/rescore gates are complete, so the monthly-accounting/fixed-cutoff coding
  prompt may now be implemented with zero paid production calls. The paid rescore remains blocked
  on operator cleanup #61. Read-only live evidence at 13:20Z: 876 eligible entities, 540 live
  checked, 336 missing/stub-only, 343 matched, 122 sanctioned; refreshed cleanup dry run 876 ->
  683 (80 drops, 113 merges); July ledger 540/2,000 calls including the scheduled 120-call 08:00Z
  gap-fill today. Projected full post-cleanup rescore: 683 calls -> 1,223/2,000 before later cron
  activity; recount remains mandatory. Prompt, #41, #61, and the cleanup note corrected in place.
  No provider calls, DB mutations, env changes, code changes, or deploys.

- **2026-07-14 (OpenSanctions sequencing correction; documentation only)** Corrects the readiness
  entry immediately above: `9821bab` is an interim X closeout, not the operator's terminal gate.
  The active X run still owns a preventive drain + watermark advance at 00:05Z July 15, verification
  of the 00:20/01:20 polls, and its addendum/documentation commit+push. Per the operator's sequential
  ruling, do not start OpenSanctions implementation until those finish and main is clean/pushed.
  The paid rescore remains additionally blocked on cleanup #61 and separate spend authorization.
  Current counts and quota projection in the prior entry remain valid as a 13:20Z snapshot.

- **2026-07-14 (PostHog analytics phase 1 — review, merge, migration 0020, KEYLESS deploy;
  activation operator-blocked)** Branch `codex/posthog-product-analytics` (`ed61d3b`, worktree
  `bnow.net-posthog`, base = the evidence-trail merge `2403083` == then-origin/main) taken through
  the activation sequence of `docs/prompts/2026-07-14-posthog-product-analytics.md`.
  **Reconciliation:** remote branch unchanged; only branch anywhere holding migration slot 0020;
  prod `_migrations` head 0019; 9999 byte-identical, still last. **Independent adversarial
  re-review (read-only, full diff): PROCEED, no P0/P1** — its P2 confirmed deploy-before-migrate
  would strand every user at `/welcome/legal` (acceptance CTE reads `users.analytics_preference`),
  so the order was migrate-then-deploy; P3 notes (cross-device revocation latency, pending-import
  pageview drop, posthog-js option-name verification at activation, stale-tab preference replay,
  one stale comment) recorded in the note for the activation pass. **Gates re-run in the worktree:**
  typecheck, zero-warning lint, 1,455/129 unit, production build, 22/6 disposable-Neon integration
  (branch auto-deleted). **No secrets:** committed `phc_` strings are named test canaries, none
  equal Scenefiend's key; no `phx_` token exists in any authorized env file. **Merged** `--no-ff`
  → main `e5123a9`, pushed (pre-push green; primary checkout needed `npm install` for posthog-js
  1.399.5 first). **Migration 0020 applied to prod** (8 statements) and post-verified: 5 nullable
  `subscribe_intents` attribution columns; `users.analytics_preference` NOT NULL DEFAULT 'unset' +
  timestamptz + exact 3-value CHECK; 4/4 existing users 'unset'; 0 intent rows; head = 0020.
  **Deployed keyless** `dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6` (rollback: `dpl_33XREqVT…`) after
  reading back ZERO `POSTHOG` vars in any Vercel env; this deploy also shipped the evidence-trail
  feature (2403083 — verified: no schema/env/activation needs; first deploy containing it).
  **Prod browser proof (Chromium):** anon 5-page sweep AND a real magic-link signed-in session =
  0 PostHog requests, 0 console errors; the operator account landed on the forced Privacy 1.1
  re-acceptance screen with three UNCHECKED boxes incl. optional analytics; `/`, `/account`,
  `/ask` all bounce to `/welcome/legal` pre-acceptance; NOTHING was accepted (clickwrap is a
  human act) — post-test DB: 4/4 users 'unset', only the historical 1.0 acceptance row. Access
  attribution proven live (utm lowercased, landing_path forced, junk params ignored, no row
  written). Gated 307 / admin 404 / crons green on the new build. The magic link was recovered
  via the Postmark outbound-messages API (server token) because the Gmail MCP plaintext decode
  corrupts 2 chars at `token=` — reusable trap. **The currently deployed build IS the rollback
  state** (key absent, product fully functional). Not claimed done: dedicated project, region,
  key activation, positive Live Events, dashboard — operator sequence in OPEN-TASKS #67; the
  Account-page preference/sign-out controls are live-verifiable only after a human accepts 1.1
  (unit/component-tested meanwhile). X workstream untouched: no X env/code changed; its 00:05Z
  preventive drain + addendum still owns main's next expected commit alongside this one.

- **2026-07-14 (PostHog activation EXECUTED — dedicated project, key, Live Events, dashboard;
  closes the "operator-blocked" tail of the phase-1 entry above; #67 done)** The operator
  provided `.env.local` credentials mid-session (public key + `https://us.i.posthog.com` host —
  the **US region decision** — + a project-scoped personal API key + project id) and broadened
  the key's scopes twice on request (first `project/action/insight/dashboard:write`; a later
  `hog_function:write` ask was answered by decision instead). Verified the project is dedicated:
  **512327 "BNOW.NET"**, created by the operator 18:03Z, its `api_token` == the env key, key ≠
  Scenefiend's. **Privacy posture set via API and read back:** autocapture opt-out, console-log
  off, performance off, **anonymize_ips on** (live events store `$ip=None`); replay/dead-clicks
  already off; **GeoIP transformation kept ON by explicit operator decision** (city/postal-level
  `$geoip_*` derived at ingestion; privacy-notice wording follow-up noted). Membership/billing/
  retention are not readable with a project-scoped key → operator UI items. **Env+deploy:**
  key/host added to Vercel Production ONLY (readable-plain, byte-verified via env pull),
  keyed deploy `dpl_J5CoSceJSYMFirgbCVam4VUekXBW`. **Live verification found one real bug and
  one harness trap.** Bug: `identity.ts` `created_at::text` → `"2026-07-14 19:18:12+00"` fails
  the sanitizer's ISO `T` check, so **$identify was silently dropped** (unit test had mocked an
  ISO string — driver-realism class, same as the 07-12 rn-as-string bug); fixed via `to_char`,
  regression-pinned (1456 tests), commit `9e371dc`, originally deployed as
  `dpl_8xh5zXYfnsCwoFwQTM3resTZ2BSP` and still present in current production. Trap:
  **posthog-js bot-filters headless/webdriver browsers BEFORE
  `before_send`** — headless verification silently proves nothing; SDK-level bisection confirmed
  every config captures under a masked UA and none under the headless UA. **Positive proof
  (test account `go+phtest@vociferous.nyc`, opted in via the real 1.1 clickwrap checkbox, on
  https://bnow.net):** all 12 allowlisted event types captured on the wire AND confirmed
  ingested via HogQL, single distinct_id = internal UUID; total property-key set across every
  payload = exactly the allowlist (+token/distinct_id/environment/site_domain); `$identify`
  minimized (role + ISO signup_at + cohort; SDK referrer/UTM $set_once junk rebuilt away);
  pageviews template-only; **no email/@/query text (drone/missile/kursk absent)/LinkedIn/UTM/
  token/content IDs in any payload**; zero non-capture PostHog endpoints (flags/decide/array
  never contacted). Ask billed exactly once per submit (3 rows / 3 journey runs, ~$0.012 ea).
  **Negative proof:** anonymous keyed build 0 requests; a FULL granted journey on
  `bnow-net.vercel.app` = 0 captures (canonical-host gate live — doubling as the
  deployment-domain re-test); `/privacy` silent mid-session; cross-tab deny stopped both tabs;
  re-grant resumed; nothing captured after sign-out. **Dashboard:** `BNOW Private Beta` id
  1848415 with the nine specified insights (tiles verified, funnel computes) + Action
  `first_value_event` id 289102; alerts deliberately not created. Rollback stays
  config-only and is already proven (the keyless deploy earlier today). Residual operator
  items: billing limit + membership + retention record in the UI; consider re-narrowing the
  API key to read-only; GeoIP privacy-wording pass; accept 1.1 on their own accounts.

- **2026-07-14 (analyst-beta launch remediation — five workstreams IMPLEMENTED on a branch,
  NOT deployed, NOT merged)** Isolated worktree `bnow.net-analyst-beta-remediation`, branch
  `codex/analyst-beta-launch-remediation`, base `b71b39a` (main == origin/main at start). Zero
  paid provider calls; no migrations; no OpenSanctions/entity work. Three code commits
  (`9c7020a` email, `f7f9af9` privacy 1.2, `a873b7f` ask/scoreboard/i18n) + this docs commit.
  Operator decisions taken this session: **GeoIP retain+disclose · retention 7 years · prepare
  Privacy 1.2 (re-acknowledge)**. **WS1** Privacy 1.2 (`CURRENT_PRIVACY_VERSION` 1.1→1.2 +
  effective date 2026-07-15 placeholder) — both false "activation pending" statements removed;
  states analytics active only for opted-in/accepted/signed-in adults, dedicated US project,
  GeoIP-derived coarse city/postal from the connection IP at ingestion (raw IP not stored),
  7-year event retention; exclusions preserved. No migration (constant, not schema); every
  acceptance path already reads the constants so re-acknowledgement propagates; the two legal
  itests are version-agnostic (validated 9/9 on disposable Neon branch `br-restless-dew-at6uk521`,
  created+deleted). **WS2** `DEFAULT_FROM` → `BNOW.NET <no-reply@bnow.net>`; partner-domain
  fallback/comment/test removed — prod uses `POSTMARK_FROM_EMAIL` or fails visibly at Postmark,
  never a silent partner-domain BNOW login; token model untouched. **WS3** Ask working panel
  (role=status, aria-live=polite, honest client-elapsed stage copy, no fake %, question echoed,
  one-submit) replaces the tiny hint; provider/model string removed from the subscriber footer
  (kept in ask_usage/telemetry/server type). **WS4** scoreboard "At ISW publish" →
  "Evidence available at ISW publish (proxy)"; dropped "apples-to-apples" + "gap is what later
  ingestion added"; discloses it does not prove the claim was in the historical digest + RU/UA vs
  the same ROCA denominator; at-publish.ts comment corrected; no scores/matching/methodology
  changed. **WS5** es/he/ko (0% own catalog) hidden from the language picker via `selectorLocales()`
  (still valid/parseable → no 404s; removes the Korean tofu risk); de/fr/pl/ar/ja unchanged.
  Gate: typecheck+lint clean, **1460/129 unit**, build clean, **390px real-browser PASS**
  (privacy/terms/scoreboard + injected Ask panel with a long unbroken question, all
  scrollWidth==390). **NOT deployed/merged** (deploy gated behind the X closeout; standing
  "Current state" sections deliberately left describing live prod — still 1.1, scenefiend sender,
  old scoreboard copy, all languages — until the operator deploys). Full account + operator
  handoff: `docs/reviews/ANALYST-BETA-REMEDIATION-NOTE-2026-07-14.md`. Operator: confirm the 1.2
  effective date + deploy; verify bnow.net in Postmark (DKIM/Return-Path/dedicated token) +
  set `POSTMARK_FROM_EMAIL` + delivery check; flip `SIGNIN_MODE=invite` after the grandfather
  set; authenticated 390px smoke; PostHog billing-limit/membership record still open (#67).

- **2026-07-15 (Postmark bnow.net sender cutover EXECUTED; DMARC DNS follow-up blocked on
  Cloudflare credentials)** The bnow.net domain was already present and authenticated in the
  Postmark account: the active production server token accepted a live send from
  `BNOW.NET <no-reply@bnow.net>`. Gmail raw-MIME proof showed `dkim=pass` for `d=bnow.net`
  selector `20260712183024pm`, `spf=pass` for `pm_bounces@pm-bounces.bnow.net`, and
  `Return-Path: <pm_bounces@pm-bounces.bnow.net>`; public DNS independently confirmed the DKIM
  TXT record and DNS-only Return-Path CNAME → `pm.mtasv.net`. Production `EMAIL_FROM` was
  updated to `BNOW.NET <no-reply@bnow.net>` and deploy `dpl_5KhaPA9AHwNq6htLJ2pAf8NFESNe`
  reached READY and aliased bnow.net. A fresh production magic link delivered with the same
  authentication results; its URL was a direct bnow.net Auth.js callback (no Postmark tracking
  rewrite), and consuming it created the expected signed-in session at
  `/welcome/legal?next=/`. Remaining gap: `_dmarc.bnow.net` returns NXDOMAIN, so Gmail cannot
  report DMARC pass. The local Cloudflare global key and bearer token are both expired; an
  operator must add `TXT _dmarc = v=DMARC1; p=none; adkim=r; aspf=r` (or provide a fresh
  DNS-edit token), then repeat one live magic-link header check.

- **2026-07-15 (Postmark DMARC completion EXECUTED; sender-domain migration fully closed)**
  The operator installed a new bnow.net-scoped Cloudflare account token (active through
  2026-08-14). Pre-mutation DNS was captured to `/tmp`; the existing Postmark DKIM TXT and
  DNS-only `pm-bounces` CNAME were left untouched. Added the sole missing record:
  `TXT _dmarc.bnow.net = v=DMARC1; p=none; adkim=r; aspf=r`; Cloudflare API success and Google
  public-DNS visibility were immediate. A fresh production magic link to `go@vociferous.nyc`
  provided received-message proof in Gmail: From = `BNOW.NET <no-reply@bnow.net>`, bnow.net
  DKIM pass, aligned custom-Return-Path SPF pass, **DMARC pass** (`p=NONE`), Return-Path =
  `pm_bounces@pm-bounces.bnow.net`. The delivered URL remained a direct bnow.net Auth.js
  callback with no Postmark tracking host; consuming it created the expected signed-in session
  at `/welcome/legal?next=/`. No application or Vercel env/deployment change was needed for the
  DNS-only completion.

- **2026-07-15 (pending-setup documentation cleanup; documentation only)** Rebuilt
  `docs/HUMAN-SETUP-TODO.md` as a pending-only queue, removing completed/no-action setup for
  X, Telegram MTProto, bnow.net/Postmark, Gemini, GDELT, and Firecrawl while retaining active
  account, licensing, procurement, legal, payment, analyst-process, and design-partner work.
  Removed resolved Product Brief, OpenAI-credit, Postmark/Resend, X-adapter, Telegram-session,
  and OpenSanctions-key entries from `docs/BLOCKERS.md`; retained the OpenSanctions commercial-
  rights gate and every genuinely active capability blocker. No code, env, provider, DNS, or
  deploy changes.

- **2026-07-15 (analyst-beta remediation post-X rebase; documentation/environment only)**
  Confirmed `main == origin/main == f94d70c` and all three worktrees clean, then rebased
  `codex/analyst-beta-launch-remediation` onto the final X closeout. The sole conflict was
  `docs/PROGRESS.md` at two independent append points; both histories were retained in
  chronological order. Rebased commits: `3361b01` email, `29d89d2` Privacy 1.2,
  `dc23acc` Ask/scoreboard/i18n, `484f546` docs. No application content was edited during
  conflict resolution; no provider calls, environment changes, push, merge, or deployment.
  The pre-rebase green gate must be rerun and the combined diff reviewed. Privacy 1.2's
  `2026-07-15` remains a placeholder until the actual deploy date is known. Deployment stays
  blocked until `bnow.net` Postmark DKIM/custom Return-Path/sender verification is complete.

- **2026-07-15 (analyst-beta remediation MERGED + DEPLOYED; release loose ends reconciled)**
  Postmark/DKIM/SPF/DMARC and the final X closeout satisfied the two release gates. The pending
  setup cleanup was committed and pushed at `11896eb`; the remediation branch was rebased with
  both append-only histories preserved, then merged to `main` at `2bf89ed` and pushed. Fresh
  verification: typecheck + lint clean, 1460/129 unit tests green, optimized local and Vercel
  builds green, and the React review found no hooks/a11y/state/TypeScript defect. The prior scoped
  Neon integration gate remains green (9/9); a fresh full-suite attempt stopped before branch
  creation because the saved `NEON_API_KEY` returns 401, now an explicit operator credential
  task. Production deploy `dpl_EmHs6NneKtPA5RC9i4T3ybYSjLEx` is READY and aliased bnow.net;
  `/health` returned 200/DB OK on build `2bf89ed`, Privacy 1.2 + the corrected scoreboard copy are
  live, the selector exposes only en/uk/de/fr/pl/ar/ja, and the first runtime-error scan was empty.
  No migration or paid provider call occurred. OPEN-TASKS #68 closed; its remaining authenticated
  phone sweep stays separately tracked by #65, and the `SIGNIN_MODE=invite` flip remains an
  operator launch decision. OpenSanctions implementation is now unblocked by X but remains
  unimplemented; entity cleanup #61 and the paid rescore retain their explicit approval gates.

- **2026-07-15 (OpenSanctions monthly quota + resumable rescore — IMPLEMENTED on a branch,
  tested incl. real Postgres, NOT deployed, NOT merged, NO paid calls)** Prompt
  `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md`; branch
  `codex/opensanctions-monthly-rescore` off clean main `651259e` (tag
  `pre-opensanctions-monthly-20260715`). Two defects fixed in code only, zero production writes /
  paid calls / deploys / env changes. **(1) Calendar-month total accounting:** `SpendGuardConfig`
  gains `totalPeriod: "all_time" | "calendar_month"` (default all_time — X and every LLM guard
  stay byte-equivalent); calendar_month loads `totalUsd/totalRequests` only from
  `provider_usage.day >= monthStart` (first UTC day of the month, `monthStartIso`, tz-independent),
  never mutating history, per-day/per-run caps unchanged. `UsageStore.load` gained a
  `totalStartIso` window arg; `pgUsageStore` filters the total sums with a `FILTER (WHERE $3::date
  IS NULL OR day >= $3::date)`; `init(now)` injects the clock for deterministic tests.
  `ReserveResult` gained a machine `code` + `stopCategory()` so a stop is categorized (run/daily/
  monthly/total) without string-matching. Only `opensanctionsGuardFromEnv()` opts into
  calendar_month; `OPENSANCTIONS_CALL_CAP` is now the calendar-month request quota (env name kept
  for deployed-config compat). **(2) Fixed-cutoff resumable rescore:** `refresh=1` now REQUIRES a
  valid ISO `before` cutoff (`parseEnrichParams` → HTTP 400 before any paid loop; a per-invocation
  "now" recreated the repeat-selection bug). Rescore selects live rows whose `checkedAt` is
  strictly older than the fixed cutoff PLUS missing/stub/malformed rows; a CASE orders the
  jsonb→timestamptz cast BEHIND an ISO-prefix regex so a malformed legacy `checkedAt` is treated
  as needs-refresh and never aborts the batch. Each success stamps `checkedAt=now` (after the
  cutoff), so the SAME cutoff advances batch-by-batch. `limit` clamped to the run cap; priority
  ordering preserved; `only=sanctions` skips ownership. **Observability:** `cron_runs.counts.
  sanctions` gains `mode/cutoff/remaining/completed/stopReason` (non-sensitive; no key, header, or
  payload). **Operator tooling:** `scripts/opensanctions-rescore.ts` (dry-run default; serial;
  stops on daily/monthly/config budget, continues past a run-cap stop, never prints CRON_SECRET,
  no daily-cap busy-loop) + `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`. **Tests:** +24 unit
  (1460→1484 / 129→131) covering all 13 required cases pure where possible — guard month
  semantics, UTC boundary, monthly cap at 2000/1999, daily/run precedence, fail-closed, OS-monthly
  vs X-all-time wiring, param 400, builder shape, stub-sanitize — plus a new Neon integration test
  `enrich-rescore.itest.ts` proving the live SQL: normal selects only missing/stub, rescore selects
  stale/missing/malformed and EXCLUDES post-cutoff rows and ADVANCES on re-stamp, malformed cast
  never crashes (integration suite 22/6 → 26/7, run green on a disposable branch this session).
  typecheck/lint/`next build` clean. No migration (the daily `provider_usage` rows already carry
  the month window; trigger 9999 untouched). **Standing gates unchanged:** the paid production
  rescore stays CLOSED behind operator approval of cleanup #61 (applied after the canonical-persist
  fix is live), this branch merged+deployed, and a fresh recount + separate spend authorization.
  OPEN-TASKS #41 advanced, NOT closed (prod verification pending). Full account:
  `docs/reviews/OPENSANCTIONS-MONTHLY-RESCORE-NOTE.md`.

- **2026-07-15 (OpenSanctions rescore — cutoff-safety hardening; second commit on the same
  branch, still NOT deployed / NOT merged / no paid calls)** Review of the first commit found
  the `before` cutoff validation too loose. Fixes on `codex/opensanctions-monthly-rescore`:
  (1) **reject a future cutoff** — `normalizeIsoInstant(raw, nowIso?)` refuses a `before` later
  than the captured `nowIso`; a future cutoff kept freshly-checked rows (checkedAt=now < future
  cutoff) inside the `checkedAt < before` predicate and re-billed them. Accepting only
  `before <= nowIso` guarantees `before <= checkedAt`, so a successful row always leaves the
  predicate. (2) **require an explicit timezone** — the cutoff must carry `Z` or a `±HH:MM`/
  `±HHMM` offset (T separator); a timezone-less string is rejected because `Date.parse` would
  read it in the server's local zone and silently shift it. (3) **one captured instant** — the
  route captures `nowIso` ONCE and uses it for BOTH `parseEnrichParams` validation and the
  `enrichEntities` checkedAt stamp. (4) **boundary enforcement** — `enrichEntities` re-validates
  the cutoff against its `nowIso` and throws before opening any pool/loop, so a direct caller
  cannot bypass route validation. (5) **contract** — a sanctions refresh requires the cutoff; an
  ownership-only refresh (`only=ownership&refresh=1`) has none and needs no `before` (deliberately
  revised + tested; the Companies House ownership examples stay valid). (6) **script** —
  `scripts/opensanctions-rescore.ts` rejects a future/timezone-less `--before` before any call,
  requires a positive-integer `--max-batches`, and enforces `--sleep-ms >= 2000`. Tests +11
  (unit 1484→1495): future→400/throw, timezone-less→400/throw, valid Z + explicit-offset
  accepted, ownership-only refresh accepted without `before`, accepted cutoff `<= nowIso`, and a
  real-Postgres boundary case proving `checkedAt == cutoff` leaves the strict-`<` predicate
  (integration 26/7→27/7, run green on a disposable branch with `TMPDIR=/tmp`).
  typecheck/lint/`next build` clean. Operator docs corrected: SETUP-NEXT-WEEK.md (§7 status +
  smoke #6 + Companies House note), BLOCKERS.md (ownership example note), and the runbook's
  cutoff example (now a captured `now`, not a future date).

- **2026-07-15 (OpenSanctions monthly accounting + fixed-cutoff rescore MERGED + DEPLOYED;
  paid rescore still CLOSED)** Independent review of `e9c6695` found the cutoff blocker fixed and
  no further defect. Fresh gate: typecheck + lint + optimized build, 1495/131 unit tests, and
  27/7 real-Postgres integration tests on a disposable Neon branch (created/deleted) all green;
  the pre-push gate repeated typecheck/lint/unit green. Branch merged to main at `f9aaa9e`, pushed,
  and deployed as `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu` (READY, aliases include bnow.net). Zero-paid
  live proof on that deployment: `/health` 200 with the deployment id; authenticated future and
  timezone-less sanctions cutoffs both returned the new 400 before `withCronRun` / provider work;
  the July ledger remained 660 requests / $72.6000.
  No migration, environment change, entity cleanup, or paid OpenSanctions call. Standing status,
  OPEN-TASKS #41, setup notes, implementation note, and runbook corrected in place. #41 remains
  open: cleanup #61 approval+apply, fresh population/month-quota recount, separate spend approval,
  and the serial rescore-to-zero evidence are still required.

- **2026-07-15 (PostHog billing limit recorded)** The operator confirmed that the PostHog
  billing limit is configured. Corrected the standing integration status and OPEN-TASKS #67 in
  place; the remaining PostHog UI follow-up is project-membership review. No code, environment,
  analytics configuration, or deployment changed in this documentation sync.

- **2026-07-15 (private-beta release/readiness delta)** Reconciled Git, GitHub, Vercel, live
  health, 24-hour cron/data flow, and 390px anonymous production routes after every post-July-13
  workstream. Application release is fully merged/pushed/deployed (`f9aaa9e`,
  `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`); later `main` commits through `78e15b2` are docs-only.
  Corrected stale OPEN-TASKS #47 to closed. New #69 records non-fatal GramJS peer-type error-stream
  noise: MTProto remains operational (24/24 green hourly runs, zero channel errors, 1,259 docs/24h),
  but roughly 80 false error lines/run pollute Vercel telemetry. Full evidence and ordered handoff:
  `docs/reviews/PRIVATE-BETA-READINESS-DELTA-2026-07-15.md`. No application code, environment,
  production data, or deployment changed in this audit.

- **2026-07-15 (readiness-delta CI follow-up)** GitHub CI for `8b433c3` passed both the gate
  and integration jobs. Both jobs carried GitHub's Node 20 action-runtime deprecation annotation
  for `actions/checkout@v4` / `actions/setup-node@v4`, which GitHub currently forces onto Node 24.
  Recorded low-maintenance OPEN-TASKS #70 for a workflow-only major-version upgrade; this is not a
  current CI failure or a Vercel/application Node-runtime issue.

- **2026-07-15 (invite activation + beta disclosure/X rulings)** Operator directed production
  invite-only access, single-use preferred-browser guidance, full source-attributed named-person
  evidence for accepted beta users (anonymous teaser unchanged), and a self-healing X/twitterapi.io
  poller. Before the invite flip, read-only eligibility counts proved 5 existing users, 0 approved
  requests and 1 pending request; existing users/admins/approved requests remain the eligibility
  rule. `SIGNIN_MODE` was updated to `invite`, read back, and activated by production deploy
  `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` from main `426c627` (READY, bnow.net). The deployment scan
  showed only the already-tracked non-fatal GramJS #69 clusters; WSL Chrome rendered `/health`
  DB OK on that exact deployment/build and `/signin` without submitting a form. Application coding remains a
  separate-agent task under repository protocol; the reviewed zero-paid implementation handoff is
  `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md`. It preserves the anonymous Signals
  boundary and requires a material Terms version bump, while X #38/#66 use cursor-complete,
  insert-before-checkpoint, roster-snapshotted recovery under the existing lease/SpendGuard plus
  episode-deduped operator alerts. No paid provider call, DB write, application-code change, or
  magic-link email occurred in this operator/configuration/documentation stage.

- **2026-07-15 (beta invite UX + attributed signals + self-healing X — IMPLEMENTED on a branch,
  NOT deployed, NOT merged, ZERO paid calls)** Prompt
  `docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md`; branch
  `codex/beta-invite-signals-x-reliability` off `origin/main` `794d54e`. Standing "Current state"
  deliberately unchanged — it describes LIVE prod (still Terms 1.0, no attributed names, no X
  self-catch-up) until the operator deploys. Three coordinated workstreams; gate green
  (typecheck + lint clean, **1536/134 unit** — was 1495/131, `next build` clean); no migration.
  **(A, #40)** magic-link email + `/signin?sent=1` now state the link is single-use / 24h and give
  the copy-the-unopened-URL-into-your-preferred-browser instruction; token model, expiry,
  `/welcome/legal` redirect and `trackLinks:"None"`/`trackOpens:false` unchanged; generic sent
  confirmation preserved (no invite oracle). **(B, #58)** `detectPurge` gained `Signal.subjects` —
  one stable representative per distinct qualifying canonical person (shortest raw spelling, tie
  alphabetical, ALL of them, sorted; `subjects.length == uniquePersons.size`); `toPublicSignal`
  drops it and `headline` carries no names, so anonymous/unaccepted `/signals` HTML shows zero names
  and runs no evidence query (page test proves the data-layer boundary). Accepted `/signals` renders
  the names + a prominent attribution/non-endorsement notice (i18n `signals.named_label` +
  `signals.attribution_disclaimer`, en + provisional uk). Terms §9 gained the durable named-person
  rule; `CURRENT_TERMS_VERSION` 1.0→1.1 (effective 2026-07-15) forces re-acceptance via the existing
  constant gate; **Privacy unchanged at 1.2**; `policy_acceptances` untouched (no migration). Every
  person/pressure/canonical safeguard + ruling 19 intact; no "purge" conclusion restored. **(C,
  #38+#66)** `src/lib/adapters/x-auto-catchup.ts`: a parked `x_api.lastPollAt` (older than
  `X_PARK_THRESHOLD_SEC`, default 4h) makes the scheduled `ingest:x` run drain ONE fixed window
  `[oldWatermark, caughtUpTo)` (captured once) via the existing `runGapBackfill` engine (no page
  ceiling, insert-before-checkpoint), snapshotting the roster INTO the checkpoint
  (`GapCheckpoint.roster`, additive `runGapBackfill(..., {storeRoster:true})`) so minutes-scale
  registry drift can't strand it; bounded per run by `X_AUTO_CATCHUP_REQUEST_LIMIT`
  (≤`X_RUN_REQUEST_CAP`) under the shared `x_api` SpendGuard + the X lease (catch-up and steady poll
  are mutually exclusive per invocation); the live watermark advances to the fixed boundary only on
  completion via a compare-and-set (`XWatermarkDriver`) that never moves backward, and a
  crash-completed checkpoint finalizes with zero paid calls. `src/lib/adapters/x-health.ts` emails
  `FEEDBACK_EMAIL` (safe fields only — no key/tweet/cursor value/CRON_SECRET) on truncation/failure/
  budget-stop/park/persistent-empty/stuck, once per episode (cooldown) + one recovery notice, and
  records the numeric result in `cron_runs.counts.x_api` even with no recipient / a Postmark failure;
  a valid lease-skip is neutral (no spam); a monitor failure never breaks ingestion. Steady-poll
  watermark discipline byte-preserved (13 prior fetch tests green). 33 new fixture tests, zero
  network/paid. **Known edge (documented, not silent):** a residual tail smaller than the park
  threshold but larger than one steady-poll pass can drain would truncate — the #38 monitor ALERTS
  on it; the operator lowers `X_PARK_THRESHOLD_SEC` or runs the manual gap-backfill. **Nothing
  closed:** #40/#58 close after the copy/names are live in prod; #38/#66 after a real scheduled
  park→resume→completion + healthy-poll sequence. Full account + rollback:
  `docs/reviews/BETA-INVITE-SIGNALS-X-RELIABILITY-NOTE-2026-07-15.md`. Operator: verify env
  (`SIGNIN_MODE=invite`, `FEEDBACK_EMAIL`, X key/caps; optional recovery knobs), deploy the tested
  main commit, then run the production proofs in the note's Rollout section.

- **2026-07-16 (Terms 1.1 effective-date correction — release approved to proceed)** Correcting the
  entry above (append-only: that entry is left intact): the attributed-signals rollout did NOT occur
  on 2026-07-15, so `TERMS_EFFECTIVE_DATE` / `TERMS_EFFECTIVE_DATE_DISPLAY` are set to **2026-07-16**
  (the actual production rollout date) in `src/lib/legal/policies.ts`; `policies.test.ts` +
  `terms/page.test.tsx` assert the new date, and the stale "Terms remains v1.0" comment in
  policies.ts was corrected to "Terms (v1.1) and Privacy (v1.2) advance independently". Version
  strings unchanged (Terms 1.1, Privacy 1.2); no migration; `policy_acceptances` untouched. Gate
  re-run green after the delta. Per the operator ruling, this delta being pushed and green
  **approves the release to proceed through merge to main + explicit production deployment**; #40/#58
  may close after live proof, #38/#66 stay open until a real scheduled recovery + subsequent healthy
  poll prove production behavior, and no paid catch-up is to be manufactured.

- **2026-07-16 (beta invite / attributed signals / self-healing X — MERGED + DEPLOYED)** After the
  operator approved the release (date-correction delta pushed + green), the branch
  `codex/beta-invite-signals-x-reliability` was merged `--no-ff` to main (`35b97bd`), pushed
  (pre-push gate green: typecheck + lint + **1536/134 unit**), and deployed to production
  `dpl_DhMh12dn4fdXCesEhXnpxw546Qkw` (READY, aliased **bnow.net**; rollback target
  `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` / main `426c627`). No migration; no paid provider call; no
  magic-link email sent; env unchanged (all new X recovery knobs have safe defaults, none required).
  **Anonymous / public prod smoke GREEN on the new build** (`data-dpl-id` matches): `/health` 200
  DB OK; `/terms` shows **Version 1.1 / July 16, 2026** + the named-person attribution rule;
  **anonymous `/signals` shows the teaser only — zero names, no attribution notice, no legacy leak
  markers, with real prod data** (the security-critical boundary holds live); `/signin?sent=1`
  carries the single-use + copy-before-opening preferred-browser copy; robots.txt disallows the
  gated routes and keeps `/signals` crawlable; `/countries/ru` 200, gated `/account` 307; no runtime
  errors in the post-deploy scan (only the tracked GramJS #69 noise excluded). Standing "Current
  state" corrected in place (Legal acceptance → Terms 1.1; Deploy line; Git line). **Residual
  operator-session / scheduled proofs (items stay OPEN):** #40 — the emailed magic-link BODY copy
  (needs one operator-authorized live send; the sent-page copy is proven); #58 — the accepted-user
  Signals names + attribution view and the forced re-acceptance flow (need an accepted operator
  session); #38/#66 — a real scheduled park → checkpoint-resume → completion + subsequent healthy
  `ingest:x` poll (observe scheduled runs; do NOT manufacture a paid catch-up). Full account +
  rollback: `docs/reviews/BETA-INVITE-SIGNALS-X-RELIABILITY-NOTE-2026-07-15.md`.

- **2026-07-16 (operator/live proofs — #40 + #58 CLOSED; #38 + #66 correctly remain OPEN)**
  Authorized a production magic-link send to the standing test identity. Postmark message
  `07b145bf-bb55-4d52-b873-67d03f086426` was Sent at 12:07:34Z; Postmark's retained TextBody and
  the received Gmail body both contain the single-use, 24-hour, and copy-before-opening
  preferred-browser guidance. Link tracking is None. Postmark's server-level open-tracking setting
  reports `TrackOpens=true` despite the per-message false request, but the retained raw message is
  text/plain only (no HTML/image part), so no tracking pixel or open event exists. The unmodified
  link authenticated and forced `/welcome/legal`; after one transient root-boundary render that
  recovered on the page's prescribed retry, the form showed required unchecked Terms 1.1 and
  Privacy 1.2 controls plus optional analytics off. Operator authorized acceptance; DB now has the
  append-only 1.1/1.2 row at 12:15:03Z and preference `denied`. Authenticated `/signals` rendered
  one attribution notice, one nonempty qualifying subject list (23 names), and 47 evidence
  expanders; fresh anonymous HTML on the same deployment contained neither name label nor notice;
  the test browser signed out after verification.
  Therefore #40/#58 close. First scheduled X run on the new build, cron 1555 at 12:20:14Z, finished
  green with `mode=1`, `alertEvaluated=1`, `alertKind=0`, 382 docs / 46 requests and zero failure
  counters; `x_api_health` is clean and no auto checkpoint exists. This proves production wiring
  but not an unhealthy alert/recovery or park-resume sequence, so #38/#66 deliberately remain open.

## Decision log archive pass — 2026-07-16 (fourth)

- **2026-07-16 (#43 archive + #70 operator ruling)** Moved the complete prior live decision-log
  cycle verbatim to `docs/DECISIONS.md` and moved the detailed living snapshot to
  `docs/CURRENT-STATE.md`; AGENTS.md returns to its compact persistent-brain role. Scenefiend
  history confirms GitHub Actions was deliberately minimized: hosted E2E exercised the wrong
  backend, required repo-held Neon/Postmark/OpenAI secrets, and consumed constrained Actions
  budget, while operator-local + Vercel gates remained authoritative. Operator ruling for BNOW:
  do **not** upgrade or expand GitHub Actions under #70; leave workflows untouched and close the
  maintenance proposal as declined.

- **2026-07-16 (open-task research + #65 proof)** Read-only audits closed stale #45 (public
  metric already truthfully “thin-sourced”) and #54 (Ask/Search already link by owning digest
  date), and live authenticated 390×844 Chrome proof closed #65 with no overflow; test session
  signed out. #14 now has a time-split calibration design but is gated by #56: t.me/X roots are
  already segmented, while Facebook pools 26,195 citations. #19/#42 remain open because Jul 9–15
  Iran cited evidence is 73.1% X. #69 remains open: 24/24 green and `telegram` current, but no
  local reproducer. #17/#41/#61 remain gated after the dry run exposed 79 cross-kind merges and
  537 zero-claim eligible entities. Documentation/handoffs only; no source, provider, DB, env,
  workflow, or deployment mutation.

- **2026-07-16 (#17 spend subset deployed)** Claim linkage is now a **paid-spend eligibility
  boundary**, not a ranking preference: OpenSanctions may select, count, or bill an entity only when
  it has ≥1 `claim_entities` row. One shared fragment (`CLAIM_LINKED_SQL`) is composed into all four
  selection paths by `selectionPredicate()` — normal/rescore × candidate/remaining — so the batch
  loop and the completion count cannot drift apart; that drift is exactly what would let an unlinked
  row be billed. `EXISTS`, not a join: the candidate query's LEFT JOIN stays a ranking input
  (pressure/mentions), and the `remaining` COUNT would otherwise count once per LINK and overstate
  the population. Deployed `be0ebf1` → `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj` ahead of the 08:00 UTC
  enrich cron; `/health` 200 on the live domain (`data-dpl-id` confirms), authenticated malformed
  cutoff still 400s before the paid loop. Read-only proof against the deployed predicate: 1,012
  eligible / 475 claim-linked / 537 zero-link; normal candidates fall **232 → 46**, so 186 zero-link
  rows the ordinary cron would have spent on are now unbillable. Ledger identical before and after
  (July 780 / $85.8000; July 16 120 / $13.2000) — **zero paid calls**. Tests 1,542 unit / 134 files
  + 31 integration (10 in the rewritten enrich itest: linked/unlinked twins per metadata variant,
  multi-link non-duplication, `remaining` == candidate population, and remaining→0 while unlinked
  eligible rows remain). Scope held: no cleanup, no canonicalization, no migration, no env change,
  no paid rescore. Still open: the #17 match-score/caption requirement, plus #61 and #41.
  Pre-existing and unrelated: `legal-acceptance.itest.ts` asserts terms `1.0` while
  `CURRENT_TERMS_VERSION` is `1.1` (stale since the Terms 1.1 rollout, `fdc2031`) — not touched.

- **2026-07-16 (legal integration gate restored)** Commit `165c2b4` removed the stale Terms 1.0
  assumption from `legal-acceptance.itest.ts`: current acceptance derives from
  `CURRENT_TERMS_VERSION` / `CURRENT_PRIVACY_VERSION`, the synthetic future pair is explicit and
  order-independent, and the cascade test no longer carries its own policy-version literals. The
  disposable-Neon suite is now **32/32 green across 7 files** (all 5 legal + all 10 enrichment),
  alongside 1,542/134 unit tests, typecheck, and lint; branch `br-restless-pine-at9u1qv1` was
  deleted. Test-only change, no deploy, production mutation, cron invocation, or paid call.

- **2026-07-16 (#17 verification wording correction)** The #17 enrichment integration coverage is
  green (10/10), as are 1,542 unit tests, typecheck, lint, and build; however, the repository-wide
  real-Postgres run was **31 passed / 1 failed**, not fully green. The failure is the pre-existing
  `legal-acceptance.itest.ts` Terms 1.0 expectation left stale by the Terms 1.1 rollout. This does
  not change the reviewed spend-boundary implementation or live-deployment proof, but standing
  quality text now records the red gate accurately until a coding agent fixes that separate test.

- **2026-07-16 (analyst-experience work READY)** #17's active spend boundary is deployed and the
  legal-fixture correction restored the full 32/32 integration gate. The presentation-only analyst
  quick wins may start from clean main ahead of #56/#69/#14; #61/#41 remain separate operator
  gates. Implementation is split into low-layout-risk cleanup followed by evidence/print/readability
  interaction work; monthly scoreboard navigation and feedback-env splitting stay out of scope.

- **2026-07-16 (analyst-experience quick wins implemented — presentation only, NOT deployed)**
  Branch `codex/analyst-experience-quick-wins` from `8bbc308`: Pass 1 `9b4c27e` (labels/nav,
  provider + raw-confidence + First-seen removal, digest freshness, scoreboard results-before-
  methodology, /health row removal) and Pass 2 `846e3f0` (print disclosure, source-first
  evidence, targeted contrast/type). Gate: 1,562 unit tests / 135 files, typecheck, lint,
  `next build` green; 32/32 browser checks in light+dark at 1280 and 390×844. No ingestion,
  analysis, scoring, reliability, traceability, publication-safety, schema, data, paid-provider,
  env, workflow or deploy change; zero paid calls; every route href unchanged. Standing rulings
  1–5 untouched; ruling 15's promotion/href policy re-asserted by test. Decisions worth carrying:
  **(a)** analyst surfaces expose no provider/model string and no raw confidence decimal —
  the score is uncalibrated, so High/Medium/Low waits on #14; **(b)** "First seen by BNOW" is
  presentation-dead but `fetched_at`/`firstSeenAt` is RETAINED as sort tie-break, ranking recency
  fallback and validation-timeliness/health input — a missing `published_at` still renders Unknown
  and never borrows it; **(c)** a digest page claims one stage only when every displayed track
  agrees, otherwise per-track — never "Final" because one track finalized — and promises no
  next-final time; **(d)** the scoreboard caveat must stay OUTSIDE the methodology disclosure.
  Details + measured contrast: `docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md`.
  New debt #71–#74. Awaiting operator approval to deploy.

- **2026-07-16 (dev-server hydration is broken on this WSL2 box — verify against a build)**
  `npm run dev` server-renders correctly but React never hydrates: the `_next/webpack-hmr`
  WebSocket handshake fails (`net::ERR_INVALID_HTTP_RESPONSE`) and NO React control responds to
  input, including components no one has touched (the mobile hamburger). Native `<details>`
  keeps working, which masks the failure and can make a broken page look interactive. `next
  build` + `next start` hydrates fine and passed all keyboard checks. **Verify React UI against
  a production build here; a dev-server click test proves nothing.** OPEN-TASKS #74.

- **2026-07-16 (analyst-experience contrast remediation — completes the quick-wins branch;
  still NOT deployed)** Pass 2's claim that all in-scope meaningful text passed 4.5:1 was
  **overstated**: its checker read only `text-gray-*`, so three `text-blue-600` foregrounds
  (signed-out mobile CTA; active locale in the mobile drawer and desktop language menu) went
  unmeasured, and `src/app/scoreboard/[country]/[date]/page.tsx` — inside Workstream F's
  scope — was missed. Fixed in `3015382`: blue-600 is 5.25:1 on white but **3.77:1 on
  `#0a0a0a` / 3.84:1 on the gray-950 drawer**, i.e. dark-mode-only failure; all three now use
  `text-blue-700 dark:text-blue-300` (6.83 / 10.92), matching the evidence links. The detail
  page's breadcrumb, metric summary, match-score row and ISW-keyword sentence move to
  `text-gray-600 dark:text-gray-400`, the sentence promoted to 14px (it is the reader's
  evidence for the verdict, not a chip). A palette-derived checker across every in-scope
  surface now reports **0 failing gray or blue pairs**, with light+dark classes pinned by
  test at all four sites. Archived decisions (a)–(d) and every scope boundary are unchanged;
  zero paid calls, no route href moved. Gate: 1,566 unit tests / 135 files, typecheck, lint,
  `next build`, 56/56 browser checks (32 regression + 24 remediation). Lesson: a contrast
  sweep scoped to one colour family silently certifies the families it never read.
  Detail: `docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md`.

- **2026-07-16 (analyst-experience quick wins deployed)** Branch
  `codex/analyst-experience-quick-wins` was pushed, fast-forward merged, and production deployed
  from main `87f9c12` as `dpl_CdoLhjeyxab4mvZXzN9Vjq8U7pNC` (READY, aliased bnow.net). The local
  pre-push gate passed 1,566/1,566 tests, typecheck and lint; Vercel's build passed. Live proof on
  the project domain: `/health`, `/scoreboard`, and `/scoreboard/ir/2026-07-15` returned 200 from
  the new deployment; the authenticated Iran 2026-07-15 digest passed light+dark at 1280×900 and
  390×844 with no console/page errors or page overflow, correct freshness, working print/evidence
  disclosures, and no provider, Confidence, or First-seen text. Zero paid analysis/provider calls;
  no GitHub Actions change. #73 is the next isolated presentation follow-up.

- **2026-07-16 (#73 signed-out landing contrast deployed and closed)** Branch
  `codex/73-signed-out-landing-contrast` was pushed and fast-forward merged; main `df79411`
  deployed as `dpl_7useRyXz71PVkyFgYqZTXKJXf8mv` (READY, aliased bnow.net). Gate: 1,576/1,576
  tests, typecheck, lint and Vercel build green. Live `/` proof in real Chrome passed 1280×900,
  390×844 and 320×844 in light+dark: all eight corrected foregrounds measured 7.56:1 light /
  7.61:1 dark, the deployment stamp and nine hrefs matched, signed-out/no-Ask gating held, mobile
  menu hydrated, and there were zero console/page errors or horizontal overflow. The first harness
  aggregate false was test ordering only (it sought mobile Sign in before opening the drawer); the
  corrected full six-pass rerun was green. Zero paid calls; no GitHub Actions change. #73 closed.

- **2026-07-16 (one-click home Ask handoff; #48 re-affirmed, not weakened)** The signed-in home Ask box
  cost two clicks: it GET-posted to `/ask?q=…`, which by #48's design only prefills. It now hands off
  one-shot — question stored under a single-use per-tab `sessionStorage` key `bnow.ask.intent:<uuid>`,
  UUID passed as `?intent=`, consumed ONCE by AskForm on mount, which then calls `requestSubmit()` on
  the existing `useActionState` form. **Ruling: `?intent=` is not a money path and must never become
  one.** Paid execution stays exclusively in `askAction`; ANY GET `/ask` — intent present, replayed,
  shared, prefetched, forged — stays free. Three ordered defences: the entry is consumed BEFORE the
  submit is dispatched, the stored question must equal `?q=` exactly, and sessionStorage never leaves
  the tab (a ref additionally guards StrictMode). The box stays a real `<form action="/ask" method="get">`
  — storage failure, a no-op storage, absent `crypto.randomUUID`, or a <3-char question all fall back to
  plain prefill. Recent-question links stay prefill-only by choice. Verified in real Chrome on a
  disposable Neon branch (forked → seeded → driven → deleted; both DATABASE_URL vars asserted
  off-production before boot; `LLM_DISABLE=1`; zero paid calls, zero prod writes): one click ⇒ `/ask`
  with the working panel already active and **exactly one `ask_usage` row**; refresh, back-nav and
  reopening the URL in a fresh tab ⇒ **zero** extra rows, prefill only; no-JS submit still prefills; no
  console errors. Gate: 1,612/1,612 tests / 137 files, typecheck, lint. Two review findings acted on:
  (a) a traced claim that Next's patched `replaceState`/`HistoryUpdater` re-adds `?intent=` after the
  action did NOT reproduce when measured (Next 16.2.10, settled action) — the strip is cosmetic either
  way, and the comment now records the measurement, not either over-claim; (b) a click whose `/ask`
  never mounts (acceptance gate redirect) orphaned an entry holding the user's question text, so
  `clearAskIntents` prunes the namespace before each handoff. Not yet deployed.

- **2026-07-17 (one-click Ask handoff deployed and production-proven)** Main `f0d34d3` pushed
  (pre-push gate: 1,612/1,612 tests, typecheck, lint) and deployed as
  `dpl_5jAidKc8rnSKmSG1gK5rP4KehwJv` (READY, aliased bnow.net, `/health` stamp `f0d34d3` == local
  HEAD). Rollback target = the prior production `dpl_7useRyXz71PVkyFgYqZTXKJXf8mv` / `df79411`.
  Production proof in real Chrome via the standing test identity (invite gate admitted it; magic
  link recovered through the Postmark outbound API, since mail clients mangle the token): the
  signed-in home renders the Ask box with its zero-JS GET fallback intact; a direct `/ask?q=…` and
  a forged `?intent=` both PREFILL ONLY — no working panel, no execution; no console/page/5xx
  errors; 100/100 sampled runtime log entries were `info`. **Zero paid Ask calls**: `ask_usage` for
  the identity held at 3 (latest 07-14), zero `ask_usage` rows across ALL users in the hour, and no
  `openai_ask` `provider_usage` row exists for 2026-07-17. The one-click path itself was NOT re-run
  in production — the disposable-branch Chrome proof (exactly one `ask_usage` row per click; zero on
  refresh/back/reopen) already covers it and re-running would bill for nothing. Two traps worth
  keeping: `scripts/pin-dns.cjs` does NOT cover `api.postmarkapp.com` (Node fetch times out on the
  WSL2 resolver; curl is unaffected), and Postmark's `ReceivedAt` carries a `-04:00` offset, so a
  freshness filter MUST parse it as an instant, never string-compare it to a UTC ISO string.

- **2026-07-19 (named-person source-fidelity ruling for AI Search/Ask planning)** Operator
  set source/identity fidelity—not naming—as the risk boundary. One official record may support
  its exact action/status; disputed news keeps governing attribution/hedging; OpenSanctions match,
  category, and identity semantics stay distinct. Ruling 20 records this; digest ruling 19 remains.

- **2026-07-19 (unattended phased AI Search/Ask workstream authorized)** The implementation
  handoff continues through safe phases on retained phase branches/worktrees plus an integration
  branch, with detailed implementation and independent-gate reports. Passing work merges only to
  integration, never `main`. Missing external approval becomes `implementation-pass /
  enablement-blocked` with defaults unchanged. No paid calls, production writes, deploys, pushes,
  external/account/provider/cap/analytics changes, or Paddle work; those need later approval.

- **2026-07-21 (AI Search/Ask release hardening on the integration branch)** Operator-directed
  11-area hardening executed on `codex/ai-search-ask-release-hardening-20260721` and merged to
  the integration branch only (report: `docs/reviews/AI-SEARCH-RELEASE-HARDENING-2026-07-21.md`;
  register #72–#82). Standing consequences: SDK auto-retries are disabled in the Ask gateway
  (one reservation per physical dispatch, absolute); `src/lib/ask/features.ts` is the single
  server-side flag authority (progressive⇒enforce⇒retention lattice, fail-closed, cohort
  allowlist); shadow run persistence became explicit opt-in (`ASK_RUNS_SHADOW`, default OFF —
  a deploy alone stores nothing new) and every persistence-backed feature requires operator
  retention envs, enforced by lazy redaction/deletion sweeps; enforce-mode terminals carry an
  explicit durability verdict; sessions are transactional; exact-cache TTL binds at lookup with
  snapshot-verified hits; additive migration 0027 adds ask_runs billing_policy/billing_eligible
  (default false — nothing is invoice-eligible without a future explicit
  `ASK_BILLING_CUTOVER_AT` operator entry); migrations now apply atomically per file. Gates on
  the final tree: unit 2,027/2,027 · itest 72/72 · lint 0/0 · build PASS · 9/9 production-build
  browser scenarios; zero paid calls; production and `main` untouched.

- **2026-07-21 (Privacy 1.3 — Ask retention disclosure precedes persistence)** Operator set
  binding retention values (`ASK_CONTENT_RETENTION_DAYS=30`, `ASK_EVENTS_RETENTION_DAYS=7`,
  `ASK_CACHE_TTL_DAYS=7`) for the production release of the Ask release candidate. Privacy 1.2's
  "no fixed automatic deletion period" statement is incompatible with enabling any
  persistence-backed Ask surface, so the Privacy Notice §9 now discloses the fixed windows
  (question/answer/evidence ≤30 days; stream/progress events ≤7 days; exact-answer cache ≤7
  days; billing/accounting metadata retained separately without extending content retention) and
  `CURRENT_PRIVACY_VERSION` bumps 1.2→1.3 (effective 2026-07-21, the actual release date),
  forcing re-acknowledgement for every existing user through the standard clickwrap. Terms stay
  at 1.1 (no Terms change). The disclosure is truthful against the shipped sweep
  (`src/lib/ask/retention.ts`): it redacts/deletes ALL Ask content surfaces — including legacy
  `ask_usage.question` — keyed on the raw retention envs, surviving full flag rollback.

- **2026-07-21 (AI Search/Ask production release + shadow soak start)** Release commit
  `836b46e` (integration merge `356cba5` atop hardening tip; app code byte-identical to the
  gated tree) deployed to production after full gates (unit 2,028/2,028 · itest 72/72 · lint
  0/0 · build PASS · 6/6 production-build browser smoke on a disposable fork). Production DB:
  backup branch `backup-pre-ask-release-2026-07-21` (`br-small-poetry-atf9x253`) taken first;
  migrations 0021–0027 applied (each marker exactly once, 29 total; re-run idempotent;
  `billing_eligible` DEFAULT false NOT NULL; `claim_must_have_source` trigger intact; data
  intact). Baseline deploy `dpl_GNuFfB2qqX61cRtuMdjpJTT2sLfR` (flags off, retention 30/7/7
  set) verified on bnow.net: /health stamps `836b46e`, Privacy 1.3 live and reacceptance
  enforced (live magic-link pass; analytics stayed denied), signed-out and signed-in free-GET
  contracts hold, /search $0, one paid Ask ($0.0089) produced ZERO ask_runs rows. Then
  `ASK_RUNS_SHADOW=1` + redeploy same commit (`dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT`): one paid
  probe Ask ($0.016) produced EXACTLY one shadow row (finished/answered, result persisted,
  units=1, `ask-units-v1:shadow`, billing_eligible=false, zero reservations/events/cache);
  free GETs and Search persist nothing. `ASK_BILLING_CUTOVER_AT` remains ABSENT. Cohort
  activation is NOT authorized by this entry — it requires a clean 48–72h soak
  (`scripts/ask-shadow-soak-check.ts`) plus an explicit operator decision. Report:
  `docs/reviews/AI-SEARCH-RELEASE-2026-07-21.md`.

- **2026-07-21 (OpenSanctions match-safety repair — fail-closed, branch only)** The matcher's
  `results.find(match) ?? results[0]` fallback persisted REJECTED name-only candidates as
  sanctions assertions (production holds `matched:false, sanctioned:true` rows), and downstream
  consumers ignored `matched`. Repaired on branch `opensanctions-match-safety` (no deploy/push/
  production writes/paid calls): (1) only `match === true` results populate assertive fields;
  rejected candidates fail closed to clean-unmatched with non-assertive nested diagnostics;
  (2) `src/lib/enrich/os-read.ts` is now the ONE read authority — a usable match requires
  not-stub + not-`NK-stub` + `matched === true`; neither `sanctioned:true` nor a topic alone
  ever suffices; stale rows are contained unmutated; (3) OpenSanctions presentation is
  ADMIN-ONLY (gate.ts `currentRole()`, fail-closed) as neutral candidate review — accepted/
  rejected labelled, score labelled identity-match confidence (never risk), topics uncollapsed
  (PEP ≠ sanction), name+type-only + not-human-reviewed qualification, checkedAt shown; no
  public badge/topic/score markup of any kind; (4) Ask receives NO OpenSanctions-derived
  categorical assertion — `sanctioned` projection removed from both retrievals and
  `RetrievedEntity`, `SANCTIONED` marker removed from both evidence blocks, unsupported sample
  question replaced; source-backed sanctions CLAIM text still flows (ruling 20 validator rules
  untouched). Binding until superseded: OpenSanctions data is candidate-identity screening
  metadata; sanctions/PEP assertions stay internal/admin-only pending a human-review workflow +
  product review; restoring any public assertion requires a new decision-log entry. Stale-row
  cleanup/re-match stays with #61 + separate spend approval. Gates: typecheck/lint clean, unit
  2,049/2,049 (161 files), build PASS. Review:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.

- **2026-07-22 (OpenSanctions match-safety — production release + smoke)** The branch-only
  repair above (`441ee09` = `c74aaba` fix + `441ee09` docs, atop the Ask release base
  `addd2be`) was merged to `main` fast-forward-only (linear, no merge commit; src tree
  byte-identical to the reviewed branch) and pushed (`addd2be..441ee09`). Release gates on
  merged main: `git diff --check` clean · typecheck clean · lint clean · unit 2,049/2,049
  (161 files) · build PASS (the 72/72 itest was proven on the reviewed branch's disposable
  Neon fork; not re-run — no tree drift). Deployed to production via CLI
  (`npx vercel deploy --prod`) as `dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`, READY, aliased to
  bnow.net; `/health` stamps `441ee09`, DB OK. NO migration (release touches no `drizzle/`),
  NO env change (all Ask flags preserved: `ASK_RUNS_SHADOW=1`, retention 30/7/7,
  `ASK_BILLING_CUTOVER_AT` absent, every enforce/progressive/stream/cache/sessions/router flag
  absent). Ask shadow-soak window RESTARTED at 2026-07-22T01:10:37Z (Ask retrieval/evidence
  code changed). Smoke (through bnow.net, zero paid calls): signed-out `/entities` + `/ask?q=`
  → 307 `/signin`; **non-admin (accepted test account) sees ZERO OpenSanctions markup** on
  accepted/rejected entities + list — the pre-release non-admin `opensanctions.org/entities/`
  profile-link leak on entity 4 (present on `836b46e`) is GONE on `441ee09`; Ask sample now
  "What sanctions actions were reported recently?" and signed-in `GET /ask?q=` is prefill-only
  (200, zero POSTs); signed-in `/search` deterministic, no OpenSanctions markup, no `/api/ask`;
  runtime logs show only info GETs, no 5xx. Zero paid provider calls (only pre-deploy scheduled
  `openai_map` cron at 00:41Z), zero `ask_runs` from the GET-only smoke, zero DB writes
  (session counts unchanged; all queries read-only), no cron manually invoked. Rollback target =
  the prior Ask release `dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT` / `836b46e` (not needed). **Not live-
  verified:** the admin neutral-panel positive render — the sole admin identity has not accepted
  Privacy 1.3, so its session redirects to `/welcome/legal`; per authorization I did NOT
  manufacture an acceptance. That render is covered by `entities/[id]/page.test.tsx` (rejected
  labelled "rejected…never sanctioned"; accepted shows identity-match-confidence-not-risk,
  uncollapsed topics, datasets, profile link, "Checked … (UTC)", "name and entity type only",
  "not been human-reviewed") — smoke recorded PARTIAL on that one sub-check, not a regression.
  Data-reality note (does NOT edit the append-only branch-only entry above): the current
  production `entities.meta.opensanctions` set holds ZERO `matched:false, sanctioned:true` rows
  and zero rejected rows with promoted topics — 425 clean-rejected, 388 accepted-unsanctioned,
  200 accepted-sanctioned; the fail-closed read model is defensively correct regardless.
  Binding (reaffirmed, now LIVE): OpenSanctions is admin-only candidate-identity screening
  metadata; restoring any public sanctions/PEP assertion requires a human-review workflow +
  stronger identifiers + product review + a NEW decision-log entry; stale-row cleanup/re-match
  and paid rescore stay separately gated (#61 + spend approval). Cohort activation / Ask billing
  cutover remain out of scope and unauthorized by this entry. Report:
  `docs/reviews/OPENSANCTIONS-MATCH-SAFETY-2026-07-21.md`.

- **2026-08-03 (authorization-bypass repair — gates moved into the pages; branch only)**
  Authorization had been enforced ONLY in `layout.tsx` files, which is not an authorization
  boundary: layout and page render as sibling tasks, so a layout's redirect/404 never
  cancelled the page's task and the page's fully rendered output was still serialized to
  anonymous callers — recoverable via an `RSC: 1` GET (HTTP 200 flight payload) or from the
  body streamed inside the 307. TEN pages were affected: `/admin/access`, `/admin/ingest`,
  `/digests/[country]`, `/digests/[country]/[date]`, `/search`, `/entities`,
  `/entities/[id]`, `/registry`, `/registry/[id]`, `/middle-east`. Repair: the matching gate
  from `@/lib/gate` is now the FIRST statement of each page component, before any data
  access (`requireAdmin` on the two admin pages; `requireAcceptedUser` on digests/search/
  entities; `requireAdminOr404` on registry/registry-detail/middle-east); every layout gate
  was KEPT as defense in depth (zero layout files changed), and the entities pages'
  data-layer gating (non-admin SQL omits `e.meta->'opensanctions'`; detail short-circuits to
  `{state:"none"}`) plus `/signals` were left untouched. Ruling 21 records the standing rule.
  Evidence — a new real-HTTP regression test (`src/integration/authz-page-gate.itest.ts`,
  30 tests: bare GET + `RSC: 1` GET + an accepted-admin positive control per route, asserting
  on the response BODY, never the status code) run against a production build on a disposable
  Neon fork: BEFORE the fix 20 failed / 10 passed — every anonymous assertion failed on both
  request modes while all ten positive controls passed, so the failures were the vulnerability
  and not the harness; AFTER the fix 30/30 pass. Because that itest is excluded from `npm
  test` and skipped in CI when the Neon secret is absent, the four existing unit test files
  that had to mock `@/lib/gate` mock it as a SPY, not a no-op, and each adds a
  `page-level authorization gate` case asserting the gate was called and that its
  `invocationCallOrder` precedes the first query's — so the always-run suite (and the
  pre-push hook) now fails if a future refactor deletes or reorders a gate call "because the
  layout already gates it". Proven by mutation: deleting `await requireAcceptedUser()` from
  those four pages fails exactly the 6 new cases and no others. Their pre-existing
  OpenSanctions/money-path assertions still route through `currentRole()` and are unweakened.
  Gates: typecheck clean · lint clean · unit 2,055/2,055 (161 files) · integration 102/102
  (15 files, up from 72/14). Zero paid provider calls, zero production
  writes, no migration, no env change, no deploy, no push — branch/working-tree only.
  **Flagged, deliberately NOT fixed (legal/product track):** `requireAcceptedUser()` sends a
  signed-in-but-unaccepted user to `/welcome/legal`, so the same layout-only enforcement was
  also bypassing the CURRENT clickwrap on `/search`, `/entities` and `/digests`; the forced
  re-acceptance of 2026-07-21 (Privacy 1.3) means real users sit in that state now. This
  repair closes the content leak for those users as a side effect, but the acceptance flow
  itself was not touched and is not adjudicated here (OPEN-TASKS #75).

- **2026-08-03 (authorization-bypass repair — merged to main; deploy deliberately separate)**
  Operator authorized shipping the repair above. It was committed on branch
  `fix/layout-gate-authz-bypass` and merged to `main` (linear, fast-forward — no merge
  commit), then pushed. Gates re-verified on the exact merged tree by this session:
  typecheck clean · lint clean · unit 2,055/2,055 (161 files) · integration 102/102 (15
  files) against a disposable Neon fork, with every paid provider key blanked and
  `LLM_DISABLE=1` — zero paid provider calls, zero production writes, no migration, no env
  change. One supporting change rides along: `scripts/test-integration.sh` now forwards extra
  args to vitest so a single itest file can be run. **This session did NOT deploy** — the
  production deploy is a separate operator action, so between this entry and that deploy the
  Current-state snapshot above is authoritative: production still runs `441ee09` and remains
  vulnerable. Nothing else changed: no flag, cap, cron, or Ask/OpenSanctions behaviour is
  touched by this repair.
  **OPEN-TASKS #75 adjudicated won't-fix by the operator** in the same authorization: the
  clickwrap-bypass window opened by the 2026-07-21 forced re-acceptance needs no
  record-keeping or user-facing follow-up, because every existing account is one of the
  owner's own disposable email aliases — there is no third-party user-acceptance exposure.
  The acceptance flow itself is unchanged and was not touched. If real third-party users are
  admitted before that flow is revisited, the question re-opens as a fresh item.

- **2026-08-14 (operator admin promotion + X incident diagnosis)** Operator explicitly made
  `go@vociferous.ai` an administrator. Production `ADMIN_EMAILS` changed from
  `go@vociferous.nyc` to `go@vociferous.nyc,go@vociferous.ai`; the existing production release
  was redeployed as `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC` from the same `441ee09` artifact, with
  no code, migration, database, or other env change. The `.ai` identity accepted Terms 1.1 and
  Privacy 1.3 and live-opened `/admin/ingest`, proving the admin gate. The dashboard and database
  audit also resolved the suspected X-credit failure: the 2026-08-10 episode recorded provider
  request failures with `budgetStops=0`; cumulative X spend was $43.8075 of the $75 total cap,
  and the incident-day spend was $0.7386 of the $2.50 daily cap. Automatic scheduled catch-up
  resumed and inserted 560 + 9,069 + 764 = 10,393 documents on 2026-08-13, then returned to
  healthy hourly polls. This closes #66's natural recovery proof; #38 remains only for an
  independent confirmation that the external alert email was delivered.

- **2026-08-15/16 (Iran validation recovery — cap raise, observability release, citation
  auto-refresh, source roster, bounded backfill; operator-authorized unattended envelope)**
  Root cause reconfirmed: `openai_map` crossed the shared $10 all-time backstop at
  2026-07-29 08:40:34Z and 418 hourly map runs then recorded ok=true with zero claims while
  ru/ua/ir doc_claims starved, `openai_reduce` went idle from 07-30, ru/ua/ir digests fell
  back to the legacy engine (ir claims/day 8.8→~3; 2026-07-31 produced NO ir digest), and
  Iran coverage collapsed (60.4% avg Jul 15–23 → 23.2% Aug 2–10). Executed under the
  prompt's pre-approved envelope ($40 map all-time / $20 temporary daily to
  2026-08-17T13:00Z / ≤$20 new spend from the 2026-08-15T19:27:07Z baseline $15.6248
  all-OpenAI): (1) `MAP_SPRINT_USD_CAP=40` in all three Vercel envs — map-only ceiling;
  `LLM_SPRINT_USD_CAP=10` untouched (a shared raise would grant +$30 unrelated headroom per
  provider); daily elevation via auto-expiring `MAP_USD_CAP_DAILY_OVERRIDE_USD=20` +
  `_UNTIL=2026-08-17T13:00:00Z` (Production only; base `MAP_USD_CAP_DAILY=4` never edited;
  guard reverts BY CODE at the instant, boundary test-pinned; the override pair remains
  installed through the window — post-expiry removal is hygiene, not correctness). All
  three new envs plain/readable and read back exactly. (2) Release
  `dpl_9xyqCLfZn6n8WTifQ6BpgpV9wJja` deployed 19:27:49Z from branch
  `claude/iran-validation-recovery-20260815` (deployed tree = `70b2aa9`; later branch
  commits are docs-only) — also the FIRST deploy of the ruling-21 authz repair, verified
  live (anonymous bare/RSC bodies clean). Gates: typecheck/lint clean · unit 2,122/2,122
  (167 files) · integration 106/106 (17 files, disposable forks) · build PASS · mutation
  proof (disabling the health classification fails exactly its 4 tests) · zero paid test
  calls. Worktree CLI deploys ship no git metadata → /health stamp EMPTY on this
  deployment (#78; verified via data-dpl-id + behavior). (3) Observability now binding:
  non-run_cap budget stops record cron_runs.ok=false + machine-readable
  `budgetStopCategory`; steady runs evaluate per-theater/current-version freshness with
  episode-deduped alerts + one recovery notice (`map-health.ts`, state `map_health`);
  driver classifies run/daily/total/transport stops and takes `--theater`. First
  post-release run (19:40:37Z) mapped 536 claims and SENT the stale-theaters alert
  (Postmark-accepted; mailbox receipt unverified, as #38). (4) Citations: backup branch
  `backup-pre-iran-recovery-2026-08-15` (`br-polished-block-atu0r968`) first; then 42 Iran
  reports 2026-07-04→08-14 parsed (36 pending drained + 6 undiscovered days recovered at
  plain slugs — transient probe failures, not gaps), 3,688 parsed / 3,294 stored
  citations, ~46 new sources, transactional materialize (ir 3,654 rows); registry
  freshness 2026-07-03 → 2026-08-14. Go-forward: `validateDigest` parses endnotes from its
  own fetched HTML (`src/lib/isw/load.ts` is the single upsert authority; parse failure
  never downgrades a parsed report; ISW prose stays transient; discovery probes all four
  observed Iran slug shapes). RU's identical historical staleness = #79. (5) Sources
  (6 authorized slots): activated en.mehrnews.com (en), radiofarda.com (fa), sabanew.net
  (ar), sanaacenter.org (en), alaraby.co.uk/rss/politics (ar) + repaired presstv.ir to its
  item-identical presstv.co.uk mirror (broken .ir TLS; registry identity unchanged); all
  robots-clean with explicit ir lens pins (ruling 11); first fast cron inserted 205
  correctly-attributed docs. Rejected: shafaq.com (robots disallows feeds; 1,398 ir
  citations — #76 outreach), majalla/alhadath (no feed), almasdaronline (bot-walled),
  964media (gated). (6) Iran map backfill 2026-07-30→08-15 driven `--theater ir` through
  the deployed route: window 47,090 → 20 unprocessed (99.96%; stragglers to the hourly
  cron), 100% per-day disposition coverage under current versions, no cross-theater spill,
  no version drift. (7) 17 Iran military digests 07-30→08-15 regenerated onto mapreduce
  through the normal guarded persist path (claims/day ~3.0→~9.3; the missing 07-31
  created; FORCE_REGEN never set) and 16 dates revalidated honestly (matcher untouched):
  comparable-day mean coverage 20.8→43.5 (+22.7; 5 improved, 4 unchanged, 1 WORSENED —
  08-03 20→0 retained as-is), 6 newly-scorable days mean 28.8, all-16 mean 38.0 — below
  the pre-incident 60.4; 0% days remain (08-07/11/14). 08-15 has no ISW report (probed;
  not fabricated). (8) Spend: **$1.87 of the $20 envelope** (map +$1.6341 → total
  $11.6424 of the $40 ceiling; reduce +$0.1943; match +$0.0156); no second raise; no
  other paid provider touched. DISCOVERED PRODUCTION DEFECT: the map worker's session
  advisory lock strands on idle pgbouncer server connections (observed against the
  deployed route; safe-clear signature + interim janitor documented in the review; durable
  fix #77). At closeout ru/ua backlog (52K+19K docs) drains autonomously (~3 days at cron
  pace, inside the normal $4/day once the override expires) and `map_health` correctly
  reports `stale_ru,stale_ua` — Iran is recovered; the multi-theater corpus is NOT yet
  fully current. Binding until superseded: MAP_SPRINT_USD_CAP is the map worker's all-time
  ceiling (ruling 4 updated); a non-run_cap map budget stop is UNHEALTHY by contract; the
  override pair is the sanctioned bounded-recovery mechanism; branch is PR-only — `main`
  not pushed. Report: `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`.

- **2026-08-17 (Candidate B cron clustering — merged and deployed to production; 48–72h
  observation window open)** Operator-authorized supervised release of PR #4
  (`codex/neon-cron-cluster-phase1-20260816`, head `ab8150d`; gate + integration green on
  that SHA; both Phase-1 adversarial reviews PASS). Preflight re-verified base `26989f7` =
  local = origin main and live production `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC` (built from
  `26989f7`; `/health` `data-dpl-id` match). Merged to `main` at 2026-08-17T06:44:54Z as
  merge commit `9c5e9cb` (normal merge, reviewed commits preserved, source branch retained);
  merged diff re-verified = exactly three `vercel.json` schedule strings
  (telegram/x/mtproto `:10/:20/:35` → `1/2/3 * * * *`) + three documentation files. The
  Vercel project has NO connected Git repository (project inspect: no Git section; no Vercel
  check on the merge commit), so the single intentional production deployment was made via
  CLI from the clean merged root clone: `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`, READY 06:47:53Z
  (build 44s), aliased bnow.net, Vercel git metadata = `9c5e9cb` on `main`, `/health` stamps
  the commit (root-clone deploy — #78's worktree blank-stamp did not recur). Deployed cron
  table verified entry-by-entry: only the three minutes moved; the other 11 entries
  byte-identical. Safety: no migration, no env/cap/flag change, no production DB write by
  the release process (read-only checks only), no manual cron invocation, no paid provider
  call, PR #5 untouched. First natural Candidate B cycle PASSED (all `ok=true`,
  `finished_at` set, correct job identities, no 5xx/auth errors, no duplicate storm; known
  noise only — procurement proxy-block, one quiet telegram preview, GramJS #69 CastError):
  fast 07:00:04/163.1s; validate 07:00:29/15.3s (its normal `errors:1, validated:2`
  pattern, identical to 08-16); telegram 07:01:20→07:03:46/146.4s/114 inserted; x
  07:02:07→07:02:50/43.4s/115 inserted (lockSkips 0, budgetStops 0, requestFailures 0,
  lease released, watermark advanced to 07:02Z); mtproto 07:03:39→07:05:08/89.4s/295
  inserted (40 channel states advanced). The designed telegram⇄x⇄mtproto overlap occurred
  with zero contention. One-time transition gaps: telegram 51m / x 42m / mtproto 28m —
  inside the reviewed ≤~58m bound; no data loss possible (insert-gated watermarks). Map
  stayed at :40 and ran normally on the new artifact (07:40:42→07:43:43, 181.1s, ok, 377
  claims); the pre-deploy 06:40 map run also completed cleanly across the deploy moment.
  **Observation window OPEN from 2026-08-17T07:00:00Z** (closes 2026-08-19T07:00Z–
  2026-08-20T07:00Z; plan = Phase-1 §7): Neon cumulative anchor `active_time_seconds` =
  1,144,967 (~318.05h, Aug billing period) read at 06:45Z and still identical at 07:48Z —
  the consumption API LAGS, so the closing comparison must use settled values. The ~17–19%
  active-compute reduction remains an ESTIMATE until the window closes; PR #5 /
  model-routing stays undeployed during the window. Rollback target (verified healthy, not
  needed) = `dpl_Dg713ne5Vu6aiGGsbfs6uxgPKZNC`. Pre-existing conditions noted at baseline,
  NOT caused by this release: ru/ua/ir map backlog drain (`map_health` episode
  `stale_ir,stale_ru,stale_ua`), one stale unfinished `ingest:telegram` cron_runs row from
  08-15 14:10Z, and the `ask-events.itest.ts` failure recorded in Phase-1 §5. Standing
  corrections shipped with this closeout: AGENTS.md Live/repository + Crons lines,
  CURRENT-STATE Crons/Deploy/MTProto-minute lines, and the three stale ":20 poll" code
  comments → ":02" (`src/lib/usage/x-lease.ts`, `src/lib/adapters/x-gap-backfill.ts`,
  `scripts/x-gap-backfill.ts`). One supporting change rides along: eslint's global
  ignores add `.claude/**` beside `.workstream/**` (same declared category — isolated
  worktrees checked out inside the repo), so `npm run lint` and the enforced pre-push
  gate stay truthful from the root clone. Report addendum: Phase-1 review §10.

- **2026-08-18 (independent conflict-evaluations final audit — Fable 5, exact-tip; branch
  `codex/conflict-evaluations-final-audit-20260818` only)** A fresh Fable-5/xhigh session
  audited the completed conflict/region evaluation workstream at the exact branch tip
  `a2ddca8` (`a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`) on the independently audited QF base
  `7150b49`. Reconstruction verified every ancestry/statistic claim and the true model
  timeline (Gate 6 `1f70852` = last fully Fable-reviewed point; Phase 7 onward = Opus 5 after
  an operator switch, no fallback). The COMPLETE gate battery was replayed green at the
  unchanged tip — unit 3,213/3,213 (228 files) · integration 151/151 (21 files, disposable
  fork deleted) · typecheck/lint/build clean · CLI modes under a hard network kill-switch with
  8/8 refusals exit-2 under fake keys · 14/14 gated evidence routes 307 anonymously with zero
  claim-text leakage under production posture · 48-state overflow + measured-contrast browser
  matrix · 679-fragment prose scan zero hits · golden byte-identity — nothing NOT-RUN. Three
  fresh Fable reviewers (science, safety, product) each returned **PASS-WITH-MINORS at
  `a2ddca8`** with 0 BLOCKER/HIGH. Corrections of record appended (P7 report §12, conflict
  decision-register #13, workstream index): the backtest's F2 counterfactual was
  promised-but-unrendered (recomputed: legacy union 82.4% ROCA / 75.0% Iran under the
  matchable reduction), F5 misstated what `/scoreboard` presents (per-run unweighted means,
  never a pooled 15/36), an undisclosed designated-final-edition handoff to the legacy
  emulation, a 40-vs-41 snapshot-reason overgeneralization, the atomization "disabled
  experiment" that was never built, and the source-independence metric being document-grain
  (`distinct non-mirror docIds`; `sourceDomain` unused) while schema names and some copy say
  "independent sources". New binding enablement item: `CONFLICTS_UI=1` requires
  `FEATURE_AUTH_GATE=true` in the same environment (inherited gate demo-parity otherwise
  serves the gated evidence page anonymously). Audit remediation was DOCS-ONLY after all three
  verdicts were recorded — no source/test/fixture/golden byte changed, so the conflict
  integration branch still contains the exact audited tree. Verdict:
  **`independent-audit-pass / conflict-delta-may-be-considered-on-audited-QF-base;
  soak-and-enablement-blocked`** — dormant merge may be considered (QF first, then the P7
  §5.1 seven-PR order); the shadow soak stays blocked on register #11/#12 + the independence
  relabel; enablement stays blocked on ruling-3 + P7 §5.2 items 4/4b/4c/4d/5/6. No merge to
  `main`, push, PR, deploy, env change, paid call, production write, or soak occurred. Full
  record: `docs/reviews/CONFLICT-EVALUATION-FABLE-FINAL-AUDIT-2026-08-18.md` + ledger +
  finding register + three review reports.

- **2026-08-19 (Candidate B cron clustering — 48h observation window CLOSED, verdict PASS;
  documentation only, no deploy)** The window opened by the entry above ran its full
  planned length, `2026-08-17T07:00:00Z → 2026-08-19T07:00:00Z` (deployment
  `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` became READY at 06:47:53Z; the formal window opened at
  the next whole hour, so every measured hour ran the clustered schedule). **Verdict: PASS.**
  Compute: hourly production-branch figures came from Neon's READ-ONLY branch-consumption
  endpoint (no compute wake); production is pinned at exactly 1 CU, so
  `compute_unit_seconds` is TREATED as active-compute seconds — that equivalence is our
  inference from the fixed 1-CU configuration, not something Neon asserts. Immediate
  pre-deploy 24h = 69,860 CU-s (19.41 active-compute h, 48.51 active min per wall-clock
  hour); post-deploy day 1 = 62,266 (17.30 h, −10.9%); day 2 = 58,480 (16.24 h, −16.3%);
  **full 48h = 120,746 (33.54 h, 41.93 active min/h) = −13.6%** against the DOUBLED
  pre-deploy 24h baseline (139,720 CU-s) — no true 48-hours-before window was measured, so
  the 48h figure is a doubled-24h comparison by construction. That is ≈5.27 active-compute
  hours saved over 48h, ≈2.64 h/day. **The pre-deploy ~17–19% estimate is superseded by the
  measured ~13–14% result** (13.6% for this window); Phase-1 §§1–9 arithmetic is left
  verbatim as the historical estimate. Counter-check against a merely quiet corpus: core
  ingest ROSE — 7,812 documents pre-deploy 24h vs 9,623 (+23.2%) and 9,325 (+19.4%) on the
  two post-deploy days, 18,948 over 48h = **+21.3%** vs the doubled baseline — so the
  saving is scheduling, not idleness. Operations: **398/398 expected scheduled runs
  succeeded** (fast 192 · telegram 48 · x 48 · mtproto 48 · map 48 · digest finalize 2 ·
  digest intraday 6 · validate 2 · enrich 2 · datadark 2), zero failed, zero killed, zero
  contention-skipped, zero NEW unfinished rows; all 48 natural map cycles completed; digests
  stayed current; no stub data surfaced. The five `finished_at IS NULL` rows still in
  `cron_runs` ALL predate the deployment (telegram 2026-07-28, three x 2026-08-13, telegram
  2026-08-15) — pre-existing stale rows, not Candidate B regressions. Zero production 5xx at
  Vercel; the only error-level runtime records were the known non-fatal GramJS peer-type
  `CastError` noise (#69); no new error signature; no pgbouncer / connection-exhaustion /
  statement-timeout / advisory-lock / `ECONNREFUSED` signature; DB snapshot showed zero
  deadlocks and zero conflicts. X checkpoint clear (no lock skips, budget stops, or request
  failures); MTProto current (140/163 channels fetched since deploy, zero resolve errors).
  `map_health` still reports `stale_ir,stale_ru,stale_ua` — **pre-existing backlog debt
  carried in at the deployment baseline, NOT resolved by this release and NOT a Candidate B
  regression.** `/health`: DB OK, build `9c5e9cb`, deployment
  `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2`. Binding decisions: Candidate B REMAINS DEPLOYED (no
  rollback); the gate CLOSES at 48h — extension to 72h is NOT required; it is safe to
  proceed to the routing-baseline release stage (PR #5), which gets its own reconciliation
  against the resulting `main`, its own full retest, and its own separately deployed 24h
  routing-equivalence soak with every candidate-model variable unset. **This closeout is
  documentation only: merging it is NOT a deployment, and production continues to run
  `9c5e9cb` / `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` unchanged.** Report: Phase-1 review §11.

- **2026-08-20 (cloud-model routing seams reconciled onto post-PR #6 main — repository
  only; PR #5 stays DRAFT, nothing deployed)** PR #5's five audited commits
  (`8953008 359750c 030d526 f34aee8 0e469f7`, base `26989f7`) were replayed onto
  `origin/main` `181a218` as `6636c5a 7e14e26 82c41b7 d882fcf 851d3e7` — order, messages,
  authorship preserved; nothing squashed, reworded or reordered. `docs/PROGRESS.md` was the
  ONLY overlapping path and its single add/add region was resolved by placing both sides'
  blocks verbatim in timestamp order (01:50 main · 02:05 PR5 · 03:00 PR5 · 07:55 main ·
  08-19 main), zero deletions or rewrites on either side. Fidelity is mechanical, not
  asserted: `git range-diff` returns five 1:1 rows whose only changed lines (18) sit inside
  `## docs/PROGRESS.md ##`; the non-PROGRESS delta against the new base is byte-identical
  to the original delta against the old one (158,229 bytes, sha256 `5c533e7b…30d58`);
  31 of the 32 blobs are object-identical to `0e469f7`; no PR #4/#6 change is reverted.
  **What the merged repository now owns.** `src/lib/llm/model-config.ts` is the ONE
  authority for "which model does this analysis workload dispatch, at what reasoning
  effort" — map, reduce, digest, validation, entity_audit — resolved at CALL time
  (`<WORKLOAD>_MODEL` → `OPENAI_MODEL` → gpt-4o-mini; blank/whitespace = absent), so call
  sites no longer read model envs themselves and the reduce stage is decoupled from map's
  former module-load `MAP_MODEL` const. `src/lib/llm/analysis-registry.ts`
  (`analysis-reg-v1`) is a SEPARATE quality gate seeded with baseline-only approvals —
  gpt-4o-mini, effort absent, status `baseline`, one per workload — and ZERO
  `evaluated_candidate` entries. `src/lib/llm/pricing.ts` is the single analysis metering
  price authority. Dispatch requires BOTH pricing and approval: `workloadDispatchConfig()`
  throws `ModelConfigError` BEFORE any `SpendGuard.tryReserve()` and before any provider
  client is constructed when the effort is invalid, an effort is set for a non-reasoning
  model, the model is unpriced, or the exact (workload, model, effort) is unapproved
  (standing ruling 4 updated). Map additionally carries a HARD activation lock with NO env
  override: any non-baseline map model/effort is refused `MAP ACTIVATION BLOCKED`, because
  `mapExtractorVersion()`'s basis reads the map workload's resolution and a bump does not
  remap history (the worker selects `processed = false` only) — `REDUCE_*` never touches
  that version, and the all-absent basis is byte-identical to the historical one (ruling 13
  updated; OPEN-TASKS #33 remains the prerequisite). Ask is deliberately NOT routed here
  and keeps its scorecard-gated `ASK_ANSWER_MODEL`/`ASK_RERANK_MODEL`.
  **Money.** gpt-5-mini pricing is CORRECTED from $0.125/$1 to the official $0.25 in /
  $2.00 out per 1M tokens: the app had been under-metering it 2×. On deployment the Ask
  rerank reservation and recorded estimate DOUBLE — `rerankCeilingUsd()` $0.005125 →
  $0.01025, per-Ask worst case $0.067625 → $0.07275 — with no change in what OpenAI
  actually bills. Read-only production evidence taken 2026-08-20: `ASK_USD_CAP_DAILY` = $2
  (repository-recorded read-back; not decrypted), `openai_ask` has spent $0.0000 since
  2026-07-21 and its largest day ever is $0.2748 (2026-07-12), so even doubling every
  recorded dollar leaves ≥72% of the daily cap free; all-time `openai_ask` is $0.4468
  against the $10 `LLM_SPRINT_USD_CAP` per-provider backstop. Headroom is sufficient; it is
  re-checked at deploy time, not waived (OPEN-TASKS #84).
  **Nothing is activated and nothing is deployed.** All ten routing envs
  (`MAP/REDUCE/DIGEST/VALIDATION/ENTITY_AUDIT_MODEL` + `*_REASONING_EFFORT`) and
  `OPENAI_MODEL` are ABSENT in Production, Preview and Development (verified read-only
  2026-08-20 by name listing; no value added, changed, removed or decrypted), so every
  workload resolves to the gpt-4o-mini baseline. The dry-run inspector reports all five
  workloads `source=default effort=— priced=yes approved=baseline dispatch=ok`, and the six
  documented negative scenarios each fail closed with their exact reason.
  `mapExtractorVersion()` is byte-identical between `181a218` and this tree across all 30
  (track, theater) combinations, and matches all six live production (theater, track) pairs
  in `doc_claims`. Gates on the reconciled tree: `git diff --check` clean · typecheck clean
  · lint clean · unit **2,187/2,187 over 171 files** · production build PASS (dummy
  `DATABASE_URL`, never contacted) · integration **107/107 over 17 files** on disposable
  Neon forks, deleted afterwards, with `LLM_DISABLE=1` and every provider key blanked.
  ZERO paid provider calls, zero production database writes, no migration, no lockfile
  change, no env change, no deploy. **Merging PR #5 is NOT deploying it:** production
  continues to run `9c5e9cb` / `dpl_CDnECGnXvoZFKnA9QQziz59pmpu2` (verified `/health` DB OK,
  2026-08-20), so repository code is deliberately AHEAD of production until a separately
  authorized release with its own routing-equivalence soak. Binding until superseded:
  activating ANY candidate model requires its own paid representative evaluation, an
  `evaluated_candidate` registry entry, and explicit operator authorization — and for map,
  the #33 remap path first. Report:
  `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md`.

- **2026-08-21 (PR #5 routing-seams 24-hour soak — CLOSED, PASS; independently reverified)**
  The formal soak window 2026-08-20T22:00:00Z→2026-08-21T22:00:00Z closed and was
  reverified from the production record rather than from the prior session's notes.
  Evidence: production is `dpl_GH6UWFojKPEgPrhBiT7utPBPnQBJ` (created 2026-08-20T21:00:27Z,
  READY, aliased `bnow.net` + `bnow-net.vercel.app`), `/health` HTTP 200 stamping `7336b9c`
  with DB OK; `origin/main` is `7336b9c4fe74211dd5d2c49c36449b9159953db4`, PR #5's merge
  commit. In-window `cron_runs`: **199 total, 199 ok, 0 ok=false, 0 with
  `finished_at IS NULL`, 0 errored** (96 ingest:fast, 24 each mtproto/telegram/x/map, 3
  digest:intraday, 1 each digest:finalize/validate/enrich/datadark). All **24/24 map runs**
  ok and carrying exactly ONE distinct dispatch identity —
  `gpt-4o-mini / reasoningEffort null / analysis-reg-v1 / baseline / workload map`. Digest
  and validation identities are baseline too, read from their durable homes (21 digests'
  `structured.stats.llmDispatch`; 3 `validation_runs.details.dispatch`, matcher
  `llm-majority`) — note that `cron_runs.counts.dispatch` is written by the map and
  entity-audit routes only, so digest/validation identity must be read from those tables,
  not from `cron_runs`. Zero routing-gate failures, zero 5xx in sampled runtime logs. NO
  routing variable exists in any Vercel environment: 86 env rows / 48 distinct names, none
  of `{MAP,REDUCE,DIGEST,VALIDATION,ENTITY_AUDIT}_{MODEL,REASONING_EFFORT}`, `OPENAI_MODEL`,
  or `ANALYSIS_ROUTING_*`. **PR5_SOAK_VERDICT=PASS.** This session changed no environment
  row. Standing text corrected in place: the Live/repository bullet named the superseded
  Candidate B deployment, and `docs/CURRENT-STATE.md` still described routing as
  "repository code, NOT deployed".
  **Three PRE-EXISTING production defects were found while closing the soak — none caused
  by PR #5, none fixed here, all newly tracked.** (a) ~50% of map micro-batches are rejected
  by the provider with `400 Invalid body: failed to parse JSON value`; the rate is 0%
  through 2026-07-15, 7.1% on 07-16, and a 45–54% plateau since, FLAT across every deploy
  boundary. Root cause identified: `mapDocLine` truncates with
  `body.slice(0, mapContentChars())` (`src/lib/analysis/map-prompts.ts:164`), a UTF-16 slice
  that can split a surrogate pair, and the surviving lone surrogate makes the whole request
  body unparseable — one bad doc kills its entire 20-doc batch (OPEN-TASKS #86, Tier 1).
  (b) `digest:finalize` records the same 400 in an in-run `errors` counter while
  `cron_runs.ok` stays true (#87). (c) Consequently **no digest has used the mapreduce
  engine since 2026-08-17** — all 11/day fall back to legacy for want of current-version
  `doc_claims`, with `map_health` reading `stale_ir,stale_ru,stale_ua` (#88); AGENTS.md and
  CURRENT-STATE.md both claimed mapreduce was the live engine and are corrected in place.
  A fourth, latent: the dedup gate's reference-side exact-md5 index is keyed on `undefined`
  because reference rows are cast `as DedupDoc[]` while the SQL aliases `content_md5` (#89,
  byte-identical on `main`, not introduced by any recent change).

- **2026-08-22 (QF Worktree B — durable map lease + version-aware remap: merged, deployed,
  24h lease soak OPENED)** The audited QF Worktree B (`c40060e`) was isolated onto its own
  branch, rebased `--onto origin/main 05fdd2c` with an **EMPTY conflict ledger** — `git
  range-diff` shows all seven B commits `=`, the path inventory is identical (14 paths),
  and both the non-doc patch (124,060 bytes) and the full patch are **byte-identical** to
  the audited original. B never touched AGENTS.md, so no append-only document needed
  merging. Repairs on top closed the audit findings the release required: REMAP-1 and L4-1
  are now pinned by always-run unit tests over an in-memory Pool (remap never writes
  `processed`, including a partially-dispositioned `processed=false` doc whose other track
  remains hourly-worker work; both previously-unpinned lease-gated write gates), REMAP-3
  swept every numeric CLI input fail-closed in both drivers AND at the route, REMAP-5 +
  SAF-m4 bound the remap checkpoint to a credential-free route target with a missing
  binding treated as a mismatch, and L4-2's "never a second writer" absolute was WITHDRAWN
  from code and report alike in favour of the exact residual (diagnostic-only fence,
  check-then-act ownership re-check, renew-to-COMMIT window, mixed-generation
  first-writer-wins bound, fence column deferred as #85). The governing QF prompt is now
  tracked verbatim from the audit's preserved blob `2919970` (SHA-256 `7a5562…6fcc`,
  closing G1). A genuine pre-existing clock-dependent test flake — failing within ~62
  minutes of UTC midnight, reproduced at 23:54Z on the audited tip — was also fixed.
  **Three adversarial review rounds ran against exact SHAs** (`028a123`, `11e0754`,
  `85f364d`). The governing prompt specifies Fable 5 reviewers; both Fable 5 reviewers
  terminated with a model-side safeguard error, so under the operator's explicit override
  both ran as Opus 5 (`claude-opus-5[1m]`, self-reported; effort configured-by-spawner, not
  self-verifiable). Verdicts: round 1 PASS-WITH-MINORS ×2, round 2 PASS-WITH-MINORS ×2,
  round 3 PASS-WITH-MINORS (lease, "merge-ready tree") + PASS (spend). No BLOCKER, HIGH or
  MAJOR in any round. The reviewers constructed 21 mutations; the survivors were the
  valuable part and all are now closed — most importantly **the `persistBatch` ownership
  gate, the only one of four lease-gated write paths whose writes come from a BILLED call,
  had no always-run cover and its deletion passed the entire pre-push gate** (found
  independently by both reviewers; the 2026-08-18 audit had recorded it as covered, so the
  release prompt named only two unpinned paths). Also closed: the three lease SQL
  predicates were itest-only; two of the release's own new pins were non-discriminating;
  `?cap=0` at the route manufactured a false "day drained"; `--theater` was unvalidated so
  a typo printed a confident REMAP COMPLETE over zero work; the lease-busy wait was
  unbounded and indistinguishable from a DB failure; and a dry run promised a dispatch the
  activation lock would refuse. Gates on the merged head `85f364d`: typecheck clean · lint
  0/0 · unit **2,309/2,309 (176 files)** · production build PASS · disposable-Neon
  integration **118/118 (19 files)** · pre-push green · every guard mutation-proven · 12
  malformed remap invocations all refused before any route call against an unroutable base.
  CI's `integration` job CLEAN-SKIPS (this repo has no Actions secrets, `NEON_API_KEY` is
  empty) — that green check is NOT evidence and the local disposable-Neon run is. Merged as
  PR #7 `23a1280` (merge commit, history NOT squashed; tree byte-identical to the reviewed
  head) and deployed EXACTLY ONCE from a fresh clone as
  `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`, `/health` stamping the full merge SHA `23a1280` with
  DB OK. Ruling 21 re-proven live on the new build: for all ten gated routes the anonymous
  bare-GET body adds zero words beyond the public signin/landing content, and the `RSC: 1`
  payload carries `NEXT_REDIRECT;replace;/signin;307` or `NEXT_HTTP_ERROR_FALLBACK;404` —
  a gate directive, not a serialized page. **First natural lease cycle (01:40:16Z →
  01:43:01Z, no cron manually invoked): ok=true, outcome `acquired`, fence 1, 57 renewals,
  lost 0, released 1, leaseLostDiscards 0, baseline dispatch, the same four extractor
  versions as before the deploy, 138 claims / $0.0168 in the normal band; afterwards
  `provider_state.map_lease` = `{"fence": 1}` (fence kept, token absent) and `pg_locks`
  holds ZERO advisory locks — the #77 mechanism is gone from production.** Binding until
  superseded: the **24-hour formal LEASE SOAK is OPEN, 2026-08-22T02:00:00Z →
  2026-08-23T02:00:00Z**, and during it no remap execution, runtime deployment,
  environment/cap change, model activation, manual cron invocation or paid evaluation is
  permitted; the closeout checklist is §8 of the release report. **#77 and #33 are NOT
  closed** — the lease is implemented and awaiting its soak, and the remap operator is
  deployed but has NEVER been executed, so remap is not production-proven and no yield,
  cost or completion figure for it exists. Unlocking the MAP activation lock still
  additionally requires an executed, costed corpus remap under explicit spend authorization
  plus a paid representative scorecard (#81). Report:
  `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md`.

- **2026-08-23 (QF-B map-lease 24-hour production soak — CLOSED, PASS; #77 and #38 closed;
  documentation-only release)** The formal lease soak opened by the 2026-08-22 entry closed
  on its stated window **2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z** and every figure was
  re-derived independently from the production record for this closeout rather than taken
  from the prior session's dossier. **`QF_B_SOAK_VERDICT=PASS`, `LEASE_SOAK_STATUS=CLOSED —
  PASS`.** Production is unchanged and still serves `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe`
  (`/health` HTTP 200, `data-dpl-id` matches, build stamp `23a1280`, DB OK; `vercel ls`
  newest production deployment is that one, 1 d old); `origin/main` `7976ecb` differs from
  the deployed merge `23a1280` in exactly five DOCUMENTATION files and no runtime path.
  In-window evidence: **24** map `cron_runs` rows over 24 distinct UTC hours, 0 off-schedule
  minutes, 24 `ok=true`, 0 `ok=false`, 0 `finished_at IS NULL`, 0 non-null `error`; ONE
  distinct `counts.lease.outcome` = `acquired`; fences **2–25**, 24 distinct, every delta
  +1, pre-soak first fence 1, and the entire lease era is a gapless 1..35 (35 rows, 35
  distinct fences, 0 non-acquired, 0 skipped, 0 budget stops) — which is itself the proof
  that no unlogged script, backfill, remap or takeover ever held the lease; `lost=0` and
  `released=1` on all 24; `leaseLostDiscards=0`; **1,541** renewal attempts, **1,541**
  successes; reported claims **3,995** exactly equal to `doc_claims` rows created in-window;
  batches 1,041 with 591 batch errors (**56.8%** — the pre-existing #86 rate, see below);
  `llmCalls` 452 == `llmRequests` 452 (ruling 8: one metering per physical dispatch);
  `processedMarked` 13,038; residue `provider_state.map_lease` = `{"fence": 25}` at
  window close and `{"fence": 35}` when re-read for this closeout (2026-08-23T~12:2xZ), a
  single key with no token either time; **0** advisory locks; one baseline dispatch identity (`gpt-4o-mini` /
  effort `null` / `analysis-reg-v1` / `baseline` / workload `map`); only the four current
  extractor versions (`d73cc83ed8df`, `75e0ff6403db`, `15a6078371bd`, `19c06260f149`); 86
  Vercel env rows / 48 distinct names with zero routing variables and no
  `MAP_LEASE_TTL_SEC`; no migration; and **zero `map:remap` rows in `cron_runs`, ever**.
  Spend, read 2026-08-23T~12:2xZ (an as-of reading on a live series, not a window total):
  `openai_map` $0.5043 on 08-22 against `MAP_USD_CAP_DAILY=4`, $17.0377 all-time against
  `MAP_SPRINT_USD_CAP=40`.
  Independent review PASS (0 BLOCKER / 0 HIGH / 0 MEDIUM / 2 MINOR / 5 NOTE, both MINORs
  being evidence-quality criticisms of the dossier, both corrected). Post-window continuity
  10/10 cycles, fences 26–35, clean. `ROLLBACK_RECOMMENDED=NO`.
  **The PASS is bounded and the bounds are part of the ruling.** (1) Production exercised
  the steady single-holder path ONLY — contention, `expired_takeover`, `busy`, the loss
  latch and the discard path never fired, so contention handling stays test-proven, not
  production-proven (filed as #95). (2) There is NO retained runtime-log coverage of the
  formal window (Vercel CLI caps at 100 records; no log drain — filed as #93); the durable
  `cron_runs` record plus four stores the counts payload does not write (`doc_claims`,
  `doc_map_state`, `provider_state`, `provider_usage`) plus out-of-band operator email are
  the evidence. (3) `pg_locks` readings are point-in-time and carry no window coverage — the
  Neon compute restarts (again at 2026-08-23T12:25Z); what is load-bearing is that the map
  path no longer calls `pg_try_advisory_lock` at all. (4) **`counts.lease.lost` — not
  `leaseLostDiscards` — is the authoritative lease-loss counter** (the discard counter can
  undercount on the truncation-split recursion path; filed as #96). (5) Claims-reported ==
  claims-persisted proves no rollback and no `ON CONFLICT` suppression; it does NOT prove
  that nothing could ever have been discarded before either counter incremented.
  (6) Nested `counts.*` sub-objects must be swept on EVERY job, not just `ingest:x`: two
  in-window `digest:*` runs (`digest:finalize` 08-22T02:00:40Z, `digest:intraday`
  08-22T10:03:16Z) and TWO after the window (`validate` 08-23T07:00:49Z — a NON-digest job —
  and `digest:intraday` 08-23T10:03:16Z) carried `counts.errors=1` while `ok=true` and
  `error` was null. Pre-existing **#87**, on paths QF-B never touched, and wider than #87's
  original `digest:finalize` scoping. Do not claim "zero errors across every job" for this
  window.
  **#77 (the stranded map advisory lock) is CLOSED** on the evidence above. **#38 is also
  CLOSED, but NOT on the basis the soak dossier recommended:** its remaining criterion was
  independent confirmation that an X-health incident/recovery email actually reached the
  configured recipient, and the four in-window map-health emails come from a different
  evaluator (`map-health.ts`), so they do not satisfy it. What does: the operator mailbox
  (`go@vociferous.nyc`) holds `[BNOW] X ingestion unhealthy: incomplete, request_failures`
  delivered 2026-08-22T18:05:46.635Z and `[BNOW] X ingestion recovered: resumed` delivered
  2026-08-22T19:04:17.601Z, matching the `ingest:x` runs 18:02:36Z→18:05:47Z
  (`alertKind=1, alertReasons=2, alertDelivery=1, requestFailures=2, incomplete=1`) and
  19:02:36Z→19:04:18Z (`alertKind=2, alertDelivery=1, requests=55`) field-for-field, with
  TWO further independent incident/recovery pairs on 2026-08-21. Mail held by Postmark and Gmail cannot be produced
  by a doctored database row.
  **Still open:** #85 and #90 (the two accepted lease residuals), #86 (the surrogate-splitting
  map truncation, ~57% of micro-batches rejected — the next repair), #87 (digest swallows
  nested errors), #88 (the last mapreduce digest was 2026-08-16T19:32:38Z; every digest created on or
  after 2026-08-17 is legacy), plus the newly filed #92–#96.
  **Independent review of this closeout (fresh Opus 5, read-only):** PASS-WITH-MINORS —
  0 BLOCKER / 0 HIGH / 1 MEDIUM / 6 MINOR / 5 NOTE, all applied before merge. It
  independently re-derived every asserted figure from production and found no numerical
  error and no overclaim. The MEDIUM was PRE-EXISTING standing text this closeout had left
  alone: the "Analysis model routing (repository code — NOT deployed)" bullet still claimed
  production ran `9c5e9cb`, false since the 2026-08-20 PR #5 release — corrected in place
  above. MINORs corrected the post-window nested-error sweep (two rows, one of them the
  NON-digest `validate` job), the number of corroborating X alert pairs, five stale "~50%"
  #86 figures, two stranded Candidate-B-era sentences, a stale #38 line in
  `docs/SETUP-NEXT-WEEK.md`, and two 2026-08-14 snapshot-header dates. It also produced the
  structural, time-independent form of the #77 claim: a repository-wide grep finds ZERO
  `pg_try_advisory_lock` / `pg_advisory_lock` / `pg_advisory_unlock` CALL SITES in `src/`
  or `scripts/` — only two comment lines in `map-lease.ts`.
  **This release is DOCUMENTATION ONLY:** no source file, migration, environment variable,
  cap, model, schedule or cron was touched; no deployment, promotion or rollback was made;
  no cron was invoked; no remap was executed or dry-run; no paid provider call was made; and
  every database statement in the closeout was a `SELECT`. The AGENTS.md decision-log archive
  move to `docs/DECISIONS.md` was deliberately NOT performed here and is filed as #92.
  Report: `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md` §9.

- **2026-08-23 (OPEN-TASKS #86 — map Unicode batch repair: isolated, same-version;
  deployment recorded separately)** `mapDocLine` truncated the composed document body with a
  UTF-16 CODE-UNIT slice, so a ceiling landing between an astral character's two halves left
  an UNPAIRED surrogate in the provider-bound user message. Since ES2019 `JSON.stringify`
  emits that half as the literal escape `\udXXX` rather than a raw byte (measured:
  `JSON.stringify("abc\uD83C")` → `"abc\ud83c"`, UTF-8 `226162635c756438336322`, pure
  ASCII), the body reaches the provider carrying a lone-surrogate escape, the strict
  server-side parser refuses it, and the ENTIRE 20-document micro-batch dies with
  `400 Invalid body: failed to parse JSON value`. Confirmed three ways — that serialization
  measurement; a synthetic reproduction on the unpatched tree rejecting a 20-doc batch at
  `$.messages[1].content`; and a read-only replay of the worker's own selection predicate
  over the 10,000 oldest eligible documents finding **20** boundary splits, every one at
  index 1499, every one an emoji high half, each still `processed=false` with zero
  `doc_map_state`/`doc_claims`/`doc_dedup` rows. Those 20 yield **31 doc-track pairs** (11
  are both military and elite_politics), which is exactly the 25 failing batches the cycle
  has recorded, unchanged, for 21 consecutive hours alongside frozen `selected=1000`,
  `alreadyMapped=139` and `processedMarked=537`. **The 2026-07-16 onset was PROVIDER-side,
  not runtime-side** — well-formed `JSON.stringify` predates the corpus, and five orphaning
  documents were successfully extracted 2026-07-09→07-13. Repair, in
  `src/lib/analysis/map-prompts.ts` only: `wellFormedSlice` slices to the SAME
  `MAP_CONTENT_CHARS` code-unit ceiling FIRST and repairs SECOND (repairing first could let
  a pair shift across the ceiling and be split again), and `dropIsolatedSurrogates` DROPS
  isolated halves rather than replacing them, so the output stays a subsequence of the
  input's scalars and the model is never shown a character the source lacked — which matters
  because map hard rule 4 asks it to quote character-for-character. The whole composed line
  is repaired, not just the body. **Binding invariant:** everything `mapDocLine` returns is
  well-formed UTF-16, never longer than the code-unit ceiling, and a code-unit subsequence
  of its input; grapheme integrity is explicitly NOT promised (a truncated ZWJ sequence or
  stranded variation selector is valid Unicode and cannot produce a 400).
  **SAME EXTRACTOR VERSION, and this is the ruling:** the version basis is model + system
  prompt + frame rev + content budget, the truncation algorithm was never in it, and none of
  the four moves. Byte-identity is MEASURED, not argued — over 10,000 real production
  documents, 9,980 lines are byte-identical and the 20 that change were all already carrying
  an isolated surrogate, each exactly one code unit shorter. The four live versions
  (`gpt-4o-mini:d73cc83ed8df` military ru/ua, `:75e0ff6403db` military ir,
  `:15a6078371bd` elite_politics, `:19c06260f149` nuclear ir) are now PINNED as literal
  strings by test, so an accidental future bump fails the gate instead of silently stranding
  138,485 rows. No remap is required and none is authorized. One originally-stated condition
  was WITHDRAWN under review: because the provider accepted lone-surrogate escapes before
  ~2026-07-16, documents 2263/622042/715046/1163005/1425485 DO hold current-version
  dispositions from an orphan-carrying request; the repair is safe because
  `processed = true` keeps them out of the HOURLY selection AND each already holds a
  current-version `doc_map_state` row for `military`, their only applicable track, so
  remap's step-3 anti-join empties `pending` and never builds a batch. Note that
  `processed = true` is remap's INCLUSION disjunct, not an exclusion — a first correction
  said otherwise and the second review round caught it. Neither the original claim ("no
  such document was ever extracted") nor that first correction was true.
  **Two independent adversarial reviews against the exact candidate SHA, both
  PASS-WITH-MINORS, every finding applied before merge** (reviewer 1: Unicode /
  serialization / versioning — 1 MEDIUM, 5 MINOR; reviewer 2: map pipeline / spend /
  operations — 0 MEDIUM+, 6 MINOR, and an explicit READY TO DEPLOY). Both landed the same
  surviving mutant, `c <= 0xdbff` → `c < 0xdbff`, which strips the lead half of every
  Plane-16 scalar; it is now killed by range-extreme cases. FOUR mutants survive, every one provably
  EQUIVALENT and every one disclosed rather than papered over — chiefly that removing the
  inner `wellFormedSlice` cannot be distinguished by any test, since every doc-line slot is
  separated by literal ASCII and the outer repair distributes over the concatenation; the
  others are the `ANY_SURROGATE_UNIT` fast path, the `keepFrom === 0` shortcut, and
  `s.length > limit` → `>=`. Gates on the reviewed tree, which fast-forwards so the merged tree
  is byte-identical to it: `git diff --check`
  clean · typecheck clean · lint 0/0 · unit **2,340/2,340 (177 files)**, from 2,309/176 ·
  production build PASS · disposable-Neon integration **118/118 (19 files)** · targeted map
  itests **13/13 (3 files)** · enforced pre-push gate green · reverting only `mapDocLine`
  fails exactly 8 tests and nothing else. Zero paid provider calls, zero production writes,
  no migration, no environment/cap/model/routing/schedule change, no remap (not even a dry
  run), no manual cron invocation.
  **Binding until superseded:** #86 stays OPEN through a post-deployment 24-hour recovery
  window whose primary criterion is **`batchErrors = 0` on every steady cycle** — all 31
  poisoned doc-track pairs are repaired, so a non-zero value is a DIFFERENT defect and must
  be classified from the runtime log, because `cron_runs` cannot tell one 400 from another.
  Expect `lease.renewals` to re-baseline from ~64 to ~`2 × batches + 2`; that is a
  consequence of the repair, not drift. Expect map spend to roughly double to ~$1.2–1.3/day
  for ~1.5–2 days while the ~27,000-document backlog drains — comfortable against
  `MAP_USD_CAP_DAILY=4`, but escalate above **$25 of the $40 all-time `MAP_SPRINT_USD_CAP`**
  or on any `budgetStopCategory` other than `run_cap`. **#87 and #88 are NOT fixed by this
  release and are not claimed to be.** New debt #97 records that the identical UTF-16 slice
  survives at `openai-provider.ts:153` (the mechanical root of #87), `synthesize.ts:138-139`
  (reduce — dormant only because of #88, and liable to wake BECAUSE of this repair),
  `llm-match.ts:83,85`, `anthropic-provider.ts:70`, and — the highest-exposure instance,
  missed by the first draft and caught by both reviewers — the live paid Ask path at
  `src/app/ask/actions.ts:28`, where a USER-SUPPLIED question is truncated at 400 code units
  straight into the answer request. The deployment identity, the first natural cycle and the
  recovery-window timestamps are recorded in the follow-up closeout entry, not here. Report:
  `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md`.

- **2026-08-23 (OPEN-TASKS #86 — merged, deployed once, first natural cycle clean, 24h
  recovery window OPENED)** The repair described in the preceding entry was merged as PR #10,
  merge commit `0aa3d7d096d864120e0fb61c76d3de40d04521c8` (14:07:59Z). `main` was an ancestor
  of the reviewed head, so the merged `src` tree is byte-identical to the reviewed one
  (`1763ae55…` at `f27c674`, at `665a814` and at the merge alike). **Three review rounds**
  ran against exact SHAs — `8a4d283` (PASS-WITH-MINORS / PASS-WITH-MINORS), `d47d73f`
  (**FAIL** / PASS-WITH-MINORS), `f27c674` (PASS-WITH-MINORS, merge bar cleared / **PASS**,
  zero open findings) — and every finding was applied before merge. The round-2 FAIL is the
  one worth remembering: the round-1 correction to the same-version argument was itself
  wrong in the same class as the original error, and only a second round caught it.
  Deployed **exactly once**, from a fresh CLONE with a real `.git` directory, as
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` (14:08:53Z, READY, production, aliased to bnow.net);
  `/health` HTTP 200 stamping `0aa3d7d` with DB OK — no blank stamp, so the #78 worktree
  trap did not apply. No migration (`23a1280..0aa3d7d` touches zero files under `drizzle/`
  or `src/db/`), no environment change (86 rows / 48 names, name set byte-identical, zero
  routing variables), no cap, model, routing or schedule change, no manual cron invocation,
  no remap (still zero `map:remap` rows ever), no paid evaluation. Ruling 21 re-proven live
  on the new build across all ten gated routes; zero 5xx and zero error-level runtime
  records.
  **The first natural `:40` cycle (14:40:20Z → 14:44:34Z, nothing invoked) confirmed the
  repair against an exact, pre-registered prediction rather than a directional hope:**
  `batchErrors` **25 → 0** (the criterion was `= 0`, not "improved", because all 31 poisoned
  doc-track pairs are repaired), `llmRequests` == `llmCalls` == `batches` == **45**,
  `processedMarked` **537 → 1,000** after 21 consecutive frozen cycles, claims **201 → 498**,
  `estUsd` $0.0223 → $0.0660, lease `acquired` at fence 38 with lost 0 / released 1 /
  discards 0, renewals **92 = 45 + 45 + 2** exactly as the re-baselined identity predicts,
  the same four extractor versions and no fifth, residue `{"fence": 38}` with no token, zero
  advisory locks, and **zero `400 Invalid body` lines in the `/api/cron/map` runtime log**
  where every prior cycle carried about twenty-six. All twenty named surrogate-poisoned
  documents — re-selected every hour for weeks — are now `processed = true` with **31
  `doc_map_state` rows**, exactly the count predicted from the eleven dual-track documents,
  and 21 claims. Recorded honestly against the prediction: `alreadyMapped` stayed frozen at
  139, which the operations reviewer expected to move; it is not an acceptance criterion and
  nothing else is ambiguous, but it is unexplained and is carried into the window.
  **Binding until superseded: the 24-hour RECOVERY WINDOW is OPEN, 2026-08-23T15:00:00Z →
  2026-08-24T15:00:00Z** (2026-08-24 11:00 EDT), 24 expected natural cycles. During it no
  further deployment, environment or cap change, model activation, manual cron invocation,
  remap or paid evaluation is permitted. **#86 is `DEPLOYED_RECOVERY_OPEN`, not closed.**
  #87 and #88 remain open and are not touched; #88 in particular is NOT claimed — whether
  mapreduce resumes depends on whether recovered throughput reaches the current-day window,
  which is a backlog-versus-recency question this repair does not answer, and the backlog
  stood at 25,857 eligible documents after the first cycle. Watch `openai_map` spend: it is
  $17.1484 all-time of the $40 `MAP_SPRINT_USD_CAP` and the recovered rate is roughly
  $1.2–1.3/day while the backlog drains; escalate above $25 of $40 or on any
  `budgetStopCategory` other than `run_cap`. Report:
  `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §10–§12.

- **2026-08-24 (OPEN-TASKS #86 — 24-hour recovery window CLOSED, PASS; #86 closed, #88
  re-scoped, #98 filed)** The recovery window opened by the 2026-08-23 map Unicode batch
  repair ran **2026-08-23T15:00:00Z → 2026-08-24T15:00:00Z** and is closed from the
  production record, read-only. **`UNICODE_RECOVERY_STATUS = PASS`; #86 is CLOSED.** This
  session deployed nothing, invoked no cron, ran no remap (still **zero** `map:remap` rows
  ever), regenerated no digest, set no `FORCE_REGEN`, made no paid provider call, and
  changed no environment variable or cap — `vercel env ls` still reads **86 rows / 48
  distinct names**, and production is still `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` (created
  2026-08-23T14:08:53Z, before the window opened; `/health` 200, stamp `0aa3d7d`, DB OK).
  The only writes were to `docs/`.
  **Result:** 24 natural `:40` cycles, none invoked, all `ok=true` with `finished_at` set
  and `error` NULL; **`batchErrors` 0 on every one — 0 of 767 batches**, against the
  591-of-1,041 (**56.8%**) baseline, satisfying the criterion as written (`= 0`, not
  "improved"); lease `acquired` 24/24 with fences **39 → 62 strictly +1**, lost 0 /
  released 1 / discards 0, residue `{"fence": 68}` with no token, zero advisory locks; one
  distinct baseline dispatch identity; the same four extractor versions and no fifth; no
  `budgetStop*` key of any category; `processedMarked` 23,999 of 24,000 selected against a
  frozen 537/cycle baseline; 7,164 claims; the 20 poisoned ids never re-selected.
  **Two criteria required honest handling rather than a pass-by-restatement.** (i)
  `llmRequests === batches` held on 22 of 24 cycles. The two exceptions are entirely the
  untouched truncation-split path: on `finish_reason === "length"` `extractBatch`
  increments `truncationSplits` and recurses TWICE, each recursion metering its own request
  while the top-level `batches` counter does not move. The correct identity is
  **`llmRequests === batches + 2 × truncationSplits`**, exact on both cycles (35+4=39,
  27+2=29) and window-wide (767+6=773); `batchErrors` stayed 0 on the split cycles, so this
  is a response-length behaviour, not a request-validity one, and not a #86 residual. A
  future window should use the corrected form. (ii) The §11 signal carried forward as
  unexplained — `alreadyMapped` frozen at 139 — is **RESOLVED**: it moved to **0 on the very
  next cycle** (15:40Z) and stayed 0 for all 23 after it. The 139 were already-mapped
  documents pinned in the selection window by the 463 stragglers; the first repaired cycle
  drained them (hence `processedMarked` moving in that same cycle) while still counting the
  old window, and the next selection advanced past that region. One cycle late, not wrong.
  **Corpus-wide confirmation, closing the report's own "the 20 are a lower bound" risk:**
  replaying the OLD truncation over the entire eligible pool — not a bounded sample — finds
  **0 of 7,292** still-unprocessed documents that would orphan a surrogate, though 2,536 of
  them carry complete astral pairs; over the 414,659 processed epoch-eligible ru/ua/ir
  documents it finds 25, all accounted for: the 20 repaired on 2026-08-23 (31
  `doc_map_state` rows, 21 claims, first mapped 14:42:49Z–14:44:18Z), four of the five
  pre-existing documents accepted before the provider tightened around 2026-07-16, and one
  (2311267) dispositioned as a dedup mirror with a `doc_dedup` row and no `doc_map_state` —
  which is what ruling 13's definition of `processed` allows. The fifth pre-existing id,
  2263, is dated 2026-07-01 and so falls outside `MAP_EPOCH`; queried directly it holds its
  one row as recorded. **The live selection pool can no longer reproduce #86.**
  **Spend:** $0.9127 across the window; daily `openai_map` $0.7002 (08-23) and $0.7885
  (08-24) against `MAP_USD_CAP_DAILY=4`; all-time **$18.2790 of the $40
  `MAP_SPRINT_USD_CAP`**, below the $25 escalation threshold; 669 daily requests through the closeout read
  against the 1,500 default `MAP_DAILY_REQUEST_CAP`. Below the ~$1.2–1.3/day projection,
  because the repair also STOPPED work: the stragglers are no longer re-dispatched every
  hour, so cycles settled at ~31 batches rather than the transition's ~44. `openai_reduce`
  recorded no usage at all (latest day still 2026-08-16), so #97's reduce-path site has not
  become live and the trigger for promoting it has not fired.
  **What the recovery bought:** map freshness returned. `map-health` sent three
  episode-deduped `unhealthy` notices (18:40Z, 00:40Z, 07:40Z — three stale theaters each)
  and then a **`recovery` notice at 2026-08-24T13:40Z**; `provider_state.map_health` now
  reads `episodeKey: null`; the eligible backlog fell **25,857 → 7,292** (ir 3,939 · ru
  2,393 · ua 960); and the worker is now mapping documents dated 08-22/23/24.
  **Carried out of the window, none blocking the PASS.** **#88 survives #86 and is
  RE-SCOPED — it is no longer blocked on it.** Every digest since 2026-08-17 is still
  legacy, including the 10 from `digest:intraday` at 2026-08-24T19:30Z. The mechanism was
  MEASURED, not assumed, and a first draft of this entry got it wrong by assuming a
  day window: `digest:intraday` selects a **ROLLING 24-hour** window
  (`src/app/api/cron/digest/route.ts:50`), and `inRollingWindow` admits a claim only when
  its document's `published_at` lies inside the last 24 h. At the 19:30:13Z run the newest
  document holding ANY claims was published **2026-08-23T18:55:40Z — about 35 minutes
  short** of that run's window floor of 2026-08-23T19:30:13Z, so the window was empty for
  every theater and track and all ten fell back. The map is closing on the publication
  front but still trails it: at 2026-08-24T21:05Z the newest claimed document is published
  2026-08-24T04:41:29Z while the pending queue spans 2026-08-24T04:43:20Z → 21:04:40Z. What
  remains is purely the backlog-versus-recency ordering decision, and the margin is now
  small enough that closing the remaining lag would let mapreduce resume unaided.
  Observed, not forced: nothing regenerated. **#87 is confirmed still live and is now the
  largest instance of the family** — `digest:intraday` 2026-08-23T19:30:13Z recorded
  `errors: 2` with `ok=true` and `counts.errorMessages` carrying the identical
  `400 Invalid body: failed to parse JSON value` string twice, and `validate`
  2026-08-24T07:00:57Z recorded `errors: 1` with `ok=true` and no message; daily nested
  digest errors run 0–3/day across 08-15 → 08-24, the same band before and after the
  repair, so it is untouched pre-existing debt rather than a regression. **New: #98** —
  `ingest:telegram` left two `finished_at IS NULL` rows INSIDE the window (2026-08-23
  18:01:31Z and 19:01:31Z, `ok` NULL, empty `counts`), ruling 10's timeout signature with
  nothing alerting on it; the class is pre-existing but growing (07-28 ×1, 08-15 ×1, 08-23
  ×2, plus `ingest:x` ×3 on 08-13) and these two post-date the exclusion note the QF-B
  closeout left, so they are genuinely new. They were found only because this closeout swept
  nested `counts.*` on EVERY job rather than just `map`, which is the discipline #87 asks
  for. The expired `MAP_USD_CAP_DAILY_OVERRIDE_USD`/`_UNTIL` pair remains installed and
  remains hygiene-only (#94), untouched here.
  **Binding until superseded:** #86 is closed and needs no remap — the repair kept the same
  four extractor versions deliberately, and re-opening it would require new evidence of a
  surrogate-class rejection, not a generic `400`. A residual non-zero map `batchErrors` must
  still be classified by signature from the runtime log before being attributed to anything
  (#87's counter cannot discriminate). No rollback is contemplated; the §13 target
  `dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` / `23a1280` stays valid but reinstates the defect.
  Report: `docs/reviews/MAP-UNICODE-BATCH-REPAIR-2026-08-23.md` §14.

- **2026-08-24 (QF-A landed — evidence recency + quality funnel; release-train stage 3b;
  H6 supersession recorded)** Per the operator's pending-merge adjudication plan, Worktree A
  of the quality-foundation program landed as its own PR: the 6-commit strand
  (`codex/evidence-quality-observability-20260817`, own delta from QF base `05fdd2c`) was
  rebased onto `main` `30088bf` in a fresh worktree — conflict ledger EMPTY, `range-diff`
  6/6 commits byte-identical to the independently audited tree (audit verdict for A:
  "CORRECT and merge-reviewable", `858bb9a`) — plus five landing commits closing every
  outstanding A register finding (FUNNEL-A12-1 docsInFedGroups surfaced; FUNNEL-A12-2
  roster-aware pending labels via `mapTheaters()`; FUNNEL-A12-3 lexicon-skip wording;
  A-REC-1 skew-boundary pins; SCI-N4 documentCount reconciliation) and one closing the A1
  landing-review note (map-roster env provenance in the funnel report). FUNNEL-A12-4
  (platform/language citation dimensions) deliberately not taken — OPEN-TASKS #99.
  Independent adversarial landing review (5 lenses, findings adversarially verified):
  ZERO confirmed defects; 7 notes, all dispositioned in the release record. Invariants:
  H1 assertion PASS (`dropIsolatedSurrogates` present; map-prompts + map-request-wellformed
  49/49); rulings 17/18/19 verified untouched (recency computed on the exact post-guard
  shape after the overwrite verdict, fail-open, stub-excluded); zero new paid call sites; no
  migration. Gates on the exact landed tree: typecheck/lint clean · unit 2,412/2,412 (180
  files) · integration 119/119 (19 files, disposable Neon fork) · pre-push green. Deploy is
  NOT part of this landing (standing 2026-08-03 separation): production still runs
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`; the prepared deploy request names rollback target
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` and a ≥1-full-day/digest-cycle observation window.
  **H6 supersession:** the 2026-08-21 entry's staging posture — `7150b49` immutable, A/C/D
  and the conflict program unmerged — is SUPERSEDED by the operator's release-train plan for
  Worktrees A and C: each lands as its own main-based PR by strand extraction (this entry is
  A; C follows separately). Worktree D remains design-only; the conflict program remains
  governed by its own audited seven-PR decomposition. Release record:
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md`.

- **2026-08-24 (QF-C landed — analysis-eval control plane; release-train stage 3c)** Worktree C
  landed as its own PR after QF-A: the 17-commit strand
  (`codex/analysis-eval-control-plane-20260817`, own delta from `05fdd2c`) rebased onto
  post-QF-A `main` `d4557c4` — conflict ledger EMPTY, `range-diff` 17/17 byte-identical to
  the audited tree (audit verdict for C: "READY as offline machinery", `858bb9a`) — plus
  two declared carries from the QF integration line (H5): a byte-identical patch of
  `ba35082` (recency probe onto QF-A's canonical calculator; fixtures re-pinned to
  linear-interpolation percentiles) and the QF tip's `.env.example` eval-cap block,
  corrected at landing after the A1 review caught its fail-closed overstatement (only
  `EVAL_USD_CAP_DAILY` + the shared `LLM_SPRINT_USD_CAP` backstop fail closed; the request
  caps are bounded in-code defaults 300/200). **H4 resolved: no runtime behavior change** —
  the `map-worker.ts` touch is the pure `mapOutTokensPerDoc()` accessor extraction and the
  `llm-match.ts` touch the pure export + `sanitizeMatches()` extraction, both byte-verified
  against `main`'s lease/#86-era code with suites green; the plan's no-standalone-soak line
  therefore stands. Ruling 4 verified directly: `eval-guard.ts` refuses everywhere while
  `EVAL_USD_CAP_DAILY` is unset, and **no `EVAL_*` env exists in any Vercel environment**,
  so live/paid evaluation remains impossible after any deploy until the operator sets caps
  (adjudication plan §6; the audit's 11-item pre-paid-eval hardening list is stage-5 work
  bound by A14-F1 to cover both the QF and conflict report paths after the conflict
  eval-profile PR). Independent adversarial landing review (5 lenses, adversarial
  verification): ONE confirmed doc-only finding (the `.env.example` overstatement), fixed
  at landing; one refuted; all other verifications affirmatively clean. Gates on the exact
  landed tree: typecheck/lint clean · unit 2,518/2,518 (188 files) · integration 119/119
  (19 files, disposable Neon fork) · H1 + lease/spend pins 69/69 · pre-push green. No
  migration. Deploy: not performed; QF-C can ride the next authorized deploy (rollback
  target `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`). Release record:
  `docs/reviews/QF-C-ANALYSIS-EVAL-RELEASE-2026-08-24.md`.

- **2026-08-24 (conflict evaluator landed — seven reviewed PRs, default-off; release-train
  stage 4)** The audited conflict/region evaluation program (runtime `a2ddca8`, audit
  `da44272`, base `7150b49`) landed as the audited seven-PR decomposition (P7 report
  §5.1): PRs #16–#22, merges `dd310c7`/`bc2e6b2`/`4cf0a75`/`b687b63`/`77369ad`/`3e37b52`/
  `e359c61`, each PR's files checked out from the audited FINAL trees with per-blob hash
  verification, PR 5 landed after QF-C against the byte-identical
  `scripts/analysis-eval.ts` (+281/−4 additive). **End-state fidelity: all 125 files of
  the conflict delta on merged `main` are blob-identical to `a2ddca8` (or `da44272` for
  the three audit-updated docs).** Recorded deviations: `eval-profile`(+test) PR 1→4 and
  `snapshot-ref`(+test) PR 5→4 (final-state dependency order, import-graph-proven); the
  gated evidence route deliberately has NO `authz-page-gate` ROUTES row — its body-leak
  assertions run flag-on in `conflict-feature-off.itest.ts` (binding migration obligation
  if that harness retires). Ruling 21 verified on every page (gate first, before any data
  access; the evidence page awaits `requireAcceptedUser()` first). The audit's own
  decision-log entry was carried verbatim above (chronological carry, original date).
  Full combined gates on `e359c61`: typecheck/lint clean · unit 3,329/3,329 (231 files) ·
  integration 151/151 (21 files, incl. both conflict itests' flag-on/flag-off body-leak
  assertions on a real production build). Landed DORMANT: `CONFLICTS_UI` absent in every
  Vercel environment (verified); enablement requires the final-audit checklist (incl.
  F-NEW-6 `FEATURE_AUTH_GATE` coupling) + a decision-log entry; the shadow soak stays
  blocked on the five recorded blockers; paid conflict evals share the QF §6 gate; the
  MAP activation hard lock is untouched. Deploy NOT performed. Landing record:
  `docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md`.

- **2026-08-24 (pending-merge adjudication closeout — the release train is landed;
  deploys await the operator)** The operator's 2026-08-25 adjudication plan executed end
  to end in one session under its A1–A10 execution addendum: PR #12 merged after
  adversarial repair (its +4h self-clock error corrected — the Neon serverless driver
  serializes timezone-naive timestamps as local ET with a bogus `Z`; never ask the DB the
  time through that path, compare epochs); the five §5.1 disposals executed with
  lossless-deletion proofs (PR #13 salvage merged; PR #3 closed superseded); QF-A and
  QF-C landed by audited-strand extraction (PRs #14/#15); the conflict evaluator landed
  default-off (PRs #16–#22); `claude/local-model-ask-eval-20260817` and
  `claude/business-planning-20260817` stay parked per plan §5.5. Zero paid calls, zero
  production writes, zero env/cap/cron/migration changes, zero deploys by this session.
  §6 paid-evaluation gate: conditions 1–2 met, 3–5 open — **paid evals remain BLOCKED**.
  Four plan corrections recorded in the register (`ba35082` provenance; the no-ROUTES-row
  design; `a2ddca8` = p7 tip + 11 remediation commits; the `.env.example` carry).
  Full register + operator action list (deploy authorization requests with rollback
  targets, §7 uncommitted-docs recommendation, package-manager question, hygiene list):
  `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md`.

- **2026-08-24 (release-train deploy + governing prompts — operator-authorized)** The
  operator authorized the register §9.1 deploy and the §6 governing-prompts
  recommendation. Executed: (1) PR #24 tracks the three governing prompts (both
  2026-08-18 final-audit prompts + the 2026-08-25 adjudication plan with its A1–A10
  addendum; secret scan clean; audit-G1 precedent). (2) Production deploy of `main`
  `143964a` from the plain release clone (`vercel deploy --prod --scope vociferous`;
  the clone was link-initialized first — the CLI appended only a `VERCEL_OIDC_TOKEN`
  line to its `.env.local`, nothing overwritten): **`dpl_FPYase3HqbCF3d2uW3AnwPHibyt4`**,
  target production, READY, aliased to bnow.net; `/health` 200, commit stamp `143964a`,
  DB OK. **No env change of any kind** — `CONFLICTS_UI` stays absent everywhere,
  `FEATURE_AUTH_GATE=true` in Production, no `EVAL_*` vars, all caps untouched.
  Smoke (read-only GETs, PASS): all five conflict paths bare+`RSC: 1` carry zero
  conflict tokens in any body (bare 404s; the gated evidence route 307s because
  `requireAcceptedUser()` is the page's first statement); `/search`, `/entities`,
  `/digests/ru` anonymous bare+RSC bodies carry no privileged tokens; `/` 200.
  **Rollback target: `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`** (the pre-train #86-repair
  release). QF-A's observation window OPENED ~2026-08-24T23:45Z: watch ≥1 complete
  day/digest cycle (02:00 finalize + 04:00/10:00/19:30 intraday) for additive
  `structured.stats.evidenceRecency` keys on newly persisted digests with zero change
  to published events/claims; the funnel report stays a read-only operator tool. The
  conflict surfaces remain dormant; enablement, shadow soak, and paid evals stay
  separately gated (register §9.3/§9.5).

- **2026-08-27 (QF-A observation CLOSED — PASS; #88 CLOSED — PASS; standing-state
  reconciliation; docs only)** A read-only production check-in (SELECT-only `sqlq.ts`,
  the read-only funnel report, anonymous GETs, `vercel inspect`; DB instants derived from
  epochs — the driver's +4h bogus-Z rendering was reproduced live and avoided) adjudicated
  the window the 2026-08-24 deploy opened. **QF-A: PASS.** Digest dates 08-24→08-27:
  44/44 digests present (11/day, all `generated`), **44/44 carry additive
  `structured.stats.evidenceRecency`**, and reconciliation is exact on all 44
  (`claimCount` = relational claims; `documentCount` = distinct non-stub cited docs);
  ru/military + ir/military + ir/nuclear funnel reports ran warning-free (ru/mil 08-27:
  1,270 reduce claims → 841 groups → 200 fed → 5/5 votes → 5 events → 11 claims / 60 cited
  docs, 100% timestamp coverage, p90 evidence age 20.1h, 0 stale >48h). QF-A is additive
  by implementation and tests; production showed no structural or relational drift
  attributable to it (no claim of byte-identical prose). **#88: acceptance met** — the
  scheduled 2026-08-25T02:02Z finalize produced the first natural mapreduce digests since
  2026-08-16 (zero reduce spend 08-17→08-24 pins the resumption; no manual invocation or
  `FORCE_REGEN` observed — the thin-regen guard actively refused two overwrites in-window),
  and the 6-mapreduce/5-legacy matrix has held for four consecutive digest dates with
  `openai_reduce` back in its ≈$0.10–0.30/day band. Operational window otherwise clean:
  zero `ok=false`/`error`/`budgetStopCategory` on any job, and zero nested
  `errors`/`batchErrors` on every map and digest run, since 08-24T00:00Z; `map_health`
  `episodeKey` null; one hung `ingest:telegram`
  row 08-27T18:01:42Z (timeout signature → #98 evidence); `openai_map` $19.5311 of $40;
  **`x_api` $57.6724 of $75 → new #101** (operator cap decision; point-in-time ~17-day
  projection). #87/#97/#98/#84 stay OPEN with corrected wording (#97's reduce sites are
  live again — next code PR). Deployment creation instant corrected to
  **2026-08-24T23:56:34Z** (`vercel inspect`; the "~23:45Z" above was an approximation).
  Standing sections corrected in place: AGENTS.md (Live/repository, Candidate-B lineage
  stamp, Analysis, Next steps), `docs/CURRENT-STATE.md` (full refresh),
  `docs/OPEN-TASKS.md` (#84/#87/#88/#97/#98 + new #101), register §11 appended. **This
  closeout performed no deployment, no environment/cap/model/cron/flag change, no
  migration, no paid provider call, and no production write**; production remains
  `dpl_FPYase3HqbCF3d2uW3AnwPHibyt4` / `143964a`, `main` docs-only ahead. Report:
  `docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-CLOSEOUT-2026-08-27.md`.

- **2026-08-27/28 (reliability release queue + dormant eval/conflict landings —
  operator-authorized roadmap)** One overnight session executed the authorized roadmap:
  **seven PRs merged (#27–#33), four SERIAL observed production releases, three dormant
  landings, zero manual paid calls, zero env/cap/flag/cron/migration changes.** Runtime
  queue (each: standard gate → fresh-context review → fixes → re-review → checks →
  merge → plain-clone deploy → /health+DB+authz verification → natural observation →
  rollback checkpoint): **R0** PR #27 `ed9bc35` → `dpl_62NHUKhDGVL6S6Xp7YbvYMuZ23mx`
  (#97 reduce site; baseline: old-vs-new differs on ZERO of 157,765 current claims —
  defensive; observed PASS incl. the 02:00Z finalize's exactly-30 reduce requests
  = 6 cells × K=5 through the new code, $0.0450, 1 expected thin-regen refusal). **R1** PR #28 `afbf06e` →
  `dpl_H7uqWF3DhToY7ufouNBSeSkYLaWH` (#87 mechanical digest fix; baseline: 61
  malformed doc lines/14d under old code; 04:00Z intraday observed clean). **R2**
  PR #29 `ad6e078` → `dpl_5ocJPF4GLPHDFB4Cv3MB4tgkScou` (#87 degraded-run
  classification; 7 post-deploy runs, 0 spurious flips; one transient Vercel CLI
  "Not authorized" cleared on retry, no auth change). **R3** PR #30 `b62da02` →
  **`dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` (current production)** (#98 sweep; NATURAL
  proof: 9 dead historical rows swept incl. the real 08-27T18:01:42Z telegram hang,
  zero false sweeps). **#87 CLOSED** (flip synthetic+wiring-proven; first natural flip
  future-observable), **#98 CLOSED** (natural proof obtained), **#97 re-scoped OPEN**
  (Ask family next). Dormant landings after the queue: PR #31 `2c1eac5`
  (capacity-profile harness + matrix dry-run + SCI-N6 both sides + env-knob surfacing),
  PR #32 `5643b72` (10/11 QF-C close-before-paid items; item 6 rides corpus-v2),
  PR #33 `bf0061b` (conflict soak §5/§5.1 instruments; partial-verdict policy
  deliberately deferred to register #12.3) — `main` `bf0061b` is dormant-eval ahead of
  production by design; paid evals remain BLOCKED (no `EVAL_*` env; §6 gate);
  conflict soak remains blocked on its eight §8 gates. Final gates on merged `main`:
  typecheck/lint clean · unit 3,421/3,421 (239 files). Docs landed with this entry:
  `RELIABILITY-RELEASES-2026-08-28.md` (release+observation record),
  `OPERATOR-DECISION-PACKET-2026-08-28.md` (X cap #101 ~15-day runway is the nearest
  deadline; #94 override removal; hygiene; npm/pnpm; §6 paid-eval; conflict gates;
  corpus-v2 review), `docs/designs/MODEL-PROMOTION-READINESS-2026-08-27.md` (prepared,
  not executed), and `docs/designs/HUMAN-ADJUDICATION.md` carried from the parked QF
  branch (register §9.4 discharged). The dirty primary checkout was untouched
  throughout; every deploy came from the plain release clone.

- **2026-08-29 (#97 Ask-family release — merge, deploy, observation CLOSED PASS)**
  Resumed session executed the authorized finite tail of the Ask-family release.
  Baseline reverified exactly (PR #35 open at `f3d45b4`, checks green, main `ff9a7f1`,
  production `b62da02` healthy, zero `EVAL_*`/`CONFLICTS_UI` in all three envs); the
  2026-08-28 19:30Z predeploy gate PASSED (run 10379: ok, 0 errors, 11 digests in the
  8–11 band; 166 post-#98 runs with zero failures/unfinished/errors; sweeps still the
  nine historical rows; OpenSanctions monthly_cap classified known-bounded). PR #35
  merged as **`6ba72b5`** (parents `ff9a7f1`+`f3d45b4`; diff re-inspected = reviewed
  scope; merged tree BYTE-IDENTICAL to the reviewed head, so the branch integration/
  build evidence carries). Release-clone preflight: whitespace/typecheck clean, lint 0
  errors, unit 3,451/3,451 (239 files). Deployed once (no retry needed) as
  **`dpl_FT3Hdpt2ece4kxQHudxT2FST162p`** (created 01:29:35Z, ~45s build, aliased
  bnow.net; `/health` stamps `6ba72b5`, DB OK). Smoke: authz matrix bare+`RSC: 1`
  bodies token-clean (all grep hits classified benign — e.g. "claim" inside
  "disclaimer", nav "Sanctions" label, router path echoes); conflict surfaces
  fail-closed; five Ask free-GET shapes (incl. astral-boundary and array `?q=`)
  produced ZERO ask_runs/ask_usage/reservation/provider deltas. Observation
  01:30→07:12Z closed PASS: 50 scheduled runs clean; 6 map cycles 0 batchErrors,
  leases clean; 02:00Z finalize (10 digests, 1 expected `ae thin-regen` refusal),
  04:00Z intraday, 07:00Z validate (3 validated / 0 unvalidated) all on the new
  release; engine mix 6 mapreduce + 5 legacy gulf, in band; runtime-error scan shows
  only the known #69 GramJS noise. One monitor false-positive ("DB not OK") was
  diagnosed as a raw-HTML substring artifact (React splits "DB "/"OK" text nodes),
  production verified healthy, and the probe corrected — no anomaly existed. NO
  natural paid Ask occurred: the live money-path traversal of `normalizeAskQuestion`
  is FUTURE-OBSERVABLE (construction test-pinned; no paid Ask manufactured, per
  authorization). Zero manual paid calls; zero production writes beyond scheduled
  pipelines; env/caps/flags/models/crons/DB config, the dirty primary checkout, the
  PR worktree, and the corpus-v2 drafts (26-case packet) all untouched. #97 stays
  OPEN — remaining sites: `embeddings/client.ts`, `validation/llm-match.ts`,
  `anthropic-provider.ts` (inert, #83), plus the documented flag-off sessions
  residuals. X refresh: $59.12 of $75 (~14–15 days runway; #101 unchanged as the
  nearest operator deadline). Report: `docs/reviews/ASK-FAMILY-RELEASE-2026-08-29.md`.
