# ASK Tier-2+ — hybrid retrieval + rerank + frontier answerer (2026-07-11)

Unattended supervisor session; branch `20260711-ask-tier2plus` (local only — NOT
pushed, NOT merged, NOT deployed). Basis: `docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md`.
Everything below was implemented by workstream subagents, reviewed (C and E
additionally by independent adversarial reviewers — both verdicts SHIP), gated
(typecheck + lint + full unit suite green at every commit), and committed by the
supervisor.

## What shipped (per workstream, one commit each unless noted)

| WS | Commit | Contents | Tests |
|---|---|---|---|
| — | `39ab6b4` | Frozen stage-interface contract `src/lib/ask/types.ts` + assessment doc import | — |
| G | `75cf73d` | `ask-result.tsx` presentational component: insufficient/refused callouts, D9 sampling disclosure, window echo, related-claims block; `ask.*` i18n keys en+uk (ALL uk strings flagged for native review) | +16 |
| F1 | `831da70`+`2988303` | Eval-set harvest tooling (stratified sampler, estimate-gated gpt-5-mini question generation, negative-control probe); round-1 fix: theater-starvation bug (two-level round-robin, ru/ua/ir-only) | +22 |
| A | `5e2b734` | `claim_embeddings` (migration **0014_ask_embeddings**: table + HNSW cosine + GIN FTS on claims.text), guarded batch embed client with deterministic in-memory-only stub vectors, resumable backfill script, fail-open embed hook in `digest-persist.ts` | +33 |
| B | `4db71d0` | `parseTimeWindow` (deterministic, zero-LLM), `retrieveV2` hybrid vector∪lexical candidates + composite pre-rank (half-life 30d), `config.ts` env knobs; `retrieve.ts` byte-identical (legacy rollback) | +50 |
| — | `113a6da` | Curated eval set: 24 known-answer + 10 temporal + 5 negative (fixtures + harvest sample) | — |
| C+D+E | `cea8cac` | Rerank stage (listwise gpt-5-mini, id-validated, composite fallback), answer stage (gpt-5, refusal handling, enriched evidence serialization, related claims), dual-gate metering (ask budget + SpendGuard `openai_ask`), ask_usage per-stage columns (migration **0015_ask_usage_stages**), gpt-5 price table, D2 budget defaults (100 q/user/day, $10/day global) | +~90 |
| F2 | `6c5ac69` | Eval runner: resumable-by-key sweep, K-sensitivity, D4 gate computation, markdown scorecard | +39 |

Final suite: 739 tests / 60 files green (baseline was 506/44).

## Eval gate (D4) — PASSED; default FLIPPED to v2 (`cfb0697`)

Scorecard: `docs/evals/ASK-EVAL-2026-07-11.md` (39 questions: 24 known-answer
paraphrases, 10 temporal, 5 verified negatives; frozen Neon branch, 765-claim corpus).

| criterion | required | measured | verdict |
|---|---|---|---|
| evidence recall, v2@60 vs legacy@40 | ≥ +15pts | **97.0% vs 39.4% (+57.6pts)** | PASS |
| negative-control honesty (v2) | ≥ 4/5 | **5/5** (legacy 4/5) | PASS |
| citation accuracy not worse | both denominators | **93.9%/96.9% vs 27.3%/69.2%** | PASS |

Supporting: candidate recall 100% vs 39.4%; window-echo 10/10 vs 0/10; K-sweep
picked **K=60** (recall 97.0 vs 87.9 @K40 and 93.9 @K100); measured v2 cost
$0.0105/query mean (heuristic was $0.014), latency p50 ~10s (gpt-5, effort low).
`ASK_PIPELINE=legacy` (exact match) is the instant rollback.

**Two sweeps were needed — sweep #1 failed the gate and the diagnosis produced
real fixes (`fac6743`):** (1) the honesty metric required empty citations, but
gpt-5 honestly denies WHILE citing the claims it checked — recalibrated to
denial-language detection (both actual answers are test fixtures); (2) gpt-5's
reasoning tokens stochastically consumed the 1200-token output ceiling on broad
questions → empty content misreported as "refused" — ceiling now 2500 and
truncation (finish_reason "length") is a distinct state from refusal; (3) the
rerank schema violated standing ruling 7 (minItems 1 let gpt-5-mini under-fill,
mass composite fallbacks) — now pinned exactly-k. Sweep #2 after fixes = the
gate table above, 0 degraded runs.

## Live verification (§9, all on the Neon branch)

- **Offline integrity 5/5, $0:** v2+stub / v2+no-key / v2+LLM_DISABLE all serve
  deterministic answers citing real claims through the v2 code path (mode
  v2-lexical-only, window echo intact, $0); legacy+stub reproduces the legacy
  shape; v2+tiny-caps+real-key refuses every paid call (provider "budget", $0)
  and still answers from real claims.
