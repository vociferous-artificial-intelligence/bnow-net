# Iran validation recovery — implementation & recovery note (started 2026-08-15)

Prompt: `docs/prompts/2026-08-15-iran-validation-recovery.md`. Branch:
`claude/iran-validation-recovery-20260815` (isolated worktree from `origin/main` = `e66438b`,
which includes the undeployed ruling-21 authorization repair). Production at audit time:
`441ee09` / `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC`.

Authorization (operator, 2026-08-15, recorded in the prompt): bounded unattended recovery —
effective map all-time ceiling $10→$40; temporary map daily cap $4→$20 expiring at the earlier
of recovery completion or 2026-08-17T13:00:00Z; ≤$20.00 new recovery-attributable paid usage
from a timestamped baseline; production writes for Iran ISW citation load, Iran map backfill
2026-07-30→last complete UTC day, Iran digest regeneration + validation reruns, ≤6 reviewed
source activations; ≤3 production deploys; push feature branch + draft PR only.

## Workstream A — read-only audit (all evidence 2026-08-15, UTC)

Every query below ran read-only against the production DB (scripts/sqlq.ts) or public
surfaces; zero writes, zero paid calls. One deviation recorded under "Incidents".

### A1. Deployment / code

- `GET https://bnow.net/health` at ~18:00Z: build **441ee09**, `data-dpl-id`
  **dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC**, DB OK — matches AGENTS.md current state.
  Production remains BEHIND `main` (ruling-21 repair merged, undeployed).
- Local `main` == `origin/main` == `e66438b`. Shared tree dirty with the 2026-08-14 docs
  closeout (preserved untouched); this work happens in an isolated worktree.

### A2. Cap envs (presence audit via `vercel env ls production`; values not printed)

Present in Production: `LLM_SPRINT_USD_CAP`, `MAP_USD_CAP_DAILY`, `MAP_DAILY_REQUEST_CAP`,
`MAP_RUN_DOC_CAP`, `MAP_CONCURRENCY`, `REDUCE_USD_CAP_DAILY`, `LLM_DIGEST_USD_CAP`,
`ASK_USD_CAP_DAILY`, `EMBED_USD_CAP_DAILY`, `DIGEST_ENGINE`, `OPENAI_API_KEY`, `CRON_SECRET`.
`LLM_DISABLE` absent (LLM paths enabled). The `MAP_*` values are Sensitive (unreadable via
CLI); known values from the decision log + observed behavior: `MAP_USD_CAP_DAILY=4`
(2026-07-09 entry), `LLM_SPRINT_USD_CAP=10` (proven by the refusal string "cap $10"),
`MAP_RUN_DOC_CAP=1000` (every stopped run selects exactly 1000). `MAP_DAILY_REQUEST_CAP`
value unknown — treated as a possible binding rail during recovery (stop classification
distinguishes it at runtime).

### A3. Shared all-time backstop audit (`provider_usage`, all history)

| provider | total USD | requests | first day | last day |
|---|---|---|---|---|
| openai_map | **10.0083** | 9,556 | 2026-07-09 | **2026-07-29** |
| openai_reduce | 3.8332 | 2,615 | 2026-07-09 | **2026-07-30** |
| openai_digest | 1.2039 | 1,142 | 2026-07-09 | 2026-08-15 |
| openai_ask | 0.4468 | 72 | 2026-07-12 | 2026-07-21 |
| openai_embed | 0.0040 | 1,465 | 2026-07-12 | 2026-08-15 |
| llm_match | 0.1286 | 940 | 2026-07-07 | 2026-08-15 |
| x_api | 44.4291 | 32,765 | — | 2026-08-15 (own caps) |
| opensanctions | 258.6100 | 2,351 | — | 2026-08-15 (own caps) |

