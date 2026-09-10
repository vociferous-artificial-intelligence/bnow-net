# Conflict shadow soak — enablement checklist and blocker dispositions

**Status: NOTHING IS ENABLED BY THIS DOCUMENT.** It is a checklist, not an action. No flag is
turned on, no environment variable is set, no cron line is added, no migration is applied and no
provider is contacted by anything written here. The `vercel.json` diff in §5 is printed as text
and is deliberately NOT applied — `git diff vercel.json` is empty on the branch that adds this
file.

Produced by step 24 (WS-3.6 prep) of the 2026-09-05 48-hour program, from
`docs/designs/CONFLICT-SHADOW-SOAK.md`, the five standing blockers in
`docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md` §6, the signed decisions D4 (C1–C14),
N1, N2, N3 and C15 in `AGENTS.md`, the step-18 audit register
(`docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md`) with its 2026-09-09 D-a…D-f
resolutions, the C5-m measurement (`docs/reviews/C5M-PROBES-2026-09-07.md`), and the step-19
handoff (`docs/reviews/WS-3-3-EVIDENCE-POPULATION-2026-09-06.md`).

The soak's own thresholds are NOT restated as new numbers here. Where §6 quotes them it quotes
the design verbatim, so there is exactly one authority and this document cannot silently retune
it.

---

## 1. The five standing blockers — owner and disposition

The landing report's §6 named five. Two are now closed; three remain open and each **blocks the
soak**, not merely its report.

| # | Blocker | State | Owner | What closed it, or what must |
|---|---|---|---|---|
| 1 | Compound-unit calibration | **OPEN — blocks** | the pre-soak `compound-v1` PR | see §1.1 |
| 2 | Assessment/inference diagnostic class | **OPEN — blocks** | WS-3.6, on the `conflict-epoch-2` PR | see §1.2 |
| 3 | Iran keyword rung | **CLOSED** | steps 06 + 19 | see §1.3 |
| 4 | Source-independence semantics | **OPEN — blocks the §10 report** | WS-3.6, same epoch-2 PR | see §1.4 |
| 5 | Sample-power sizing (R-M-6) | **OPEN — blocks day 1** | the soak authorization gate | see §1.5 |

### 1.1 Compound-unit calibration — OPEN

**What shipped instead.** `unit-flags-v0` (`src/lib/conflicts/unit-flags.ts:33`), whose
`compound` derivation is UNDETERMINED and returns `false`. Decision **C13** signed that as a
deliberate placeholder *with a binding condition*: `false` is the OVER-CREDIT direction, so no
number produced under it may leave the internal view — not to a customer, not onto
`/scoreboard`, not into a report figure. Every observation this window can write stamps
`unit-flags-v0` (step-19 handoff), so **every conflict number that exists today is
not-soak-eligible**.

**What step 24 built against it.** The conflict surfaces carry the condition as a BANNER, in the
slot and at the prominence the retired synthetic-corpus banner held
(`src/components/conflicts/soak-eligibility-banner.tsx`), and the read model computes
`compoundUndetermined` per day and in aggregate rather than filtering the rows away. When a
calibrated version replaces `unit-flags-v0` the banner disappears by itself; nothing has to be
remembered and removed.

**What must happen before the soak.** Register #12's three BLOCKING prerequisites, quoted in the
design's §8 item 7: a versioned, human-calibrated derivation of `compound` from real takeaway
text; a measured compound rate over a real sample of BOTH series covering ≥1 month, reported
with its sampling method; and an explicit adjudication of the register-#11 attestation rule
against that measurement, recorded as a new register entry. **The ≥1-month sample is what
decision N3's zero-network `--backfill-from-isw-reports` mode exists to supply** — it registers
every historical ROCA/Iran `isw_reports` URL as an edition row, and the edition rows are where
`derived.units` (the calibration substrate) lives.

**A hazard the substrate has, recorded so the calibration does not trip over it.** Register note
**WS3-N08**: a `derived` replacement is UNJOURNALED. If ISW edits a Key Takeaway after
discovery, the unit `sha256` — the join key the calibration would use — changes under the same
`unitsVersion`, with no trail of the displaced hash. Not wrong (a refresh should win), but a
calibration that assumes hash stability across the sampling window is assuming something the
schema does not guarantee.

### 1.2 Assessment/inference diagnostic class — OPEN

