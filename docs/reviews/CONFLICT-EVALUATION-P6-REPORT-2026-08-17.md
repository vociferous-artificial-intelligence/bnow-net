# Conflict-evaluations Phase 6 — feature-off conflict/region product and benchmark UX

Implementation report (2026-08-18 session; workstream dated 2026-08-17). Branch
`codex/conflict-evaluations-p6-product`, base `9a2db38` (Phase 5 merge). Binding
inputs: prompt §14, contract §11 (+§0), AGENTS.md rulings 1/3/15/19/20/21, the
Gate-4 binding rendering obligations, decision register #7/#8(g).

## 1. Repository IA review and decisions (mandated before building)

Existing IA examined: nav groups (`src/lib/nav/site-nav.ts` — Coverage promotes
only ru/ua/ir per ruling 15; conflicts were NOT added anywhere), `/countries` +
`/countries/[iso2]` public pages, `/scoreboard` (+ `/scoreboard/[country]/[date]`
detail) as the existing public benchmark surface, gated `/digests`, `/search`,
`/entities`, admin `/registry`, the sitemap/robots static lists (untouched), and
the 2026-07-12 IA refinement notes.

**Routes decided:**

| Route | Concept | Tier |
|---|---|---|
| `/conflicts` | conflict/region index | public-when-enabled teaser |
| `/conflicts/russia-ukraine`, `/conflicts/iran-regional` | conflict overview (the seven-question page) | public-when-enabled teaser |
| `/conflicts/<slug>/benchmark/<key>` | ONE fixture benchmark record in full | public-when-enabled teaser |
| `/conflicts/<slug>/benchmark/<key>/evidence` | the "what changed" published-claim view (claim text + source trails) | GATED (`requireAcceptedUser`) |

- Slugs `russia-ukraine`/`iran-regional` map to `ConflictId`s in
  `product-view.ts` (`CONFLICT_SLUGS`); unknown slugs 404 after the guard.
- **Benchmark key decision:** the spec's example `/benchmark/<reportDate>` is
  ambiguous against this corpus — four RU golden records share 2026-08-10 and
  four Iran records share 2026-08-08 (they are distinct fixture demonstrations
  of the same day). The detail route therefore takes the stable golden key
  (scenario id, ladder variants as `<scenario>~<variant>` — `#` is not
  URL-safe), validated against `/^[a-z0-9][a-z0-9-]*(~[A-Za-z0-9][A-Za-z0-9-]*)?$/`
  and failing closed to 404. At enablement, when one real report date = one
  evaluation, the same opaque-key segment can carry a report/edition key with
  no route change. No duplicate public concept was created: country pages,
  digests, and the scoreboard are untouched and are what the conflict pages
  drill back INTO.
- **Register #8(g) — legacy scoreboard-row disposition (adjudicated here):
  COEXIST.** The per-country RU/UA scoreboard rows continue unchanged (freeze
  list: no scoreboard behavior change; nav untouched). The conflict benchmark
  module carries the contract §11(d) cross-reference note verbatim in spirit
  ("different aggregations of one report — neither contradicts the other") with
  a link to `/scoreboard`, on every conflict overview and benchmark detail.
  The RECIPROCAL link (scoreboard → conflict view, "when the flag is on") is
  deliberately NOT added in this phase: it would put a conflict-flag read into
  `/scoreboard`, and the Phase-6 freeze list forbids any scoreboard edit. It is
  recorded as an enablement-time follow-up for the flag-on release (a one-line,
  flag-guarded link addition), residual risk §9.
- Navigation: NO conflict link added anywhere (`src/lib/nav` untouched;
  verified by diff). No sitemap/robots/OpenGraph/metadata exports on any
  conflict page (the root layout metadata is inherited unchanged).

## 2. Files added/changed and purposes

