# Coding-agent master prompt — conflict/region products and combined expert-benchmark evaluation

Paste this prompt into the quality-foundation coding-agent session after that program has reached
its genuine terminal report. This is a continuation instruction, but it starts a new, isolated,
multi-phase workstream with adversarial review gates; it does not extend or reopen the completed
quality-foundation integration worktree. It may create local branches, worktrees, commits, review
artifacts, and local merges into its own integration branch. It must not merge to `main`, push,
open a PR, deploy, change any environment, contact a paid application provider, or write
production data. The operator will evaluate the completed integration branch and decide
what—if anything—to merge at a later time.

---

You are the implementation lead for BNOW.NET's conflict- and region-oriented product layer and
combined expert-benchmark evaluation. Work in the repository whose ordinary checkout is:

`/Users/go/code/bnow-net`

## 1. Mission

BNOW currently organizes most analysis and validation around country/theater labels. That is
useful for navigation and source routing, but it is not always the right unit for either an
analyst or an external benchmark:

- ISW publishes one Russian Offensive Campaign Assessment (ROCA) about the Russia–Ukraine war,
  while BNOW currently presents separate Russia and Ukraine validation rows against that shared
  reference. Relevant developments can involve occupied territory, Belarus, Moldova, North
  Korea, NATO, the EU, or individual European states.
- CTP-ISW's Iran Update is not an Iran-country report. Its editorial scope changes with the
  conflict and can include direct Iran–Israel–US fighting, Hezbollah/Lebanon, Iraqi militias,
  the Houthis/Yemen, Syria, Palestinian groups, Gulf states and bases, Hormuz/Red Sea shipping,
  nuclear diplomacy, the IAEA, E3/EU actors, and Iranian domestic security or succession.
- BNOW already has separate country feeds and multiple Iran tracks, but the current validator
  selects one country's `military` digest. That can turn product partitioning into structural
  benchmark misses.

Build a clearer product and validation model with three distinct concepts:

1. **Country/theater:** where BNOW routes, ingests, publishes, and lets users drill into evidence.
2. **Conflict/region:** the user-facing analytical object that joins relevant countries, actors,
   tracks, and transnational developments.
3. **Benchmark scope:** the versioned editorial scope of one external reference series/report.

The desired initial products are:

- **Russia–Ukraine War** — one conflict view and one ROCA evaluation per reference report, using
  a relevance-filtered union of eligible evidence, with country/track/source contribution
  drilldowns rather than separate competing denominators.
- **Iran and Regional Conflict** — one regional conflict view and one Iran Update evaluation per
  reference report, using phase- and lane-aware relevant evidence across Iran, its adversaries,
  proxies, maritime theaters, nuclear/diplomatic actors, and domestic-security tracks.

This work must make the product easier to understand without erasing the existing country feeds.
The country pages remain useful evidence and coverage lenses. The conflict layer sits above them.

The public concept is **expert-benchmark coverage**, not “accuracy,” “truth,” or ISW endorsement.
ISW/CTP consumes some of the same open sources BNOW does and has its own editorial selection and
analytical judgments. Agreement is an external quality gauge; divergence analysis is equally
important.

## 2. Read completely before planning or editing

Read these files in full, then inspect every relevant implementation and test. Code and the
current Git graph win over stale line numbers or old counts.

1. `AGENTS.md`
2. `docs/PRODUCT-BRIEF.md`
3. `docs/CURRENT-STATE.md`
4. `docs/OPEN-TASKS.md`
5. `docs/TIME-MODEL.md`
6. `docs/reviews/VALIDATION-SCOPE-AND-CORPUS-VALUE-2026-07-14.md`
7. `docs/reviews/SCORING-QUALITY-AUDIT-2026-07-14.md`
8. `docs/designs/ISW-CUTOFF-SCORING.md`
9. `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`
10. `docs/prompts/2026-08-15-iran-validation-recovery.md`
11. `docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`, if present
12. From the exact review-passed quality-foundation integration SHA selected as the base:
    - its final integration report and both final independent review reports;
    - `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md`;
    - `docs/evals/analysis/README.md`;
    - `src/lib/evals/contracts.ts`, `runner.ts`, `gates.ts`, `score-validation.ts`,
      `live-runner.ts`, and their tests;
    - `scripts/analysis-eval.ts`.
13. The current implementation under:
    - `src/lib/validation/`
    - `src/lib/isw/`
    - `src/lib/analysis/`
    - `src/lib/scoreboard/`
    - `src/app/scoreboard/`
    - `src/app/countries/`
    - `src/app/digests/`
    - `src/db/schema.ts` and every migration touching reference reports, digests, or validation
    - the relevant cron routes and scripts
14. Relevant fixtures, unit tests, integration tests, and current evaluation contracts.

Before creating a worktree, run read-only Git inspection:

- current branch, HEAD, `origin/main`, status, worktrees, and all relevant local/remote branches;
- whether the Iran-validation recovery has merged;
- whether cloud model-routing or quality-foundation work is still active;
- migration numbers and files claimed by other workstreams;
- exact diffs on shared validation/evaluation files.

Do not infer that the standing prose in an old prompt still describes the Git graph. Record the
actual base and every concurrent contact surface in the workstream index.

## 3. Isolation and concurrent-work boundary

The ordinary checkout may contain user-owned untracked files or active work. Do not author in it.
Do not stash, reset, clean, move, stage, or commit its contents. Create an isolated worktree under
a sibling path such as:

`/Users/go/code/bnow-net-worktrees/conflict-evaluations-20260817`

Use local branches similar to:

```text
codex/conflict-evaluations-integration-20260817
  ├─ codex/conflict-evaluations-p0-contract
  ├─ codex/conflict-evaluations-p1-domain
  ├─ codex/conflict-evaluations-p2-reference-windows
  ├─ codex/conflict-evaluations-p3-evidence-union
  ├─ codex/conflict-evaluations-p4-scoring
  ├─ codex/conflict-evaluations-p5-eval-adapter
  ├─ codex/conflict-evaluations-p6-product-ui
  └─ codex/conflict-evaluations-p7-integration
```