A vocabulary + scorer + goldens change, denominator-neutral, reported beside the headline the
way `partial` is. It rides the single pre-soak `conflict-epoch-2` PR together with blocker 4 and
with P7 §5.2 item 4b (unit ordinals + canonical URL in the profile). Bundling is deliberate:
each changes the scored profile, so shipping them separately would mint two methodology epochs
and force two golden regenerations.

### 1.3 Iran keyword rung — CLOSED

Closed by **step 06** (the `iran-levant-v1` gazetteer + the keyword rung's `insufficient_data`
return for a conflict whose lanes have no gazetteer coverage) and **step 19** (the wiring: the
live pipeline consumes `gazetteerFor(series)` and stamps `gazetteer_version` on every
observation). Confirmed in this window: step-19 rows carry `iran-levant-v1` for `iran_regional`
and `ru-ua-v1` for `russia_ukraine`.

**One residual, and it is now smaller than the step-19 handoff recorded.** That handoff (written
on its branch B, before lane C landed) states that `unit_attribution` is `unattributed` for
every Iran unit because `EDITION_UNITS_VERSION` computed signatures under the RU/UA gazetteer.
Lane C's **WS3-F05** has since landed on `main` (`c1b0b31`, "derive edition unit signatures
under the series' own gazetteer"), so **editions discovered from now on carry Iran toponyms and
attribution flows through with no pipeline change** — the step-19 handoff says so explicitly.
Rows written before that commit keep `unattributed`, which is honest and must not be
back-filled. The soak must therefore **start from editions discovered after `c1b0b31`**, or
report the mixed population; `unit-attribution.test.ts`'s "today's Iran editions attribute as
`unattributed`" case is the one to revisit at that point (it pins branch-B behaviour
deliberately, not a permanent contract).

### 1.4 Source-independence semantics — OPEN

The F-NEW-1 relabel plus the `sourceDomain`-grain diagnostic. Rides the epoch-2 PR. It blocks
the soak's §10 REPORT rather than the observation pipeline: observations can be collected
without it, but an independence claim cannot be made from them.

### 1.5 Sample-power sizing (R-M-6) — OPEN

A soak-plan refinement, using `src/lib/conflicts/soak-instruments.ts`, due before day 1 and
owned by the soak authorization gate. §6 below adds one input this window produced that the
sizing must absorb: the `probe_failed` / `publication_gap` denominators cannot be predeclared as
the design assumes, for a measured reason.

---

## 2. Enablement items — the checklist proper

Each item is a precondition. None is performed here.

### 2.1 Environment, in ruling-4 order

**The ordering rule, stated once:** a cap env must exist in ALL THREE Vercel environments
BEFORE the code that reads it is deployed, or the pipeline that reads it stops. For the conflict
matcher the ordering is looser in one direction and not in the other, and the difference matters:

- **Deploying the guard with its cap unset stops nothing.** `createLiveMatcher` refuses on an
  absent `CONFLICT_MATCH_USD_CAP_DAILY` before a SpendGuard is built, before `guard.init()`
  reads the database and before any client is constructed, and the ladder falls back to the
  keyword rung. That is the designed inert state, not a defect (signed D4, ruling-4 ordering
  paragraph).
- **`CONFLICT_MATCH_USD_CAP_DAILY` must exist in Production, Preview AND Development BEFORE the
  `vercel.json` cron line is added.** This is the ordering that is real, and it is the one
  ordering step 19 created (its handoff item (a)).

| Variable | Value | Where | When |
|---|---|---|---|
| `CONFLICT_MATCH_USD_CAP_DAILY` | `2` | Production + Preview + Development | **before** the cron line |
| `CONFLICT_MATCH_DAILY_REQUEST_CAP` | `300` | all three (default is already 300) | with the above |
| `CONFLICT_MATCH_RUN_REQUEST_CAP` | `200` | all three (default is already 200) | with the above |
| `LLM_SPRINT_USD_CAP` | **unchanged** | — | the soak does NOT raise the shared backstop |

Verified at the time of writing: `src/lib/usage/llm-guard.ts:185-207` reads exactly these three
names against provider row `llm_conflict_match`, and `envCap("CONFLICT_MATCH_USD_CAP_DAILY")`
has **no default of any kind**.