Data/flag layer (`src/lib/conflicts/`):
- `feature.ts` — the single fail-closed flag authority: ON iff `CONFLICTS_UI=1`
  exactly; `requireConflictsUi()` = the notFound() feature-off guard. Import-safe
  (no IO/env mutation on import). Ephemeral-injection-only contract documented
  in the module header.
- `product-view.ts` — the narrow fixture-backed provider the pages consume:
  slug/key identity, golden loading (every result re-validated through
  `validateConflictResultIdentityV1` + `assertPersistableConflictResultV1` —
  tampered artifacts throw), corpus legal markers, per-population partial
  counts, and `publishedEvidenceRows()`/`loadEvidenceView()` — the ONLY
  claim-text feed, published+non-stub+source-linked re-checked per row
  (rulings 2/3 belt-and-braces). Reference-unit text never leaves the module.
- `product-copy.ts` — every analyst-facing explainer/caveat string in one
  auditable module (no accuracy/truth language; no provider/model names; the
  §0 caveat is byte-identical to the offline report's sentence).

Components (`src/components/conflicts/`): `model.tsx` (Ratio = n/d beside every
%, rung badges with `data-degraded`, instants), `synthetic-banner.tsx` (ruling-3
truth-in-UI banner rendering the fixture files' own disclaimer marker),
`benchmark-headline.tsx` (Q4 module: one report-level published-output score,
caveat inside the module, partial-union diagnostic, keyword-rung degradation,
gap/no-snapshot unavailable variants), `lane-table.tsx` (Q2/Q6; incomparable
lane renders the label instead of counts), `contribution-table.tsx` (Q3,
non-additivity disclosed), `presence-module.tsx` (Q5: both populations,
per-population partials + rung labels, retention-gap callout),
`diagnostics-module.tsx` (Q6: thin-sourced with denominators, pair-weighted
timing note, BNOW-only split, reference-only id/lane lists, `<details>` method
stamps), `evidence-list.tsx` (gated what-changed union), `explainers.tsx`
(terminology/source-country/coexistence), `benchmark-run-list.tsx`,
`section.tsx` (labelled `<section>` landmarks q1..q7).

Routes (`src/app/conflicts/`): the four pages listed in §1, all
`dynamic = "force-dynamic"`, provider dynamically imported after guards; no DB
module imported anywhere under `src/app/conflicts/`.

Tests: `feature.test.ts` (12), `product-view.test.ts` (16), four page test
files (28) incl. the house "page-level authorization gate" spy-order case and
feature-guard-first cases; `src/integration/conflict-feature-off.itest.ts`
(23) — production build, real HTTP, body-only trust. One comment added to
`authz-page-gate.itest.ts` documenting why the gated conflict route is not a
ROUTES row there (its server runs flag-absent, so the positive control could
never pass; the equivalent three body assertions run in the new itest under
the flag-on server). No other existing file was modified.

## 3. Access-tier split and guard ordering (binding table)

| Route | 1st statement | 2nd | then |
|---|---|---|---|
| `/conflicts` | `requireConflictsUi()` | — | dynamic provider import → fixture read |
| `/conflicts/[slug]` | `requireConflictsUi()` | `await params` → slug check (404) | provider |
| `/conflicts/[slug]/benchmark/[key]` | `requireConflictsUi()` | params → slug/key check (404) | provider |
| `/conflicts/[slug]/benchmark/[key]/evidence` | `await requireAcceptedUser()` (ruling 21) | `requireConflictsUi()` | params → provider |

The teaser tier renders counts, lanes, scores, labels, methodology, explainers
— never claim text, never per-claim source trails. Published digest claim text
+ source trails render ONLY on the gated evidence route (contract §11
access-tier pin: it inherits the digest surfaces' tier). No conflict layout.tsx
exists — there is no layout gate to mistake for a boundary; the pages are the
boundary.

Mutation proofs (run, then reverted; recorded outputs):
- deleting `await requireAcceptedUser()` from the evidence page fails exactly
  its 3 gate-dependent unit cases (both "page-level authorization gate" cases +
  the unknown-key case), 4/7 others pass;
- removing the overview's leading `requireConflictsUi()` (leaving one AFTER
  data access) fails exactly the 2 guard-first cases, 7/9 others pass.

## 4. Seven analyst questions — mapping (contract §11 order, pinned by tests)

Both the overview and the benchmark detail render sections `q1..q7` in
document order (test: `compareDocumentPosition` walk + labelled-landmark
check):

1. **q1 covered** — conflict displayName, contributor theaters (legacy marked),
   tracks, reference series label; terminology explainer at first use.
2. **q2 changed/lanes** — lane table (both populations m/p/x per lane;
   partitioning note), published-union claim COUNT, link to the gated evidence
   view ("claim text and source trails are gated").
3. **q3 contributors** — non-additive contribution buckets by theater/track/
   source over corpus-recall matched units ("Matched takeaways with evidence
   from …"); source-country-relevance note.
4. **q4 benchmark** — ONE report-level score: the published-output headline
   `matched of denominator declared Key Takeaways (NN%)` under the frozen
   label; the §0 non-independence caveat INSIDE the module beside the score;
   partial-union diagnostic; degraded-rung banners; scoreboard-coexistence
   note + `/scoreboard` link; the full run list (unavailable rows as words).
5. **q5 presence** — corpus recall vs published retention side by side (both
   n/d), per-population partial counts, per-population matcher labels (mixed
   rungs always disclosed per population), retention-gap callout, published-
   population definition (register #4).
6. **q6 unavailable/thin/reference-only** — thin-sourced with explicit
   denominators, pair-weighted timing medians (nulls render "unknown"),
   BNOW-only renderable-vs-internal split, reference-only takeaways as
   id+lane+verdict (+compound/negative/missDiagnostic), method stamps in a
   native `<details>`.
7. **q7 drill-back** — links to `/countries/<iso2>` and `/digests/<iso2>` per
   contributor theater (subscriber labelling), `/scoreboard`, benchmark detail,
   gated evidence view.

## 5. Rendering obligations (Gate-4 binding + register #8) — fulfillment

- **Per-population partial counts** rendered in q5 (each population card shows
  its own `partial: n`), and the headline number is explicitly labelled "union
  across both populations" wherever it appears — never presented as a
  per-population figure (`partialCountsOf` in the provider; pinned by the
  compound-partial page test).
- **Pair-weighted timing medians** — `TIMING_PAIR_WEIGHTED_NOTE` renders
  directly beside every median ("a claim matched to two takeaways weighs
  twice"; ingest vs source-declared kept separate; unknown ≠ 0). Test-pinned.
- **Keyword-rung results render as DEGRADED** — amber `data-degraded` badge,
  "DEGRADED — keyword fallback (no usable LLM rounds)", plus the register-#8 M1
  full-denominator note and the `keywordUnmatchable` count. The `llm` rung is
  also DEGRADED ("single usable LLM round (no majority)"); unknown future
  labels fail closed to a visible UNRECOGNIZED-degraded badge. Test-pinned on
  ladder variants A and B.
- **Unavailable never rendered as zero** — publication gap and
  no-proven-snapshot records render provenance sentences with NO numeric
  score anywhere (page test asserts no `(N%)`/`N of M` pattern on the gap
  page); the run list renders "unavailable — no report published"/"no proven
  snapshot" in words; lane `unavailable_incomparable` renders the label
  INSTEAD of counts, with the explanatory note (honest misses stay in the
  denominator).
- **Mixed matcher rungs disclosed per population** — q5 always shows both
  population labels; the headline module additionally prints the mixed-rung
  note when labels differ (the committed goldens contain no mixed-rung result,
  so this path is component-logic + offline-report-parity; noted as residual
  for reviewers).
- **n/d near every percentage** — the `Ratio` component is the only percentage
  renderer; it always emits `matched of denominator … (NN%)`.
- **BNOW-only** — renderable items come from the published-retention
  population only; the corpus-recall figure renders as "(internal count only —
  corpus-recall-only claims are never listed)" (register #7 pin).

## 6. Explainer placements (contract §11 a–d)

(a) non-independence caveat: inside `benchmark-headline.tsx`, amber-edged,
directly under the score — never a footer (test: caveat testid WITHIN the q4
benchmark module); byte-identical sentence to the offline report.
(b) source-country relevance: q3, beside the contribution tables.
(c) terminology (conflict vs country vs benchmark scope): q1 `<details>` on
the overview and on the index at first use.
(d) scoreboard coexistence: q4, linked to `/scoreboard`; reciprocal link
deferred (see §1).

## 7. Test and verification coverage matrix

Unit (all in `npm test`): 3,166 passed / 225 files (base 3,110/219; +56/+6;
zero regressions).

| Surface/state | How verified |
|---|---|
| flag default off / "1" on / other spellings off | `feature.test.ts` (12) |
| slug/key identity, fail-closed golden loading, markers | `product-view.test.ts` |
| evidence feed: published-only, no unit text (all 14 goldens swept), traceability re-checks, empty union, gap null | `product-view.test.ts` |
| guard-first (public ×3 pages), gate→guard→data order (gated page) | page tests + 2 mutation proofs |
| seven-question order + labelled landmarks | overview + detail page tests |
| caveat-in-module, explainer placement, n/d near % | overview page test |
| degraded keyword/llm rungs, per-population labels | detail page test (ladder A/B) |
| compound partial (union + per-population) | detail page test |
| gulf incomparable lane, pair-weighted note | detail page test |
| publication gap: words only, no score pattern | detail page test |
| teaser boundary (no claim/unit text), captions | index/overview/detail tests |
| gated view: claim text, hedge, origin digest, trail, legacy label, BNOW-only, empty, gap, 404 | evidence page test |

Integration (`conflict-feature-off.itest.ts`, 23 tests, disposable Neon fork,
production `next build` + `next start`, paid keys blanked, LLM_DISABLE=1):
- flag ABSENT: 6 routes × {anon bare, anon RSC:1, accepted-session} = 18 body
  assertions — no conflict token in any body (statuses observed 404/307, not
  trusted).
- flag `CONFLICTS_UI=1` (ephemeral env on the spawned server only; one shared
  build since all pages are force-dynamic): anonymous teasers 200 without
  claim/unit text (non-vacuous: the benchmark module text is asserted
  present); gated evidence anon bare(307)+RSC bodies clean; accepted positive
  control 200 WITH the claim text; takeaway prose in NO body under any
  route/auth state.
- Single-file run: 23/23. Full-suite run: see §8.

## 8. Gate numbers

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean (0 errors, 0 warnings) |
| `npm test` | **3,166 passed / 3,166 (225 files)** — base 3,110/219, zero regressions |
| full `npm run test:integration` | **150 passed / 150 (21 files)** — base 127/20 + 23 new; disposable fork created and deleted |
| `npm run build` (flag absent) | PASS |
| flag-on build | not separately run — the itest and browser phases exercised the SAME flag-absent build artifact under a flag-on server (pages are force-dynamic; the flag is a runtime env read), which is the deployment-relevant combination |
| `git diff --check` / tree | clean |

## 9. Browser verification (fixture-backed, local only — what was actually covered)

Method: production build served locally on :3141 with `CONFLICTS_UI=1` as an
ephemeral process env (never persisted; `.env*` untouched; no Vercel change);
`DATABASE_URL` pointed at an unroutable local address — proving the conflict
pages issue ZERO DB queries (any query would have 500ed). The gated evidence
view was captured with `FEATURE_AUTH_GATE` unset (the documented gate-off
anonymous dev parity of `requireAcceptedUser`); the gate-on behavior over HTTP
is covered by the itest. Headless Chrome 151; dark/light via CDP
`Emulation.setEmulatedMedia` (`prefers-color-scheme`), layout metrics via CDP
`Runtime.evaluate`. All artifacts in the session scratchpad
(`p6-browser/*.png|pdf|html|log`), NOT in the repo.

| State | Coverage |
|---|---|
| narrow mobile 390px | index, RU overview, gulf detail, keyword-variant detail, gap detail, evidence — screenshots + measured `scrollWidth == 390` and `scrollX` pinned 0 after forced scroll (light AND dark) |
| desktop 1280px | index, both overviews, gulf/compound/keyword/quiet/gap details, evidence, empty-evidence — screenshots light+dark |
| light/dark | CDP-emulated `prefers-color-scheme`; body bg verified rgb(255,255,255)/rgb(10,10,10); dark screenshots visually inspected (amber degraded badges, banner, tables legible) |
| keyboard | HTML-level: skip-link `#main` target present, all interactives are native links/`summary` (focusable count per page recorded 19–39), landmark sections labelled; no JS focus traps exist (zero client JS in the conflict components). NOT verified: real Tab-order walk in a driven browser |
| print | `--print-to-pdf` of gulf detail, RU overview, evidence — PDFs render single-column, tables intact; no conflict-specific print stylesheet was added (the digest print stylesheet is scoped to digests). NOT verified: page-break polish |
| feature-off | served WITHOUT the flag: /conflicts, overview, evidence all 404 over HTTP (+ screenshot of the 404); the itest re-proves this against the production default env incl. RSC bodies |
| empty state | retention-gap evidence page (empty union message) — screenshot |
| partial-lane | compound-partial detail — screenshot (union + per-population partials visible) |
| unavailable-snapshot | publication-gap detail (390px + desktop) and gulf incomparable lane — screenshots |
| reduced motion | nothing animates on these pages (no transitions/animations in the conflict components); no explicit media-query verification performed |

**Found-and-fixed during this phase (measured, not speculative):** at 390px the
RU overview document scrolled horizontally (scrollWidth 576) — the `sr-only`
(absolutely-positioned) caption/labels inside the wide tables resolved their
containing block OUTSIDE the `overflow-x-auto` clip at the initial containing
block. Fix: the two scroll wrappers are now `relative` (commit `50761e7`);
re-measured scrollWidth 390 on every captured page, both schemes.

## 10. Judgment calls (for the Gate-6 reviewers)

1. **Fixture data renders behind a truth-in-UI banner.** Ruling 3 forbids
   fixture data rendering AS FACT. This phase's entire purpose is a fixture-
   backed reviewable surface, so every conflict page opens with the
   "Synthetic review corpus" note rendering the fixture files' own
   register-#7 `disclaimer` marker verbatim. Removing that banner requires
   real results + a decision-log entry (documented in the component).
2. **Q4 "one report-level score" = the published-output headline.** The §6.4
   metric pair is preserved: corpus recall renders in q5 (the pipeline
   comparison), so the benchmark module carries exactly ONE score per report
   as the contract's question 4 demands, and the two-population comparison is
   never conflated with it.
3. **Aggregate by-source contribution counts are teaser-tier.** The access
   pin allows "counts"; the q3 buckets are per-source distinct-matched-unit
   COUNTS (a §7 contribution dimension), not per-claim source trails. Trails
   (doc-level adapter/platform/timestamps/mirror lineage) render only on the
   gated view.
4. **English literals via one audited copy module instead of i18n catalog
   keys.** The house i18n rule keeps content English-first and this surface is
   feature-off; all strings live in `product-copy.ts` for single-file legal
   audit. Catalog integration for chrome strings is an enablement-time task.
   Localization-safe wrapping conventions are followed (`break-words`,
   `max-w-*`, logical `ps/ms` properties, RTL-safe flex layouts).
5. **Benchmark keys expose fixture scenario ids in URLs.** Honest for a
   synthetic corpus (the ids ARE the record identity); the key segment is
   opaque to the router and migrates to report/edition keys at enablement
   (§1).
6. **Ladder variants surface as separate run-list rows** labelled
   "variant …" — they demonstrate matcher degradation on the same report and
   are disclosed as demonstrations, not separate reports.
7. **`scenarioTitle` (fixture metadata) renders** as the demonstration label —
   it is authored harness metadata, not reference prose (the corpus disclaimer
   covers it); the sentinel-bearing scenario's title spells no sentinel.
8. **Gap/unavailable records keep the seven-section skeleton** with explicit
   "not applicable" text per section rather than collapsing the page — the
   order rule stays intact and the unavailable semantics stay in words.

## 11. Commit SHAs (this phase, in order)

- `a00c5d7` conflicts: fail-closed CONFLICTS_UI feature authority
- `df26b45` conflicts: fixture-backed product provider and audited surface copy
- `afe08b0` app: feature-off conflict routes answering the seven analyst questions in contract order
- `c86a622` conflicts: production-build bare-GET and RSC body tests for every conflict route (feature off + authz)
- `50761e7` conflicts: contain sr-only table labels inside the scroll wrapper (390px document overflow)
- (closing commit adds this report, the ledger row, and the authz-harness cross-reference comment)

## 12. Residual risks / open items for the two Gate-6 reviewers

For the product-clarity/accessibility reviewer:
1. Keyboard verification is HTML-level (native links/summary only, no JS);
   no driven Tab-walk or focus-visible screenshot was captured.
2. Print PDFs were rendered but not polished (no page-break rules; the tables
   print inside scroll wrappers — content is complete but wide tables may clip
   at print width in some engines; inspect `*-print.pdf`).
3. The 390px lane/run tables rely on in-wrapper horizontal scroll; the
   wrapped-cell rendering at 390 is legible but dense (see
   `keyword-detail-390-*.png`).
4. The overview's featured record is "newest scored" — with this corpus that
   is a 1-takeaway demonstration; judge whether the framing ("Latest fixture
   benchmark day") reads clearly enough as synthetic.
5. Mixed-rung rendering (differing per-population labels) has component logic
   + unconditional per-population disclosure, but NO committed golden
   exercises a mixed result end-to-end.
6. `--force-dark-mode`/`--blink-settings` flags proved unreliable for dark
   emulation; the CDP `setEmulatedMedia` captures are authoritative. Sanity of
   AA contrast in dark mode was inspected visually, not measured numerically.

For the legal/authorization/truth-in-UI reviewer:
1. Verify the claim-text boundary independently: the itest tokens are one
   scenario's claim/unit sentences; a reviewer may want a sweep asserting NO
   fixture claim text of ANY scenario appears in teaser bodies (the unit-test
   sweep in `product-view.test.ts` covers all 14 goldens for unit text; the
   HTTP sweep uses representative tokens).
2. The gated route's positive control lives in the NEW itest (flag-on server),
   not in `authz-page-gate.itest.ts` (flag-absent server) — cross-referenced in
   both files; confirm this split is acceptable or direct a harness merge.
3. `scenarioTitle`/`acceptanceRef` provenance: titles render; confirm the
   corpus disclaimer suffices (they are authored metadata, never ISW-derived).
4. The evidence view renders `editionKey`-style identifiers (e.g.
   `roca:2026-08-12:final`) — identity tokens, not prose; P3's identity
   validator refuses prose-bearing keys for current-normVersion records.
5. Browser verification used `FEATURE_AUTH_GATE` unset for the gated-view
   screenshots (documented dev parity); the enforcement path is proven only by
   the itest + unit gate-order cases.
6. Enablement-time follow-ups recorded here: scoreboard reciprocal link
   (flag-guarded), i18n catalog integration, real-result benchmark keys,
   synthetic-banner retirement decision, robots/sitemap posture review if the
   surface ever becomes public-by-default.
