# AI Search product and architecture review

**Date:** 2026-07-19 (revised same day after an adversarial verification pass against the
repository and a read-only production re-check)
**Scope:** repository inspection, checked-in eval artifacts, read-only production usage
queries, current provider documentation, and product-pattern research. No application code,
paid model calls, deployments, or production writes were performed. The revision re-verified
every code reference against the working tree at commit `9d556cf` and re-ran the read-only
`ask_usage`/`claim_embeddings` accounting queries on 2026-07-19.

**Evidence classes used throughout.** Every load-bearing claim in this document is tagged:

- **[measured]** — a number read from a checked-in artifact or a read-only production query
  reproduced during this review;
- **[code]** — a conclusion that follows from code structure (execution order, awaited calls,
  guard placement), verifiable by reading the cited lines;
- **[hypothesis]** — plausible but unproven without instrumentation; do not act on it as fact;
- **[judgment]** — a product or design opinion.

---

## 1. Executive decision

**BNOW should build an evidence-first search product now and grow it into an investigation
workspace over two to three quarters. It should not build a generic chat product at any
stage.** [judgment]

Concretely, the staged combination is:

1. **Now (Phases 0–3):** the existing `/ask` surface becomes progressively honest — real
   server-reported stages, real candidate claims visible within ~1–2 seconds, a validated
   (never draft-token) streamed answer. The product is still "one question → one cited
   answer," but the proprietary corpus is visible from the first second.
2. **Next (Phases 4–5):** internal Fast/Auto/Deep routing behind provider-neutral seams, with
   exact caching. Product behavior improves (latency, cost) without new surface area.
3. **Then (Phases 6–7):** scoped investigation sessions — follow-ups over a frozen evidence
   snapshot with an explicit "Search wider" escape hatch — and processor-neutral entitlements
   that let the concurrent billing workstream sell it. Sessions are bounded investigations
   with persistent provenance, not an infinite transcript.

Why not generic chat: BNOW's differentiation is traceable, reliability-rated, theater-scoped
evidence (AGENTS.md charter). A chat transcript hides exactly that. Every conversational
feature below is scoped to interrogating a visible evidence set, and every displayed factual
claim keeps its link to stored evidence (standing ruling 2).

The two highest-leverage near-term moves, in order:

1. **Expose the retrieval work BNOW already does.** The pipeline finds and ranks proprietary
   claims before either model call; the user currently sees none of it until everything
   finishes. Showing real candidates early cuts time-to-first-value from ~13 s to ~1–2 s
   without touching a model. [measured latency; judgment on the fix]
2. **Run the answer-model eval.** The final `gpt-5` synthesis stage is ~92.6 % of recorded
   Ask inference cost [measured] and is plausibly the largest latency component [hypothesis —
   production records no stage timings]. A cheaper/faster answer model can only be adopted
   through the existing eval gate (recall, citation accuracy, negative honesty, temporal
   correctness) extended with named-person safety fixtures, which the current 39-question set
   does not contain [measured — set is 24 known-answer / 10 temporal / 5 negative].

---

## 2. Verified current-state architecture

Everything in this section is **[code]** or **[measured]**, re-verified 2026-07-19 against
the working tree. Line references are exact at commit `9d556cf`.

### 2.1 Entry points

| Entry | Cost | Behavior |
|---|---|---|
| `GET /ask?q=…` | $0 | Prefill only. `src/app/ask/page.tsx:25-70` gates via `requireAcceptedUser()` and renders `AskForm`; the file deliberately never imports `askWithLimits`. The `?intent=` one-click handoff (`src/lib/ask/intent.ts`) only lets the client press its own submit button once; a replayed/forged intent finds no sessionStorage entry and stays idle (`src/app/ask/ask-form.tsx:249-273`). |
| `askAction` server action | paid | The only web money path. `src/app/ask/actions.ts:64-145`: re-authenticates, bounds the question to 400 chars, awaits `askWithLimits`, then runs one SQL query hydrating cited+related claim sources, and returns a single complete state object to React via `useActionState` (`src/app/ask/ask-form.tsx:235`). |
| `POST /api/ask` | paid | Synchronous JSON route, `src/app/api/ask/route.ts:8-17`, `maxDuration = 60`. Same gate, same `askWithLimits`. **No web-UI caller exists** (grep-verified); it is an API-shaped duplicate of the action. |
| `GET /search?q=…` | $0 | Executes immediately and deliberately so — `src/app/search/page.tsx:81-88` documents the contrast with `/ask`. Runs `lexicalClaimSearch` (shared module `src/lib/ask/lexical.ts`) capped at `RESULT_LIMIT = 50` (`page.tsx:22`), then one evidence-hydration query (`page.tsx:126-145`). No SpendGuard, no provider call, no `ask_usage` row. |

The `/ask` server action inherits the deployment's default function duration; only the unused
JSON route pins `maxDuration = 60`. Pinning the action's route segment explicitly is a Phase 0
hygiene item (a slow run that exceeds the platform default dies with no usage row — see §2.5).

### 2.2 The synchronous `/ask` pipeline, stage by stage

Every stage below is awaited in sequence; nothing overlaps, nothing is emitted early. [code]

1. **Allowance gate** — `askWithLimits` (`src/lib/ask/limits.ts:235-297`) reads today's
   `ask_usage` rows (`todayUsage`, lines 166-176: per-user count + global cost sum), fails
   **closed** if the read fails, and refuses at `ASK_USER_DAILY_LIMIT` (default 100/user/day)
   or `ASK_GLOBAL_DAILY_BUDGET_USD` (default $10/day) — lines 23-31. The check is
   read-then-act with no lock: N concurrent requests below the threshold all pass (§3, F7).
2. **Currency read + no-coverage short-circuit** — `ask()` (`src/lib/ask/answer.ts:595-620`)
   reads `max(claim_date)` (cached in-process ~5 min, `src/lib/ask/currency.ts`) and returns a
   $0 deterministic answer when the parsed window starts after the corpus (`answer.ts:605-611`).
3. **Hybrid retrieval** — `retrieveV2` (`src/lib/ask/retrieve-v2.ts:73-224`), strictly serial:
   1. deterministic time-window parse + term extraction (lines 77-86);
   2. **vector arm**: embed-guard `init()` + `tryReserve()` → one OpenAI
      `text-embedding-3-small` call (`src/lib/embeddings/client.ts:139-181`, ≤3 retries on
      429/5xx) → pgvector HNSW top-`ASK_VECTOR_TOP` (default 150) cosine query
      (lines 95-131). Any failure degrades to lexical-only, never fatal;
   3. **lexical arm**: `lexicalClaimSearch` (`src/lib/ask/lexical.ts:87-136`) — a COUNT query
      then a rows query, **two sequential round-trips** (lines 117-134), top-`ASK_LEXICAL_TOP`
      (default 150);
   4. union dedupe, then a **third** query for per-claim entities (lines 157-170), composite
      scoring semantic × recency-decay × reliability (`src/lib/ask/composite.ts:51-57`), cap
      at `ASK_CANDIDATES` (default 300), then a **fourth** query for the top-15 entity list
      (lines 192-218).
4. **Rerank** — `rerankCandidates` (`src/lib/ask/rerank.ts:185-307`). Skipped with no call
   when the pool already fits K (`ASK_EVIDENCE_K`, default 60) or offline. Otherwise one
   guarded `gpt-5-mini` structured-output call (reasoning effort `minimal`, 2,000
   max-completion-tokens) with `minItems = maxItems = K` pinned (standing ruling 7) plus a
   required `relevant_count` boundary field (lines 65-84). Fail-safe: any parse/validation
   failure falls back to composite order with the billed usage still recorded (ruling 8,
   lines 235-239). Note `guard.record(1, 1, costUsd)` at line 238 records **1 unit**, not the
   token count — cost is correct, `provider_usage.units` for `openai_ask` is not (§3, F12).
5. **Answer** — `answerFromEvidence` (`src/lib/ask/answer.ts:474-591`). Relevance boundary:
   a successful rerank reporting `relevant_count = 0` stops here with a deterministic
   insufficient payload — the expensive call never happens (lines 494-496). Otherwise the
   evidence is trimmed to the relevant prefix floored at 8 (`trimToRelevantPrefix`,
   lines 392-399), and one guarded non-streaming `gpt-5` Chat Completions call runs with
   `SYSTEM_V2`, reasoning effort `low`, 2,500 max-completion-tokens (lines 526-537). Metering
   happens after the request but **before any read of the body** (ruling 8, lines 542-546).
   Refusal, empty-content, and `finish_reason === "length"` truncation each map to distinct
   states (lines 553-567).
6. **Post-answer validation** — `assembleV2` (lines 411-468): citation markers `[cN]` parsed
   from the answer are kept only if present in the evidence actually shown to the model
   (lines 422-423 — the anti-fabrication filter); a reply that *begins* with recognized
   denial language (first 250 chars, match anchored ≤ index 30 — `beginsWithDenial`,
   lines 92-96) is deterministically rewritten to the shared insufficient copy with citations
   stripped (lines 436-440); related claims are uncited candidates with `vectorScore ≥ 0.5`,
   capped at 5 (`src/lib/ask/related.ts:49-62`).
7. **Usage row** — one `ask_usage` insert per terminal question (`logUsage`,
   `src/lib/ask/limits.ts:180-232`) with per-stage tokens/cost, models, counts, window, and
   state. **A thrown pipeline also writes a row** (state `error`, cost 0) so crashes still
   count against the per-user daily limit (lines 260-279).
8. **Source hydration** — back in `askAction`, one SQL query resolves every cited+related
   claim to its source documents (`src/app/ask/actions.ts:85-142`), **after** synthesis.
9. **Render** — React receives the entire result at once. `AskResult`
   (`src/app/ask/ask-result.tsx:138-233`) renders answer, distinct insufficient/refused
   callouts, sampled/window/currency disclosures, cited and related evidence with source
   panels. Provider/model names are deliberately not shown (lines 197-200).

### 2.3 Models and provider coupling

| Stage | Default | Config knob | Call site |
|---|---|---|---|
| Query embedding | `text-embedding-3-small` | `ASK_EMBED_MODEL` | `src/lib/embeddings/client.ts:139-181` |
| Rerank | `gpt-5-mini` | `ASK_RERANK_MODEL` | `src/lib/ask/rerank.ts:217-229` |
| Answer | `gpt-5` | `ASK_ANSWER_MODEL` | `src/lib/ask/answer.ts:526-537` |

All three stages construct `new OpenAI()` directly. The repository contains **no**
`stream: true`, SSE, `ReadableStream`, or `EventSource` usage anywhere in the app
(grep-verified). The digest pipeline's `AnalysisProvider` seam
(`src/lib/analysis/provider.ts:61-91`) has OpenAI, Anthropic, and stub implementations, but
**Ask does not use it** — its contract (`analyze()` over document batches, non-streaming,
digest-shaped output) does not express Ask's needs. Setting `ANALYSIS_PROVIDER=anthropic`
does not route Ask to Claude: the Ask offline checks (`answer.ts:127`, `rerank.ts:34`,
`retrieve-v2.ts:44`) test for `stub` only, so Ask keeps calling OpenAI whenever a key is
present. Price estimation is a hard-coded table
(`src/lib/ask/limits.ts:49-64`) with a deliberately conservative `{in: 5, out: 15}`
unknown-model fallback.

### 2.4 UI state

