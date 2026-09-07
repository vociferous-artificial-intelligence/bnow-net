# WS-7.1 — tradecraft crosswalk + public `/methodology` (48h step 30)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-30-ws7-crosswalk.md`, under
  `docs/prompts/2026-09-05-48h-COMMON.md`, with the PLAN-WS-7 §9.8 "Rewrite — step 30" block
  binding (COMMON §2.5) and `docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md`
  §1, §2, §4.1, §6, §7, §9 as the specification.
- **Lane / worktree:** `48h-ws7-docs-20260905`.
- **Branches:** `48h/ws7-docs-20260905-step30-crosswalk` (PR 1) and
  `48h/ws7-docs-20260905-step30-methodology-page` (PR 2, stacked on PR 1 — the drift test in
  PR 2 reads the document PR 1 adds, so the two cannot be reviewed independently).
- **Base SHA:** `a821695f8d02254bc74114ac5d0b4007b9fb431f` (`origin/main`, 2026-09-06 —
  "docs: steps 17 and 18 written in full…"). The work was **built and gated on
  `98294c5c57dd808886ea40747ce8bbd50d14d37c`** (the lane branch was at `1e06112` and was
  fast-forwarded to it; no unique lane commits were lost), then rebased onto `a821695` — a
  docs-only commit touching `docs/prompts/*` only, with no conflict and no effect on any
  citation or count in this report. Both SHAs are recorded because every file:line below was
  verified at `98294c5`; they were re-verified unchanged at `a821695`.
- **Mode:** attended, plain session. Docs and render only. No DB access, no provider call, no
  env change, no deploy, no migration. **Spend $0.**

## Built

**PR 1 — `docs: tradecraft crosswalk (ICD 203 / ICD 206 / ICS 206-01 / ICD 208)`**

- `docs/METHODOLOGY-TRADECRAFT.md` (new). Per standard → requirement → BNOW mechanism →
  enforcing file:line → status BUILT / PARTIAL / GAP → which WS-7 step closes it, over **24
  requirements**: 12 under ICD 203 (the five analytic standards folded into three rows plus
  the nine tradecraft standards), 4 under ICD 206 (its four sourcing mechanisms), 5 under
  ICS 206-01, 3 under ICD 208. **5 BUILT · 12 PARTIAL · 7 GAP.** The table sits inside an
  HTML-comment fence (`<!-- CROSSWALK-TABLE:BEGIN/END -->`) so it is machine-readable by the
  drift test rather than by prose matching.
- Carries the two corrections the addendum names, in §1 and as pinned test assertions:
  **ICD 208's title is "Maximizing the Utility of Analytic Products"** (it is not a sourcing
  or citation directive), and **the one-year preservation rule for dynamic sources is in
  ICS 206-01, not ICD 206.**
- §4 states plainly the two things BNOW does that the standards do not require: **DB-enforced
  citation** (the deferrable `claim_must_have_source` trigger, ruling 2 — with the three
  properties that make it load-bearing: deferred to commit, re-asserted by a `9999` migration
  that always applies last, guarded by `src/db/migrations.test.ts`) and the **external ISW
  benchmark loop** (`validation_runs`), the latter with its three honest limits stated in the
  same section rather than in a footnote.
- §2 records the nomenclature decision (**T1, answered `Yes agree`** — INDEX §2.2): ICS 206-01
  descriptors and ICD 203 estimative language are the product vocabulary; NATO AJP-2.1 /
  Admiralty two-axis codes are derived export fields only.
- §6 records what is deliberately withheld and why — ruling 1 (no ISW prose, no source full
  text) and the registry moat. Because the document is repo-internal it states the v1 weight
  constants and cites `src/lib/isw/load.ts:38-46`; the public page does not (decision T5,
  option (a)).
- §7 is the standalone one-page reviewer/partner insert for the `docs/PARTNER-STRATEGY.md:24`
  "methodology validator" role — four things to audit without repository access, and an
  explicit ask to attack the `BUILT` rows.
