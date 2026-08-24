# Conflict-evaluations final audit — Fresh Reviewer #2 (safety / operations / authorization), 2026-08-18

## Model gate
System prompt states verbatim: "You are powered by the model named Fable 5. The exact model
ID is claude-fable-5." The prompt does not print an explicit effort string; the model
condition of the gate is satisfied and I record the effort as configured-but-not-independently-
verifiable-from-prompt-text. Proceeding on `claude-fable-5`.

## Exact target
`a2ddca88f7740a148ebeb5372f9ce47dd72ffac4` ("a2ddca8"), tip of
`codex/conflict-evaluations-integration-20260817`; base `7150b494`. Reviewed in the detached
read-only worktree `/Users/go/code/bnow-net-worktrees/conflict-audit-review-safety-20260818`
(verified `git rev-parse HEAD` = target). This review binds ONLY that SHA.

## Initial attack plan (written before reading any prior review artifact)
1. Line-level read of `b8341e9..6b35622` and `6b35622..a2ddca8`; confirm zero `drizzle/` change.
2. Intake: four disposition-critical booleans strictly typed (not truthy), docId validation,
   value-echo discipline incl. the pre-existing `String(c.claimId)` echo.
3. Row-grain contracts: can a claim's doc set be truncated; do the contracts promise behavior
   nothing implements?
4. Ruling 2: any claim writes in the delta?
5. Stub two-authorities: `STUB_ADAPTER_NAMES` vs `stubs.ts`; is the only test a LOCAL set?
6. Ruling 21 on all four conflict routes; then the FEATURE_AUTH_GATE/CONFLICTS_UI coupling and
   whether the enablement checklist must bind it.
7. Register #5 twin guards; legal text in persisted artifacts/errors.
8. Feature-off equivalence + default-off spellings.
9. CLI/spend isolation: equals-form refusal, unknown-dash-token fallthrough, narrow repro under
   fake keys / LLM_DISABLE=1 / unroutable DSN.
10. Results-file merge: atomicity, locking, resume identity.
11. Only then read the audit ledger as evidence-to-check; weigh dormant-merge / soak /
    enablement separately.

## Inspected paths (all in the review worktree)
Both diff ranges via `git diff/show`; `src/lib/conflicts/{evidence-assembler,eligibility,
evidence-records,fixture-corpus,product-view,feature,errors,snapshot-ref,freeze}.ts`;
`src/lib/adapters/{stubs.ts,stub-isolation.test.ts}`; all four `src/app/conflicts/**/page.tsx`
+ the evidence `page.test.tsx`; `src/lib/gate.ts`; `src/integration/conflict-feature-off.itest.ts`;
`scripts/analysis-eval.ts` (header, parser, `main()`, conflict modes, merge path);
`src/lib/evals/conflict-validation-profile.ts`; `docs/designs/CONFLICT-SHADOW-SOAK.md`;
P7 report §5.2/§8.2; decision register; audit ledger (after the attack plan, as evidence).

## Commands + results (narrow reproductions only, per discipline)
- `git rev-parse HEAD` → target SHA; worktree clean.
- `git diff 7150b494..a2ddca8 -- drizzle/ src/db/` → EMPTY. Migrations: none — verified.
- `git diff --stat` both ranges → match the four source commits + q7 gating exactly; range-2
  source delta is 4 files (page +3/−1 line, test +14/−1, two docs).
- `--profile=conflict --validate-dataset` (blank keys, LLM_DISABLE=1, unroutable DSN) →
  refusal message, exit 2 (equals-form refusal reproduced).
- `--profile conflict --execute-live --db-ack whatever` (fake OPENAI key, caps set, fake DSN)
  → refusal, true exit 2 (no client construction observed).
- `--proflie conflict --validate-dataset` (misspelled) → SILENTLY ran the generic
  validate over all four analysis workloads, exit 0 (fallthrough reproduced; provider-free).
- tsx one-liner importing both authorities → `conflicts-list: acled,x | stubs.ts: acled,x |
  in-sync-today: true` (sync holds today; nothing enforces it).
- `npx vitest run` on evidence-assembler/fixture-corpus/eligibility tests → 200/200.
- Greps: zero `STUB_ADAPTER_NAMES` references in any test; zero conflicts references in
  nav/sitemap; only env read in `src/lib/conflicts` is the CONFLICTS_UI flag; profile module
  imports no DB/SDK; `reference-repo-sql.ts` takes an injected `QueryFn`.
No paid calls, no DB contact, no golden regeneration, no commits, no env edits.

## Findings by severity

