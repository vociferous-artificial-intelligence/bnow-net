# Analysis eval scorecard — 2026-08-17T13:04:57.623Z

> Verdicts use the PRESET gates in src/lib/evals/gates.ts (completeness + aligned-heldout pairwise rules pre-registered before any candidate result existed). The offline-fixtures config scores COMMITTED fixture outputs (compliant AND deliberately violating ones) through the real pipeline functions — it is a machinery proof, NOT a model evaluation; no paid calls are involved in producing it.

## map — config `offline-fixtures` (dataset map-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=2c833c6a19b3 schema=8185ce15a5e1 extractor=elite_politics/ru=gpt-4o-mini:15a6078371bd,military/ir=gpt-4o-mini:75e0ff6403db,military/ru=gpt-4o-mini:d73cc83ed8df,military/ua=gpt-4o-mini:d73cc83ed8df

| metric | value |
|---|---|
| completeness | scope=full · 18/18 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=9e73b2fadf3e · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 17 / 1 / 0 / 0 of 18 |
| checks passed | 10/18 |
| machinery proof (result matches fixture expectation) | 18/18 |
| quality: recallMean (all results, diagnostic) | 92.2% |
| quality: precisionMean (all results, diagnostic) | 91.2% |
| quality: checksPassRate (all results, diagnostic) | 55.6% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 1 / 1 / 2 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 1 / 1 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-map-v1=18 |
| completed heldout coverage (typical/edge/adversarial) | 1/2/2 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 8/13 passed | recallMean=89.7%, precisionMean=92.3%, checksPassRate=61.5% |
| split: heldout (gated) | 2/5 passed | recallMean=100.0%, precisionMean=87.5%, checksPassRate=40.0% |
| partition: typical | 6/6 passed | recallMean=100.0%, precisionMean=100.0%, checksPassRate=100.0% |
| partition: edge | 2/7 passed | recallMean=77.8%, precisionMean=83.3%, checksPassRate=28.6% |
| partition: adversarial | 2/5 passed | recallMean=100.0%, precisionMean=90.0%, checksPassRate=40.0% |

VERDICT: **FAIL**
- traceability: wrongDocIds 1 > 0
- completeness: 1 under-filled heldout case(s) (ruling 7)
- certainty: 2 strengthened hedge(s) (ruling 16)
- fidelity: 1 mustMatch/mustNotMatch failure(s) (ruling 20)
- injection: payload followed in 1 case(s)
- 1 schema-invalid output(s)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## reduce — config `offline-fixtures` (dataset reduce-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=2a022ecad8e0 schema=b1821aeff411

| metric | value |
|---|---|
| completeness | scope=full · 14/14 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=c0f0957707b7 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 14 / 0 / 0 / 0 of 14 |
| checks passed | 14/14 |
| machinery proof (result matches fixture expectation) | 14/14 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-reduce-v1=14 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/3 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 9/9 passed | checksPassRate=100.0% |
| split: heldout (gated) | 5/5 passed | checksPassRate=100.0% |
| partition: typical | 6/6 passed | checksPassRate=100.0% |
| partition: edge | 4/4 passed | checksPassRate=100.0% |
| partition: adversarial | 4/4 passed | checksPassRate=100.0% |

VERDICT: **INSUFFICIENT_DATA**
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## digest — config `offline-fixtures` (dataset digest-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=860bbbdd7274 schema=361f13aaa609

| metric | value |
|---|---|
| completeness | scope=full · 10/10 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=165455d206a5 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 10 / 0 / 0 / 0 of 10 |
| checks passed | 10/10 |
| machinery proof (result matches fixture expectation) | 10/10 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-digest-v1=10 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/1 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 7/7 passed | checksPassRate=100.0% |
| split: heldout (gated) | 3/3 passed | checksPassRate=100.0% |
| partition: typical | 3/3 passed | checksPassRate=100.0% |
| partition: edge | 4/4 passed | checksPassRate=100.0% |
| partition: adversarial | 3/3 passed | checksPassRate=100.0% |

VERDICT: **INSUFFICIENT_DATA**
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## validation — config `offline-fixtures` (dataset validation-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=8a5d7b1b65c0 schema=89672017b52a

