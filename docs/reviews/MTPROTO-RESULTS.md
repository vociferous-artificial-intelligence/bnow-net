# MTProto ingest sprint — results

Sprint prompt: `docs/prompts/2026-07-10-mtproto.md`. Built 2026-07-11.
**Status: BUILD phase complete and deployed; LIVE phase blocked on the one-time
operator login (OPEN-TASKS #47 / SETUP-NEXT-WEEK §5).** The BEFORE baseline below
is snapshotted so the after-comparison stays honest; the AFTER sections are
templates to fill once MTProto has run.

## TASK 0 — feasibility gates

| Gate | Result |
|---|---|
| Vercel egress | **PASS** — both transports. TCP connect 1844ms cold / 1567ms warm; WSS 1570ms; GetNearestDc ~90ms (`/api/cron/probe/mtproto`, CRON_SECRET-gated). Empty-session handshake includes DH; a saved session connects faster. |
| Login artifact | **ABSENT** — interactive (phone code/QR), operator-only. Tooling ready: `scripts/telegram-login.ts` (mint), `scripts/telegram-getme.ts` (verify). API creds valid (probe's initConnection accepted them). |
| Inventory | sourceKey `t.me/<channel lowercase>`; preview docs keyed `externalId "Chan/1234"` (case as rendered); `content_hash` includes the ADAPTER NAME → cross-transport dedupe impossible via hash; theater = TELEGRAM_CHANNEL_THEATER pins + uk→ua/fa→ir language rules. |

Trap for future gramJS work: import from the `telegram` ROOT only (subpath imports
duplicate the module in the bundle; StringSession then fails instanceof), and keep
`telegram` in `serverExternalPackages`.

## What shipped (deployed to prod 2026-07-11, fail-closed on missing session)

- `telegram_mtproto` live adapter: peer cache + resolve backoff
  (`telegram_channel_state`, migration 0013), gap-free ascending high-water reads,
  flood policy (sleep+retry ≤30s, run-abort above, both counted in cron_runs),
  insert-gated mark commits, cross-transport `lower(external_id)` dedupe pre-filter
  (+ expression index). 20 unit tests; suite 491/42 green.
- Own cron group `ingest?which=mtproto` :35 hourly; never part of "all".
- The old fixture stub deleted; audit tooling updated (prod had 0 rows under the name).
- Registry expansion staged: mtproto reads top-75 recent-cited channels (web scraper
  stays at 50); ranks 51–75 = the 25-channel batch; 6 Iran-Update-dominant channels
  pinned → ir: rahbar_enghelab_ir, sepah_pasdaran, elamalmoqawama, bentzionm,
  presstv, manniefabian.
- Backfill: `scripts/mtproto-backfill.ts` — estimate-first, `--apply`-gated,
  resumable (per-channel `backfill_min_id`), oldest-day-first insert, per-day
  actual-vs-estimate log.

## BEFORE baseline (snapshotted 2026-07-11 ~01:35Z)

**Preview-scrape volume (7d):** 85 channels produced docs; 21,185 docs ≈ 3,026/day.
Top: tass_agency 250/day · kpszsu 210 · nournews_ir 203 · rian_ru 158 · mehrnews 151 ·
iribnews 145 · boris_rozhin 144 · farsna 141 · rvvoenkor 122 · mtvlebanonews 97.
(Roster is ~95 ru/ua/ir channels at mtproto's top-75 cut — so ~10 currently yield
nothing: preview-less or dead. The full per-channel table reproduces with the query
in `scripts/mtproto-backfill.ts`.)

**Scoreboard (last scored days, mapreduce engine):**

| day | theater/track | coverage % | unsupported |
|---|---|---|---|
| 07-09 | ir/military | 25.0 | 0.00 |
| 07-09 | ru/military | 40.0 | 0.00 |
| 07-09 | ua/military | 40.0 | 0.50 |
| 07-08 | ir/military | 33.3 | 0.25 |
| 07-08 | ru/military | 0.0 | 0.75 |
| 07-08 | ua/military | 57.1 | 0.80 |
| 07-07 | ir/military | 20.0 | 0.00 |
| 07-07 | ru/military | 0.0 | 0.40 |
| 07-07 | ua/military | 0.0 | 0.00 |

**Backfill estimate (14d, ru/ua/ir, top-75 roster = 95 channels):** ~44,360 NEW docs
(dedupe-aware: preview-covered messages are excluded pre-insert and cost nothing)
→ map catch-up ≈ **$3.37** at the measured $0.076/1K, inside the $6 sprint LLM
budget with room for the 3-day revalidation. The naive both-transports estimate
read $6.57 and would have wrongly refused the run.

## AFTER (fill once live — the honest numbers, X-sprint style)

1. **Docs/day per channel, preview vs mtproto** — same 7d query filtered by adapter.
2. **Channels newly readable** — channels with mtproto docs and zero telegram_web
   docs ever (expect: preview-less MoD/milblogger channels + ranks 51–75).
3. **Backfill actuals vs the printed estimate** (the script logs per-day counts).
4. **Zero double-ingest check:**
   `SELECT lower(external_id), count(*) FROM raw_documents WHERE adapter IN
   ('telegram_web','telegram_mtproto') GROUP BY 1 HAVING count(*) > 1` → must be 0 rows.
5. **Flood health over the first live day:** cron_runs `ingest:mtproto` counts —
   floodWaitsHonored / floodAborts / resolves / channelErrors; expect aborts ≈ 0.
6. **Revalidate 3 recent days** (07-07..07-09 above are the scored BEFORE): regenerate
   digests with MTProto depth in-corpus (FORCE_REGEN=1; watch the thin-regen guard),
   re-run validation, report coverage with/without. If coverage does not move, say so
   and diagnose — deeper history the analysis window never reads is a finding, not a
   win. NOTE the confound: regeneration alone has variance (ruling 17/18) — compare
   against the persisted BEFORE scores AND note vote spread.
7. **Preview-scraper fate decision** (sprint TASK 2) — after one clean day: keep as
   fallback for channels MTProto cannot read, or retire; record in the decision log.
   Bias from the build: keep as fallback initially — the dedupe gate makes overlap
   cheap ($0 both transports), and the scrape is the only path if the session is
   ever revoked; retire per-channel once MTProto proves strictly-superior coverage.
