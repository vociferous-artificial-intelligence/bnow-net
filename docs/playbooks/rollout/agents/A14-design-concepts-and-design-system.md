# A14 — Design concepts & design system

**Phase:** 5 Surface · **Owner:** AGENT · **Depends on:** O4 (identity chosen), A12 (tokens),
A7, A13, the repo · **Feeds:** A15, O6, O7 · **Budget:** repo work on a branch; no deploy.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Assess the current design implementation, set the principles for presenting the product's
information (dense, factual, cited), specify the page types and components, and land the
quick wins — so that the redesign is a system, not a series of one-off pages.

## Inputs

- `O4` and `A12` (direction, tokens, a11y acceptance), `A7` (category conventions), `A13`
  (target IA and page purposes), `A9` §5, existing design reviews in the repo, the CSS entry,
  layout, component directory, `package.json`, the densest data views in the product.

## Method

1. **Current-state audit** — what design system exists (or does not); fonts declared vs
   actually applied; count of hard-coded colour utilities; accent usage; how the most
   important product elements (citations, confidence bands, timestamps, source descriptors)
   are styled relative to their importance; dark mode status; a11y state.
2. **Competitor design read** — from A7, five observations relevant to our choices (not a
   re-run of A7).
3. **Principles** — five or six for presenting factual, cited information (hierarchy by
   importance not decoration; identifiers in mono; never colour-code truth; label every
   panel; density with rhythm; the signature device on every evidence surface). Each with a
   before/after from our own UI.
4. **Page-type specs** — for each page type in A13 (landing, proof/methodology, product
   view, list/table, detail with citations, form/access, legal): layout, register, required
   elements, states (empty, loading, error, gated).
5. **Component inventory** — what exists, what is missing, what to build first; whether to
   adopt a component library (respect repo rulings).
6. **Quick wins** — the five highest-leverage changes doable in ≤ 3 operator-days
   (typically: apply the loaded font; replace hard-coded colours with tokens; promote the
   under-styled critical element; add the signature device; label panels). Implement them
   on a branch with tests; list what was not done.
7. **Acceptance criteria** — the contrast, reflow (320/390), keyboard, focus, reduced-motion
   and screen-reader checks O7 will run, with the commands or harness to run them.

## Output — `<<OUT>>/5-surface/A14-design-<<DATE>>.md` (+ branch with quick wins)

COMMON header (Status: SYNTHESIS). Sections 1–7 · Sources (file paths) · Branch name and
test results.

## Done when

Audit numbers are from the code (counts, not impressions); every page type has a spec;
quick wins are on a branch with green tests; acceptance criteria are runnable.

## Do not

- Do not redesign the identity (A12/O4 own it).
- Do not merge or deploy; hand the branch to the operator.
