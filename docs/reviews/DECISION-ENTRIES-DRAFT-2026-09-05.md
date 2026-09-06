# Decision-entries draft — 2026-09-05 (step 01, unsigned)

Every entry below is a candidate `AGENTS.md` decision-log entry, formatted exactly as that
log requires. **None of these has been appended to AGENTS.md.** Per the 48-hour program's
AGENTS.md write-lock (COMMON §4 item 7, INDEX §4), only steps 01/02/03/15/25 touch AGENTS.md,
and even step 01 drafts rather than appends — the operator signs by copying the entry (as-is,
or edited) into AGENTS.md's `## Decision log` at the checkpoint named in INDEX §6. Each entry
is marked `[UNSIGNED — operator]` until that happens. Do not treat anything here as binding.

---

## (a) PR #46 merge record

- **2026-09-04 (PR #46 merge record — validation live-evaluation five-vote parity)**
  `[UNSIGNED — operator]` PR #46 (branch `claude/eval-validation-parity-20260904`, reviewed
  tip `6bdc0db`) merged to `main` as merge commit **`883e5e3`**, atop PR #45's merge
  `9854626`. The existing 2026-09-04 decision-log entry for this PR ("validation evaluation
  parity — PR 2 of the methodology follow-up") records the branch, the review rounds, and
  the gate numbers (typecheck/lint clean · unit 3,612/3,612, 247 files) but not the merge
  hash — that entry is NOT edited here (it stays append-only); this entry supplies the
  missing hash for anyone reconciling `main` against the decision log. `git diff 883e5e3
  origin/main` is empty as of 2026-09-05, i.e. `origin/main` is `883e5e3`. No deploy
  accompanied this merge; production remains `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`.

---

## (b) Step-1A execution — as reported by the operator

- **2026-09-05 (eval successor-plan step 1 authorization + step-1A execution — as reported
  by the operator)** `[UNSIGNED — operator]` No entry in this log records authorizing the
  eval successor plan's "step 1" bounded run before it ran; the successor plan only
  PROPOSES it (`docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md:59-67`, quoted here in full
  because no other in-repo record carries it): *"Authorize step 1 only: a development-split,
  capture-enabled, production-equivalent baseline run (gpt-4o-mini; `--dev --repetitions 3`;
  `EVAL_CAPTURE_DIR` set, `EVAL_CAPTURE_RAW=1`, heldout raw NOT enabled) on the existing
  disposable Neon branch (kept, per A6 'keep until closeout') within `EVAL_USD_CAP_DAILY=2`
  and a campaign-local `LLM_SPRINT_USD_CAP` ceiling the operator names, plus the human
  labelling/adjudication work above. Explicitly NOT part of that authorization: any heldout
  run, any scorer/gate/label change (step 2 decides those afterwards), any candidate model,
  any deploy."* The 48-hour program's decision sheet answers this at **D6**: *"Yes Authorize
  $0.50 to $2.00. Summary report should explain impact of this LLM_SPRINT_USD_CAP"*
  (`docs/prompts/2026-09-05-48h-00-INDEX.md` §2) — this is read as the operator naming the
  campaign-local `LLM_SPRINT_USD_CAP` the successor plan's proposal left blank, i.e. a value
  in the $0.50–$2.00 range (an exact figure was not given; the executing session should pick
  a value in that range and record it, or ask). The CTO roadmap handoff §1 states, as fact,
  that "Step 1A (development-split, capture-enabled gpt-4o-mini baseline ×3 + blinded
  human-labeling packet) executed 2026-09-05; artifacts live outside the repo in
  `/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/` (SHA manifests verified)."
  This entry does NOT independently verify that execution — this session (step 01) did not
  open the artifacts folder (COMMON §3 forbids it) and did not run anything — it records the
  handoff's claim as **reported by the operator's planning process**, for the record, pending
  the operator's own confirmation and signature. If the operator confirms the run happened
  as described, this entry becomes the authorization-and-execution record; if any detail
  differs, correct it before signing.

---

## (c) H0 decisions already answered in the program index

Each of the following restates one row of `docs/prompts/2026-09-05-48h-00-INDEX.md` §2
(the "When" = H0 items) together with the operator's own recorded Comment. They are
drafted here, not invented — the operator already answered them in the index; signing
moves the answer from a planning document into the permanent decision log.

