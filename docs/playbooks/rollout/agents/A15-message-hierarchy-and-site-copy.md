# A15 — Message hierarchy & site copy

**Phase:** 5 Surface · **Owner:** AGENT → OPERATOR (claims review) · **Depends on:** O2, O3
(winning variant), A11 (stack, per-segment architecture), A13 (pages), A12 (voice sheet) ·
**Feeds:** O6, A18, O7 · **Budget:** read-only plus a branch with copy changes.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Write the words: a message hierarchy per public page, full copy for every public route, the
access/request flow, transactional email, and metadata — with a claim→evidence table that
proves every factual statement. Copy that cannot be proven does not ship.

## Inputs

- `O2` (position line, name, category term, pricing decision), `O3` (which variant buyers
  understood and the words they used), `A11` §5–6 (stack, per-segment messages), `A13`
  (page list and purposes), `A12` §3 (voice sheet, formatting rules), `A1` §7 verbatims,
  `A10` §4 anti-positioning, the repo's copy files and i18n catalogs, and the code/queries
  that back each proof.

## Method

1. **Hierarchy per page** — for every route in A13: headline → sub → first proof → secondary
   proofs → CTA → objections handled, each mapped to the narrative stack item it serves and
   the segment it speaks to.
2. **Copy** — full text for each page in the source locale, written to the voice sheet and
   passing the register test; alt text; empty/error/gated states; the access-request form
   (fields, helper text, what happens next and when — promise only what will be kept);
   transactional emails (sign-in, request received, approved, digest) with sender name and
   subject lines; page titles and meta descriptions (unique per page); social preview text.
3. **Claim → evidence table** — every factual or numeric statement in the copy:
   `| Page | Claim | Tag (SAYABLE/ROADMAP/GATED) | Evidence (path/query/public URL) | Owner
   sign-off |`. GATED claims are removed or rewritten as plans. Weak public numbers are shown
   with the framing rule from A10 §4, never hidden.
4. **Anti-positioning check** — grep the copy for every "never say" word from A10 §4; list
   hits and fixes.
5. **i18n notes** — which strings changed, which locales are native-reviewed, which are
   machine-translated and must carry a notice or be withheld.
6. **Branch** — implement on a branch with the existing copy tests updated; list what is
   left for the operator.

## Output — `<<OUT>>/5-surface/A15-copy-<<DATE>>.md` (+ branch)

COMMON header (Status: SYNTHESIS). Sections 1–6 · Sources.

## Done when

Every public route has a hierarchy and copy; the claim table has no untagged rows and no
GATED rows left in shipping copy; anti-positioning hits are zero; the operator has a short
sign-off list (claims requiring a human "yes").

## Do not

- Do not invent numbers, logos, testimonials or partner names. Empty social-proof containers
  stay hidden.
- Do not use competitor names in copy unless O2 allowed it.
