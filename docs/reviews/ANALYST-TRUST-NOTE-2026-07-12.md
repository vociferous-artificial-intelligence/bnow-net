# Analyst trust sprint — morning note (2026-07-12)

Prompt: `docs/prompts/2026-07-12-analyst-trust.md`. Branch `20260712-analyst-trust`,
tag `pre-analyst-trust-20260712`. Rollback deployment recorded pre-sprint:
**bnow-jihmibgm6**. Baseline gate 996 tests / 79 files green.

## ① Outcome

(filled in at the end of the sprint)

## ② W0 readback — the contradiction, explained plainly

**The card was lying because of a one-character-class bug, not a timezone bug.** The
home page's digest-status query ranks each theater's digest dates with
`row_number() OVER (…) AS rn` and then folds rows with `if (row.rn === 1)`. Postgres
returns `row_number()` as `bigint`, and the Neon driver returns `bigint` as a **JS
string** (`"1"`), not a number — every other count in that file is cast `::int`, but
`rn` was not. `"1" === 1` is false, so the fold never records any digest date, the
card's `latestDate` stays null, and the "Digest generated" line falls back to its
"not yet generated" string for **every theater, at every hour, since the feature
shipped**. Reproduced live: running the page's exact SQL through the same driver
returns `"rn": "1"` (string) with digests present for all three theaters
(created 04:0x and 10:0x UTC on 07-12, all crons green). The quick-links rail is fed
by the same fold, so its per-theater digest links were silently absent too. The unit
tests passed because they mock the driver with `rn: 1` as a JS number — the mock was
kinder than the driver.

The other two lines on the card were both **correct**, which is what made the whole
card incoherent:

- "Digest claims, today: 14" — counts claims where `claim_date = current_date` (UTC
  day). At 10:45 AM ET on 07-12, ru had 8 elite-politics + 6 military claims for
  07-12 = exactly the 14 on the screenshot.
- "Data current as of 10:45 AM ET" — max `fetched_at`, correct (ingest runs every
  15 min).
- "Next update ~Jul 12, 03:30 PM ET" — also correct: the 19:30 UTC `us-afternoon`
  intraday cron. The cron math (`nextFire`) is UTC-explicit and tested.

**Disposition of the seven findings:**

1. **CONFIRMED — genuine bug** (driver `bigint`→string vs `===`), plus a secondary
   real timezone incoherence: "claims, today" buckets on the **UTC** day while every
   timestamp on the card reads ET. Every evening 8 PM–midnight ET the UTC day rolls
   over and the count silently becomes "claims of a bucket that has no digest yet"
   (reads 0). Fix in W1: the count is keyed to the digest date the card displays,
   never to an ambient "today".
2. **AMENDED — times were factually right; the labels were the defect.** "Next
   update" didn't say what kind of update; "Digest generated" reads as a creation
   time but `digests.created_at` is last-writer-wins (finalize and intraday both
   overwrite it), so even rendered correctly it means "last regenerated at". W1
   relabels every timestamp to say what it IS, per R1.
3. **CONFIRMED** — signed-in home renders the full hero + three CTA buttons above
   the panels (`src/app/page.tsx:291–323`). W2 implements R3.