- **2026-09-05 (D1 — PR #48 outreach roster)** `[UNSIGNED — operator]` Decision: PR #48
  roster disposition — merge as-is / redact / remove `docs/OUTREACH-ROSTER-2026-08-23.md`
  from git. Recommendation: remove from git (handoff §4.0(c)); keep the GO-NO-GO register.
  **Operator: "yes remove outreach from git."**

- **2026-09-05 (D2 — provider ambition for WS-2)** `[UNSIGNED — operator]` Decision: A
  (OpenAI-only) / B (+Anthropic) / C (+local OpenAI-compatible). Recommendation: A now,
  seam-ready for B/C. **Operator: "B. Yes Anthropic ANTHROPIC_API_KEY added to .env.local.
  Same Budget. C. provisional yes. Don't need for at least two weeks if easily added in the
  future, leave this out of this dev round."** Net: option B is authorized now (seam work
  proceeds under the same budget envelope as A); option C is deferred out of this window.

- **2026-09-05 (D5 — AGENTS.md compaction)** `[UNSIGNED — operator]` Decision: approve the
  split; inline window 0/7/30 days; restore strict date order when reunifying.
  Recommendation: approve; 7-day inline window; restore date order. **Operator: "Approve.
  AND keep below 150k characters as an additional constraint to avoid warning like:
  AGENTS.md is over the 150.0k-char limit (156.8k chars)."** Note for step 15: AGENTS.md is
  157,962 characters as of this entry (2026-09-05, pre-compaction) — already over the
  operator's 150k ceiling, which step 15's compaction must clear.

- **2026-09-05 (D6 — WS-1.1 capture-run spend authorization)** `[UNSIGNED — operator]`
  Decision: campaign-local `LLM_SPRINT_USD_CAP` for the ≈18-map-call, ≈$0.01 capture run.
  Recommendation: authorize $0.50 ceiling; record as the step-1 authorization entry.
  **Operator: "Yes Authorize $0.50 to $2.00. Summary report should explain impact of this
  LLM_SPRINT_USD_CAP."** See entry (b) above — this is the authorization that entry
  executes against.

- **2026-09-05 (D8 — credential confirmations)** `[UNSIGNED — operator]` Decision: confirm
  `NEON_API_KEY` works; `VERCEL_TOKEN` regen (optional); `ANTHROPIC_API_KEY` only if D2 = B.
  Recommendation: confirm Neon; leave the others. **Operator: "NEON, ANTHROPIC, OPENAI keys
  confirmed working. VERCEL_TOKEN is valid and correctly scoped to bnow-net."** This
  supersedes `docs/BLOCKERS.md`'s stale VERCEL_TOKEN-expired framing (see this step's
  report) — AGENTS.md's credentials table already read VERCEL_TOKEN as expired-but-CLI-live;
  the operator's confirmation narrows that further to "valid and scoped to bnow-net", which
  a future pass may fold into the table.

- **2026-09-05 (D9 — injection-case authorship)** `[UNSIGNED — operator]` Decision: who
  authors the six development-split injection cases (must not have read the live heldout
  `failures` strings). Recommendation: a fresh Opus (or Astra) session under the forbid
  list. **Operator: "We have never used Astra in this project. Use Astra via openai key to
  'author'."** Read literally this asks for a model named "Astra" dispatched via an OpenAI
  key, which the model roster (INDEX §3) describes as "the second frontier model" — an
  independent-provider identity, not an OpenAI-hosted one. The executing session (step 07)
  should confirm with the operator which concrete model/provider this resolves to before
  proceeding, rather than guess.

- **2026-09-05 (E1 — injection-case dataset vehicle)** `[UNSIGNED — operator]` Decision:
  new dataset file `map-inj-dev-v1.json` vs pre-creating `map-v3.json`. Recommendation: new
  file `map-inj-dev-v1.json`. **Operator: "Yes approve new name."**

- **2026-09-05 (E3 — exposure-ledger home)** `[UNSIGNED — operator]` Decision: where the
  eval exposure ledger lives. Recommendation: `docs/reviews/EVAL-EXPOSURE-LEDGER.md`,
  append-only, dated sections. **Operator: "Yes fine for new file in new location."**

