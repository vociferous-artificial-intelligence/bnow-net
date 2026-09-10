# Rollout playbook — brand, marketing & design for a new application

A reusable, project-agnostic process for taking an application that already exists (or is
about to) through the branding, marketing and design work that a sound rollout needs. It was
written after reviewing how BNOW.NET did this work
(`docs/reviews/BRAND-MARKETING-DESIGN-PRACTICE-REVIEW-2026-09-10.md`) and is meant to be copied
into any project as `docs/playbooks/rollout/`.

The playbook does not assume the project did things in the right order. It assumes the usual
case: a founder built something from a vision, ran little or no customer discovery, and now
needs to find and close the gaps. Step 0 exists precisely to score a project against the
sequence and produce a gap register that becomes the scope of work.

## How to use it

1. Copy this folder into the project as `docs/playbooks/rollout/`.
2. Run **A0 — Project inventory & gap audit** (an agent step). It reads the project and fills
   in `docs/rollout/GAP-REGISTER.md`: for every step in the sequence, *done / partial / missing*,
   with evidence. That register is the scope.
3. Work the sequence in order from the first gap. Every step in `PLAYBOOK.md` is labelled
   **AGENT** (hand the prompt file in `agents/` to an AI agent) or **OPERATOR** (a human does
   it, following the instruction file in `operators/`, and files the report in the exact form
   the file specifies). Some steps are **AGENT → OPERATOR** (an agent prepares, a human decides).
4. Every step writes its output to the path named in its spec, with the standard header from
   `COMMON.md` so the next step can consume it without re-reading the conversation.
5. Re-run A0 at the end of each phase; the register is the progress tracker.

## Folder map

| Path | What it is |
|---|---|
| `PLAYBOOK.md` | The sequence: phases, steps, owners, inputs, outputs, done-criteria, dependencies. Start here. |
| `COMMON.md` | Conventions every agent prompt and operator report follows (report header, sourcing tiers, raw-vs-synthesis rule, file naming, confidentiality). Paste into every agent prompt. |
| `agents/A*.md` | One self-contained prompt per agent step. Hand the file (plus `COMMON.md`) to the agent verbatim; fill the `<<PROJECT>>` placeholders first. |
| `operators/O*.md` | One instruction sheet per human step: why, preparation, how to run it, and the **report template** the operator must fill in, which is the only thing downstream steps read. |
| `templates/` | Blank files created by the steps (gap register, decision memo, interview report), for copying. |

## The sequence at a glance

```
Phase 0  Scope          A0 inventory & gap audit
Phase 1  Discovery      O1 buyer interviews ─► A1 interview synthesis
Phase 2  Research       A2 landscape & ownership   A3 pricing & deal sizes   A4 vendor deep-dives
                        A5 IA & buyer journey      A6 trust signals          A7 visual branding    A8 screenshot manifest
Phase 3  Positioning    A9 research synthesis ─► O2 positioning & packaging decisions ─► O3 message test
Phase 4  Identity       A10 brand identity & design tokens ─► O4 identity sign-off
Phase 5  Surface        A11 message hierarchy & site copy   A12 persona & pricing pages   O5 design-partner program   O6 usability sessions
Phase 6  Launch         A13 funnel instrumentation spec   A14 launch plan   O7 readiness sign-off
Phase 7  Measure        A15 monthly funnel & message review (recurring)
```

Phases 1 and 2 can run in parallel. Nothing in Phase 3 onward should start until Phase 1 has
produced at least eight interview reports; the whole point of the process is that positioning,
identity and copy are derived from buyer language, then checked against competitors, not the
other way round.

## Principles the playbook enforces

- **Buyers before competitors.** Competitor research is the cheapest research and the least
  predictive. It validates a positioning; it cannot produce one.
- **Raw before synthesis, and never in the same file.** Research steps produce dated raw files
  with sourced claims and confidence tiers. Synthesis steps read raw files and write
  recommendations. Mixing them is how stale inference gets mistaken for evidence.
- **Decisions are made by operators and written down.** Agents frame options and evidence; a
  human chooses, and the choice goes into the project's decision log with a date.
- **Every output is a handoff.** Each report has the header in `COMMON.md` naming what it
  consumed and what it feeds, so a fresh agent or a new operator can pick up mid-process.
- **Truth in claims.** Nothing on a marketing surface may assert what the product cannot show.
  Copy steps require a claim-to-evidence table.
