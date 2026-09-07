# BNOW.NET methodology — tradecraft crosswalk (ICD 203 · ICD 206 · ICS 206-01 · ICD 208)

**What this document is.** A requirement-by-requirement statement of what BNOW.NET does against
the four public Intelligence Community issuances that govern analytic tradecraft, sourcing, OSINT
citation, and product utility — with the file in this repository that enforces each mechanism, so a
methodology validator, an analyst, or a grant reviewer can audit the claim without a demo and
without taking our word for it.

It is the source of truth for the public page at `/methodology`, which renders a curated subset of
the crosswalk table below (no file paths, no internal task numbers). The two are held together by a
drift test (`src/lib/tradecraft/crosswalk.test.ts`).

**Status vocabulary.** `BUILT` = the mechanism exists in production code today and the cited file
enforces it. `PARTIAL` = the inputs exist and are enforced, but the requirement is not fully met —
usually because the data is held but not presented. `GAP` = not built. Every `PARTIAL` and `GAP` row
names the workstream step that closes it, or says plainly that no planned step does.

**What this document is not.** It is not a claim of accuracy. BNOW measures *coverage* against a
named expert benchmark — the frozen contract name is "Key Takeaway benchmark coverage" — and that
metric is agreement with ISW/CTP, which reads many of the same open sources BNOW reads. Agreement is
not independent confirmation, and coverage is never restated as "accuracy"
(`src/lib/conflicts/product-copy.ts:6-13,28`). Nothing here asserts that any source-reliability
number is calibrated; that claim is gated by `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md` and
OPEN-TASKS #14, and the reliability score is withheld from every non-privileged surface
(`src/lib/registry/view-policy.ts`).

---

## 1. The four issuances, and two corrections

| Issuance | Title | Date |
|---|---|---|
| **ICD 203** | Analytic Standards | 2015-01-02 |
| **ICD 206** | Sourcing Requirements for Disseminated Analytic Products | 2015-01-22 |
| **ICD 208** | Maximizing the Utility of Analytic Products | 2017-01-09 |
| **ICS 206-01** | Citation and Reference for Publicly Available Information, Commercially Available Information, and Open Source Intelligence | 2024-12-02 |

Index of the unclassified originals: https://irp.fas.org/dni/icd/index.html

**Two corrections this document carries**, because earlier internal material got them wrong and a
crosswalk that repeats them is not auditable:

1. **ICD 208's title is "Maximizing the Utility of Analytic Products."** It is not a sourcing or a
   citation directive; it governs how a finished product is structured so a customer can use it.
2. **The one-year preservation rule for dynamic sources is in ICS 206-01, not ICD 206.** ICD 206
   requires that sources be preserved and retrievable; the specific "at least one year from product
   issuance" figure for sources that change or disappear is the ICS 206-01 implementation.

## 2. Nomenclature

BNOW's product vocabulary is **ICS 206-01 narrative source descriptors** and **ICD 203 estimative
language**. NATO AJP-2.1 / Admiralty two-axis codes (source reliability A–F × information
credibility 1–6) are emitted, when they are emitted at all, as **derived export fields only** — for
STIX 2.1 and MISP interoperability — and never as a headline rating.

The reason is on the record rather than assumed: ICS 206-01 is the current US standard, it was
written for OSINT specifically, and it is the only one of the four that addresses AI- and ML-derived
inference. The Admiralty scale keeps NATO/CTI interoperability but has documented fusion failure
modes — readers collapse the two axes into a single quality impression, and the definitions of the
credibility levels are not stable across users.

Decision of record: program decision **T1**, answered by the operator (`Yes agree`).

## 3. Crosswalk

Requirement text is paraphrased from the issuances. The *enforcing file* column is repo-internal and
is deliberately absent from the public page.

<!-- CROSSWALK-TABLE:BEGIN -->

