# A7 — Mission 3: Visual design, branding & sophistication (raw)

**Phase:** 2 Research — design set · **Owner:** AGENT · **Depends on:** A8 (mandatory —
never do this from text alone) · **Feeds:** A9, A10, A12, A14 · **Budget:** browser; no paid
calls.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Describe each competitor's visual language precisely enough that A12 can choose a distinct
identity on purpose: palette, type, layout, imagery, motifs, motion, and the overall
sophistication read. RAW, and **two-pass**: metadata first, then verified against the
screenshots, with corrections logged.

## Inputs

- A8 screenshots (desktop + mobile, homepage + product page) and manifest.
- Live browser with dev tools: CSS custom properties, `meta theme-color`, font-face
  declarations, computed styles on hero elements.

## Method

**Pass 1 — extract.** Per vendor from page source/CSS: background and text hex values,
accent(s), CSS variables, font families (display / body / mono), logo file, favicon,
theme-color. Tag each `(a) OFFICIAL` (from CSS) — this is *metadata*, not the visual.

**Pass 2 — look.** Open the screenshots and correct Pass 1 where the rendered page differs
(dark-mode assumption from text cues is the classic error). For each vendor record:

1. **Palette** — dominant, secondary, accent(s), with hex, and the *mode* (light-first,
   dark-first, both). Note where the accent is spent (CTAs only? links? data?).
2. **Typography** — display face and classification (grotesk, humanist, geometric, serif,
   slab, mono), weight and case in headlines, body face, mono usage, sizes on the hero.
3. **Layout and density** — grid, hero structure (text-left/visual-right etc.), whitespace,
   card use, whether data is shown as real UI or as illustration.
4. **Imagery and motifs** — photography (people/uniforms/stock), 3D globes, network graphs,
   maps, terminals/HUD, gradients, corner brackets, glows. List them; they are the category's
   clichés.
5. **Motion** — hero animation, scroll effects, video.
6. **Sophistication read** — one paragraph: what era/convention it belongs to, brand
   consistency (e.g. two CTA blues), evident design investment, and whether the visual
   matches the pitch recorded in A6.
7. **Mobile** — does the identity survive at phone width; what is dropped.

Then a **cross-vendor table**: vendor · mode · primary accent · display type class · hero
device · motif list · sophistication (1–5).

And a **category pattern count** (observational): how many use dark mode, green accents,
globes, monospace, serif display, uniform photography, etc. Get the arithmetic right and cite
the vendors.

## Output — `<<OUT>>/2-research/A7-raw-visual-branding-<<DATE>>.md`

COMMON header (Status: RAW; state which vendors have Pass 2 done). Per-vendor 1–7 with
screenshot filenames · Cross-vendor table · Pattern counts · **Pass 1 → Pass 2 corrections
log** (never delete Pass 1 text; annotate it) · Sources.
End with: *No strategic synthesis or recommendations in this file.*

## Done when

Every vendor has hex values verified against a screenshot, a type classification, motif
list, mobile note, and a Pass 2 stamp; the pattern counts cite vendors by name.

## Do not

- Do not describe a page you have not seen rendered; mark it "Pass 1 only".
- Do not evaluate our own site (A9/A14 do that).
