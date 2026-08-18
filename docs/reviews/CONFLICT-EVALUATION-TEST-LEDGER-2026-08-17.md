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

## Phase 2 (branch `codex/conflict-evaluations-p2-reference`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author, coordinator, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,682 passed / 2,682 (199 files)** at `e292ab3` (base 2,598 + Phase 2; conflicts suite green under TZ=America/New_York, UTC, Asia/Tokyo, Pacific/Kiritimati) |
| integration (full) | `npm run test:integration` (disposable Neon forks, paid keys blanked, LLM_DISABLE=1) | **127 passed / 127 (20 files)** — base 119 + 8 conflict-reference cases; the target file additionally run TWICE (normal + `TZ=Asia/Tokyo`, 8/8 each); all forks deleted |
| scope | range diffstat | only `src/lib/conflicts/`, `src/integration/`, `docs/designs/`, `docs/reviews/`; freeze list untouched; drizzle/journal untouched |
| legal | both reviewers' sweeps | no ISW prose persisted or persistable (extraction returns instants/enums/booleans only); no credentials/branding; sentinel absent |

Critical Gate 2 (two independent reviewers): initial verdicts on `651b9d6`
**FAIL + FAIL**, CONVERGING on the same MAJOR — the SQL backend read Postgres
`date` columns via `toISOString()` on driver values constructed at LOCAL
midnight, shifting every `report_date` read back one day east of UTC (proven
independently: 3/6 itest failures under TZ=Asia/Tokyo; a driver-faithful
oid-1082 probe). Time/edition review added m-1 (explicitly-not-final edition
could silently win daily-final selection) and m-2 (prior-reference guard
defeated by markup/intervening word — visible window-widening direction);
DB/legal review added 4 MINORs (DDL label/isw-url CHECKs, designated-final
partial unique index, non-monotone day-status upsert, count-shaped
non-interference proof) + 4 NOTEs. Remediated in six commits
(`f90322b`..`e292ab3`), incl. the committed P2 implementation report both
reviews required. Focused re-reviews on `e292ab3`: DB/legal **PASS** (all
findings discharged; TZ=Asia/Tokyo itest independently re-run 8/8);
time/edition **PASS-WITH-MINORS** (M-1/m-1/m-2 discharged with mutation
proofs; R-1 one-clause doc direction fix + R-2 cast-pin NOTE — both applied
in the Gate-2 closing commit). Adjudication of record: edition records are
DISCOVERY METADATA, not §8 as-published results, with two carried conditions
(persisted evaluation results stamp their window inputs — binds P4/P5;
durable anchor-change journaling — design §5 deferral).
**Verdicts: PASS + PASS-WITH-MINORS. GATE 2: PASSED.**

## Phase 3 (branch `codex/conflict-evaluations-p3-evidence`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author, coordinator, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **2,920 passed / 2,920 (205 files)** at `9fef8b7` (base 2,683 + Phase 3; conflicts package 518/518 also under TZ=Asia/Tokyo) |
| acceptance corpus | fixture-corpus.test.ts via the real engine | all **40** scenarios (39 + additive `cc-other-in-scope-018`) / 50 claims reproduced exactly; corpus additions-only (105 ins / 0 del) |
| scope | range diffstat | only `src/lib/conflicts/`, `fixtures/conflicts/` (additive), `docs/reviews/`; freeze list untouched; no itest surface touched (integration baseline stays 127/20) |
| legal | pre-gate + gate sweeps | no prose persisted or persistable; traceability shape enforced (no record without a non-mirror doc); rosters org/role-only; sentinel spelled zero times |

