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

## Phase 3

### Accepted assumptions / structural decisions

36. **The §4 fidelity matrix is structural-deterministic** (sentence regex families
    + cited-claim text; never an LLM judge). Documented heuristic bounds: novel
    predicate paraphrases outside the encoded families pass through to the
    citation filter alone; the encoded families cover the §4 strengthening modes
    (conviction, confirmed death, sanction/designation, arrest, charge). Rollback:
    `ASK_FIDELITY_FALLBACK=0` disables sentence replacement only.
37. **`answer.section` admits a `text` payload key** — the ONE prose-bearing event
    besides the terminal result, restricted to VALIDATED released sections
    (citation-filtered + fidelity-checked before emit); the allowlist test pins
    that no other event admits text.
38. **Cancellation maps to provider `"cancelled"` + state `"error"`** in the
    payload (the `AnswerState` union and the PostHog `ask_completed` enum stay
    untouched); the runs route emits the single `run.cancelled` terminal instead
    of `run.completed`; the cancelled payload is finalized on the run row so
    replays stay honest.
39. **Stream-death settlement is the conservative ceiling** (30K input estimate +
    the output-token ceiling) when no usage frame arrived — same conservatism
    class as reservation expiry; later corrections are new records. A clean end
    settles the provider's terminal usage frame exactly once (`settled` gate +
    the atomic guard's conditional transition).
40. **`answer-stream.ts` imports nothing from `answer.ts`** (the caller supplies
    model/messages/ceiling), so the modules cannot cycle; its `streamFactory`
    seam is the shape the Phase 5 gateway adopts.
41. **Streamed sections render OUTSIDE the aria-live region** (the status line
    announces stage changes; sections are reachable, not force-announced) —
    flagged for the Gate 3 red-team's a11y verdict on whether section-level
    announcements should be added.

### Post-recovery additions (2026-07-20; the interrupted session's dirty patch
### proven/reworked — see AI-SEARCH-RECOVERY-2026-07-20.md)

42. **Answer-section identity = the persisted event seq; id-less prose never
    renders.** An `answer.section` SSE record without a valid `id:` line is
    contract-violating transport data: its phase advance still applies (the
    event type is a server fact) but its text is dropped fail-safe — prose with
    no replay identity cannot be deduplicated, and a shared synthetic id would
    silently collapse distinct sections. Terminal reconciliation renders the
    full validated answer regardless, so the drop costs at most an interim
    display. Duplicate delivery of the same seq renders once (client-side
    dedupe keyed by seq).
43. **Reconnect-exhaustion RETAINS the per-tab resume ref.** Clearing it would
    orphan a possibly still-running billed run (the next refresh would show an
    idle form inviting a second paid gesture). Policy: keep the ref, render the
    honest "may still be completing — refresh to check at no extra charge"
    copy; only terminal replay or a genuine ownership/unknown 404 clears the
    ref. Residual (accepted): a run that never writes a terminal event (e.g.
    expired by the sweep, which marks the row but appends no event) leaves a
    per-tab ref that retries a bounded $0 read-only resume on each mount until
    the tab closes. Mount recovery replays from seq 0 (full panel rebuild); the
    stored lastSeq seeds only live-continuation reconnects.

### Supplementary Gate 2 additions (2026-07-20; findings G2S-1..11 in the gate
### report's addendum — these are the surviving contracts/residuals)

44. **Enablement coupling:** `ASK_PROGRESSIVE=1` should be enabled together
    with `ASK_RUNS_ENFORCE=1` — the runs route's idempotent-replay semantics
    ("a replayed key returns its stored result with zero provider calls") hold
    only under enforce; in shadow mode a duplicate POST re-runs the paid
    pipeline (documented legacy semantics). Operator note for the (blocked)
    enablement step.
45. **Reconnect 404s are terminal only when consecutive.** The POST route
    announces `run.ref` before the ask_runs row commits, so the first 404 in a
    resume is retried after backoff; a second consecutive 404 is a genuine
    ownership/unknown run and clears the resume ref (G2S-2).
