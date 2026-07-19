# Coding-agent master prompt — phased AI Search and Ask implementation

Paste this prompt into Claude Code or another application-coding agent. It is an unattended,
multi-phase workstream: implement in stacked phase branches, prove and document each gate, merge
only passing phase branches into a dedicated integration branch, and continue while the operator
is unavailable. Do not treat the roadmap as one change set and do not merge it to `main`.

---

You are the implementation lead for BNOW.NET's improved Search and AI Ask product. Work in the
actual repository at:

`/home/go/code/bnow.net`

Your objective is to evolve the current synchronous `/ask` experience into an evidence-first,
progressive investigation product while reducing measured latency and inference cost without
weakening traceability, publication integrity, spend controls, or the free-GET/no-surprise-charge
contract.

## 1. Read before acting

Read these files completely before any edit:

1. `AGENTS.md` — binding project state, rulings, credentials, conventions, and protocol.
2. `docs/reviews/AI-SEARCH-PRODUCT-ARCHITECTURE-REVIEW-2026-07-19.md` — authoritative target
   architecture, evidence, phase sequence, acceptance gates, and unresolved decisions.
3. `docs/PRODUCT-BRIEF.md`
4. `docs/CURRENT-STATE.md`
5. `docs/OPEN-TASKS.md`
6. `docs/evals/ASK-EVAL-2026-07-11.md`
7. Existing Ask/Search implementation under `src/app/ask/`, `src/app/api/ask/`,
   `src/app/search/`, `src/lib/ask/`, `src/lib/embeddings/`, `src/lib/usage/`,
   `src/lib/analytics/`, and the relevant `src/db/schema.ts` sections.

Verify every assumption against the working tree. The architecture review cites commit
`9d556cf`, but later documentation commits may be present. Code wins over stale line numbers.

## 2. Execution rule: unattended stacked workstream through all safe phases

The operator has authorized continuous implementation work across Phases 0–7 while away. Begin at
Phase 0 and keep working. Do not pause merely because a phase report is ready.

Create a dedicated integration branch, for example:

`codex/ai-search-ask-integration-20260719`

Create one stacked phase branch per coherent phase, based on the latest passing integration HEAD:

```text
codex/ai-search-ask-integration-20260719
  ├─ codex/ai-search-ask-p0-measure
  ├─ codex/ai-search-ask-p1-runs
  ├─ codex/ai-search-ask-p2-progressive
  ├─ codex/ai-search-ask-p3-validation-stream
  ├─ codex/ai-search-ask-p4-routing-cache
  ├─ codex/ai-search-ask-p5-provider-gateway
  ├─ codex/ai-search-ask-p6-sessions
  └─ codex/ai-search-ask-p7-entitlements
```

Use separate Git worktrees when they materially reduce collision or enable independent review.
Dependencies remain sequential even if review/test work runs in parallel. Never let two branches
independently edit `src/db/schema.ts` or claim the same migration number. After a phase passes its
automated and adversarial gate, merge it `--no-ff` into the integration branch, record both commit
hashes, and branch the dependent phase from that new integration HEAD. Never merge to `main`,
push, or deploy without operator instruction.

If a gate fails, fix it on that phase branch and rerun the gate. If progress genuinely requires
new authority or an unavailable external dependency, do not pretend the phase passed and do not
merge its incomplete branch. Write the blocker report, then continue safe independent work in a
separate branch—for example fixtures, contract tests, UI states, adapter stubs, documentation, or
later-phase design that does not depend on the failed behavior.

A phase whose implementation and offline tests pass but whose **enablement** requires a prohibited
paid/external action may be marked `implementation-pass / enablement-blocked`. It may merge into the
integration branch only when the unavailable behavior is disabled by default and the current
production-equivalent path remains unchanged. Dependent code may then continue against the tested
contract. Never call such a phase production-ready; list the exact missing verification.

Operator approvals remain real boundaries:

- No paid model/API call, new provider key, cap change, production database write, production
  browser test that triggers inference, deployment, Paddle mutation, or external account action.
- Model-routing code may be built behind disabled flags, but Auto stays behavior-identical until a
  paid scorecard is later approved.