- **2026-09-05 (R5 — "#108" locator)** `[UNSIGNED — operator]` Decision: name the
  branch/commit/file "#108" (which does not exist as an OPEN-TASKS item) actually refers
  to. Recommendation: name the branch/commit or file the task. **Operator: "Name branch."**
  This session (step 01) names it: the parked branch `claude/local-model-ask-eval-20260817`
  (`docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96`; related debt tracked as
  OPEN-TASKS #100) is the most plausible referent — see the OPEN-TASKS #100 note and the
  handoff corrections block, both added by this step. If the operator meant a different
  branch, correct this line before signing.

- **2026-09-05 (D11 — AGENTS.md standing-text correction authority)** `[UNSIGNED —
  operator]` Decision: may the reconcile session (step 01) correct AGENTS.md standing text
  before the compaction (step 15) lands? Recommendation: yes. **Operator: "Yes correct
  AGENTS and remove note VERCEL_TOKEN is working now retricted to bnow-net project."** This
  step executed under that authorization (see the AGENTS.md diff in this step's report);
  the VERCEL_TOKEN wording in AGENTS.md's credentials table was left as-is this session
  (the correction is small and the table is not part of this step's assigned scope per the
  step prompt) — flagged here so step 15 or a later pass can apply the operator's exact
  wording ("restricted to bnow-net project").

- **2026-09-05 (D12 — model names in program documents)** `[UNSIGNED — operator]` Decision:
  allow model names in `docs/prompts/*`, `docs/reviews/*`, and the decision log, following
  existing precedent, never in commits/PRs/code/comments. **Operator: "Yes model names or
  recommendation in these files is OK."** CLAUDE.md's commit-hygiene rule (no vendor
  branding in commits, PRs, code, or code comments) is unaffected and remains binding; this
  decision only confirms the existing docs-only precedent.

- **2026-09-05 (O1, plan tier — log-drain platform check)** `[UNSIGNED — operator]`
  Decision (plan-tier half, due H0): does the `vociferous` Vercel plan support log drains?
  Recommendation: Neon receiver, 14-day retention; operator registers via dashboard.
  **Operator: "Yes Vercel supports Log Drains. Neon DOES NOT support drains on the 'Launch'
  level plan."** **CORRECTED 2026-09-06 — do not sign this paragraph as written; sign entry
  (e10) instead.** The Neon note concerns a Neon-side feature the design never uses: the
  recommended receiver is our own Vercel route inserting into our own `runtime_logs` table,
  which needs nothing from Neon beyond ordinary writes. The only platform capability the
  design requires is the Vercel drain, which the operator confirmed exists. Step 16's prompt
  already carries this correction. The rest of O1 (retention, who registers) is CP1-gated
  and answered in entry (e10).

---

## (d) The 48-hour program itself

- **2026-09-05 (48-hour execution program authorized and kicked off)** `[UNSIGNED —
  operator]` The operator committed to a 48-hour, twelve-worktree agent execution program
  sequencing the CTO roadmap handoff (`docs/prompts/2026-09-05-cto-roadmap-handoff.md`, base
  `origin/main` `883e5e3`) into 28 numbered step prompts plus a governing index and common
  preamble (`docs/prompts/2026-09-05-48h-00-INDEX.md`,
  `docs/prompts/2026-09-05-48h-COMMON.md`), committed to local `main` as
  `afeef2b` (handoff) → `a912c7a` (index + preamble + 28 prompts) → `4e5b00f` (operator
  comments on the H0 decision sheet, i.e. the answers drafted into entry (c) above) — none
  of these three commits had been pushed to `origin/main` as of this entry. Binding scope
  for every session in the program (COMMON §3, INDEX preamble): no deploy, no Vercel
  environment change, no production write, no spend, no edit to
  `docs/evals/analysis/*`/the scorer/the registry approvals/the map lock, without a named
  operator authorization recorded in this log; where the handoff says DECISION, the session
  lists it and does not decide; **nothing deploys before step 26's go/no-go** (INDEX §0
  item 4, Wave 5). AGENTS.md write-lock: only steps 01, 02, 03, 15, and 25 edit AGENTS.md
  during the window, and even those draft rather than append decision-log entries except
  for the single standing-text corrections their own PR makes wrong. This entry exists so a
  later session or audit can find, in the append-only log itself, that the program ran under
  operator authorization and its own written constraints, rather than only in a
  docs/prompts file.