Critical Gate 3 (two independent reviewers): initial verdicts on `5f1844c`
**FAIL + FAIL**, non-overlapping MAJORs, all runtime-proven. Evidence/
source-fidelity: bare-token actor entries (yemen/al-salif/oman/belarus)
granted scope AND governed lanes for neutral claims (five probe sentences
admitted), contradicting the roster's containment claim; + corpus-recall
theater-comparability hole, off_scope sub-cause loss. Query/perf/ops: the
mix cap collapsed in the realistic all-null-platform corpus (20/0 flood
selection; reliability-first refill re-concentration), assemblies were not
byte-deterministic (3 instances), the limits guard failed OPEN on NaN, and
the future-DB contract lacked a bound query outline + intake ceiling.
Remediated in six commits (`f6dcdaa`..`9fef8b7`) incl. the committed P3
implementation report whose §5 carried conditions BIND P4/P5 (results stamp
window inputs + selection limits + roster/classifier/taxonomy/policy/
extractor versions). Focused re-reviews on `9fef8b7`: ops **PASS** (all
probes re-run; 7 mutations killed by named tests; pre-remediation behavior
cannot return unguarded); evidence **PASS-WITH-MINORS** (all discharged; 4
mutations; one NOTE-grade documented residual — the houthi guard's
shipping-token coarseness, versioned revision path recorded). The ops
re-review's overflow-sentinel NOTE (fetch EVIDENCE_MAX_INTAKE+1 so over-limit
days refuse visibly) is folded into the query contract in the closing commit.
**Verdicts: PASS + PASS-WITH-MINORS. GATE 3: PASSED.**

## Phase 4 (branch `codex/conflict-evaluations-p4-scoring`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (coordinator, four pre-gate verifiers, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **3,050 passed / 3,050 (214 files)** at `192c082` (base 2,920 + Phase 4; conflicts package 648/648 also under TZ=Asia/Tokyo) |
| goldens | drift gate (`goldens.test.ts`) | committed `fixtures/conflicts/goldens/golden-results-v1.json` (14 byte-stable results incl. 2 ladder variants) byte-identical through BOTH remediation rounds; regeneration deterministic |
| acceptance corpus | scorer-acceptance loop via the real pipeline | all **41** scenarios (40 + additive `cc-vague-claim-019`) reproduce every deferred expectation: verdict maps, 5 headline pins, contribution, missDiagnostic, laneDiagnostics, independentSources, matcherFixture ladder variants |
| scope | range diffstat | only `src/lib/conflicts/`, `fixtures/conflicts/` (additive), `docs/reviews/`; freeze list untouched; production `llm-match.ts`/`keywords.ts` reused via exports, never edited |
| purity | `matcher-import-hygiene.test.ts` + reviewer greps | no provider SDK import, no env-dependent path; full k=5 match under fully blanked env from injected votes; zero paid calls all rounds |

Phase 4 authorship note: implementation spanned two session-limit
interruptions; the coordinator committed the salvaged tree (impl commit
proven to build standalone) and the resumed takeover agent's hardening
converged with it — the race is disclosed in the P4 report §8. FOUR
independent pre-gate verifications (2 fidelity, 2 legal) were all clean
before the formal gate.

Critical Gate 4 (two independent reviewers): initial verdicts on `5b38007`
**FAIL (science) + PASS-WITH-MINORS (legal)**. Science MAJOR: `units: []`
produced a PERSISTABLE scored 0/0 headline (the §6.4-forbidden case); plus
thinSourced behaviorally unpinned (a boundary mutation survived all 637
tests), a proven keyword-rung toponym-only false agreement (Kharkiv probe,
0.625 ≥ 0.6 with no action compatibility), and duplicate-vote-entry
hard-fail. Legal MINORs, all empirically proven: stride-3 prose-scan
evadable by unaligned fragments; raw window anchors an ungated free-text
channel; offline formatter fabricated zeros on stripped input and
under-disclosed mixed rungs. Remediated in five commits
(`8779233`..`192c082`) with goldens byte-identical throughout (the new
keyword action-class gate landed with zero blast radius). Focused re-reviews
on `192c082`: **PASS + PASS** — every original probe re-run and caught,
including a mutation proving the persistence gate catches 0/0 end-to-end
even without the scorer refusal. NOTE-grade residuals recorded with owners:
≤64-char anchor-clause tightening option (P5); requested-k-through-fallback
(BINDING P5); per-population partial counts + pair-weighted timing-median
documentation (BINDING P6); action-gate deflation on non-canonical action
wording ("shelled"/"artillery struck" false-miss — deflationary only) →
production-gazetteer follow-up.
**Verdicts: PASS + PASS. GATE 4: PASSED.**

