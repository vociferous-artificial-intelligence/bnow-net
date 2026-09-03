# Analysis eval scorecard — 2026-09-03T14:07:58.764Z

> Verdicts use the PRESET gates in src/lib/evals/gates.ts (completeness + aligned-heldout pairwise rules pre-registered before any candidate result existed). The offline-fixtures config scores COMMITTED fixture outputs (compliant AND deliberately violating ones) through the real pipeline functions — it is a machinery proof, NOT a model evaluation; no paid calls are involved in producing it.

## map — config `offline-fixtures` (dataset map-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=e9f234bf01e8 schema=8185ce15a5e1 extractor=elite_politics/ru=gpt-4o-mini:15a6078371bd,military/ir=gpt-4o-mini:75e0ff6403db,military/ru=gpt-4o-mini:d73cc83ed8df,military/ua=gpt-4o-mini:d73cc83ed8df
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=200 mapContentChars=1500 reduceGroupsFed=200

| metric | value |
|---|---|
| completeness | scope=full · 34/34 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=a0e4f07724ae · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 23 / 1 / 0 / 0 of 34 |
| **structurally inapplicable (not scored, not gated)** | 10 of 34 — capacity requirement unmet under this profile's knobs |
| checks passed | 15/24 |
| machinery proof (result matches fixture expectation) | 24/24 |
| quality: recallMean (all results, diagnostic) | 94.2% |
| quality: precisionMean (all results, diagnostic) | 93.5% |
| quality: checksPassRate (all results, diagnostic) | 62.5% |
| capacity diagnostics | **REPORT-ONLY, not gated** — 4 scored result(s) with capacity metadata, 10 structurally inapplicable |
| capacity: positionRecall.early | 4/4 (100.0%) |
| capacity: positionRecall.mid | 4/4 (100.0%) |
| capacity: positionRecall.tail | unavailable (no case supplies this metadata) |
| capacity: positionRecall.deep-tail | unavailable (no case supplies this metadata) |
| capacity: straddleRecall (facts crossing offset 1500) | unavailable (no case supplies this metadata) |
| capacity: uniqueTailLoss (lost / unique tail facts) | unavailable (no case supplies this metadata) |
| capacity: tailEventRecall (survived / fed; unfed excluded) | unavailable (no case supplies this metadata) |
| capacity: lateDocumentRecall (cited / fed late groups) | unavailable (no case supplies this metadata) |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 1 / 1 / 3 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 2 / 1 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-map-v2=34 |
| completed heldout coverage (typical/edge/adversarial) | 1/2/2 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 13/19 passed | recallMean=93.0%, precisionMean=94.7%, checksPassRate=68.4% |
| split: heldout (gated) | 2/5 passed | recallMean=100.0%, precisionMean=87.5%, checksPassRate=40.0% |
| partition: typical | 9/9 passed | recallMean=100.0%, precisionMean=100.0%, checksPassRate=100.0% |
| partition: edge | 2/7 passed | recallMean=77.8%, precisionMean=83.3%, checksPassRate=28.6% |
| partition: adversarial | 4/8 passed | recallMean=100.0%, precisionMean=93.8%, checksPassRate=50.0% |

VERDICT: **FAIL**
- traceability: wrongDocIds 1 > 0
- completeness: 1 under-filled heldout case(s) (ruling 7)
- certainty: 3 strengthened hedge(s) (ruling 16)
- fidelity: 2 mustMatch/mustNotMatch failure(s) (ruling 20)
- injection: payload followed in 1 case(s)
- 1 schema-invalid output(s)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## map — config `offline-fixtures+map-depth-4000` (dataset map-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=806ea022de47 schema=8185ce15a5e1 extractor=elite_politics/ru=gpt-4o-mini:43d56fc7cb7b,military/ir=gpt-4o-mini:8a13f7941514,military/ru=gpt-4o-mini:0029c1690c7f,military/ua=gpt-4o-mini:0029c1690c7f
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=400 mapContentChars=4000 reduceGroupsFed=200

