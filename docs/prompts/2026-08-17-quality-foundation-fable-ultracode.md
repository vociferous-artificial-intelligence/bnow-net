# BNOW.NET quality-foundation development program

**Execution profile:** Claude Fable model, Ultracode effort.

You are the primary coding agent for a multi-worktree BNOW.NET development program.
Use fresh adversarial review agents at the gates specified below. This is a development
and review assignment only: do not deploy, change production or Vercel environment
variables, make paid provider calls, write to production data, push branches, open PRs,
or merge anything to `main` unless the operator separately authorizes that action.

## Mission

Build the quality, reliability, and evaluation foundation that makes BNOW.NET's new
workload-specific model routing safe and useful. The goal is not to activate a newer
model. The goal is to make model and prompt changes measurable, reversible, resumable,
and grounded in the freshness and provenance of the evidence actually published.

Deliver the following core workstreams in isolated worktrees, then integrate them into
one local integration branch:

1. Evidence-recency metrics and a source-to-publication conversion funnel.
2. Durable map-worker concurrency plus a version-aware, resumable remap operator.
3. A repository-owned evaluation control plane for map, reduce/digest, and validation.

If all three core workstreams and their adversarial reviews pass with substantial time
remaining, implement the bounded human-adjudication workstream described under Worktree
D. Otherwise deliver its reviewed design as a follow-up, not a rushed partial feature.

The work must preserve BNOW's source traceability, publication-safety, spend, versioning,
authorization, and truth-in-UI invariants. A higher model score never overrides those
rules.

## Read first and establish the exact base

Read these files completely before planning or editing:

- `AGENTS.md`
- `docs/CURRENT-STATE.md`
- `docs/OPEN-TASKS.md`
- `docs/PRODUCT-BRIEF.md`
- `docs/TIME-MODEL.md`
- `docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` from the routing worktree
- `docs/evals/README.md`
- `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`
- `src/lib/analysis/map-worker.ts`
- `src/lib/analysis/map-versions.ts`
- `src/lib/analysis/map-health.ts`
- `src/lib/analysis/reduce.ts`
- `src/lib/analysis/reduce-io.ts`
- `src/lib/analysis/synthesize.ts`
- `src/lib/analysis/digest-persist.ts`
- `src/lib/validation/run.ts`
- `src/lib/validation/score.ts`
- `src/lib/usage/x-lease.ts`
- `scripts/map-backfill.ts`
- `scripts/ask-eval.ts`
- `scripts/ask-eval-harvest.ts`
- `src/lib/ask/eval-set.ts`
- `src/lib/ask/eval-run.ts`

Inspect all relevant tests and schema definitions rather than inferring contracts from
filenames or this prompt. Correct this plan in the implementation report if the code
proves any premise stale.

The routing candidate is currently in:

`/Users/go/code/bnow-net-worktrees/cloud-model-routing-20260816`

Its reviewed tip at prompt-writing time is `0e469f7`; `origin/main` was `9c5e9cb`.
Do not assume either remains current. Verify refs and tree state. Do not modify the routing
worktree: it is frozen for the operator's planned deployment. The ordinary main checkout
also had unrelated X-recovery edits in progress when this prompt was written; preserve
them and do not use that dirty checkout for this program.

If the routing branch has already merged to `origin/main`, base the program on that merge.
If it has not merged, create a **local-only integration base** from the newest local
`origin/main`, merge the reviewed routing tip into that integration worktree, and record
the exact parents and conflict resolutions. Do not merge it into `main`, push it, or
silently substitute an older routing commit. If the merge has substantive conflicts in
runtime code, stop feature implementation and report `integration-base-blocked`; do not
guess through them. A documentation EOF conflict may be resolved by preserving both
append-only narratives in chronological order.

Suggested local branches/worktrees, adjusted for the actual date if necessary:

- `codex/quality-foundation-integration-20260817`
- `codex/evidence-quality-observability-20260817`
- `codex/map-reliability-remap-20260817`
- `codex/analysis-eval-control-plane-20260817`
- optional: `codex/quality-adjudication-20260817`

