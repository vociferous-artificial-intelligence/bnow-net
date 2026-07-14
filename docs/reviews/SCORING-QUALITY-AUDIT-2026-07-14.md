# Scoring and quality-gauge audit — July 13, 2026 deep dive

Date: 2026-07-14. Scope: read-only production-data audit plus documentation corrections.
No application code, database rows, environment values, or provider state were changed.

Reference report: <https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-july-13-2026/>

This note follows the legal rule against reproducing ISW prose. ISW items below are
short event classifications and counts, not quotations or report text.

## Executive findings

1. **Pre-launch rescoring is legitimate process evaluation.** BNOW is still alpha and has
   no public-user historical record to preserve. The July 9–13 X recovery rescore is best
   understood as recalculating an experimental baseline after repairing a known input gap.
   At public launch, this policy should change: preserve the as-published score, put later
   retrospective scores in a separate series, and visibly mark material system/data epochs.
2. **The current headline score is not cutoff-aligned or publication-aligned.** It compares
   the latest finalized, last-writer-wins digest with the same-dated ISW report whenever the
   validation job happens to run. July 13's report declared an **11:45 AM ET cutoff** and its
   metadata says **7:30 PM ET publication**. BNOW's original final digests landed about
   **10:07–10:10 PM ET**, the X-recovery regenerations about **11:06–11:08 PM ET**, and the
   latest validation job at **3:01 AM ET on July 14**.
3. **Scoring uses only ISW's top-line `Key Takeaways` list.** It does not score the whole
   report, operational-area sections, maps, body claims, or endnotes. July 13 had five
   takeaways, so each match is 20 percentage points.
4. **July 13's low score is primarily a digest-selection failure, not an ingestion failure.**
   A manual audit found the combined current RU+UA mapped corpus contained core-event evidence
   for all five ISW takeaways; the important evidence was already in hand before ISW's cutoff.
   The final RU digest retained one match (20%); the final UA digest retained none (0%).
5. **The RU and UA rows both use the same five-item denominator.** The theater classifier
   filtered out zero takeaways on July 13. Four bullets had no recognized toponym and defaulted
   to `both`; the Crimea bullet is explicitly `both`. This duplicates one whole-war benchmark
   into two country scores even though relevant evidence is split across the RU and UA corpora.
6. **Restoring X does not make scores monotonic.** Regeneration replaces the old digest with a
   fresh K=5 synthesis over a changed candidate pool. Across the 12 previously scored July 9–12
   cells, six decreased, three increased, and three were unchanged; mean coverage moved
   42.3%→33.9%. The old claim text is gone, so exact before/after attribution is impossible.

## What the application scores today

The path is `src/lib/validation/run.ts` → `llm-match.ts` → `score.ts`.

1. Select the date-D **military** digest for one country (`ru`, `ua`, or `ir`). Other tracks
   do not enter validation.
2. Select the same-date reference report. Both RU and UA use the same ROCA report.
3. Parse only the list following the report's `Key Takeaways` heading. Raw takeaway text is
   used transiently for matching; only signatures and match verdicts persist.
4. Attempt per-theater filtering from the derived toponyms. `both` items remain in both RU and
   UA denominators. No July 13 item was filtered from either side.
5. Compare every retained takeaway with the **latest final-digest claims**, not `doc_claims`, raw
   documents, or every event the system observed.
6. With the live configuration, run five independent `gpt-4o-mini` match votes. A takeaway
   matches only if at least three votes select the same claim id at confidence ≥0.6. A `null`
   majority is a miss. The same BNOW claim is not prohibited from matching two overlapping
   ISW takeaways.
7. Upsert one `validation_runs` row per `(digest, report)`. Revalidation overwrites the prior
   metrics and divergences for that pair.

### Exact metric definitions