- **Money-path smoke ($0.13):** 10 questions through `askWithLimits` — every
  `ask_usage` row carries per-stage costs summing exactly to `cost_usd`,
  retrieval_mode/state/rerank_used/models/candidates/evidence/window columns all
  correct; both rerank outcomes observed (billed model recorded even when its
  output was discarded); negatives denied honestly with receipts. The smoke also
  caught migration 0015 missing on the branch — during which the DB-outage
  hardening returned answers with a warn instead of 500ing, a live validation of
  that fix. **Ops note: apply BOTH 0014 and 0015 (they landed in different waves).**
- **`sampled` disclosure never fired live** — the 765-claim corpus maxes at ~271
  matches, under the 300 candidate cap. Unit-tested (assembly + UI component);
  will fire as the corpus grows.
- **Call-site audit:** every v2 stage + embed call is SpendGuard-wrapped with an
  output ceiling. The LEGACY answer call remains unguarded and ceiling-less —
  DL-6 faithful-rollback decision, first-gated by the ask daily budget; dies with
  the legacy path.

## Decision Ledger (supervisor rulings during the build)

- **DL-1 (D7 adaptation):** gpt-5-family models reject non-default temperature and
  use `max_completion_tokens` (reasoning tokens bill as output). Per-model param
  mapper `src/lib/ask/llm-params.ts`: gpt-5* → max_completion_tokens (answer 1200,
  reasoning_effort low; rerank 2000, effort minimal); others → max_tokens 700 +
  temperature 0.1. Verified in the live sweep.
- **DL-2:** stub pseudo-vectors are in-memory only; `claim_embeddings` rows only
  ever carry real-model vectors (ruling-3 analog, enforced in embeddings/persist.ts).
- **DL-3:** A owned migration 0014 (embeddings + lexical GIN); E owned 0015
  (ask_usage columns) — single-owner-per-wave on schema.ts.
- **DL-4:** HNSW over ivfflat (ivfflat needs training data; degenerate on a
  small/empty table; HNSW builds incrementally).
- **DL-5:** legacy entity/claim SQL duplicated into retrieve-v2.ts rather than
  refactoring retrieve.ts (byte-identical rollback beats DRY here).
- **DL-6 (D3 interpretation):** the legacy path is a FAITHFUL rollback — it keeps
  today's `OPENAI_MODEL ?? gpt-4o-mini`, its missing max_tokens, and its exact
  strings. Every D7 improvement is v2-only. Known legacy gap: still no output
  ceiling (pre-existing; fixed only in v2).
- **DL-7:** eval gold answers resolve by claim TEXT (claim ids roll on digest
  regeneration); harvest and eval both ran against one frozen Neon branch.
- **DL-8:** new fail-closed cap envs (see pending-decisions): production without
  them = ask/embed paths refuse (vector arm silently lexical-only, answer degrades
  deterministic) — correct per ruling 4, but dark. Set envs BEFORE flipping v2.
- **DL-9:** types.ts extended mid-wave with optional candidatesCount/rerankModel/
  answerModel (E's ask_usage columns needed a contract source; D populates them).
- **Post-review touch-ups (supervisor):** rerank.ts + answer.ts record spend BEFORE
  reading the response body (billed-but-unrecorded shape-anomaly gap, C-review
  finding); limits.ts DB-outage hardening (gate unavailable = fail-closed refusal
  without a 500; lost log row never eats a paid answer; error-row insert failure
  no longer masks the original error) + the DL-9 column mapping (E-review findings
  1–3), all with tests (+5).

## Subagent Q&A ledger (non-trivial)

- F1 asked how to populate `acceptableAlternates` at generation time → ruled: empty
  at harvest, supervisor fills from real retrieval output later; eval scores on
  `gold` only this round.
- E asked where rerank_model/answer_model/candidates_count come from → DL-9.
- C flagged two design calls (wrong-shape JSON = parse-failure-with-usage; silent
  offline short-circuits) → adversarial reviewer ruled both SOUND; kept.
- F2 asked which citation-accuracy denominator gates → conservative: BOTH must not
  regress.
- D noted `eval-set.ts` carries an older, divergent `chatParamsForModel` used only
  by the harvest script → left; consolidation candidate.

## Adversarial review outcomes

- **C (rerank):** SHIP. 1 PLAUSIBLE low finding (record-before-choices-read) — fixed.
  2 informational notes (rerank trusts upstream dedup; constructor-call not asserted
  in tests) — accepted as-is.
- **E (money path):** SHIP. Findings 1–3 fixed (see touch-ups). Finding 4 (two
  same-value test blind spots) accepted. Finding 5: AGENTS.md "capped 20/user/day,
  $1/day" is now stale vs the D2 code defaults — **not corrected here** (this
  session may not edit AGENTS.md); correct on merge. Finding 6 (raw e.message in
  error answers) is pre-existing behavior, unchanged.

## Parked / follow-ups (no half-landed diffs)

