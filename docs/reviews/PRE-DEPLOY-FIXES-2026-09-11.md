# Pre-deploy fixes — the four go-after-fix items from step 26, plus AGENTS.md headroom

## Scope

**Prompt:** `docs/prompts/2026-09-11-48h-pre-deploy-fixes.md` (with its §3/§3a additions of
2026-09-11, commit `e489ff9`). **Lane / worktree:** `48h-gov-20260905`. **Branch:**
`48h/gov-20260905-pre-deploy-fixes`, cut from lane branch `48h/gov-20260905` = **`e489ff9`** =
`origin/main` at session start (0 ahead / 0 behind, verified). **Attended**, Opus / high.

Docs only. Nothing under `src/`, `scripts/` or `drizzle/`; no lockfile, no migration, no launch,
no `.env.local`, no provider call, no Vercel read or write, no production database contact.
**$0.** `git diff origin/main --stat -- src scripts drizzle package.json package-lock.json` is
empty.

The register's remediation text (`docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` §4 majors
and §5.1) was the authority throughout; it did not disagree with the prompt anywhere, and the
one place the prompt left a choice — whether to mirror AUD-05 into `docs/RELEASE-CHECKLIST.md`
— the register does not ask for, so the mirror was not made (§8's A2(b) `0029` gate already
lives there from step 23).

## Built

Seven commits, one per item plus one precision follow-up.

| Item | File | Before → after |
|---|---|---|
| **AUD-03** (`e2dc289`) | `docs/SETUP-NEXT-WEEK.md:176,194,195` | `cd ~/code/bnow.net` → `cd /Users/go/code/bnow-net`; `date -u -d yesterday` (×2) → `date -u -v-1d`, with PR #50's GNU-user annotation restored above them. Byte-identical to `74c7903` (PR #50) for those two hunks; #52's newer Anthropic paragraph — the half of the file #52 legitimately rewrote — is untouched. **Proven by execution on the Mac:** `date -u -d yesterday +%F` → `date: illegal option -- d`; `date -u -v-1d +%F` → `2026-09-10`; `/Users/go/code/bnow-net` exists. |
| **AUD-06** (`7cd7e85`) | `docs/OPEN-TASKS.md` #79 | Headline `[Tier 2] …` → `[CLOSED 2026-09-07 — EXECUTED under the signed O2; do NOT re-run]`, plus a status block with the measured counts (ru pending **36 → 0**, parsed 1,562 → 1,598, **5,421** citations, 98 sources, `source_theater_stats` 7,068 → **7,174** rows, 0 cited-but-zero-count sources, backup branch `br-wispy-silence-atgxus3y` deleted 2026-09-07T21:28:43Z) and an explicit **re-running is not a no-op** warning naming `sources.reliability_score` and `digest.ts:89,100`. Original text retained below as history; #113 already carries the residue. |
| **AUD-05** (`5d18309`) | `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md` | New **§2.0, "the two gates that come first"**, ordered ahead of every other enablement item. Gate 2 is AUD-05's: migrations **0028** (`benchmark_report_editions`, `benchmark_series_days`) and **0030** (`conflict_validation_observations`) applied and verified before the `vercel.json` cron line, with the two `SELECT`s that must answer, and the failure mechanism stated (fetch-first/write-second, no `to_regclass` preflight in `reference-repo-sql.ts`, per-cell `42P01` → `markDegraded(…, "nested_errors")` at `conflict-validate/route.ts:228` — no 500, no halt). §1.1, §9 and a dated header amendment follow. |
| **C13-b/C10-b in the same edit** | same file, §2.0 gate 1 + §3 + §9 | §3's open question ("may a `unit-flags-v0` number be public at flag-on?") is recorded as **answered, option (a)**, its reasoning retained verbatim under a resolution note; the gate itself sits at §2.0 as gate 1. |
| **AUD-04** (`165f96f`, tightened by `b1860ee`) | `AGENTS.md` routing bullet | "resolves (model, effort)" → "(provider, model, effort)" with the openai-only precedence caveat; the fail-closed list gains the `providers.ts` allowlist refusal, the non-openai-needs-an-explicit-`<WORKLOAD>_MODEL` refusal and per-provider pricing; **"All ten routing envs" → "FIFTEEN routing envs, not ten"**, naming the five workloads × `_MODEL`/`_REASONING_EFFORT`/`_PROVIDER` as declared in `WORKLOAD_ENV` (`src/lib/llm/model-config.ts:74-84`), plus `OPENAI_MODEL` and the sixteenth name `ANALYSIS_PROVIDER` that `model-config.ts` deliberately does not read. |
| **Twelfth archive pass** (`28228e3`) | `AGENTS.md` + `docs/DECISIONS.md` | The whole **2026-09-06** run — nineteen entries — moved verbatim to the archive; both split-pointer paragraphs corrected; one record entry appended. |
| **§3a** (`945b1b7`) | `AGENTS.md` + `docs/OPEN-TASKS.md` | Decision entries **T3-c** and **C13-b / C10-b** appended, dated 2026-09-11, signed (not marked UNSIGNED); **OPEN-TASKS #121** filed. |

