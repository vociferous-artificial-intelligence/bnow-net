# O6 — Usability sessions

**Phase:** 5 Surface · **Owner:** OPERATOR · **Depends on:** A13–A15 built on a preview
(staging) deployment, O5 partners or O1 pool · **Feeds:** A14/A15 fix lists, O7 · **Time:**
~10 hours for 5–6 sessions of 30–40 minutes plus reporting.

## Why this cannot be delegated

Instrumented audits (contrast, reflow, ARIA) tell you the page is *correct*. Only watching a
real buyer try to do a real task tells you it is *understood*. Five sessions find most of
the serious problems.

## Preparation

1. Deploy the redesigned surface to a preview URL. Freeze it for the week.
2. Write 4–6 **tasks** in the buyer's terms, not the product's, covering: understand what
   the product is from the landing page; find the proof (the thing the position rests on);
   find who it is for / whether it is for them; find what it costs or how to get access;
   complete the request/sign-up; (signed-in) do the first core action; (mobile) one of the
   above on a phone.
3. Recruit 5–6: at least three from the beachhead segment, one from another segment, one
   cold. Prefer people not involved in O3.
4. Screen-share with permission; record if consented. One note-taker if you can get one.

## How to run a session

Think-aloud protocol: "Please say what you're thinking as you go. I can't help you — if you
get stuck, do what you'd do at your desk." Give one task at a time. Do not lead. Note:
time to complete, success (yes / with difficulty / no), where they hesitated, what they
said (verbatim), what they clicked that wasn't clickable, what they expected that wasn't
there. After each task: "What did you expect to happen?" After all tasks: "What is this
product, in one sentence? What would stop you requesting access? What did you like?"

Never explain the product during the session. Afterwards, yes.

## The report you must file

Path: `<<OUT>>/5-surface/O6-usability-<date>.md`.

```
# O6 — Usability sessions — <date>

**Step:** O6 · **Phase:** 5 · **Owner:** OPERATOR · **Status:** REPORT
**Consumed:** preview URL + commit, A13-…, A15-…, task list v<n>
**Feeds:** A14, A15, O7
**Method:** n sessions, dates, device mix, recording consent

## Tasks (verbatim as given)

## Results matrix
| Task | P1 | P2 | P3 | P4 | P5 | Success rate | Median time |
(✓ / ✓- / ✗ per cell)

## Findings (ranked by severity × frequency)
| # | Where | What happened | Count | Verbatim | Severity (blocks / hinders / cosmetic) | Proposed fix | Owner |

## Comprehension
"What is this product" answers, verbatim, vs the O2 position line.

## Objections to requesting access (verbatim, counted)

## What worked (keep these)

## Fix list for A14/A15 (must-fix before O7 vs later)
```

## Done when

Five or more sessions; the results matrix is complete; every blocking finding has a fix and
an owner; the must-fix list is handed to A14/A15 and O7 will check it.
