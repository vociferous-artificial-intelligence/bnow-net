- **2026-09-11 (step 27 — 48-hour execution program DEPLOYED; migrations 0028–0030 applied;
  log drain registered; window closed on `45fa81f`)** Operator-run from the plain release
  clone per `docs/RELEASE-CHECKLIST.md` and `docs/prompts/2026-09-11-48h-step27-deploy-cards.md`.
  **Verdict basis:** step 26's final audit (`PROGRAM-48H-FINAL-AUDIT-2026-09-07.md`, #98
  `180de8b`) — deployable, 0 blockers, no PR `no-go`; its four `go-after-fix` items landed as
  #99 `1204ef9` (AUD-03/04/05/06) and the local roster branch deletion (AUD-02). **Baseline
  (card 27.1, production, read AFTER correcting the DSN):** production at `8a19ade`, 29
  migration rows, three new tables absent, last dozen cron rows `ok`, `openai_ask` no usage row
  on 2026-09-11 (headroom = full `ASK_USD_CAP_DAILY` — the #84 line). **Env read-back (G3,
  names only):** none of the fifteen routing envs, `OPENAI_MODEL`, `ANALYSIS_PROVIDER`,
  `MAP_CONTENT_CHARS`, `ASK_ANSWER_MODEL`, `ASK_RERANK_MODEL`, `ASK_PIPELINE`, `DIGEST_PROVIDER`,
  `ANTHROPIC_API_KEY`, `EVAL_*`, `CONFLICTS_UI` present in Production or Preview; no Development
  environment exists for this project; Vercel Node setting 24.x, so `engines.node >=22` is a
  no-op. **Migrations (checklist step 11):** backup branch **`backup-pre-48h-deploy-2026-09-11`
  = `br-shy-wave-ata4r6y0`** from `br-lively-haze-atvkarvn` at 22:29:07Z; rehearsal on
  disposable fork `br-purple-firefly-atb7yprb` (29 → 32, second run a no-op, deleted); production
  `npm run db:migrate` from the release clone at **22:35:37Z** — `0028_lumpy_dragon_lord` (7
  statements), `0029_runtime_logs` (4), `0030_conflict_observations` (6); `_migrations` 29 → 32;
  `benchmark_report_editions`, `benchmark_series_days`, `runtime_logs`,
  `conflict_validation_observations` present. Applied at :35, off every cron minute. **Deploy:**
  `npx vercel@latest deploy --prod --yes` from `/Users/go/code/bnow-net-rel-20260823` at
  **`45fa81f`** (= `1204ef9` + docs), 22:38Z, deployment `H5HgnBKk2HhMQrEAtvHETT7gj3P5`; a second
  deployment of the same source followed once `LOG_DRAIN_SECRET` was set (functions read env at
  deploy time) — that later deployment is the live one and `H5Hgn…` is the rollback target above
  the ladder floor (the 2026-09-01 hotfix). `/health` `45fa81f · DB OK`; `/methodology` 200
  (#69, first public page of the window); `/api/logs/drain` 405 to GET; `/conflicts` 404 (flag
  absent); ruling-21 smoke: `/search` and `/ask` redirect to login, `/signals` 200 by its
  documented carve-out. **Drain (LOG-DRAIN §8):** `LOG_DRAIN_SECRET` in Production and Preview
  (value = the drain's own verification secret, set without a trailing newline); drain
  registered **production-only**, NDJSON, self-path sampled 0%; first delivery **23:56:37Z**;
  first registration attempt answered 403 because the secret was not yet on Vercel — recorded
  as the correct fail-closed behaviour. **Incidents:** (1) card 27.1's first read hit the
  evaluation branch (`ep-misty-bonus` = `br-weathered-forest`, a snapshot frozen 2026-09-03) —
  `.env.local` had been copied with the wrong branch selected; corrected to
  `ep-jolly-glitter-at0968cv` and an endpoint-ownership read added to card 27.0 before any
  database read. (2) The production `neondb_owner` password was reset during the DSN refresh;
  Vercel's `DATABASE_URL` went stale until updated ≈22:00Z — two `ingest:fast` cycles (21:45,
  22:00) left no row; every job from 22:01Z is `ok`. Preview's `DATABASE_URL` reset to the same
  rotated production string (it already pointed at production — OPEN-TASKS **#124** files the
  proper fix). The evaluation branch and the two older backups keep the pre-rotation password.
  **Found by the smoke test, filed, not deploy-related:** OpenSanctions enrichment failing on
  every call since ≈2026-08-06 with each refusal metered and swallowed (**#122**; the operator's
  30-day trial access lapsed — reapplying; the ledger's $13.20/day is the code's own estimate,
  not an invoice); a forced digest re-run rewrites the published row in place (**#123**;
  `SETUP-NEXT-WEEK.md` step 5 now ONLY-ONCE). **First observation window (2026-09-12 02:23Z):**
  `digest:finalize` 02:00:11–02:04:41Z `ok`, errors 0; **`openai_embed` 11 requests, 93
  `claim_embeddings` since the deploy — PR #59's unpriced-model refusal did NOT fire** (the one
  item the audit could not settle from the repo); 11 digests for 2026-09-11 on the standing 6
  mapreduce / 5 legacy matrix; 44 cron rows since 21:00Z all `ok`; `runtime_logs` 531 rows, 3
  deployments; `audit-cron` coverage reported as a number, verdict unchanged (240 of 531 lines
  error-level — an open read, classify by message before treating as signal). Second and third
  nights owed for #59; two days for #77/#84 on the digest and search pages. **Closed by this
  entry:** OPEN-TASKS #111, #93 (registered), #84 (the line exists), #80. **Not enabled, on
  purpose:** `CONFLICTS_UI`, the `conflict-validate` cron line, `DIGEST_PROVIDER` /
  `ANTHROPIC_API_KEY` (the Anthropic digest path stays dormant). **Spend:** $0 for the deploy;
  the observation window ran under existing caps. Record:
  `docs/prompts/2026-09-11-48h-step27-deploy-cards.md`, tracker §7, INDEX §10 close line.
