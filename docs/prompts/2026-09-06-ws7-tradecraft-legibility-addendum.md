# WS-7 — Tradecraft legibility (ICD 203 / ICD 206 / ICS 206-01) — addendum to the 2026-09-05 CTO handoff

Status of this document: an ADDENDUM to `docs/prompts/2026-09-05-cto-roadmap-handoff.md`. It adds one
workstream (WS-7), three rows to the handoff's §3 sequence table, one sentence each to WS-3.0 and WS-3.1,
and three operator decisions (§5 items 9–11 continuing the handoff's numbering). It changes nothing else
in the handoff. Everything factual below was verified against `origin/main` @ `883e5e3` (2026-09-04) on
2026-09-06; file paths are cited so the planning session can re-verify rather than re-discover. Where a
status is a judgment, it says so.

Location note: this file lives OUTSIDE the repo (`~/Documents/Claude/Projects/bnow-net/`) by operator
choice, because too many sessions and worktrees are active in `~/code/bnow-net`. The planning session
reads it from here. The docs-only PR the planning session opens should include a copy at
`docs/prompts/2026-09-06-ws7-tradecraft-legibility-addendum.md` so the repo history carries it.

Operator context: WS-7 exists because the standards BNOW already meets in the schema are invisible in the
product and in the docs. Government/MOD/MFA buyers (GTM ICP rank 5, ~$80k ARPU), political-risk
consultancies (rank 3, "citations they can quote") and the methodology-validator partners in
`docs/PARTNER-STRATEGY.md` all read tradecraft in ICD terms. Nothing in WS-7 is pipeline work, nothing
touches the evaluation datasets, and nothing changes any LLM prompt. If any WS-7 PR would require any of
those, the PR is wrong — see §7.

---

## 0. How to use this addendum (instructions to the planning session)

1. Read the handoff §0 first; its template and prohibitions apply here unchanged. Then read this file
   in full, then `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`, `src/lib/registry/view-policy.ts`,
   `src/components/claim-copy-model.ts` and `src/components/claim-evidence-model.ts`.
2. Produce ONE plan document `docs/reviews/PLAN-WS-7-tradecraft-legibility-2026-09-DD.md` following the
   handoff §0 template (goal/non-goals, current state with file:line evidence, PR-by-PR breakdown with
   tests and acceptance criteria, rulings touched, migrations, env/cap ordering, deploy path, soak/proof,
   exposure note, session estimates, operator decisions before the first PR).
3. Add the §3 rows below to `PLANNING-INDEX-<date>.md` in their week positions. WS-7 never displaces a
   WS-0, WS-2 or WS-3 PR; it fills gaps between them.
4. Suggested model: Sonnet for every WS-7 session. All steps are inventory-driven. No step needs Opus.
5. Where this addendum says DECISION, list it for the operator; do not choose.

---

## 1. What changed and why this is a workstream now

**ICS 206-01 (2024-12-02), "Citation and Reference for Publicly Available Information, Commercially
Available Information, and Open Source Intelligence,"** is the Intelligence Community Standard that
implements ICD 206 for OSINT. It is unclassified by design so allies and industry can adopt it. It
requires, per citation: author, URL, title, publication date, access date, source type, and a brief
narrative "quality descriptor" of the source's reliability, bias and limitations. For AI- or
ML-derived information it requires the tool or system name, model version and relevant parameters,
performance metrics, and training-data origin. It requires dynamic sources that shaped a conclusion to be
preserved for at least one year from product issue. It fixes the PAI / CAI / OSINT vocabulary.

BNOW's position against it, verified:

- **Source Reference Citation (ICD 206 mechanism 1)** — BUILT and stricter than the standard: the
  DEFERRABLE trigger in `drizzle/9999_claim_source_trigger.sql` fails the transaction if a claim has
  no `claim_sources` row (ruling 2).
- **AI-tool disclosure (ICS 206-01)** — BUILT in the data, ABSENT in the product: `extractor_version`
  on map output (handoff §4.2 cites `map-prompts.ts:255-266`), reduce `provider` tag
  (`src/lib/analysis/synthesize.ts:735,750`), digest model name (`openai-provider.ts:147`),
  `registryVersion` (`src/lib/llm/model-config.ts:108,182`). None of these reaches a reader or the
  "Copy for report" clipboard (`src/components/claim-copy-model.ts` — grep for
  `extractor|model|version|registry` returns nothing).
- **Citation metadata (author/URL/title/date)** — BUILT in `raw_documents` (`src/db/schema.ts:185-192`:
  `url`, `title`, `published_at`, `fetched_at`, `content_hash`) and already plumbed to the claim copy
  payload as `ClaimSourceDoc` (`src/components/claim-evidence-model.ts:1-19`). The access date
  (`fetched_at`) is carried but deliberately NOT presented (comment at `claim-evidence-model.ts:13-19`,
  2026-07-16) — see DECISION 10.
- **Source descriptors (ICD 206 mechanism 2; ICS 206-01 "quality descriptor")** — the inputs exist as
  registry aggregates (`schema.ts:86-92` on `sources`, `:119-124` per theater: five hedging counts,
  `citation_count`, first/last cited date, `platform`, `status`), but no descriptor is generated.
  `docs/PRODUCT-BRIEF.md:107` already frames these as ISW's "Admiralty-code ratings expressed in prose."
- **Source summary statement (ICD 206 mechanism 3)** — NOT BUILT. Inputs exist: `claim_sources`,
  the 40% platform mix cap (`src/lib/conflicts/evidence-selection.ts`; ruling 14), same-theater dedup
  (ruling 12).
- **Preservation (ICD 206 mechanism 4; ICS 206-01 one-year rule)** — MET BY DEFAULT, NOT BY POLICY:
  no production code deletes from `raw_documents` (only `*.itest.ts` cleanups do); Telegram web previews
  and RSS bodies are stored with `content_hash`. No written retention statement exists. No archival
  (Wayback-style) step exists in `src/lib/ingest/`.
- **ICD 203 estimative language and analytic confidence** — NOT BUILT. What exists is the five-value
  hedging enum (`schema.ts:38-44`) emitted by the map extraction schema (`src/lib/analysis/map-prompts.ts:72`)
  and stored on `claims.hedging` / `claims.confidence` (`schema.ts:268-269`), plus the copy-action
  "status" line that renders the hedging label (`claim-copy-model.ts`, `statuses`).
- **ICD 208 (Maximizing the Utility of Analytic Products, 2017-01-09)** — PARTIAL: BLUF ordering exists on
  digests and the scoreboard; confidence/likelihood are not stated next to claims.

Note two corrections to the earlier "Source to Judgment" artifact that the crosswalk (WS-7.1) must carry:
ICD 208's title is "Maximizing the Utility of Analytic Products," and the one-year preservation rule is
in ICS 206-01, not ICD 206.

---

## 2. Principles that order WS-7 (in addition to handoff §2)

1. **Legibility before new judgment.** Every WS-7 step renders or documents what the schema already
   holds. No step creates a new analytic judgment the pipeline does not already make.
2. **Never change the hedging vocabulary at the prompt.** `map-prompts.ts:72` is an `extractor_version`
   input (ruling 13); changing it forces a remap that is blocked until #33 runs (WS-2.3) and confounds
   the frozen map-v2 dataset (handoff principle 5). ICD 203 language is a deterministic presentation
   mapping OVER the enum, versioned separately, until step 4 of the evaluation program is complete.
3. **Machine-generated is disclosed as machine-generated.** ICS 206-01 requires it; every descriptor,
   summary statement and confidence label carries a version string and a "generated from citation data"
   label. Ruling 3 (fixture data never renders as fact) extends to templated prose.
4. **Calibration gates still bind.** `SOURCE-RELIABILITY-CALIBRATION.md` forbids a headline reliability
   score until its gates pass (#14, blocked by #56). WS-7 must not launder `reliabilityScore` into a
   letter grade that reads as calibrated.
5. **Ruling 1 is untouched.** Descriptors, summaries and citation blocks carry URLs, counts, dates and
   labels — never ISW prose, never source full text.

---

## 3. Rows to add to the handoff §3 sequence table

| Wk | ID | Step | Status today | Gated by | Sessions |
|---|---|---|---|---|---|
| 1–2 | WS-7.1 | Tradecraft crosswalk: `docs/METHODOLOGY-TRADECRAFT.md` + public methodology page + reviewer-packet insert | NOT STARTED (artifact exists outside repo) | DECISION 9 | 0.5 |
| 2 | WS-7.2 | ICS 206-01 citation mode on "Copy for report" (per-claim), with AI-tool disclosure line; JSON shape reserved for a future API | copy actions exist, no citation mode | DECISION 10 | 1 |
| 2–3 | WS-7.3 | Templated source descriptors on `/registry/[id]` and in the citation block; per-digest source summary statement | NOT STARTED, inputs exist | #56 caveat handling | 1–2 |
| 3 | WS-7.4 | ICD 203 likelihood band + separate analytic-confidence label as a versioned presentation mapping; rendered on claim rows and in the citation block | NOT STARTED | DECISION 11 (mapping table) | 1 |
| 3–4 | WS-7.6 | Preservation policy written (`docs/RETENTION-AND-PRESERVATION.md`) and asserted by a test that no production path deletes `raw_documents` | NOT STARTED, met by default | — | 0.25 |
| with WS-3.1 | WS-7.5 | Reserve `info_credibility` (claims) and `source_reliability` (per-theater registry) columns plus `descriptor_version` in the WS-3.1 migration; populate credibility only; reliability letters stay NULL until #14 gates pass | NOT STARTED | WS-3.1, #14 | 0.25 inside WS-3.1 |

Total: ~3.5–4.5 Sonnet sessions, all docs-or-render, no LLM spend, no migration of its own.

Sentences to add to the handoff:

- **WS-3.0 (decision memo), append:** "Also fix whether the conflict observation table and the ISW
  reference-report rows carry `descriptor_version`, and whether `info_credibility` / `source_reliability`
  are reserved now (WS-7.5) so no second migration is needed."
- **WS-3.1 (persistence), append:** "Include WS-7.5's reserved columns (nullable, no backfill, no reads)
  in the same forward-only migration; ruling 5 ordering unchanged."

---

## 4. Step briefs

### 4.1 WS-7.1 — Tradecraft crosswalk (docs + one public page)

**Goal.** One document, in the repo and on the site, that states for each requirement of ICD 203,
ICD 206, ICS 206-01 and ICD 208 what BNOW does, by mechanism, with the file that enforces it — so a
methodology validator, a government analyst or a grant reviewer can audit the claim without a demo.

**Build.** `docs/METHODOLOGY-TRADECRAFT.md` (source of truth, cites files); a public `/methodology`
section or page rendered from a curated subset (no file paths, no internal task numbers, ruling 21 gate
pattern if the page is not fully public); a one-page insert for the reviewer/partner packet
(`docs/PARTNER-STRATEGY.md` "methodology validator" ask). Structure per standard: requirement → BNOW
mechanism → status (BUILT / PARTIAL / GAP → which WS-7 step closes it). Be explicit about the two things
BNOW does that the standard does not require: DB-enforced citation (ruling 2) and the external ISW
benchmark loop (`validation_runs`).

**Non-goals.** No new claims about accuracy. The coverage metric keeps its contract name ("Key Takeaway
benchmark coverage," never "accuracy" — WS-3.0).

**Acceptance.** Every mechanism cited resolves to a real file at the PR's base commit; a reviewer with no
repo access can follow the public page; the docs page and the public page are generated from the same
source or tested for drift.

### 4.2 WS-7.2 — ICS 206-01 citation mode

**Goal.** A per-claim, copy-able citation that a consultancy or a government analyst can paste into an
ICS 206-01-conformant product without rework.

**Current state.** `ClaimCopyMode = "report" | "link" | "evidence" | "text"`
(`claim-copy-model.ts:16`) with a `ClaimCopyPayload` carrying claim id, text, hedging, `asOf`, country,
canonical claim URL and `ClaimSourceDoc[]` (url, title, adapter, source name/key/domain, platform,
reliability, `publishedAt`, `fetchedAt` — the last deliberately unpresented). Surfaces: digest, ask,
search, signal, entity (`ClaimCopySurface`). Clipboard output is escaped (`escapeClaimCopyHtml`) and the
canonical URL is validated (`canonicalClaimUrl`).

**Build.** Add a fifth mode, `citation` (label "Copy ICS 206-01 citation"), producing plain + HTML with,
per evidence document: author (source name, else channel key, else domain), title, URL, published date,
access date (see DECISION 10), source type (platform enum → media type + PAI/CAI tag; all current
adapters are PAI), and a one-line descriptor stub (WS-7.3 fills it; until then: platform + theater +
"ISW-cited N times" if `citation_count` > 0). Then one disclosure block per claim: "Claim extracted and
synthesized by BNOW.NET automated pipeline — map extractor `<extractor_version>`, synthesis
`<provider tag>` / `<digest model name>`, routing registry `<registryVersion>`, hedging label
`<hedging>`, corroboration `<n independent docs / m channels / k platforms>` (from
`summarizeClaimEvidence`). Retrieved as of `<asOf>`. Canonical: `<claimUrl>`." Plumb the version stamps
into the payload from the digest query (`src/app/digests/[country]/[date]/page.tsx:204` selects
`cl.text, cl.hedging, cl.confidence` today; add the digest's provider/model and the contributing
`doc_claims` extractor versions — the planning session verifies the join). Define the equivalent JSON
shape in a pure module (`src/lib/citation/ics206.ts`) with fixture tests, so a later API route
(`src/app/api/` has only ask/auth/cron/locale today) serializes the same object.

**Rulings.** 1 (URLs/metadata only — no full text in the block); 3 (stub provider claims never copy as
citations); 19 (publication guard labels — a `claimed`-only claim's block carries the ruling-19 label
verbatim); 21 (no new page; the copy action inherits the page gate).

**Acceptance.** Fixture test per surface; an XSS fixture proves escaping; a claim with a stub provider
refuses citation mode; the disclosure block never renders a NULL version as an empty string (render
"unstamped — pre-`analysis-reg-v1`" instead, so ruling 10-style NULL semantics are preserved).

### 4.3 WS-7.3 — Source descriptors and per-digest source summary statement

**Goal.** ICD 206 mechanisms 2 and 3 generated deterministically from registry and citation data, labeled
as generated, versioned.

**Descriptor (per source, per theater).** Template from `sources` / per-theater registry rows: platform
and theater; "cited in ISW <ROCA | Iran Update> N times between <first> and <last>"; hedging profile as
percentages with the cue vocabulary ("confirmed" = ISW attached geolocation or independent confirmation;
"claimed"/"unverified" = ISW attributed without confirmation; "unknown" = ISW unhedged declarative —
ruling 16, mid-trust by design); `status` (active / decayed / dead); independence caveats (same-owner
channels if the registry knows them; platform-root caveat). Render on `/registry/[id]` and feed
WS-7.2's descriptor line. Gate the reliability number behind `view.showReliability` exactly as today
(`src/app/registry/page.tsx:87,128`; `src/app/registry/[id]/page.tsx:107`; `src/lib/registry/view-policy.ts`);
the descriptor's counts and dates are fine for
the reduced view because they are citation volume, not a score — the planning session confirms against
`view-policy.ts` before assuming.

**#56 handling.** Platform roots (`facebook.com` pooling 26,195 citations / 7,081 raw URLs) must not get
a descriptor that reads as a source assessment. Either suppress descriptors where the source is a known
root (list from the #56 audit) or render "platform root — not a single publisher; see #56." Do not wait
for #56 to ship WS-7.3.

**Summary statement (per digest).** One templated paragraph from `claim_sources` for the digest:
distinct documents, channels and platforms; platform mix and whether the 40% cap bound (ruling 14);
share of claims with ≥2 independent documents, ≥2 channels, ≥2 platforms (independence per
`summarizeClaimEvidence` — note in the text that same-theater ±1-day dedup, ruling 12, has already
collapsed mirrors); the three load-bearing sources by claims supported; count of claims resting on a
single `claimed`/`unverified` document. Persist as a new nullable `digests.source_summary` jsonb of
counts and ids (ruling 1 — no prose persisted; the sentence is rendered at read time from the counts),
or compute at render; the planning session recommends one with cost evidence. Label: "Generated from
citation data, summary template v1 — not an analyst judgment."

**Rulings.** 1, 3, 12, 14, 16, 19, 21. Ruling 5 only if `digests.source_summary` is persisted (forward-only
migration; can ride WS-3.1's).

**Acceptance.** Golden-file tests for the descriptor and summary templates over fixture registries;
a fixture source with zero citations renders "no ISW citation history" rather than 0%-everything; the
platform-root fixture renders the #56 caveat; no output string contains any text from `raw_documents.content`
or from an ISW report (assert with a fixture containing sentinel prose).

### 4.4 WS-7.4 — ICD 203 likelihood and analytic confidence (presentation mapping)

**Goal.** Every rendered claim carries a seven-band ICD 203 likelihood term with its percentage range
AND, separately, an analytic-confidence level (high / moderate / low), never fused into one sentence,
never derived by changing a prompt.

**Build.** Pure module `src/lib/tradecraft/estimative.ts`, version constant `ESTIMATIVE_MAP_V1`, with
one function `(hedging, confidence, corroboration) → { likelihood: band, range: [lo, hi], confidence:
level }` where `corroboration` is `summarizeClaimEvidence`'s counts plus source reliability if
`showReliability`. The mapping table is DECISION 11; the module ships with the operator's table as data,
and a test pins every enum × corroboration cell. Render on claim rows (digest page, search, signals,
ask-cited), in the WS-7.2 citation block, and in the copy "status" line — the label
`statuses[hedging]` stays; the band is added beside it. Keep the numeric range in the output so a UK
reader can map to the PHIA probability yardstick (its bands differ from ICD 203's; do not relabel
server-side). Record `ESTIMATIVE_MAP_V1` in the decision log with the explicit note that a prompt-level
implementation after evaluation step 4 supersedes it as V2 and that V1 is a presentation layer, not a
persisted field.

**What this must not do.** Touch `map-prompts.ts`, the reduce prompt, `publication-guard.ts`
(ruling 19 logic reads the raw hedging enum and stays that way), `claims.hedging`, `claims.confidence`,
any `docs/evals/**` dataset, or the scorer.

**Honesty constraint.** The confidence level is machine-derived from corroboration and source history;
the UI label says "corroboration-derived confidence," not "analyst confidence." The crosswalk (WS-7.1)
says the same.

**Acceptance.** Exhaustive table test; a claim with hedging `unknown` and a single `claimed` document
never renders above "roughly even chance" / "low"; a `confirmed` claim with one document never renders
"almost certain" (confirmation without corroboration is capped — table cell is DECISION 11); snapshot
tests on each surface.

### 4.5 WS-7.5 — Reserved two-axis columns (inside WS-3.1)

**Goal.** Never pay a second migration for Admiralty-style export fields.

**Build.** In WS-3.1's forward-only migration: `claims.info_credibility smallint NULL` (1–6, NATO
AJP-2.1 information-credibility axis), per-theater registry `source_reliability char(1) NULL` (A–F),
`descriptor_version text NULL` wherever WS-7.3 output is persisted. Populate `info_credibility` only,
deterministically from corroboration + hedging (1 = confirmed by ≥2 independent documents on ≥2
platforms; 2 = confirmed or ≥2 independent documents; 3 = single `assessed`/`unknown` document;
4 = single `claimed`; 5 = `unverified` with contradiction on record; 6 = cannot be judged — table is
part of DECISION 11). `source_reliability` stays NULL until `SOURCE-RELIABILITY-CALIBRATION.md` gates
pass for that theater; then A–E from calibrated quantiles, F below the eligibility threshold. Export
only: STIX 2.1 confidence scales and MISP's admiralty-scale taxonomy consume these; the UI vocabulary
stays ICS 206-01 / ICD 203 (DECISION 9).

**Rulings.** 5 (rides WS-3.1's migration, `9999_claim_source_trigger.sql` stays last); 4 unaffected (no
provider calls).

### 4.6 WS-7.6 — Preservation policy

**Goal.** Turn "we happen to keep everything" into a stated policy that satisfies the ICS 206-01 one-year
rule and can be quoted to a buyer.

**Build.** `docs/RETENTION-AND-PRESERVATION.md`: what is retained (`raw_documents` rows with
`content_hash`, `fetched_at`, `url`; Telegram web-preview bodies; RSS bodies), for how long (indefinite
today; minimum one year from any digest that cites the document), what is NOT retained (ISW prose —
ruling 1 — only URLs, endnote indices, hedging cues), and what a preservation gap looks like (a Telegram
preview is a snapshot of the preview, not the post; X citations depend on `x_api` terms). Add an
integration test asserting no production module contains a `DELETE FROM raw_documents` path (itests are
exempt by path). Leave Wayback-style archival as an OPEN-TASKS entry, not a PR.

---

## 5. Decisions needed from the operator (continuing handoff §5 numbering)

9. **Nomenclature.** Adopt ICS 206-01 narrative descriptors and ICD 203 (2015) estimative language as
   the product's primary vocabulary; emit NATO AJP-2.1 / Admiralty two-axis codes as derived export
   fields only (WS-7.5), never as the headline. Recommendation: yes — ICS 206-01 is the current US
   standard written for OSINT and AI-derived inference; the Admiralty scale keeps NATO/CTI
   interoperability but has documented fusion and definitional failure modes.
10. **Access date in the citation mode.** The 2026-07-16 ruling hides `fetched_at` because "First seen
    by BNOW" read as a provenance claim. ICS 206-01 requires an access date. Options: (a) present
    `fetched_at` in the `citation` mode only, labeled "Accessed (BNOW ingest)"; (b) present `asOf`
    (digest generation time) as the access date; (c) omit and mark the citation "access date withheld."
    Recommendation: (a) — a citation's access date is a convention every reader understands, and the
    label removes the ambiguity the 2026-07-16 note worried about. Record in the decision log either way.
11. **The mapping tables.** The ICD 203 band × confidence table for WS-7.4 and the 1–6 credibility table
    for WS-7.5 are product judgments. The planning session drafts both as data with a rationale per cell;
    the operator approves before WS-7.4's first PR. Constraint to honor: no cell may render a likelihood
    above "likely" or a confidence above "moderate" from a single uncorroborated document.

---

## 6. Standing rulings WS-7 touches (from `AGENTS.md`; binding)

1 no ISW prose or source full text in any output (every template asserts this with a sentinel test) ·
2 traceability (the citation block is a rendering of the invariant, not a new path) · 3 fixture data
never renders as fact (stub-provider claims refuse citation mode; templated prose is labeled generated) ·
5 forward-only migrations, `9999_claim_source_trigger.sql` last (WS-7.5 rides WS-3.1) · 12 same-theater
dedup (summary statements say so) · 13 `extractor_version` is never changed by WS-7 · 14 per-theater
corpora and the 40% cap (reported, not altered) · 16 `unknown` stays mid-trust and is described as an
unhedged declarative · 19 publication guard reads the raw enum; labels carried verbatim into citations ·
21 authorization in the page, first statement, before any query (any new `/methodology` route that is
gated).

---

## 7. What WS-7 must NOT do (evaluation-freeze guardrails)

- No change to `src/lib/analysis/map-prompts.ts`, the reduce prompt, or any `<WORKLOAD>_MODEL` env.
- No change to `claims.hedging` / `claims.confidence` semantics or values; no backfill.
- No read or write under `docs/evals/analysis/*`, the scorer, `analysis-registry.ts`, the map lock,
  the heldout split, or `RECONCILIATION-KEY.json`.
- No new headline metric. "Coverage" keeps its WS-3.0 name; reliability stays behind `showReliability`
  and the #14 gates.
- No LLM calls. If a step seems to need one (e.g., "write a nicer summary"), it is out of scope; the
  templated version is the deliverable.
- No new Vercel env. If a feature flag is wanted for the public methodology page, ruling 4 ordering
  applies and it is listed as a decision, not assumed.

---

## 8. Planning-session prompt (append to the handoff §7 prompt)

> Also read `~/Documents/Claude/Projects/bnow-net/2026-09-06-ws7-tradecraft-legibility-addendum.md`
> (copy it into `docs/prompts/` in your docs-only PR). Produce
> `docs/reviews/PLAN-WS-7-tradecraft-legibility-<date>.md` following the handoff §0 template. WS-7 is
> docs-and-render only: no prompt, dataset, registry, env or scorer changes; if a PR you draft needs one,
> stop and list it as a decision. Add WS-7's rows to `PLANNING-INDEX-<date>.md` without displacing any
> WS-0/2/3 PR, and add the two sentences in this addendum's §3 to the WS-3.0 and WS-3.1 plans. Draft the
> two mapping tables (decision 11) as data with a one-line rationale per cell; do not ship them.

---

## 9. References (unclassified, public)

- ICD 203 Analytic Standards (2015-01-02); ICD 206 Sourcing Requirements for Disseminated Analytic
  Products (2015-01-22); ICD 208 Maximizing the Utility of Analytic Products (2017-01-09); ICS 206-01
  Citation and Reference for PAI, CAI and OSINT (2024-12-02). Index: https://irp.fas.org/dni/icd/index.html
- ICS 206-01 walkthroughs: https://pangearesearch.substack.com/p/sourcing-for-osint-icd-206-01 ;
  https://govciomedia.com/ic-adopts-new-standards-for-open-source-intelligence/ ;
  https://publication.osintambition.org/ics-206-01-the-new-standard-every-osint-professional-must-know-0bbaaa698846
- IC OSINT Strategy 2024–2026 (ODNI/CIA, 2024-03):
  https://www.odni.gov/index.php/newsroom/press-releases/press-releases-2024/3784-odni-and-cia-release-the-intelligence-community-osint-strategy-for-2024-2026
- Admiralty / NATO AJP-2.1 critique: https://www.blockint.nl/intel-analysis/critical-review-of-the-admiralty-code/ ;
  Kelly, Budescu, Dhami & Mandel (2025), Judgment and Decision Making:
  https://www.cambridge.org/core/journals/judgment-and-decision-making/article/effect-of-source-reliability-and-information-credibility-on-judgments-of-information-quality-in-intelligence-analysis/E67548E8010A47345C3439D45D9EC6B3
- STIX 2.1 confidence scales (Admiralty credibility, DNI/ICD 203 scale):
  https://stix2.readthedocs.io/en/latest/api/confidence/stix2.confidence.scales.html
- CIA Tradecraft Primer (structured analytic techniques — deferred to the analyst-verified tier):
  https://www.cia.gov/resources/csi/static/Tradecraft-Primer-apr09.pdf
- Repo: `docs/prompts/2026-09-05-cto-roadmap-handoff.md`, `docs/designs/SOURCE-RELIABILITY-CALIBRATION.md`,
  `docs/PRODUCT-BRIEF.md:107`, `docs/GTM-STRATEGY.md` §2, `docs/PARTNER-STRATEGY.md`.