- "Coverage" keeps its contract name throughout. The document makes **no** accuracy claim and
  **no** calibration claim; reliability stays behind `showReliability` / `showWeightConstants`
  and the #14 / #56 gates.

**PR 2 — `site: public /methodology page rendered from the crosswalk`**

- `src/lib/tradecraft/crosswalk.ts` (new) — the crosswalk as data: `CrosswalkRow`
  (`standard`, `requirement`, `mechanism`, `status`, `closedBy`), `STANDARD_ORDER`,
  `STANDARD_TITLES`, `rowsForStandard()`, `statusCount()`, `roadmapLabel()`. The module was
  **generated from the document's fenced table**, not transcribed, so PR 1 and PR 2 agree by
  construction and thereafter by test.
- `src/app/methodology/page.tsx` (new) — public, unauthenticated, DB-free, following
  `src/app/privacy/page.tsx`: `export const metadata`, a section wrapper, inline English body,
  the shared typographic primitives from `src/components/legal-document.tsx`. Renders the four
  per-standard crosswalk tables plus six body sections (how to read it, vocabulary, the two
  things beyond the standards, where the machine is disclosed, what is withheld, what is not
  claimed).
- `src/app/sitemap.ts` — `/methodology` added to `STATIC_PATHS` (`:13`), so it is indexed.
  `robots.ts` already allows everything not explicitly disallowed and needed no change.
- `src/app/seo.test.ts` — `/methodology` added to the `PUBLIC` list and to the
  "does NOT disallow the public pages" case, with a comment saying what the route is.

**Gate posture — public, no gate, no env, no ROUTES row.** Ruling 21 governs where an
authorization gate must sit on a *gated* page; it imposes nothing here. The page reads no
session and issues no query, so there is no gate to place first and no privileged output to
withhold: an anonymous bare GET and an `RSC: 1` GET are both *intended* to return the whole
page. It therefore gets **no** row in `src/integration/authz-page-gate.itest.ts` — that
harness's positive control asserts a privileged token reaches an accepted admin and nobody
else, which a public page fails by construction. No reason to gate the page was found; had one
been found the prompt requires stopping, and this report would say so instead. **No new Vercel
environment variable and no feature flag**, so ruling-4 cap ordering does not apply.

**Nav/footer link deferred, deliberately.** A link label needs a key in all seven i18n
catalogs (`src/i18n/dictionaries.ts`, enforced by `i18n.test.ts`) and must satisfy
`src/lib/nav/site-nav.test.ts`. The route and the sitemap entry ship first; the link is
follow-up work, recorded in Handoff.

## Tests

| Gate | Result |
|---|---|
| `npm test` (unit) | **3,914 / 3,914 (263 files) → 3,939 / 3,939 (265 files)** — +25 tests, +2 files |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 3 warnings (all pre-existing, in `validate/route.test.ts`, `hardening.test.ts`, `cron-run.test.ts`) |
| Fork integration tests | **not run — none apply.** No migration, no schema, no DB read path and no gated route is touched by either PR |
| Spend | **$0** — no provider call of any kind |

The before → after baseline was measured on this tree, not inferred: the full suite was run
with the two new test files temporarily moved out of the tree (3,914 / 263) and again with them
in place (3,939 / 265). The `seo.test.ts` edits add assertions to existing cases, not new tests.

**New test files.**

- `src/lib/tradecraft/crosswalk.test.ts` (10 tests) — the **drift test**. Parses the
  document's fenced table and asserts row count, order, `mechanism`, `status` and `closedBy`
  match `CROSSWALK_ROWS` field for field; asserts every row cites an enforcing file in the
  document; asserts the strings the *page* renders contain no `src/`, `drizzle/`, `scripts/`,
  `.ts`/`.tsx`, `WS-7` or `#nnn` token. Plus data invariants: unique requirement keys, all
  four standards covered, grouping by `STANDARD_ORDER` reproduces every row exactly once,
  every PARTIAL/GAP row names a closing step and every BUILT row names none, `roadmapLabel()`
  never leaks a workstream id, and the two corrections of record are pinned.