| Standard | Requirement | BNOW mechanism | Enforcing file | Status | Closed by |
|---|---|---|---|---|---|
| ICD 203 | Objective; independent of political consideration | Source standing is derived from ISW's own citation and hedging behaviour, not from an editorial preference; there is no human editorial pass between extraction and publication, which removes an editorial-bias path and equally removes human review | `src/lib/isw/hedging.ts`; `scripts/registry-materialize.ts`; `src/lib/isw/load.ts:38-46` | PARTIAL | not in WS-7 |
| ICD 203 | Timely | Digests are generated four times a day per theater and track; lag against the expert benchmark is measured, not asserted | `vercel.json` cron schedule; `src/db/schema.ts:307-325` (`validation_runs.timeliness_hours`) | BUILT | — |
| ICD 203 | Based on all available sources | Multi-adapter ingestion — RSS, GDELT, Telegram web preview, Telegram MTProto, X — into one hash-deduplicated document store, with a per-theater corpus and a source and platform mix cap so one loud platform cannot fill a batch | `src/lib/adapters/`; `src/db/schema.ts:178-212`; `src/lib/analysis/source-mix.ts:15,26-30` | PARTIAL | not in WS-7 |
| ICD 203 | Properly describes the quality and credibility of underlying sources | Every source carries a citation profile and a five-value hedging distribution per theater; the per-claim evidence panel shows the documents behind a claim; no narrative source descriptor is generated yet | `src/db/schema.ts:74-103,109-131`; `src/components/claim-evidence-model.ts:1-21` | PARTIAL | WS-7.3 |
| ICD 203 | Properly expresses and explains uncertainty | The source's own estimative posture is captured as a five-value hedging label on every claim; BNOW states no likelihood band and no analytic-confidence level of its own | `src/db/schema.ts:38-44,268-269`; `src/lib/isw/hedging.ts` | GAP | WS-7.4 |
| ICD 203 | Distinguishes underlying information from assumptions and judgments | A claim cannot be committed without at least one source document — a deferrable database trigger fails the transaction otherwise — and a deterministic publication guard rebuilds or drops any event whose prose would state a single-document disputed allegation as fact | `drizzle/9999_claim_source_trigger.sql`; `src/db/schema.ts:291-305`; `src/lib/analysis/publication-guard.ts` | BUILT | — |
| ICD 203 | Incorporates analysis of alternatives | Divergences against the expert benchmark are recorded per run and shown on the scoreboard, but no structured alternative-hypothesis method is implemented | `src/db/schema.ts:307-325` (`validation_runs.divergences`) | GAP | not in WS-7 |
| ICD 203 | Demonstrates customer relevance and addresses implications | Products are scoped per theater and per track so a reader selects the lens rather than filtering a firehose; no explicit implications section is generated | `src/db/schema.ts:237-255`; `src/lib/analysis/tracks.ts` | PARTIAL | not in WS-7 |
| ICD 203 | Uses clear and logical argumentation | Every rendered claim is a discrete assertion with its own evidence set, hedging label, and copyable citation, rather than an unattributed narrative | `src/components/claim-copy-model.ts`; `src/components/claim-evidence-model.ts` | PARTIAL | WS-7.2 |
| ICD 203 | Explains change to or consistency of analytic judgments | Digests are archived per date and are addressable, so change is inspectable, but no explicit change statement is generated between editions | `src/db/schema.ts:237-255`; the digest archive | GAP | not in WS-7 |
| ICD 203 | Makes accurate judgments and assessments | Not claimed. What is measured and published is coverage against a named expert benchmark, with the non-independence caveat carried beside the number | `src/lib/conflicts/product-copy.ts:6-13,28`; `src/db/schema.ts:307-325` | PARTIAL | not in WS-7 |
| ICD 203 | Incorporates effective visual information | Hedging-mix bars, per-year citation histograms and scoreboard tables; no map or geospatial rendering | `src/app/registry/[id]/page.tsx`; `src/app/scoreboard/` | PARTIAL | not in WS-7 |
| ICD 206 | Source Reference Citation for every disseminated claim | A deferrable constraint trigger raises and fails the whole transaction if any claim commits without at least one source-document link; the application layer writes the claim and its links in one transaction; a migration test guards the trigger against regeneration | `drizzle/9999_claim_source_trigger.sql`; `src/db/schema.ts:291-305`; `src/db/migrations.test.ts` | BUILT | — |
| ICD 206 | Source descriptors conveying reliability, bias and limitations | The inputs are held per source and per theater — platform, status, citation count, first and last cited dates, and the five hedging counts — but no descriptor is generated or rendered anywhere | `src/db/schema.ts:74-103,109-131` | GAP | WS-7.3 |
| ICD 206 | Source summary statement for the product as a whole | The inputs are held — the claim-to-document join, the source and platform mix cap with its cap events, and same-theater dedup — but no per-digest summary statement is generated | `src/db/schema.ts:291-305`; `src/lib/conflicts/evidence-selection.ts:46,98-103` | GAP | WS-7.3 |
| ICD 206 | Sources preserved and retrievable for the life of the product | Every document is stored with its URL, body, fetch timestamp and content hash, and no production code path deletes one — but the property is met by default rather than stated as policy or asserted by a test | `src/db/schema.ts:178-212`; `src/lib/ingest/run.ts` | PARTIAL | WS-7.6 |
| ICS 206-01 | Citation elements per source: author, title, URL, publication date, access date, source type | URL, title, publication date, adapter and platform are held and plumbed to every claim's evidence payload; the access date is retained but deliberately not presented, and no single standard-conformant citation string is emitted | `src/db/schema.ts:184-192`; `src/components/claim-evidence-model.ts:1-21` | PARTIAL | WS-7.2 |
| ICS 206-01 | A brief narrative quality descriptor per source | Not generated. The citation-volume and hedging-profile inputs exist per theater | `src/db/schema.ts:109-131` | GAP | WS-7.3 |
| ICS 206-01 | Disclosure of AI or ML tooling: system name, model version, relevant parameters | Every extraction row carries a versioned extractor stamp, every synthesized digest carries a provider tag and a durable dispatch identity, and the routing registry version is recorded with it — none of which reaches a reader or the clipboard | `src/lib/analysis/map-prompts.ts:254-266`; `src/lib/analysis/synthesize.ts:443-449,701`; `src/lib/analysis/openai-provider.ts:147`; `src/lib/llm/model-config.ts:133,267`; `src/lib/llm/analysis-registry.ts:38` | PARTIAL | WS-7.2 |
| ICS 206-01 | Consistent PAI / CAI / OSINT vocabulary | Every live adapter ingests publicly available information; the distinction is not yet stated in product vocabulary or in any citation output | `src/lib/adapters/` | GAP | WS-7.2 |
| ICS 206-01 | Dynamic sources preserved at least one year from product issuance | Source documents are retained indefinitely in practice and nothing deletes them, but no written retention statement exists that a buyer could be shown, and no archival snapshot of a changing page is taken | `src/db/schema.ts:178-212`; `src/lib/ingest/run.ts` | PARTIAL | WS-7.6 |
| ICD 208 | Key judgments first — BLUF ordering | Digests lead with events and their supporting claims; the validation scoreboard leads with the benchmark result | `src/app/digests/`; `src/app/scoreboard/` | BUILT | — |
| ICD 208 | Consistent, predictable product structure | One product shape per theater and track, dated, archived and addressable at a stable URL | `src/db/schema.ts:237-255`; the digest archive | BUILT | — |
| ICD 208 | Output a customer can reuse in their own product | Per-claim copy actions exist for report, link, evidence and text; no standard-conformant citation mode and no public API | `src/components/claim-copy-model.ts:16` | PARTIAL | WS-7.2 |