- New analytics events may be implemented in typed/disabled form, but not enabled without approval.
- Session retention and cross-user caching may be implemented behind disabled flags with the most
  conservative isolation, but not enabled without the documented decision.
- A missing billing access-context module or secondary-provider key is an external dependency;
  complete the safe adapter/contracts/tests, record the blocked live verification, and move on.

For each phase:

1. Run `git status --short`, identify the branch and current HEAD, and inspect all existing
   changes. Preserve unrelated work. Never reset, overwrite, stage, reformat, or commit another
   developer's changes.
2. Append a timestamped ≤2-hour work block to `docs/PROGRESS.md` before coding.
3. Confirm the phase's dependencies and operator approvals. Skip and record any paid call,
   production write, external account mutation, deploy, cap change, or new analytics enablement
   that lacks explicit approval, then continue all safe in-repository work.
4. Implement the smallest coherent vertical slice behind the phase's passive schema or feature
   flag.
5. Test in layers: focused unit/component tests → typecheck/lint → complete unit suite → required
   disposable-Neon integration tests → browser verification when the phase changes UI.
6. Perform the mandatory reviews in §5. Fix every blocker/high finding and rerun affected tests.
7. Write both:
   - `docs/reviews/AI-SEARCH-PHASE-<N>-<short-name>-<date>.md` — full implementation report;
   - `docs/reviews/AI-SEARCH-GATE-<N>-<date>.md` — independent/adversarial gate report.
   Each must contain the exact diff scope, commits, branch/worktree, schema/API/state changes,
   tests with counts, measurements, review findings, decisions, debt, rollout/rollback, and every
   exit criterion marked pass/fail/blocked with evidence.
8. Correct living documentation in place and append the AGENTS decision log only for an approved
   decision or shipped state change. Never mark planned work as live.
9. Commit only the phase's coherent files using the repository convention. Merge a passing phase
   into the integration branch with `--no-ff`; retain the phase branch for later inspection.
10. Update the workstream index described below, then begin the next safe phase automatically.

“Tests pass” is not a gate by itself. The phase must satisfy its money, truth, latency,
accessibility, privacy, and rollback acceptance criteria.

Maintain these cumulative detailed review artifacts throughout the unattended run:

- `docs/reviews/AI-SEARCH-WORKSTREAM-INDEX-2026-07-19.md` — branches, commits, dependency graph,
  phase/gate status, flags, migrations, and links to every report;
- `docs/reviews/AI-SEARCH-TEST-LEDGER-2026-07-19.md` — every command, exact pass/fail counts,
  duration, environment, and rerun after fixes;
- `docs/reviews/AI-SEARCH-DECISION-REGISTER-2026-07-19.md` — accepted assumptions, deferred
  operator decisions, temporary defaults, external blockers, and what must be revisited;
- per-phase before/after latency and cost tables, screenshots for UI phases, state/event diagrams,
  migration summaries, adversarial findings, and rollback instructions.

These reports are part of the deliverable, not optional commentary. Prefer too much verifiable
detail over an unsupported “done.”

## 3. Product decision and non-negotiable behavior

Build an **evidence-first search product that grows into a scoped investigation workspace**, not
a generic chat transcript.

The user should receive useful value in this order:

1. real query scope and corpus currency;
2. real candidate evidence from deterministic retrieval;
3. the frozen hybrid candidate set and source statistics;
4. selected answer evidence;
5. a source-faithful cited synthesis;
6. later, bounded follow-ups over a visible evidence snapshot.

Preserve all of these invariants:

- Every `GET /ask`, including `?q=` and forged/replayed `?intent=`, remains free and prefill-only.
- A paid run starts only from an authenticated, accepted user's explicit POST/form action. The
  existing one-click home intent remains single-use and cannot replay a charge.
- Every paid provider call passes a fail-closed SpendGuard reservation before the call and records
  billed usage after it, including malformed, refused, truncated, retried, partially streamed,
  cancelled, or discarded output.
- Every factual answer statement resolves to real stored evidence. Candidate evidence, selected
  evidence, and cited evidence are separate types and separate UI labels.