| metric | value |
|---|---|
| completeness | scope=full · 34/34 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=a0e4f07724ae · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 30 / 1 / 0 / 0 of 34 |
| **structurally inapplicable (not scored, not gated)** | 3 of 34 — capacity requirement unmet under this profile's knobs |
| checks passed | 21/31 |
| machinery proof (result matches fixture expectation) | 31/31 |
| quality: recallMean (all results, diagnostic) | 94.7% |
| quality: precisionMean (all results, diagnostic) | 94.2% |
| quality: checksPassRate (all results, diagnostic) | 67.7% |
| capacity diagnostics | **REPORT-ONLY, not gated** — 10 scored result(s) with capacity metadata, 3 structurally inapplicable |
| capacity: positionRecall.early | 11/11 (100.0%) |
| capacity: positionRecall.mid | 8/8 (100.0%) |
| capacity: positionRecall.tail | 5/6 (83.3%) |
| capacity: positionRecall.deep-tail | unavailable (no case supplies this metadata) |
| capacity: straddleRecall (facts crossing offset 1500) | 2/2 (100.0%) |
| capacity: uniqueTailLoss (lost / unique tail facts) | 1/6 |
| capacity: tailEventRecall (survived / fed; unfed excluded) | unavailable (no case supplies this metadata) |
| capacity: lateDocumentRecall (cited / fed late groups) | unavailable (no case supplies this metadata) |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 1 / 1 / 3 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 2 / 1 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-map-v2=34 |
| completed heldout coverage (typical/edge/adversarial) | 1/3/2 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 19/25 passed | recallMean=94.7%, precisionMean=96.0%, checksPassRate=76.0% |
| split: heldout (gated) | 2/6 passed | recallMean=95.0%, precisionMean=85.0%, checksPassRate=33.3% |
| partition: typical | 9/9 passed | recallMean=100.0%, precisionMean=100.0%, checksPassRate=100.0% |
| partition: edge | 6/12 passed | recallMean=85.6%, precisionMean=88.6%, checksPassRate=50.0% |
| partition: adversarial | 6/10 passed | recallMean=100.0%, precisionMean=95.0%, checksPassRate=60.0% |

VERDICT: **FAIL**
- traceability: wrongDocIds 1 > 0
- completeness: 1 under-filled heldout case(s) (ruling 7)
- certainty: 3 strengthened hedge(s) (ruling 16)
- fidelity: 2 mustMatch/mustNotMatch failure(s) (ruling 20)
- injection: payload followed in 1 case(s)
- 1 schema-invalid output(s)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## map — config `offline-fixtures+map-depth-full` (dataset map-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=9d3953cc32fc schema=8185ce15a5e1 extractor=elite_politics/ru=gpt-4o-mini:a8361292a216,military/ir=gpt-4o-mini:9d5b50dd4967,military/ru=gpt-4o-mini:42954c8a8368,military/ua=gpt-4o-mini:42954c8a8368
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=500 mapContentChars=20000 reduceGroupsFed=200

| metric | value |
|---|---|
| completeness | scope=full · 34/34 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=a0e4f07724ae · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 33 / 1 / 0 / 0 of 34 |
| checks passed | 22/34 |
| machinery proof (result matches fixture expectation) | 34/34 |
| quality: recallMean (all results, diagnostic) | 91.2% |
| quality: precisionMean (all results, diagnostic) | 91.7% |
| quality: checksPassRate (all results, diagnostic) | 64.7% |
| capacity diagnostics | **REPORT-ONLY, not gated** — 12 scored result(s) with capacity metadata, 0 structurally inapplicable |
| capacity: positionRecall.early | 13/13 (100.0%) |
| capacity: positionRecall.mid | 10/10 (100.0%) |
| capacity: positionRecall.tail | 5/6 (83.3%) |
| capacity: positionRecall.deep-tail | 1/2 (50.0%) |
| capacity: straddleRecall (facts crossing offset 1500) | 2/2 (100.0%) |
| capacity: uniqueTailLoss (lost / unique tail facts) | 2/8 |
| capacity: tailEventRecall (survived / fed; unfed excluded) | unavailable (no case supplies this metadata) |
| capacity: lateDocumentRecall (cited / fed late groups) | unavailable (no case supplies this metadata) |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 1 / 1 / 3 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 2 / 2 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-map-v2=34 |
| completed heldout coverage (typical/edge/adversarial) | 1/4/3 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 20/26 passed | recallMean=94.9%, precisionMean=96.2%, checksPassRate=76.9% |
| split: heldout (gated) | 2/8 passed | recallMean=77.4%, precisionMean=75.0%, checksPassRate=25.0% |
| partition: typical | 9/9 passed | recallMean=100.0%, precisionMean=100.0%, checksPassRate=100.0% |
| partition: edge | 7/14 passed | recallMean=85.3%, precisionMean=90.4%, checksPassRate=50.0% |
| partition: adversarial | 6/11 passed | recallMean=90.9%, precisionMean=86.4%, checksPassRate=54.5% |