Base-selection rules:

1. First inspect the quality-foundation workstream named below. If its A–C implementation, phase
   adversarial reviews, final integration gates, and final independent reviews all PASS on one
   exact integration SHA, prefer to create this conflict workstream **directly from that reviewed
   SHA**. Branching from the reviewed local commit is allowed; it is not authorization to merge
   that commit to `main`, push it, deploy it, or modify its worktree.
2. A quality-foundation draft, partially merged integration branch, passing A/B with unfinished C,
   or report without final reviews is not a valid base. Never infer completion from branch names or
   commit count. Verify the final report, test ledger, reviewer verdicts, and exact SHA.
3. If the quality foundation is still in progress, perform only the read-only base/status audit,
   report `base-not-ready` with the exact unfinished gate, and stop. Do not create this workstream,
   edit files, or proceed from `origin/main`; this avoids building pure-domain contracts against a
   generic control plane that may still change.
4. If an operator explicitly names a different reviewed base, use exactly that commit and record
   why.
5. Never merge an otherwise ongoing feature, routing, recovery, or deployment branch merely
   because it looks useful. Inspect it read-only and design a later integration seam.
6. Never edit another worktree.
7. Do not copy half-reviewed code or silently fork an unfinished contract.

### Boundary with the quality-foundation workstream

At prompt-writing time, another local program is close to completing generic evaluation
infrastructure for map, reduce/digest, and validation: datasets, runners, dispatch identity,
cost/latency measurement, model scorecards, and possibly human adjudication. Its prompt is
`docs/prompts/2026-08-17-quality-foundation-fable-ultracode.md`; its suggested integration branch
is `codex/quality-foundation-integration-20260817`. Treat the exact current Git state and final
review report as authoritative. This conflict workstream does **not** rebuild that control plane.

Coordination checkpoint when this prompt was written: Worktrees A+B were merged and fully green
(2,296/2,296 unit tests and 119/119 real-Postgres tests); Worktree C, the analysis evaluation
control plane, was still being authored. Therefore this conflict workstream is **queued behind
quality-foundation C and its final reviews**. If this prompt is launched before the quality
foundation has an exact final review-passed integration SHA, perform only the read-only status
check, report `base-not-ready / quality-foundation-C-active`, and stop without creating branches
or editing files. Do not race or duplicate C. Once C and the final program reviews pass, branch
this workstream directly from that exact reviewed integration SHA unless the operator directs a
different base.

This workstream owns:

- conflict/region definitions and user-facing terminology;
- external reference-series/report scope and edition semantics;
- report-scoped, cross-theater/cross-track evidence assembly;
- combined conflict benchmark scoring and contribution diagnostics;
- a versioned conflict result payload and workload adapter for the generic evaluation control
  plane;
- conflict-oriented product pages and benchmark explanations;
- domain fixtures that a generic evaluation runner can consume later.

The quality-foundation workstream owns:

- generic model/prompt evaluation runners;
- candidate-model approval scorecards;
- generic latency/token/cost/dispatch-identity contracts;
- generic held-out dataset mechanics and adjudication infrastructure.

Never modify its worktree. If it has fully passed on an exact SHA, branch from that SHA and reuse
its contracts through the documented extension points. If it is unfinished, avoid its owned files
and keep this work behind new pure modules plus a narrow future adapter. Do not create a second
generic runner, result schema, candidate-model registry, or adjudication system.

The authored Worktree C contract observed while this prompt was prepared has a closed
`AnalysisEvalWorkload` union (`map | reduce | digest | validation`) and exhaustive workload maps
and switches in the contracts, runner, gates, CLI, and live dispatcher. Re-inspect the final
review-passed version; do not assume it stayed identical. In Phase 0, write an explicit extension
decision before editing control-plane files:

1. Prefer a conflict-specific dataset profile and scoring adapter under the existing `validation`
   workload when this preserves honest semantics, stable result identities, and all generic
   gates.
2. If that would overload or misrepresent the existing validation contract, add one narrowly
   scoped `conflict_validation` workload and update every exhaustive validator, switch, dataset
   map, gate, estimator, report path, live-dispatch refusal/allowlist, isolation test, and CLI
   help surface in one coherent change.
3. Do not choose the smaller diff by shoehorning incompatible data into existing fields, and do
   not choose a new workload merely to gain a separate command. In either case there remains one
   control plane and one `scripts/analysis-eval.ts` entry point.

If both workstreams must eventually touch `src/lib/validation/run.ts`, `score.ts`,
`src/db/schema.ts`, migrations, or `docs/evals/`, isolate the conflict logic first and document the
exact later integration step. This independent workstream creates no numbered Drizzle migration
or journal entry. Produce schema/API design and disposable SQL only; generate the real forward
migration later on the operator-selected integration base.

## 4. Authorization boundaries

This prompt authorizes only:

- local code, tests, fixtures, documentation, screenshots, commits, and local worktrees;
- local `--no-ff` merges of passing phase branches into this workstream's integration branch;
- read-only repository and public-web research;
- offline/fixture evaluation;
- disposable non-production database branches through the existing test workflow, when available.

It does not authorize:

- merging to `main`, pushing, opening a PR, or modifying another branch/worktree;
- deployment, Vercel aliases, environment-variable changes, or feature enablement;
- production or preview database writes;
- manually invoking production crons or backfills;
- paid OpenAI, Anthropic, X, OpenSanctions, or other application-provider calls;
- copying credentials or `.env.local` into a worktree;
- changing provider caps, routing models, effort settings, or approved-model registries;
- republishing ISW prose or source full text;
- changing live source routing, source rosters, or the meaning of existing country digests;
- silently replacing or rewriting historical public validation results.

Coding-agent reasoning/review inference is not authorization for the BNOW application to contact
a paid provider. Live matching must remain unexecuted. Build and test paid paths with mocks and
zero-contact guards only.

