# WS-7.3 — templated source descriptors + per-digest source summary statement (step 33)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-33-ws7-descriptors.md`, whose working spec is the
  2026-09-08 read-only pass log (`/Users/go/code/bnow-net-worktrees/logs/step33.readonly-20260908.log`)
  and PLAN-WS-7 §3 C3/C4/C5/C7/C8 + §4 WS-7.3 + §9.8's step-33 rewrite, under
  `docs/prompts/2026-09-05-48h-COMMON.md`.
- **Lane / worktree:** `48h-ws7-docs-20260905`.
- **Branch:** `48h/ws7-docs-20260905-step33-descriptors`, cut from the lane branch.
- **Base SHA:** `dc2e55e3aa2b8530f55c6a54841de64ced09262d` (the lane branch tip; `origin/main`
  moved to `6913c57` during the session — a launcher change that touches nothing here).
- **Mode:** unattended session (relaunched with a permission mode after the read-only pass
  exited). No `.env.local` was copied; no database, no network, no provider.
- **Spend: $0.** No paid provider call, no deploy, no environment change, no migration.
- **PR:** [#77 — WS-7.3: templated source descriptors + per-digest source summary statement](https://github.com/vociferous-artificial-intelligence/bnow-net/pull/77), three commits (`dfb2dc9` modules, `250567c` render targets, `1ea4a07` docs). Pre-push gate green.

## Built

Two pure modules, two render targets, four crosswalk rows.

| File | What |
|---|---|
| `src/lib/tradecraft/descriptor.ts` (new) | `describeSource()` — `descriptor-v1`. A total function over a narrow projection of `sources` + `source_theater_stats`: identity and platform, citation volume and date span in the named reference corpus, the hedging distribution as largest-remainder shares with the cue vocabulary, the ruling-16 sentence for `unknown`, registry status, and the non-independence caveat. Also `hedgingShares()`, `isPlatformRoot()`, `descriptorScopeForCountry()`. |
| `src/lib/tradecraft/source-summary.ts` (new) | `summarizeDigestSources()` — `summary-v1`. Distinct documents / channels / platforms, per-claim corroboration shares, the three load-bearing sources, the count of claims resting on a single unconfirmed document, and the cap fact — read from the digest's own persisted record or reported as not recorded. Also `readRecordedSourceMix()` (fail-closed parse) and `sourceMixFact()`. |
| `src/app/registry/[id]/page.tsx` | Renders the global descriptor in its own section and a per-corpus descriptor under the reference-corpus table. The theater query gained the five hedging counts. Admin-only surface. |
| `src/app/digests/[country]/[date]/page.tsx` | **The customer-visible target (C3).** A per-track "Sources for this digest" section: the summary statement, a descriptor for each load-bearing source that has a registry row, and the generated-not-judged label with the version. One additive projection on the header query (`structured->'stats'->'sourceMix'`) and one new query in the existing `Promise.all` (the registry profiles of the distinct cited sources). |
| `src/lib/tradecraft/crosswalk.ts` + `docs/METHODOLOGY-TRADECRAFT.md` | The four rows this PR moves, module and document together (the drift test makes them a pair). |
| `docs/OPEN-TASKS.md` | #56 status line: the descriptors fail closed on known roots; the residual is recorded. |

**Crosswalk row changes** (public text carries no path, symbol or task id — the drift test
forbids all three):

| Standard · requirement | Before | After |
|---|---|---|
| ICD 203 · quality and credibility of underlying sources | PARTIAL, closes at WS-7.3 | PARTIAL, closes at **WS-7.4** — the descriptor now exists; no credibility level is asserted, and credibility is 7.4's |
| ICD 206 · source descriptors conveying reliability, bias and limitations | GAP | **PARTIAL**, `not in WS-7` — reliability and limitations are conveyed; **nothing models bias**, and no planned step does |
| ICD 206 · source summary statement for the product as a whole | GAP | **BUILT** |
| ICS 206-01 · brief narrative quality descriptor per source | GAP | **BUILT** |

The ICD 206 summary row's enforcing-file cell was **wrong before this PR** and is corrected:
it cited `src/lib/conflicts/evidence-selection.ts:46,98-103`, a module `AGENTS.md` itself
records as "imported by nothing in production". It now cites the modules that actually
enforce the mechanism. `docs/METHODOLOGY-TRADECRAFT.md` §7 item 4 also listed descriptors and
the summary statement as missing; corrected in place.

## Tests

**Unit: 4,082 / 270 files → 4,147 / 274 files, all green** (`npm test`). Typecheck clean;
`npm run lint` 0 errors (3 pre-existing warnings, none in a file this PR touches). No
integration test: this PR adds no migration and touches no schema, and both new modules are
pure. Spend line: **$0**.

New files:

- `src/lib/tradecraft/descriptor.test.ts` (23) — golden full-text assertions for the cited,
  zero-citation, unclassified, single-citation, no-span, decayed/dead, unknown-platform and
  platform-root renderings; share arithmetic summing to exactly 100; the corrected
  platform-root rule in both directions; the ruling-1 sentinel; a no-weight-constant scan; a
  no-score-word scan; and parity of `descriptorScopeForCountry` with `referenceFor`.
- `src/lib/tradecraft/source-summary.test.ts` (18) — golden full-paragraph assertions;
  per-claim (not per-digest) corroboration; a source counted once per claim; document
  de-duplication; the weak-single-document count; the empty digest; singular grammar; tie
  ordering; the fail-closed mix parse over eight malformed shapes; the over-cap explanation;
  and the ruling-1 sentinel.
- `src/lib/tradecraft/descriptor-import-hygiene.test.ts` (5) — source scan (no environment
  read, no database, no provider, no spend ledger, **no clock**) over all three tradecraft
  modules, a blanked-environment import-and-render, and a reproducibility pin.
- `src/app/registry/[id]/page.test.tsx` (8, new file) — descriptor rendering, per-corpus
  naming, the score withheld from the descriptor in **both** views, no weight constant for
  either role, the #56 caveat, the zero-citation case, and the ruling-21 gate-before-query
  pair (the page had no unit test before).

Extended: `src/app/digests/[country]/[date]/page.test.tsx` (21 → 32).

One existing assertion was **narrowed, not deleted**: the analyst-visible-metadata test
asserted the page contains no `"conf"` substring. The summary's ruling-12 sentence contains
"confirmation" and the descriptors contain "confirmed" — ISW's hedging vocabulary, not the
confidence score. It now asserts what the 2026-07-16 decision actually withheld: no `conf`
word, no `confidence` word, and no `0.8`/`0.80` numeric confidence. The reason is in the test.

## Rulings touched and how each is satisfied

- **1 (no ISW prose or source full text).** Neither module's input type has a content field.
  Both test suites carry a sentinel fixture that smuggles ISW takeaway text, document body
  text, a document title and claim prose in fields a `SELECT *` row really could carry, and
  assert the marker reaches no output string and no serialized field. The digest-page test
  goes further: it asserts the sentinel **is** on the page (the claim renders it) and is
  **not** in the generated provenance block.
- **3 (stub data never renders as fact).** No new data source. The summary counts exactly the
  documents the page already renders, so it cannot surface anything the evidence trail does
  not; the descriptor reads the registry, which stubs never enter.
- **12 (same-theater ±1-day dedup).** Stated in the summary itself: a second document is a
  surviving distinct record, not an independent confirmation. Pinned by a golden assertion.
- **14 (per-theater corpora + the 40% mix cap).** The summary names the per-theater gather and
  reports the cap only from the digest's own persisted `sourceMix`. Ruling 14's other half —
  the per-theater reference corpus — is `descriptorScopeForCountry`, pinned against
  `referenceFor`.
- **16 (unhedged declaratives stay `unknown` at mid-trust).** The descriptor quotes it rather
  than paraphrasing: rendering `unknown` as "unknown reliability" would invert the meaning of
  the largest class in most profiles. The sentence appears whenever the class is non-zero.
- **19 (publication safety).** Untouched. Both templates read post-guard persisted claims and
  emit deterministic copy; no model prose enters either.
- **21 (the gate is the page's first statement).** Unchanged on both pages and now pinned on
  both: the digest page's existing gate test still passes with the new query inside the same
  `Promise.all`, and the registry detail page gets its own gate-before-query pair.
- **No ruling 5.** Nothing is persisted; no migration.
- **Moat (`view-policy.ts`).** `describeSource` has **no reliability parameter and no weight
  constant**, so there is nothing for a gate to leak — stronger than gating it. `showReliability`
  and `showWeightConstants` keep their existing sites untouched; `showScores` is untouched.

## Citations re-verified (corrections marked ✎)

Verified at base `dc2e55e`, **before** this PR's edits. The read-only pass's own
re-verification is not repeated; these are the lines this PR relied on or changed. Where a
line moved *because of this PR*, the post-PR position follows the arrow — that is displacement
by this diff, not a correction to the plan.

- `src/db/schema.ts` — `sources` **74-103**, `platform` **80**, `status` **94** ✓ ·
  `sourceTheaterStats` **109-131**, no `platform`/`name`/`status` (C7 holds) ✓ ·
  `platformEnum` **29-36**, `sourceStatusEnum` **46-50** ✓.
- `src/lib/registry/view-policy.ts` — policy rationale **9-17**, `RegistryView` **19-26**,
  `registryView()` **46-48** ✓. Untouched by this PR.
- `src/app/registry/[id]/page.tsx` — gate **27 → 28** ✓ (the plan's 27 was right; one import
  line was added above it) · `showReliability` **107 → 132**, **169 → 202**, **179 → 212** ✓ ·
  `showWeightConstants` **135 → 168** ✓. Every one of the four sites is unchanged in substance;
  only their positions moved.
- `src/app/digests/[country]/[date]/page.tsx` — gate **163 → 257** ✓ (still the first statement
  of the page component; displaced by the new row type and helper above it) · "No d.provider"
  header comment **187-189 → 281-283** ✓ (the mix projection is added below it, and the
  decision it records is untouched) · claim query **202-218 → 296-317** ✓ (unchanged) ·
  confidence-not-rendered comment **476-480 → 647-651** ✓ (untouched — that comment is
  WS-7.4's to correct, per PLAN-WS-7 §9.8's step-34 rewrite).
- `src/lib/analysis/source-mix.ts` — `MIX_CAP_FRACTION` **15**, `selectSourceMix` **26**,
  the fill-past-cap rationale **1-7**, `sourceMixStats` **80** ✓.
- `src/lib/analysis/digest.ts` — `structured.stats.sourceMix.{docsRaw,trackRows,docsAnalyzed}`
  **202-206** ✓.
- `src/lib/analysis/synthesize.ts` — **writes no `sourceMix` key at all** ✎ (confirmed by
  repo-wide grep: `sourceMix` appears only in `digest.ts`, `source-mix.ts` and their tests).
- `src/components/claim-evidence-model.ts` — `ClaimSourceDoc` **1-21**, `claimChannelKey`,
  `claimSourceLabel`, `evidencePlatform`, `summarizeClaimEvidence` **221-244** ✓.
- `src/lib/validation/run.ts` — `referenceFor` **45-57** ✓ (ru/ua → `ru`, ir → `ir`, Gulf →
  null).
- `src/lib/isw/urls.ts` — `canonicalSource` **85-122** ✎ **new finding, see below**.
- `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md` — the ruling-16 wording (`unknown=0.50` is
  binding: an unhedged ISW declarative, not a forced classification) **30-31** ✓.
- `docs/OPEN-TASKS.md` — #56 **460-467** ✎ (the plan cited 445-452; the file has shifted since),
  #14 **259-266** ✎ (the plan cited 252-259).
- `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md` — t.me and x.com already segmented,
  zero root rows **63-66** ✓.
- `src/lib/tradecraft/crosswalk.ts` — the four WS-7.3 rows at **101, 181, 189, 213** ✓ (the
  read-only pass's line numbers held); `crosswalk.test.ts` drift assertions **74-81**, the
  public-text scan **83-96**, BUILT ⇒ `closedBy` null **118-126** ✓.

### One verified correction to PLAN-WS-7, with its evidence

**The plan's platform-root fallback would have suppressed almost the entire registry.**
§4 WS-7.3 proposed treating "a `canonical_url` with no path segment" as a pooled root.
`canonicalSource()` (`src/lib/isw/urls.ts:85-122`) special-cases **only** `t.me` and `x.com`
into per-identity keys and returns `key: host` — the bare domain — for every other source. So
`pravda.com.ua` and `facebook.com` are the *same shape*, and the path rule would have hidden
the hedging profile of every non-social source in the registry while catching nothing #56 has
not already segmented.

Implemented instead, still fail-closed: a **known multi-tenant host cited at its root**, a
**per-identity platform (telegram / x) with no channel or account segment**, or an
**unparseable identity**. Both directions are pinned by test.

**Residual, recorded not hidden:** an *unlisted* multi-tenant root still gets a profile. No URL
heuristic can close that, because the registry key format makes a root and a publisher
indistinguishable — which is precisely why #56 is a segmentation migration. Written into the
module header and into #56's status line.

## Deviation from the plan's render target, and why

PLAN-WS-7 §4 names `src/components/claim-sources.tsx` as the customer-visible descriptor
target. This PR renders the descriptors on the **digest page**, in the per-track "Sources for
this digest" block, for the load-bearing sources — not on every document chip of every claim.
Three reasons, in order of weight:

1. **It is the same requirement, better served.** A claim carries up to eight visible chips
   and often more documents; a descriptor is a paragraph. Per-chip rendering would put dozens
   of paragraphs on a digest page and would be read by no one.
2. **`ClaimSourceDoc` stays untouched.** It is consumed by five surfaces (digest, search,
   entities, signals, ask). Widening it for one of them would have put the registry profile —
   and the `showScores` question — into four surfaces this step was not asked to change.
3. **The descriptor module is what step 32 needs anyway.** `describeSource` is a pure function
   with no page coupling, so WS-7.2's descriptor line calls it with whatever that PR queries.

C3's actual requirement — "the PR must also render it on a customer-visible surface" — is met,
and the acceptance test names that surface explicitly.

## Cost of the render, measured against the plan's claim

PLAN-WS-7 §3 C8 says the summary costs "zero additional queries". That is true of the
**summary** and this PR keeps it true: it is computed from rows already in memory. It is not
true of the **descriptors**, which need registry columns the digest page never selected. The
honest accounting:

- **+1 additive projection** on the header query (`d.structured->'stats'->'sourceMix'`, a
  jsonb subpath, not the whole blob).
- **+1 query** inside the existing `Promise.all` — no extra round trip — returning **one row
  per distinct cited source**, not per claim×document row. The alternative (17 registry
  columns on the claim join) repeats each source's profile once per cited document.

## Decisions needed

None blocking. Two the operator may want to answer before WS-7.4:

1. **Should the descriptor be translated?** It is English-first today, following the house rule
   for generated content (`src/lib/conflicts/product-copy.ts:9-13`, `legal-document.tsx:8`: UI
   chrome is translated, product content is not). The digest and claim text this block sits
   beside are also untranslated, so the block is consistent with its surroundings. Catalog
   integration would mean seven locales for every template sentence and a version bump per
   wording change. **Recommendation:** leave it English-first and revisit if a locale cohort
   materialises.
2. **Does the summary belong in the printed brief, or only in the evidence print?** It prints
   in both today (no `data-print="hide"`). **Recommendation:** keep it in both — a brief handed
   to a client is exactly where a provenance statement earns its keep.

## Debt and risks

1. **Bias is not modelled and no step closes it.** The ICD 206 descriptor row is honestly
   PARTIAL for that reason, marked `not in WS-7`. If a buyer reads "source descriptor" as the
   full ICD 206 mechanism, the crosswalk is what corrects them — which is the crosswalk working.
2. **The unlisted-multi-tenant-root residual** above. Tracked on #56.
3. **The cap fact is absent on the mapreduce digests** — 6 of 11 a day — because only the legacy
   engine records `sourceMix`. Those digests say so explicitly. Closing it means recording the
   mix in the reduce stage: additive jsonb into `structured.stats`, no migration, the
   `evidenceRecency` precedent — the same shape as PLAN-WS-7 §9.7 debt item 1, and worth doing
   in the same PR as that one. **Proposed as a new OPEN-TASKS entry; not filed here**, since
   the file's numbering is contended this window.
4. **Golden-text tests are deliberately brittle.** A wording change fails a named test with the
   full expected string in the diff. That is the point; the fix is to bump the version constant
   and update the golden, never to relax the assertion.
5. **Merge order.** This PR touches `digests/[country]/[date]/page.tsx` at the header query
   (`:281-289`) and inside the per-digest render, while step 32 adds `toolStamp` to the same
   header query. Both are additive column lists in the same `SELECT`; expect a small textual
   conflict and resolve by keeping both projections.

## Proposed AGENTS.md changes (for step 25 — not applied here, COMMON §4.7)

1. **Directory map** — `src/lib/tradecraft/` now exists and holds three modules. Proposed line,
   to sit after `src/lib/text/`:
   `src/lib/tradecraft/  IC-standards presentation: the ICD/ICS conformance crosswalk, templated`
   `                     source descriptors, per-digest source summary (pure — no DB/provider/env/clock)`
   Step 34 adds the estimative mapping to the same directory; one line covers both.
2. **No standing line is made wrong by this PR**, so there is no in-place correction to carry.
3. **Proposed decision-log entry, for signature:**

   > **2026-09-08 (WS-7.3 — source descriptors and the per-digest source summary ship as
   > presentation, and the plan's platform-root rule is corrected on evidence)** ICD 206
   > mechanisms 2 and 3 are generated deterministically from registry and citation data,
   > versioned (`descriptor-v1`, `summary-v1`), labelled "Generated from citation data … not an
   > analyst judgment", and persisted nowhere. **No new judgment and no new number:** neither
   > template reads `claims.confidence` or `sources.reliability_score` — `describeSource` has no
   > reliability parameter at all, so the moat field cannot leak through a descriptor and #14
   > and #56 are untouched. The customer-visible surface is the digest page, not
   > `/registry/[id]` alone, which is admin-only. **The cap fact is read only from the digest's
   > own persisted `structured.stats.sourceMix` and is otherwise reported as "not recorded for
   > this digest"** — never re-derived from the published claims, which are a different and
   > smaller population than the analysis batch the cap acted on; the mapreduce digests
   > therefore carry no cap figure today. **One correction to PLAN-WS-7 §4, on evidence:** its
   > fallback "a canonical_url with no path segment is a platform root" would have suppressed
   > the profile of essentially the whole registry, because `canonicalSource()`
   > (`src/lib/isw/urls.ts:85-122`) keys every non-social source by its bare host, making
   > `facebook.com` and `pravda.com.ua` the same shape. The shipped rule fails closed on a known
   > multi-tenant host cited at its root, on a telegram/x identity with no account segment, and
   > on an unparseable identity; the residual — an unlisted multi-tenant root — is recorded on
   > #56 and is closable only by that task's segmentation, not by any URL heuristic. Four
   > crosswalk rows move with their document rows: ICD 206 summary and ICS 206-01 descriptor to
   > BUILT, the ICD 206 descriptor row to PARTIAL (`not in WS-7` — nothing models bias), and the
   > ICD 203 quality/credibility row's closing step to WS-7.4. $0, no migration, no environment
   > change, no deploy.

## Handoff

- **Step 32 (WS-7.2, citation mode)** — `describeSource(source, stats, scope)` from
  `@/lib/tradecraft/descriptor` is the descriptor line: a pure function, no page coupling.
  `descriptorScopeForCountry(iso2)` gives the right corpus. Expect the small header-query
  conflict described under Debt item 5.
- **Step 34 (WS-7.4, estimative mapping)** — `src/lib/tradecraft/` and its import-hygiene test
  are in place; add `estimative.ts` to `TRADECRAFT_MODULES` in
  `descriptor-import-hygiene.test.ts` and the clock/env/database scan applies to it for free.
  The `HedgingClass` union and `HEDGING_CLASSES` order live in `descriptor.ts` — reuse them so
  the two modules cannot fork the vocabulary. The ICD 203 quality/credibility crosswalk row now
  points at WS-7.4; that row and the ICD 203 uncertainty row are 34's to move.
- **Step 25 (docs sync)** — the three proposed AGENTS.md changes above.
- **No prompt file needs rewriting.** Step 33's prompt is discharged as written, with the two
  documented departures (the render target, the platform-root rule) both argued above.
