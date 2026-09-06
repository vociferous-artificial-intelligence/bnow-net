# Anthropic seam hardening — closing report (48h program, step 09)

## Scope

| | |
|---|---|
| Prompt | `docs/prompts/2026-09-05-48h-09-anthropic-seam-hardening.md` (+ `…-48h-COMMON.md`) |
| Lane / worktree | `ws2-provider` — `/Users/go/code/bnow-net-worktrees/48h-ws2-provider-20260905` |
| Worktree branch | `48h/ws2-provider-20260905` |
| Step branch | `48h/ws2-provider-20260905-anthropic-seam-hardening` |
| Base SHA | `origin/main` = `dff58f25009da8e3dd8f759c4a5b563c2bb4dc96` ("docs: 48h program — step 24 worktree note"), which has `883e5e3` as an ancestor — satisfies COMMON §1 |
| Executed | 2026-09-06 ~20:15–21:00Z |
| Spend | **$0.** No paid provider call, no production database access, no deploy, no Vercel environment read or write, no migration. |

Toplevel and branch were proven before any edit (`git rev-parse --show-toplevel`
→ the worktree; `git branch --show-current` → the lane branch, not `main`).

## Built

Two source files changed, one test file added, five docs corrected.

### `src/lib/analysis/provider.ts`

The defect, precisely: `getProvider()` returned the unmetered, unregistered
`AnthropicProvider` on **two** paths —

1. `ANALYSIS_PROVIDER=anthropic` **and** `ANTHROPIC_API_KEY` set (old `:82-85`), and
2. `ANTHROPIC_API_KEY` set with `OPENAI_API_KEY` absent (old `:90-93`), with no
   operator intent expressed at all.

Either path produced a provider that takes no `workloadDispatchConfig()` gate, no
`SpendGuard.tryReserve()`, records no `provider_usage` row and returns no dispatch
identity — standing rulings 4 and 8 bypassed in three places at once. Path 2 is the
one that matters operationally: it needs **one** environment variable, and per
COMMON §4.8 `ANTHROPIC_API_KEY` is now present in the operator's `.env.local`
(D2 = B), so the bypass had stopped being latent on the operator's machine.

Now:

- path 2 is **deleted**. An Anthropic key alone selects the `StubProvider` — the
  correct fallback: it spends nothing and invents nothing.
- path 1 is a **typed refusal**. `ANALYSIS_PROVIDER=anthropic` throws
  `AnalysisProviderError` (`code = "ANALYSIS_PROVIDER"`, `provider = "anthropic"`)
  **before** `import("./anthropic-provider")`, before `ANTHROPIC_API_KEY` is read,
  and before any guard or provider client exists — the same fail-closed placement
  `ModelConfigError` has in `workloadDispatchConfig()`. The message carries no
  `"truncated"`, so `digest.ts`'s ladder (`src/lib/analysis/digest.ts:156-176`)
  rethrows it immediately instead of burning smaller rungs.
- the refusal text is exported as **`ANTHROPIC_NOT_REGISTERED`**, deliberately, so
  the eventual wiring must *replace* a named constant rather than quietly route
  around a string literal.

`ANALYSIS_PROVIDER=stub`, the OpenAI path and the no-key stub fallback are
unchanged.

### `src/lib/analysis/anthropic-provider.ts`

- **#97(a) repaired.** `anthropicDocLine()` clips through
  `wellFormedSlice(…, 400)` + `dropIsolatedSurrogates(…)` — the same shape as
  `openai-provider.ts`'s `digestDocLine` (`:36-43`), test-pinned byte-equal to it.
  The 400 keeps its historical UTF-16 **code-unit** meaning and whitespace
  normalization still runs before truncation, so output is byte-identical to the
  old `.slice(0, 400)` for every all-BMP input (i.e. all Cyrillic, Ukrainian,
  Persian and Arabic source text).
- **Model resolved at call time.** `anthropicModel()` replaces the module-load
  `const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"` (old `:17`),
  which froze the value for every later config or test change — the same defect
  the routing seam removed from the map stage. Blank/whitespace is ABSENT, matching
  `model-config.ts`'s `envStr` convention. `name` became a getter so it follows.