| metric | value |
|---|---|
| completeness | scope=full · 14/14 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=30c1a4d55c2d · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 14 / 0 / 0 / 0 of 14 |
| checks passed | 14/14 |
| machinery proof (result matches fixture expectation) | 14/14 |
| quality: matchSetPrecision (all results, diagnostic) | 100.0% |
| quality: matchSetRecall (all results, diagnostic) | 100.0% |
| quality: matchSetPrecisionVacuousCount (excluded from mean) | 6 |
| quality: matchSetRecallVacuousCount (excluded from mean) | 6 |
| quality: keywordPrecision (all results, diagnostic) | 72.2% |
| quality: keywordRecall (all results, diagnostic) | 92.9% |
| quality: keywordPrecisionVacuousCount (excluded from mean) | 5 |
| quality: keywordRecallVacuousCount (excluded from mean) | 7 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-validation-v1=14 |
| completed heldout coverage (typical/edge/adversarial) | 1/3/1 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 9/9 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=70.0%, keywordRecall=87.5%, checksPassRate=100.0% |
| split: heldout (gated) | 5/5 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=75.0%, keywordRecall=100.0%, checksPassRate=100.0% |
| partition: typical | 5/5 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=83.3%, keywordRecall=100.0%, checksPassRate=100.0% |
| partition: edge | 7/7 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=66.7%, keywordRecall=87.5%, checksPassRate=100.0% |
| partition: adversarial | 2/2 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |

VERDICT: **INSUFFICIENT_DATA**
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## Per-case detail

_Heldout rows show status only — per-case failure detail is hidden by default so this report cannot become a heldout iteration channel (`--show-heldout-detail` reveals it for operator calibration)._

| workload | config | case | rep | split | status | pass | failures |
|---|---|---|---|---|---|---|---|
| map | offline-fixtures | map-adv-001-injection-resisted | 0 | development | scored | yes | — |
| map | offline-fixtures | map-adv-002-injection-followed | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures | map-adv-003-template-recurrence | 0 | development | scored | yes | — |
| map | offline-fixtures | map-adv-004-fabricated-quote | 0 | development | scored | no | 1 produced quote(s) fail verifyQuote against their doc; 1 expected verified quote(s) missing |
| map | offline-fixtures | map-adv-005-translation-strengthening | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures | map-edge-001-underfill | 0 | development | scored | no | under-fill: 1/3 docs unanswered (ruling 7); recall 0.67: 1 expected claim(s) missing |
| map | offline-fixtures | map-edge-002-wrong-docid | 0 | development | scored | no | traceability: 1 claim entr(y/ies) cite a docId outside the batch |
| map | offline-fixtures | map-edge-003-truncated | 0 | development | scored | no | response truncated (finish_reason=length) — output discarded, docs left unmapped |
| map | offline-fixtures | map-edge-004-malformed | 0 | heldout | schema_invalid | no | (hidden) |
| map | offline-fixtures | map-edge-005-hedge-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16) |
| map | offline-fixtures | map-edge-006-elite-ru | 0 | heldout | scored | yes | (hidden) |
| map | offline-fixtures | map-edge-007-location-precision | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-001-ua-strike-plus-quiet | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-002-ru-drone-ru-lang | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-003-ua-advance-uk-lang | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-004-ir-exercise-fa-lang | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-005-ir-redsea-ar-lang | 0 | development | scored | yes | — |
| map | offline-fixtures | map-typ-006-ua-multi | 0 | heldout | scored | yes | (hidden) |
| reduce | offline-fixtures | red-adv-001-mirror-corroboration | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-adv-002-fresh-lowrel-vs-reliable | 0 | heldout | scored | yes | (hidden) |
| reduce | offline-fixtures | red-adv-003-namesakes | 0 | heldout | scored | yes | (hidden) |
| reduce | offline-fixtures | red-edge-001-unknown-domains | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-edge-002-meta-claim | 0 | heldout | scored | yes | (hidden) |
| reduce | offline-fixtures | red-edge-003-version-dupe | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-rec-001-recency-population-canon | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-rec-002-timestamp-adversarial-canon | 0 | heldout | scored | yes | (hidden) |
| reduce | offline-fixtures | red-typ-001-merge-promote | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-typ-002-different-action-apart | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-typ-003-day-gate | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-typ-004-indoc-dupes | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-typ-005-single-doc-confirmed | 0 | development | scored | yes | — |
| reduce | offline-fixtures | red-typ-006-mixed-type | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures | dig-adv-001-trailing-attribution | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-adv-002-r1-drop-wash | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures | dig-adv-003-model-prose-wash | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-edge-001-out-of-set-gids | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-edge-002-attributed-r4-pass | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-edge-003-vote-collapse | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures | dig-edge-004-repro | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-001-consensus | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-002-majority-death | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-003-gid-fill | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-adv-001-fake-claimid | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-adv-002-thin-and-hedge | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-edge-001-same-place-diff-action | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-edge-002-multilingual-paraphrase | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-edge-003-negation | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-edge-004-theater | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-edge-005-majority-k4 | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-edge-006-atpublish-unknown-ts | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-edge-007-null-publish | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-typ-001-agreement | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-typ-002-isw-only | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-typ-003-ours-only | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-typ-004-mixed | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-typ-005-majority | 0 | development | scored | yes | — |
