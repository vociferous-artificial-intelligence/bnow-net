# WS-7.4 — ICD 203 likelihood band + corroboration-derived confidence (48h step 34)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-34-ws7-estimative-mapping.md`, including its
  2026-09-08 **DECISIONS BINDING** header, under `docs/prompts/2026-09-05-48h-COMMON.md`.
  Rewrite sources: `docs/reviews/PLAN-WS-7-tradecraft-legibility-2026-09-06.md` §4 (WS-7.4),
  §6.1–6.3; `docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` §4.4 and §7;
  `docs/reviews/WS-7-2-CITATION-MODE-2026-09-07.md` for the citation-block shape.
- **Governing decision, SIGNED: T3 / T3-a / T3-b** — `AGENTS.md`, "2026-09-07 (T3 —
  PLAN-WS-7 §6.1–6.3 signed as drafted, with T3-a and T3-b)". `AWAITING AUTHORIZATION: T3`
  is therefore **not** printed; the tables ship as operator-approved data. T1 (AJP-2.1 is a
  derived export field, never the primary presentation) and T5 (weight constants stay off
  the public methodology page) are also signed and are both honoured below.
- Lane `48h/ws7-tradecraft-20260905`, step branch
  `48h/ws7-tradecraft-20260905-step34-estimative`, worktree
  `/Users/go/code/bnow-net-worktrees/48h-ws7-tradecraft-20260905`.
