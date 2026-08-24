# Evidence-quality observability — recency contract + conversion funnel (2026-08-17)

Worktree A of the quality-foundation program, branch
`codex/evidence-quality-observability-20260817` on integration base `05fdd2c`.
Two deliverables, both **INTERNAL and UNCALIBRATED operator observability**: no
public headline score, no composite score, and no public target is created or
proposed by this work. Nothing here changes what a digest publishes — only what
its `structured.stats` records and what a read-only report can show.

## 1. What shipped

| Piece | Where |
|---|---|
| Pure evidence-recency calculator (v1 contract) | `src/lib/analysis/evidence-recency.ts` |
| Persist-boundary integration (both engines) | `src/lib/analysis/digest-persist.ts` (`asOf` now required in `PersistDigestArgs`) |
| Honest per-engine `asOf` | `src/lib/analysis/digest.ts` (legacy), `src/lib/analysis/synthesize.ts` (mapreduce day + rolling) |
| Vote-stage funnel counters (additive) | `src/lib/analysis/synthesize.ts` (`voteGidCounters` → `stats.reduce.gidsCitedAnyVote` / `gidsMajority`) |
| Conversion funnel (SQL builders + pure aggregation) | `src/lib/analysis/quality-funnel.ts` |
| Read-only CLI report | `scripts/quality-funnel-report.ts` (`--theater --track --from --to --json`) |
| Tests | `evidence-recency.test.ts` (29), `quality-funnel.test.ts` (19), `digest-asof.test.ts` (3), additions to `digest-persist.test.ts` (+5+1), `synthesize.test.ts` (+3), `src/integration/reduce.itest.ts` (+1, updated for `asOf`) |

## 2. Evidence-recency contract (persisted as `structured.stats.evidenceRecency`)

Computed inside `persistDigest()` — the ONE shared publication boundary — on the
exact **post-`guardPublishedEvents`** event/claim shape, **after** the
empty/thin overwrite verdict allows the write (a refused persist stores nothing
and computes nothing; test-pinned). Both engines flow through `persistDigest`,
so both carry it automatically. Merged additively next to
`stats.publicationGuard`; no migration; no existing `stats` key changes
(key-set pinned by tests in `digest-persist.test.ts` and `digest-asof.test.ts`).

### 2.1 Time inputs

- `asOf` is a REQUIRED caller argument — the engine's effective analysis cutoff,
  never a persist-time wall clock:
  - legacy `generateDigest` (fixed UTC-day gather `[date, date+1)`):
    `asOf = new Date(Date.parse(date + "T00:00:00Z") + 86_400_000).toISOString()`
    — the exclusive end of the gather window;
  - mapreduce **day** mode: the window-end midnight `${to}T00:00:00.000Z` — the
    same instant the engine already uses as its ranking clock (`nowMs`);
  - mapreduce **rolling** mode: `new Date(runNowMs).toISOString()` — the
    existing injected/run clock the 24h window ends at.
  In `synthesize.ts` both modes reduce to `new Date(nowMs).toISOString()`
  because `nowMs` is already exactly that instant.
- `generatedAt` is the ONLY wall-clock read, taken inside `persistDigest` at
  persist time. It is a regeneration diagnostic, never an age input.
- `EVIDENCE_CLOCK_SKEW_MS = 5 * 60_000` (exported constant) is used for every
  future-timestamp and lag comparison; there is no ad hoc skew arithmetic.
- All timestamps parse through `toInstant()` (`src/lib/time/day-boundary.ts`)
  semantics — Date instance or string, null on invalid; timestamps are never
  compared as strings (`+03:00` offsets test-pinned).

### 2.2 Per-document evidence time

For each DISTINCT cited doc (stub docs excluded at the query level, ruling 3):

1. `published_at` valid AND `<= asOf + skew` → evidence time = `published_at`
   (`publishedTimestampUsed`). A within-skew future value clamps its age to 0
   and is NOT an anomaly.
2. `published_at` valid but `> asOf + skew` → anomaly
   (`futurePublishedTimestampCount`), then fall back to `fetched_at` under the
   same `<= asOf + skew` rule (`fetchedTimestampFallbackUsed`).
3. `published_at` absent/invalid → same `fetched_at` fallback.
4. No usable timestamp (absent, invalid, or beyond the skew-tolerated cutoff)
   → `missingTimestampCount`; the doc stays OUT of every age denominator.

