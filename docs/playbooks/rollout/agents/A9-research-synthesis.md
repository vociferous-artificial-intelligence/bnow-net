# A9 — Research synthesis

**Phase:** 3 Positioning · **Owner:** AGENT · **Depends on:** A1 (≥ 8 interviews) and A2–A8;
if A1 is missing, the file is written with `PROVISIONAL — no buyer evidence` in its header and
re-issued after A1 · **Feeds:** A10, A11, A13, A14, O2 · **Budget:** read-only.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Turn eight raw files and the interview synthesis into the comparisons and maps a positioning
decision needs — and, critically, assess **our own** public surface on exactly the rubrics
we applied to competitors. This is the first SYNTHESIS file; every recommendation cites the
raw section it rests on.

## Inputs

- `A1`, `A2`, `A3`, `A4-*`, `A5`, `A6`, `A7`, `A8` from `<<OUT>>`.
- Our live site and repo (routes, nav config, CSS/tokens, copy files) for the self-assessment.
- `<<STRATEGY_DOCS>>` for the current positioning claims to test.

## Method

1. **Unified competitor matrix.** One row per vendor across *all* raw files: ownership ·
   price evidence · nav principle · pricing visible · trial · trust certs · named standard ·
   demonstrated rigour · palette mode · type class · pitch type · buyer segments served.
   Where the design set and market set covered different vendors, say which cells are empty
   and whether they matter.
2. **Positioning map(s).** Choose two axes that the evidence supports (e.g. automated ↔
   human-expert; data/API ↔ narrative/advisory; speed ↔ verification; enterprise-gated ↔
   self-serve). Place every vendor with a one-line justification citing raw sections. Draw
   at least two maps; note which one the interviews (A1) suggest buyers actually use.
3. **Messaging-hierarchy comparison.** For each vendor: headline → sub → first proof → CTA,
   verbatim from A5/A6. Then classify each headline (outcome / capability / identity /
   fear) and each proof (number / logo / standard / demo). Note the buyer language from A1
   that *no* vendor uses.
4. **Unclaimed positions.** From A6 "signals nobody uses", A3 (price transparency), A5
   (self-serve access), and A1 pains nobody addresses: list positions open in the category,
   each with the evidence and the risk (why nobody takes it — maybe for good reason).
5. **Self-assessment.** Apply A5, A6 and A7 rubrics to *our* site as if we were a competitor:
   nav transcription, CTA and destination, specificity score, trust inventory, demonstrated vs
   asserted rigour, palette/type/motif read, mobile. Same table columns. Be as blunt as the
   raw files are about others.
6. **Assumption test.** For every positioning claim in `<<STRATEGY_DOCS>>`: supported /
   contradicted / untested by (a) buyers (A1) and (b) competitors (A2–A8).
7. **Corrections upstream.** Any error found in a raw file: note it here *and* add a dated
   correction to the raw file.

## Output — `<<OUT>>/3-positioning/A9-synthesis-<<DATE>>.md`

COMMON header (Status: SYNTHESIS). Sections 1–7 · Open questions for O2 (things the
evidence cannot settle) · Sources (raw file + section per claim).

## Done when

The matrix has every vendor; at least two maps exist; the self-assessment is complete on all
three rubrics; the assumption test covers every claim in the strategy docs' positioning
section; every unclaimed position has a stated risk.

## Do not

- Do not write the position statement; A10 does.
- Do not soften the self-assessment. It is the one row the operator most needs to read.
