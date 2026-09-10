# PLAYBOOK — the rollout sequence

Read `README.md` for how to use this folder and `COMMON.md` for the conventions every step
follows. This file is the sequence itself: what each step is, who does it, what it consumes,
what it must produce, and when it is done.

## 0. Why this order

A rollout's brand, marketing and design work is a chain of derivations. Positioning is derived
from what buyers say they need and what competitors leave unclaimed. Identity is derived from
positioning. The marketing surface — copy, IA, pages, pricing — is derived from identity and
positioning. Launch is the moment the surface goes in front of buyers, and measurement tells
you which derivation was wrong. Doing the steps out of order does not make the work useless,
but it makes it *unanchored*: a teardown done before discovery calibrates you to competitors'
marketing rather than buyers' language; identity chosen before positioning is decoration.

Most projects arrive here mid-chain. That is fine. Step A0 scores the project against the
chain and the gap register becomes the scope. The rule is only that you do not *start* a later
step until its declared dependencies exist — you can absolutely go back and fill one in.

## 1. Owners

- **AGENT** — an AI agent can do the whole step from the prompt file in `agents/`, reading the
  repo and public web, and file the output. The operator only fills placeholders and reviews.
- **OPERATOR** — a human must do it: talking to buyers, making a decision, running a test with
  real people, signing off. The instruction sheet in `operators/` says how, and the report
  template in it is the *only* artefact downstream steps read.
- **AGENT → OPERATOR** — an agent prepares the packet (options, evidence, draft); the operator
  decides and signs. Both files apply.

## 2. The sequence

Time budgets assume one operator plus agents. "Depends on" lists hard prerequisites only.

### Phase 0 — Scope

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A0** | AGENT | Project inventory & gap audit | whole repo, strategy docs, live site | `GAP-REGISTER.md` | every step below has a status + evidence line; open decisions listed with owner and age |

### Phase 1 — Discovery (start immediately; runs in parallel with Phase 2)

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **O1** | OPERATOR | Buyer discovery interviews | ICP list, outreach roster, GO/NO-GO claim rules | `1-discovery/O1-###-*.md` (one per interview) | ≥ 8 reports across ≥ 2 segments, ≥ 3 in the beachhead segment |
| **A1** | AGENT | Interview synthesis | all `O1-*` reports | `1-discovery/A1-interview-synthesis-*.md` | jobs, pains, current tools, buying process, verbatim language bank, willingness-to-pay signals, disconfirming evidence, all with report ids |

### Phase 2 — Research (agent, parallelisable)

Market set:

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A2** | AGENT | Landscape & ownership | competitor set, strategy docs | `2-research/A2-raw-landscape-*.md` | every competitor has owner, funding/M&A history, headcount band, positioning line, each claim tagged; "not found" list |
| **A3** | AGENT | Pricing & deal sizes | competitor set | `2-research/A3-raw-pricing-*.md` | per vendor: list prices, procurement records, marketplace SKUs, contract values; CONFIRMED vs INFERRED; query log |
| **A4** | AGENT | Vendor deep-dive (one per priority competitor) | A2, A3 | `2-research/A4-raw-<vendor>-*.md` | product lines, data model, API surface, sales motion, weaknesses; "could not verify" list |

Design set (the four missions):

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A5** | AGENT | Mission 1 — IA & buyer journey | competitor set, A8 screenshots | `2-research/A5-raw-ia-navigation-*.md` | per vendor: nav model, primary CTA copy + destination, product specificity, self-serve vs demo-gated; hero headlines verbatim |
| **A6** | AGENT | Mission 2 — Trust signals & tradecraft | competitor set, A8 | `2-research/A6-raw-trust-signals-*.md` | per vendor: certifications, logos, bios, methodology claims, named standards, psychological pitch |
| **A7** | AGENT | Mission 3 — Visual branding | A8 screenshots (mandatory) | `2-research/A7-raw-visual-branding-*.md` | per vendor: palette (hex from CSS, verified against screenshot), type, imagery, motifs, sophistication read; two-pass with corrections |
| **A8** | AGENT | Mission 4 — Screenshot capture & manifest | competitor set | `2-research/screenshots/` + `A8-manifest-*.md` | homepage + product page (+ pricing page if any) per vendor at desktop **and** mobile widths, dated, listed |

### Phase 3 — Positioning

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A9** | AGENT | Research synthesis | A1–A8 | `3-positioning/A9-synthesis-*.md` | unified competitor matrix, positioning map, messaging-hierarchy comparison, **self-assessment of our site on the same rubrics**, unclaimed positions, with raw citations |
| **A10** | AGENT | Brand strategy draft | A1, A9, strategy docs | `3-positioning/A10-brand-strategy-*.md` | position statement (3 variants), proof points tagged SAYABLE/ROADMAP/GATED, anti-positioning, voice principles + register test, identity brief, decisions handed to operator |
| **A11** | AGENT | Marketing narrative strategy draft | A1, A9, A10 | `3-positioning/A11-narrative-strategy-*.md` | narrative inventory of competitors, adopt/improve/counter lists, ranked narrative stack, per-segment message architecture, channel plan, KPIs proposed |
| **O2** | OPERATOR | Positioning & packaging decision memo | A1, A9, A10, A11 | `3-positioning/O2-decision-memo-*.md` + decision-log entries | category, buyer, position line, name kept/changed, packaging model, the gating product decision (e.g. G1) — each decided, dated, with rejected options |
| **O3** | OPERATOR | Message test | O2, A11 | `3-positioning/O3-message-test-*.md` | ≥ 5 buyers shown 2–3 position variants; comprehension, credibility, differentiation scored; winning variant named |