`AskForm` is a `useActionState` form. While pending, the `WorkingPanel`
(`src/app/ask/ask-form.tsx:124-183`) shows stage copy driven **only by client elapsed time**
— "searching" < 4 s, "ranking" < 9 s, then "answering" (lines 48-58). The code itself
documents this as an honest estimate, never a server signal. Prior results and example chips
are hidden while pending (lines 287-301). There is no cancel affordance; abandoning means
closing the tab, which the server never learns about.

### 2.5 What is measured today

- `ask_usage` (`src/db/schema.ts:608-647`): per-question provider, models, retrieval mode,
  state, per-stage tokens/cost, candidate/evidence/match counts, window, created_at. Written
  once, at the end. **No started-at, no run ID, no stage timings, no latency of any kind.**
- `provider_usage` (`schema.ts:654-666`): one row per (provider, UTC day) —
  `openai_ask` and `openai_embed` for this path — enforcing the fail-closed daily caps
  (`ASK_USD_CAP_DAILY`, `EMBED_USD_CAP_DAILY`; production values $2 and $1 per
  `docs/CURRENT-STATE.md`).
- PostHog: exactly one Ask lifecycle event, `ask_completed`
  (`src/lib/analytics/events.ts:23`, emitted by `AskCompletedMarker` in
  `src/components/analytics/product-event-markers.tsx:64-86`), carrying only state,
  bucketed evidence count, retrieval mode, and window presence. Evidence interactions
  (`evidence_opened`, `source_link_clicked`, `claim_copied`) carry the `ask_cited` /
  `ask_related` surface. No question, answer, claim, or source text is sent — the allowlist
  sanitizer (`src/lib/analytics/sanitize.ts`) enforces the event property contract.

**Correction to the pre-revision draft:** the draft claimed failed work "can be
underrepresented" in `ask_usage`. In fact every terminal path in code writes a row, including
thrown pipelines (state `error`, cost 0). The real gaps are: (a) a **platform-level
timeout/OOM kill loses the row entirely** because nothing is written at start; (b) a client
disconnect is invisible — the action keeps running and the row is written, but nothing
records that no one saw the answer; (c) in-flight runs are invisible to any query. [code]

### 2.6 Latency and cost evidence

**Eval artifacts [measured].** `docs/evals/ASK-EVAL-2026-07-11.md` (39 questions, corpus of
560 claims at the time; the eval set and per-question raw results are checked in at
`docs/evals/ask-eval-set.json` and `docs/evals/results-*.json`; the runner is
`scripts/ask-eval.ts` + `src/lib/ask/eval-run.ts`):

| Pipeline | Evidence recall | Citation accuracy (evidence-found) | Latency | Cost mean |
|---|---:|---:|---|---:|
| Legacy | 39.4 % | 69.2 % | 2.34 s mean / 1.86 s p50 | $0.0004 |
| v2, K=40 | 87.9 % | 100 % | 11.0 s mean / 9.7 s p50, max 25.5 s | $0.0093 |
| v2, K=60 (prod) | 97.0 % | 96.9 % | see below | $0.0105 |
| v2, K=100 | 93.9 % | 96.8 % | 14.4 s mean / 13.5 s p50, max 36.1 s | $0.0129 |

For K=60 the published scorecard says 12.14 s mean / 10.17 s p50, while recomputing from the
raw checked-in artifact (`results-v2-k60.json`) gives **13.0 s mean / 13.0 s p50 / 27.8 s
max, with 4 of 39 runs over 20 s**. The discrepancy is small but real (likely different runs
or aggregation); treat "p50 ≈ 10–13 s, tail to ~28 s" as the honest current-state statement
and let Phase 0 replace both with production numbers.

**Production accounting [measured, re-run 2026-07-19].** All-time `ask_usage`: 40 rows, of
which 35 carry a billed `gpt-5` answer (31 `answered` + 2 `insufficient` with `gpt-5-mini`
rerank, 2 `answered` without a rerank call). Stage cost totals: answer **$0.3921 (92.6 %)**,
rerank **$0.0297 (7.0 %)**, question embedding **$0.000008**, total $0.4234. The sample is
tiny beta traffic — usable for *ordering* optimization work, not for demand or margin
forecasts. Embedding coverage: 1,516 of 1,516 claims embedded for the active model; newest
claim 2026-07-19.

**What is *not* known [hypothesis until Phase 0]:** the latency shares of embed / vector SQL
/ lexical SQL / entity SQL / rerank / answer / hydration in production. The serial structure
and the eval's legacy-vs-v2 delta make the two model calls the plausible leaders, but no
stored number proves it. Do not claim "gpt-5 is 90 % of latency" from the *cost* split.

### 2.7 Platform constraints that shape the design (Vercel + Next.js App Router)

All [code]/platform-documented, relevant to Phases 1–3:

- **Server actions cannot stream application events.** They return one serialized result to
  `useActionState`. Progressive output requires a Route Handler returning a
  `ReadableStream`/SSE response (supported on Vercel), or client polling.
- **Serverless instances share no memory.** A reconnecting client will land on a different
  invocation; resumable progress therefore requires *persisted* run state/events (DB), not an
  in-process emitter. This makes Phase 1 (run persistence) a hard prerequisite of
  reconnectable streaming, though single-connection streaming can work without it.
- **Function duration is bounded.** The JSON route pins 60 s; the action route inherits the
  deployment default. Any streamed run must fit the route's `maxDuration` or be split into
  background work + polling. Given p50 ≈ 10–13 s and tails ≈ 30 s, a 60–120 s pinned
  duration covers the current pipeline with margin; "asynchronous Deep analysis" (§8) is the
  only mode that would need a queue/cron pattern, and it is deliberately deferred.
- **Client disconnect does not reliably cancel server work.** Cancellation must be explicit
  (a cancel endpoint flipping a persisted flag the orchestrator checks between stages, plus
  `AbortSignal` on provider calls where supported), and billed usage must settle regardless.
