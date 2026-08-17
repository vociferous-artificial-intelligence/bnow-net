# Quality-foundation program — integration report (2026-08-17)

## 1. Executive verdict and what is NOT activated

**Program status: `implementation-pass / merge-awaits-operator-review`.**
All three core workstreams (A evidence-quality observability, B map lease +
version-aware remap, C analysis-eval control plane) are implemented in
isolated worktrees, individually adversarially reviewed with every
BLOCKER/MAJOR remediated and focused re-reviews obtained, merged locally in
the mandated order into `codex/quality-foundation-integration-20260817`, and
the full integration gates are green on the final tree. Worktree D is
delivered as its reviewed design (§10). The two final independent
cross-workstream review verdicts are recorded in §12 against the exact final
SHA. NOTHING in this program is deployed, activated, or pushed; the operator
decides what to merge and how to deploy it (§14).

Explicitly NOT done by this program, by mandate:

- no deployment, alias, preview, or Vercel environment change;
- no production database write and no manually invoked production cron;
- no paid OpenAI / Anthropic / X / OpenSanctions / any-provider call — the
  program's only network use was disposable Neon branch management for
  integration tests and read-only git fetches;
- no push, no PR, no merge to `main` — everything lives on local branches;
- no model activated, no model added to any approved registry, no live
  routing variable changed, and the routing branch's non-baseline MAP
  activation lock is intact and untouched;
- no LLM/entity proposal auto-applied; K=5 synthesis, publication safety,
  claim-source traceability, page-level authorization, and fail-closed spend
  behavior are unweakened (verified per-workstream by adversarial review).

## 2. Exact SHAs

| Ref | SHA | Meaning |
|---|---|---|
| `origin/main` at program start (re-fetched) | `9c5e9cb` | Candidate B cron clustering merge; production deployment base |
| Reviewed routing tip (frozen worktree, unmerged to main) | `0e469f7` | `codex/cloud-model-routing-seams-20260816` |
| **Integration base** (local-only merge) | `05fdd2c` | parents `9c5e9cb` + `0e469f7`; sole conflict `docs/PROGRESS.md` EOF append-only narratives, resolved chronologically (all three plan entries preserved in time order) |
| Program plan commit | `846afcf` | docs only |
| Worktree A tip | `74d0f40` | 6 commits: `c3e352b`, `bf83ad9`, `2019aea`, `f45fdd0`, remediation `a787500`, `74d0f40` |
| Worktree A merge into integration | `eee6a91` | |
| Worktree B tip | `c40060e` | 7 commits: `958e09e`, `97cc684`, `48e5652`, `beac2a9`, `95d0a37`, remediation `e364112`, `c40060e` |
| Worktree B merge into integration | `b4b0299` | |
| Worktree C tip | `ce3c985` | 17 commits: `7cfed01`..`af460c0` (7), remediation `5b72cda`..`0c42880` (6), converged minors `4f1d36d`..`ce3c985` (4) |
| Worktree C merge into integration | `fa81c1b` | clean (no conflicts) |
| Cross-worktree reconciliation (C recency probe -> A canonical calculator) | `ba35082` | flagged by C's report; 3 fixture pins re-derived under canonical percentiles, case ids bumped per the immutability contract |
| Worktree D reviewed design | `2d91c19`..`a730d73` | design -> review FAIL (4 MAJORs) -> remediation -> re-review PASS-WITH-MINORS -> minors folded |
| **Final integration tip** | recorded in §12 beside the final review verdicts | docs-only commits after the reviewed SHA record the verdicts themselves |

## 3. Worktree/branch map and local merge order

All feature worktrees were created from the exact integration-base commit
`05fdd2c`; no working directory was ever shared between authoring agents; the
operator's dirty main checkout (in-progress X-recovery/closeout edits) was
never used or modified; the routing worktree stayed frozen.

| Worktree | Branch | Scope |
|---|---|---|
| `bnow-net-worktrees/quality-foundation-integration-20260817` | `codex/quality-foundation-integration-20260817` | local-only integration base + merges |
| `bnow-net-worktrees/evidence-quality-observability-20260817` | `codex/evidence-quality-observability-20260817` | A: evidence recency + conversion funnel |
| `bnow-net-worktrees/map-reliability-remap-20260817` | `codex/map-reliability-remap-20260817` | B: durable map lease + version-aware remap |
| `bnow-net-worktrees/analysis-eval-control-plane-20260817` | `codex/analysis-eval-control-plane-20260817` | C: analysis eval control plane |

