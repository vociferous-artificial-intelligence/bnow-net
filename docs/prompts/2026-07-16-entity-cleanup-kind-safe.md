# Coding-agent handoff — kind-safe entity cleanup

Date: 2026-07-16. Scope: application code and tests only; the current Codex session is
documentation/operations-only and made no cleanup mutation or provider call. The claim-linked
OpenSanctions spend boundary originally included here is now implemented, tested, deployed, and
must not be reimplemented by this handoff.

Recommended model: **Claude Opus 4.8**
Effort: **high**
Use Fable 5 only if available and the operator accepts the higher cost for a particularly
long-running, high-complexity implementation.

## Why this handoff exists

The operator-requested fresh production dry run exposed a blocker that makes the current #61
cleanup unsafe to approve:

1. `planCleanup()` groups by `canonicalKey(name)` without `kind`, but deployed persistence caches
   identity as `(kind, canonicalKey)` in `digest-persist.ts`. The current 1,012-row plan proposes
   131 merges, **79 cross-kind**. Applying them would collapse rows that the next persist can
   legitimately recreate under the missing kind, contradicting the claimed durability fix.

Completed prerequisite: commit `be0ebf1`, deployed as `dpl_2p13bnGVNv2VfVVNQkVe4nW3CEaj`, now
requires a `claim_entities` link in normal/rescore candidate and `remaining` paths. It reduced the
normal billable population from 232 to 46 with zero paid rollout calls. Commit `165c2b4` then
restored the full 32/32 integration gate. Treat those semantics and tests as a regression boundary.

Current read-only evidence (2026-07-16):

- cleanup: `1012 -> 794` (`87` drops, `131` merges); 814 claim-entity edges; 86 drop edges;
  ≤72 merge edges; claims/claim_sources untouched;
- cross-kind merges: `79/131`, carrying 46 source edges;
- same-kind-only projection: `1012 -> 873` (`87` drops, `52` merges), 26 repointed edges;
- full-plan simulated survivors: 794 total, 397 linked / 397 zero-link;
- kind-safe-only simulated survivors: 873 total, 419 linked / 454 zero-link;
- current OpenSanctions: 1,012 eligible; 780 checked; 232 missing/stub; 475 live matches;
  165 sanctioned; among claim-linked rows, 429 checked and 46 missing/stub;
- July ledger: 780 requests / $85.8000; July 16 already used 120 requests / $13.2000;
  cap is 2,000/month, 200/day, 120/run.

Representative cross-kind defects include Russian/Ukrainian armed forces (`org|agency` →
`faction`), Ukrainian Navy (`faction|agency` → `org`), IRGC (`faction|agency` → `org`), Rosatom
(`company` → `agency`), and one `agency` “Alejandro Dominguez” → `person`. Exact list can be
reproduced from the dry-run rows; do not hard-code this sample.

Display-policy defect found in the same pass: bare ASCII `Filashkin` currently auto-merges into
the sole full-name target `Вадим Филашкин`. The cleanup runbook says canonical display names are
English, so that merge must be review-only unless an approved English full-name target exists.

Observed geography gaps relative to the current drop policy include at least Jordan, Morocco,
Tehran, Bandar Abbas, Argentina, Damascus, Pakistan, Canada, and Mexico. The current policy drops
countries/cities as non-actors, so adjudicate this list consistently rather than spending on them.

## Files to inspect

- `src/lib/entities/canonicalize.ts` — `canonicalKey`, `planCleanup`, canonical winner selection,
  surname-only merge;
- `src/lib/analysis/digest-persist.ts` — `entityCacheKey(kind, name)` and `resolveEntityId`;
- `scripts/entities-cleanup.ts` — dry-run/apply contract and reviewed JSONL path;
- `src/lib/enrich/run.ts` and `src/integration/enrich-rescore.itest.ts` — inspect only as the
  completed #17 regression boundary; do not edit unless an unavoidable overlap is approved;
- `docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md` and
  `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md`.

## Required behavior

### A. Kind-safe deterministic cleanup

1. Automatic same-key grouping must use `(kind, canonicalKey)` to match deployed persistence.
2. No automatic merge may have `from.kind !== into.kind`.
3. Add a fail-closed assertion in the cleanup driver before `BEGIN`; if any automatic plan ever
   contains a cross-kind merge, abort before mutation.
4. Safest v1 for reviewed JSONL is also to refuse cross-kind merges; otherwise require an explicit
   reviewed flag and document its non-durability.
5. Preserve same-kind canonical folds and path compression.
6. Canonical display selection must not turn an available English/ASCII display into a non-English
   display. Bare-surname → non-ASCII-full-name cases such as Filashkin must be review-only unless
   an approved English full target exists.
7. Adjudicate observed geography gaps consistently with the existing exact-match policy.

### B. Preserve the completed #17 spend boundary

Do not change `CLAIM_LINKED_SQL`, `selectionPredicate()`, the candidate/remaining population, or
the associated unit/integration fixtures as part of cleanup implementation. The full existing #17
suite must remain green. Any necessary overlap must be called out for operator review rather than
silently broadening this task.

## Tests / acceptance criteria

- same key + different kinds produces zero automatic merges;
- same kind + same key still merges deterministically;
- cleanup apply path refuses any automatic cross-kind plan before `BEGIN`;
- ASCII bare surname does not auto-merge into a non-ASCII full display target;
- adjudicated geography cases follow the documented policy;
- regression: the existing #17 linked/unlinked-twin, multi-link, candidate/remaining-equality, and
  remaining-to-zero integration coverage stays green;
- regression: canonical persist does not recreate any same-kind merged spelling;
- existing publication, traceability, spend, and migration tests remain green;
- zero network/paid calls in tests.

Run targeted tests, then `npm test`, `npm run typecheck`, `npm run lint`, and the disposable-Neon
integration suite. Do not apply production cleanup and do not run the paid rescore in the coding
task. Return a new dry-run projection for operator review; #61 and #41 remain open until that build
is deployed, the plan is approved/applied with integrity checks, and spend is separately authorized.
#17's spend subset is complete; its separate match-score/caption UI task remains open but is outside
this cleanup handoff.
