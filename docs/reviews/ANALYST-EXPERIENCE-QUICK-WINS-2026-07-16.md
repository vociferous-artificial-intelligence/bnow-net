# Analyst-experience quick wins — implementation review, 2026-07-16

Implements the approved quick-win batch in
`docs/reviews/ANALYST-EXPERIENCE-PUNCH-LIST-2026-07-16.md`, per the handoff prompt
`docs/prompts/2026-07-16-analyst-experience-quick-wins.md`.

Branch `codex/analyst-experience-quick-wins`, from clean `origin/main` at `8bbc308`.
Not deployed — awaiting the operator's normal approval.

| | |
|---|---|
| Pass 1 (low-layout-risk cleanup) | `9b4c27e` |
| Pass 2 (interaction/layout) | `846e3f0` |
| Gate | 1,562 unit tests / 135 files, typecheck, lint, `next build` — all green |
| Browser | 32/32 checks, real Chrome, light+dark, 1280 and 390×844 |

Presentation only. No ingestion, map/reduce analysis, validation scoring,
source-reliability calculation, claim traceability, publication safety, schema, data,
paid-provider, environment, workflow or deployment change. No paid call was made and no
production row was mutated. Every route href is byte-for-byte unchanged.

## Built

### Pass 1 — `9b4c27e`

**Workstream A (labels/navigation).** Coverage's index item is "More countries"
(`/countries` unchanged, still last, ru/ua/ir still the only promoted countries).
Solutions' `/datadark` item is "Russia data opacity". Locale selector items render
`EN — English`, `UK — Українська` via one `localeSelectorLabel()` shared by desktop and
mobile — priority order, hidden locales, `lang`/`dir`/`hrefLang`, current-state semantics
and the bare `?set=` links are untouched. Signed-in quick links drop the word "digest".
`view for:` → `Prioritize for:`; profile labels are Standard / Military & security /
Sanctions / Commodities / Compliance, with no weight or ranking change.

**Workstream B 1/3/4 + C (pipeline detail out of analyst output).** The provider/model
string is gone from the digest track headings and is no longer selected on either the
digest or scoreboard page. Raw claim-confidence decimals (`conf 0.82`) no longer render.
"First seen by BNOW" is gone from the evidence summary, expanded table, sort options,
copy/report plain+rich payloads and the print appendix. Evidence sorting is hidden when
a single document leaves nothing to order.

**Workstream B3 (freshness).** Digest headers state stage + last-updated ET time from the
persisted `created_at` rows via the existing `digestStage()` and `formatEtDateTime()`.

**Workstream E 1–4.** `/scoreboard` leads with the approved opening and the
country-baseline caveat, then metric cards and table; "How to read these numbers" moved
into a native `<details>` below. `/health` stops publishing `users`,
`subscribe_intents`, `validation_runs` and `isw_reports`, and gained its first test.

### Pass 2 — `846e3f0`

**Workstream B2 (print).** One "Print / save PDF" disclosure beside the digest title
holding "Brief" and "With full evidence", in a header action row that stacks below 640px.

**Workstream D (source-first evidence).** Columns are Source, Published, Title/link,
Reliability, with platform as a badge in the Source cell (the preferred width-saving
option; min-width 760px → 560px). `RSS/news` → `News`. Untitled documents are named by
transport. Real titles still win.

**Workstream F (readability).** Targeted contrast/type pass on the listed surfaces.

## Exit criteria

