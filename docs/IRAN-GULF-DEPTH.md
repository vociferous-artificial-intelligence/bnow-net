# Iran & Gulf — Depth Roadmap

How to bring Iran + the Gulf set (SA/AE/QA/OM/BH/KW + IL) to Russia-level depth.
Reachability tested from our Vercel infra 2026-07-06 (✓ = 200). Companion to
NEW-COUNTRY-PLAYBOOK.md and COMPETITIVE-AND-DEMAND.md.

## Where we are
Active theaters: ir, sa, ae, qa, om (+ ru/ua). Public-news feeds only; no track
structure beyond `military`; no validation reference; no maritime layer. Competitors
here are strong: Intel Desk runs ~199 sources for Iran alone; Kpler owns Hormuz vessel
data. Our differentiators (reliability ratings, traceability, validation) still apply.

## 1. Source layers to add (public-first, per playbook)

### Verified reachable now (add to RSS_FEEDS)
- **Middle East Eye** (`middleeasteye.net/rss`) ✓ — regional, strong Gulf/Iran.
- **Al-Monitor** (`al-monitor.com/rss`) ✓ — analyst-grade Middle East.
- **Press TV** (`presstv.ir/rss.xml`) ✓ — Iranian STATE media (the RU-state analogue;
  ingest as state_media, low reliability, for regime-narrative tracking).
- Already live: Times of Israel, Iran International, IranWire, Arab News, The National,
  Al Jazeera, Doha News, Times of Oman.

### Telegram (verified reachable, add to curated)
- **OSINTdefender** (213 posts) ✓, **warmonitors** (210) ✓, **AuroraIntel** (205) ✓ —
  Middle East conflict-OSINT aggregators; the Iran/Gulf analogue to our RU mil-bloggers.
- Iranian state / IRGC channels (IRIran, Tasnim, IRGC) returned 0 (previews off / handle
  drift) — need correct handles or MTProto; queue as blocked.

### Blocked / needs work
- RFE/RL Radio Farda API returns empty (same as RU regional services) → use TG mirror.
- jpost, mehrnews unreachable from infra → alternates or proxy.
- Persian/Arabic state outlets often bot-wall → MTProto or residential proxy.

## 2. Language layer
Extend `detectLang` for **Persian (fa)** and **Arabic (ar)** — Arabic script block
\\u0600–\\u06FF, Persian-specific chars (پ چ ژ گ ک ی). Same pattern as the tt/ba/cv/ce
addition. The LLM already reads both; tagging is for routing/display.

## 3. Track structure (mirror the Russia model)
- **military** (live): kinetic events, strikes, IRGC/proxy activity, Hormuz incidents.
- **nuclear** (new track): enrichment status, IAEA reporting, facility activity, sabotage
  — dedicated prompt + lexicon (enrichment, centrifuge, IAEA, Fordow, Natanz, breakout).
  High value for nation-state + energy buyers.
- **elite_politics** (new, config): Iran = clerical/IRGC/bonyad factions, succession
  (Khamenei), Majlis; Gulf = royal-succession, intra-GCC rivalry. Same entities/graph
  machinery as Russia's Kremlinology track.
- **energy/Hormuz** (overlaps mirror-trade + maritime): tanker traffic, oil-flow, blockade
  risk. This is where Kpler dominates — differentiate on political-context fusion, not
  raw AIS (until we buy AIS).

## 4. Validation reference (the ISW analogue)
Russia has ISW. For Iran/Gulf, candidates for a daily/near-daily expert benchmark:
- **ISW's own Iran Update** (understandingwar.org, near-daily) — SAME crawler/parser,
  different URL filter (`iran-update`). Fastest path to a validated Iran scoreboard.
- Critical Threats Project (criticalthreats.org) — ISW's Iran partner, mirrors.
- For Gulf-maritime: UKMTO advisories + Ambrey (structured, simpler parse).
Wiring ISW Iran Update into the existing validation harness is the single highest-
leverage Iran build — it gives Iran the same "validated daily" credibility as RU/UA.

## 5. Maritime / Hormuz (the competitive frontier)
Kpler/Windward own this. Options, cheapest first:
- ADS-B + AIS community feeds (aisstream.io free tier, some coverage) for Hormuz choke-point.
- Equasis (free) for vessel ownership/flag → cross-ref shadow-fleet + sanctions entities.
- Paid AIS (Windward/MarineTraffic/Kpler wholesale) only if a maritime-heavy buyer signs.
Our angle: fuse vessel events with the political/sanctions layer (shadow-fleet vessel →
sanctioned owner via OpenSanctions → Iranian/Omani route context) — a fusion Kpler's
maritime-only product doesn't do.

## 6. Build order
1. Add reachable feeds + TG (S) — MEE, Al-Monitor, Press TV, OSINTdefender/warmonitors/
   AuroraIntel; activate no new country, deepens existing.
2. Persian/Arabic detectLang (S).
3. **ISW Iran Update → validation harness** (M) — gives Iran a validated scoreboard.
4. Nuclear track (S–M) — prompt + lexicon, high nation-state value.
5. Elite-politics for Iran/Gulf (S) — reuse entity graph.
6. Hormuz maritime fusion (L, paid) — evaluate on buyer demand.

Prompt files for these live in docs/prompts/.
