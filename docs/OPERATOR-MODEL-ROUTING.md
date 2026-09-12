# Operator manual — model routing, feature flags and spend caps

Written 2026-09-12 from the code on `main` = production `45fa81f`. This is the plain-language
companion to `.env.example` (the reference), `src/lib/llm/model-config.ts` (the resolver),
`src/lib/llm/analysis-registry.ts` (the quality registry) and
`docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` §9 (the activation checklist). Where
they disagree, the code wins; correct this file in place.

The one sentence to remember: **every model knob fails closed.** A wrong or unapproved value
does not degrade the workload to something cheaper or older — the workload refuses, typed and
loud, until the value is removed. So a mistake costs an outage of that workload, never money.

---

## 1. What is set today

Nothing. As of the 2026-09-11 deploy, **none of the routing or provider envs exist in any
Vercel environment** (verified by the step-27 read-back). Every analysis workload therefore
resolves to the registry's `baseline`: OpenAI `gpt-4o-mini`, no reasoning effort. Ask answers
on `gpt-5`, reranks on `gpt-5-mini`, embeds with `text-embedding-3-small`. `CONFLICTS_UI` is
absent (the `/conflicts` pages answer 404). The Anthropic seam exists in code and has no key,
no price and no approval.

Read the truth at any time, without spending anything:

```
cd /Users/go/code/bnow-net
npx tsx scripts/model-routing-inspect.ts
npx vercel env ls production
```

The inspector prints the resolved (workload, provider, model, effort) matrix and a `dispatch`
column; `BLOCKED` on a row means that workload would refuse at its call site. It reads your
shell env, so prefix a hypothetical to try it before touching Vercel:

```
cd /Users/go/code/bnow-net
REDUCE_MODEL=gpt-5-mini REDUCE_REASONING_EFFORT=medium npx tsx scripts/model-routing-inspect.ts
DIGEST_PROVIDER=anthropic npx tsx scripts/model-routing-inspect.ts
```

Expect: today both print `BLOCKED` for the changed row (no registry approval; no Anthropic
price). That is the correct answer and the reason the manual exists.

## 2. The knobs, by what they control

**Analysis workloads (five):** `map` (per-document claim extraction), `reduce` (map-reduce
digest synthesis votes), `digest` (legacy single-shot digest extraction), `validation` (ISW
scoreboard matcher), `entity_audit` (propose-only entity audit). Each has three envs, read at
call time — `<WORKLOAD>_PROVIDER`, `<WORKLOAD>_MODEL`, `<WORKLOAD>_REASONING_EFFORT` — fifteen
in all, plus `OPENAI_MODEL` as the global fallback for provider `openai` only.

| Env | Values | What happens if set | What happens if wrong |
|---|---|---|---|
| `<WORKLOAD>_PROVIDER` | `openai`; `digest` also admits `anthropic` | Selects the vendor; a non-openai provider also requires an explicit `<WORKLOAD>_MODEL` | Outside the allowlist → refused before any other check |
| `<WORKLOAD>_MODEL` | an exact model id | Overrides `OPENAI_MODEL` and the default for that workload | No exact price in `pricing.ts` OR no registry approval for (workload, provider, model, effort) → refused |
| `<WORKLOAD>_REASONING_EFFORT` | `minimal` `low` `medium` `high` | Only for reasoning models (gpt-5 family, o-series) | Invalid, or set on a non-reasoning model, or not in the approval's allowed efforts → refused |
| `OPENAI_MODEL` | model id | Fallback for every workload whose own `_MODEL` is unset | Same price + approval rule, per workload |

