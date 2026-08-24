# Conflict evaluator landed — seven reviewed PRs, default-off (2026-08-24)

The conflict/region evaluation program (audited runtime `a2ddca8`, audit documentation
`da44272`, base `7150b49`) landed on `main` as the audited seven-PR decomposition (P7
report §5.1), per the operator's 2026-08-25 adjudication plan stage 4.

## 1. The seven PRs

| # | PR | Merge | Files | Recorded gate verdict |
|---|---|---|---|---|
| 1 | #16 frozen contract + pure domain (gates 0+1) | `dd310c7` | 23 | Gate 0 double-PASS; Gate 1 PASS after remediation |
| 2 | #17 reference reports, editions, windows | `bc2e6b2` | 17 | Gate 2 dual-PASS after remediation |
| 3 | #18 evidence union | `4cf0a75` | 14 | Gate 3 dual-PASS after remediation |
| 4 | #19 combined scorer + goldens | `b687b63` | 23 | Gate 4 dual-PASS after remediation |
| 5 | #20 eval-plane conflict profile | `77369ad` | 12 | Gate 5 dual-PASS after remediation |
| 6 | #21 feature-off product UX | `3e37b52` | 29 | Gate 6 dual-PASS |
| 7 | #22 integration artifacts + audit record | `e359c61` | 13 | Phase-7 merge `4e900a6`; final audit `independent-audit-pass / soak-and-enablement-blocked` |

Ordering constraints honored: PR 5 landed after QF-C (PR #15) against the exact
`scripts/analysis-eval.ts` the program built against (byte-identical, verified); its
hunks applied +281/−4 additively.

## 2. Fidelity proof

- Construction: file-level carve of the audited FINAL states (not a commit replay — the
  106-commit history interleaves `--no-ff` gate merges), each PR's files checked out from
  `a2ddca8` (or `da44272` for the three audit-updated docs) with per-blob hash
  verification at build time.
- **End-state proof: all 125 files of the conflict delta on merged `main` are
  blob-identical to the audited trees** (`a2ddca8` finals; `da44272` for
  register/P7-report/index). Zero divergence.
- Recorded deviations from §5.1's phase-era Contents column (dependency-order, proven by
  an import-graph check across the cumulative chain — zero forward references):
  `eval-profile`(+test) PR 1→4 and `snapshot-ref`(+test) PR 5→4 (their audited final
  states and the final scorer are mutually dependent).
- The audit's AGENTS.md decision-log entry carried **verbatim** (chronological carry,
  original 2026-08-18 date; append-only history untouched).
- Plan corrections recorded: `authz-page-gate.itest.ts` gains NO ROUTES row by the
  program's own documented design (the plan's §5.4 expected rows) — the gated route's
  body-leak assertions run flag-on in `conflict-feature-off.itest.ts`, with the recorded
  binding obligation to migrate them if that harness is retired; and `a2ddca8` sits 11
  remediation commits past the p7 gate branch, so the PRs land the FINAL audited states,
  not the raw phase tips.

## 3. Full combined gates after all seven (exact tree `e359c61`)

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | clean |
| unit | 3,329/3,329 (231 files) |
| integration (disposable Neon fork, incl. `conflict-reference-repo.itest.ts` + `conflict-feature-off.itest.ts`) | 151/151 (21 files) — includes the flag-on/flag-off body-leak assertions of `conflict-feature-off.itest.ts` (the required smoke, in its integration-test form) and `conflict-reference-repo.itest.ts` against the disposable-fork DDL |
| per-PR pre-push hooks | green ×7 (each push + each main merge) |

## 4. Combined adversarial review of the merged result (plan addendum A1)

Four lenses over the merged tree (flag-off safety trace, the merged
`analysis-eval.ts`, authorization surfaces, eval-plane coexistence), non-note findings
adversarially verified. **Result: ZERO confirmed defects.** Four notes, dispositioned:

- `docs/evals/analysis/README.md` did not acknowledge the conflict plane's committed
  artifacts — a maintainer could mistake them for deletable strays. **CLOSED in this
  closeout PR** (coexistence note added; the lenses verified no functional clobber is
  possible: filename regexes, scorecard paths and regeneration paths are disjoint).
- `robots.ts` has no disallow for the gated evidence route — contract-conformant while
  the flag is off (routes 404 before data access); **added to the enablement checklist**
  (§6) alongside F-NEW-6.
- `conflict-feature-off.itest.ts` relies on the ambient absence of `CONFLICTS_UI` for
  its OFF phase rather than pinning it — fails safe (loud failure, never a vacuous
  pass); instrument-robustness note, recorded only.
- Affirmative verifications: conflicts suites 728/728 (33 files) and evals 138/138 (12
  files) on the merged tree; isolation scans clean with no new exemptions; `tsc` clean;
  both planes' committed artifacts byte-match their recomputed dataset hashes and
  offline identities post-merge (the llm-match export refactor staled nothing).

## 5. Deploy request (operator action — prepared, NOT executed)

- One deploy, from a plain clone (`/Users/go/code/bnow-net-rel-20260823`, on `main`),
  with **`CONFLICTS_UI` ABSENT** (verified absent in all Vercel environments) and
  **`FEATURE_AUTH_GATE=true`** (verified present in Production). No env change needed or
  authorized.
- Rollback target: `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2` (current production).
- Post-deploy smoke (smoke ONLY — no conflict shadow soak, do not enable the UI):
  anonymous bare + `RSC: 1` GETs on `/conflicts`, `/conflicts/<slug>`, and the benchmark/
  evidence routes must return no conflict token in any BODY; `/health` 200 with commit
  stamp (plain clone ⇒ stamp present); spot-check one gated route as accepted user
  (404 — flag off).
- This deploy also takes QF-A + QF-C live (single combined deploy) unless the operator
  prefers QF-A alone first; QF-A's ≥1-day digest-cycle observation starts at whichever
  deploy carries it.

## 6. Standing blockers (recorded, NOT attempted)

The real conflict shadow soak stays blocked on: compound-unit calibration; assessment
diagnostics (denominator-unchanged third class); the Iran keyword rung (pre-soak CODE
change — the gazetteer is RU/UA-only); source-independence semantics (F-NEW-1 relabel +
sourceDomain-grain diagnostic); sample-power sizing (R-M-6). Enablement additionally
requires the checklist in the final audit (incl. F-NEW-6: `FEATURE_AUTH_GATE=true`
everywhere `CONFLICTS_UI` is set, plus a `robots.ts` disallow for the gated evidence
route — combined-review note) and a decision-log entry. Paid conflict evals share the
QF §6 gate.