46. **Terminal-persist failure delivers an unpersisted wire terminal** instead
    of rewriting a billed success as `run.failed` (G2S-4). Residual accepted:
    that one run's event log lacks a terminal event, so a later resume tails
    to cutoff and exhausts honestly (ref retained, #43); the finalized run row
    + `/result` remain the durable truth.
47. **Failure-copy class split deferred** for the expired-session path
    (detecting the auth redirect inside a dropped SSE fetch): `submit_*` /
    `stream_lost_before_ref` currently share the generic connection-lost copy
    (money statement exact in every class). `reconnect_404` got its own honest
    copy (G2S-11).

### Gate 3 additions (2026-07-20; findings G3-1..13 + G3-B1 in the gate report —
### these are the surviving contracts/registered bounds)

48. **Fidelity-matrix documented bounds (post-G3 hardening).** (a) An UNCITED
    name-bearing sentence with no encoded §4 predicate passes through (benign
    mentions; the encoded families gate the fail-uncited rule). (b) Identity
    accepts surname + matching first initial, so initial-changing
    transliterations (Yevgeny/Evgeny) still over-replace — conservative
    direction, name preserved in the quoted claim. (c) Predicate/negation/
    candidate-identity checks remain regex-structural; novel phrasings outside
    the encoded patterns pass to the citation filter alone (register #36's
    class, narrowed by the G3 fixes).
49. **Graceful abort teardown = cancelled.** In the Next server runtime an
    aborted provider stream can end WITHOUT throwing and without a
    finish_reason (transport-dependent; proven end-to-end). Contract: signal
    aborted + no provider finish_reason at clean end ⇒ cancelled (no final
    flush; ceiling settles absent a usage frame); a genuine provider finish
    racing a late Stop stays a completion.
50. **Usage frames are adopted only when finite and non-negative** (both token
    counts); anything else settles the conservative ceiling. This is the
    Phase 5 gateway seam's contract for degenerate frames.
51. **StreamDispatchError carries settled usage** so error payloads report
    billed usage/model whenever settlement happened (parity with the
    non-streaming billedAnswerModel discipline).

## Phase 4

### Accepted assumptions / structural decisions

52. **The router is recording-only** (`ASK_ROUTER=1` consults `route()` and
    writes `ask_usage.route_policy`; the pipeline keeps reading its own
    constants, equivalence-pinned). Models route THROUGH the policy object
    only when the first non-Auto route earns the paid scorecard — at which
    point `autoPolicy()` must gain a hard `hasScorecard` check (Gate 4 G4-5
    latent gap, marked in code and by the `auto_env_override` reason).
53. **The metering price table stays in limits.ts until Phase 5**; the
    registry mirrors it under a parity test that fails on divergence. The
    pin is one-directional (a model added to PRICES_PER_MTOK alone escapes
    it) — consolidation closes this in the gateway phase.
54. **Cache-hit rows count against the user's daily allowance** (the hit sits
    after the gates) — strictly conservative; the Phase 7 units model
    revisits (hits should cost 0 units commercially).
55. **Only snapshot-carrying (progressive) answered runs are cacheable**; the
    action path produces no snapshot and is never cached (F11 requires the
    snapshot). Bound, not a bug; revisit if the action path ever freezes
    snapshots.
56. **Cache retention = lazy 7-day sweep on store** (corpus moves orphan all
    prior entries permanently — they can never re-key). The Phase 6 retention
    decision may supersede.
57. **The recorded route policy is ANSWER-STAGE-scoped** (rerank effort/
    ceiling and the trim floor are deliberately not in it); the cache KEY
    however folds every answer-shaping knob incl. those toggles (G4-1 fix).
58. **Semantic cache, adaptive K, rerank-skip, Fast/Deep enablement, mode
    selector UI: NOT built** — each blocked on the paid scorecard / per-intent
    evals / a live router (enablement-blocked list).

## Phase 5

### Accepted assumptions / structural decisions

59. **Streaming lifecycle stays in answer-stream.ts** (dispatch-only
    `stream()` on the adapter): register #40 designated the factory as the
    gateway seam, and Gate 3's hardened reserve/settle/abort semantics do not
    move for a naming win. A second provider's streaming adapter supplies a
    factory; the lifecycle code is provider-neutral already.
60. **Out-of-scope vendor seams** (registered): the digest AnalysisProvider
    (`openai-provider.ts`, `synthesize.ts`), the validation matcher
    (`llm-match.ts`), and the entity-audit cron keep their own OpenAI imports
    — they predate the gateway, have their own guard discipline, and migrate
    when they next change. The import-graph rule covers the Ask product path.
61. **Future-provider checklist** (Gate 5 G5-4): a provider added to the
    contract suite MUST supply its own dispatch spy so reserve<dispatch<record
    ordering and the anomalous-output fixtures run against ITS transport; the
    generic describe.each rows alone are not a sufficient gate. Plus: key +
    fail-closed cap envs in ALL environments BEFORE deploy, and a paid
    scorecard (incl. fidelity fixtures) before routing.
