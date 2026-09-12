# O7 — Launch readiness sign-off

**Phase:** 6 Launch · **Owner:** OPERATOR · **Depends on:** A15, A16, A17, A18, O6 must-fix
list closed, the project's release checklist · **Feeds:** launch; A19 · **Time:** half a day,
ideally the day before wave 1 and again before wave 4.

## Why this cannot be delegated

Someone has to be accountable for every public claim, every rights or legal gate, and the
go date. The checklist is mostly verification an agent can prepare; the signature is yours.

## Preparation

Ask an agent to pre-fill the checklist below with evidence links (file paths, dashboard
screenshots, test output) and to list anything it could not verify. Then you verify the
items marked *operator* yourself, on the production build, on a phone and a laptop.

## Checklist

**Claims and copy**
- [ ] Every row in the A15 and A16 claim tables is SAYABLE with evidence, or removed. *(operator spot-checks five at random against the live page and the evidence)*
- [ ] No anti-positioning words (A10 §4) on any public route (agent grep + operator read of the homepage).
- [ ] Weakest public number is shown with its agreed framing, not hidden.
- [ ] Competitor names appear only where O2 allowed.
- [ ] Page titles/meta unique; social preview renders; robots/sitemap correct.
- [ ] Locales: native-reviewed ones live; others withheld or labelled.

**Rights, legal, privacy**
- [ ] Every GATED item is off the public surface, with the gating decision id noted.
- [ ] Terms / privacy notice current and consistent with A17's consent posture.
- [ ] Any named-individual or third-party-data exposure reviewed per the project's rules.

**Identity and design**
- [ ] O4 direction implemented; tokens in use; no stray hard-coded colours on public routes.
- [ ] A14 acceptance criteria pass (contrast, 320/390 reflow, keyboard, focus, reduced motion, screen reader on nav and forms) — attach output.
- [ ] O6 must-fix list closed.

**Funnel and operations**
- [ ] A17 events verified on production for every stage; dashboards linked; baseline recorded.
- [ ] Access/request flow: submission → operator notification → approval → sign-in works end to end; response window promised = response window kept.
- [ ] Transactional email from the product's own domain; auth passes (SPF/DKIM/DMARC); the first email an invitee sees has been read by you.
- [ ] Spend caps and rate limits set for launch traffic; status/incident path known; rollback tested.
- [ ] Design partners (O5) briefed on the launch and what they may be asked.

**Plan**
- [ ] A18 waves have gate metrics and dates; assets checklist has no MISSING for wave 1.
- [ ] Release checklist of the project completed (build, tests, deploy proof).

## The report you must file

Path: `<<OUT>>/6-launch/O7-readiness-<date>.md`, plus a decision-log entry with the go date.

```
# O7 — Launch readiness — <date>

**Step:** O7 · **Phase:** 6 · **Owner:** OPERATOR · **Status:** DECISION
**Consumed:** A15-…, A16-…, A17-…, A18-…, O6-…, release checklist
**Feeds:** launch, A19

## Decision
GO for wave <n> on <date> / NO-GO — with the blocking items.

## Checklist with evidence
(the list above, each with a link or "verified by operator on <date>")

## Exceptions accepted
| Item | Why accepted | Mitigation | Revisit |

## Watch list for launch day (from A18 §7 and A17 dashboards)

## Signed
<name>, <date>
```

## Done when

Every item is checked with evidence or listed as an accepted exception; the go date is in the
decision log; the watch list exists.
