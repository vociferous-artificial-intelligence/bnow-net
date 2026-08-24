# Conflict snapshot capture — DESIGN ONLY (deferred)

Status: **design, not implementation** (conflict-evaluations Phase 5,
2026-08-17). This document specifies the future application
snapshot-capture/persistence path that MUST exist before any live shadow
soak of `operational_cutoff` / `at_publication` / `finalized` conflict
evaluations. Nothing here is built in this workstream; the shipped contract
is `src/lib/conflicts/snapshot-ref.ts` (the `ConflictSnapshotRefV1` shape,
its validator, and the fail-closed per-kind resolution whose terminal
`population_unproven` refusal this design would eventually lift). Decision
register #5 is binding until then: the three snapshot kinds return
`unavailable`, and only fixtures and labeled retrospectives score.

Implementation is explicitly deferred to the operator-selected integration
phase, with disposable real-Postgres tests and its own review + decision-log
entry. Production is never used for its development.

## 1. Why a capture path (what today's DB cannot prove)

The three snapshot kinds each make a claim about WHAT BNOW HELD AT AN
INSTANT: at the report's declared cutoff, at its publication instant, or at
a designated finalization instant. The live database is last-writer state:
claims are re-extracted under new extractor versions, digests regenerate,
`processed` flips, rows arrive with old event dates after the instant has
passed (the 2026-07-14 audits document the exact lies this produces).
An enum row, a query at scoring time, or a "we probably had it" heuristic
cannot prove a population; only an immutable artifact captured AT the
instant can. Fixture artifacts qualify today because the corpus is frozen
and byte-hashed; live populations do not.

## 2. What gets captured, and when

One capture = one `(conflictId, captureKind, anchor instant)` triple,
produced by a capture job that runs INDEPENDENTLY of scoring:

- `operational_cutoff`: triggered when the reference report's declared
  cutoff is parsed (Phase-2 edition discovery). Because the cutoff is only
  known AFTER the report appears, the artifact is honest only if the
  underlying rows carry ingest timestamps that prove membership at the
  cutoff instant; the capture records, per claim, the `earliestIngestAt`
  evidence used, and REFUSES (records `capture_failed`) when any admitted
  row lacks a provable ingest instant. No backdating: a row first ingested
  after the cutoff is excluded even if its claim date precedes it.
- `at_publication`: same mechanism anchored at the report's publication
  instant.
- `finalized`: anchored at an operator-designated finalization instant per
  edition (only meaningful once the edition ladder designates finals in
  production).

Captured content per artifact (JSON, one file/row per capture):

1. the resolved report/edition identity (series, editionKey, reportDate,
   raw + normalized anchors, scopeVersion);
2. the CORPUS-RECALL candidate set as assembled at the instant: full
   `CandidateClaim` projections (the P3 allowlist fields — ids, theater,
   track, text, hedge, claimDate, doc metadata incl. ingest instants,
   engine, extractor-version flag, published/stub flags);
3. the PUBLISHED-RETENTION candidate set, same projection, plus the digest
   identity (theater, track, date, digest row id) proving genuine
   appearance;
4. the eligibility verdicts the engine produced from those candidates
   (included/excluded + bounded reasons) — recorded so a later engine
   change cannot silently reinterpret the capture;
5. every policy/version stamp `ConflictSnapshotRefV1.policyVersions`
   requires, plus the selection limits in force;
6. capture-job provenance: job id, code version (git SHA), capturedAt.

The artifact deliberately CONTAINS claim text (it is an input snapshot, like
`raw_documents`): it is internal-only, never a user-facing surface, and
standing ruling 1 still applies to what SCORING may emit — results keep
carrying ids/metadata only. ISW prose is NEVER captured (only unit ids and
the report identity; declared units enter matching transiently exactly as
today).

## 3. Immutability mechanism and hash chain

- **Write-once storage.** Artifacts are content-addressed: the file/row key
  embeds `sha256(artifact bytes)`; the store refuses overwrites of an
  existing key. Post-capture edits are structurally impossible without
  changing the address (which orphans every ref).
- **The ref binds bytes.** `ConflictSnapshotRefV1.artifact.contentHash` is
  the sha256 over the exact bytes; `resolveConflictSnapshot` already
  re-hashes on every resolution, so tampering or bit-rot fails closed as
  `artifact_hash_mismatch`.
- **Hash chain (tamper-evident sequence).** Per `(conflictId, captureKind)`
  stream, each capture records `prevCaptureHash` — the contentHash of the
  previous capture in the stream (genesis: the literal
  `conflict-snapshot-genesis-v1`). The chain head is recorded in a
  `provider_state`-style row updated in the same transaction as the
  capture. A deleted or reordered capture breaks the chain; a chain audit
  (recompute from genesis) is part of the soak checklist.
- **Population proof.** A ref "proves its population" when: the artifact
  loads; its hash matches; its embedded population claim-id sets equal the
  ref's `populations`; its policy versions equal the ref's; and the chain
  containing it verifies. The future implementation replaces the
  `population_unproven` terminal refusal with exactly this check — nothing
  weaker — behind its own reviewed change.

## 4. Where it would persist

- **Blob artifacts:** repository-external durable storage. Default design:
  a dedicated Postgres table `conflict_snapshots` (Neon) holding the JSON
  artifact bytes (they are bounded: candidate sets are already capped by
  the P3 selection ceilings) with columns `(id, conflict_id, capture_kind,
  anchor_at, content_hash UNIQUE, prev_capture_hash, created_at, bytes)`.
  A additive numbered migration (ruling 5) creates it; no existing table
  changes. Disk/object storage is a fallback if artifact size ever argues
  for it; the contract's `locator` field is deliberately store-agnostic.
- **Refs:** wherever a scored result persists (the eval results files
  today; any future application table), the ref rides inside the result
  payload — `ConflictScoredResultV1.snapshot.ref` — already validated by
  the persistence gate.
- **Nothing in this design touches `validation_runs`, the public
  scoreboard, or any cron** until the operator-selected integration phase
  wires it, per the Phase-5 boundary.

## 5. Operator gates (all must pass BEFORE a live shadow soak)

1. **Decision-log entry** authorizing the capture path, naming the store,
   cadence, and retention.
2. **Migration review**: the additive `conflict_snapshots` migration
   applied to a disposable Neon fork first; `npm run test:integration`
   extended with real-Postgres capture/replay/chain-audit tests; never
   developed against production.
3. **Spend/robots neutrality proof**: capture jobs make ZERO paid provider
   calls and ZERO new external fetches (they read only rows BNOW already
   holds); a source-scan test pins it.
4. **Register-#5 supersession**: a new decision-register entry recording
   that populations are now provable, which kinds unlock, and the exact
   proof predicate (section 3) — until that entry exists,
   `resolveConflictSnapshot` keeps refusing `population_unproven`.
5. **Retention/legal review**: artifacts contain claim text and doc
   metadata → they inherit the internal-data handling rules (no user-facing
   rendering, no ISW prose ever captured); a retention window is declared
   before the first capture.
6. **Soak protocol**: shadow captures run ≥1 week; the chain audit, hash
   re-verification, and a capture-vs-live-assembly comparison report go to
   the operator before any snapshot-kind evaluation is scored from them.

## 6. Out of scope here

Building any of the above; wiring capture to crons; changing
`INITIAL_EVALUATION_KIND_AVAILABILITY`; scoring any snapshot kind; touching
production. This document plus `snapshot-ref.ts` is the whole Phase-5
snapshot deliverable.
