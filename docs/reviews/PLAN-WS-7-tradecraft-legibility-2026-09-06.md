# PLAN-WS-7 — tradecraft legibility (ICD 203 / ICD 206 / ICS 206-01 / ICD 208)

This document is both the plan for workstream WS-7 and the closing report of step 29 of the
2026-09-05 48-hour program. The plan body is §§1–8; the COMMON §5 report sections follow at §9.

---

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-29-plan-ws7-tradecraft.md`, whose specification is
  `docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` (§0 template instructions,
  §2 principles, §4 briefs, §6 rulings, §7 guardrails), under
  `docs/prompts/2026-09-05-48h-COMMON.md`.
- **Lane / worktree:** `48h-ws7-tradecraft-20260905`.
- **Branch:** `48h/ws7-tradecraft-20260905-step29-plan-ws7`.
- **Base SHA:** `29db301127e1d8cd94d132e722be15d99f44971c` (`origin/main`, 2026-09-06 —
  "docs: 48h program log — CP1 merge queue #50-#56 landed, Wave 2 launched"). The lane branch
  had no unique commits and was fast-forwarded to it. The addendum's citations were verified
  at `883e5e3`; every one was re-verified at this base and the corrections are in §9.5.
- **Mode:** planning only. No code, schema, prompt, dataset, env, deploy, DB access or spend.

**Two program-level rulings from the step prompt override the addendum and are applied
throughout:**

1. **WS-7.5 does NOT ride WS-3.1.** Step 13's migrations (0028/0029) keep `claims`, `sources`,
   `source_theater_stats`, `isw_reports` and `validation_runs` untouched by design pin. WS-7.5
   is planned as its own additive migration for a later window, and the addendum's §3 sentences
   are **not** added to the WS-3.0 memo or PLAN-WS-3.
2. The addendum's decisions 9–11 are INDEX **T1–T3** (the INDEX's D9 is already the injection
   author). This plan raises two further decisions, **T4** and **T5** (§7).

---

## 1. Goal and non-goals

**Goal.** Make the tradecraft BNOW already performs legible to an ICD-literate buyer, by
rendering and documenting what the schema already holds: a conformance crosswalk, an
ICS 206-01 citation mode, deterministic source descriptors and a per-digest source summary
statement, an ICD 203 likelihood band plus a separate corroboration-derived confidence level,
and a written preservation policy.

The commercial reason is recorded, not assumed: government/MOD/MFA buyers are GTM ICP rank 5
and political-risk consultancies rank 3 with "citations they can quote" as the decisive
feature (`docs/GTM-STRATEGY.md` §2); the "methodology validator" partner role reviews exactly
these mechanisms (`docs/PARTNER-STRATEGY.md:24`).

**Non-goals.** WS-7 creates no new analytic judgment. It does not change any prompt, does not
bump `extractor_version`, does not read or write any dataset, scorer, registry approval or the
map lock, makes no LLM call, introduces no new headline metric, adds no Vercel env, and
relaxes neither `showReliability` / `showScores` nor the #14 / #56 gates.

**Principle that orders everything below** (addendum §2.1): legibility before new judgment.
Every WS-7 step renders or documents something the pipeline already produced.

---

## 2. Current state, re-verified at `29db301`

### 2.1 What is BUILT and provable

| ICD/ICS requirement | BNOW mechanism | Enforcing file:line |
|---|---|---|
| Source Reference Citation (ICD 206 mech. 1) | DEFERRABLE trigger fails the transaction if a claim has no `claim_sources` row | `drizzle/9999_claim_source_trigger.sql`; `src/db/schema.ts:291-305`; ruling 2 |
| Citation metadata (author/URL/title/date) | `raw_documents.url/title/published_at/fetched_at/content_hash` plumbed to `ClaimSourceDoc` | `src/db/schema.ts:184-192`; `src/components/claim-evidence-model.ts:1-21` |
| Access date | carried as `firstSeenAt`, deliberately **not** presented since 2026-07-16 | `src/components/claim-evidence-model.ts:12-20`, restated `:185` |
| AI-tool disclosure inputs | map `extractor_version`; reduce provider tag; digest provider name; routing registry version | `map-prompts.ts:254-266`; `synthesize.ts:443-449`; `openai-provider.ts:147`; `model-config.ts:108,182,232-238`; `analysis-registry.ts:35` |
| Source-descriptor inputs (ICD 206 mech. 2) | `sources` (74-103) + `source_theater_stats` (109-131): five hedging counts, `citation_count`, first/last cited date, `platform`, `status`, `reliability_score` | `src/db/schema.ts:74-103,109-131` |
| Per-theater corpora + 40% mix cap (ruling 14) | `selectEvidence()` reports `capEvents` / `cappedOut` / `bounds` | `src/lib/conflicts/evidence-selection.ts:46,94-104,197`; house antecedent `src/lib/analysis/source-mix.ts:15,26` |
| Preservation (ICS 206-01, one year) | met by default: zero production deletions of `raw_documents` | §2.3 |
| BLUF ordering (ICD 208) | digests and `/scoreboard` | — |

### 2.2 What is ABSENT in the product

- No source descriptor, generator or prose renderer exists anywhere in `src/` (a repo-wide
  search for `descriptor|describeSource|sourceDescription|blurb|summarizeSource` returns only
  two unrelated Ask-validator hits). The only human-readable per-source text is
  `sources.name` (`schema.ts:81`) — which the registry pages never even render.
- No source summary statement (ICD 206 mech. 3).
- No ICD 203 estimative language and no analytic-confidence label. What exists is the
  five-value hedging enum (`schema.ts:38-44`), its label map
  (`claim-copy-model.ts:53,86-92`), and a rule-based classifier that already reads *the
  source's own* words of estimative probability (`src/lib/isw/hedging.ts:31`) — which WS-7
  must never be confused with BNOW's own estimative claim.
- No `/methodology` route, no `src/lib/tradecraft/`, no `src/lib/citation/`.
- `ClaimCopyMode` has four modes and no citation mode (`claim-copy-model.ts:16`).

### 2.3 Preservation, verified

Zero production deletions of `raw_documents`. The only non-test deleter is
`scripts/cleanup-stub-data.ts:60` (`STUB_LIKE`-guarded, inside a transaction); the other nine
hits are `*.itest.ts` seed teardown. There is no drizzle `.delete(rawDocuments)` and no
`TRUNCATE` anywhere. `src/lib/ask/retention.ts:58` sweeps Ask surfaces only and never touches
`raw_documents`, `claims`, `claim_sources` or `doc_claims`. No archival step exists in
`src/lib/ingest/`.

---

## 3. Nine verified corrections to the addendum

These are the findings that change what the WS-7 PRs do. Each is evidence, not preference.

### C1 — `claims` has no relational path to `doc_claims`, so a per-claim `extractor_version` is not reachable

`extractor_version` lives only on `doc_claims` (`schema.ts:932`) and `doc_map_state`
(`schema.ts:1003`), written by `map-worker.ts`. `claims` (`schema.ts:257-285`) has no
model/extractor/provider column and `claim_sources` (`schema.ts:291-305`) is a bare join
table. The digest claim query selects nothing that identifies the tool
(`src/app/digests/[country]/[date]/page.tsx:202-218`).

**What IS provable per digest:** `digests.provider` (`schema.ts:251`), written from
`mapreduceProviderTag()` (`synthesize.ts:443-449` → `:735`, value
`openai:gpt-4o-mini+mapreduce`, which already names *both* the map and reduce models) or from
`openai-provider.ts:147` (`openai:gpt-4o-mini`) via `digest.ts:231`; plus the dispatch
identity `{workload, model, reasoningEffort, registryVersion, approval}`
(`model-config.ts:232-238`) stored at `digests.structured.stats.reduce.dispatch`
(`synthesize.ts:701`) or `digests.structured.stats.llmDispatch` (`digest.ts:218`), with
`registryVersion = "analysis-reg-v1"` (`analysis-registry.ts:35`).

→ **The ICS 206-01 AI-tool disclosure is digest-scoped, not claim-scoped, and must not assert
a prompt hash it cannot prove for a historical digest.** The addendum's plan to plumb "the
contributing `doc_claims` extractor versions" through the digest query is not implementable
against the current schema. Debt entry proposed (§9.7) so a future citation *can* name them:
stamp them into `structured.stats` at reduce time — additive jsonb, no migration.

### C2 — `claims.confidence` is the mean of `sources.reliability_score`, the exact quantity #14 gates

`digest-persist.ts:244-252`:
`UPDATE claims c SET confidence = sub.conf FROM (SELECT cs.claim_id,
avg(COALESCE(s.reliability_score, 0.3)) AS conf FROM claim_sources cs JOIN raw_documents rd …
LEFT JOIN sources s …)`. The `INSERT INTO claims` at `:213` writes `null`; this post-insert
UPDATE fills it.

And the digest page already carries the standing decision not to render it —
`src/app/digests/[country]/[date]/page.tsx:476-480`: *"No 'conf 0.82': the score is
uncalibrated, so two decimals implied a precision it does not have. … A High/Medium/Low
replacement waits on calibrated thresholds — OPEN-TASKS #14."*

→ **`ESTIMATIVE_MAP_V1` must not read `claims.confidence`.** The addendum's signature
`(hedging, confidence, corroboration)` becomes `(hedging, corroboration)`. Feeding
`confidence` in would launder the uncalibrated reliability score into an ICD 203 percentage
range — addendum principle 4, `SOURCE-RELIABILITY-CALIBRATION.md:90-102`, and a direct
contradiction of the page's own comment. The same reasoning excludes the addendum's suggestion
to fold in source reliability "if `showReliability`": that would make the same claim render a
different likelihood for an admin than for a customer, which is an integrity defect in a
citation, not a presentation nicety. This is decision **T3-a**.

### C3 — `/registry` and `/registry/[id]` are admin-only

`requireAdminOr404()` is the first statement of both pages (`registry/page.tsx:25`,
`registry/[id]/page.tsx:27`), with the layout gate as defence in depth (`layout.tsx:7`) —
ruling 21 satisfied. A descriptor rendered only there reaches admins alone.

→ WS-7.3 must also render the descriptor on a customer-visible surface: the claim evidence
trail (`src/components/claim-sources.tsx`) and the WS-7.2 citation block.

### C4 — the claim-surface reliability gate is `showScores`, not `registryView.showReliability`

`showScores` is a literal payload field (`claim-copy-model.ts:27`, applied at `:213` and
`:227`), passed per caller: `true` on digest (`digests/[country]/[date]/page.tsx:505`),
search (`search/page.tsx:230`), entity (`entities/[id]/page.tsx:282`) and ask
(`ask-result.tsx`); **`false` on signals** (`signals/page.tsx:206`). `registryView()`
(`view-policy.ts:46-48`) governs only `/registry`, `/registry/[id]` and `/middle-east`.

→ The addendum's "gate the reliability number behind `view.showReliability` exactly as today"
is correct for the registry pages and wrong for the claim surfaces. WS-7.3 must honour both
booleans, in their own domains.

### C5 — the addendum's `showReliability` consult sites are incomplete

Verified: `registry/page.tsx` **87, 128, 154** (the addendum named 87 and 128, omitting the
`<td>` at 154); `registry/[id]/page.tsx` **107, 169, 179** (the addendum named 107 only). Also
`view.showWeightConstants` at `registry/[id]/page.tsx:135` — true renders the literal
constants at `:136-139`, false renders `t("registry.detail.weighting_qualitative")` at `:142`.

### C6 — the hedging weight constants are a moat field

`confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified .15`
(`src/lib/isw/load.ts:40-46`, used `:214`) are withheld from every non-admin product surface
by `showWeightConstants`. `view-policy.ts:9-17` states the policy: "the detail page must
independently withhold these fields"; "this is the ONLY place that decides what the reduced
view shows."

→ A `/methodology` page that prints the crosswalk verbatim would nullify that policy. Decision
**T5**, with a test to enforce whichever answer the operator gives.

### C7 — `source_theater_stats` has no `platform`, `name` or `status`

`schema.ts:109-131` carries only `source_id`, `theater`, `citation_count`, first/last cited
date, the five hedging counts, `reliability_score` and `decayed`. `platform`, `name` and
`status` exist only on `sources` (`schema.ts:74-103`). A per-theater descriptor must join both.

### C8 — a persisted per-digest source summary needs no migration

`digests.structured` is a jsonb the shared persist boundary already *appends* to:
`digest-persist.ts:153-161` merges `publicationGuard` and `evidenceRecency` into `stats`.
QF-A's `evidenceRecency` (`evidence-recency.ts:40-62`) is the precedent, with additivity and
key-order pinned by `digest-persist.test.ts` and `digest-asof.test.ts`.

→ **WS-7.5's `digests.source_summary` column is unnecessary and is dropped from the design.**
V1 computes the summary at render (the step prompt's recommendation); if persistence is later
wanted it goes to `structured.stats.sourceSummary`, additive, no migration.
**Cost of compute-at-render: zero additional queries.** The digest page already runs exactly
the join the summary needs (`page.tsx:202-218`: `claims → claim_sources → raw_documents LEFT
JOIN sources`, selecting `source_platform`, `source_key`, `reliability`, `hedging`) and
already groups it in JS (`page.tsx:246-252`). The summary is computable from rows already in
memory; the only added cost is O(claims × docs) arithmetic on a set the page has rendered.

### C9 — the 2026-07-16 provider-hiding decision is a third standing precedent WS-7.2 reverses

`src/app/digests/[country]/[date]/page.tsx:187-189`: *"No d.provider: which model wrote a
digest is pipeline detail, not analyst information, and it was rendering beside every track
heading (2026-07-16)."* Its two siblings are the `firstSeenAt` non-presentation note
(`claim-evidence-model.ts:12-20`, the subject of T2) and the confidence note (C2). All three
are the same 2026-07-16 editorial pass. WS-7.2 reverses two of them, in citation mode only →
decision **T4**.

---

## 4. PR-by-PR

Order is dependency order. Every PR: `npm run typecheck && npm run lint && npm test` green,
plain commit messages, adversarial self-review, closing report per COMMON §5.

### WS-7.1 — tradecraft crosswalk + public `/methodology` (step 30, `ws7-docs`, ~0.75 session)

*Blocked by: T1 (the recommendation is safe to build against if unanswered); T5 shapes PR 2's copy.*

**PR 1 — `docs: tradecraft crosswalk (ICD 203 / 206 / ICS 206-01 / 208)`.**
`docs/METHODOLOGY-TRADECRAFT.md`: per standard → requirement → BNOW mechanism → enforcing
file:line → status BUILT/PARTIAL/GAP → which WS-7 step closes it. §2.1 above is the seed table.
Carries the two corrections the addendum names: ICD 208's title is "Maximizing the Utility of
Analytic Products", and the one-year preservation rule is in **ICS 206-01, not ICD 206**.
States plainly the two things BNOW does that the standards do not require: DB-enforced
citation (`drizzle/9999_claim_source_trigger.sql`, ruling 2) and the external ISW benchmark
loop (`validation_runs`). Includes the one-page reviewer/partner insert as a section
(`docs/PARTNER-STRATEGY.md:24`). "Coverage" keeps its contract name — never "accuracy"
(WS-3.0; `src/lib/conflicts/product-copy.ts:1-13` is the binding precedent for that voice, and
the model for centralising tradecraft copy in one auditable module).

**PR 2 — `site: public /methodology page`.** `src/app/methodology/page.tsx` following
`src/app/privacy/page.tsx` exactly: a section-component wrapper, inline English body,
`export const metadata` (`privacy/page.tsx:20`). Body copy is **not** routed through i18n —
`src/components/legal-document.tsx:8` is the binding precedent ("it is not routed through
i18n — same posture as digest/claim content"). Add `/methodology` to `STATIC_PATHS`
(`src/app/sitemap.ts:13`) so it is indexed.

**Gate posture — public, no gate, no env.** Ruling 21 imposes nothing on an ungated page:
there is no gate to place first and no negative assertion to add (`src/lib/gate.ts` has none),
and a public page must **not** get a row in `src/integration/authz-page-gate.itest.ts` ROUTES
(`:85`, loop `:389-410`) — that harness's positive control asserts the token is present only
for an accepted admin, which a public page fails by construction. If a reason to gate is found,
STOP and list it: a gate means `requireAcceptedUser()` as the first statement plus a ROUTES row.

**Nav/footer link: deferred, not blocking.** A link label needs a key in all seven catalogs
(`src/i18n/dictionaries.ts`, `REQUIRED_NAMESPACES` `:63-74`, enforced by `i18n.test.ts`) and
must satisfy `src/lib/nav/site-nav.test.ts`. Ship the route and the sitemap entry first.

**Tests.** `src/app/methodology/page.test.tsx` copying `src/app/privacy/page.test.tsx` (jsdom,
mocks `next/link`, first assertion "renders without authentication — no session dependency, no
DB query"). A **drift test** failing when the doc's mechanism table and the page's rows
diverge. A **moat test** asserting the rendered public page contains none of the five weight
constants and no `reliability_score` value (C6/T5).

**Rulings.** 1 (the page describes mechanisms, never ISW prose or source text), 3, 21 (posture
stated and justified).

**Acceptance.** Every cited mechanism resolves to a real file at the PR's base commit, listed
with line numbers; page render test; drift test; moat test; `npm test` green with before →
after counts; no env named as set.

### WS-7.6 — preservation policy + no-delete assertion (step 31, `ws7-docs`, ~0.4 session)

*Blocked by: nothing. Runs in the same session as step 30.*

**PR — `docs: retention and preservation policy (ICS 206-01 one-year rule) + no-delete assertion`.**
`docs/RETENTION-AND-PRESERVATION.md`, stating: what is retained (`raw_documents` rows with
`url`, `content`, `content_hash`, `fetched_at`, `published_at` — `schema.ts:184-192`; Telegram
web-preview bodies; RSS bodies), for how long (indefinite today; minimum one year from any
digest that cites the document), and what is NOT retained (ISW prose — ruling 1 — only URLs,
endnote indices and hedging cues, `src/lib/isw/load.ts`).

**Three honest caveats the policy must state.** Each is a verified finding, not boilerplate;
an ICS 206-01 claim that omits them would be overclaiming.

1. **Published claims ARE replaced on regeneration.** `digest-persist.ts:177`
   (`DELETE FROM claims WHERE digest_id = $1`) and `:182` (the track-scoped event sweep). The
   *evidence* survives — `raw_documents` is never touched — but claim row ids are not stable
   across regeneration (`schema.ts:1015-1020` records this for the embedding store). A
   citation therefore preserves the document, not the claim row id.
2. **`content_hash` is a dedup key over a prefix, not an integrity seal.**
   `src/lib/ingest/run.ts:29` hashes `adapter|externalId||url|title|content.slice(0,4000)`
   while `raw_documents.content` stores up to 8000 characters
   (`src/lib/adapters/telegram-web.ts:29`, `src/lib/adapters/rss.ts:19`); insert is
   `ON CONFLICT (content_hash) DO NOTHING` (`run.ts:221`, unique index `schema.ts:206`).
3. **A Telegram capture is a snapshot of the t.me preview, not of the post**; X citations
   depend on `x_api` terms; no Wayback-style archival step exists in `src/lib/ingest/`.

**Test.** A source-scan unit test copying `src/lib/evals/isolation.test.ts` — it already walks
both `src/` and `scripts/` with a per-file allowlist and rationale comments (`:84,90,99,106,113`),
which is exactly the shape needed. Forbidden patterns: `/DELETE\s+FROM\s+raw_documents/i` and
`.delete(rawDocuments)`. Exempt by path and named in the test: `*.itest.ts` and
`scripts/cleanup-stub-data.ts` (whose one deletion at `:60` is `STUB_LIKE`-guarded — truth-in-UI
ruling 3 cleanup, not retention policy). Sibling precedents:
`src/lib/llm/import-graph.test.ts`, `src/db/migrations.test.ts` (per-statement destructive-SQL ban).

**OPEN-TASKS.** File Wayback-style archival as a numbered design-only entry. The file currently
ends at **#107**; claim the next free number **at rebase** and note in the entry that INDEX §1.7
records "#108" as a phantom referent in the handoff — do not create a `#108` that reads as that
referent without saying so.

