# Phase 5 — snapshot contract + evals-plane adapter (implementation report)

Branch `codex/conflict-evaluations-p5-adapter` (from the Phase-4 merge
`c1a0a5e`). Phase 5 ships: the ConflictSnapshotRef provenance CONTRACT with
its refusal wiring, the two prior-gate BINDING obligations (votesK threading;
anchor-alphabet tightening), and the register-#3 evals-plane profile — the
conflict datasets riding the INHERITED validation workload through the
existing control plane, offline fixture-oracle only. **No cron, no route, no
migration, no live dispatch path, zero paid calls; the frozen validation
stack and the evals runner core are untouched.** Commits: `d0d9a8d`
(votesK + the sanctioned 2-key golden re-baseline), `b4f8799` (snapshot
contract + anchor tightening + capture design doc), `0fbb5ec` (evals profile
+ CLI modes + committed run artifacts), `5199274` (NUL-escape test hygiene),
plus the pre-gate round (`conflict-cli-refusals.test.ts`; this report).

## 1. Files created/edited

**Evals plane (every edit itemized):**

- `scripts/analysis-eval.ts` — five hunks, all conflict-mode additive:
  (1) the conflict-mode block (types for the dynamically imported profile
  module, `CONFLICT_REPORT_PATH`, `parseConflictIds`); (2)+(3) the
  results-path/load seam generalized so conflict results files
  (`conflict-<dataset>-<config>.json`) sit beside the workload-keyed ones
  without touching their naming; (4) the four conflict mode handlers
  (`conflictModeValidate` / `conflictModeEstimate` / `conflictModeOffline` /
  `conflictModeReport`, ~206 lines); (5) the `main()` profile gate — the
  `--profile` allowlist and the conflict-mode refusals (`--execute-live`
  and `--workload` refuse BEFORE the mode-scoped dynamic import; unknown
  `--conflict` ids refuse after it, naming the valid ids).
- `src/lib/evals/conflict-validation-profile.ts` (NEW) — the register-#3
  adapter: dataset builders deriving `conflict-roca-v1` / `conflict-iran-v1`
  from the frozen corpus + committed goldens; offline fixture-oracle scoring
  through the REAL Phase-4 pipeline with golden byte-compare + persistence
  gate as the only scoring authority; stored-error discipline (structural
  key paths only).
- `src/lib/evals/conflict-validation-profile.test.ts` (NEW) — dataset
  validity under the INHERITED validator, determinism, hash/label pins,
  scoring behavior, zero-meter pins.
- `src/lib/evals/conflict-cli-refusals.test.ts` (NEW, pre-gate NOTE-3) —
  subprocess pins of the CLI refusals + the blanked-env positive control
  (§6).
- Committed run artifacts: `docs/evals/analysis/results/conflict-*.json`
  (8 + 6 offline results), `CONFLICT-EVAL-SCORECARD.md/.json`.

**Conflicts side (each edit fulfills a named prior-gate obligation):**

- `src/lib/conflicts/llm-compatible-matcher.ts` + `scorer.ts` +
  `match-contract.test.ts` — **votesK threading = Gate-4 science NOTE-3,
  BINDING on P5**: the adapter carries the REQUESTED vote budget through the
  keyword fallback (voteRounds stays null — zero usable rounds is the honest
  count), so a fully-degraded k=5 run no longer pools with a hypothetical
  k=0 in `runGroupKey` grouping.
- `src/lib/conflicts/eval-profile.ts` — **anchor-alphabet tightening = the
  Gate-4 legal NOTE's ≤64-char anchor-clause option, ADOPTED**:
  `RAW_ANCHOR_TOKEN_ALPHABET` restricts the bounded-token form to letters,
  digits, space, and `. , : ; + - / ( )` — quotes, braces, angle brackets,
  backslashes, control chars, and non-ASCII refused (a stored-result channel
  should not admit markup-capable bytes). Both committed corpus anchors
  remain admitted — zero golden drift.
- `src/lib/conflicts/snapshot-ref.ts` + `.test.ts` + `scorer.ts` snapshot
  stamp + `offline-report.ts` render + `goldens.ts` —
  **snapshot identity = the P4 deferred `snapshot: { ref: null }` stamp**,
  now `ConflictSnapshotRefV1 | null` (§3); the fixture/golden path passes
  nothing → null, so golden bytes are unchanged by the contract's existence.
