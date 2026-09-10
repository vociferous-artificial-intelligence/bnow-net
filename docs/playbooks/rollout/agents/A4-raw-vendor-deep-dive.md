# A4 — Vendor deep-dive (raw; one file per priority competitor)

**Phase:** 2 Research — market set · **Owner:** AGENT · **Depends on:** A2, A3 · **Feeds:**
A9, A11 · **Budget:** web and public-records research; no paid data. Run once per vendor the
operator names as a priority (usually 2–4).

(Prepend `COMMON.md`. Fill placeholders; set `<<VENDOR>>`.)

## Objective

Understand one competitor deeply enough to know what they would say against us and what they
cannot say: product lines, data model, delivery modes, API, sales motion, partnerships, and
verifiable weaknesses. RAW.

## Inputs

- `A2` card and `A3` table for `<<VENDOR>>`; the A5–A8 entries for them if already done.

## Method

1. **Product inventory**: every product/module name, what it does (vendor's words, verbatim,
   sourced), who it is for, delivery (web app, API, feed, PDF, analyst call).
2. **Data and method**: sources they claim, collection method, human-vs-automated split,
   verification claims, named standards (ICD 203/206, Admiralty, etc.), any published
   accuracy/coverage metrics. Note what is *claimed* vs *shown*.
3. **Technical surface**: API docs, SDKs, endpoints, model cards, integrations
   (GitHub, docs sites, marketplace listings, partner pages).
4. **Sales motion**: CTA path, trial/demo, sales headcount signals, channel partners,
   procurement vehicles (GSA, G-Cloud), reference customers by sector.
5. **Partnerships and platform dependencies** (cloud, data vendors, AI vendors) with dates
   and whether they were followed up in press after announcement.
6. **Weaknesses that are provable**: sole-source justifications that reveal gaps, review
   complaints (tagged `(c)`), sunset products, lapsed contracts, blocked robots.txt (note it),
   stale pages, contradictions between pages.
7. **Open questions** — the two or three things an operator could pressure-test in a
   conversation with a former customer.

If the vendor blocks fetching, say so at the top and source everything from procurement
records, partner docs, filings and press; label the whole file accordingly.

## Output — `<<OUT>>/2-research/A4-raw-<<VENDOR>>-<<DATE>>.md`

COMMON header (Status: RAW). Sections 1–7 · Could not verify · Productive and empty query
logs · Sources. End with: *No strategic synthesis or recommendations in this file.*

## Done when

Every product line has a sourced description; the human/automated split is stated with
evidence or marked unknown; the "could not verify" list exists; the file names the single
highest-value item for an operator to pressure-test.

## Do not

- Do not attribute intentions to the vendor; record what is on the record.
- Do not repeat A2/A3 content; link to it.