**Acceptance.** `npm test` green with the new scan and its counts; the policy cites the schema
columns by line; the scan is mutation-proven (temporarily adding a `DELETE FROM raw_documents`
to a production module fails exactly that test); nothing deleted; nothing under `docs/evals/`
touched.

### WS-7.2 — ICS 206-01 citation mode (step 32, `ws7-tradecraft`, ~1.5 sessions)

*Blocked by: T2 (access date) and T4 (AI-tool disclosure). Wants step 30 merged for wording.*

**Pure module `src/lib/citation/ics206.ts`** — the JSON shape plus the plain and HTML
serializers, fixture-tested, so a later API route (`src/app/api/` has only ask/auth/cron/locale
today) emits the same object. `canonicalClaimUrl` is module-private today
(`claim-copy-model.ts:154-181`); **move it into the new module and re-export**, so there stays
exactly one URL validator with its `https:` + `bnow.net` + path-shape + `#c<id>` gate intact.

**Fifth mode `citation`** on `ClaimCopyMode` (`claim-copy-model.ts:16`), label
"Copy ICS 206-01 citation". Per evidence document: author (`sourceName` → channel key
(`claim-evidence-model.ts:112-119`) → `sourceDomain`), title, URL, published date, **access
date per T2**, source type (`platform` → media type + PAI tag; every current adapter is PAI),
and a one-line descriptor stub (WS-7.3 fills it; until then platform + theater +
"ISW-cited N times" when `citation_count > 0`).

