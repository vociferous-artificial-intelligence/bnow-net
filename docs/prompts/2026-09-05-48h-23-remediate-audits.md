# Step 23 — Remediate the audit findings (steps 17, 18) — FILLED 2026-09-09 (Stage 3 row C)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session — **one session per lane**, launched separately as `23r` and `23c` through `scripts/launch/launch.sh` |
| Worktree | **23r** (WS-2 register): `/Users/go/code/bnow-net-worktrees/48h-ws2-routing-20260905`, lane branch `48h/ws2-routing-20260905`, step branch `48h/ws2-routing-20260905-remediate-ws2`. **23c** (WS-3 register): `/Users/go/code/bnow-net-worktrees/48h-audit-ws3-20260905`, lane branch `48h/audit-ws3-20260905`, step branch `48h/audit-ws3-20260905-remediate-ws3`. (23c was moved off `ws3-conflict` on 2026-09-09 so it can run alongside step 19, which holds that worktree.) |
| Window | Stage 3 row C; both lanes may run in parallel with step 19 |
| Depends on | both registers on `main` (#74 `0924ed9`, #78 `c32213a`); the operator's FIX / DEFER marks below (confirmed — see the confirmation line); decision-log entries A1, A2, A3 (signed 2026-09-07) and **D-a … D-f (signed 2026-09-09 — verify the entry exists, see §0)** |
| Rewrite from | `docs/reviews/WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md` (71 findings; §Handoff "For step 23"), `docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md` (21 findings; §Handoff "For step 23 (remediation), by finding" and §Reproductions R1/R2/R3), `docs/reviews/RELIABILITY-PROOFS-2026-09-06.md` §Handoff "For step 23", `docs/reviews/C5M-PROBES-2026-09-07.md` R.15 |
| Spend | $0. Fork itests only (trimmed four-key `.env.local`); no paid call anywhere in this step |
| Closing report | `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` — **one file, two sections (`## Lane R` and `## Lane C`)**; whichever lane finishes second appends its section (rebase first; the file is not `merge=union`, so resolve by keeping both sections) |

**Which lane you are is decided by your worktree, nothing else.** Run
`git rev-parse --show-toplevel` first: `…/48h-ws2-routing-20260905` ⇒ you are **lane R** and
do ONLY the "Lane R" table below; `…/48h-audit-ws3-20260905` ⇒ you are **lane C** and do ONLY
the "Lane C" table. Any other toplevel (the main checkout, `ws3-conflict`, anything under
`/sessions/`) ⇒ STOP and tell the operator. Never do the other lane's findings, even if its
session seems absent.

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then your lane's register end to end, then
the two handoffs named above. COMMON §1 applies: your lane branch was reset to `origin/main` by
the launcher — cut the step branch from it.

## 0. Binding facts at launch (read before planning)

- `main` at launch is `f55534e` or later. CP5 landed steps 18, 20, 21, 32, 33, 34 (INDEX §10,
  2026-09-08 line). Gate on `main`: 4,332 unit tests / 282 files, lint 0 errors, build PASS.
  Nothing in `drizzle/` or `src/db/schema.ts` moved since the registers were written.
- **Signed decisions you rely on** (all in `AGENTS.md` `## Decision log`; verify by title):
  A1 (a) — WS2-F06 is filed as **OPEN-TASKS #110** and fixed here, one hunk + pin, own PR;
  A2 (b) — the drain runbook order is corrected before the drain is registered (WS2-F04 is a
  docs fix, this step); A3 — bounded verification accepted; C15 (a+); the D4 unit decisions
  C1–C14. **D-a … D-f** are the WS-3 register's six decisions; the operator signs them in one
  entry titled "2026-09-09 (D-a … D-f — WS-3 audit register decisions signed)". If that entry
  is absent when you start, lane C prints `AWAITING AUTHORIZATION: D-a…D-f`, does the
  decision-free findings (WS3-F02, F04, F09) and stops; lane R is unaffected.
- **Already closed on `main` by step 20 — do not re-fix, record as CLOSED-BY-#75/#81:**
  WS2-F16 (`live-runner.ts` now calls `pricedFor(provider, model)`); WS2-F17 — verify: the
  post-#81 `resolveWorkloadModel` refuses an allowed non-OpenAI provider whose `<W>_MODEL` is
  absent; if a test pins that, mark CLOSED, else add the pin.
- **The G5 characterization tests exist and must be INVERTED, not deleted**:
  `src/integration/runtime-logs.itest.ts`, describe *"G5 characterization…"* (step 21). Its
  three `expect(message).not.toBe("")` assertions flip to "the batch stored" the moment the NUL
  strip, int4 clamp and row clamp land; rewrite its block comment with them. Measured error
  strings to assert absent: `invalid byte sequence for encoding "UTF8": 0x00` ·
  `value "2147483648" is out of range for type integer` ·
  `bind message has 8 parameter formats but 0 parameters`. WS2-F26's boundary is measured at
  **5,461 / 5,462 rows**; clamp `LOG_DRAIN_MAX_ROWS` at **5,000** (clamp only — no chunking).
- **OPEN-TASKS**: #110 (WS2-F06), #112 (`env -u` does not protect a script that imports
  `./env` — the proposed `migrate.ts` boundary guard is this step's, lane R), #114 (WS3-F01),
  #116 (WS3-F08). Next free number is **#119** — the single DEFER bundle entry (one lane files
  it; the other appends to it after rebasing).