All new runtime behavior must be disabled by default. Existing `/scoreboard`, country pages,
digests, validation cron, and public navigation must remain behavior-identical when the new flags
are absent.

## 5. Binding product and methodology contract

### 5.1 One external report is one benchmark observation

The primary aggregate unit is:

```text
one reference report/edition
  -> one declared reference-unit set
  -> one eligible conflict evidence set
  -> one combined evaluation
```

Do not average separate RU and UA rows against the same ROCA denominator. Do not score one
Iran-country military digest as though it represented the full Iran Update editorial scope.

Country, theater, track, source, language, and actor remain contribution dimensions. They explain
where evidence came from and where the pipeline failed; they are not duplicate headline scores.

### 5.2 Relevance, not source geography

Do not construct the union by adding every document from a list of countries. A source's home
country is neither necessary nor sufficient for relevance.

Eligibility must be based on versioned, inspectable properties such as:

- conflict/reference series;
- event or claim time relative to the report window;
- lane/topic;
- actor and organization involvement;
- event geography and cross-border relationship;
- track and current extractor version;
- source-document traceability and non-stub status;
- declared evidence policy version.

Examples that tests must cover:

- a Ukrainian-tagged claim can satisfy a ROCA development even if no RU digest retained it;
- a North Korea, NATO, German, Polish, EU, or Moldovan development belongs when it materially
  concerns the Russia–Ukraine campaign;
- Lebanese, Iraqi, Yemeni, Israeli, US, Gulf, IAEA, E3/EU, or Omani evidence can contribute to an
  Iran Update benchmark when the underlying development is in scope;
- unrelated Israeli domestic politics, generic Gulf business news, or unrelated EU news must not
  enter merely because a broad region was selected.

### 5.3 Phase-aware lanes without hindsight gaming

Use stable lanes that remain comparable over time. Initial Iran lanes should include at least:

- direct kinetic / force posture;
- proxy and partner networks;
- maritime / Hormuz / Red Sea;
- nuclear / IAEA / diplomacy;
- Iranian domestic security / elite politics / succession;
- regional diplomacy, sanctions, and military-economic effects;
- other explicitly in-scope regional security.

Initial ROCA lanes should include at least:

- front-line maneuver;
- long-range strikes and air defense;
- force generation, logistics, and military industry;
- occupied territories and cross-border operations;
- foreign military support and coalition decisions;
- Russia's external partners, including North Korea when relevant;
- strategic/political decisions directly shaping the war.

The daily mix may change by phase, but the scorer may not retrospectively change the denominator
to improve results. Persist the lane taxonomy and evidence-policy version. A methodology change
creates a new epoch and side-by-side retrospective series; it never silently rewrites the old
meaning.

Evidence eligibility must be frozen independently of the reference-unit contents. The Iran/ROCA
report text may be used by the matcher after candidate assembly; it may not be used to decide
which BNOW claims enter the candidate union. If conflict phases are represented, use an immutable,
prospectively declared record with at least `phaseId`, `effectiveFrom`, `effectiveTo`,
`declaredAt`, `policyVersion`, and rule/provenance. A phase may label, rank, or explain the stable
lanes; it may not retroactively exclude misses from the headline denominator. Backfilled phase
labels are retrospective annotations, never as-published policy.

### 5.4 Full declared-reference-unit coverage plus lane diagnostics

Show both:

- **Declared-reference coverage:** all reference units extracted by the documented method from
  the chosen report/edition.
- **Lane coverage:** the same units partitioned into documented lanes.

This is not automatically coverage of the report body, maps, operational-area sections, or
endnotes. If the method uses only Key Takeaways, the public label and methodology must say
“Key Takeaway coverage,” and every denominator is limited to those declared units. Never shorten
that to “full-report coverage.”

Never silently drop a reference unit because BNOW lacks a matching track or source. That is a
real product coverage gap. If a deliberately narrower score is useful, label it explicitly—for
example “kinetic/security subset”—and show its numerator and denominator beside the declared-unit
result. Do not call a subset score “Iran Update coverage.”

The initial production-compatible denominator is **every declared Key Takeaway in the selected
edition**, and the public label is **Key Takeaway benchmark coverage**. It is not whole-report
coverage. ISW takeaway bullets can contain multiple propositions, so the complete-takeaway method
must expose `partial` diagnostic verdicts without counting partials as full matches.

Atomic proposition decomposition may be built only as a disabled experimental adapter for later
human calibration. If that experiment is implemented:

- preserve stable derived identifiers, ordering, classification, and a hash;
- never persist the prohibited prose;
- expose compound/partial-match behavior honestly;
- prevent one vague claim from satisfying several distinct propositions merely through topic
  overlap;
- require human-labelled calibration fixtures before the method can be proposed publicly.

### 5.5 Two pipeline questions, not one opaque score

Every combined evaluation must distinguish:

1. **Corpus recall:** did the current-version mapped/eligible claim corpus contain the
   development?
2. **Published retention:** did an actual user-facing conflict/digest output retain a matching
   claim?

This separation diagnoses ingestion/mapping gaps versus ranking/synthesis/publication gaps. Do not
infer published retention from evidence existence. A source document fetched by publication time
does not prove BNOW had already published the corresponding claim.

Phase 0 must name the actual output population used for published retention. Until BNOW publishes
a first-class conflict digest, it means the versioned union of claims that genuinely appeared in
the designated user-facing country/track digests—not a counterfactual conflict synthesis and not
the whole mapped corpus.

### 5.6 Three clocks and immutable inputs

Support these evaluation kinds with explicit labels:

- `operational_cutoff`: newest frozen BNOW state at or before the reference report's declared
  data cutoff;
- `at_publication`: newest frozen BNOW state at or before the report's actual `datePublished`;
- `finalized`: the designated D+1/final BNOW output;
- `retrospective`: a later re-evaluation under an explicitly named epoch.

The matcher can run later; its input snapshot must remain the one named by the evaluation kind.
Never substitute “current latest digest” for a historical snapshot. If no truthful snapshot
exists, store/report `unavailable`, not a guessed score. Historical alpha data may be evaluated as
an explicitly labelled retrospective where inputs still exist.

