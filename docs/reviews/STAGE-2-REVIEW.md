# Stage 2 Review — Ingestion framework

**Date:** 2026-07-04 · **Status: PASS**

## Exit criteria
| Criterion | Result | Pass |
|---|---|---|
| Live docs from ≥6 real feeds | 8 RSS feeds + 20+ telegram channels + stubs | ✅ |
| Deduped by content hash | unique index + ON CONFLICT; rerun inserts 0 | ✅ |
| /admin/ingest status page | live in prod | ✅ |
| Cron wiring | Vercel crons: */15 fast, hourly telegram (registered) | ✅ |

## Built
- `SourceAdapter` interface; RssAdapter (8 feeds), TelegramWebAdapter (t.me/s/ +
  ?before= history pagination), GdeltAdapter, fixture-backed stubs (mtproto/x/acled).
- Registry-driven channel selection: top-15 active telegram sources by ISW citation
  count merged with 10 curated (mod_russia, tass_agency, DeepStateUA…). The registry
  feeding ingestion is the intended flywheel and it works.
- Orchestrator with per-batch source-id resolution + hash dedupe.

## Deviations / notes
- TASS/RIA/Lenta RSS: unreachable from this host at TCP level → their content enters
  via their official telegram channels. Decision-logged.
- GDELT DOC API: worked, then 429'd, then connection-blocked this IP. Adapter stays
  wired and degrades gracefully; will recover on Vercel egress or after cooldown.
  (Vercel cron runs it every 15 min with clean egress — likely already flowing in prod.)
- Kyiv Independent dropped RSS; General Staff has no RSS (covered via GeneralStaffZSU
  telegram + armyinform.com.ua feed).

## Known debt
- telegram_web channels with previews disabled (dsszzi_official is partial) log
  warnings; MTProto adapter (stubbed) is the real fix once keys exist.
- GDELT fixture is a rate-limit body, not an artlist sample; test uses synthetic
  object instead. Refresh fixture when API is reachable.
