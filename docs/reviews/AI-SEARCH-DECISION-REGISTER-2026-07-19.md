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

### Post-Gate-0 additions

9. **Deploy-before-migrate is a forbidden window** (Gate 0 F5): migration 0021 must be
   applied to production before any deploy containing the Phase 0 commits — logUsage's
   fail-soft INSERT would otherwise silently freeze the ask_usage ledger (and both /ask
   ledger gates) until migrate runs. Recorded in the workstream index; no deploy is
   authorized in this workstream.
10. **Fidelity mustNotMatch is negation-aware by heuristic** (Gate 0 F1 fix): a
    standalone negator (not/no/never/nor/without/cannot/n't) within a 40-char in-sentence
    scope, unbroken by an adversative (", but/however/yet/although"), exempts a match.
    Negated adjectives ("unconfirmed") deliberately do NOT negate. Contrived
    double-negation can still slip either way — accepted residual softness of regex
    gold; the structural check is Phase 3's AnswerValidator.
11. **Accepted non-"answered" fidelity states skip text checks** (Gate 0 F3 fix): the
    pipeline's insufficient copy is deterministic name-free prose, so name/predicate
    patterns cannot apply to it. acceptStates:["answered"] fixtures still fail
    over-suppression.

## Phase 1

### Accepted assumptions / temporary defaults

12. **Reserve-as-started (bounded deviation from contract §2's markStarted timing).**
    The ask stage guard inserts its reservation with `status='started'` directly
    instead of reserved→markStarted, because in every call site the HTTP dispatch
    follows the successful tryReserve synchronously (no intermediate refusal branch
    exists). A crash between insert and dispatch settles conservatively AT CEILING —
    the safe (over-counting) direction. The service still implements the full
    reserved→started lifecycle (`markReservationStarted`, release-unstarted) for
    future orchestrator use, and both paths are integration-tested.
13. **`ask_runs.result` + `ask_runs.question` are new retention surface** (answer
    text persists per run — required for idempotent replay-without-rerun). Bounded:
    per-user rows, no cross-user readback (replay resolves via the per-user unique
    key), never sent to analytics. Shadow mode writes these rows in production once
    deployed (flag off) — that IS the soak. The operator retention decision the
    architecture review assigns to sessions (§7.7) applies here too and remains open;
    revisit before Phase 6 enables sessions.
14. **Enforce-mode cap checks are ceiling-aware FIT** (`settled + active + ceiling
    <= cap`) — stricter near a cap boundary than the legacy `current < cap`
    overshoot-by-one semantics. That strictness IS the F7 race fix; the legacy
    behavior remains bit-identical while the flag is off.
15. **The GLOBAL daily budget stays the legacy read-check in enforce mode**
    (contract §3): it is a soft aggregate backstopped by the hard provider caps;
    making it atomic adds a lock on a shared key for marginal value. Revisit in
    Phase 7 when workspace pooling changes its meaning.
16. **The lazy expiry sweep runs only in enforce mode.** Shadow-mode crash rows
    stay `created` until enforcement turns on (first enforce request sweeps them);
    accepted to keep the shadow overhead at two best-effort writes per request.
17. **Un-keyed API callers stay replay-unsafe-but-unchanged**: `POST /api/ask`
    without `idempotencyKey` gets a server-generated never-replaying key. The
    replay guarantee requires a client-held key by construction.
18. **Duplicate-in-flight payload** renders as state `limit` with provider
    `duplicate` (so the API 429 mapping — keyed on provider — does not fire) and
    honest copy. Phase 2 replaces this with a real reconnect.

### Post-Gate-1 additions (fixed findings are in the gate report; these are the
### accepted-and-registered residuals)

19. **Idempotency keys bind (user, key, question).** A reused key with a different
    question refuses honestly (Gate 1 fix — standard idempotency semantics); an
    expired/crashed run's key stays bound to that failed gesture and its replay says
    so honestly ("did not complete… submit again"). Contract §4 is amended by this
    register entry.
20. **Legacy embed callers keep read-then-act semantics on `openai_embed`** (the
    enrich/backfill/persist paths neither take the advisory lock nor see active
    ceilings). Enforce-mode atomicity holds among atomic callers; full consolidation
    is Phase 5's gateway work. Exposure bounded by the existing daily caps.
21. **Orphaned-consumed slot** when the post-insert authorize UPDATE fails: the slot
    stays consumed for a run that never became authorized — conservative direction
    (never a free retry), reconciled by nothing (a day-scoped slot). Accepted.
22. **`ask_runs.status` never takes 'running'** in Phase 1 (created → authorized →
    finished/expired); the expiry sweep's predicate (`finished_at IS NULL`) is not
    covered by the (status, created_at) index — add a partial index in the Phase 2
    migration (0023) rather than editing 0022.
23. **`ASK_PIPELINE=legacy` + `ASK_RUNS_ENFORCE=1` is a degenerate combination**: the
    legacy pipeline ignores injected guards, so spend checks degrade to read-then-act
    while runs/replay stay atomic. ASK_PIPELINE=legacy is the emergency rollback and
    must not be combined with enforcement — documented here, not coded around.
24. **Enforcement-flip day**: the atomic allowance starts from an empty slot table,
    ignoring same-day pre-flip ask_usage history (a user could get up to 2× the daily
    limit on that one transition day). One-day artifact, accepted.
25. **Anonymous namespace** (`FEATURE_AUTH_GATE` off, dev/demo only): client keys
    share the "anonymous" user namespace across visitors. Production always has the
    gate on; accepted as dev-only.
26. **Enforce-mode per-request overhead** (lazy sweep with an unindexed predicate +
    ~11 serial Pool setups per ask): performance debt, bounded at beta scale;
    Phase 2's orchestrator consolidates connections, and #22's partial index covers
    the sweep.
27. **Replayed payloads carry `replayed: true`** and entry points skip their timing
    patch — the original gesture's hydrate/total timings are never overwritten
    (Gate 1 fix).
28. **Reservation actuals settle to the RESERVATION's day** (not the settle-time
    day), so midnight-straddling calls are charged against the window that admitted
    them (Gate 1 fix).

## Phase 2

### Accepted assumptions / structural decisions

29. **`run.ref` is a transport-level SSE record, not a run event** (contract §2
    addition): the POST stream's first record delivers the run id the client needs
    for reconnect; it is never persisted (replay clients already hold the id).
30. **`ask_run_events` is new retention surface, partially duplicating
    `ask_runs.result`** (the terminal event payload carries the result so replay
    needs one read). Growth is unbounded until a cleanup policy lands — same
    operator retention decision class as #13/#30; revisit before enabling
    ASK_PROGRESSIVE beyond an internal cohort.
31. **The EvidenceSnapshot is frozen only on the progressive path** (real sink
    present) and persists fail-soft — a lost snapshot costs Phase 4/6 reuse for
    that run, never the answer. The action path adds no per-request snapshot
    weight while the flag is off.
32. **No separate `orchestrator.ts`:** the composition lives in `ask()` with the
    sink/snapshot seam (askWithLimits owns run.created/authorized on the one money
    path). The review's "ask() = thin wrapper over the orchestrator" is satisfied
    structurally in reverse — ONE composition, zero duplicated business rules.
    Phase 3's streaming work may still extract a file if the generation stage
    demands it.
33. **Connection weight:** PgRunEventSink opens a Pool per event (~8–10 extra
    per-run connections on top of Phase 1's per-operation pools). Registered
    performance debt at beta scale; consolidate when Phase 3 touches the
    orchestration layer.
34. **Sink persist failure mid-pipeline throws** → the run downgrades to the
    error row honestly; any post-billing spend was already settled inside the
    stage guards (ruling 8 discipline is unaffected by transport failures).
35. **The Phase 2 client renders the terminal result via GET
    /api/ask/runs/[id]/result** (ownership-gated, $0), sharing the action's
    hydration module verbatim — one render contract, two transports.

### Revisit list

- If Next.js is upgraded past 16.2.x, re-verify the server-action maxDuration
  inheritance (`reduceAppConfig`) before trusting the pin.
- When Phase 3 lands the AnswerValidator, consider migrating fidelity scoring from
  regex gold to validator-verdict gold (keep the regex layer as a scorecard fallback).
- `validateMs` currently measures only the answered-path parse+assembly; if Phase 3
  moves validation into a dedicated stage, re-point the key rather than adding another.
