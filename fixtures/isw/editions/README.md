# Per-shape edition fixtures (WS-3.2 discovery)

These five files are **synthetic**, not scraped pages. They exist so
`src/lib/isw/edition-discovery.test.ts` can exercise every branch of the probe
loop offline, with no network and no provider prose in the repository:

| File | What it stands for |
|---|---|
| `iran-morning-2026-08-12.html` | a morning Iran Update edition (2 units, cutoff + datePublished present) |
| `iran-evening-2026-08-12.html` | the same day's evening edition (3 units, later anchors) — the two-a-day case production's `break` never records |
| `iran-plain-2026-05-02.html` | the historical plain shape, heading-based takeaway block, **no** cutoff declaration |
| `oversize-not-a-report.html` | a 200 over the 10 KB threshold with no Key Takeaways block → an edition row with `parse_status = 'failed'` |
| `undersized-200.html` | a 200 UNDER the threshold (soft 404) → never an edition |

The two real scraped pages used elsewhere in the suite stay where they are:
`fixtures/isw/roca-2026-06-30.html` and `fixtures/isw/iran-update-2026-07-24.html`.
