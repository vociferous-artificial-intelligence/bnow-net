# Conflict-evaluations workstream — test ledger

Exact commands, counts, failures, timings per phase. Baseline (base commit
`7150b49`, this worktree, Node v24.14.0/npm 11.9.0):

| Stage | Command | Result |
|---|---|---|
| Base sanity (`7150b49`, fresh worktree) | `npm test` | **2,402 passed / 2,402 (185 files)** — matches the QF final tally exactly |
| Base sanity | `npx tsc --noEmit` | clean |

Entries appended per phase below.

## Phase 0 (branch `codex/conflict-evaluations-p0-contract`, tip `40d6775`)

| Gate | Command | Result |
|---|---|---|
| clean diff | `git diff --check` | clean |
| zero behavior change | `npm test` | **2,402 passed / 2,402 (185 files)** — identical to base (Phase 0 adds docs + fixture JSON only) |
| fixtures parse | python3 json.load × 3 files | roca 10 / iran 12 / crosscutting 16 scenarios OK |
| fixture content validation | ad hoc script (recorded in `fixtures/conflicts/README.md`) | ALL CHECKS PASS (lanes ∈ §4 taxonomies; exclusion reasons ∈ bounded enum; verdict vocab; contribution only on corpus-recall matches; global id uniqueness; text caps; the prose-audit sentinel token exactly once (spelled only in the fixture unit and its README, per the containment rule)) |

### Gate 0 remediation (tips `f7127e2` legal, `cca5d9d` + `9bd42db` science)

| Gate | Command | Result |
|---|---|---|
| clean diff | `git diff --check` | clean |
| zero behavior change | `npm test` at `9bd42db` | **2,402 passed / 2,402 (185 files)** — unchanged |
| fixture revalidation | extended ad hoc validator (transcript in fixtures README) | ALL CHECKS PASS — 39 scenarios / 41 units / 48 claims / 50 docs; precedence + headline arithmetic mechanically recomputed; sentinel containment 1 |

Gate 0 initial verdicts: product/legal **FAIL (narrow: HIGH-1 contract
incompleteness; fixtures legally clean)**; scope/science **FAIL (narrow: H1
unavailable-verdict hole, H2 matcher-ladder contradiction)**. Both remediated
(register #7/#8). Focused re-reviews on `ea35fbf`: product/legal **PASS**;
scope/evaluation-science **PASS-WITH-MINORS** (3 NOTEs — two fixed in the
Gate-0 closing commit, the vague-claim fixture pin deferred to P4 by register
#9). GATE 0: PASSED.

## Phase 1 (branch `codex/conflict-evaluations-p1-domain`, tip `975cdcd`)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author + coordinator + reviewer, independently) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,598 passed / 2,598 (193 files)** — base 2,402 + 196 conflicts-domain tests; zero base regressions |
| clean diff | `git diff --check` + tree | clean |
| scope | `git diff 0df9106..975cdcd --stat` | only `src/lib/conflicts/` (+ decision register); freeze list untouched |
| binary check | phases.ts NUL sweep | 0 NUL bytes in HEAD blob; forward diffs textual |

Gate 1 (independent architecture reviewer): initial verdict on `0d7ab8f`
**FAIL** — MAJOR-1 (iran_regional legacy contributor roster designated the two
digest-less scaffolded theaters and omitted the four digest-producing ones,
unsupported by any designation record) and MAJOR-2 (`ConflictResultV1` could
not express the fixture-pinned publication-gap `unavailable` result without
fabricating an edition identity), plus 4 MINORs / 5 NOTEs. Remediated in four
commits (`63547de`..`975cdcd`; register #10 records the roster designation).
Focused re-review on `975cdcd`: both MAJORs DISCHARGED (roster grounding
re-checked at source, compile-level gap-variant exclusion mutation-proven),
all MINOR/NOTE dispositions verified, judgment calls ratified. Remaining
NOTEs are non-blocking and carried to P2/P3 charters (cutoff-ordering
diagnostic, editionKey normalization, lane-helper routing).
**Verdict: PASS. GATE 1: PASSED.**
