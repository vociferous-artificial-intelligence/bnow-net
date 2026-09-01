# Map flood OOM incident — detection, recovery, durable fixes (2026-08-31)

One session detected (during the PR #37 pre-merge health recheck, which was HELD),
diagnosed read-only, manually recovered, and shipped durable fixes for a
full-day production map-stage outage, in three serialized reviewed releases.
Database instants derive from epoch extracts; the termination mechanism is
quoted from runtime logs; anything inferred is labeled inferred.

## 1. Trigger (confirmed, DB)

The 07:03Z `ingest:mtproto` run's bounded long-park catch-up inserted **447
documents at 07:04:33Z** whose `published_at` reached back to 2026-06-14
(t.me/kharkivnapriamok 211, t.me/pushilindenis 192, t.me/sladkov_plus 44).
Old-dated catch-up documents are the trigger; the catch-up mechanism itself
behaved as designed.

## 2. Mechanism and evidence (confirmed vs inferred)

- CONFIRMED (replicated selection): the hourly worker's oldest-first steady
  selection then spanned 2026-07-05→08-31 — 58 days (the last healthy 06:40Z
  run had selected 293 recent-day docs) — so the dedup reference query
  `BETWEEN minDay-1 AND maxDay+1` matched **419,360** processed rows, each
  carrying a 2,000-char `text2k`.
- CONFIRMED (live observation): at 18:43:21Z the 18:40Z run was executing that
  reference query with parallel workers (`pg_stat_activity`), AFTER acquiring
  the lease (fences advanced one per hung run, 222→233).
- CONFIRMED (runtime log): `Vercel Runtime Error: instance was killed because
  it ran out of available memory`, attributed to the 18:40:02Z map invocation.
  An OOM kill, not the 800s route ceiling.
- INFERRED (arithmetic; corroborated by an independent review's empirical
  probe of ~7.6KB live per reference at gate time): 419K references ≈ 3.2GB
  live — far past default function memory. The exact in-function death point
  (row accumulation vs LSH signature computation) was not directly observed.
- CONFIRMED (12 identical consecutive runs, 07:40→18:40Z, all #98-swept): a
  killed run dispositions nothing, so the identical selection recurred hourly.
  `doc_claims` froze at 06:40:57Z; zero `openai_map` dispatch after 06:40Z.
- CONFIRMED (alerting): NO operator email fired — `map_health` evaluates only
  inside COMPLETING steady runs (its `lastAlertAtMs` dated 2026-08-24). The
  operator learned of the outage from this session's push notification. This
  blind spot became OPEN-TASKS #103.

## 3. Bounded manual recovery (authorized ≤$1 manual map spend, 2h wall bound)

Through the EXISTING date-scoped backfill route — the normal disposition path
(dedup gate, track applicability, extractor versions, SpendGuard all intact);
explicitly NOT remap mode, NO blanket `processed=true` update, NO deletion, NO
date/theater rewriting, NO lease stealing — driven by `scripts/map-backfill.ts`
over 2026-07-05→2026-08-31:

- Pre-dispatch bound: whole-range dry estimate **$0.4180** (< $1 → apply);
  per-call `cap=400`; mid-drain actual-spend abort; recorded spend baseline
  openai_map all-time $20.5566 / day $0.0580 before the first paid call.
- Every day drained to `selected=0`: ~427 historical eligible docs (the flood
  cohort + stragglers) plus the 5,654-doc 08-31 backlog that accumulated
  during the outage. No document was discarded: each reached its genuine
  disposition (mapped, mirror verdict, or no-applicable-track) through the
  normal pipeline.
- **Actual manual spend $0.2968** of the $1 allowance (modelled $0.4180).
- Verified with real output, not ok=true: eligible backlog **6,081 → 0**;
  **2,199 new doc_claims** since the 06:40:57Z freeze; 630 new dedup verdicts;
  newest eligible day == newest mapped day == 2026-08-31. Honest caveats:
  recovered claims carry same-day extraction timestamps for old documents,
  and no digests were regenerated (not authorized; FORCE_REGEN untouched).

**Two separate verdicts:** *service restored* — the 19:40Z natural steady
cycle (still the OLD code) completed healthy (ok, 4 selected, 0 batchErrors)
because the drain had collapsed the selection span; and *backlog cleared* —
the eligible set measured 0 at 19:2xZ, with only ordinary fresh inflow after.

## 4. Durable fix — PR #38 (`52ea272` → `dpl_FJ33AS2DKMcme3qwjBiSTyNABxYh`, 19:47Z)

OPEN-TASKS #102. Bounded-dedup repair: steady-selection distinct-day probe +
fresh-first split above a 3-day span (a flood can never starve fresh input);
the reference fetch is the exact per-candidate-day ±1 IN-list (never min..max);
`MAP_REF_ROW_CAP=75K` sized to the instance from measured ~7.6KB/reference,
with adaptive old-day shedding (a flood replay self-drains) and a loud
ok=false refusal for every no-work terminal; the reference rows' md5 alias fix
revives the exact-match arm (documented contract-valid behavior repair).
Three independent reviews + two delta reviews; a 3,000-trial verdict oracle;
mutation coverage for every piece. Gates on the deployed tree: unit
3,469/3,469 · integration 158/158 (disposable fork) · build PASS. First two
natural cycles on the new code: 20:40Z (420 selected / 120 claims / refRows
12,679) and 21:40Z (362 / 120 / 13,045), zero batch errors, zero lease loss.

## 5. Watchdog — PR #39 (`c0aa788` → `dpl_GxEcce4WiTkF1reDZknaPYDeubjn`, ~21:48Z)

OPEN-TASKS #103, closing the blind spot: a throttled watchdog independent of
map-run completion rides non-map cron starts (after the host's own row
INSERT), detecting repeated swept map timeouts, missing scheduled starts, and
stale `doc_map_state.mapped_at` while eligible work exists; episode-deduped
Postmark alerts with one recovery notice; atomic slot claim; bounded email
send; inert under test runners. Two review rounds. Detection proof is
SYNTHETIC (fixtures/mocks — no production crash was staged); the first real
pre-completion death is the first natural proof.

**Watchdog defect found during release (NOT a production outage event):** the
first natural traversal (21:45:15Z) fired ONE spurious
"[BNOW] map watchdog recovered: resumed" email — the atomic claim's INSERT
arm seeds a partial state row and the recovery branch's `!== null` comparison
read the missing episode key (`undefined`) as "an episode just cleared". This
was a first-evaluation notification bug in the new watchdog, repaired the
same hour in **PR #40** (`4ab388f`; one-line normalization + regression test;
independently reviewed, mutation-proven) and deployed with PR #37. Confirmed
after the fix: the 22:15:17Z evaluation advanced `lastCheckAtMs` with NO new
alert and no episode — the false notification did not repeat, and no real
incident was masked (all crons clean throughout).

## 6. Observation through closure

- Post-#38: natural cycles 20:40Z and 21:40Z healthy on the new code (above).
- Post-#37/#40 (deploy ~22:00Z, `a4ed5cb` / `dpl_Bya68YX6a3GaDQe1LnYyMo1YhHkh`),
  window closed 2026-09-01T13:32Z (~15.5h, well inside the 26h deadline):
  **132 cron runs — 0 failed, 0 unfinished, 0 errored, 0 degraded**; **15
  hourly map cycles** (22:40Z→12:40Z), 1,507 claims, 0 batchErrors, 0 lease
  losses, bounded refRows recorded on every cycle; watchdog evaluated
  regularly (lastCheckAtMs 13:30:16Z) with NO new alert after the single
  21:45:15Z spurious one and no episode; the swept-row inventory stayed at
  exactly 21 (9 historical + the 12 incident kills — nothing new); `/health`
  stamped `a4ed5cb` with the same `data-dpl-id` and DB OK at every probe and
  at closure. Checkpoint evidence (embed + matcher) is recorded in
  `docs/reviews/EMBED-VALIDATE-RELEASE-2026-08-31.md` §5.

## 7. Rollback ladder recorded for this stack (identities verified via /health `data-dpl-id` at each promotion)

- Narrow #37 embed/validation regression → `dpl_GxEcce4WiTkF1reDZknaPYDeubjn`
  / `c0aa788` — NOTE: contains the watchdog first-evaluation normalization
  defect (#40 not yet applied there). Its practical effect is state-dependent:
  with the now-complete `map_watch` row it does not re-fire; a deleted state
  row would allow one spurious recovery email. Not defect-free — documented,
  not overstated.
- Watchdog or combined-release regression → `dpl_FJ33AS2DKMcme3qwjBiSTyNABxYh`
  / `52ea272` (incident-fixed map code, no watchdog).
- Anything earlier than `52ea272` REINTRODUCES the map flood failure mode and
  is not an acceptable routine target.

## 8. Ledger

- Manual paid calls: the authorized recovery drive only — $0.2968 openai_map,
  all server-side guard-enforced; no cap/env/flag/cron/migration change.
- Production writes: the recovery's normal map/dedup writes through the
  guarded deployed route; every other query in diagnosis and observation was
  a read-only SELECT.
- Preserved untouched: the dirty primary checkout, all pre-existing
  worktrees, corpus-v2 drafts + manifest.
- No lease was ever force-released; no run manually killed; the hung 18:40Z
  run was observed, not interfered with.
