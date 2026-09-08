# Stage 2 item 3 — C5-m probes, fork route (2026-09-07)

| | |
|---|---|
| Who | Operator, or an **attended** session on the **Mac** in `/Users/go/code/bnow-net` on `main`. Not a remote/Cowork session: `node_modules` is macOS-only and every `npx tsx` here fails in a mounted Linux shell with an esbuild platform error. |
| Authority | **(f8)** — C5-m, the read-only multi-edition probe. Fork substitution rests on **(f5)/O3**, which accepted fork-based proofs for exactly this blocker shape. |
| Window | ~15 min, of which ≈9 min is politeFetch spacing you wait through |
| Spend | **$0.** Neither `isw-refresh.ts` nor anything it imports pulls an LLM module; egress is understandingwar.org only, via disk-cached `politeFetch` at ~2.1 s/host. |
| Production writes | **NONE.** A Neon branch is created and deleted; no production row or column is touched. |
| Depends on | Nothing in Stage 2. Independent of items 1, 2, 4, 5. |
| **Gate** | **§0 first.** August 2026 is proven to contain zero multi-edition days; running §3 on it again returns the same empty denominator. §0 picks the window from production data, or concludes there is none. |
| Window under test | `<FROM>` → `<TO>`, set by §0.3. Every command below uses those bounds — the August dates are left in place only as worked examples. |
| Blocks | **Step 24** (`2026-09-05-48h-24-ws3-5-scoreboard-and-soak-prep.md`), whose prompt carries these outputs verbatim as its measurement input. |
| Record | Both probe outputs kept in full · an OPEN-TASKS line for the unapplied migration · the fork deleted and said so · closing report |

---

## 0. Pick the window before probing — August 2026 cannot answer C5-m

**Do this section first. It is read-only, costs $0, and it decides whether the rest of the file
is worth running.**

### 0.1 What the 2026-09-07 19:xx run actually showed

The August window was probed and the raw evidence is still on disk in `data/cache/pages/`
(`politeFetch` writes a file only for a 200 with a body, so a missing file means "not 200").
Reconstructing the four Iran candidate URLs per day and checking the cache gives this, exactly:

| dates | shape that hit | size |
|---|---|---|
| 2026-08-01 → 08-14, 08-17, 08-18 | `iran-update-special-report-<date>` | ~390–441 KB |
| 2026-08-19 → 08-21, 08-24 → 08-28, 08-31 | `iran-update-<date>` | ~407–426 KB |
| **2026-08-15, 16, 22, 23, 29, 30** | **none of the four** | — |

Three facts follow, and none of them is "ISW stopped publishing":

1. **Exactly one shape hit on every day that hit — never two.** So August 2026 contains **zero
   multi-edition days**, and `multiEditionDays = 0` / `anchorNotFinalDays = 0` are an empty
   denominator, not a measurement. C5-m cannot be answered from this window at any effort.
2. **ISW changed slug mid-month** — `…-special-report-<date>` through 08-18, bare
   `iran-update-<date>` from 08-19. Both are in the candidate list, so discovery handled the
   switch correctly. Nothing to fix.
3. **The six no-edition dates are the three consecutive weekends** 15/16, 22/23, 29/30 (08-01
   and 08-02 are also a weekend and *did* publish, under the special-report shape — consistent
   with a special-coverage period that ended mid-month).

### 0.2 The one thing to confirm by eye before trusting (3)

Open `understandingwar.org` and look for an Iran Update dated **2026-08-15**. Then:

- **No Iran Update that day** → the six are genuine non-publication days. `probeFailedDays = 6`
  is correct and nothing is broken.
- **There IS one** → its URL uses a fifth slug shape that
  `iranUpdateUrlCandidatesForDate()` (`src/lib/validation/run.ts:31`) does not generate. That is
  a **discovery gap**: it silently converts published days into `probe_failed`, and
  `probe_failed` is the input to C15/(f14)'s gap confirmation, so it manufactures phantom
  publication gaps. File it for step 18's register with the real URL, and add the shape in
  step 23. **Do not proceed with the measurement until this is settled** — a corpus that
  mislabels published days cannot support a finality finding.

