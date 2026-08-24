# QF-C landing — analysis-eval control plane (2026-08-24)

Worktree C of the quality-foundation program, landed as its own release train per the
operator's 2026-08-25 adjudication plan (stage 3c), after QF-A (PR #14). Feature content
and audit history: `docs/reviews/ANALYSIS-EVAL-CONTROL-PLANE-2026-08-17.md` (rides in this
PR) and the independent final audit at `858bb9a` (verdict for C: "READY as offline
machinery"; paid/binding evaluation separately NOT READY — deliberately unchanged here,
see §5).

## 1. Extraction, carries, and fidelity

- Source strand: `codex/analysis-eval-control-plane-20260817` (tip `ce3c985`), forked from
  the QF base `05fdd2c`. Own delta: 17 commits; `src/lib/evals/*`,
  `scripts/analysis-eval.ts`, `scripts/model-routing-inspect.ts`, plus two pure refactors
  of production files (below). No `drizzle/` change.
- Method: `git rebase --onto main 05fdd2c` in a fresh worktree, re-based onto `main`
  `d4557c4` (post-QF-A — the `ba35082` carry depends on QF-A's canonical calculator).
- **Conflict ledger: EMPTY** — all 17 commits replayed clean; the only files shared with
  `main`'s movement were `.gitignore` and `map-worker.ts`, both auto-merged and verified
  by content below (H4).
- **`range-diff` proof: 17/17 commits `=`** (byte-identical patches).
- **Declared carries (both from the QF integration line, recorded per plan H5):**
  - `13d3df8` — an **identical patch** of `ba35082` (`evals: swap recency probe to the
    canonical calculator; re-pin fixtures to linear-interpolation percentiles`), the
    cross-line carry the plan requires. Verified byte-identical via `git show` diff.
  - `22c649f` — the QF tip's `.env.example` eval-cap documentation block (from `7150b49`),
    which the plan's strand list omitted; carried because it documents exactly the envs
    `eval-guard.ts` reads.

## 2. H4 resolution — the production-runtime touches are pure refactors

- `src/lib/analysis/map-worker.ts` delta vs `main`: **12 lines** — extraction of
  `mapOutTokensPerDoc()` from `mapBatchMaxTokens()` (exported so the eval plane records
  the knob a run executed under); arithmetic, bounds, and defaults identical. Main's
  PR #7 lease and PR #10 scalar-safe truncation code are untouched and their suites pass
  on this tree (`map-lease.test.ts`, `map-worker-spend.test.ts`, `map-prompts.test.ts`,
  `map-request-wellformed.test.ts`: 69/69).
- `src/lib/validation/llm-match.ts` delta vs `main`: export/rename of the match
  schema/system prompt/user-prompt builder plus extraction of pure `sanitizeMatches()`
  (identical index-range, claimId-validity, confidence≥0.6, fail-closed-to-null
  semantics) so the eval plane hashes and dispatches the EXACT production contract.
- **Conclusion: no runtime behavior change.** The plan's no-standalone-soak line stands;
  the A9 escalation in the execution addendum is not triggered.

## 3. Invariants

- **H1 assertion:** `dropIsolatedSurrogates` present (4 occurrences);
  `map-prompts` + `map-request-wellformed` suites PASS on the landed tree.
- **Ruling 4 (verified directly):** `eval-guard.ts` has NO out-of-production default —
  `EVAL_USD_CAP_DAILY` unset ⇒ `tryReserve` refuses everywhere; all-time backstop =
  shared `LLM_SPRINT_USD_CAP`; separate `openai_eval` ledger row. **No `EVAL_*` env
  exists in any Vercel environment** (verified against the 86-row listing), so live
  eval dispatch remains impossible after deploy until the operator's §6 authorization —
  the intended fail-closed posture, documented in the carried `.env.example` block.
- Rulings 13/18: eval consumers measure production config (K=5 pinned in the eval
  contracts); no REDUCE_VOTES change; extractor-version literals pinned by test.
- Ruling 5: no `drizzle/` change. Vendor-branding scan over all 20 commits: clean.

## 4. Gates on the exact landed tree

| Gate | Result |
|---|---|
| typecheck | clean |
| lint | clean |
| unit | 2,518/2,518 (188 files) |
| integration (disposable Neon fork) | 119/119 (19 files) |
| H1 + lease/spend pins | 69/69 (4 files) |
| pre-push hook | green at push |

## 5. Deliberately NOT in this landing (stage-5/§6 gated)

The audit's 11-item "close before first binding paid evaluation" hardening list
(report-time identity recompute; baseline identity gating; `MIN_REPETITIONS`; `--fresh`
acknowledgement/provenance; aligned-pairwise degraded-status denominators; heldout
`mustNotMatch` pins; numeral-preservation instrument; envKnobs surfacing; union-aware
lazy-`@/db` pin; `--db-ack` production-host refusal; recursive `scripts/` scan) is
**stage-5 work under the §6 gate**, not landing work: per audit finding A14-F1, every one
of those fixes must be specified against BOTH the QF `modeReport` path and the conflict
branch's `conflictModeReport` path and verified on the merged tree — i.e. after the
conflict eval-profile PR lands. Landing them now would guarantee a second pass. Paid
evaluation remains blocked until that list closes AND the operator explicitly authorizes
caps and candidate identity (§6 of the adjudication plan).

## 6. Independent adversarial review of the landed delta (plan addendum A1)

Five lenses (spend-guard proof, map/llm-match interaction, runner integrity,
recency-adapter arithmetic, hostile base-drift), non-note findings adversarially
verified. Scope rule enforced: the deferred 11-item pre-paid-eval hardening list was
excluded from findings by instruction.

**Result: ONE confirmed finding (doc-only, should-fix), fixed at landing; one refuted;
all other lens verifications affirmatively clean.**

- CONFIRMED: the carried `.env.example` block overstated fail-closed semantics (claimed
  all four envs fail closed; in code only `EVAL_USD_CAP_DAILY` does, the request caps
  are bounded in-code defaults 300/200) and omitted the required `LLM_SPRINT_USD_CAP`
  backstop. The overstatement is the QF tip's own text, faithfully carried. **CLOSED at
  landing** — commit `9b2d029` states the guard's real semantics and adds the backstop
  line. Not a ruling-4 code violation: spend stays bounded, the USD caps do fail closed.
- REFUTED (recorded): the date-stamped offline baseline snapshot retains the pre-ba35082
  reduce dataset hash — intentional historical artifact; no code consumes it (the runtime
  pairwise baseline is `loadResults()` over `results/`, and gates refuse cross-hash
  comparison); its supersession declaration belongs to the stage-5 baseline-identity item.
- Affirmative verifications (recorded by the lenses): all four $0 modes proven
  provider-free and DB-free by import-graph trace; every preflight refusal precedes
  client construction; `buildLiveDeps` runs only after `DATABASE_URL` is overwritten
  with the acknowledged `EVAL_DATABASE_URL` (the `openai_eval` ledger cannot write to
  production); `tryReserve` precedes every physical dispatch and the 429 retry takes a
  fresh reservation; the four extractor-version literals intact; recomputed offline
  identities and dataset hashes match all committed artifacts on the moved base; eval-plane
  unit suites 109/109; map-worker/llm-match deltas byte-verified as the declared pure
  refactors; `openai-client.test.ts`'s factory-only pin valid on this base.

## 7. Landing identity

- PR #15; merged to `main` as a `Merge PR #15:` merge commit.
- Deploy: **NOT performed** — separate operator action. QF-C is repository tooling plus
  two pure refactors; per the plan it needs no standalone soak. It can ride the next
  authorized deploy (QF-A's, or a combined one — operator's choice); rollback target =
  current production `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`.