| Displayed concept | Actual formula | Important limitation |
|---|---|---|
| Coverage | matched ISW key takeaways / retained ISW key takeaways | Five July 13 bullets means 0/20/40/60/80/100 only. It is not whole-report coverage. |
| Agreement | one takeaway with a winning claim id | A semantic equivalence verdict, not an endorsement of every detail. |
| ISW only | takeaway with no winning final-digest claim | Can be a synthesis miss even when raw/map evidence exists. |
| Ours only | final-digest claim not used by any winning match | Not a contradiction. Confirmed/assessed items are presented as potential leads; other hedges as BNOW-only reported items. |
| “Unsupported” / thin-sourced rate | final claims with fewer than two source documents **and** hedge `claimed` or `unverified`, divided by all final claims | The database guarantees at least one source. A one-source `confirmed`, `assessed`, or `unknown` claim is not counted. “Thin-sourced” is the honest name. |
| Information lead | median of ISW publication time minus earliest supporting document `published_at` (fallback `fetched_at`) for matched pairs | Source-declared publication can predate BNOW ingestion, so this can overstate operational lead. |
| “At ISW publish” | final-matched takeaways whose winning claim has at least one supporting document fetched by ISW publication, divided by the same takeaway denominator | Evidence-availability proxy only. It does not prove the claim existed in an actual BNOW digest at that time. |

The current “at ISW publish” number is conservative about missing fetch timestamps, but it is
**not a mathematical lower bound on historical digest coverage**. Without digest snapshots it
can overstate the actual historical digest (evidence existed but BNOW had not selected it) or
understate a counterfactual one. It should be labeled as a proxy until snapshots exist.

## Which clock should govern the comparison?

The time when the matcher executes is not the core issue. The decisive question is **which
frozen BNOW state it scores**.

| July 13 event | ET | Meaning |
|---|---:|---|
| ISW stated data cutoff | 11:45 AM, Jul 13 | End of the report's declared evidence window. This varies by report and must be parsed, not assumed to be 11:30. |
| BNOW last scheduled intraday cut | 3:30 PM, Jul 13 | Current closest stored-row overwrite before ISW publication; no snapshot remains after later regenerations. |
| ISW `datePublished` | 7:30 PM, Jul 13 | Actual public release for this report; not 6 PM on this date. |
| BNOW original finalize | ~10:07–10:10 PM, Jul 13 | Canonical UTC-day digest before X-recovery regeneration. |
| BNOW X-recovery regeneration | ~11:06–11:08 PM, Jul 13 | Current RU/UA claim set. |
| X-recovery validation | ~11:11 PM, Jul 13 | First July 13 score. |
| Scheduled validation overwrite | ~3:01 AM, Jul 14 | Current stored run timestamp. |

Recommendation:

- **Primary benchmark: operational coverage at ISW's declared cutoff.** Freeze the newest BNOW
  snapshot at or before the cutoff parsed from that report. This is the fairest process-quality
  comparison because both systems have the same evidence deadline.
- **Secondary competitive benchmark: operational coverage at ISW publication.** Freeze the
  newest BNOW snapshot at or before actual `datePublished`. This answers “what could a BNOW user
  read when ISW became public?” It should use 7:30 PM for July 13, not a fixed 6 PM assumption.
- **Process-improvement benchmark: D+1 finalized coverage.** Keep the 10 PM/final score, but label
  it “finalized” or “retrospective,” not as the apples-to-apples headline.

The matcher may run after publication or at 3 AM; that is harmless if its inputs are immutable
snapshots from the relevant instants. Running at 6 PM would not solve the problem and, on July
13, would precede the report's publication.

## July 13 stored result

| Theater | Final coverage | Evidence-at-publish proxy | Matches | ISW-only | BNOW-only | Thin-sourced | Lead |
|---|---:|---:|---:|---:|---:|---:|---:|
| RU | 20% | 20% | 1 | 4 | 5 | 0% | +17.0h |
| UA | 0% | 0% | 0 | 5 | 5 | 0% | — |

The five RU match-vote rows were unanimous: four 5×`null` outcomes and one 5×claim 4761.
All five UA rows were unanimous 5×`null`. This particular low result is not a split-vote edge
case in the validation matcher.

## Claim-by-claim deep dive

The “mapped evidence” column audits current-version military `doc_claims` plus supporting raw
documents. Counts for the Crimea row are a deliberately broad candidate filter, not asserted
semantic matches. Times use `fetched_at`, i.e. when BNOW actually had the evidence.