62. **G5-5 residual accepted**: a throw from the pure budget-degradation
    helpers would land in askWithLimits' catch instead of answer.ts's own —
    no triggering input exists; ruling 9 holds via the upstream catch.

## Phase 6

### Accepted assumptions / structural decisions

63. **Sessions core ships flag-off with NO UI** — rollout (and the retention
    sweep design) blocks on the operator retention decision (§7.7; the same
    class as #13/#30). Delete/export landed FIRST per the master prompt.
64. **Turn eligibility = owner's run WITH a frozen snapshot** (G6-5/7): a
    snapshotless run can never become a turn, so the session's CURRENT
    snapshot is always the latest turn's. Expand/new turns therefore require
    the progressive path (which freezes snapshots) until the action path
    gains snapshot freezing.
65. **Refusal payloads (state limit/error) never consume turns**; cap/ended/
    idle refuse for $0 BEFORE the paid call; post-call append refusals return
    the billed result (G6-2/3).
66. **Content-deleted replays get a dedicated honest copy** (G6-8); the §7.7
    delete covers ask_runs content, ask_run_events, ask_answer_cache, and
    ask_usage.question (accounting columns retained) (G6-1).
67. **`pipeline_legacy` refusal** (G6-6): reuse follow-ups require the v2
    pipeline; the legacy rollback cannot silently widen a scoped turn.
68. **Snapshot entities are not carried** (the reuse turn's evidence is
    claims-only; the entity list re-derives only on expand/new) — registered
    bound.

## Phase 7

### Accepted assumptions / registered decisions (the JOINT gate revisits)

69. **Ask-owned subset only** — billing/resolveAccessContext absent; the stub
    contract in access-context.ts is what billing must freeze against; NO
    money-path wiring exists (test-pinned) and fail-closed-on-resolve-throw
    is the future caller's obligation (enablement-blocked checklist in the
    Gate 7 report).
70. **Beta unit decisions to RE-DECIDE before live billing:** cancelled runs
    bill 0 units (validated sections may have been delivered — align
    CANCELLED_MESSAGE when changed); model-refusal bills 1 while truncation
    bills 0 (both full-cost/zero-value — asymmetry explicit); degraded
    (stub/budget) answers bill 0 (Gate 7 high fix — billing a kill-switch
    window's deterministic lists as analyses was indefensible).
71. **aggregateUnits is an ENFORCE-MODE feed**: shadow mode loses best-effort
    rows; pipeline-throw runs settle $0 in the run row while stage spend sits
    in provider_usage; expired runs attribute to sweep time with NULL units.
    Billing must reconcile against ask_usage/provider_usage; a
    creation-period attribution column is future work.

### Revisit list

- If Next.js is upgraded past 16.2.x, re-verify the server-action maxDuration
  inheritance (`reduceAppConfig`) before trusting the pin.
- When Phase 3 lands the AnswerValidator, consider migrating fidelity scoring from
  regex gold to validator-verdict gold (keep the regex layer as a scorecard fallback).
- `validateMs` currently measures only the answered-path parse+assembly; if Phase 3
  moves validation into a dedicated stage, re-point the key rather than adding another.

## Release hardening (2026-07-21, codex/ai-search-ask-release-hardening-20260721)

### Structural decisions

72. **One reservation per physical dispatch, absolutely.** Every OpenAI client
    in the gateway adapter is constructed `maxRetries: 0` (the SDK default of
    2 hidden retries could put three billed attempts behind one reservation);
    the only retry loop (embed batches) takes a FRESH reservation per attempt,
    settles definitive server rejections at $0 before retrying, and leaves
    connection-class unknowns open for the conservative ceiling-settle expiry.
    The legacy pipeline's SDK client also lost its hidden retries — a
    deliberate, minimal deviation from its "byte-faithful" charter, money-
    safety over fidelity. `withRetry` was deleted (caller-less, and a standing
    invitation to re-wrap a guarded dispatch).
73. **features.ts is the single flag authority.** Effectiveness lattice:
    enforce/shadow require valid retention; progressive requires enforce+v2;
    streaming requires progressive; exact cache requires progressive + TTL;
    sessions require enforce+v2. Invalid combinations fail closed and warn
    once. Register #23's legacy+enforce combination now RESOLVES (enforce
    retained for money atomicity; every v2 feature forced off) instead of
    being documentation-only.
74. **Shadow persistence is opt-in** (`ASK_RUNS_SHADOW=1`, default OFF): a
    plain deploy of this tree stores NO ask_runs questions/results. The
    "deploy = soak" plan from register #13 is superseded — the soak now
    requires the explicit shadow flag plus retention settings.