SpendGuard compares each provider's OWN all-time total to the shared `LLM_SPRINT_USD_CAP`
value (`spend-guard.ts` load is `WHERE provider = $1`). **Only `openai_map` is parked at
$10.** Raising the shared env to 40 would not reopen a parked provider, but WOULD grant
+$30 lifetime headroom to every other OpenAI path — more than $1 of unrelated incremental
exposure. **Decision: map-specific `MAP_SPRINT_USD_CAP` (fail-closed fallback to
`LLM_SPRINT_USD_CAP`), `LLM_SPRINT_USD_CAP` stays 10 for everything else.**

### A4. Root cause reconfirmed (cron_runs)

- First budget-stopped `job='map'` run: **2026-07-29 08:40:34.395Z** (also the last
  productive run — it worked, then crossed the cap mid-run).
- Budget-stopped map runs 07-29 → audit instant: **418**, every one `ok=true` (the
  observability defect). Latest (id 7565, 17:40Z): selected=1000, batches=57, llmCalls=0,
  claims=0, `budgetStop: "llm: budget stop — openai_map: total spend $10.0083 >= cap $10"`,
  processedMarked=0 — correct fail-closed money behavior, invisible as failure.
- Consequence chain confirmed: `openai_reduce` last spend 07-30; Iran military digests flip
  provider `openai:gpt-4o-mini+mapreduce` → `openai:gpt-4o-mini` (legacy fallback) at
  2026-07-30, claims/day 8.8→~3; **2026-07-31 has NO ir/military digest row** (the persist
  guard refuses empty creations; digest crons that day were green).

### A5. Backlog (map-eligible: processed=false, len≥40, non-stub, day≥2026-07-04)

ir **51,649** (oldest 07-29) · ru **58,005** · ua **20,388** = **130,042** docs.
Pre-07-29 ru/ua stragglers total ~720 (omission/truncation leftovers; drained by the same
recovery). Current extractor versions unchanged since sprint 2 (military ru/ua d73cc83ed8df,
ir 75e0ff6403db, elite 15a6078371bd, nuclear 19c06260f149) — no version drift, no remap.

### A6. Dry-run cost estimate (zero-write `runMapCycle` dry runs, per day × theater)

07-29→08-14 modelled: **ir $1.4152 (49,927 docs / 13,130 pairs) · ru $5.9810 · ua $1.5140 =
$8.9102 all theaters**. The model historically runs ~35–40% above actuals
(MAP-SHADOW-RESULTS: $2.59 modelled vs $1.61 actual), so expected actuals ≈ **$5.5–6.5**
for the whole backlog, of which Iran ≈ **$0.9–1.1**. Forward inflow ≈ $0.55/day modelled
(~$0.35 actual) across all theaters. Reduce regeneration for ~16 Iran dates ≈ $0.5–1.3
(openai_reduce headroom under its unchanged $10 backstop: $6.17). Validation reruns ≤$0.05.
**Envelope model: base ≈ $8–10 actual, high ≈ $13–14 — under the $16 base / $20 high stop
triggers.** The recovery-attributable measurement baseline will be recorded immediately
before the first paid action (Preflight 1).

### A7. Digest / validation matrix (ir, military, ISW date basis)

Coverage since 07-23: 83.3 (07-23) · 20.0 · 25.0 · 66.7 · 66.7 · 14.3 · 33.3 (07-29) ·
[07-30/07-31/08-01 no validation run] · 20.0 · 20.0 · 16.7 · 0.0 · 10.0 · 0.0 · 50.0 ·
66.7 · 25.0 (08-10) · [08-11..13 no run] · 0.0 (08-14). All runs matcher=llm-majority.
Missing-run days: 07-31 has no digest (empty-refusal); 07-30, 08-01, 08-11..13 have no
`isw_reports` row — ISW publication gaps or slug-variant probe misses; Workstream F will
validate only dates with a real same-day report.

### A8. ISW Iran registry freshness