- Stub/fixture data never persists or renders as fact.
- No ISW prose or source full text appears in user-facing output.
- Provider and model names remain internal. Users see stable modes such as Auto, Fast, and Deep.
- No question, answer, claim, source text, URL, or person name enters PostHog. Only typed,
  allowlisted, bucketed metadata may be sent.
- Applied migrations are never edited. Coordinate new migration numbers with concurrent work;
  `9999_claim_source_trigger.sql` stays last.
- Every phase has a tested flag/passive-column rollback.

## 4. Named-person source-fidelity contract — binding

Names and exact source-supported facts **are allowed** for accepted professional users. Do not
implement blanket name suppression, an artificial universal two-source requirement, or a direct
port of digest publication ruling 19 into Ask.

The Ask validator must enforce fidelity, not paternalistic omission:

1. **Identity:** the citation identifies the same person. A fuzzy or name-only match is a
   candidate, not a resolved identity.
2. **Predicate:** do not change “investigated,” “accused,” “charged,” “designated,” “convicted,”
   or “reported dead” into a different act.
3. **Procedural status:** allegation, investigation, charge, judgment, designation, expiration,
   removal, and appeal remain distinct.
4. **Certainty and hedge:** disputed reporting retains governing attribution and its hedge.
   Multiple outlets repeating one claim do not automatically convert it into fact.
5. **Official records:** one authoritative record is enough for its exact action/status. State the
   authority, program/proceeding, date, and current status when the evidence contains them.
6. **OpenSanctions categories:** `sanction`, `role.pep`, `role.rca`, `poi`, `debarment`,
   `reg.action`, and other topics never collapse into “sanctioned” or “criminal.” Being a PEP is
   not an allegation. An RCA does not inherit the principal's conduct.
7. **OpenSanctions identity:** the current code submits schema + name only. Until stronger
   identifiers or analyst review resolve the identity, phrase the result as a candidate match and
   expose match score/category/source datasets. Do not state that the BNOW entity is definitively
   the listed person merely because the API returned `match=true`.
8. **Timing:** a former, expired, removed, delisted, overturned, or superseded status must not be
   presented as current.
9. **Fallback:** if a transformed sentence cannot pass deterministic fidelity checks, use
   deterministic cited-claim wording with its attribution/hedge or withhold it until terminal
   validation. Do not remove the name merely because it is a name.

The Phase 0 eval suite must include at least these eight gold cases:

- a one-source authoritative designation/action that should pass;
- a one-source disputed news allegation with governing attribution that should pass;
- corroborated reporting that must remain attributed;
- a PEP that must not be called sanctioned;
- an RCA that must not inherit a principal's allegation;
- an OpenSanctions name-only false-positive;
- a changed or expired status;
- two different people sharing the same or a similar name.

Digest ruling 19 remains unchanged for persisted digest publication. This prompt changes Ask and
Search handling only.

## 5. Mandatory review system at critical gates

At the end of every phase, run a fresh adversarial review. If your environment supports separate
review agents, use at least one independent reviewer that did not author the implementation. If it
does not, clear your implementation assumptions and conduct a separate review pass from the diff,
tests, and contracts. The reviewer must not rubber-stamp.

Classify findings as `blocker`, `high`, `medium`, or `low`; include file/line evidence and a
reproduction or violated invariant. Blocker/high findings must be fixed before the phase passes.

Use the applicable review lenses:

### A. Architecture and state-machine review

- duplicate business rules;
- impossible or missing transitions;
- terminalization more than once;
- serverless/process-memory assumptions;
- reconnect/replay ordering;
- feature-flag and rollback behavior;
- stale client state or late events mutating a cancelled run.

### B. Money and concurrency review

- any paid call before a successful provider reservation;
- daily/all-time cap races;
- own reservation counted twice;
- `openai_embed` and `openai_ask` envelope confusion;
- replay, refresh, back, retry, timeout, reconnect, or cancellation causing a second bill;
- started calls released as though unstarted;
- billed calls missing from settled accounting;
- allowance semantics changing for denied versus authorized runs.