**AUD-02 — the operator's act, verified read-only here.** `git -C /Users/go/code/bnow-net branch
--list docs/operator-notes-20260905` prints **nothing** (deleted); `git ls-remote --heads origin
docs/operator-notes-20260905` prints **nothing**; `git ls-remote --heads origin
'refs/heads/docs/*'` returns only `docs/branding-strategy-20260909`, exactly as the register
predicted; `git log --all -- docs/OUTREACH-ROSTER-2026-08-23.md` returns **no commit**, so the
roster is reachable from no ref in this repository. The roster itself is preserved outside git
at `/Users/go/code/bnow-operator-notes/OUTREACH-ROSTER-2026-08-23.md` (25,498 bytes, `git
rev-parse` there: "not a git repository") — **not** at the `~/operator-notes/` path the prompt's
§2 named, which does not exist. The file was not opened. **AUD-02 is fully discharged.**

### The archive pass, proven

`bash scripts/check-decision-log-move.sh HEAD`, run on the **pure move before the record entry
was appended**: **PASS** — 216 entries before (53 AGENTS + 163 DECISIONS) and 216 after (34 +
182), every body byte-identical and accounted for, **0 duplicated**, **0 invented**, ascending
date order in both files, ceiling ok. Bytes were conserved exactly: **399,392** across the two
files before and after the move.

`AGENTS.md`: **149,979 → 129,154** characters by the move (including the two pointer
paragraphs), → 131,225 with the record entry, → **135,176** with §3a's two decision entries and
the AUD-04 precision edit. **14,824 characters of headroom** under the 150,000 ceiling, against
step 27's 2–4k deploy entry plus signing the step-25 closing entry (a shrink).

Re-run **with** the new entries present, the same script reports `0 lost or edited, 2 new` and
exits non-zero. That is the eleventh pass's documented readout: the script compares entry-body
sets, so any entry this session legitimately appends counts as "new". **Lost-or-edited is 0,
which is the assertion that matters**; duplicates 0 and order ok in both files on every run.

Scope discipline on `AGENTS.md`: the diff is exactly four hunks — the AUD-04 bullet, the
split-pointer paragraph, the removal of the 2026-09-06 run, and the three appended entries. The
nineteen `AGENTS.md` §8 proposed standing-text corrections the audit lists were **not** applied
(prompt §5 permits only the AUD-04 line, the move and the record entry); they are debt below.
`grep -c UNSIGNED AGENTS.md` = **1**, unchanged — the step-25 closing entry is untouched and
stays unsigned.

## Tests

| Gate | Result |
|---|---|
| `npm run typecheck` | clean, 0 errors |
| `npm run lint` | **0 errors, 3 warnings** — the same three pre-existing `no-unused-vars` |
| `npm test` | **4,599 passed / 293 files**, unchanged in both numbers (a change would have been a STOP) |
| `git diff origin/main --stat -- src scripts drizzle package.json package-lock.json` | empty |
| `bash scripts/check-decision-log-move.sh HEAD` | PASS on the pure move (above) |
| Secret / PII scan over the whole diff | no credential value; **zero** email addresses, zero phone-shaped strings |

**Spend: $0.** No integration test was run — nothing in this PR touches a code path any itest
exercises.

## Rulings touched and how each is satisfied

- **Ruling 1 (legal).** No ISW prose enters anything here. The archive move is a byte-for-byte
  transfer of existing decision entries; no source or reference text was introduced.
- **Ruling 5 (migration additivity).** No migration was written, edited, renumbered or applied.
  AUD-05's new §2.0 *gates* the application of 0028/0030 in production and asserts nothing about
  their content; `drizzle/` is byte-identical to `origin/main`.
- **The AGENTS.md maintenance rule** (append-only log; standing sections corrected in place).
  The log was appended to at the end of `## Decision log`, in date order, before
  `## Conventions`. No existing entry was edited — proven mechanically, `0 lost or edited`. The
  two standing texts corrected in place are the routing bullet (AUD-04, which the prompt
  authorizes explicitly) and the two split-pointer paragraphs the pass itself makes wrong.
