# Conflict-evaluations program — independent Fable final audit, evidence ledger (2026-08-18)

Prompt-B audit session: `claude-fable-5`, effort `xhigh`, large-context. Audit target frozen at
launch: **`AUDIT_TARGET_SHA = a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`** (`a2ddca8`), the tip of
`codex/conflict-evaluations-integration-20260817`, identical to the Prompt-A export's observed
tip — the branch did not advance. Audit worktree
`/Users/go/code/bnow-net-worktrees/conflict-evaluations-final-audit-20260818`, branch
`codex/conflict-evaluations-final-audit-20260818`, created from that immutable SHA. Node
v24.14.0 / npm 11.9.0 (fnm), the exact versions the program's own gates recorded. Every gate
below ran against the UNCHANGED target tree before any audit commit existed.

Boundaries kept throughout: no merge to `main`, no push, no PR, no deploy, no env change, no
feature enablement, no paid provider call, no production DB write, no `.env.local` copy (Neon
credentials read inline for the integration harness only), `UPDATE_CONFLICT_GOLDENS` never set.

## 1. Phase A — reconstruction (all verified against git, not prose)

| Claim | Command | Result |
|---|---|---|
| Branch tip | `git rev-parse codex/conflict-evaluations-integration-20260817` | `a2ddca88…` — unchanged |
| Ancestry chain | `git merge-base --is-ancestor` for `b8341e9`, `ad10fbd`, `35c5c34`, `6b35622`, `81a6949`, all 8 phase merges, `de3acc4`, `4e900a6`, `7150b49`, `e5757ea` | **all ancestors of `a2ddca8`** |
| `origin/main` | `git fetch` (read-only) + `rev-parse` | `9c5e9cb`, unmoved, ancestor of the target |
| Range stats | `git rev-list --count` / `git diff --stat` | 7150b49..a2ddca8 = **106 commits / 125 files / +40,970 −4**; ..6b35622 = 104 / 125 / +40,851 −4; b8341e9..6b35622 = **28 files +1,185 −83**; ad10fbd..6b35622 non-md = **22 files +685 −63** — every published figure reproduces exactly |
| `81a6949` | `git show --stat` | docs-only (ledger + index) — as claimed |
| `a2ddca8` | `git show --stat` | ledger +35, benchmark page +4/−1 net, its test +15/−1 net — source-changing, as claimed |
| Base delta | `git diff e5757ea..7150b49 -- ':!*.md' ':!.env.example'` | **byte-empty** |
| Freeze list | `git diff --name-only 7150b49..a2ddca8 -- drizzle/ src/db/ src/lib/validation/ src/lib/isw/ src/app/scoreboard/ src/lib/scoreboard/ src/i18n/ src/app/api/cron/ scripts/validate.ts robots sitemap` | **0 files** |
| QF audit branch | `git log 7150b49..858bb9a` + `diff --stat` | 6 commits, 10 files, +1,912/−0, all docs/AGENTS.md — documentation-only as claimed |
| Evidence package | `shasum -a 256 -c MANIFEST.sha256` | **26/26 OK** |
| Worktrees | `git worktree list` + `status --porcelain` each | conflict/QF/QF-audit worktrees clean; one pre-existing stale registration (`.worktrees/business-planning-20260817`, cloud session) left untouched; no live authoring session (peer `bnow-net-99` idle) |

**Model timeline, independently verified from primary transcripts** (4 of 9 still on disk;
counts of `"model":` fields): gate6-product `a8afbb18…` = **155× claude-fable-5 only**;
final-safety `a8024726…` = **144× claude-opus-5 only**; final-science `a0fff2d7…` = **121×
claude-opus-5 only**; closeout `a9074aa9…` = **685× fable then 186× opus, switch at
2026-08-18T11:34:57.257Z** — so Range A (`b8341e9..6b35622`) was authored on Fable, and
everything from Phase 7 on (author, gate battery, both verifiers, three final reviews, late
reruns, `a2ddca8`) is Opus-5 work. The phase7-author/gate-verifier transcripts no longer exist
at their recorded paths; their SHA-256-recorded exports in the evidence package are the
surviving primary copies (provenance caveat, no contradiction found). No fallback event exists;
the model changed because the operator switched it. **Last fully Fable-reviewed SHA: `1f70852`
(Gate 6).**

