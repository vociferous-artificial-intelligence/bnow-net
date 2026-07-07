# Task 1 review — Truth-in-UI: stub data must never render as fact (2026-07-06)

## The defect

A provenance-branded product was rendering fixture data as fact on three surfaces:

1. **Fabricated sanctions badges.** With no OPENSANCTIONS_API_KEY, the enrich cron
   persisted fixture matches (`NK-stub-*`) into `entities.meta.opensanctions`; /entities
   and /entities/[id] rendered red "SANCTIONED" badges from them, and /ask fed
   "SANCTIONED" into LLM evidence. Fabricated sanctions assertions about real people.
2. **Fabricated ownership edges.** 5 `entity_links` rows with `source='stub'` (Rotenberg,
   Gazprom seeds) rendered as real connections.
3. **Stub adapter docs in the corpus.** telegram_mtproto/x/acled stubs inserted 4
   `[STUB FIXTURE]` docs into raw_documents; **2 claims in digest 31 (ua military
   2026-07-03) cited them as their only source** — fixture content laundered into a
   user-facing digest.

## Fixes (defense in depth: data layer, then query layer, then render layer)

- **Never persist:** `matchEntity` stub answers now carry `stub: true`;
  `sanitizeForPersist()` strips every fabricated field before the enrich run writes
  (a stub check persists only as `{matched:false, stub:true, checkedAt}` — resumable,
  upgradeable by `?refresh=1`, asserting nothing). `persistableLinks()` drops
  `source='stub'` edges before the ownership pass writes. Stub adapters are no longer
  wired into production ingest at all (`buildIngestAdapters`).
- **Never select:** digest corpus query excludes `content LIKE '[STUB FIXTURE]%'`
  (marker-based, so the exclusion survives the day the real telegram_mtproto/x/acled
  adapters reuse those names). /entities, /ask retrieval SQL null out stub-flagged or
  `NK-stub` sanctions fields.
- **Never render:** entity pages hide the OpenSanctions block for stub-derived records
  and filter stub edges (belt-and-braces for any environment with stale data).
  Chose HIDE over demo-chip per the task's preference.
- **Data remediation** (scripts/cleanup-stub-data.ts, run 2026-07-07 03:20 UTC, one
  transaction): 2 fabricated-source claims deleted, 4 stub raw_documents deleted,
  2 claim-less events deleted, 148 entities' stub opensanctions meta stripped,
  5 stub entity_links deleted. Digest 31 regenerated after deploy.

## Tests (112 total, all green)

- `enrich/integrity.test.ts`: stub answers are flagged; sanitizeForPersist strips all
  fabricated fields (and passes live results untouched); persistableLinks drops stub edges.
- `adapters/stub-isolation.test.ts`: every stub fixture doc carries the
  `[STUB FIXTURE]` marker; production ingest wires no stub adapters; the digest corpus
  query carries the marker exclusion. End-to-end DB proof lands with Task 3's
  integration suite (seeded stub doc must not surface in a generated digest).

## Verification

- Full gate green: 112 tests, typecheck, lint, build.
- Post-deploy: digest 31 regenerated without stub sources; enrich re-run produces only
  sanitized records; /entities renders no sanctions badges until a real key exists.

## Debt / follow-ups

- When real OPENSANCTIONS/Companies House keys land, run `/api/cron/enrich?refresh=1`
  (documented in SETUP-NEXT-WEEK) — the stripped meta makes this a clean first run.
- Integration test proving the corpus exclusion against a real DB → Task 3.