**`openai_eval` / `EVAL_USD_CAP_DAILY` are NOT the mechanism.** The design's §7 table names them;
decision **N1 supersedes that row** with `llm_conflict_match` +
`CONFLICT_MATCH_USD_CAP_DAILY`, every predeclared threshold unchanged (daily $2, 300/day,
200/run, ≤$25 envelope, `LLM_SPRINT_USD_CAP` backstop). Two reasons, both recorded in D4/C12: a
shadow budget stop must never starve the production `validate` matcher, and a cron route
importing `src/lib/evals/*` breaks the eval-library isolation contract. **Nothing in this
checklist requires any `EVAL_*` variable.**

### 2.2 Feature-flag posture

- `FEATURE_AUTH_GATE=true` must be set in **every environment where `CONFLICTS_UI` is set**
  (F-NEW-6). It is already `true` in Production. This is not optional: the conflict evidence
  tier's gate is `requireAcceptedUser`, whose anonymous branch returns `null` rather than
  redirecting when `FEATURE_AUTH_GATE` is not `"true"` (`src/lib/gate.ts:33-35`) — so a flag-on
  environment without it would serve the gated claim text to anonymous callers.
- **The soak itself does not need `CONFLICTS_UI`.** Design §2: the soak writes nothing
  user-facing and the flag stays off during it. Turning the flag on is a separate product
  decision, and §3 below is the question that decision has to answer first.
- `robots.ts` already disallows `/conflicts/*/benchmark/*/evidence` (added by step 24, PR 1),
  which satisfies the combined-review note and P7 §5.2 item 4. The teaser pages stay crawlable
  by design. No sitemap change: `/conflicts` is not listed there and is not added.

### 2.3 Code preconditions that are NOT satisfied today

- **A live conflict dispatch path.** `--execute-live` is refused for `--profile conflict` by
  design — `src/lib/evals/conflict-validation-profile.ts:42-45`: *"There is NO live path for the
  conflict profile in this workstream — the CLI refuses `--execute-live --profile conflict`."*
  Lifting that refusal is a code change requiring its own adversarial review (design §8 item 4).
- **The snapshot capture path** (design §8 item 1). Until its six gates pass, the soak runs
  `retrospective`-only and must say so in every artifact. There is no third option, and the
  observation store enforces it: `persistObservation` refuses a non-`retrospective` kind.
- **WS3-F01 and WS3-F03** (§4 below) — both land in the module the soak's discovery runs
  through.

### 2.4 Operating rules for the scheduled window

- **N2 stands until the WS-3.6 scheduling entry:** a production `GET /api/cron/conflict-validate`
  with `CRON_SECRET` WRITES `benchmark_report_editions`, `benchmark_series_days` and — since step
  19 — observations. It is forbidden, with one exception: a bounded operator smoke over a single
  date and a single conflict, signed in the decision log before it runs and reported with its
  counts afterwards. The post-deploy smoke calls the route **without** the secret and expects
  **401**.
- **WS3-N06:** never run a live `scripts/isw-refresh.ts --series …` pass (without `--dry`) while
  the cron is scheduled. The realistic second writer is exactly that, and the merge path's
  attempt budget is 4; the route classifies the throw as a degraded cell, so the cost is a
  degraded run rather than corruption — but it is avoidable and there is no reason to spend it.
- **WS3-N07:** keep `lookback` at **2** (`DEFAULT_LOOKBACK`, `MAX_LOOKBACK = 3`). A dead host
  costs up to ~153 s per probe against a route ceiling of 300 s
  (`JOB_MAX_DURATION_SEC["conflict-validate"]`), so a bad day leaves a ruling-10 timeout row for
  the #98 sweep to classify. Expect that; do not read it as an incident on its own.
- Existing production behaviour must be byte-identical with the soak running. The first soak-day
  report includes the design's §2 diff: that day's per-country `validation_runs` rows against a
  control day.

---

## 3. One question this checklist cannot answer, and it is a gate

**May a `unit-flags-v0` number be shown on a PUBLIC surface when `CONFLICTS_UI` is turned on?**

C13's binding condition says no number produced under `unit-flags-v0` may reach a customer. The
`/conflicts` teaser tier is **public when the flag is on** (memo C10 (a), the shipped access-tier
split). Today the two do not collide, because the flag is absent in every environment and every
conflict route 404s — which is why step 24 shipped the banner rather than a block. **At flag-on
they collide directly.**

Three ways out, for the operator to choose at the enablement decision, not before:

- **(a)** Land `compound-v1` first, so no `unit-flags-v0` number is ever public. Cleanest;
  makes flag-on wait on blocker 1.
- **(b)** Turn the flag on with the teaser tier gated to `requireAcceptedUser` for the duration —
  a change to the shipped C10 access-tier split, so it needs its own decision entry.