## Phase 5 (branch `codex/conflict-evaluations-p5-adapter`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (coordinator, both pre-gate verifiers, both reviewers, both re-reviews) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **3,110 passed / 3,110 (219 files)** at the closing tip (base 3,050 + Phase 5; conflicts+evals green under TZ=Asia/Tokyo) |
| goldens | drift gate | byte-untouched EXCEPT the one sanctioned Gate-4-obligation re-baseline (2 keys in the ladder B-variant: votesK null->5, runGroupKey k=0->k=5), audited exact by both reviewers |
| CLI (zero-provider) | `scripts/analysis-eval.ts --profile conflict` modes with blanked env + fake-key probes | validate-dataset 8+6 cases OK; offline 14/14 with byte-identical committed artifacts (mod updatedAt); estimate $0.0031 explicitly hypothetical; every live/equals-form/unknown-token refusal exit 2 BEFORE client construction (subprocess-pinned) |
| scope | range diffstat | src/lib/{evals,conflicts}/ + scripts/analysis-eval.ts (sanctioned additive hunks only, classified line-by-line) + fixtures goldens (sanctioned) + docs; inherited evals plane byte-unchanged; isolation test unmodified 6/6 |

Critical Gate 5 (two independent reviewers): initial verdicts on `022d3c1`
**FAIL + FAIL**, non-overlapping MAJORs. Ops: the GNU `=` flag spelling was
silently discarded, bypassing the new refusals and reaching the GENERIC paid
live path's client construction under mixed spelling + provisioned env.
Control-plane: register #5's terminal rung was caller-skippable — the scorer
and persistence gate both passed a scored snapshot-kind result minted WITHOUT
resolution (two proven probe cells). Plus: snapshot refs silently dropped on
gap paths (both scorer and wiring layers), the adapter's persistence-gate
call mutation-uncovered (0/801 kill), dataset identity not covering
derivation logic, the dynamic-import pin gap, heldout unmasked in the
conflict report section. Remediated across `82ad8c0`..`2e1422b` (incl. the
register-#5 twin guards, the equals refusal, derivation-covered identity with
a sanctioned exact-line artifact refresh, the additive dynamic-import pin,
and the gap-branch wiring fix that closed the ops reviewer's mid-interruption
probe). Focused re-reviews on `2e1422b` (both re-run after a session-limit
interruption; orphaned reviewer worktrees verified clean and removed):
control-plane **PASS** (twin-guard property mutation-proven; derivation-gap
re-probed closed; artifact refresh audited line-by-line); ops
**PASS-WITH-MINORS** (all discharged; residual MINOR: the equals guard was
lowercase-long-form only — hardened to `/^-[^=\s]+=/` with uppercase/short-
dash pins in the Gate-5 closing commit). Register-#3 fallback trigger
adjudicated NOT met (workload honesty verified); no isolation-test amendment
needed; no new register entry required.
**Verdicts: PASS + PASS-WITH-MINORS. GATE 5: PASSED.**