<!-- CROSSWALK-TABLE:END -->

## 4. Two things BNOW does that the standards do not require

**1. Citation is enforced by the database, not by review.** ICD 206 requires a Source Reference
Citation; it does not require that the storage layer make an uncited claim impossible. BNOW's does.
`drizzle/9999_claim_source_trigger.sql` installs a `DEFERRABLE INITIALLY DEFERRED` constraint
trigger on `claims` that raises and rolls the transaction back if the committing claim has no
`claim_sources` row. Three properties make it load-bearing rather than decorative:

- It is deferred to commit time, so a legitimate write that inserts the claim and its source links
  in one transaction passes, while any path that inserts a claim and stops fails.
- It is re-asserted by a migration numbered `9999` that always applies last and creates the trigger
  only when absent, so a future schema regeneration cannot silently drop it — the file's own header
  records why there is deliberately no `DROP TRIGGER … ; CREATE TRIGGER …` pair.
- It is guarded by a test (`src/db/migrations.test.ts`), so removing it fails the pre-push gate.

This is standing ruling 2 in `AGENTS.md`, and it is the one mechanism in this document that cannot
be bypassed by any code path, including a manual script.

**2. An external benchmark loop scores the product against a named expert publication.** Nothing in
ICD 203, ICD 206, ICS 206-01 or ICD 208 requires a producer to publish a running comparison of its
own output against an outside expert product. BNOW does: each day's digests are compared against the
same-day ISW/CTP assessment and the result is written to `validation_runs`
(`src/db/schema.ts:307-325`) as coverage, unsupported-claim rate, timeliness in hours, and an
itemized divergence list that distinguishes agreement, divergence, benchmark-only and BNOW-only
items. The results are public on `/scoreboard`.