Blank or whitespace values count as absent. **`MAP_*` is hard-locked on top of all this:**
any non-baseline map configuration fails with `MAP ACTIVATION BLOCKED` and no env can lift
it, because a map model change bumps `mapExtractorVersion()` and every consumer of current
claims would starve until the corpus is re-mapped (`scripts/map-remap.ts`, OPEN-TASKS #33).
Changing map is a costed program, not an env change.

**Ask (not routed by model-config; scorecard-gated in `src/lib/ask/registry.ts`):**

| Env | Today | If changed |
|---|---|---|
| `ASK_ANSWER_MODEL` | `gpt-5` | A model with no passing `v2-k60` scorecard is refused before any reservation; `/ask` answers with the deterministic cited-claims fallback (provider `unscorecarded`, billed zero) |
| `ASK_RERANK_MODEL` | `gpt-5-mini` | No `v2-k60-rerank` scorecard → rerank falls back to composite order |
| `ASK_EMBED_MODEL` | `text-embedding-3-small` | No row in `EMBED_PRICES_PER_MTOK` → refused; Ask degrades to lexical retrieval and the backfill script exits non-zero. Existing `claim_embeddings` rows are keyed by model, so a swap also needs a full backfill before vectors return anything |

**Not routing switches, despite the names:** `ANALYSIS_PROVIDER` (`stub` = the offline
extractor for tests; `anthropic` = refused, with a message naming `DIGEST_PROVIDER` — OPEN-TASKS
#83). `DIGEST_PROVIDER=anthropic` is admitted by the allowlist but has no priced or approved
model behind it, so today it is a refusal surface: every legacy digest run fails loud.

**Feature flags:** `CONFLICTS_UI` (absent = `/conflicts/**` 404; the read model is built,
`compound-v1` is ruled to land first — C13-b/C10-b). `ASK_RUNS_SHADOW` and the other Ask
flags are documented in `AGENTS.md`'s credentials table and are not covered here.

**Spend caps (standing ruling 4 — every paid call reserves first and fails closed when its
total cap is unset):** `LLM_SPRINT_USD_CAP` (all-time backstop, per provider row),
`MAP_SPRINT_USD_CAP`, `MAP_USD_CAP_DAILY` (+ the auto-expiring `_OVERRIDE_USD`/`_UNTIL` pair),
`LLM_DIGEST_USD_CAP`, `ASK_USD_CAP_DAILY`, `EMBED_USD_CAP_DAILY`, `X_SPRINT_USD_CAP`,
`X_DAILY_USD_CAP`, `OPENSANCTIONS_CALL_CAP` (a silent 300 default — AUD-28), and the dormant
`CONFLICT_MATCH_USD_CAP_DAILY` (no default; must exist in all Vercel environments before the
`conflict-validate` cron line is ever added). Eval-plane caps (`EVAL_USD_CAP_DAILY`,
`EVAL_DAILY_REQUEST_CAP`, `EVAL_RUN_REQUEST_CAP`, `EVAL_DATABASE_URL`) live in `.env.local`
only and are never set on Vercel. **Ordering rule:** a cap is set before the thing it caps is
enabled, never after.

## 3. Where a refusal shows up

A refused workload leaves evidence in three places, in this order of usefulness:
`cron_runs` (`ok=false`, `error` carries the `ModelConfigError` text naming the workload and the
reason — "refusing to dispatch unpriced", the missing (workload, provider, model, effort)
approval, or "MAP ACTIVATION BLOCKED"), `runtime_logs` (the same message at `error` level, joined
to the invocation by `request_id`; see `docs/SETUP-NEXT-WEEK.md` "Reading the drain"), and
the absence of a `provider_usage` row for that provider/day (nothing was reserved). Ask
refusals are quieter: `/ask` still answers, with provider `unscorecarded` in its attribution.

```
cd /Users/go/code/bnow-net
npx tsx scripts/sqlq.ts "SELECT job, started_at, ok, left(error,160) AS err FROM cron_runs WHERE ok = false AND started_at > now() - interval '24 hours' ORDER BY started_at DESC LIMIT 20"
npx tsx scripts/sqlq.ts "SELECT provider, day::text, requests, round(est_usd::numeric,4) AS usd FROM provider_usage WHERE day >= CURRENT_DATE - 1 ORDER BY 2 DESC, 1"
```

## 4. When to change a model — the triggers

There is no calendar for model changes and there should not be one. A change starts from one
of four triggers, each recorded as a decision-log entry before any evaluation spend:

1. **Cost.** A workload's `provider_usage` line is the dominant daily spend and a candidate
   with a verified price would cut it materially at equal quality. Evidence: 30 days of
   `provider_usage`, not one day.
2. **Quality.** A scorecard, the K=5 A/B gate, or the audit's named-person / hedging fixtures
   show the baseline failing on something a candidate is expected to fix. Evidence: the
   eval artefact, committed under `docs/evals/`.
3. **Deprecation.** OpenAI announces retirement of `gpt-4o-mini`, `gpt-5`, `gpt-5-mini` or
   `text-embedding-3-small`. This is the only trigger with a deadline; start the ladder the
   week the notice arrives, because step 3 below takes days.
4. **Provider risk.** An outage or policy change makes single-vendor dependence unacceptable
   for a workload; the Anthropic `digest` seam exists for exactly this, and it still has to
   climb the ladder like anything else.

A trigger that is none of these — a new model looks interesting, a price cut was announced,
a session suggests it — is not a reason to touch production. Run it on the eval plane or
leave it.

## 5. The change ladder (per model, per workload, in order — no step may be skipped)

1. **Price it.** Operator-verified input/output price in `src/lib/llm/pricing.ts`
   `PRICES_PER_MTOK` (embeddings: `EMBED_PRICES_PER_MTOK`), with the source of the number in
   the PR. Pricing is not approval.
2. **Probe compatibility.** One guarded, capped call proving the payload shape (temperature
   handling, effort accepted, structured output honoured). The eval CLI does this under
   `EVAL_*` caps against a disposable Neon branch (`--db-ack <host>`); `DATABASE_URL` is never
   read in live mode.
3. **Evaluate, paid, inside caps.** The representative evaluation over the dimensions in the
   routing-seams review §9 (extraction recall, under-fill rate, schema validity, citation
   fidelity, named-person fidelity, hedging preservation, variance across K=5, cost vs
   estimate, latency). For Ask: the `v2-k60` / `v2-k60-rerank` suites. Every run appends to
   `docs/reviews/EVAL-EXPOSURE-LEDGER.md`. This step needs an explicit spend authorization
   from the operator, sized in requests and dollars, before it starts.
4. **Approve.** A registry entry with status `evaluated_candidate` for the exact (workload,
   provider, model, allowed efforts), in a reviewed PR that links the eval artefact; for Ask,
   the scorecard entry. Map additionally needs the costed corpus re-map plan.
5. **Authorize and record.** Spend-cap review, operator authorization, decision-log entry
   naming the env values to be set.
6. **Set, deploy, watch.** Set the env in Production (Preview too if it should match), then
   **redeploy** — functions read env at deploy time, an env change alone changes nothing.
   Then read the next scheduled window for that workload (`cron_runs` ok, `provider_usage`
   row present with `requests > 0`, no new error signature in `runtime_logs`).

Steps 1–4 are `main` changes and go through the ordinary gate and PR; only steps 5–6 touch
Vercel. `main` can carry a priced, approved candidate for weeks without production using it —
the env is the switch.

## 6. Rollback

Unset the workload's env(s) in Vercel and redeploy. Resolution returns to
`OPENAI_MODEL`/baseline immediately; nothing persisted needs cleaning up because
`provider_usage` rows are per provider/day and claim rows are versioned. The one exception is
map: rows written under a different `mapExtractorVersion()` persist (append-only) and
consumers filter back to the baseline version automatically, but any re-map spend is sunk.
Ask embeddings: rolling back `ASK_EMBED_MODEL` restores retrieval only if the old model's
`claim_embeddings` rows were kept (they are, unless a backfill deleted them — it does not).

## 7. Things that look like a model change and are not

- **Raising or lowering a cap** is an env change plus redeploy, no ladder — but it is a
  decision-log entry (ruling 4) and it must never enable an unset base cap.
- **`REDUCE_VOTES`** is not a model change but the K=5 gate exists because K=3 variance
  failed; a model change must re-run that gate before this is touched.
- **Blanking a key** (`OPENSANCTIONS_API_KEY`, 2026-09-12) stops a provider without a code
  change; the code's missing-key path applies at the next deploy. Record it in OPEN-TASKS.
- **Adding a provider to an allowlist** is a reviewed PR and a decision-log entry, and
  approves nothing.