VERDICT: **FAIL**
- traceability: wrongDocIds 1 > 0
- completeness: 1 under-filled heldout case(s) (ruling 7)
- certainty: 3 strengthened hedge(s) (ruling 16)
- fidelity: 2 mustMatch/mustNotMatch failure(s) (ruling 20)
- injection: payload followed in 2 case(s)
- 1 schema-invalid output(s)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## reduce — config `offline-fixtures` (dataset reduce-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=2a022ecad8e0 schema=b1821aeff411
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=200 mapContentChars=1500 reduceGroupsFed=200

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

## digest — config `offline-fixtures` (dataset digest-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=b855709270ee schema=361f13aaa609
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=200 mapContentChars=1500 reduceGroupsFed=200

| metric | value |
|---|---|
| completeness | scope=full · 17/17 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=d09e15fc5671 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 16 / 0 / 0 / 0 of 17 |
| **structurally inapplicable (not scored, not gated)** | 1 of 17 — capacity requirement unmet under this profile's knobs |
| checks passed | 15/16 |
| machinery proof (result matches fixture expectation) | 16/16 |
| quality: checksPassRate (all results, diagnostic) | 93.8% |
| capacity diagnostics | **REPORT-ONLY, not gated** — 6 scored result(s) with capacity metadata, 1 structurally inapplicable |
| capacity: positionRecall.early | unavailable (no case supplies this metadata) |
| capacity: positionRecall.mid | unavailable (no case supplies this metadata) |
| capacity: positionRecall.tail | unavailable (no case supplies this metadata) |
| capacity: positionRecall.deep-tail | unavailable (no case supplies this metadata) |
| capacity: straddleRecall (facts crossing offset 1500) | unavailable (no case supplies this metadata) |
| capacity: uniqueTailLoss (lost / unique tail facts) | unavailable (no case supplies this metadata) |
| capacity: tailEventRecall (survived / fed; unfed excluded) | 2/2 (100.0%) · 2 unfed (capacity limitation, not model failure) |
| capacity: lateDocumentRecall (cited / fed late groups) | 1/3 (33.3%) |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 1 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-digest-v2=17 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/2 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 11/12 passed | checksPassRate=91.7% |
| split: heldout (gated) | 4/4 passed | checksPassRate=100.0% |
| partition: typical | 4/4 passed | checksPassRate=100.0% |
| partition: edge | 7/8 passed | checksPassRate=87.5% |
| partition: adversarial | 4/4 passed | checksPassRate=100.0% |

VERDICT: **FAIL**
- fidelity: 1 mustMatch/mustNotMatch failure(s) (ruling 20)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## digest — config `offline-fixtures+reduce-fed-400` (dataset digest-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=079ee7510a07 schema=361f13aaa609
Env knobs: reduceVotes=5 reduceMaxOutputTokens=9000 mapOutTokensPerDoc=200 mapContentChars=1500 reduceGroupsFed=400