- **(c)** Accept the banner as sufficient disclosure for a public surface. This is a reading of
  C13's "may not reach a customer" that the words do not obviously support, and it should not be
  taken by default or by silence.

**Recommendation: (a).** It costs nothing that is not already on the critical path — blocker 1
blocks the soak anyway — and it is the only option that needs no new decision entry.

---

## 4. Corrections this window forces on the soak plan

### 4.1 `probe_failed` does not mean "ISW did not publish" — measured, not argued

The 2026-09-08 C5-m re-run (`docs/reviews/C5M-PROBES-2026-09-07.md`, R.15) ran three identical
`roca` passes over the same 23 days and got `publishedDays` **6 → 6 → 13**, while `isw_reports`
shows all 23 days published. **All 17 of pass 1's `probe_failed` days were false negatives.**
The host answers `403` for not-found URLs once its ~20-request not-found budget is spent, and
that 403 state suppresses REAL pages, not only nonexistent shapes.

Two consequences for the soak, both binding:

1. **`publication_gap` is effectively unreachable on this host for windows longer than about a
   week.** Confirmation requires EVERY probe of the day to be a clean 404
   (`edition-discovery.ts`, `isCleanNotFound` = `status === 404`), and after the budget is spent
   no further clean 404 is issued. The design's §3 rationale — that 21 days "covers at least one
   publication gap" — **cannot be relied on**; a 21-day window may legitimately observe zero
   confirmed gaps while ISW gapped several times.
2. **No soak threshold may be predeclared against `probe_failed` or `publication_gap` counts**
   without accounting for this. §1.5's sample-power sizing must absorb it before day 1.

**What fixes it, and it is already decided.** Decision **D-a (b)** (2026-09-09) makes a 403 (and
429 / ≥500 / null / undersized 200) an *indeterminate* probe class distinct from a clean 404,
counted separately as `probeIndeterminate`, with an explicit "not confirmable under throttling"
branch in gap confirmation and a `dayStatusReason` discriminator (`throttled` /
`unparseable_body`). Lane C landed **WS3-F01** on `main` (`079065d`). Backoff — R.15's option
(c) — is deliberately deferred to its own decision because it changes fetch volume against a
third party.

### 4.2 The phantom-edition margin (WS3-F03) — check the body size at enablement

`MIN_REPORT_BYTES = 10_000` is the only edition criterion, and the host's error page measured
**9,661 bytes**. The margin is **339 bytes**. A template change on the host's error page would
make an error page an "edition": it would prove the day published, clear a confirmed gap row,
and could outrank the real edition in `selectDailyFinal`.