- **Missing key throws typed before any `fetch`.** The old code asserted
  `process.env.ANTHROPIC_API_KEY!` straight into the `x-api-key` header (old `:82`),
  so an unset key produced a request with `"undefined"` as the credential. Now the
  key is read once, trimmed, and an absent/blank value raises
  `AnalysisProviderError` before the request closure is built.
- **Kill-switch ordering made explicit.** `assertLlmEnabled` was already the first
  statement of `analyze()` and now precedes the key check by contract, both pinned.
- **No metering added**, by instruction. A header comment states the provider
  cannot be selected until it is wired through `src/lib/llm/model-config.ts`, the
  analysis registry (`analysis-reg-v1`, with its own promotion scorecard),
  `pricing.ts`, and a metered `anthropic_digest` `provider_usage` row.

### `src/lib/analysis/anthropic-seam.test.ts` (new, 19 tests)

Selection: refusal on `ANALYSIS_PROVIDER=anthropic` with and without a key, with
`fetch` and `SpendGuard.prototype.tryReserve` spies asserted **never called**; the
full typed identity (class, `code`, `name`, `provider`, exact message, absence of
`"truncated"`); Anthropic-key-alone → stub and *not* `AnthropicProvider`; both keys
→ `openai:gpt-4o-mini`; `stub` forcing; no-key stub.

Provider: `LLM_DISABLE=1` → `LlmDisabledError` with no fetch; missing key and
whitespace-only key → typed, no fetch; kill-switch outranks the missing key;
call-time model (set `ANTHROPIC_MODEL` *after* import — the construct the old
module-load const could not see) and blank-is-absent.

Clip (#97a), mirroring `map-request-wellformed.test.ts`: differential old-vs-new
against an **independent** lookaround oracle (not `dropIsolatedSurrogates` — a test
reusing the production helper could only prove the code agrees with itself);
`JSON.stringify` of the old line contains the literal `\ud83d` escape and the new
one does not; a straddling pair yields 399 body units, not 400; an interior pair is
preserved intact; ASCII/BMP byte-identity to the old implementation; equality with
`digestDocLine`; and a whole-request check that stubs `fetch`, walks the
**round-tripped object's** string fields (never a check ending in
`JSON.stringify`, which re-escapes a lone surrogate to ASCII and can never fail —
the round-2 hole recorded in `map-request-wellformed.test.ts:196-202`), and
re-asserts `tryReserve` was never called.

### Docs

| File | Correction |
|---|---|
| `docs/OPEN-TASKS.md` #83 | status → "activation bypass closed 2026-09-06; wiring still required", with what replaced what and the named constant the wiring must replace |
| `docs/OPEN-TASKS.md` #97 | new `STATUS 2026-09-06` block: **(a) repaired**; remaining umbrella item is (b) the `ASK_SESSIONS` residuals. The historical 2026-08-31 DISPOSITION paragraph is left **verbatim** |
| `docs/SETUP-NEXT-WEEK.md:29-31` | the "alternative now supported / auto-uses Claude" paragraph is false — replaced (step 01 had not touched it; see Handoff) |
| `docs/BLOCKERS.md:11-13` | "add `ANTHROPIC_API_KEY` → flips provider per env config" is false — corrected, old text struck rather than deleted |
| `docs/HUMAN-SETUP-TODO.md:33-35` | "optional fallback key" is false — human task is now **none**; the prerequisite is the #83 wiring |
| `docs/CURRENT-STATE.md:116` | #97's remaining list no longer names the Anthropic clip |

## Tests

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | **0 errors**, 3 warnings — all three pre-existing on the base (`src/app/api/cron/validate/route.test.ts:7`, `src/lib/evals/hardening.test.ts:11`, `src/lib/usage/cron-run.test.ts:5`), none in files this PR touches |
| `npm test` | **3,631 / 3,631 passed, 248 files** — from the base's 3,612 / 247 (AGENTS.md's 2026-09-04 PR-2 entry); +19 tests, +1 file, zero pre-existing tests changed or removed |
| Integration | **not run — none apply.** This PR touches no SQL, no schema, no route and no gated page; there is no `*.itest.ts` covering provider selection. Recorded as not-run, not as passed. |
| `git diff --check` | clean |
| Secret scan (`git diff \| grep -iE 'key\|secret\|token\|postgres://'`) | every hit is prose or an env-var *name*; the only literals are the fakes `sk-ant-test-key` / `sk-test-key` in the test file |
| Spend | **$0** — zero paid provider calls |