**One disclosure block per claim**, built only from what is provable (C1): engine, the digest
`provider` string, `registryVersion` and `approval` from the dispatch identity, the hedging
label, corroboration counts from `summarizeClaimEvidence` (`claim-evidence-model.ts:221-244`),
`asOf`, and the canonical URL. It must **not** assert a per-claim extractor prompt hash.

**Plumbing — an OPTIONAL payload field.** Add `toolStamp?:` to `ClaimCopyPayload`
(`claim-copy-model.ts:18-28`). Optional rather than required, because the payload is
constructed independently at six sites — `digests/[country]/[date]/page.tsx:496-506`,
`search/page.tsx:240`, `signals/page.tsx:196-206`, `entities/[id]/page.tsx:274-282`, and
`ask-result.tsx:126` via `src/lib/ask/hydrate.ts` — and a required field would force all six
into one PR. Citation mode is **refused** where the stamp is absent (fail-closed, ruling-3
flavour), so surfaces adopt incrementally and no surface can silently emit a stampless
citation. Source of the stamp: join `digests` on `claims.digest_id` (`schema.ts:264`) and read
`provider` + `structured.stats.{reduce.dispatch | llmDispatch}`; the digest page's own header
query (`page.tsx:186-197`) is the natural place, since the claim query (`:202-218`) already
carries everything else.

**Rulings.** 1 — URLs, metadata, counts and labels only; never document text or ISW prose.
2 — the block is a *rendering* of the trigger-enforced invariant, not a new write path.
3 — a stub-provider claim refuses citation mode; the templated block is labelled generated.
19 — a `claimed` / `unverified` / `unknown` claim carries the publication-guard label verbatim
(`publication-guard.ts:56-59`); the guard's own logic is untouched.
21 — no new page; the copy action inherits its page's gate.

**Acceptance.** Fixture test per surface; an XSS fixture proving `escapeClaimCopyHtml`
(`claim-copy-model.ts:110-117`) covers every new field; a stub-provider claim refuses the mode;
an absent or NULL version renders `unstamped — pre-analysis-reg-v1` and **never** an empty
string; a **ruling-1 sentinel fixture** — document content and ISW text carrying a unique
marker — proving no marker reaches any output string.

### WS-7.3 — source descriptors + per-digest source summary (step 33, `ws7-docs`, ~2 sessions)

*Blocked by: nothing. Needs the #56 platform-root list, or the fallback below.*

**Descriptor** — pure template `src/lib/tradecraft/descriptor.ts`, version constant
`descriptor-v1`, built from `sources` (`schema.ts:74-103`) joined to `source_theater_stats`
(`:109-131`, per C7): platform and theater; "cited in ISW <ROCA | Iran Update> N times between
<first> and <last>"; the hedging profile as percentages using the cue vocabulary, with the
**ruling-16 wording** for `unknown` ("an ISW unhedged declarative, held at mid-trust by
design", `SOURCE-RELIABILITY-CALIBRATION.md:30-31`); `status` (active / decayed / dead); and
independence caveats. Never a letter grade, never a headline score.

**Render targets (C3, C4).** `/registry/[id]` (admin-only), the claim evidence trail
(`src/components/claim-sources.tsx`, customer-visible), and WS-7.2's descriptor line. The
reliability *number* stays behind `showReliability` / `showWeightConstants` on the registry
pages (`registry/[id]/page.tsx:107,135,169,179`) and behind `showScores` on claim surfaces —
the descriptor's counts and dates are citation volume, not a score, and are therefore fine in
the reduced view.

**#56 handling.** A known platform root — `facebook.com` pools 26,195 citations across 7,081
raw URLs (`docs/OPEN-TASKS.md:445-452`) — renders "platform root — not a single publisher; see
#56" and **no** hedging profile, because a pooled root's hedging distribution is not a source
assessment. Fallback if the audit list is unavailable: a `canonical_url` with no path segment,
plus a hardcoded root list, both failing closed to the caveat. Do not wait for #56 to ship.

**Summary statement** — `src/lib/tradecraft/source-summary.ts`, version `summary-v1`, computed
at render from rows the page already holds (C8): distinct documents, channels and platforms;
the platform mix and whether the 40% cap bound (`selectEvidence()`'s `capEvents` /
`cappedOut`, `evidence-selection.ts:94-104,197` — the cap engaging as a deferral and the cap
displacing a record are different facts and must be reported as such); the share of claims
with ≥2 independent documents / channels / platforms from `summarizeClaimEvidence`, with the
sentence recording that ruling-12 same-theater ±1-day dedup has already collapsed mirrors; the
three load-bearing sources by claims supported; and the count of claims resting on a single
`claimed` or `unverified` document. Label: **"Generated from citation data, summary template
v1 — not an analyst judgment."** (`evidence-recency.ts:10-11` is the house precedent for that
disclaimer voice: "INTERNAL and UNCALIBRATED … not a product score.")