**Gap-audit claims reproduced independently:** `docs/reviews/` holds exactly ten conflict files —
zero per-phase adversarial gate reports, no `CONFLICT-EVALUATION-INTEGRATION-2026-08-17.md`, no
P1 report; register #2 and contract §3 (design doc line 115) describe an atomization "disabled
experiment"/"flagged-off adapter" while `grep -rn 'atomi[sz]|decompos'` over the conflict
package finds **no such code** (comments/copy only).

## 2. Phase A2 — bounded QF dependency acceptance

- `src/lib/evals/` delta = **5 files, all added** (`git diff --name-status`): the profile + 4
  test files; the inherited plane is byte-unchanged. `scripts/analysis-eval.ts` = +281/−4,
  read line-by-line: equals-form refusal first in `main()`, profile allowlist, live/workload
  refusals under the profile, mode-scoped dynamic import.
- `refuseOnIdentityDrift` is **inherited** (exists at `7150b49:scripts/analysis-eval.ts:260`);
  the conflict offline path reuses it, and `conflictDatasetContentHash` additionally folds the
  BUILT dataset serialization in (derivation-covered — stronger than the generic file-bytes
  hash).
- Matcher seam: `match-contract.ts` imports `majorityFromVotes`/`sanitizeMatches` and
  `llm-compatible-matcher.ts` imports `MATCH_SYSTEM_PROMPT`/`buildMatchUserPrompt` from
  `../validation/llm-match` — production functions, unforked.
- Zero `@/db`/drizzle/provider-SDK imports across `src/lib/conflicts`, `src/app/conflicts`,
  `src/components/conflicts`, and the profile (grep; `reference-repo-sql.ts` is itest-only).
- `conflictModeReport` mirrors the QF `modeReport` limitations (datasetContentHash-only gating;
  baseline hardwired `null` so the QF filename-trust hazard is unreachable here); it does not
  weaken any inherited guarantee, and the QF pre-paid-eval hardening items must be specified
  against BOTH report paths (carried forward as a binding prerequisite, not a dormant-merge
  blocker).

## 3. Phase B — post-review delta (both ranges read line-by-line)

`abbd807`: intake type-checks `stub`/`published`/`currentExtractorVersion`/`engine` with typed
refusals that never echo values (claimId is validated positive-integer FIRST, so later
interpolations are safe); `independentSourceCount` Set-dedupes by docId; positive-integer docId
at both entry points; the M-3 row-grain contract binds a DISTINCT-CLAIM subquery with the +1
sentinel and states the ceiling is a post-materialization assertion. `ae45bc1`: tests only
(per-route banner pins + the flag-ON itest teaser-body assertion, 23→24 cases). `06e80df`:
`publishedUnionCountOf` extracted and shared; corpus-wholly-incomparable qualifier is
corpus-only by construction; zero-eligible qualifier renders only at `eligibleCount === 0`;
index-card caveat travels with the first number; demonstration label on the overview.
`f58858d`: `dir="ltr"` bidi isolation on `Ratio`/`Counts`, logical `text-start`/`text-end`,
variant in the accessible link name, new `localization.test.tsx`. `a2ddca8`: q7 gated on the
same `publishedUnionCount !== 0` as q2, two pinning tests. One LOW noted: the pre-existing
claimId/sourceReliability refusals echo `String(value)` (console-only; nothing catches and
persists these errors today).

## 4. Phase C — attack outcomes (full detail in the finding register)

