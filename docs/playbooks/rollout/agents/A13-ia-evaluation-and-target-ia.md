# A13 — IA evaluation & target information architecture

**Phase:** 5 Surface · **Owner:** AGENT · **Depends on:** O2, A5, A9 (self-assessment), the
repo · **Feeds:** A15, A17, O6 · **Budget:** read-only against the repo; no live-site
edits.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Evaluate the public-facing information architecture against the decided position and the
narrative stack, find the gaps, and specify the target IA and build order — from the code,
not from memory.

## Inputs

- The repo: every public route, nav configuration, metadata/`robots`/`sitemap`, access-gating
  policy, i18n catalogs; `O2` (position, segments, pricing decision), `A11` (stack, per-segment
  architecture), `A5` (what the category does), `A9` §5 (our self-assessment), `A1` (what
  buyers look for first).

## Method

1. **Route inventory** — table of every public route: path, purpose, gated?, title/meta
   (unique?), primary CTA, where it is linked from (count inbound links; find orphans).
2. **Nav as built** — transcription, grouping principle, mobile behaviour.
3. **Journey audit** — for each segment in `<<ICP_LIST>>`, walk the site as that buyer from
   landing to the commercial action; record every dead end, walled CTA, orphan proof page,
   and place where the position's proof is *not visible to a signed-out visitor*.
4. **Gaps** — numbered G1…Gn, each with evidence (path/line), impact on which narrative, and
   severity.
5. **Target IA** — nav (labels, order, dropdown children), URL plan (freeze URLs; redirects
   for any change), page purposes, what each page must show a signed-out visitor, social-proof
   containers designed to render only when real content exists, pricing page or the reason
   it is withheld (from O2).
6. **Build lists** — *Build now* (≤ 10 items, each with effort in days and the gap it closes)
   and *Build over time*, plus *Do not build* with reasons.
7. **Open decisions** for the operator.

## Output — `<<OUT>>/5-surface/A13-ia-<<DATE>>.md`

COMMON header (Status: SYNTHESIS). Sections 1–7 · Sources (file paths).

## Done when

Every route is inventoried with inbound-link count; every segment has a journey walk; the
target nav and URL plan are explicit; build-now items carry effort estimates.

## Do not

- Do not propose pages whose content is GATED without saying so.
- Do not write page copy (A15).