**Rulings.** 1, 3, 12, 14, 16, 19, 21. **No ruling 5** — nothing is persisted in V1.

**Acceptance.** Golden-file tests for both templates over fixture registries; a zero-citation
fixture renders "no ISW citation history" rather than 0%-everything; the platform-root fixture
renders the #56 caveat and no profile; a sentinel-prose fixture proves no text from
`raw_documents.content` and none from an ISW report reaches any output string.

### WS-7.4 — ICD 203 likelihood + corroboration-derived confidence (step 34, `ws7-tradecraft`, ~1 session)

*Blocked by: **T3 signed**. Wants WS-7.2 merged so the citation block can carry the band.*

**Pure module `src/lib/tradecraft/estimative.ts`**, version constant
`ESTIMATIVE_MAP_VERSION = "estimative-map-v1"`, signature
`(hedging: string, evidence: ClaimEvidenceSummary) => Estimate`, returning
`{ likelihood, range, confidence, credibility, tier, version }`. **No `confidence` parameter
and no source-reliability input** (C2 / T3-a).

**Render.** Beside `statuses[hedging]` on claim rows (digest, search, signals, ask-cited), in
the WS-7.2 citation block, and in the copy "status" line. The existing hedging label stays;
the band is *added* next to it. The numeric range stays in the output so a UK reader can map
to the PHIA yardstick themselves — never relabel server-side, because PHIA's bands differ from
ICD 203's.

**UI wording.** "corroboration-derived confidence", never "analyst confidence" (addendum's
honesty constraint). **The code comment at `digests/[country]/[date]/page.tsx:476-480` must be
updated in the same PR**: it currently says a High/Medium/Low replacement "waits on calibrated
thresholds — OPEN-TASKS #14", and this PR ships a High/Moderate/Low label beside that very
claim. The corrected comment must record that the new label is derived from corroboration
*counts* only, reads neither `claims.confidence` nor `reliability_score`, and therefore leaves
#14 untouched — with the uncalibrated numeric score still unrendered. This is the single
standing line the PR makes wrong, so correcting it in place is inside COMMON §4.7.

**Must not touch** (addendum §7, each verified present and unmodified):
`src/lib/analysis/map-prompts.ts` (the hedging vocabulary is at `:72`), the reduce prompt,
`src/lib/analysis/publication-guard.ts` (ruling 19 reads the raw enum at `:48-52,151-163` and
stays that way), `claims.hedging` / `claims.confidence` semantics or values, anything under
`docs/evals/`, and the scorer.

**Acceptance.** An exhaustive table test over every hedging × tier cell, plus the out-of-enum
fallback and the empty-evidence case; `unknown` + a single document never renders above
"roughly even chance" / "low"; `confirmed` + a single document never renders "almost certain";
a snapshot test per surface; and an import-hygiene test (the
`src/lib/conflicts/matcher-import-hygiene.test.ts` shape) pinning that the module imports
nothing from `@/db`, the registry, or any reliability source.

**Proposed decision-log entry** recording `ESTIMATIVE_MAP_V1` as a presentation layer, not a
persisted field, superseded as V2 only by a prompt-level implementation after step 4 of the
evaluation program (§9.7).

---

## 5. WS-7.5 — reserved two-axis columns (deferred; its own migration, a later window, ~0.25 session)

**Program ruling 1 applies: WS-7.5 does NOT ride WS-3.1**, and the addendum's two §3 sentences
are not added to the WS-3.0 memo or PLAN-WS-3. Step 13's migrations keep `claims` and
`source_theater_stats` untouched by design pin, and both of WS-7.5's columns land on exactly
those two tables.

Forward-only, additive. The migration number is claimed **at rebase** (0028/0029 are step 13's;
other lanes may claim more), and `drizzle/9999_claim_source_trigger.sql` stays last and is
never renumbered (ruling 5).

```sql
ALTER TABLE claims ADD COLUMN info_credibility smallint;
ALTER TABLE claims ADD CONSTRAINT claims_info_credibility_range
  CHECK (info_credibility IS NULL OR info_credibility BETWEEN 1 AND 6);
ALTER TABLE claims ADD COLUMN credibility_version text;

ALTER TABLE source_theater_stats ADD COLUMN source_reliability char(1);
ALTER TABLE source_theater_stats ADD CONSTRAINT sts_source_reliability_letter
  CHECK (source_reliability IS NULL OR source_reliability ~ '^[A-F]$');
```

**Dropped from the addendum's design: `digests.source_summary`** — superseded by
`structured.stats.sourceSummary` (C8), which needs no migration at all. `descriptor_version`
is likewise not a column, because nothing WS-7.3 produces is persisted in V1.
`credibility_version` exists because `info_credibility` *is* persisted, and a snapshot is
uninterpretable without the mapping version that produced it.

**Population.** `info_credibility` only, written inside the same `digest-persist.ts`
transaction that inserts the claim, from the WS-7.4 pure function — i.e. a **publication-time
snapshot**, which is the ICS 206-01 semantics (a citation records what shaped the product at
issue). It is **export-only: the UI never reads it** and always computes live from current
evidence. No backfill; historical rows stay NULL. Because claims are deleted and re-inserted
on regeneration (`digest-persist.ts:177`), the snapshot refreshes naturally with the digest.

**`source_reliability` stays NULL** until `SOURCE-RELIABILITY-CALIBRATION.md:90-102` gates pass
for that theater — which is itself blocked by #56 (`:99-100`, the `facebook.com` root makes
"both calibration and concentration results invalid"). Then A–E from calibrated quantiles, F
below the eligibility threshold (`:41-42`: ≥10 training and ≥3 holdout citations).

**Rulings.** 5 (forward-only, trigger last). Ruling 4 unaffected — no provider calls.
Consumers are export formats only: STIX 2.1 confidence scales and MISP's admiralty-scale
taxonomy. The product vocabulary stays ICS 206-01 / ICD 203 (T1).

---

## 6. The two T3 mapping tables, as data (DRAFTED — not shipped)

### 6.1 Corroboration tiers

Computed from `summarizeClaimEvidence` (`claim-evidence-model.ts:221-244`, returning
`{ documents, channels, platforms, earliestPublishedAt }`). Total function:

| Tier | Predicate | Meaning |
|---|---|---|
| `none` | `documents === 0` | no usable evidence document — fail-closed |
| `C0` | `documents === 1` | single document |
| `C1` | `documents >= 2 && channels === 1` | repeated by one publisher |
| `C2` | `channels >= 2 && platforms === 1` | independent channels, one platform |
| `C3` | `channels >= 2 && platforms >= 2` | independent channels, two or more platforms |

Caveat to pin by test: `summarizeClaimEvidence` namespaces unmapped adapters into `other` per
adapter (`:236-241`), so two different unmapped adapters count as two platforms. Under ruling 2
every claim has at least one evidence row, so `none` should be unreachable in practice — it
exists so the function is total.

### 6.2 `ESTIMATIVE_MAP_V1` — hedging × corroboration → likelihood band + range + confidence

ICD 203 (2015) bands used: `roughly even chance` 45–55 · `likely` 55–80 · `very likely` 80–95.

**Deliberately never assigned in V1** — this is part of what the operator signs:
`almost no chance` (01–05), `very unlikely` (05–20) and `unlikely` (20–45), because the
pipeline has no refutation mechanism and must never assert a claim is *less* than even odds;
and `almost certain` (95–99), reserved for a future analyst-verified tier and never
machine-assigned.

