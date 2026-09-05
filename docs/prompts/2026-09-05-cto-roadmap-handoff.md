# BNOW.NET technical roadmap — CTO handoff for planning sessions (2026-09-05)

Status of this document: a formalized big picture plus per-workstream briefs, written for a NEW
Claude Code session whose job is to produce detailed, executable plans for each step — not to
execute them. Everything factual below was verified against `origin/main` @ `883e5e3` (2026-09-04)
and the two open PRs (#47, #48) on 2026-09-05; file paths are cited so the planning session can
re-verify quickly rather than re-discover. Where a status is a judgment, it says so.

Operator context: human labeling of the blinded evaluation packet needs external native-speaker
and OSINT reviewers who will take one to three weeks to recruit. Nothing user-facing waits on
those labels; only evaluation steps 2–4 do. This roadmap sequences everything else so the weeks
of recruiting are fully used, and so the two structural changes the operator wants — a real
per-stage model matrix, and validation organized by CONFLICT to match how ISW publishes — are
staged in an order that does not confound the evaluation program already in flight.

---

## 0. How to use this document (instructions to the planning session)

1. Start in `/Users/go/code/bnow-net` on `main`, `git pull --ff-only`. Read `AGENTS.md`
   "Standing rulings" (all 21) and "Operating protocol" first — they are binding. Read
   `docs/OPEN-TASKS.md` §Tier 1–2 and the four review docs named in §1 below.
2. For each workstream in §4, produce ONE plan document `docs/reviews/PLAN-<WS-ID>-<slug>-2026-09-DD.md`
   containing: goal and non-goals; current state with file:line evidence (re-verify the citations
   here); a PR-by-PR breakdown (each PR small, docs-or-code, with its own tests and acceptance
   criteria); every standing ruling the PR touches and how it complies; migrations (forward-only,
   ruling 5); env/cap changes with the ruling-4 ordering (cap env in ALL Vercel envs BEFORE the
   guard that reads it deploys); the deploy path (plain release clone only); the soak/proof plan;
   an exposure note for anything touching the evaluation datasets; estimated sessions; and an
   explicit list of operator decisions the plan needs before its first PR.
3. Do not execute PRs from the planning session. Do not touch `docs/evals/analysis/*` datasets,
   the scorer, the analysis registry, the map activation lock, or any Vercel env. Do not open the
   heldout split or the labeling reconciliation key (`RECONCILIATION-KEY.json`) — it is
   operator-only and it is outside the repo on purpose.
4. Where this document says DECISION, stop and list it for the operator instead of choosing.
5. Suggested model per planning session: Opus at medium effort for WS-2 and WS-3 (architecture
   plans with ruling interactions), Sonnet for WS-0, WS-4, WS-5, WS-6 (inventory-driven plans).
   No step in this roadmap needs Fable.

---

## 1. Where we are — verified state on one screen

**Production.** Every analysis workload (map, reduce, legacy digest, ISW validation matcher,
entity audit) dispatches `gpt-4o-mini` under `analysis-reg-v1` (`src/lib/llm/analysis-registry.ts`,
five `baseline` entries, zero `evaluated_candidate`). Dispatch fails closed on any unapproved
`(workload, model, effort)` (`src/lib/llm/model-config.ts:151-215`). Map is additionally
hard-locked with no env override (`model-config.ts:163`, "MAP ACTIVATION BLOCKED") because the
#33 remap tool has never been executed. Ask uses `gpt-5` / `gpt-5-mini` / `text-embedding-3-small`
via `ASK_ANSWER_MODEL` / `ASK_RERANK_MODEL` / `ASK_EMBED_MODEL`, ungated and metered on one shared
`openai_ask` row. The Anthropic digest provider is dormant, unmetered, and bypasses the registry
(OPEN-TASKS #83). No local/OpenAI-compatible endpoint path exists on `main` (#108 holds the
withheld harness). Deploys come only from the plain release clone `bnow-net-rel-20260823`.

**Evaluation program.** `docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md` fixes four steps.
Step 1A (development-split, capture-enabled gpt-4o-mini baseline ×3 + blinded human-labeling
packet) executed 2026-09-05; artifacts live outside the repo in
`/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/` (SHA manifests verified).
Human labels: PENDING external reviewers. Step 1B (six new injection cases, #106) NOT STARTED.
val-typ-005 adjudication (#105) PENDING, operator can do it. Steps 2 (decide-and-freeze),
3 (admit heldout), 4 (v3 baseline + candidates) NOT STARTED and each needs its own
authorization. The 2026-09-03 verdicts (map FAIL, digest FAIL, validation insufficient_data)
stand and are never re-scored.

**Validation today.** One `validation_runs` row = one country `military` digest × one
`isw_reports` row keyed `(theater ∈ {ru, ir}, report_date)` (`src/lib/validation/run.ts:74-226`;
`src/db/schema.ts:133-152`). `referenceFor()` maps BOTH `ru` and `ua` to the same ROCA row
(`run.ts:45-57`), so one ROCA report yields two scoreboard rows over overlapping denominators;
`both`-toponym takeaways count twice. Iran gets no takeaway filtering and the gazetteer
(`src/lib/validation/keywords.ts:82`) contains zero Iranian or Levant toponyms. The scoreboard
(`src/app/scoreboard/page.tsx`) has no conflict view. There is no `conflict` column, table, or
enum anywhere in `src/db/schema.ts` or `drizzle/` (migrations stop at `0027`).

**What already exists for the conflict rework.** `src/lib/conflicts/` (71 files, pure domain,
no DB/provider/env): `CONFLICT_REGISTRY` (`definitions.ts:96-129`) — `russia_ukraine` → series
`roca`, contributors `ru`+`ua` (`mapped`), track `military`; `iran_regional` → `iran_update`,
contributor `ir` (`mapped`) plus `il, sa, ae, qa, om, bh, kw` (`legacy_only`), tracks
`military | nuclear | elite_politics`. Also `lanes.ts` (roca-lanes-v1 ×8, iran-lanes-v1 ×7),
`eligibility.ts`, `evidence-selection.ts` (40% cap), `editions.ts` (morning/evening/special
handling), `scorer.ts` (878 lines), `match-contract.ts`, `llm-compatible-matcher.ts`. Contract:
`docs/designs/CONFLICT-REGION-EVALUATION.md` ("one report = one benchmark observation"; country
pages remain evidence lenses; §12 "creates NO numbered Drizzle migration"). Schema design:
`docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md` with disposable DDL in
`src/integration/sql/conflict-benchmark-reports.sql`. Soak design: `docs/designs/CONFLICT-SHADOW-SOAK.md`
(DESIGN ONLY). UI under `src/app/conflicts/**` behind `CONFLICTS_UI=1`, **fixture-backed**
(`product-view.ts:1-20`). Eval profile offline-only (`src/lib/evals/conflict-validation-profile.ts:42-46`,
"NO live path"). Nothing in `src/lib/validation/`, `src/lib/isw/`, or any cron imports
`src/lib/conflicts/`. Standing blockers for the soak are recorded in
`docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md` §6.

**Reliability.** #102 (map flood OOM, bounded dedup) and #103 (map-death watchdog) are merged and
deployed; both proofs are synthetic so far. #93: no Vercel log drain, so no soak has runtime-log
coverage. #79: 36 RU ROCA reports pending with zero citations — a $0 fix. #85 fence column open.

**Housekeeping.** PRs #47 (land two preserved 2026-08-17 branches, docs only) and #48 (operator
notes + cleanup record) are open and green. #48 commits `docs/OUTREACH-ROSTER-2026-08-23.md`
containing 17 email addresses (2 personal) and 6 phone numbers — DECISION before merge.
`AGENTS.md` is 1,917 lines with the last 20 decision-log bullets appended after "Operating
protocol" (#92); every session pays that context cost.

---

## 2. Principles that order the work

1. **Never block the pipeline on the labels.** They gate evaluation steps 2–4 only.
2. **Evidence before verdicts.** Ship the log drain and the release checklist before the next
   soak, so the next verdict rests on runtime logs, not on self-reported `cron_runs`.
3. **Routing before candidates.** The evaluation's payoff is admitting candidate models; the
   per-stage routing surface (provider abstraction, per-stage endpoint, metering rows, registry
   keyed by provider) must exist before step 4 or the admitted candidates have nowhere to go.
4. **Shadow before cutover.** The conflict rework runs report-only alongside per-country
   validation until its shadow soak clears; production `validation_runs` and the country
   scoreboard are untouched until then.
5. **Do not confound the evaluation.** Changing validation semantics while validation-v2 is the
   frozen dataset would make step 4's validation cell uninterpretable. The conflict cutover is a
   NEW evaluation version (validation-v3, conflict-keyed), coordinated with step 2's version
   identities — never a reinterpretation.
6. **Every ruling stays.** Ruling 14 (per-theater digest corpora) is compatible with conflict
   validation: conflicts aggregate evaluations, they never merge corpora. Ruling 1 (no ISW prose
   persisted) shapes every new table.

---

## 3. The sequence at a glance

Effort is in Claude Code sessions (≈2–4 h of agent time plus operator review). "Gated by" names
the hard dependency; parallel work is expected. Weeks are indicative and assume recruiting for
reviewers runs in the background from week 1.

| Wk | ID | Step | Status today | Gated by | Sessions |
|---|---|---|---|---|---|
| 1 | WS-0.1 | Merge #47; decide roster → merge #48 | PRs green | roster DECISION | 0.25 |
| 1 | WS-0.2 | Reviewer instrument (per-language workbooks, analyst subset + controls, reviewer guide, fold-back script) and recruiting emails | NOT STARTED | — | 1 |
| 1 | WS-0.3 | #79 RU ROCA registry drain (`scripts/isw-refresh.ts --theater ru` + materialize) | NOT STARTED, $0 | operator run auth | 0.25 |
| 1 | WS-4.1 | #93 Vercel log drain | NOT STARTED | Vercel token (BLOCKERS: 403 — verify) | 0.5–1 |
| 1 | WS-6.1 | Release checklist codified (#39/#78), #84 headroom re-check baked in | NOT STARTED | — | 0.5 |
| 1–2 | WS-1.1 | Six development-split injection cases (#106) by a non-exposed author; report-only follow/report sub-label | NOT STARTED (authorized in step 1) | — | 1–2 |
| 1–2 | WS-1.2 | val-typ-005 semantic adjudication (#105), written reason | PENDING | operator | 0.25 |
| 2 | WS-6.2 | AGENTS.md compaction (#92): rulings + snapshot stay; log moves to `docs/DECISION-LOG.md` with last 30 days inline | NOT STARTED | DECISION | 0.5 |
| 2–3 | WS-2.1 | Ask metering granularity + gate parity (per-model attribution on `openai_ask`, model-aware embedding cost, scorecard gate default) | PARTIAL | — | 1 |
| 2–4 | WS-2.2 | Provider abstraction for analysis workloads: per-stage `<WORKLOAD>_PROVIDER` / `<WORKLOAD>_BASE_URL`, OpenAI-compatible endpoint provider, Anthropic wired through model-config + registry + pricing (#83, fix `anthropic-provider.ts:70`), registry keyed `(workload, provider, model, effort)`, per-provider spend rows | NOT STARTED (surface exists for OpenAI models only) | DECISION on provider ambition | 3–4 |
| 3–4 | WS-2.3 | #33 remap executed on a disposable Neon branch, runbook written, map lock kept until a candidate passes | tool exists, NEVER RUN | Neon key (BLOCKERS says expired — verify) | 1–2 |
| 4 | WS-2.4 | Eval-plane parity: `--provider`, unpriced-local semantics, entity_audit/embeddings coverage | PARTIAL | WS-2.2 | 1 |
| 2–4 | WS-3.0 | Conflict-validation decision memo (unit, denominator, editions, Iran gazetteer scope, gulf `legacy_only`, coverage label) | contract exists | DECISION | 0.5 |
| 3–4 | WS-3.1 | Persistence: forward-only migrations for series/edition on ISW reference reports, conflict validation observations; promote disposable DDL | NOT STARTED | WS-3.0 | 1–2 |
| 3–5 | WS-3.2 | Reference ingestion by series + edition (ROCA, Iran Update variants), `refreshReportCitations` reuse | PARTIAL (slug probing exists) | WS-3.1 | 1 |
| 4–5 | WS-3.3 | Cross-theater evidence population per conflict (mapped contributors only, 40% cap), takeaway theater as attribution not filter | NOT STARTED | WS-3.1 | 1–2 |
| 4–5 | WS-3.4 | Iran/Levant gazetteer for the keyword rung; matcher reuse via `match-contract.ts` | NOT STARTED (explicit pre-soak blocker) | — | 1 |
| 5 | WS-3.5 | Conflict scoreboard view + cross-reference explainer; country rows relabeled as evidence lenses; ruling-21 gating | UI components exist, fixture-backed | WS-3.3 | 1–2 |
| 5–7 | WS-3.6 | Shadow soak (report-only) per `CONFLICT-SHADOW-SOAK.md`; clear the five recorded blockers | DESIGN ONLY | WS-3.1–3.5, WS-4.1 | 1 + calendar |
| after soak | WS-3.7 | Cutover + validation-v3 (conflict-keyed) as a new evaluation version; deprecate per-country runs as headline | NOT STARTED | soak PASS, WS-1.3 | 1–2 |
| later | WS-3.8 | Multi-theater source tagging N:M (#37) | NOT STARTED | DECISION | 2–3 |
| labels | WS-1.3 | Step 2 decide-and-freeze (one decision-log entry) | NOT STARTED | human labels | 1–2 offline |
| after 1.3 | WS-1.4 | Step 3 admit heldout with exposure ledger | NOT STARTED | WS-1.3 | 1 |
| after 1.4 | WS-1.5 | Step 4: v3 baseline (capture on), then candidates (gpt-5-nano first; others per WS-2.2) → `evaluated_candidate` PRs → env change per workload | NOT STARTED | WS-1.4, WS-2.2, spend auth | 2–3 + two UTC days of caps |
| parallel | WS-5.x | Gulf theaters onto the map worker; per-country mix policy; #61 kind-safe entity cleanup design; C1 coverage target reset after WS-3.6 | see §4.6 | various | — |

---

## 4. Workstream briefs

### 4.0 WS-0 — Close out this week

**Goal.** Clear the two open PRs, get the human-labeling instrument out the door so recruiting
emails carry a 30-minute task rather than a 218 KB Markdown file, and take the $0 win.

**WS-0.1 — PRs.** #47 is docs-only and safe to merge. #48 needs a DECISION on
`docs/OUTREACH-ROSTER-2026-08-23.md`: (a) merge as-is into the private repo, (b) redact personal
emails/direct lines and merge, or (c) move the roster out of git entirely (e.g. into the
operator's private notes) and drop it from the PR. Recommendation: (c) — nothing in the codebase
consumes it, and third-party contact details do not belong in a repository whose history is
permanent. The GO-NO-GO register can stay.

**WS-0.2 — Reviewer instrument.** Inputs are ONLY the blinded files in
`…-eval-successor-1a-20260904-artifacts/packet/`: `LABELING-PACKET-DEV.md`, `labeling-rows.csv`,
`native-language-review.csv`. Never read `RECONCILIATION-KEY.json` or
`AI-DIAGNOSTIC-ANALYSIS.md` into the instrument. Build: four native-speaker workbooks (ar 3 rows
with claims, uk 3, ru 2, fa 2 — one row per question instance, original text + English claim +
quoted span + hedging label inline, plain-English question, dropdown answer, note; ask both "does
the English claim faithfully render the original?" and "does the reference fact statement?"); one
analyst workbook for the ~20 plan-named rows plus ~8 control rows (selection is an operator action
using the key; content from the blinded packet only; record the selection design in the exposure
note); a one-page reviewer guide with no internal jargon; a fold-back script that writes answers
into `labeling-rows.csv`'s `P1=yes;P2=partly` encoding preserving row ids (never rebuild the
packet — the salt regenerates). Google Sheets for ar/fa (RTL shaping); .xlsx acceptable.
Recruiting: RU/UK via the operator's groups now; AR/FA via a paid professional translator
(one-hour minimum; competence recorded as "professional"). Ask reviewers to flag unnatural
synthetic source text — free corpus-quality signal.

**WS-0.3 — #79.** `scripts/isw-refresh.ts --theater ru` then registry materialize, read-only
preflight first; record in the decision log. No LLM spend.

### 4.1 WS-1 — Evaluation program (internal steps now, label-gated steps later)

**Goal.** Finish step 1 and be ready to execute step 2 the day labels arrive.

**WS-1.1 — Six injection cases (#106).** Authored by a session that has NOT read the live
`failures` strings of the heldout injection case (state this in the session prompt; do not paste
them). Development split only. Offline machinery proof first ($0), then the ×3 baseline with
capture under the existing step-1 authorization (≈18 map calls, ≈$0.005). Add a report-only
follow/report sub-label with no pass path. Separately list the PRODUCT decision on pre-dispatch
injection stripping/flagging in `map-worker` for the operator. Exposure ledger entry required.

**WS-1.2 — val-typ-005 (#105).** "Air defense activity increased" vs claim "were active":
same event at weaker strength, or no match? Written reason; recorded as a validation-v3 admission,
`expectMajority` pin unchanged, heldout twin never read.

**WS-1.3 — Step 2 decide-and-freeze (label-gated).** One decision-log entry covering: the
gist-match rule (Jaccard threshold + `quoteOverlap`, chosen on development rows only — the 0.3–0.6
sweep is in the key); `requiredEvidenceMisses` as a hard counter with docId-scoped `mustMatch`
only after the matching rule is shown calibrated; per-case `liveGold` annotations with reviewer,
date, reason; adjudicated labels; digest survival pins moved out of `mustMatch` structurally;
`tailEventSurvivalRate` report-only; map-v3/digest-v3/validation-v3 populations (v2 byte-frozen);
version identities (contract v3, `scorerVersion` in `resumeIdentityMismatch` and the capture run
line; new results basenames; pre-registered gate constants). Coordinate with WS-3.7: decide here
whether validation-v3 is conflict-keyed or whether the conflict cutover becomes v4.

**WS-1.4 — Step 3 admit heldout.** Exposure ledger naming author and what they read; heldout raw
capture stays default-off.

**WS-1.5 — Step 4 baseline + candidates.** Measured costs: map ≈$0.0002/call, validation
≈$0.00006, digest ≈$0.0007–0.0105; a full v3 baseline ≈$0.20–0.25 and ≈570 requests → two UTC
days under the 300/day cap. Candidates: gpt-5-nano first (≈$0.15–0.30 per full sweep), then any
provider WS-2.2 enabled. Each PASS yields a PROPOSED registry entry in report text; admission is a
human PR adding `evaluated_candidate` to `analysis-registry.ts` with the five-step activation
checklist from `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` §9. Production change is
then an env flip per workload (`REDUCE_MODEL` etc.) deployed from the release clone with a
decision-log entry. Map stays locked until WS-2.3 is executed AND a map candidate passes.

### 4.2 WS-2 — Model routing matrix ("different AI models at different points")

**Goal.** The operator can set, per stage, a provider + model + effort by configuration alone,
with fail-closed approval, per-provider metering, identity stamped on every persisted output, and
evaluation coverage — for OpenAI models today and, if decided, Anthropic and local/OpenAI-compatible
endpoints.

**Current state (verified).** Per-workload env surface exists for the five analysis workloads
(`MAP_MODEL`, `REDUCE_MODEL`, `DIGEST_MODEL`, `VALIDATION_MODEL`, `ENTITY_AUDIT_MODEL` →
`OPENAI_MODEL` → `gpt-4o-mini`; precedence documented at `model-config.ts:17`, env names
`:52-58`, resolution `:130-136`). Approval registry fail-closed
(`analysis-registry.ts`; `model-config.ts:198-215`). Identity stamped: `extractor_version`
(`map-prompts.ts:255-266`), reduce `provider` tag (`synthesize.ts:444-448`), digest `name`
(`openai-provider.ts:147`), validation `dispatch` (`llm-match.ts:46-48`), entity audit
`cron_runs.counts.dispatch`. Metering per row: `openai_map`, `openai_reduce`, `openai_digest`,
`llm_match`, `openai_entity_audit`, `openai_ask`, `openai_embed`, `openai_eval`. Eval plane
already selects `--model/--effort` per workload (`live-runner.ts:128-164`). Gaps: map hard lock
(by design until #33 runs); only OpenAI SDK shapes (`llm-match.ts:1` types on `OpenAI`); Anthropic
seam dormant/unmetered/unregistered (#83); no per-stage base URL (only the SDK-global, undocumented
`OPENAI_BASE_URL`); Ask ungated (`ASK_ROUTER` defaults off; `router.ts:103-118`) and all Ask models
share one spend row; embeddings cost hardcoded (`embeddings/client.ts:24`); no eval coverage for
entity_audit or embeddings.

**DECISION (operator, before WS-2.2 planning): provider ambition.** Option A — OpenAI-only matrix:
finish metering/gating parity and rely on step 4 to admit gpt-5-nano/gpt-5-mini variants
(smallest scope, ~2 sessions). Option B — add Anthropic for digest/Ask (requires an
`ANTHROPIC_API_KEY`, BLOCKERS says none; pricing entries; a second `GenerationProvider`;
Anthropic-shaped params; cache identity). Option C — add local/OpenAI-compatible endpoints per
stage (requires an "unpriced-local" pricing class with explicit $0 metering, a per-stage base URL,
and a decision that unpriced models may run at all — `docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96`
currently says local ids stay OUT of `PRICES_PER_MTOK`). B and C are independent; both are
prerequisites only if the operator wants those candidates evaluated in step 4.

**WS-2.1 — Ask parity (any option).** Per-model attribution on `openai_ask` (either a
`model` dimension on `provider_usage` or one row per model with caps set first per ruling 4);
model-aware embedding pricing replacing `EMBED_USD_PER_TOKEN`; decide whether `hasScorecard()`
gating applies to the Auto path (today only explicit fast/deep); close roadmap-01 residue #44 and
retire #84 with a recorded headroom check at the next deploy.

**WS-2.2 — Provider abstraction (options B/C).** Introduce `<WORKLOAD>_PROVIDER` and, for
OpenAI-compatible endpoints, `<WORKLOAD>_BASE_URL`; extend the registry key to
`(workload, provider, model, effort)` and bump to `analysis-reg-v2` (stamped everywhere
`registryVersion` is today); move Anthropic behind `model-config.ts` + pricing + a metered
`anthropic_digest` row; fix the surrogate-pair slice at `anthropic-provider.ts:70` (#97 family);
preserve ruling-9 degradation semantics per site; keep ruling-8 metering inside `analyze()`;
land #108's tests as reference (its `OPENAI_BASE_URL` override is superseded by per-stage config).
Ruling 4 ordering for every new cap env. Unit tests must pin: unapproved provider refused before
`tryReserve`; identity stamped with provider; import-graph test updated for the second SDK.

**WS-2.3 — #33 remap execution.** Dry-run on a disposable Neon branch (verify `NEON_API_KEY`
first — BLOCKERS says expired but the 2026-09-04 eval used a branch; reconcile), measure cost per
1k documents, write the runbook (`docs/reviews/MAP-REMAP-RUNBOOK-*.md`), then decide with the
operator whether to remove the no-override lock in favor of "registry-approved + remap-complete"
gating. Ruling 13: consumers filter to `mapExtractorVersion()`; ruling 7: a new map model must be
re-measured for `minItems/maxItems` under-fill.

**WS-2.4 — Eval-plane parity.** `--provider` flag; unpriced-local refusal or explicit $0 class;
coverage for entity_audit and embeddings (currently none).

### 4.3 WS-3 — Validation by conflict (align with ISW)

**Goal.** One ISW report (ROCA edition, Iran Update edition) = one benchmark observation for one
conflict, scored over declared Key Takeaways against evidence from ALL mapped contributor theaters
of that conflict, with country pages unchanged as evidence lenses. This replaces the current
"one country digest × one theater report" unit that double-counts ROCA and cannot score Iran's
keyword rung.

**Current state (verified).** Production: `src/app/api/cron/validate/route.ts:24` loops
`["ru","ua","ir"]`; `run.ts:83-95` picks one `military` digest and one `isw_reports` row by
`referenceFor(country).theater`; `run.ts:155-167` filters ru/ua takeaways by the RU/UA-only
gazetteer; `run.ts:176-187` builds candidates from `cl.digest_id = $1` only; `validation_runs`
unique `(digest_id, isw_report_id)`; scoreboard per (country, date). Domain library complete and
test-pinned in `src/lib/conflicts/` (see §1) but imported by nothing in production; UI
fixture-backed behind `CONFLICTS_UI=1`; eval profile offline-only; schema design + disposable DDL
exist; no migrations; shadow soak DESIGN ONLY with five recorded blockers (compound-unit
calibration, assessment diagnostics, Iran keyword rung, source-independence semantics, sample-power
sizing) plus enablement checklist (`FEATURE_AUTH_GATE=true` wherever `CONFLICTS_UI` is set,
`robots.ts` disallow, decision-log entry).

**WS-3.0 — Decision memo (operator + planning session).** Fix: the unit of validation (adopt
`CONFLICT_REGISTRY` as production truth); denominator = every declared Key Takeaway, label "Key
Takeaway benchmark coverage" (contract lines 85–86; never "accuracy"), `both` bullets counted once; edition policy for Iran
Update morning/evening/special (use `editions.ts` finality selection); Iran/Levant gazetteer
scope; `legacy_only` gulf theaters excluded from the numerator and displayed as such; whether
ROCA also covers `nuclear`/`elite_politics` (registry says military only); how the country
scoreboard rows are relabeled; the coverage TARGET (GO-NO-GO C1 is failing at 15.6–20.7% vs ≥80%
against a denominator the rework redefines — set the new target AFTER the shadow soak, not before).

**WS-3.1 — Persistence.** Forward-only Drizzle migrations (ruling 5; `9999_claim_source_trigger.sql`
stays last): add `series` (`roca` | `iran_update`) and `edition` to ISW reference reports with
unique `(series, report_date, edition)` while keeping `theater` for compatibility and
backfilling `ru→roca`, `ir→iran_update`; promote `benchmark_report_editions` /
`benchmark_series_days` from the disposable DDL; add a conflict-level observation table (conflict
id, reference edition id, date, contributing digest ids, scorer output, matcher rung, version
identities) that coexists with `validation_runs`. Ruling 1: takeaway text is transient prompt
input; persist counts, ids, classifications, never prose.

**WS-3.2 — Reference ingestion by series/edition.** Generalize `iswUrlForDate` /
`iranUpdateUrlCandidatesForDate` (`run.ts:15-41`) into series-aware probing that records editions
rather than collapsing them; reuse `refreshReportCitations()` (`isw/load.ts:284`); drain #79
first so RU source analytics are sound.

**WS-3.3 — Evidence population.** Per conflict and date: union claims from the `mapped`
contributor theaters' digests for the registry's tracks, through `evidence-selection.ts` with the
40% mix cap (ruling 14 respected: corpora are not merged, evaluation aggregates upward);
`classifyTakeawayTheater` becomes attribution (which contributor theater covered the takeaway),
not a filter. Ruling 12 (same-theater dedup) unchanged. Ruling 13 (`mapExtractorVersion()`
filter) on every `doc_claims` read.

**WS-3.4 — Iran/Levant gazetteer + matcher reuse.** Extend `keywords.ts` with a versioned
Iranian/Levant/Gulf toponym set (Tehran, Isfahan, Natanz, Hormuz, Beirut, south Lebanon, Sanaa,
Hodeidah, Red Sea lanes, Iraqi militia geography) so the keyword rung can score `iran_regional`;
production LLM matching via `match-contract.ts` / `llm-compatible-matcher.ts` keeps the
degradation ladder (ruling 9) and K=5 majority (`resolveVoteRounds`). Fixture tests per lane.

**WS-3.5 — Scoreboard.** Conflict view on `/scoreboard` reading the new observation table;
cross-reference explainer (contract §11); country rows stay, relabeled as evidence lenses; ruling
19 labels ("BNOW-only reported item") retained; ruling 21: gate call first statement of the page,
before any query; `requireAcceptedUser` then `requireConflictsUi`.

**WS-3.6 — Shadow soak.** Run conflict validation report-only alongside per-country for the
window `CONFLICT-SHADOW-SOAK.md` specifies; resolve the five recorded blockers with written
dispositions; require WS-4.1's log drain so the soak has runtime-log coverage; enablement
checklist items (`FEATURE_AUTH_GATE`, `robots.ts`) before any gated route is flag-on.

**WS-3.7 — Cutover.** Flip the headline to conflict observations; keep per-country runs as a
lens; create validation-v3 (conflict-keyed) as a NEW evaluation version coordinated with WS-1.3's
version identities; decision-log entry; update the successor plan.

**WS-3.8 — Multi-theater tagging (#37).** N:M source→theaters so one document can feed several
theater corpora without retag migrations. Enabling but separable; the conflict layer works on
primary tags + registry contributors first.

**Acceptance for the whole workstream.** A single ROCA edition produces exactly one
`russia_ukraine` observation; RU and UA country rows no longer share a denominator; Iran Update
editions are distinct rows and the Iran keyword rung returns a non-`unavailable` result; every
takeaway match is attributable to a contributor theater; no ISW prose persisted; no digest corpus
changed; the country scoreboard is unchanged in its numbers during the shadow window.

### 4.4 WS-4 — Reliability and evidence base

**WS-4.1 — #93 Vercel log drain.** Every soak verdict to date rests on `cron_runs`
self-reports. A drain (to Neon, a bucket, or a hosted sink) with a retention decision is cheap and
repairs the evidence base for WS-3.6 and every future window. Needs the Vercel token (BLOCKERS:
403 — verify current state first).

**WS-4.2 — #102/#103 live proofs.** Both mechanisms are unit-pinned only. Plan a controlled
fault-injection on a Neon branch (not production) to exercise the shed/refusal paths and the
watchdog's pre-completion death detection once, and record the proof.

**WS-4.3 — #85 fence column** (needs a migration) and **#97 residuals** (dormant Anthropic
slice fixed in WS-2.2; ASK_SESSIONS residuals separately).

### 4.5 WS-5 — Data depth and product debt (parallel, opportunistic)

From `AGENTS.md` "Next steps": gulf theaters onto the map worker (theaters currently
`legacy_only`; moving them to `mapped` is what would let the Iran conflict count them);
per-country mix policy. From OPEN-TASKS: #61 kind-safe entity cleanup design — the single blocker
holding #41, D1, and the paid-hygiene chain (roadmap-08); #76 shafaq.com; #42 X citation
concentration; #82 unguarded harvest client. Business gates that are not engineering but block
engineering: B1 OpenSanctions commercial rights (open since 2026-07-07, no owner); VERCEL_TOKEN
regen; NEON_API_KEY status. Russia depth items (`docs/RUSSIA-DATA-ROADMAP.md` §5) remain
access-blocked (zakupki unreachable) — no engineering action until access changes.

### 4.6 WS-6 — Operating-system hygiene (cheap, compounding)

**WS-6.1 — Release checklist (#39/#78).** A `docs/RELEASE-CHECKLIST.md` the release clone
follows: pull, verify commit stamp, cap-env parity check (ruling 4), `--estimate` where relevant,
deploy, smoke, decision-log entry, #84-style headroom record. Codifies what is currently operator
habit. Also record in `CLAUDE.md`/`AGENTS.md` conventions that worktrees are created only from a
native session on the Mac (a worktree created through a Cowork/remote mount writes `/sessions/…`
paths git can never resolve later — the 2026-09-05 cleanup found one such orphan).

**WS-6.2 — AGENTS.md compaction (#92).** Keep charter, architecture, snapshot, standing rulings,
conventions, credentials, next steps, operating protocol in `AGENTS.md`; move the full decision log
to `docs/DECISION-LOG.md` (append-only, same format), keeping the last 30 days inline with a
pointer. DECISION: the log is cited by ruling number and by date across docs — the move must keep
every dated entry intact and add no renumbering. This reduces every future session's fixed context
cost by roughly two-thirds.

---

## 5. Decisions needed from the operator (list for the planning session to carry forward)

1. Roster in #48: merge as-is / redact / remove (recommendation: remove from git).
2. Provider ambition for WS-2: OpenAI-only (A), plus Anthropic (B), plus local endpoints (C).
   B requires an Anthropic key; C requires reversing the "local ids stay out of `PRICES_PER_MTOK`"
   stance with an explicit $0-metering class.
3. Validation-v3 versioning: is the conflict-keyed dataset v3 (coordinated with step 2) or a later
   v4 after the per-country v3 baseline? (Affects WS-1.3 and WS-3.7 ordering.)
4. Conflict unit details (WS-3.0): edition policy, `both` counting, gulf `legacy_only` display,
   Iran tracks in scope, coverage target reset timing.
5. AGENTS.md compaction (WS-6.2): approve the split.
6. Spend authorizations: WS-1.1 (≈$0.01), WS-2.3 remap measurement (Neon branch; map calls per
   1k docs), WS-1.5 (≈$1 ceiling per candidate with capture).
7. Credential blockers to resolve or confirm: VERCEL_TOKEN, NEON_API_KEY, ANTHROPIC_API_KEY (only
   if option B).
8. Who authors the six injection cases (must not have read the live `failures` strings).

---

## 6. Standing rulings this roadmap touches (from `AGENTS.md`; binding)

1 no ISW prose in outputs (WS-3 tables persist counts/ids only) · 2 traceability, every claim keeps
a `raw_document` link · 3 fixture data never renders as fact (the conflict UI is fixture-backed
today — WS-3.5 must switch it to real observations before any flag-on) · 4 fail-closed spend and
dispatch; cap env in ALL Vercel envs before the guard deploys (every new provider row in WS-2) ·
5 forward-only migrations, `9999_claim_source_trigger.sql` last (WS-3.1, WS-4.3) · 7 batched
extraction pins `minItems/maxItems`; re-measure any new map model · 8 metering inside `analyze()`
· 9 per-site degradation semantics preserved · 11 language routing and theater-as-lens ·
12 same-theater ±1 day dedup · 13 `extractor_version` filtering; map hard-locked until remap ·
14 per-theater digest corpora with the 40% cap (conflicts aggregate, never merge) · 17 never trust
a lone regeneration · 18 K=5 + majority fill; re-run the A/B gate before changing reduce · 19
publication guard before persist; scoreboard labels · 21 authorization in the page, first
statement, before any query.

---

## 7. The planning-session prompt (paste this to start)

> You are planning, not executing. Repo `/Users/go/code/bnow-net` on `main`. Read
> `docs/prompts/2026-09-05-cto-roadmap-handoff.md` in full, then `AGENTS.md` Standing rulings
> and Operating protocol, then `docs/OPEN-TASKS.md` Tier 1–2, then the four review docs named in
> the handoff §1. Re-verify every file:line citation you rely on. Produce one plan per workstream
> requested by the operator (start with WS-0 and WS-2, then WS-3) as
> `docs/reviews/PLAN-<WS-ID>-<slug>-<date>.md`, following the handoff §0 template exactly: PR-by-PR
> breakdown, tests and acceptance per PR, rulings touched and compliance, migrations, env/cap
> ordering, deploy path, soak/proof plan, exposure notes, session estimates, and the operator
> decisions required before the first PR. Do not modify code, datasets, the registry, the map
> lock, Vercel envs, or anything under the evaluation artifacts folders. Do not read the
> reconciliation key or the heldout split. Where the handoff says DECISION, list it; do not decide.
> Finish by opening one docs-only PR containing the plan documents and a short
> `docs/reviews/PLANNING-INDEX-<date>.md` that orders them and names the first three PRs to
> execute.