### Phase 4 — Identity

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A12** | AGENT | Brand identity & design tokens | O2, O3, A10 identity brief, A7 | `4-identity/A12-identity-*.md` + token file + 2–3 direction boards | name rationale, type pair (licensed, subsets checked), palette with contrast-verified values, spacing/radius scale, voice sheet, logo/wordmark direction, tokens wired in code |
| **O4** | OPERATOR | Identity sign-off | A12 | `4-identity/O4-identity-signoff-*.md` | one direction chosen; what was rejected and why; any commissioned work scoped |

### Phase 5 — Surface

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A13** | AGENT | IA evaluation & target IA | O2, A5, A9, repo routes | `5-surface/A13-ia-*.md` | route inventory, gaps, target nav + URL plan, build-now / build-later lists with effort, social-proof containers |
| **A14** | AGENT | Design concepts & design system | O4, A7, A12, repo | `5-surface/A14-design-*.md` | current-state audit, principles, page-type specs, component inventory, quick wins, a11y acceptance criteria |
| **A15** | AGENT | Message hierarchy & site copy | O2, O3, A11, A13 | `5-surface/A15-copy-*.md` | per-page hierarchy (headline → sub → proofs → CTA), full copy for public routes + access flow + transactional email, **claim→evidence table**, i18n notes |
| **A16** | AGENT | Persona pages & pricing/access packet | O2, A1, A3 | `5-surface/A16-personas-pricing-*.md` | one buyer brief per ICP, pricing page copy or a stated reason it is withheld, evidence memo, partner deck outline |
| **O5** | OPERATOR | Design-partner program | A1, A16 | `5-surface/O5-design-partners-*.md` | 5–10 named accounts onboarded on written terms; feedback cadence set |
| **O6** | OPERATOR | Usability sessions | A13–A15 built, O5 partners | `5-surface/O6-usability-*.md` | ≥ 5 sessions on the redesigned surface; task completion, confusion points, verbatims; fix list |

### Phase 6 — Launch

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A17** | AGENT | Funnel instrumentation spec | A13, analytics stack | `6-launch/A17-instrumentation-*.md` | event schema for visit → request → approve → sign-in → activate → return; dashboards; consent posture; implemented and verified with test events |
| **A18** | AGENT | Launch plan | O2, A11, A15, A16 | `6-launch/A18-launch-plan-*.md` | audiences, sequence (partners → segment → public), channels with owners and dates, assets checklist, claims review, rollback |
| **O7** | OPERATOR | Readiness sign-off | everything above | `6-launch/O7-readiness-*.md` | checklist signed; every public claim traced; legal/rights items closed or withheld; go date |

### Phase 7 — Measure (recurring)

| Step | Owner | Title | Consumes | Produces | Done when |
|---|---|---|---|---|---|
| **A19** | AGENT | Monthly funnel & message review | analytics, O5 feedback, support/email | `7-measure/A19-review-<month>.md` | funnel numbers vs last month, message-level findings, proposed changes with owner; re-run A0 |

## 3. Dependencies drawn out

```
A0 ──► (everything)
O1 ──► A1 ──► A9, A10, A11, A16, O5
A8 ──► A5, A6, A7
A2, A3 ──► A4
A1..A8 ──► A9 ──► A10 ──► A11 ──► O2 ──► O3 ──► A12 ──► O4 ──► A14
O2 ──► A13, A15, A16, A18
A13, A14, A15 ──► O6
A17, A18, O6 ──► O7 ──► launch ──► A19 (monthly) ──► A0 (re-score)
```

Hard rule: **A10 and later do not start until A1 exists with ≥ 8 interviews.** If the project
already has synthesis drafts written without A1 (common), keep them, mark them
`PROVISIONAL — no buyer evidence` in the header, and re-issue them after A1.

## 4. Gap scoping

`A0` fills `GAP-REGISTER.md` with one row per step:

| Step | Status (DONE / PARTIAL / MISSING / N/A) | Evidence (file paths) | Gap | Owner | Est. |

"DONE" requires the step's *Done when* to be met and the output to carry the COMMON header.
Existing work that predates the playbook is scored on substance, not on file name: a
`docs/research/competitors/design/raw-ia-navigation.md` that meets A5's done-criteria is A5
DONE, and the register says so with the path.

The register is re-scored at the end of each phase and is the single progress view for the
operator across projects.

## 5. Adapting to a project

Things that legitimately vary: the competitor set and grouping; the number of A4 deep-dives
(one per priority competitor, usually 2–4); whether pricing is published (O2 decides; A16
writes either the page or the reason); the analytics stack (A17 adapts); locale count (A15
notes what is native-reviewed). Things that do not vary: the order, the raw/synthesis split,
the report header, the minimum interview count, and the claim→evidence table before anything
ships.
