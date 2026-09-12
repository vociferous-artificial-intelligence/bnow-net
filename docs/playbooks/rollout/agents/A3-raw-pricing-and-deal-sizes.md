# A3 — Pricing & deal sizes (raw)

**Phase:** 2 Research — market set · **Owner:** AGENT · **Depends on:** competitor set ·
**Feeds:** A4, A9, A11, A16, O2 · **Budget:** web and public-records research; no paid data.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Find what competitors actually charge and what buyers actually pay, from public evidence,
so that packaging (O2) and the pricing page (A16) rest on numbers rather than on the phrase
"custom-quoted". RAW: facts and sources only.

## Inputs

- `<<COMPETITORS>>` and any pricing claims in `<<STRATEGY_DOCS>>` (treat as claims to test).

## Method

Search, in this order, and log every query:

1. **Vendor pricing pages** and any visible tiers, seat models, minimums, trial terms.
2. **Cloud marketplaces** (AWS/Azure/GCP Marketplace) — list SKUs are often public even when
   the website says "contact sales"; capture SKU name, unit, price, term, date.
3. **Government procurement**: USAspending (use the API when the site is a JS app), SAM.gov,
   UK Contracts Finder and G-Cloud/Digital Marketplace price bands, Canada Buyandsell / open
   contracts, EU TED, Australian AusTender. Record: buyer, vendor, value, period, description,
   sole-source justification text if present.
4. **Review sites and forums** (Capterra, G2, Reddit, LinkedIn posts) — tag `(c)`; useful for
   "we paid about…" anecdotes.
5. **Job postings and 10-K/annual reports** for ARPU, customer counts, renewal rates.
6. **Trade press** on contract wins.

Per vendor record a table: `| Evidence | Value | Unit (per seat/org/yr) | Buyer | Period |
Tag | Source | Date |`, then a **derived range** labelled INFERRED with the arithmetic shown
(e.g. marketplace SKU ÷ named users).

Also capture: whether a trial exists and on what terms; contract length norms; whether pricing
is visible in the nav at all; any published price transparency by *anyone* in the category.

## Output — `<<OUT>>/2-research/A3-raw-pricing-<<DATE>>.md`

COMMON header (Status: RAW). Sections: Summary table across vendors (CONFIRMED figures only) ·
Per-vendor evidence tables · Derived ranges (INFERRED, arithmetic shown) · Trial and contract
norms · Corrections to baseline · Not found (with queries) · Query log · Sources.
End with: *No strategic synthesis or recommendations in this file.*

## Done when

Every vendor has at least one CONFIRMED figure or an explicit "not found after n queries";
every derived number shows its arithmetic; time-limited contracts carry end dates.

## Do not

- Do not request quotes or trials under a false identity.
- Do not average CONFIRMED and INFERRED figures together.
