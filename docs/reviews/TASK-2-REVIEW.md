# Task 2 review — CI, /ask spend control, entity canonicalization (2026-07-06)

## 2.1 CI

- Repo HAS a GitHub remote (github.com/vociferous-artificial-intelligence/bnow-net) but
  it is **unreachable from this box** (SSH egress blocked; 81+ commits unpushed). Shipped
  both layers:
  - `.github/workflows/ci.yml` — typecheck + lint + test on push/PR; activates the
    moment Gregory pushes from a network that can reach GitHub.
  - `.githooks/pre-push` — the same gate locally; enabled here via
    `git config core.hooksPath .githooks` (documented in AGENTS.md; one-time per clone).

## 2.2 /ask rate limit + spend cap

- New `ask_usage` table (migration 0006): one row per question with user email,
  provider, token counts, estimated cost — rate limiting now, billing data later.
- `askWithLimits()` wraps every entry point (/ask page and POST /api/ask):
  - per-user cap: `ASK_USER_DAILY_LIMIT` (default 20/day, UTC),
  - global spend cap: `ASK_GLOBAL_DAILY_BUDGET_USD` (default $1/day — ~2,500
    gpt-4o-mini questions, a runaway-protection ceiling not a UX constraint),
  - friendly "limit reached" message (429 on the API).
- Cost estimated from actual completion token usage at list price
  ($0.15/$0.60 per Mtok for gpt-4o-mini); unknown models get a conservative
  over-estimate. 6 unit tests on the pure decision/pricing logic.

## 2.3 Entity canonicalization — graph went 293 → 85 entities

- **(a) Rules pass** (`src/lib/entities/canonicalize.ts` + `scripts/entities-cleanup.ts`,
  dry-run first, then one transaction):
  - 110 drops: geography-as-actor (Moscow, Kramatorsk, "Iran"×2…), collectives
    ("Five individuals", "Russian courts", "Ukrainian Civilians"), unnamed persons
    ("Unnamed Schoolboy", "Ex-Central Bank employee"), objects (Su-27, S-400, Ebola,
    "Super Typhoon Bavi").
  - 41 merges with claim/link repointing + alias preservation: 5-way Khamenei cluster,
    3 Zelensky spellings, Houthi variants, RU/UA armed-forces variants, cross-kind
    duplicates (Hamas org+faction), transliteration folds (Nerad'ko/Neradko,
    Sergey/Sergei, mixed-script Muцolgov), surname→full-name (Trump, Macron).
    Merges are path-compressed so apply order can't corrupt chains; canonical
    selection prefers most-cited, then clean-ASCII names.
  - 53 orphan deletions (zero claims + zero links; recreated on demand by digest
    get-or-create, so always safe).
- **(b) LLM-assisted pass**: new CRON-gated `/api/cron/entity-audit` route — PROPOSES
  deletes/merges as JSON, never applies. Ran against the 89 survivors; 6 proposals.
  Human review (this session): accepted 4 (Serbian Unifil, Sudan, Novodmytrivka,
  Cristiano Ronaldo), **rejected 2** (Elon Musk — Starlink is conflict-relevant;
  Karelia Government — specific regional government is a legit institutional actor),
  added 1 the LLM missed (garbled "Mucohlgov" → Mutsolgov, applied as rename since the
  clean-spelling row had been orphan-swept). Reviewed file:
  `docs/reviews/ENTITY-AUDIT-2026-07-06.jsonl`, applied via
  `entities-cleanup.ts --file`.
- **(c) Re-enrichment**: `/api/cron/enrich?refresh=1` re-ran sanctions + ownership over
  the clean 85-entity graph (stub mode → sanitized records only; flips to real data
  when keys land).
- **(d) Extraction prompts**: shared `ENTITY_RULES` block added to all three prompts
  (military default, elite-politics, nuclear): only named specific actors, no
  collectives/geography/objects, one canonical English transliteration without
  honorifics, no entity at all when the actor can't be named.

## Gate

132 tests green (14 new canonicalization, 6 new rate-limit), typecheck, lint, build.
Deployed; entity-audit + enrich verified live in production.

## Debt / notes

- The per-user limit counts questions (including stub-mode answers), the budget counts
  LLM dollars — intentional: the question cap is a product decision, the budget is
  runaway protection.
- ALIAS_GROUPS / GEOGRAPHY lists are curated and test-covered; extend them as new
  theaters activate (they also gained Sudan/Novodmytrivka from the LLM audit).
- Entity-audit route can run periodically once entity churn resumes; keep it
  propose-only.