### 0.3 Choosing a window that can answer C5-m

Multi-edition days exist only where ISW published split editions — the
`iran-update-morning-special-report-…` / `…-evening-special-report-…` shapes. Find where those
occur, from production, read-only, on the Mac:

```bash
npx tsx scripts/sqlq.ts "SELECT substring(url from 'iran-update[a-z-]*') AS shape, count(*)::int AS n, min(report_date)::text AS lo, max(report_date)::text AS hi FROM isw_reports WHERE theater='ir' GROUP BY 1 ORDER BY lo"
npx tsx scripts/sqlq.ts "SELECT report_date::text AS d, url FROM isw_reports WHERE theater='ir' AND (url ILIKE '%morning%' OR url ILIKE '%evening%') ORDER BY report_date"
```

**Read the second result carefully — it undercounts by design.** `isw_reports` carries
`uniqueIndex(theater, report_date)` (`src/db/schema.ts:151`), i.e. **one row per theater per
day**: it structurally cannot hold two editions for one date. That collapse is the entire reason
`benchmark_report_editions` was built. So a `morning`/`evening` slug in that table does not mean
"one edition that day" — it means "on that day ISW was publishing split editions, and this table
kept whichever one it saw." Those dates are precisely the multi-edition candidates.

- **Rows come back** → probe the month(s) they cluster in (expected: the June 2025 Israel–Iran
  period). Substitute those `--from`/`--to` bounds everywhere below.
- **No rows at all** → the corpus contains no split-edition day, so C5-m has no denominator
  anywhere in it. That is a legitimate finding and **the correct output is that sentence**, not
  a re-run: record it, hand it to step 24, and stop. Do not widen the window speculatively —
  every extra month is ~4 min of politeFetch spacing for a question already answered.

### 0.4 ROCA is a null instrument for this figure — expect nothing from it

`referenceFor("ru")` returns `urlCandidatesForDate: (d) => [iswUrlForDate(d)]` — **one**
candidate URL. ROCA therefore cannot produce a second edition for a day under any circumstance,
so `multiEditionDays = 0` on `roca` is a property of the code, not an observation about ISW.
Keep running `roca` — it is a valid instrument for `publicationGapDays` and `probeFailedDays` —
but never report its `multiEditionDays` or `anchorNotFinalDays` as evidence.

### 0.5 Acceptance criterion for the re-run: `probeFailures` must collapse

The 2026-09-07 run reported **probes 124 / probeFailures 79** on Iran against **31 / 1** on
ROCA. That asymmetry is a fetch-layer artifact, not a finding, and the arithmetic says so:
`probeFailures = (probes whose status ≠ 404) − editions` (`edition-discovery.ts:359`, with
`isCleanNotFound` being `status === 404` at :226). `politeFetch` returns `null` after exhausting
retries on 429/5xx or a timeout, and a null probe records `status: null`, which is **not 404**,
so it counts as a failure. With 25 editions and 79 failures, 104 of 124 probes were non-404:
only ~20 misses came back as clean 404s. Two sessions were competing for the host at the time,
and `HOST_SPACING_MS` is a **per-process** map — two processes halve the spacing.

So: **a clean single-session run should return `probeFailures` at or near 0** (every miss a real
404), with `probeFailedDays` still 6 for August. If a single-session run still reports dozens of
failures, that is a genuine defect — either ISW is throttling `BNOWBot/0.1`, or it serves
something other than 404 for absent slugs — and it must be filed rather than averaged away,
because inflated `probe_failed` days feed C15/(f14) directly.

Note the 25 hit pages are already cached, so a re-run re-fetches only the ~99 misses.

---

## 1. Why this file exists

The straightforward (f8) command — the probe against production — was run 2026-09-07 17:33 EDT
and failed on both series, identically:

```
NeonDbError: relation "benchmark_report_editions" does not exist   (code 42P01)
    at SqlReferenceReportRepository.editionsForDay   (reference-repo-sql.ts:459)
    at SqlReferenceReportRepository.dayStatus        (reference-repo-sql.ts:487)
    at DryRunReferenceReportRepository.upsertEdition (reference-repo.ts:326)
    at discoverEditions                              (edition-discovery.ts:325)
```

`benchmark_report_editions` and `benchmark_series_days` are created by
`drizzle/0028_lumpy_dragon_lord.sql`. It is on `main` and **not applied to production** —
correct per RELEASE-CHECKLIST §11 (migrations are separate from deploys) with step 27 not yet
run. Read the stack carefully: `--dry` refuses **writes**, it does not stub **reads**, so
`upsertEdition` still called `dayStatus` → `editionsForDay` and SELECTed a table that is not
there. The zero-write guarantee held; the read had nowhere to land.

**Two ways out, and only one of them is authorized.**

| | route | verdict |
|---|---|---|
| A | apply 0028+ to production, then probe it | **NO.** A schema write. (f8) authorized a *read-only* probe; no signed entry authorizes production DDL ahead of step 27. Would need its own decision plus RELEASE-CHECKLIST §11's backup-branch-first pass. |
| B | probe a **migrated fork** of production | **YES — do this.** Zero production impact, inside (f8)'s intent, and (f5)/O3 is the precedent. |

**The fork does not change the answer.** Discovery is web-driven: `discoverEditions` fetches
each candidate URL and derives editions from the HTML. The only production-dependent read is
`anchorReportIdFor()` against `isw_reports`, and a fork taken now is a copy-on-write image of
production **including the §2 RU drain**, so that read is identical. `benchmark_report_editions`
is empty on a fresh fork and absent on production — both give `dayStatus = unknown`.

---

## 2. Preflight

```bash
cd /Users/go/code/bnow-net
git status --porcelain                 # empty (or package-lock.json — COMMON §1 restore)
git log --oneline -1                   # on main
ls drizzle/0028_lumpy_dragon_lord.sql  # the migration this needs
npx tsx scripts/sqlq.ts "SELECT name FROM _migrations ORDER BY name DESC LIMIT 8"
```

That last query is read-only and worth keeping: it is the evidence for §6's OPEN-TASKS line —
exactly which migrations production has, and therefore which ones step 27 must apply.

`grep -c '^NEON_API_KEY=' .env.local` must print `1`. Without it there is no fork and this stops.

---

## 3. The run

```bash
# 1. Fork production
npx tsx scripts/neon-branch.ts create
#    -> {"branchId":"br-...","connectionString":"postgresql://..."}
#    Record the branchId. Do NOT paste the connection string into any file, report,
#    log entry or chat — it carries the neondb_owner password, which a Neon branch
#    inherits from its parent.
export C5M_FORK='<connectionString>'
export C5M_BRANCH='<branchId>'

# 2. Bring the fork's schema up to main. SET BOTH DSN VARIABLES. Never `env -u` either of
#    them — see the WARNING below; an earlier revision of this file did, and it aimed
#    migrate.ts at PRODUCTION.
#    Print the target first and read it before you run the migration:
DATABASE_URL_UNPOOLED="$C5M_FORK" DATABASE_URL="$C5M_FORK" node -e '
  require("dotenv").config({path:".env.local"});
  const u = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  console.log("migrate.ts will target:", new URL(u).host);'
#    ^ must print the FORK host. If it prints an ep-…neon.tech host you recognise as
#      production, STOP — §8.
DATABASE_URL_UNPOOLED="$C5M_FORK" DATABASE_URL="$C5M_FORK" npx tsx scripts/migrate.ts

# 3. Confirm the table now exists on the fork, and that production is untouched
DATABASE_URL="$C5M_FORK" npx tsx scripts/sqlq.ts "SELECT count(*)::int FROM benchmark_report_editions"   # expect 0
npx tsx scripts/sqlq.ts "SELECT to_regclass('benchmark_report_editions')::text"                          # expect null

# 4. The probes. isw-refresh.ts reads DATABASE_URL only (deliberately, per its own comment),
#    and scripts/env.ts calls dotenv.config() WITHOUT override, so this prefix beats .env.local.
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee ~/c5m-iran-update-20260907.txt
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series roca        --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee ~/c5m-roca-20260907.txt

# 5. Delete the fork
npx tsx scripts/neon-branch.ts delete "$C5M_BRANCH"
unset C5M_FORK C5M_BRANCH
```

