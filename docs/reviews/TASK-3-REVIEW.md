# Task 3 review — integration tests + validation quality (2026-07-06/07)

## 3.1 Integration tests (previously zero DB-path coverage)

Infra: disposable **Neon branches** (`scripts/neon-branch.ts` + `test-integration.sh`) —
each run forks production copy-on-write, runs `src/**/*.itest.ts` serially against the
fork, then deletes it (trap-guaranteed). `npm run test:integration`; CI has a job that
skips cleanly when Neon secrets are absent.

Six tests, all passing against real Postgres:
- traceability trigger **rejects** an orphan claim at COMMIT; **accepts** claim+source in
  one transaction;
- `generateDigest` end-to-end (stub provider, seeded corpus): digest persisted, every
  claim ≥1 source, seeded `[STUB FIXTURE]` doc **never cited** (closes the Task-1 debt),
  regeneration idempotent (same digestId, no claim duplication);
- `/ask` retrieval orders same-day claims by confidence;
- `scoreDigest` end-to-end on the saved ISW fixture (parse → takeaways → score).

## 3.2 Per-theater takeaway filtering (RU/UA) — honest before/after

Shipped: `classifyTakeawayTheater` (gazetteer toponym → ru/ua/both), validation scores
each theater only against own-side + both takeaways; filtered sets re-indexed to keep
LLM-matcher positions aligned; full extraction still persisted; filter counts recorded
in `details`.

**Measured effect is small.** The filter removes on average 0.6 (ru) / 0.4 (ua) of ~6.8
takeaways per report — most ROCA takeaways are either non-territorial (→ both) or
frontline (→ ua), so the structural deflation hypothesis was only marginally true.
Same-dates coverage (Jun 22–Jul 5): ru 14.6% → 11.7%, ua 16.3% → 14.2% — within
matcher noise, NOT a regression from the filter itself: re-validating **unchanged**
digests swings individual days ±30pts (e.g. ru Jun 23 18.2→0, ua Jun 27 40→40, ru
Jul 3 50→57.1) because gpt-4o-mini is nondeterministic even at temperature 0.

**Real finding:** run-to-run LLM-matcher variance dominates coverage movement at this
sample size. Recommended next step (logged in OPEN-TASKS): majority-vote matching
(3 calls) or match-result caching keyed on (takeaway set, claim set) for reproducible
scoreboards. Coverage's binding constraint remains corpus/matching depth, not scoring
mechanics.

## 3.3 Iran military digest quality — 0 → scoring

Shipped: `TrackConfig.lexiconByCountry/systemPromptByCountry`; Iran military now runs a
theater prompt (proxy attacks, IRGC/Artesh/Quds posture, CENTCOM, Hormuz/Red Sea
shipping, air defense, sabotage; "quiet days are normal — return 0-2 events rather than
inflating") plus an Iran relevance lexicon replacing the RU toponym prefilter (which
matched nothing Iranian). Stub provider skips its RU gazetteer when a theater prompt is
set.

Regenerated Jul 1–7: every day now yields 1–3 events (previously 0 on quiet days), with
the lexicon reducing noise (4–9 relevant docs analyzed on quiet days). Revalidation vs
the ISW Iran Update: **Jul 3 33.3% / Jul 4 25%** (both were 0), Jul 5–6 still 0 —
scoreboard no longer flatlined; info-lead +10.3h/+5.5h on the scoring days.

## 3.4 Reliability weighting audit

- **Digest event ranking: already wired.** claims.confidence = mean reliability_score of
  supporting docs (set in the digest transaction); `scoreEvent` multiplies by a
  0.5–1.5 confidence band; the stub provider additionally ranks clusters by source
  reliability; the corpus query orders by reliability. Added an explicit regression
  test (low-confidence event ranks below an otherwise-equal high-confidence one).
- **/ask retrieval: was NOT wired** — ordered by recency only, so a Press-TV-sourced
  claim could lead the evidence set. Now orders by claim_date, then confidence;
  integration test proves the ordering against a real DB.

## 3.5 ME source materialization — 0 zombies

`source_theater_stats` (migration 0007): per-theater citation/hedging/reliability
aggregates (ru = ROCA, ir = Iran Update); global `sources` columns now aggregate across
ALL theaters. Materialized: 10,583 theater rows (6,985 ru / 3,598 ir — 619 sources
appear in both corpora; ME avg reliability 0.489 vs RU 0.570).
**Cited-but-zero-count sources: 1,574 → 0.** Registry detail pages show a per-corpus
breakdown table.

## Gate

136 unit + 6 integration tests green; typecheck/lint/build green; deployed; backtest
re-run and Iran revalidation executed against production.
