# A2 — Landscape & ownership (raw)

**Phase:** 2 Research — market set · **Owner:** AGENT · **Depends on:** competitor set
(`<<COMPETITORS>>`) · **Feeds:** A4, A9, A11 · **Budget:** web research only; no paid data.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Establish, for every competitor and adjacent vendor, who they are, who owns them, how they are
funded, and what corporate events are pending — so that every later reference to a competitor
is current and the positioning is not built against a company that no longer exists in that
form. This is RAW: facts with sources, no recommendations.

## Inputs

- `<<COMPETITORS>>` plus any vendor named in `<<STRATEGY_DOCS>>`. Add adjacent vendors you
  discover, in a separate "candidates" section, with a one-line reason.
- Existing landscape sections in `<<STRATEGY_DOCS>>` — treat as *claims to verify*, not facts.

## Method

For each vendor, in this order of preference: official newsroom / about / investor pages;
company registers (Companies House PSC, SEC filings, national equivalents); trade press;
Crunchbase/PitchBook-type aggregators (tag `(c)`); anything else `(d)`.

Record per vendor:

1. Legal entity, HQ, founding year, ownership (parent, PE/VC, public), last funding/M&A event
   with date, amount, source. Distinguish announced from closed.
2. Headcount band (LinkedIn range or filings), analyst headcount if disclosed.
3. Positioning line as they state it (verbatim, URL, date) and category term they use.
4. Product lines / brands, and which are being sunset or merged.
5. Pending or rumoured events (sale process, restructuring) — tag `(c)` or `(d)` and say so.
6. Any claim in `<<STRATEGY_DOCS>>` about this vendor that is wrong or stale, with the
   correction and the source. Put these in a "Corrections to baseline" section — this is the
   most valuable part of the file.

Keep a **query log** (every search string, what it returned), a **failed-fetch list**
(robots.txt blocks, paywalls) and a **false-positive list** (similarly named entities you
ruled out).

## Output — `<<OUT>>/2-research/A2-raw-landscape-<<DATE>>.md`

COMMON header (Status: RAW). Sections: per-vendor cards (1–5) · Corrections to baseline ·
Candidates for the set · Could not verify · Query log · Sources (numbered, URL, date fetched).
End with: *No strategic synthesis or recommendations in this file.*

## Done when

Every vendor in the set has a card with at least an `(a)` or `(b)` source for ownership;
every stale claim in the baseline has a dated correction; the file states which findings are
time-sensitive and when to re-check.

## Do not

- Do not present a summarising tool's paraphrase as a quote. Re-open the page for any quote.
- Do not rank or judge vendors here.
