# New-Country Playbook (brief §8.4)

Repeatable process to bring a theater from `scaffolded` to `active`. Time estimate:
1–2 days/theater once the reference-analysis source (step 2) is identified. The Gulf
set (IL/IR/SA/AE/QA/OM/BH/KW) is already seeded in `countries` as `scaffolded`.

## 1. Config seed (already done for Gulf)
Row in `countries` with iso2/slug/status. All later steps hang config off
`countries.config` JSON: `{ feeds: RssFeedConfig[], telegramChannels: [...], queries: {...} }`.

## 2. Pick the validation reference ("the ISW of X")
The scoreboard needs an expert daily/near-daily assessment to score against.
Candidates by theater:
- **Israel/Iran:** ISW's own Iran Update (understandingwar.org publishes daily) — the
  existing crawler + parser work with a different URL filter (`iran-update`).
  Critical Threats Project (criticalthreats.org) mirrors.
- **Gulf shipping/Hormuz:** UKMTO advisories + Ambrey incident reports (structured,
  short — parser is simpler than ISW's).
If no single reference exists, validation runs against a basket (schema supports
multiple isw_reports-like rows; generalize table name later — debt note).

## 3. Registry seed
Run the Phase-0 pipeline against the reference archive:
`isw-fetch` (new URL list) → `isw-parse` (check endnote format — Iran Updates use the
same WP layout) → `isw-load` → `registry-materialize`. Citation mining gives the
theater's source universe + reliability priors exactly as it did for RU/UA.

## 4. Feed roster
- From the new registry: top domains → RSS probe (curl each /feed, /rss, /rss.xml).
- Top Telegram channels → verify t.me/s/ previews are enabled.
- Add `RssFeedConfig` entries + telegram channel list to `countries.config`.
- Expect regional quirks: RU-state-style TCP blocks (use TG mirrors), Arabic/Farsi/
  Hebrew lang detection (extend `detectLang` — currently cyrillic-only heuristics).

## 5. Matching gazetteer
Extend `validation/keywords.ts` with the theater's toponyms (multi-script variants)
and any theater-specific action classes (e.g. `maritime_incident`, `nuclear_program`).
This is the main per-theater analyst work — budget ~50 toponyms to start.

## 6. Digest prompt pack
The `AnalysisProvider` system prompt is theater-agnostic except the hedging examples;
add a short theater context block to `countries.config.queries.digestContext`.

## 7. Flip + backtest
- `UPDATE countries SET status='active' WHERE iso2='xx';`
- Telegram/RSS backfill (`telegram-backfill.ts` generalizes; RSS is shallow) →
  `backtest.ts` over available window → scoreboard populates → review divergences.

## 8. Launch checklist
- /countries card flips to live automatically (status-driven).
- Cron coverage: ingest/digest/validate crons are country-loop driven — add iso2 to
  the loops in the three cron routes (currently hardcoded `['ru','ua']` — make this
  read active countries from DB when activating theater #3).
