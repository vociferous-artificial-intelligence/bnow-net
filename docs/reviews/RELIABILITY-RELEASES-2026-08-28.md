# Reliability release train + eval/conflict landings — record (2026-08-27/28)

One overnight session (operator-authorized roadmap): four observed production
releases closing the #97 provider-bound-truncation family's live paid sites and
both halves of #87 and #98, followed by three DORMANT landings (capacity-matrix
eval harness, QF-C hardening, conflict soak instruments) that ship no runtime
behavior. Every PR went through the standard gate: baseline measurement →
implementation + regression tests → typecheck/lint/full-unit/integration →
fresh-context adversarial review → fixes → re-review → GitHub checks → merge.
Zero paid calls beyond ordinary scheduled production activity; zero manual cron
invocations; zero env/cap/flag/migration changes; the dirty primary checkout
untouched throughout.

## 1. The four production releases (each deployed from the plain release clone)

| # | PR → merge | Deployment | Deployed (UTC) | Rollback target | Observation |
|---|---|---|---|---|---|
| R0 | #27 → `ed9bc35` | `dpl_62NHUKhDGVL6S6Xp7YbvYMuZ23mx` | 08-27 20:38:07Z | `dpl_FPYase3HqbCF3d2uW3AnwPHibyt4` | **PASS** — 02:00Z finalize ok, 0 errors, 1 thin-regen refusal (persist guard, expected); reduce made exactly 30 requests = 6 mapreduce cells × K=5 through the new `serializeGroup` ($0.0450); engine matrix intact; 4 clean hourly map cycles |
| R1 | #28 → `afbf06e` | `dpl_H7uqWF3DhToY7ufouNBSeSkYLaWH` | 08-28 ~02:20Z | `dpl_62NHUKhDGVL6S6Xp7YbvYMuZ23mx` | **PASS** — 04:00Z intraday ok (10 digests, 0 errors, 0 refusals — `digestDocLine` exercised on the 5 legacy gulf cells); 17 runs post-deploy, 0 failed, 0 nested |
| R2 | #29 → `ad6e078` | `dpl_5ocJPF4GLPHDFB4Cv3MB4tgkScou` | 08-28 ~04:20Z | `dpl_H7uqWF3DhToY7ufouNBSeSkYLaWH` | **PASS** — 7 runs across 5 jobs: 0 failed, 0 spurious degraded flips, 0 stale opens (clean runs keep ok=true; classification quiet as designed) |
| R3 | #30 → `b62da02` | `dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` | 08-28 ~05:10Z | `dpl_5ocJPF4GLPHDFB4Cv3MB4tgkScou` | **PASS + natural proof** — first job starts swept **9 genuinely-dead historical rows** (incl. the REAL 08-27T18:01:42Z telegram hang; correct per-family ceilings), **0 recent/alive rows swept**, post-deploy runs clean |

Every deploy: `/health` 200 stamping the merge commit, DB OK, alias serving the
new `data-dpl-id`, anonymous bare+`RSC: 1` bodies clean on gated + conflict
routes. One transient Vercel CLI `Not authorized` on the R2 deploy cleared on
immediate retry (session verified `go-vociferous`; no auth change made).
Current production: **`dpl_Gf8AiKCpmuwRYdoAr1JvjfTaGLi6` / `b62da02`**.

## 2. What the releases close (and what they honestly do not)

- **#97 reduce site (R0)** — `serializeGroup` truncations well-formed. Baseline
  measured before editing: across all 157,765 current-version claims the old
  and new code differ on ZERO rows (max text 194 / hint 87 code units; pg UTF-8
  cannot store lone surrogates) — the fix is defensive; observation success was
  therefore *normal operation*, which is what was observed, plus 30 live paid
  requests through the new code.
- **#97 digest site = #87's mechanical root (R1)** — `digestDocLine` extracted
  + repaired. Baseline: **61 docs/14d (3–7/day; ru 23 / ua 8 / ir 30) produced
  a malformed doc line under the old code** — this fix has real exposure on
  legacy-fallback days; the gulf daily cells measured zero in-window, so a
  natural malformation-prevention event was not expected during the short
  observation and none occurred. The construction cannot emit malformed UTF-16
  (test-pinned incl. request-level).
- **#87 classification half (R2)** — route-declared `counts.degraded`;
  `withCronRun` records `ok=false` with `error` NULL; map gains content-safe
  `batchErrorClasses`; validate's benign ISW-not-published returns split into
  `unvalidated` (no more false alarm). The flip is synthetic- AND
  wiring-proven (a real-cycle itest fails a live dispatch at transport level
  and asserts the classification lands). **Test-proven vs naturally-observed,
  stated plainly:** no real nested-error event has occurred since deploy, so a
  natural degraded flip has not yet been observed in production; visibility
  when it happens is audit-cron's FAIL list (which now renders degraded
  categories).