| Criterion | Result |
|---|---|
| Route hrefs byte-for-byte unchanged | **PASS** — no href touched; asserted in nav tests |
| RU/UA/IR only promoted; `/countries` last under Coverage | **PASS** — asserted |
| Desktop/mobile keyboard + RTL green | **PASS** — 33 header tests + browser keyboard pass |
| No logo asset; `BNOW.NET` wordmark | **PASS** — no asset added |
| Brief remains default/native print; full evidence opt-in | **PASS** — `data-print-mode` contract unchanged, stylesheet tests green |
| Print stylesheet + canonical URLs intact | **PASS** — stylesheet tests unchanged and green |
| No provider/model token in digest, scoreboard, Ask, copy or print | **PASS** — unit + browser assertions |
| No raw confidence decimal on screen/copy/print | **PASS** — unit + browser assertions |
| Every digest header states stage, time, timezone | **PASS** — via existing canonical helpers |
| "First seen" absent from render/copy/print | **PASS** — unit + browser assertions |
| Missing `published_at` renders Unknown, never borrows `fetched_at` | **PASS** — dedicated tests |
| Every claim keeps ≥1 safe source link when a safe URL exists | **PASS** — unchanged selection/sanitization |
| No raw document ids | **PASS** — asserted |
| Unsafe/data/javascript URLs never anchored | **PASS** — `safeHttpUrl` untouched; asserted |
| Signed-in reliability visible; reduced/public policy unchanged | **PASS** — `showScores` untouched |
| Evidence table: no avoidable page overflow at 390px | **PASS** — page never overflows; table scrolls in its own tested wrapper |
| Scoreboard results before methodology without JS | **PASS** — native `<details>`, collapsed |
| Caveat visible without expanding methodology | **PASS** — asserted in unit + browser |
| Metric definitions/targets/thin-sourced naming/at-publish proxy/RU-UA ROCA preserved | **PASS** — relocated verbatim, asserted |
| `/health` DB OK/DOWN + ISO timestamp retained | **PASS** — new tests |
| No user/access-intent/validation/report counts public | **PASS** — asserted against the real SQL |
| Meaningful text ≥ 4.5:1 in both themes on in-scope surfaces | **PASS** — see below |

## Contrast: measured, not assumed

Ratios were computed from the oklch palette **this build ships**
(`node_modules/tailwindcss/theme.css`) against the real backgrounds (`#ffffff` /
`#0a0a0a`), reproducing the punch list's figures exactly:

| Shade | On white | On `#0a0a0a` |
|---|---|---|
| gray-400 | **2.60:1** ✗ | 7.61:1 ✓ |
| gray-500 | 4.84:1 ✓ | **4.09:1** ✗ |
| gray-600 | 7.56:1 ✓ | 2.62:1 ✗ |

So `text-gray-600 dark:text-gray-400` (7.56 / 7.61) is the correct pair and is what
in-scope meaningful text now uses. Two findings worth naming:

- **`theater-status-panel.tsx` used `text-gray-400 dark:text-gray-500` — failing in
  BOTH themes** (2.60 light, 4.09 dark). The pair was inverted.
- Bare `text-gray-500` (no dark override) fails the dark theme at 4.09:1; several
  in-scope surfaces had it.

Sizes follow the review's rule: the evidence summary (the scan target), sort control,
profile row, feedback links, trail summary and mobile language list move to 14px; event
summaries read at gray-700/dark:gray-300; 12px is left to short tertiary chips (hedge,
entity, evidence and platform badges).

Two defects surfaced only in the browser, both pre-existing and both fixed: the
scoreboard table had **no horizontal cell padding**, rendering `theatercoverage` and
`1 / 3 / 5detail`.

## Verification

- **Unit/typecheck/lint/build:** 1,562 tests / 135 files (from 1,542 / 134), typecheck,
  lint and `next build` green.
- **Browser:** real Chrome, light+dark, 1280×900 and exactly 390×844 — no page-level
  horizontal overflow, WCAG 1.4.10 reflow clean at 320px, no console errors, and
  keyboard-only operation of the header language menu (`aria-expanded`, Escape returns
  focus), print disclosure, evidence trail + sort, and scoreboard methodology. 32/32.
- **Verified against a production build, not `npm run dev`.** Dev-mode React never
  hydrates on this WSL2 box — the `_next/webpack-hmr` WebSocket handshake fails
  (`ERR_INVALID_HTTP_RESPONSE`), so no React control responds to input, including the
  untouched hamburger. Native `<details>` controls still worked, which is what initially
  masked it. `next build` + `next start` hydrates correctly and all controls pass. **This
  is an environment artifact, not an application defect**, but it means dev-server
  clicking cannot verify React UI here.
- Playwright was resolved from a sibling checkout for the one-off run; **no dependency
  was added to this repo**. The Next-generated `next-env.d.ts` flipped to the prod types
  path during the build and was reverted — it is not part of the change.

## Decisions

