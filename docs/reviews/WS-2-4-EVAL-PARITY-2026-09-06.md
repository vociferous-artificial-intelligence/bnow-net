# WS-2.4 — eval-plane provider parity, and 20b's Anthropic wiring (step 20 / 20b)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-20-eval-provider-parity.md`, plus the corrected
  working spec in `/Users/go/code/bnow-net-worktrees/logs/step20.readonly-20260908.log`
  (the 2026-09-08 read-only pass) and PLAN-WS-2 §5.4 / §7.
- Lane `48h/ws2-routing-20260905`, worktree
  `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`.
- Base `origin/main` **`dc2e55e`** at session start; `origin/main` moved to **`6913c57`**
  (docs + launcher only) during the session, and the branches cut after that point are
  based on it. Both are recorded per branch below.
- **Unattended**, relaunching the read-only pass (which could read but not write or run).
  Recorded from evidence rather than assumed: the session is non-interactive in
  bypass-permissions mode, and the worktree carries the TRIMMED `.env.local` COMMON §4.10
  prescribes for an unattended code step — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `NEON_PROJECT_ID`, `NEON_API_KEY` and nothing else, so no `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `VERCEL_TOKEN` or Postmark token was reachable. **Nothing in this
  session read that file**: the whole step is `npm test`, and no script, fork or server ran.
- Spend: **$0.** No provider call of any kind, no Neon branch, no deploy, no Vercel
  environment read or written. `docs/evals/analysis/` is byte-untouched on every branch
  (`git diff --stat origin/main -- docs/evals/analysis/` empty).

## Built

Five PRs. Two are independent; three form a stack, and the stack is real rather than
convenience — each member needs the one below it.

| PR | Branch | Base | Title |
|---|---|---|---|
| [#75](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/75) | `…-eval-provider-flag` | `main` (`dc2e55e`) | `evals: --provider flag, provider-qualified identity, fail-closed placeholder` |
| [#76](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/76) | `…-entity-audit-prompt-extract` | `main` (`6913c57`) | `analysis: extract the entity-audit prompt/request into a pure module` |
| [#81](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/81) | `…-anthropic-wiring` | `main` (`6913c57`) | `analysis: route, meter and identity-stamp the anthropic digest provider` |
| [#82](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/82) | `…-anthropic-price` | #81 | `llm: price rows for the two anthropic digest models (operator-verified)` |
| [#83](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/83) | `…-eval-anthropic-seam` | #82 (+ merges #75) | `evals: anthropic dispatch seam for live evaluation (digest only)` |

**Merge order: #75 and #76 in any order, then #81 → #82 → #83.**

Why the stack is not optional: #82's price rows fail the price-table test that #81 rewrites
(it partitioned "every row is an OpenAI row" into per-row-provider ownership), and #83 needs
the provider dimension from #75, the pure request/parse module from #81, and a priced
Anthropic model from #82.

### PR-2.4-1 (#75) — the eval plane stops assuming OpenAI

The eval plane assumed the vendor in four places: bare price-table membership, a local copy
of model-config's reasoning-model regex, the literal `"openai"` passed to `analysisApproval`,
and a constant `liveIdentity.provider`. All four now take the provider as an input.

- `evalDispatchConfig(workload, provider, model, effort)` prices through
  `pricedFor(provider, model)` and probes capability through `analysisReasoningCapable`. The
  OpenAI refusal wording is unchanged; a non-OpenAI provider gets the production seam's
  `is not priced for provider "<p>"` message.
- `EVAL_DISPATCHABLE_PROVIDERS` is the BUILD-capability allowlist, distinct from the naming
  vocabulary in `providers.ts`. `assertLivePreflight` refuses anything outside it before
  `EVAL_DATABASE_URL`, the key, the caps and `evalDispatchConfig` — and the function is pure,
  so that is before any client, guard or DB exists at all.
- `liveConfigKey(model, effort, provider)` OMITS the segment for openai, so every committed
  and gitignored artifact keeps its exact name. Full shape
  `<model>[@effort][+provider=<id>][+<profile>][+votesN]`.
- The report's inline baseline-pairing rule moved into `runner.ts` as `baselinePairingKey`
  and became unit-testable. Order is load-bearing: strip the vote suffix, then the provider
  segment, THEN read the profile off the last `+`. Reading `+` first would derive
  `+provider=anthropic` as a capacity profile on a key with no profile and pair against a
  baseline that cannot exist.
- `CandidateDispatchIdentity.provider` widened to `AnalysisProviderId | "stub"`. Offline
  identities stay `"stub"` — `headerIsLive` is `provider !== "stub"` and PR #61's
  registry-version resume skip is keyed on it.
- Capture attempt lines gained `requestedProvider`, optional-and-absent-means-openai on the
  `ModelPrice.provider` convention, so `CAPTURE_LINE_VERSION` did not have to move and v1
  files written before this still read.
- `--capture-reconcile --provider` (validated for nameability at the CLI, where it only
  picks a filename); the live banner prints `provider=`.

### PR-2.4-2 (#76) — the entity-audit prompt becomes a pure module

`ENTITY_AUDIT_SYSTEM`, `entityAuditListing(rows)` and `entityAuditRequest(dispatch, listing)`
in `src/lib/analysis/entity-audit-prompts.ts`; the route composes them. Nothing production
sends changed: the system string moved as the same bytes (sha256 `2991b4ae…`, 1,065 chars,
measured before and after), the message array keeps its two entries in order,
`analysisChatParams` is called identically, and the object's key order — which is the
serialized request's key order — is preserved.

The proof is two pins that only work together: the module's output deep-equals the
pre-extraction literal copied into the test, and the route's `create` spy receives exactly
the module's output. Either alone would be circular.

### 20b PR-2.2-B1 (#81) — the Anthropic digest provider, wired and metered

The ordering gate first, because it is a gate. `mapreduceProviderTag()` hard-coded the
literal `openai:` and took only the model NAMES from the routing seam. It now reads the
resolved vendor, scoped to an ALLOWED one on the same footing `resolveWorkloadModel` scopes
the model (ruling 13) — a refused `MAP_PROVIDER` keeps the OpenAI-shaped model, so it must
keep the OpenAI vendor too. `WorkloadModelConfig` gained `providerAllowed` so that scoping is
read rather than re-derived, which also closes the allowed-but-blocked gap step 12's handoff
flagged as unpinned. The pure string assembly split out as `mapreduceTagFrom` so the
cross-vendor shapes are asserted directly rather than argued about.

Then the provider: `workloadDispatchConfig("digest")` before the key, the guard and the
request; its own `anthropic_digest` ledger row reusing `LLM_SPRINT_USD_CAP` +
`LLM_DIGEST_USD_CAP` (R6); reserve → fetch → record → parse with a fresh reservation for the
429 retry and truncation recorded, reported and only then thrown with `"truncated"` in the
message; `dispatchIdentity(dispatch)` returned. `anthropicModel()` deleted. `getProvider()`
selects on `resolveWorkloadModel("digest").provider`, never on a key, and reads the RESOLVED
provider so a blocked anthropic config throws typed instead of silently billing OpenAI.

### 20b PR-2.2-B2 (#82) — two price rows

`claude-haiku-4-5-20251001` $1.00/$5.00 and `claude-sonnet-5` $2.00/$10.00, each with
`provider: "anthropic"` written out, both verified against the vendor's pricing page on
2026-09-07 and quoted in the PR body.

### 20b PR-2.2-B3 (#83) — the eval dispatch seam

`EVAL_DISPATCHABLE_WORKLOADS` (openai → map/digest/validation, anthropic → digest,
openai_compatible → nothing) with two gates reading it. `dispatchOnce` normalizes both
vendors' responses onto one shape, so reservation accounting, ruling-8 metering, capture
lines and the 429 retry are written once; the anthropic sender throws an error carrying
`.status`, which is the shape the existing retry already handles. `anthropic_eval` ledger
row, provider-relative key check, `buildLiveDeps(provider)` building the OpenAI client only
for an OpenAI run, and R13's `schemaMode` in the identity.

### Embeddings coverage — design note, no code (PLAN-WS-2 §7.3)

Embedding coverage belongs to the **Ask** eval runner, not `analysis-eval`, and this session
wrote no code for it. `analysis-eval` has no embeddings workload and must not grow one: its
workloads are the four analysis stages, its datasets are keyed to them, and its scorers score
extraction/synthesis/matching quality. What an embedding model change actually affects is
retrieval recall over `docs/evals/ask-eval-set.json`, which is what `scripts/ask-eval.ts` and
`src/lib/ask/eval-run.ts` already measure. A future embed-model candidate is therefore
evaluated by an Ask `--offline`/live config sweep with `ASK_EMBED_MODEL` set — behind
PR-2.1-2's price refusal, which already stops an unpriced embed model before any reservation
— and scored on retrieval recall. Adding an embeddings workload to `analysis-eval` would
duplicate that instrument in a plane whose gates and comparability classes are built for a
different question.

## Tests

Green on every branch: `npm run typecheck` clean, `npm run lint` clean (3 pre-existing
warnings in files this session did not touch — `validate/route.test.ts`,
`hardening.test.ts`, `cron-run.test.ts`), `npm test` green. The pre-push gate ran on every
push and reported all green.

| Branch | Base count | After | Files |
|---|---|---|---|
| `main` `dc2e55e` (measured) | — | 4,082 | 270 |
| #75 | 4,082 | **4,097** | 270 |
| #76 | 4,082 | **4,089** | 271 |
| #81 | 4,082 | **4,112** | 272 |
| #82 (on #81) | 4,112 | **4,114** | 272 |
| #83 (on #82 + #75) | 4,129 | **4,141** | 272 |

Integration tests: none run — nothing in this session touches the DB, a migration or a gated
page, so no fork was created and `.env.local` was never copied into the worktree.

**Correction made during the session, recorded rather than left in the history.** #81's
commit message and PR body first cited its baseline as 4,089 (the entity-audit branch's
figure). That branch is cut from `origin/main`, so its baseline is 4,082. The commit was
amended, #82 and #83 rebased onto the corrected commit (`git diff` between the pre- and
post-rebase #83 tips is empty), all three force-pushed with `--force-with-lease`, and #81's
PR body edited. The end-state figures were correct throughout; only the starting figure was
wrong.

## Rulings touched and how each is satisfied

**Ruling 4 (fail-closed spend).**
- The eval provider is refused in a PURE preflight — before `EVAL_DATABASE_URL`, the key,
  the caps, `evalDispatchConfig`, and therefore before any client, guard or DB exists. Pinned
  twice: once with a fully-satisfied environment (proving the objection is to the build's
  capability, not a missing setting) and once with an empty one (proving the ORDER).
- `pricedFor` is now provider-scoped on the eval plane too, so a model priced for one vendor
  cannot be metered as another's — asserted in both directions.
- The Anthropic provider refuses on configuration before the key, before `guard.init()` and
  before any request; `cap_unset` refuses before any fetch; reserve precedes every physical
  attempt including the 429 retry.
- **No new cap env anywhere** (R6 for `anthropic_digest`, the shared campaign-local envelope
  for `anthropic_eval`), so this session creates no ruling-4 ordering obligation to discharge
  before a deploy. Both `LLM_SPRINT_USD_CAP` and `LLM_DIGEST_USD_CAP` already gate
  `openai_digest` in every Vercel environment.

**Ruling 8 (metering inside the provider, before parse).** Unchanged and now shared: the
normalized response path records before any parse or discard decision, on both vendors. A
truncated Anthropic response is recorded, reported to `onUsage` and only then thrown. The
pure Anthropic parser is deliberately TOTAL — a parse that threw would strand a billed
response outside the ledger.

**Ruling 9 (`LLM_DISABLE` semantics differ by call site on purpose).** The Anthropic digest
path throws typed `LlmDisabledError`, with an explicit acceptance case asserting zero config
resolution, zero reservation and zero fetch.

**Ruling 13 (map versioning + hard lock).** Untouched. `MAP_BASELINE` and the lock predicate
are unedited, the map allowlist stays `{openai}`, and map is not evaluable on Anthropic at
all. Two places now MIRROR the ruling's scoping rather than merely respecting it: the
mapreduce provider tag and `AnthropicProvider.name` both fall back to the OpenAI vendor / an
explicit "unresolved" when the provider is refused, because a refused provider keeps the
OpenAI-shaped model and naming the vendor beside it would be a false attribution.

**Rulings 1, 2, 3, 5, 21.** Not touched: no ISW text, no claim writes, no stub rendering, no
migration, no page or gate change.

## Citations re-verified

The read-only pass re-verified this prompt's citations against `a7ba98b` and found several
had drifted; its table is the corrected spec and is not repeated here. What THIS session
relied on and re-verified against `dc2e55e`/`6913c57`, with the line as it stands after the
work:

| Cited | Verified at | Note |
|---|---|---|
| `live-runner.ts` `analysisApproval(workload, "openai", …)` | `:164` before, replaced not added | the read-only pass's correction confirmed |
| `live-runner.ts` banner | `analysis-eval.ts:926` | now prints `provider=` |
| `analysis-eval.ts` discovery / pairing | `:589-602` / `:627-633` | discovery needed NO change; only the pairing block, now `baselinePairingKey` |
| `analysis-eval.ts` `resultsPath` | `:340-345` | unaffected — the prefix is decided by `startsWith("offline-fixtures")` |
| `analysis-eval.ts` `--capture-reconcile` | `:1111-1133` mode, `:1361-1373` CLI branch | both take `--provider` |
| `live-runner.ts` strict `json_schema` | `:422-425` | R13's site; now inside `requestOpenAi` |
| `runner.ts:344` `liveConfigKey` | confirmed | gained the provider parameter |
| `runner.ts:504` resume compares `provider` | confirmed | already true; `schemaMode` joins it |
| `contracts.ts:436` `CandidateDispatchIdentity` | confirmed | union widened |
| `route.ts:34-46` / `:102-107` / `:119` | confirmed | the three pieces extracted |
| `synthesize.ts:443-449` `mapreduceProviderTag` | confirmed | rewritten |
| `providers.ts:45-54` allowlist | confirmed | digest widened |
| `pricing.ts:96-103` `pricedFor` | confirmed | unchanged; two rows added above it |
| `model-config.ts:198-201` ruling-13 model scoping | confirmed | mirrored by `providerAllowed` |
| `eval-guard.ts:18` `evalGuardFromEnv()` arity | confirmed | now takes a provider |
| `isolation.test.ts:52-59` all-of-`src/` rule | confirmed | the CLI's static surface rule is `:66-104` |
| `model-routing-inspect.test.ts:79-87` footer literal | confirmed | updated |
| `model-config.test.ts:513-518` "every row is an OpenAI row" | confirmed | rewritten to partition by row provider |
| plan: "There is no `route.test.ts` today" | **STALE** | it exists (PR #60); the read-only pass caught this and the route-level pin uses it |

## Decisions needed

None blocking. Every decision this work depends on was signed before it started:
**D2 = B**, **R6**, **R7**, **R7-b**, **T4-b**/(f13), **R12** (recorded, not taken),
**R13**. `grep -c UNSIGNED AGENTS.md` = 0.

Two items a later step should decide, neither in this session's scope:

1. **R12 remains open** and is recorded in #76 rather than answered: the entity-audit route
   dispatches `response_format: json_object` while every eval workload dispatches strict
   `json_schema`. Adding `entity_audit` to `LiveEvalWorkload` needs either a schema (a
   request change, so production has to be re-observed) or a non-strict eval path. The
   `schemaMode` field #83 introduces is the natural place for the second option to land.
2. **A `#97`-family site not on the umbrella's list.** `entityAuditListing` clips the sample
   claim with a 120 **code-unit** `String.slice` over model-authored text bound for a
   provider request. A split astral pair leaves a lone surrogate the serializer carries and
   the provider rejects — the same mechanism as map's #86. It is NOT among the sites
   AGENTS.md names under #97 (Ask family, `embeddings/client.ts`,
   `validation/llm-match.ts`, the inert anthropic site). Fixing it changes request bytes,
   which is exactly what #76 must not do, so it is surfaced here instead. Proposed
   OPEN-TASKS text is under "Proposed AGENTS.md changes" below.

