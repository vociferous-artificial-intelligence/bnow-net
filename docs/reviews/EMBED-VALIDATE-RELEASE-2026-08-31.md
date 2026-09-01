# #97 embeddings + validation release — implementation, reviews, deploy, observation (2026-08-31 → 09-01)

The last two LIVE provider-bound UTF-16 truncation sites under the #97
umbrella — `src/lib/embeddings/client.ts` `truncateInput` and the
`src/lib/validation/llm-match.ts` `buildMatchUserPrompt` takeaway/claim clips —
routed through the shared `wellFormedSlice` and shipped as PR #37. The release
was interrupted mid-flight by the map flood OOM incident (its own record:
`docs/reviews/MAP-FLOOD-OOM-INCIDENT-2026-08-31.md`): the pre-merge health
recheck caught the outage and the merge was HELD until recovery gates passed.

## 1. The repair

- `truncateInput`: budget stays 2,000 UTF-16 code units; a pair straddling the
  cutoff loses only its orphaned half; an isolated surrogate is repaired even
  under the limit; well-formed in-limit input is returned unchanged
  (identity). EXPOSURE CORRECTION recorded in OPEN-TASKS #97: this is a
  DAILY-exercised paid path — `digest-persist.ts` embeds every new claim
  (28–41 `openai_embed` requests/day at digest cron times) — not the "lowest
  exposure" backstop earlier drafts called it.
- `buildMatchUserPrompt`: whitespace-collapse-BEFORE-clip order preserved;
  400/300 code-unit budgets preserved; no trim introduced; valid-input prompt
  bytes byte-identical (test-pinned). A straddle/orphan previously poisoned
  the whole request as a lone `\udXXX` escape — at this site failing QUIETLY
  to the keyword matcher (ruling 9).
- Consumers inherit by design: the analysis-eval control plane and the dormant
  conflict matcher import the real builder; all six committed
  promptHash/schemaVersion identities recomputed and MATCH.
- Documented dispositions: repaired-to-empty rides the pre-existing
  empty-input provider path (definitive 400, $0-settled, never retried — no
  new policy); stub vectors for previously-malformed text seed from the
  repaired form (in-memory only, never persisted).
- Deliberately untouched: `anthropic-provider.ts:70` (retained DORMANT
  defect — key absence is NOT a repair; must be fixed with the #83 wiring
  before any activation), the ASK_SESSIONS-gated residuals, and all
  models/dims/batching/pricing/metering/retries/persistence/cache identities.

## 2. Evidence and reviews

- Boundary reproduction per site (old emits malformed strings at
  straddle/orphan shapes; new never; ordinary-input byte identity 9/9).
- Production-shaped aggregates (read-only): 4,969/4,969 claims, max 196 code
  points, 0 over either clip, 0 astral, 0 U+FFFD; 42 ask questions, max 96.
  ISW takeaway text deliberately unmeasured at rest (transient, ruling 1);
  its boundary behavior is synthetic-only evidence.
- 15 new tests; mutation checks: reverting the embeddings site fails exactly
  5 tests, the validation site exactly 5 (full-suite 3,461 and 3,456 of
  3,466 at the original head).
- Four independent fresh-context reviews (Unicode/boundary incl. a 300K-case
  differential fuzz; guards/metering; eval-harness consistency; scope/docs):
  ZERO confirmed or likely defects; the reviewed tree shipped unchanged.

## 3. Release mechanics

- Original head `3a59679` (PR opened 2026-08-31 ~18:05Z; merge HELD at the
  health gate when the map incident was found).
- Rebased twice as the incident releases landed (`2185d4b`, then final
  `adec440` on `4ab388f`); all five reviewed src/test files verified
  BYTE-IDENTICAL to the reviewed versions after each rebase; gates re-run on
  each head rather than reusing pre-incident evidence — final head: unit
  3,508/3,508 (241 files) · integration suite on a disposable Neon fork
  (exit 0; same 160-test suite captured at the prior head) · build PASS · CI
  `gate` pass. The CI `integration` check SKIPS (no Neon secret) — the local
  fork runs are the integration evidence, on every head.
