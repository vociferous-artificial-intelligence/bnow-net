# QF-A evidence-recency + quality-funnel — production observation CLOSEOUT (2026-08-27)

Companion to `QF-A-EVIDENCE-RECENCY-FUNNEL-RELEASE-2026-08-24.md` (the landing record) and
to the deploy record in the AGENTS.md 2026-08-24 decision-log entry / register §10. This
document closes the observation window those records opened. It also records the natural
mapreduce resumption that satisfies OPEN-TASKS #88's acceptance criterion, because the same
digest rows evidence both.

**Verdict: QF-A observation CLOSED — PASS. #88 CLOSED — PASS.**

Everything here was gathered read-only on 2026-08-27 (~18:13–18:30Z): SELECT-only queries
via `scripts/sqlq.ts`, the read-only `scripts/quality-funnel-report.ts`, anonymous HTTPS
GETs, and read-only `vercel inspect`/`ls`. **No deployment, environment, cap, model, cron,
migration, flag, paid-provider call, or production write of any kind was made.**

## 1. Objective and acceptance criteria

The window (opened at the 2026-08-24 release-train deploy) required: watch **≥1 complete
day/digest cycle** (02:00 finalize + 04:00/10:00/19:30 intraday) for **additive
`structured.stats.evidenceRecency` keys on newly persisted digests** with **zero change to
published events/claims**, the funnel report staying a read-only operator tool.

#88's acceptance (unchanged through its 2026-08-24 re-scope): **a naturally eligible digest
using mapreduce, observed not forced, with no `FORCE_REGEN`.**

## 2. Deployment and repository identity

- Production: **`dpl_FPYase3HqbCF3d2uW3AnwPHibyt4`**, build **`143964a`**, target
  production, READY, aliased bnow.net; deployment **creation timestamp
  2026-08-24T23:56:34Z** per `vercel inspect` (the deploy record's "~23:45Z" was an
  approximation; READY/alias instants were not separately proven). `/health` 200 stamping
  `143964a`, DB OK, re-verified 2026-08-27T18:13:53Z.
- Rollback target unchanged: `dpl_HzDMuajSbg98XuXTAoD1ztKogGA2`.
- `origin/main` = **`eecbd63`**; its whole diff against the deployed `143964a` is the three
  deploy-record docs files (AGENTS.md, docs/PROGRESS.md, register §10). **Documentation-only
  ahead — zero runtime delta, no redeploy needed.** No open PRs; the only unmerged remote
  branch is the parked `codex/paddle-onboarding-page` preservation commit (2026-08-25).

## 3. Window and method

- Observation span: deploy creation 2026-08-24T23:56:34Z → adjudication reads
  2026-08-27T18:13–18:30Z (14:13–14:30 EDT) — **two complete digest-cron days (08-25,
  08-26) fully inside the window plus the partial 08-27 cycle through the 10:00Z intraday**,
  against a ≥1-complete-cycle requirement.
- DB server time was established first (`extract(epoch from now())` = 1787854581 →
  2026-08-27T18:16:21Z; TimeZone GMT). The Neon serverless driver's known **+4h
  bogus-Z rendering of timezone-naive timestamps was reproduced live** on that same read,
  so every instant below derives from epochs (dates read via server-side `::text` casts),
  never from driver-rendered strings.