- `docs/designs/CONFLICT-SNAPSHOT-CAPTURE.md` (NEW) — the DESIGNED,
  not-implemented application capture path. The design doc is NOT
  authorization (§7).
- `matcher-import-hygiene.test.ts` — snapshot-ref added to the pure-module
  scan. `snapshot-ref.test.ts` NUL-escape (`5199274`) keeps the hostile
  locator probe text-diffable (test hygiene only).

## 2. The placement decision (register #3; no new register entry required)

The register-#3 extension decision is implemented exactly as recorded: a
conflict dataset profile UNDER THE EXISTING `validation` workload. The
adapter lives INSIDE `src/lib/evals/` and imports FROM `src/lib/conflicts/`
— the import-isolation rule forbids only the REVERSE direction (no non-test
src/ file outside the eval library may reference an evals module), so
evals-internal composition is the sanctioned seam. The CLI reaches the
module through a mode-scoped dynamic import (the live-runner pattern), so
the CLI's pinned STATIC import surface (contracts + runner,
`isolation.test.ts`) is unchanged and the isolation test needed NO
amendment. The alternative — a new first-class workload — was NOT taken: it
would have touched the exhaustive workload switch, the runner core, the
results-store format, and the gates for zero additional proof. Because the
implementation matches the recorded register decision with no deviation, no
new decision-register entry is required.

## 3. ConflictSnapshotRefV1 semantics

- **Kinds:** `fixture` and `retrospective_labeled` (the two satisfiable
  kinds today) plus the three snapshot-anchored kinds
  (`operational_cutoff` / `at_publication` / `finalized`) that mirror the
  evaluation kinds they would prove.
- **Per-rung refusals:** `resolveConflictSnapshot` refuses with BOUNDED
  `SnapshotRefusalDetail` tokens at every rung — invalid ref shape, kind
  mismatch, conflict mismatch, missing artifact, hash mismatch, policy
  drift — never free text.
- **The terminal `population_unproven` rule = register #5, mechanically:**
  the three snapshot kinds terminate in `population_unproven` EVEN FOR a
  hash-verified artifact, because no reviewed capture path exists in this
  workstream. Lifting it requires the designed capture path PLUS its own
  review PLUS a new decision-register entry (code change; not
  configuration).
- **Policy-version equality:** the ref's recorded versions (roster,
  classifier, scope, epoch) must EQUAL the current ones — a drifted capture
  cannot prove a current-population evaluation.
- **Value-free errors** (Gate-4 legal stored-error discipline, binding on
  P5): validator/refusal strings never echo locator/provenance/hash values.
- **Allowlisted fixture store:** the only IO is the fixture artifact store
  over the committed corpus files (`CONFLICT_FIXTURE_FILES` allowlist),
  byte-hashed.

## 4. The sanctioned golden re-baseline (exactly 2 keys)

`d0d9a8d` re-baselined `cc-matcher-failclosed-013b#B-zero-valid-rounds`
ONLY — the two keys the votesK threading changes and nothing else:

```
-      "votesK": null
+      "votesK": 5
-    "runGroupKey": "…|llm-compatible|k=0",
+    "runGroupKey": "…|llm-compatible|k=5",
```

Reviewed diff; every other golden byte identical; the drift gate passes on
every run since. This is the Gate-4 science NOTE-3 obligation landing, not
a semantic drift.

## 5. Dataset/case design judgment calls

1. **Golden-covered scenarios only** — a case's expected result IS its
   committed golden, so every case check is a byte-compare against a
   reviewed artifact, never a fresh oracle run trusted at eval time.
2. **`CONFLICT_CASE_PLANS` heldout 1+1+1** — each dataset holds out exactly
   one typical, one edge, one adversarial case (roca 8 cases / iran 6),
   satisfying the inherited heldout minima with the ladder variants as
   adversarial members.
3. **`datasetContentHash` over canonical byte sources** — the hash covers
   the fixture files + golden file bytes the dataset derives from, so any
   upstream drift changes the dataset identity.
4. **Lowest-claimId full-coverage labels** — the inherited single-label
   slot takes the lowest claimId among the oracle's full-coverage pairs
   (deterministic; the full pair set lives in the conflict extension).