Create feature worktrees from the exact same integration-base commit. Never share one
working directory between authoring agents. Never edit the operator's dirty checkout.

## Non-negotiable authorization boundaries

This program authorizes local code, tests, fixtures, documentation, local commits, and
local merges into the program's integration branch. It does not authorize:

- production, preview, or Vercel environment changes;
- deployments or aliases;
- production database writes or manually invoking production crons;
- paid OpenAI, Anthropic, X, OpenSanctions, or other provider calls;
- adding credentials to a worktree or copying `.env.local` into one;
- pushing branches, opening PRs, or merging to `main`;
- changing live model-routing variables or adding a model to an approved registry;
- loosening the non-baseline map activation lock;
- applying LLM or entity-review proposals automatically;
- weakening K=5 synthesis, publication safety, claim-source traceability, page-level
  authorization, or fail-closed spend behavior.

Estimate modes, pure fixture runs, read-only local inspection, and disposable test-database
branches are allowed when credentials and the existing project workflow support them.
If disposable integration infrastructure is unavailable, record the gate as blocked; do
not point integration tests at production.

Coding-agent inference credits are not application provider-call authorization. The agent
may use Fable/Claude reasoning for development and review, but the BNOW application must
not make paid external inference calls during this program.

## Program architecture and merge order

Worktrees A and B may proceed independently after the integration base exists. Worktree C
may design its common contracts in parallel but must consume the final dispatch-identity
and quality-stat shapes actually present after A and the routing seam. Worktree D starts
only after A-C are integrated and green.

Merge locally in this order:

1. Worktree A: evidence-quality observability.
2. Worktree B: map lease and remap tooling.
3. Worktree C: evaluation control plane.
4. Optional Worktree D: human adjudication.

After each local merge, rerun the receiving branch's targeted tests and resolve semantic
conflicts deliberately. Final integration requires the full project gates and two fresh
cross-workstream adversarial reviews.

---

## Worktree A — evidence recency and conversion funnel

### Outcome

Persist and report honest statistics answering both:

1. How old was the evidence actually used in a published digest?
2. Where did eligible source material fall out between ingestion and publication?

Do not create a public headline score or a composite quality score in this workstream.
Persist internal/auditable statistics and provide a read-only operator report. Public
presentation requires later calibration and an operator product decision.

### A1. Evidence-recency contract

Implement a pure, unit-tested evidence-recency calculator and integrate it into the one
shared publication/persistence boundary so it measures the post-publication-guard event and
claim shape, not pre-guard model output. Both digest engines must use the same definition.

Prefer existing JSON surfaces such as `digests.structured.stats.evidenceRecency`; do not add
a migration merely for convenience. Preserve existing structured stats additively.

The evidence population is:

- distinct `raw_document` IDs actually linked to claims that survive the publication
  guard and are persisted for that digest/track;
- counted once per digest/track for document-level statistics even if one document backs
  several claims;
- claim-level statistics calculated over persisted claims, not model-proposed claims;
- stub/fixture documents excluded by the same production truth rules as every other read.

Persist a versioned contract, at minimum:

```ts
interface EvidenceRecencyStatsV1 {
  version: 1;
  asOf: string;
  documentCount: number;
  claimCount: number;
  timestampedDocumentCount: number;
  timestampCoveragePct: number;
  medianEvidenceAgeHours: number | null;
  p90EvidenceAgeHours: number | null;
  evidenceWithin24hPct: number | null;
  staleClaimsOver48hPct: number | null;
  unknownAgeClaimPct: number;
  publishedTimestampUsed: number;
  fetchedTimestampFallbackUsed: number;
  missingTimestampCount: number;
  futurePublishedTimestampCount: number;
  medianIngestionLagHours: number | null;
  p90IngestionLagHours: number | null;
  invalidIngestionLagCount: number;
}
```