- **doc_claims as a retrieval corpus** (~19K map-stage claims vs the 765 digest
  claims ASK searches): out of scope per D5, but it is the obvious next corpus
  expansion — the `claim_embeddings` design (model column, cascade) ports directly.
- **Entity "pressure" ranking oddity** (prosecution-role counts ranking entities for
  geopolitical questions): retained as-is in BOTH pipelines by spec; revisit.
- **Legacy ask path still has no max_tokens** (DL-6): rollback fidelity kept it;
  dies with the legacy path.
- **`eval-set.ts` vs `llm-params.ts`** duplicate param mappers: consolidate onto
  llm-params.ts next time the harvest script is touched.
- **Route-level try/catch** (`/api/ask/route.ts`): askWithLimits no longer throws in
  practice after the hardening; a belt-and-braces route catch was deemed out of
  scope (route untouched by design — G's spec).

## PENDING GREGORY DECISIONS (in order, before/at deploy of this branch)

1. **Merge order vs the design branch** (`20260711-design-commercial-site`): BOTH
   branches minted a migration numbered **0014** (this branch: `0014_ask_embeddings`
   + `0015_ask_usage_stages`; design: its own 0014). **Whichever branch merges
   second must renumber its migration files to follow the first branch's highest
   number** — rename the .sql files AND fix the `tag` entries appended to
   `drizzle/meta/_journal.json` (and the snapshot filenames) so the journal stays
   monotonic; then `npm run db:migrate` applies them in order. Nothing has been
   applied to prod from either branch.
2. **Apply migrations to prod** (after merge): `npm run db:migrate` (0014 embeddings
   + 0015 ask_usage as renumbered). Both purely additive; trigger 9999 untouched.
3. **Run the embedding backfill against prod** after migration:
   `LLM_SPRINT_USD_CAP=1 EMBED_USD_CAP_DAILY=1 npx tsx scripts/backfill-embeddings.ts --apply`
   — measured cost on the branch: **$0.0003 for all 765 claims** (est. stays <$0.01
   as the corpus grows this month). Idempotent + checkpoint-resumable.
4. **Set Vercel envs BEFORE flipping the pipeline** (ruling 4: cap envs precede the
   guard that reads them — unset caps = vector arm dark + answer degrading):
   `ASK_USD_CAP_DAILY` (suggest 2), `EMBED_USD_CAP_DAILY` (suggest 1), and the
   D2 live values `ASK_GLOBAL_DAILY_BUDGET_USD=10` + `ASK_USER_DAILY_LIMIT=100`
   (code defaults now match, so setting them is documentation), plus optionally
   `ASK_ANSWER_MODEL` / `ASK_RERANK_MODEL` / `ASK_PIPELINE` overrides. Note
   `LLM_SPRINT_USD_CAP` (existing) now also backstops ask+embed providers —
   its current prod value bounds three more call sites.
5. **The flip itself**: if the D4 gate passed (see above) the code default may
   already be v2 on this branch — the live rollback is `ASK_PIPELINE=legacy` in
   Vercel env (plain var, readable — set it type=plain, not Sensitive).
6. **Ukrainian strings**: all 10 new `ask.*` uk strings are marked
   `// uk: needs native review` in dictionaries.ts.
7. **AGENTS.md corrections on merge**: /ask caps line ("capped 20/user/day, $1/day
   global" → 100/$10 defaults + the new cap-env list); add ask/embed provider rows
   to the credentials table if desired.
8. **Neon eval branch** `br-misty-paper-at0u3mxi`: deleted at session end (results
   preserved in docs/evals/). If it still exists, delete via
   `npx tsx scripts/neon-branch.ts delete br-misty-paper-at0u3mxi`.

## Cost & runbook facts

- **OpenAI spend this session ≈ $2.91 of the $25 cap** (branch provider_usage
  ledger: openai_ask $2.88 / openai_embed $0.0004; plus ~$0.02 legacy-path sweep
  calls and $0.0045 harvest generation, both outside SpendGuard by design).
  Breakdown: backfill $0.0003 · question generation $0.0045 · sweep #1 $1.31 ·
  diagnostics $0.05 · sweep #2 $1.29 · smokes $0.21.
- Per-query v2 cost measured: **$0.0105 mean / $0.0091 p50** (gpt-5 answering
  over K=60; ~$0.003 expected with gpt-5-mini via `ASK_ANSWER_MODEL`). Latency
  p50 ~10s — worth watching; `ASK_ANSWER_MODEL=gpt-5-mini` roughly halves it.
- Embedding a claim costs ~4×10⁻⁷ USD; the digest-persist hook adds ~$0.0001/day
  at current claim volume (fail-open, never blocks persist).
- Eval reruns are resumable and cheap: full 4-config sweep ≈ $1.35; targeted
  `--only` reruns pennies. The eval set + per-question results (with answer
  snippets for audit) are committed under `docs/evals/`.