75. **Retention is operator-owned and enforced lazily**
    (`ASK_CONTENT_RETENTION_DAYS`, `ASK_EVENTS_RETENTION_DAYS` defaulting to
    content, `ASK_CACHE_TTL_DAYS`): run content redacts (question/result/
    snapshot; idempotency key rotates to `expired:<id>` — the key frees, a
    resubmission is honestly a new gesture), events/cache/idle-session rows
    delete, accounting survives. Sweep is throttled (5 min/process) on the
    persisted money path; cache TTL is ALSO enforced in cacheLookup's own
    predicate (an expired entry can neither hit nor bump hit accounting).
76. **Cohort policy** (`ASK_PROGRESSIVE_COHORT`): unset = every accepted user
    once the stack is effective; set = comma-separated allowlist,
    case-insensitive; anonymous (gate-off dev) is OUT when a cohort is set.
    page.tsx and the runs POST boundary consult the SAME function; events/
    result GETs and cancel stay owner-gated but flag-UNgated so rollback
    never orphans billed runs (cancel is inert without an orchestrator).
77. **Durability verdict** (`result.durable`): enforce-mode terminals carry
    an explicit verdict = run row finalized (bounded 3-attempt DB retry,
    provider never rerun) AND any required snapshot persisted
    (`snapshotPersisted`, itself verified + retried). The runs route persists
    the terminal event ONLY when durable (an event log claiming completion
    must never contradict a row the sweep will expire); otherwise wire-only
    terminal, and the client renders it without /result and claims no replay
    durability. Terminal-event persist retries burn seqs on failure — seq
    GAPS are tolerated by every reader (ordering, not contiguity).
78. **Connection lifecycle:** the SSE routes own ONE request-scoped Pool each
    (sink + tail polls included); PgRunEventSink takes the invocation's
    connection and never constructs/ends its own; no module builds a Pool at
    import time. Register #26/#33's per-operation pools inside
    askWithLimits/runs.ts remain registered debt (bounded, beta scale).
79. **Sessions are transactional:** start-from-run, append-turn (+
    last_active bump, cap in the INSERT's HAVING, session-row FOR UPDATE),
    and §7.7 delete each commit or roll back whole. New typed refusal
    `run_in_session`; `pipeline_legacy` is now defense-in-depth (the resolver
    refuses sessions on legacy first, as flag_off).
80. **Cache hits are snapshot-verified:** a hit is served only after its
    frozen snapshot verifiably persists onto THIS run's row; a failed persist
    demotes to a miss and runs the pipeline (F11: hydration may never fall
    back to live claim ids). Register #54's hit-counts-against-allowance
    stance is unchanged; register #55 is now ENFORCED server-side (cache
    requires the progressive stack) rather than registered-only.
81. **Billing cutover metadata (migration 0027):** ask_runs.billing_policy +
    billing_eligible (default false). Eligible = enforce mode AND
    ASK_BILLING_CUTOVER_AT (unset by default; invalid ⇒ unset) in the past
    AND units > 0, with belt-and-braces payload re-checks (replay/cache/
    degraded/cancelled/refusal never eligible even if the unit policy
    drifts). aggregateUnits' units/runs stay INFORMATIONAL; only
    billableUnits/billableRuns (strict billing_eligible filter) may feed an
    invoice. Setting the cutover env is an operator action requiring a
    decision-log entry; no Paddle/entitlement code exists.
82. **Migrations apply atomically per file** (statements + _migrations marker
    in one transaction over an interactive client); a midway failure leaves
    no partial DDL and no marker; rerun-after-fix applies fresh. 9999 still
    sorts last. (No existing migration file was edited.)

### Deferred operator decisions (added by this session)

- Retention values themselves (`ASK_CONTENT_RETENTION_DAYS` etc.) — the
  §7.7-class decision is now a concrete pair of envs; nothing persists until
  they are set. The public Privacy Notice will need a retention disclosure
  BEFORE any persistence-backed feature is enabled in production (the notice
  currently describes no Ask run/result storage; defaults-off keeps it
  accurate today).
- `ASK_BILLING_CUTOVER_AT` — must stay unset until the Paddle/billing
  contract exists and the Gate 7 joint leg passes.
- `ASK_PROGRESSIVE_COHORT` membership for the first internal rollout.
- ASK_FIDELITY_FALLBACK stays DEFAULT-ON (re-affirmed; rollback knob only).
