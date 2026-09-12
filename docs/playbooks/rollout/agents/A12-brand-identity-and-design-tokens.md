# A12 — Brand identity & design tokens

**Phase:** 4 Identity · **Owner:** AGENT → OPERATOR (O4 signs off) · **Depends on:** O2
(position decided, name decided), O3 (winning variant), A10 §6 identity brief, A7 ·
**Feeds:** O4, A14, A15 · **Budget:** read-only plus font licensing check; no purchases
without operator approval.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Turn the decided position into a concrete, implementable identity: name rationale, type
pair, palette, spacing/radius/elevation scale, voice sheet, logo/wordmark direction — as
two or three directions the operator can choose between, each already checked for
contrast, licensing, script coverage and distinctness from the category.

## Inputs

- `O2` decision memo (name, category term, position line), `O3` (winning variant and the
  words buyers understood), `A10` §5–6 (voice, identity brief), `A7` (what the category
  looks like — to avoid), `A1` verbatims (register), the repo's current CSS/tokens, locales
  served (script coverage), and the product's data surfaces (what the identity has to work
  *on*: tables, citations, timestamps, confidence bands).

## Method

1. **Name rationale** — one page: what the name is, how it is pronounced and written
   (case, domain), what it should evoke, how it is used with the category term, and the
   rules for the wordmark. If O2 changed the name, include the transition plan.
2. **Directions (2–3).** Each direction = a name, a one-paragraph idea, and a board:
   type pair (display, body, mono if the product needs identifiers) with licence, cost, and
   subset coverage for every locale served; palette (background, surfaces, text ramp,
   accent, a second reserved colour for the signature device, semantic colours) as hex, with
   WCAG contrast ratios computed for every text/background pair and for UI components;
   spacing and radius scale; elevation; iconography source; imagery rules; motion rule; a
   rendered sample of the homepage hero and one dense data view in that direction (HTML/CSS
   is fine). State which A7 clichés it avoids and which it deliberately shares.
3. **Voice sheet** — one page: the principles from A10 §5, the register test, do/don't
   examples, formatting rules (numbers, dates, citations, capitalisation, locale variants).
4. **Tokens** — a single source of truth (CSS custom properties or a tokens JSON) for the
   recommended direction, mapped to the framework in use, with a migration note for
   replacing hard-coded utility colours; never colour-code truth or confidence unless the
   design principles explicitly allow it.
5. **Accessibility acceptance** — the contrast, focus, motion-reduction and reflow criteria
   A14 and O7 will check.
6. **Recommendation** — which direction and why, in one paragraph, and what to commission
   (logo, illustration) if anything.

## Output — `<<OUT>>/4-identity/A12-identity-<<DATE>>.md` + `4-identity/boards/<direction>.html`
+ `4-identity/tokens.<css|json>`

COMMON header (Status: SYNTHESIS). Sections 1–6 · Sources.

## Done when

Every direction has contrast ratios computed and passing, licences and script coverage
confirmed, and a rendered sample; tokens exist for the recommended direction; the name
rationale exists even if the name is unchanged.

## Do not

- Do not reproduce any existing brand's logo, mark or signature layout.
- Do not choose the direction; O4 does.
- Do not ship tokens into the product before O4.
