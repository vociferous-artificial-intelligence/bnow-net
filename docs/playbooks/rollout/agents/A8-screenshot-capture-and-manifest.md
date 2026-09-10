# A8 — Mission 4: Screenshot capture & manifest

**Phase:** 2 Research — design set · **Owner:** AGENT · **Depends on:** competitor set ·
**Feeds:** A5, A6, A7, A9, A14 · **Budget:** browser only. Run this **first** in the design
set; the other three missions cite these files.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Produce a dated, reproducible visual record of every competitor's public surface so the other
missions describe what was actually rendered, and so the set can be re-captured later to
detect redesigns.

## Inputs

- `<<COMPETITORS>>`. Per vendor, the pages: homepage; the primary product page (the first
  product link in the nav); the pricing page if one exists; the primary CTA destination
  (demo/trial form). Add an "about/methodology" page when A6 needs it.

## Method

1. Use a real browser (extension, Playwright with the bundled browser, or the built-in
   browser). Dismiss cookie banners and announcement bars before capture; if one cannot be
   dismissed, capture with it and say so.
2. Capture each page at **desktop 1440×900** (above the fold) **and full-page**, and at
   **mobile 390×844** (above the fold and full-page). Record the exact viewport used if it
   differs.
3. Also save the logo asset (SVG/PNG) and favicon when accessible from page source.
4. File names: `<vendor>-<page>-<width>-<fold|full>-<<DATE>>.jpg` under
   `<<OUT>>/2-research/screenshots/`. Keep JPEG quality ~80; total per vendor ≲ 2 MB.
5. Note anything that changed mid-session (A/B variants, geo-redirects, language switches).
6. Where a page is blocked (robots.txt only affects fetchers, not a browser; a login wall or
   a geo-block does), record the block and capture whatever public state exists.

## Output — `<<OUT>>/2-research/A8-manifest-<<DATE>>.md`

COMMON header (Status: RAW), then a table: `| Vendor | Page | URL | Viewport | File |
Captured (ISO time) | Notes (banner, variant, block) |`, then a list of logo/favicon assets
saved, then a "not captured" list with reasons.

## Done when

Every vendor has at least homepage + product page at both widths, fold and full; every file
in the folder appears in the manifest and vice versa; the manifest carries capture times.

## Do not

- Do not crop, annotate or edit captures; annotations go in the mission files.
- Do not capture behind a login you obtained by misrepresentation.