## Debt and risks

1. **The mapreduce tag fix is latent and must not be read as a live repair.** Map and reduce
   are both allowlisted `{openai}`, so no configuration in this release can make the old tag
   wrong. It ships now because the ordering gate requires it to exist before the hazard is
   reachable.
2. **`claude-sonnet-5` is an alias, not a dated snapshot.** An alias repoints without the id
   changing, so a future Sonnet 5 snapshot at a different rate would keep metering at this
   row's price — the 2026-08-20 gpt-5-mini under-metering failure by a different door. R7-b's
   mitigation is carried in a code comment: re-verify whenever the Anthropic digest path is
   next touched, and at the first real invoice.
3. **The price table is keyed by model id alone**, so it cannot hold two vendors' rows for
   the same id. That is a refusal rather than a silent collision — whichever vendor does not
   own the row is unpriced for that model and cannot dispatch it — but it is a real limit if a
   genuinely shared id ever appears. Recorded in `ModelPrice`'s docstring; a composite key is
   not worth building before that happens.
4. **The Anthropic dispatch order is mock-proven, not run-proven.** `anthropic-provider.test.ts`
   mocks model-config to hand back one approved configuration, because the real one correctly
   resolves to nothing. That is not weakening the gate — `anthropic-seam.test.ts` runs against
   the REAL model-config and pins the dormancy — but the two together say "when the gate
   opens, this is what happens", and the first real Anthropic dispatch remains
   future-observable.