- **Ruling 4 is described, not changed.** The AUD-04 bullet now states the provider dimension of
  the fail-closed gate; ruling 4's own paragraph already carried it (2026-09-08) and was left
  alone, so the two now agree instead of differing.

## Citations re-verified

Every line relied on was re-read, not copied:

- `src/lib/llm/model-config.ts:74-84` — `WORKLOAD_ENV`, five workloads × three names = the
  fifteen. (The register cited `:78-82`, the five rows; the declaration spans `:74-84`.)
- `src/lib/llm/model-config.ts:23-24, 185-236` — `ANALYSIS_PROVIDER` deliberately not read;
  the refusal branches for unknown provider, `stub`, and non-openai-without-a-model.
- `docs/SETUP-NEXT-WEEK.md:176,194,195` — confirmed at the exact lines the register named.
- `src/lib/conflicts/reference-repo-sql.ts` — no `to_regclass`; the only four in the tree are in
  `src/integration/*.itest.ts`. `src/app/api/cron/conflict-validate/route.ts:228` — the
  `markDegraded(counts, "nested_errors", …)` call.
- `drizzle/0028_lumpy_dragon_lord.sql` / `0030_conflict_observations.sql` — the three table
  names. `scripts/migrations-lib.ts:85-110` — `_migrations (name text PRIMARY KEY)` keyed by
  file name, so `name LIKE '0028%'` is the right predicate.
- For #121: `publication-guard.ts:57` (`ALLEGATION_MIN_DOCS = 2`), `synthesize.ts:409-420`
  (native-hedging recompute), `estimative.ts:255` (`corroborationTier`), `:307` (the `withheld`
  path), `reduce-io.ts:118-126` (`mirrorOf` from `doc_dedup`), `reduce.ts:286,367`
  (`independentSourceCount` and the promotion threshold), `estimative.test.ts:361-366` (the
  import-hygiene `FORBIDDEN_SOURCE` regex that names `publication-guard`),
  `ics206.ts:103-105` (the AJP-2.1 code deliberately absent), `claim-estimative.tsx:59-77`
  (`title` only, no aria-label — AUD-50), and all four render-site gates
  (`digests/[country]/[date]/page.tsx:273`, `search/page.tsx:108`, `ask/page.tsx:41`,
  `/signals` inside `if (accepted)`) — each confirmed to be `requireAcceptedUser()`.
- `docs/reviews/MAP-REMAP-RUNBOOK-2026-09-06.md:165-176` — the 2026-09-08 `vercel env ls`
  across all three environments (46 / 28 / 20 rows, each with a positive control), whose
  recorded readout covers the NEON/DATABASE names and `MAP_CONTENT_CHARS` only. This is why the
  AUD-04 sentence was tightened by `b1860ee` from "never read back" to **"never verified
  absent"**: a listing was taken; these five names were never extracted from it.

## Decisions needed

**None.** The two questions this session would otherwise have had to raise were taken by the
operator on 2026-09-11 and are appended in §3a as decision-log entries: **T3-c** (named-person
allegations take the estimative `withheld` path; AUD-01 option 1, with AUD-49 folded in) and
**C13-b / C10-b** (`compound-v1` before `CONFLICTS_UI`). Neither is marked UNSIGNED. Nothing in
scope required a code change, so nothing was deferred on that ground.

## Debt and risks

Not touched here, by prompt scope — every one is from the step-26 register:

- **Minors:** AUD-07 (client-boundary scan covers 2 of 13 modules), AUD-08 (degraded Ask answers
  render identically to full ones), AUD-09 (0029 has no additivity guard), AUD-10
  (`assertMigrationTarget` compares hostnames only; a `#`/`?`/`/` in a new password prints both
  DSNs), AUD-11, AUD-12, AUD-13, AUD-14, AUD-15, AUD-16, AUD-17, AUD-18, AUD-49, AUD-51.
