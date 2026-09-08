# WS-3 adversarial audit — finding register (48-hour program, step 18)

Every finding is listed with its verification outcome. Severities are this audit's judgment at the
frozen target **`a7ba98b`** (`a7ba98b` = `origin/main` after CP3 plus the Stage 2 / 2a closeouts;
the five audited merges are all ancestors of it). This audit changed no code, fixed nothing and
decided nothing; step 23 remediates.

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-18-audit-ws3.md` (including the "Added 2026-09-08" block
  carrying OPEN-TASKS #114 / #116 and the §4.1 dry-path defect), read after
  `docs/prompts/2026-09-05-48h-COMMON.md` §3 and §4.10. The prompt's model line reserves Fable for
  step 26 — see disclosure 1.
- Lane / worktree: `audit-ws3`, `/Users/go/code/bnow-net-worktrees/48h-audit-ws3-20260905`
  (`git rev-parse --show-toplevel` is the worktree; the branch was never `main`). HEAD was already
  at the audited SHA, so no reset was needed.
- Branch: `48h/audit-ws3-20260905-finding-register`, cut from `a7ba98b`. Its only commits are this
  register and the `docs/PROGRESS.md` block.
- Mode: **Fable 5.1 / xhigh / plain interactive session, attended**, 2026-09-08.
- Spend: **$0.** No provider call, no deploy, no Vercel read or write, no production write, no
  migration applied to production, no cron invoked. One disposable Neon fork
  (`br-fancy-wildflower-atoc4ev3`), created and deleted by `scripts/test-integration.sh`.

### Four disclosures

**1. Model.** The prompt names Astra / xhigh, "if Astra is unavailable use Opus / xhigh and say so
in the register — not Fable, which is reserved for 26". This session ran on **Fable 5.1**: the
operator launched it interactively by pasting the prompt path, and the audit proceeded rather than
stall. Recorded here so step 26's model-diversity assumption is read with that in mind; step 26
should not treat this register as an independent-model check of Fable's own later work.

**2. `.env.local` was created by this session.** The worktree had none. The COMMON §4.10 trimmed
copy — `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `NEON_API_KEY`, extracted by
`grep` from the main checkout's file — was written for the fork itests and `drizzle-kit generate`.
Values were never read or printed; `git status --ignored` shows it as `!!` (ignored). It is left in
place. No provider, Postmark or Vercel credential exists in it.

**3. A scratch worktree and a read-only cache sample.** Every mutation and both reproductions ran in
a detached scratch worktree under the session scratchpad (`git worktree add --detach`,
`node_modules` symlinked, the trimmed `.env.local` copied for `drizzle-kit`), reverted file-by-file
and removed at the end. To measure the gazetteer against real ISW spellings, this session read
(read-only, `grep -o` counts only) the 171 cached ISW pages under the main checkout's gitignored
`data/cache/pages/` — an internal-only cache, not on the COMMON §3 list. No page text is quoted
anywhere below; only toponym spellings and counts.

**4. Forbidden-file exposure: none.** `docs/evals/analysis/` was touched only as
`git diff --name-only … -- docs/evals/analysis` (names, zero files returned). No results file, no
heldout material, no artifact directory, no `RECONCILIATION-KEY.json`, no `build-draft.py`.

## Method

- **Lenses.** The prompt's six lenses, run by one reader over the full source of every file the
  five PRs added or changed (not the diffs alone), plus the three "attack these first" lists (the
  prompt's (a)–(d) from step 06, the step-13 carried items, the 13b Handoff's eight items) and the
  two C5-m findings the prompt adds. Where a claim could be measured it was measured: a
  54-probe prose-recall script, a walk over every string in the committed goldens, the real Iran
  page pushed through `unitSignaturesFrom` under both gazetteers, a spelling census of 171 cached
  ISW pages.
- **Mutation and reproduction.** 23 mutate-and-run checks (each a single string replacement in the
  scratch worktree, the targeted test files run, the file byte-reverted and the tree re-checked
  clean) and two scratch test files that REPRODUCE the two behavioural defects found — kept in this
  register verbatim so step 23 can promote them to regression tests.
- **Verification budget, stated plainly.** This is a single-reader audit, not the step-17 shape of
  independent finders and refuters. Every finding below carries its own reproduction — a command,
  a mutation result, a file:line read at the SHA, or a measured number — and the two majors each
  have a runnable reproduction. Nothing here rests on a report's say-so. But no finding has been
  refuted by a second, independent reader; step 26 should weight that.
- **Evidence pack.** `git diff <merge>^1 <merge>` for #56, #63, #73, #70, #71; the four WS-3
  reports, PLAN-WS-3, the WS-3.0 memo and `C5M-PROBES-2026-09-07.md` (§4.1, §6, R.10, R.15, the two
  re-run sections); INDEX §2.4 and §10.
- **Baseline.** `npm test` at `a7ba98b` = **4,082 tests / 270 files** green (11.2 s). No code was
  changed, so the after-count is the same. Fork itests: **52 / 52 over 5 files** on
  `br-fancy-wildflower-atoc4ev3` (deleted). Every mutation count below was measured, not quoted.

## Under audit (base `a7ba98b`)

| PR | Step | Merge | What | Report |
|---|---|---|---|---|
| #56 | 06 | `2203150` | versioned gazetteers (`ru-ua-v1` moved verbatim, `iran-levant-v1` new); `insufficientData` + `gazetteerVersion` on the keyword rung | `GAZETTEER-IRAN-LEVANT-V1-2026-09-05.md` |
| #63 | 13 | `c728b2b` | migration 0028 `benchmark_report_editions` + `benchmark_series_days`; durable `SqlReferenceReportRepository` with the design-§5 hardening; `canonicalizeIswUrl` | `WS-3-1-PERSISTENCE-2026-09-06.md` |
| #73 | 13b | `3e7cfdd` | migration 0030 `conflict_validation_observations` (append-only, C6 = (b)); `observation-store.ts`; `withCronRun` optional `runId` | `WS-3-1-OBSERVATIONS-2026-09-06.md` |
| #70 | 14 | `72da938` | `src/lib/isw/edition-discovery.ts` (every shape probed, C4/C5), `derived.units`, `isw-refresh --series [--dry]`, `DryRunReferenceReportRepository` | `WS-3-2-EDITION-DISCOVERY-2026-09-06.md` |
| #71 | 14 | `5f30cd3` | `GET /api/cron/conflict-validate` (report-only, unscheduled) + `JOB_MAX_DURATION_SEC` entry | `WS-3-2-EDITION-DISCOVERY-2026-09-06.md` |