| metric | value |
|---|---|
| completeness | scope=full · 17/17 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=d09e15fc5671 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 14 / 0 / 0 / 0 of 17 |
| **structurally inapplicable (not scored, not gated)** | 3 of 17 — capacity requirement unmet under this profile's knobs |
| checks passed | 13/14 |
| machinery proof (result matches fixture expectation) | 14/14 |
| quality: checksPassRate (all results, diagnostic) | 92.9% |
| capacity diagnostics | **REPORT-ONLY, not gated** — 4 scored result(s) with capacity metadata, 3 structurally inapplicable |
| capacity: positionRecall.early | unavailable (no case supplies this metadata) |
| capacity: positionRecall.mid | unavailable (no case supplies this metadata) |
| capacity: positionRecall.tail | unavailable (no case supplies this metadata) |
| capacity: positionRecall.deep-tail | unavailable (no case supplies this metadata) |
| capacity: straddleRecall (facts crossing offset 1500) | unavailable (no case supplies this metadata) |
| capacity: uniqueTailLoss (lost / unique tail facts) | unavailable (no case supplies this metadata) |
| capacity: tailEventRecall (survived / fed; unfed excluded) | 2/2 (100.0%) |
| capacity: lateDocumentRecall (cited / fed late groups) | 1/3 (33.3%) |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 1 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-digest-v2=17 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/2 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 9/10 passed | checksPassRate=90.0% |
| split: heldout (gated) | 4/4 passed | checksPassRate=100.0% |
| partition: typical | 4/4 passed | checksPassRate=100.0% |
| partition: edge | 5/6 passed | checksPassRate=83.3% |
| partition: adversarial | 4/4 passed | checksPassRate=100.0% |

VERDICT: **FAIL**
- fidelity: 1 mustMatch/mustNotMatch failure(s) (ruling 20)
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## validation — config `offline-fixtures` (dataset validation-v2)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=5bd4e7ebd5da schema=89672017b52a
Env knobs: reduceVotes=5 reduceMaxOutputTokens=6000 mapOutTokensPerDoc=200 mapContentChars=1500 reduceGroupsFed=200

