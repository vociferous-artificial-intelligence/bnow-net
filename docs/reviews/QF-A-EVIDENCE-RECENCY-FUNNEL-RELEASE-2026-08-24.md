# QF-A landing — evidence recency + quality funnel (2026-08-24)

Worktree A of the quality-foundation program, landed as its own release train per the
operator's 2026-08-25 adjudication plan (stage 3b). Feature content and audit history:
`docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md` (rides in this PR) and the
independent final audit at `858bb9a` (verdict for A: "CORRECT and merge-reviewable").

## 1. Extraction and fidelity

- Source strand: `codex/evidence-quality-observability-20260817` (tip `74d0f40`), forked
  from the QF base `05fdd2c`. Its own delta: 6 commits, 13 files, no `drizzle/` change.
- Method: `git rebase --onto origin/main 05fdd2c` in a fresh worktree, onto `main` at
  `30088bf` (post-PR #12/#13).
- **Conflict ledger: EMPTY** — zero conflicts; the strand's file set has zero overlap
  with `main`'s delta since `05fdd2c` (verified by `comm` over both `--name-only` sets).
- **`range-diff` proof: 6/6 commits `=`** (byte-identical patches):
  `c3e352b=c73310c · bf83ad9=fba8b63 · 2019aea=865d2f0 · f45fdd0=94f5c25 ·
  a787500=a82fe5d · 74d0f40=7f13c7d`.

## 2. Audit follow-ups implemented at landing (5 commits on top)

Per the adjudication plan's "reopen and repair any audit findings still outstanding
against QF-A from `858bb9a`" — one commit per register finding:

| Finding | Severity | Commit | What landed |
|---|---|---|---|
| FUNNEL-A12-1 | MEDIUM | `a81e157` | `docsInFedGroups` surfaced in funnel JSON + human output from persisted `stats.docsAnalyzed`; null (never 0) for pre-stat digests; legacy engine's different-semantics counter deliberately kept out |
| FUNNEL-A12-2 | MEDIUM | `7f462c2` | Roster-aware pending labels via the real `mapTheaters()`; off-roster pending docs warn "NOT scheduled to drain"; env-driven membership pinned in both directions |
| FUNNEL-A12-3 | MINOR | `007a65a` | "will NEVER map" overstatement corrected to true lexicon-skip semantics (hourly cron will not revisit; lexicon change + #33 remap could) |
| A-REC-1 | MINOR | `6fbc594` | Two skew-boundary equality pins (published == asOf+skew accepted; lag == −skew clamps to 0) |
| SCI-N4 | NOTE | `7631d32` | `documentCount` reconciliation mirroring the existing `claimCount` check; warning-only, silent when the stat is absent |

Not implemented, recorded as debt: FUNNEL-A12-4 (platform/language citation-side
dimensions — corpus-roadmap scale, not a landing repair).

## 3. Invariants (§8 of the adjudication plan)

- **H1 assertion:** `dropIsolatedSurrogates` present in `src/lib/analysis/map-prompts.ts`
  (4 occurrences) on the landed tree; `map-prompts.test.ts` +
  `map-request-wellformed.test.ts` = 49/49 PASS.
- Ruling 17 (persist guard refuses empty/thin overwrites): untouched; recency stats are
  computed only after the overwrite verdict allows the write (test-pinned).
- Ruling 18 (K=5 + majority-gid fill): untouched — synthesize.ts delta is additive vote
  counters + honest `asOf` only.
- Ruling 19 (publication guard): recency measured on the exact post-guard shape, fail-open,
  never mutating events; guard ordering unchanged.
- Ruling 3: the funnel's SQL and the persist-time doc read exclude stub content at query
  level. Ruling 4: zero new paid call sites. No `drizzle/` change (ruling 5 moot).
- Vendor-branding scan over all 11 commits and file contents: clean.

## 4. Gates on the exact landed tree

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | clean |
| unit | 2,412/2,412 (180 files) |
| integration (disposable Neon fork) | 119/119 (19 files) |
| H1 test files | 49/49 |
| pre-push hook | green at push |

(Faithful-rebase intermediate tree, before the 5 remediation commits, was separately
gated green: 2,404/2,404 unit · 119/119 integration.)

## 5. Independent adversarial review of the landed delta (plan addendum A1)

Five lenses (recency-arithmetic re-derivation, funnel honesty, digest invariants
17/18/19, remediation fidelity, hostile interaction with post-lease/post-#86 `main`);
every non-note finding was adversarially verified by an independent agent.

**Result: ZERO confirmed defects — no blockers, no should-fixes.** Seven notes,
dispositioned:

- Roster-label env provenance (four convergent notes): the off-roster drain label reads
  the report host's `MAP_THEATERS`, so an unmirrored local env could mislabel the drain
  schedule. **CLOSED at landing** — commit `92030cd` prints the roster consulted
  (`mapRoster` in the JSON shape + human provenance line + HOW_TO_READ caveat), with two
  test pins.
- Stale "will NEVER map" wording in the historical strand review doc: **CLOSED** — dated
  landing correction appended (the audit's own `bd29d89` precedent).
- Historical gate figures in the strand review doc: superseded by this record's
  exact-tree gates; the doc is dated and self-identifying, so it stands unrewritten.
- Mirror `doc_claims` rows silently skipped without a warning (audit register
  FUNNEL-A12-5, recorded-no-action): remains recorded debt — OPEN-TASKS #99.

## 6. Landing identity

- PR #14; merged to `main` as a `Merge PR #14:` merge commit (identity recorded in the
  adjudication register and PROGRESS after the merge, per the QF-B precedent).
- Deploy: **NOT performed** — a separate operator action per the standing 2026-08-03
  ruling. Prepared request: deploy from a plain clone (worktree deploys ship no commit
  stamp, OPEN-TASKS #78), rollback target = current production
  `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`. After deploy: observe ≥1 complete day/digest cycle
  (all 4 digest crons) — expected signature is additive `structured.stats.evidenceRecency`
  keys on new digests, zero change to published events/claims, funnel report readable
  against production data.