Names may improve after inspecting project conventions, but definitions may not become
ambiguous.

Time rules:

- `asOf` is the effective analysis cutoff for this digest invocation, persisted as an
  explicit ISO instant. A rolling run uses its injected/run clock. A fixed UTC-day run uses
  the exclusive end of its analysis window. Inspect the legacy gather window and define its
  equivalent honestly; do not use an unrelated wall clock.
- Primary evidence time is a valid `published_at`. Fall back to `fetched_at` when
  `published_at` is missing or invalid.
- A `published_at` materially in the future relative to `asOf` is an anomaly, not zero-age
  fresh evidence. Record it, then use a valid `fetched_at` fallback if one exists. Define and
  test a small clock-skew tolerance rather than hiding it in ad hoc arithmetic.
- Evidence age cannot silently become negative. Missing/invalid ages stay out of the age
  denominator and are exposed through coverage/unknown fields.
- `evidenceWithin24hPct` uses timestamped distinct documents as its denominator; if none are
  timestamped, it is `null`, not zero.
- A claim is stale when it has at least one usable evidence timestamp and its **newest**
  supporting evidence is older than 48 hours at `asOf`. A claim with no usable evidence
  timestamp is unknown, not stale.
- Ingestion lag is `fetched_at - published_at` only when both timestamps are valid and the
  result is nonnegative within the documented skew tolerance. Invalid/negative cases are
  counted separately.
- Define percentile behavior in one helper and test odd, even, one-value, empty, duplicate,
  and boundary populations.
- Never use string ordering for timestamps.

Also compute a generation-lag or historical-regeneration diagnostic if needed to prevent a
late manual regeneration from being misread as event-date freshness. Keep that separate from
evidence age.

### A2. Conversion-funnel contract

Build a versioned, auditable funnel for the mapreduce engine. Prefer deriving stages from
existing canonical tables and current-version accessors. Add narrowly scoped instrumentation
only where a stage cannot be reconstructed honestly.

At minimum report, per theater/track/date/current extractor version and, where meaningful,
by adapter/platform/language:

- raw documents eligible for mapping;
- final map dispositions;
- documents producing at least one map claim;
- map claims produced;
- deduplicated/canonical documents used;
- reduce groups formed;
- reduce groups ranked and fed to synthesis;
- distinct documents represented in fed groups;
- groups selected by at least one vote and by the final majority;
- final events and claims after deterministic finalization;
- claims/events removed or rewritten by publication safety;
- distinct documents attached to persisted claims;
- citation share and conversion rate for each supported dimension;
- timestamp completeness and evidence-recency summaries from A1;
- exact model/effort/route identity from the routing seam.

Do not invent false stage inequalities when one group or document can fan out. Document
whether each count is documents, claims, groups, events, or links. Use current extractor
versions only and do not double-count superseded history. Legacy-engine digests must be
labelled separately rather than coerced into a mapreduce funnel.

Use bounded enums plus an explicit `unknown` category for disposition/rejection reasons.
Never make a new reason disappear because the reporting code does not recognize it.

Add a read-only script such as `scripts/quality-funnel-report.ts` with:

- theater, track, from, and to selectors;
- human-readable and JSON output;
- no provider contact;
- no database writes;
- clear engine/version/route labels;
- reconciliation warnings when persisted counts contradict defined invariants;
- a fixture or query-layer test proving superseded map versions and mirrors do not inflate
  the funnel.

The report must make the IR X-dependency investigation actionable: an operator should be
able to see whether RSS/Telegram material is lost at map yield, reduce rank/fed selection,
voting, publication safety, or final citation attachment.

### A3. Tests and report

Required tests include:

- exact 24h and 48h boundaries;
- missing, invalid, future, and timezone-offset timestamps;
- published/fetched fallback accounting;
- multiple claims sharing one document;
- one claim with fresh and stale sources;
- post-publication-guard removal changing the measured population;
- rolling vs fixed-window `asOf` semantics with an injected clock;
- historical regeneration stability;
- both engines reaching the common calculator;
- no regression to existing `structured.stats` keys;
- funnel current-version filtering, dimension reconciliation, and unknown reason behavior.

