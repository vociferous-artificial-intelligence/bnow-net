# Next-Phase Plan — pre-API-key builds

Plan doc (2026-07-06). Four workstreams the user asked to plan-then-build. None require
new paid API keys (they reuse existing infra + OpenAI, already live). Build order and
rationale at the end.

## 1A — ISW Middle East expansion + comparison page

**Goal:** extend the Russia model (ISW ROCA → source registry → comparison page) to the
**ISW Iran Update**, which covers Iran *and the non-state actor network* — Hezbollah,
Houthis, Hamas, Iraqi militias (Kataib Hezbollah, etc.), the broader Axis of Resistance.

**What exists to reuse:** the ISW crawler/parser/hedging classifier/registry materializer
are theater-agnostic (they parse endnotes). `isw_reports` now has a `theater` column; the
`sources` table is global and links to reports via `source_citations`. So a Middle East
registry is a *view* (sources joined to citations joined to isw_reports WHERE theater='ir').

**Plan:**
1. Discover the Iran Update archive URLs (Yoast sitemap grep for `iran-update`; slug is
   `research/middle-east/iran-update-special-report-<date>` — already found).
2. `scripts/isw-fetch.ts` generalized: take a URL list + theater. Fetch the archive
   (polite, cached).
3. `scripts/isw-parse.ts` + `isw-load.ts`: parse (same parser) and load with `theater='ir'`.
   Non-state actors surface naturally as cited sources (their Telegram/media).
4. Registry query gains a `theater` filter; `/registry?theater=ir` or a `/middle-east`
   page mirroring the Russia registry + a comparison/scoreboard section (Iran already
   validates vs Iran Update — the scoreboard exists; add the registry view).
5. Exit: ME source registry queryable, comparison page live, non-state actors visible.

**Effort:** M. Mostly parameterizing existing scripts + a registry theater filter + a page.

## 1B — In-app AI interrogation & stickiness tools

**Insight:** APIs and email are static/pull; the moat-deepening play is *interactive*
tools that only work logged-in and get more valuable the more history we hold. This raises
switching cost (the analyst's saved agents/filters live here) and daily-active usage.

**Feature ladder (value × effort):**
1. **Ask-the-data** (build now): a `/ask` NL query box. User asks "which Russian officials
   were prosecuted this month?" or "what's the trend in UAE chip re-exports?" → we retrieve
   relevant claims/entities/digests/trade rows and an LLM answers **citing claim/source
   ids** (traceability ethos preserved). This is the flagship stickiness feature.
2. **Saved filters / watchlists** (build next): persist a user's filters (entity, theater,
   track, keyword) and surface a personalized feed; email/in-app digest of matches.
3. **Custom agents** (later): a saved standing question that runs on a schedule and alerts
   on new matching evidence (e.g. "alert me when any entity linked to Rosneft is
   prosecuted"). Built on saved filters + the signals engine.

**Plan for the initial build (feature 1):**
- `src/lib/ask/retrieve.ts`: given a question, pull candidate rows (claims by keyword +
  recent, entities by name, digests, trade divergences, signals) — deterministic retrieval,
  bounded.
- `src/lib/ask/answer.ts`: LLM answers strictly from retrieved rows, must cite ids; refuses
  if evidence is thin (no hallucination). Reuses the provider seam.
- `/ask` page (gated) + `/api/ask` route. Answer renders with clickable claim/source refs.
- Guardrail: same as digests — no sentence without a cited row; label as derived analysis.

**Effort:** M for feature 1. Saved filters/agents are additive follow-ups.

## 2 — Multi-language support (evaluation + i18n scaffolding)

**Evaluation — should we?** Partly. Two distinct questions:
- **UI localization** (menus, labels): useful for regional buyers (Ukrainian for UA users,
  Arabic/Hebrew for ME). Low cost, real credibility signal. **Yes, scaffold it.**
- **Content localization** (translating dynamic digests/claims): English is the lingua
  franca of professional intelligence analysts, so English-first is correct. But
  on-demand LLM translation of a digest is cheap and high-value for non-English buyers.
  **Yes as a per-view toggle, later — not full pre-translation.**

**Language priority:** Ukrainian (explicit ask; UA is a live theater — strong fit),
then Arabic + Hebrew (ME theaters), then French/German/Spanish (Western analyst market),
then Japanese/Korean (if the critical-materials/Asia expansion lands — see CRITICAL-
MATERIALS.md). RTL (Arabic/Hebrew) needs layout handling — scaffold now, style later.

**Plan (scaffolding):**
- Locale infra: a `locale` param + dictionary (`src/i18n/`), `t(key)` helper, no heavy
  dependency (Next.js App Router + a lightweight dictionary is enough for UI strings).
- Localize the nav + key page chrome into **en + uk** first (proves the pipeline), leave
  hooks for ar/he/fr/de/es/ja/ko.
- Store user locale preference; default from Accept-Language.
- Document the content-translation toggle as the next step (LLM per-view).

**Effort:** S for scaffolding + en/uk. Full coverage is incremental.

## 3 — Critical-materials choke-point tracker

See **docs/CRITICAL-MATERIALS.md** (dedicated doc + vendor analysis + GTM case). Verdict:
**high GTM impact, low build cost (reuses Comtrade infra) — build it.**

## Build order (this session)

1. **Critical-materials tracker** — highest ROI: reuses the mirror-trade/Comtrade machinery
   almost entirely, directly strengthens the US-buyer GTM (item 3, user's top interest).
2. **Ask-the-data (1B feature 1)** — flagship stickiness, reuses OpenAI + our structured data.
3. **ISW Middle East registry + comparison (1A)** — reuses ISW machinery.
4. **i18n scaffolding + en/uk (2)** — smallest, proves the pipeline.
