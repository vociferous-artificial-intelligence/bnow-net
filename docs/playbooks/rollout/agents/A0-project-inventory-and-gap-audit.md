# A0 — Project inventory & gap audit

**Phase:** 0 Scope · **Owner:** AGENT · **Depends on:** nothing · **Feeds:** every step; re-run
at the end of each phase · **Budget:** read-only; no paid calls; ~half a day of agent time.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Score `<<PROJECT>>` against every step of `PLAYBOOK.md` and write `<<OUT>>/GAP-REGISTER.md`.
The register is the scope of the brand/marketing/design work. It must be evidence-based: a
step is DONE only if an existing artefact meets that step's *Done when* line, whatever the
artefact is called.

## Inputs

- `<<REPO>>` — read `README`, the agent charter (`AGENTS.md`/`CLAUDE.md` if present),
  `<<STRATEGY_DOCS>>`, every file under `docs/` whose name suggests strategy, research,
  design, review, decisions, open tasks, blockers.
- The live public site (signed-out) and, if a test session is provided, signed-in.
- The codebase's public routes, nav config, i18n catalogs, analytics wiring, email templates,
  design tokens or CSS entry, component directory, `package.json`.
- The decision log and open-task register, if they exist.

## Method

1. **Inventory first, judge second.** Build a table of every artefact relevant to the chain:
   path, date, type (RAW / SYNTHESIS / DECISION / REPORT / code), one-line content, which
   step(s) it could satisfy.
2. **Score each step** A0–A19 and O1–O7 as DONE / PARTIAL / MISSING / N/A against the
   PLAYBOOK *Done when* line. Quote the evidence path. For PARTIAL say exactly what is missing
   (e.g. "A5 met except no mobile capture and no self-assessment").
3. **Buyer-evidence audit.** Count interviews, discovery calls, design partners, LOIs,
   surveys, access requests, active users, and any usage analytics. Cite where each number
   comes from. If a number does not exist, write "no record found" — not zero.
4. **Decision audit.** List every open decision that gates a step (packaging, naming,
   product-tier questions, rights/legal gates), with the date it was opened, owner, and which
   steps it blocks.
5. **Surface audit.** For the public site: route inventory; hero headline and sub verbatim;
   primary CTA and destination; whether pricing is shown; whether a signed-out visitor can see
   the core product artefact; page titles/meta; sender domain of transactional email; analytics
   present and consented; locales and whether native-reviewed; brand assets present (logo,
   tokens, type loaded and actually applied).
6. **Claim audit.** Every factual claim on the homepage → SAYABLE / ROADMAP / GATED with the
   file or query that proves it, or "unproven".
7. Write the register and a short narrative.

## Output — `<<OUT>>/GAP-REGISTER.md`

COMMON header, then:

1. **Summary** (≤ 10 lines): stage of the project, the first gap in the chain, the two or three
   decisions blocking the most steps.
2. **Register table** — one row per step:
   `| Step | Status | Evidence | Gap | Blocking decision | Owner | Est. |`
3. **Buyer-evidence table** with sources.
4. **Open decisions table**: id, question, opened, owner, blocks.
5. **Surface audit** findings.
6. **Homepage claim audit** table.
7. **Recommended order of work** — the steps to run next, respecting PLAYBOOK dependencies,
   with the operator actions needed to unblock each.
8. **Artefact inventory** (appendix).

## Done when

Every step has a status and an evidence line; every "MISSING" has an owner and estimate; the
recommended order names the first three concrete actions, at least one of which is an
operator action if O1 is not DONE.

## Do not

- Do not infer that something exists because a doc says it is planned. Planned is MISSING.
- Do not score synthesis written without buyer evidence as DONE for A10/A11; score PARTIAL
  with "no A1 input".
- Do not propose fixes beyond the recommended order; other steps own that.