### C. Evidence, identity, and source-fidelity review

- fabricated/unknown citations;
- claim-ID churn after digest regeneration;
- source hydration losing provenance;
- candidate/selected/cited labels confused;
- name collision or OpenSanctions match presented as resolved identity;
- PEP/RCA/POI presented as sanctions or wrongdoing;
- allegation/charge/designation upgraded into guilt;
- status/date made current when the citation is historical;
- generated prose stronger than the cited claim;
- stub data or ISW/source full text leaking into output.

### D. UX, latency, and accessibility review

- simulated progress presented as server fact;
- useful evidence withheld behind synthesis;
- layout shift, stale-result disappearance, or reconnect confusion;
- mobile and desktop evidence density;
- keyboard, focus, form, Stop button, and screen-reader behavior;
- `aria-live` token spam;
- p50/p95 claims unsupported by measurements;
- candidate counts that fail to disclose sampling.

### E. Privacy, security, and operations review

- run ownership on every result/events/cancel endpoint;
- entitlement rechecked per SSE event instead of once at run creation;
- content entering PostHog or logs;
- raw prompts/provider payloads exposed to subscribers;
- unbounded event/snapshot/session retention;
- missing expiry/reconciliation path;
- migration conflict with Paddle or another concurrent branch;
- secrets, keys, PII, or full source content in fixtures/reviews.

At Phases 1, 3, 4, and 7, require an independent adversarial review before the gate can pass.

## 6. Concurrent Paddle/billing workstream boundary

Another developer may be implementing Paddle. Do not edit Paddle checkout, webhooks, catalog,
invoice, subscription, portal, or payment-provider code.

Ask's boundary is exactly:

- At run creation only, the route/action may call the billing-owned provider-neutral
  `resolveAccessContext()` and receive plain `AccessContext` data.
- Retrieval, rerank, generation, validation, persistence, SSE, cache, and rendering must not
  import billing or Paddle modules.
- Accepted in-flight runs finish under their initial access context; the next run resolves access
  again. SSE/result/cancel endpoints check run ownership, not billing on each event.
- Ask owns run/usage settlement and exposes aggregate analysis units. Billing owns payment state.
- Payment never overrides a SpendGuard cap.

Before any schema generation, inspect concurrent changes and coordinate the migration number.
Phase 7 must wait for the billing-owned access-context contract.

## 7. Phase 0 — measurement, UX honesty, and evaluation foundation

Default starting phase. Complete its implementation gate, checkpoint it, and continue into the
next safe phase under the stacked-branch rules.

### Build

- Add a UUID run identifier and request-scoped monotonic stage timings to the current pipeline.
- Measure currency/window, embedding, vector SQL, lexical SQL, entity SQL, merge, rerank,
  generation, validation, source hydration, and total wrapper time without moving metering.
- Account for the fact that action source hydration happens after `askWithLimits`; finalize only
  the matching run's hydration/total timing. The JSON endpoint has no action hydration.
- Replace rotating client-inferred stages with honest copy such as “Searching and preparing a
  cited answer,” retaining real elapsed time.
- Add privacy-safe `ask_started` plumbing only if the operator approves the new PostHog event;
  otherwise implement the typed event behind a disabled flag or defer it explicitly.
- Pin the applicable route/page action duration only after verifying Next.js 16 behavior.
- Extend the eval runner for an answer-model matrix with retrieval/rerank held fixed.
- Add the eight source-fidelity gold cases from §4. Do not run a paid matrix without approval.

### Critical Gate 0

Required reviews: architecture, metering invariance, measurement validity, source-fidelity fixture
quality, analytics privacy.

Pass only if:

- >99% of new logged terminal rows have run IDs and coherent timings;
- action hydration/total and API wrapper timing are not conflated;
- no paid-call order or output changes;
- no user-facing copy claims a server stage that was not reported;
- fixtures reward accurate naming and exact official facts while failing semantic/identity
  strengthening;
- full unit suite, typecheck, and lint pass.