**MEDIUM (dormant now; must be closed before the DB-mapper/integration phase)**
1. Stub truth has two unlinked authorities. `src/lib/conflicts/evidence-records.ts:151`
   hardcodes `STUB_ADAPTER_NAMES = ["x", "acled"]` with a "keep in sync" comment; the real
   roster lives in `src/lib/adapters/stubs.ts` (xStub/acledStub). The ONLY test in the
   repository that compares stub names (`src/lib/adapters/stub-isolation.test.ts:18`) builds
   its own LOCAL `new Set([xStub.name, acledStub.name])` and never imports the conflicts
   constant; no test anywhere references `STUB_ADAPTER_NAMES`. Failure scenario: a future
   adapter is stubbed (stubs.ts gains a name), the conflicts list silently drifts, the future
   mapper computes `stub` from the stale list, and stub rows enter a conflict population as
   non-stub — a ruling-3 breach with no failing test. Today it is inert (no consumer executes
   the list; fixtures set `stub` explicitly). Fix is one test importing both, or deriving the
   list from stubs.ts exports.
2. The FEATURE_AUTH_GATE/CONFLICTS_UI coupling is bound by NO committed artifact. With
   `FEATURE_AUTH_GATE` unset and `CONFLICTS_UI=1`, `requireAcceptedUser()`
   (`src/lib/gate.ts:33-35`, deliberate inherited demo parity) enforces nothing for anonymous
   visitors, so `/conflicts/[slug]/benchmark/[key]/evidence/page.tsx` serves claim text
   anonymously (the audit lead's first browser run observed exactly this: anonymous HTTP 200).
   Today the exposure is SYNTHETIC fixture text behind banners in an env no one has enabled,
   production carries `FEATURE_AUTH_GATE=true`, and preview URLs are SSO-walled — so current
   risk is LOW. But `docs/designs/CONFLICT-SHADOW-SOAK.md` §11 defers enablement wholesale,
   the flag-on itest phase pins `FEATURE_AUTH_GATE: "true"` (`conflict-feature-off.itest.ts:128`)
   so the parity combination is never graded, and the P6 report even used the parity as a dev
   convenience. Judgment: YES, the enablement checklist MUST bind the coupling — the future
   CONFLICTS_UI enablement decision-log entry must require `FEATURE_AUTH_GATE=true` in every
   environment where the flag is set (or the evidence page must fail closed when the auth gate
   is off outside local dev). One sentence in the enablement gate closes it.
3. The row-grain query contracts are prose that nothing mechanical enforces, and the assembler
   CANNOT enforce their key promise. `evidence-assembler.ts:150-244` correctly diagnoses the
   joined-LIMIT truncation hazard and binds a DISTINCT-CLAIM subquery + `EVIDENCE_MAX_INTAKE+1`
   sentinel — but doc-list completeness is unverifiable post-materialization: a future mapper
   that ships a naive joined LIMIT hands the last claim a truncated doc list and no runtime
   check can notice (independence silently deflates; a spurious `mirror_only`/thin-source
   flip follows). The engine's defensive re-exclusions cover every OTHER predicate. Dormant
   (the fixture loader always delivers complete claims); the integration phase needs a
   mapper-side test pinned to the contract, and the contract already says so. Acceptable as
   shipped, provided the integration review treats the contract as binding input.

**LOW**
4. Value-echo residue in intake refusals: `evidence-assembler.ts:437` echoes
   `String(c.claimId)` and `:450` `String(c.sourceReliability)` — both can carry an arbitrary
   mapper-supplied string into the error message. Bounded: these errors are console/500-path
   only (persisted `failures` strings carry structural key paths only —
   `conflict-validation-profile.ts:38-40,454-462` verified), and reference-report text
   structurally cannot enter candidate shapes (key allowlists + `prepare()` extra-key
   refusal), so ruling 1 is unreachable through this channel. The four new M-1 refusals
   correctly echo nothing.
5. Unknown-dash-token fallthrough (reproduced above): a misspelled `--profile`/`--fresh` is
   silently ignored and the run proceeds in the provider-free default mode. Reaching the paid
   path still requires the literal `--execute-live` plus EVAL_DATABASE_URL/--db-ack/key/caps.
   Honestly acknowledged in P7 §8.2 item 6; a strict-unknown-flag pass remains worth doing.
6. Results-file merge path: durable write after every case with per-(caseId,repetition) key
   replace, dataset content-hash identity refusal on resume — idempotent and resumable. But
   `saveResultsAtPath` is a bare `writeFileSync` (no tmp+rename, no lock): a crash mid-write
   leaves torn JSON that `loadResultsAtPath` dies on with an unhandled parse error (exit 1,
   fail-closed) and `--fresh` cannot recover without a manual delete; two concurrent
   invocations can lose updates last-writer-wins. Single-operator offline dev artifact —
   acceptable; note for the CLI owner.
7. Intake accepts duplicate `docId`s WITHIN one claim (only per-doc positivity is checked).
   Independence is unaffected (Set-deduped, `eligibility.ts:162-168` verified) but
   `sourceDocumentIds`/`docs` would carry duplicates into serialized output and the evidence
   trail UI, and two same-id docs with different field values make `canonicalDocs`' sort order
   input-dependent. No fixture has duplicates (commit-message claim consistent with tests);
   nit for the mapper contract.
8. `Buffer.byteLength(c.text)` (`evidence-assembler.ts:453`) throws an untyped TypeError when
   a mapper hands a non-string text — fail-closed but outside the typed-refusal discipline.

## Clean categories (checked, nothing found)
- **Migrations:** none across base..target (`drizzle/` + `src/db/` diff byte-empty). Verified.
- **Ruling 21:** evidence page calls `await requireAcceptedUser()` as its FIRST statement,
  `requireConflictsUi()` second, data access after (`evidence/page.tsx:32-40`); unit pin
  asserts invocationCallOrder gate < feature < first data read; the three teaser routes are
  public-by-design with the feature guard first and render no claim text (itest asserts on
  BODIES, bare + RSC, including an accepted positive control so it cannot pass vacuously).
- **Ruling 2:** the delta writes no claims and no DB rows at all; the evidence view re-refuses
  `docs.length === 0` (`product-view.ts:321`); docId integrity strengthened at both entry points.
- **Register #5 twin guards:** assembler refuses non-retrospective kinds (`no_proven_snapshot`)
  with `snapshot` typed to admit only null (`evidence-assembler.ts:326-331,382`); snapshot-ref
  terminates the three snapshot kinds in `population_unproven` with bounded refusal tokens and
  no caller-value echo. Artifact-level immutability is honestly scoped as contract-level (P7
  §8.2.4) — sound while fixture-backed.
- **Legal boundaries:** persisted failure strings are structural paths only; fixture corpus is
  synthetic with loader-enforced markers; `SyntheticBanner` renders on every conflict route
  incl. the gated evidence view (mutation-pinned per route + real-body itest assertion).
- **Feature-off equivalence / default-off:** `=== "1"` only; absent/""/"0"/"true"/"TRUE"/
  "yes"/"on"/" 1"/"1 " all OFF, test-pinned; no nav/sitemap/robots promotion (grep clean);
  force-dynamic per-request flag read.
- **Spend isolation:** no SDK/client/SpendGuard call site anywhere in the conflict code; the
  conflict profile module imports fs + conflicts + contracts/runner only; equals-form refusal
  fires before any mode work and covers every dash form; conflict `--execute-live` refuses
  exit-2 under a fake key with caps present (reproduced).
- **q7 link gating (range 2):** detail-page q7 now carries the same
  `publishedUnionCount !== 0` suppression as q2; both directions test-pinned including the
  retention-gap record. Minimal, correct.
- **Intake hardening (M-1/M-2):** all four disposition-critical fields presence+type checked
  (`typeof !== "boolean"` / engine allowlist — strict, not truthy); duplicate claimId, NaN
  reliability, byte-bound, intake ceiling all refused visibly; independence Set-dedupes by
  docId; goldens unchanged by construction (no fixture holds refused inputs) — consistent
  with the 200/200 narrow rerun.

## Weighing
- **Dormant merge safety: SAFE.** Default-off in every spelling, no migrations, no env
  dependency, no provider/DB reach, no nav promotion, feature-off equivalence proven at the
  body level. Findings 1–3 are all conditioned on future phases, not on merging this SHA.
- **Soak readiness: READY with the soak doc's own additions honored.** The soak runs flag-off
  and provider-free paths only; §5.1/§8.7-8/§10 additions are real strengthenings. Nothing I
  found blocks the soak.
- **Enablement readiness: NOT READY (as the program itself states).** Beyond the program's own
  ruling-3 precondition (fixture-backed surfaces), my findings 1, 2, and 3 must be closed at
  or before the enablement/integration review: stub-list sync made mechanical, the
  FEATURE_AUTH_GATE coupling written into the enablement gate, and the row-grain contract
  enforced by a mapper-side test.

## Verdict
**PASS-WITH-MINORS** — binding only SHA `a2ddca88f7740a148ebeb5372f9ce47dd72ffac4`: the
delta is safe to keep merged dormant and to soak, while findings 1–3 (stub-authority sync,
auth-gate/flag coupling in the enablement checklist, mechanical row-grain enforcement) must be
closed before any CONFLICTS_UI enablement or real-backend mapper lands.