`isw_reports` theater='ir': 1,054 parsed (newest **2026-07-03**), 36 pending (newest
2026-08-14), 12 failed (old). All 20 reports 2026-07-20→08-14 are
`pending / endnote_count=0 / citation_count=0`. Root cause (code): the validation path
(`src/lib/validation/run.ts:78-82`) auto-inserts `pending` rows and extracts takeaways only;
`parseReport` (the endnote parser) has NO runtime caller — citations only ever load via
manual `scripts/isw-load.ts` + `scripts/registry-materialize.ts`, last run 2026-07-03 for
Iran. The registry's 90-day roster window anchors on `max(report_date)`, which pending rows
DO advance — so every unparsed day decays the registry-derived X/Telegram rosters.

### Incidents / deviations during the audit

- **Stranded advisory lock (self-inflicted, cleared):** local dry runs over the POOLED Neon
  endpoint stranded the map worker's session advisory lock (0x6d617031) on an idle pgbouncer
  server connection, which made subsequent cycles report `skipped`. Detected via `pg_locks`;
  cleared by terminating the idle pooler backend (pid 1967); verified 0 advisory locks held.
  No data mutation. Follow-up estimate runs used a janitor that clears only holders idle
  >30s. Noted as latent operational trap: production's own DATABASE_URL goes through the
  pooler as well; steady-state has not exhibited it, but the same strand would silently turn
  hourly map runs into `skipped` no-ops. Recorded as debt (see Remaining risks).
- `.env.local`'s `DATABASE_URL_UNPOOLED` credentials are stale (auth fails) — worth an
  operator refresh; not needed for this task.

## Workstream B — map budget-stop observability (built 2026-08-15)

- **Guard (`src/lib/usage/llm-guard.ts`):** `mapTotalUsdCap()` = `MAP_SPRINT_USD_CAP` else
  `LLM_SPRINT_USD_CAP` else fail-closed null — the map ceiling can rise without granting a
  cent of headroom to digest/reduce/ask/embed/match (tests pin all three guards).
  `mapDailyUsdCap(now)` gains the auto-expiring recovery override
  (`MAP_USD_CAP_DAILY_OVERRIDE_USD` + `_UNTIL`): applies strictly before the UNTIL instant,
  requires an explicit timezone, cannot enable a fail-closed base, reverts with no redeploy.
  `LlmBudgetError` now carries the machine-readable `reserveCode`;
  `stopCategoryOfCode()` added to spend-guard.
- **Worker (`map-worker.ts`):** counts now include `budgetStopCode` + `budgetStopCategory`
  (run_cap | daily_cap | total_cap | monthly_cap | cap_unset | not_initialized).
- **Route (`api/cron/map/route.ts`):** any non-run_cap stop THROWS inside withCronRun →
  `cron_runs.ok=false` with the stop reason as the error — then returns a structured
  `{ok:false, unhealthy:"budget_stop", budgetStopCategory, counts}` body. Steady runs also
  call the new map-health check; `?date=` backfill runs classify but do not alert (the
  driver paces them); dry runs stay zero-write/zero-paid/absent from cron_runs.
- **Health (`src/lib/analysis/map-health.ts`):** x-health-pattern pure evaluator — episode
  key from sorted problems (budget_stop_total/daily, cap_unset, stale_<theater>), one alert
  per episode + cooldown (`MAP_ALERT_COOLDOWN_SEC`, 6h default), single recovery notice;
  per-theater freshness under CURRENT extractor versions (newest eligible doc day vs newest
  doc_map_state day; `MAP_STALE_DAYS` default 2; a version bump with no remap reads as
  stale by construction); email via FEEDBACK_EMAIL/Postmark with safe fields only; outcome
  recorded numerically in cron counts (auditable when email is absent); state in
  provider_state `map_health`. Monitor never throws into the job.
- **Driver (`scripts/map-backfill.ts`):** `--theater` (Iran-only recovery cannot estimate
  or pay for other theaters), typed stop classification (run_cap continue; daily_cap abort
  resumable or `--wait-daily` sleep to next UTC day; total/unset abort for operator),
  bounded transient-transport retries, mid-drain operator-budget abort.