Ages are `max(0, asOf - evidenceTime)` — never negative.

### 2.3 Field-by-field definitions and denominators

| Field | Unit / numerator | Denominator | Null when |
|---|---|---|---|
| `version` | literal `1` | — | never |
| `asOf` | ISO instant (normalized via `toISOString()`) | — | never |
| `generatedAt` | ISO instant, persist-time wall clock | — | never |
| `generationLagHours` | `max(0, generatedAt - asOf)` in hours, 2 decimals | — | never (0 when clamped) |
| `documentCount` | DISTINCT non-stub raw docs cited by post-guard claims | — | never |
| `claimCount` | post-guard persisted claims | — | never |
| `timestampedDocumentCount` | distinct docs with a usable evidence time at asOf | — | never |
| `timestampCoveragePct` | `timestampedDocumentCount × 100` | `documentCount` | `documentCount = 0` |
| `medianEvidenceAgeHours` | p50 of ages over distinct timestamped docs | timestamped docs | none timestamped |
| `p90EvidenceAgeHours` | p90 of the same population | timestamped docs | none timestamped |
| `evidenceWithin24hPct` | docs with age `<= 24h` EXACTLY × 100 | timestamped docs | none timestamped |
| `staleClaimsOver48hPct` | claims whose NEWEST usable evidence time is `> 48h` STRICTLY older than asOf × 100 (exactly 48.0h is NOT stale) | claims with ≥1 usable evidence timestamp | no such claim |
| `unknownAgeClaimPct` | claims with NO usable evidence timestamp × 100 | `claimCount` | never (0 when `claimCount = 0`) |
| `publishedTimestampUsed` | distinct docs whose evidence time came from `published_at` | — | never |
| `fetchedTimestampFallbackUsed` | distinct docs that fell back to `fetched_at` | — | never |
| `missingTimestampCount` | distinct docs with no usable timestamp at asOf | — | never |
| `futurePublishedTimestampCount` | distinct docs whose `published_at` exceeded `asOf + skew` | — | never |
| `medianIngestionLagHours` | p50 of `fetched_at - published_at` (hours) over docs where BOTH parse and lag `>= -skew`; lag in `[-skew, 0)` clamps to 0 and counts | that lag population | population empty |
| `p90IngestionLagHours` | p90 of the same population | same | population empty |
| `invalidIngestionLagCount` | docs where both timestamps parse but lag `< -skew` (excluded from lag stats) | — | never |

Ingestion lag does NOT depend on asOf (test-pinned). Every median/p90 uses one
exported `percentile()` — linear interpolation between closest ranks
(`rank = p/100 × (n-1)` over the ascending sort) — tested on empty, single,
odd, even, duplicate-heavy, and p0/p100 boundary populations. Derived hours
and percentages are rounded to 2 decimals.

A claim's staleness uses the newest usable evidence time among ITS docs; a
claim citing only unusable-timestamp docs is UNKNOWN, never stale. Docs shared
by multiple claims count once in the doc population while both claims count.

### 2.4 Exact persisted JSON shape (worked example)

Digest for `ru 2026-07-11 military` (legacy engine, so
`asOf = 2026-07-12T00:00:00.000Z`), one post-guard claim citing one doc
published `2026-07-11T09:00:00Z`, fetched `2026-07-11T10:00:00Z`, persisted at
`2026-07-12T00:20:00Z`:

```json
"evidenceRecency": {
  "version": 1,
  "asOf": "2026-07-12T00:00:00.000Z",
  "generatedAt": "2026-07-12T00:20:00.000Z",
  "generationLagHours": 0.33,
  "documentCount": 1,
  "claimCount": 1,
  "timestampedDocumentCount": 1,
  "timestampCoveragePct": 100,
  "medianEvidenceAgeHours": 15,
  "p90EvidenceAgeHours": 15,
  "evidenceWithin24hPct": 100,
  "staleClaimsOver48hPct": 0,
  "unknownAgeClaimPct": 0,
  "publishedTimestampUsed": 1,
  "fetchedTimestampFallbackUsed": 0,
  "missingTimestampCount": 0,
  "futurePublishedTimestampCount": 0,
  "medianIngestionLagHours": 1,
  "p90IngestionLagHours": 1,
  "invalidIngestionLagCount": 0
}
```