| ISW top-line classification | RU final digest | UA final digest | What BNOW's mapped/raw corpus had | Diagnosis |
|---|---|---|---|---|
| Crimea logistics/transport-denial campaign | No match | No match; two vessel-strike claims are related but narrower | 37 RU and 7 UA Crimea+logistics/fuel/transport/strike candidate claims; 29 RU and 5 UA were in hand by 11:45 AM. Included logistics-facility strikes, bridge/rail disruption, fuel pressure, and shipping effects. | Strong corpus recall, poor synthesis retention. The final claims did not express the campaign-level development. |
| Oleksandrivka counterattack: six settlements and 120 km² reported recovered | No match | No match | UA had a mapped six-settlement/25 km advance claim by 5:45 AM. Exact-direction X items reached the RU and UA corpora at about 4:22 PM, after cutoff but before publication. The core event was present; the 120 km² detail was not found in mapped/raw search. | Pre-cutoff UA evidence was dropped before publication. Map compression also lost the direction from one atomic claim. |
| Moldova drone incursion near Copanca | No match | No match | Exact Copanca raw evidence reached the RU corpus at 5:12 AM; the mapped claim generalized it to a Russian drone exploding in Moldova. Additional Moldova-drone items arrived before cutoff and publication. | Clear RU synthesis miss. The UA corpus did not carry the event. |
| Overnight Russian mass strike: three missiles and 134 drones | **Matched** | No match | Four exact RU mapped claims were in hand by 3:13 AM; the winning final claim cited five documents across Telegram and X. | RU success. UA's miss shows corpus-routing asymmetry: an attack on Ukraine survived only in the RU final digest. |
| Oleksandrivka advance | No match | No match | Same core six-settlement/advance evidence as the second item was present in UA before cutoff. | Synthesis miss. This also exposes denominator overlap: one sufficiently specific BNOW claim could legitimately match both ISW bullets. |

Manual funnel conclusion: using the union of RU+UA current-version mapped evidence, the core
event behind **5/5** July 13 takeaways was available before cutoff (not necessarily every ISW
detail). The final union of RU+UA digest claims earned only **1/5** under the production matcher.
The dominant loss occurred between mapped claims and the tiny final digest, not between source
ingestion and mapping.

## Why RU was 20%

The RU reducer compressed:

`713 documents → 1,723 mapped claims → 1,079 groups → 200 groups shown to synthesis → 6 final claims`

Only the overnight missile/drone attack survived as an ISW-equivalent claim. Two of the six
final claims concerned Iran/Hormuz rather than the Russia–Ukraine military benchmark, consuming
one third of the final claim budget. The other unmatched claims concerned missile-defense
coalitions and a Putin response statement. This is evidence of off-theater content leakage
through source-level routing plus aggressive synthesis, not an absence of Crimea, Moldova, or
Oleksandrivka evidence.

## Why UA was 0%

The UA reducer compressed:

`344 documents → 547 mapped claims → 396 groups → 200 groups shown to synthesis → 5 final claims`

Two of five final claims covered closely related strikes on Russian vessels, creating redundancy
inside an already tiny output. The remaining three covered an air-defense coalition, a proposed
fighter transfer, and a Kherson humanitarian-site strike. The pre-cutoff six-settlement claim
did not survive. The exact mass-strike evidence was concentrated in the RU corpus, so the UA row
was asked to match all five whole-war takeaways without receiving the best cross-corpus claim.

## What the X restoration did—and did not prove

The recovery correctly repaired the corpus, mapped it, regenerated 28/30 digest cells, and
revalidated 15/15 cells. The score decrease is not evidence that X made intelligence quality
worse. It demonstrates that today's publication function is not monotonic with corpus size.

For July 13's current final digests:

- RU claims cite 43 distinct documents, 19 from X (44%).
- UA claims cite 21 distinct documents, 8 from X (38%).
- Final coverage nevertheless remained one RU match and zero UA matches; the sole RU match also
  had pre-existing Telegram evidence.

Across the 12 July 9–12 cells with before and after scores:

| Outcome | Cells |
|---|---:|
| Coverage decreased | 6 |
| Coverage increased | 3 |
| Coverage unchanged | 3 |
| Mean | 42.3% → 33.9% |

Why this can happen:

1. Backfilled X items change clustering, rank order, and which 200 groups enter synthesis.
2. K=5 synthesis is more stable than K=3 but still generative; regenerated claim sets vary.
3. Persist replaces every old claim with fresh ids and text. Validation then scores a new digest,
   not “the old digest plus X.”