5. **`schemaMode` makes an Anthropic digest cell its own comparability class**, which is
   correct and also means a Claude scorecard is not directly comparable to the OpenAI
   baseline's numbers on the same dataset. Whoever runs the paid matrix has to say so in the
   scorecard rather than table the two side by side.
6. **`capture` line shape.** `requestedProvider` is optional-absent-means-openai rather than a
   `CAPTURE_LINE_VERSION` bump. That keeps the 2026-09-08 capture files readable, at the cost
   of two shapes both claiming `v: 1`. If a third field ever needs adding, bump the version
   instead of stacking a second optional.
7. **Five open PRs, three of them stacked.** If #81 is revised in review, #82 and #83 need
   rebasing. The stack is recorded in each PR body with the merge order.

## Handoff

### What step 22 (remap) needs from the flag

Nothing changes for it, and that is the useful statement. `--provider` defaults to openai and
the segment is omitted for openai, so no results file is renamed and no estimate moves. The
map workload is not evaluable on Anthropic at all (`EVAL_DISPATCHABLE_WORKLOADS.anthropic =
["digest"]`), the map allowlist is untouched, and `mapExtractorVersion()`'s basis is
unchanged — so a `MAP_CONTENT_CHARS=1499` basis bump on a fork-bound server behaves exactly
as R4(a) describes. One new fact worth knowing: `WorkloadModelConfig` now carries
`providerAllowed`, so a stray `MAP_PROVIDER` is legible in a dry run as a refused provider
rather than only as a `dispatchBlocked` string.

