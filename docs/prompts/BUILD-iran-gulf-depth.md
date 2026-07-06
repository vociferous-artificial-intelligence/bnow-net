# BUILD: Iran & Gulf depth

Paste into a fresh Claude Code session in /home/go/code/bnow.net. Read AGENTS.md and
docs/IRAN-GULF-DEPTH.md (has reachability results from 2026-07-06). Rationale: bring
Iran + Gulf to Russia-level depth; the highest-leverage single step is giving Iran a
validated scoreboard via ISW's Iran Update.

## Order (each independently shippable)

### A. Add reachable sources (S) — do first
Add to `src/lib/ingest/config.ts` RSS_FEEDS (all verified 200 from Vercel):
- Middle East Eye `https://www.middleeasteye.net/rss` (regional, il/ir/gulf — pick primary tag)
- Al-Monitor `https://www.al-monitor.com/rss`
- Press TV `https://www.presstv.ir/rss.xml` (IRAN STATE — platform state_media, ir)
Add to TELEGRAM_CURATED (verified reachable): OSINTdefender, warmonitors, AuroraIntel
(ME conflict-OSINT; tag ir or il by primary focus). Re-ingest, verify /admin/ingest.

### B. Persian/Arabic language tagging (S)
Extend `detectLang` (src/lib/analysis/lang.ts) with `fa` and `ar`: Arabic block
؀-ۿ; Persian-specific پ چ ژ گ ک ی distinguishes fa from ar. Add tests like the
tt/ba/cv/ce cases. LLM already reads both; this is routing/display only.

### C. ISW Iran Update → validation harness (M) — highest leverage
ISW publishes a near-daily "Iran Update" on understandingwar.org (same WP layout as ROCA).
- Extend the crawler/sitemap filter to capture `iran-update` URLs (src/lib/isw + scripts).
- The endnote parser + hedging classifier should work as-is; verify on a fixture.
- Point the validation harness at Iran digests vs the Iran Update (src/lib/validation/run.ts
  currently pins ISW ROCA + track='military'; generalize to a reference-doc lookup keyed
  by theater). Add an Iran slug-pattern for auto-discovery.
- Backtest Iran digests vs recent Iran Updates → Iran gets its own validated scoreboard.

### D. Nuclear track (S-M)
New track in src/lib/analysis/tracks.ts: `nuclear`, countries ['ir'], lexicon
(enrichment|centrifuge|IAEA|Fordow|Natanz|breakout|HEU|inspector|заглуш... incl. Farsi),
dedicated prompt (enrichment status, IAEA findings, facility activity, sabotage). Reuses
the whole digest/entity pipeline. High nation-state + energy-buyer value.

### E. Elite-politics for Iran/Gulf (S)
Extend elite_politics track countries to include ir (+gulf): Iran = clerical/IRGC/bonyad
factions, Khamenei succession, Majlis; Gulf = royal succession, intra-GCC. Same entity
graph. Mostly a prompt + lexicon + countries-list change.

### F. Hormuz maritime fusion (L, paid) — defer until a maritime buyer signs
aisstream.io (free tier) or Equasis (free, ownership) for choke-point vessels; fuse with
OpenSanctions (shadow-fleet vessel → sanctioned owner → route context). Differentiator vs
Kpler is the political/sanctions fusion, not raw AIS. Evaluate on demand.

## Definition of done (for A–E; F is future)
Sources added + re-ingested; fa/ar tagging + tests; ISW Iran Update parsed + Iran
scoreboard populated by backtest; nuclear track generating Iran digests; elite track
covering Iran; tests green; docs/PROGRESS + decision log + IRAN-GULF-DEPTH updated.
Ship A–E as separate commits/deploys, not one big bang.