The honest limits of that loop are part of the claim, not a footnote:

- **It measures coverage, not accuracy.** The frozen contract name is "Key Takeaway benchmark
  coverage" (`src/lib/conflicts/product-copy.ts:6-13`).
- **It is not independent confirmation.** ISW/CTP reads many of the same open sources BNOW reads;
  the non-independence caveat is rendered beside the number, not in a footer
  (`src/lib/conflicts/product-copy.ts:28`).
- **A BNOW-only item is labelled as such, never as a scoop.** Publication ruling 19 requires
  non-confirmed unmatched claims to render as "BNOW-only reported item" with the hedge shown.

## 5. Where the machine is disclosed as a machine

Every analytic artifact BNOW publishes is produced by an automated pipeline. The stamps that record
which machine produced it exist today and are durable:

- **Extraction.** `mapExtractorVersion()` (`src/lib/analysis/map-prompts.ts:254-266`) hashes the
  model id, the system prompt for that track and theater, the user-frame revision and the content
  budget into a version string that is written on every extracted row. It is a versioning contract,
  not a label: consumers filter to the current versions or they double-count, and a change to the
  basis is a corpus-wide event (standing ruling 13).
- **Synthesis.** A digest row carries a provider tag (`src/lib/analysis/synthesize.ts:443-449`;
  `src/lib/analysis/openai-provider.ts:147`) and, in its structured statistics, the durable dispatch
  identity of the exact configuration every synthesis vote used (`synthesize.ts:701`).
- **Routing authorization.** That identity includes the routing registry version
  (`src/lib/llm/model-config.ts:133,267`; `src/lib/llm/analysis-registry.ts:38`), so an output row
  can be traced back to the registry state that authorized the model to serve it.

None of this reaches a reader today. Closing that is WS-7.2's whole purpose, and the fact that the
stamps already exist is why it is a rendering job rather than a pipeline job.

## 6. What is deliberately withheld

Two categories are withheld from public and non-privileged surfaces on purpose, and a crosswalk that
did not say so would be misleading:

- **ISW prose and source full text.** Standing ruling 1: no ISW prose and no source full text appear
  in any user-facing output. What is published is URLs, classifications, counts, dates and scores.
  ISW takeaway text may pass through an analysis prompt transiently; only verdicts persist.