- **Tests:** 69 new unit tests across llm-guard/map-health/route/driver — including the
  mutation-critical route test that runs the REAL withCronRun over a mocked @/db and
  asserts the `ok` value written to cron_runs — plus `map-budget-stop.itest.ts`: the real
  runMapCycle on a production-fork branch with the guard forced into refusal — zero LLM
  traffic, LLM-needing docs stay processed=false, mirrors/zero-track docs still disposition,
  ledger unmoved, and a rerun re-selects exactly the pending docs.

## Workstream C — ISW citation auto-refresh (built 2026-08-15)

- **`src/lib/isw/load.ts`** (new single upsert authority): `loadParsedReportById` writes
  isw_reports BY ID (sidesteps the url/(theater,date) two-unique-index trap), sources
  ON CONFLICT (canonical_url) DO NOTHING, citations ON CONFLICT (report_id, raw_url,
  endnote_index) DO NOTHING; honest parse_status (a parse failure NEVER downgrades an
  already-parsed report — `kept_prior`); incremental `refreshSourceStats` upserts
  (source_id, theater) rows + global sources aggregates for TOUCHED sources only — no
  destructive window. `refreshReportCitations` = never-throws wrapper for the hook.
- **Hook (`src/lib/validation/run.ts`):** immediately after the validation fetch and BEFORE
  the takeaway early-return — the same in-memory HTML, zero extra requests, works on
  Vercel (no disk cache there). Outcome (action + counts only) audited in
  validation_runs.details.citationRefresh.
- **Slug variants:** `iranUpdateUrlCandidatesForDate()` probes special-report /
  evening-special-report / morning-special-report / plain shapes in likelihood order
  (corpus frequencies 131/17/13/928); the six undiscovered August days were plausibly
  variant-published. validateDigest discovery loops candidates.
- **`scripts/isw-refresh.ts`** (new runbook tool): drains pending (optionally failed)
  reports oldest-first through politeFetch (disk cache, 2.1s host spacing, BNOWBot UA) +
  the shared loader; `--discover --from --to` probes slug candidates for dates with no row
  and inserts ONLY after a real 200 page — publication gaps are never manufactured;
  `--dry` is DB-zero-write. `scripts/registry-materialize.ts` phase 1 now runs DELETE +
  rebuild in ONE transaction (no empty-stats read window).
- **Fixture/tests:** real Iran Update 2026-07-24 HTML fixture (432KB; parses 10+ endnotes);
  10 unit tests (parse shape, multi-URL endnotes, hedging enum/cue bounds, idempotent
  replay, kept_prior on failure, honest failed status, LEGAL negative — no persisted param
  carries prose, upsert-only stats) + `isw-citation-refresh.itest.ts` (real Postgres:
  load → verify rows/stats → replay inserts zero → parse failure keeps state).

## Workstream D — source evaluation and roster (2026-08-15)

Recon: 32 polite read-only requests (BNOWBot UA, per-host spacing) + registry baseline.
Registry ir-citation counts (pre-refresh, newest parsed report 2026-07-03):