- **#98 (R3)** — the sweep's natural proof DID occur: a real production hang
  from the previous day was classified by the first post-deploy job start with
  the correct ceiling, alongside 8 older dead rows, with zero false sweeps.
  Deliberate non-scope, restated: NO new email/alert channel — durable
  visibility is cron_runs + audit-cron + the soak-check's `timed_out` taxonomy
  (its `errored` gate deliberately excludes swept rows).
- **#97 umbrella REMAINS OPEN** — remaining provider-bound sites: the Ask
  family (`ask/actions.ts`, `api/ask/route.ts`, runs route, ask-form,
  sessions, rerank — user-controlled, highest exposure),
  `embeddings/client.ts`, `validation/llm-match.ts`, and the inert
  `anthropic-provider.ts` site (#83). These are the next code PRs.

## 3. Dormant landings (merged AFTER the runtime queue; no deploy — nothing reads them in production paths)

- **PR #31 → `2c1eac5`** — capacity-profile eval dimension + `--capacity-matrix`
  dry-run + SCI-N6 closed on both prompt and scorer sides + env-knob surfacing
  (hardening item 8). Production-audit inputs recorded in the PR: reduce
  top-200 is the dominant quality constraint (ru-mil sees ~24% of groups;
  79.6% of military days saturate); event/claim schema caps are NOT binding;
  the whole capacity envelope costs <$0.50/day at current models.
- **PR #32 → `5643b72`** — 10 of the 11 QF-C "close before first binding paid
  evaluation" items (report-time identity recompute under each file's own
  recorded knobs; live-baseline gating incl. self-comparison refusal;
  MIN_LIVE_REPETITIONS=3 both sides incl. a modeLive spend refusal;
  `--fresh-ack` per-file provenance rendered in scorecards; scored-pair
  alignment; opt-in numeral instrument; union-aware DB-free subprocess pins;
  EVAL-vs-production host-equality refusal, fail-closed on unparseable URLs;
  recursive scripts scan). Item 6 (heldout `mustNotMatch` pins) + the numeral
  fixtures ride the corpus-v2 PR by design (datasets are immutable).
- **PR #33 → `bf0061b`** — conflict soak §5/§5.1 labelling instruments
  (W1–W4): seeded/committed stratified + miss samplers with duplicate-id
  throws, fail-closed κ kit (no overlap → `ungraded_no_overlap`; degenerate
  marginals → `label_quality_failed`), claim/verdict-drift guards,
  partial-verdict policy deliberately NOT adjudicated (strict-match strata +
  denominator-neutral partial diagnostic pending register #12.3), R-M-6 power
  sizing. Nothing wired; all eight §8 soak gates remain operator-blocked.

`main` (`bf0061b`) is therefore dormant-eval-code ahead of production
(`b62da02`) — deliberate; the eval/conflict code rides the next natural
runtime deploy and activates nothing without operator-gated envs.

## 4. Gates ledger (per merged head)

Full-unit counts as each landed: 3,349 (R0) → 3,358 (R1) → 3,371 (R2 merged
tree) → 3,374 (R3 merged tree) → **3,421 / 239 files on final `main`**
(typecheck + lint clean; re-run on the release clone at `bf0061b`).
Integration: 151→155 across the branches, each on a disposable Neon fork.
Reviews: every commit fresh-context reviewed; every confirmed finding fixed and
re-reviewed (PRs #27/#28: CONFIRMED-CLEAN; #29: no blockers, 4 findings fixed;
#30: no blockers, 4 actionable fixed; #31: 9+2 findings fixed across two
rounds; #32: 9 findings fixed, re-review CONFIRMED-CLEAN + 3 nits; #33: 7+3
findings fixed).

## 5. Still-open observations and follow-ups

- A natural degraded-run flip (#87b) — awaits the next real nested-error event.
- `validate`'s new benign/thrown split — first natural exercise at the next
  07:00Z validate run.
- #97 remaining sites (Ask family next), corpus-v2 landing (drafts
  machinery-verified, pending maintainer review of 14 open questions + the
  contract cap raise), and the operator decision packet
  (`OPERATOR-DECISION-PACKET-2026-08-28.md`): X cap (#101, ~2 weeks runway),
  #94 override removal, branch hygiene, npm-vs-pnpm, business docs.