**Never run `--series` without `--dry`** against anything you have not deliberately chosen to
write — see §4, which is the one case where a non-dry fork run is on the table.

> **WARNING — `env -u` on a DSN variable aims the command at PRODUCTION.** `scripts/env.ts`
> calls `dotenv.config()` **without** `override`, and dotenv fills any key that is *absent* from
> `process.env`. So `env -u DATABASE_URL_UNPOOLED` does not remove the variable — it hands
> dotenv an empty slot, which `.env.local` immediately refills with **production's unpooled
> endpoint**, and `migrate.ts`'s `??` then prefers it over the fork DSN you passed. Verified
> 2026-09-07: that form resolves to production's `ep-…` host. It was live in this file's first
> revision; only OPEN-TASKS #80's stale credential (a `28P01`) prevented 0028/0029/0030 landing
> on production unreviewed. Filed as **OPEN-TASKS #112**.
>
> The three forms, all verified against this repo's dotenv:
>
> | form | key present after dotenv? | `migrate.ts` (`??`) | `registry-materialize.ts` (`\|\|`) |
> |---|---|---|---|
> | `env -u VAR` | **no → refilled from `.env.local`** | **production** ☠ | **production** ☠ |
> | `VAR=` (empty) | yes, empty | throws "not set" (safe) | falls through to `DATABASE_URL` ✓ |
> | `VAR="$FORK"` | yes, fork | fork ✓ | fork ✓ |
>
> **Standing rule: set both DSN variables explicitly to the DSN you mean. Never unset either.**
>
> Full derivation, with the dotenv call sites and the production-host proof:
> `docs/reviews/C5M-PROBES-2026-09-07.md` §7.

Each run prints one line per day and ends with `series discovery summary: {…}`. A run that ends
without that summary line **failed**: keep the error, do not hand a partial to step 24.

Expected shape of a day line:

```
2026-08-14  DRY published editions=2 [morning:inserted:pending:u31 evening:inserted:pending:u44] anchor=final probes=4 probeFailures=0
```

The summary JSON carries the numbers C5-m actually asks for: `multiEditionDays`,
`anchorNotFinalDays`, `unanchoredDays`, `publishedDays`, `probeFailedDays`,
`publicationGapDays`, `probes`, `probeFailures`.

---

## 4. What the dry run actually measures — read this before reporting a number

The measurement is **not** moot on a fork. It is computed and printed **during** the run; what
you keep is stdout and the summary JSON, not rows. The fork exists only so the read-back path
has a table to read. Writes dying with the fork costs nothing.

What *is* broken is narrower and worth stating exactly.

### 4.1 The defect: in dry mode the finality comparator never runs

```ts
const stored = await repo.editionsForDay(plan.series, day);
const finalKey =
  stored.length > 0 ? selectDailyFinal(stored).selected.identity.editionKey
                    : out.editions[0].editionKey;
```

`out.editions[0]` is a sane **fallback** — for a day with nothing stored, the first successfully
probed edition is the only defensible guess. The problem is that in dry mode it is not a
fallback, it is **the only path**: `DryRunReferenceReportRepository` buffers nothing and writes
nothing, so `stored` is `[]` on every day of every dry run, forever. The edge case becomes the
whole measurement.

And the value it substitutes is **probe order** — the exact variable C5-m exists to test. So the
dry run asks "does the citation anchor agree with the daily-final winner?" and computes "does
the citation anchor sit on the first-probed edition?" That is circular: `anchorNotFinalDays`
from a dry run cannot be evidence about probe order, because probe order is its definition of
final.

