# AI Search/Ask decision register — started 2026-07-19

Accepted assumptions, temporary defaults, deferred operator decisions, and external
blockers accumulated by the unattended workstream. Revisit-markers are explicit.

## Phase 0

### Accepted assumptions / temporary defaults

1. **Stage-timing key vocabulary.** The architecture review sketched a 10-key
   `StageTimings` interface; the implementation uses 13 keys with disjoint entry-point
   scopes: `currencyMs, embedMs, vectorMs, lexicalMs, entityMs, mergeMs, rerankMs,
   answerMs, validateMs` (pipeline), `pipelineMs` (askWithLimits wrapper),
   `hydrateMs + totalMs` (server action only), `apiTotalMs` (JSON route only). Rationale:
   Gate 0 forbids conflating action-hydration/total with API-wrapper timing; one shared
   `totalMs` cannot serve both writers. Documented in `src/lib/ask/timings.ts`.
2. **`answerMs` includes the answer stage's guard I/O** (init/reserve/record around the
   chat completion) — it measures the boundary the user waits on, not the naked network
   call. `embedMs` conversely is the naked `embedTexts` call (its guard I/O is separate
   DB reads inside the vector arm). Asymmetry is deliberate and documented; revisit if
   guard I/O ever dominates.
3. **`ask_started` property shape is `{entry: form|intent}` only.** The review sketched
   `{mode, window_present, entry}`; `mode` exists only from Phase 4 and `window_present`
   is server-parsed. The property set is extended at enablement time, together with the
   operator approval. The event is typed + sanitizer-allowlisted but the emission site is
   gated on `NEXT_PUBLIC_ANALYTICS_ASK_STARTED === "1"`, set in no environment.
4. **Fidelity gold checks are regex heuristics by design** (documented in
   `eval-set.ts`): they reward accurate naming/exact official facts and fail
   strengthening on a scorecard; structural per-sentence enforcement is Phase 3's
   AnswerValidator. Fixture-quality tests pin one faithful-pass + one strengthened-fail
   pair per fixture, plus an over-suppression-fails case.
5. **All fidelity fixture persons/organizations are fictional** — a checked-in repo file
   must not assert claims about real people. The fixtures test mechanics, not facts.
6. **Matrix config syntax is `<v2-base>+<answerModel>`** (e.g. `v2-k60+gpt-5-mini`),
   v2-only; legacy takes no suffix. Results files: `results-<config>.json`.
7. **Legacy pipeline path records no per-stage timings** (only run_id/started_at/
   pipelineMs from askWithLimits). The legacy path is the byte-faithful rollback (DL-6)
   and production runs v2; instrumenting it would violate its "nothing improved" charter.
8. **maxDuration=60 on the /ask page segment.** Verified two ways: next@16.2.10
   `reduceAppConfig` source folds page-segment maxDuration into the route's function
   config, and the built `functions-config-manifest.json` shows `"/ask": {"maxDuration": 60}`.
   Server actions POST to the page's own route, so the pin binds askAction.

### Deferred operator decisions (unchanged from the architecture review §13.2)

- Paid answer-model matrix run (~$1–3) — **enablement-blocked**; the runner capability
  and fixtures are in place, no paid call was made.
- `ask_started` PostHog event enablement.
- Any default-model/K change (requires the paid scorecard).
- Applying migration 0021 to production (happens with the eventual deploy, which is
  itself operator-gated).

### External blockers

- None encountered in Phase 0. The concurrent Paddle workstream has no in-tree schema
  work yet; migration number 0021 was claimed in `docs/PROGRESS.md` at branch time.

### Revisit list

- If Next.js is upgraded past 16.2.x, re-verify the server-action maxDuration
  inheritance (`reduceAppConfig`) before trusting the pin.
- When Phase 3 lands the AnswerValidator, consider migrating fidelity scoring from
  regex gold to validator-verdict gold (keep the regex layer as a scorecard fallback).
- `validateMs` currently measures only the answered-path parse+assembly; if Phase 3
  moves validation into a dedicated stage, re-point the key rather than adding another.
