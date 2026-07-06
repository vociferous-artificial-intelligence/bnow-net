# Implementation prompt files

Self-contained build prompts derived from the strategy docs. Each can be pasted into a
fresh Claude Code session in /home/go/code/bnow.net. All assume you read AGENTS.md first.

Priority order (value × buildability, from COMPETITIVE-AND-DEMAND.md §4 + IRAN-GULF-DEPTH §6):

1. **BUILD-mirror-trade.md** — sanctions-evasion watch via UN Comtrade. Unique, data
   source confirmed reachable, serves commodity + compliance. Pairs with data-dark.
2. **BUILD-buyer-profiles.md** — one feed → three products via config re-weighting.
   Cheap, high perceived value, ties to pricing tiers.
3. **BUILD-iran-gulf-depth.md** — sources + fa/ar + ISW Iran Update scoreboard + nuclear
   track. Ship A–E as separate commits.
4. **BUILD-analyst-layer.md** — sourced assessments, trend/anomaly, scenario flags.
5. **BUILD-ownership-graph.md** — corporate ownership onto entities; narrows Kharon gap.

Parent strategy docs:
- docs/COMPETITIVE-AND-DEMAND.md — vendor landscape, buyer demand, mirror-trade, gaps/edge.
- docs/IRAN-GULF-DEPTH.md — Iran/Gulf expansion with reachability results.
- docs/RUSSIA-DATA-ROADMAP.md — Russia data classes (§5.4-6 Kremlinology builds still open).