- **A GET must stay side-effect-free.** The `/ask` prefill contract (OPEN-TASKS #48) and the
  intent handoff already encode this; every new endpoint must keep paid execution behind an
  explicit authenticated POST.

### 2.8 Standing invariants any progressive design must preserve

From AGENTS.md standing rulings and shipped behavior; restated here because streaming
partial output is exactly where they are easiest to break:

1. No ISW prose or source full text in user-facing output (ruling 1). Ask renders BNOW claim
   text and source URLs/metadata only — streamed chunks must not widen this.
2. Every displayed factual claim traceable to stored evidence (ruling 2). The citation filter
   runs against the frozen evidence set; a streamed chunk released before validation would
   break this. §6 designs around it.
3. Stub/fixture data never renders as fact (ruling 3). Stub answers exist (`provider:
   "stub"`) and stub vectors are never persisted or scored (`retrieve-v2.ts:100`,
   `embeddings/persist.ts`); progressive UI must keep the same exclusions.
4. Every paid call reserves first, fails closed on unset caps, and is metered even when its
   output is discarded (rulings 4, 8). Already true at all three call sites; the run
   protocol must not move metering out of the provider-call boundary.
5. The publication-safety machinery (ruling 19) currently binds the **digest** persist path
   (`guardPublishedEvents`). Ask has **no named-person allegation guard of its own** [code —
   no publication-guard import under `src/lib/ask/` or `src/app/ask/`]; its protections are
   strictly-from-evidence prompting, the citation filter, the denial-lead rewrite, and hedge
   display. This asymmetry is tolerable while the answer arrives whole; it becomes an active
   risk once text streams (§6.3) and is called out as a deliberate gate there.
6. Deterministic degradation (ruling 9): `/ask` never throws to the user; budget stops
   degrade to the deterministic cited-claims path; `LLM_DISABLE=1` produces an honest
   deterministic answer. Every new stage must keep a $0 deterministic fallback.

---

## 3. Architecture critique — ranked findings

Ordered by product impact × confidence. Each carries its evidence class.

| # | Finding | Impact | Confidence |
|---|---|---|---|
| F1 | Time-to-first-value equals total pipeline time (~10–13 s p50, ~28 s tail) | High | High [measured] |
| F2 | Progress display is an elapsed-time fiction, not server state | High | High [code] |
| F3 | Answer stage is ~92.6 % of recorded Ask inference cost | High | High [measured, small n] |
| F4 | Latency attribution is unmeasured in production | High (blocks optimization) | High [code — nothing stored] |
| F5 | Retrieval is needlessly serial (vector→lexical; count→rows; entities after; hydration last) | Medium | High [code] |
| F6 | No run identity/persistence: no idempotency key, no reconnect, timeout loses the usage row, abandonment invisible | Medium–High | High [code] |
| F7 | Concurrency races: allowance gate is read-then-act; SpendGuard "reserve" is a snapshot check, not an atomic hold | Medium (bounded by small caps) | High [code] |
| F8 | Provider coupling: three direct OpenAI call sites, hard-coded price table, no streaming or fallback capability | Medium | High [code] |
| F9 | Zero caching: identical repeated questions re-bill embed+rerank+answer | Medium | High [code] |
| F10 | Streaming-safety machinery is whole-answer-shaped (denial rewrite, refusal, truncation detection) — naive token streaming would break it | High (design constraint) | High [code] |
| F11 | Claim IDs are unstable across digest regeneration — evidence snapshots/caches keyed by claim ID can dangle | Medium now, High for sessions/caching | High [code] |
| F12 | Observability gaps (run/stage/latency/cache/routing fields; see §10) | Medium | High [code] |
| F13 | `$2/day` `ASK_USD_CAP_DAILY` ≈ ~190 gpt-5 answers/day globally — fine for beta, a hard commercial ceiling later | Medium (future) | High [measured cap ÷ measured mean cost] |
| F14 | Cosmetic: rerank records `units = 1` in `provider_usage` instead of tokens (`rerank.ts:238`); cost unaffected | Low | High [code] |

Notes beyond the table:

- **F2** is a trust defect, not just polish: a slow embedding call is labelled "answering,"
  a fast retrieval is labelled "searching." The UI copy admits it is an estimate, but an
  analyst product should report facts ("searched 1,516 claims," "42 candidates from 17
  sources") — never inferred stages and never chain-of-thought.
- **F5, sized honestly:** the parallelizable pieces are one embedding network call vs. two
  lexical SQL round-trips, plus merging the count into the rows query and prefetching
  hydration. These are likely hundreds of milliseconds, not seconds [hypothesis]. Their real
  value is that concurrent lexical retrieval is what makes an honest *early results* event
  possible at ~1 s, independent of total latency.
- **F6/F7 interaction:** because the usage row is written at the end, a user who crashes the
  pipeline gets an error row (good — no free retries), but a platform timeout writes
  nothing; and because neither gate holds a lock, N parallel submits below the caps all run.
  Real exposure today is bounded by the $2/$1 daily provider caps and the 100/day user
  limit; the fix (atomic reservation, Phase 1) matters mostly as the foundation for
  entitlements and larger caps.
- **F11 is new in this revision and load-bearing.** `claims` rows are deleted and re-inserted
  with fresh IDs on digest regeneration (`src/db/schema.ts:819-824`;
  `claim_embeddings` cascade-deletes and is re-filled). Today's `/ask` tolerates this —
  hydration simply drops vanished IDs. But any **evidence snapshot, answer cache, or
  session** keyed by claim ID alone can silently lose or mis-attribute citations after a
  regeneration. Consequences: snapshots must store claim *content* (text, hedging, source
  document IDs — `raw_documents` IDs are stable) alongside claim IDs; caches must be keyed
  by a corpus version and invalidated on regeneration (§9).
- **F10 specifics:** `beginsWithDenial` inspects only the first 250 chars (match anchored
  ≤ 30 chars in), so the denial-rewrite is a *prefix property* decidable early — this is
  what makes buffered streaming feasible (§6.3). Refusal and `length`-truncation are only
  known at the end; a streaming design must therefore be able to retract/replace, or hold
  enough back that retraction is never user-visible.

---

## 4. Refined target architecture

Component names are chosen to fit the repository's conventions; responsibilities are the
contract, names may drift.

### 4.1 Components and responsibilities

```text
Browser (AskRunController — client state machine)
   │ POST /api/ask/runs      (create; idempotency key; returns run id + SSE stream)
   │ GET  /api/ask/runs/:id/events?after=<seq>   (reconnect/replay)
   │ POST /api/ask/runs/:id/cancel
   ▼
Route handlers (thin: auth, legal acceptance, input bounds, entitlement check)
   ▼
AskRunOrchestrator            src/lib/ask/orchestrator.ts (new)
   ├─ UsageReservationService  atomic reserve → settle → release  (evolves SpendGuard store)
   ├─ RetrievalService         concurrent lexical + vector arms; emits partials;
   │    ├─ EmbeddingProvider     freezes the EvidenceSnapshot
   │    └─ (SQL arms)
   ├─ RerankProvider           listwise rerank behind a typed seam (skippable by policy)
   ├─ ModelRouter              deterministic features → route policy + fallback chain + reason
   ├─ GenerationProvider       stream()/generate() with normalized usage & finish metadata
   ├─ AnswerValidator          per-chunk citation validation + prefix denial check +
   │                             terminal refusal/truncation mapping (extracted from answer.ts)
   └─ RunEventStream           persists ask_run_events; fans out to SSE
Persistence: ask_runs / ask_run_events / ask_usage (kept) / provider_usage (kept)
Metering:    UsageLedger = ask_runs settlement columns + existing per-stage ask_usage columns
Analytics:   content-free lifecycle events (allowlisted, §10)
Entitlements: EntitlementProvider — consumes the billing workstream's provider-free module
```

Responsibilities, explicitly:

- **AskRunOrchestrator** — owns the run lifecycle (§5): creates the run row, sequences
  stages, checks the cancel flag between stages, emits events, terminalizes exactly once. It
  contains *no* provider SDK imports and *no* SQL beyond the run tables; stages are injected.
  The existing `ask()`/`answerFromEvidence` composition becomes its stage implementations.
- **RetrievalService** — today's `retrieveV2` with the two arms started concurrently
  (`Promise.allSettled`), the lexical count folded into the rows query (window function), and
  an `onPartial` callback for the lexical-first event. Its output is the **EvidenceSnapshot**.
- **EvidenceSnapshot** — the frozen record of what the model saw: candidate claim IDs *and
  content* (text, hedging, date, iso2, confidence, source doc IDs), selected/relevant
  prefix, counts, window, corpus-current-through, retrieval mode, and a snapshot version.
  Persisted per run (F11 makes content-carrying mandatory). This is also the reuse unit for
  sessions (§7) and caches (§9).
- **RunEventStream** — append-only `ask_run_events` (run id, monotonic seq, type, timestamp,
  content-free payload or claim-ID references) plus an SSE encoder. Replay = `WHERE seq >
  $after ORDER BY seq`. Transient-only data (elapsed ticks) never persists.
- **GenerationProvider / RerankProvider / EmbeddingProvider** — three seams, kept separate
  because their capabilities, pricing, and caching differ. `GenerationProvider` normalizes:
  messages, streaming chunks, finish reason, refusal, provider request ID, retry/429
  metadata, token classes (input/output/cached-input/reasoning), and cost under a versioned
  price catalog. The digest `AnalysisProvider` stays as-is; shared usage/error *types* may be
  extracted, but Ask must not be forced through `analyze()`.
- **ModelRouter** — pure function from deterministic features (§8) to a versioned route
  policy: `{stage models, K, rerank on/off, budget ceiling, reason}` plus an ordered
  fallback chain valid only before first content.
- **UsageReservationService** — two deliberately separate atomic controls (§9.3):
  (a) one user/workspace analysis-unit slot reserved while the run is authorized, and
  (b) one provider-budget reservation made immediately before each paid call, then
  settled to actual usage immediately after that call. SpendGuard's fail-closed env-cap
  semantics remain the provider-budget API; a run-level hold must never be counted again
  by a stage-level check.
- **EntitlementProvider** — the *only* window to billing (§9.4). Invoked exactly once per
  run, at the route/action boundary, to resolve a provider-free access context (org, tier,
  modes allowed, units remaining, limits); the orchestrator and every stage receive that
  context as plain data and never call billing/entitlement services themselves. Never
  exposes any payment-processor object.

### 4.2 What is deliberately not built

- No generic chat memory, no provider-side conversation state as source of truth (provider
  conversation IDs may be an optimization later, never authoritative — portability,
  auditability, retention control).
- No queue/worker infrastructure yet: every mode fits the pinned route duration until
  asynchronous Deep analysis is green-lit.
- No new answer model by default until the eval gate passes (§8).

---

## 5. Event and state model

### 5.1 Run states (persisted, `ask_runs.status`)

```text
created ──> authorized ──> retrieving ──> retrieved ──> reranking ──> generating ──> validating ──> completed
                │              │              │             │              │              │
                └── every non-terminal state may transition to: failed | cancelled | expired
Terminal answer sub-states (ask_runs.state, mirrors today's AnswerState):
  answered | insufficient | refused | error | limit   (+ cancelled, expired)
```

- `created` — row inserted with idempotency key before any work. Replaying the same key
  returns the existing run instead of creating a new one (no automatic second paid call).
- `authorized` — entitlement + allowance + reservation succeeded. Reservation failure →
  terminal `limit` with the honest copy (today's `limitAnswer`).
- `retrieving` → emits `retrieval.lexical_partial` (optional) then `retrieval.completed`
  with the frozen EvidenceSnapshot reference. The $0 short-circuits (no coverage, no
  evidence) jump straight to terminal `insufficient` — identical payloads to today.
- `reranking` → `rerank.completed` (selected IDs + relevant count) or `rerank.skipped`
  (pool ≤ K, offline, policy skip, or fallback-after-billed-call; the event says which,
  internally — the user-facing label stays generic).
- `generating` → `answer.section` events (validated chunks only, §6.3) after
  `answer.first_content`.
- `validating` — the terminal validation pass (final citation filter, denial correction,
  truncation/refusal mapping) before `completed`.
- `expired` — a run that never terminalized within a TTL (e.g., platform kill). A sweep or
  next-read marks it; its reservation is released and its partial spend stays settled from
  the per-stage records. This is the fix for the lost-row gap (§2.5).

### 5.2 Events: persisted vs transient, and user-visible copy

| Event | Persisted | Safe to show |
|---|---|---|
| `run.created` / `run.authorized` | yes | as "Starting…" |
| `retrieval.lexical_partial` | yes (claim IDs + counts) | yes — labelled **candidate claims (keyword pass)** |
| `retrieval.completed` | yes (snapshot ref, counts, scope, currency, mode) | yes — "N candidates from M sources · window · current through D" |
| `rerank.completed` / `rerank.skipped` | yes (IDs, relevant count / skip class) | yes — "Selected K evidence claims" (never partial rerank JSON) |
| `answer.first_content` | yes (timestamp only) | yes |
| `answer.section` | yes (validated text + resolved citation IDs) | yes |
| `answer.validating` | yes | yes — "Checking citations" |
| `run.completed` (state, usage settlement) | yes | yes |
| `run.failed` / `run.cancelled` / `run.expired` | yes (error class, no stack/prompt) | yes — honest terminal copy |
| elapsed-time ticks, provider retry chatter | no | elapsed seconds ok; retries internal-only |

Rules: no chain-of-thought, ever; no provider/model names in user-facing payloads (route and
model live in internal columns); stage descriptions are observable facts and counts only.
Candidate evidence is always labelled differently from selected evidence, and selected from
cited — three distinct visual classes with distinct type names in the payload.

---

## 6. Progressive-results and streaming design

### 6.1 Implementation order (safest first)

1. **Real search status** — server-fact stage events replacing the elapsed-time fiction.
   Zero new trust surface: counts, scope, currency only. (Phase 2)
2. **Lexical partial results** — the $0 arm's top rows as **candidate claims**, clearly
   provisional, with the total-vs-sample disclosure (`totalMatching` already exists). (Phase 2)
3. **Hybrid candidates + early source metadata** — the frozen snapshot with per-claim source
   chips; hydration moves before/alongside generation. (Phase 2)
4. **Selected evidence** — the post-rerank set, labelled selected, replacing (not silently
   reordering) the candidate view. (Phase 2)
5. **Streamed answer sections** — buffered, citation-validated chunks. (Phase 3)
6. **Validated citations finalization + terminal states** — the completing pass. (Phase 3)
7. **Reconnection, then cancellation.** Reconnect is replay of persisted events (needs
   Phase 1); cancel is a persisted flag + settlement. (Phase 3)

Evidence-first UI (steps 1–4) ships value without any streaming-safety risk: everything
shown is deterministic retrieval output that `/search` already shows freely today.

### 6.2 The three candidate policies for answer text

| Policy | Verdict |
|---|---|
| Stream tokens immediately as a labelled draft | **Rejected.** A draft label does not neutralize an unvalidated named-person allegation or a fabricated citation on screen; retraction after display is reputationally too late for this product. Also breaks the denial-rewrite (the "Antarctic defect" fix, `answer.ts:436-440`) which must replace the whole text. |
| Buffer by sentence/paragraph; release each chunk only after its citations validate | **Adopted as the steady state**, with the safeguards in §6.3. |
| Withhold until full validation | **Adopted as the first release** (Phase 3 step 1) and as the permanent fallback whenever a safeguard cannot be met. With evidence-first UI already live, the marginal UX cost of withholding prose is small — the user is reading real evidence meanwhile. |

### 6.3 Safeguards for buffered release (all mandatory before any chunk renders)

1. **Prefix holdback:** hold the first 250 characters until the `beginsWithDenial` check
   (`answer.ts:92-96`) clears — it is a prefix property, so a denial-led reply converts to
   the deterministic insufficient payload *before anything renders*, preserving the
   2026-07-13 remediation exactly.
2. **Per-chunk citation validation:** a chunk is released only when every `[cN]` marker in
   it resolves against the frozen EvidenceSnapshot. A chunk with an unresolved marker holds
   until end-of-stream; at terminalization the whole answer re-runs today's filter and the
   rendered text is atomically reconciled to the final validated answer (identical string in
   the normal case).
3. **Named-person hold rule:** any sentence containing a person-entity from the evidence's
   entity annotations is held until its citations resolve *and* is rendered with the cited
   claims' hedge labels adjacent. Ask still lacks a digest-grade allegation guard (§2.8
   item 5); until an Ask-side equivalent of the ruling-19 attribution check exists, the
   conservative rule is: sentences naming persons never stream ahead of their citations.
   Whether to port `guardPublishedEvents` semantics to Ask synthesis is an open decision
   (§13) — the buffering design must not foreclose it.
4. **Terminal retraction paths:** provider refusal or empty content → the refusal callout
   replaces everything (today's behavior; nothing was shown if holdback rules held);
   `finish_reason: length` with empty content → truncation copy; provider error mid-stream →
   state `error` with the partial *validated* content either removed or explicitly marked
   incomplete — never silently merged with a retry from a different provider (§8).
5. **Metering unchanged:** the stream is consumed server-side; usage is read from the
   stream's terminal usage frame (or measured), recorded before interpretation, and settled
   on terminalization — including disconnects (server keeps consuming to completion or
   cancels and settles; it never leaves a billed call unrecorded). Ruling 8 discipline.

### 6.4 Early-results panel content

Show only defensible facts: exact counts with total-vs-sample disclosure, window echo,
corpus-current-through, unique source count, hedge/reliability mix, theater. No opaque
"confidence %" unless calibrated against a held-out set later. This mirrors what
`/search` and `AskResult` already disclose (`sampled`, `windowEcho`, currency callout) —
extend, don't invent.

### 6.5 Reference patterns

OpenAI deep research shows live steps/sources during long runs; Google AI Mode interleaves
status, links, and follow-ups; NotebookLM grounds answers in inspectable sources. BNOW's
stronger version of all three is reliability/hedge/theater-annotated evidence — the panel
should lead with those, not with activity theater. (Product-pattern context, [judgment].)

---

## 7. Investigation sessions and follow-ups

### 7.1 How sessions differ from generic chat

A session is a **bounded investigation over declared evidence**, not a transcript:

- Its unit of continuity is the **EvidenceSnapshot**, not message history. Follow-ups are
  answered from the snapshot by default; the model never silently drifts to new retrieval.
- Scope is legible: the UI always shows which snapshot (counts, window, theater, corpus
  version) the current answer drew from.
- It ends: sessions have a turn budget and an idle TTL, and "start a new investigation" is a
  first-class action — not an infinitely appended context.

### 7.2 Persisted state

`ask_sessions` (id, user_email, title/derived-from-first-question, created/last-active,
status, retention class) and `ask_turns` (session id, seq, run id FK). Each run already
persists question, snapshot, answer, citations, route/policy version, and settlement
(Phases 1–3), so a session is mostly an ordering over runs plus:

- the follow-up **scope decision** per turn: `reuse` (same snapshot), `expand` (snapshot +
  incremental retrieval, union frozen as a new snapshot version), or `new` (fresh retrieval);
- compacted context: a deterministic structured summary of prior turns (question + answered
  state + cited claim IDs), never raw prior model prose re-fed verbatim beyond a bounded
  window (§7.5).

### 7.3 Evidence reuse vs new retrieval

Default follow-up = **Ask within this evidence**: $0 retrieval, one generation call over the
stored snapshot content. `Search wider` = explicit new retrieval producing a new snapshot
version linked to the session. A deterministic classifier decides when to *suggest* wider
search (question introduces a theater/date/entity absent from the snapshot — computable from
the parsed window, term extraction, and snapshot entity list; no LLM call). The user's
explicit choice always wins; the classifier only routes the default. [judgment on default;
code-supported feasibility]

### 7.4 Citation reproducibility across turns (F11 is the hard problem)

Claim IDs do not survive digest regeneration (§3 F11). Therefore:

- snapshots store claim **content and stable source-document IDs**, not bare claim IDs;
- a turn's citations resolve against *its snapshot version*, so an old turn renders its
  evidence exactly as cited even after the live corpus regenerated;
- when live claim IDs vanish, the UI renders snapshot content with a "as retrieved
  &lt;date&gt;" badge and links to the source documents (stable) rather than the digest
  anchor (unstable);
- "refresh this investigation" is an explicit expand/new action, never automatic.

### 7.5 Context limits and compaction

Per-turn generation input = system prompt + snapshot evidence block (already bounded by K)
+ compacted history (bounded, deterministic — question/state/cited-IDs per prior turn, most
recent turn's answer text allowed verbatim up to a fixed char budget). Hard cap on turns per
session (e.g. 20) before forcing a new session. This keeps input tokens roughly flat per
turn instead of quadratic. [design; exact budgets set in Phase 6 with measured token counts]

### 7.6 Cost implications

Reuse-turns skip embed + retrieval + (usually) rerank — at current accounting that saves the
~7 % rerank share and the latency of retrieval, while the dominant answer-stage cost recurs
per turn [measured share]. So sessions improve *latency and coherence* more than cost;
entitlement pricing should count each generation turn as an analysis unit (§9.4), with
reuse-turns possibly discounted. Provider prompt caching may make the repeated snapshot
prefix cheaper, but only if the evidence block is serialized in a stable order with static
instructions first — record cached-token counts before assuming savings [hypothesis].

### 7.7 Retention and privacy

Question text already persists in `ask_usage` (existing precedent). Sessions add answer text
and snapshots — meaningful new retention surface. Requirements: per-user deletion (a session
delete removes turns, snapshots, and rendered answers; `ask_usage` accounting rows persist
as billing records with the question column subject to the same policy decision), an
operator-set retention window, and export gated to the account owner. No session content
ever reaches PostHog — only counts and scope-decision classes (§10). Retention length and
whether question text in `ask_usage` gets a TTL are **operator decisions** (§13).

---

## 8. Model-routing design

### 8.1 Product modes

**Auto** (default policy), **Fast** (latency-first; never weakens retrieval or citation
validation), **Deep analysis** (larger evidence budget; more analysis units; may later be
asynchronous). "Balanced" is redundant with Auto. Provider/model names stay internal —
`ask_runs` records the exact route; the UI shows only the mode. An Advanced override panel
(admin/enterprise: pinned route, reproducibility) is deferred until a customer needs it —
it belongs behind entitlements, not in the primary UI. [judgment]

### 8.2 Routing inputs (deterministic first, no router LLM call)

From existing computed values: parsed window; term/entity extraction; candidate count and
source diversity; lexical/vector overlap; `relevant_count`; presence of person entities
(named-person sensitivity flag); question length/expected output size; interactive vs deep
request; remaining entitlement units and provider health (rolling error/latency from
`ask_runs`). All are already computed or trivially derivable in the pipeline. [code]

### 8.3 Route-policy output

`{policyVersion, answerModel, rerankModel|skip, K, maxOutputTokens, reasoningEffort,
budgetCeilingUsd, fallbackChain, reason}` — a pure function, versioned in config, recorded
per run. Example shape (targets, all gated on evals, none hard-coded today):

- direct lookup + high-confidence evidence → fast route, K = 12–20, rerank skipped when the
  composite top-K is unambiguous;
- ordinary synthesis → balanced route, adaptive K = 20–40;
- broad comparison/long window → deep route, K up to 60;
- **named-person sensitivity → never a route that has not passed the safety fixture suite**;
- provider unhealthy before first content → next in fallback chain;
- failure after first released content → no silent cross-provider merge; terminal error with
  validated partial handling per §6.3, or a visible restart.

### 8.4 Capability/price registry and gates

A versioned registry (config, not env scatter): model id → capabilities (streaming,
structured output, reasoning control, context), prices by token class, and eval status
(pass/fail per suite + date). Replaces the `PRICES_PER_MTOK` table
(`src/lib/ask/limits.ts:49-64`) as the single pricing source; the unknown-model
conservative fallback stays as the backstop. **Quality gate:** no route/model pair serves
Auto until it passes the Ask eval matrix *plus* the named-person safety fixtures (to be
added — the current set has none, §2.6). **Safety gate:** sensitive-flagged runs restrict to
safety-passed routes. **Cost ceiling:** each route carries a per-run ceiling enforced by the
reservation. No specific model is recommended as the new default here — that is exactly
what the Phase 0 eval decides. [judgment + gate discipline]

### 8.5 Before vs after first streamed content

Fallback/retry is free before `answer.first_content` (user saw nothing; restart the
generation stage on the fallback route, one reservation covering the chain's ceiling).
After first released content, no automatic provider switch: terminalize honestly instead.
This line is bright because merged multi-provider prose cannot be citation-audited as one
generation. [judgment]

---

## 9. Caching, cost, and the usage/entitlement architecture

### 9.1 Cost optimization order (updated from measured data)

1. Route the answer stage (≈ 92.6 % of recorded inference cost [measured]) — via the eval
   gate.
2. Adaptive K (the K-sweep shows non-monotonic quality: K=40 → 87.9 % recall, K=60 → 97.0 %,
   K=100 → 93.9 % [measured]) — per-intent K under the same gate.
3. Skip/replace rerank when confidence is high (≈ 7.0 % of cost [measured]; also removes a
   serial model call from latency [hypothesis until timed]).
4. Exact cache (§9.2). 5. Evidence-snapshot reuse (§7). 6. Conservative semantic cache,
   suggestion-only. 7. SQL round-trip merges (measure first). 8. Provider prompt caching
   (stable prefix required; measure hits before counting savings).

Never weaken hybrid retrieval, traceability, or citation validation to save fractions of a
cent — they are the premium product. [judgment]

### 9.2 Cache inventory

| Cache | Key inputs | Invalidation | Freshness/reproducibility behavior | Expected value | Principal risk |
|---|---|---|---|---|---|
| Normalized exact-query answer cache | normalized question + window + K/policy version + prompt version + retrieval version + **corpus version** | corpus version bump (digest regeneration/new ingest into scope) or any version input change; TTL ≤ corpus cadence | serve with "as of &lt;currency&gt;" shown; cached answer carries its snapshot so citations render from stored content (F11-safe) | High for repeated/demo/team queries; zero marginal risk | staleness misread as fresh → mitigated by visible currency + conservative TTL |
| Query-embedding cache | exact normalized question text + embed model | never (embedding is deterministic per model); evict LRU | n/a | Small $ [measured: embed ≈ $0.000008 total], small latency win (one network call) [hypothesis] | negligible |
| Evidence-snapshot reuse | session-scoped, explicit (§7) | explicit expand/new; corpus version recorded, never auto-refreshed | reproducible by construction (content-carrying snapshots) | High latency win for follow-ups | scope drift → mitigated by classifier + visible scope |
| Answer cache (cross-user) | as exact-query cache + **workspace/user isolation decision** | as above | as above | Moderate | privacy: questions can be sensitive; default per-user, org-pooling only with explicit entitlement decision (§13) |
| Provider prompt caching | provider-managed; requires stable shared prefix ≥ ~1k tokens (static instructions first, evidence last) | provider-managed TTL | n/a | Unknown until cached-token counts are recorded [hypothesis] | assuming savings without measuring |
| Conservative semantic cache | embedding similarity over past normalized questions | same version inputs as exact cache | **suggestion-only**: "a similar answered question exists (age shown)" — never silently served as fresh | Moderate engagement value | OSINT negation/date/entity near-misses are actively dangerous — hence suggestion-only, evaluated before any auto-serve |

Every cache row/version includes the corpus version because of F11: claim IDs in any cached
citation set may dangle after regeneration, so cached entries must either carry snapshot
content or be invalidated on corpus version change.

### 9.3 UsageReservationService and the internal ledger

Present state [code]: `SpendGuard.tryReserve()` is a check against an `init()`-time snapshot
plus in-process counters (`src/lib/usage/spend-guard.ts:105-155`) — correct fail-closed
semantics, but not an atomic hold across concurrent invocations; and the Ask allowance gate
is read-then-act (`limits.ts:242-257`). Both can overshoot near a boundary under
concurrency (bounded today by small caps).

Target: **reserve → settle/release** at two layers that must not be conflated:

1. **User/workspace allowance.** Authorization atomically reserves one analysis slot for the
   run, keyed by `(user/workspace, UTC day, run_id)`. Replays reuse the same slot. Runs refused
   before authorization do not consume a slot, preserving today's behavior; authorized,
   failed, cancelled, and expired runs do consume it, preventing free crash retries. This is
   separate from vendor cost.
2. **Provider spend.** Immediately before each paid embedding, rerank, or generation call,
   an asynchronous `SpendGuard.tryReserve(reservationId, estimatedCeilingUsd)` transaction
   serializes on the provider budget key, reads actual **plus active reserved** spend for the
   relevant daily and total windows, and conditionally inserts a stage reservation. After the
   call, `record(reservationId, actualUsage)` atomically writes actual usage and closes the
   reservation. A call not started releases its reservation; a call that started but lost its
   usage frame settles conservatively to the ceiling pending reconciliation. This retains the
   standing `tryReserve()`-before-call / meter-after-call contract without counting one run hold
   again at every stage.

Use a dedicated `provider_usage_reservations` table rather than only a mutable aggregate column:
`(id, run_id, stage, attempt, provider, day, ceiling_usd, status, actual_usd, created_at,
settled_at)`, unique on `(run_id, stage, attempt)`. The transaction may use a provider-scoped
advisory lock or an equivalent locked budget-counter row; Phase 1 must choose one and prove both
daily and all-time-cap concurrency in real Postgres. `provider_usage` remains the settled
aggregate and source of historical actuals. Embeddings reserve against `openai_embed`; rerank and
answer reserve independently against `openai_ask`.

The **UsageLedger** is `ask_runs` (reserved ceiling, settled cost, customer-facing units,
route/policy/price-catalog version, cache attribution) + the existing per-stage columns in
`ask_usage` (kept for continuity) + `provider_usage` (kept as the cap backstop). Entries are
append-only in effect: adjustments are new events, not mutations of settled numbers.
Maintain both real vendor cost and customer-facing **analysis units** so product pricing
survives provider price changes. Never expose vendor tokens as customer currency. [judgment]

### 9.4 EntitlementProvider and the billing boundary (processor-neutral)

A concurrent workstream is building payment/billing foundations
(`docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md`, uncommitted at review time).
This review deliberately specifies **only the interface between Ask and any billing
system**, and makes no recommendation about checkout, webhooks, catalogs, or Paddle
specifics.

**Access context, resolved once at the boundary (consumed by Ask):** the billing plan
defines a provider-free module (`src/lib/billing/entitlements.ts`, centered on
`resolveAccessContext()`). The integration rule, stated so it cannot drift:

> **The Ask route/action resolves a provider-free access context once, before creating a
> run. The Ask pipeline receives approved limits and organization context as plain data —
> it does not call billing or entitlement services.**

- The run-creation boundary (route handler / server action) composes, in order and all
  fail-closed: authentication, current legal acceptance, access-context resolution
  (tier, modes allowed, remaining analysis units, per-day limits), then reservation. This
  is the *only* place the entitlement module is invoked.
- Retrieval, rerank, generation, validation, and evidence code receive the relevant limits
  inside the run context and **must not import** the billing/entitlement module — enforced
  the same way as the vendor-SDK isolation rule (import-graph test, Phase 5).
- **In-flight policy:** an accepted run finishes even if the subscription changes during
  its short execution; the *next* run resolves the new access state. SSE/polling/result
  endpoints verify **run ownership only** — the billing decision is never re-run per event
  or chunk.
- Customer payment never authorizes exceeding a provider spend cap — SpendGuard remains an
  independent layer (the billing plan states the same rule, its §8.5).

**What Ask emits:** aggregated settled usage per run/turn (units, period, workspace) read
from the UsageLedger — available for later overage invoicing as an aggregate feed.

**Hard boundary rules:** the Ask request pipeline imports no Paddle SDK, sees no webhook
shapes, product IDs, checkout, subscription, or invoice state; entitlements are the local
projection the billing workstream maintains. Billing, conversely, never reaches into Ask
stage internals — it reads the ledger aggregate. Shared-file contact is limited to: the
entitlement module signature (owned by billing), the ledger aggregate view (owned by Ask),
and `src/db/schema.ts` additive sections (coordinate append order, §12).

Fail-closed direction: if entitlement lookup fails in production, paid Ask refuses (limit
state) — mirroring the existing allowance-gate-unavailable behavior (`limits.ts:243-251`).

### 9.5 Commercial packaging sketch (unchanged from draft, still [judgment])

At ~$0.012/question direct cost, restrictive token pricing against $400–$4,000/month plans
creates anxiety, not margin. Sell pooled **standard analyses** per workspace: fast/standard
run = 1 unit; deep/large export = 3–5 units disclosed pre-execution; exact-cache hit and
evidence-only interaction = 0; deterministic `/search` generous within abuse controls.
Overage = prepaid packs (self-serve) / contracted pools (enterprise). Note F13: the current
$2/day `ASK_USD_CAP_DAILY` supports ≈ 190 mean-cost answers/day globally — raising it is an
explicit operator step that should follow, not precede, the reservation ledger.

---

## 10. Instrumentation specification

Rule preserved throughout: **question, answer, claim, and source text never enter PostHog**
(existing allowlist sanitizer contract). Content stays in Postgres.

### 10.1 Database (authoritative; additive migrations only)

`ask_runs` (Phase 1; Phase 0 stopgap adds `run_id`, `started_at`, `stage_timings_ms` to
`ask_usage`):

- identity/linkage: `id` (UUID; also sent as the single opaque run id in client events),
  `user_email`, `idempotency_key` (unique per user), session/turn FK (Phase 6), `question`;
- lifecycle timestamps: created, authorized, retrieval start, lexical-partial, retrieval
  done, rerank done, generation start, **first content**, validated, finished; plus
  cancelled_at, client_disconnected, expired flag. Durations computed from monotonic-clock
  measurements captured in-process (wall timestamps stored for ordering, monotonic deltas
  for stage durations — never subtract wall clocks);
- stage detail: embed/vector/lexical/entity/merge/rerank/generation/validation/hydration
  durations ms; attempts, 429/5xx counts, provider request IDs, timeout/fallback flags per
  stage; finish reason, refusal flag, truncation flag;
- retrieval/quality: candidates, relevant count, evidence K used, cited count, unsupported
  marker count, lexical/vector overlap, source diversity, corpus version/current-through,
  retrieval mode, snapshot version;
- routing: policy version, route reason, mode (Fast/Auto/Deep), fallback chain position;
- economics: token classes per stage (input/output/**cached-input/reasoning** — new),
  estimated vs settled cost, reserved ceiling, analysis units, price-catalog version, cache
  hit type/age;
- terminal: status, answer state, error class (no stack, no prompt text).

Also fix F14 while touching metering: rerank `guard.record()` should pass real token counts
as units.

### 10.2 PostHog (content-free, allowlisted additions to `ProductEventProperties`)

- `ask_started` {mode, window_present, entry: form|intent|session};
- `ask_candidates_viewed` {ttfr_bucket, candidate_count_bucket};
- `ask_answer_first_content` {ttfc_bucket, route_mode};
- `ask_completed` (existing) + {duration_bucket, cache_status, route_mode};
- `ask_failed` / `ask_cancelled` {stage_class, error_class};
- `ask_followup_submitted` {scope_decision: reuse|expand|new, suggested: bool};
- `ask_feedback` {verdict: helpful|not_helpful, issue_class};
- abandonment derived from started-without-completed plus disconnect events.

All properties bucketed/enumerated, extending the existing typed event map
(`src/lib/analytics/events.ts`) so the sanitizer keeps enforcing the schema.

### 10.3 Dashboards / SLOs

p50/p75/p95/p99 for: time to first candidate, time to hybrid complete, time to first
validated content, completion. Segment by route policy, mode, cache status, evidence size,
intent class, theater. North-star operational metrics: **cost per successful cited answer**
and completion rate; product metrics: follow-up rate, evidence-interaction rate, retained
active workspaces. Weekly eval regression runs report alongside (route → quality gates).

---

## 11. Detailed implementation sequence

Dependency-ordered phases. Effort assumes one engineer familiar with the repository,
includes tests and self-review, excludes operator/procurement wait. Every phase obeys the
non-negotiables (§11.9) and ends with the repo's protocol: adversarial diff review, green
`npm test`, decision-log/PROGRESS updates.

**Ordering note vs the draft roadmap:** the phases match the draft's intent but with two
explicit corrections. (a) The evidence-first UI is split across Phases 2–3 exactly at the
streaming-safety line: retrieval events are safe with a single connection, so a degraded
"live progress without reconnect" could ship after Phase 0 alone — but reconnect,
idempotency, and cancel all need run persistence, so Phase 1 lands first to avoid building
the client twice. (b) Exact caching moves after run persistence (Phase 4) because a cache
entry must carry a snapshot + corpus version (F11) — caching before snapshots exist would
be rework.

### 11.0 Implementation-readiness verdict

**Phase 0 is ready to begin now.** Its scope, files, schema addition, tests, paid-eval gate,
acceptance criteria, and rollback are sufficiently specified. The full multi-phase program is
not a single pre-authorized build: each phase has an exit gate, and Phases 3–7 still contain
explicit operator or measured-evidence decisions.

Before Phase 1 application coding begins, the implementing engineer must produce and review two
small contract notes (part of Phase 1's estimate, not a new discovery project):

1. the exact allowance/provider-reservation transaction described in §9.3, including daily and
   all-time lock scope, conservative settlement after a started call loses its usage frame, and
   proof that no reservation is double-counted by a later stage check; and
2. the reconnect transport described in Phase 2: a reconnecting GET invocation replays persisted
   events then tails Postgres until terminal state (bounded polling + SSE heartbeat), rather than
   relying on process-local fanout.

The EvidenceSnapshot shape and retention class must also freeze before the Phase 2 migration, and
migration numbers must be coordinated with the concurrent billing workstream. These are normal
phase-entry decisions with owners and acceptance tests below; they do not block Phase 0.

### Phase 0 — Measurement and benchmark baseline (2–3 days)

- **Objective:** every run gets an ID and stage timings; a signed answer-model scorecard
  exists; no optimization decision is made unmeasured.
- **Dependencies:** none.
- **Files:** `src/lib/ask/limits.ts` (generate run_id, capture started-at, thread a timings
  collector), `src/lib/ask/answer.ts` / `retrieve-v2.ts` / `rerank.ts` (wrap each await
  boundary with monotonic timing into the collector — metering stays inside the provider
  boundary untouched), `src/db/schema.ts` + new migration, `src/lib/analytics/events.ts` +
  `src/components/analytics/product-event-markers.tsx` (ask_started marker),
  `src/app/ask/ask-form.tsx` (emit ask_started; soften pending copy),
  `src/app/ask/actions.ts` (measure post-answer source hydration and finalize the row by
  run_id), `src/app/api/ask/route.ts` (record wrapper total; hydration is not applicable),
  locale catalogs for the copy change, `src/app/ask/page.tsx` route segment (`maxDuration`
  pinned explicitly),
  `scripts/ask-eval.ts` (accept model override matrix; add named-person fixtures to
  `docs/evals/ask-eval-set.json` — additive).
- **Schema (additive migration):** `ask_usage` += `run_id uuid`, `started_at timestamptz`,
  `stage_timings_ms jsonb`, `first_content_at timestamptz` (null until Phase 3),
  `route_policy text` (null until Phase 4).
- **Interfaces:** `interface StageTimings { embedMs, vectorMs, lexicalMs, entityMs, mergeMs,
  rerankMs, answerMs, validateMs, hydrateMs, totalMs }` threaded via an options object —
  no global state (serverless).
- **Steps:** (1) migration; (2) request-scoped timings collector + run_id through
  `askWithLimits` → `ask()` → stages → `logUsage`; after `askWithLimits` returns, the
  server action measures source hydration and updates only that run's `hydrateMs`/`totalMs`
  (the JSON route records its own wrapper total and leaves hydration null); (3) `ask_started`
  client marker + honest pending copy
  ("Searching and preparing a cited answer" + elapsed — stop rotating inferred stage
  labels); (4) pin action-route `maxDuration`; (5) extend eval runner for a model matrix
  (`gpt-5` baseline vs at least one fast candidate on the answer stage only, retrieval and
  rerank held fixed), add ≥ 5 named-person allegation fixtures with gold behavior
  (attribution preserved, hedge shown, no de-hedged restatement); (6) **operator-approved**
  paid eval run (≈ $1–3 at observed per-question costs); write
  `docs/evals/ASK-EVAL-<date>.md`.
- **Tests:** unit — timings present on every logged terminal path (answered/insufficient/
  refused/error/budget/offline), action hydration updates the matching run only, API
  hydration stays null, run_id uniqueness, logUsage column mapping; fixture tests for new
  eval metrics; existing 1,612 stay green.
- **Rollout:** timings are passive columns — no flag. Eval is offline. Copy change is
  cosmetic.
- **Observability:** this phase *is* observability; add a sqlq snippet or admin note for
  p50/p95 from `stage_timings_ms`.
- **Acceptance:** >99 % of new terminal rows carry run_id + timings; a scorecard with
  latency/cost/quality per candidate model exists; named-person fixtures scored; no paid
  call path changed.
- **Rollback:** stop writing the new columns (additive, unread by product code).
- **Risks:** timing collector accidentally moving metering (guard with a test that
  `guard.record` call sites are unchanged); eval spend without approval (gate: operator
  sign-off first).

### Phase 1 — Run persistence, atomic reservation, idempotency (5–7 days)

- **Objective:** every paid run exists in the DB before work starts, terminates exactly
  once (including expiry), cannot be double-created by replay, and reserves spend
  atomically.
- **Dependencies:** Phase 0 (run_id semantics).
- **Files:** new `src/lib/ask/runs.ts` (run row lifecycle: create/authorize/terminalize/
  expire), `src/lib/ask/limits.ts` (atomic user/workspace allowance reservation),
  `src/lib/usage/spend-guard.ts` (asynchronous per-call conditional reserve/settle/release;
  fail-closed env semantics unchanged),
  `src/app/ask/actions.ts` (create run + idempotency key from the form), `src/app/api/ask/
  route.ts` (same), `src/db/schema.ts` + migration.
- **Schema (additive):** `ask_runs` per §10.1 (status/state, timestamps, reservation and
  settlement columns, idempotency key unique per user); `ask_allowance_reservations` (or
  equivalent locked user/day counter); `provider_usage_reservations` per §9.3. Keep
  `provider_usage` as settled actuals rather than making one aggregate reservation column
  carry both per-call identity and cap accounting.
- **Interfaces:**
  `createRun(user, question, idempotencyKey) → {run, replayed: boolean}`;
  `reserveAllowance(subject, day, runId) → ok | refusal`;
  `tryReserve({reservationId, runId, stage, provider, ceilingUsd, caps}) → ok | refusal`;
  `record(reservationId, actualUsage)`; `releaseUnstarted(reservationId)`;
  `expireStaleRuns(ttl)` invoked lazily on read (no new cron yet).
- **Steps:** (1) migration; (2) run-row create at action entry with client-generated
  idempotency key (hidden form field, UUID per submit-gesture; the one-click intent
  handoff reuses its intent UUID so a duplicate dispatch replays instead of re-billing);
  (3) replay path returns the stored terminal result without any pipeline call; (4) swap
  the allowance gate to an atomic authorize-and-reserve operation (only authorized runs
  consume the slot); (5) change every paid stage to its own provider reservation immediately
  before the call and atomic actual settlement immediately after it; (6) lazy expiry marking:
  retain the allowance slot once authorized; release a provider reservation only if its call
  never began, otherwise settle that provider ceiling conservatively.
- **Tests:** unit for allowance and provider reserve/settle/release arithmetic;
  **integration (`src/integration/`, disposable Neon branch): two concurrent allowance
  reservations at the last user slot — exactly one authorizes; two concurrent provider
  reservations near both the daily and all-time cap — exactly one wins**; separate
  `openai_embed` and `openai_ask` reservations do not collide; a run's own reservation is
  not counted twice by its stage guard; replayed idempotency key returns prior result with
  zero new provider calls; expiry releases unstarted reservations but conservatively settles
  a started/no-usage-frame call; every terminal path settles exactly once.
- **Rollout:** flag `ASK_RUNS_ENFORCE=0/1` — rows always written once deployed; enforcement
  (idempotency replay, authorized-run allowance, reservation) flips on after a soak day of
  row-writing in shadow.
- **Observability:** counts of replays, refusals by code, expiries, reservation-vs-settle
  deltas.
- **Acceptance:** a forced duplicate POST bills zero; a simulated timeout leaves an
  `expired` run with its allowance accounted and each provider reservation either released
  (not started) or settled (started); daily and all-time concurrency integration tests are
  green; no stage can spend against another provider's envelope; all existing money tests
  are green.
- **Rollback:** flag off restores current gates (rows keep writing, harmless).
- **Risks:** double-settlement on races (mitigate: reservation status transition is a
  single conditional update); provider-budget deadlock or contention (one documented lock
  order and short transactions); estimate ceiling too tight (derive per-stage ceilings from
  token limits + the versioned price table, not a single whole-run multiplier).

### Phase 2 — Real progressive retrieval (evidence-first UI) (5–8 days)

- **Objective:** the user sees real server facts and real candidate claims while the paid
  stages run; stage copy is never inferred again.
- **Dependencies:** Phase 1 (events persist against runs; reconnect correctness).
- **Files:** new `src/app/api/ask/runs/route.ts` (POST create+authorize → SSE of events) and
  `src/app/api/ask/runs/[id]/events/route.ts` (GET replay `?after=seq`, owner-gated) and
  `.../cancel/route.ts` (POST; Phase 3 wires full semantics, stub here); new
  `src/lib/ask/orchestrator.ts` (extract the `ask()` composition, emit events; `ask()`
  remains as the non-streaming wrapper for the API route and eval runner); new
  `src/lib/ask/events.ts` (typed event union + payload allowlist); `src/lib/ask/
  retrieve-v2.ts` (start vector and lexical arms concurrently via `Promise.allSettled`,
  `onPartial` callback for the lexical page, fold lexical count into the rows query with a
  window count, prefetch source metadata for the top candidates concurrently with rerank);
  `src/db/schema.ts` + migration (`ask_run_events`, plus EvidenceSnapshot persistence —
  jsonb column on `ask_runs` or a `ask_run_evidence` table carrying claim content + doc
  IDs per F11); client: new `src/app/ask/run-controller.ts` + rework `ask-form.tsx` to a
  fetch/SSE state machine for the paid path **while keeping** the plain form GET-prefill
  fallback and the server action as the no-JS degradation; new candidate-preview component
  (distinct from `AskResult`, labelled "candidate claims"); locale keys.
- **Schema (additive):** `ask_run_events(id, run_id, seq, type, at, payload jsonb)` with
  unique (run_id, seq); evidence snapshot storage.
- **Interfaces:** event union per §5.2; `RetrievalService.retrieve(question, {onPartial})
  → EvidenceSnapshot`; snapshot type carries claim content (F11).
- **Steps:** (1) migration; (2) extract orchestrator emitting events into the run tables
  (behind the same pipeline semantics — retrieval/rerank/answer code untouched except the
  concurrency change); (3) concurrency change in `retrieveV2` with a determinism test (same
  union/ranking as serial — order-insensitive merge already holds since the union is a map
  dedupe + composite sort); (4) SSE routes (owner auth = same `requireAcceptedUser` +
  run-owner check; heartbeat comments; `maxDuration` pinned); (5) client controller: submit
  → POST run → render events; disconnect → GET replay; **result rendering still waits for
  the terminal event** (no answer streaming yet — the terminal payload is today's full
  result); reconnect GET first replays `seq > after`, then tails Postgres with bounded
  polling and heartbeat comments until a terminal event or route-duration cutoff; on cutoff
  the client reconnects with its last sequence. No reconnect path relies on process-local
  subscriptions; (6) candidate panel with total-vs-sample disclosure and stub-exclusion
  identical to `/search`.
- **Tests:** unit — event ordering, payload allowlist (a test that event payloads contain
  no prose fields beyond claim text already public in `/search` results), determinism of
  concurrent retrieval, count-fold equivalence (fixture SQL); jsdom — controller state
  machine incl. reconnect replay and mid-run refresh; integration — a full run on a Neon
  branch with stub providers emits the exact event sequence; money test — GET `/ask` and
  forged intents still bill nothing; **replayed SSE connect triggers zero provider calls**.
- **Rollout:** flag `ASK_PROGRESSIVE=0/1` selects the client transport; server action path
  remains fully functional (it *is* the fallback), so rollback is instant.
- **Observability:** time-to-first-candidate and time-to-hybrid land in `ask_runs`;
  `ask_candidates_viewed` client event.
- **Acceptance:** with the flag on: p50 time-to-first-candidate < 2 s on production-shaped
  data; stage UI driven only by server events; candidate vs selected labels distinct;
  refresh mid-run resumes without a second paid call; with the flag off: byte-identical
  current behavior; all traceability/truth-in-UI invariants hold (candidate claims are real
  stored claims only).
- **Rollback:** flag off; event tables are passive.
- **Risks:** SSE buffering by intermediaries (mitigate: heartbeats + `X-Accel-Buffering:
  no` header + verify on the production domain before widening the flag); double transport
  maintenance burden (accepted: the action fallback is also the no-JS story); duplicated
  business rules between orchestrator and `ask()` (mitigate: `ask()` becomes a thin
  wrapper over the orchestrator with a null event sink).

### Phase 3 — Validated answer streaming, cancel, reconnect completion (4–6 days)

- **Objective:** answer text arrives in citation-validated chunks with the §6.3 safeguards;
  cancel and reconnect are complete.
- **Dependencies:** Phase 2.
- **Files:** `src/lib/ask/answer.ts` (answer stage gains a streaming variant behind the
  same guard/metering discipline; extraction of `AnswerValidator` — citation filter,
  `beginsWithDenial` prefix check, terminal mapping — into `src/lib/ask/validator.ts`
  consumed by both streaming and non-streaming paths so they cannot drift);
  `src/lib/ask/orchestrator.ts` (generation stage emits `answer.section`/`validating`);
  cancel route + orchestrator cancel checks + provider `AbortSignal`; client controller
  renders sections + Stop button; locale keys.
- **Schema:** none new (events carry sections; final answer persists as today).
- **Interfaces:** `GenerationStream = AsyncIterable<{type:"delta"|"usage"|"refusal"|
  "finish", …}>` (OpenAI-shaped for now; the Phase 5 seam adopts it);
  `AnswerValidator.releaseableChunks(buffer, snapshot) → {released, held}` pure and
  fixture-tested.
- **Steps:** (1) extract validator with byte-equivalence tests against current outputs;
  (2) streaming call with usage capture on the terminal frame; **metering before
  interpretation** preserved (record on stream end/error with whatever usage the provider
  reported; a stream that dies pre-usage records the estimate ceiling as settled — never
  unrecorded); (3) buffered release: 250-char prefix holdback → denial check → sentence/
  paragraph chunks released only with resolved citations; named-person hold rule (§6.3.3);
  (4) terminal reconciliation replaces rendered text with the final validated answer
  (assert-equal in the normal case); (5) cancel: flag checked between stages + abort during
  generation; settle billed usage; emit `run.cancelled`; UI freezes with honest copy;
  (6) ship first with `ASK_STREAM_ANSWER=0` (withhold-until-validated — §6.2) and flip per
  cohort after soak.
- **Tests:** validator goldens: denial-led reply never renders prose; unresolved-citation
  chunk held; refusal/truncation/empty-content mapping identical to `answerFromEvidence`
  today (reuse its unit fixtures); person-sentence hold; stream-death mid-generation →
  state error, usage recorded, no unvalidated text shown; cancel during each stage settles
  once; jsdom — section rendering, Stop, reconnect mid-generation resumes from persisted
  sections; screen-reader announcements are per-section, not per-token.
- **Rollout:** `ASK_STREAM_ANSWER` flag independent of `ASK_PROGRESSIVE`; default off →
  cohort → default on.
- **Observability:** `first_content_at`, validation holds count, retraction count (must be
  ~0), disconnect/cancel stage histogram.
- **Acceptance:** no streamed chunk ever displays an unresolved citation marker or precedes
  the denial check; refusal/truncation runs render exactly today's callouts; cancel/
  reconnect/replay cannot double-bill (integration-tested); metering totals equal
  non-streaming totals on identical fixtures.
- **Rollback:** flag off returns to Phase 2 behavior (evidence-first + whole answer).
- **Risks:** provider stream lacking a usage frame on error (mitigate: settle the ceiling,
  reconcile from provider dashboard later — recorded conservatively, ruling 8's spirit);
  chunk boundary splitting a citation marker (buffer on sentence boundaries and require
  marker-regex completeness before release).

### Phase 4 — Adaptive routing (Fast/Auto/Deep) and exact caching (5–8 days)

- **Objective:** deterministic route policies with eval-gated models; exact answer/evidence
  caches with honest freshness.
- **Dependencies:** Phase 0 (scorecard) mandatory; Phases 1–3 for run recording of routes
  and cache-carrying snapshots.
- **Files:** new `src/lib/ask/router.ts` (features + policy, versioned) and
  `src/lib/ask/registry.ts` (capability/price registry superseding `PRICES_PER_MTOK`, with
  the conservative unknown fallback retained); `src/lib/ask/config.ts` (mode plumbing);
  `orchestrator.ts` (route selection + recording; rerank-skip path); new
  `src/lib/ask/cache.ts` + migration (`ask_answer_cache` keyed per §9.2 incl. corpus
  version, storing the full result + snapshot); UI mode selector (three options, no model
  names) + cache-hit "as of" badge; eval runner grows per-route gates and a canary report.
- **Schema (additive):** `ask_answer_cache`; `ask_runs.route_policy/route_reason/
  cache_status` already reserved in Phase 0/1 columns.
- **Interfaces:** `route(features) → RoutePolicy` pure; `cacheKey(normalizedQuestion,
  window, policyVersion, promptVersion, retrievalVersion, corpusVersion)`;
  `corpusVersion()` = max(claim id churn marker) — simplest correct: `max(digest
  generated_at)` + claim count, or a dedicated version row bumped by digest persist
  (coordinate: that touches `digest-persist.ts`, keep it a read-only derivation first).
- **Steps:** (1) registry + router with Auto ≡ today's policy (K=60, gpt-5) so the flag-on
  default is behavior-identical; (2) record route per run; (3) Fast route enabled only
  after its scorecard passes the full gate incl. named-person fixtures; adaptive-K
  policies likewise (the K-sweep gives priors: K=40 loses 9 pts recall — per-intent K must
  re-earn the gate); (4) rerank-skip policy (pool ≤ K already skips; add high-confidence
  skip only with an eval showing no recall loss); (5) exact cache read at authorize
  (cache hit → terminal completed run with `cache_status=exact`, zero provider calls, zero
  or discounted units, "as of" shown); write on completed answered runs only;
  (6) canary: Auto-with-new-policy for a cohort, weekly regression eval.
- **Tests:** router determinism table tests; cache key version sensitivity (any input bump
  misses); **cache invalidation on corpus version change (F11 test: regenerate fixtures,
  assert stale entry not served)**; cached result renders citations from stored snapshot
  even when live claim IDs vanished; billing: cache hit records a run with zero provider
  usage.
- **Rollout:** `ASK_ROUTER=0/1` (off = literally current constants); `ASK_EXACT_CACHE=0/1`.
  Mode selector ships only with router on.
- **Observability:** route mix, per-route quality/latency/cost, cache hit rate/age,
  canary-vs-control deltas.
- **Acceptance:** flag-off is byte-identical; no route serves Auto without a recorded
  passing scorecard; cache never serves across a corpus version bump; per-mode p50s
  reported.
- **Rollback:** flags off; cache table passive; registry read-only.
- **Risks:** eval set too small for per-intent K decisions (grow it first — cheap,
  deterministic gold from the harvest script); cache privacy (per-user keying default;
  org-pooled caching is an explicit §13 decision).

### Phase 5 — Provider-neutral gateway (2–3 weeks, interface-first)

- **Objective:** generation/rerank/embedding behind typed seams; one benchmarked secondary
  generation provider; health-aware fallback before first content.
- **Dependencies:** Phase 3 (streaming contract exists to be abstracted); Phase 4 registry.
- **Files:** new `src/lib/llm/` (`generation.ts`, `rerank.ts`, `embedding.ts` interfaces +
  `openai.ts` adapter implementing all three by moving — not rewriting — current call
  code; `anthropic.ts` generation adapter; `stub.ts`); `answer.ts`/`rerank.ts`/
  `embeddings/client.ts` shrink to stage logic over the seams; registry gains provider
  capabilities; internal diagnostics surface (admin-only route or sqlq recipes — provider/
  model/request IDs never render to subscribers, matching `ask-result.tsx:197-200`).
- **Schema:** none (columns exist).
- **Interfaces:** `GenerationProvider.{generate, stream}(req) → normalized {text|chunks,
  finishReason, refusal?, usage: {input, output, cachedInput, reasoning}, requestId,
  attempts}`; `RerankProvider.rank(question, candidates, k) → {ids, relevantCount, usage}`;
  `EmbeddingProvider.embed(texts) → {vectors, usage}`. Guards stay wrapped around every
  adapter call (reserve → call → record), enforced by a shared helper so a new adapter
  cannot skip it.
- **Steps:** (1) freeze interfaces in a short design note (this section is the draft);
  (2) OpenAI adapter by extraction with byte-equivalence fixture tests; (3) Anthropic
  generation adapter (**operator: `ANTHROPIC_API_KEY` still absent — key setup and a
  cap env are prerequisites; fail-closed until set**); (4) benchmark it through the
  Phase 0/4 eval gates; (5) fallback chain executes only before first released content
  (§8.5); (6) llm-params/price knowledge moves into adapters/registry.
- **Tests:** adapter contract suite run against openai/anthropic/stub (same fixtures,
  normalized outputs); metering-on-anomalous-output per adapter (empty, refusal,
  truncated, malformed JSON); fallback-before-content only; no vendor SDK import outside
  `src/lib/llm/` (lint rule or unit test on import graph).
- **Rollout:** adapter swap is invisible (extraction); secondary provider enters only as a
  routed candidate behind the Phase 4 gates.
- **Observability:** per-provider health (rolling 429/5xx/latency from run stage records),
  fallback activations, per-provider cost by token class.
- **Acceptance:** orchestration imports no vendor SDK; identical fixtures produce identical
  metering pre/post extraction; secondary provider has a scorecard; kill-switch/stub
  semantics (ruling 9) intact per adapter.
- **Rollback:** adapters are file-local; revert to prior call sites by flag or revert
  commit.
- **Risks:** normalization lossiness (keep raw provider payload in an internal diagnostic
  column, never user-facing); Anthropic key/cap operator dependency stalls step 3 (rest of
  the phase proceeds — stub adapter proves the seam).

### Phase 6 — Investigation sessions (2–3 weeks)

- **Objective:** §7 shipped: sessions, snapshot-reuse follow-ups, scope classifier,
  compaction, retention controls.
- **Dependencies:** Phases 1–3 (runs, snapshots, events); Phase 4 helpful (route recording
  per turn).
- **Files:** migration (`ask_sessions`, `ask_turns`); `src/lib/ask/sessions.ts` (lifecycle,
  scope classifier, compaction); orchestrator (reuse-turn path skips retrieval, builds the
  evidence block from the stored snapshot); UI: session view, follow-up input, "Ask within
  this evidence" vs "Search wider" affordances, snapshot scope banner, session delete/
  export; analytics events (§10.2).
- **Schema (additive):** per §7.2.
- **Interfaces:** `classifyFollowup(question, snapshot) → reuse|expand|new + reason`
  (pure, fixture-tested); `compactHistory(turns, budget) → string` (deterministic).
- **Steps:** (1) schema + session CRUD with retention class; (2) reuse-turn generation path
  (unit-metered like any run; entitlement units per §9.5); (3) classifier + explicit user
  override; (4) expand path freezes a new snapshot version; (5) compaction with measured
  token budgets; (6) retention: operator-set TTL sweep, user deletion, owner-only export;
  (7) turn cap.
- **Tests:** snapshot reproducibility across a simulated digest regeneration (F11 —
  citations still render from snapshot content); classifier fixture matrix; compaction
  budget properties; deletion removes content but preserves ledger rows; unit accounting
  per turn; money tests for follow-up (each turn exactly one metered generation).
- **Rollout:** `ASK_SESSIONS=0/1`; single-turn behavior unchanged when off (a lone run is
  a session of one internally).
- **Observability:** follow-up rate, scope-decision mix, evidence-reuse rate, turns per
  session, session cost.
- **Acceptance:** a reuse follow-up executes zero retrieval/embed calls; old turns render
  their exact cited evidence after corpus regeneration; retention sweep and deletion
  verified on a disposable branch.
- **Rollback:** flag off; tables passive.
- **Risks:** retention policy undecided (operator gate before enabling beyond
  internal cohort); context drift in compaction (deterministic format + eval fixtures for
  multi-turn honesty).

### Phase 7 — Entitlements and commercial packaging (1–2 weeks Ask-side, after billing lands its module)

- **Objective:** Ask consumes processor-neutral entitlements; analysis units enforced and
  pooled; aggregate usage available to billing. **No Paddle code in this workstream.**
- **Dependencies:** Phase 1 (ledger/reservation); the billing workstream's
  `src/lib/billing/entitlements.ts` module (their §8) with beta analysts seeded via
  explicit grants; Phase 4 (modes to price differently) desirable.
- **Files:** the ask routes/action resolve the access context once via the billing-owned
  module (`resolveAccessContext()`) behind the billing plan's
  `FEATURE_SUBSCRIPTION_ENFORCEMENT` flag, and pass approved limits into the run context —
  no other Ask file imports the entitlement module; `src/lib/ask/units.ts` (unit
  computation per route/cache status); ledger aggregate view (SQL view or query module)
  for billing consumption; UI: remaining-units display, pre-execution unit disclosure for
  Deep.
- **Schema:** `ask_runs.units` column (Phase 1 reserved it or additive now). Billing-owned
  tables are **not** touched here.
- **Steps:** (1) agree the interface freeze with the billing workstream (they own the
  module; Ask codes against a stub of it first); (2) unit computation + recording;
  (3) boundary composition at run creation only (auth + acceptance + access-context
  resolution + reservation, in that order, all fail-closed) — SSE/result/cancel endpoints
  keep run-ownership checks and never invoke the entitlement module; (4) aggregate view +
  reconciliation query (units per workspace per period vs settled cost); (5) UI
  disclosures.
- **Tests:** entitlement-refused run terminalizes as `limit` with honest copy and zero
  provider calls; unit math per route/cache table-tested; enforcement flag off ⇒ current
  beta behavior byte-identical; aggregate view sums match ledger; direct action/API call
  after a downgrade is denied even though the page was previously served; a subscription
  change mid-run does not terminate the accepted run, and the next run resolves the new
  state; the SSE/result endpoint rejects another user but performs no per-event billing
  lookups; import-graph test proves no Ask pipeline module imports billing/entitlements.
- **Rollout:** the billing plan's enforcement flag governs; beta grants first, parity
  proven, then enforcement.
- **Observability:** units consumed by workspace/mode, refusals by entitlement reason,
  reconciliation deltas.
- **Acceptance:** with enforcement off, nothing changes; with it on, a user without grants
  cannot execute a paid run but keeps free `/search`; SpendGuard caps still bind
  independently (payment never overrides a provider cap).
- **Rollback:** enforcement flag off.
- **Risks:** interface drift with the concurrent workstream (mitigation: §12 interface
  freeze — this is the single most important cross-team agreement); double-gating
  confusion (document the gate order in `src/lib/gate.ts`-adjacent comments — but that
  file is billing-workstream contact surface, coordinate edits).

### 11.9 Non-negotiables (verbatim gate list for every phase)

GET `/ask` stays free and prefill-only · no automatic replay can trigger a second paid call
· every paid call reserves first and is metered even on anomalous output · every displayed
factual claim traces to real stored evidence · stub/fixture data never renders as fact · no
ISW prose or source full text in user-facing output · publication-safety semantics cannot
be bypassed by partial streaming (§6.3) · candidate ≠ selected ≠ cited evidence labels ·
provider/model branding stays internal · no question/evidence text to PostHog · applied
migrations are never edited · every phase ships behind a flag or passive columns and is
rollbackable.

---

## 12. Critical path and parallelization

### 12.1 True dependency chain

```text
Phase 0 (measure + eval) ──► Phase 1 (runs/reservation/idempotency) ──► Phase 2 (progressive retrieval)
                                                                              │
Phase 0 scorecard ─────────────► Phase 4 routing (needs 1–3 for recording/caching)
                                                                              ▼
                                                                       Phase 3 (validated streaming)
Phase 3 contract ──► Phase 5 (gateway)          Phases 1–3 ──► Phase 6 (sessions)
Phase 1 ledger + billing module ──► Phase 7 (entitlements)
```

The **critical path to the visible product change** is 0 → 1 → 2 → 3 (~3–4 weeks). The
**critical path to the cost change** is 0 → 4-Fast-route (scorecard permitting), which can
overlap Phase 1–2 engineering because the router's first increment is configuration plus
recording.

### 12.2 Safe parallel tracks

- Eval-set growth + named-person fixtures (Phase 0 item) — independent of all code.
- Phase 5 interface design and the OpenAI-adapter extraction — after Phase 3's stream
  contract stabilizes; the extraction itself is mechanical and test-pinned.
- Phase 6 schema/classifier design — anytime after Phase 2's snapshot shape freezes.
- Registry/price-catalog work — independent once Phase 0 lands `route_policy` columns.

### 12.3 Merge-conflict surfaces (esp. vs the concurrent Paddle/billing workstream)

| File | Risk | Rule |
|---|---|---|
| `src/db/schema.ts` | both workstreams append tables | append-only sections, separate migrations, never renumber; rebase early and often |
| `drizzle/` migration numbering | collision on next index | claim numbers in PROGRESS notes before generating; `9999_claim_source_trigger.sql` stays last (ruling 5) |
| `src/lib/gate.ts` / auth composition | billing composes entitlements into gates | Ask-side phases 1–6 do **not** edit gate.ts; Phase 7 composes via the billing-owned module only |
| `src/lib/ask/limits.ts` | billing plan names it for plan-limit reads | Ask owns it; plan limits reach Ask through the resolved access context at the boundary, never by billing editing Ask files — agreed boundary (§9.4) |
| `docs/PROGRESS.md` / `AGENTS.md` | append-collision | append-only etiquette; short entries |
| `package.json` | dependency additions | none planned Ask-side before Phase 5; note the digest Anthropic provider uses plain `fetch` with no SDK (`src/lib/analysis/anthropic-provider.ts:79`) — Phase 5 may follow the same pattern and add no dependency at all |

**Interfaces to freeze before parallel work begins:** (1) the access-context contract —
`resolveAccessContext()` signature and the `AccessContext` shape (billing-owned; Ask stubs
it), (2) `ask_runs`/`ask_run_events` schema (Ask-owned; billing reads aggregates only),
(3) the event-type union (§5.2), (4) the analysis-unit definition (§9.5). One short joint
note each; disagreements surface now, not in rebase.

### 12.4 What must wait for measured evidence

Any latency claim finer than "the pipeline is serial and slow" (Phase 0); the Fast default
(scorecard); adaptive-K and rerank-skip policies (per-intent evals); prompt-caching and
semantic-cache value (recorded cached-token counts / hit-quality studies); async Deep mode
(demand signal from Deep usage); the `/search`+`/ask` merge (evidence-first UI engagement
data).

---

## 13. Decision log and open questions

### 13.1 Recommended decisions (adopt via normal protocol)

1. Product direction per §1: evidence-first now, investigation workspace next, no generic
   chat.
2. Phase order 0 → 1 → 2 → 3 with 4 overlapping; caching only after snapshots exist (F11).
3. Answer streaming policy: withhold-until-validated first, buffered-validated-chunks as
   steady state, never raw-token drafts (§6.2–6.3).
4. Evidence snapshots carry claim content + stable `raw_documents` IDs, never bare claim
   IDs (F11).
5. Reservation design per §9.3 (conditional-upsert hold inside the SpendGuard contract).
6. Billing boundary per §9.4; Ask stays processor-neutral.

### 13.2 Operator approvals required

- Paid eval runs (Phase 0, ≈$1–3; and each subsequent gate run).
- Any change of the default answer model or K policy (after gates pass).
- Raising `ASK_USD_CAP_DAILY`/`ASK_GLOBAL_DAILY_BUDGET_USD` beyond beta scale (F13) — set
  new cap envs in all Vercel envs *before* deploying code that depends on them (ruling 4
  discipline).
- Session/answer retention policy and any TTL on `ask_usage.question` (§7.7).
- New PostHog events (allowlist additions, §10.2) under the existing analytics rulings.
- Cross-user/org answer-cache pooling (privacy trade, §9.2).
- Anthropic key + cap envs for Phase 5's secondary provider.
- Whether to port ruling-19 (publication-guard) semantics into Ask synthesis as an explicit
  Ask-side allegation guard (§6.3.3) — recommended, but it extends a standing ruling's
  scope, so it is an operator/decision-log call.

### 13.3 Experiments required before deciding

- Answer-model matrix (Phase 0) with named-person fixtures — decides Fast route viability.
- Production stage timings (Phase 0) — decides which serialization fixes are worth doing.
- Per-intent K sweep on a grown eval set — decides adaptive K.
- Cached-input token measurement — decides prompt-caching investment.
- Evidence-first UI engagement (candidates viewed, evidence interactions pre-answer) —
  decides the `/search`+`/ask` merge and alternative-D ("analyze on demand") question.

### 13.4 Unresolved technical questions

- Exact `corpusVersion()` derivation cheap enough to read per request (§Phase 4) without
  touching `digest-persist.ts` in the first iteration.
- SSE viability through the production proxy chain on bnow.net (heartbeat/buffering test is
  a Phase 2 step-1 spike; polling fallback specified if it fails).
- Whether `askAction` remains the permanent no-JS fallback or degrades to prefill+notice
  once the run protocol is default (accessibility review input needed).
- Settlement source of truth when a provider stream dies without a usage frame (Phase 3
  conservative rule stated; revisit with provider request-ID reconciliation).
- Whether the provider-budget transaction should use a provider-scoped advisory lock or a
  dedicated locked counter row (§9.3). Phase 1 must choose one after a disposable-Neon
  concurrency spike; the reservation table and acceptance behavior are fixed either way.

### 13.5 Schedule risks

- **Concurrent billing workstream drift** — highest risk; mitigated only by the §12.3
  interface freezes and early rebases.
- Eval set too weak to gate routing (39 questions, no safety fixtures) — grow it in
  Phase 0 or Phase 4 slips.
- SSE platform surprises → Phase 2/3 fall back to polling (protocol identical, transport
  degraded) — schedule, not architecture, risk.
- Claim-ID churn (F11) surfacing mid-Phase 4/6 if snapshots are skimped — the reason
  snapshots are load-bearing in Phase 2's schema, not deferred.
- Single-engineer assumption: phases estimate 1 FTE familiar with the repo; parallel
  tracks (§12.2) need a second contributor or stretch the calendar, not the estimates.

---

## Appendix A — assumptions retired by this review

1. **"The answer is the product."** The differentiated product is searchable, traceable,
   reliability-rated evidence; synthesis is a lens over it.
2. **"Streaming fixes latency."** It improves time-to-first-content and perceived control;
   total inference time and cost are unchanged, and unsafe streaming damages trust.
3. **"Ask already has multiple providers."** Digest analysis does; Ask is OpenAI-specific
   at three direct call sites [code].
4. **"Chat is the next feature."** Investigation continuity is the need; unbounded chat
   adds cost and provenance drift.
5. **"More evidence always means a better answer."** The K sweep is non-monotonic
   [measured]; K is a routed, eval-gated parameter.
6. **"Inference cost requires tight customer credits now."** ~$0.012/question against
   $400–$4,000 plans [measured]; build the internal ledger first, sell analyst outcomes.
7. **"Model names are a durable product choice."** Sell Fast/Auto/Deep service levels over
   a versioned policy; record exact models internally.
8. **"Failure accounting already works."** Partially true (error rows exist [code]); the
   real gaps are start-of-run persistence, platform-timeout loss, and disconnect
   invisibility — fixed in Phase 1, not by assumption.
9. **"Claim IDs are stable keys."** They are not [code, F11]; snapshots and caches must
   carry content and corpus versions.