## Phase 6 (branch `codex/conflict-evaluations-p6-product`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean |
| lint | `npm run lint` | clean (0 errors, 0 warnings) |
| unit | `npm test` | **3,166 passed / 3,166 (225 files)** (base 3,110/219 + 56 Phase-6 tests in 6 files; zero base regressions) |
| integration (full) | `npm run test:integration` (disposable Neon fork, paid keys blanked, LLM_DISABLE=1) | **150 passed / 150 (21 files)** — base 127/20 + 23 `conflict-feature-off.itest.ts` cases (production build; bare-GET + RSC + accepted-session BODY assertions, flag absent AND flag ephemeral-on; positive control non-vacuous); fork deleted |
| build | `npm run build` (flag absent, dummy non-contact env) | PASS, warning-free; all four conflict routes ƒ (dynamic) |
| guard-order mutation proofs | delete `requireAcceptedUser` from the evidence page; remove the overview's leading feature guard | fail exactly 3/7 and 2/9 cases respectively, nothing else; both reverted |
| browser matrix | production serve on :3141, flag injected ephemerally; headless Chrome 151 + CDP media emulation | screenshots/PDFs/metrics in session scratchpad; 390px document-overflow bug FOUND (sr-only labels escaping the scroll clip, scrollWidth 576) and FIXED (`50761e7`), re-measured scrollWidth=390 everywhere, light+dark; feature-off 404s re-proven over HTTP |
| clean diff | `git diff --check` + tree | clean at the closing commit |

Phase report: `docs/reviews/CONFLICT-EVALUATION-P6-REPORT-2026-08-17.md`
(IA decisions incl. the register-#8(g) scoreboard-coexistence adjudication,
guard-ordering table, seven-question mapping, rendering-obligation
fulfillment, browser-coverage honesty, judgment calls, residual risks).
Critical Gate 6 (product-clarity/accessibility + legal/authorization/
truth-in-UI reviewers): PENDING — to be run against the closing tip.

## Phase 6 (branch `codex/conflict-evaluations-p6-product`, final tip see closing commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean (author, both pre-gate verifiers, both reviewers, coordinator) |
| lint | `npm run lint` | clean |
| unit | `npm test` | **3,175 passed / 3,175 (226 files)** at the closing tip (base 3,110 + Phase 6) |
| integration (full) | `npm run test:integration` | **150 passed / 150 (21 files)** — base 127 + 23 conflict-feature-off body tests (production build, real HTTP, statuses untrusted); re-run independently by the legal pre-gate verifier AND the Gate-6 legal reviewer on their own disposable forks |
| build | `npm run build` (flag absent) | PASS, warning-free, all conflict routes dynamic; the Gate-6 product reviewer additionally built+served flag-ON against an UNROUTABLE DATABASE_URL — every page 200, proving zero runtime DB dependency |
| browser | production serve + headless Chrome/CDP | author matrix (390px/desktop/CDP dark/print/feature-off/empty/partial/unavailable; found+fixed a real 390px overflow) INDEPENDENTLY reproduced by the product reviewer, who closed the disclosed gaps: real driven Tab-walks (33 stops, skip-link first, visible focus, no traps), MEASURED WCAG contrast (worst 5.03:1, AA everywhere), print PDFs, 320px + ar-locale RTL |
| scope | range diffstat | routes/components/provider/copy/flag + itest + docs; nav/sitemap/robots/metadata/scoreboard untouched (verified in source, built manifests, and served output); sole freeze-adjacent touch = a 6-line comment in authz-page-gate.itest.ts |

Critical Gate 6 (two independent reviewers): verdicts on `1f70852`
**PASS-WITH-MINORS + PASS-WITH-MINORS** — gate PASSED; MINORs fixed in the
closing round (`04a55de`..`611f30e`): the symmetric contribution-population
note (the gulf record rendered empty buckets beside a 100% published
headline with only the exceed-direction explained), print-visible method
stamps, per-series coexistence notes, "Latest scored" wording, the
detail-page section-order walk. Adjudications of record: **ruling 3 —
compliant as shipped** (hidden-entirely default proven at HTTP body level;
zero DB co-mingling; ephemeral fixture review operator-commissioned), with
the BINDING precondition that real results + synthetic-banner retirement
precede any production enablement via a decision-log entry — and the
explicit warning that CONFLICTS_UI=1 in any Vercel env while fixture-backed
would breach ruling 3. Ruling-21 continuity: the gated evidence route's
body-level authz proof lives in the flag-on itest (documented in-file); at
enablement it MUST migrate into the authz-page-gate ROUTES table or an
equivalent harness — now an unconditional checklist item beside the robots/
sitemap review (P6 report §12.6/§14). The legal reviewer's attack campaign
(31 routes × 5 header sets + 14 crafted variants, fake keys, bodies-only
trust) found zero text fragments; provider tamper probes all refused typed.
**Verdicts: PASS-WITH-MINORS ×2. GATE 6: PASSED.**

