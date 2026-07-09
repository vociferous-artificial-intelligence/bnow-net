# MR Sprint 3 — session checkpoint (living file; overwrite freely)

**Purpose:** if this session dies, a fresh session reads THIS FILE FIRST and resumes
from "Next step" — do not restart completed tasks. Sprint spec: the MR3 prompt
(reduce over doc_claims → A/B vs legacy → cutover). Budget ≤ $12 LLM, env-capped.

## Status

- **Current task:** TASK 2 (K=3-voted synthesis over claim groups)
- **Tasks done:**
  - TASK 0 ✅ (2026-07-09 ~21:00 UTC) — 651 docs retagged ru→ir, holdout removed,
    catch-up map run drained ($0.0041), ruling 11 corrected, #29 closed / #37 added.
  - TASK 1 ✅ (2026-07-09 ~21:45 UTC) — reduce.ts (star clustering, threshold 0.35
    tuned: precision 1.0 / recall 0.8 on 30 pos/187 neg labelled pairs),
    reduce-io.ts loader, map-versions.ts (#35 accessor), quote-verify.ts +
    quote_verified stamped at map insert (migration 0012, applied to prod),
    isMetaClaim filter, scripts/reduce-tune.ts. 424 tests green. Smoke on ru 07-08:
    1,696 claims → 1,052 groups, 25.7% multi-doc, 101 promotions, 133ms.
    Evidence: docs/reviews/MR3-REDUCE-RESULTS.md.
- **Neon branch:** none created yet
- **Env flags set this sprint:** none yet. ⚠ REDUCE_USD_CAP_DAILY must be set in
  ALL Vercel envs BEFORE any deploy that ships the TASK 2 guard (ruling 4).
- **LLM spend so far this sprint:** ~$0.005

## Next step (resume here)

TASK 2 — synthesis pass (LLM, K=3 voted), `src/lib/analysis/synthesize.ts`:
1. Input = rankGroups(clusterClaims(loadReduceClaims(...))) — feed top ~150-250
   groups (env REDUCE_GROUPS_FED, default 200); record
   structured.stats.reduce.groupsTotal/groupsFed.
2. Prompt: group claim-groups into 5-12 events, rank by significance,
   title+summary per event, select claim-group ids per event. Model references
   GROUP IDS ONLY; docIds come from the groups server-side (hallucination
   structurally impossible). Strict schema; minItems/maxItems pinned where batched
   per-item (ruling 7).
3. K=3 votes (temperature 0.2, same input), majority-merge: event survives if ≥2
   votes contain it (match events by claim-group overlap, e.g. jaccard ≥ 0.5);
   claim selection = groups appearing in ≥2 votes of that event; wording from the
   median-length run. Persist per-vote detail in structured.stats.reduce.votes.
4. Metering: provider row `openai_reduce`, reduceGuardFromEnv() in llm-guard.ts
   (REDUCE_USD_CAP_DAILY fail-closed prod; LLM_SPRINT_USD_CAP backstop),
   max_completion_tokens set.
5. Persist through the EXISTING digest transaction path shape (events/claims/
   claim_sources/claim_entities + confidence UPDATE + renderMarkdown), tagged
   provider='openai:gpt-4o-mini+mapreduce'; digests.structured.stats.reduce.
6. Thin-regen guard (#32): refuse overwriting an existing digest with <50% of its
   claim count (env DIGEST_MIN_CLAIM_RATIO=0.5, FORCE_REGEN=1 override), log
   refusal to cron_runs counts; add the same guard to legacy digest.ts (protects
   the A/B baseline).

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