Write the detailed Gate 0 report. Record the ~$1–3 paid model matrix as enablement-blocked, keep
Auto on today's route, merge the passing measurement/fixture implementation into the integration
branch, and continue to Phase 1.

## 8. Phase 1 — persisted runs, idempotency, atomic allowance and spend

Start after Gate 0's implementation passes; the paid model matrix may remain an explicitly blocked
enablement item because no later phase may change the default model without it.

### Contract freeze before coding

Write a short design note choosing the real-Postgres transaction/lock strategy for:

- atomic user/workspace daily allowance reservation;
- per-call provider budget reservations covering daily and all-time caps;
- exact reservation lifecycle: reserved → started → settled/released;
- a started call that loses its usage frame settling conservatively to its ceiling;
- idempotent replay and exactly-once terminalization;
- `openai_embed` versus `openai_ask` isolation;
- expiry/reconciliation.

Use the architecture review's `provider_usage_reservations` design or justify a demonstrably
safer equivalent. Do not add a run-level provider hold that is counted again by every stage.

### Build

- Persist `ask_runs` before work begins.
- Add a per-user idempotency key; duplicate submit/replay returns the existing run and makes zero
  provider calls.
- Atomically authorize one allowance slot; pre-authorization refusal does not consume it,
  authorized failures/cancellations/expiry do.
- Make SpendGuard reservation asynchronous and atomic immediately before each paid stage, then
  settle actual usage immediately afterward.
- Add lazy expiry/reconciliation with conservative treatment of started calls.
- Shadow-write first; enforce behind `ASK_RUNS_ENFORCE` after a soak.

### Critical Gate 1 — independent adversarial money review required

Use disposable-Neon integration tests, not mocks alone:

- two concurrent requests at the last user slot: exactly one authorizes;
- two concurrent reservations at the daily cap: exactly one wins;
- repeat at the all-time cap;
- duplicate POST, intent replay, refresh, back, and retry: one run/one charge;
- expiry releases unstarted reservations but not a possibly billed started call;
- settlement and terminalization are idempotent under races;
- cap-unset still fails closed;
- existing provider pipelines remain unaffected.

After the independent phase review passes, checkpoint and merge the phase into the integration
branch, update the review index, and continue into the SSE transport spike.

## 9. Phase 2 — progressive retrieval and evidence-first UX

Start after Gate 1 passes and the EvidenceSnapshot schema/retention class is frozen.

### Transport spike before full build

Prove the production-shaped SSE/replay design. A reconnecting invocation must:

1. authenticate and verify run ownership;
2. replay persisted `seq > after` events;
3. tail Postgres with bounded polling and heartbeat comments until terminal state or route cutoff;
4. let the client reconnect with its last sequence;
5. make zero provider calls.

Never depend on an in-memory emitter for reconnect. If the proxy buffers SSE, retain the same run
and event protocol and use bounded polling; do not redesign business state around the transport.

### Build

- Add the typed persisted run-event model and append-only sequence.
- Start lexical retrieval concurrently with embedding/vector retrieval.
- Emit lexical candidates as provisional **candidate claims (keyword pass)**.
- Freeze the hybrid EvidenceSnapshot with claim content, hedging, dates, country, source-document
  IDs, retrieval/window/corpus versions, and selected-evidence state. Bare claim IDs are
  insufficient because digest regeneration replaces them.
- Prefetch source metadata before/alongside synthesis.
- Rework Ask's JS transport to consume run events while retaining the server-action/no-JS
  degradation and free GET prefill contract.
- Show actual counts, sample disclosure, theater/window, current-through date, source diversity,
  and hedge/reliability mix. Do not invent a confidence percentage.
- Keep the final prose whole and terminal in this phase. No model-token streaming yet.

### Critical Gate 2

Required reviews: evidence truth, event state machine, reconnect/idempotency, UI accessibility,
mobile/desktop browser verification, money regression.

Pass only if:

- production-shaped p50 time to first useful candidate is measured and targeted below two seconds;
- all progress text comes from real server events;
- candidate, selected, and cited evidence never share a misleading label;
- refresh/reconnect resumes without a new provider call;
- every candidate is a real stored, non-stub claim with source traceability;
- flag-off behavior preserves the current product.

