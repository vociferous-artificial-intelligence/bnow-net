# Quality-foundation program — integration report (2026-08-17)

> DRAFT IN PROGRESS — final sections (Worktree C, final gates, final
> cross-workstream reviews, verdict) land before program completion. Nothing
> in this program was deployed; see §1.

## 1. Executive verdict and what is NOT activated

(Verdict recorded at completion.)

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
| Worktree C tip | (pending) | |
| Worktree C merge into integration | (pending) | |
| **Final integration tip** | (pending) | |

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

Merge order (as mandated): A (`eee6a91`) → B (`b4b0299`) → C (pending). After
each merge the receiving branch's targeted tests and the full unit suite were
re-run (A: 98/98 targeted + 2,251 full; B: 2,296 full + typecheck + lint).
No merge had conflicts (the workstreams share no files).

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

**C — analysis eval control plane:** (pending)

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

(Pending Worktree C.)

## 10. Optional adjudication workstream (D)

(Decision recorded at completion: implemented, or reviewed design only.)

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

## 12. Adversarial reviews, findings, remediations, verdicts

Every reviewer was a fresh agent with no authoring context, read-only, on
exact base/tip SHAs. Full findings text lives in the per-workstream reports.

| Gate | Reviewer | Initial verdict | Remediation | Re-review verdict |
|---|---|---|---|---|
| A4 | evidence-quality reviewer | PASS-WITH-MINORS (1 MAJOR: funnel conflated lexicon skips with backlog; 2 MINORs: legacy-intraday asOf caveat, citation-link stub asymmetry) | `a787500` + `74d0f40` (pending/notApplicable split incl. per-adapter, stub-excluded citation links, documented caveats) | **PASS** on `74d0f40` (2 residual labeling NOTEs on non-flagship paths) |
| B concurrency/DB | fresh reviewer | FAIL (MAJOR: `--track` remap corrupted `processed`; MAJOR: version-blind checkpoint; MINORs: renew cadence, unfenced-write residual wording, weak itest assertion) | `e364112` (+`c40060e` hygiene) | **PASS-WITH-MINORS** on `e364112` |
| B spend/versioning | fresh reviewer | FAIL (MAJORs: `--track`/processed, NaN budget fail-open, missing route handshake; 6 MINORs) | `e364112` (+`c40060e`) | **PASS-WITH-MINORS** on `e364112` |
| C eval-science | (pending) | | | |
| C paid-call/safety | (pending) | | | |
| Final safety/operations | (pending) | | | |
| Final quality/science | (pending) | | | |

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
- Deployment prerequisites: the remap operator REQUIRES the remap-capable
  route deployed before any execution (the handshake enforces it); lease
  cutover needs no migration and no env (optional `MAP_LEASE_TTL_SEC`);
  recency/funnel need no migration and no env.

## 14. Proposed PR decomposition and deployment order

(Finalized at completion. Working proposal:)

1. Routing PR #5 (already open, reviewed separately) merges first — the
   integration base assumes it.
2. B as one PR (lease + remap): deploy makes the lease live immediately
   (advisory lock retired); the remap operator stays unexecuted until an
   operator runs it deliberately.
3. A as one PR (recency + funnel): persist-side change is additive JSON;
   report script is offline tooling.
4. C as one PR (eval control plane): repository-owned tooling; no runtime
   surface.