Migration 0029 (`runtime_logs`, PR #64, step 16) is in the chain and was checked under lens 1 only.

## Result in one table

| | count |
|---|---|
| findings | **21** — 2 major, 9 minor, 10 note |
| refuted | 0 (single-reader audit — see Method) |
| blocker | **0** |
| mutations run and reverted | 23 (21 caught, 2 survived — both survivors are findings) |
| scratch reproductions | 2 (both reproduce) |
| fork itests re-executed | 52 / 52 on one fork, deleted |
| report claims re-verified clean | 34 (listed below) |

Nothing in the audited set can spend money, activate a model, write production data, or move an
extractor version. The tables are empty in production (production is at 29 migrations; 0028–0030
are unapplied), the route is not in `vercel.json` and answers only to `CRON_SECRET`, and
`src/lib/validation/run.ts` is byte-identical to its pre-#56 state. The two majors are both
**measurement-integrity** defects in step 14's discovery module: one makes the C15 gap-confirmation
instrument inert on this host and mislabels throttling as "no such page" (#114), the other makes
the operator's authorized `--dry` C5 measurement substitute probe order for finality on a fresh
store — and both directions of that error are reproduced below.

## Findings — major

### WS3-F01 — `isCleanNotFound` accepts only `404`, so the host's deterministic `403` lands in `probeFailures`, forces `probe_failed`, and makes `publication_gap` unreachable on any throttled day (OPEN-TASKS #114)

**PR** #70 · **lenses** 3, 6 · **severity** major

**Where.** `src/lib/isw/edition-discovery.ts:226-228` (`return probe.status === 404`), `:359`
(`probeFailures = probes.filter(p => !isCleanNotFound(p)).length - editions.length`), `:377-382`
(`everyProbeCleanNotFound && confirmGapEligible(...) ? "publication_gap" : "probe_failed"`);
`src/lib/fetch-cache.ts:59-63` (retry only on 429/≥500; any other non-OK returns at once with its
status).

**Claim.** understandingwar.org answers **403** for a not-found slug after roughly 20 not-found
requests in a run, and the 403 state also suppresses real pages. Because a 403 is neither a clean
404 nor an edition, (a) `probeFailures` and the stored `probe_failed` status conflate "the shape
does not exist" with "we were throttled", (b) `everyProbeCleanNotFound` can never be true on a
tripped day, so C15 / (f14)'s two-run confirmation can never fire for any window longer than about a
week, and (c) a scheduled `conflict-validate` run would record `probe_failed` for genuinely
published days with `ok=true` (the #87 discipline treats `probe_failed` as benign, `route.ts:149-152`).

**Reproduced.** Not by this session against the host (no network probe was made). The evidence is
the C5-m record's measurement, re-read at the SHA: three identical `roca` passes over the same 23
days returned `publishedDays` 6 → 6 → 13 with all 23 days published per `isw_reports`
(`C5M-PROBES-2026-09-07.md` R.10); exactly 20 clean 404s then none in 55 network probes; a
diagnostic GET on a nonexistent slug returned `403`, 9,661 bytes. Code-side, mutation **M10**
(`isCleanNotFound` widened to accept 403) passes **33 / 33** of `edition-discovery.test.ts` — the
403 case has no test at all, so the current semantics are unpinned in either direction.

**Refutation attempted.** Could the 403 be a `politeFetch` retry artifact? No: `fetch-cache.ts:59`
retries only 429 and ≥500; a 403 returns on attempt 1. Could the design's "a 5xx / network failure
is NOT a clean 404" already cover it? It covers the *safety* direction (no phantom gap) but not the
*labelling* direction (a throttled day reads as a probe failure) nor the *instrument* direction (C15
inert). Stands.

**Remediation (step 23).** Add an explicit probe class — e.g. `classifyProbe(p): "edition" | "clean_not_found" | "indeterminate"` with `indeterminate` = 403 / 429 / ≥500 / `null` / undersized-200 — report `probeIndeterminate` separately from `probeFailures` in `EditionDiscoveryResult` and the route's counts, and give `discoverEditions` an explicit "not confirmable under throttling" branch (`dayStatus: "probe_failed"`, plus a `dayStatusReason: "throttled"` in the RETURN shape only — no migration; `benchmark_series_days` keeps its two-value CHECK). Add tests with `status: 403` for: single-run `probe_failed`, no confirmation on the second run, and the counter split. Surface `probeIndeterminate > 0` in the route's counts so the WS-3.6 soak can predeclare against it. Backoff (option (c) in R.15) stays a separate decision — it changes fetch volume against a third-party host.

**Disclosed in its report?** No (the step-14 report predates the measurement; it names only network failure, retried 5xx and undersized 200). Disclosed by the C5-m record and OPEN-TASKS #114.

### WS3-F02 — `runSeriesDiscovery --dry` substitutes PROBE ORDER for finality on any day the store holds no edition, so the authorized C5 `anchorNotFinalDays` measurement miscounts in both directions (C5-m §4.1)

**PR** #70 · **lenses** 3, 6 · **severity** major

**Where.** `src/lib/isw/edition-discovery.ts:501-504`:
`const stored = await repo.editionsForDay(plan.series, day); const finalKey = stored.length > 0 ? selectDailyFinal(stored).selected.identity.editionKey : out.editions[0].editionKey;`
— `out.editions` is in probe order (`seriesProbeUrls`, `:154-155`: special, evening, morning,
plain), and `DiscoveredEdition` (`:104-115`) carries no identity or record, so
`selectDailyFinal` cannot be run over what THIS run discovered. In `--dry` mode `repo` is the
`DryRunReferenceReportRepository` (`:467`), whose `editionsForDay` delegates to the wrapped store
(`reference-repo.ts:346-351`) and whose writes are discarded — so on a fresh store `stored` is
always empty and the fallback always runs.

**Claim.** On a multi-edition day whose editions are `special` + `evening`, probe order puts
`special` first (rank 40) while finality picks `evening` (rank 50); on `morning` + `plain`, probe
order puts `morning` first (rank 20) while finality picks `plain` (rank 30). The dry measurement
therefore reports `anchor≠final` when the anchor IS the final edition, and `anchor=final` when it
is not. Only the `morning` + `evening` pair (the March 2026 corpus) happens to agree, which is why
the C5-m re-run saw "pass 0 = pass 1 on all 23 days" — corpus luck, as that record says.

**Reproduced.** Scratch test (verbatim under "Reproductions" below), fixture bodies only, no
network, the in-memory repository, one day with the real special-shape page on the `special` slug
and the synthetic evening fixture on the `evening` slug:

| anchor row (`isw_reports.url`) | live `anchorNotFinalDays` | `--dry` on a fresh store |
|---|---|---|
| evening (the true daily-final) | **0** | **1** — overcount |
| special (not the final) | **1** | **0** — undercount |

Both assertions pass, i.e. both divergences are real at `a7ba98b`.

**Refutation attempted.** Does live mode share the defect? No: live `editionsForDay` sees this
run's own writes, so `stored` is complete. Does dry mode over a PARTIALLY populated store (an
earlier live run stored `morning`, this run finds `morning` + `evening`) behave? No — `stored` then
holds only `morning`, `selectDailyFinal(stored)` returns `morning`, and the just-discovered final
`evening` is ignored: a third miscount path. Stands.

**Remediation (step 23).** Return the canonical `ReferenceEditionRecord` (or at least `identity`)
on each `DiscoveredEdition` from `discoverEditions` (it is already in hand at `:325-346`), and in
`runSeriesDiscovery` compute `finalKey` over the UNION of `stored` and this run's discovered
records keyed by `editionKey` — in dry mode that union is exactly what a live run would have
stored. Add the two scratch cases (special+evening, morning+plain) as unit tests in both modes on a
fresh AND a partially populated store. Until it lands, no `--dry` C5 figure may be quoted; the
March 2026 C5-m figures stand because passes 1 and 2 wrote to the fork.

**Disclosed in its report?** No (step 14's report and its `--dry` test assert `multiEditionDays`
and the write-nothing property, never `anchorNotFinalDays` on a fresh store). Disclosed by the
C5-m record §4.1 and R.15 item 2.

## Findings — minor

### WS3-F03 — A >10 KB non-report `200` body becomes an edition (`parse_status = failed`), proves the day "published", clears a CONFIRMED gap row, and can OUTRANK the real edition in `selectDailyFinal`; the host's error page is 9,661 bytes against a 10,000-byte threshold

**PR** #70 · **lenses** 3, 6 · **severity** minor (fragility; pre-existing threshold shared with production)

**Where.** `edition-discovery.ts:74` (`MIN_REPORT_BYTES = 10_000`), `:318` (the only edition
criterion: `status === 200 && html.length > MIN_REPORT_BYTES`), `:342-345` (`parseStatus: units.length > 0 ? "parsed" : "failed"`, `derived: {}`); `editions.ts:575-586` (`compareEditionFinality` ignores `parseStatus`); `reference-repo.ts:258` and `reference-repo-sql.ts:158-160` (an arriving edition deletes the day row); `run.ts:105` (the same threshold in production).

**Claim.** The threshold is inherited from production on purpose ("discovery can never register a
page production would have skipped"), but discovery probes every shape and then ranks them, so the
consequence differs: a not-found body that crosses 10,000 bytes on the `evening` slug is recorded
as a `failed` edition with rank 50 and wins the day over the real `special` (rank 40); the day's
stored `probe_failed` or `publication_gap` row is deleted by the CTE; step 19 would then fetch the
winner, extract zero units and be refused by the scorer's 0/0 rule — no observation for that day.
The C5-m record measured the host's 403 body at **9,661 bytes**: 339 bytes under the threshold.

**Reproduced.** Scratch test (below): with a stored `publication_gap` and the `oversize-not-a-report`
fixture (10,304 bytes) on the `special` slug, `dayStatus` becomes `published` and the gap row is
gone; with the real special page on `special` and the oversize fixture on `evening`,
`selectDailyFinal` returns `iran_update:2026-08-12:evening`, `parseStatus "failed"`, 0 units.

**Refutation attempted.** The behaviour is by design (unit test "an oversize page with no
takeaways is an edition with parse_status failed") and keeps the URL for a later re-parse of a
real-but-unparseable report. Accepted as the design's intent; the finding is the unexamined
consequence for finality and gap clearance, and the thin margin. Stands as minor.

**Remediation (step 23, needs decision D-b below).** Recommended: register an edition only when
`units.length > 0` (or the Key Takeaways block is present), and count a >10 KB zero-unit body as an
indeterminate probe (WS3-F01's class) so the day stays `probe_failed` and is re-probed next run;
alternatively keep `failed` editions but exclude them from `published` derivation and from
`selectDailyFinal` candidates. Either way add a test that a zero-unit body never outranks a parsed
edition and never clears a confirmed gap.

**Disclosed in its report?** Partly — the report states the threshold parity as a safety property;
the finality inversion and gap clearance are not mentioned.

### WS3-F04 — `persistObservation` never checks that `referenceEditionId` names the edition the result claims, so the row's FK identity and its denormalized `edition_key` / `series` / `report_date` can disagree

**PR** #73 · **lenses** 3, 6 · **severity** minor (latent until step 19 writes; cheap to close)

**Where.** `src/lib/conflicts/observation-store.ts:246` (`assertRowId("referenceEditionId", …)` —
a positivity check only), `:295-300` (the INSERT binds `input.referenceEditionId` beside
`result.report.series / reportDate / editionKey`); the 13b report's "projection" claim
(`WS-3-1-OBSERVATIONS-2026-09-06.md` §Built item 1 and Handoff item 3).

**Claim.** The projection claim is true for every column the RESULT determines, but the ONE
caller-supplied identity — which durable edition row was scored — is checked only for existence
(the FK) and never against `result.report.editionKey`. A caller can attach a result for
`iran_update:D:evening` to the `morning` row's id; step 24's read model, which picks "the row whose
edition is the day's daily-final winner" by `reference_edition_id`, would then display the wrong
result under the right edition, and `latestObservationsFor` mixes column-sourced fields
(`editionKey`, `matcherRung`) with result-sourced ones (`conflictId`, `series`) on such a row
(`:430-450`).

**Reproduced.** By reading and by the module's own unit test: "reads every result-determined column
OFF the result" (`observation-store.test.ts:115-143`) binds `referenceEditionId: 7` against a golden
whose `editionKey` is `roca:…` with no relation to id 7, and the write succeeds with one INSERT.
The itest keeps the two consistent by construction (`resultFor(day)` + `insertEdition(day)`), so
nothing exercises the mismatch.

**Remediation (step 19 or 23).** Make the INSERT an `INSERT … SELECT … FROM benchmark_report_editions e WHERE e.id = $2 AND e.edition_key = $5 AND e.series = $3 AND e.report_date = $4` (still one statement, still no `ON CONFLICT`, and a zero-row insert is refused with `invalid_observation_row`), or add one guarded `SELECT` before the write. Add a unit case that a mismatched edition id is refused before any write, and an itest case on the fork.

**Disclosed in its report?** No — the report says "Step 19 therefore cannot introduce a row/result disagreement even by mistake".

### WS3-F05 — `derived.units` signatures for Iran Update editions are computed under `ru-ua-v1` (via `isw-extract.ts` → `keywords.ts`), and `EDITION_UNITS_VERSION` does not encode the gazetteer, so every stored Iran toponym signature is empty

**PR** #70 (interacts with #56's purpose) · **lenses** 3, 5 · **severity** minor

**Where.** `edition-discovery.ts:205-222` (`unitSignaturesFrom` → `extractTakeawaysWithText`),
`src/lib/validation/isw-extract.ts:2, :56` (`extractSignature` from `./keywords`, RU/UA-bound),
`edition-discovery.ts:80` (`EDITION_UNITS_VERSION = "isw-unit-sig-v1"`, no gazetteer component);
`edition-discovery.test.ts:179-182` asserts vocabulary membership against `RU_UA_V1` for the REAL
Iran page — vacuous for toponyms.

**Claim.** Measured on `fixtures/isw/iran-update-2026-07-24.html`: 5 units; under `ru-ua-v1`
toponyms `[0,0,0,0,0]` (total 0) and actions `[political] [strike,casualties] [] [strike] []`;
the same five texts under `iran-levant-v1` yield toponyms
`[tehran] [qatar,al_udeid,bahrain,kuwait] [saudi_arabia] [tehran] [hormuz]` (total 8) and actions
`[political] [strike,casualties] [militia] [militia] [militia]`. The column that the 3.6-prep
names as part of the compound-calibration substrate therefore records no Iran geography, and the
version stamp would not distinguish rows written before and after a switch.

**Refutation attempted.** PLAN §3.2a says "the same rule as `isw_reports.derived`", and
`isw_reports.takeaways` has always been RU/UA-keyed for Iran too — so this is plan-consistent and
pre-existing in production. Accepted; the finding is that the versioning does not protect the
switch step 19 will want, and that the "vocabulary" test passes for the wrong reason on Iran.
Stands as minor. `sha256` and `ordinal` — the actual C13 join keys — are unaffected.

**Remediation (step 23, decision D-c).** `unitSignaturesFrom(html, gazetteerFor(series))` using
`extractSignatureWith`, and fold the gazetteer version into the stamp
(`isw-unit-sig-v1+<gazetteer.version>` or bump to `isw-unit-sig-v2`). No production row exists
outside forks, so this is free now and a versioned migration of stored rows later.

**Disclosed in its report?** No.

### WS3-F06 — `iran-levant-v1` recall gaps on real spellings: ISW's own "Bab-al-Mandeb" is missed; so are `Deir ez Zor`, `Hodeida`, `Ayn al-Asad`, `al-Asad Air Base`, `Taizz`, `Be'er Sheva` and every curly-apostrophe interior form (`Sana’a`, `Ma’rib`, `Ta’izz`)

**PR** #56 · **lens** 5 (carried item (a)) · **severity** minor (recall only — no fail-open found)

**Where.** `src/lib/validation/gazetteer/iran-levant-v1.ts:78` (`bab_el_mandeb: ["bab el-mandeb", "bab al-mandab", "bab al-mandeb"]`), `:127` (`deir_ez_zor`), `:161-166` (`sanaa`, `hodeidah`, `marib`, `taiz`), `:114` (`ain_al_asad`), `:148` (`beersheba`); `match.ts:53-59` (`variantSource` anchors on the literal, no apostrophe/hyphen folding); `match.ts:97` lowercases only.

**Claim.** Carried item (a) asked whether every transliterated toponym containing `-` or `'` has
variants that actually match in prose. Of 54 authored prose probes, **15 miss** (table in
"Reproductions"). Against the 171 cached ISW pages (76 Iran Updates): `Sanaa` ×17, `Marib` ×16,
`Hudaydah` ×15, `Bekaa` ×10, `al Qaim` ×5, `Taiz` ×4 all HIT, and "Sistan and Baluchistan" ×45 hits
through the bare `sistan` variant — but **`Bab-al-Mandeb` ×2 misses** (the variants have a space
where ISW hyphenates). ISW's CMS emits U+2019 possessives (`Beirut’s`, `Oman’s`; harmless under
`\b`) but interior apostrophes only matter for claim text from other sources.

**Refutation attempted.** The report's own named forms (Bab el-Mandeb, Deir ez-Zor, Sana'a/Sanaa,
al-Qaim, Hodeidah/Hudaydah) all match as listed — the report's claim is true as stated. The gap is
in adjacent spellings it did not list. Stands as minor.

**Remediation (step 23, decision D-e).** Append variants (append-only, allowed before any result
persists under this version): `bab-al-mandeb`, `bab-el-mandeb`, `bab el mandeb`, `bab al mandab`,
`deir ez zor`, `deir ezzor` (already), `dayr az zawr`, `hodeida`, `ayn al-asad`, `al-asad air base`,
`taizz`, `be'er sheva`, `al-qa'im`, `beka'a`; and in word mode ONLY, fold U+2019 / U+2018 to `'`
and U+2011 / U+2010 to `-` before matching (`match.ts:97`) — substring mode stays byte-identical so
the RU/UA snapshot proof is untouched. Re-run the 54-probe script as a test.

**Disclosed in its report?** Partly (debt item 4: "never been measured against real Iran-update text").

### WS3-F07 — The N3-authorized `--backfill-from-isw-reports` mode was in PLAN §3.2a and the step-14 Handoff rewrite but was not built, and the report does not say so

**PR** #70 · **lenses** 3 · **severity** minor (an authorized operator step points at a script that does not exist)

**Where.** `PLAN-WS-3-validation-by-conflict-2026-09-05.md` §3.2a ("`--backfill-from-isw-reports` (N3, operator-run only) registers existing `isw_reports` rows … zero network") and §Handoff step 14 item (ii); AGENTS.md decision **N3** (2026-09-06) authorizes running "the idempotent, $0, LLM-free operator script registering every existing ROCA/Iran `isw_reports` URL as an edition row" after 3.2a deploys; `grep -rn "backfill-from-isw-reports\|backfillFromIswReports" scripts src` → nothing; the step-14 report never mentions the mode.

**Claim.** The operator step N3 authorizes cannot be run. When it is built it must also handle
WS3-F08: `normalizeIswEditionUrl` refuses the eleven June-2025 suffix-form `ir` URLs with a typed
`invalid_edition_url`, so the backfill must count and skip per-row refusals rather than abort.

**Remediation (step 19 or 23).** Build the mode in `edition-discovery.ts` (`backfillFromIswReports(repo, query, series, {dry})`: `SELECT id, url, report_date::text FROM isw_reports WHERE theater = $1`, normalize each URL, upsert `provider: "isw"`, `citationAnchorId = id`, `parseStatus: "pending"`, `derived: {}`, anchors `missing`; per-row typed refusals counted in the summary; no network), wire it as a `--series … --backfill-from-isw-reports [--dry]` flag with the same parser discipline, unit-test it over an injected `QueryFn`, and record its N3 run only after it exists.

**Disclosed in its report?** No.

### WS3-F08 — ISW's June-2025 suffix slug shape is neither generated nor parsed, so a discovery backfill over 2025-06-12 → 06-24 manufactures phantom `probe_failed` days (OPEN-TASKS #116)

**PR** #70 (inherits `run.ts`; adds the parser) · **lens** 3 · **severity** minor (bounded to a historical window; going-forward unaffected)

**Where.** `src/lib/validation/run.ts:31-41` (four prefix forms only), `src/lib/conflicts/editions.ts:72-74` (`IRAN_SPECIAL_PATH_RE` matches `iran-update-(?:(morning|evening)-)?special-report-<md>` only); the production `isw_reports` rows named in #116 carry `…/iran-update-special-report-june-DD-2025-{morning,evening}-edition/`.

**Claim.** Verified at the SHA as #116 states. Consequence for this window: none unless a
backfill or discovery run targets June 2025; consequence for WS3-F07's script: eleven typed
refusals on production's own rows.

**Remediation (step 23).** Add the suffix form to `iranUpdateUrlCandidatesForDate` (a fifth probe,
ordered last — it costs one more politeFetch per Iran day, so consider gating it to dates ≤ 2025-06-30)
and to the normalization table as labels `morning` / `evening` (same finality ranks), with fixtures
for 2025-06-14 (evening) and 2025-06-18 (morning). Note `run.ts` is the frozen production path:
adding a probe there changes production's probe count for Iran days — the per-country path is
byte-identical today (verified), so this is the first WS-3 change that would touch it and should be
called out in step 23's PR.

**Disclosed in its report?** No (found 2026-09-08 by the C5-m window selection).

### WS3-F09 — The route's `CRON_SECRET` gate is first in code, but no test pins the ORDER: moving it after parameter validation passes 11 / 11

**PR** #71 · **lenses** 4, 6 · **severity** minor (test evidence; the shipped code is correct)

**Where.** `src/app/api/cron/conflict-validate/route.ts:47-50` (the gate), `:56-79` (validation),
`:81` (`withCronRun`); `route.test.ts:60-67` (401 with no header and VALID default parameters) and
`:69-87` (400 cases all WITH the secret).

**Claim.** Mutation **M9** moved the auth block below the parameter checks (so a malformed
unauthenticated request would get 400 and reveal parameter validation behaviour, and a reordering
that slipped a query above the gate would go unnoticed): **0 failed / 11 passed**. The sibling
`validate/route.test.ts` has the same gap, so this is a house-wide convention gap rather than a
regression; ruling 21's "gate before the first query" pin exists for pages, not cron routes.

**Remediation (step 23, test-only).** Add one case: no `authorization` header AND `?date=08-26-2026`
→ 401, `dbQuery` never called, `discoverEditions` never called. Consider the same case in
`validate/route.test.ts`.

**Disclosed in its report?** No.

### WS3-F10 — The `iran-levant-v1` invariant regex admits a TRAILING space in a variant, which `variantSource` would silently compile without its right anchor

**PR** #56 · **lens** 5 (carried item (c)) · **severity** minor (test gap; no such variant exists today)

**Where.** `iran-levant-v1.test.ts:51` (`/^[a-z0-9][a-z0-9 '-]*\*?$/` — the class includes a space
and the pattern ends with `*?$`, so `"aden "` passes); `match.ts:56-58` (`right = !stem && /\w$/.test(literal) ? "\\b" : ""` — a literal ending in a space gets no right anchor and requires a literal space in the text, so `"Aden."` would MISS).

**Claim.** This is the nearest thing to the "third fail-open hole" the prompt asked for, and it
errs toward recall loss, not over-match: a stray trailing space in an appended variant would pass
every invariant test and silently fail to match at sentence end. No over-matching hole was found:
unicode case folding (`toLowerCase` on ASCII variants) cannot widen a match beyond the Kelvin-sign
curiosity (`U+212A` lowercases to `k`); duplicate canonical keys are a TypeScript compile error in
an object literal; `tryGazetteerFor` and `classifyTheaterWith` use own-property lookups, and
`GAZETTEERS[version]` is own-property-checked too (which is why mutation M16 survives — see the
mutation log).

**Remediation (step 23, test-only).** Tighten the invariant to `/^[a-z0-9](?:[a-z0-9 '-]*[a-z0-9])?\*?$/` (no leading or trailing space, no space before `*`), and assert `variantSource(v)` ends in `\b` or `*`-stem for every declared variant.

**Disclosed in its report?** No.

### WS3-F11 — `expandToponymsWith` keeps the bare-index lookup (`gaz.expansions[t] ?? []`) that the report flags as pre-existing for RU/UA — but it is the SHARED function both gazetteers use, and `"constructor"` as a toponym throws `TypeError` rather than expanding to nothing

**PR** #56 · **lens** 5 · **severity** minor (unreachable from gazetteer-derived toponyms; reachable only from persisted or caller-supplied toponym lists)

**Where.** `match.ts:115-119`; the report's debt item 7 ("left byte-identical on purpose — the RU/UA path must not move") versus the report's claim that "the new `classifyTheaterWith` does the own-property lookup properly" — the new generic expander does not.

**Claim.** `for (const member of gaz.expansions["constructor"] ?? [])` iterates a function →
`TypeError: … is not iterable`. Toponyms reaching it today come from `extractSignatureWith` (the
gazetteer's own keys) or from persisted `isw_reports.takeaways[].toponyms` (also gazetteer keys),
so it is unreachable in practice — and it fails LOUD, not open. Kept as minor because the report
presents the generic function as the fixed one.

**Remediation (step 23).** `Object.hasOwn(gaz.expansions, t) ? gaz.expansions[t] : []` — behaviour is
identical for every real input, so the RU/UA snapshot and legacy-oracle differential stay green
(the report's "must not move" concern is about behaviour, which this does not change); add a test
with `["constructor", "gaza"]`.

**Disclosed in its report?** Partly (debt item 7, for the RU/UA shim only).

## Findings — note

### WS3-N01 — The journal/merge disagreement guard is unreachable by any input (verified, as the step-13 report says)

`reference-repo-sql.ts:362-371` throws if `anchorJournalEntriesFor(existing, merged)` disagrees with `mergeEditionRecords(...).anchorChanged`. Both sides compute from the same canonical instants: `existing` comes through `rowToRecord → parseEditionRecord` (`canonicalInstant`, `editions.ts:452-455`), `merged` through `parseEditionRecord` again, and `mergeAnchor.presentChanged` (`reference-repo.ts:61-63`) is exactly "both present and different", which is exactly `anchorJournalEntriesFor`'s `from !== null && to !== null && from !== to` (`:275`). Fill-ins and downgrades produce `false` on both sides. Defensive, untestable without mocking the merge authority, correctly so. No action.

### WS3-N02 — `benchmark_report_editions_final_idx` violations surface as raw driver errors — unreachable from discovery

Only the URL index is typed (`rethrowTyped`, `reference-repo-sql.ts:288-302`). Discovery always writes `designatedFinal: null` (`edition-discovery.ts:340`), so the partial unique on `designated_final` can only be hit by a fixture-mode or hand-written record; the itest asserts the raw message deliberately. Type it when C4's designation writer lands (step 19 or WS-3.6). No action this window.

### WS3-N03 — The in-memory ⇄ SQL URL-canonicalization divergence extends to the `--dry` decorator, and is unreachable from discovery

`DryRunReferenceReportRepository.upsertEdition` (`reference-repo.ts:323-340`) parses the record WITHOUT `canonicalizeIswUrl`, then merges against the wrapped SQL store's canonical row — a raw `www.`/`http` spelling would report `edition_merge_conflict` in dry mode where the live SQL path reports `unchanged`. Discovery canonicalizes before every upsert (`edition-discovery.ts:320-321, :336`), so no current caller reaches it. If the decorator ever fronts a non-discovery caller, canonicalize in the decorator for `provider: "isw"` too. No action this window.

### WS3-N04 — `anchor_journal` is capped at 50 and the cap is pinned (M13)

Verified: `ANCHOR_JOURNAL_LIMIT = 50` (`reference-repo-sql.ts:73`), `.slice(-ANCHOR_JOURNAL_LIMIT)` at `:372-374`; removing the slice fails "keeps the most recent entries only". No action.

### WS3-N05 — `fileParallelism: false` is load-bearing and `runMigrations` takes no lock

`vitest.integration.config.ts:14`. Three itests now apply 0028–0030 on a fresh fork in `beforeAll`; flipping the setting would race two `CREATE TABLE`s. `scripts/migrations-lib.ts` could take `pg_advisory_xact_lock` around the marker check + apply so the property does not depend on a vitest option. Out of WS-3 scope; recorded for step 21/23.

### WS3-N06 — `edition_write_contention` is bounded, pinned, and reachable only with a second writer

`MERGE_ATTEMPT_LIMIT = 4` (`reference-repo-sql.ts:69`), unit-pinned at a limit of 3 and on the fork with two `Pool`s converging. The realistic second writer is a manual `isw-refresh --series` (without `--dry`) running at the same instant as a scheduled `conflict-validate`; the route already classifies the throw as a degraded cell (`route.ts:122-127`). Enablement checklist item for WS-3.6: never run a live `--series` pass while the cron is scheduled. No code action.

### WS3-N07 — `maxDuration = 300` can be exceeded by `politeFetch`'s worst-case retry budget

Per probe, a dead host costs up to 3 × 45 s timeouts plus 3 + 6 + 9 s backoff ≈ 153 s (`fetch-cache.ts:52-76`); two such probes exceed the route ceiling. At `?lookback=3` the route issues up to 2 × 3 × (1 + 4) = 30 probes. The consequence is the ruling-10 timeout row (`finished_at IS NULL`, later swept by #98) and partially written edition rows — idempotent, so harmless. Schedule note for WS-3.6: keep `lookback` at 2 and expect the sweep to classify a dead-host run. No code action.

### WS3-N08 — A `derived` replacement is unjournaled: a page edit changes unit identities silently

`reference-repo.ts:160-163` lets a non-empty incoming `derived` REPLACE a stored one with `repairedFields: ["derived"]` and no trail of the displaced `sha256`s. If ISW edits a Key Takeaway after discovery, the unit hash — the C13 join key the 3.6-prep names as the calibration substrate — changes under the same `unitsVersion`. Not wrong (a refresh should win), but the soak should know a hash can move. Consider journaling displaced unit hashes the way `anchor_journal` journals instants, once the substrate is actually consumed.

### WS3-N09 — Migration 0029 has no `migrations.test.ts` pin

Lens 1 asks for pins on 0028 and 0030; both exist (`migrations.test.ts:83-129`, `:131-278`). 0029 (`runtime_logs`, PR #64, step 16) has none. Out of this audit's scope; step 17's register may already carry it — if not, step 23 should add the 0027-style additive pin.

### WS3-N10 — The C5-m decision's "READ-ONLY probe of production" cannot run before 0028 is applied in production

`--series … --dry` reads `benchmark_series_days` and `benchmark_report_editions` through `editionsForDay` / `dayStatus` on every day; production is at 29 migrations with those tables absent (C5-m record §2, R.5), so the literal authorized command throws on the first day. The operators ran it on a migrated fork instead. The decision entry is append-only; a one-line correcting entry belongs with step 25 / the operator, not here.

## Verified-clean report claims (36)

| # | Claim (report) | How verified at `a7ba98b` |
|---|---|---|
| 1 | Journal idx contiguous 28 → 29 → 30 | `drizzle/meta/_journal.json` entries 28/29/30 (`when` 1788734052514 / 1788741662948 / 1788743005909) |
| 2 | Snapshot `prevId` chain | 0028 `da569a98…` prev `83411822…` (= 0027 id); 0029 `e86ff58a…` prev `da569a98…`; 0030 `13b8afeb…` prev `e86ff58a…` |
| 3 | `drizzle-kit generate` on `main` produces no file | run in the scratch worktree at `a7ba98b`: "No schema changes, nothing to migrate"; `git status drizzle/ src/db/` empty |
| 4 | `9999_claim_source_trigger.sql` last and byte-identical to `2203150` | blob `db45b2401fad…` at `2203150`, `883e5e3` and HEAD; filename-order pin green |
| 5 | `migrations.test.ts` pins for 0028 and 0030 | `:83-129`, `:131-278`; mutations M5, M6, M21 each fail exactly the intended case |
| 6 | 0028 = 7 generated statements, nothing hand-authored | statement count 7; generate is a no-op (#3) |
| 7 | 0030 = one table, one partial unique, two `NO ACTION` FKs, two read indexes | `drizzle/0030_conflict_observations.sql:1-42` |
| 8 | `run.ts` byte-identical | `git diff 2203150^1 HEAD -- src/lib/validation/run.ts` empty; same for `score.ts`, `isw-extract.ts`, `stub-provider.ts`, `backtest-matrix.ts`, `score-validation.ts`, `validation.test.ts` |
| 9 | `vercel.json` unchanged | `git diff --stat 883e5e3 HEAD -- vercel.json` empty; `route.test.ts:191-197` |
| 10 | `docs/evals/analysis/` untouched by the five PRs | `git diff --name-only` per merge: 0 files each |
| 11 | `fixtures/conflicts/**` untouched | `git diff --name-only` per merge: 0 files each |
| 12 | `cron-run.ts` diff = the ceiling line + the optional `runId` + its doc comment | `git diff 883e5e3 HEAD -- src/lib/usage/cron-run.ts`: `startRun`, `finishRun`, the #98 sweep and the #103 watchdog untouched |
| 13 | `keywords.ts` binds `ru-ua-v1` only; Iran tables never reach the default path | `keywords.ts:23`; `layering.test.ts:42-48`; M23 fails 10 / 24 |
| 14 | The byte-identity snapshot covers ACTIONS, not only toponyms | M2 (drop `hit` from RU/UA `strike`) fails the byte-compare 1 / 9 |
| 15 | `keywordUnmatchable === insufficientData.length` is load-bearing | M3 and M4 each fail 5 / 29 |
| 16 | Empty-variant refusal | M17 fails 1 / 29 |
| 17 | Own-property registry lookup | `index.ts:76-78`; M16 survives only because the SECOND `Object.hasOwn(GAZETTEERS, version)` catches the inherited value — defense in depth, not a gap |
| 18 | The stored-token alphabet was measured against the goldens | independent walk: 14 goldens, 719 strings, longest 92; non-token only `headlineLabel` ×13 and `window.cutoffAtRaw` ×1 |
| 19 | The path exceptions match exact paths only | `observation-store.ts:92, :98` (`path === ".headlineLabel"`, `RAW_ANCHOR_PATHS.has(path.slice(1))`); array segments render as `[i]`, so no other depth matches |
| 20 | The app-layer non-retrospective refusal is unreachable | `eval-profile.ts:434` refuses first inside `assertPersistableConflictResultV1`, called at `observation-store.ts:231` before the twin at `:232` |
| 21 | No UPDATE / DELETE / ON CONFLICT path in the store | M7 fails 2 / 32 (source scan + statement pin) |
| 22 | FK refusal; partial unique per cron run; null-cron rows unconstrained | `conflict-observations.itest.ts` 8 / 8 on the fork |
| 23 | `unit_flags_version` NOT NULL and stamped on every row | itest raw-INSERT refusal; M8 fails 1 / 32; M21 fails 1 / 13 |
| 24 | `edition_write_contention` bounded and pinned | `reference-repo-sql.test.ts:335-354`; itest two-`Pool` convergence 12 / 12 |
| 25 | Anchor journal cap | M13 fails 1 / 23 |
| 26 | CAS guards every mutable column including `derived` | M14 fails 1 / 23 |
| 27 | Insert + day-row clear are ONE statement | itest "a rolled-back insert clears nothing" |
| 28 | `canonical_url` violations are the typed `edition_url_conflict` | unit + itest, index name in the message |
| 29 | Every shape probed, never `break` (C4) | M20 (add `break`) fails 6 / 33 |
| 30 | Two-run gap confirmation with the 48 h age bound | M11 (`>=` → `>`) fails the boundary case 1 / 33 |
| 31 | Link-only anchoring; `isw_reports` read-only; registry untouched | `edition-discovery.test.ts:350-388`; itest counts + anchor tuple byte-identical |
| 32 | `derived` shape is CLOSED and refuses non-canonical tokens | M15 fails 1 / 69 |
| 33 | Route: 401 → no DB call; 400 before any run row; not scheduled; ceiling lockstep; only thrown cells degrade | `route.test.ts` 11 / 11; M12 fails 2 / 23; M22 fails 2 / 11 |
| 34 | `--series` is the FIRST branch of `main()` and the `--theater` path is literal-pinned | `scripts/isw-refresh.test.ts:17-57` |
| 35 | The route's `rawSql.query` cast matches `QueryFn` | `src/db/index.ts:8-11` — `rawSql = neon(url)`, whose `.query(text, params)` resolves to a rows array; the same shape `cron-run.ts:128-132` relies on |
| 36 | `conflict-feature-off.itest.ts` still passes with 0028–0030 applied | 24 / 24 on the fork (production build, flag absent and flag on) |

## Carried attack items — disposition

| Item | Disposition |
|---|---|
| Step 06 (a) — hyphen / apostrophe variants match in prose | Partly: every form the report NAMES matches; adjacent real spellings miss → **WS3-F06** |
| Step 06 (b) — no new action term reaches the RU/UA default path; snapshot covers ACTIONS | Verified clean (#13, #14) |
| Step 06 (c) — the third fail-open hole | None found that over-matches. Recall-side: trailing-space invariant gap → **WS3-F10**; loud-not-open bare index → **WS3-F11** |
| Step 06 (d) — mutate one side of `keywordUnmatchable === insufficientData.length` | Both sides mutated (M3, M4): 5 / 29 fail each |
| Step 13 — `edition_write_contention` reachable / bounded / pinned | Bounded (4), pinned twice, reachable only with a second writer → **WS3-N06** |
| Step 13 — journal/merge disagreement guard | Unreachable, with the reason → **WS3-N01** |
| Step 13 — `final_idx` raw driver error | Confirmed; unreachable from discovery → **WS3-N02** |
| Step 13 — in-memory vs SQL canonicalization | Confirmed; extends to the dry decorator; unreachable from discovery → **WS3-N03** |
| Step 13 — `anchor_journal` cap 50 | Confirmed, pinned → **WS3-N04** |
| Step 13 — `fileParallelism` race | Confirmed load-bearing → **WS3-N05** |
| 13b #1 — the stored-token alphabet | Golden walk agrees (#18); the live-path hazards (IDN `sourceDomain`, unicode theater labels) are as the report's debt already states — first proven at step 19's fork run |
| 13b #2 — path-based exceptions at another depth | Cannot be reached (#19) |
| 13b #3 — the projection claim | Holds for result-determined columns; FAILS for the FK identity → **WS3-F04** |
| 13b #4 — the unreachable twin | Unreachable (#20) |
| 13b #5 — append-only under concurrency | Itest 8 / 8: two runs append, same run refused, null-cron rows land |
| 13b #6 — the fail-closed read | A poisoned row is refused (unit + itest); an edition/result identity mismatch is NOT detected on read either → folded into **WS3-F04** |
| 13b #7 — chain and pins; re-run M3/M4 | Chain verified (#1–#3); the report's M3/M4 re-run as M21 (1 / 13) and the kind-table exhaustiveness holds |
| 13b #8 — `cron-run.ts` diff | Exactly the optional parameter, its doc comment, and step 14's one ceiling line (#12) |
| Step 14 Handoff "attack list" | The step-14 report has no attack list; its Handoff is API shape, edition ids and soak-scheduling notes. Its two decisions-needed items (N2, C5 measurement) are settled by later entries |
| Prompt add-on — #114 | Audited as **WS3-F01** (major) |
| Prompt add-on — #116 | Audited as **WS3-F08** (minor) |
| Prompt add-on — §4.1 dry-path finality | Audited and REPRODUCED as **WS3-F02** (major) |

## Per-PR verdict — the column step 27 reads

| PR | major | minor | note | Verdict | What the verdict turns on |
|---|---|---|---|---|---|
| #56 | 0 | 3 | 0 | **merge-stands** | The split moved nothing (snapshot + legacy oracle + M1/M2/M23), the registry and compiler fail closed (M16/M17), and the denominator invariant is load-bearing (M3/M4). Findings are recall-side: real spellings the variant lists miss (WS3-F06), a trailing-space invariant gap (WS3-F10), and a loud-not-open bare index in the shared expander (WS3-F11). Nothing over-matches. |
| #63 | 0 | 0 | 6 | **merge-stands** | Option 3 exactly; the §5 hardening is real on the fork (CTE atomicity, CAS convergence, typed URL conflict, journal, canonicalization); every carried item verified as the report states. The notes are its own documented residuals (N01–N06). |
| #73 | 0 | 1 | 0 | **merge-stands** — close WS3-F04 before step 19 writes the first real row | Append-only by construction (M5/M7), stamps enforced at the DB and the app (M8/M21), the alphabet measured independently (#18). The one hole is the caller-supplied edition id, which the "projection" claim overstates: a one-statement `INSERT … SELECT` closes it with no migration. |
| #70 | 2 | 5 | 4 | **merge-stands** (inert on deploy: module + operator script) — **fix before WS-3.6 scheduling, and before any further `--dry` C5 figure is quoted** | Every shape probed (M20), gaps never fabricated (M11), the registry untouched on the fork, `derived` closed (M15). The two majors are measurement-integrity: 403 read as "no such page" (WS3-F01) and probe order standing in for finality in dry mode (WS3-F02, reproduced both ways). Plus the phantom-edition margin (WS3-F03), RU/UA-keyed Iran signatures (WS3-F05), the unbuilt N3 mode (WS3-F07) and #116 (WS3-F08). |
| #71 | 0 | 1 | 0 | **merge-stands** | Gate first, parameters validated before the run row, unscheduled, ceiling in lockstep, #87 discipline — all pinned (M12/M22) except the gate ORDER (WS3-F09, a one-case test fix shared with the sibling `validate` route). |

**No blocker was found, and no PR is recommended for revert.** Nothing in the audited set can spend, activate a model, write production data, or move an extractor version: the three tables do not exist in production yet, the route is unscheduled and secret-gated, and the per-country validation path is byte-identical. Both majors live in the module the operator runs LOCALLY to take measurements and in the route WS-3.6 would schedule — which is why the verdict for #70 is "merge-stands" with a scheduling precondition rather than "fix-before-deploy": deploying #70 changes no production behaviour, scheduling it or quoting its `--dry` numbers does.

## Mutation log

Every mutation was a single string replacement applied in the detached scratch worktree at `a7ba98b`, the named test files run with `npx vitest run`, the file restored byte-for-byte and `git status` re-checked clean. "Caught" = at least one targeted test fails.

| # | Mutation | Result | Failing test(s) |
|---|---|---|---|
| M1 | swap the `pokrovsk` / `toretsk` declaration order in `ru-ua-v1.ts` | **2 failed** / 7 of 9 | key order frozen; snapshot byte-compare |
| M2 | drop `hit` from RU/UA `strike` ACTIONS | **1 failed** / 8 of 9 | snapshot byte-compare (ACTIONS covered) |
| M3 | `keywordUnmatchable: 0` (decoupled from `insufficientData.length`) | **5 failed** / 24 of 29 | count-equals-length; M1 count; signal-less negative |
| M4 | delete `insufficientData.push(unit.unitId)` | **5 failed** / 24 of 29 | the same three, plus "insufficient_data names exactly the signal-less units" and the ladder keyword-rung pass-through |
| M5 | 0030: unique index widened to `(conflict_id, reference_edition_id)` | **1 failed** / 12 of 13 | "is APPEND-ONLY" |
| M6 | 0030: delete the `reference_edition_id` FK statement | **1 failed** / 12 of 13 | "binds the observation to a durable edition" |
| M7 | `OBSERVATION_INSERT_SQL` gains `ON CONFLICT DO NOTHING` | **2 failed** / 30 of 32 | source scan; statement pin |
| M8 | `persistObservation` binds `null` for `unit_flags_version` | **1 failed** / 31 of 32 | "reads every result-determined column" |
| M9 | route: `CRON_SECRET` gate moved AFTER parameter validation | **0 failed** / 11 of 11 — **survived** | → WS3-F09 |
| M10 | `isCleanNotFound` also accepts 403 | **0 failed** / 33 of 33 — **survived** | → WS3-F01 (403 unpinned) |
| M11 | `confirmGapEligible` `>=` → `>` | **1 failed** / 32 of 33 | age boundary |
| M12 | drop `"conflict-validate": 300` from `JOB_MAX_DURATION_SEC` | **2 failed** / 21 of 23 | lockstep test; route ceiling pin |
| M13 | remove the `anchor_journal` `.slice(-ANCHOR_JOURNAL_LIMIT)` | **1 failed** / 22 of 23 | bounded column |
| M14 | remove the CAS guard on `derived` | **1 failed** / 22 of 23 | guarded UPDATE pin |
| M15 | `EDITION_SIGNATURE_TOKEN_RE = /^.*$/` | **1 failed** / 68 of 69 | refuses a non-canonical token |
| M16 | `Object.hasOwn(GAZETTEER_KEYS, key)` → `key in GAZETTEER_KEYS` | **0 failed** / 5 of 5 — survived, NOT a gap | the second own-property check on `GAZETTEERS` still returns `null` for inherited keys (#17) |
| M17 | remove the empty-variant refusal | **1 failed** / 28 of 29 | `new RegExp("aden\|")` case |
| M18 | `STORED_TOKEN_RE` admits a space | **4 failed** / 28 of 32 | prose attribution; sentinel anywhere; sentinel in an array member; read-side poisoned row refused |
| M19 | remove the `fixture-oracle` refusal | **1 failed** / 31 of 32 | "refuses a fixture-oracle rung" |
| M20 | `break` after the first edition (C4 collapse) | **6 failed** / 27 of 33 | both same-day editions; parsed anchors; link-only anchoring; window walk anchor≠final; --dry writes nothing; --dry repaired/unchanged |
| M21 | drop `unit_flags_version` from the static kind table | **1 failed** / 12 of 13 | kind-table exhaustiveness |
| M22 | route degrades on `probe_failed` days too | **2 failed** / 9 of 11 | counts summary; #87 benign pin |
| M23 | `keywords.ts` binds `iran-levant-v1` | **10 failed** / 14 of 24 | layering pin; `extractSignature` cross-language; snapshot |

## Reproductions (kept verbatim for step 23's regression tests)

### R1 — `--dry` substitutes probe order for finality (WS3-F02)

```ts
// scratch: src/lib/isw/__audit__/dry-finality.audit.test.ts — passes at a7ba98b, i.e. the divergence is real
import { readFileSync } from "node:fs"; import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSeriesDiscovery, type EditionDiscoveryDeps } from "../edition-discovery";
import { InMemoryReferenceReportRepository } from "../../conflicts/reference-repo";
import type { FetchResult } from "../../fetch-cache"; import type { QueryFn } from "../load";
const fixture = (rel: string) => readFileSync(join(process.cwd(), "fixtures/isw", rel), "utf8");
const EVENING_HTML = fixture("editions/iran-evening-2026-08-12.html");
const SPECIAL_HTML = fixture("iran-update-2026-07-24.html"); // real special-shape body
const DAY = "2026-08-12"; const IRAN = "https://understandingwar.org/research/middle-east/";
const SPECIAL = `${IRAN}iran-update-special-report-august-12-2026/`;
const EVENING = `${IRAN}iran-update-evening-special-report-august-12-2026/`;
function deps(anchorUrl: string, repo: InMemoryReferenceReportRepository): EditionDiscoveryDeps {
  const map: Record<string, string> = { [SPECIAL]: SPECIAL_HTML, [EVENING]: EVENING_HTML };
  const fetch = async (url: string): Promise<FetchResult | null> =>
    map[url] === undefined ? { url, html: "", fromCache: false, status: 404 } : { url, html: map[url], fromCache: false, status: 200 };
  const query: QueryFn = async () => [{ id: 11, url: anchorUrl }];
  return { repo, query, fetch, now: () => new Date(`${DAY}T00:00:00Z`) };
}
const plan = (dry: boolean) => ({ series: "iran_update" as const, from: DAY, to: DAY, dry });
describe("AUDIT: dry vs live anchor≠final on a special+evening day", () => {
  it("anchor on EVENING (the true final): live 0, dry 1", async () => {
    const live = await runSeriesDiscovery(plan(false), deps(EVENING, new InMemoryReferenceReportRepository()), () => {});
    const dry = await runSeriesDiscovery(plan(true), deps(EVENING, new InMemoryReferenceReportRepository()), () => {});
    expect(live.anchorNotFinalDays).toBe(0); expect(dry.anchorNotFinalDays).toBe(1); // OVERCOUNT
  });
  it("anchor on SPECIAL (not the final): live 1, dry 0", async () => {
    const live = await runSeriesDiscovery(plan(false), deps(SPECIAL, new InMemoryReferenceReportRepository()), () => {});
    const dry = await runSeriesDiscovery(plan(true), deps(SPECIAL, new InMemoryReferenceReportRepository()), () => {});
    expect(live.anchorNotFinalDays).toBe(1); expect(dry.anchorNotFinalDays).toBe(0); // UNDERCOUNT
  });
});
```

Result at `a7ba98b`: 2 / 2 pass (`live 0 / dry 1`, `live 1 / dry 0`). Step 23's fix should make BOTH `expect(dry…)` lines equal the live value.

### R2 — a >10 KB non-report body is a published edition and can win the day (WS3-F03)

```ts
// scratch: src/lib/isw/__audit__/phantom-edition.audit.test.ts — passes at a7ba98b
import { readFileSync } from "node:fs"; import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEditions, MIN_REPORT_BYTES } from "../edition-discovery";
import { InMemoryReferenceReportRepository } from "../../conflicts/reference-repo";
import { selectDailyFinal } from "../../conflicts/editions";
import type { FetchResult } from "../../fetch-cache";
const fixture = (rel: string) => readFileSync(join(process.cwd(), "fixtures/isw", rel), "utf8");
const OVERSIZE = fixture("editions/oversize-not-a-report.html"); // 10,304 bytes
const REAL_SPECIAL = fixture("iran-update-2026-07-24.html");
const DAY = "2026-08-12"; const IRAN = "https://understandingwar.org/research/middle-east/";
const SPECIAL = `${IRAN}iran-update-special-report-august-12-2026/`;
const EVENING = `${IRAN}iran-update-evening-special-report-august-12-2026/`;
const fetchFor = (map: Record<string, string>) => async (url: string): Promise<FetchResult | null> =>
  map[url] === undefined ? { url, html: "", fromCache: false, status: 404 } : { url, html: map[url], fromCache: false, status: 200 };
const LATE = () => new Date(Date.parse(`${DAY}T00:00:00Z`) + 10 * 86_400_000);
describe("AUDIT: phantom edition from an oversize non-report body", () => {
  it("clears a CONFIRMED publication_gap and marks the day published", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await repo.recordDayStatus("iran_update", DAY, "probe_failed");
    await repo.recordDayStatus("iran_update", DAY, "publication_gap");
    const out = await discoverEditions({ repo, query: async () => [], fetch: fetchFor({ [SPECIAL]: OVERSIZE }), now: LATE }, "iran_update", DAY);
    expect(OVERSIZE.length).toBeGreaterThan(MIN_REPORT_BYTES);
    expect(out.dayStatus).toBe("published");
    expect(await repo.dayStatus("iran_update", DAY)).toBe("published"); // the confirmed gap is gone
  });
  it("a phantom on the EVENING shape outranks the REAL special edition", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await discoverEditions({ repo, query: async () => [], fetch: fetchFor({ [SPECIAL]: REAL_SPECIAL, [EVENING]: OVERSIZE }), now: LATE }, "iran_update", DAY);
    const sel = selectDailyFinal(await repo.editionsForDay("iran_update", DAY));
    expect(sel.selected.identity.editionKey).toBe(`iran_update:${DAY}:evening`);
    expect(sel.selected.parseStatus).toBe("failed");
  });
});
```

Result at `a7ba98b`: 2 / 2 pass (`published [special:failed:u0]`; winner `evening`, `parseStatus failed`, 0 units).

### R3 — `iran-levant-v1` prose-recall probe (WS3-F06): the 15 misses of 54

`extractSignatureWith(IRAN_LEVANT_V1, text).toponyms.has(canon)` over authored prose (no ISW text):

| canonical | missed spelling |
|---|---|
| `bab_el_mandeb` | "Bab-el-Mandeb"; "Bab el Mandeb" (and ISW's "Bab-al-Mandeb", ×2 in the cache) |
| `deir_ez_zor` | "Deir ez Zor"; "Dayr az Zawr" |
| `sanaa` | "Sana’a" (U+2019) |
| `al_qaim` | "al-Qa'im" |
| `hodeidah` | "Hodeida" |
| `marib` | "Ma’rib" (U+2019) |
| `taiz` | "Ta’izz" (U+2019); "Taizz" |
| `ain_al_asad` | "Ayn al-Asad"; "al-Asad Air Base" |
| `beersheba` | "Be'er Sheva" |
| `bekaa` | "Beka'a" |

Hits worth recording: `TEHRAN` (case), `Aden’s` / `Gaza’s` (possessive under `\b`), `Al-Udeid`, `Khan Yunis`, `Sistan-Baluchistan`, `Deir al-Zour`, `al-Hudaydah`, `Beer Sheva`.

## Fork itests

One disposable Neon fork, created and deleted by `scripts/test-integration.sh`:

| fork | files | result | migrations applied on the fork |
|---|---|---|---|
| `br-fancy-wildflower-atoc4ev3` | `conflict-reference-repo` 12 · `conflict-observations` 8 · `conflict-feature-off` 24 · `conflict-edition-discovery` 5 · `migrations-atomic` 3 | **52 / 52** | `0028_lumpy_dragon_lord.sql` (7 statements), `0029_runtime_logs.sql` (4), `0030_conflict_observations.sql` (6), then "migrations up to date" on every re-apply |

The runner's log ends `deleted br-fancy-wildflower-atoc4ev3`; the fork was not independently
re-listed against the Neon API (the C5-m record's stronger form), so "deleted" here rests on the
runner's own report.

## Stale standing text — the list step 25 applies

AGENTS.md, verbatim at `a7ba98b`:

1. **`:90`** — `src/lib/validation/ ISW scoreboard: keyword gazetteer + majority-vote LLM matcher` →
   `src/lib/validation/ ISW scoreboard: versioned gazetteers (gazetteer/: ru-ua-v1 = the production keyword path via the keywords.ts shim; iran-levant-v1 = conflict-plane only, unwired) + majority-vote LLM matcher` (step 06's proposal, still accurate).
2. **`:92-94`** — `src/lib/conflicts/  conflict/region validation domain library (71 files, pure — no DB/ provider/env; CONFLICT_REGISTRY, lanes, scorer, match-contract); imported by nothing in production (design docs in docs/designs/)` → the directory now holds **74 files (38 non-test)**, two of them Postgres backends (`reference-repo-sql.ts` for 0028, `observation-store.ts` for 0030), and it is imported in production by the four flag-gated `src/app/conflicts/**` pages, the unscheduled `conflict-validate` route and `src/lib/isw/edition-discovery.ts`. Suggested: `src/lib/conflicts/  conflict/region validation domain library (74 files, pure except the two Postgres backends reference-repo-sql.ts (0028) and observation-store.ts (0030); CONFLICT_REGISTRY, lanes, scorer, match-contract); imported in production only by the flag-gated /conflicts/** pages, the dormant unscheduled conflict-validate route and src/lib/isw/edition-discovery.ts`.
3. **Current state — Live/repository bullet**: "`main` is code-ahead of production by these two eval-plane-only PRs" is stale by roughly twenty-five merges; at minimum add the step-14 sentence (a report-only `GET /api/cron/conflict-validate` exists in the repository, NOT in `vercel.json`, writing only the 0028 tables; a manual production GET is forbidden by N2) and that migrations 0028–0030 are on `main` and **unapplied in production** (29 migrations there).
4. **Decision-log drafts in the three reports** (step 25 checks accuracy before appending): the 13b draft's "a row cannot claim `keyword` while the result says `llm-majority`" is true, but its wider "the row is a projection of the result" needs the WS3-F04 caveat (the edition id is caller-supplied and unchecked); the step-14 draft's "that measurement is an operator action and has NOT been taken" is superseded — the C5-m measurement WAS taken (2026-09-07/08) and its dry-mode caveat is WS3-F02; the step-06 draft is accurate as written.
5. **`docs/OPEN-TASKS.md`** — #114 and #116 already name step 18 → step 23; add the register ids (WS3-F01, WS3-F08) to their status lines, and file the new items step 23 defers (WS3-F03, F04, F05, F07 at least) under the next free numbers.

## Tests

| gate | result |
|---|---|
| `npm test` at `a7ba98b` (before = after; no code changed) | **4,082 passed / 270 files**, 11.2 s |
| `npm run typecheck`, `npm run lint` | not re-run by hand on the docs-only branch; the enforced pre-push gate runs typecheck + lint + test and its result is recorded in the PR |
| `npm run test:integration -- <5 files>` | **52 / 52** on `br-fancy-wildflower-atoc4ev3` (deleted by the runner) |
| `npx drizzle-kit generate` (scratch worktree) | "No schema changes, nothing to migrate" |
| mutations | 23 run and reverted; 21 caught, 2 survived (WS3-F01, WS3-F09) |
| spend | **$0** |

## Rulings touched and how each is satisfied

- **Ruling 1.** This register quotes no ISW prose: the spelling census reports toponym spellings and counts only, the reproductions use the repository's committed fixtures, and the golden walk reports paths and counts. The audited code's ruling-1 boundaries were verified: no prose column in 0028/0030 (pins + `drizzle-kit` parity), `derived` closed (M15), the observation alphabet measured (#18), `anchor_journal` instants only, the route's `counts.errorMessages` carry `e.message` only (URLs and keys, never `DETAIL` rows).
- **Rulings 2, 3, 4, 5.** Untouched by this audit (no code change). Verified for the PRs: additive-only migrations with `9999` last and byte-identical (lens 1); no paid call site exists in any of the five diffs; `fixture-oracle` results are refused at the store and unrepresentable in the `matcher_rung` CHECK.
- **Ruling 10.** `withCronRun`'s change is the one optional argument (#12); the route opens its row only after validation (`route.test.ts:69-87`).
- **Ruling 21 (analog).** The route's gate is the first statement (`route.ts:47-50`); its ORDER is unpinned (WS3-F09). No page is in the audited set.
- **COMMON §3.** No forbidden file opened; no deploy, env, production write, spend, registry, map-lock or `docs/evals/analysis/` touch. AGENTS.md not edited (write-lock).

## Citations re-verified (at `a7ba98b`; corrected where moved)

| cited | status |
|---|---|
| `edition-discovery.ts:226-228` (`isCleanNotFound`) | correct |
| `edition-discovery.ts:359` (`probeFailures`) | correct |
| `edition-discovery.ts:377-379` (gap confirmation) | **`:377-382`** — the `observed` ternary spans four lines |
| `edition-discovery.ts:502-503` (dry-path fallback) | **`:501-504`** — `stored` at `:502`, `finalKey` at `:503-504` |
| `run.ts:31-41` (`iranUpdateUrlCandidatesForDate`) | correct; `iswUrlForDate :15`, `iranUpdateUrlForDate :21`, `referenceFor :45`, threshold `:105` |
| `editions.ts:73` (`IRAN_SPECIAL_PATH_RE`) | **`:72-73`** (declaration `:72`, regex `:73`) |
| `editions.ts:504-527` (`nextStoredDayStatus`, per step 14's prompt) | **`:692-709`** |
| `fetch-cache.ts:59-62` (retry policy) | correct (`:59-63`) |
| `cron-run.ts:182` / `:183` / `:192` (`const id = await startRun(job)`) | **`:193`** |
| `observation-store.ts:387` / `eval-profile.ts:387, :401` | `isPersistableRawAnchor :387`, `assertPersistableConflictResultV1 :401`, the non-retrospective refusal `:434` — correct |
| `reference-repo-sql.ts:131-136` (`DAY_STATUS_UPSERT_SQL`, per the step-13 prompt) | **`:193-198`** |
| `reference-repo-sql.ts` `MERGE_ATTEMPT_LIMIT` / `ANCHOR_JOURNAL_LIMIT` | `:69`, `:73` |
| `match.ts` `variantSource` / `compileTable` / `expandToponymsWith` | `:53-59`, `:61-79`, `:115-119` |
| `index.ts` own-property lookups | `:76-78` |
| `iran-levant-v1.ts` `bab_el_mandeb` / `deir_ez_zor` / Yemen block | `:78`, `:127`, `:161-168` |
| `route.ts` gate / validation / `withCronRun` / degrade | `:47-50`, `:56-79`, `:81`, `:149-152` |
| `migrations.test.ts` 0028 / 0030 pins | `:83-129`, `:131-278` |
| `vitest.integration.config.ts:14` `fileParallelism: false` | correct |
| `src/db/index.ts` `rawSql` | `:8-11` |
| INDEX §2.4 D4/C13 (unit-flags-v0 never leaves the internal view) | correct; no reader of `latestObservationsFor` exists outside tests at this SHA |
| `C5M-PROBES-2026-09-07.md` §4.1, §6, R.10, R.15 | correct; the 9,661-byte 403 body is in the 2026-09-08 August re-run section ("What the failures actually are", item 1) |

## Decisions needed

1. **D-a — R.15 item 1 (403 as an indeterminate probe class).** OPEN-TASKS #114 recommends option **(b) now, (c) later**; no decision-log entry signs it. Step 23 needs the signature to remediate WS3-F01 as (b). Recommendation: **(b)** exactly as #114 states; (c) (backoff) as its own later decision.
2. **D-b — the edition criterion for a >10 KB zero-unit body (WS3-F03).** (a) register only when `units.length > 0`, count the body as indeterminate and keep the day `probe_failed` (recommended: honest, re-probed next run, no phantom outranks a real edition); (b) keep `failed` editions but exclude them from `published` derivation and from `selectDailyFinal` candidates; (c) leave as designed. This changes a PLAN §3.2a sentence and deserves one line in the log.
3. **D-c — `EDITION_UNITS_VERSION` and the Iran signature gazetteer (WS3-F05).** (a) now, in step 23: compute `derived.units` with `gazetteerFor(series)` and stamp the gazetteer into the version (zero production rows exist, so it is free); (b) defer to step 19. Recommendation **(a)**.
4. **D-d — the N3 backfill mode (WS3-F07).** Build it in step 19 (recommended — it is discovery-adjacent and step 19 already opens the module) or step 23; N3's authorization is read as "after the script exists", with per-row typed refusals counted, never aborting (WS3-F08's eleven rows).
5. **D-e — appending `iran-levant-v1` variants (WS3-F06).** The file's own rule allows append-only edits before any result persists under the version; none has. Confirm step 23 may append and may add the word-mode-only apostrophe/hyphen fold in `match.ts` (substring mode untouched, so the RU/UA proof stands).
6. **D-f — a fifth Iran probe in `run.ts` for #116 (WS3-F08).** It touches the frozen production discovery path (one more politeFetch per Iran validation day). Options: (a) add it, gated to report dates ≤ 2025-06-30; (b) add only the PARSER shape (normalization table) so the backfill can register the eleven rows, and leave production probing alone. Recommendation **(b)** for this window.

## Debt and risks

- **Single-reader audit.** No finding has an independent refuter; every one has a reproduction, a mutation result or a file:line read at the SHA, but step 26 should not treat the absence of a refutation as equivalent to step 17's three-vote rule.
- **The C5 numbers.** Only the March 2026 figures taken on WRITE passes (C5-m passes 1–2) are trustworthy; any `--dry` `anchorNotFinalDays` figure produced before WS3-F02 lands must be discarded, and `probeFailedDays` from any window longer than ~20 not-found requests is a fetch artifact (WS3-F01), not a coverage measure.
- **The 10,000-byte margin (WS3-F03)** is 339 bytes on the host's current error page. A template change on understandingwar.org would produce phantom editions on the next scheduled run — but the route is unscheduled, and production's `run.ts` shares the same threshold, so the exposure is not new, only multiplied.
- **Un-remediated survivors.** M9 and M10 both survive at `a7ba98b`; until step 23 adds the two tests, a reorder of the route's gate or a change to `isCleanNotFound` would ship unnoticed.
- **Not re-measured.** The historical unit counts the reports quote (3,704 / 254 · 3,746 / 255 · 3,954 / 264 · 3,981 / 266) were not re-derived on their branch points; only the HEAD count (4,082 / 270) was measured.
- **Fork deletion** rests on the runner's `deleted …` line, not on a Neon API re-listing.

## Handoff

### For step 23 (remediation), by finding

- **WS3-F01** — the probe-class split, the `probeIndeterminate` counter, the "not confirmable under throttling" branch, 403 tests (needs D-a).
- **WS3-F02** — return the record/identity on `DiscoveredEdition`; `finalKey` over `stored ∪ discovered`; promote R1 (both cases) plus `morning + plain` and a partially-populated-store case to `edition-discovery.test.ts`.
- **WS3-F03** — per D-b; promote R2 as the regression test with the expectations inverted.
- **WS3-F04** — `INSERT … SELECT … FROM benchmark_report_editions WHERE id = $2 AND edition_key = $5 AND series = $3 AND report_date = $4`; unit case + fork case for a mismatched id.
- **WS3-F05** — `unitSignaturesFrom(html, gazetteerFor(series))`, stamp the gazetteer (D-c); fix the vocabulary test to assert against the gazetteer actually used.
- **WS3-F06** — append the variants listed in R3 and the word-mode fold (D-e); land the 54-probe script as a test.
- **WS3-F07** — build `--backfill-from-isw-reports` (D-d) with per-row refusal counting.
- **WS3-F08** — parser shape for the June-2025 suffix form, fixtures for 2025-06-14 / 06-18 (D-f decides the probe half).
- **WS3-F09** — one route test (no header + malformed params → 401, zero DB calls); same for `validate/route.test.ts`.
- **WS3-F10** — tighten the variant invariant; assert every `variantSource` ends anchored or stemmed.
- **WS3-F11** — own-property lookup in `expandToponymsWith` + a `["constructor", "gaza"]` case.
- **Deferrable to OPEN-TASKS:** N05 (advisory lock in `migrations-lib`), N07 (schedule note), N08 (derived journaling), N09 (0029 pin — confirm step 17 covers it), N10 (C5-m wording), N02 (type `final_idx` when C4 designation gets a writer).

### For step 19 (evidence population)

Do not call `persistObservation` until WS3-F04's identity check exists, or resolve the winner's row id from `edition_key` and pass exactly that id. Fill `unit_attribution` from `classifyTheaterWith(gazetteerFor(series), sig.toponyms)` for Iran — the RU/UA `classifyTakeawayTheater` returns only `ru|ua|both`. Expect `derived.units[].toponyms` to be EMPTY for every Iran edition written before WS3-F05 lands; join on `sha256` + `ordinal`, never on signatures. `probe_failed` today means "indeterminate", not "ISW did not publish".

### For step 24 (scoreboard / soak prep)

Render `probe_failed` as indeterminate ("could not be confirmed"), never as a gap; expect `publication_gap` to be rare-to-absent on this host until WS3-F01 lands (C15's trigger is structurally unexercisable under throttling). Add to the WS-3.6 enablement checklist: never run a live `--series` pass while the cron is scheduled (N06); `lookback` stays 2 (N07); a template change on the host's error page is a phantom-edition hazard (WS3-F03) — check the 403/404 body size against `MIN_REPORT_BYTES` at enablement.

### For step 25 (docs sync)

The five items under "Stale standing text". Also record disclosure 1 (Fable ran step 18) wherever the program log records step 18's model.

### For step 26 (final audit)

This register is single-reader and Fable-authored; treat WS3-F01/F02 as confirmed (reproduced), the minors as verified-by-one, and re-check M9/M10's status after step 23.

### Prompt rewrites this register earns

- **`…-23-remediate-audits.md`** — paste the WS3 ids above with their exact remediations and the six decisions; name R1/R2 as the pre-fix failing tests the prompt shape requires ("the fix includes a test that fails on the pre-fix code" — R1 and R2 PASS on the pre-fix code by construction, so invert their expectations when promoting them).
- **`…-19-ws3-3-evidence-population.md`** — add to `Depends on`: WS3-F04 (or the id-from-key discipline), WS3-F05's empty Iran signatures, WS3-F07 if the backfill is assigned to step 19.
- **`…-24-ws3-5-scoreboard-and-soak-prep.md`** — the three checklist items above and the `probe_failed` = indeterminate rendering rule.
