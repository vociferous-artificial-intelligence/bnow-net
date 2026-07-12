# TIME-MODEL.md — what every timestamp means

Installed by the 2026-07-12 analyst-trust sprint (prompt:
`docs/prompts/2026-07-12-analyst-trust.md`, ruling R1). Correct in place when the
model changes; the morning notes record when and why.

## The one-paragraph model

**Storage and pipeline buckets are UTC. Display is ET.** Every instant persists as
UTC (`timestamptz`); every day-bucket column (`digests.digest_date`,
`claims.claim_date`, `isw_reports.report_date`) is a **UTC calendar day** stamped by
the writing cron. Every user-facing wall-clock timestamp renders in
`America/New_York` with an explicit literal **"ET"** suffix — the IANA zone (never a
hardcoded offset) keeps DST correct without redeploys. Every user-facing *label*
says what its time IS ("Latest digest … final 10:02 PM ET", "Data current as of"),
and every day-boundary decision goes through the shared helpers with an explicit
timezone argument.

## The shared helpers (`src/lib/time/`)

| Helper | Use |
|---|---|
| `dayString(instant, tz)` / `etToday(now)` / `utcDay(instant)` (`day-boundary.ts`) | The ONLY sanctioned "what day is it" computation. Never `new Date()` day math inline, never SQL `current_date` for user-facing buckets. |
| `toInstant(value)` (`day-boundary.ts`) | Parses driver values (`Date` instance or string) safely; null on invalid. |
| `formatEtDateTime` / `formatEtTime` (`format-et.ts`) | The ET display formatters ("Jul 12, 10:45 AM ET" / "10:45 AM ET"). Null-safe: render an honest fallback, never "Invalid Date". |
| `digestStatus` / `digestStage` (`digest-status.ts`) | The cadence-aware digest card state machine (below). |
| `parseTimeWindow` (`src/lib/ask/window.ts`) | Free-text window parsing for /ask + /search; explicit-UTC calendar days, clock-injectable. Predates this model and already conforms. |
| `nextFire` (`src/lib/cron/next-fire.ts`) | Next cron fire in UTC from vercel.json schedules. |

Two rules for new code: (1) a component never computes a day from the wall clock —
the page computes it once via the helper and passes it down; (2) any SQL that
buckets by "today" takes the day as a **parameter** computed via the helper (see
`src/app/page.tsx`), because the DB session timezone is an unpinned Neon default
(UTC in practice, asserted nowhere).

## Why explicit timezones are load-bearing here

- **The dev box's wall clock is ET; Vercel's is UTC.** Implicit-local date math
  gives different answers in dev and prod. (This plus the driver trap below is how
  the 2026-07-12 home-card contradiction shipped unseen.)
- **The Neon HTTP driver returns uncast bigint as a STRING** (e.g. `row_number()`,
  `count(*)` without `::int`) and `timestamptz` as a `Date` instance. Cast `::int`
  in SQL, fold defensively with `Number()`, and keep test mocks driver-realistic
  (string `rn`, `Date` timestamps) — a kinder-than-reality mock masked the
  `"1" === 1` fold bug that rendered "not yet generated" next to a real claims
  count on prod.
- ET is UTC−4 (EDT) in summer, UTC−5 (EST) in winter: **the UTC day rolls at
  8 PM ET (summer) / 7 PM ET (winter)**. Any "today" that means the UTC day reads
  wrong on an ET-labeled page every evening.

## The digest cadence and its ET lifecycle

A digest date `D` is a UTC-day bucket written by (vercel.json, `mode` param):

| UTC | ET (summer) | Run | Writes |
|---|---|---|---|
| 04:00 D | 12:00 AM D | intraday `kyiv-morning` | creates bucket D, rolling-24h window |
| 10:00 D | 6:00 AM D | intraday `eu-midday` | regenerates bucket D |
| 19:30 D | 3:30 PM D | intraday `us-afternoon` | regenerates bucket D |
| 02:00 D+1 | **10:00 PM D** | `finalize` | full-day pass — the canonical digest for D |
| 07:00 D+1 | 3:00 AM D+1 | validate | scores D's finalized digest vs ISW report dated D |

So in ET terms each date's story is: first cut just after midnight, refreshed
morning and mid-afternoon, **final at ~10 PM the same evening**. Two documented
wrinkles: events 8 PM–midnight ET land in the *next* day's bucket (UTC rollover),
and `digests.created_at` is **last-writer-wins** — it means "this bucket was last
regenerated at", not "first created at". A refused thin/empty regeneration
(digest-persist guard) leaves the prior generation and its timestamp in place.

`digestStage()` derives the stage from exactly that: a bucket last written on a
later UTC day than itself has been finalized; otherwise it's an intraday cut.

## The home theater card (signed-in), row by row

| Row | Source | Meaning |
|---|---|---|
| Data current as of | `max(raw_documents.fetched_at)` per theater | when we last ingested ANY document — ET |
| Documents, last 24h | rolling 24h count of `fetched_at` | rolling window, not a calendar day |
| Latest digest | latest `digest_date` + that bucket's `max(created_at)` | "{bucket} · {stage} {time ET}"; plus "no digest yet today" when the bucket predates the ET day |
| Digest claims, {date} | `count(claims) where claim_date = {displayed bucket}` | **keyed to the displayed bucket, never an ambient "today"** — this is what makes the old contradiction structurally impossible (pinned by tests) |
| Next update | `nextFire` over the intraday/finalize schedules | "~3:30 PM ET · final ~10:00 PM ET", or the next day's first run once final |
| X-paused footnote | freshest `x_api` fetch older than 3h (rolling) | operational transparency (R9) — semantics deliberately untouched |

The validation tiles' "Corroborated share, {date}" is computed for the ET-day
bucket passed explicitly by the page (`etToday(now)`), and "Last validated" is
`validation_runs.run_at` max in ET.

## Known implicit-UTC sites (documented, deliberately not "fixed")

- `/signals` — `CURRENT_DATE - 30 days` window in SQL (session-tz, i.e. UTC): a
  ≤1-day shift on a 30-day window; immaterial to the signal, left as is.
- `/datadark` — `last_checked_at::text` sliced to its UTC day for display.
- `/health` — raw `toISOString()` diagnostic, deliberately unlocalized.
- `raw_documents.published_at` fallback `fetched_at` in info-lead scoring: source
  publish claims vs our ingest instant — see the W4 methodology note
  (`docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md` §④).

## Validation / scoreboard timestamps

The scoreboard's per-day rows key on `digest_date` (UTC bucket). ISW's report for
the same calendar date is written to a mid-afternoon-ET data cutoff and published
late evening ET (`isw_reports.derived.publishedAt`); the two windows overlap ~19 of
24 hours. Coverage is therefore "our finalized UTC-day digest vs their same-dated
report" — the honest labeling and the at-publish dual metric live in the W4 work
(same morning note, §④).