---

## (e) Checkpoint-1 decisions (added 2026-09-06)

Drafted from the operator's answers now recorded in `docs/prompts/2026-09-05-48h-00-INDEX.md`
§2.2, the step-05 memo (`docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md`), the
step-08 memo (`docs/reviews/EVAL-VAL-TYP-005-ADJUDICATION-2026-09-05.md`) and PLAN-WS-2
(`docs/reviews/PLAN-WS-2-routing-matrix-2026-09-05.md`). Same rule as every section above:
`[UNSIGNED — operator]` until copied into AGENTS.md. Entries e11–e12 are **not answers** —
they are the two decisions step 20b still waits on, drafted so signing them is a one-line act.

### (e1) D3 — conflict-keyed dataset is validation-v4

- **2026-09-06 (D3 — the conflict-keyed evaluation dataset is validation-v4, not v3)**
  `[UNSIGNED — operator]` The conflict-keyed validation dataset is created as **v4, after**
  WS-1.3 freezes the per-country v3, so the eval successor plan's step-2 identities stay
  stable and WS-3 stays off the label timeline. Consequence recorded by the step-05 memo
  (C14): nothing in the 48-hour window touches `docs/evals/analysis/` on WS-3's account;
  `conflict-roca-v1` / `conflict-iran-v1` stay OFFLINE under the `validation` workload
  (`eval-profile.ts:71-78`; `conflict-validation-profile.ts:42-46` "NO live path").
  Coordination with WS-1.3 is naming only (contract version, results basenames) — no shared
  file.

### (e2) D4 — the fourteen conflict-validation unit decisions (C1–C14) and N1