## Phase 7 (branch `codex/conflict-evaluations-p7-integration`) — full integration gates

Eleven gates per prompt §15. Full detail:
`docs/reviews/CONFLICT-EVALUATION-P7-REPORT-2026-08-17.md` §6.

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | clean worktree | `git diff --check` + `git status` | clean |
| 2 | targeted per-phase tests | six phase file-sets + the P7 file, run in isolation | P1 157/6 files · P2 100/7 · P3 240/6 · P4 133/9 · P5 78/6 · P6 65/7 · P7 19/1 · whole conflicts package 723/33 — **0 failures** |
| 3 | typecheck | `npm run typecheck` | clean |
| 4 | lint | `npm run lint` | clean (0 errors / 0 warnings) |
| 5 | unit | `npm test` | **3,194 passed / 3,194 (227 files)** — P6 close 3,175/226 + 19 backtest cases in 1 file; zero regressions (base `7150b49` = 2,402/185) |
| 6 | production build | `npm run build`, `env -i`, `CONFLICTS_UI` ABSENT, unroutable `DATABASE_URL`, `LLM_DISABLE=1` | **PASS**, warning-free; all four conflict routes `ƒ (dynamic)`. Gate-6 reviewer's flag-ON build against an unroutable DB (every page 200, zero runtime DB dependency) cited, not re-run. **Measured at `ad10fbd`** — re-run at the final SHA, see § Final-SHA gate closeout |
| 7 | integration (full) | `npm run test:integration`, inline-env pattern (NEON keys + DATABASE_URL grepped inline from the ordinary checkout's `.env.local`, never copied/echoed), paid keys blanked, `LLM_DISABLE=1` | **150 passed / 150 (21 files)** — disposable branch `br-wandering-cherry-atk3f7wh` created and deleted; 99.85 s. **Measured at `ad10fbd`; SUPERSEDED** — the final-SHA re-run is **151/151 (21 files)**, see § Final-SHA gate closeout |
| 8 | CLIs, zero-provider proof | `--profile conflict` × validate-dataset / estimate / offline / offline --fresh / report, under `env -i`; then 8 refusal probes WITH a fake OpenAI key, fake Anthropic key, `EVAL_USD_CAP_DAILY=99`, fake `DATABASE_URL` | all modes exit 0 with zero provider contact (validate 8+6 cases; estimate \$0.0031 explicitly hypothetical; `--fresh` byte-identical except one `updatedAt` line per file; report verdicts `insufficient_data`, honest); **all 8 refusals exit 2 before any client construction** (equals-form incl. uppercase/short-dash, `--execute-live` under the profile, unknown profile, unknown conflict id, workload/profile clash, generic live db-ack) |
| 9 | browser matrix | cited from Gate 6; artifacts verified present | author matrix `p6-browser/` 56 files (36 PNG + 3 PDF) incl. the found-and-fixed 390 px overflow (`50761e7`); reviewer reproduction `gate6-shots/` (10, incl. 390 RTL + print PDFs) + `gate6-html/` (17) with a driven 33-stop Tab-walk and measured contrast (worst 5.03:1) |
| 10 | source scan | range-wide greps + the committed sentinel-audit tests | **no client construction, no retry config, no SDK import, no SpendGuard/metering touch, no env file, no credential** in the whole range; the only secret-shaped string is a deliberate unroutable fake DSN in a refusal test; both committed results artifacts are `configKey=offline-fixtures` with no cost/model/key fields; every prose/sentinel audit green |
| 11 | SHA table | see report §6 gate 11 | base `7150b49` ← `e5757ea`; seven phase tips/merges; **migration status NONE** (`drizzle/` + journal untouched across 97 commits) |

Scope audit vs base: 124 files, +39,737 / −4 (the four deletions are refactored
helper signatures in `scripts/analysis-eval.ts`). Freeze list untouched:
`drizzle/`, `src/db/`, `src/lib/validation/*`, `src/lib/isw/*`,
`src/app/api/cron/validate/*`, `scripts/validate.ts`, `src/app/scoreboard/*`,
`map-versions.ts`, nav/robots/sitemap/metadata. Sole freeze-adjacent edit: a
six-line explanatory comment in `src/integration/authz-page-gate.itest.ts`.

Zero paid provider calls, zero production writes, no migration, no env change,
no deploy, no push, no PR, no merge to `main`.

## GATE 7 (final) — COMPLETE: three adversarial reviews, 2026-08-18

All three mandated final reviews ran against the final integration SHA
`b8341e9` and returned **PASS-WITH-MINORS**. Full verdicts, verification
highlights, and per-finding dispositions: P7 report §11.

| Review | Verdict | Findings | Independent verification highlights |
|---|---|---|---|
| #1 methodology / evaluation science | **PASS-WITH-MINORS** | 3 MEDIUM + 3 MINOR, all docs/register/soak scope (reviewer stated no code change required) | ran the two committed REAL ISW fixtures through the PRODUCTION takeaway parser (9 bullets: 9/9 multi-proposition, ~4 analytic assessments); corpus-wide keyword-rung probe of `iran_regional` (0 matched / 0 partial, 13 of 20 units flagged); the Gate-4 action-class gate measured over 10 realistic pairs (precision 0.40 / recall 0.33, substring FP "white" ⊃ "hit") |
| #2 safety / operations | **PASS-WITH-MINORS** | 3 MEDIUM + 1 LOW + 1 checklist item | 4-word / 1,317-window prose scan over 71 persisted artifacts — ZERO hits; 23-case body-level authz probe incl. the signed-in-but-UNACCEPTED tier the authored suite does not cover; network-kill-switch CLI attack with fake keys; four-layer mutation test of the register-#5 refusal; independent ruling-3 adjudication (merging does NOT breach it, same enable-time precondition) |
| #3 product / analyst UX | **PASS-WITH-MINORS** | 6 MINOR + 6 NOTE | real Tab-walk **45/38 stops, zero missing focus rings** (closes P6's own "NOT verified" keyboard item); canvas-resolved contrast, worst conflict-owned pair **4.84:1 light / 7.61:1 dark**; **390px `scrollWidth == clientWidth` on all seven pages**; print stamps exactly once; unroutable-DB proof; bad-input 404s |

### Closeout remediation rounds (three commits' worth of fixes + one docs commit)

| Gate | Command | Result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | clean |
| lint | `npm run lint` | clean (0 errors, 0 warnings) |
| unit | `npm test` | **3,212 passed / 3,212 (228 files)** — Gate-7 entry 3,194/227 + 18 new cases (1 new file, `localization.test.tsx`); **zero regressions** |
| golden drift | `goldens.test.ts` inside the full suite + `git status fixtures/` | **byte-identical**; `fixtures/conflicts/` and `docs/evals/` untouched by all three rounds |
| clean diff / tree | `git diff --check`; `git status` | clean / clean |
| banner mutation proof | delete `<SyntheticBanner/>` per route, run that route's test | 4/4 — each deletion fails exactly one NAMED test (index, overview, detail, evidence) |

Code fixed in the closeout: intake now type-checks `stub`/`published`/
`engine`/`currentExtractorVersion` and validates `docId` (integer > 0) at both
entry points; `independentSourceCount` dedupes by docId; the corpus-recall
query contract gains a binding row-grain/LIMIT section and a real
`STUB_ADAPTER_NAMES` reference; `PublishedRetentionClaimSource` gains a full
contract; the ruling-3 banner is pinned on all four routes plus the flag-ON
itest; the presence module refuses a bare 0% when every unit is incomparable;
zero-eligible corpora, empty evidence unions, fixture-demonstration labels,
unique link names, RTL bidi isolation, and logical table alignment all
landed with pins.

Recorded, NOT implemented (each needs its own review): the compound-attestation
adjudication, the assessment/inference diagnostic class, the keyword rung's
`insufficient_data` return (register #12 — all three BLOCK the soak), and the
reference-URL/unit-ordinal profile change (P7 §5.2 item 4b — blocks
enablement).

## Final-SHA gate closeout (2026-08-18, gates run at `6b35622`)

Both gates below were executed with `HEAD` = `6b35622` and a clean tree. This
section is itself a **docs-only** commit placed on top of that SHA, so it
changes no source and the numbers remain valid at the resulting tip; resolve
that tip with
`git rev-parse --short codex/conflict-evaluations-integration-20260817`.

**Why this section exists.** An audit of the gate record found that the
Phase-7 eleven-gate battery above ran at **`ad10fbd`**, and that FOUR
source-changing commits landed after it:

| Commit | Subject | Source touched |
|---|---|---|
| `abbd807` | harden candidate intake; dedupe independence; bind the query row grain | `eligibility.ts`, `evidence-assembler.ts`, `evidence-records.ts`, `fixture-corpus.ts` + tests |
| `ae45bc1` | pin the ruling-3 synthetic banner on every conflict route | 4 route tests **+ `src/integration/conflict-feature-off.itest.ts`** |
| `06e80df` | report incomparable coverage, empty corpora, and demonstrations honestly | 3 conflict routes, `presence-module.tsx`, `product-view.ts` |
| `f58858d` | isolate numeric runs for RTL; logical table alignment; unique link names | `benchmark-run-list.tsx`, `lane-table.tsx`, `model.tsx` + new `localization.test.tsx` |

Total source delta `ad10fbd..6b35622` (`git diff --stat -- ':!*.md'`):
**22 files, +685 / −63**. The remaining commits in that range (`de3acc4`,
`35c5c34`, `b8341e9`, `a065490`, `6b35622`) are docs-only.

The closeout-remediation table above re-ran typecheck, lint, unit, golden
drift, clean diff, and the banner mutation proof — but **NOT the production
build and NOT the integration suite**. So until this section, those two gates
had never been executed against the final tree, and the published integration
figure of **150 was stale**: `ae45bc1` added one case to
`conflict-feature-off.itest.ts` (23 → 24 tests in that file).

**Re-run at the final SHA** (`git rev-parse --short HEAD` = `6b35622`, tree
clean before the run; local only — no push, no deploy, no env-file edit, no
production DB, zero paid provider calls):

| Gate | Command | Result |
|---|---|---|
| 6 production build | `npm run build`, `CONFLICTS_UI` ABSENT, `DATABASE_URL=postgres://u:p@127.0.0.1:1/nodb`, `OPENAI_API_KEY=`/`ANTHROPIC_API_KEY=`/`X_API_KEY=`/`OPENSANCTIONS_API_KEY=`/`POSTMARK_SERVER_TOKEN=`/`NEON_API_KEY=` blanked inline, `LLM_DISABLE=1` | **PASS** (exit 0), **warning-free** — zero `warn`/`error`/`failed`/`deopt` lines in the whole log; compiled in 2.3 s, TypeScript 4.4 s, 8/8 static pages. All four conflict routes are **`ƒ (dynamic)`**: `/conflicts`, `/conflicts/[slug]`, `/conflicts/[slug]/benchmark/[key]`, `/conflicts/[slug]/benchmark/[key]/evidence`. That the build completes against a DSN pointing at `127.0.0.1:1` proves there is **no build-time DB dependency**; it is not by itself a claim about runtime |
| 7 integration (full) | `npm run test:integration`, inline-env pattern (NEON keys + `DATABASE_URL` grepped inline from the ordinary checkout's `.env.local`, never copied or echoed), paid keys blanked, `LLM_DISABLE=1` | **151 passed / 151 (21 files)** (exit 0), 105.13 s. Disposable fork `br-quiet-tree-at8225qt` **created and deleted** — the delete-on-exit trap reported `deleted br-quiet-tree-at8225qt` with no `WARNING`, so no branch leaked |
| unit (re-confirm, docs-only edit) | `npm test` | **3,212 passed / 3,212 (228 files)** — unchanged, as required for a docs-only commit |

**Delta accounting, integration 150 → 151.** Exactly +1, entirely in
`conflict-feature-off.itest.ts` (24 tests at this SHA vs 23 at `ad10fbd`): the
`ae45bc1` case *"every flag-ON teaser body carries the ruling-3
synthetic-corpus disclosure"*, which asserts the disclosure token in every
real rendered teaser BODY. `conflict-reference-repo.itest.ts` is unchanged at
8. No other file moved, and no test that passed at `ad10fbd` regressed.

**Honest statement of record.** The Phase-7 eleven-gate battery documented
above **predates the four closeout source commits** and is therefore not, on
its own, evidence about the shipped tree. Gates 6 and 7 are now closed at the
true final SHA with the numbers in this section; the other nine Phase-7 gates
were NOT re-run here, and gates 2, 8, 9, 10 in particular still carry their
`ad10fbd` provenance — of these, gate 9 (browser matrix) is the one most
exposed to the closeout commits, since `06e80df` and `f58858d` changed
rendering and localization in three routes and three components. Their
replacement pins are the unit-level coverage added in the same commits
(`localization.test.tsx`, the four per-route banner assertions) plus the
final-SHA integration body assertions above, not a re-driven browser run.

### Gate 9 (browser matrix) — executed at the final SHA, and DEFECT-1

The Phase-7 battery CITED the Gate-6 browser matrix rather than re-running it,
and that citation's justification ("the routes have not changed since it ran")
was FALSE at the final SHA: `06e80df` and `f58858d` changed three routes and
three components after the only browser measurements ever taken, leaving the
RTL/bidi fix, logical table alignment, unique link names, the presence-module
qualifiers, the index-card caveat and the demonstration label backed by jsdom
alone. Closed here by a real run against a production build of the final tree
(headless Chrome over CDP, ephemeral env, UNROUTABLE DATABASE_URL):

| State | Result |
|---|---|
| feature-off | 118 requests × 31 routes (bare + `RSC: 1`) — **zero content leaks** |
| desktop 1280 / mobile 390 | `scrollWidth == clientWidth` on all 10 pages × light/dark × LTR/RTL (40 states), zero overflow |
| light / dark contrast | canvas-resolved (oklch-safe): **zero failures inside `<main>`** on any conflict page |
| print | method stamps render **exactly once** on all 8 stamp-bearing pages |
| **RTL** | 52/52 numeric runs in correct visual order; **mutation-proved** — stripping `dir="ltr"` in the live page reproduces the documented "of 1 … 1" bug byte-for-byte; `text-left`/`text-right` count = 0 |
| keyboard | 5 pages, 18–44 stops each: 0 traps, 100% of stops carry a visible focus ring |
| degenerate states | gap / gulf-incomparable / keyword-degraded / compound-partial / empty union / zero-eligible all render as specified |
| the five closeout fixes | all verified in rendered pixels |

**DEFECT-1 (MINOR, found and FIXED at closeout):** the benchmark detail page
suppressed the evidence link in q2 when the published union is empty but
offered "Gated evidence view" unconditionally in q7 — the page contradicted
itself on one screen and walled an empty view behind a sign-in on 2 of 14
records. Fixed by gating q7 on the same `publishedUnionCount`, pinned by two
tests, **mutation-proven** (reverting the source fix alone fails exactly those
two). Non-defect observations recorded: the publication-gap page carries the
gap/not-zero notes instead of the coverage caveat (no score to qualify); the
feature-off contract text says "every route returns notFound()" while the 14
gated evidence routes answer 307 → /signin under ruling-21 auth-first ordering
(leak-free either way); the 7 light-mode contrast failures are pre-existing
site chrome, identical on `/` and `/privacy`.
