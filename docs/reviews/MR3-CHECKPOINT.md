# MR Sprint 3 — session checkpoint (living file; overwrite freely)

**Purpose:** if this session dies, a fresh session reads THIS FILE FIRST and resumes
from "Next step" — do not restart completed tasks. Sprint spec: the MR3 prompt
(reduce over doc_claims → A/B vs legacy → cutover). Budget ≤ $12 LLM, env-capped.

## Status

- **Current task:** TASK 1 (deterministic reduce core)
- **Tasks done:** TASK 0 ✅ (2026-07-09 ~21:00 UTC) — 3 channel pins added, holdout
  removed, 651 docs retagged ru→ir, deployed, catch-up map run drained (620 selected,
  41 claims, $0.0041, 0 integrity violations, second dry run selected=0), AGENTS
  ruling 11 corrected + log entry, OPEN-TASKS #29 closed / #37 added.
- **Neon branch:** none created yet
- **Env flags set this sprint:** none yet (REDUCE_USD_CAP_DAILY still to set in
  Vercel BEFORE the TASK 2 deploy)
- **LLM spend so far this sprint:** ~$0.005

## Next step (resume here)

TASK 1: `src/lib/analysis/reduce.ts` deterministic core (cluster doc_claims,
  union docIds, independence-aware promotion, confidence, quote_verified stamp,
  entity canonicalization via src/lib/entities/canonicalize.ts, version filtering
  through ONE accessor module with a test). Pure functions + vitest. Cluster signal:
  minhash/token similarity over text_en + entity overlap + claim_date proximity +
  event_hint; tune threshold on labelled pairs built from existing prod claims
  (claims sharing a claim_sources doc = likely-same-event anchors). Also: in-doc
  near-dupe collapse (don't require distinct docs); mirrors (doc_dedup) do NOT count
  as independence; promotion requires domain diversity; single-doc confirmed passes
  through.

## Then
- TASK 2: synthesis (K=3 vote, pre-rank groups, REDUCE_USD_CAP_DAILY fail-closed,
  provider=openai_reduce, persist via existing invariant path, thin-regen guard
  closes #32 on both engines).
- TASK 3: A/B on disposable Neon branch, last 10 days × ru/ua/ir military, K=3 both
  arms, majority matcher. Resumable driver keyed (day, theater, arm, k); append-only
  results file committed every few samples; branch id recorded HERE before any batch.
- TASK 4 (only if gate passes + runway comfortable): DIGEST_ENGINE flag, cadence
  04:00/10:00/19:30 UTC synthesis + hourly map + 02:00 D+1 finalization; validate
  scores the D+1 digest.
- TASK 5: docs/scoreboard updates; close #18/#28.

## Key facts a fresh session needs (verified this session)

- Map worker: src/lib/analysis/map-worker.ts (runMapCycle; advisory lock 0x6d617031;
  MAP_EPOCH 2026-07-04; processed=false probe; anti-join doc_map_state on
  mapExtractorVersion(track, theater) from map-prompts.ts).
- doc_claims key: (raw_document_id, track, extractor_version, ordinal); doc_dedup:
  mirror→canonical, same-theater ±1 day; doc_map_state PK (doc, track, version).
- Version accessor to build in TASK 1 wraps mapExtractorVersion (OPEN-TASKS #35).
- Entity canonicalization: src/lib/entities/canonicalize.ts (junkReason,
  canonicalKey, planCleanup) — reduce must route map entities through it.
- SpendGuard: src/lib/usage/llm-guard.ts — add REDUCE_USD_CAP_DAILY +
  reduceGuardFromEnv() mirroring mapGuardFromEnv(); provider row `openai_reduce`;
  fail-closed in prod when env unset. SET THE ENV IN ALL VERCEL ENVS BEFORE DEPLOY.
- Batched per-item LLM calls MUST pin minItems/maxItems = batch size (grammar-level;
  see mapResponseSchema(docCount) in map-prompts.ts).
- Legacy digest: src/lib/analysis/digest.ts generateDigest(iso2, date, track);
  empty-extraction guard at L194-217 (threshold 0 — TASK 2.5 raises it); persist tx
  L219-344; stats.llm via summarizeLlmCalls.
- Validation: validateDigest(iso2, date) in src/lib/validation/run.ts, upserts
  validation_runs ON (digest_id, isw_report_id); majority matcher k=5 default.
- Neon branch tooling: scripts/neon-branch.ts create|delete; integration pattern in
  scripts/test-integration.sh.
- Local LLM calls need NODE_OPTIONS="--require ./scripts/pin-dns.cjs"; bulk work via
  deployed Vercel routes. Deploy: npx vercel@latest deploy --prod --yes (CLI session;
  VERCEL_TOKEN env is expired/ignore it).
- Audit anchors: corroboration promotion only affects the multi-doc minority (~27%
  of claims, 254 edges); confidence = mean COALESCE(reliability, 0.3); independence =
  different source domains AND not doc_dedup mirrors (audit O3).