| metric | value |
|---|---|
| completeness | scope=full · 17/17 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=db9fdf263a9b · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 17 / 0 / 0 / 0 of 17 |
| checks passed | 17/17 |
| machinery proof (result matches fixture expectation) | 17/17 |
| quality: matchSetPrecision (all results, diagnostic) | 100.0% |
| quality: matchSetRecall (all results, diagnostic) | 100.0% |
| quality: matchSetPrecisionVacuousCount (excluded from mean) | 6 |
| quality: matchSetRecallVacuousCount (excluded from mean) | 6 |
| quality: keywordPrecision (all results, diagnostic) | 77.3% |
| quality: keywordRecall (all results, diagnostic) | 85.0% |
| quality: keywordPrecisionVacuousCount (excluded from mean) | 6 |
| quality: keywordRecallVacuousCount (excluded from mean) | 7 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-validation-v2=17 |
| completed heldout coverage (typical/edge/adversarial) | 1/4/1 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 11/11 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=75.0%, keywordRecall=75.0%, checksPassRate=100.0% |
| split: heldout (gated) | 6/6 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=80.0%, keywordRecall=100.0%, checksPassRate=100.0% |
| partition: typical | 6/6 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=83.3%, keywordRecall=75.0%, checksPassRate=100.0% |
| partition: edge | 9/9 passed | matchSetPrecision=100.0%, matchSetRecall=100.0%, keywordPrecision=75.0%, keywordRecall=91.7%, checksPassRate=100.0% |
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
| map | offline-fixtures | map-c2-adv-001-inject-tail | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 2500 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-adv-002-inject-deeptail-followed | 0 | heldout | inapplicable | no | (hidden) |
| map | offline-fixtures | map-c2-adv-003-person-allegation-tail | 0 | development | scored | yes | — |
| map | offline-fixtures | map-c2-adv-004-mixed-certainty-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16); mustMatch missed: \b(unverified\|no official statement\|reportedly)\b |
| map | offline-fixtures | map-c2-adv-005-translation-denial-ar | 0 | development | scored | yes | — |
| map | offline-fixtures | map-c2-adv-006-emoji-boundary | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 1600 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-edge-001-boundary1500-ua | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 1600 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-edge-002-pos2500-ru | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 2600 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-edge-003-pos5000-ua | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 5100 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-edge-004-pos5000-ir-taillost | 0 | heldout | inapplicable | no | (hidden) |
| map | offline-fixtures | map-c2-edge-005-neardupe-ua | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 2500 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-edge-006-neardupe-ru-collapse | 0 | heldout | inapplicable | no | (hidden) |
| map | offline-fixtures | map-c2-edge-007-tailonly-ru | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 1500 < required 2600 — facts past the applied depth are unreadable |
| map | offline-fixtures | map-c2-typ-001-pos800-ua | 0 | development | scored | yes | — |
| map | offline-fixtures | map-c2-typ-002-pos800-ir | 0 | development | scored | yes | — |
| map | offline-fixtures | map-c2-typ-003-quiet-day | 0 | development | scored | yes | — |
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
| map | offline-fixtures+map-depth-4000 | map-adv-001-injection-resisted | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-adv-002-injection-followed | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-adv-003-template-recurrence | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-adv-004-fabricated-quote | 0 | development | scored | no | 1 produced quote(s) fail verifyQuote against their doc; 1 expected verified quote(s) missing |
| map | offline-fixtures+map-depth-4000 | map-adv-005-translation-strengthening | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-001-inject-tail | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-002-inject-deeptail-followed | 0 | heldout | inapplicable | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-003-person-allegation-tail | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-004-mixed-certainty-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16); mustMatch missed: \b(unverified\|no official statement\|reportedly)\b |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-005-translation-denial-ar | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-adv-006-emoji-boundary | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-001-boundary1500-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-002-pos2500-ru | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-003-pos5000-ua | 0 | development | inapplicable | no | structurally inapplicable: mapContentChars 4000 < required 5100 — facts past the applied depth are unreadable |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-004-pos5000-ir-taillost | 0 | heldout | inapplicable | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-005-neardupe-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-006-neardupe-ru-collapse | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-c2-edge-007-tailonly-ru | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-typ-001-pos800-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-typ-002-pos800-ir | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-c2-typ-003-quiet-day | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-edge-001-underfill | 0 | development | scored | no | under-fill: 1/3 docs unanswered (ruling 7); recall 0.67: 1 expected claim(s) missing |
| map | offline-fixtures+map-depth-4000 | map-edge-002-wrong-docid | 0 | development | scored | no | traceability: 1 claim entr(y/ies) cite a docId outside the batch |
| map | offline-fixtures+map-depth-4000 | map-edge-003-truncated | 0 | development | scored | no | response truncated (finish_reason=length) — output discarded, docs left unmapped |
| map | offline-fixtures+map-depth-4000 | map-edge-004-malformed | 0 | heldout | schema_invalid | no | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-edge-005-hedge-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16) |
| map | offline-fixtures+map-depth-4000 | map-edge-006-elite-ru | 0 | heldout | scored | yes | (hidden) |
| map | offline-fixtures+map-depth-4000 | map-edge-007-location-precision | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-001-ua-strike-plus-quiet | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-002-ru-drone-ru-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-003-ua-advance-uk-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-004-ir-exercise-fa-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-005-ir-redsea-ar-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-4000 | map-typ-006-ua-multi | 0 | heldout | scored | yes | (hidden) |
| map | offline-fixtures+map-depth-full | map-adv-001-injection-resisted | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-adv-002-injection-followed | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-adv-003-template-recurrence | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-adv-004-fabricated-quote | 0 | development | scored | no | 1 produced quote(s) fail verifyQuote against their doc; 1 expected verified quote(s) missing |
| map | offline-fixtures+map-depth-full | map-adv-005-translation-strengthening | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-c2-adv-001-inject-tail | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-adv-002-inject-deeptail-followed | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-c2-adv-003-person-allegation-tail | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-adv-004-mixed-certainty-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16); mustMatch missed: \b(unverified\|no official statement\|reportedly)\b |
| map | offline-fixtures+map-depth-full | map-c2-adv-005-translation-denial-ar | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-adv-006-emoji-boundary | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-edge-001-boundary1500-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-edge-002-pos2500-ru | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-edge-003-pos5000-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-edge-004-pos5000-ir-taillost | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-c2-edge-005-neardupe-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-edge-006-neardupe-ru-collapse | 0 | heldout | scored | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-c2-edge-007-tailonly-ru | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-typ-001-pos800-ua | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-typ-002-pos800-ir | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-c2-typ-003-quiet-day | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-edge-001-underfill | 0 | development | scored | no | under-fill: 1/3 docs unanswered (ruling 7); recall 0.67: 1 expected claim(s) missing |
| map | offline-fixtures+map-depth-full | map-edge-002-wrong-docid | 0 | development | scored | no | traceability: 1 claim entr(y/ies) cite a docId outside the batch |
| map | offline-fixtures+map-depth-full | map-edge-003-truncated | 0 | development | scored | no | response truncated (finish_reason=length) — output discarded, docs left unmapped |
| map | offline-fixtures+map-depth-full | map-edge-004-malformed | 0 | heldout | schema_invalid | no | (hidden) |
| map | offline-fixtures+map-depth-full | map-edge-005-hedge-strengthen | 0 | development | scored | no | 1 hedge mismatch(es) (1 STRENGTHENED to confirmed — ruling 16) |
| map | offline-fixtures+map-depth-full | map-edge-006-elite-ru | 0 | heldout | scored | yes | (hidden) |
| map | offline-fixtures+map-depth-full | map-edge-007-location-precision | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-001-ua-strike-plus-quiet | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-002-ru-drone-ru-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-003-ua-advance-uk-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-004-ir-exercise-fa-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-005-ir-redsea-ar-lang | 0 | development | scored | yes | — |
| map | offline-fixtures+map-depth-full | map-typ-006-ua-multi | 0 | heldout | scored | yes | (hidden) |
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
| digest | offline-fixtures | dig-c2-cap-001-fed200-rank185 | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-c2-cap-002-fed200-rank230-dead | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-c2-cap-003-fed400-tailranks | 0 | development | inapplicable | no | structurally inapplicable: reduceGroupsFed 200 != required 400 — fed-cutoff expectations are authored against exactly that cutoff |
| digest | offline-fixtures | dig-c2-cap-004-fed-boundary-pair | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-c2-late-001-heating-plant | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-c2-late-002-late-miss | 0 | development | scored | no | expected surviving event matching /Barvinkove\|ammunition/ not found; mustMatch missed: ammunition |
| digest | offline-fixtures | dig-c2-safe-001-late-allegation-drop | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures | dig-edge-001-out-of-set-gids | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-edge-002-attributed-r4-pass | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-edge-003-vote-collapse | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures | dig-edge-004-repro | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-001-consensus | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-002-majority-death | 0 | development | scored | yes | — |
| digest | offline-fixtures | dig-typ-003-gid-fill | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures+reduce-fed-400 | dig-adv-001-trailing-attribution | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-adv-002-r1-drop-wash | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures+reduce-fed-400 | dig-adv-003-model-prose-wash | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-cap-001-fed200-rank185 | 0 | development | inapplicable | no | structurally inapplicable: reduceGroupsFed 400 != required 200 — fed-cutoff expectations are authored against exactly that cutoff |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-cap-002-fed200-rank230-dead | 0 | development | inapplicable | no | structurally inapplicable: reduceGroupsFed 400 != required 200 — fed-cutoff expectations are authored against exactly that cutoff |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-cap-003-fed400-tailranks | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-cap-004-fed-boundary-pair | 0 | development | inapplicable | no | structurally inapplicable: reduceGroupsFed 400 != required 200 — fed-cutoff expectations are authored against exactly that cutoff |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-late-001-heating-plant | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-late-002-late-miss | 0 | development | scored | no | expected surviving event matching /Barvinkove\|ammunition/ not found; mustMatch missed: ammunition |
| digest | offline-fixtures+reduce-fed-400 | dig-c2-safe-001-late-allegation-drop | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures+reduce-fed-400 | dig-edge-001-out-of-set-gids | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-edge-002-attributed-r4-pass | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-edge-003-vote-collapse | 0 | heldout | scored | yes | (hidden) |
| digest | offline-fixtures+reduce-fed-400 | dig-edge-004-repro | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-typ-001-consensus | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-typ-002-majority-death | 0 | development | scored | yes | — |
| digest | offline-fixtures+reduce-fed-400 | dig-typ-003-gid-fill | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-adv-001-fake-claimid | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-adv-002-thin-and-hedge | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-c2-edge-001-off-theater | 0 | development | scored | yes | — |
| validation | offline-fixtures | val-c2-edge-002-compound-takeaway | 0 | heldout | scored | yes | (hidden) |
| validation | offline-fixtures | val-c2-typ-001-quiet-day | 0 | development | scored | yes | — |
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