1. **Source independence**: metric = distinct non-mirror `docId`s; `sourceDomain` present on
   every doc but unused; only mirror-links model dependence. Offline report says "independent
   documents" (honest); schema field names (`independentSources`, `independentSourceCount`),
   P7 prose ("source-independence diagnostics"), and `THIN_SOURCED_NOTE` ("independent source
   documents") overclaim. CONFIRMED as a construct-labeling gap.
2. **Stub truth**: `STUB_ADAPTER_NAMES` (evidence-records.ts:151) vs `stubs.ts`; the only
   cross-checking test (`stub-isolation.test.ts`) uses its own local set — **no structural
   drift test exists**; the "keep in sync" comment is the only enforcement. CONFIRMED.
3. **Terminal gates**: fully replayed at `a2ddca8` — §5 below.
4. **Backtest emulation**, recomputed via the module (not copied):
   - aggregates reproduce exactly (ROCA 15/36 · 15/22 · 15/22 · 16/22; Iran 12/21 · 16/21 ·
     15/21; every count field);
   - **designated-final edition handed to the legacy side** (`emulateLegacyScenario` receives
     `selectedScenarioReport(...)`): an undisclosed emulation choice — production selects the
     one `isw_reports` row per (theater, date) that discovery happened to store. CONFIRMED
     missing from L1–L5/F1–F10;
   - **F2 counterfactual computed but never rendered**: `matchableDropped` exists on the typed
     rows but appears in neither the markdown nor the aggregate; F2's "reported separately …
     so the direction is visible" is false of the rendered output. Recomputed: with the
     matchable reduction applied, legacy union = **14/17 = 82.4% ROCA / 6/8 = 75.0% Iran**;
   - **F4 counterfactual recomputed**: dropping empty-population rows lifts legacy presented
     coverage to **15/20 = 75.0% ROCA / 12/15 = 80.0% Iran** (the prior probe's 78.9% ROCA
     implies a slightly different row-exclusion rule; materiality confirmed either way);
   - **F5 mislabels the production surface**: `src/lib/scoreboard/summary.ts` computes an
     UNWEIGHTED PER-RUN MEAN of `coverage_pct`; no production surface presents a pooled 15/36.
     CONFIRMED;
   - **snapshot-kind probe**: all 41 scenarios at `at_publication` → **40×
     `no_proven_snapshot` + 1× `publication_gap`** — F9/P7 §3.4's "every scenario returns
     no_proven_snapshot" is a one-case overgeneralization;
   - `LEGACY_EMULATION_NOTES` holds 14 entries; F10 is report-only (disclosed follow-up).
5. **Primary metric**: `keyword-matcher.ts:102` and `pairsFromLlmMatches` implement
   `coverage: unit.compound ? "partial" : "full"` exactly as register #11 records; register
   #12's three blocking prerequisites accurately describe the gap. Gazetteer independently
   re-enumerated: **34 toponyms, all RU/UA-war geography, zero Iran/Gulf/Levant/Red-Sea
   entries** — the MEDIUM-3 degeneracy reproduces.
6. **Fixture circularity**: no committed artifact calls the Iran 57.1→76.2 delta a genuine or
   real-world gain; the phrase existed only in chat. The committed report leads with the
   binding fixture-only caveat and states ROCA parity first.
7. **Denominators**: 36-vs-22 re-derived by recomputation; the production scoreboard renders
   per-run rows + unweighted means (see F5).
8. **Decomposition**: judgment recorded in the final audit report.

## 5. Phase D — full gate battery at `a2ddca8` (all PASS; none NOT-RUN)

| # | Gate | Command / method | Result |
|---|---|---|---|
| 1 | clean tree, diff-check, markers | `git diff --check`; `status --porcelain`; conflict-marker grep | clean / 0 / 0 |
| 2 | targeted per-phase tests | `npx vitest run src/lib/conflicts src/lib/evals/conflict-* src/lib/evals/cli-dynamic-imports.test.ts src/app/conflicts src/components/conflicts` | **811/811 (43 files)** |
| 3 | typecheck | `npm run typecheck` | clean |
| 4 | lint | `npm run lint` | clean |
| 5 | full unit | `npm test` | **3,213 / 3,213 (228 files)** — reproduces the claimed tip count exactly |
| 6 | prod build, flag absent | `env -i` PATH/HOME + `NODE_ENV=production LLM_DISABLE=1`, unroutable `DATABASE_URL=postgres://u:p@127.0.0.1:1/nodb`, all paid keys blanked, `CONFLICTS_UI` absent | exit 0; **0** warn/error/failed/deprecat lines in the complete log; all four conflict routes `ƒ (dynamic)` in `app-paths-manifest.json` |
| 7 | flag-ON serve, unroutable DB | production `next start` with `CONFLICTS_UI=1`, same unroutable DB | every conflict page 200; the whole browser matrix (gate 10) ran against it — zero runtime DB dependency confirmed |
| 8 | disposable-Postgres suite | `npm run test:integration`, Neon creds inline (never echoed), paid keys blanked, `LLM_DISABLE=1` | **151 / 151 (21 files)**, 106 s; fork `br-jolly-sunset-atwnbsj1` created and **deleted** (no WARNING) |
| 9 | conflict CLI + refusals | 4 modes under `env -i` + a hard network kill-switch preload (aborts on any TCP connect/DNS/TLS/fetch; unix-domain IPC exempt); then 8 refusal probes with `OPENAI_API_KEY=sk-fake…`, `ANTHROPIC_API_KEY=sk-ant-fake…`, `EVAL_USD_CAP_DAILY=99`, fake `DATABASE_URL` | validate 8+6 cases, `sourceHash bb53aa70f176`/`83c39aaf3c5f` (exact P7 values); estimate **$0.0031** hypothetical; offline idempotent no-op; report verdicts `insufficient_data`; **zero kill-switch firings** = zero network attempts; all 8 refusals **exit 2** (`--execute-live` under profile, three equals-forms, unknown profile, unknown conflict, workload clash, generic live db-ack) |
| 10a | HTTP/RSC/prefetch/HEAD bodies, flag off | 11 routes × bare/RSC/prefetch/HEAD (44+ requests) against the flag-absent server | zero conflict tokens, zero fixture claim-text tokens in any body |
| 10b | evidence access tier, production posture | server with `CONFLICTS_UI=1` **and** `FEATURE_AUTH_GATE=true`; all **14** benchmark records × bare/RSC/prefetch, leak scan HTML-entity-unescaped over 52 claim-text tokens | every anonymous bare GET **307/308**; **zero** claim-text tokens in any of the 42 bodies |
| 10c | browser matrix (headless Chrome 151, raw CDP) | 8 pages × light/dark × 320/390/1280 | **48 states, zero document overflow** (`scrollWidth == clientWidth` everywhere); computed-style WCAG contrast inside `<main>`: **16 page/theme states, zero failures**; RTL: `dir="ltr"` bidi-isolated numeric runs present, **0** physical `text-left/right` classes in conflict tables; keyboard Tab-walks on 2 pages (17 and 25 distinct stops, **all** with a visible focus indicator, no traps); method stamps visible ≤1 in both screen and print media on every page/theme; `Page.printToPDF` 237 KB OK; q2/q7 agreement swept across **all 14 records — 0 inconsistent** (11 both-links, 3 neither incl. the gap record); gulf incomparable qualifier, zero-eligible qualifier, gap-not-zero all render |
| 11 | legal/source scan | every 6-word window of all **44** fixture unit texts (679 fragments) against the 5 persisted artifact surfaces (goldens, both results files, scorecard md+json) and the P7 report; secret + provider/retry greps over the whole range | **0 prose hits**; no secrets (the single pattern hit is the P7 report quoting its own grep command); **0** client/SDK/retry/SpendGuard additions |
| 12 | golden byte identity | `--profile conflict --offline --fresh` rescored all 14 cases through the real pipeline, then `git diff` | regenerated artifacts **byte-identical except one `updatedAt` line each**; `--report` differs only in `generatedAt`; both restored; `UPDATE_CONFLICT_GOLDENS` never set |
| 13 | ancestry/migration/status | re-checks at close | HEAD = `a2ddca8`; tree clean (one `package-lock.json` churn from this audit's own `npm install` — libc-field normalization — restored via `git checkout`, not a source change); `drizzle/` + journal untouched; zero paid calls; zero production writes |

Probe-fidelity note (honesty of record): the first browser-gate run reported three
evidence-route "FAILs" (HTTP 200 anonymously). Root cause: that server had `FEATURE_AUTH_GATE`
unset, and the inherited `requireAcceptedUser()` deliberately enforces nothing for anonymous
visitors when the flag is off (documented "local/demo parity" in `src/lib/gate.ts`, identical
to `/digests` posture). Re-run under production posture (10b): all PASS. Recorded as finding
F-NEW-6 (flag coupling), not as a product defect. The initial run's leak scan also compared
entity-escaped HTML; 10b re-ran unescaped.

## 6. Session-boundary declarations

No merge to `main`, no push, no PR, no deploy, no feature enablement, no environment change,
no paid provider call (proven by kill-switch + fake-key refusals + blanked keys throughout),
no production database write (the only DB contact was one disposable Neon fork created and
deleted through the existing harness), no edit to any non-audit worktree, no golden
rebaselining. The three Phase-E reviewer verdicts are recorded before any remediation.