Write `docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md` with definitions,
examples, exact persisted shape, data caveats, gates, and rollout recommendations. State
explicitly that the metric is internal and uncalibrated; do not propose a public target from
an unobserved baseline.

### A4. Adversarial review gate

After committing Worktree A, commission a fresh read-only reviewer who did not author it.
The reviewer must inspect the full base-to-tip diff and specifically attempt to disprove:

- time-anchor correctness across rolling, final, legacy, and regeneration paths;
- denominator honesty and deduplication;
- absence of future-timestamp freshness inflation;
- placement after publication safety;
- absence of source/full-text leakage into new stats;
- map-version and mirror filtering;
- funnel count reconciliation;
- default-output compatibility outside additive stats;
- query cost on realistic digest sizes.

Fix every BLOCKER or MAJOR finding, adjudicate every MINOR with evidence, rerun gates, and
obtain a focused re-review of remediations. A self-review is not this gate.

---

## Worktree B — map concurrency and safe remapping

### Outcome

Eliminate the pooled-session advisory-lock failure mode and provide the missing remap path
required for safe extractor/model/prompt version changes. Preserve append-only extraction
history and existing current-version consumer rules.

### B1. Durable map lease

Investigate the current worker, route lifetime, `cron_runs` contract, `provider_state`, and
the existing X lease before choosing the implementation. Prefer a short-transaction,
database-backed owner-token/fencing lease over a long database transaction spanning provider
network calls. Do not retain the current session advisory lock as the primary mechanism.

The lease must:

- acquire atomically before any paid provider reservation or dispatch;
- carry an unguessable owner token and monotonically safe fencing/version semantics;
- have an explicit expiry bounded against the route's maximum duration;
- renew safely during long work without allowing two current owners;
- permit takeover only after proven expiry through compare-and-set logic;
- release only when the caller still owns the lease;
- expose acquired/busy/renewed/lost/released/expired-takeover outcomes in `cron_runs.counts`
  or the existing internal operational surface;
- support an injected clock and deterministic concurrency tests;
- avoid broad backend termination as normal operation;
- preserve ruling 10: the `cron_runs` row is written at START;
- fail safely when the database is unavailable.

If a lease is lost after an LLM response but before persistence, record billed usage before
discarding or retrying the response, and prevent an unfenced writer from mutating map state.
Use existing unique constraints/idempotency as additional defense, not as the only lease.

Hourly mapping, backfill, and remap must share the same concurrency authority or a documented
non-overlap/fencing scheme. It must be impossible for a manual remap to race the hourly worker
silently.

### B2. Version-aware remap operator

Implement `scripts/map-remap.ts` or an equivalently clear operator. It must reuse production
mapping behavior rather than fork prompt/schema/parsing logic.

Required behavior:

- ignore `raw_documents.processed` as an eligibility gate for remap;
- anti-join `doc_map_state` against the explicitly resolved/current extractor versions;
- never reset `processed`, delete old `doc_claims`, or mutate historical extractor versions;
- select by theater, track, from/to dates, and bounded batch/total limits;
- have a read-only default or `--dry-run`; execution requires an unmistakable `--execute`;
- print the exact target model, effort, extractor versions, eligible document count, and a
  conservative cost estimate before execution;
- refuse an unpriced, unapproved, or map-activation-locked route exactly as the shared model
  configuration requires;
- pass every physical provider attempt through a fresh SpendGuard reservation and meter every
  billed response before parsing/discarding;
- stop with typed run/daily/total/transport/config/lease categories;
- checkpoint progress durably enough to resume without rescanning/rebilling completed work;
- treat a current-version final no-claims disposition as completed, not perpetually retryable;
- coexist safely with hourly mapping through B1;
- provide deterministic `--estimate`/dry-run behavior with zero provider contact;
- produce an explicit completion summary and leave old version rows intact for rollback.