An enum or schema row does not prove a snapshot exists. Until a separately reviewed capture path
has frozen both the mapped-corpus population and the publication-guarded output population at the
required instant, this workstream may produce only fixture results and explicitly labelled
retrospectives. `operational_cutoff`, `at_publication`, and `finalized` must return unavailable
with a provenance reason unless an immutable snapshot artifact demonstrates the exact population.
Do not claim these evaluation kinds are supported merely because their types exist. Design the
future capture contract, but do not add a competing snapshot subsystem if the quality foundation
already owns one.

### 5.7 Reference series, editions, and publication gaps

Do not assume one predictable URL or one report shape per theater/date. Iran Updates have used
plain, special, morning, and evening forms and can change structure as war phases change.

The model must represent, at minimum:

- stable reference series (`roca`, `iran_update` initially);
- canonical report URL and provider identity;
- report/edition identity;
- report date;
- declared cutoff instant when present;
- publication instant when present;
- discovery/fetch/parse status;
- scope/taxonomy/methodology version;
- designated daily-final status or explicit multi-edition aggregation policy;
- derived reference units and legal-safe signatures only.

Do not manufacture a report for a publication gap. Do not select an arbitrary same-date row. If
multiple editions exist, the policy must explicitly select the designated final edition or score
each edition separately. An aggregate must de-duplicate reference units and state its method.

Prefer a feed/index/corpus-backed discovery contract over date-to-one-slug construction. Reuse the
reviewed Iran citation-refresh loader rather than forking citation parsing. Preserve idempotency,
host spacing, robots rules, caching, and the rule that failed parsing cannot overwrite a valid
prior parse.

### 5.8 Legal, truth, and source fidelity

- ISW/CTP prose may be used transiently for internal matching, but may not persist or render.
- User-facing output may show URLs, report/edition labels, dates, lanes, classifications, counts,
  scores, and derived verdicts only.
- Every BNOW claim contributing to an evaluation retains at least one real raw-document link.
- Stub/fixture rows are excluded from production reads and hidden from user output.
- Agreement means a materially equivalent event/development, not shared words, place, actor, or
  topic.
- Hedge, attribution, identity, predicate, status, time, place, and quantities must not be
  strengthened during matching or conflict synthesis.
- Reposts and mirrors do not count as independent corroboration merely because they are separate
  documents.

### 5.9 Metrics and naming

At minimum produce and define:

- reference units total and per lane;
- mapped-corpus matches, misses, and coverage;
- published-output matches, misses, and coverage;
- evidence available by cutoff/publication where truthfully known;
- country/theater/track/source contribution counts without double-counting the headline
  denominator;
- thin-sourced and independent-source diagnostics with explicit denominators;
- information lead based on BNOW ingest time, with source-declared publish time separate;
- unmatched BNOW items only inside the declared conflict scope;
- matcher identity, votes, variance/repeated-run grouping, methodology epoch, and input snapshot
  identity;
- unavailable/insufficient-data states distinct from zero.

Contribution attribution is deliberately multi-label and non-additive:

- each matched Key Takeaway counts exactly once in the headline numerator;
- for a dimension such as theater, track, or source, count the distinct matched Key Takeaways
  supported by at least one eligible contributor in that bucket;
- one matched takeaway may therefore appear in several contribution buckets, and bucket totals
  may exceed the headline numerator;
- label the UI “matched takeaways with evidence from …” and disclose that contribution columns do
  not sum to the headline total;
- do not invent exclusive or fractional primary credit in this workstream.

Do not create one composite “quality score” in this workstream. Keep the interpretable metrics
separate until observed data and human calibration justify weighting.

## 6. Execution protocol and artifacts

Create and maintain:

- `docs/reviews/CONFLICT-EVALUATION-WORKSTREAM-INDEX-2026-08-17.md`
- `docs/reviews/CONFLICT-EVALUATION-TEST-LEDGER-2026-08-17.md`
- `docs/reviews/CONFLICT-EVALUATION-DECISION-REGISTER-2026-08-17.md`
- `docs/designs/CONFLICT-REGION-EVALUATION.md`
- one phase implementation report and one adversarial gate report per phase;
- `docs/reviews/CONFLICT-EVALUATION-INTEGRATION-2026-08-17.md` at completion.

For each phase:

1. Branch from the latest passing local integration HEAD.
2. Inspect status and concurrent refs before editing; preserve unrelated work.
3. Record exact base/branch/worktree and phase exit criteria before implementation.
4. Implement the smallest coherent vertical slice.
5. Run focused tests, `git diff --check`, typecheck, lint, full unit tests, and any relevant
   build/integration/browser gates.
6. Commission the independent adversarial review required by §7.
7. Fix every BLOCKER/HIGH finding; rerun affected and full gates; obtain focused re-review.
8. Write exact commands, counts, failures, timings, findings, and residual risks to the ledgers.
9. Commit only the phase's files.
10. Merge a passing phase `--no-ff` into the local workstream integration branch and retain the
    phase branch. Never merge to `main`.

If a phase is locally complete but final wiring depends on an ongoing workstream, mark it
`implementation-pass / integration-blocked`, merge it locally only when the default runtime path
is unchanged, and continue safe independent phases. Do not call it production-ready.

## 7. Adversarial review system

Every phase requires a fresh reviewer that did not author the implementation. Critical phases
listed below require two independent reviewers with different lenses. Reviewer agents must
receive the frozen contract, exact base SHA, exact tip SHA, and full diff; do not give them the
author's optimistic summary as their only context.

Classify findings as `BLOCKER`, `HIGH`, `MEDIUM`, `LOW`, or `NOTE`. A finding needs file/line or
data-contract evidence and a reproduction or concrete violated invariant. BLOCKER/HIGH findings
must be fixed before a gate passes. A self-review cannot substitute for a required independent
review; if reviewers are unavailable, report `review-gate-blocked`.