1. **Pass 1 is one commit, not four.** `dictionaries.ts` changes for workstreams A, B, C
   and E interleave within the same catalogs; splitting them per-hunk risked broken or
   misleading intermediate states for modest benefit. The boundary the prompt actually
   requires — Pass 1 vs Pass 2 — is preserved, so Pass 2 can be reverted without
   restoring provider, confidence or First-seen metadata.
2. **Legacy i18n key names kept.** `nav.item.all_theaters`, `digest.view_for` and
   `digest.print.actions` keep their keys while their values change; renaming keys buys
   nothing and risks drift. Each is commented as legacy in place.
3. **Native `<details>` for the print disclosure, not `NavDropdown`.** The prompt asks
   for a disclosure; `<details>` is keyboard-operable with a native accessible name and
   expanded state, matches the evidence disclosure already on this page, and avoids
   hand-rolling a second menu. It collapses on selection. Trade-off: no outside-click or
   Escape dismissal, which `NavDropdown` would have given.
4. **`firstSeenAt` retained everywhere internally.** It remains on `ClaimSourceDoc`,
   still selected by the digest query, and is still the evidence sort tie-break, the
   ranking recency fallback and the validation-timeliness/health input. Only the
   presentation is gone, and `summarizeClaimEvidence` no longer computes
   `earliestFirstSeenAt` (an exact `toEqual` test fails if it returns).
5. **Confidence decimals removed, not relabelled.** No High/Medium/Low: the thresholds
   are not calibrated (#14). The value still ranks events and stays stored.
6. **`d.provider` dropped from both queries**, not merely unrendered — a dead selected
   column invites someone to render it.
7. **Evidence table keeps its tested `overflow-x-auto` wrapper.** The prompt permits
   this over a full responsive card conversion; the page itself never overflows at 390px
   or 320px. Follow-up recorded (#71).
8. **The scoreboard at-publish per-row subline stays at 12px** — a short label with a
   number inside a dense table, not a paragraph. Contrast fixed.

## Debt and follow-ups

- **#71 (new)** — evidence trail is still a min-width table inside a horizontal scroller
  on narrow viewports; a card layout below `sm` would remove the inner scroll.
- **#72 (new)** — buyer-profile `label`/`description` in `src/lib/profiles/config.ts` are
  hardcoded English and render untranslated on every locale's digest page. Documented in
  the file rather than silently expanded into scope, per the prompt.
- **#73 (new)** — the signed-out landing page's marketing sections still carry unpaired
  grays (`text-gray-500` with no dark override, bare `text-gray-400`). Out of Pass 2's
  listed scope ("signed-in home"); deliberately not blind-swept.
- **#74 (new)** — dev-mode hydration is dead on this WSL2 box (HMR WebSocket handshake
  failure). Verify React UI against `next build` + `next start` until fixed.
- **#64/#59 (existing)** — new/changed uk strings carry `// uk: needs native review`; de,
  ar, ja, pl and fr follow their existing unannotated machine-translation policy. None of
  these is market-ready translation.
- The scoreboard table's `date` and `agree / isw-only / ours-only` headers remain
  hardcoded English (pre-existing, untouched).

## Risks

- **Low.** No schema, data, spend, cron or environment surface is touched; the invariants
  in AGENTS.md §Standing rulings 1–5 are unaffected. The largest behavioral surface is the
  print disclosure, whose `data-print-mode` contract with `globals.css` is unchanged and
  still covered by the stylesheet tests.
- The freshness line is the only new *claim* made to analysts. It is derived solely from
  persisted `created_at` rows: a page states one stage only when every displayed track
  agrees, otherwise each track reports its own, so a page is never labelled Final because
  one track finalized. No next-final time is promised — the page has no reliable one and
  cron cadence is not re-derived.

## Explicitly not done

Per the prompt: no #17/#41/#61 OpenSanctions/entity work, no #56 Facebook migration, no
#69 GramJS work, no #14 calibration, no monthly scoreboard navigation (`?month=`, query
boundaries and page limits untouched), no percentage→fraction change, no feedback
environment splitting or outbound email (`FEEDBACK_EMAIL` untouched — it still fans out
to analyst mailtos, access-request notifications and X health alerts), no UTC/Local/ET
preference, no geographic blocking, no entity-nationality routing, no new logo/assets and
no new top-level feature.
