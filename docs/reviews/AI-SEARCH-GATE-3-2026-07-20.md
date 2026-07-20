# AI Search Gate 3 — independent red-team report (validated answer streaming)

**Date:** 2026-07-20 (recovery session) · **Subject:** the full Phase 3 diff
`a0c6e85..HEAD` on `codex/ai-search-ask-p3-validation-stream` — Increment A
(`71e557a`, pure AnswerValidator + ruling-20 fidelity matrix), Increment B
(`9418f13`, SectionReleaser + answer-stream + cancel + client sections), the
recovery hardening (`5afdb33`), and the supplementary-Gate-2 fixes (`b7ca5dc`).

**Method.** Mandatory independent red-team (master prompt §10): three
independent battery agents that did not author the code — (1) evidence &
source fidelity, (2) streaming/terminal/cancel/a11y, (3) money & metering —
each REQUIRED to write and RUN executable probes (static reading disallowed as
sole evidence). Workflow `wf_6422c025-876`; 405,605 subagent tokens; every
probe $0 (dummy DB URLs, fake guards/sinks/streamFactories, zero provider
calls). The recovered dead-session scratchpad probes were supplied as
UNVERIFIED hypotheses to confirm or refute — never trusted. The implementation
lead re-verified every finding against the code before fixing. The offline
gate was then completed with the full verification battery including a
three-pass production-build browser run that itself surfaced one additional
high-class defect (below).

## Verdict

**PASS after fixes** — fix commits `e48149c` (red-team findings) and `27ed1de`
(browser-battery finding). 2 high + 7 medium + 4 low red-team findings, all
confirmed by executed probes, all fixed and regression-pinned (no finding was
waived); plus 1 high-class defect found only by the executed browser battery,
fixed and pinned. Every §6.3 safeguard, the ruling-20 fidelity contract, and
the money invariants verified clean post-fix.

## Findings and dispositions

### High

| # | Finding (probe-confirmed) | Disposition |
|---|---|---|
| G3-1 | The fidelity matrix skipped any name-bearing sentence whose citations don't resolve — fabricated-only markers, uncited §4 assertions, and marker-after-terminator placement all dodged every check; the SectionReleaser's strip-then-validate order additionally released such strengthened prose at final drain (probes P1/P3/P23/P30/P31, executed end-to-end through streamAnswer) | **fixed** (`e48149c`): a name-bearing sentence with markers that ALL fail to resolve, or asserting an encoded predicate uncited, FAILS with no fallback (dropped/withheld — §4.9); the sentence split keeps trailing markers attached; the releaser runs fidelity BEFORE final marker-stripping. Pinned: validator + answer-stream suites |
| G3-2 | Allegation-upgraded-to-fact rendered when the strengthened predicate fell outside the encoded families: a flat unattributed "X was killed"/"X died" over claimed-only evidence passed everything (probe 12a) — the canonical §4.4 case, not a novel paraphrase | **fixed**: flat-death joined the predicate families; the certainty check now fires on it. Pinned incl. leading-attribution-passes |
| G3-B1 | **Browser-battery finding:** in the Next server runtime an aborted provider stream can end GRACEFULLY (iterator returns, no throw, no finish_reason) — the clean-end path then finalized the truncated run as `answered`/`run.completed` although Stop had killed generation mid-stream (proven end-to-end on the production build against a local mock provider; plain-node fetch throws, which is why unit probes missed it) | **fixed** (`27ed1de`): signal-aborted + no-finish_reason at clean end = cancelled (no final flush, ceiling settles without a frame); a genuine provider finish racing a late Stop stays a completion (red-team-blessed). Pinned both directions; re-proven in the browser (Stop → `run.cancelled` → honest cancelled copy) |

### Medium (all fixed in `e48149c`)

