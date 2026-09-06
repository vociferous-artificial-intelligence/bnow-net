# Runbook: RU ROCA citation registry drain (OPEN-TASKS #79)

**For the operator to execute — this runbook is written, not run, by the 48h program's
step 03 session.** Step 03 has no O2 authorization (production writes) and made zero
database writes and zero paid calls while producing this file. Every command below is
read-only or additive-only; none needs an LLM key, so this whole runbook costs **$0**.

## Background

OPEN-TASKS #79: 36 `ru` ISW reports (2026-07-04 → 2026-08-14) sit `parse_status='pending'`
with zero citations; the newest fully-parsed `ru` report is 2026-07-03. The 2026-08-15
Iran validation recovery gave `validateDigest` a going-forward citation-refresh hook
(theater-agnostic — it now refreshes citations for every report it fetches), but that
does not retroactively fix rows that predate the hook. This is the same historical-
staleness shape the Iran recovery fixed for `ir` (`docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`)
— this runbook applies the same drain to `ru`. Deliberately not run during the Iran
recovery itself, which was authorized only for `ir`.

**Cost basis (verified by reading the import lines, not assumed):** neither
`scripts/isw-refresh.ts` nor `scripts/registry-materialize.ts` imports any LLM/OpenAI
module — both import only `@neondatabase/serverless`, the ISW parse/load helpers,
`politeFetch`, and `utcDayRange`. Network egress is to `understandingwar.org` only (via
`politeFetch`, disk-cached, ≥2s/host spacing). No `openai_*` provider row will move.

## Steps

### 1. Preflight (read-only)

```bash
npx tsx scripts/sqlq.ts "SELECT parse_status, count(*)::int, max(report_date)::text FROM isw_reports WHERE theater='ru' GROUP BY 1"
```

Expect roughly **36 pending** (the #79 figure recorded 2026-08-15; the real count may
have drifted since — trust this query's live output, not the historical figure). **Note:
`scripts/sqlq.ts` has no read-only guard** — it executes whatever SQL string it's given,
including writes. The query above is a plain `SELECT`; nothing else should be run through
it during this runbook.

### 2. Backup

```bash
npx tsx scripts/neon-branch.ts create
```

Prints `{"branchId": "...", "connectionString": "..."}`. **Note the branchId** — this
tool always names the branch `itest-<timestamp>` (it has no custom-name option; see
`scripts/neon-branch.ts`), unlike the Iran recovery's manually-named
`backup-pre-iran-recovery-2026-08-15` branch. That's fine — the branch is an
instant copy-on-write fork of production (schema + data + roles) either way; the name is
cosmetic. Keep the branch until step 7's decision-log entry is written and signed, then:

```bash
npx tsx scripts/neon-branch.ts delete <branchId>
```

### 3. Dry run (DB-zero-write)

```bash
npx tsx scripts/isw-refresh.ts --theater ru --dry
```

Fetches every `pending` `ru` report's page (politely, ~2.1s/host — the Mac has no
`data/cache` yet for these URLs, so expect this to take **several minutes** for ~36
reports, not seconds) and reports `parseOk`/`endnoteCount`/`citations.length` per report
without writing anything. Read the output for any `fetch-failed(...)` lines — those are
candidates for `--retry-failed` in step 4, or a sign a URL slug has changed and needs
investigation before draining.

### 4. Drain

```bash
npx tsx scripts/isw-refresh.ts --theater ru
```

Processes `pending` reports oldest-first, `--limit` defaults to 500 (comfortably above
36, so one invocation should clear the backlog). If step 3 showed failed fetches:

```bash
npx tsx scripts/isw-refresh.ts --theater ru --retry-failed
```

Both are safe to re-run: unique keys absorb replays, and a parse failure never downgrades
an already-parsed report (this is the same idempotent, resumable-per-report design the
Iran recovery used, unchanged since).

### 5. Materialize

```bash
npx tsx scripts/registry-materialize.ts
```

Pure SQL, two phases (full recompute, idempotent): rebuilds `source_theater_stats`
(DELETE + rebuild in one transaction, so readers never see an empty window), then updates
`sources`' global aggregates. Reads `DATABASE_URL_UNPOOLED || DATABASE_URL` — **OPEN-TASKS
#80: the Mac's `.env.local` `DATABASE_URL_UNPOOLED` may be stale/unset**; if so the `||`
falls through to the pooled DSN automatically (no action needed). If you have a valid
unpooled URL and want to confirm it's being used, check the script's log output; it does
not print which DSN it chose, so this is inference-only, not a hard verification.

### 6. Verify

```bash
npx tsx scripts/sqlq.ts "SELECT parse_status, count(*)::int, max(report_date)::text FROM isw_reports WHERE theater='ru' GROUP BY 1"
npx tsx scripts/sqlq.ts "SELECT theater, count(*)::int n, round(avg(reliability_score)::numeric,3) avg_rel FROM source_theater_stats WHERE theater='ru' GROUP BY 1"
```

Expect: `pending` count near zero (or exactly the count of any documents still genuinely
unpublished/unreachable), `source_theater_stats` for `ru` showing a non-zero, populated
row. This is **registry data only** — it does not touch `validation_runs`, so the public
scoreboard's historical scores are unaffected; do not expect or look for a scoreboard
change from this run.

### 7. Record

Draft decision-log entry (paste into AGENTS.md's decision log, dated the day this
actually runs — fill in the blanks from your own output):

```
- **YYYY-MM-DD (OPEN-TASKS #79 — RU ROCA citation registry drain)** Ran the
  authorized backfill for the 36 historical `ru` ISW reports left `pending` since
  before the 2026-08-15 citation-refresh hook existed. Backup branch `itest-<ts>`
  (`<branchId>`) taken first, <kept/deleted> at <time>. Dry run: <N> reports,
  <N> fetch failures (<none / retried and cleared>). Drain:
  `npx tsx scripts/isw-refresh.ts --theater ru` (+ `--retry-failed` if needed) —
  `ru` `isw_reports` pending count <36> → <after-count>, newest cited report date
  <before> → <after>. `registry-materialize.ts` run: `source_theater_stats` for
  `ru` now <N> rows, avg reliability <X.XXX>. Cost: $0 (no LLM import in either
  script; network to understandingwar.org only, verified by reading the import
  lines before running). No migration, no env change, no code change — data only.
  This is registry data, not validation: the public scoreboard's historical scores
  are unaffected. Rollback: the backup branch above, retained until this entry is
  signed.
```

## What this runbook is not

It does not touch `MAP_USD_CAP_DAILY`, any LLM provider, `doc_claims`, digests, or
`validation_runs`. It does not require a Vercel deploy — `isw-refresh.ts` and
`registry-materialize.ts` are local scripts run directly against the database.
`docs/RELEASE-CHECKLIST.md` does not apply to this runbook (no code deploys); its step 11
(migrations separate from deploys, backup-branch-first) is the precedent this runbook
follows for the backup-branch discipline, not a literal migration — no schema change
occurs here.