- **The reliability score and the exact hedging weights that would reconstruct it.** The score, the
  reliability ordering and the weight constants are an analyst/admin privilege, decided in exactly
  one place (`src/lib/registry/view-policy.ts`) and independently withheld by the detail page rather
  than merely unlinked (`src/app/registry/[id]/page.tsx:135-143`). For the record, and because this
  document is repo-internal, the v1 weights are `confirmed 1.0 · assessed 0.75 · unknown 0.5 ·
  claimed 0.4 · unverified 0.15` (`src/lib/isw/load.ts:38-46`, duplicated in
  `scripts/registry-materialize.ts` and stated in `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`).
  **The public `/methodology` page states the ordering qualitatively and prints no constant and no
  score** — enforced by a test, not by editorial discipline (program decision T5, option (a)).

There is a further honesty point about that score. `AGENTS.md` standing ruling 16 holds that an
unhedged ISW declarative stays `unknown` at mid-trust rather than being forced into one of the four
explicit classes, because forcing it would corrupt the signal. That is a deliberate mid-trust
default, not a measurement, and it is one of the reasons the score is not presented as calibrated.

## 7. Reviewer and partner insert (one page)

*This section is the standalone insert for the reviewer/partner packet — the "methodology validator"
role in `docs/PARTNER-STRATEGY.md:24`, which reviews the source registry, the reliability ratings
and the validation method. It restates the crosswalk in the form a reviewer needs and is meant to be
read on its own.*

**What BNOW is.** A per-country conflict-monitoring service that ingests open news, Telegram and X
into a hash-deduplicated document store, extracts discrete claims from those documents, synthesizes
them into dated per-theater digests, and scores those digests each day against the same-day ISW/CTP
assessment on a public scoreboard.

**The four things worth auditing, and how to audit them without repository access:**

1. **Is every published claim actually cited?** Open any digest, open the evidence panel on any
   claim, and confirm each claim resolves to at least one source document with a URL, a title and a
   publication date. The property is enforced at the storage layer by a deferrable database trigger,
   so it is not a convention that can lapse — a claim with no source cannot be committed.
2. **Is the source registry derived, or asserted?** It is derived. Source standing comes from how
   often ISW cites a source and with what hedging language ISW attaches to the citation
   — "geolocated footage confirms" versus "a milblogger claimed" versus "ISW cannot independently
   verify". The registry is a measurement of someone else's citation behaviour, which is why the
   product brief describes it as ISW's own Admiralty-style ratings expressed in prose
   (`docs/PRODUCT-BRIEF.md:107`).
3. **What does the scoreboard number mean?** Coverage against a named expert benchmark — agreement
   with ISW/CTP on the same day — not accuracy, and not independent confirmation, because both
   parties read many of the same open sources. That caveat is rendered beside the number.
4. **What is missing?** The `GAP` rows in the crosswalk above: narrative source descriptors, a
   per-product source summary statement, ICD 203 estimative language with a separate analytic
   confidence level, PAI/CAI/OSINT vocabulary in the citation output, analysis of alternatives, and
   an explicit statement of change between editions. Each names the workstream step that closes it,
   or says plainly that none does. A reviewer who wants to be useful should push on the `PARTIAL`
   rows, not the `BUILT` ones.

**What we ask a methodology validator to do.** Attack the crosswalk. Specifically: tell us where a
`BUILT` row overclaims; tell us whether the hedging taxonomy in section 6 is the right reduction of
ISW's language or a lossy one; and tell us whether the coverage metric, as caveated, is one you
would put in front of your own clients.

## 8. Related documents

- `docs/RETENTION-AND-PRESERVATION.md` *(WS-7.6)* — what is retained, for how long, what is not
  retained, and what a preservation gap looks like (ICD 206 mechanism 4; the ICS 206-01 one-year
  rule).
- `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md` — why the reliability score is not presented as
  calibrated, and the gates that would change that.
- `docs/PRODUCT-BRIEF.md` — the product's own account of the ISW citation corpus.
- `docs/PARTNER-STRATEGY.md` — the partner roles, including the methodology validator.
- `AGENTS.md` § Standing rulings — the binding invariants cited throughout this document
  (1 legal, 2 traceability, 3 truth-in-UI, 13 extractor versioning, 14 per-theater corpora,
  16 unhedged declaratives, 19 publication safety, 21 authorization placement).