4. **AMENDED (slightly)** — the scoreboard has one terse line ("'ISW only' entries
   are our misses. Targets: …"), not zero — but no statement of what's measured, why
   we publish it, or how to read a metric. W3 proceeds per R4.
5. **CONFIRMED and sharpened — see the W4 audit below.** Good news: matching the
   digest for date D to the ISW report *dated* D is already the maximum-overlap
   pairing. The real gaps are (a) the ~5h window offset at both edges (their
   ET-afternoon cutoff vs our UTC-midnight bucket) is invisible and unlabeled, and
   (b) at-cutoff vs final is structurally unknowable retroactively — digest rows are
   overwritten in place, claims deleted + reinserted, no snapshots. But a $0
   deterministic dual metric IS derivable (below).
6. **AMENDED** — the registry is not exposed to signed-out visitors (layout-gated
   `requireUser` → 307 to /signin since commit `7e1f2c5`); it IS exposed to every
   signed-in user at any role. R5 still applies in full: admin-only, 404 (replacing
   the 307 — don't advertise), links removed everywhere.
7. **CONFIRMED as a defect** — magic-link completion lands on `/account`
   (`src/app/signin/page.tsx:12` sets `redirectTo: "/account"`; line 22 sends
   already-signed-in visitors there too). W2 fixes both to `/`.

**The actual cadence, in ET (from vercel.json + live cron_runs):** a digest date is
a **UTC-day bucket**, and its lifecycle in ET is: first intraday write 12:00 AM ET
(04:00 UTC), regenerated 6:00 AM ET (10:00 UTC) and 3:30 PM ET (19:30 UTC) on a
rolling 24h window, then **finalized 10:00 PM ET the same ET evening** (02:00 UTC
D+1, full-day window). Validation scores the finalized digest at 3:00 AM ET (07:00
UTC). So the ET-day story is clean — "updates through the day, final at 10 PM ET" —
and the card at 10:45 AM ET should have read roughly: *Intraday update 6:05 AM ET ·
14 claims so far · next update ~3:30 PM ET · final ~10:00 PM ET*. One documented
wrinkle: events 8 PM–midnight ET land in the next day's bucket (UTC rollover), and
between 8 PM and the 10 PM finalize the newest UTC bucket doesn't exist yet.

**Timestamp inventory headlines** (full inventory feeding W1; details in
`docs/TIME-MODEL.md` once written): three byte-duplicated hand-rolled `formatEt`
helpers (theater-status-panel ×2, home-validation-tiles, plus a page-local variant
on countries); two raw-SQL `current_date` day-buckets on the home page relying on
the DB session timezone (never explicitly set — Neon defaults UTC); `/signals`'
30-day window uses `CURRENT_DATE` the same way; `datadark` truncates a timestamptz
to a UTC day via string-slice; ~15 inline `.slice(0,10)` date truncations; the one
good day-boundary lib (`src/lib/ask/window.ts`, explicit-UTC, clock-injectable) is
used only by /ask and /search. Dev-box wall clock is **ET** while Vercel is **UTC**,
so implicit-local date math diverges between dev and prod — one more reason R1's
helper takes an explicit timezone.

## ③ TIME-MODEL summary — buggy vs mislabeled

(filled in by W1; buggy = the `rn` fold bug + UTC "today" buckets on an ET page;
mislabeled = "Digest generated", unlabeled "Next update", unlabeled corroborated
"today")

## ④ W4 — audit verdict (R6(a), verbatim per the register)

**How a digest day is matched to an ISW report today:** the validate cron (07:00
UTC) computes `date = now − 24h` sliced to the UTC day — yesterday's UTC date D. It
loads the single digests row `(country, D, track='military')` (unique index; the row
is whatever content last won the overwrite race — normally the 02:00 UTC finalize)
and the ISW report with `report_date = D` for the country's theater (ru/ua → ROCA,
ir → Iran Update), auto-discovering by slug if absent. One `validation_runs` row can
exist per (digest, report) — re-running **overwrites** (`ON CONFLICT … DO UPDATE`);
there is no history.

**What each window covers:** our digest for D covers the UTC calendar day D (final
window; intraday writes used a rolling 24h). ISW's report dated D is written to
their data cutoff mid-afternoon ET on D and published late evening ET (observed
`derived.publishedAt`, all recent reports present: ROCA 07-09 → 00:29Z D+1, 07-10 →
01:33Z D+1, 07-11 → 00:18Z D+1; Iran Update publishes earlier, 20:10–23:00Z same
day). So ISW's effective window is ≈ 19:00 UTC D−1 → 19:00 UTC D against our
00:00 → 24:00 UTC D: **~19h of 24h overlap; the two ~5h edge bands are scored as
if they were misses/leads on the wrong day.** Same-date pairing is nevertheless the
max-overlap choice — re-pairing would make alignment worse, so **no historical
number needs re-scoring for alignment**.

**At-cutoff vs final:** validation always sees the finalized (02:00 UTC D+1)
content; the 19:30 UTC intraday content is destroyed by the overwrite (claims
DELETE + re-INSERT, `created_at = now()`, refused thin regens leave the prior
generation silently in place). Nothing stored can reconstruct a past intraday
digest → **true retroactive at-cutoff scoring is impossible without a snapshot
mechanism** (parked design). What IS derivable, deterministically and for $0: the
stored divergences carry `claimId` per matched pair, claims for past dates are
stable after finalize, their supporting documents' `fetched_at` are durable, and
ISW's real publish instant is stored — so we can compute **"coverage with evidence
already ingested at ISW publish"** (of ISW's takeaways, the share matched by a claim
whose earliest supporting document was fetched before `publishedAt`) alongside the
existing final coverage. That pair is the honest dual metric: apples-to-apples at
their publish moment, and the final number showing what late ingestion added.

**Verdict:** IMPLEMENT the dual metric (zero migration — `validation_runs.details`
jsonb; scoring-time computation going forward + a deterministic 7-day backfill that
never re-runs the matcher, tested on a disposable Neon branch first). PARK the
window restructure (cutoff-anchored digest windows, digest snapshots) with a full
design in `docs/designs/ISW-CUTOFF-SCORING.md`. Headline coverage numbers do not
change. LLM spend $0.

## ⑤ Registry gating

(filled in by W5)

## ⑥ Gregory's interactive checklist

(filled in at the end)

## ⑦ Parked items + runbooks

(filled in at the end)

## ⑧ Spend

(cap $5 — running total $0.00; W4 as designed spends $0)