Do not relax the routing branch's non-baseline map activation lock in this program. The remap
operator is necessary infrastructure, not authorization to activate a model.

### B3. Failure-injection tests and report

Required tests include:

- two simultaneous acquisitions: exactly one owner;
- renewal, owner-only release, expired takeover, stale-owner release refusal;
- lost lease before reservation, during a batch, after paid response, and before persistence;
- database error during acquire/renew/release;
- route timeout/abandoned owner recovery;
- hourly worker vs remap contention;
- dry-run makes no writes, reservations, or OpenAI client construction;
- superseded-version rows do not satisfy the current-version anti-join;
- final no-claim map states do satisfy it;
- resume skips completed document/version pairs;
- cap exhaustion stops without marking unprocessed targets complete;
- per-attempt reservation/metering cardinality including 429/manual retry;
- rollback/current-version consumers still see the prior complete version;
- no claim-source or publication-safety regression.

Add or update real-Postgres integration coverage for the concurrency behavior; mocks alone
cannot prove atomic lease acquisition. Use a disposable database branch only.

Write `docs/reviews/MAP-RELIABILITY-REMAP-2026-08-17.md` with the concurrency proof,
state machine, SQL atomicity argument, failure table, cost-estimation method, exact gates,
and a no-production-execution statement.

### B4. Adversarial review gate

After committing Worktree B, commission two fresh read-only reviews, which may run in
parallel:

1. **Concurrency/DB reviewer:** attempt to construct split-brain, ABA, clock-skew,
   expired-owner, pooled-connection, and timeout races from the exact SQL and call order.
2. **Spend/versioning reviewer:** attempt to find an unreserved retry, unmetered response,
   wrong-version write/read, destructive reset, or resume path that rebills completed work.

Both reviewers inspect the full base-to-tip diff. Fix all BLOCKER/MAJOR findings and obtain
focused re-reviews. If a concurrency claim cannot be proven with a real-Postgres test, record
the worktree as blocked rather than declaring it safe.

---

## Worktree C — repository-owned analysis evaluation control plane

### Outcome

Generalize BNOW's existing Ask and mapreduce A/B evaluation ideas into a local, versioned,
resumable scorecard system for map extraction, reduce/digest synthesis, and validation
matching. The approved-model registry must be backed by representative workload evidence,
not model reputation or price.

Do not build this on a hosted eval product. Keep the durable harness, datasets, result files,
and gates in the repository. At prompt-writing time, official OpenAI documentation says its
legacy Evals platform is scheduled to become read-only on 2026-10-31 and shut down on
2026-11-30; verify current official documentation before relying on any external eval API.
The design should remain provider-neutral even though current live analysis is OpenAI.

### C1. Common eval contracts

Create small, explicit contracts for:

- dataset and case version;
- workload (`map`, `reduce`, `digest`, `validation`; Ask remains compatible but need not be
  rewritten);
- immutable input/reference identity;
- candidate dispatch identity: provider, exact model snapshot/slug, effort, route version,
  prompt hash, schema version, extractor version where applicable;
- result status, raw structured-output validation outcome, latency, token counts, estimated
  cost, and run/attempt identity;
- deterministic checks, human labels, and optional model-grader judgments kept distinct;
- repeated-run grouping for variance;
- scorecard thresholds and an explicit pass/fail/insufficient-data verdict;
- baseline-to-candidate deltas, never candidate-only vanity scores.

Avoid storing copyrighted source full text in committed datasets. Use existing allowed
fixtures, minimal necessary excerpts where legally permitted, stable internal references,
generated/paraphrased adversarial cases, and BNOW's own claim/event structures. Never put ISW
prose in committed output; existing ruling 1 still applies.

Model-generated cases and labels are provisional until a human or deterministic oracle
confirms them. Keep train/development cases separate from held-out gate cases. Prevent a
candidate prompt from seeing gold labels or grader rationales.

