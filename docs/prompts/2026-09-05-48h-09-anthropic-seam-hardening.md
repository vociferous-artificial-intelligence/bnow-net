# Step 09 — Anthropic seam hardening: close the key-alone activation bypass, fix #97(a) (Wave 1, lane R)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Lane / worktree | R — `/Users/go/code/bnow-net-worktrees/48h-routing2-20260905`, step branch `…/anthropic-seam-hardening` (step 04 plans concurrently in `48h-routing`) |
| Window | H0 → H3 — **run this first in Wave 1**: as of 2026-09-06 `.env.local` carries an `ANTHROPIC_API_KEY` (D2 = B), so the bypass below is no longer latent on the operator's machine |
| Depends on | — (option-independent; step 04's plan must not duplicate it; step 12 builds on it) |
| Decisions | none — this is hygiene every D2 option needs |
| Spend | $0. The provider is dormant (no key anywhere). |
| Closing report | `docs/reviews/ANTHROPIC-SEAM-HARDENING-2026-09-05.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Goal

Today `src/lib/analysis/provider.ts:76-96` selects the unmetered, unregistered
`AnthropicProvider` whenever `ANALYSIS_PROVIDER=anthropic` and a key exist, or whenever only
an Anthropic key exists — no `workloadDispatchConfig()`, no `SpendGuard.tryReserve()`, no
dispatch identity (ruling 4 and 8 bypass, latent only because no key exists). Close that, and
fix the #97 family residual at `anthropic-provider.ts:70`. One small PR:
`analysis: anthropic provider fails closed until registered and metered; well-formed doc-line clip (#83 prep, #97a)`.

## Read

`src/lib/analysis/provider.ts` (all), `src/lib/analysis/anthropic-provider.ts` (all: model at
import :17, doc-line clip :63-72, raw fetch + non-null key assertion :78-113),
`src/lib/analysis/openai-provider.ts:36-43` (`digestDocLine` shape: `wellFormedSlice` +
`dropIsolatedSurrogates`), `src/lib/text/well-formed-slice.ts`, `src/lib/analysis/analysis.test.ts`,
`src/lib/analysis/map-request-wellformed.test.ts` (the pin pattern to mirror),
`src/lib/llm/model-config.ts:130-215` (what a registered provider would have to pass),
`docs/OPEN-TASKS.md` #83 (:846-851), #97 (:1376-1383, :1397-1403), AGENTS.md ruling 4, 8, 9
and the 2026-08-31/09-01 entry (≈956-958: the anthropic slice repair + #83 wiring + scorecard
are activation prerequisites).

## Do

1. `getProvider()`: remove the "only an Anthropic key exists" branch; make
   `ANALYSIS_PROVIDER=anthropic` throw a typed `ModelConfigError`-class refusal ("provider
   anthropic is not registered/metered — see OPEN-TASKS #83") BEFORE constructing the provider
   or reading the key. Ruling 9 semantics stay: digest sites throw typed errors; nothing here
   touches llm-match or /ask. Also make the Anthropic path honour `LLM_DISABLE=1` with the
   same typed `LlmDisabledError` the OpenAI digest path throws (today `anthropic-provider.ts`
   and `provider.ts` contain no `LLM_DISABLE` check at all — verify with `git grep`), so the
   kill-switch covers it once option B wires it in.
2. `anthropic-provider.ts`: doc-line clip through the same well-formed shape as
   `digestDocLine` (astral boundary at 400, isolated surrogates dropped, ASCII lines
   byte-identical); model read at call time; missing key throws a typed error before any
   `fetch`. Do not add metering here — that is step 12/20b's registered path; leave a header
   comment stating the provider cannot be selected until wired through `model-config.ts`,
   the analysis registry, `pricing.ts`, and a metered `anthropic_digest` row.
3. Tests: `ANALYSIS_PROVIDER=anthropic` + key → refused before fetch (fetch spy never called)
   and before any guard (no `tryReserve`); Anthropic key alone with `OPENAI_API_KEY` unset →
   stub provider, not Anthropic; clip pins mirroring `map-request-wellformed.test.ts`;
   call-time model pin. Existing tests untouched except where they asserted the old
   selection order (update with a comment citing this step).
4. OPEN-TASKS: #97(a) → repaired (dormant site now well-formed); #83 status line: "activation
   bypass closed; wiring still required". Correct `docs/SETUP-NEXT-WEEK.md:29-31` if step 01
   has not (coordinate via the report; do not double-edit).

## Acceptance

`npm test` green with the new pins; `git grep -n "process.env.ANTHROPIC_API_KEY!"` empty;
no change under `src/lib/llm/`.

## Report

Per COMMON §5. In **Proposed AGENTS.md changes**: the Architecture text (≈AGENTS.md:26-29,
"auto-selected if an Anthropic key exists and no OpenAI key does") is now false — give the
replacement wording for step 25. In **Handoff**: what step 12 and 20b must keep (the refusal
message/class) so option B wiring replaces the refusal rather than bypassing it.