- `src/app/methodology/page.test.tsx` (15 tests) — the **render test** (first case: "renders
  without authentication — no session dependency, no DB query", copying
  `src/app/privacy/page.test.tsx`), every crosswalk row rendered exactly once
  (`tbody tr` count equals `CROSSWALK_ROWS.length`), the four issuance titles and dates, no
  repository path / file name / task number in the rendered text, the two beyond-the-standard
  claims, the coverage-not-accuracy contract wording, ruling 1's statement, links restricted
  to public routes, and metadata. Then the **moat test** (4 cases): none of the five hedging
  weight constants, no reliability score and no reliability ordering, the qualitative ordering
  sentence present instead, and — the cheap unambiguous form — no bare decimal anywhere on
  the page once standard identifiers (`AJP-2.1`, `ICS 206-01`) are stripped.

**Mutation proofs.** Both new guards were proven to fail on the defect they exist to catch,
then restored and re-run green:

1. Editing the document's ICD 208 "Consistent, predictable product structure" row from
   `BUILT | —` to `PARTIAL | WS-7.9` **without** touching the module → the drift test's
   "agrees on mechanism, status and closedBy" case fails, 1 failed / 9 passed.
2. Replacing the page's qualitative ordering sentence with the admin legend's actual constants
   → **three** moat cases fail (the five-constant check, the bare-decimal check, and the
   qualitative-sentence check), 3 failed / 12 passed.

**One copy correction landed after the report's first draft**, and it is recorded rather than
absorbed: `page.tsx` §6 said the reliability rating "is shown in context wherever a source is
cited inside a product", which overclaims. The claim-surface gate is `showScores`
(`src/components/claim-copy-model.ts:27`, applied `:213,227`), and it is **`false` on
`/signals`** (`src/app/signals/page.tsx:187,206`) while `true` on the digest
(`digests/[country]/[date]/page.tsx:505`), search (`search/page.tsx:216`), entities and ask
evidence panels. The sentence now scopes itself to a digest and says the rating is never a
standalone ranking, matching the house string `registry.reduced.methodology`
(`src/i18n/dictionaries.ts:312`). All 25 tests on the two files still pass. Found by a second
session working in the same worktree; its commit is carried in PR 2.

One test-construction defect found and fixed during the work, recorded because it is a live
trap for any future source-scan test over rendered output: `container.textContent` concatenates
sibling blocks with **no separator**, so a paragraph ending "…across users." followed by the
heading "5. Where the machine…" produced the substring `.5` out of thin air and the moat test
failed on a constant the page never printed. The moat assertions now read a block-joined form
(`h1,h2,h3,p,li,th,td` joined with newlines). A future scan test that greps `textContent` for a
short numeric token will hit this.

## Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose, no source full text).** Both artifacts describe *mechanisms*. The
  document and the page contain no ISW sentence, no source body text and no quotation from any
  ingested document. The only quoted words are the three hedging-cue *patterns* in the
  reviewer insert ("geolocated footage confirms" / "a milblogger claimed" / "ISW cannot
  independently verify"), which are already published verbatim in `docs/PRODUCT-BRIEF.md:107`
  as a description of ISW's own vocabulary, not as content extracted from a report. The page
  states the ruling to the reader in §6.
- **Ruling 3 (stub/fixture data never renders as fact).** Neither artifact renders any data.
  The page's only dynamic content is the three status counts, computed from the checked-in
  crosswalk module — no database, no fixture, no provider output.
- **Ruling 21 (authorization in the page).** Posture stated above and in a header comment on
  `page.tsx`: the page is public, gate-free by design, and correctly excluded from the
  `authz-page-gate.itest.ts` ROUTES table. No existing gated page was touched.
- **Ruling 4 (fail-closed caps).** Untouched — no provider call site, no cap env, no new env
  of any kind.
- **Rulings 13 / 14 / 16 / 19 (extractor versioning, per-theater corpora, unhedged
  declaratives, publication safety).** Described, never altered. No prompt, dataset, scorer,
  registry approval, model lock or persisted field is read or written by either PR.
- **Registry moat (`src/lib/registry/view-policy.ts`; not a numbered ruling but binding).**
  Decision **T5 option (a)** is implemented and enforced by test rather than by editorial
  discipline: the public page states the ordering qualitatively, matching
  `registry.detail.weighting_qualitative`, and the constants live only in the repo document.

## Citations re-verified

Every file:line below was re-verified at base `98294c5`. **Two of the addendum's citations had
moved and are corrected here** (both were already flagged by PLAN-WS-7 §9.8), plus three
further corrections this session found.

| Cited as | Verified at `98294c5` | Note |
|---|---|---|
| `drizzle/9999_claim_source_trigger.sql` | present, 40 lines; `CREATE OR REPLACE FUNCTION enforce_claim_has_source()` then a guarded `CREATE CONSTRAINT TRIGGER claim_must_have_source … DEFERRABLE INITIALLY DEFERRED` | exact |
| `map-prompts.ts:255-266` (addendum) | **`src/lib/analysis/map-prompts.ts:254-266`** — `export function mapExtractorVersion` opens at 254 | **corrected** |
| `src/lib/llm/openai-provider.ts:146` (addendum §1) | **`src/lib/analysis/openai-provider.ts:147`** — `readonly name = \`openai:${resolveWorkloadModel("digest").model}\`` | **corrected: wrong directory and wrong line** |
| `synthesize.ts:735,750` (addendum) | **`src/lib/analysis/synthesize.ts:443-449`** (`mapreduceProviderTag`) and **`:701`** (`dispatch: dispatchIdentity(dispatch)`) | **corrected** — the addendum's 735/750 are the persist call's `provider: providerTag` and the return shape, not the tag's definition |
| `model-config.ts:108,182` (addendum) | **`src/lib/llm/model-config.ts:133`** (`registryVersion: string` on the config interface) and **`:267`** (`registryVersion: ANALYSIS_ROUTING_REGISTRY_VERSION`) | **corrected** |
| `analysis-registry.ts:35` (plan §2.1) | **`src/lib/llm/analysis-registry.ts:38`** — `export const ANALYSIS_ROUTING_REGISTRY_VERSION = "analysis-reg-v1"` | **corrected** |
| `schema.ts:185-192` (addendum) | `src/db/schema.ts:184-192` — `externalId`/`url`/`title`/`content`/`contentHash`/`lang`/`countryIso2`/`publishedAt`/`fetchedAt`; `rawDocuments` opens at `:178` and closes at `:212` | exact as the plan states (`:184-192`) |
| `claim-evidence-model.ts:13-19` | `src/components/claim-evidence-model.ts:1-21` for `ClaimSourceDoc`; the 2026-07-16 non-presentation note for `firstSeenAt` is **`:12-20`** | plan's `:12-20` confirmed |
| `schema.ts:86-92`, `:119-124` (addendum) | `sources` at `:74-103` (five hedging counts `:87-91`, `reliabilityScore :93`, `status :95`); `sourceTheaterStats` at `:109-131` | plan's ranges confirmed; **C7 re-confirmed** — `source_theater_stats` carries no `platform`, `name` or `status` |
| hedging enum | `src/db/schema.ts:38-44`; used on `claims.hedging` at `:268` | exact |
| `docs/PRODUCT-BRIEF.md:107` | "…effectively their internal Admiralty-code ratings expressed in prose." | exact |
| `src/lib/conflicts/evidence-selection.ts` | `EVIDENCE_MIX_CAP_FRACTION` at `:46`; `cappedOut`/`capEvents`/`bounds` at `:98-103`; `capEvents` populated `:228,233` | plan's `:46,94-104,197` confirmed as the right region |
| `src/lib/analysis/source-mix.ts` | `MIX_CAP_FRACTION = 0.4` at `:15`; `selectSourceMix` at `:26` | exact |
| `src/lib/isw/load.ts:40-46` (plan C6) | **`:38-46`** — the comment opens at 38, `RELIABILITY_SQL` at 39, the five weights at 41-45 | **corrected (one line earlier)** |
| `registry/[id]/page.tsx:135-142` (plan) | **`:135-143`** — `view.showWeightConstants ?` at 135, the legend `<p>` 136-139, the qualitative branch 140-143 | **corrected (one line longer)** |
| `view-policy.ts:9-17` | present; `showReliability`/`allowReliabilitySort`/`showWeightConstants` at `:21,23,25` | exact |
| `registry.detail.weighting_qualitative` | `src/i18n/dictionaries.ts:313` | plan cited `:312-313`; the English string is on 313 |
| `src/app/sitemap.ts:13` | `const STATIC_PATHS = [` at 13 | exact |
| `src/components/legal-document.tsx:8` | "…it is not routed through i18n — same posture as digest/claim content." | exact |
| `docs/PARTNER-STRATEGY.md:24` | the "Methodology validator" row | exact |
| `src/lib/conflicts/product-copy.ts` | the coverage-never-accuracy language rule at `:6-13`; `NON_INDEPENDENCE_CAVEAT` at `:28` | exact |
| `src/db/schema.ts:307-325` | `validationRuns` with `coveragePct`, `unsupportedClaimRate`, `timelinessHours`, `divergences` | exact |
| `src/components/claim-copy-model.ts:16` | `export type ClaimCopyMode = "report" \| "link" \| "evidence" \| "text"` — still four modes | exact |

Every mechanism cited in the crosswalk resolves to a real file at `98294c5`; the existence of
all 26 cited paths was checked mechanically, not by eye.

**One deliberate deviation from PLAN-WS-7 §2.1's seed table, and it matters.** The plan's seed
marks preservation `BUILT` on the strength of "zero production deletions". This crosswalk marks
both preservation rows **PARTIAL → WS-7.6** instead, because at PR 1's base commit
`docs/RETENTION-AND-PRESERVATION.md` and the no-delete test **do not exist**, and the prompt's
acceptance criterion is that every cited mechanism resolves to a real file at the base commit.
Citing them would have been a forward reference dressed as evidence. Step 31 lands both and
flips the two rows to `BUILT` in the same PR — which is also a live exercise of the drift test.

## Decisions needed

- **T5 — unanswered; built as (a) and enforced.** May the public `/methodology` page print the
  hedging weight constants? Options: (a) qualitative ordering only; (b) print them.
  **Recommendation: (a)**, as shipped — `view-policy.ts:9-17` names them a moat field withheld
  from *every* non-privileged surface, and a public page printing them would nullify that
  policy in one edit. If the operator answers (b), the change is one sentence in
  `page.tsx` plus inverting the moat test's expectations; nothing stalls either way.
- **T1 — already answered (`Yes agree`), recorded in §2 of the document.** No action.
- **New: the nav/footer link to `/methodology`.** Not a blocking decision, but it is a product
  call rather than an engineering one: the page is indexed and linkable but reachable from no
  BNOW surface until someone adds a label key to all seven catalogs. Recommendation: add it to
  the footer beside `/privacy` and `/terms` in the same PR that next touches the catalogs.
- No other decision is required by this step. T2 / T3 / T4 gate steps 32 and 34, not this one.

## Debt and risks

1. **The crosswalk's statuses are a judgment and will rot.** Twelve rows are `PARTIAL` and the
   distinction between `PARTIAL` and `GAP` is editorial in a few of them (for instance "Uses
   clear and logical argumentation" is called PARTIAL because per-claim evidence sets exist,
   which is a defensible but arguable reading). The drift test keeps the document and the page
   consistent with each other; **nothing keeps either consistent with the code.** A row can go
   stale silently when a WS-7 step ships. Mitigation as designed: every WS-7 step that closes
   a row must flip it, and steps 31–34 each have that in their handoff.
2. **The public page is unreachable from the site.** Deferring the nav link was the right call
   (seven catalogs, an enforced i18n test), but until it lands the page's audience is whoever
   is handed the URL or finds it in the sitemap. It should not be described to a buyer as "on
   our site" without that caveat.
3. **The reviewer insert makes an ask BNOW must be ready to receive.** §7 invites a validator
   to attack the `BUILT` rows and to say whether the hedging taxonomy is a lossy reduction.
   That is deliberate, but there is no intake process behind it beyond the correction address
   in the Privacy Notice.
4. **The moat test's bare-decimal rule is intentionally strict** and will fail a future edit
   that adds a legitimate decimal (a percentage, a version). The failure message and the
   comment say what to do; this is brittleness in the safe direction, and it is recorded here
   so nobody weakens the rule without reading why it exists.
5. **`statusCount()` renders live counts into public body copy.** If a future edit changes a
   status, the page's "Of 24 requirements, 5 are BUILT…" sentence follows automatically — good
   — but the page test asserts row *count* parity, not the counts sentence, so a wrong count
   cannot occur but an *awkward* one can (for example if every row became BUILT the sentence
   still reads sensibly, but "0 are GAP" would render). Cosmetic, recorded, not fixed.
6. **No integration or browser evidence.** The page's render is unit-proven under jsdom only.
   It has not been served from a production build, so its layout at narrow viewports and its
   dark-mode contrast are unverified. The table is wrapped in `overflow-x-auto` and uses the
   existing token palette, but that is design-by-precedent, not measurement.

## Handoff

**What WS-7.2 / 7.3 / 7.4 must keep consistent with the crosswalk's wording** — the crosswalk
is now the vocabulary of record for the whole workstream, and three of its choices are binding
on the later steps:

1. **Status flips are part of each step's PR, not a follow-up.** When a step ships, it edits
   both `docs/METHODOLOGY-TRADECRAFT.md`'s fenced table **and**
   `src/lib/tradecraft/crosswalk.ts`, in the same commit, or the drift test fails. Which rows
   each step owns:
   - **Step 31 (WS-7.6):** ICD 206 "Sources preserved and retrievable for the life of the
     product" and ICS 206-01 "Dynamic sources preserved at least one year from product
     issuance" → `BUILT`, `closedBy: null`, mechanism rewritten to cite the policy and the
     no-delete test, and the enforcing-file column updated to
     `docs/RETENTION-AND-PRESERVATION.md` plus the new test path.
   - **Step 32 (WS-7.2):** ICS 206-01 "Citation elements per source…", "Disclosure of AI or ML
     tooling…", "Consistent PAI / CAI / OSINT vocabulary"; ICD 208 "Output a customer can
     reuse in their own product"; ICD 203 "Uses clear and logical argumentation".
   - **Step 33 (WS-7.3):** ICD 206 "Source descriptors…" and "Source summary statement…";
     ICS 206-01 "A brief narrative quality descriptor per source"; ICD 203 "Properly describes
     the quality and credibility of underlying sources".
   - **Step 34 (WS-7.4):** ICD 203 "Properly expresses and explains uncertainty".
2. **Vocabulary that must not fork.** The crosswalk says "coverage against a named expert
   benchmark", never "accuracy"; "corroboration-derived confidence", never "analyst
   confidence"; "the source's own estimative posture" for the hedging label, never "BNOW's
   assessment"; "generated from citation data", never an unlabelled descriptor. WS-7.3's
   descriptor label and WS-7.4's confidence label must use those exact phrases, because the
   public page now promises them.
3. **The moat answer is shipped, and later steps inherit it.** Decision T5 = (a) is enforced by
   `src/app/methodology/page.test.tsx`. WS-7.3 renders descriptors on a customer-visible
   surface (`src/components/claim-sources.tsx` per plan §9.8), so it inherits the same rule:
   counts and dates are fine on a reduced view, the score and the weights are not. If WS-7.3
   adds a public descriptor, it should add the equivalent moat assertion to that surface's
   test rather than relying on this one.

**Prompt rewrites requested.** None. The step-30 prompt and PLAN-WS-7 §9.8 were followed as
written; the only substantive deviation (preservation rows PARTIAL rather than BUILT) is
required by the prompt's own acceptance criterion and is closed by step 31 in this same
session. One line of PLAN-WS-7 §2.1 is worth correcting when step 25 next touches it: its seed
table's preservation row reads `BUILT`, which was true of the *property* and not of the
*evidence*, and this step's crosswalk supersedes it.

**Proposed AGENTS.md changes (COMMON §4.7 — step 25 applies them; this session edited
`AGENTS.md` not at all).**

- *Directory map*, after the `src/lib/registry/` line — insert:
  `src/lib/tradecraft/  tradecraft crosswalk data (ICD 203/206, ICS 206-01, ICD 208) — the`
  `                     ONE source behind docs/METHODOLOGY-TRADECRAFT.md and public /methodology`
- *Architecture, "Product surface" line* — after `privacy + terms (public legal docs)` insert
  `methodology (public tradecraft crosswalk)`.
- *Directory map, `docs/` entry* — add `METHODOLOGY-TRADECRAFT` to the listed documents.
- **Proposed decision-log entry** (append at the end, unsigned until step 25 lands it):

  > **2026-09-07 (WS-7.1 tradecraft crosswalk + public `/methodology`; repository only, not
  > deployed)** The tradecraft crosswalk landed as two stacked PRs on base `98294c5`:
  > `docs/METHODOLOGY-TRADECRAFT.md` (24 requirements across ICD 203 / ICD 206 / ICS 206-01 /
  > ICD 208 — 5 BUILT, 12 PARTIAL, 7 GAP — each with the file that enforces it and the WS-7
  > step that closes it), and a public, unauthenticated, DB-free `/methodology` page rendered
  > from `src/lib/tradecraft/crosswalk.ts`, the one source both read. Two corrections of
  > record are carried and test-pinned: **ICD 208's title is "Maximizing the Utility of
  > Analytic Products"**, and **the one-year preservation rule for dynamic sources is
  > ICS 206-01's, not ICD 206's.** Decision **T1** (`Yes agree`) is recorded as the product
  > nomenclature: ICS 206-01 descriptors and ICD 203 estimative language, with NATO AJP-2.1 /
  > Admiralty codes as derived export fields only, never a headline. Decision **T5 is
  > unanswered and was built as option (a)**: the public page states the reliability ordering
  > qualitatively and prints no weight constant, no score and no reliability ordering —
  > enforced by a moat test, not by editorial discipline, because `view-policy.ts:9-17` makes
  > the reduced view a single-point decision that a public page could otherwise nullify in one
  > edit. Ruling 21 imposes nothing on the new route and it deliberately has **no**
  > `authz-page-gate.itest.ts` ROUTES row (that harness's positive control asserts an
  > admin-only token a public page fails by construction); the route is added to sitemap
  > `STATIC_PATHS` and the nav/footer link is deferred (a label key would touch all seven i18n
  > catalogs). A **drift test** parses the document's fenced table and pins it to the module
  > field for field; both it and the moat test are mutation-proven. Gates: typecheck clean ·
  > lint 0 errors (3 pre-existing warnings) · unit **3,914/3,914 (263 files) → 3,939/3,939
  > (265 files)**. Zero paid calls, zero production writes, no migration, no env change, no
  > deploy. Binding until superseded: the crosswalk is the workstream's vocabulary of record —
  > "coverage" never becomes "accuracy", the confidence label is corroboration-derived and
  > never "analyst confidence", and every WS-7 step that closes a row flips it in the document
  > and the module in the same commit. Report:
  > `docs/reviews/WS-7-1-CROSSWALK-2026-09-06.md`.

**OPEN-TASKS.** This step touches no existing task's status. Step 31 files the Wayback-style
archival entry.