### C2. Workload scorecards

Implement evaluators and representative initial datasets for:

#### Map extraction

- per-document claim recall and precision against labelled expected claims;
- exact batch cardinality and under-fill rate;
- schema validity and truncation;
- quote containment/verification;
- hedge, certainty, identity, predicate, place, date, and number preservation;
- traceability of every accepted claim to its input document ID;
- prompt-injection resistance;
- duplicate/template handling;
- empty/no-claim correctness;
- multilingual cases for the live theaters.

#### Reduce/digest

- correct merge vs split decisions;
- independent-source/mirror-aware corroboration;
- event and claim recall;
- citation/group-ID fidelity;
- named-person and disputed-allegation safety;
- certainty/attribution preservation;
- source/platform diversity;
- evidence-recency metrics from Worktree A;
- publication-guard removals and rewrites;
- run-to-run event/claim reproducibility;
- K=5 majority behavior unchanged.

#### Validation

- takeaway-to-claim match precision/recall on a human-labelled pair set without persisting
  prohibited source prose;
- theater filtering;
- false agreements from shared place names but different actions/dates;
- false misses from paraphrase or translation;
- majority-vote agreement and variance;
- keyword fallback behavior;
- at-publish and timeliness arithmetic unchanged;
- dispatcher/metering identity captured.

Every workload scorecard must also report latency, input/output tokens, estimated cost,
parse/schema failures, physical attempts, and configuration identity. Resource savings count
as an improvement only when the quality gate still passes.

### C3. Runner behavior

Provide one clear CLI entry point or a small family with consistent flags. Required modes:

- `--validate-dataset`: pure, no DB/provider;
- `--estimate`: conservative cost and run-count plan, no provider;
- fixture/offline deterministic scoring;
- live candidate run, disabled unless an explicit execution flag, non-production DB guard,
  real API key, and all applicable caps are present;
- `--report`: reads saved result artifacts and produces a scorecard with no provider/DB;
- targeted `--only` reruns and resumability by case/config/repetition;
- multiple repetitions for nondeterministic workloads;
- immediate durable write of each completed case so interruption is resumable;
- loud abort/invalid verdict for stub, keyword-only, budget-degraded, unpriced, or unapproved
  execution when a live candidate was requested;
- no default OpenAI SDK auto-retries; any deliberate retry gets a fresh reservation;
- billed usage recorded before parsing/discarding.

The runner may evaluate a non-approved candidate only inside the explicit local evaluation
path. That exception must not make the candidate dispatchable in production code. Separate
`evaluation_candidate` from `evaluated_candidate`; only a complete passing scorecard can
produce a proposed registry entry, and applying that proposal remains an operator action.

Do not execute the paid/live mode during this program. Prove it through mocks, static source
guards, and estimate/offline runs.

### C4. Initial corpus and gates

Build enough cases to exercise all listed categories, not a token demo. Favor a compact,
high-signal initial corpus with documented coverage over hundreds of machine-generated cases
that no one has checked. Include typical, edge, and adversarial partitions and record their
counts.

Define scorecard gates before looking at candidate-model results. At minimum, no candidate
may regress:

- claim-source traceability;
- schema/batch completeness;
- publication-safety behavior;
- named-person source fidelity;
- hedge/certainty preservation;
- current K=5 variance/reproducibility requirement;
- metering and spend invariants.

Quality improvements should be tested with pairwise/classification/scoring tasks where
possible, then calibrated against human judgments. Do not use an open-ended "which answer
feels better" judge as the release gate. A model must not grade its own output as the sole
authority.

Write:

- dataset documentation under `docs/evals/analysis/`;
- a versioned scorecard schema;
- a sample offline baseline report;
- `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` describing dataset provenance,
  leakage prevention, metrics, thresholds, runner safety, gates, and the future paid-eval
  authorization checklist.

### C5. Adversarial review gate

After committing Worktree C, commission two fresh read-only reviews:

1. **Evaluation-science reviewer:** look for gold leakage, unrepresentative sampling,
   grader circularity, unstable identifiers, hidden missing-data exclusions, invalid
   aggregation, and gates chosen after results.
2. **Paid-call/safety reviewer:** try to make estimate/report/offline modes contact a
   provider, bypass caps, use SDK auto-retries, score a degraded result as live, or turn an
   evaluation candidate into a production-approved model.

Fix all BLOCKER/MAJOR findings and obtain re-review. Clearly distinguish implemented gates
from future paid results; no report may imply that a candidate model was evaluated when this
program made no paid calls.

---

## Optional Worktree D — bounded human adjudication

Start only after A-C have passed their reviews and the integrated A-C tree is green. If this
cannot be completed cleanly, write a reviewed design and stop; do not leave a half-authorized
admin surface.

### Outcome

Create a minimal admin-only workflow for structured human labels that can grow the held-out
evaluation corpus. It is review/annotation only; it never changes claims, events, sources,
entity matches, digests, model registries, or routing configuration.

Candidate review subjects:

- validation misses and disputed agreements;
- map extraction misses/false positives;
- reduce merge/split errors;
- stale-evidence claims;
- wrong or insufficient citations;
- publication-safety concerns;
- Ask retrieval failures;
- entity-match candidates, still non-assertive and never auto-applied.

Use an additive forward migration only if a durable table is genuinely necessary. Preserve
the `9999_claim_source_trigger.sql` last-migration rule. Annotations should be append-only;
corrections supersede prior annotations rather than rewriting history. Store structured label,
subject type/id, reviewer identity, optional concise note, timestamps, and supersession link.
Avoid duplicating source full text.

Every page under the new admin route must call `requireAdmin`/`requireAdminOr404` as the first
statement before any query, retain the layout gate, and be added to the real production-build
authorization integration test per ruling 21. Do not rely on `currentRole()`.

Provide a read-only/export path that emits reviewed labels in the eval dataset contract without
automatically adding them to a held-out gate. Human promotion into a released eval set remains a
separate deliberate action.

Commission a fresh adversarial reviewer focused on authorization, RSC/redirect body leakage,
append-only history, accidental auto-application, and source-text exposure. Fix and re-review
all BLOCKER/MAJOR findings.

---

## Cross-cutting adversarial corpus

Across A-C tests, include production-shaped cases for:

- source text containing instructions to the model or fake schema fragments;
- coordinated mirrors/reposts pretending to be independent corroboration;
- an old article reposted with a new fetch timestamp;
- missing, malformed, timezone-less, negative-lag, and future timestamps;
- a newer source repeating an older event without a material update;
- one fresh low-reliability source vs several older reliable sources;
- translated text that strengthens attribution or certainty;
- namesakes and common-name identity collisions;
- disputed named-person allegations with trailing/non-governing attribution;
- one confirmed subclaim beside an unrelated disputed allegation;
- same place but different event/action/date;
- cross-theater content that must not merge;
- current and superseded extractor versions in the same database;
- provider 429, timeout, truncated output, empty content, malformed JSON, and billed parse
  failure;
- lease expiry at every batch boundary;
- missing caps, unknown pricing, unapproved models, invalid effort, and `LLM_DISABLE=1`;
- attempts to access admin review routes via bare GET and `RSC: 1` without authorization.

## Test and quality gates

Each worktree before review:

1. `git diff --check`
2. targeted unit tests
3. `npm run typecheck`
4. `npm run lint`
5. `npm test`
6. relevant build/test modes with dummy never-contacted build DB configuration when required
7. relevant disposable real-Postgres integration tests
8. zero-provider-contact estimate/offline CLI smoke

Do not hide pre-existing failures. Reproduce them on the exact base and distinguish them from
new failures with evidence. Do not weaken assertions or skip tests merely to make a gate green.

Final integration gate after all selected worktrees merge locally:

- clean worktree and `git diff --check`;
- typecheck, lint, full unit suite, full build;
- full disposable-Neon integration suite if credentials are available;
- targeted concurrency stress run;
- all eval datasets validate;
- all report/estimate/offline CLIs prove zero provider contact;
- source scan proving every new OpenAI/Anthropic client has `maxRetries: 0` or is unreachable
  from paid execution;
- source scan proving every physical paid attempt is reserved and every billed response is
  metered before parsing;
- no secrets, `.env` files, generated paid results, or production data committed;
- exact base, feature tips, merge commits, and test counts recorded.

## Final integration adversarial reviews

After the exact integration tip is committed and all gates are green, commission two fresh
review agents with no authoring context beyond the project instructions, prompt, base SHA, and
tip SHA:

1. **Safety/operations review:** full diff; spend, retries, lease races, remap idempotency,
   map versions, traceability, publication guard, authorization, migration safety, secret/data
   exposure, and deployment-default equivalence.
2. **Quality/science review:** full diff; recency definitions, funnel denominators, timestamp
   anomalies, eval representativeness, leakage/circular grading, missing-data honesty, variance,
   and whether any new metric can be gamed at the expense of source quality or corroboration.

Reviewer output must include:

- exact base and tip SHAs reviewed;
- files and runtime paths inspected;
- BLOCKER/MAJOR/MINOR/NOTE findings with tight file/line evidence;
- concrete reproduction or reasoning for each finding;
- categories explicitly checked with no finding;
- verdict: PASS, PASS-WITH-MINORS, or FAIL.

The authoring agent must disposition every finding in the final report. Fix all BLOCKER and
MAJOR findings, rerun the full gates, and send the remediation diff back to the relevant
reviewer for focused re-review. A final PASS applies only to the exact final integration SHA.
If independent reviewers are unavailable, report `review-gate-blocked`; do not self-certify.

## Documentation and handoff

Maintain one final report:

`docs/reviews/QUALITY-FOUNDATION-INTEGRATION-2026-08-17.md`

It must contain:

1. Executive verdict and explicit statement of what is not activated/deployed.
2. Exact base, feature, review, and integration SHAs.
3. Worktree/branch map and local merge order.
4. Architecture and data-flow changes.
5. Evidence-recency definitions and denominator table.
6. Conversion-funnel stage/dimension definitions and reconciliation rules.
7. Map lease state machine and atomicity/fencing argument.
8. Remap eligibility, checkpoint, spend, rollback, and failure semantics.
9. Eval dataset provenance, partitions, leakage controls, metrics, and preset gates.
10. Optional adjudication authorization and append-only guarantees, if implemented.
11. Exact test commands and actual results.
12. Every adversarial review, finding, remediation, and re-review verdict.
13. Residual risks and operational prerequisites.
14. Proposed PR decomposition and deployment order.

Update standing documentation in place only when implementation makes it true. Append a decision
log entry only for an actual new binding decision; do not pre-record undeployed work as live. Keep
`AGENTS.md` within its maintenance budget and move detailed narrative into the review report.

## Completion criteria

This program is complete only when:

- A-C are implemented in isolated worktrees and merged into the local integration branch;
- their individual adversarial gates pass after remediation;
- evidence recency is persisted from the exact post-guard published evidence population;
- the conversion funnel locates source loss without double-counting versions/mirrors;
- the map worker no longer depends on a session advisory lock across pooled connections;
- remapping is dry-run-first, resumable, version-aware, non-destructive, lease-safe, and
  fail-closed on spend/configuration;
- analysis eval datasets and scorecards are repository-owned, validated, resumable, and safe by
  default;
- no paid model evaluation or production activation is misrepresented as completed;
- full integration gates pass or any external-credential block is documented precisely;
- both final independent reviews PASS on the exact final SHA;
- the final report is complete enough for a separate operator to decide what to merge and how to
  deploy it without relying on chat history.

Return `implementation-pass / merge-awaits-operator-review` when complete. Do not merge to `main`,
push, deploy, run paid evaluations, or activate any model.
