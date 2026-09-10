# COMMON — conventions for every playbook step

Paste this file, in full, at the top of every agent prompt. Operators read it once.

## 1. Placeholders

Every prompt and instruction sheet uses these; fill them before handing off.

| Placeholder | Meaning | BNOW.NET example |
|---|---|---|
| `<<PROJECT>>` | Product name | BNOW.NET |
| `<<REPO>>` | Repository root | `/Users/go/code/bnow-net` |
| `<<CATEGORY>>` | One-line category | conflict / geopolitical OSINT intelligence |
| `<<POSITION>>` | Current positioning line (may be provisional) | "Conflict intelligence that shows its work." |
| `<<ICP_LIST>>` | Ranked target segments | commodity desks; consultancies; sanctions compliance (gated) |
| `<<COMPETITORS>>` | Named competitor set, grouped | 1a Seerist, Janes, Dataminr, Sayari · 1b Oxford Analytica, Eurasia Group · 1c Recorded Future |
| `<<STRATEGY_DOCS>>` | Paths to the project's business docs | `docs/GTM-STRATEGY.md`, `docs/BUSINESS-PLAN.md`, … |
| `<<OUT>>` | Output root for this playbook's reports | `docs/rollout/` |
| `<<OPERATOR>>` | Name/email of the deciding human | Gregory |
| `<<DATE>>` | ISO date of the run | 2026-09-10 |

## 2. Report header (mandatory on every output file)

```
# <Step id> — <Title> — <<DATE>>

**Step:** A5 (IA & buyer journey) · **Phase:** 2 Research · **Owner:** AGENT | OPERATOR
**Status:** RAW | SYNTHESIS | DECISION | REPORT
**Consumed:** <paths of every input actually read, or "none">
**Feeds:** <step ids that read this file>
**Method:** <one paragraph: what was done, with what tools, over what period>
**Confidence:** <HIGH | MEDIUM | LOW, with one sentence why>
**Paid calls / spend:** <"none" or itemised>
**Not done / could not verify:** <bullet list, or "nothing">
```

The header is what lets a fresh agent or a new operator pick up mid-process. A file without
it is not a deliverable.

## 3. Raw vs synthesis — never in the same file

- **RAW** files record what was observed, with a source per claim and a confidence tier. They
  end with the sentence *"No strategic synthesis or recommendations in this file."*
- **SYNTHESIS** files read raw files and write comparisons, maps and recommendations. Every
  recommendation cites the raw file and line/section it rests on.
- **DECISION** files are written by operators (or by an agent *for* an operator and then
  signed). They record one choice, the options rejected, the evidence, and the date.
- **REPORT** files are operator field reports (interviews, tests, sign-offs) in the template
  the step specifies.

If a raw finding turns out wrong, correct it in the raw file with a dated "Pass N correction"
note; never silently overwrite.

## 4. Sourcing and confidence tiers

Every factual claim about a competitor, market or buyer carries one tag:

| Tag | Meaning |
|---|---|
| `(a) OFFICIAL` | Vendor's own site, filing, procurement record, press release — URL + date fetched |
| `(b) TRADE PRESS` | Named publication, URL + date |
| `(c) SECONDARY` | Review site, aggregator, analyst blog, forum — URL + date |
| `(d) INFERRED` | Reasoned from other evidence; say from what |
| `(e) OBSERVED` | Seen first-hand (screenshot, live session, interview) — file path or report id |
| `(f) NOT FOUND` | Searched and found nothing — list queries tried |

Claims about *our own* product must cite a file path or a database query, never memory.
Buyer claims must cite an interview report id (`O1-###`). If a claim has no tag it is
an opinion and must be labelled as one.

Also: every WebFetch/summary tool re-phrases pages. Any verbatim quote used in copy or in a
decision must be re-checked against the live page or screenshot before it is relied on.

## 5. Claim discipline for anything customer-facing

Tag every product statement that could reach a marketing surface:

- `SAYABLE` — true today, provable from a file path / query / public page.
- `ROADMAP` — planned; may be said only as a plan, dated.
- `GATED` — depends on an unresolved rights, legal or operator decision; not sayable.

Copy steps must include a **claim → evidence** table. Nothing on a public surface may assert
what the product cannot show.

## 6. File naming and locations

- Reports go under `<<OUT>>/` in phase folders: `0-scope/`, `1-discovery/`, `2-research/`,
  `3-positioning/`, `4-identity/`, `5-surface/`, `6-launch/`, `7-measure/`.
- Name: `<STEP>-<slug>-<DATE>.md`, e.g. `2-research/A5-ia-navigation-2026-09-07.md`.
  Raw research keeps the `raw-` prefix in the slug.
- Screenshots: `2-research/screenshots/<vendor>-<page>-<DATE>.jpg`, with a manifest (A8).
- Interview reports: `1-discovery/O1-<###>-<segment>-<DATE>.md`, numbered sequentially.
- The gap register lives at `<<OUT>>/GAP-REGISTER.md` and is the only file the playbook
  overwrites in place.

## 7. Confidentiality and conduct

- Interview subjects: named only in the private report; anonymised (`O1-007, commodity desk,
  EU`) in every synthesis. No recording without stated consent. No LinkedIn scraping or
  enrichment of anyone who did not opt in.
- Competitors: public surfaces only. Do not request trials under false pretences, do not
  impersonate a buyer, do not scrape behind robots.txt disallows (say so and use procurement
  records or trade press instead).
- No vendor or model branding in any file, commit or comment.
- No paid API calls or spend without an explicit budget line in the step spec.

## 8. What an agent does when blocked

Do not stop silently and do not guess. Write the report with the header's *Not done / could
not verify* section filled in, mark **Confidence** accordingly, and list the exact operator
action that would unblock it (a credential, a decision, a contact, a budget). Partial and
honest beats complete and inferred.