Lane C landed **WS3-F03** (`2456c4f`, "a >10 KB body that declares no takeaway is not an
edition") and the follow-up `784d69a` ("an undersized 200 is an unusable BODY, not throttling"),
which is decision **D-b (a)**: such a body is counted indeterminate with reason
`unparseable_body` and the day stays `probe_failed`. **The enablement check remains, because the
fix removes the consequence and not the margin:** re-measure the 403 and 404 body sizes against
`MIN_REPORT_BYTES` at enablement, and again if the host's error page changes. The same threshold
lives in production's `src/lib/validation/run.ts`.

### 4.3 The C4 selection rule now has a measured failure it prevents

C5-m measured, on 2026-02-28 → 03-22: `multiEditionDays = 8`, `anchorNotFinalDays = 1` — the
citation anchor sat on the NON-final edition on 2026-03-05 (anchor `morning`, daily final
`evening`). Both are LOWER bounds (14 of 23 days were probed under the 403 state; 2026-03-10 is
the named unresolved candidate, and if it resolves the other way the figure is 2 of 9).

Step 24's read model refuses to substitute: a day whose daily-final edition has no observation
is rendered as PENDING, never satisfied by another edition's observation, and the flag-on fork
itest proves it over HTTP. **The soak should expect pending days on multi-edition Iran days and
must not read them as missing coverage** — they are a statement about which edition was
evaluated, not about the evidence.

`roca`'s `multiEditionDays = 0` is a property of the code (one candidate URL per ROCA day) and
must **never** be cited as evidence about ISW.

---

## 5. The `vercel.json` line to add — printed, NOT applied

```diff
       { "path": "/api/cron/validate", "schedule": "0 7 * * *" },
+      { "path": "/api/cron/conflict-validate", "schedule": "30 7 * * *" },
       { "path": "/api/cron/enrich", "schedule": "0 8 * * *" }
```

`07:30Z` — after `validate` (07:00Z), before `enrich` (08:00Z), preserving the 2026-08-17
Candidate B clustering that measured a 13.6% Neon active-compute reduction. The route already
declares `maxDuration = 300` and its `JOB_MAX_DURATION_SEC` entry is in lockstep
(`cron-run.ts:65`, pinned by a test).

**Do not apply this hunk until §2.1's three environment variables exist in all three Vercel
environments** and the WS-3.6 scheduling decision-log entry is written.

---

## 6. Soak window and verdict criteria — quoted, not restated

The authority is `docs/designs/CONFLICT-SHADOW-SOAK.md`. Quoted here so the checklist is usable
without a second file open; **if this section and the design ever differ, the design wins.**

**Duration and volume (§3), predeclared minima:** 21 consecutive days · ≥18 ROCA reports scored ·
≥14 Iran Update reports scored · ≥90 declared ROCA units · ≥70 declared Iran units · ≥3
independent runs of the SAME 5 reference days per conflict. *"If a minimum is not met at day 21,
the soak extends (up to 35 days) rather than reporting on a thin sample. If a minimum is still
unmet at day 35, the verdict is `insufficient_data` — never a scored pass."*

**Lane minima (§4):** RU/UA — ≥1 scored unit in each of `frontline_maneuver`,
`strikes_air_defense`, `force_generation`, `foreign_support`, `strategic_political`, and ≥5 units
in the union of the non-`frontline_maneuver` lanes. Iran — ≥1 in each of `direct_kinetic`,
`proxy_partner`, `maritime`, `nuclear_diplomacy`, `domestic_security`, ≥10 units in the union of
the non-`direct_kinetic` lanes, and ≥3 distinct lanes each reaching ≥2 units. Plus, *"because it
is the load-bearing regional claim"*: ≥5 declared units matched by evidence from a non-`ir`
theater or a non-`military` track.

**Matcher thresholds (§5), all against HUMAN labels:** inter-labeller Cohen's **κ ≥ 0.70** or the
soak reports `label_quality_failed` and the matcher is not graded at all · **precision ≥ 0.90**
(below it the verdict is FAIL regardless of every other number) · **recall ≥ 0.75** (held
precision with lower recall = `pass_deflationary`, publishable only with an explicit "this number
understates coverage" label) · false-agreement rate on negative/quiet-day units **≤ 0.02** ·
≥95% of scored days on the `llm-majority` rung.

**§5.1 second sample:** ≥30 `miss` units per conflict, searched by a human against the
**unfiltered** window corpus; upstream-filter false-exclusion rate **≤ 0.10**, above which the
soak reports `upstream_filter_failed` and the filter, not the matcher, is the operative number.

**Variance (§6):** across the ≥3 repeated runs — max−min headline coverage **≤ 5 percentage
points** per report; per-unit verdict flip rate **≤ 5%**; zero `partial` ↔ `miss` flips on
compound units; `matched` ↔ `miss` flip rate **≤ 5%** on ATOMIC units measured separately.
*"Exceeding any of these is FAIL — a benchmark whose number moves 6 points on identical inputs is
not a benchmark."* Note the design's own correction: the original "zero `partial` ↔ `matched`
flips" criterion is VACUOUS under the register-#11 attestation rule and is retained only as a
regression sentinel.

**Cost ceilings (§7, as amended by N1):** provider row `llm_conflict_match` ·
`CONFLICT_MATCH_USD_CAP_DAILY=2` · `CONFLICT_MATCH_DAILY_REQUEST_CAP=300` ·
`CONFLICT_MATCH_RUN_REQUEST_CAP=200` · `LLM_SPRINT_USD_CAP` unchanged as the backstop · total
envelope **≤ $25 over 21 days**, *"declared up front; crossing it stops the soak rather than
extending the cap"* · SDK `maxRetries: 0`. *"Cost ceilings are caps, not budgets."*

**Abort criteria (§9) — stop immediately, do not finish the window:** any paid reservation
refused for an unexpected reason or any non-`run_cap` spend-stop category · cumulative spend
crossing 80% of the $25 envelope before day 14 · any write outside the eval store · running
precision below 0.85 at the mandatory day-7 or day-14 checkpoint · two or more consecutive days
on the `keyword` rung · any non-`retrospective` kind persisted while the capture path is unproven
· edition-selection non-determinism (the same day selecting different editions across repeated
runs) · any ISW/CTP prose or source full text in a persisted artifact, log, error or rendered
surface — abort, purge, re-review before any restart.

---

## 7. C15's reopening trigger — how the soak detects it

Signed 2026-09-07: `first_observed_at timestamptz` is reopened as a nullable-additive migration
the first time this observation is made —

> *"any `publication_gap` row whose confirming `probe_failed` row was written by the same
> backfill run"*

Until then no column is added and no migration enters the D10 sequence. That leaves the trigger
needing a **detection procedure**, because `benchmark_series_days` carries no timestamp: the
shipped rule substitutes the *report date's* age (≥48 h) for *run separation*, and those are not
the same quantity. Two runs minutes apart during one transient outage, over a window already
≥48 h old — i.e. any backfill — can still confirm a gap.

**The procedure, for the soak's daily bookkeeping:**

1. Every run that writes day rows is a `cron_runs` row (ruling 10). Record, per soak day, the
   `cron_runs.id` set for `job = 'conflict-validate'` and any operator `isw-refresh` invocation.
2. When a day's status transitions `probe_failed → publication_gap`, the run that wrote the
   confirming row is the one whose `started_at`/`finished_at` bracket the transition. Two runs
   inside **one** invocation window — or an operator backfill that swept the same day twice —
   **is** the trigger.
3. The log-drain query in §8(c) below joins `runtime_logs` to a single `cron_runs` row, which is
   what makes step 2 answerable at all rather than inferred.
4. On the first occurrence: record it, and open the `first_observed_at` migration. Do not
   silently accept the gap row — a fabricated gap day is scored differently from a genuine one,
   and that is a corrupted validation input even though the blast radius is one internal row.

**Expect the trigger NOT to fire, and do not read that as evidence it cannot.** §4.1's
measurement makes gap confirmation close to structurally unreachable under throttling, so a
21-day soak may see zero `publication_gap` rows of any kind. The trigger is unexercised, not
disproved. Step 19's fork run recorded zero gap rows for the same reason and said so.

---

## 8. The log-drain queries the closeout runs

From `docs/designs/LOG-DRAIN.md` §9 — `SELECT`-only, runnable through `scripts/sqlq.ts`. Report
(a) for the whole window as the coverage claim, (b) for classification, and (c) for any run that
went `ok=false`, degraded, or was swept.

**(a) In-window coverage.** `count(*)` lines, distinct `request_id` invocations, distinct
`deployment_id`, `count(*) FILTER (WHERE level IN ('error','fatal'))`, and — the one that was
invisible before this table — `count(*) FILTER (WHERE status_code = -1)`, Vercel's "no response
returned and the lambda crashed", i.e. the OOM/kill signature.

**(b) Distinct error signatures**, grouped by `message_sha256` with occurrences, first/last seen
and a 200-character sample, so a residual counter can be classified rather than described.

**(c) Every line of one cron invocation**, joining `cron_runs` to `runtime_logs` on
`request_path = '/api/cron/conflict-validate'` between `started_at` and
`COALESCE(finished_at, started_at + interval '420 seconds')` — the conflict-validate family's
`JOB_MAX_DURATION_SEC` (300) plus `SWEEP_GRACE_SEC` (120), which is exactly the window in which a
run that left `finished_at IS NULL` must have died. **Note the substitution:** the design's
example is written for `/api/cron/map` with a 920-second bound; use the conflict job's own
ceiling, not that literal.

**Ordering constraint (decision A2, option (b)).** The drain must not be REGISTERED against a
database with no `runtime_logs` table — every signed delivery would 500 and be retried.
Registration is the gate, not deploy: before the operator registers the drain in the Vercel
dashboard, `SELECT name FROM _migrations WHERE name LIKE '0029%'` returns exactly one row and
`SELECT to_regclass('runtime_logs')` returns `runtime_logs`. Do not proceed until both answer.

---

## 9. What is NOT enabled by this document

Everything. Specifically: no flag, no environment variable, no cron line, no migration, no
deploy, no provider call, no `--execute-live`, no `CONFLICTS_UI`, no
`CONFLICT_MATCH_USD_CAP_DAILY`, and no production invocation of
`/api/cron/conflict-validate` (N2 stands). The soak may not start until §1's three open blockers
close, §2.3's code preconditions are met, §3's question is answered, and a decision-log entry
names this document's — that is, the design's — thresholds as binding.