5. **Pinned `createdAt`** — a constant, so two builds of the same sources
   are byte-identical (no wall-clock in dataset identity).
6. **`offlineIdentity` reuse** — the offline config reuses the inherited
   identity mechanism (provider=stub, model=offline-fixtures) rather than
   minting a parallel scheme.
7. **Honest zero meters** — offline results record 0 attempts/reservations/
   meterings and $0.0000, asserted, never fabricated latency/tokens.

## 6. Gates (exact)

At `0fbb5ec` (author round): typecheck clean · lint clean · `npm test`
**3,092 passed / 3,092 (216 files)** · `TZ=Asia/Tokyo` conflicts+evals
**796 passed / 796 (39 files)**.

At the final tip (with the pre-gate CLI-refusal pins): typecheck clean ·
lint clean · `npm test` **3,097 passed / 3,097 (217 files)** ·
`TZ=Asia/Tokyo npx vitest run src/lib/conflicts/ src/lib/evals/`
**801 passed / 801 (40 files)** · `git diff --check` clean · tree clean ·
goldens byte-identical (post-re-baseline).

CLI observed outputs (re-observed at the final tip, read-only, blanked
env):

- `--profile conflict --validate-dataset` → exit 0:
  `[conflict/russia_ukraine] OK — conflict-roca-v1: 8 cases (heldout
  typical/edge/adversarial: 1/1/1) sourceHash=427b71033bb9` ·
  `[conflict/iran_regional] OK — conflict-iran-v1: 6 cases (heldout
  typical/edge/adversarial: 1/1/1) sourceHash=109fcfff6e69` · "No DB, no
  provider, nothing written."
- Offline scoring: **14/14** (8/8 roca + 6/6 iran, scorecard-recorded
  checks 8/8 and 6/6, machinery proof 14/14, zero meters, $0.0000);
  **resume proof** — a rerun reports `nothing to do — 8 result(s) already
  recorded` / `6 result(s) already recorded` and writes nothing (tree
  clean after).
- `--profile conflict --estimate` → grand total **$0.0031**, labeled "a
  HYPOTHETICAL live validation-matcher run; no live conflict path exists
  in this workstream".
- `--profile conflict --execute-live` → exit 2, "NO live dispatch path"
  (now subprocess-pinned with the other refusals + the blanked-env
  positive control in `conflict-cli-refusals.test.ts`, 5/5).

## 7. Residual risks (for the two Gate-5 reviewers)

- The conflict results-FILENAME convention sits beside the inherited
  workload-keyed one — collision-impossible today (`conflict-` prefix vs
  workload names); pin the disjointness if the convention grows.
- `isolation.test.ts` pins the static import surface but does not yet
  enumerate the ALLOWED dynamic imports — a future mode could quietly
  dynamic-import something heavier; an allowlist assertion is a cheap
  strengthening.
- `population_unproven` is liftable ONLY by code change + a new register
  entry — by design; reviewers should confirm no configuration path
  circumvents it.
- The scorer/persistence gate validate the snapshot REF's structure, not
  the artifact bytes (callers resolve first) — acceptable ONLY while the
  store is fixture-backed; a durable store must re-verify at read.
- Label semantics: if the inherited keyword diagnostics ever run over
  conflict cases, the lowest-claimId single-label slot is a projection of
  the full pair set — the extension carries the truth; do not read the
  slot as complete.
- Scorecard timestamps are RUN artifacts (regeneration changes them) —
  byte-stability claims cover results/goldens, not the scorecard header.
- The estimate mode's "hypothetical" wording is load-bearing: no live
  conflict path exists, and the estimate must never be read as a plan.
- `docs/designs/CONFLICT-SNAPSHOT-CAPTURE.md` is a DESIGN, not
  authorization — implementing it needs its own review + register entry.

## 8. Pre-gate verification round

Two pre-gate verifiers ran against `5199274`: **both returned CLEAN — zero
findings above NOTE.** The two NOTEs acted on: NOTE-3 → the CLI-refusal
subprocess pins (`evals: pin the conflict-mode CLI refusals`); NOTE-2 →
this committed report. The NUL-escape commit (`5199274`) predates the
round and is test hygiene only (the hostile-locator probe byte is spelled
as an escape so the test file stays text-diffable).

Zero paid provider calls, zero production writes, no migration, no env
change, no deploy, no push — branch/worktree only.