Use these lenses as applicable:

### A. Scope and evaluation-science reviewer

Attempt to find:

- duplicate denominators or country rows masquerading as independent observations;
- post-hoc filtering that raises coverage;
- phase definitions chosen after results;
- declared-reference-unit and subset scores conflated;
- compound takeaways receiving false full credit;
- one vague claim satisfying multiple distinct units;
- same place/actor but different event/date false agreements;
- missing-data exclusions that silently improve results;
- unstable aggregation, small-denominator volatility, or averages weighting reports incorrectly;
- ISW agreement presented as independent truth.

### B. Evidence and source-fidelity reviewer

Attempt to find:

- source geography used as a proxy for event relevance;
- cross-theater evidence dropped or unrelated regional material admitted;
- superseded extractor versions or mirrors double-counted;
- candidate, mapped, selected, published, and cited evidence conflated;
- attribution, hedge, identity, predicate, date, place, or number strengthening;
- stub rows or unlinked claims entering evaluation;
- one repeated source chain presented as independent corroboration.

### C. Time, snapshots, and immutability reviewer

Attempt to find:

- report date substituted for cutoff or publication time;
- timezone/DST errors or fixed-time assumptions;
- latest-state queries used for historical evaluation;
- overwritten results or snapshots;
- evidence-at-publication treated as proof of published output;
- regeneration/backfill changing as-published history;
- edition selection depending on unordered rows.

### D. Legal and data-minimization reviewer

Attempt to recover:

- ISW/CTP takeaway prose from DB rows, logs, JSON, fixtures, screenshots, analytics, errors, or
  rendered RSC/HTML;
- source full text copied into committed evaluation artifacts;
- URLs or derived signatures that accidentally preserve prohibited prose;
- personal or source content entering PostHog.

### E. Database, concurrency, and operations reviewer

Attempt to find:

- migration conflicts or edits to applied migrations;
- conflict workload identities that break the inherited resume/repetition/idempotency contracts;
- partially written report/evaluation/snapshot graphs;
- multiple cron instances duplicating evaluation or paid matching;
- feature-off paths that still query/write new tables;
- unreserved calls, SDK retries, or billed responses parsed before metering;
- production paths enabled by missing/invalid flags;
- unbounded query or prompt size from the combined union.

### F. Product clarity, accessibility, and authorization reviewer

Attempt to find:

- “accuracy,” “truth,” or endorsement language;
- country feeds appearing deleted or contradicted;
- unexplained conflict/region/theater/track terminology;
- percentages without numerators/denominators;
- `0` displayed for unavailable data;
- inaccessible tables, mobile overflow, color-only meaning, bad focus order, or print failures;
- protected pages whose gate is not the first page statement, including RSC/redirect body leaks;
- feature-off navigation or metadata leaking unfinished surfaces.

## 8. Phase 0 — recon, baseline, and frozen contract

### Build

- Reproduce the current validation flow from reference discovery through scoreboard rendering.
- Produce a current code/data-flow diagram and exact denominator table.
- Confirm whether RU and UA still generate separate rows against one ROCA report.
- Confirm whether Iran validation still selects only `military` and how separate nuclear/elite
  claims are excluded.
- Audit report uniqueness, slug discovery, publication/cutoff parsing, overwrite behavior,
  snapshots, matcher votes, and user-facing methodology copy.
- Identify all files shared with active workstreams and freeze narrow interfaces that minimize
  later conflicts.
- Build a legally safe, reviewed fixture matrix covering the acceptance corpus in §16. Use
  synthetic/paraphrased reference units and BNOW-shaped claims; do not commit ISW prose.
- Write `docs/designs/CONFLICT-REGION-EVALUATION.md` with the proposed domain model, equations,
  denominators, time semantics, edition policy, flags, migration options, and UI information
  architecture.
- Freeze the initial denominator as all selected-edition Key Takeaways. Specify complete-match,
  miss, and non-crediting partial diagnostics. Atomicization remains a disabled experiment until
  a later human-labelled calibration gate.

No runtime behavior, schema, cron, or public UI changes in Phase 0.

### Critical Gate 0 — two reviewers

1. Scope/evaluation-science review.
2. Product/legal review.

Pass only if every metric has an explicit numerator, denominator, time anchor, missing-data rule,
and public label; the design cannot improve coverage by changing scope after seeing results; the
fixture corpus contains no prohibited prose; and the concurrent-work collision map is complete.

## 9. Phase 1 — pure conflict domain and configuration

### Build

Implement a pure, provider-free, database-free conflict domain. Names may adjust to repository
conventions, but the model must include equivalents of:

```ts
type ConflictId = "russia_ukraine" | "iran_regional";
type ReferenceSeriesId = "roca" | "iran_update";

interface ConflictDefinition {
  id: ConflictId;
  displayName: string;
  referenceSeries: ReferenceSeriesId;
  lanes: readonly ConflictLane[];
  evidencePolicyVersion: string;
  contributorTheaters: readonly string[];
  contributorTracks: readonly Track[];
}

interface ReferenceReportIdentity {
  series: ReferenceSeriesId;
  editionKey: string;
  reportDate: string;
  cutoffAt: string | null;
  publishedAt: string | null;
  scopeVersion: string;
}

interface ConflictPhaseRecord {
  conflictId: ConflictId;
  phaseId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  declaredAt: string;
  policyVersion: string;
  provenance: string;
}
```

Requirements:

- stable IDs separate from translated display labels;
- bounded, versioned lane taxonomies;
- no mutable global “current phase” that rewrites history;
- phase records are prospective, immutable, and independent of the reference-unit text;
- pure validation of definitions and impossible combinations;
- explicit unknown/unclassified behavior;
- a narrow adapter interface against the final inherited generic evaluation contracts, without
  depending on undocumented control-plane internals;
- exhaustive unit tests for configuration, versioning, and serialization.

Do not query the database, call a provider, or alter existing validation in this phase.

### Gate 1