- **Notes:** AUD-19 through AUD-48 and AUD-50. AUD-45 (WS2-F06's pricing half, filed nowhere)
  and AUD-46 (`llm_conflict_match` records 1 token per request by construction) are the two most
  likely to bite whoever reads soak or Ask spend numbers next.
- **The nineteen `AGENTS.md` §8 standing-text corrections** remain unapplied: AUD-23
  (`VERCEL_TOKEN` stated two incompatible ways across five documents, D8 being the most recent
  adjudication), AUD-24 (post-drain registry counts: 10,224 sources / ir 3,681), AUD-25 (the
  merged-PR range is 49 merges, #47/#48 and #49–#97), AUD-26 (#33's last two "never executed"
  places), AUD-27 (the stale `143964a` stamp line), AUD-28 (ruling 4's cap list omits three caps
  and **wrongly implies `OPENSANCTIONS_CALL_CAP` fails closed** — a false clause in an
  invariant-grade ruling, the sharpest of the set), AUD-29 (ruling 21's missing C10 carve-out),
  AUD-31 (three migrations and two feature PRs with no decision-log entry, tracked nowhere),
  AUD-40's doc-truth items, and the `AGENTS.md:3` "~300 lines" rule that contradicts the
  enforced 150,000-character one. Each needs a governance step or the operator.
- **Risk of this PR itself:** low. It changes no executable path. The one way it could mislead is
  if a reader takes the AUD-04 bullet's fifteen names as *verified absent* — the bullet says the
  opposite in bold, and step 27's read-back is what settles it.
- **Not carried forward:** the eleventh pass's own note that the move script's "N new" line is
  expected. It is restated in the twelfth pass's entry so the next pass does not rediscover it.

## Handoff for step 27

1. **The smoke test now runs on the operator's machine.** `docs/SETUP-NEXT-WEEK.md`'s
   "10-minute smoke test" is the one the operator is told to run after each key they add, and
   step 27 adds `LOG_DRAIN_SECRET`. Both broken steps are fixed: `cd /Users/go/code/bnow-net`,
   and `date -u -v-1d +%F` in steps 5's two `curl`s.
2. **The environment read-back (register gap G3) has fifteen names, not ten.** Read all three
   environments with a positive control — an absence check without one is not a check
   (`MAP-REMAP-RUNBOOK-2026-09-06.md:1029-1032`):
   - `MAP_MODEL` `REDUCE_MODEL` `DIGEST_MODEL` `VALIDATION_MODEL` `ENTITY_AUDIT_MODEL`
   - `MAP_REASONING_EFFORT` `REDUCE_REASONING_EFFORT` `DIGEST_REASONING_EFFORT`
     `VALIDATION_REASONING_EFFORT` `ENTITY_AUDIT_REASONING_EFFORT`
   - `MAP_PROVIDER` `REDUCE_PROVIDER` **`DIGEST_PROVIDER`** `VALIDATION_PROVIDER`
     `ENTITY_AUDIT_PROVIDER` — the five that have never been verified absent, and
     `DIGEST_PROVIDER` is the only one that can select a second vendor.
   - plus `OPENAI_MODEL` (the openai-only global default), `ANALYSIS_PROVIDER` (a different
     switch `model-config.ts` does not read, `src/lib/analysis/provider.ts`), `MAP_CONTENT_CHARS`
     (R4's hazard — it is part of the extractor-version basis), and the audit's own §6 item 2:
     the **`ASK_EMBED_MODEL` value question**, which decides whether PR #59 is inert.
3. **The WS-3.6 soak checklist has a new first section, §2.0**, and it is not step 27's to
   discharge — it gates WS-3.6, not this deploy. Gate 1: `compound-v1` before `CONFLICTS_UI`
   (C13-b/C10-b). Gate 2: 0028 and 0030 applied and verified before the cron line. Step 27 does
   apply 0028/0029/0030 in the A2(b) order, which satisfies gate 2's precondition — but the cron
   line still must not be added, and **N2 still forbids a production
   `GET /api/cron/conflict-validate` with `CRON_SECRET`**.
4. **`docs/OPEN-TASKS.md` #79 must not be re-run**, and now says so in its headline. If any
   Tier-2 sweep is done around the deploy, that entry is closed.
5. **`AGENTS.md` has 14,824 characters of headroom.** Step 27 signs the step-25 closing entry
   (currently the file's only `UNSIGNED`) and appends its deploy entry; both fit. D5's 7-day
   window is **not** amended — the next archive pass reverts to it, and after 2026-09-14 the
   2026-09-07 run becomes eligible by the ordinary rule.
6. **Two decisions landed while you were away** and are in the log: T3-c (implementation filed
   as OPEN-TASKS #121, owned by the next program's first wave, not deploy-gating — every render
   site is accepted-user gated) and C13-b/C10-b.