- **2026-09-06 (D4 — conflict-validation unit decisions C1–C14 signed as recommended;
  N1 supersedes the soak design's provider row)** `[UNSIGNED — operator]` The operator signs
  every recommendation in `docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md`
  ("yes sign all 14"), which is binding for steps 13, 14, 19 and 24 and supersedes the CTO
  handoff wherever the two differ. Summary of what is now settled:
  **C1** reference editions use design Option 3 — new `benchmark_report_editions` +
  `benchmark_series_days` keyed by the domain `editionKey`, nullable `isw_report_id` FK,
  **`isw_reports` untouched** (no `series`/`edition` columns, no relaxed unique key, no
  `ru→roca` backfill in DDL); `source_citations`, `sources`, `source_theater_stats` and
  `validation_runs` are unchanged.
  **C2** the `CONFLICT_REGISTRY` becomes production truth through a NEW, UNSCHEDULED
  `src/app/api/cron/conflict-validate` route; the existing per-country `validate` job,
  `validation_runs` and `/scoreboard` numbers stay byte-identical through the window.
  **C3** the denominator is every declared Key Takeaway of the selected edition under the
  frozen `CONFLICT_HEADLINE_LABEL`; `classifyTakeawayTheater` becomes an ATTRIBUTION stored
  in `unit_attribution`, never a filter — which is what removes the RU/UA double count.
  **C4** `designated-final-v1`: discovery records EVERY edition, the cron scores ONE
  observation per (conflict, daily-final winner, day), and the day's headline is derived at
  read time, never by mutating an older row.
  **C5** an edition links `isw_report_id` only when an existing `isw_reports` row's URL
  normalizes to the same `editionKey`; otherwise `citation_anchor = none` and the
  non-independence diagnostic honestly reports `unavailable`. Changing production's probe
  order is deferred to WS-3.7 on step 14's measured evidence.
  **C6** observations are **append-only** — `id serial`, `cron_run_id` FK, partial unique
  `(conflict_id, reference_edition_id, cron_run_id)`, no unique key on (conflict, edition),
  no overwrite path — because the shadow soak grades verdict variance across repeated runs of
  the same days and an overwrite would destroy that instrument (ruling 17 points the same way).
  `withCronRun` gains an optional `runId` callback argument (additive).
  **C7** the Iran/Levant gazetteer stays its own versioned module consumed via
  `gazetteerFor(series)`; `lane-classifier.ts`'s `IRAN_GEO` stays a separate versioned regex
  set, coupled only by a TEST asserting every classifier toponym exists in the gazetteer;
  observations stamp `gazetteer_version`.
  **C8** `legacy_only` gulf theaters keep the SHIPPED contract — excluded from corpus recall,
  labeled MEMBERS of published retention — and the view adds a derived "matched with
  legacy-only evidence" companion count. The handoff's "excluded from the numerator" is
  NOT adopted: it would be a methodology change (new epoch, golden regeneration).
  **C9** ROCA stays `contributorTracks = ["military"]` for the soak; `+elite_politics`
  (`ru-ua-ev-v2`) is a post-soak candidate decided on the soak's §5.1 miss sample.
  **C10** `/scoreboard` STAYS PUBLIC; the country rows are relabeled as evidence lenses by
  copy only (all seven locales), numbers untouched, and the conflict view reuses the existing
  flag-gated `/conflicts/**` routes with a DB-backed provider. The ROUTES-row obligation is
  met by extending `conflict-feature-off.itest.ts`, not by an `authz-page-gate` row.
  **C11** conflict rows carry NO coverage target in this window — numerator/denominator, n,
  label and rung only; the target is set after the soak, by its own entry.
  **C12** the shadow matcher gets its OWN ledger row `llm_conflict_match` with
  `CONFLICT_MATCH_USD_CAP_DAILY` (fail-closed when unset), `CONFLICT_MATCH_DAILY_REQUEST_CAP`
  300, `CONFLICT_MATCH_RUN_REQUEST_CAP` 200 and the `LLM_SPRINT_USD_CAP` backstop — never the
  production `llm_match` row (a shadow budget stop must not starve production validation) and
  never `openai_eval` (a cron route importing `src/lib/evals/*` breaks the eval-library
  isolation contract).
  **C13** a versioned `deriveUnitFlags` seam ships at `unit-flags-v0` with `negative` as a
  deflationary heuristic and `compound` UNDETERMINED (`false`); every observation stamps
  `unit_flags_version` and the view labels such rows "compound handling undetermined — not
  soak-eligible". **Binding condition of this signature:** because `compound: false` is the
  over-credit direction, no number produced under `unit-flags-v0` may leave the internal view
  — not to a customer, not onto `/scoreboard`, not into a report figure. A human-calibrated
  `compound-v1` remains a WS-3.6 prerequisite.
  **C14** is D3 above (v4).
  **N1** — the shadow-soak design's §7 provider row (`openai_eval` +
  `EVAL_USD_CAP_DAILY`) is SUPERSEDED by `llm_conflict_match` + `CONFLICT_MATCH_USD_CAP_DAILY`
  with **every predeclared threshold unchanged** (daily $2, 300/day, 200/run, ≤$25 envelope,
  `LLM_SPRINT_USD_CAP` backstop), so the soak stays predeclared rather than retuned.
  **Ruling-4 ordering, binding at WS-3.6, not now:** deploying the guard with its cap unset
  stops nothing (the path is inert and the ladder falls back to the keyword rung), but
  `CONFLICT_MATCH_USD_CAP_DAILY` must exist in ALL THREE Vercel environments BEFORE the cron
  line is added to `vercel.json`.
  This entry authorizes no deploy, no environment change, no production write, no flag-on and
  no soak; every PR it unblocks lands inert behind step 26's go/no-go.

### (e3) N2 — manual invocation of the unscheduled conflict route

- **2026-09-06 (N2 — production invocation of `/api/cron/conflict-validate` is forbidden
  until WS-3.6)** `[UNSIGNED — operator]` Once the route deploys, a `GET` with `CRON_SECRET`
  WRITES `benchmark_report_editions` / `benchmark_series_days` (and, after PR 3.3b,
  observations) in production. Such an invocation is forbidden until the WS-3.6 scheduling
  entry, with ONE exception: a bounded operator smoke over a single date and a single
  conflict, signed in this log before it runs and reported with its counts afterwards. The
  post-deploy smoke in the plan's §6 deliberately calls the route WITHOUT the secret and
  expects 401.