4. The overwrite guard blocks empty/thin results, not lower-benchmark-coverage results.
5. Validation itself is K=5 and auditable, but the earlier synthesis stage is still a source of
   outcome variance.

The exact six decreases cannot be forensically explained claim by claim because no old digest
snapshots exist: `digests` is last-writer-wins and regeneration deletes/reinserts claims. The
rescore artifact preserved old counts and scores, not old texts or match votes.

## Recommended public-launch record policy

### Before launch

- Continue rescoring after known data repairs and material method corrections.
- Label all existing history “alpha / experimental baseline.”
- Keep the run artifacts and methodology notes; do not imply these are immutable public records.
- Establish a clean launch epoch rather than treating alpha values as an unbroken public series.

### At and after launch

1. **Never overwrite the as-published validation record.** Preserve the digest snapshot, the
   source/document cutoff, the match votes, and the metric definition used at that time.
2. **Store retrospective rescoring separately.** Show “as published” by default and optionally
   “latest methodology” as a comparison, never as a silent replacement.
3. **Introduce validation epochs.** A major epoch records at least: effective instant, digest
   engine/prompt/version, map extractor version, reducer configuration, matcher/version/votes,
   source roster/input availability, and cutoff policy.
4. **Use visual change markers:**
   - vertical line: methodology or model epoch change;
   - shaded stripe: material data impairment/outage (for example the July X gap);
   - second vertical line or stripe edge: restoration/backfill complete;
   - dashed marker: retrospective rescore, which does not rewrite the original line.
5. **Annotate only material changes.** Engine flips, matcher changes, cutoff-policy changes,
   source-class outages/restorations, and major roster expansions qualify. Copy-only UI changes
   do not.

## Recommended quality gauge

A single ISW-coverage dial is too lossy, particularly with five-item daily denominators. The
product should keep ISW coverage prominent but present a small quality scorecard:

| Gauge | Question answered | Proposed headline |
|---|---|---|
| At-cutoff benchmark coverage | Did the published intelligence match ISW using the same evidence deadline? | Primary validation measure |
| At-publication benchmark coverage | What could a subscriber read when ISW published? | Speed/competitive measure |
| Finalized benchmark coverage | What did the daily process recover by D+1? | Process-improvement measure |
| Corpus recall → digest retention | Did BNOW ingest/map the event but fail to publish it? | Pipeline diagnosis; July 13 is the canonical example |
| Thin-sourced share | How much final output depends on one weakly qualified source? | Rename current “unsupported” display |
| Information lead using ingest time | When did BNOW actually possess evidence? | Replace/parallel source-publish lead |
| Cross-run stability | Does an unchanged input produce the same benchmark result? | Quality-control measure |
| Off-theater / redundancy rate | Did irrelevant or duplicate claims consume the small publication budget? | Synthesis-quality measure |

For ROCA specifically, evaluate one **combined RU+UA benchmark score over the union of the two
final claim sets**, then retain RU and UA attribution drilldowns. That better matches the
whole-war reference report and avoids presenting two full-denominator scores as independent
quality measures. This is a product recommendation, not an implemented change.

## Application work implied by this audit (not authorized or performed)

The following requires application coding and a forward migration; it must not be started
without explicit approval:

1. Persist immutable digest snapshots at every intraday/final write.
2. Parse and store each report's stated cutoff instant in addition to `datePublished`.
3. Preserve immutable validation runs with `operational_cutoff`, `operational_publish`,
   `finalized`, and `retrospective` kinds rather than upserting one row.
4. Store a validation-epoch/version record and render lines/stripes on the scoreboard.
5. Add corpus-recall-versus-digest-retention audit scoring.
6. Evaluate a combined RU+UA ROCA score and off-theater/redundancy diagnostics before changing
   the public denominator.

## Evidence used

- Production rows: digests 627/629; validation runs 306/307; ISW report row 2948.
- X recovery snapshots and result:
  `data/outbox/x-gap-rescore-2026-07-09_2026-07-13-2026-07-14T02-12-18-035Z/`
  (gitignored operator artifact).
- Current-version map rows: military extractor `gpt-4o-mini:d73cc83ed8df` only.
- Implementation: `src/lib/validation/{run,score,llm-match,at-publish}.ts`,
  `src/lib/analysis/digest-persist.ts`, `vercel.json`, and `docs/TIME-MODEL.md`.