### What the final audit must check for 20b

In this order — the first three are where I would look for a mistake of mine:

1. **The `AnthropicProvider.name` fallback.** It returns `anthropic:unresolved` when the
   digest does not resolve to an ALLOWED anthropic provider. Try to construct a configuration
   where a durable `digests.provider` string names a model that did not run. The reachable
   surface is narrow (a blocked config throws before persisting), but the getter is also read
   from logs.
2. **`mapreduceTagFrom`'s divergence rule.** Same vendor + different model keeps the
   historical `+reduce=<model>`; different vendor qualifies it. Check no configuration
   produces a string that parses ambiguously — in particular a model id containing `:` or
   `+`.
3. **The normalized response shape in `dispatchOnce`.** The OpenAI branch was refactored from
   inline field reads into `requestOpenAi`. Diff the capture lines it writes against `main`'s
   for an OpenAI run and confirm every field is byte-identical; the refactor is the kind that
   silently drops a field.
4. **`evalGuardFromEnv(provider)` at every call site** — a missed one would meter Anthropic
   spend on `openai_eval`. `git grep -n evalGuardFromEnv`.
5. **`schemaMode`'s resume default.** Absent on both sides must normalize to
   `json_schema_strict`; confirm a pre-2026-09-06 gitignored live file still resumes.