### (e4) N3 — optional edition backfill from existing `isw_reports`

- **2026-09-06 (N3 — edition backfill authorized after PR 3.2a deploys)** `[UNSIGNED —
  operator]` The idempotent, $0, LLM-free operator script registering every existing
  ROCA/Iran `isw_reports` URL as an edition row (with `isw_report_id` linked) is authorized
  to run AFTER PR 3.2a is merged and deployed, preceded by a Neon backup branch (Iran-recovery
  precedent) and followed by a decision-log entry with counts. It writes ONLY to the two new
  tables; `isw_reports` and `source_citations` are not touched. It also supplies the ≥1-month
  real sample the compound-rate measurement (register #12.2) needs.

### (e5) E4 — val-typ-005 semantic label

- **2026-09-06 (E4 — val-typ-005 semantic adjudication, #105)** `[UNSIGNED — operator]` For
  development case `val-typ-005-majority`, takeaway 1's semantic label is **`claimId: null`**:
  "Air defense units were active over Belgorod region" does not establish the INCREASE that
  defines the takeaway's development, and shared activity plus shared location identify a
  topic, not an event (`src/lib/validation/llm-match.ts:75-82` requires the same underlying
  development and contains no "same event, weaker strength" rule). This judgment is
  independent of the authored 2-2-1 vote arithmetic. Both `expectMajority` entries stay
  unchanged (`[{takeawayIndex: 0, final: 1071}, {takeawayIndex: 1, final: null}]`) — the pin
  tests fixture arithmetic while live output is scored against `reference.labels`, and
  `validation-parity.test.ts:311-340` deliberately makes the two disagree while both pass.
  WS-1.3 records this reason in the validation-v3 admission; any changed reference needs a new
  case ID or `datasetVersion`; existing v1/v2 datasets and historical results stay frozen.
  This ruling grants no heldout inspection, rerun, scorer change, spend or deployment.
  Source: `docs/reviews/EVAL-VAL-TYP-005-ADJUDICATION-2026-09-05.md`.

### (e6) E5 — regeneration of the committed conflict offline results (step 19 only)

- **2026-09-06 (E5 — one authorized write under `docs/evals/analysis/`, scoped to step 19)**
  `[UNSIGNED — operator]` When step 19 lands the scorer-level per-unit `insufficient_data`
  diagnostic, the golden `cc-matcher-failclosed-013b#B-zero-valid-rounds` changes, its bytes
  feed `conflictDatasetContentHash`, and `hardening-cli.test.ts:193` fails until
  `docs/evals/analysis/results/conflict-roca-v1-offline-fixtures.json`,
  `…/conflict-iran-v1-offline-fixtures.json` and `CONFLICT-EVAL-SCORECARD` are regenerated
  with `--offline --profile conflict --fresh --fresh-ack`. That regeneration is **authorized
  for step 19 only**: it is deterministic, costs $0 and contacts no provider, but it is a
  write under `docs/evals/analysis/`, which this program otherwise freezes. Conditions: the PR
  body shows the exact command and the changed golden; an `EVAL-EXPOSURE-LEDGER.md` entry
  records it; no other file under `docs/evals/analysis/` is touched; step 06's PR stays
  rung-level only so it needs no regeneration.

### (e7) R1 — Ask per-model attribution is a read-only report

- **2026-09-06 (R1 — Ask per-model attribution shape)** `[UNSIGNED — operator]` Ask per-model
  attribution ships as a **read-only report over `ask_usage`** (PR-2.1-1): no migration, no
  environment change, no cap split. The `provider_usage.model` column is explicitly NOT taken
  — `provider_usage` is UNIQUE (provider, day), so a model column there would stamp only the
  last model of each day and attribute nothing; per-model provider rows are rejected outright
  because they would split `ASK_USD_CAP_DAILY` and change ruling-4 env ordering.
  **Consequence: planned migration 0031 is not created**, and the window's migration order
  reduces to 0028/0029 (step 13) then 0030 (step 16). Revisit after step 4 of the eval program.

### (e8) R2 — registry identity decoupled, no `analysis-reg-v2` bump

- **2026-09-06 (R2 — offline eval identity decoupled from the live registry constant; no
  version bump this window)** `[UNSIGNED — operator]` `ANALYSIS_ROUTING_REGISTRY_VERSION` is
  stamped into every offline eval results header and compared on resume, and
  `hardening-cli.test.ts:192-206` pins the committed files, so bumping the constant to
  `analysis-reg-v2` would rewrite files under `docs/evals/analysis/` for no benefit. Step 12
  decouples the offline identity from the live constant (PR-2.2-2) and the bump is deferred
  until the first non-OpenAI approval actually lands, when it carries its own inventory pass.

### (e9) R3 — scorecard gate on the Ask Auto money path

- **2026-09-06 (R3 — `hasScorecard()` gates the Ask Auto money path)** `[UNSIGNED —
  operator]` The Auto money path checks `hasScorecard()` and DEGRADES (provider
  `"unscorecarded"`) rather than throwing, behind a test that pins baseline behaviour
  byte-identical when no environment override exists — so an environment with no override
  behaves exactly as it does today.

### (e10) O1 (CP1 tier) — log-drain sink, retention and registration

- **2026-09-06 (O1 — Vercel log drain into our own Neon-backed receiver; 14-day retention)**
  `[UNSIGNED — operator]` OPEN-TASKS #93 is closed by option (a): a receiver route
  `/api/logs/drain` on our own deployment inserting into our own `runtime_logs` table,
  retention **14 days** swept inside the drain route, and the operator registers the drain
  through the Vercel dashboard AFTER the receiver deploys with `LOG_DRAIN_SECRET` already set
  in Production (ruling-4-style ordering, even though the secret is not a spend cap).
  **Clarification of record:** the operator's H0 note that "Neon does not support drains on
  the Launch plan" concerns a Neon-side log-export feature this design never uses — the
  receiver needs nothing from Neon beyond ordinary table writes, and the only platform
  capability required is the Vercel drain, which the operator confirmed the plan supports.
  This supersedes the contrary sentence in entry (c)'s O1 draft.

### (e11) O2 — #79 RU citation drain (production writes authorized)

- **2026-09-06 (O2 — #79 RU ROCA citation drain authorized, with a backup branch)**
  `[UNSIGNED — operator]` The operator is authorized to run
  `scripts/isw-refresh.ts --theater ru` (and `--retry-failed` if the dry run shows fetch
  failures) followed by `scripts/registry-materialize.ts` against PRODUCTION, per
  `docs/reviews/RUNBOOK-79-RU-CITATION-DRAIN-2026-09-05.md`, preceded by a Neon backup branch
  kept until this entry is written and then deleted. Cost is **$0** — neither script imports
  any LLM module; egress is to understandingwar.org only, disk-cached, ≥2 s/host. Scope: the
  ~36 `parse_status='pending'` `ru` reports 2026-07-04 → 2026-08-14, the same historical
  staleness the 2026-08-15 Iran recovery fixed for `ir`.
  **Recorded consequence, so it is not discovered later as a surprise:**
  `registry-materialize` is a full DELETE + rebuild of `source_theater_stats` in one
  transaction and also updates the global reliability columns on `sources`, and the digest
  gather orders documents by `s.reliability_score` (`src/lib/analysis/digest.ts:89,100`).
  Draining RU citations therefore changes WHICH documents enter subsequent ru digests — the
  intended repair, but a live behaviour change, not a passive backfill. Run it away from the
  02:00Z finalize; the closing entry records the counts and the first post-drain ru digest and
  scoreboard row.

### (e12) D10 — migration numbering and merge order

- **2026-09-06 (D10 — migration order for the window)** `[UNSIGNED — operator]` The INDEX §4
  assignment is accepted, less the migration R1 removed: **0028** `benchmark_report_editions`
  + `benchmark_series_days` and **0029** `conflict_validation_observations` (both step 13,
  merged in that order), then **0030** `runtime_logs` (step 16). No 0031 (R1 = read-only
  report). `9999_claim_source_trigger.sql` stays last; each migration PR rebases onto `main`
  and regenerates before merge; no applied migration is renumbered (ruling 5).

### (e13) T1 / T2 — WS-7 tradecraft vocabulary and access date

- **2026-09-06 (T1 — ICS 206-01 descriptors and ICD 203 estimative language become the
  product vocabulary)** `[UNSIGNED — operator]` ICS 206-01 source descriptors and ICD 203
  estimative language are the user-facing vocabulary; NATO AJP-2.1 / Admiralty two-axis codes
  are derived EXPORT fields only, never the primary presentation
  (`docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` §5 item 9).
- **2026-09-06 (T2 — access date in citation mode)** `[UNSIGNED — operator]` The citation mode
  shows `fetched_at` labeled **"Accessed (BNOW ingest)"**, and only in citation mode. This
  deliberately reverses the 2026-07-16 decision to hide the ingest timestamp, for the narrow
  case of a citation a reader must be able to reconstruct.
- **2026-09-06 (T3 — approach agreed, tables unsigned)** `[UNSIGNED — operator]` The operator
  agrees to the approach of two versioned mapping tables (ICD 203 band × confidence; 1–6
  credibility) with a per-cell rationale and the constraint that no cell may exceed
  "likely" / "moderate" from a single uncorroborated document. **The tables themselves are
  NOT yet signed** — step 29 drafts them as data and the operator signs before step 34's first
  PR. No WS-7 PR may ship a mapping cell until that signature exists.

### (e14) Awaiting an answer — drafted so signing is one line

- **R6 — caps for the Anthropic metering row.** AWAITING. Recommendation: the new row
  `anthropic_digest` reuses `LLM_SPRINT_USD_CAP` (all-time backstop) and `LLM_DIGEST_USD_CAP`
  (daily), with NO new environment variable — the entity-audit precedent, and it avoids the
  ruling-4 "cap env in all three environments before the guard deploys" ordering for a path
  that is dormant anyway. The alternative (`ANTHROPIC_DIGEST_USD_CAP`) is strictly more
  operational work for the same protection. Blocks PR-2.2-B1 (step 20b) only.
- **R7 — Anthropic model id and its operator-verified list price.** AWAITING an operator fact:
  the exact model id to price in `src/lib/llm/pricing.ts` and its list price per 1M input /
  output tokens, verified on the day (the 2026-08-20 gpt-5-mini correction is the precedent
  for why a remembered price is not acceptable). Until both exist the model is unpriced and
  `workloadDispatchConfig` refuses it before any reservation — which is the correct
  fail-closed state, not a bug. Blocks PR-2.2-B2 (step 20b) only.

### (e15) D6 addendum — what the campaign-local `LLM_SPRINT_USD_CAP` does

- **2026-09-06 (D6 addendum — effect of the campaign-local `LLM_SPRINT_USD_CAP`, requested
  with the authorization)** `[UNSIGNED — operator]` The authorized value is the **all-time
  total cap for ONE provider row**, compared against that row's cumulative lifetime total
  before each dispatch (`src/lib/usage/spend-guard.ts:122`) — not a per-run budget and not a
  daily cap. For the WS-1.1 capture run the row is `openai_eval` on the kept disposable Neon
  branch, whose ledger **already holds ≈$0.15** from the 2026-09-03 campaign; that prior spend
  counts against whatever value is chosen, so $0.50 leaves ≈$0.35 of headroom and $2.00 leaves
  ≈$1.85, against a run that costs ≈$0.01 (≈18 map calls). Because the check is a threshold
  test taken BEFORE dispatch, terminal spend can exceed the ceiling by at most one response's
  cost. It never acts alone: `EVAL_USD_CAP_DAILY` must also be set (=2 per the successor
  plan) or the guard refuses everywhere — `eval-guard.ts` deliberately has no
  out-of-production default. And it is **campaign-local**: a shell variable for a local CLI
  run bound to a disposable branch, never written to any Vercel environment, so production's
  shared $10 backstop and every production ledger row are untouched.
  **Value chosen: $2.00** (the top of the authorized range) so a retry or a second capture
  pass cannot force a mid-run cap edit; the executing session records the exact value, the
  branch id, and the before/after `openai_eval` ledger reading in
  `docs/reviews/EVAL-EXPOSURE-LEDGER.md`. If the operator prefers $0.50, strike this line and
  say so before step 10 runs.