**Correcting something I said earlier:** this is not cleanly "biased toward zero". It miscounts
in both directions —

- anchor on A, probe-first A, finality winner B → dry says *agrees*, truth is *disagrees* (undercount)
- anchor on A, probe-first B, finality winner A → dry says *disagrees*, truth is *agrees* (overcount)

The reason to expect a **net undercount** is a correlation, not a rule: the anchor is matched by
canonical URL against `isw_reports` rows that production recorded using its own probe order, so
anchor and probe-first tend to coincide — which concentrates the error precisely in the case
under test. Report that as reasoning, not as a measured property.

### 4.2 There is no one-line fix, and the fix is not this step's job

`DiscoveredEdition` (`edition-discovery.ts:103`) carries `editionKey`, `label`, `canonicalUrl`,
`action`, `parseStatus`, `units`, `anchoredReportId` — and **no `identity`**, so it has no
`cutoffAt`, `publishedAt` or treatments. `selectDailyFinal()` needs exactly those. The loop
*builds* the full `ReferenceEditionRecord` to hand to `upsertEdition` and then discards it.

The contained fix: keep those canonical records alongside `editions`, expose them on
`EditionDiscoveryResult`, and compare against `selectDailyFinal(stored.length > 0 ? stored :
records)`. Then dry and live measure the same predicate, which is what the module's own comment
already claims ("in dry mode the anchor a live run WOULD have set is the one this run computed,
so the measurement is identical either way" — true of the **anchor** side, false of the
**final** side).

**Do not make that change in this step.** It is a WS-3 finding against step 14's module: file it
for **step 18**'s audit register and **step 23**'s remediation. This step measures and reports.

### 4.3 So take the fork-write pass, and take it twice

Running the window **without `--dry` against the fork** populates
`benchmark_report_editions`, so `selectDailyFinal(stored)` does real finality ordering and
`anchorNotFinalDays` means what C5-m says it means. Every write lands in the disposable fork and
dies with it; production is never addressed.

A **second consequence of an empty store** makes a second pass necessary for a different figure.
`confirmGapEligible()` returns false unless the day's prior status is already `probe_failed`
(`edition-discovery.ts:243`). On a fresh store every day's prior status is `unknown`, so the
first pass over a window can only ever record `probe_failed` — **`publicationGapDays` is
structurally 0 on any first pass, dry or not.** It is an artifact of the empty table, not a
finding about ISW. Only a second pass over the same window on the same fork can confirm a gap.

So the run is:

```bash
# pass 0 — the literal (f8) command, kept as-is for the record
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee ~/c5m-iran-update-dry-20260907.txt
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series roca        --from 2026-08-01 --to 2026-08-31 --dry 2>&1 | tee ~/c5m-roca-dry-20260907.txt

# pass 1 — populates the fork; this is where anchorNotFinalDays becomes meaningful
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 2>&1 | tee ~/c5m-iran-update-pass1-20260907.txt
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series roca        --from 2026-08-01 --to 2026-08-31 2>&1 | tee ~/c5m-roca-pass1-20260907.txt

# pass 2 — same window again; the only pass that can confirm a publication_gap
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series iran_update --from 2026-08-01 --to 2026-08-31 2>&1 | tee ~/c5m-iran-update-pass2-20260907.txt
DATABASE_URL="$C5M_FORK" npx tsx scripts/isw-refresh.ts --series roca        --from 2026-08-01 --to 2026-08-31 2>&1 | tee ~/c5m-roca-pass2-20260907.txt
```

Passes 1 and 2 cost no extra network: `politeFetch` disk-caches every page, so only pass 0 pays
the ~4.5 min/series spacing.

