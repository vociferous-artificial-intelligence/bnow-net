# WS-7.6 — retention and preservation policy + no-delete assertion (48h step 31)

## Scope

- **Prompt:** `docs/prompts/2026-09-05-48h-31-ws7-retention-policy.md`, under
  `docs/prompts/2026-09-05-48h-COMMON.md`, with PLAN-WS-7 §9.8 "Rewrite — step 31" binding
  (COMMON §2.5) and `docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` §4.6, §6,
  §7 as the specification.
- **Lane / worktree:** `48h-ws7-docs-20260905`. Ran in the same session as step 30.
- **Branch:** `48h/ws7-docs-20260905-step31-retention`, stacked on step 30's PR 2 branch
  `48h/ws7-docs-20260905-step30-methodology-page` — the policy cross-links the crosswalk and
  flips two of its rows, so it cannot be reviewed against `main` alone.
- **Base SHA:** `a821695f8d02254bc74114ac5d0b4007b9fb431f` (`origin/main`, 2026-09-06 — "docs:
  steps 17 and 18 written in full…"). Step 30 was built and gated on `98294c5` and rebased onto
  `a821695` mid-session (see "A second session in the same worktree" below); step 31 was built
  entirely on `a821695`.
- **Mode:** attended, plain session. Docs and one test. No DB access, no provider call, no env
  change, no deploy, no migration, nothing deleted, nothing under `docs/evals/` touched.
  **Spend $0.**

## Built

**One PR — `docs: retention and preservation policy (ICS 206-01 one-year rule) + no-delete
assertion`.**

- **`docs/RETENTION-AND-PRESERVATION.md`** (new, 253 lines). §1 what is retained —
  `raw_documents` column by column with line numbers, the claim-to-document link, per-platform
  detail for all six adapters with their content caps, the reference corpus, and the products.
  §2 what is not retained. §3 for how long, with the verified deletion inventory and four
  caveats. §4 what a preservation gap looks like. §5 the standing rulings it rests on. §6 what
  changing the policy requires.
- **`src/lib/ingest/no-delete.test.ts`** (new, 10 tests) — the source scan. See Tests.
- **`docs/METHODOLOGY-TRADECRAFT.md`** — the two preservation rows flip `PARTIAL → BUILT`
  (ICD 206 "Sources preserved and retrievable for the life of the product"; ICS 206-01 "Dynamic
  sources preserved at least one year from product issuance"), their mechanism and
  enforcing-file cells are rewritten, §4 gains the `ON DELETE no action` consequence, the
  reviewer insert points a validator at the caveats rather than at the retention claim, and the
  related-documents entry loses its "(WS-7.6)" pending marker. Crosswalk totals move
  **5 BUILT / 12 PARTIAL / 7 GAP → 7 BUILT / 10 PARTIAL / 7 GAP.**
- **`src/lib/tradecraft/crosswalk.ts`** — the same two rows, updated in the same commit,
  because step 30's drift test fails if the document and the module are edited apart. The
  public page's summary sentence follows automatically from `statusCount()`.
- **`docs/OPEN-TASKS.md`** — new entry **#108**, design only, for Wayback-style archival.

**Two things the policy states that the prompt did not ask for**, because leaving them out
would have made it weaker than the code:

1. **Preservation of a cited document is a database constraint, not only an absence.**
   `claim_sources`' foreign key to `raw_documents` is declared `ON DELETE no action`
   (`drizzle/0000_superb_ultimates.sql`, constraint
   `claim_sources_raw_document_id_raw_documents_id_fk`), so a document behind a published claim
   cannot be deleted at all while the citation exists — the attempt raises. The `claim_id` side
   *is* `ON DELETE cascade`, which is exactly the regeneration behaviour caveat 1 describes.
   That asymmetry is the strongest single fact in the document and it is now in both it and the
   crosswalk.
2. **A fourth caveat.** The prompt and the plan name three; §4 item 1 adds the absence of any
   third-party archival snapshot as a preservation gap in its own right, and it is the subject
   of #108. Without it the document would imply that BNOW's own copy is an attested capture.

**Scope boundary stated in the document**, because the two are easy to conflate: this policy
covers source and product data. *User* data — accounts, Ask content, analytics — is the Privacy
Notice's business, with its own fixed windows, and `src/lib/ask/retention.ts:58` sweeps Ask
surfaces only. A test asserts that sweep never names `raw_documents`, `claim_sources`,
`doc_claims` or `doc_dedup`.

## Tests

| Gate | Result |
|---|---|
| `npm test` (unit) | **3,939 / 3,939 (265 files) → 3,949 / 3,949 (266 files)** — +10 tests, +1 file |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 3 warnings (all pre-existing) |
| Fork integration tests | **not run — none apply.** No migration, no schema change, no runtime code path and no gated route is touched. The new file is a static source scan that reads the repository from disk and opens no connection |
| Spend | **$0** |

The 3,939 / 265 baseline is step 30's measured after-figure on this same tree, so the step 30 →
step 31 delta is exact rather than inferred.

**`src/lib/ingest/no-delete.test.ts`** — walks every `.ts`/`.tsx` under `src/` and `scripts/`
(the `src/lib/evals/isolation.test.ts` walk, which the plan named as the right shape) looking
for three patterns: `DELETE FROM raw_documents` in any spacing or casing, `.delete(rawDocuments)`,
and a `TRUNCATE` naming the table. Ten cases:

1. the walk finds what it is supposed to scan — a broken walk would make every other case
   vacuously pass, so this is asserted first;
2. no module under `src/` deletes, outside the named exemptions;
3. no script deletes, outside the named exemption;
4. the exempted operator script still deletes only `STUB_LIKE` rows inside a transaction — the
   exemption was granted for a ruling-3 cleanup, so if the guard goes the reason goes with it;
5. **the itest deleters are pinned by name**, so a ninth one fails the gate rather than being
   absorbed by the `*.itest.ts` pattern;
6. `src/lib/ingest/` contains no SQL deletion and no archival call at all — which is what makes
   §4 item 1 of the policy a checked fact rather than a recollection;
7. the Ask retention sweep never names the source or claim tables;
8–10. the policy document tracks the code: it names both exemptions and the one-year floor, its
   inventory count matches the pinned list's length, and it states all three of the plan's
   required caveats.

**Exemptions, by path and named in the test** (the prompt's requirement): `*.itest.ts` by
pattern *and* the current eight files individually; `scripts/cleanup-stub-data.ts`; and the
scan file itself, which necessarily contains the forbidden patterns as regex sources.

**Mutation proofs**, both run and then reverted:

- Adding `purgeOld()` with `DELETE FROM raw_documents WHERE fetched_at < now() - interval '1 year'`
  to `src/lib/ingest/run.ts` → **2 cases fail** (the `src/` scan and the ingest-library case),
  8 pass.
- Adding a new `src/integration/tmp-mutation.itest.ts` containing a `raw_documents` deletion →
  **1 case fails** (the pinned-list case), 9 pass. This is the one that matters: the pattern
  exemption alone would have let it through silently.
- Restored, 10/10 green.

**Two test-construction defects found and fixed while writing it**, both worth recording
because either would have produced a test that looked strict and was not:

1. The first draft asserted `/\bDELETE\b/i` over `src/lib/ingest/`, which fails on
   `delete process.env.TEST_TOP_N_X` in `config.test.ts` — the JavaScript operator, not a
   deletion of anything durable. Narrowed to `DELETE FROM` plus a query-builder `.delete(` call.
2. The document/test consistency case originally compared against prose ("Eight `*.itest.ts`
   files") that the test could not derive; the document now carries the count in a form the
   test computes from `KNOWN_ITEST_DELETERS.length`, so the two cannot drift.

## Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose, no source full text).** §2 is the ruling restated as a retention
  fact, with the schema's own annotations as evidence: `isw_reports.derived` is *"derived-only
  data … NEVER report prose"* (`src/db/schema.ts:146-147`) and `source_citations.hedging_cue` is
  *"short matched cue phrase only … never sentence-length ISW prose"*
  (`src/db/schema.ts:168-169`). The document names the asymmetry plainly — BNOW retains the
  bodies of the primary sources it ingests and does **not** retain the body of the expert
  product it benchmarks against — rather than leaving a reader to infer it.
- **Ruling 2 (traceability).** §1.2 documents the deferrable trigger and, newly, the
  non-cascading foreign key that makes a cited document undeletable. Nothing about the invariant
  is changed; it is described and now leaned on.
- **Ruling 3 (truth-in-UI).** The single exempted deleter exists to enforce this ruling, and the
  test pins that its `STUB_LIKE` guard and transaction are still there — so the exemption cannot
  outlive its justification.
- **Ruling 5 (migration additivity).** No migration is added, edited or renumbered;
  `drizzle/9999_claim_source_trigger.sql` is untouched. The policy notes that no migration
  deletes a row and that `src/db/migrations.test.ts:74,101` already bans destructive statements.
- **Ruling 21.** No route, page or gate is touched by this PR.
- **Addendum §7 guardrails.** No prompt, no dataset, no scorer, no registry approval, no map
  lock, no env, no LLM call, no new headline metric.

## Citations re-verified

All at base `a821695`.

| Cited | Verified | Note |
|---|---|---|
| `raw_documents` columns | `src/db/schema.ts:178-212`; `adapter :182`, `source_id/external_id :183-184`, `url :185`, `title :186`, `content :187`, `content_hash :188`, `lang :189`, `country_iso2 :190`, `published_at :191`, `fetched_at :192` | the plan's `:184-192` is the citation-payload subset; `adapter` is `:182` |
| `raw_documents_hash_idx` | `src/db/schema.ts:206` | **corrected** — the plan's §4 WS-7.6 cites `schema.ts:206` correctly; my first draft wrote `:210`, which is `raw_documents_processed_idx` |
| `claim_sources` | `src/db/schema.ts:291-305`; FK constraints in `drizzle/0000_superb_ultimates.sql` — `claim_id` `ON DELETE cascade`, `raw_document_id` `ON DELETE no action` | **new finding**, not in the addendum or the plan |
| regeneration deletes | `src/lib/analysis/digest-persist.ts:177` (`DELETE FROM claims WHERE digest_id = $1`) and **`:181-185`** (the track-scoped event sweep) | plan cited `:182` for the sweep; the statement runs `:181-185`, comment `:178-180` |
| claim ids not stable | **`src/db/schema.ts:1057-1060`** — the `claim_embeddings` header, *"Claims are DELETED and re-inserted with fresh ids on every digest regeneration"* | **corrected** — the plan cites `schema.ts:1015-1020`, which is the `doc_dedup` header, a different table |
| ~8 regenerations per digest day | `src/db/schema.ts:959` | exact |
| `content_hash` basis | `src/lib/ingest/run.ts:29-33` — `adapter\|externalId??url\|title\|content.slice(0, 4000)` | plan cited `:29`; the function spans 29-33 |
| insert conflict clause | `src/lib/ingest/run.ts:218-224`, `ON CONFLICT (content_hash) DO NOTHING` at `:221` | exact |
| adapter content caps | `telegram-web.ts:29` (8,000), `rss.ts:19` (8,000), `telegram-mtproto.ts:131` (8,000), `x-api.ts:163` (8,000), `procurement.ts:36-37` (300 title / 4,000 content) | plan cited the first two; the other three are this step's inventory |
| X terms note | `src/lib/adapters/x-api.ts:1-2` — "third-party; header `X-API-Key`, NOT the official developer.x.com API" | exact |
| the only non-test deleter | `scripts/cleanup-stub-data.ts:60` | exact |
| itest deleters | **8 files, 10 statements**: `ask-events`, `authz-page-gate`, `enrich-rescore`, `hardening`, `map-batch-error-classification` (×2), `map-budget-stop` (×2), `map-flood-bounds`, `map-remap` | **corrected** — the plan says "nine `*.itest.ts` seed-teardown deleters"; there are nine *files* containing a deletion only if `cleanup-stub-data.ts` is counted, and eight itest files with ten statements between them. The test pins the eight |
| Ask sweep scope | `src/lib/ask/retention.ts:58` (`sweepAskRetention`) — no `raw_documents` reference anywhere in the file | exact |
| `src/lib/ingest/` contents | `config.ts`, `run.ts`, `theater.ts` (+ their tests). No archival step, no deletion | exact |
| migration destructive-SQL ban | `src/db/migrations.test.ts:74`, `:101` | exact |
| OPEN-TASKS end | file ended at **#107** (`docs/OPEN-TASKS.md:1764`); INDEX §1.7 at `docs/prompts/2026-09-05-48h-00-INDEX.md:94-96` records the phantom "#108", resolved by decision R5 to `claude/local-model-ask-eval-20260817` | exact; #108 claimed with that note in the entry |

## Decisions needed

**None.** This step's prompt lists no decision and none arose. Two things are recorded for the
operator as *information*, not as questions:

- **#108 is design only** and deliberately not a blocker on the ICS 206-01 claim. The standard's
  one-year rule is about retention, which BNOW meets; third-party attestation is not required by
  it. If archival is ever wanted for evidentiary use rather than tradecraft conformance, that is
  a different justification and the entry lists the design questions.
- **The document is now quotable to a buyer.** It was written to be shown, so if the operator
  disagrees with any of the four caveats being stated in public-facing terms, that is worth
  saying before it is put in front of anyone — the caveats are what make the claim honest, and
  removing one would make the document overclaim rather than merely read better.

## Debt and risks

1. **The scan proves no *code path* deletes; it cannot prove no *human* deletes.** A manual
   `psql` session, a Neon console query, or a restore from a branch with different contents is
   entirely outside its reach. The policy says the mechanism is "absence plus enforcement", and
   the enforcement half — the non-cascading foreign key — protects only *cited* documents. An
   uncited document could still be deleted by hand without any test noticing.
2. **The one-year floor is asserted, never measured.** Nothing computes "is every document cited
   by a product issued in the last year still present". It is true by construction today because
   nothing deletes, but if #108 or any future purge lands, the floor needs a check rather than a
   sentence. Not filed as its own task; recorded here as the thing that would have to be built
   first.
3. **`content_hash` remains a prefix hash and this PR does not change that.** §3.2 is a
   disclosure, not a fix. If evidentiary use is ever wanted, a real seal over the stored body is
   new work with a migration.
4. **The pinned itest list is maintenance.** Every new integration test that seeds and tears
   down `raw_documents` must add a line. That is the intended cost — the alternative is a
   pattern exemption that hides a production deleter someone named `*.itest.ts` — but it will
   surprise whoever hits it first. The failure message names the policy document.
5. **The policy documents behaviour, and behaviour can change under it.** If an adapter's
   content cap changes, or a new adapter lands with a different one, §1.3's per-platform list
   goes stale silently — no test ties those numbers to the adapters. Making them machine-checked
   is the same trick as step 30's drift test and was not done here because the caps are stable
   and the list is long; it is the obvious next hardening if the document starts being cited.

## Handoff

- **Step 33 (WS-7.3, descriptors and the per-digest source summary)** is the one that most
  needs this document. Its summary statement reports document, channel and platform counts; the
  phrase for what those documents *are* is settled here — a citation preserves the **document**,
  never the claim row id (§3.1) — and any wording that implies a stable claim identifier across
  regeneration contradicts `digest-persist.ts:177`. If the summary ever wants to say "preserved",
  it should link this policy rather than restate it.
- **Step 32 (WS-7.2, citation mode)** inherits two facts. First, the access date it will present
  under decision T2 is `raw_documents.fetched_at` — the same column §1.1 documents as the
  ICS 206-01 access date, and the policy's label for it ("when BNOW retrieved it") should match
  the citation's label ("Accessed (BNOW ingest)"), not diverge from it. Second, a citation must
  not imply that the cited URL still resolves: §3.3 and §3.4 are exactly the caveats a citation
  block should be able to point at, and the crosswalk's ICS 206-01 rows now say so.
- **Any step that edits the crosswalk** must edit `docs/METHODOLOGY-TRADECRAFT.md` and
  `src/lib/tradecraft/crosswalk.ts` in the same commit. This step is the first live exercise of
  that pairing and it worked as designed: the two preservation rows could not be flipped in one
  place alone.
- **No prompt rewrite is requested.** Step 31's prompt and PLAN-WS-7 §9.8 were followed as
  written. Three of the plan's citations were wrong and are corrected above — the claim-id
  record is `schema.ts:1057-1060` and not `:1015-1020`, the event sweep runs `:181-185`, and the
  itest deleter count is eight files / ten statements rather than nine deleters. Worth folding
  into PLAN-WS-7 when step 25 next touches it.

**Proposed AGENTS.md changes (COMMON §4.7 — step 25 applies them; this session did not edit
`AGENTS.md`).**

- *Directory map, `docs/` entry* — add `RETENTION-AND-PRESERVATION` beside
  `METHODOLOGY-TRADECRAFT` (step 30 proposed the latter).
- **Proposed decision-log entry** (append at the end, unsigned until step 25 lands it):

  > **2026-09-07 (WS-7.6 retention and preservation policy + no-delete assertion; repository
  > only)** `docs/RETENTION-AND-PRESERVATION.md` turns a property that held by accident into a
  > stated policy with a gate: source documents in `raw_documents` are retained indefinitely and
  > never for less than **one year from the issuance of any product citing them** (the ICS
  > 206-01 floor). Two enforcements, not one sentence — `claim_sources`' foreign key to
  > `raw_documents` is **`ON DELETE no action`**, so a **cited document cannot be deleted at
  > all** while its citation exists, and `src/lib/ingest/no-delete.test.ts` scans every `.ts`
  > under `src/` and `scripts/` for `DELETE FROM raw_documents`, `.delete(rawDocuments)` or a
  > `TRUNCATE` naming the table. Exemptions are **by path and by name**: the eight `*.itest.ts`
  > seed teardowns (disposable Neon forks, pinned individually so a ninth fails until
  > acknowledged) and `scripts/cleanup-stub-data.ts`, whose one `STUB_LIKE`-guarded deletion is
  > a ruling-3 obligation and whose guard the test also pins. **Four caveats are stated rather
  > than glossed**, because the claim would otherwise overclaim: published claims **are**
  > replaced on regeneration (`digest-persist.ts:177`, `:181-185`; fresh claim ids per
  > `schema.ts:1057-1060`), so a citation preserves the *document* and never the claim row id;
  > `content_hash` covers only `content.slice(0, 4000)` (`ingest/run.ts:29-33`) of a body stored
  > up to 8,000, making it a dedup key and **not** an integrity seal; a Telegram capture is a
  > snapshot of the `t.me/s/` preview, not the post; and X retrieval depends on third-party
  > terms (`x-api.ts:1-2`). A fifth gap — no third-party archival snapshot exists anywhere in
  > `src/lib/ingest/` — is filed as **OPEN-TASKS #108**, design only, with a note distinguishing
  > it from the phantom "#108" the 48h INDEX §1.7 records (resolved by R5 to
  > `claude/local-model-ask-eval-20260817`). The crosswalk's two preservation rows flip
  > `PARTIAL → BUILT` in `docs/METHODOLOGY-TRADECRAFT.md` and `src/lib/tradecraft/crosswalk.ts`
  > in the same commit, which is the first live exercise of step 30's drift test; totals move to
  > **7 BUILT / 10 PARTIAL / 7 GAP**. The scan is mutation-proven twice, including the case that
  > matters — a NEW `*.itest.ts` deleter fails the pinned list rather than passing on the
  > pattern exemption. Gates: typecheck clean · lint 0 errors (3 pre-existing warnings) · unit
  > **3,939/3,939 (265 files) → 3,949/3,949 (266 files)**. Zero paid calls, zero production
  > writes, no migration, no env change, no deploy, nothing deleted, nothing under
  > `docs/evals/` touched. Binding until superseded: making a source document deletable requires
  > stating the one-year floor it will honour, amending the policy, and amending the test's
  > named exemption list **in the same commit** (§6). Report:
  > `docs/reviews/WS-7-6-RETENTION-2026-09-06.md`.

## A second session in the same worktree

Recorded because it changed SHAs this report cites, and hiding it would make the base-SHA
history unexplainable. At 21:07Z a second session (`48h-ws7-docs-20260905-a2`) was running in
this same worktree. It rebased all three step branches from `98294c5` onto `origin/main`
`a821695` (a docs-only commit touching `docs/prompts/*`; no conflict) and added one commit,
`9978801`, narrowing a sentence on the `/methodology` page. It then stopped and handed the
worktree back.

This session verified that commit rather than accepting it: the page had said the reliability
rating "is shown in context wherever a source is cited inside a product", and the claim-surface
gate is `showScores` (`src/components/claim-copy-model.ts:27`, applied `:213,227`), which is
**`false` on `/signals`** (`src/app/signals/page.tsx:187,206`) and `true` on the digest
(`digests/[country]/[date]/page.tsx:505`), search (`search/page.tsx:216`), entities and ask
panels. The correction is right, it was kept, and it was moved onto step 30's PR 2 branch where
it belongs. Step 30's report was amended in the same move to record both the new base SHA and
the copy correction. No other change was made by that session; nothing was pushed by it, no PR
was opened by it, and it left the tree clean.