- Base SHA **`48a9d4e`** (= `origin/main` at session start; the merge of PR #80, step 32).
- **Attended** session. Spend **$0** — no provider call, no database, no environment read or
  write, no deploy, no migration, no schema change.

## Built

One commit, `3b5f81b` — `tradecraft: ICD 203 likelihood band and corroboration-derived
confidence`.

**New**

- **`src/lib/tradecraft/estimative.ts`** — the mapping, as data. `ESTIMATIVE_MAP_VERSION =
  "estimative-map-v1"`; `ESTIMATIVE_MAP_V1` as the signed 5 × 4 grid with a per-cell
  rationale comment; `ICD203_RANGES` declaring **all seven** bands (so the four V1 never
  assigns are explicit rather than absent); `corroborationTier()`; `estimateForClaim()`;
  the AJP-2.1 `credibilityFor()` derived **from the band**, so §6.2 and §6.3 cannot
  disagree; and the presentation helpers `likelihoodLabel` / `confidenceLabel` /
  `formatPercentRange` / `estimateDerivation`.
  **Its only import is `import type { ClaimEvidenceSummary }` — it has no runtime import at
  all**, which is what makes it safe in a client bundle and structurally incapable of
  acquiring an analytic input.
- **`src/components/claim-estimative.tsx`** — the one presentational leaf, plus
  `claimEstimativeLabels(t)`.
- Tests: `src/lib/tradecraft/estimative.test.ts` (59), `src/components/claim-estimative.test.tsx` (8).

**Changed**

- `src/app/digests/[country]/[date]/page.tsx` — the band on the claim row and in the print
  appendix's status line (the one literal `statuses[hedging]` render site in the tree); the
  OPEN-TASKS #14 comment rewritten in place.
- `src/app/search/page.tsx`, `src/app/signals/page.tsx`, `src/app/ask/page.tsx`,
  `src/app/ask/ask-form.tsx`, `src/app/ask/ask-result.tsx` — the other three named surfaces,
  with `estimativeLabels` threaded on the existing `evidenceLabels` / `copyLabels` pattern
  (necessary on /ask: `askStrings` carries only `ask.*` keys, so `t` there cannot resolve a
  `tradecraft.*` key).
- `src/components/claim-copy-model.ts` — the estimative clause on the copy "status" line,
  plain and HTML; two new `ClaimCopyLabels` fields.
- `src/lib/citation/ics206.ts` — `Ics206Estimative` on the citation artifact, three English
  field constants, and both serializers. **The T4 dark-stamp policy is untouched** — the
  block is computed from the claim's own hedging and evidence counts and is independent of
  `ClaimCitationStamp`; a test asserts it renders identically on the withheld and the
  disclosed artifact.
- `src/i18n/dictionaries.ts` — three English-only `tradecraft.*` chrome keys.
- `src/lib/tradecraft/crosswalk.ts` + `docs/METHODOLOGY-TRADECRAFT.md` — the ICD 203
  "properly expresses and explains uncertainty" row, `GAP`/`WS-7.4` → `PARTIAL`/`not in
  WS-7`, in both (the drift test compares them field for field).
- `src/app/methodology/page.tsx` — §7's now-false sentence, rewritten (below).
- `docs/OPEN-TASKS.md` — a note on **#14** that WS-7.4 does **not** satisfy it.

### The three standing lines this PR made wrong, corrected in place (COMMON §4.7)

1. **The public `/methodology` page said, in §7 "What we do not claim":** *"we do not state a
   likelihood or an analytic-confidence level of our own — today we carry the source's own
   estimative posture, and nothing further."* Shipping this PR would have made a public
   truth-in-UI statement false on the day it deployed. Replaced with a paragraph that states
   the derivation (hedging posture + document independence, fixed and versioned), states
   plainly that **no human has reviewed them**, keeps the un-reversed refusal to claim the
   reliability rating is calibrated, and names the two withheld extremes. Pinned by a new
   test asserting the old sentence is gone and the new one is present.
2. **The digest page's OPEN-TASKS #14 comment** promised that "a High/Medium/Low replacement
   waits on calibrated thresholds", and this PR ships a High/Moderate/Low label beside that
   exact claim. Rewritten to record that the new label is a **different quantity with a
   different derivation** and leaves #14 exactly as open.
3. **The crosswalk's uncertainty row** claimed "BNOW states no likelihood band and no
   analytic-confidence level of its own". It is now `PARTIAL`, not `BUILT`: the mapping is
   deterministic presentation, not analyst judgment, and it withholds the sub-even bands and
   the top band. `docs/METHODOLOGY-TRADECRAFT.md` §"What is missing?" was corrected in the
   same pass, and its stale PAI/CAI clause (shipped by WS-7.2 last session) with it.

### Six judgment calls inside the build, each pinned by a test

1. **Placement: the band is its own muted line immediately after the claim text, not inline
   between the hedging chip and the text.** The prompt says "beside `statuses[hedging]` …
   the band is *added* next to it". A 76-character estimative clause wedged between the chip
   and the claim buries the claim, which is the thing an analyst scans. The hedging label is
   untouched and stays exactly where it is; the band is added below it, uniformly on all four
   surfaces. The print appendix — the one *literal* `statuses[hedging]` site — gets it
   directly beside the status line, as written.
2. **Values are English terms of art; only field labels are translated.** "likely (55–80%)"
   and "moderate" come from the module on every locale, exactly as the raw hedging enum
   already renders in English on the claim chip today. Translating an ICD 203 band term would
   produce something that is not the band. The three `tradecraft.*` keys are English-only with
   per-key fallback, the WS-7.2 precedent.
3. **The percentage range is always shown and never converted.** PHIA's yardstick bands
   differ from ICD 203's; relabelling server-side would be a silent conversion, so the reader
   maps it. A test asserts no PHIA vocabulary is emitted.
4. **`/ask` renders no hedging chip today**, verified — so on that surface the band would
   otherwise stand alone with no classification beside it. The component's `title` carries the
   derivation sentence (`source classification "assessed", corroboration tier C0;
   estimative-map-v1.`) precisely so it never does.
5. **The band renders on `/ask`'s RELATED claims as well as its CITED ones.** Stated, not
   quiet: the prompt names "ask-cited", and cited/related share one renderer. Suppressing it
   on half the list would read as *"the others are unassessed"* rather than *"the others are
   not cited"* — a worse falsehood than the small widening. Reversible in one conditional if
   the operator disagrees.
6. **No AJP-2.1 code reaches the citation artifact.** T1 makes the two-axis codes derived
   export fields, never the primary presentation, and the ICS 206-01 citation is a product
   surface. `credibility` is computed and available on `Estimate` for WS-7.5's export path,
   and a test asserts the string `credibility` appears nowhere in the serialized citation.

### The one thing the shipped table cannot do, stated plainly

`corroborationTier` counts documents, channels and platforms. `summarizeClaimEvidence`
namespaces unmapped adapters per adapter, so two different unmapped adapters count as two
platforms — deliberate (they are different transports) but it means a `C3` is not always
"two household-name platforms". Recorded in the module and pinned by a test.

## Tests

| | Before (`48a9d4e`) | After |
|---|---|---|
| Unit tests | 4,121 | **4,201** |
| Test files | 273 | **275** |

`npm test` green (275 files / 4,201 tests, ≈10 s). `npm run typecheck` clean.
`npm run lint` **0 errors, 3 warnings** — all three pre-existing on `main`
(`api/cron/validate/route.test.ts`, `lib/evals/hardening.test.ts`, `lib/usage/cron-run.test.ts`;
the same three the WS-7.2 report recorded, none in a file this PR touches).
**No integration test run**: this PR touches no schema, no migration, no query and no query
result shape — nothing in `src/integration/` covers it. Spend **$0**.

New or changed test files:

- `src/lib/tradecraft/estimative.test.ts` (59) — the tier function including garbage counts
  and a missing summary object; **all twenty hedging × tier cells asserted by value**; the
  **six signed invariants as their own literal spec block**; the two acceptance criteria the
  prompt names verbatim; the `none` fail-closed case; the AJP-2.1 derivation including "never
  4 or 5"; the presentation helpers; a `derived properties — NOT part of the T3 signature`
  block recording what V1 happens to satisfy beyond the signature; and the import-hygiene
  scan (`matcher-import-hygiene.test.ts` shape) with a non-vacuous control.
- `src/components/claim-estimative.test.tsx` (8) — both labelled values; **never "analyst
  confidence"**, on text and on `innerHTML`; the range kept and no PHIA vocabulary; the
  version stamp and the derivation title; the withheld case; **no reliability score and no
  raw decimal**; the out-of-enum fallback; and that it is not `data-print="hide"`.
- `src/lib/citation/ics206.test.ts` (+5) — the estimative block identical on the withheld and
  the disclosed artifact (so T4 and T3 are provably independent); the derivation in both
  serializers; corroboration-derived never analyst; **no AJP-2.1 code**; the no-evidence case.
  The exact-artifact byte pin was extended with the three new lines.
- `src/components/claim-copy-model.test.ts` (+2 assertions) — the exact report payload now
  carries `Likelihood (ICD 203): very likely (80–95%) · Corroboration-derived confidence:
  moderate` (2 docs / 2 channels / 1 platform = C2, `confirmed` × C2), plain and HTML.
- `src/app/digests/[country]/[date]/page.test.tsx` (+1 case, 1 corrected) — a new case pinning
  **two** render sites (claim row + print appendix) with the exact string; and the
  `not.toContain("conf")` assertion **narrowed, not relaxed** (see below).
- `src/app/search/page.test.tsx`, `src/app/signals/page.test.tsx`,
  `src/app/ask/ask-result.test.tsx` — one surface pin each, plus **two withholding pins on
  /signals**: the band rides the gated per-claim block, so anonymous and
  signed-in-but-unaccepted HTML must not contain it.
- `src/lib/citation/client-boundary.test.ts` — `../tradecraft/estimative.ts` added to
  `CLIENT_REACHABLE`; it enters the client graph through `claim-copy-model.ts`.

### The one test assertion that had to change, and why that is not a relaxation

`page.test.tsx` asserted `expect(container.textContent).not.toContain("conf")` to prove the
uncalibrated `claims.confidence` never renders. "Corroboration-derived **conf**idence"
contains that substring, so the assertion now trips on a string it was never written to
forbid. It was narrowed to what it was always protecting — `/conf\w*[\s:=]*0?\.\d/i` (the
label *form* with a number) and the literal `0.80` — and **strengthened**: the estimative node
itself is now asserted to contain no `0.x` anywhere. The uncalibrated score is still rendered
on no surface.

## Rulings touched and how each is satisfied

- **Ruling 1 (no source prose).** The module reads three integers. Nothing it emits derives
  from any document body. The WS-7.2 ruling-1 sentinel fixture still passes with the new
  fields on the artifact.
- **Ruling 2 (traceability).** Untouched — this renders a property of the trigger-enforced
  evidence set; it writes nothing.
- **Ruling 3 (stub never renders as fact).** Unchanged. Stub sources are excluded at query
  level upstream; the citation mode's `isStubToolStamp` refusal is untouched, and the
  estimative block is only ever built inside an already-attributable citation.
- **Ruling 12 (dedup is same-theater ±1 day).** Load-bearing for cell `claimed × C2`: it is
  what makes two independent channels genuine corroboration rather than mirrors of one post.
  Cited in the cell's rationale; nothing in the dedup path is touched.
- **Ruling 16 (unhedged declaratives stay `unknown` at mid-trust).** The `unknown` row is
  designed around it — neutral band at every tier except C3, and `high` confidence never,
  while the hedging class itself is unresolved. This is the addendum's named acceptance
  criterion and is pinned literally.
- **Ruling 19 (publication safety).** `publication-guard.ts` is **not touched**; the guard
  still reads the raw hedging enum. The band is presentation added beside its output and
  never rewrites a title, a summary or an attribution label.
- **Ruling 21 (the gate is the page's first statement).** No new page, no reordering. Every
  page this PR edits still calls its gate first; the label builders are pure `t()` calls
  placed with the existing `copyLabels` line, after the gate.
- **Rulings 4, 5, 13, 14, 18.** Untouched: no provider call, no migration, no
  extractor-version basis change, no corpus or engine change.
- **T1 / T3 / T3-a / T3-b / T5** — each satisfied as described above; T5 additionally by the
  existing `/methodology` moat test, which still passes over the rewritten paragraph.
- **The prompt's MUST-NOT list**, verified by `git diff --name-only`: `map-prompts.ts`, the
  reduce prompt, `publication-guard.ts`, `claims.hedging` / `claims.confidence`,
  `docs/evals/**`, the scorer, `analysis-registry.ts`, `model-config.ts` and `drizzle/` are
  **all absent from the diff**.

## Citations re-verified

Every file:line below was re-read this session at `48a9d4e`.

| Cited as | Status |
|---|---|
| PLAN-WS-7 §6.1 tiers, §6.2 grid, §6.3 credibility | correct — shipped verbatim as data |
| `claim-evidence-model.ts:221-244` `summarizeClaimEvidence` (PLAN-WS-7 §6.1) | **line moved** — now `:248-272`; behaviour unchanged |
| `claim-evidence-model.ts:236-241` unmapped-adapter platform namespacing | **line moved** — now `:266`; the C3 caveat holds and is pinned |
| `claim-copy-model.ts:119-122` `status()` out-of-enum fallback (PLAN-WS-7 §6.2 inv. 6) | **line moved** — now `:152-155` (WS-7.2 moved `escapeClaimCopyHtml` out); `normalizeHedging` matches it |
| `digests/[country]/[date]/page.tsx:476-480` the #14 comment | **line moved** — now `:519-535` — and **rewritten in place** |
| `digests/[country]/[date]/page.tsx:600` the literal `statuses[hedging]` site | **line moved** — now `:617`; still the only one in `src/` |
| `digest-persist.ts:244-252` `confidence` = mean `reliability_score` (PLAN-WS-7 §3 C2) | **correct in substance and still at those lines** — but see the grep finding below; the statement is `UPDATE claims c SET confidence = sub.conf FROM (… avg(COALESCE(s.reliability_score, 0.3)) …)` at `:240-250`, read with `sed`, because `grep` cannot see this file |
| `src/lib/analysis/map-prompts.ts:72` hedging vocabulary | correct and **unmodified** |
| `src/lib/analysis/publication-guard.ts:48-52,151-163` raw-enum reads | **lines moved by WS-7.2** — the labels now live on `attribution-labels.ts` and are re-exported at `publication-guard.ts:53`; `DISPUTED_HEDGING.has` is at `:145`. **Unmodified by this PR** |
| `src/lib/conflicts/matcher-import-hygiene.test.ts` scan shape | correct — copied, with the client-graph regexes added |
| `src/lib/citation/client-boundary.test.ts` `CLIENT_REACHABLE` | correct — extended |
| `src/lib/tradecraft/crosswalk.ts:103-110` the uncertainty row | correct — **updated**, with the document row in the same commit |
| `src/app/methodology/page.tsx:248` §7 "What we do not claim" | correct — **rewritten**; the old sentence is now forbidden by test |
| `src/app/ask/page.tsx:59-61` `askStrings` filters to `ask.*` | correct — why `estimativeLabels` is a prop, not a `t()` call inside `AskResult` |
| `src/app/ask/ask-result.tsx` renders no hedging chip | correct — verified, drives judgment call 4 |
| `src/app/signals/page.tsx:136` the `accepted` guard on the claim list | correct — the band is inside it, and two tests now pin that |
| `src/app/globals.css:69` print is opt-OUT (`data-print="hide"`) | correct — `data-print="estimative"` prints with no new CSS |
| `src/i18n/i18n.test.ts:114-120` every English key resolves for every locale | correct — English-only keys are covered by the per-key fallback |
| `src/i18n/dictionaries.ts:63` `REQUIRED_NAMESPACES` | correct — `tradecraft` is deliberately NOT added, so no locale is forced to translate a term of art |
| `src/lib/tradecraft/crosswalk.ts:103-110` the uncertainty row | correct (`requirement` at `:105`) — **updated** |
| WS-7.2 report's "step 34 should not add likelihood to the citation artifact without an operator sentence" | **superseded** — see Decisions below |

### An unrelated finding, filed rather than fixed: OPEN-TASKS **#118**

Re-verifying PLAN-WS-7 §3 C2's citation turned up something worth knowing.
**`src/lib/analysis/digest-persist.ts` contains a literal NUL byte** — `entityCacheKey`
writes its separator as a raw control character instead of the `\u0000` escape — so `file`
reports the module as `data` and **`grep` silently skips it**. `grep -n confidence
src/lib/analysis/digest-persist.ts` prints nothing, though the word is there repeatedly,
including on the sole writer of `claims.confidence`. Runtime behaviour is correct and the
file is valid UTF-8; the hazard is that any `grep -rn` sweep over `src/` — a secret scan, a
`process.env` audit — passes over the digest persist transaction without saying so. Node
`readFileSync` scans (`client-boundary.test.ts`, `evals/isolation.test.ts`) are unaffected.
The fix is one character class and byte-identical behaviour, but the file is a money- and
invariant-bearing persist path, so it is filed as **#118** rather than scoped into a
presentation PR — the 2026-09-07 A1 precedent.

## Decisions needed

**None blocking.** Three items for the operator, none of which stops the PR.

1. **The step-32 report asked for an operator sentence before the band entered the ICS 206-01
   artifact; I read the step-34 prompt as being it, and shipped.** That prompt's 2026-09-08
   header was written *after* PR #80 merged, names that report by filename, tells this session
   to read it "so the band slots in **without touching the dark-stamp policy**", and its body
   says "render … **in the citation block**". PLAN-WS-7 §4 WS-7.4 says the same. Reading that
   as anything but the sentence would leave the prompt with no meaning. **Recorded so the
   operator can reverse it cheaply if I read it wrong:** removing the block is deleting three
   lines from each serializer and one field from `Ics206Citation`. Nothing else depends on it.
2. **The band renders on `/ask`'s related claims, not only its cited ones** (judgment call 5).
   One conditional to reverse.
3. **`/entities/[id]` renders claim rows with a hedging value and no band.** It is not in the
   prompt's list of four, so I left it — but it is the fifth claim surface, and a buyer who
   sees the band on four of five will read the fifth as an omission rather than a scope line.
   Recommend a one-line follow-up rather than widening this PR.

## Debt and risks

- **The derivation sentence lives in a `title` attribute**, which touch users and screen
  readers do not get. Nothing essential is title-only — the visible line carries both labels
  and both values — but on `/ask`, where no hedging chip renders, the *classification* behind
  the band is title-only. A `/methodology#uncertainty` link beside the band is the better
  answer and belongs with WS-7.1's page, not here.
- **`ESTIMATIVE_MAP_V1` is presentation, not provenance.** Nothing persists it, so a band
  shown today cannot be reconstructed from the database if the table is ever versioned —
  only from the claim's hedging and its evidence set, which do persist. That is by design
  (PLAN-WS-7 §5 makes `claims.info_credibility` a WS-7.5 publication-time snapshot, deferred
  to its own migration in a later window). Until WS-7.5 lands, an exported figure and a
  re-rendered page can disagree if the evidence set grew between them.
- **Tier `none` is unreachable under ruling 2** and is therefore tested but never observed.
  If it ever renders in production, something upstream of the trigger is wrong; "not
  assessable" is the honest failure and not a defect to paper over.
- **No `next build` was run**, so the client/server boundary rests on the two source scans and
  on the module having zero runtime imports, not on a real bundle.
- **The confidence axis has only three levels and one `high` cell.** In a corpus where most
  claims are single-document, nearly every claim will read `low` or `moderate`. That is
  accurate, but it means the axis carries little discriminating information today — worth
  revisiting with real distribution data before it is marketed as a feature.
- **A V2 must be a new version, never an edit.** The exhaustive test is written so that
  changing any cell in place fails loudly; that failure is correct behaviour.

## Handoff

- Branch `48h/ws7-tradecraft-20260905-step34-estimative` is pushed; the pre-push gate
  (typecheck + lint + test) passed. **Nothing deploys before step 26's go/no-go.**
- **Step 25** applies the AGENTS.md changes below. This session edited no AGENTS.md text.
- **WS-7.5, whenever it is scheduled**, has its numerator ready: `estimateForClaim(...).credibility`
  is the 1–6 value to snapshot into `claims.info_credibility` inside the `digest-persist.ts`
  transaction, and `ESTIMATIVE_MAP_VERSION` is the `credibility_version` to store beside it.
  The function is already total and already fails closed at 6.
- **WS-7.3 (step 33) is unaffected** — it replaces `descriptorFor` in `ics206.ts` and touches
  none of the estimative fields.
- **Whoever enables the T4 disclosure** should know the estimative block is independent of it
  and already renders for every viewer; a test pins the two as separable.

### Proposed AGENTS.md changes

**Standing text — directory map.** Add one line to the `src/lib/…` block (there is no
`src/lib/tradecraft/` entry today, though `crosswalk.ts` landed in step 30):

```
src/lib/tradecraft/   the IC-standards layer: crosswalk.ts (the ONE crosswalk both
                      /methodology and docs/METHODOLOGY-TRADECRAFT.md read) and
                      estimative.ts (ESTIMATIVE_MAP_V1 — the signed ICD 203 band +
                      corroboration-derived confidence mapping, pure, zero runtime imports)
```

**Standing text — Quality/ops bullet.** `3,590 unit tests / 246 files` is stale by many
merges; this branch measures **4,201 / 275**. Step 25 should take whatever `main` reads at
merge time.

**Proposed decision-log entry** (not applied — AGENTS.md write-lock):

> - **2026-09-08 (WS-7.4 — `ESTIMATIVE_MAP_V1` ships as a PRESENTATION layer; superseded as V2
>   only after evaluation step 4)** Under the signed T3/T3-a/T3-b entry, the operator-approved
>   mapping table ships as data in `src/lib/tradecraft/estimative.ts`: `(hedging, evidence
>   independence counts) → { likelihood band, published percentage range, corroboration-derived
>   confidence }`, with the AJP-2.1 1–6 information-credibility code derived **from the band**
>   so §6.2 and §6.3 cannot disagree. **It is a presentation layer, not a persisted field and
>   not a new analytic judgment**: nothing is written to any table, no prompt changed, no
>   `extractor_version` moved, no provider was called. **A prompt-level implementation
>   supersedes it as V2 only after step 4 of the evaluation program, and any change to any cell
>   is a NEW VERSION, never an edit to V1** — a shipped estimative label must stay
>   reconstructible, and the exhaustive test is written so an in-place cell edit fails loudly.
>   **T3-a holds structurally, not by review:** the module reads three integers and has **no
>   runtime import at all**, so it cannot reach `claims.confidence` (the uncalibrated mean of
>   `sources.reliability_score`, `digest-persist.ts:244-252`) or any reliability score; an
>   import-hygiene scan and a field-read scan pin it. **OPEN-TASKS #14 is therefore untouched
>   and still blocked by #56** — a note now says so in the task itself, because the new
>   High/Moderate/Low label is exactly what a reader would mistake for it. **T3-b holds:** the
>   three sub-even bands are never machine-assigned (BNOW has no refutation mechanism and must
>   not assert a claim is less likely than even odds), `almost certain` is reserved for a
>   future analyst-verified tier, and AJP-2.1 levels 4 and 5 are never assigned. `high`
>   confidence occurs in exactly one cell, `confirmed` × C3. **Rendered** beside the hedging
>   label — which stays — on the digest, search, signals and ask claim rows, in the digest
>   print appendix's status line, in the copy "status" line, and in the ICS 206-01 citation
>   artifact with its derivation; the T4 dark-stamp policy is untouched and a test pins the
>   estimative block identical on the withheld and the disclosed artifact. Per **T1** the
>   AJP-2.1 code is computed but reaches no product surface. Band terms and percentage ranges
>   are ICD 203 defined terms and stay verbatim English on every locale (the range is never
>   converted to PHIA's yardstick); only the field labels are translated, and the visible label
>   is **"corroboration-derived confidence", never "analyst confidence"**. **Three standing
>   texts this made wrong were corrected in the same commit:** the public `/methodology` page's
>   §7 sentence "we do not state a likelihood or an analytic-confidence level of our own", now
>   a paragraph naming the derivation and stating that no human has reviewed it; the digest
>   page's #14 comment; and the crosswalk's ICD 203 uncertainty row, `GAP` → **`PARTIAL`**
>   (deterministic presentation is not analyst judgment) in both `crosswalk.ts` and
>   `docs/METHODOLOGY-TRADECRAFT.md`, which a drift test compares field for field. $0, no
>   migration, no environment change, no deploy, no schema change.