### Mutation proofs (the pins discriminate)

Each mutation was applied to the working tree, the new file run, and the tree restored:

| Mutation | Result |
|---|---|
| A — restore the "Anthropic key alone" auto-selection branch | **1 failed** ("selects the stub, never Anthropic") |
| B — honour `ANALYSIS_PROVIDER=anthropic` instead of refusing | **3 failed** |
| C — revert `anthropicDocLine` to the bare `.slice(0, 400)` | **4 failed** |
| D — snapshot the model at module import | **1 failed** (call-time pin) |
| E — delete `assertLlmEnabled` from `analyze()` | **2 failed** |

All five killed; 19/19 green on the restored tree.

## Rulings touched and how each is satisfied

- **Ruling 4 (fail-closed spend).** This PR *removes* a spend path that had no
  `SpendGuard` at all. The refusal is raised before any reservation could be
  attempted and before any provider client exists — the same placement the ruling
  requires of `workloadDispatchConfig()` — and two tests assert
  `SpendGuard.prototype.tryReserve` was never called. No cap env is added, removed
  or read; no cap semantics change.
- **Ruling 8 (metering inside `analyze()`, never at call sites).** Deliberately
  **not** discharged here: metering is the registered path (step 12 / 20b). The
  seam is made unreachable instead, which is the honest interim state, and the
  header comment says so.
- **Ruling 9 (`LLM_DISABLE` semantics differ by call site on purpose).** The
  Anthropic digest site keeps throwing typed `LlmDisabledError`, exactly as the
  OpenAI digest site does. `llm-match` (degrades) and `/ask` (degrades) are
  untouched — this PR changes no file under `src/lib/validation/` or `src/lib/ask/`.
- **Ruling 13 (map hard lock, extractor versions).** Untouched: no file under
  `src/lib/llm/` changed (acceptance criterion, verified — `git diff --stat -- src/lib/llm/` is empty), `MAP_BASELINE` and the lock predicate are not in the diff, and nothing here feeds `mapExtractorVersion()`.
- **Ruling 3 (truth-in-UI).** The Anthropic-key-alone case now yields stub digests
  rather than unmetered Claude digests. The stub is the documented deterministic
  extractive fallback whose every string is drawn verbatim from source documents —
  it is not fixture data, and ruling 3's prohibition is on stub/fixture *sources*
  (`src/lib/adapters/stubs.ts`) persisting or rendering as fact. No adapter, query
  filter or rendering path changed. Flagged in **Debt and risks** below as a
  behaviour change nonetheless.
- **Rulings 1, 2, 5** — no ISW prose, no claim/source path, no migration.
- **AGENTS.md write-lock (COMMON §4.7).** `AGENTS.md` is **not** edited by this PR.
  The one standing line it falsifies is given below for step 25.

## Citations re-verified