Merge order (as mandated): A (`eee6a91`) → B (`b4b0299`) → C (`fa81c1b`).
After each merge the receiving branch's targeted tests and the full unit
suite were re-run (A: 98/98 targeted + 2,251 full; B: 2,296 full + 119/119
full itest; C: 2,402 full after the `ba35082` reconciliation). No merge had
conflicts (the workstreams' files are disjoint; B and C touch different
regions of map-worker.ts).

## 4. Architecture and data-flow changes

**A — evidence recency + funnel (observability only; INTERNAL/UNCALIBRATED;
no public surface, no headline score, no composite):**

- `src/lib/analysis/evidence-recency.ts` — pure calculator for
  `EvidenceRecencyStatsV1`, integrated inside `persistDigest()` (the ONE
  shared publication boundary) on the exact POST-publication-guard shape,
  after the overwrite verdict allows the write (a refused persist computes
  and stores nothing). Persisted additively as
  `digests.structured.stats.evidenceRecency`; no migration; every
  pre-existing structured.stats key byte-preserved (test-pinned).
- `PersistDigestArgs.asOf` is REQUIRED: legacy fixed-day = exclusive end of
  the UTC-day gather window; mapreduce day mode = the window-end midnight it
  already ranks against; rolling = the injected/run clock. `generatedAt` is
  the only wall-clock read (regeneration diagnostic, never an age input).
- `src/lib/analysis/quality-funnel.ts` + `scripts/quality-funnel-report.ts` —
  versioned (funnelVersion 1) read-only conversion funnel per (theater,
  track, date): eligible docs → mirrors → current-version map dispositions →
  map claims → reduce/vote stages (with two new additive counters
  `gidsCitedAnyVote`/`gidsMajority` in `structured.stats.reduce`) →
  publication-guard removals → persisted events/claims/citation links, with
  per-adapter/platform/language splits, pending-vs-lexicon-not-applicable
  split (review remediation), superseded-version and mirror exclusion
  (mutation-tested), bounded enums with explicit unknown preservation, and
  reconciliation warnings.

**B — map concurrency + remap:**