Independent architecture reviewer: attack ontology leakage, country/conflict conflation, unstable
IDs, impossible phase/lane combinations, and coupling to unfinished concurrent work.

## 10. Phase 2 — reference reports, editions, and evaluation windows

### Build

Create a reference-report abstraction that can represent changing publication forms and multiple
editions without breaking the existing citation registry.

Before proposing later schema work, compare at least:

1. extending current `isw_reports` through a new forward migration;
2. an additive edition child/table linked to the existing report/citation row;
3. a provider-neutral benchmark-report table with an ISW adapter.

Prefer the smallest additive design that preserves current citations, avoids destructive data
rewrites, supports more than one edition per series/date, and can support a future non-ISW
benchmark. This phase produces a reviewed schema/API design and, if useful, disposable test SQL.
It must not create a numbered Drizzle migration, edit the journal, or modify an applied migration.
The real forward migration is generated later on the operator-selected integration base after all
concurrent schema work is known.

Implement and test:

- canonical report/edition identity and deterministic daily-final selection;
- explicit multi-edition behavior;
- publication gaps and parse/discovery failures;
- `datePublished` and declared cutoff extraction with timezone/DST handling;
- missing/unparseable cutoff behavior;
- legal-safe persistence with no reference prose;
- idempotent discovery/replay;
- deterministic ordering, never `rows[0]` from an unordered same-date query;
- compatibility with the reviewed citation-refresh loader and source stats;
- a no-network fixture mode.

Complete the pure repository and fixture layers, record the exact later migration operations, and
mark durable DB wiring deferred to the operator-selected integration phase.

### Critical Gate 2 — two reviewers

1. Time/edition/immutability reviewer.
2. Database/legal reviewer.

Use disposable real-Postgres tests against unnumbered disposable SQL when feasible to challenge
the design. Record that final migration uniqueness/idempotency proof remains a later integration
gate; mocks alone cannot certify it.

## 11. Phase 3 — relevance-filtered cross-theater evidence union

### Build

Implement a bounded evidence assembler that returns legal, traceable claim records for one
conflict, reference report, evaluation kind, and snapshot.

Requirements:

- every result includes claim ID, conflict, lane, contributing theater/track, hedge, event time,
  source-document IDs, earliest ingest time, current extractor/version identity, and inclusion
  reasons;
- every exclusion has a bounded reason such as off-window, off-scope, superseded-version,
  stub/fixture, missing-source, legacy-incomparable, mirror-only, or unclassified;
- current extractor versions only, through existing sanctioned accessors;
- no blind concatenation of all country digests or documents;
- source/platform mix caps or bounded candidate selection where needed to prevent one large
  corpus from crowding out the rest;
- mirror/near-duplicate relationships preserved for independent-source diagnostics;
- deterministic ordering before any LLM sees candidates;
- prompt/input bounds measured and tested;
- no legacy-engine claim silently treated as map-stage-equivalent. Expose incomparable coverage
  honestly until Gulf/Israel claims have comparable mapping;
- Iran evidence can combine `military`, `nuclear`, and relevant `elite_politics` claims; relevant
  Israel/Gulf contributors join only when comparable claims and scope evidence exist;
- ROCA evidence combines RU/UA claims and is extensible to relevant foreign-actor evidence without
  requiring a fake country score;
- corpus-recall and published-output assemblies are separate functions/types.

Do not implement a new source-ingestion or multi-theater tagging project here. Consume current
evidence honestly and expose where current routing prevents inclusion. Keep OPEN-TASKS #37 as a
separate dependency unless the operator later expands this workstream.

### Critical Gate 3 — two reviewers

1. Evidence/source-fidelity reviewer.
2. Query/performance/operations reviewer.

Required adversarial cases: high-volume irrelevant region, one relevant claim in the “other”
theater, mirrors across adapters, superseded versions, cross-day recurring templates, missing
timestamps, same actor/place but wrong event, and no-comparable-Gulf-claims behavior.

## 12. Phase 4 — combined scoring and diagnostics

### Build

Implement a pure combined scorer over reference units and assembled evidence, then adapt the
existing majority matcher without changing its live default path.

The result contract must include:

- one report-level result;
- all-declared-reference-unit and per-lane numerator/denominator/coverage;
- mapped-corpus and published-retention results;
- agreement, reference-only, and in-scope-BNOW-only records;
- contribution attribution by theater/track/source without double-counting reference matches;
- cutoff/publication/finalized/retrospective kind and snapshot identity;
- unavailable/insufficient-data reasons;
- matcher identity, per-vote audit, repeated-run grouping, and methodology epoch;
- timing and source-independence diagnostics;
- no persisted reference prose.

Matching requirements:

- substantial same event/development, not shared topic;
- action, direction, actor, place, date/window, status, hedge, and important quantities must be
  compatible;
- negative/quiet-day reference units cannot match positive-event claims;
- no match to a claim outside the declared conflict scope merely to avoid a miss;
- one claim matching multiple units must be visible and constrained by the atomic/compound policy;
- K=5 majority semantics remain unchanged for any live-compatible LLM adapter;
- keyword fallback remains honestly labelled and cannot masquerade as a paid majority result;
- no paid runs in this workstream.

Add a deterministic fixture matcher/oracle for tests and offline reports. Provide golden expected
results for both conflicts, including lane and contribution totals.

### Critical Gate 4 — two reviewers

1. Evaluation-science/matcher reviewer.
2. Legal/source-fidelity reviewer.

The reviewers must attempt denominator gaming, double credit, false cross-theater agreement,
missing-data inflation, compound-takeaway over-credit, and recovery of reference prose from every
persistable result.

## 13. Phase 5 — quality-foundation workload adapter and snapshot provenance

### Build

Integrate the conflict-specific fixtures, assembler, and scorer into the exact generic evaluation
control-plane contracts inherited from the review-passed quality-foundation base. Do not create a
second runner, result store, candidate registry, cost/latency schema, resumability mechanism, or
provider execution path.

Requirements:

- implement the Phase 0 extension decision: either an honest conflict-validation profile under
  the existing validation workload or one additive `conflict_validation` workload, using the
  control plane's existing dataset, case, dispatch, attempt, result, repetition, result-key,
  report, estimate, and resume identities;
- reuse `AnalysisEvalDataset`, `EvalCaseResult`, `CandidateDispatchIdentity`, the inherited
  result-key/resume semantics, and the actual production validation prompt/schema/sanitizer
  exported for Worktree C; do not fork their behavior or maintain a parallel result file format;
- keep deterministic checks, human labels, and optional model-grader judgments distinct exactly
  as the inherited control plane requires;
- add the conflict-domain result payload as an additive versioned workload result, not a rival
  top-level schema;
- reuse the inherited `scripts/analysis-eval.ts` modes and zero-provider-contact protections; add
  only a dataset/profile selector, an exhaustively wired workload selector if truly required, or
  conflict report formatting that the generic extension point cannot express;
- record baseline/candidate configuration identity, latency, tokens, cost estimate, physical
  attempts, parse status, and votes through inherited fields rather than duplicating them;
- fixture/offline/report/estimate modes remain zero-provider-contact, and no paid/live mode runs;
- no application cron, current `validation_runs`, public scoreboard, or production DB wiring;
- no numbered migration or durable application persistence in this workstream.

Define a `ConflictSnapshotRef`-equivalent contract that points to an immutable input artifact and
records capture kind, captured-at instant, corpus/output population, policy version, content hash,
and provenance. The adapter must refuse cutoff/publication/finalized scoring when the referenced
artifact does not exist or cannot prove the population. Fixture artifacts and honest
retrospectives are allowed. Design—but do not independently implement—the future application
snapshot-capture/persistence path needed before a live shadow soak.

If the final quality-foundation control plane has no safe extension point for this workload, stop
this phase at a reviewed adapter proposal and report `integration-blocked`; do not fork it.

### Critical Gate 5 — two reviewers

1. Generic-control-plane compatibility and snapshot-provenance reviewer.
2. Paid-call/default-off/operations reviewer.

Require inherited dataset validation, report/estimate/offline tests, resumability/repetition tests,
and zero-provider-contact proof. Any future durable snapshot or shadow persistence remains a later
operator-selected integration gate with disposable real-Postgres tests; do not use production.

## 14. Phase 6 — conflict-oriented product and benchmark UX

### Build

Create a feature-off conflict/region presentation that can be reviewed locally without replacing
the country product. Prefer clear URLs and stable IDs, for example:

- `/conflicts`
- `/conflicts/russia-ukraine`
- `/conflicts/iran-regional`
- a conflict-scoped benchmark detail beneath the conflict route

Final route choices require repository IA review; do not create duplicate public concepts merely
to match these examples.

This phase does not create or publish a new conflict synthesis. Its “what changed” evidence view
is a read-only union of claims that already survived publication safety and genuinely appeared in
the designated existing user-facing digests, with the originating digest/theater/track and source
trail shown. Hidden `doc_claims` may support internal corpus-recall counts and fixture diagnostics,
but their text must not be presented as published conflict intelligence. A future first-class
conflict digest requires a separate publication-safety, persistence, cadence, and product decision.

The page should answer, in this order:

1. What conflict/region is covered?
2. What changed and which lanes are active?
3. Which countries, actors, and evidence sources contributed?
4. What did the external benchmark cover, using one report-level score?
5. Was matching evidence present in the mapped corpus and retained in the published output?
6. What was unavailable, thinly sourced, or reference-only?
7. How can the analyst drill back into country, track, claim, and source evidence?

UX rules:

- preserve existing country pages and links;
- call the metric “expert-benchmark coverage” or another equally precise phrase, never accuracy;
- show numerator/denominator near every percentage;
- show declared-reference-unit and lane results without presenting lanes as independent reports;
- label `unavailable` differently from `0%`;
- explain that source country does not define conflict relevance;
- explain ISW/CTP shared-source/non-independence caveat prominently enough to affect
  interpretation;
- do not render ISW prose, source full text, provider/model names, internal prompts, or hidden
  candidate evidence;
- retain source attribution, hedge, confidence, and timestamps on BNOW evidence;
- accessible tables/cards, keyboard navigation, focus, landmarks, dark/light contrast, mobile
  layouts, print behavior, reduced motion, and localization-safe wrapping;
- feature off means no routes linked from navigation, no unfinished metadata/sitemap promotion,
  no current-scoreboard behavior change, no new runtime DB dependency, and every direct conflict
  URL returns `notFound()` before conflict data access;
- ephemeral local/test-process feature injection is authorized only for fixture-backed browser
  verification. Do not persist an env value, edit `.env*`, or change Vercel configuration;
- for a public conflict route, the feature-off guard is the first statement before data access;
- for any authenticated/gated route, the page-level authorization gate remains the first
  statement per ruling 21, followed immediately by the feature-off guard, both before data access;
- add direct bare-GET and `RSC: 1` feature-off body tests for every route, plus the production-build
  authorization integration test for any gated route.

Use fixture-backed local screenshots and browser verification. Do not connect the UI to
production or run live matching.

### Critical Gate 6 — two reviewers

1. Product clarity/accessibility reviewer.
2. Legal/authorization/truth-in-UI reviewer.

The review must include narrow mobile, desktop, light/dark, keyboard, print, feature-off, empty,
partial-lane, and unavailable-snapshot states.

## 15. Phase 7 — integration, offline comparison, and merge handoff

### Build and evaluate

- Merge only the passing phase branches into the local conflict integration branch.
- Verify that the conflict integration branch still descends from the exact final review-passed
  quality-foundation SHA selected at startup. List inherited quality-foundation commits separately
  from conflict-workstream commits so the operator can review both scopes.
- If `origin/main` has advanced, do not rebase or merge it late merely to look current. Produce a
  three-way integration/conflict forecast and proposed later merge order against the then-current
  main SHA.