| Cited in the prompt | Verified | Correction |
|---|---|---|
| `src/lib/analysis/provider.ts:76-96` — selection | ✅ exact | — |
| `anthropic-provider.ts:17` model at import | ✅ exact | — |
| `anthropic-provider.ts:63-72` doc-line clip | ✅ (the `.slice(0, 400)` is at `:70`, matching #97's citation) | — |
| `anthropic-provider.ts:78-113` raw fetch + non-null key assertion | ✅ (the assertion is at `:82`) | — |
| `openai-provider.ts:36-43` `digestDocLine` shape | ✅ exact | — |
| `src/lib/text/well-formed-slice.ts` | ✅ `dropIsolatedSurrogates` `:39`, `wellFormedSlice` `:69` | — |
| `src/lib/llm/model-config.ts:130-215` | ✅ `resolveWorkloadModel` `:130`, `ModelConfigError` `:116`, `workloadDispatchConfig` `:203` | — |
| `docs/OPEN-TASKS.md` #83 at `:846-851` | ✅ exact | — |
| `docs/OPEN-TASKS.md` #97 at `:1376-1383`, `:1397-1403` | ✅ both exact on the base — the ANTHROPIC DISPOSITION paragraph and the "THE UMBRELLA STAYS OPEN — remaining: (a)…" block respectively | for the record, entry #97 itself begins at `:1195` |
| `docs/SETUP-NEXT-WEEK.md:29-31` | ✅ exact, and still uncorrected by step 01 | — |
| AGENTS.md rulings 4 (`:373-390`), 8 (`:404-405`), 9 (`:407-411`) | ✅ exact | — |
| AGENTS.md 2026-08-31/09-01 entry at ≈956-958 | ✅ the anthropic sentence is at `:954-956` | off by ~2 |
| AGENTS.md architecture sentence at ≈26-29 | ✅ the false clause is `:28-29` | — |
| `src/lib/analysis/analysis.test.ts` | ✅ its only Anthropic coverage is `parseEventsJson` (`:172-182`) — untouched by this PR | — |
| `src/lib/analysis/map-request-wellformed.test.ts` | ✅ the pin pattern mirrored | — |

**One prompt statement is wrong and is corrected here.** The prompt says "today
`anthropic-provider.ts` and `provider.ts` contain no `LLM_DISABLE` check at all —
verify with `git grep`". `git grep -n LLM_DISABLE` indeed returns neither file, but
that is an artifact of the grep: `anthropic-provider.ts:62` already called
`assertLlmEnabled("anthropic digest extract")`, which is the repo's kill-switch
helper (`src/lib/usage/llm-guard.ts:67-69`) and throws exactly the typed
`LlmDisabledError` the prompt asks for. So the kill-switch was **already honoured**
on this path; this PR did not add it. What it adds is the *pin* (two tests,
mutation-proven) and an explicit ordering contract against the key check.
`provider.ts` has no `LLM_DISABLE` check and correctly still has none — a selector
that returned a stub under the kill-switch would silently produce degraded output
instead of refusing.

## Decisions needed

**None for this step** — it is option-independent hygiene, as the prompt states.
Two items are surfaced rather than decided:

1. **`AnthropicProvider` is now unreachable from `src/`.** Nothing outside its own
   test imports it. It is retained deliberately (step 12 / 20b wire it), but if
   D2 resolves against Anthropic, deleting the class is the honest cleanup — a
   decision for the D2 owner, not this step. The repo's scoped delete exception
   would permit it.
2. **`ANTHROPIC_API_KEY` in `.env.local`.** It buys nothing now and, per COMMON
   §4.8, was a live hazard for any fork-bound local server. That hazard is gone
   (see Handoff), but whether the key stays in `.env.local` is the operator's call.

## Debt and risks

- **Behaviour change, bounded.** The only environment whose behaviour changes is
  one with an Anthropic key and **no** OpenAI key: it now produces stub digests
  instead of unmetered Claude digests. Per AGENTS.md's credentials table
  `OPENAI_API_KEY` is live in production and `ANTHROPIC_API_KEY` is absent from
  every Vercel environment, so **production behaviour is unchanged**. I did not
  read Vercel to confirm that (COMMON §3 forbids it); the claim rests on AGENTS.md
  and should be re-verified at whatever deploy carries this.
- **Offline-proven only.** The provider is dormant; there is no natural traversal
  of the repaired clip and none is expected. Unlike #97's embeddings/validation
  sites, this repair will never get a production checkpoint — it gets one when the
  #83 wiring ships and dispatches for the first time. Recorded, not hidden.
- **The refusal is a string an implementer can delete.** `ANTHROPIC_NOT_REGISTERED`
  is exported and its exact message is test-pinned, so removing it fails the suite —
  but a determined wiring PR can still bypass rather than replace it. Step 12/20b
  should convert the pin into "the refusal is gone **and** a reservation is taken",
  in one change.
- **Not addressed:** metering, pricing, registry entry, scorecard (all #83, all
  out of scope by instruction); the `ASK_SESSIONS` residuals under #97(b).
- **New test file style.** `anthropic-seam.test.ts` was formatted with `npx prettier`
  before I noticed the repo pins no prettier config or dependency, so it wraps at
  80 columns where neighbours wrap at ~100. Cosmetic; lint is clean. The two source
  files were reverted to the repo's import style.
- The working tree's incidental `package-lock.json` churn (153 deleted `libc`
  entries, an artifact of `npm install` under this machine's npm) was **restored,
  not committed** — it is not this step's change.

## Proposed AGENTS.md changes (for step 25)

**1. Architecture — the auto-selection sentence is now false.**

`AGENTS.md:26-29`, before:

> LLM behind `AnalysisProvider`: `openai` live (gpt-4o-mini), `anthropic` implemented in the seam (no key in any env yet — auto-selected if an Anthropic key exists and no OpenAI key does), `stub` deterministic fallback.

after:

> LLM behind `AnalysisProvider`: `openai` live (gpt-4o-mini), `anthropic` implemented in the seam but **UNSELECTABLE** — unmetered and unregistered, so `getProvider()` refuses `ANALYSIS_PROVIDER=anthropic` with a typed error and an Anthropic-only key falls back to the stub (2026-09-06; the auto-selection branch was removed — OPEN-TASKS #83), `stub` deterministic fallback.

**2. Analysis bullet — the #97 remaining-sites list.**

`AGENTS.md:284-286`, before:

> remaining sites = the Ask family (user-controlled, highest exposure — next code PR), `embeddings/client.ts`, `validation/llm-match.ts`, and the inert anthropic site (#83).

after (the Ask, embeddings and validation sites all shipped before this step; the
anthropic site is repaired by it):

> remaining sites: none in the analysis providers — the Ask family, `embeddings/client.ts`, `validation/llm-match.ts` and the anthropic doc-line clip are all repaired (the last on 2026-09-06, step 09). What is left under #97 is the flag-off `ASK_SESSIONS` residuals.

**3. Credentials table — the Anthropic row.**

`AGENTS.md:982`, before:

> | Anthropic | `ANTHROPIC_API_KEY` | provider implemented; key absent | console.anthropic.com |

after:

> | Anthropic | `ANTHROPIC_API_KEY` | **provider implemented but UNSELECTABLE** — unmetered/unregistered, `getProvider()` refuses it (2026-09-06, #83 wiring required); key absent | console.anthropic.com |

**Not to be edited:** `AGENTS.md:954-956` (inside the append-only 2026-08-31/09-01
entry) says #97's dormant anthropic site awaits "repair + #83 wiring + scorecard".
The repair half is now done; the log entry stays verbatim and the entry below
supersedes it, per the maintenance rule.

**4. Proposed decision-log entry** (append at the END, per COMMON §4.7):

> - **2026-09-06 (Anthropic seam hardening — activation bypass closed, #97(a) repaired; branch/PR only)** `getProvider()` had selected the unmetered, unregistered `AnthropicProvider` on two paths: `ANALYSIS_PROVIDER=anthropic` with a key, and — with no operator intent at all — whenever an Anthropic key existed and an OpenAI key did not. Either path dispatched a billed call with no `workloadDispatchConfig()` gate, no `SpendGuard.tryReserve()`, no `provider_usage` row and no dispatch identity: standing rulings 4 and 8 bypassed in three places. The second path stopped being latent once `ANTHROPIC_API_KEY` entered the operator's `.env.local` (D2 = B), so one variable was enough to route analysis around every gate. Repair (PR, step 09): the key-alone branch is DELETED — an Anthropic key alone now selects the deterministic stub — and `ANALYSIS_PROVIDER=anthropic` throws a typed `AnalysisProviderError` before the provider module is imported, before the key is read, and before any guard or client exists, carrying the exported `ANTHROPIC_NOT_REGISTERED` message so the eventual wiring must REPLACE the refusal rather than route around it. In `anthropic-provider.ts`: the provider-bound doc line clips through `wellFormedSlice` + `dropIsolatedSurrogates` at the same 400-code-unit ceiling (**#97(a) REPAIRED**; byte-identical output on all-BMP text, test-pinned equal to `digestDocLine`), the model is resolved at CALL time instead of snapshotted at module import, a missing or blank key throws typed before any `fetch` (the old code asserted `process.env.ANTHROPIC_API_KEY!` into the `x-api-key` header), and the kill-switch is asserted ahead of both — the site already honoured `LLM_DISABLE` via `assertLlmEnabled`, contrary to the step prompt's premise, and is now pinned. Metering is deliberately NOT added: that is the registered path (#83 wiring — `model-config.ts` routing, an `analysis-reg-v1` entry with its own promotion scorecard, prices in `pricing.ts`, a metered `anthropic_digest` row), which remains a prerequisite to ever setting an Anthropic key in a Vercel environment. 19 new pins, five mutations killed (either selection branch restored, the clip reverted, the model snapshotted, the kill-switch deleted). Gates: typecheck clean · lint 0 errors · unit **3,631/3,631 (248 files)**, from 3,612/247; no integration test applies (no SQL, schema, route or gated page touched) and none was run. Zero paid calls, zero production access, no env change, no migration, no deploy. **Production behaviour is unchanged** — `OPENAI_API_KEY` is live and `ANTHROPIC_API_KEY` is absent from every Vercel environment — and the repair is OFFLINE-PROVEN ONLY: the provider is dormant, so no natural traversal exists or is expected. Standing text corrected in place by this PR: `docs/SETUP-NEXT-WEEK.md`, `docs/BLOCKERS.md`, `docs/HUMAN-SETUP-TODO.md` and `docs/CURRENT-STATE.md` each told the operator that an Anthropic key was a working fallback; all four now say it is not. Report: `docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md`.

## Handoff

**For steps 12 and 20b (the #83 wiring) — what must be kept:**

- The refusal **class and message** are the contract:
  `AnalysisProviderError` / `code = "ANALYSIS_PROVIDER"` / `provider = "anthropic"`,
  message `` `analysis-provider: anthropic — ${ANTHROPIC_NOT_REGISTERED}` ``, both
  exported from `src/lib/analysis/provider.ts`.
- **Replace it, do not route around it.** A wiring PR that reinstates a selection
  branch *beside* the refusal, or that reads `ANTHROPIC_API_KEY` before the gate,
  reopens exactly this bypass. The correct shape is: the anthropic branch resolves
  through `workloadDispatchConfig()` (a priced Claude model in `pricing.ts` + an
  `analysis-reg-v1` approval carrying its promotion scorecard), constructs the
  provider only after that gate passes, and `analyze()` takes a
  `SpendGuard.tryReserve()` on an `anthropic_digest` provider row and records usage
  inside `analyze()` (ruling 8), returning a dispatch identity like the OpenAI
  provider does.
- **Do not delete the "never reserved" assertions** in
  `anthropic-seam.test.ts` — invert them. `expect(reserveSpy).not.toHaveBeenCalled()`
  becomes `toHaveBeenCalledTimes(1)` per physical dispatch. A wiring PR that only
  removes those lines has not proven it metered anything.
- **Never re-add a key-presence auto-selection branch.** Provider choice must be an
  explicit operator statement that passes a gate, never an inference from which
  key happens to exist.
- `anthropicDocLine` and `digestDocLine` are pinned byte-equal. If the wiring gives
  Anthropic its own content budget, that pin must be replaced deliberately, with the
  well-formedness pins kept.

**For COMMON §4.8 — the hazard this closes.** COMMON currently warns:

> **Until step 09 merges:** `.env.local` now carries an `ANTHROPIC_API_KEY` (D2 = B), the dormant Anthropic provider has NO spend guard and does NOT honour `LLM_DISABLE`, and `getProvider()` selects it whenever `OPENAI_API_KEY` is blank — so any script, test or server you run with `OPENAI_API_KEY` blanked must also blank `ANTHROPIC_API_KEY`.

Once this merges, replace that paragraph with:

> **Closed by step 09 (2026-09-06):** `getProvider()` no longer selects the Anthropic provider from key presence, and refuses `ANALYSIS_PROVIDER=anthropic` outright, so blanking `OPENAI_API_KEY` now yields the deterministic stub. Keep blanking `ANTHROPIC_API_KEY` anyway in fork-bound runs — defence in depth, and the seam already honoured `LLM_DISABLE` via `assertLlmEnabled` (COMMON's claim that it did not was wrong).

Note the second correction: COMMON §4.8's "does NOT honour `LLM_DISABLE`" and the
step prompt's "contain no `LLM_DISABLE` check at all" are both wrong for
`anthropic-provider.ts` — see **Citations re-verified**.

**For step 01 (`docs/SETUP-NEXT-WEEK.md`).** Step 01 had **not** corrected
`:29-31` on `origin/main` `dff58f2`, so this step corrected it, per the prompt's
"if step 01 has not". If step 01 also edits that paragraph, take **this** version
and drop the other — do not merge both.

**For step 25.** Apply the two AGENTS.md items above. The four other docs this PR
corrected are already done and need no repetition.

**Not done, deliberately:** no deploy, no push to `main`, no Vercel read or write,
no metering, no registry or pricing edit, no `EVAL_*` anything.