Write the measured TTFR, retrieval timings, browser screenshots, and gate findings to the review
pack; checkpoint and merge the passing phase, then continue to Phase 3.

## 10. Phase 3 — source-fidelity validation, then validated answer streaming

Start after Gate 2 passes. Implement in two increments under independent flags.

### Increment A: validator with whole-answer release

- Extract the current citation filter, denial-prefix rewrite, refusal, empty, and truncation
  handling into one pure `AnswerValidator` shared by streaming and non-streaming paths.
- Add the §4 source-fidelity matrix. Do not use a second LLM as the sole validator.
- For name-bearing sentences, validate identity/category/predicate/status/certainty/timing and
  governing attribution against the cited EvidenceSnapshot.
- Allow exact one-source official facts. Allow single-source disputed news when attribution and
  hedge are preserved. Reject only the unsupported transformation, not the name.
- Fall back deterministically to cited-claim wording when a transformed sentence fails.
- Ship with whole-answer release first; prove byte/semantic equivalence for existing safe cases.

### Increment B: buffered validated sections

- Stream provider output server-side, buffer sentence/paragraph boundaries, and release only
  sections whose citations and source fidelity validate.
- Preserve the denial-prefix holdback and terminal refusal/truncation behavior.
- A partial citation token never renders.
- A provider error after released content cannot silently switch providers or merge prose.
- Add Stop/cancel and reconnect; settle all billed usage exactly once.
- `ASK_STREAM_ANSWER` defaults off, then moves through an internal cohort only after review.

### Critical Gate 3 — independent red-team required

Red-team at least:

- fabricated citation;
- allegation upgraded to fact;
- wrong namesake;
- PEP/RCA/POI category laundering;
- OpenSanctions name-only match called sanctioned;
- official designation incorrectly suppressed by a two-source rule;
- expired/delisted status presented as current;
- attribution trailing rather than governing the assertion;
- citation marker split across chunks;
- denial, refusal, empty, truncation, timeout, disconnect, cancel, and missing usage frame;
- person named correctly in a safe sentence (must pass; over-suppression is a failure).

Pass only if no unvalidated section renders, supported names remain visible, terminal behavior
matches the current trusted renderer, metering reconciles, and screen readers receive section—not
token—announcements.

Do not enable the streaming flag globally or change the default model. After the offline/cohort
simulation gate passes, mark production enablement blocked, checkpoint the disabled implementation,
merge it into the integration branch, and continue to Phase 4.

## 11. Phase 4 — measured routing, adaptive K, and exact caching

Start after production-shaped stage timings exist. The paid model scorecard is required to enable
Fast or change Auto, but it does not block building a behavior-identical router, disabled routes,
and exact caching.

### Build

- Add a pure versioned router and capability/price registry.
- Auto initially reproduces today's model/K behavior exactly.
- Add Fast only if its full eval—including source fidelity—passes.
- Add Deep as a policy shape; do not make it asynchronous without demand and a separate design.
- Evaluate adaptive K and rerank skipping per intent. Cost or latency alone never passes a route.
- Add per-user exact cache keyed by normalized question, filters/window, retrieval/prompt/policy/
  price versions, and corpus version; store the EvidenceSnapshot so citations remain reproducible
  after claim-ID churn.
- Cache hits show the answer's actual “as of” currency and make zero provider calls.
- Semantic cache remains suggestion-only.

### Critical Gate 4 — independent eval/cache review required

- no Auto route without a recorded passing scorecard;
- source-fidelity pass rate is not worse than baseline;
- exact cache misses on every relevant version/corpus change;
- old cached citations render from their frozen snapshot, never a new unrelated claim ID;
- cross-user/org cache pooling remains off unless explicitly approved;
- report p50/p95 latency, quality, and cost per route—not just averages.

Keep Auto behavior-identical and Fast/Deep disabled without the paid scorecard. Write the cache and
router gate report, checkpoint the safe implementation, and continue to Phase 5.

## 12. Phase 5 — provider-neutral generation/rerank/embedding gateway