- `src/lib/analysis/map-lease.ts` — durable owner-token + monotonic-fence +
  DB-time-expiry lease in `provider_state` key `map_lease`, replacing the
  session advisory lock that stranded on the Neon pooler (OPEN-TASKS #77).
  Single-statement CAS acquire (free|expired), token-checked full-TTL renew,
  token-checked fence-preserving release, TTL clamped [30s, 600s] below the
  route's 800s maxDuration.
- `runMapCycle` acquires before any reservation/client construction, renews
  at every physical provider attempt (extractBatch keepalive) and before
  every map write; a lost lease discards parsed results AFTER their billed
  usage is metered (ruling 8) and makes no further writes. Dry runs skip the
  lease entirely (zero writes of any kind).
- Remap mode (OPEN-TASKS #33): eligibility ignores `processed`, excludes
  mirrors structurally, selects only already-dispositioned docs, anti-joins
  `doc_map_state` at CURRENT extractor versions; never writes `processed`,
  never deletes/mutates historical rows. `scripts/map-remap.ts` drives the
  deployed route dry-run-first (`--execute` + finite `--budget` required),
  with a route-capability handshake, typed stop categories, sweep-based
  completion proof, a version-digest-guarded local checkpoint, and
  `doc_map_state` as the authoritative no-rebill record. The map activation
  hard lock is NOT relaxed.

**C — analysis eval control plane:** `src/lib/evals/` (contracts with
runtime validators; pure scorers for map/reduce/digest/validation reusing the
REAL production functions — parseMapResults, verifyQuote, clusterClaims,
mergeVotes, finalizeEvents, guardPublishedEvents, scoreDigest*,
sanitizeMatches; preset gates with results-side completeness, aligned
heldout-only pairwise deltas, and resume-identity enforcement;
`openai_eval` SpendGuard failing closed EVERYWHERE) + `scripts/analysis-eval.ts`
(validate/estimate/offline/report all zero-contact; live candidate mode
implemented behind --execute-live + EVAL_DATABASE_URL + exact --db-ack +
caps, NEVER executed) + 56 hand-authored fictional-person cases
(`docs/evals/analysis/`, dev/heldout + typical/edge/adversarial partitions)
+ committed offline machinery-proof baseline artifacts. The
evaluation-candidate registry bypass is confined to the dynamically-imported
live runner and isolation-scanned out of every production path; production
`llm-match.ts` was touched only to EXPORT its prompt/schema/sanitizer
(behavior byte-equivalent).

## 5. Evidence-recency definitions and denominators

The full field-by-field denominator table, worked examples, and data caveats
live in `docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md`. Binding
summary:

- Evidence population = DISTINCT non-stub raw documents linked to POST-guard
  persisted claims, once per digest/track; claim stats over persisted claims.
- Evidence time = valid `published_at` when ≤ asOf + skew
  (`EVIDENCE_CLOCK_SKEW_MS` = 5 min; within-skew future clamps age to 0);
  beyond-skew future is an anomaly (counted) with `fetched_at` fallback under
  the same cutoff; no usable timestamp = missing/unknown, out of every age
  denominator. Ages never negative. Stale = newest usable evidence per claim
  strictly older than 48h at asOf; exactly 48.0h is not stale; within-24h is
  ≤ 24h exactly. Ingestion lag = fetched − published when both parse,
  clamped/invalid-counted around the same skew, asOf-independent. One
  percentile helper (linear interpolation), edge-tested. Timestamps never
  compared as strings.
- `generationLagHours` (persist wall clock vs asOf) is the regeneration
  diagnostic, kept out of every age statistic.

## 6. Conversion-funnel stages and reconciliation

Stage/dimension definitions and per-count units are in the module and the A
review doc. Invariants checked (violations WARN, never silently repaired):
docsWithClaims ≤ mapDispositions; mapClaims ≥ docsWithClaims; groupsFed ≤
groupsTotal; gidsMajority ≤ gidsCitedAnyVote ≤ groupsFed; structured vs
relational persisted counts; cited docs within the digest's own persisted
reduce window (rolling spans [date−1, date+1)). Non-invariants documented
(fan-out; legacy digests report only their own honest stages and are never
coerced into map stages; superseded-only days warn "version bump awaiting
remap, not a gap"; pending backlog vs lexicon-not-applicable split).

## 7. Map lease state machine and atomicity/fencing

Full state machine, SQL atomicity argument, residual windows (honestly
bounded: a single >TTL HTTP call → legitimate takeover with bounded duplicate
BILLING, never a second writer; the non-atomic renew-before-write chimera
residual requires a ≥TTL single-statement stall and its complete fix — a
fence column — is a schema change deliberately out of scope), and the failure
table are in `docs/reviews/MAP-RELIABILITY-REMAP-2026-08-17.md` §§2, 4, 8.
Real-Postgres proof: concurrent two-racer CAS, expired takeover with fence
monotonicity, stale renew/release refusal, metered-then-discarded lost-lease
persistence, dry-run zero-write (lease row included).

## 8. Remap semantics

Eligibility, checkpoint (version-digest-guarded; `doc_map_state` is the
no-rebill authority), spend (fresh reservation per physical attempt; metering
before parse; typed run/daily/total/transport/config/lease stop categories;
fail-closed non-finite budgets; estimate-over-budget aborts before any paid
call), rollback (append-only superseded rows; reverting the version restores
them to every current-version consumer), and failure semantics are in the B
review doc §§3–4, 8. The operator has NEVER been executed against any
deployed route; all proofs ran through unit seams or disposable Neon forks
with the OpenAI client mocked.

## 9. Eval dataset provenance, partitions, leakage controls, metrics, gates

Full detail: `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` +
`docs/evals/analysis/README.md`. Binding summary: 56 cases, all
hand-authored 2026-08-17 (zero model-generated), fictional persons only, no
ISW prose, synthetic multilingual snippets (map 18 = 6/7/5 with 5 heldout;
reduce 14; digest 10; validation 14). Leakage controls: prompt builders take
case INPUT only (sentinel-tested); heldout excluded from --dev runs and
detail-hidden in default reports; gates are preset constants whose commit
history precedes every artifact; graders reserved-null (no model judges).
Scorecard verdicts require scope-full completeness computed from RESULTS,
heldout minima from results, identity-stable resume (promptHash/schema/
extractor/dataset-hash/knobs), an equally complete hash-matched gpt-4o-mini
baseline for pairwise quality (heldout-only), and degrade to
insufficient_data otherwise — including when the dataset file changed after
the run. Live digest evals refuse any non-shipped K (ruling 18). The first
PAID evaluation remains operator-gated per the routing report §9 checklist +
`EVAL_USD_CAP_DAILY`.

## 10. Optional adjudication workstream (D)

**Decision: reviewed design, not implementation.** The program clause allows
implementing D only when A–C and their reviews pass "with substantial time
remaining"; mid-program the operator queued a full conflict/region evaluation
workstream behind this one, so building a new admin surface here would have
been exactly the rushed half-authorized feature the clause forbids.

Deliverable: `docs/designs/HUMAN-ADJUDICATION.md` — an append-only,
admin-only annotation design (ten bounded subject types; DB-enforced
immutability incl. TRUNCATE; fork/self/cross-subject-proof supersession with
deterministic effective-label semantics; per-subject-type key grammar with
ruling-12-safe scoped re-resolution and `resolved:false` dispositions;
content-free export stubs with promotion as a deliberate authoring act;
ruling-21 page + server-action authorization proofs; explicit OpenSanctions
prerequisite disclaimer). Gate: fresh adversarial design review FAIL (4
MAJORs — export-content rules, honor-system append-only, supersession-schema
holes, one-line subject identity) → full remediation → focused re-review
**PASS-WITH-MINORS** → both new MINORs and all NOTEs folded in (`a730d73`).
Implementation (including its numbered migration) remains a separately
authorized future program.

## 11. Test commands and results

| Tree | Command | Result |
|---|---|---|
| Integration base `05fdd2c` | `npm test` | 2,187/2,187 (171 files) |
| Integration base `05fdd2c` | `npm run typecheck` | clean |
| A tip `74d0f40` | full gates (see A report) | typecheck/lint clean · unit 2,251/2,251 (174 files) · targeted itest 3/3 (disposable fork) · $0 CLI smokes |
| B tip `c40060e` | full gates (see B report §§6, 8) | typecheck/lint clean · unit 2,232/2,232 (174 files) · targeted itest 13/13 · full itest 117/117 at `95d0a37` (disposable forks) |
| Integration after A (`eee6a91`) | targeted + full unit + typecheck | 98/98 · 2,251/2,251 · clean |
| Integration after B (`b4b0299`) | full unit + typecheck + lint | 2,296/2,296 (177 files) · clean · clean |
| Integration after B (`b4b0299`) | full `npm run test:integration` (disposable Neon fork, paid keys blanked, LLM_DISABLE=1; the map itests manage their own LLM env) | **119/119 (19 files)** |
| C tip `ce3c985` | full gates (see C report) | typecheck/lint clean · unit 2,292/2,292 (179 files) · $0 smokes incl. --dev negative smoke + exit-2 live refusal |
| **Final tree** (after C merge + `ba35082` reconciliation + closing docs) | `git diff --check` + clean worktree | clean |
| **Final tree** | `npm run typecheck` / `npm run lint` | clean / clean (0 errors, 0 warnings) |
| **Final tree** | `npm test` | **2,402 passed / 2,402 (185 files)** — base was 2,187/171 (+215 tests, +14 files) |
| **Final tree** | `npm run build` (dummy never-contacted `DATABASE_URL="postgresql://build:build@localhost:5432/build"`) | PASS (exit 0) |
| **Final tree** | full `npm run test:integration` (disposable Neon fork `br-old-tooth-atwdowrd`, created + deleted; paid keys blanked; LLM_DISABLE=1 with the map itests managing their own env) | **119/119 (19 files)** — includes the map-lease concurrency race, expired takeover, metered-then-discarded, and remap eligibility/resume stress cases |
| **Final tree** | $0 CLI smokes: `--validate-dataset` (17-case map file was 18 pre-merge count note: 18/14/10/14 all OK) · `--estimate` · `--report` · `--execute-live` refusal (exit 2) · funnel report without DATABASE_URL (exit 1, no network) · `model-routing-inspect` | all as designed, zero provider/DB contact |
| **Final tree** | source scans: committed env files = `.env.example` only · zero `results/live-*` artifacts · no secret patterns in the program diff (only the house dummy test DSN) · zero NUL bytes in changed .ts files · maxRetries:0 + reserve/meter ordering + eval isolation scans run inside `npm test` (openai-client.test.ts, isolation.test.ts, map-worker-spend.test.ts, llm-match-guard.test.ts) | clean |

## 12. Adversarial reviews, findings, remediations, verdicts

Every reviewer was a fresh agent with no authoring context, read-only, on
exact base/tip SHAs. Full findings text lives in the per-workstream reports.

| Gate | Reviewer | Initial verdict | Remediation | Re-review verdict |
|---|---|---|---|---|
| A4 | evidence-quality reviewer | PASS-WITH-MINORS (1 MAJOR: funnel conflated lexicon skips with backlog; 2 MINORs: legacy-intraday asOf caveat, citation-link stub asymmetry) | `a787500` + `74d0f40` (pending/notApplicable split incl. per-adapter, stub-excluded citation links, documented caveats) | **PASS** on `74d0f40` (2 residual labeling NOTEs on non-flagship paths) |
| B concurrency/DB | fresh reviewer | FAIL (MAJOR: `--track` remap corrupted `processed`; MAJOR: version-blind checkpoint; MINORs: renew cadence, unfenced-write residual wording, weak itest assertion) | `e364112` (+`c40060e` hygiene) | **PASS-WITH-MINORS** on `e364112` |
| B spend/versioning | fresh reviewer | FAIL (MAJORs: `--track`/processed, NaN budget fail-open, missing route handshake; 6 MINORs) | `e364112` (+`c40060e`) | **PASS-WITH-MINORS** on `e364112` |
| C eval-science | fresh reviewer | PASS-WITH-MINORS (3 MAJORs: heldout gate blind to results; unaligned pairwise populations; identity-relabeling resume — all forward-looking gate-integrity holes; committed artifacts verified honest, arithmetic recomputed exact, gates provably preset) | `0c42880` (completeness/scope/datasetContentHash gates, aligned heldout-only pairwise, resume identity refusal) + `ce3c985` (converged minors) | **PASS-WITH-MINORS** on `0c42880`; converged minors then applied verbatim |
| C paid-call/safety | fresh reviewer | PASS-WITH-MINORS (same completeness MAJOR independently; scan-coverage + env-knob MINORs; zero-contact/caps/retries/containment all proven clean) | same | **PASS-WITH-MINORS** on `0c42880`; converged minors then applied verbatim |
| D design gate | fresh design reviewer | FAIL (4 MAJORs: export-content rules, honor-system append-only, supersession schema holes, subject-identity underspecification) | `ebb644c` + `a730d73` | **PASS-WITH-MINORS** on `ebb644c`; both new MINORs + NOTEs folded in |
| Final safety/operations | (recorded below when returned) | | | |
| Final quality/science | (recorded below when returned) | | | |

The `--track`/processed defect was independently found three times (author
self-review + both B reviewers) before any execution existed — the gate
worked as designed.

## 13. Residual risks and operational prerequisites

(Consolidated at completion. Standing so far:)

- B residuals (documented, accepted): >TTL single-call expiry → bounded
  duplicate billing; ≥TTL-stall chimera window (complete fix = fence column,
  schema change); live capability-guard placement vs mid-drive rollback;
  legacy checkpoint trusted once; `MAP_RUN_REQUEST_CAP=0` misconfig hot-loop;
  `SpendGuard.record()` DB-failure unmetered-call (pre-existing).
- A residuals (labeling NOTEs): config-history docs read as "lexicon skip";
  off-roster theaters' pending glossed as drainable backlog.
- C residuals (documented, accepted; close before the FIRST paid evaluation
  whose verdict will be treated as binding): hand-forged gitignored results
  files remain outside any file-based gate's reach (a forger could equally
  fabricate results); pre-commit local iteration against dev cases is
  inherently unverifiable (standard eval caveat); the `--allow-heldout-rerun`
  escape is operator-deliberate and surfaced by run-provenance rows; gist
  matching stays recall-oriented (location-precision distinctions ride
  mustNotMatch patterns).
- Deployment prerequisites: the remap operator REQUIRES the remap-capable
  route deployed before any execution (the handshake enforces it); lease
  cutover needs no migration and no env (optional `MAP_LEASE_TTL_SEC`);
  recency/funnel need no migration and no env; the eval control plane is
  repository tooling with no runtime surface (a future paid eval needs
  `EVAL_USD_CAP_DAILY` set FIRST, ruling 4 ordering).

## 14. Proposed PR decomposition and deployment order

1. Routing PR #5 (already open, reviewed separately) merges first — the
   integration base assumes it; this branch cannot merge before it.
2. B as one PR (lease + remap): deploying it makes the lease live immediately
   (advisory lock retired — the #77 fix); the remap operator stays unexecuted
   until an operator runs it deliberately (dry-run first, `--execute` +
   finite `--budget`). Highest operational value; deploy first after routing.
3. A as one PR (recency + funnel): the persist-side change is additive JSON
   on both engines; the report script is offline tooling. Deploy second;
   evidence-recency stats begin accruing on the next digest persists.
4. C as one PR (eval control plane): repository-owned tooling with no runtime
   surface; merge order vs A matters only for the recency-probe adapter
   (`ba35082` belongs with whichever of A/C merges second).
5. D's implementation (admin adjudication) is a future separately-authorized
   program from `docs/designs/HUMAN-ADJUDICATION.md` — it owns the next
   numbered migration decision alongside the queued conflict-evaluations
   workstream.

Alternatively the operator may merge the integration branch wholesale (it is
exactly the sum of the three reviewed worktrees + reconciliation + docs);
the decomposition above exists to allow independent revert granularity.