- Run the legally safe fixture/backtest matrix comparing:
  - current separate RU/UA method;
  - combined ROCA method;
  - current Iran military-only method;
  - combined Iran regional/multi-track method.
- Do not characterize fixture gains as production gains. Report only what was actually run.
- Produce a future shadow-soak plan with a predeclared duration, minimum report counts, lane
  representation, matcher precision/recall threshold, variance threshold, query/cost ceiling,
  and human-review sample. Do not enable it.
- Propose a PR decomposition and later integration order that minimizes conflict with the generic
  evaluation control plane already inherited from the base and any intervening migrations.
- List every migration, feature flag, data backfill, report-discovery change, route, and operator
  decision required for later deployment.

### Full integration gates

1. Clean worktree and `git diff --check`.
2. Targeted tests for every phase.
3. `npm run typecheck`.
4. `npm run lint`.
5. `npm test` with exact count.
6. Production build with safe dummy/non-contact configuration.
7. Relevant disposable-Postgres integration suite, if credentials are available.
8. Fixture/offline/estimate/report CLIs with a proof of zero provider contact.
9. Browser matrix for the feature-off and fixture-on UI.
10. Source scan for reference/source prose, secrets, environment files, generated paid results,
    SDK auto-retries, and paid-attempt reservation/metering order.
11. Exact base, phase tips, review tips, merge commits, migration status, and test results in the
    final report.

### Final adversarial reviews — three fresh reviewers

After the exact integration SHA is committed and all gates are green, commission three reviewers
with no authoring context beyond project instructions, this prompt, base SHA, tip SHA, and diff:

1. **Methodology/science:** scope, denominator, lanes, atomic/compound policy, missing data,
   aggregation, declared-unit scope, matcher calibration, shared-source caveat, and whether the comparison answers a
   real analyst question.
2. **Safety/operations:** legal text boundaries, traceability, stubs, immutable snapshots,
   migrations, concurrency/idempotency, spend/retries/metering, feature-off equivalence,
   authorization, and query bounds.
3. **Product/analyst UX:** conflict versus country clarity, usefulness, drilldown, language,
   accessibility, mobile/print, unavailable states, and whether the experience makes external
   validation easier—not more confusing.

Each report must name exact SHAs, inspected paths, findings, reproductions, categories checked
with no finding, and a `PASS`, `PASS-WITH-MINORS`, or `FAIL` verdict. Fix every BLOCKER/HIGH,
rerun full gates, and obtain focused re-review. A final PASS applies only to the exact final SHA.

## 16. Minimum adversarial acceptance corpus

The committed legal-safe fixtures must cover at least:

### Russia–Ukraine / ROCA

- one development supported only by a UA-tagged claim;
- one supported only by a RU-tagged source about an event inside Ukraine;
- occupied Crimea or another `both` geography;
- North Korean military support;
- an EU/NATO/member-state decision directly shaping the war;
- unrelated European domestic news that must be excluded;
- same town and action class on different dates;
- one mapped-corpus match omitted from published output;
- a compound reference unit with partial evidence;
- a quiet/no-advance unit opposed by a positive advance claim.

### Iran and regional conflict / Iran Update

- direct Iran–Israel–US strikes;
- Hezbollah/Lebanon;
- Iraqi militia activity;
- Houthi/Yemen maritime activity;
- Hormuz or Gulf-base activity involving Oman, Bahrain, Qatar, UAE, Kuwait, or Saudi Arabia;
- IAEA/nuclear evidence from the nuclear track;
- E3/EU or mediator diplomacy;
- Iranian domestic security or succession from the elite track;
- unrelated Israeli/Gulf domestic or commercial news that must be excluded;
- an Iran Update lane with no comparable mapped Gulf evidence, reported unavailable rather than
  manufactured;
- the same proxy/actor in two distinct events;
- source-language translation that must not strengthen hedge or attribution.

### Cross-cutting

- multiple same-date report editions and deterministic final selection;
- true publication gap;
- missing and malformed cutoff/publication timestamps;
- DST boundary and explicit-offset timestamps;
- evidence fetched after cutoff but before publication;
- source published before cutoff but ingested after publication;
- latest digest regenerated after the historical evaluation instant;
- current and superseded extractor versions together;
- mirrors/reposts across adapters;
- one authoritative source versus many dependent copies;
- stub/fixture leakage attempt;
- source text containing prompt instructions or fake schema fragments;
- malformed/truncated/empty matcher output and partial vote rounds;
- unavailable snapshot, empty evidence, and genuinely zero matches as three distinct states;
- attempts to recover reference prose from persisted JSON, logs, errors, UI, and exported reports.

## 17. Completion and handoff

The workstream is complete only when:

- Phases 0–7 have clear pass/blocked status and evidence;
- every implemented phase has passed its independent adversarial gate after remediation;
- one report produces one combined benchmark result, with contribution drilldowns instead of
  duplicate country denominators;
- the Iran model can represent regional and multi-track evidence without indiscriminately adding
  Middle East documents;
- declared-reference-unit and lane coverage remain distinguishable;
- corpus recall and published retention remain distinguishable;
- cutoff, publication, finalized, and retrospective inputs are immutable and honestly labelled;
- report editions and publication gaps are deterministic;
- no ISW/CTP prose or source full text persists or renders;
- existing production behavior is unchanged when flags are absent;
- no paid calls, production writes, deploys, pushes, PRs, or merges to `main` occurred;
- the final integration report is sufficient for an operator to compare this branch against the
  concurrently developed quality foundation and decide a later merge order without relying on
  chat history.

Return exactly this status when the implemented integration branch and all possible gates pass:

`implementation-pass / merge-awaits-operator-review`

If a genuine concurrent-contract or external-infrastructure block remains, return:

`implementation-pass / integration-blocked`

and name the exact missing branch/commit/interface/test—not a vague request to “coordinate.”

If a required independent review cannot be obtained, return `review-gate-blocked`; do not use an
implementation-pass status or self-certify that gate.

Do not merge to `main`, push, open a PR, deploy, enable flags, run paid evaluation, or mutate
production.
