# Analyst trust sprint — morning note (2026-07-12)

Prompt: `docs/prompts/2026-07-12-analyst-trust.md`. Branch `20260712-analyst-trust`,
tag `pre-analyst-trust-20260712`. Rollback deployment recorded pre-sprint:
**bnow-jihmibgm6**. Baseline gate 996 tests / 79 files green.

## ① Outcome

**FULL SHIP.** All five build workstreams landed; nothing rolled back; one planned
park (the W4 window restructure, by design — R6(d)). Branch
`20260712-analyst-trust` merged `2feb128`, deployed **`bnow-kw2t3dndf`** (READY,
project domain serving; rollback target recorded pre-sprint: `bnow-jihmibgm6`).
Tests 996 → **1053** (84 files); typecheck/lint/`next build` green; route table
unchanged (all dynamic, URLs frozen). Signed-out prod smoke green: hero intact
with zero `/registry` hrefs, registry routes 404, scoreboard 200 with explainer +
live at-publish sublines, /search + /digests still 307, /health 200. LLM spend
**$0.00** of the $5 cap. The finding-1 contradiction is now structurally
impossible (the claims count is keyed to and labeled with the digest bucket the
card names — pinned by tests), and the underlying fold bug is fixed +
regression-pinned.

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

## ③ TIME-MODEL summary — what was buggy vs mislabeled

`docs/TIME-MODEL.md` is the standing document; `src/lib/time/` is the one
sanctioned helper set (explicit-timezone day boundaries, ET formatters, the digest
status state machine). **Genuinely buggy:** (a) the `rn` driver-string fold bug
(fixed: `::int` cast + `Number()` fold + driver-realistic test mocks — the old
mocks used JS numbers, kinder than the real driver, which is why 996 green tests
missed a fully broken card); (b) "claims, today" and the corroborated tile
bucketing on SQL `current_date` (the UTC session day) under ET labels — every
evening 8 PM–midnight ET they silently pointed at a bucket with no digest yet
(now: the bucket is computed in ET and passed as a parameter, and the claims count
is keyed to the displayed bucket). **Mislabeled, now truthful:** "Digest
generated" (created_at is last-writer-wins) → "Latest digest: {date} ·
intraday/final {time} ET"; "Next update" → "~{next intraday} ET · final ~{time}
ET" phrased per cadence stage; the corroborated tile now names its date; home
coverage tiles say "final coverage". The X-paused banner semantics are untouched
(R9). Dev-box ET vs Vercel UTC is documented as a standing trap.

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

Mechanism: the existing role model — `requireAdminOr404()` in
`src/lib/gate.ts`, called from both `src/app/registry/layout.tsx` and
`src/app/middle-east/layout.tsx`. Admin = `users.role='admin'` in the DB OR the
`ADMIN_EMAILS` allowlist (bootstrap); everyone else — analyst, user, signed-out —
gets `notFound()` (a 404, not a redirect: the gate doesn't advertise itself).
Fail-closed: gate on + no admin evidence = 404; with `FEATURE_AUTH_GATE` off
(local dev) everything stays open, matching the repo's standing dev-parity
posture. Registry links removed everywhere (nav, quick-links rail, signed-out
home line + reliability-card link); the "Suggest or flag a source" mailto moved
to the digest footer (subject `[BNOW source] suggestion`). `ADMIN_EMAILS` is now
**readable-plain in all three Vercel envs** + `.env.local`, value
`go@vociferous.nyc`, round-trip-verified via `vercel env pull`. **How to grant
someone admin (one line):** `UPDATE users SET role='admin' WHERE email='<email>'`
(or append the email to `ADMIN_EMAILS` + redeploy). **CLI discovery worth
keeping:** this team's Vercel policy stores Production/Preview env adds as
Sensitive (write-only) by default — `vercel env add NAME <env> --no-sensitive
--value '<v>'` is the readable form; my first two adds silently stored
empty-pulling Sensitive values until re-added with the flag.

## ⑥ Gregory's interactive checklist

1. **Reload the home page at a few different hours** (mid-morning, ~4 PM, ~10:30
   PM, just after midnight ET) and confirm each theater card's story matches
   reality: the digest row names a date + stage + ET time; the claims row carries
   the SAME date; "next update" points at the true next run (intraday ~12 AM /
   6 AM / 3:30 PM ET, final ~10 PM ET).
2. **Click a theater panel anywhere on the card** — it should land on that
   theater's latest digest; the inner "scoreboard →" link must still work
   independently.
3. **Read the scoreboard explainer cold** and judge whether a stranger-analyst
   understands what's measured and why the misses are published. Check the "at
   ISW publish" sublines — ir 07-11 reads final 100% / at-publish 0% (real: our
   matched evidence was ingested after their 4:10 PM ET publish), ru 07-11 reads
   57% both.
4. **Registry:** incognito → bnow-net.vercel.app/registry should 404 (also
   /middle-east); signed in as go@vociferous.nyc it should render fully. Confirm
   no registry links anywhere in nav/home/rail.
5. **Sign out, sign back in via magic link** — you should land on `/` (the
   signed-in home), not /account.
6. **Digest footer:** any digest page should show BOTH mailtos ("Flag an error…"
   and "Suggest or flag a source").

## ⑦ Parked items + runbooks

- **W4 full version PARKED (by design, R6(d)):** cutoff-anchored windows + digest
  snapshots + true dual validation passes — complete design + revival runbook in
  `docs/designs/ISW-CUTOFF-SCORING.md`. Nothing historical is lost by waiting
  (snapshots can't exist retroactively).
- **Three backfill skips (honest):** ir 07-07, ir 07-08, ua 07-08 have no
  at-publish subline — their digests were regenerated after scoring, so the
  matched claims are gone. They stay blank rather than guessed. Runbook: none
  needed; new runs compute the metric at scoring time from tonight's validate
  cron onward.
- **OPEN-TASKS #56 (R8):** platform-level registry sources (facebook.com, t.me
  root, x.com root) need page/channel/account segmentation — filed, not built.
- **OPEN-TASKS #57 (new, from W5):** /pricing's Full-analyst tier still promises
  "Source-registry explorer" — needs either copy re-scope or an
  analyst-entitlement decision now that the registry is admin-only.
- **Orphaned i18n keys** (nav.item.registry, nav.item.me_registry,
  home.quicklinks.registry, home.features.reliability.link, home.cta.digest,
  home.cta.coverage, home.live_label) left in catalogs — harmless, sweep anytime.
- **Checkpoint file** `.analyst-trust-checkpoint.md` deleted post-ship (absorbed
  by this note).

## ⑧ Spend

**$0.00 of the $5 cap.** The dual metric is deterministic (stored matches + durable
document timestamps); the backfill never re-ran the matcher; no other workstream
touches a paid provider. One disposable Neon branch (br-small-tooth-atqg0c7z) was
created for the backfill rehearsal and deleted after verification.
