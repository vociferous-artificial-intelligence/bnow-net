# Next-session prompt (handoff insurance, written 2026-07-06)

Paste this into a fresh Claude Code session in /home/go/code/bnow.net if context was
cleared mid-build. Read AGENTS.md first — it is the canonical state.

---

You are continuing the BNOW.NET build. Read `AGENTS.md`, `docs/RUSSIA-DATA-ROADMAP.md`,
and `docs/PROGRESS.md` (tail) before writing code. Live app: https://bnow-net.vercel.app.
Deploys: `npx vercel@latest deploy --prod --yes` (machine CLI session; env VERCEL_TOKEN
is expired — unset it for CLI calls). LLM + several external hosts are TCP-blocked from
this WSL2 box: anything needing OpenAI/blocked-host egress runs through Vercel routes
(CRON_SECRET-gated, see .env.local).

## Current mission: roadmap §5 items 1–3

1. **OpenSanctions → entity graph** (S): enrich `entities` rows with sanction status.
   Pattern: keyed adapter (OPENSANCTIONS_API_KEY) + deterministic fixture stub, like
   src/lib/adapters/stubs.ts. Store under entities.meta.opensanctions
   {id, sanctioned, datasets, checkedAt}; badge on /entities pages. Licensing: bulk
   data is non-commercial; commercial API needs a paid key — document in BLOCKERS.
2. **zakupki.gov.ru procurement watcher** (M, highest value): keyword tender watch
   (фортификац|БПЛА|беспилотн|протез|ритуальн|захоронен|РЭБ|маскировочн...). Tenders
   land as raw_documents (adapter='procurement', country ru) with meta {price,
   customer, region} so they flow into existing digests; plus admin listing. CHECK
   REACHABILITY FIRST from both local and Vercel (use /api/cron/probe if it exists,
   else build it: secret-gated GET ?url= returning status/first-bytes).
3. **Data-dark tracker** (S): watched-series table (migration additive!) — config of
   key RU statistical publications (Rosstat demography, MinFin budget exec, CBR, EMISS
   series), cron checks latest-published-period per page, status ok/stale/gone,
   history jsonb; change events surface on an admin page. The classification of a
   series is itself intel (see roadmap §1 sources).

## Ground rules (unchanged)
- Traceability invariant: claims need ≥1 raw_document link (DB trigger enforces).
- No ISW/source prose in user-facing output. ≥2s/host scrape spacing, disk cache.
- Small tested commits (`npm test` green before deploy), append to docs/PROGRESS.md,
  decision log in AGENTS.md, blockers in docs/BLOCKERS.md.
- Postmark is the live email provider. Auth gate is ON (FEATURE_AUTH_GATE).
- Elite-politics track + entity graph exist (src/lib/analysis/tracks.ts, entities/
  claim_entities tables) — the three builds above all feed that graph or its context.