| hedging | C0 (1 doc) | C1 (≥2 docs, 1 channel) | C2 (≥2 channels, 1 platform) | C3 (≥2 channels, ≥2 platforms) |
|---|---|---|---|---|
| `confirmed` | likely 55–80 / moderate | likely 55–80 / moderate | very likely 80–95 / moderate | very likely 80–95 / **high** |
| `assessed` | roughly even 45–55 / low | roughly even 45–55 / low | likely 55–80 / moderate | likely 55–80 / moderate |
| `claimed` | roughly even 45–55 / low | roughly even 45–55 / low | likely 55–80 / moderate | likely 55–80 / moderate |
| `unverified` | roughly even 45–55 / low | roughly even 45–55 / low | roughly even 45–55 / moderate | likely 55–80 / moderate |
| `unknown` | roughly even 45–55 / low | roughly even 45–55 / low | roughly even 45–55 / moderate | likely 55–80 / moderate |
| *any, tier `none`* | likelihood and confidence both **withheld** ("not assessable") | | | |

**Rationale, one line per cell:**

| Cell | Rationale |
|---|---|
| `confirmed` C0 | Confirmation language is the strongest per-document signal the enum carries, but it is still one source's assertion; capped at `likely`, which is also the T3 constraint ceiling. |
| `confirmed` C1 | The same publisher repeating itself adds volume, not independence; band and confidence unchanged. |
| `confirmed` C2 | Independent channels corroborate the event; confidence stays `moderate` because single-platform sourcing has correlated failure modes (one Telegram ecosystem). |
| `confirmed` C3 | Confirmation plus cross-platform independent corroboration is the strongest evidence the pipeline can assemble — the only cell that earns `high`. |
| `assessed` C0 | An assessment is a judgment about the world, not an observation of it; BNOW inherits neither its evidence nor its calibration. |
| `assessed` C1 | One assessor restating a judgment is not corroboration of that judgment. |
| `assessed` C2 | Converging independent assessments are meaningful, but analyst convergence is correlated by shared open sources (`docs/PRODUCT-BRIEF.md` §4.3's own validation caveat) — `likely`, not more. |
| `assessed` C3 | Capped at `likely`: cross-platform convergence of *judgments* still transmits no new observation, so it must not reach the band reserved for confirmed events. |
| `claimed` C0 | A single attributed, unconfirmed claim; the honest signal is carried by `low` confidence, not by pushing the band below even, which would assert a disbelief BNOW has not earned. |
| `claimed` C1 | Same-channel repetition is the classic amplification pattern; it must never raise the band. |
| `claimed` C2 | Independent channels making the same claim is genuine corroboration, and ruling 12's ±1-day same-theater dedup means these are not mirrors of one post. |
| `claimed` C3 | Capped at `likely`: the band may never exceed what the strongest source actually asserts, and no source here asserts confirmation. |
| `unverified` C0 | Explicit non-verification is a statement about the evidence, not about the world; neutral band, lowest confidence. |
| `unverified` C1 | Repetition cannot supply the verification the source itself disclaimed. |
| `unverified` C2 | Independent channels raise confidence in the *reporting*, but the band stays neutral because every one of them disclaims verification. |
| `unverified` C3 | Cross-platform independence is the point at which corroboration substitutes for verification; one notch, to `likely`, never beyond. |
| `unknown` C0 | Ruling 16 fixes `unknown` at mid-trust by design (unhedged declarative, weight 0.5); neutral band, `low`. **This is the addendum's named acceptance criterion.** |
| `unknown` C1 | Repetition by one channel cannot resolve a classification the extractor could not make. |
| `unknown` C2 | Independent channels raise confidence in the reporting; the band stays neutral because ruling 16 forbids reading an unhedged declarative as a confirmation. |
| `unknown` C3 | Cross-platform independence is the only evidence that moves an unclassified declarative off neutral, and only to `likely`; confidence never reaches `high` while the hedging class itself is unresolved. |
| any, `none` | Fail-closed: with no usable evidence document the function withholds both axes rather than defaulting to a band. |

**Invariants the exhaustive test pins** — this is what signing the table actually commits to:

1. C0 never exceeds `likely` and never exceeds `moderate` (the T3 constraint, satisfied).
2. `high` confidence occurs in exactly one cell: `confirmed` × C3.
3. No cell is below `roughly even chance`; no cell is `almost certain`.
4. Within every hedging row the band is monotone non-decreasing across C0 → C1 → C2 → C3.
5. At any tier, no hedging class exceeds `confirmed`'s band — hedging sets the ceiling,
   corroboration lifts within it.
6. An out-of-enum hedging value resolves as `unknown`, matching the existing `status()`
   fallback (`claim-copy-model.ts:119-122`).

### 6.3 The 1–6 information-credibility table (NATO AJP-2.1, export-only)

**Derived from §6.2's output**, so one function and one test guarantee the two tables can never
disagree.

| Value | AJP-2.1 meaning | Assigned when | Rationale |
|---|---|---|---|
| **1** | Confirmed by other sources | `confirmed` × C3 | The standard's literal definition: confirmation language plus independent cross-platform corroboration. |
| **2** | Probably true | band is `very likely` or `likely` | Either the source asserts confirmation, or independent channels agree — short of level 1. |
| **3** | Possibly true | band is `roughly even chance` | Reported, not corroborated to the point of a positive judgment. |
| **4** | Doubtful | **never assigned in V1** | BNOW has no contradiction or refutation mechanism; stamping "doubtful" on every single-source claim would export a negative judgment we cannot support. |
| **5** | Improbable | **never assigned in V1** | Same reason. The addendum's draft assigned 5 to "`unverified` with contradiction on record" — no such record exists in the schema, so that cell is either unreachable or new machinery, which principle 1 forbids. |
| **6** | Truth cannot be judged | tier `none` | Fail-closed default when corroboration cannot be computed. |

This deliberately corrects the addendum's draft, which assigned 3 to a single
`assessed`/`unknown` document and 4 to a single `claimed` document. Level 4 is a negative
judgment; exporting it to STIX 2.1 / MISP consumers on the basis of "we only saw one source"
would be an assertion of doubt BNOW has not earned. Under ruling 2 every claim has at least one
evidence document, so 6 should be unreachable in practice.

---

## 7. Decisions needed before the first PR

T1, T2 and T3 are on the INDEX §2 sheet and are **unanswered** (Operator Comment blank as of
this base). T4 and T5 are new, raised by §3. None is decided here (COMMON §3).

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **T1** | Nomenclature | ICS 206-01 descriptors + ICD 203 estimative language as the product vocabulary, with NATO AJP-2.1 / Admiralty two-axis codes as derived **export** fields only (WS-7.5), never the headline | **Yes** — the addendum's recommendation. ICS 206-01 is the current US standard written for OSINT and AI-derived inference; Admiralty keeps NATO/CTI interoperability but has documented fusion and definitional failure modes. |
| **T2** | Access date in citation mode (reverses the 2026-07-16 `fetched_at` hide, `claim-evidence-model.ts:12-20`) | (a) `fetched_at` in `citation` mode only, labelled "Accessed (BNOW ingest)"; (b) `asOf` as the access date; (c) omit and mark "access date withheld" | **(a)**. A citation's access date is a convention every reader understands, and the explicit label removes exactly the ambiguity the 2026-07-16 note worried about ("First seen by BNOW" read as a provenance claim). Record in the decision log either way. |
| **T3** | The two mapping tables (§6.2, §6.3) | sign / amend / defer | **Sign as drafted.** Two sub-items are genuine deviations from the addendum and need explicit assent: **T3-a** — the tables read no `claims.confidence` and no source reliability (C2), changing the addendum's stated signature; recommend accepting, since `confidence` *is* the uncalibrated reliability mean that #14 gates and that `page.tsx:476-480` already refuses to render. **T3-b** — `almost certain` and the three sub-even bands are never machine-assigned, and AJP-2.1 levels 4 and 5 are never assigned; recommend accepting. |
| **T4** | *(new)* WS-7.2's AI-tool disclosure reverses the 2026-07-16 decision to hide the digest provider (`digests/[country]/[date]/page.tsx:187-189`) | (a) disclose in `citation` mode only; (b) disclose on the page too; (c) withhold and mark the citation "tool disclosure withheld" | **(a)**. ICS 206-01 requires the tool/model disclosure; the 2026-07-16 concern was clutter beside every track heading, not disclosure as such, so the page header stays clean. Sibling of T2 — the operator may answer them differently, and (c) would make BNOW's citation mode non-conformant, which should be a deliberate choice if taken. |
| **T5** | *(new)* May the public `/methodology` page state the hedging weight constants (`confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified .15`)? | (a) qualitative ordering only; (b) print the constants publicly | **(a)**. They are withheld from every non-admin product surface by `showWeightConstants` (`registry/[id]/page.tsx:135-142`), and `view-policy.ts:9-17` states that the reduced view is decided in exactly one place. Describe the ordering qualitatively, matching `registry.detail.weighting_qualitative` and `dictionaries.ts:312-313`. The repo doc `docs/METHODOLOGY-TRADECRAFT.md` may state them — they are already in `SOURCE-RELIABILITY-CALIBRATION.md:22-28`. Either answer is enforced by the moat test. |

**Sequencing consequence.** Steps **30** and **31** start now and need no decision (T5 only
shapes PR 2's copy, and the recommendation is safe to build against, with the moat test
enforcing whichever answer lands). Step **32** needs T2 and T4. Step **34** needs **T3
signed** — otherwise it prints `AWAITING AUTHORIZATION: T3`, leaves the PR HELD and stops
(COMMON §4.9). Step **33** needs neither, but must handle the #56 platform-root caveat.

---

## 8. Estimates, deploy path, migrations, env

| Step | Work | Model | Sessions |
|---|---|---|---|
| 30 | WS-7.1 crosswalk + `/methodology` | Sonnet | 0.75 |
| 31 | WS-7.6 retention policy + no-delete scan | Sonnet | 0.4 |
| 32 | WS-7.2 citation mode | Opus | 1.5 |
| 33 | WS-7.3 descriptors + summary statement | Opus | 2.0 |
| 34 | WS-7.4 estimative mapping | Opus | 1.0 |
| later | WS-7.5 migration | Opus | 0.25 |

≈5.9 sessions against the addendum's 3.5–4.5. The increase is attributable, not padding: C1
(the stamp is digest-scoped and must be plumbed through six independently-constructed
payloads), C3 (descriptors need a second, customer-visible render target), and the added
ruling-1 sentinel and moat tests.

**Model note.** The addendum suggested Sonnet for every WS-7 session. That holds for steps 30
and 31 (inventory-driven docs). Steps 32–34 are Opus in the program's own lane table, and
should stay Opus: each carries a ruling interaction (1/3/19 for the citation block, 12/14/16
for the summary, the #14 boundary for the estimative label) rather than a mechanical edit.

**Migrations.** None in this window. WS-7.5 is the only WS-7 migration and it is deferred to
its own later window (§5). Nothing in WS-7.1/7.2/7.3/7.4/7.6 touches `drizzle/`.

**Env / caps.** No new Vercel environment variable, so ruling-4 cap ordering does not apply.
No feature flag for `/methodology` (it is public and carries no gated data); if the operator
wants one, that is a new decision under addendum §7, not an assumption.

**Deploy path.** None in this window. Every WS-7 PR is behaviour-identical for existing
surfaces except the new copy mode and the added labels. Nothing deploys before step 26's
per-PR go/no-go and step 27's operator deploy, from the plain release clone only.

**Soak / proof.** No production soak is required by any WS-7 PR: no scheduled route, no cron,
no provider call and no persisted field changes in this window. WS-7.5, when it lands, is a
nullable-additive migration with no backfill and no read path, so its proof is the standard
migration idempotency check plus `migrations.test.ts`, not an observation window.

---

## 9. Closing report (COMMON §5)

### 9.1 Built

- `docs/reviews/PLAN-WS-7-tradecraft-legibility-2026-09-06.md` — this document (the plan IS
  the report, per the step prompt).
- `docs/PROGRESS.md` — plan block + Execution bullets for this session.
- No PR title beyond the docs-only PR carrying these two files. No source, schema, migration,
  fixture, dataset or configuration file was created or modified.

### 9.2 Tests

Docs-only change: the unit count must be **unchanged** from the base, and that is the assertion.

- `npm test` → **3,723 passed / 3,723, over 255 test files** — measured on this branch and
  **identical to the base**, because the diff touches only `docs/`. Base `29db301` and this
  branch have a byte-identical `src/` tree (`git status` shows exactly two changed paths:
  `docs/PROGRESS.md` and this report).
- `npm run typecheck` — clean. `npm run lint` — clean. `git diff --check` — clean.
  `git diff | grep -iE 'key|secret|token|postgres://'` — no credential-shaped hit.
  No `package-lock.json` drift; no `.env.local` in the worktree.
- No fork integration test run: this step touches no DB-bound code (COMMON §4.5 requires them
  only for migration or DB-touching PRs).
- **Spend: $0.** Zero paid provider calls, zero DB access of any kind, no Neon branch created,
  no cron invoked, no deploy, no environment variable read back or written.

### 9.3 Rulings touched and how each is satisfied

| Ruling | How this step satisfies it |
|---|---|
| 1 (no ISW prose / source full text) | This plan quotes only file paths, line numbers, column names and code comments — no ISW text and no `raw_documents.content`. Every downstream PR carries a sentinel test as an acceptance criterion (§4, WS-7.2 and WS-7.3). |
| 2 (traceability) | Untouched. The citation block is planned explicitly as a *rendering* of the trigger-enforced invariant, never a new write path; `drizzle/9999_claim_source_trigger.sql` is not modified, renumbered or moved. |
| 3 (stub data never renders as fact) | Extended to templated prose per addendum principle 3: every descriptor, summary and disclosure block carries a version string and a "generated from citation data" label, and a stub-provider claim refuses citation mode. |
| 5 (forward-only migrations) | No migration in this window. WS-7.5 is designed as additive-only with the trigger staying last and its number claimed at rebase. |
| 12 (same-theater ±1-day dedup) | Reported, never altered: the summary statement must state that dedup has already collapsed mirrors before independence counts are read. |
| 13 (`extractor_version`) | Never changed by WS-7. `map-prompts.ts:72` (the hedging vocabulary) and `:254-266` (the version basis) are explicit no-touch zones in §4 (WS-7.4) and §1. |
| 14 (per-theater corpora, 40% cap) | Reported, never altered: the summary reads `selectEvidence()`'s `capEvents` / `cappedOut`, which the module already exposes; the cap fraction is not read from anywhere except its frozen constant. |
| 16 (`unknown` stays mid-trust) | Carried verbatim into the descriptor wording and into the §6.2 rationale for the whole `unknown` row; the enum value is not reinterpreted. |
| 19 (publication guard) | The guard reads the raw enum and stays that way (`publication-guard.ts:48-52,151-163` cited as no-touch); WS-7.2 carries its labels verbatim into the citation block. |
| 21 (gate is the page's first statement) | Verified live on every page this plan touches or reads: `registry/page.tsx:25`, `registry/[id]/page.tsx:27`, `digests/[country]/[date]/page.tsx:163`. The new `/methodology` page is public, so ruling 21 imposes nothing — and §4 records the consequence that it must therefore not get an `authz-page-gate.itest.ts` ROUTES row, and must carry no gated data. |
| 4 (fail-closed spend caps) | Untouched — WS-7 makes no provider call anywhere. |

### 9.4 Exposure note

No file under `docs/evals/` was opened. No file under
`/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/`,
`/Users/go/code/bnow-net-eval-campaign-20260903-artifacts/` or the frozen
`eval-campaign-20260903` worktree was opened. `RECONCILIATION-KEY.json`,
`AI-DIAGNOSTIC-ANALYSIS.md`, any `docs/evals/analysis/results/live-*.json` and any heldout
content: not opened. `scripts/evals/corpus-v2/build-draft.py`: not opened. No accidental
exposure to report.

### 9.5 Citations re-verified

Verified at base `29db301`. **Corrections to the addendum are marked ✎.**

*Schema* (`src/db/schema.ts`) — `hedgingEnum` **38-44** ✓ · `sources` **74-103** ✎ (the
addendum's "86-92" is only the hedging-count block; `reliability_score` is `:92`, `platform`
`:80`, `status` `:94`) · `sourceTheaterStats` **109-131** ✎ ("119-124" is only the hedging
block; the table has **no** `platform`, `name` or `status` — C7) · `rawDocuments` **178-**,
`title` **185**, `content` **186**, `content_hash` **187**, `published_at` **190**,
`fetched_at` **191**, hash index **206** ✓ · `digests` **237-255**, `structured` **249**,
`provider` **251** · `claims` **257-285**, `hedging` **268**, `confidence` **269** ✓ ·
`claimSources` **291-305** ✓ · `docClaims` **924-964**, `extractor_version` **932** ·
`docMapState` **996-**, `extractor_version` **1003** · claim-regeneration note **1015-1020**.

*Registry* — `view-policy.ts` `RegistryView` **19-26**, `registryView()` **46-48**, policy
rationale **9-17** · `registry/page.tsx` gate **25**, `showReliability` **87, 128, 154** ✎ ·
`registry/[id]/page.tsx` gate **27**, `showReliability` **107, 169, 179** ✎,
`showWeightConstants` **135** (constants **136-139**, qualitative fallback **142**) ·
`registry/layout.tsx:7` · `isw/load.ts` `RELIABILITY_SQL` **40-46**, used **214**.

*Claim surfaces* — `claim-copy-model.ts` `ClaimCopySurface` **15**, `ClaimCopyMode` **16**,
`ClaimCopyPayload` **18-28**, `showScores` **27** (applied **213, 227**), `statuses` **53**
(populated **86-92**), `escapeClaimCopyHtml` **110-117**, `status()` fallback **119-122**,
`canonicalClaimUrl` **154-181** (module-private ✎) · `claim-evidence-model.ts`
`ClaimSourceDoc` **1-21**, the `fetched_at` non-presentation comment **12-18** with
`firstSeenAt` at **20** ✎ (the addendum said 13-19), restated **185**,
`summarizeClaimEvidence` **221-244** · `claim-evidence-labels.ts:9` · five copy surfaces:
`digests/[country]/[date]/page.tsx:495`, `ask-result.tsx:126`, `search/page.tsx:240`,
`signals/page.tsx:196`, `entities/[id]/page.tsx:274`.

*Digest page* — gate **163** · header query, "No d.provider" comment **187-189** ✎ (new
finding, C9) · claim query **202-218**, `cl.text, cl.hedging, cl.confidence` **204** ✓ ·
`toClaimSourceDoc` **136-151** · confidence-not-rendered comment **476-480** ✎ (new finding, C2).

*Analysis* — `map-prompts.ts` hedging enum **72** ✓, `MAP_USER_FRAME_REV` **227**,
`mapExtractorVersion` **254-266** ✎ (the addendum said 255-266; the function opens at 254) ·
`synthesize.ts` `mapreduceProviderTag()` **443-449**, dispatch **701**, provider passed **735**,
returned **750** ✎ (the addendum cited "735,750" for the provider tag; 443-449 is where it is
computed) · `openai-provider.ts:147` ✎ (the addendum said 146) and the file is
`src/lib/analysis/openai-provider.ts`, **not** `src/lib/llm/` ✎ · `digest.ts` `llmDispatch`
**218**, provider persisted **231** · `model-config.ts` `registryVersion` **108, 182**,
`dispatchIdentity` **232-238** · `analysis-registry.ts:35` · `digest-persist.ts`
`persistDigest` **85**, stats merge **153-161**, `DELETE FROM claims` **177**, `DELETE FROM
events` **182**, `INSERT INTO claims` **213**, confidence UPDATE **244-252** ·
`evidence-recency.ts` uncalibrated warning **10-11**, `EvidenceRecencyStatsV1` **40-62** ·
`publication-guard.ts` disputed set **48-52**, labels **56-59**, `isDisputed` **151-163**.

*Other* — `conflicts/evidence-selection.ts` `EVIDENCE_MIX_CAP_FRACTION` **46**,
`EvidenceSelection` **94-104**, `selectEvidence` **197** · `conflicts/product-copy.ts:1-13`
(the copy-module precedent) · `isw/hedging.ts:31` (the source-side WEP rule) ·
`gate.ts` `requireAcceptedUser` **29**, `currentRole` **93**, `requireAdminOr404` **126** ·
`sitemap.ts` `STATIC_PATHS` **13** · `legal-document.tsx:8` (the i18n-opt-out precedent) ·
`privacy/page.tsx:20` · `authz-page-gate.itest.ts` ROUTES **85**, loop **389** ·
`ingest/run.ts` `contentHash` **29**, `ON CONFLICT` **221** · `adapters/telegram-web.ts:29`,
`adapters/rss.ts:19` · `ask/retention.ts:58,117` · `scripts/cleanup-stub-data.ts:60` ·
`evals/isolation.test.ts` (the source-scan pattern) · `OPEN-TASKS.md` #14 **252-259**, #56
**445-452** ✎ (the addendum-era line was 443-450; the file has shifted) · file ends at **#107** ·
`SOURCE-RELIABILITY-CALIBRATION.md` eligibility **41-42**, gates **90-102** ·
`PRODUCT-BRIEF.md:107` ✓ · `PARTNER-STRATEGY.md:24`.

### 9.6 Decisions needed

§7 — **T1**, **T2**, **T3** (with sub-items T3-a and T3-b), and the two new ones, **T4** and
**T5**. Each carries options and a recommendation; none is decided here.

### 9.7 Debt and risks

**Proposed new OPEN-TASKS entries** (numbers claimed at filing; the file ends at #107, and
INDEX §1.7 warns that "#108" already circulates as a phantom referent — say so in the entry):

1. **Reduce-time extractor-version stamp.** The contributing `doc_claims.extractor_version`
   values are not recorded on the digest, so no citation can name the map extractor for a
   historical digest (C1). Fix: collect them in the reduce stage and add them to
   `digests.structured.stats` — additive jsonb, no migration, the `evidenceRecency` precedent.
   Until then WS-7.2's disclosure names the synthesis identity only.
2. **Wayback-style archival of cited documents** (design only, filed by step 31).

**Proposed AGENTS.md changes** — for step 25 to apply; **not** applied here (COMMON §4.7).
This step makes no standing line wrong, so there is no in-place correction to carry.

1. *Directory map*, after WS-7.2/7.4 land: add `src/lib/tradecraft/` (ICD 203 presentation
   mapping + templated descriptors; pure, no DB/provider/env) and `src/lib/citation/`
   (ICS 206-01 citation serialization).
2. *Decision log entry, drafted for signature at WS-7.4's merge:* `ESTIMATIVE_MAP_V1` is a
   **presentation** mapping over the frozen hedging enum, not a persisted field and not a
   prompt change. It reads `hedging` and corroboration counts only — never `claims.confidence`
   and never `sources.reliability_score` — so #14 and #56 are untouched and no headline score
   is created. `almost certain` and every sub-even band are never machine-assigned;
   AJP-2.1 credibility 4 and 5 are never assigned. A prompt-level implementation after step 4
   of the evaluation program supersedes it as V2; V1's tables are operator-signed under T3.

**Risks.**

- *Editorial reversal risk.* WS-7.2 reverses two of the three 2026-07-16 non-presentation
  decisions (T2, T4). If the operator declines both, citation mode still ships but is not
  ICS 206-01-conformant on the access-date and AI-tool requirements — the crosswalk must then
  say GAP for those two rows rather than BUILT. That is a coherent outcome, not a blocker, and
  step 30's crosswalk should be written so the row status is a one-line edit.
- *Descriptor visibility.* If C3 is ignored and descriptors ship only on `/registry/[id]`, the
  feature reaches admins and no customers — i.e. it would not serve the buyers that motivate
  WS-7 at all. Step 33's acceptance must name the customer-visible render target explicitly.
- *#56 contamination.* A `facebook.com`-style pooled root rendering a hedging profile would be
  a source assessment of 26,195 pooled citations. The fail-closed caveat is the mitigation, and
  the platform-root fixture test is what proves it.
- *Scope creep into calibration.* Every WS-7 surface is one short step from "just show a
  letter grade". Principle 4 and the #14 gates are the brake; the T3 tables and the
  import-hygiene test are what make the brake mechanical rather than aspirational.
- *Session estimate.* 5.9 sessions is above the addendum's 3.5–4.5 and above what the
  remaining program windows may hold. If the window is short, the honest cut is WS-7.3's
  summary statement (the descriptor alone still serves the crosswalk and the citation block);
  cutting WS-7.4 instead would leave the crosswalk claiming ICD 203 conformance it does not have.

### 9.8 Handoff

**What the next steps must know.** The five sketch prompts (30–34) are rewritten below; that
text supersedes the matching lines of the prompt files (COMMON §2.5). The §6 tables are the
signable T3 blocks. The §5 design is WS-7.5.

---

#### Rewrite — step 30 (WS-7.1 crosswalk)

> Replace the "Read" and "Do" sections with: read COMMON, then
> `docs/reviews/PLAN-WS-7-tradecraft-legibility-2026-09-06.md` §2, §3 (C6 especially), §4
> WS-7.1, then the addendum §1, §2, §4.1, §6, §7, §9. **The plan's §2.1 table is the seed for
> `docs/METHODOLOGY-TRADECRAFT.md` and its citations are verified at `29db301`** — re-verify at
> your own base and correct in your report. Two addendum citations are wrong and the crosswalk
> must not repeat them: the digest provider name is `src/lib/analysis/openai-provider.ts:147`
> (not `src/lib/llm/`, not 146), and `mapExtractorVersion` opens at `map-prompts.ts:254`.
> **PR 2 constraint (plan C6 / decision T5): the public page must not print the hedging weight
> constants** (`confirmed 1.0 · assessed .75 · unknown .5 · claimed .4 · unverified .15`,
> `src/lib/isw/load.ts:40-46`) or any `reliability_score` value — they are withheld from every
> non-admin surface by `showWeightConstants` (`registry/[id]/page.tsx:135-142`). Describe the
> ordering qualitatively, matching `registry.detail.weighting_qualitative`. The repo doc may
> state them. Ship a **moat test** asserting the rendered public page contains none of the five
> constants, alongside the drift test and the `privacy/page.test.tsx`-shaped render test.
> The page is **public**: no gate, no `authz-page-gate.itest.ts` ROUTES row (its positive
> control asserts an admin-only token, which a public page fails by construction), and add
> `/methodology` to `STATIC_PATHS` (`src/app/sitemap.ts:13`). Body copy stays inline English —
> `src/components/legal-document.tsx:8` is the binding precedent — and the nav/footer link is
> **deferred** (a label key would touch all seven catalogs).

#### Rewrite — step 31 (WS-7.6 retention)

> Replace the "Do" section with: `docs/RETENTION-AND-PRESERVATION.md` per the plan §4 WS-7.6.
> The inventory is verified: **zero** production deletions of `raw_documents`; the only
> non-test deleter is `scripts/cleanup-stub-data.ts:60`; nine `*.itest.ts` seed-teardown
> deleters; `src/lib/ask/retention.ts:58` touches Ask surfaces only. **The policy must state
> three caveats or it overclaims:** (1) published claims ARE replaced on regeneration —
> `digest-persist.ts:177` `DELETE FROM claims WHERE digest_id = $1` and `:182` the track-scoped
> event sweep, so a citation preserves the *document*, not the claim row id
> (`schema.ts:1015-1020`); (2) `content_hash` is a dedup key over a **prefix** —
> `src/lib/ingest/run.ts:29` hashes `content.slice(0,4000)` while `raw_documents.content` holds
> up to 8000 (`telegram-web.ts:29`, `rss.ts:19`) — so it is not an integrity seal over the
> stored body; (3) a Telegram capture is a snapshot of the t.me preview, not the post, and X
> citations depend on `x_api` terms. Copy the scan from `src/lib/evals/isolation.test.ts` (it
> already has the `src/` + `scripts/` walk with a named allowlist); mutation-prove it. The
> OPEN-TASKS file ends at **#107** — claim the next free number at rebase and note that INDEX
> §1.7 records "#108" as a phantom referent, so the new entry does not read as that one.

#### Rewrite — step 32 (WS-7.2 citation mode)

> Replace the body with: read COMMON, then PLAN-WS-7 §3 C1/C4/C9, §4 WS-7.2, then addendum
> §4.2. **Blocked by T2 and T4** — if either is unanswered, print `AWAITING AUTHORIZATION: T2`
> / `T4`, leave the PR HELD, and stop before the disclosure block (the per-document citation
> fields other than the access date are decision-free and may be built).
> **The addendum's per-claim `extractor_version` plumbing is not implementable:** `claims` has
> no relational path to `doc_claims` (`schema.ts:257-285`, `:291-305`, `:932`), so the
> disclosure is **digest-scoped** — join `digests` on `claims.digest_id` (`schema.ts:264`) and
> read `provider` (`schema.ts:251`, written from `synthesize.ts:443-449` or
> `openai-provider.ts:147`) plus `structured.stats.{reduce.dispatch | llmDispatch}`
> (`synthesize.ts:701`, `digest.ts:218`), whose `registryVersion` is `analysis-reg-v1`
> (`analysis-registry.ts:35`). **Never assert a prompt hash the digest does not carry.**
> Add `toolStamp` to `ClaimCopyPayload` as an **optional** field (six independent construction
> sites: `digests/[country]/[date]/page.tsx:496-506`, `search/page.tsx:240`,
> `signals/page.tsx:196-206`, `entities/[id]/page.tsx:274-282`, `ask-result.tsx:126` via
> `src/lib/ask/hydrate.ts`) and **refuse citation mode when it is absent** — fail-closed, so
> surfaces adopt incrementally and none emits a stampless citation. Move `canonicalClaimUrl`
> (`claim-copy-model.ts:154-181`, module-private today) into `src/lib/citation/ics206.ts` and
> re-export, keeping one URL validator. Acceptance adds a **ruling-1 sentinel fixture**
> (document content and ISW text carrying a unique marker; no marker may reach any output).

#### Rewrite — step 33 (WS-7.3 descriptors)

> Replace the body with: read COMMON, then PLAN-WS-7 §3 C3/C4/C5/C7/C8, §4 WS-7.3.
> **Three corrections to the addendum, all verified.** (1) `/registry` and `/registry/[id]` are
> **admin-only** (`requireAdminOr404` at `registry/page.tsx:25`, `registry/[id]/page.tsx:27`),
> so a descriptor rendered only there reaches no customer — the PR must also render it on
> `src/components/claim-sources.tsx` and feed WS-7.2's descriptor line. (2) On claim surfaces
> the reliability gate is **`showScores`** (`claim-copy-model.ts:27`, applied `:213,227`;
> `false` on signals, `signals/page.tsx:206`), **not** `registryView.showReliability`, which
> governs only `/registry`, `/registry/[id]` and `/middle-east`; honour both in their own
> domains. The full `showReliability` site list is `registry/page.tsx:87,128,154` and
> `registry/[id]/page.tsx:107,169,179`, plus `showWeightConstants` at `:135`. (3)
> `source_theater_stats` (`schema.ts:109-131`) has **no** `platform`, `name` or `status` —
> join `sources` (`schema.ts:74-103`).
> **The summary statement is computed at render and persists nothing** — no migration, no
> `digests.source_summary` column. The digest page already runs the exact join
> (`page.tsx:202-218`) and groups it (`:246-252`), so the summary costs zero extra queries. If
> persistence is later wanted it goes to `structured.stats.sourceSummary` (the
> `evidenceRecency` precedent, `digest-persist.ts:153-161`), never a column.
> Read the cap facts from `selectEvidence()`'s `capEvents` and `cappedOut`
> (`evidence-selection.ts:94-104,197`) — "the cap deferred a record" and "the cap displaced a
> record" are different facts, report them as such. Label everything "Generated from citation
> data, summary template v1 — not an analyst judgment" (voice precedent:
> `evidence-recency.ts:10-11`). Platform roots get the #56 caveat and **no hedging profile**.

#### Rewrite — step 34 (WS-7.4 estimative mapping)

> Replace the body with: read COMMON, then PLAN-WS-7 §3 C2, §4 WS-7.4, §6, then addendum §4.4
> and §7. **Blocked by T3 signed** — if unsigned, print `AWAITING AUTHORIZATION: T3` and stop.
> **The signature is `(hedging, evidence: ClaimEvidenceSummary) => Estimate` — there is no
> `confidence` parameter and no source-reliability input.** `claims.confidence` is the mean of
> `sources.reliability_score` (`digest-persist.ts:244-252`), i.e. exactly the uncalibrated
> quantity #14 gates and #56 invalidates, and `digests/[country]/[date]/page.tsx:476-480`
> already refuses to render it. Reading it would launder that score into an ICD 203 percentage
> range and would also make the same claim render differently for an admin than for a customer.
> Ship §6.2 and §6.3 as data with the §6.2 invariant tests (1–6) and an import-hygiene test
> (the `src/lib/conflicts/matcher-import-hygiene.test.ts` shape) pinning that the module
> imports nothing from `@/db`, the registry, or any reliability source.
> **Update `digests/[country]/[date]/page.tsx:476-480` in the same PR**: it currently says a
> High/Medium/Low label "waits on calibrated thresholds — OPEN-TASKS #14", and this PR ships
> one beside that claim. The corrected comment must record that the new label is
> corroboration-count-derived, reads neither `claims.confidence` nor `reliability_score`, and
> leaves #14 untouched with the numeric score still unrendered. This is the one standing line
> the PR makes wrong, so correcting it in place is inside COMMON §4.7.
> Carry the §9.7 decision-log draft into your report for signature.

---

#### For the operator: the T3 blocks to sign

§6.1 (corroboration tiers), §6.2 (`ESTIMATIVE_MAP_V1`, twenty cells plus the `none` row, with
per-cell rationale and six pinned invariants) and §6.3 (the 1–6 AJP-2.1 credibility table,
derived from §6.2). Sub-items **T3-a** (no `claims.confidence`, no source reliability) and
**T3-b** (`almost certain`, the three sub-even bands, and AJP-2.1 levels 4 and 5 are never
assigned) are the two places this plan deviates from the addendum's draft and need explicit
assent.

#### For the operator: WS-7.5

§5 — its own additive migration in a later window, not riding WS-3.1; two columns on `claims`
and one on `source_theater_stats`; `digests.source_summary` dropped as unnecessary;
`info_credibility` populated as a publication-time export-only snapshot; `source_reliability`
NULL until the #14 gates pass per theater.