**Which number is the C5-m answer:** `anchorNotFinalDays` and `multiEditionDays` from **pass 1**.
`publicationGapDays` from **pass 2**, carrying (f14)'s trigger — a gap confirmed by pass 2 was
confirmed by a `probe_failed` from *the same backfill session*, which is exactly C15's named
reopening case. Pass 0 is kept as the literal-(f8) record and as the demonstration that the dry
path degrades.

**Authorization note.** (f8) says "read-only probe of production". Passes 1 and 2 are read-only
**with respect to production** — they address a disposable fork by explicit DSN and never
production. That is the (f5)/O3 shape. It is still a departure from (f8)'s literal wording, so
it gets one decision-log line (§6 item 2), and an operator confirmation before a delegated
session takes it.

---

## 5. What to keep, and what step 24 must be told

Keep **both outputs in full, verbatim, including the summary JSON** — not a summary of a
summary. They are pasted into step 24's prompt as its measurement input. `~/` rather than `/tmp`
so they survive a reboot if step 24 does not launch today.

Step 24's prompt must additionally carry, in these words or clearer:

> These C5-m numbers were measured on a **migrated Neon fork of production**, not on production
> itself: migration 0028 (`benchmark_report_editions`, `benchmark_series_days`) is on `main` but
> unapplied to production, so the probe returned `42P01` there. Discovery is web-driven and the
> fork's `isw_reports` is a copy-on-write image of production taken after the 2026-09-07 RU
> drain, so the reading is equivalent — but it is a fork reading, and any report must say so.
>
> **Use pass 1 for `multiEditionDays` and `anchorNotFinalDays`; use pass 2 for
> `publicationGapDays`.** The `--dry` pass (pass 0) is included for the record only: with an
> empty editions table its "final" side falls back to first-probe order, so its
> `anchorNotFinalDays` measures "anchor sits on the first-probed edition", not "anchor sits on
> the daily-final edition". Do not quote pass 0's `anchorNotFinalDays` as a C5-m result.
> `publicationGapDays` is structurally 0 on any first pass over an empty store, so pass 0's and
> pass 1's zeros there are artifacts, not findings.
>
> Any `publication_gap` that pass 2 confirms was confirmed by a `probe_failed` recorded in the
> **same backfill session** — that is precisely **C15's reopening trigger ((f14))**, so it
> reopens `first_observed_at` rather than standing as a settled gap.
>
> A WS-3 finding is open against step 14's module (`edition-discovery.ts`): `DiscoveredEdition`
> does not carry `identity`, so the dry path cannot run `selectDailyFinal` and silently
> substitutes probe order. Filed for step 18's register and step 23's remediation — step 24 does
> not fix it, but must not report around it.

## 6. Records to write

1. **`docs/OPEN-TASKS.md`** — a new line, from §2's `_migrations` query:

   > Migration **0028** (`benchmark_report_editions`, `benchmark_series_days`) — and any later
   > pending migration the `_migrations` query names — are on `main` but **not applied to
   > production**. The C5-m probes returned `42P01` against production on 2026-09-07 and were
   > run against a migrated fork instead. Step 27's deploy must apply them, backup-branch-first
   > per RELEASE-CHECKLIST §11.

   This removes a surprise from step 27; it is not new work, since step 27 already owns the
   migration pass.

2. **No decision-log entry is owed for the probes themselves** — (f8) is the authorization and
   step 24 carries the outputs. If you take §4's fork-write variant, that *is* worth one line in
   the log, because it is a deliberate departure from (f8)'s literal wording: say what was run,
   that it addressed a disposable fork, and that production was never addressed.

3. **A WS-3 audit finding**, filed where step 18 will read it (its register, or
   `docs/BLOCKERS.md` if step 18 has already run): `runSeriesDiscovery`'s C5 comparison falls
   back to `out.editions[0]` — probe order — whenever `editionsForDay` returns empty, which in
   `--dry` is always, because `DiscoveredEdition` carries no `identity` and so cannot be fed to
   `selectDailyFinal`. The dry path therefore measures a different predicate than the live path
   while the module's comment claims they are identical. Fix belongs to **step 23**: retain the
   canonical `ReferenceEditionRecord`s the loop already builds, expose them on
   `EditionDiscoveryResult`, and select finality from `stored.length > 0 ? stored : records`.
   Severity: it silently invalidates the only figure C5-m exists to produce, but no production
   behavior depends on it (nothing calls `--series` on a schedule).

