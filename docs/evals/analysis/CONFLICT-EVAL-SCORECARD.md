# Analysis eval scorecard — 2026-08-18T02:18:39.276Z

> CONFLICT PROFILE (validation workload, register #3): offline-fixtures results score the FROZEN conflict fixture corpus through the real conflict pipeline and byte-compare against the committed goldens — a machinery/drift proof, NOT a model evaluation; no paid calls are involved. Verdicts use the inherited preset gates; with no live baseline they read insufficient_data by construction.

## validation — config `offline-fixtures` (dataset conflict-roca-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=680af57d0cfb schema=89672017b52a

| metric | value |
|---|---|
| completeness | scope=full · 8/8 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=427b71033bb9 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 8 / 0 / 0 / 0 of 8 |
| checks passed | 8/8 |
| machinery proof (result matches fixture expectation) | 8/8 |
| quality: matchSetPrecision (all results, diagnostic) | — |
| quality: matchSetRecall (all results, diagnostic) | — |
| quality: matchSetPrecisionVacuousCount (excluded from mean) | 0 |
| quality: matchSetRecallVacuousCount (excluded from mean) | 0 |
| quality: keywordPrecision (all results, diagnostic) | — |
| quality: keywordRecall (all results, diagnostic) | — |
| quality: keywordPrecisionVacuousCount (excluded from mean) | 0 |
| quality: keywordRecallVacuousCount (excluded from mean) | 0 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-conflict-roca-v1=8 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/1 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 5/5 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| split: heldout (gated) | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: typical | 2/2 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: edge | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: adversarial | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |

VERDICT: **INSUFFICIENT_DATA**
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## validation — config `offline-fixtures` (dataset conflict-iran-v1)

Identity: provider=stub model=offline-fixtures effort=absent approval=baseline registry=analysis-reg-v1 promptHash=26ef185ece61 schema=89672017b52a

| metric | value |
|---|---|
| completeness | scope=full · 6/6 results present (0 missing, 0 heldout missing) · reps=1 · datasetHash=109fcfff6e69 · COMPLETE |
| cases (scored / schema-invalid / provider-error / skipped) | 6 / 0 / 0 / 0 of 6 |
| checks passed | 6/6 |
| machinery proof (result matches fixture expectation) | 6/6 |
| quality: matchSetPrecision (all results, diagnostic) | — |
| quality: matchSetRecall (all results, diagnostic) | — |
| quality: matchSetPrecisionVacuousCount (excluded from mean) | 0 |
| quality: matchSetRecallVacuousCount (excluded from mean) | 0 |
| quality: keywordPrecision (all results, diagnostic) | — |
| quality: keywordRecall (all results, diagnostic) | — |
| quality: keywordPrecisionVacuousCount (excluded from mean) | 0 |
| quality: keywordRecallVacuousCount (excluded from mean) | 0 |
| quality: checksPassRate (all results, diagnostic) | 100.0% |
| gate: wrongDocIds / heldout under-fill / strengthened hedges | 0 / 0 / 0 |
| gate: guard fails / fidelity fails / injection follows / repro fails | 0 / 0 / 0 / 0 |
| resources: latency mean / prompt tok / completion tok / est USD | — / 0 / 0 / $0.0000 |
| metering (attempts / reservations / meterings / errored) | 0 / 0 / 0 / 0 |
| run provenance | 1 run id(s): offline-conflict-iran-v1=6 |
| completed heldout coverage (typical/edge/adversarial) | 1/1/1 |

| slice | checks | quality |
|---|---|---|
| split: development (diagnostic) | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| split: heldout (gated) | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: typical | 2/2 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: edge | 3/3 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |
| partition: adversarial | 1/1 passed | matchSetPrecision=—, matchSetRecall=—, keywordPrecision=—, keywordRecall=—, checksPassRate=100.0% |

VERDICT: **INSUFFICIENT_DATA**
- no baseline aggregate supplied — pairwise quality gate not run (candidate-only numbers are never a pass)

## Per-case detail

_Heldout rows show status only — per-case failure detail is hidden by default so this report cannot become a heldout iteration channel (`--show-heldout-detail` reveals it for operator calibration)._

| workload | config | case | rep | split | status | pass | failures |
|---|---|---|---|---|---|---|---|
| validation (conflict-roca-v1) | offline-fixtures | cc-matcher-failclosed-013b-a-one-valid-round | 0 | development | scored | yes | — |
| validation (conflict-roca-v1) | offline-fixtures | cc-matcher-failclosed-013b-b-zero-valid-rounds | 0 | heldout | scored | yes | (hidden) |
| validation (conflict-roca-v1) | offline-fixtures | cc-regen-after-instant-007 | 0 | development | scored | yes | — |
| validation (conflict-roca-v1) | offline-fixtures | cc-window-rung2-017 | 0 | development | scored | yes | — |
| validation (conflict-roca-v1) | offline-fixtures | roca-compound-partial-009b | 0 | development | scored | yes | — |
| validation (conflict-roca-v1) | offline-fixtures | roca-quiet-day-010b | 0 | heldout | scored | yes | (hidden) |
| validation (conflict-roca-v1) | offline-fixtures | roca-retention-gap-008b | 0 | heldout | scored | yes | (hidden) |
| validation (conflict-roca-v1) | offline-fixtures | roca-ua-only-001b | 0 | development | scored | yes | — |
| validation (conflict-iran-v1) | offline-fixtures | cc-publication-gap-002 | 0 | heldout | scored | yes | (hidden) |
| validation (conflict-iran-v1) | offline-fixtures | cc-state-zero-empty-015 | 0 | development | scored | yes | — |
| validation (conflict-iran-v1) | offline-fixtures | cc-vague-claim-019 | 0 | heldout | scored | yes | (hidden) |
| validation (conflict-iran-v1) | offline-fixtures | iran-direct-kinetic-001 | 0 | development | scored | yes | — |
| validation (conflict-iran-v1) | offline-fixtures | iran-gulf-unavailable-010b | 0 | development | scored | yes | — |
| validation (conflict-iran-v1) | offline-fixtures | iran-two-events-011 | 0 | heldout | scored | yes | (hidden) |

### Conflict profile detail — russia_ukraine (conflict-roca-v1)

Headline label: "Key Takeaway benchmark coverage" — agreement with the named expert benchmark, never accuracy; ISW/CTP reads many of the same open sources as BNOW, so agreement is not independent confirmation. `unavailable` is a provenance statement, never a 0%.

| case | rep | state | Key Takeaway coverage (matched/denominator) | matcher rung | run group |
|---|---|---|---|---|---|
| cc-matcher-failclosed-013b-a-one-valid-round | 0 | scored | corpus 1/2 · retained 1/2 | llm | `russia_ukraine|roca:2026-08-12:final|retrospective|conflict-epoch-1|llm-compatible|k=5` |
| cc-matcher-failclosed-013b-b-zero-valid-rounds | 0 | scored | corpus 1/2 · retained 1/2 | keyword | `russia_ukraine|roca:2026-08-12:final|retrospective|conflict-epoch-1|llm-compatible|k=5` |
| cc-regen-after-instant-007 | 0 | scored | corpus 1/1 · retained 1/1 | fixture-oracle | `russia_ukraine|roca:2026-08-12:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| cc-window-rung2-017 | 0 | scored | corpus 1/1 · retained 1/1 | fixture-oracle | `russia_ukraine|roca:2026-08-13:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| roca-compound-partial-009b | 0 | scored | corpus 0/1 · retained 0/1 | fixture-oracle | `russia_ukraine|roca:2026-08-10:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| roca-quiet-day-010b | 0 | scored | corpus 0/1 · retained 0/1 | fixture-oracle | `russia_ukraine|roca:2026-08-10:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| roca-retention-gap-008b | 0 | scored | corpus 1/1 · retained 0/1 | fixture-oracle | `russia_ukraine|roca:2026-08-10:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| roca-ua-only-001b | 0 | scored | corpus 1/1 · retained 1/1 | fixture-oracle | `russia_ukraine|roca:2026-08-10:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |

### Conflict profile detail — iran_regional (conflict-iran-v1)

Headline label: "Key Takeaway benchmark coverage" — agreement with the named expert benchmark, never accuracy; ISW/CTP reads many of the same open sources as BNOW, so agreement is not independent confirmation. `unavailable` is a provenance statement, never a 0%.

| case | rep | state | Key Takeaway coverage (matched/denominator) | matcher rung | run group |
|---|---|---|---|---|---|
| cc-publication-gap-002 | 0 | unavailable | unavailable (publication_gap) — no score exists; distinct from 0 | — | — |
| cc-state-zero-empty-015 | 0 | scored | corpus 0/1 · retained 0/1 | fixture-oracle | `iran_regional|iran_update:2026-08-08:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| cc-vague-claim-019 | 0 | scored | corpus 1/2 · retained 1/2 | fixture-oracle | `iran_regional|iran_update:2026-08-09:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| iran-direct-kinetic-001 | 0 | scored | corpus 1/1 · retained 1/1 | fixture-oracle | `iran_regional|iran_update:2026-08-08:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| iran-gulf-unavailable-010b | 0 | scored | corpus 0/1 · retained 1/1 | fixture-oracle | `iran_regional|iran_update:2026-08-08:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
| iran-two-events-011 | 0 | scored | corpus 1/2 · retained 1/2 | fixture-oracle | `iran_regional|iran_update:2026-08-08:final|retrospective|conflict-epoch-1|fixture-oracle|k=0` |