- Merged 2026-08-31 ~21:57Z as **`a4ed5cb`** (merged tree byte-identical to
  `adec440`); deployed from the plain release clone as
  **`dpl_Bya68YX6a3GaDQe1LnYyMo1YhHkh`** (~22:00Z), carrying the PR #40
  watchdog hotfix in the same artifact. `/health`: 200, stamp `a4ed5cb`,
  matching `data-dpl-id`, DB OK (comment-stripped text parse).
- Rollback ladder for this release (see the incident review §7): narrow
  #37 regression → `dpl_GxEcce4WiTkF1reDZknaPYDeubjn`/`c0aa788` (carries the
  observed watchdog first-evaluation defect, state-dependent); watchdog or
  combined regression → `dpl_FJ33AS2DKMcme3qwjBiSTyNABxYh`/`52ea272`;
  earlier than `52ea272` reintroduces the map flood failure.

## 4. Immediate smoke (22:0xZ) — PASS

Authorization matrix (anonymous bare + `RSC: 1`, bodies inspected): `/ask`,
`/ask?q=…`, array `/ask?q=a&q=b`, `/admin/access`, `/digests/ru` all refuse
with zero privileged tokens; `/conflicts*` 404 (dormant). The three free-GET
Ask shapes produced ZERO persistence/spend delta (ask_usage 42→42, ask_runs
1→1, openai_ask+embed requests 2193→2193). No paid path exercised manually.

## 5. Observation window (deploy ~22:00Z → the 2026-09-01 07:00Z validate)

Monitor: one persistent poller (20-min cadence, silent unless anomalous;
checkpoints at the 02:00Z finalize and 07:00Z validate; deadline ≤26h).

- Natural embed-path traversal (02:00Z finalize): **PROVEN**. Run 11157
  (02:01:03→02:04:42Z, ok, 11 digests, errors 0) dispatched **11
  `openai_embed` requests / 76 units** with the provider row's `updated_at`
  landing at exactly the run's finish instant, and **76/76 claims created
  since the deploy carry `claim_embeddings` rows** — units == new claims ==
  embedded, a three-way reconciliation. Every input passed the repaired
  `truncateInput` on the live `a4ed5cb` build (the only path to
  `openaiEmbedBatches`); zero errors, zero provider rejections.
- Natural matcher traversal (07:00Z validate): **PROVEN**. Run 11198
  (07:01:18→07:01:47Z, ok, validated 3 / unvalidated 0, errors 0);
  `llm_match` dispatched **15 requests / $0.0030 on 2026-09-01 — exactly 3
  theaters × k=5 majority votes** — and all three `validation_runs` rows
  (448–450) record `matcher: "llm-majority"`, `voteRounds: 5`, model
  gpt-4o-mini. Keyword fallback dispatches zero `llm_match` requests, so
  genuine LLM traversal of the repaired `buildMatchUserPrompt` is
  established, not inferred from ok=true. Honest context on scores: coverage
  0 / 0 / 33.3 for digest date 2026-08-31 sits inside the ambient band
  (a 0% day occurred 08-29 pre-release; #15's known ±30pt variance) and that
  day's digest corpus was additionally thinned by the map outage itself —
  matcher integrity, this release's surface, is what this checkpoint tests.
- Window cleanliness (22:00Z → 2026-09-01T13:32Z close): 132 cron runs, 0
  failed/unfinished/errored/degraded; 15 map cycles, 1,507 claims, 0
  batchErrors, 0 lease losses; watchdog quiet (no alert after the one
  spurious 21:45Z email, repaired by PR #40 — see the incident review §5);
  `/health` held `a4ed5cb` + DB OK through closure. The deployment identity
  never changed during the window.

## 6. #97 umbrella after this release

Shipped and live (pending the natural checkpoints above for live-traversal
proof): the embeddings input boundary and the validation prompt clips — with
the Ask family (2026-08-29) these close every identified LIVE provider-bound
site. REMAINING OPEN under #97: (a) `anthropic-provider.ts:70` — dormant
defect; prerequisites to activation: repair the clip via `wellFormedSlice`,
plus the #83 wiring (model-config, analysis registry, pricing) and its own
scorecard; (b) the ASK_SESSIONS-gated residuals (session-entry normalization,
§7.7 cache-deletion join, pre-fix-row idempotency comparison) — close before
`ASK_SESSIONS` ships. The umbrella stays OPEN.