4. **Say the fork was deleted**, with its branchId, in the closing report. Never the connection
   string.

---

## 7. Closing report (COMMON §5)

`docs/reviews/C5M-PROBES-2026-09-07.md`. Scope line says **attended** and names the fork
branchId. Then:

- the exact commands run, in order, including the migrate line and the host it printed
- the `_migrations` reading for production
- both summary JSON blocks verbatim, plus the count of day lines per series
- `multiEditionDays` and `anchorNotFinalDays` **from pass 1**, `publicationGapDays` **from
  pass 2**, per series — no interpretation beyond the numbers
- pass 0's figures alongside, labelled as the degraded dry reading, so the difference between
  the two is on the record rather than argued from memory
- whether passes 1 and 2 were run at all, and the operator confirmation that authorized them
- fork deleted, with branchId and time
- the OPEN-TASKS line as written

---

## 8. Halt conditions — stop and report, do not improvise

- **Any error mentioning production's host, or any prompt to write production.** Nothing here
  writes production. `to_regclass` returning non-null on production means someone applied 0028
  in the meantime — stop and say so; the world changed under this file.
- **`migrate.ts` fails on the fork.** Report the output. Do not hand-write DDL.
- **A run ends without `series discovery summary:`.** It failed. Do not paste a partial.
- **`probeFailures` high enough to look like rate-limiting or a slug change** (a run where most
  days show `probes=4 probeFailures=4`). That is a fetch problem, not a measurement — report it
  and let step 24 decide, but note it makes the anchor figures meaningless.
- **Anything tempting you to apply a migration to production.** That is route A, it is not
  authorized, and doing it to unblock a measurement is exactly the failure this file exists to
  prevent.
- **The pre-migrate host check prints anything but the fork host.** Stop. Do not "fix" it by
  unsetting a variable — that is the failure mode itself. Re-check that both DSN variables are
  set to `$C5M_FORK` on the same command line.
- **§0 was skipped.** Probing before the window is chosen is the failure this run already made
  once. If `--from`/`--to` are still 2026-08-01/2026-08-31, stop and do §0.
- **A single-session run still reports dozens of `probeFailures`.** Do not proceed to passes 1
  and 2 on a corpus whose miss classification is broken — file it (§0.5) and stop.
- **A second session is running this same step.** Check before starting: `lsof -a -d cwd -c
  claude | grep bnow-net`, and look for a recent `docs/reviews/C5M-PROBES-*.md` or stray
  `~/c5m-*.txt`. Two sessions on this step corrupt the measurement — they defeat `politeFetch`'s
  per-process host spacing, so clean 404s start returning as probe failures and the probe
  counts become fiction. Halt per COMMON §11; do not compete.
- **Never leave the fork alive** on a halt. Delete it, then report.

---

## 9. Paste block for a session

> Read `docs/prompts/2026-09-05-48h-COMMON.md`, then
> `docs/prompts/2026-09-07-48h-stage2-item3-c5m-probes.md`, and execute it end to end on this
> Mac. You are running Stage 2 item 3 under **(f8)**, with the fork substitution resting on
> **(f5)/O3**. Zero spend and **zero production writes** — you create a Neon fork, migrate it,
> probe it `--dry`, and delete it. Do **not** apply any migration to production for any reason.
> Keep both probe outputs in full including the summary JSON; attach §4's finality caveat to
> `anchorNotFinalDays` rather than reporting that figure bare. Decide §4's optional fork-write
> variant by asking the operator first — do not take it unilaterally. Close with
> `docs/reviews/C5M-PROBES-2026-09-07.md` per §7, the OPEN-TASKS line per §6, and the fork
> deleted. Launch nothing.