Start after the Phase 3 streaming contract and Phase 4 registry are stable on the integration
branch.

- Freeze separate `GenerationProvider`, `RerankProvider`, and `EmbeddingProvider` contracts.
- Extract current OpenAI code into an adapter without behavior change.
- Normalize streaming events, refusal/finish state, provider request ID, retries, all token classes,
  latency, and settled cost.
- Enforce guards inside the adapter boundary so a new provider cannot bypass reservation/metering.
- Add a stub adapter and contract suite first.
- Add a secondary provider only with its key and new fail-closed cap envs configured in all
  environments before deployment, plus a complete scorecard.
- Fallback may occur before first released content; never silently merge after content.
- Add an import-graph rule: product orchestration imports no vendor SDK.

### Gate 5

Independent adapter/metering review, anomalous-output tests, kill-switch tests, provider health and
fallback proof, and byte/semantic equivalence for the extracted OpenAI path. Keep any secondary
provider disabled without keys/caps and a paid scorecard; record its enablement blocker, merge the
passing OpenAI/stub contract implementation, and continue to Phase 6.

## 13. Phase 6 — scoped investigation sessions, not generic chat

Start after persisted runs, snapshots, and events are stable.

- Add sessions/turns as an ordering over immutable runs and snapshot versions.
- Default follow-up is **Ask within this evidence**; explicit **Search wider** creates a new
  snapshot. A deterministic classifier may suggest scope but never overrides the user.
- Reuse turns skip embedding/retrieval/rerank where appropriate but still meter generation.
- Keep bounded deterministic history, turn caps, and explicit session end/new investigation.
- Old turns render their exact snapshot after digest regeneration.
- Implement owner-only delete/export and an approved retention policy before rollout.

### Gate 6

Review scope drift, reproducibility, retention/privacy, deletion, export ownership, token growth,
and per-turn billing. A reuse follow-up must make zero retrieval/embed calls. Keep sessions disabled
without retention approval; merge the passing disabled implementation and continue to Phase 7.

## 14. Phase 7 — processor-neutral entitlements and commercial units

Use the concurrent billing workstream's frozen `resolveAccessContext()` / `AccessContext` contract
if it exists. If it does not, build only the Ask-owned analysis-unit ledger, aggregate interface,
import-graph tests, and a contract-test stub on a separate branch; do not invent or modify Paddle
state, and mark live entitlement integration blocked.

- Resolve access once before run creation; pass plain approved limits/org context downstream.
- No pipeline module imports billing or Paddle.
- Record analysis units separately from vendor cost.
- Keep free Search available when paid Ask is refused.
- Cache/evidence-only unit policy must be explicit and tested.
- Expose aggregate settled usage for billing; do not expose stage internals to Paddle.

### Critical Gate 7 — joint boundary and security review required

Test direct API/action after downgrade, removed member, client-forged plan fields, mid-run plan
change, SSE ownership, entitlement outage, SpendGuard outage, and enforcement-flag rollback. Run an
import-graph check proving Paddle/billing does not enter retrieval/rerank/generation/validation/
events/rendering.

Keep production enforcement off. Write the joint-boundary gate report with beta-grant parity and
reconciliation results if locally available; otherwise record the exact missing billing contract.
Checkpoint all passing Ask-owned work without merging an incomplete billing dependency.

## 15. Reports after each phase and final unattended handoff

Write a detailed, evidence-backed phase and gate report after every phase. Continue working after
the report under §2. When all safe work is complete, return a concise final index containing:

1. phase and outcome;
2. files and migrations changed;
3. tests run with exact counts;
4. measured latency/cost/quality changes;
5. adversarial review findings and fixes;
6. invariant checklist;
7. feature flags and rollback;
8. production/external actions performed—or explicitly not performed;
9. unresolved decisions and debt;
10. commit hash and working-tree status;
11. integration branch HEAD, retained phase branches/worktrees, and anything intentionally not
    merged;
12. exact list of paid/external/production actions not performed;
13. a prioritized operator-review queue for the post-rehearsal review.

Never describe planned work as shipped, never hide a failed gate, and never continue merely to
consume time or budget.