| # | Finding | Disposition |
|---|---|---|
| G3-3 | `citedClaimFallbackSentence` embedded claim text verbatim — ingest-controlled `[cN]` tokens inside claim text were re-parsed by the citation filter and could formally cite an UNRELATED valid claim (probe P19: re-derived citedClaimIds `[2, 1]` with claim 2 unrelated) | fixed: citation syntax neutralized in the quoted claim text; pinned (`parseCitedIds(fallback)` = the authentic id only) |
| G3-4 | `applyFidelityFallback` used `String.replace` with a plain replacement — `$&`/`$'` in claim text corrupted output and could resurrect the failing sentence inside a "Sources state:" quote (probe P20) | fixed: replacer function; pinned |
| G3-5 | Predicate evidence check was keyword-presence-only: a PEP claim whose own DISCLAIMER contains "sanctions" supplied the keyword (probe P8), and OpenSanctions candidate-match text with non-hedged classing let a name-only match render as resolved sanctioned identity (probe P26) | fixed: evidence-side negation/disclaimer phrases are stripped before the predicate test (also catches "was not arrested" evidence), and candidate-identity evidence asserted as resolved sanction/designation fails regardless of hedging class; both pinned |
| G3-6 | Attribution was position-insensitive: a trailing "…, according to reports" (or an attribution word in a different clause) satisfied "governing attribution" (probes 12b/P13) | fixed: attribution must PRECEDE the asserted predicate; pinned (leading passes / trailing fails) |
| G3-7 | `ASK_FIDELITY_FALLBACK=0` did not bind the streaming path (SectionReleaser hard-coded fidelity ON) — released text diverged from the terminal answer with the knob off, defeating register #36's rollback (probe case 9) | fixed: the knob binds the releaser; pinned both knob states |
| G3-8 | A stream that died before any content was mislabelled a model refusal ("The model declined…") — the synthetic `finishReason:"error"` fell through to `classifyCompletion`'s empty→refused mapping, skewing refusal accounting (probe 6) | fixed: a dead stream with no accumulated refusal maps to the honest interrupted error BEFORE classification; pinned |
| G3-9 | A truthy-but-degenerate usage frame (`{}` / NaN / negative) settled $0 or NaN instead of the conservative ceiling (probes E/F/I — unreachable via today's OpenAI frames but this chunk shape is the Phase 5 gateway seam) | fixed: a frame is adopted only when both token counts are finite and non-negative, else the ceiling governs; pinned incl. the legit-zero frame |

### Low (all fixed in `e48149c`)

| # | Finding | Disposition |
|---|---|---|
| G3-10 | Over-replacement of CORRECT prose (ruling-20 failure direction): 17/18 org/geo capitalized pairs treated as person names; transliterated first names ("Aleksandr"/"Alexander") failed identity; `former <role>` in evidence tripped the status check (probes P12/P18/P27/P28) | fixed: org/geo second-token exclusion; identity accepts surname + matching first initial (namesakes with different first names still fail — pinned); "former" followed by a title noun is not expiry evidence. Residual: initial-changing transliterations (Yevgeny/Evgeny) still over-replace, conservative direction — register #48 |
| G3-11 | Error-after-settlement streaming exits dropped billed usage/model attribution from the payload (probes E/H; ledger honesty, provider_usage unaffected) | fixed: `StreamDispatchError` carries the settled ceiling; the catch reports usage/model whenever settlement happened; pinned |
| G3-12 | Register #41 a11y verdict: streamed sections had NO screen-reader signal at all (status stayed "Preparing…" through the whole stream) | fixed: the live status line announces the validated-section count per release (one short polite announcement, prose never re-read); en+uk keys |
| G3-13 | (money battery duplicate of G3-9/G3-11 aspects) | folded into the above |

Uncited name-bearing sentences with NO encoded assertion remain out of the
matrix's scope (a benign "X visited Ankara." without citation passes) —
documented bound, register #48.

## Checked clean by the red-team (executed, highlights)

Money: reserve strictly precedes dispatch; settle exactly ONCE on all ten exit
classes with double-exit attacks refuted (in-process `settled` gate + the
atomic guard's conditional DB transition); budget refusal pre-call records
nothing and degrades to the deterministic path byte-identically streaming vs
not; cap-unset fail-closed before any dispatch; `LLM_DISABLE=1` short-circuits
BEFORE the streaming branch (zero guard calls proven); cancellation never
releases a possibly-billed call; no provider fallback/retry after content
release exists in code; the unpersisted-terminal fallback cannot touch
settlement (route has zero guard references); sink-emit failures settle once
and downgrade honestly (register #34); digest/embed/map/validation pipelines
and the reservation layer untouched (`git diff a0c6e85..HEAD` scoped stat
empty). Streaming: marker/sentence/denial splits across chunks cannot leak;
denial-led releases nothing at every boundary incl. finish; refusal before
content releases nothing; refusal AFTER released content stops further release
and the terminal replaces (window verdict: acceptable — the terminal payload
governs); duplicate/out-of-order/post-terminal sections handled client-side;
Stop→refresh replays a cancelled run honestly; `ASK_STREAM_ANSWER=1` with a
null sink is inert (progressive-only, proven); flag-off byte-equivalence
pinned; `watchCancelMarker` fail-soft with bounded churn and no leaked
rejections. Fidelity: faithful named-person prose passes byte-identical
(over-suppression refuted on 3 probe classes); exact one-source official
actions pass; all four matrix classes replace with name-preserving cited
wording.

## Verification battery (ledger P3-9..P3-15)

- Focused suites after fixes: validator/stream/ask/fixtures/controller/routes/
  form — all green (see ledger).
- `npm run typecheck` PASS · `npm run lint` 0 errors (1 pre-existing warning).
- `npm test` **1,860/1,860, 148 files**.
- `npm run test:integration` **52/52, 9 files** on disposable Neon branch
  `br-spring-cherry-atl050ks` (created by the harness, deleted after; every
  itest refuses to run without `INTEGRATION_DATABASE_URL`).
- `npm run build` PASS.
- **Browser battery, PRODUCTION build** (`next start`, disposable fork
  `br-spring-darkness-atutd2b1` — host verified ≠ production host before use,
  migrated 0021–0023 on the fork only, deleted after):
  - **Pass A — streaming (10/10):** local mock provider via `OPENAI_BASE_URL`
    (127.0.0.1, $0, no real provider): validated sections rendered mid-stream
    BEFORE the terminal; terminal reconciliation replaced the sections panel;
    exactly ONE paid POST; resume ref cleared on terminal; mid-run refresh
    resumed read-only with the run's question attributed and the form
    disabled; **Stop produced the honest `run.cancelled` terminal**; zero
    extra POSTs across refresh+resume+Stop; zero console errors. Screenshots:
    `docs/reviews/assets/p3-ask-{streaming,terminal,resume,cancelled}.png`.
  - **Pass B — flags on + `LLM_DISABLE=1` (4/4):** deterministic offline
    terminal through the progressive transport; NO sections (stream branch
    correctly skipped); one POST. Screenshot: `p3-ask-offline.png`.
  - **Pass C — flags off + `LLM_DISABLE=1` (4/4):** whole-answer server-action
    path; ZERO `/api/ask/runs` POSTs. Screenshot: `p3-ask-flagoff.png`.
- Zero paid calls and zero production writes anywhere in the gate (mock
  provider local; both Neon branches disposable and deleted; origin untouched).

Environment note recorded honestly: two earlier browser failures were caused
by ZOMBIE `next-server` processes (the dead session's, then this session's own
survived-wrapper kill) serving stale builds on :3100 — both identified by PID/
port evidence before removal; the real listener PID is now tracked. The
G3-B1 finding itself was genuine and reproduced on the correctly-served fixed
build before/after.

## Acceptance criteria (master prompt §10)

| Criterion | Verdict |
|---|---|
| No unvalidated section ever renders | pass (post-G3-1: fabricated/uncited name-bearing assertions withheld; §6.3 splits proven leak-free) |
| Supported names remain visible (no over-suppression) | pass (byte-identical faithful passes pinned; over-replacement classes fixed; residuals registered #48) |
| Terminal behavior matches the current trusted renderer | pass (same assembleV2 path; released-vs-terminal divergences fixed G3-1/G3-7; death-vs-refusal honesty G3-8) |
| Metering reconciles | pass (exactly-once on all exit classes; degenerate frames → ceiling; billed attribution kept) |
| Screen readers receive section — not token — announcements | pass (count-bearing polite status per release; prose outside the live region) |
| Cancel/reconnect/replay cannot double-bill | pass (browser-proven: refresh+resume+Stop = zero extra POSTs; itests) |
| Production enablement | **BLOCKED** (unchanged): `ASK_STREAM_ANSWER` unset everywhere; cohort rollout is operator-gated post-deploy |