- There is still no Vercel log drain (#93), so evidence rests on the durable stores —
  `cron_runs`, `digests`, `claims`/`claim_sources`, `provider_usage`, `provider_state` —
  plus the live site. That is the same evidentiary posture as every prior window.

## 4. Digest, recency, and reconciliation results — the QF-A signature

Digest dates 2026-08-24 → 2026-08-27 (44 digests):

- **44/44 present, 11 per date, all `status='generated'`**, identical matrix each day:
  **6 mapreduce** (`openai:gpt-4o-mini+mapreduce`: ru/military, ru/elite_politics,
  ua/military, ir/military, ir/elite_politics, ir/nuclear) + **5 legacy**
  (`openai:gpt-4o-mini`: il/sa/ae/qa/om military).
- **44/44 carry `structured.stats.evidenceRecency`.**
- **Reconciliation 44/44 exact, zero mismatches on both axes:** `evidenceRecency.claimCount`
  equals the relational `claims` row count for its digest, and
  `evidenceRecency.documentCount` equals the count of DISTINCT non-stub cited
  `raw_documents` (claims → claim_sources → raw_documents, stub fixtures excluded by the
  funnel's own predicate), on every one of the 44 digests. Spot examples: ru/mil 08-25
  13/13 claims, 164/164 docs; ru/mil 08-27 11/11, 60/60; ir/mil 08-27 8/8, 45/45; smallest
  sa/mil 08-27 1/1, 1/1.
- Publication conclusion, stated precisely: **QF-A is additive by implementation and tests
  (the landing record's contract), and production showed no structural or relational drift
  attributable to it** — same digest matrix and counts-shape as before, all persists through
  the normal guarded path, exact claim/document reconciliation throughout. This is NOT a
  claim that generated prose is byte-identical between engines or runs; prose-level identity
  was never the criterion and was not measured.
- The funnel report ran read-only against production three times without error (§6).

**QF-A observation: PASS on every criterion.**

## 5. Natural mapreduce resumption — the #88 evidence

- `openai_reduce` has **zero `provider_usage` rows for 2026-08-17 → 2026-08-24** (after the
  08-15/16 recovery-tail rows), then resumes **2026-08-25 ($0.1698, 120 requests) ·
  08-26 ($0.1784, 120) · 08-27 ($0.1377, 90)** — inside the expected $0.10–0.30/day band.
- The six 08-24-dated mapreduce digests have `created_at` **2026-08-25T02:02:04Z →
  02:06:59Z** — the scheduled 02:00 finalize. Zero reduce spend on 08-24 itself rules out
  an earlier reduce that day. First natural mapreduce digests since 2026-08-16T19:32:38Z.
- Every digest date since (08-25/26/27) repeats the 6-mapreduce matrix: **24 mapreduce
  digests over four consecutive digest dates**, all produced by the scheduled digest crons
  at their nominal cadence.
- **Not forced:** the window's `cron_runs` record shows only scheduled runs at nominal
  cadence — no manual invocation was observed — and no `FORCE_REGEN` use was observed;
  the thin-regeneration guard actively REFUSED overwrites inside the window (om 08-26
  19:30Z, om 08-27 02:01Z), which an active `FORCE_REGEN=1` would have overridden.
- The map stage itself never gapped (daily `doc_claims`: 08-20→08-27 = 6,280 / 4,337 /
  3,941 / 5,533 / 7,216 / 3,855 / 2,655 / 2,190-partial; `openai_map` spend present every
  day). The idle week was the reduce/digest-engine side only — #88's documented
  rolling-window mechanism — and it ended exactly as the 2026-08-24 re-scope predicted:
  the map worker closed the publication-front lag and mapreduce resumed unaided, with no
  ordering change, schedule change, or any other intervention.

**#88 acceptance met: CLOSED — PASS.** Residual, by design: the automatic legacy fallback
remains whenever a rolling window finds no current-version `doc_claims`, so a future
sustained map lag would regress the engine mix silently at digest level; detection coverage
is `map_health` freshness staleness (`MAP_STALE_DAYS=2`), not a digest-engine alert. The
backlog-versus-recency ordering decision is dissolved as a blocker, not decided.

## 6. Funnel reports (read-only; warnings would be reproduced verbatim — there were none)

Three runs, zero reconciliation/invariant/OFF-ROSTER warnings. The only caveat line printed
is the standard roster note (`map roster consulted: ru,ua,ir` — read from the local
process's `MAP_THEATERS`, which mirrors production scheduling only if the env does).

- **ru/military 2026-08-27** (digest 2484, mapreduce): corpus 2,348 eligible docs (x_api
  955, tg_web 668, mtproto 623, rss 102) · mirrors 285 → canonical 2,063 · 1,891
  dispositions → 1,057 map claims · reduce **1,270 claims → 841 groups → 200 fed → 5/5
  votes → 5 events → 11 persisted claims, 60 links → 60 distinct cited docs** · timestamp
  coverage 100% · median evidence age 16.15h · **p90 20.1h** · stale >48h **0** ·
  publication guard all zeros · pending 172 (same-day backlog, hourly cron drains).
- **ru/military 2026-08-26** (digest 2443): 1,407 → 892 → 200 fed → 5/5 → 5 events, 12
  claims, 105/105 docs, coverage 100%, p90 20.74h, stale 0.
- **ir/military 08-26/08-27** (digests 2438/2479): 358 → 208 → 200 fed → 5/5 → 6 events,
  11 claims, 62 docs, p90 17.6h · 313 → 184 → **184 fed (all)** → 5/5 → 5 events, 8
  claims, 45 docs, p90 22.33h; guard on 08-26: attributedClaims 1, retitledEvents 1,
  replacedSummaries 1 — ruling-19 machinery operating.
- **ir/nuclear 2026-08-27** (digest 2481): 44 → 26 → 26 fed (all) → 5/5 → 5 events, 8
  claims, 20/20 docs, p90 18.51h, extractor `gpt-4o-mini:19c06260f149`.

Reading: RU/military feeds 200 of 841–892 groups while both Iran tracks fed 100% of
theirs on 08-27 (ir/military fed 200 of 208 on 08-26, brushing the cap) — consistent with
the standing read that the fixed top-200 reduce selection is a high-volume-track quality
constraint, not a universal context problem.

## 7. Cron and operational findings in the window

- Last 48h (to 08-27T18:16Z): **zero `ok=false`, zero `error`, zero `budgetStopCategory`
  on any job since 2026-08-24T00:00Z**; cadence exactly nominal (map/telegram/x/mtproto
  48 hourly runs each, fast 192, intraday 6, finalize 2, validate/enrich/datadark daily).
- **Nested-error sweep (the #87/#97 signature): `errors` = 0 and `batchErrors` = 0 on
  every map and digest run since 2026-08-24T00:00Z** — no recurrence post-deploy. Three
  thin-regeneration refusals (`ir thin-regen` 08-24T19:30Z; `om thin-regen` 08-26T19:30Z
  and 08-27T02:01Z) are the ruling-17 guard refusing thinner regenerations, by design;
  each affected date/theater retains a full digest.
- Unfinished rows: one `ingest:fast` row (started 08-27T18:15:45Z) was simply in flight and
  finished ok in 164.9s (median-normal) during the check. One **`ingest:telegram` row
  started 2026-08-27T18:01:42Z is a genuine hang** — `finished_at` NULL / `ok` NULL /
  empty counts at ~20 minutes against a ~124–155s baseline: ruling 10's timeout signature,
  the **#98 pattern recurring** (4 such rows across telegram/x in 7 days, ~1.2% of runs);
  the adapter watermark re-covers the window next hour, and the surrounding 18:0xZ
  fast/x/mtproto runs were green.
- `map_health`: `episodeKey: null`; last alert remains the 2026-08-24T13:42:17Z recovery
  notice; state last written by the 08-27T17:41:12Z map run. Map-health alert accounting in
  `cron_runs` matches: unhealthy alerts sent 08-24T00:40Z and 07:40Z (episode-deduped
  between), recovery 13:40Z run, all-clear on every run since.
- Spend (all-time / recent): `openai_map` **$19.5311 of the $40 `MAP_SPRINT_USD_CAP`**
  (daily $0.27–0.52 vs $4); `openai_reduce` $4.5191 all-time; `openai_ask` **$0 since
  2026-07-21** (all-time $0.4468); **`x_api` $57.6724 of the $75 `X_SPRINT_USD_CAP` =
  76.9%** — at the window's ~$1.04/day this projects roughly 17 days to fail-closed
  exhaustion, a **point-in-time projection, not a guarantee** (X volume varies). Raised as
  OPEN-TASKS **#101**: an operator decision is needed before the cap stops X ingestion.
  No cap was changed by this closeout.
- Live surface: 17 gated/conflict routes probed anonymously bare + `RSC: 1` — every body
  clean of privileged tokens (ruling-21 posture holding on this deployment); the five
  conflict routes present exactly as dormant/feature-off.

## 8. Limitations and inference boundaries

- **No runtime log coverage** (#93 unremediated): all findings are from durable stores and
  the live site; nothing in-window was observed from logs.
- `digests.created_at` is last-writer-wins, so earlier same-day intraday engine states are
  unobservable; the 08-25T02:02Z resumption instant is pinned by the zero-reduce-spend
  08-24 day plus the finalize-time `created_at` cluster — direct for the finalize, inferred
  for the day's interior.
- The CAUSE of the 08-17→08-23 reduce idleness is taken from #88's 2026-08-24 measured
  mechanism (rolling window trailing the publication front during the backlog drain). All
  window evidence is consistent with it; it was not independently re-proven here.
- The funnel roster caveat above; funnel runs describe production scheduling only insofar
  as the local `MAP_THEATERS` mirrors it.
- Anonymous read-only probes cannot exercise authenticated or flag-on behavior; those
  remain covered by the itest suites per the landing records.
- Postmark mailbox receipt of the 08-24 map-health alert/recovery emails was not
  re-verified here (the #38-closure precedent covered the X-health pair only).

## 9. Standing consequences recorded with this closeout

- **QF-A: CLOSED — PASS** (this document; AGENTS.md standing snapshot corrected, decision
  log appended).
- **#88: CLOSED — PASS**; #97's reduce-path sites (`synthesize.ts:138-139`) are therefore
  **live again on a paid path** — no failure was observed in the window (zero nested errors
  in 24 mapreduce digests' worth of runs), but the defect is unrepaired and the "fix before
  #88 recovers" intent was overtaken by the natural recovery. #97 is now the next code PR.
- **#87 remains OPEN** — zero nested digest errors since 08-24 is encouraging but repairs
  nothing: the swallow-into-counter mechanism and the legacy `openai-provider.ts:153`
  truncation are unchanged, and the 5 daily gulf legacy digests still exercise that path.
- **#98 remains OPEN**, with the 08-27T18:01:42Z recurrence added as evidence.
- **#84 remains OPEN** — the intended release-time headroom re-check was not
  contemporaneously recorded at either the 08-20 or 08-24 deploy; `openai_ask` measured $0
  since 07-21 (2026-08-27 read) means there was no practical exposure in fact, but the
  task's acceptance (a recorded re-check against the day's real usage at the next release)
  stands. Not called moot.
- **#101 (new)**: operator decision on the X all-time cap before fail-closed exhaustion.

## 10. No-change statement

This closeout made **zero** changes to runtime, environment variables, caps, feature
flags, models, crons, migrations, or production data; **zero** paid provider calls; and
touched no checkout other than a fresh docs-only worktree. The primary dirty checkout was
not touched. Production remains `dpl_FPYase3HqbCF3d2uW3AnwPHibyt4` / `143964a` throughout.