- **Rules that bind every fix**: a test that FAILS on the pre-fix code, with the failing run
  pasted in the report (the register's own reproduction is usually that test; the WS-3 R1/R2
  reproductions PASS on pre-fix code by construction — invert their expectations when promoting
  them); one commit per finding titled `<area>: <finding id> — <imperative>`; findings that
  share a file may share a PR (the bundles below); re-run the lens the finding came from on the
  fixed diff; never widen scope past the finding.
- Never edit `AGENTS.md` (COMMON §4.7); put proposed standing-text corrections in the report
  for step 25. Never touch `docs/evals/analysis/`. Never edit an applied migration; **no new
  migration in this step** (WS3-F01's `dayStatusReason` is RETURN-shape only;
  `benchmark_series_days` keeps its two-value CHECK).
- If you open stacked PRs, say so in the report: the operator must `gh pr edit <n> --base main`
  before merging each PR above the bottom of the stack (CP5 incident).

## 1. The marks — operator-confirmed

OPERATOR CONFIRMATION OF MARKS: PENDING

(If the line above still reads PENDING, print `AWAITING AUTHORIZATION: step-23 marks` and
stop. The operator confirms by replacing PENDING with a dated CONFIRMED line before launch.)

Shape chosen (plan §5.3): the five majors FIX; minors and notes that touch a spend path, a
gate, a migration or production-visible behaviour FIX; everything else DEFER into one
OPEN-TASKS entry (#119) with register id, severity and one line of why; do-not-apply and
docs-only items route to step 25, not to code.

### Lane R — WS-2 register (#74)

| Mark | Findings | Shape |
|---|---|---|
| FIX (major) | **WS2-F06** | Own PR. One hunk in `legacyAnswer`: `askGuardFromEnv()` → `init()` → `tryReserve()` → deterministic top-6 cited-claims fallback with provider `"budget"` on refusal → `record(1, pt+ct, estimateCostUsd(model, pt, ct))` after the call and before any body interpretation; request payload byte-identical. Pin in `ask.test.ts` (tryReserve exactly once before `chat.completions.create`; record once after; refusing guard ⇒ provider `"budget"` and create never called). Amend the #67 report's legacy bullet (unreserved and unmetered). Close #110's status line. Proposed decision-log entry in the report. |
| FIX (major) | **WS2-F07** | `limits.test.ts`: install the `evidence_snapshot` queryMock after `:1112` and after `:904` (describe-scoped SNAPSHOT at `:808`); optionally a `budget` sibling. Prove the pin discriminates with the register's M12 mutant. Correct the report sentence "Every one of those is pinned". |
| FIX (major, docs) | **WS2-F04** + note **WS2-F59** | `docs/designs/LOG-DRAIN.md` §8 step 3b (backup branch, `npm run db:migrate`, `SELECT name FROM _migrations WHERE name LIKE '0029%'` = one row, BEFORE registering the drain); mirror into `docs/reviews/LOG-DRAIN-2026-09-06.md` :265-269; "needs no observation window but DOES need the db:migrate line". `docs/RELEASE-CHECKLIST.md` step 5 (fail-closed SECRET line, precedent `LOG_DRAIN_SECRET`) and step 11 (the 0028/0029/0030 precedent; migrate before registration). A2 (b) signed. |
| FIX (bundle: drain hardening, one PR) | **WS2-F03, F24, F25, F26, F52, F54** | `src/lib/logs/drain.ts` / `route.ts`: NUL strip in `str()`/message + int4 clamp (F03); identifier-suffix redaction rule for `*_SECRET/_TOKEN/_API_KEY=` (F24); `posInt` floors before the `> 0` check, tests "0.5"/"0.99" (F25); `LOG_DRAIN_MAX_ROWS` clamped to 5,000 + test (F26); hex regex `{40}` + odd-length test (F52); HMAC over `req.arrayBuffer()` bytes, not the re-encoded text (F54). Invert the G5 describe in the same PR and run `runtime-logs.itest.ts` on a fork (name the branch in the report). |
| FIX (bundle: remap guard, one PR) | **WS2-F05, F29** | `scripts/map-remap.ts`: subprocess pin that `assertBaseAck` runs before `driveMapRemap` (a commented-out or try-wrapped call fails it); `remapTargetId(opts.base)` at both verbatim prints (:367, :387) + a userinfo-leak test. |
| FIX | **WS2-F12** | `scripts/ask-eval-harvest.ts` `modeGenerate()`: `process.exit(2)` when `isLlmDisabled()` or `ANALYSIS_PROVIDER === "stub"`, before any client; test. |
| FIX | **WS2-F14** | `pricing.test.ts:41` loop `[1, 3, 10, 77, 12_345]` (kills the grouping mutant). |
| FIX | **#112 guard** | `scripts/migrate.ts` boundary guard per OPEN-TASKS #112's proposal (refuse when `DATABASE_URL` and `DATABASE_URL_UNPOOLED` name different hosts, unless both are set on the command line); test with a spawned process. |
| CLOSED-BY-20 | WS2-F16, F17 | Record only (verify F17's refusal is pinned; add the pin if not). |
| → step 25 (docs) | WS2-F08 (do-not-apply), F09, F13 (docs half), F18, F19, F20 (docs half), F27, F28, F30, F33, and notes F11, F34, F35, F38, F40, F44, F45, F62, F64, F69, F70, F71 | Not this step's. Confirm they are on the register's "Stale standing text" list or add them to the report's step-25 list. |
| → step 27 | WS2-F68 | Pre-deploy `vercel env ls` confirms `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `ASK_PIPELINE` absent — carried into step 27's prompt. |
| DEFER → #119 | WS2-F01, F02, F10, F13 (code half), F15, F20 (test half), F21, F22, F23, F31, F32, and notes F36, F37, F39, F41, F42, F43, F46, F47, F48, F49, F50, F51, F53, F55, F56, F57, F58, F60, F61, F63, F65, F66, F67 | One OPEN-TASKS entry, table form: id · severity · file:line · one-line remediation · why deferred (test-strength, docs-adjacent, or fail-closed already). |

### Lane C — WS-3 register (#78)

| Mark | Findings | Shape |
|---|---|---|
| FIX (major; needs D-a = (b)) | **WS3-F01** | `edition-discovery.ts`: `classifyProbe(p): "edition" \| "clean_not_found" \| "indeterminate"` (indeterminate = 403 / 429 / ≥500 / null / undersized-200); `probeIndeterminate` reported separately from `probeFailures` in `EditionDiscoveryResult` and the route's counts; explicit "not confirmable under throttling" branch (`dayStatus: "probe_failed"`, `dayStatusReason: "throttled" | "unparseable_body"` in the RETURN shape only — no migration; `unparseable_body` is D-b's zero-unit 200, so the new class does not re-conflate); tests with `status: 403` for single-run `probe_failed`, no confirmation on the second run, and the counter split (kills mutant M10). Backoff (R.15 option (c)) is NOT this step's. Update #114's status line. |
| FIX (major) | **WS3-F02** | Return the record/identity on `DiscoveredEdition`; `finalKey` over `stored ∪ discovered`; promote R1 (both cases, expectations inverted) plus `morning + plain` and a partially-populated-store case into `edition-discovery.test.ts`. |
| FIX (needs D-b) | **WS3-F03** | Per D-b = (a): register an edition only when `units.length > 0`; count the body as indeterminate with reason `unparseable_body`, keep the day `probe_failed`. Promote R2 with expectations inverted. Changes one PLAN §3.2a sentence: quote the before/after in the report for step 25. |
| FIX | **WS3-F04** | `observation-store.ts` `persistObservation`: `INSERT … SELECT … FROM benchmark_report_editions WHERE id = $2 AND edition_key = $5 AND series = $3 AND report_date = $4`; unit case + fork case for a mismatched id. **Step 19 runs in parallel in `ws3-conflict` and calls this function** — keep the signature unchanged (the check needs no new parameter; every value is in `ConflictObservationInput`). The operator merges whichever lane delivers first; if 19 merged first, rebase onto it — the hunk is inside the function body and cannot collide with a caller. |
| FIX (needs D-c = (a)) | **WS3-F05** | `unitSignaturesFrom(html, gazetteerFor(series))`; stamp the gazetteer into `EDITION_UNITS_VERSION`; fix the vocabulary test to assert against the gazetteer actually used. Free **contingent on production still standing at 29 migrations (0028–0030 unapplied) at launch** — verify, then no backfill; if it has changed, say so in the report. |
| FIX (needs D-e) | **WS3-F06** | Append the R3 variants **plus `tel-aviv`** (OPEN-TASKS #120: measured ×2 in the cached corpus against `tel aviv` ×8; the fold does not reach hyphen↔space) to `iran-levant-v1` (append-only; no result has persisted under the version); apostrophe/hyphen fold in `match.ts` **in the word path only, placed AFTER the `matchMode === "substring"` early return** — NOT at `:97`, which sits above that branch and would change `ru-ua-v1` too; fold the **variants as well as the text**, so substring mode stays byte-identical and the RU/UA proof stands; land the 54-probe script as a test. Do NOT add `al quds` or `shirazi` (#120: org name and demonym — precision loss); the `al-quds` and `bab el-mandeb` precision findings are v2-shaped and stay in #120. |
| FIX (needs D-f = (b)) | **WS3-F08** parser half | Parser shape (normalization table) for the June-2025 suffix slug form + fixtures for 2025-06-14 / 06-18; **no production probe added** (D-f (b)); the `run.ts` production discovery path stays byte-identical. Update #116's status line. |
| FIX | **WS3-F09** | One route test per route (`conflict-validate` and its sibling `validate`): no header + malformed params → 401 and zero DB calls (kills mutant M9). |
| FIX (D-d = lane C) | **WS3-F07** | Build `--backfill-from-isw-reports` per PLAN-WS-3 §3.2a with per-row typed refusals counted, never aborting. **The eleven June-2025 rows are IN scope, not excluded** — #116's do-not-run instruction is about a *network discovery* backfill and still stands, but this mode is zero-network and D-f (b)'s parser shape (this lane) makes those suffix-form URLs normalizable, so they register. No HTML, so **exempt by construction from D-b's unit criterion**: write `parseStatus: "pending"`, never `failed`, and say so in the report. N3 reads "after the script exists"; $0, fork only. |
| DEFER → #119 | WS3-F10, F11, N01, N02, N05, N06, N07, N08, N09, N10 | Same bundle entry as lane R (append after rebase). N09: confirm step 17's ruling-5 check covers the 0029 pin before deferring. |
| → step 25 (docs) | WS-3 register "Stale standing text" items 1–5 | Not this step's. |

## 2. Prompt shape

For each FIX: one commit per finding (bundles share a PR); the failing-first run pasted; the
lens re-run recorded. For each DEFER: the #119 table row. Blockers cannot be deferred (none
exist). After remediation, ask a fresh read-only re-check session (lane R: Opus — **not Fable**,
which step 26 must not share with step 18's register author either; lane C: Opus) to confirm
each fixed finding closed with a short prompt you include in the report; paste the
confirmations. Merge order for CP6 is the operator's: whichever of 23c / 19 delivers first, then the other, then 23r (if both wait together, 23c before 19 so 19's PR 2 consumes the fixed module); any conflict
in code, `drizzle/` or `src/db/schema.ts` stops the queue.

Acceptance (per lane): unit count before → after; typecheck; lint; fork itest names and the
fork branch name (deleted); `git diff vercel.json` empty; no env named as set; `$0`.
Handoff: what step 25 applies (proposed AGENTS.md changes, register ids to add to #114/#116/#110
status lines), what step 26 re-refutes (M9/M10 status after this step), and what step 27 must
see in front of the operator (the corrected drain order, the RELEASE-CHECKLIST lines).
