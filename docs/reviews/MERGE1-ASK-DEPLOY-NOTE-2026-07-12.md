# MERGE 1 — ASK Tier-2+ → main, prod migrations, backfill, deploy (2026-07-12)

Attended, gated session (operator present; gates G1–G4). Branch
`20260711-ask-tier2plus` (12 commits off `c49b79f`) merged to main and deployed;
migrations 0014+0015 live on prod; embedding backfill complete; v2 /ask pipeline
serving. The design branch (`20260711-design-commercial-site`) was NOT touched.

## What shipped

| Step | Result |
|---|---|
| Merge (G1) | `58ac262` `--no-ff`, zero conflicts (main sat at the fork point). Plus `f74896c`: eslint `globalIgnores` gains `.workstream/**` — the design worktree's `.next` build artifacts were failing main-checkout lint (pre-existing, exposed post-merge). |
| Gate suite | typecheck + lint + **770 tests / 58 files** green on merged main; re-verified by the pre-push hook at push time. |
| Migrations (G2, ratified) | 0014 (`claim_embeddings` + HNSW + GIN FTS on `claims.text`) + 0015 (18 nullable `ask_usage` columns) applied to prod 01:00Z; additive-only verified; trigger 9999 untouched; `claims` count unchanged (776). See **Incident** below for why G2 was ratified rather than gated. |
| Backfill (G3) | `backfill-embeddings.ts --apply` vs prod: **776/776 claims, 14,556 tokens, $0.0003**, model `text-embedding-3-small`, dims 1536 verified (declared == `vector_dims`). |
| Deploy (G4) | Pushed `c49b79f..f74896c`; `npx vercel@latest deploy --prod --yes` → `bnow-j5lob1iu2` READY, project domain serving 200. (Vercel project is NOT git-connected — the CLI deploy is the deploy; a bare push ships nothing.) |

## Env values set (before deploy, non-Sensitive, read back and verified)

Production AND Preview: `ASK_USD_CAP_DAILY=2`, `EMBED_USD_CAP_DAILY=1`,
`ASK_GLOBAL_DAILY_BUDGET_USD=10`, `ASK_USER_DAILY_LIMIT=100`.
Set via `vercel env add … --no-sensitive` (CLI 55) — values are readable back via
`vercel env pull`, unlike the Sensitive-typed vars of earlier sessions.
Deliberately NOT set: `ASK_ANSWER_MODEL` (R2: answer model stays gpt-5),
`ASK_PIPELINE` (R3: v2 is the code default; the env var exists only as rollback).

## Rollback

`ASK_PIPELINE=legacy` (plain env var, Production) + redeploy → the byte-preserved
legacy /ask path. Migrations stay (additive, inert under legacy). Never force-push;
pre-merge tag `pre-merge-ask-20260712` + `~/bnow-branches-20260712.bundle` hold the
pre-merge state of main and both feature branches.

## Smoke (GREEN) — evidence

- 9 paid v2 answers through the live UI (operator session; `/api/ask` unauth
  correctly 307s to `/signin`).
- Every `ask_usage` row: `retrieval_mode='v2'`, `state='answered'`, per-stage costs
  (embed+rerank+answer) sum **exactly** to `cost_usd`, `rerank_model=gpt-5-mini`,
  `answer_model=gpt-5` recorded; one row shows `rerank_used=false` with the billed
  model still recorded (composite-fallback design working).
- Temporal: "since July 5" parsed deterministically → `window_from=2026-07-05`,
  `window_to=2026-07-12`, echo rendered in UI.
- Negative control (North Korean troops in Africa): honest decline, operator-confirmed.
- Smoke spend ≈ $0.121; session OpenAI total **$0.121 of the $1.50 cap**.

**New bug found → OPEN-TASKS #48:** the /ask form has no pending-disable; at ~10s
latency, second clicks fire duplicate paid runs (observed 2–3× billing on 2 of the
first 3 questions). Caps contain it; fix is a small client-side pending state.

## Incident: G2 executed without its gate (ratified)

The Phase-3 "dry-run" (`DATABASE_URL=<branch> npm run db:migrate`) applied 0014+0015
to **prod** at 01:00Z: `scripts/migrate.ts` resolves
`DATABASE_URL_UNPOOLED ?? DATABASE_URL`, and `.env.local`'s `DATABASE_URL_UNPOOLED`
(loaded by the script's own dotenv import) took precedence over the branch override.
Damage assessment: DDL was exactly the gated plan's (additive-only, both files, clean),
zero rows touched, deployed code pre-merge (no runtime references), snapshot branch
created before the write. Operator ratified as G2-done; the dry-run was then re-executed
correctly on the branch (both vars overridden) and matched prod's outcome.

**Standing trap for every future session: a branch-targeted run of ANY script that
imports `scripts/env.ts` must override BOTH `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.**

Independent adversarial drizzle review (read-only, post-merge): no blockers — journal
monotonic, snapshot chain intact, schema.ts matches 0014/0015 (a `drizzle-kit generate`
on this main mints no immediate diff). One WARN worth keeping: `migrate.ts` applies
statements non-transactionally and 0014-style DDL has no `IF NOT EXISTS`, so a mid-file
failure needs manual cleanup (`DROP TABLE IF EXISTS claim_embeddings; DROP INDEX IF
EXISTS claims_text_fts_idx;`) before a re-run.

## MERGE 2 handoff (run next; read this first)

- **Do NOT run `drizzle-kit generate` for any reason before MERGE 2 completes.**
- Prod migration head is now **0015**, snapshot id
  `af3e3af0-7331-4af8-9c45-40be65726334`. The design branch's migration must be
  deleted and **regenerated as 0016** from the merged schema: its snapshot `prevId`
  must equal that id and its journal `idx` must be 16.
- Neon snapshot branch **`premerge-20260712`** (`br-solitary-frost-at6wlzi1`) is the
  pre-migration data snapshot — **KEEP until MERGE 2 completes**, then delete. (Its
  schema now also carries 0014/0015 from the corrected dry-run; its data is the
  01:00Z pre-write state.)
- The design branch itself is untouched at `da7994a`; before its merge, remember its
  own pending items (migration 0014→0016 regen, `ADMIN_EMAILS`, per its
  implementation note).
- Vercel deploys are CLI-only (`npx vercel@latest deploy --prod --yes`); the project
  has no git integration — pushing main does not deploy.

## Parked / follow-ups

- OPEN-TASKS #48 (double-submit) — logged this session, not fixed (operator decision).
- The 10 new `ask.*` uk strings still need native review (flagged in dictionaries.ts).
- Watch for the first `sampled` disclosure firing as the corpus grows past the
  300-candidate cap; and `provider_usage.openai_ask`/`openai_embed` daily spend
  against `ASK_USD_CAP_DAILY=2`/`EMBED_USD_CAP_DAILY=1`.
