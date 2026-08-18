# Conflict benchmark — shadow-soak plan (PREDECLARED, NOT ENABLED)

**Status: DESIGN ONLY.** Nothing in this document is enabled, scheduled, or
authorized. No flag is set, no cron exists, no paid path is reachable from the
conflict workstream today (`--execute-live` is refused for `--profile
conflict`; every conflict matcher is oracle- or injection-driven). Running this
soak requires the operator gates in §8 — each of which is a separate decision.

Written as Phase 7 deliverable D of
`docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` §15
("Produce a future shadow-soak plan with a predeclared duration, minimum report
counts, lane representation, matcher precision/recall threshold, variance
threshold, query/cost ceiling, and human-review sample. Do not enable it.").

Everything below is **predeclared**: the thresholds are fixed here, in advance
of any data, so a later run cannot be graded against thresholds chosen after
seeing its results. Changing a threshold after the soak starts invalidates the
soak and requires a new decision-register entry.

---

## 1. What the soak is for

Two questions, in this order:

1. **Does the combined evaluation behave as designed on REAL reports?** —
   deterministic edition selection, honest windows, population separation,
   lane representation, and `unavailable` states that are genuinely
   unavailable rather than silently zero.
2. **Is the matcher good enough to publish a combined number?** — measured
   against human labels, not against agreement with the legacy rows.

It is explicitly **not** for demonstrating a coverage improvement. The
comparison against the legacy per-country rows is a diagnostic, not a target;
a soak that "improves" coverage while failing §5's precision floor FAILS.

## 2. Shadow means shadow

- The soak scores reference reports and **writes nothing user-facing**:
  no `validation_runs` row, no `/scoreboard` change, no digest change, no
  public conflict page (the `CONFLICTS_UI` flag stays off during the soak;
  the soak is an eval-plane run, not a product enablement).
- Results land only in the eval results files / eval store under the conflict
  dataset profile, exactly as the offline mode does today.
- Existing production behaviour must be byte-identical with the soak running.
  The first soak-day report includes a diff of the per-country
  `validation_runs` rows produced that day versus a control day, asserting the
  legacy path is untouched.

## 3. Duration and volume (predeclared minima)

| Parameter | Minimum | Rationale |
|---|---|---|
| Wall-clock duration | **21 consecutive days** | covers ≥2 full weekly publication rhythms plus at least one publication gap and one multi-edition day, both of which are the deterministic-selection cases |
| ROCA reference reports scored | **≥18** | ROCA publishes ~daily; 18 of 21 allows 3 gap/failure days without invalidating the soak |
| Iran Update reference reports scored | **≥14** | Iran Updates publish less regularly and gap more often (2026-07-30, 08-01, 08-11..13 are recorded gaps); 14 is the floor at which lane minima in §4 are attainable |
| Declared reference units, ROCA | **≥90** | ~5 takeaways/report × 18 |
| Declared reference units, Iran Update | **≥70** | ~5 takeaways/report × 14 |
| Repeated-run variance samples | **≥3 independent runs** of the SAME 5 reference days per conflict, identical inputs, distinct dispatch | the `runGroupKey` grouping is the variance instrument; 3 is the minimum that can show a flip |

If a minimum is not met at day 21, the soak **extends** (up to 35 days) rather
than reporting on a thin sample. If a minimum is still unmet at day 35, the
verdict is `insufficient_data` — never a scored pass.

## 4. Lane representation minima

A soak that only ever exercises `frontline_maneuver` proves nothing about the
regional model. Per conflict, over the whole soak:

Lane ids below are the frozen taxonomies in `src/lib/conflicts/lanes.ts`.

**russia_ukraine** (`frontline_maneuver`, `strikes_air_defense`,
`force_generation`, `occupied_crossborder`, `foreign_support`,
`russia_partners`, `strategic_political`, `other_in_scope`) — at least one
scored declared unit in each of `frontline_maneuver`, `strikes_air_defense`,
`force_generation`, `foreign_support`, `strategic_political`. Minimum
**5 units** in the union of the non-`frontline_maneuver` lanes.

**iran_regional** (`direct_kinetic`, `proxy_partner`, `maritime`,
`nuclear_diplomacy`, `domestic_security`, `regional_effects`,
`other_in_scope`) — at least one scored declared unit in each of
`direct_kinetic`, `proxy_partner`, `maritime`, `nuclear_diplomacy`,
`domestic_security`. Minimum **10 units** in the union of the
non-`direct_kinetic` lanes, and **≥3 distinct lanes** must each reach ≥2 units.

Lanes that genuinely receive no declared unit in the window are reported as
`not_observed` — distinct from `unavailable` and from `0`. A soak in which any
Iran lane is `not_observed` for the full 21 days is reported with that fact
prominently; it does not by itself fail the soak, but it caps what the soak can
claim about that lane. `other_in_scope` is excluded from the minima on both
sides — it is a residual bucket, and requiring it would reward mis-classification.

Also predeclared, because it is the load-bearing regional claim: **≥5 declared
units must be matched by evidence from a non-`ir` theater or a non-`military`
track**, or the soak cannot claim the multi-track/cross-theater model was
exercised at all.

## 5. Matcher precision / recall thresholds (vs human labels)

The matcher is graded against a **human-labelled** sample, never against the
legacy rows and never against itself.

- **Sample:** 120 (unit, top-candidate-claim) pairs per conflict, stratified —
  40 the matcher called a match, 40 it called a miss, 40 drawn at random from
  the remaining declared units. Drawn by a seeded, committed sampler so the
  sample is reproducible and cannot be curated after the fact.
- **Labelling:** one primary human labeller against the frozen §6.3 material-
  equivalence rules; a second labeller independently labels a 30-pair overlap.
  **Inter-labeller agreement floor: Cohen's κ ≥ 0.70.** Below that the labels
  are not trustworthy and the soak reports `label_quality_failed` — the
  matcher is not graded at all.
- **Thresholds (both must hold, per conflict):**
  - **Precision ≥ 0.90** on matcher-declared matches. Precision is the
    publication-safety-critical direction: a false agreement claims BNOW
    covered a development it did not.
  - **Recall ≥ 0.75** against human-labelled true matches.
  - **False-agreement rate on negative/quiet-day units ≤ 0.02** (these are the
    units where a topical match is most tempting and most wrong).
- **Rung honesty:** ≥95% of scored days must be scored on the `llm-majority`
  rung. A soak where >5% of days fall to `llm` (1–2 usable rounds) or
  `keyword` is reporting on a degraded matcher and must say so in the headline,
  not in a footnote.
- Below precision 0.90 the verdict is **FAIL** regardless of every other
  number. Below recall 0.75 with precision held, the verdict is
  `pass_deflationary` — publishable only with an explicit "this number
  understates coverage" label.

### 5.1 REQUIRED second sample: misses, searched against the UNFILTERED corpus

Added by final adversarial review #1 (MINOR-3a). The 120-pair sample above
draws **(unit, top-candidate-claim)** pairs — it can only ever grade claims
the pipeline already surfaced as candidates. A claim wrongly excluded UPSTREAM
(lane classifier `off_scope`/`unclassified`, an eligibility predicate, the
selection mix cap) can never enter that sample, so it **cannot see its own
blind spot**: an upstream filter defect reads as a clean miss.

- **Sample:** N ≥ 30 units per conflict scored `miss` in either population,
  drawn by the same seeded committed sampler.
- **Method:** a human searches the **unfiltered window corpus** — every
  ingested document in `[reportDate − 2d, window END]` for the conflict's
  contributor theaters, WITHOUT the eligibility/classifier filters applied —
  for evidence that would have satisfied the unit under §6.3.
- **Recorded per hit:** the claim/document found, and WHICH stage dropped it
  (classifier lane, eligibility predicate + bounded reason, selection cap, or
  genuinely absent from the corpus).
- **Threshold:** upstream-filter false-exclusion rate **≤ 0.10** of sampled
  misses. Above that the soak reports `upstream_filter_failed` and the matcher
  grade is not the operative number — the filter is.

## 6. Variance threshold across repeated runs

Ruling 17's lesson (extraction yield varies wildly between identical runs)
applies to matching too.

- Group by `runGroupKey` (identical inputs + matcher config). Across the ≥3
  repeated runs of the same 5 days per conflict:
  - **max−min headline coverage ≤ 5 percentage points** per report;
  - **per-unit verdict flip rate ≤ 5%** of declared units;
  - ~~**zero flips on `partial` ↔ `matched`** for compound units~~ —
    **VACUOUS AS WRITTEN, and marked so by final adversarial review #1
    (MINOR-3b).** Under the shipped attestation rule (register #11) no live
    rung can ever emit `matched` on a compound unit, so the flip this
    criterion forbids is unreachable by construction: it can never fail and
    therefore tests nothing. It is retained only as a REGRESSION sentinel —
    if it ever fires, the attestation rule has been changed without a
    register entry. **Replacement criterion that can actually fail:**
    **zero flips on `partial` ↔ `miss` for compound units**, plus
    **per-unit `matched` ↔ `miss` flip rate ≤ 5%** on ATOMIC units, measured
    separately from the aggregate flip rate above (an aggregate can hide a
    concentrated instability in the compound subset).
- Exceeding any of these is **FAIL** — a benchmark whose number moves 6 points
  on identical inputs is not a benchmark.

## 7. Query and cost ceilings

Predeclared, fail-closed, and enforced by envs that already exist — no new cap
mechanism is invented:

| Ceiling | Value | Mechanism |
|---|---|---|
| Provider row | `openai_eval` | `src/lib/evals/eval-guard.ts` — eval spend never blends into a production ledger |
| Daily USD | **`EVAL_USD_CAP_DAILY=2`** | fail-closed: unset ⇒ every reservation refuses (ruling 4) |
| All-time backstop | **`LLM_SPRINT_USD_CAP`** (existing, unchanged) | shared OpenAI backstop; the soak does NOT raise it |
| Requests/day | **`EVAL_DAILY_REQUEST_CAP=300`** | ≈ (18+14) reports × 5 units × 5 votes ÷ batching, with headroom |
| Requests/run | **`EVAL_RUN_REQUEST_CAP=200`** | one soak day can never consume the daily budget alone |
| Total soak envelope | **≤ $25** over 21 days | declared up front; crossing it stops the soak rather than extending the cap |
| Database | **`EVAL_DATABASE_URL`** on a disposable eval branch, acknowledged with `--db-ack <host>` | `DATABASE_URL` is never used by the eval runner |
| Evidence intake | the existing P3 `EVIDENCE_MAX_INTAKE` ceiling + overflow sentinel | an over-limit day refuses visibly instead of silently truncating |
| SDK retries | `maxRetries: 0` (house rule) | one reservation per physical dispatch; no auto-retry may multiply spend |

Cost ceilings are **caps, not budgets**: the soak is designed to run well
under them, and hitting one is an incident to report, not a target to reach.

## 8. Operator gates — ALL required before the soak may start

1. **Snapshot capture path first.** A live soak of the snapshot-anchored kinds
   is impossible today (register #5). Either the capture path in
   `docs/designs/CONFLICT-SNAPSHOT-CAPTURE.md` §5 passes all six of its own
   gates, or the soak runs **`retrospective`-only** and says so in every
   artifact. There is no third option.
2. **Decision-log + decision-register entries** authorizing a live conflict
   matcher path (none exists today) and naming this document's thresholds as
   binding.
3. **Cap envs set in every environment BEFORE the code that reads them is
   deployed** (ruling 4 ordering).
4. **A live conflict dispatch path reviewed and built** — today
   `--execute-live` is refused for `--profile conflict` by design. Lifting
   that refusal is a code change requiring its own adversarial review.
5. **Human-labeller availability confirmed** for the §5 sample, before day 1
   (a soak with no labels cannot grade its matcher).
6. **Legal review** confirming that soak artifacts persist no ISW/CTP prose
   and no source full text (the existing scorer/persistence gates already
   refuse prose-shaped anchors; the review confirms the soak adds no new
   channel).
7. **Register #12's three BLOCKING prerequisites — the metric must be
   well-defined on real inputs before it is measured** (added by final
   adversarial review #1, MEDIUM-1):
   1. a **specified, versioned, human-calibrated derivation of `compound`**
      from real takeaway text (today `compound` is a hand-authored fixture
      field with NO derivation for real reports, so the attestation rule of
      register #11 has no defined input outside the corpus);
   2. a **measured compound rate over a real report sample** (both series,
      ≥1 month), reported with its sampling method — the probe that opened
      this finding covered two real reports (9/9 bullets multi-proposition),
      which sizes the risk as real but not its magnitude;
   3. an **explicit adjudication of the attestation rule against that
      measurement**, recorded as a new register entry: keep the fail-closed
      rule (accepting in writing that compound units are structurally
      unmatched by every live rung — on the probed Iran report that is a
      0/5 headline by construction), or permit ladder-`full` attestation
      under a STATED evidence standard.
8. **The two register-#12 diagnostics exist**: the purely-diagnostic
   assessment/inference unit class (denominator-neutral, reported beside the
   headline as `partial` is), and the keyword rung returning
   `insufficient_data` for a conflict whose lanes have no gazetteer coverage
   (verified: the production gazetteer's 34 canonical toponyms are RU/UA only,
   and `iran_regional` on that rung scores 0 matched / 0 partial with only
   13 of 20 units flagged unmatchable).

## 9. Abort criteria (stop immediately, do not "finish the window")

Abort and report, rather than continuing to accumulate:

- any paid reservation refused for an unexpected reason, or any spend-cap
  category other than `run_cap` recorded (the 2026-07-29 map outage is the
  precedent: a silent budget stop that kept reporting `ok=true`);
- cumulative spend crosses **80%** of the $25 envelope before day 14;
- any write outside the eval store (a `validation_runs`, `digests`, or
  `claims` mutation attributable to the soak) — abort immediately and audit;
- precision on the running human-labelled sample falls below **0.85** at any
  interim checkpoint (day 7 and day 14 are mandatory checkpoints);
- two or more consecutive days scored on the `keyword` rung;
- any conflict result persisted with a non-`retrospective` evaluation kind
  while the capture path is unproven (the register-#5 twin guards should make
  this impossible; observing it means a guard regressed);
- edition selection non-determinism: the same day selecting different editions
  across repeated runs;
- any ISW/CTP prose or source full text found in a persisted artifact, log,
  error, or rendered surface — abort, purge, and re-review before any restart.

## 10. What the soak report must contain

One document, produced before any enablement decision:

- the predeclared thresholds from this file, quoted, with measured values
  beside them and a per-threshold PASS/FAIL;
- per-report and aggregate headline numbers with explicit numerator/
  denominator, both populations, never a composite score;
- lane representation actually achieved vs §4 minima, with `not_observed`
  lanes named;
- the human-label sample, κ, and the confusion matrix — including every
  false agreement, quoted as (unit id, claim id), for individual review;
- variance across repeated runs per §6;
- the legacy per-country rows for the same reports, side by side, as a
  **diagnostic** — with the explicit statement that neither aggregation
  contradicts the other and that the legacy rows remain the published
  scoreboard until an operator decides otherwise;
- **a window diagnostic beside that side-by-side** (final review #1 MINOR-2 /
  backtest limit F10): the day span each method actually saw. Combined
  eligibility spans `[reportDate − 2d, window END]` while a legacy digest row
  is one digest date and the Iran series' own declared lookback is ~24h — an
  asymmetry of roughly 3× that flows toward the combined numerator and is NOT
  covered by contract §5's "deflationary" sentence. It must be visible in the
  comparison, not absorbed into it;
- **the second (miss) sample from §5.1**, with the per-stage attribution of
  every false exclusion found;
- **a reconciliation of pair-level precision/recall against the headline**
  (final review #1 MINOR-3c): the report must state, per conflict, how the
  graded pair metrics relate to the published headline ratio. Without it the
  document could report precision 0.95 / recall 0.85 beside an Iran headline
  of 0/5 and read as success — the pair metrics grade the matcher on the
  candidates it saw, the headline grades the whole pipeline against the
  declared units;
- **the measured non-independence fraction** (final review #1 MINOR-4): per
  scored report, the fraction of matched units whose supporting documents come
  from sources ISW cited IN THAT REPORT, computed from the repository's own
  endnote registry (`source_citations` → `isw_reports` / `sources`, joined to
  `raw_documents.source_id`, which points at the same `sources` table) at zero
  provider cost. This upgrades the contract §0 caveat from a disclaimer to a
  measurement, and the soak report must publish the number beside every
  coverage figure it presents;
- **the compound-unit accounting required by register #12**: the measured
  compound rate over the soaked reports, the derivation version used, and the
  adjudication outcome of the attestation rule against that measurement;
- full spend accounting against §7;
- an explicit recommendation, and the exact remaining gates for enablement.

## 11. Not in scope for the soak

Enabling `CONFLICTS_UI`; publishing any conflict number; retiring or altering
any existing scoreboard row; changing the production matcher, its prompt, or
its vote count; touching digests, crons, or source routing. Each is a separate
operator decision with its own review.