Worked edge examples (all test-pinned): evidence exactly 24.0h old counts as
within-24h; a claim whose newest evidence is exactly 48.0h old is NOT stale
and at 48h + 1ms IS; a `published_at` 4 minutes past asOf clamps to age 0
without an anomaly; one 6 minutes past asOf counts
`futurePublishedTimestampCount` and falls back to `fetched_at`; a
regeneration of the same day-window inputs at a later wall clock reproduces
every age field byte-identically — only `generatedAt`/`generationLagHours`
move.

### 2.5 Integration mechanics

After the overwrite verdict allows the write, `persistDigest` collects the
distinct docIds from the guarded events' claims and runs ONE indexed read:

```sql
SELECT id, published_at, fetched_at FROM raw_documents
WHERE id = ANY($1) AND content NOT LIKE $2   -- $2 = '[STUB FIXTURE]%'
```

then feeds the pure calculator and merges the result additively. **Design
choice (deviation-grade, recorded):** the read + computation are FAIL-OPEN —
a failure warns once and persists the digest without the key. Rationale: this
is observability; it must never block a publishable digest (the same posture
as the embedding hook and map-health's "the monitor never breaks the job it
measures"). A dropped guard claim's solely-cited doc provably leaves the
population (test-pinned); a refused persist provably issues no raw_documents
read (test-pinned).

## 3. Conversion funnel (`quality-funnel.ts` + `scripts/quality-funnel-report.ts`)

`funnelVersion: 1`, reported per (theater, track, date), current extractor
versions only (`currentVersion()` from `map-versions.ts` — the exact version
string is included in the report). Architecture: parameterized SQL builders
return ROW-LEVEL facts; every aggregation is pure TS over those rows behind an
injected `query(sql, params)` (the `map-health.ts` QueryFn pattern). Superseded
versions and dedup mirrors flow IN as rows and are excluded by the aggregator —
the non-inflation is proven end-to-end in `quality-funnel.test.ts` with fixture
rows that include a mirror carrying current-version map rows and superseded
rows on canonical docs.

### 3.1 Stages and units

Corpus side (day bucket = `COALESCE(published_at, fetched_at)::date`, the map
worker's own selection semantics; `>= MAP_EPOCH`; non-stub;
`length(content) >= 40`; one theater):

1. `rawEligibleDocs` — DOCUMENTS, with per-adapter / per-platform (sources
   join) / per-language splits.
2. `mirrorDocs` — DOCUMENTS with a doc_dedup row (never mapped; content lives
   on canonicals). `mirrorMethods` uses the bounded enum `exact|minhash`; any
   other label lands in `unknown` with the raw string preserved in
   `unknownReasons`.
3. `mapDispositions` — DOCUMENTS with a doc_map_state row at the current
   (track, version), split `docsWithClaims` (claim_count > 0) vs `docsNoClaims`.
4. `mapClaims` — doc_claims ROWS at the current (track, version).
   `supersededDispositions` / `supersededClaims` are the EXCLUDED non-current
   counts; a day whose only coverage is superseded emits the reconciliation
   warning "…version bump awaiting remap (OPEN-TASKS #33), not an ingestion
   gap" and sets `supersededOnly: true`. Anomalous doc_map_state rows on
   MIRROR docs are excluded and warned about.
   **Undispositioned split (A4-review F1):** canonical docs with NO
   doc_map_state row at ANY version for this track split on
   `raw_documents.processed` — `pendingDocs` (processed=false; genuine
   unmapped backlog the cron still drains) vs `notApplicableDocs`
   (processed=true; the worker's per-track lexicon gate, which runs AFTER the
   eligibility predicate, never matched — these docs will NEVER map under
   this track and must not read as extraction loss). A processed doc whose
   only rows for this track are superseded stays in `supersededDispositions`
   (a remap target, not a skip). Both counts also appear per adapter in
   `AdapterConversion`, where the misreading would bite hardest
   (`--theater ir --track military`: an RSS "eligible → withClaims" gap is
   now separable into lexicon skips vs real loss).

Digest side (from the `digests` row's `structured.stats` plus relational
counts):

5. mapreduce digests: `stats.reduce` passthrough — window `{from,to,mode}`,
   `claims` (doc_claims fed), `groupsTotal`/`groupsFed` (GROUPS),
   votes/votesRequested/failedVotes, `survivingEvents` (merged EVENTS),
   `droppedGidRefs`, `docsAnalyzed` (distinct DOCUMENTS in fed groups, from
   `stats.docsAnalyzed`), plus the NEW `gidsCitedAnyVote`/`gidsMajority`
   (GROUPS; §3.3).
6. `publicationGuard` passthrough (attributedClaims, droppedClaims,
   droppedEvents, retitledEvents, replacedSummaries).
7. Persisted truth from the relational tables: `claims` rows where digest_id,
   distinct EVENTS over their event_id, claim_sources LINKS, distinct cited
   DOCUMENTS, per-adapter/platform link shares and conversion rates
   (`links per adapter / total links`; `cited docs per adapter / eligible docs
   per adapter`, measured against the REPORT-DATE corpus and labeled as such).
8. `evidenceRecency` passthrough when present.
9. Dispatch identity: `stats.reduce.dispatch` (mapreduce) / `stats.llmDispatch`
   (legacy) VERBATIM; absent → the literal `"pre-hardening baseline"` (routing
   report §12.6: pre-hardening rows could only have dispatched gpt-4o-mini, no
   effort).
10. Engine labeling: only `stats.engine === "mapreduce"` reports the full
    funnel; anything else is `engine: "legacy"` and reports ONLY its own honest
    stages (docsRaw, trackRows, docsAnalyzed, droppedClaims, persisted counts,
    citation shares) — never coerced into map stages (`reduce: null`).

### 3.2 Invariants checked (violations emit reconciliation WARNINGS, never drops)

- `docsWithClaims <= mapDispositions`; `mapClaims >= docsWithClaims`;
  doc_map_state claim declarations vs actual doc_claims rows.
- `groupsFed <= groupsTotal`;
  `gidsMajority <= gidsCitedAnyVote <= groupsFed` (when present).
- `evidenceRecency.claimCount` vs relational claims count; persisted events vs
  `survivingEvents` (persisted can only shrink through finalize + guard).
- For a MAPREDUCE digest, distinct cited docs must fall inside the digest's
  OWN `stats.reduce.window` `[from, to)` — NOT the single report day, because
  the rolling window spans `[date-1, date+1)`.
- No false stage inequalities are asserted: one doc backs many claims, one
  group feeds many events; fan-out is documented in the module header and the
  report's "how to read this" block.
- Bounded label enums (`doc_dedup.method`, `reduce.window.mode`): unrecognized
  labels land in `unknown`/warnings with the raw string preserved in
  `unknownReasons`, never dropped.

### 3.3 Narrow additive instrumentation in `synthesize.ts`

The vote stage cannot be reconstructed from persisted data, so two counters
were added to `structured.stats.reduce` (purely additive; the pre-existing
key set is pinned byte-identical by `digest-asof.test.ts`):

- `gidsCitedAnyVote` — distinct fed gids cited by at least one parsed vote
  (post-`parseVote`, so already restricted to each vote's fed set);
- `gidsMajority` — distinct gids surviving into any merged event's
  `majorityGids`.

Computed by the exported pure `voteGidCounters()` (unit-tested, including the
zero-survivor case).

### 3.4 The IR X-dependency question

`scripts/quality-funnel-report.ts --theater ir --from <day>` shows, per
adapter: eligible docs → docs with map claims (+ claim counts) → cited docs /
links, with link share and doc conversion. RSS/Telegram fall-out is therefore
visible at extraction yield and at final citation attachment; the reduce stage
between them (`groupsFed`, vote survival) is GLOBAL-only because fed-group
membership per adapter is not persisted anywhere (see §5 premise notes). The
human output opens with a "how to read this" block stating exactly this plus
the fan-out and rolling-window caveats.

CLI contract: `--theater` (required), `--from` (required), `--to` (defaults to
`--from`), `--track` (default `military`, validated against `TRACKS`),
`--json`. Read-only SELECTs only (test-pinned: every SQL the loader issues
starts with SELECT); loads env via `import "./env"`; with no `DATABASE_URL` it
prints a clear error and exits 1 before any client is constructed — verified
with zero network calls (§6 gate 7).

## 4. Data caveats

- `published_at` is the SOURCE'S OWN claim about publication time — spoofable
  and occasionally wrong; the future-anomaly counter plus the `fetched_at`
  fallback accounting exist precisely to keep that visible rather than
  laundered.
- `fetched_at` fallback measures OUR ingestion time, not publication: on
  fallback-heavy days `medianEvidenceAgeHours` reads younger than reality if
  ingestion lags publication. Read it together with `timestampCoveragePct`,
  `publishedTimestampUsed` vs `fetchedTimestampFallbackUsed`.
- Rolling-window digests draw evidence from `[date-1, date+1)`: their cited
  docs legitimately span two UTC days, so funnel doc-populations reconcile
  against `stats.reduce.window`, and per-adapter `docConversionPct` (measured
  against the single report-date corpus) can be misleading in isolation —
  cited-only adapters report `null`, not a fabricated rate.
- Superseded extractor versions are excluded from every current stage;
  "0 mapped" on a version-bumped day is flagged as superseded-only, never a
  gap. Historical digests persisted before this release carry no
  `evidenceRecency` (absence means "pre-contract", not zero) and no dispatch
  identity ("pre-hardening baseline").
- `digests.created_at` is last-writer-wins (TIME-MODEL); `generationLagHours`
  is the honest late-regeneration diagnostic because it compares against the
  engine's own asOf.
- Stub documents are excluded at the query level in the recency read, the
  funnel corpus, AND the funnel citation-link read (ruling 3; the last added
  by A4-review F3 for population symmetry).
- **Legacy intraday asOf (A4-review F2, documented convention — deliberately
  unchanged):** a legacy digest anchors asOf to its fixed UTC-window END even
  when regenerated mid-day (gulf intraday runs), so evidence ages are INFLATED
  relative to the run instant by the remaining window hours — freshness reads
  worse than at-run-time reality — and `generationLagHours` clamps to 0 until
  the window closes. This keeps the metric deterministic and
  regeneration-stable, but it means comparing a mid-day legacy digest's
  `evidenceWithin24hPct` against a rolling mapreduce digest's is
  apples-to-oranges; the report script's how-to-read block says so.

## 5. Premises the code corrected / deviations from spec

1. **Mapreduce day-mode asOf**: the spec's `${to}T00:00:00.000Z` and the
   engine's existing ranking clock are the same instant; implemented as
   `new Date(nowMs).toISOString()` so day and rolling modes share one honest
   line (no drift possible between ranking clock and asOf).
2. **Fail-open recency computation** (design choice, §2.5): the spec did not
   state failure behavior; observability never blocks publication here.
3. **Per-adapter "fed-group selection" stage**: not reconstructible — neither
   `structured.stats` nor any table persists fed-group membership per adapter.
   The funnel brackets it (map yield per adapter vs final citation per
   adapter) with the global reduce counters between; recorded in the report
   script's "how to read this".
4. **`aggregateCorpus` counts superseded dispositions when the track is
   unconfigured** (`version = null`): nothing can be "current", so every
   disposition is reported as excluded, plus an explicit "track not
   configured" warning.
5. The base's stated 2,187 tests / 171 files matched exactly; after this work
   the suite is 2,246 / 174 (+59 tests, +3 files; no existing assertion
   weakened or skipped).
6. `package-lock.json` briefly showed macOS npm churn (optional-dependency
   `libc` fields) from the pre-run `npm install`; later npm runs restored it
   and it never entered any commit — the tree is clean.

## 6. Gates (all run in the worktree at the final tree)

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | whitespace | `git diff --check` | clean |
| 2 | targeted tests | `npx vitest run src/lib/analysis/evidence-recency.test.ts src/lib/analysis/quality-funnel.test.ts src/lib/analysis/digest-persist.test.ts src/lib/analysis/digest-asof.test.ts src/lib/analysis/synthesize.test.ts src/lib/analysis/engine.test.ts` | all pass (29 + 19 + 16 + 3 + 26 + 7) |
| 3 | typecheck | `npm run typecheck` | clean |
| 4 | lint | `npm run lint` | clean (0 problems) |
| 5 | full unit suite | `npm test` | **2,246 passed / 2,246 (174 files)**; base was 2,187/171 — every pre-existing test still green |
| 6 | integration | `NEON_API_KEY=… NEON_PROJECT_ID=… DATABASE_URL=… OPENAI_API_KEY= X_API_KEY= OPENSANCTIONS_API_KEY= LLM_DISABLE=1 npm run test:integration -- src/integration/reduce.itest.ts` (disposable Neon branch `br-rapid-heart-at9884o8`, created + deleted by the harness) | **3 passed / 3** incl. the new real-Postgres `evidenceRecency` v1-shape assertion |
| 7 | script smoke, zero provider contact | `env -u DATABASE_URL npx tsx scripts/quality-funnel-report.ts --theater ir --from 2026-08-16` | clean error ("DATABASE_URL is not set…"), exit 1, zero network calls; usage/track-validation paths also exit 1 cleanly; aggregation unit-tested against fixtures in `quality-funnel.test.ts` |

Zero paid provider calls, zero production writes, no migration, no env change,
no deploy, no push — worktree commits only.

## 7. Rollout recommendation

Ship as-is on the integration branch; nothing needs an env or a migration.
Both engines start stamping `evidenceRecency` on their NEXT persist after
deploy; historical rows stay absent (read absence as pre-contract). Suggested
operator soak: after 48h, run
`npx tsx scripts/quality-funnel-report.ts --theater ir --from <yesterday>` and
compare RSS/Telegram vs X map-yield and citation shares — that is the
IR X-dependency baseline this work exists to make visible. Watch
`timestampCoveragePct` and `fetchedTimestampFallbackUsed` first; if fallback
dominates a theater, the recency medians for it describe ingestion, not
publication. Do NOT surface any of these numbers in user-facing UI or derive a
headline/composite score from them without a separate product decision and a
decision-log entry — this contract is internal and uncalibrated by design.

## 8. Review remediation (A4 adversarial review, PASS-WITH-MINORS)

The fresh A4 review returned one MAJOR + two MINORs; all remediated on this
branch in the same worktree.

- **F1 (MAJOR, FIXED) — funnel conflated lexicon skips with unmapped
  backlog.** The worker's per-track lexicon gate (`applicableTracks`) runs
  AFTER the selection predicate, so a lexicon-failing doc ends
  `processed=true` with no doc_map_state row and previously read as
  extraction loss. Fix: `eligibleDocsSql` now selects `rd.processed`;
  un-dispositioned canonical docs (no doc_map_state row at ANY version for
  the track) split into `pendingDocs` (processed=false, genuine backlog) vs
  `notApplicableDocs` (processed=true, lexicon skip — never maps under this
  track), surfaced at corpus level AND per adapter in `AdapterConversion`;
  a processed doc with only superseded rows stays in `supersededDispositions`
  (remap target). §3.1 updated; the report script's how-to-read block and
  both output lines explain the split. Tests: 5 new/extended cases in
  `quality-funnel.test.ts`, including the mutation direction (one
  processed=false + one processed=true stateless doc must land 1/1 — an
  implementation ignoring `processed` fails both assertions), the
  superseded-only remap-target case, mirror exclusion from both buckets, the
  per-adapter split, and end-to-end through the loader with driver-realistic
  rows.
- **F2 (MINOR, ADJUDICATED — documented, anchor unchanged):** the legacy
  intraday asOf caveat is now recorded in §4 (ages inflated by the remaining
  window hours at a mid-day regeneration; `generationLagHours` clamps to 0)
  and in the report script's how-to-read block (legacy vs rolling
  `evidenceWithin24hPct` is apples-to-oranges). The window-END anchor stays:
  determinism and regeneration stability are the contract.
- **F3 (MINOR, FIXED):** `citationLinksSql` now carries the same stub
  exclusion as `eligibleDocsSql` and the persist-time recency read
  (`AND rd.content NOT LIKE $2`, STUB_CONTENT_PREFIX), test-pinned.
- **Notes:** the stale §5 package-lock wording corrected (tree clean, never
  committed). The unreachable `docsWithClaims > mapDispositions` warning is
  KEPT as deliberate dead defense with an explaining comment — it guards the
  spec'd invariant against a future refactor of the disposition loop.

Post-remediation gates: `git diff --check` clean · targeted vitest
(quality-funnel 24, digest-persist 16, evidence-recency 29, digest-asof 3,
synthesize 26, engine 7 — 105/105) · typecheck clean · lint clean ·
full `npm test` **2,251 passed / 2,251 (174 files)**. The integration gate was
not re-run: `reduce.itest.ts` covers `persistDigest`, which this remediation
does not touch (funnel/report/docs only).

---

**Landing correction (2026-08-24).** The "will NEVER map under this track" /
"never maps under this track" phrasing above describes the pre-landing wording.
FUNNEL-A12-3 (final-audit register) corrected every code/label site at landing:
`processed=true` under a lexicon skip means the hourly cron will not revisit the
document; a lexicon change plus a remap pass (OPEN-TASKS #33) could still map
it. The funnel report also now prints the map roster it consulted with an env
provenance caveat (A1 landing review note). See
`docs/reviews/QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md`.