| candidate | ir citations | feed found | robots | verdict |
|---|---|---|---|---|
| shafaq.com | **1,398** | `/{lang}?rss=1` exists | **robots.txt DISALLOWS the feed roots** | **REJECT (robots)** — highest-value blocked candidate; operator outreach recommended |
| mehrnews.com / en.mehrnews.com | 301 / 139 | en.mehrnews.com/rss, 200 XML, hourly-fresh | clean | **ACTIVATE** as `en.mehrnews.com` (the feed's item links; the fa-site identity `mehrnews.com` + the `t.me/mehrnews` pin remain separate identities by design) |
| alaraby.co.uk / newarab.com | 239 / 168 | `/rss/politics`, 200 XML, minutes-fresh, 325KB | clean | **ACTIVATE** politics-section feed (root /rss is a 1.1MB full-site feed incl. sports — rejected to avoid corpus pollution) |
| presstv.ir / presstv.co.uk | 167 / 1 | presstv.ir 301s (broken TLS) → presstv.co.uk/rss.xml; feeds item-identical; item links stay presstv.ir | none declared | **REPAIR** existing entry's transport URL → .co.uk; sourceKey stays presstv.ir (no canonical split; the feed had been silently dead) |
| alhadath.net | 87 | none (`/rss` 403-with-HTML) | clean | REJECT (no feed) |
| majalla.com / en.majalla.com | 61 / 10 | none (no RSS exists; sitemap only) | clean | REJECT (no feed; a sitemap crawler is a different adapter — future work) |
| almasdaronline.com | 47 | Cloudflare JS challenge on every path | unreadable | REJECT (bot-walled) |
| radiofarda.com | 46 | `/api/` Pangea feed, 200 XML, fresh | `/api/` not disallowed | **ACTIVATE** (lang fa; fa→ir routing exists but the entry pins ir explicitly) |
| 964media.com | 33 | `/feed` answers JSON "Access denied, contact us" | main feed not disallowed | REJECT (gated; needs outreach) |
| sanaacenter.org | 22 | `/feed` WordPress, 200 XML | clean | **ACTIVATE** (weekly cadence; Yemen think-tank depth, near-zero cost) |
| sabanew.net | 13 | `/rss.php?lang=ar`, 200 XML, same-day items | permissive (no UA rules) | **ACTIVATE** (Aden-government Saba — attributed primary voice for the Yemen axis; marginal citation count acknowledged, named priority in the tasking) |

Activated roster = **5 new feeds + 1 transport repair = 6 slots** (the authorized maximum):
en.mehrnews.com (en), radiofarda.com (fa), sabanew.net (ar), sanaacenter.org (en),
alaraby.co.uk (ar politics), presstv.ir URL repair. All Arabic/Persian entries pin
`countryIso2:'ir'` explicitly (coverage lens, ruling 11). State-affiliated outlets
(Mehr, PressTV; Saba is government-side) are attributed primary voices — reliability
remains ISW-citation-derived. Fixtures saved from the live probes; 10 tests pin parses,
canonical keys, exact ir roster, theater pins, and dead-feed isolation (a dead/HTML feed
cannot suppress the rest of the adapter pass). Direct-document overlap: zero
raw_documents from these domains since 2026-07-15 (presstv feed dead; others never
configured); indirect overlap via X/Telegram reposts remains unmeasured — acknowledged.

## Mandatory preflight 1 — cap and paid-recovery envelope (recorded 2026-08-15)

- **Current caps:** `MAP_USD_CAP_DAILY=4` (decision-log value; env Sensitive/unreadable),
  `LLM_SPRINT_USD_CAP=10` (proven by the refusal string), `MAP_SPRINT_USD_CAP` absent,
  override envs absent. `MAP_DAILY_REQUEST_CAP` value unknown (Sensitive) — treated as a
  possible binding rail; the driver's daily_cap classification handles it at runtime, and
  a request-rail stop only stretches the drain across UTC days, never overspends.
- **Settled usage / reservations:** per-provider all-time totals in §A3; the Ask
  reservations ledger holds no open openai_map reservations (reservations are Ask-scoped).
- **Backlog:** §A5 (ir 51,649 / ru 58,005 / ua 20,388 docs).
- **Dry-run estimate (§A6):** backlog modelled $8.91 all theaters (ir $1.42); model runs
  ~35–40% over actuals ⇒ expected actuals $5.5–6.5; + weekend inflow (~$0.35–0.55/day) +
  Iran digest regeneration via openai_reduce ($0.5–1.3, inside reduce's untouched $10
  backstop headroom of $6.17) + validation ≤$0.05. **Base ≈ $8–10, high ≈ $13–14 — under
  the $16 base / $20 high stop triggers.** Ceilings are permissions, not targets; the
  drain stops when the corpus is current.
- **Shared-cap audit verdict:** raising shared `LLM_SPRINT_USD_CAP` would grant +$30
  lifetime headroom to digest/reduce/ask/embed/match (>\$1 unrelated exposure) ⇒
  **map-specific cap required**: `MAP_SPRINT_USD_CAP=40`, `LLM_SPRINT_USD_CAP` stays 10.
- **Daily-cap mechanism:** `MAP_USD_CAP_DAILY` stays 4 and is never edited. The elevation
  is `MAP_USD_CAP_DAILY_OVERRIDE_USD=20` + `MAP_USD_CAP_DAILY_OVERRIDE_UNTIL=
  2026-08-17T13:00:00Z` (Production only) — the guard reverts to $4 at that instant BY
  CODE with no redeploy (test-pinned, incl. the exact boundary and the rule that an
  override can never enable a fail-closed base). Early completion ⇒ remove both override
  envs + env-only redeploy. Restoration is therefore guaranteed two independent ways.
- **Envs to change:** `MAP_SPRINT_USD_CAP=40` in Production+Preview+Development (ruling-4
  pattern; fail-closed anywhere it's missing), the two override envs in Production only.
  All three added PLAIN (readable) so rollback/read-back is provable; values are cap
  values, not secrets (the decision log has always recorded caps openly).
- **Artifact:** an env-only redeploy of 441ee09 CANNOT establish the $40 map ceiling (the
  deployed guard only reads the shared env, and raising the shared env is ruled unsafe
  above) ⇒ the recovery deploy is the fully tested release from this branch (which also
  ships the ruling-21 authorization repair already merged to main, the observability fix,
  the citation auto-refresh, and the reviewed roster). Deploy #1 of ≤3.
- **Rollback:** code → redeploy `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC` (441ee09); envs →
  remove the three new plain vars + redeploy; data → backup branch (below) retained.
- **Stop conditions armed:** base>\$16 / high>\$20 (not met), settled+reserved reaching $20
  during the drain (driver aborts; envelope checked each round), all-time stop, unexpected
  daily stop, version drift, repeated no-progress, cost variance beyond the estimate band.
- **Baseline:** the timestamped provider_usage snapshot is taken immediately before the
  env change + deploy (the first paid action follows the deploy); recorded below.

## Mandatory preflight 2 — citation load + source activation (recorded 2026-08-15)

- **Historical load scope:** 36 pending Iran reports (2026-07-04→08-14) + discovery for
  dates with no row. Dry discovery already proved 2026-07-30/07-31/08-01 EXIST at the
  plain special-report slug — the production probes those mornings must have failed
  transiently, so several "missing ISW days" are recoverable, not publication gaps.
- **Idempotency proof (disposable branch `br-aged-mountain-atiqvfwi`, deleted):** first
  run parsed 07-04/05/06 (36/14/35 endnotes, 49/24/50 citations inserted, 32/14/29 stats
  rows); a forced replay of 07-04 re-parsed 57 citations and inserted **0** with zero
  stats churn. Unit + integration tests additionally pin replay, kept_prior on parse
  failure, and the no-prose legal negative.
- **Roster delta:** §Workstream D table — 5 activations + 1 transport repair (= 6 slots),
  4 rejections with reasons; expected incremental volume ≈ 100–200 docs/day (mehr ~30 +
  farda ~20 + saba ~20 + alaraby ~35 per poll window, sanaa weekly), map cost ≈
  $0.01–0.02/day at $0.076/1K — immaterial against the daily cap.
- **Migrations:** none (no drizzle/ change anywhere in this work).
- **Deployment/rollback:** roster ships with the single release deploy; feed rollback =
  revert the config entry (or the whole commit) + redeploy; sources/citations created by
  the load are additive registry data protected by the backup branch.