6. **That no test pin was deleted rather than extended.** Four existing tests changed their
   example provider from `anthropic` to `openai_compatible`; each gained a sibling case on the
   rung the widening moved the refusal to. `git diff` should show no net loss of `expect(`
   lines outside those moves.
7. **The dormancy claim end to end.** With #81+#82 merged, `DIGEST_PROVIDER=anthropic
   DIGEST_MODEL=claude-sonnet-5` must still refuse — at the registry rung, since the model is
   now priced. That is the single most important thing to re-run by hand before any deploy.

### Prompt rewrites recommended

- `docs/prompts/2026-09-05-48h-20-eval-provider-parity.md` is spent. If it is ever re-run,
  take the read-only log's citation table as given and add: "`route.test.ts` EXISTS (PR #60)
  and already mocks the Pool, the client factory and the guard — the route-level request pin
  uses it, and needs `withCronRun.mockImplementation((_n, fn) => fn({}))` because
  `withCronRun` is fully mocked and `run()` otherwise never executes."
- Any later prompt that says the eval plane is OpenAI-only, or that
  `EVAL_DISPATCHABLE_PROVIDERS` is `["openai"]`, is stale after #83.

## Proposed AGENTS.md changes (step 25 applies these; this session edited no AGENTS.md)

1. **Architecture, the `AnalysisProvider` sentence (≈:26-29).** Replace "`anthropic`
   implemented in the seam (no key in any env yet — auto-selected if an Anthropic key exists
   and no OpenAI key does)" with: "`anthropic` wired through `model-config.ts` for the
   `digest` workload only, metered on `anthropic_digest`, selected solely by
   `DIGEST_PROVIDER=anthropic` + an approved `DIGEST_MODEL` — no registry approval exists, so
   it is dormant; key presence never selects a provider."
2. **Architecture, the routing sentence.** After "resolved at CALL time by
   `src/lib/llm/model-config.ts`" add "per (provider, model, effort); providers are
   allowlisted per workload in `src/lib/llm/providers.ts` — `{openai}` everywhere except
   `digest`, which is `{openai, anthropic}`."
3. **Standing ruling 4, configuration paragraph.** "a model with no entry in
   `src/lib/llm/pricing.ts`, or a (workload, model, effort) with no `analysis-reg-v1`
   approval" → "a provider outside the workload's allowlist, a model not priced FOR THAT
   PROVIDER in `src/lib/llm/pricing.ts`, or a (workload, provider, model, effort) with no
   registry approval". Dropping the version literal also means §5.6's bump needs no AGENTS
   edit.
4. **Standing ruling 13.** Append: "A map PROVIDER other than `openai` is refused by the
   allowlist before the lock; a provider change would also change the extractor-version
   basis, so the same lock covers it. Read-side consumers that NAME a vendor (the mapreduce
   provider tag, `AnthropicProvider.name`) must scope it by `providerAllowed` exactly as the
   model is scoped — a refused vendor keeps the OpenAI-shaped model, and naming the vendor
   beside it would be a false durable attribution."
5. **Directory map, `src/lib/llm/`.** Add `providers.ts (provider vocabulary + per-workload
   allowlist)`.
6. **Directory map, `src/lib/analysis/`.** Add `anthropic-dispatch.ts (pure Messages
   request/parse, shared by the provider and the eval seam)` and
   `entity-audit-prompts.ts (the entity-audit prompt + request, pure)`.
7. **Credentials table, Anthropic row.** "provider implemented; key absent" is now wrong on
   both halves — the provider is wired and metered, and `ANTHROPIC_API_KEY` is in the
   operator's `.env.local` (D2 = B). Proposed: "wired + metered (`anthropic_digest`) for the
   `digest` workload; **dormant** — no registry approval, so every dispatch is refused. Key
   in `.env.local` only; absent from all three Vercel environments."
8. **New OPEN-TASKS item (a #97-family site not on the umbrella's list).** "**[Tier 3]
   `entityAuditListing` clips the sample claim with a 120 code-unit `String.slice`.** The
   entity-audit user message embeds `claims.text` — model-authored English that can carry
   astral characters — truncated with a bare `.slice(0, 120)` bound for a provider request. A
   split pair leaves a lone surrogate that `JSON.stringify` carries as `\\udXXX` and the
   provider rejects, killing the whole request: map's #86 mechanism. Not among the sites
   AGENTS.md names under #97. The repair is `wellFormedSlice` +
   `dropIsolatedSurrogates` (`src/lib/text/well-formed-slice.ts`) at
   `src/lib/analysis/entity-audit-prompts.ts`. Deliberately NOT folded into PR #76, whose
   whole contract was a byte-identical request; the route is unscheduled, so this is not
   urgent."

### Proposed decision-log entry (draft, for the operator to sign)

> **2026-09-08 (step 20 / 20b — eval-plane provider parity and the Anthropic digest wiring,
> five PRs, all dormant)** The eval control plane gains a `--provider` dimension
> (`EVAL_DISPATCHABLE_WORKLOADS`, provider-qualified `configKey` and dispatch identity,
> provider-scoped pricing, R13's `schemaMode`), the entity-audit prompt and request move into
> a pure module with a byte-identical request, and the Anthropic digest seam is wired through
> `model-config.ts`, metered on its own `anthropic_digest` row under the existing
> `LLM_SPRINT_USD_CAP` + `LLM_DIGEST_USD_CAP` envelope (R6, no new env), identity-stamped, and
> selected only by `DIGEST_PROVIDER`. Price rows land for `claude-haiku-4-5-20251001`
> ($1/$5) and `claude-sonnet-5` ($2/$10) per R7 / R7-b. The (f13) / T4-b ordering gate is
> discharged FIRST and in the same PR as the widening: `mapreduceProviderTag()` is
> provider-aware before the digest allowlist admits a second vendor, and the fix is latent —
> map and reduce stay `{openai}`, so no configuration in this release could have made the old
> tag wrong. **Nothing is activated.** No Anthropic registry approval exists, so every
> Anthropic resolution is `dispatchBlocked` and every legacy-digest run under
> `DIGEST_PROVIDER=anthropic` fails typed and loud; widening an allowlist is not an approval.
> $0, no Vercel environment change, no migration, no paid call, `docs/evals/analysis/`
> byte-untouched. Record: `docs/reviews/WS-2-4-EVAL-PARITY-2026-09-06.md`.
