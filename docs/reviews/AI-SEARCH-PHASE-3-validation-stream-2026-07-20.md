# AI Search Phase 3 — AnswerValidator + validated streaming (implementation report)

**Date:** 2026-07-20 · **Branch:** `codex/ai-search-ask-p3-validation-stream` (from
integration HEAD `a0c6e85`, carrying Phases 0–2)
**Commits:** `4e254b6` (work block), `71e557a` (Increment A), `9418f13` (Increment B)
**Independent gate:** `AI-SEARCH-GATE-3-2026-07-20.md` (mandatory red-team; runs at
review time — this report precedes its verdict and does NOT claim the gate).

## Increment A — the shared pure AnswerValidator (whole-answer release)

`src/lib/ask/validator.ts` extracts every deterministic answer check into one pure
module: the citation parse/filter (the sacred anti-fabrication filter),
`beginsWithDenial` (moved verbatim, re-exported), the deterministic insufficient
copy, and `classifyCompletion` — the exact historical refusal/empty/truncation
precedence, now named so streaming applies the identical mapping.

NEW — the §4 / standing-ruling-20 **named-person source-fidelity matrix** over
name-bearing CITED sentences:

- **identity**: every named person must appear in at least one cited claim;
- **predicate families**: conviction / confirmed-death / sanction-designation /
  arrest / charge assertions need matching evidence (PEP-only evidence never
  supports "sanctioned" — category laundering fails structurally);
- **certainty**: hedged-only evidence asserted with a strengthening predicate
  requires governing attribution in the sentence itself;
- **status/timing**: expired/removed/delisted evidence must not read as current.

A failing sentence is REPLACED by deterministic cited-claim wording — the claim
verbatim with its citation, the name surviving inside the quote. **Never name
suppression**; a faithful answer passes byte-identical (the existing ask suite ran
unchanged). Applied in `assembleV2` after the denial correction, with citations
re-derived through the same filter. Rollback: `ASK_FIDELITY_FALLBACK=0`.

## Increment B — buffered validated streaming (`ASK_STREAM_ANSWER`, default OFF)

- **`SectionReleaser`** (pure, in validator.ts) enforces every §6.3 safeguard
  before a character leaves the buffer: the 250-char denial holdback (a denial-led
  reply releases NOTHING, ever — beginsWithDenial is a prefix property, so the
  window suffices); complete-sentence gating (the trailing partial always stays
  buffered — a partial citation token structurally cannot render); sentences with
  unresolved citations HELD to end-of-stream, where fabricated markers strip
  exactly like the whole-answer filter; per-sentence fidelity replacement at
  release.
- **`answer-stream.ts`**: reserve BEFORE the stream; settle EXACTLY ONCE on every
  exit — the terminal usage frame on a clean end, the conservative
  input-estimate + output-ceiling on death/abort/dispatch-failure (never
  unrecorded; register #39). Refusal deltas suppress all release.
  `watchCancelMarker` makes the Phase 2 cancel stub LIVE (the marker aborts
  generation mid-stream). An injectable `streamFactory` is the Phase 5 gateway
  seam. No import from answer.ts (no cycle; register #40).
- **Wiring**: `answerFromEvidence` streams only with a real sink AND the flag;
  the outcome maps through `classifyCompletion` + the SAME `assembleV2` terminal
  path (structural reconciliation — the terminal payload governs the client
  render). Cancelled runs return provider `"cancelled"`; the runs route emits the
  single `run.cancelled` terminal (register #38). Flag off or no sink: the
  non-streaming path, byte-identical (test-pinned both ways).
- **Client**: the reducer accumulates validated `answer.section` events under the
  monotonic-phase rules; `run.cancelled` renders honest settled-usage copy; the
  Stop button POSTs the cancel marker (fire-and-forget; settlement is
  exactly-once server-side).

## Proof so far (ledger P3-1, P3-2)

Unit **1,819/1,819** (148 files; +23 over Phase 2's close): the SectionReleaser
§6.3 matrix, the streaming money paths (exactly-once settlement on every exit
class), the fidelity matrix incl. the over-suppression-must-not-happen direction,
flag wiring both ways. Lint + build green. Zero paid calls; production enablement
blocked (`ASK_STREAM_ANSWER` unset everywhere; cohort rollout is post-gate,
operator-gated).

## Pending before merge — RESOLVED (2026-07-20 recovery session)

1. **Gate 3 PASSED after fixes** (`AI-SEARCH-GATE-3-2026-07-20.md`): independent
   3-battery red-team with executed probes confirmed 2 high + 7 med + 4 low
   findings (fidelity-matrix dodges, flat-death certainty gap, marker
   smuggling, replacement-pattern corruption, category laundering, trailing
   attribution, flag-binding, death-vs-refusal honesty, degenerate usage
   frames, over-replacement classes, billed-attribution loss, a11y section
   count) — all fixed in `e48149c`; the production-build browser battery then
   caught the graceful-abort-teardown cancellation gap, fixed in `27ed1de`.
   Final: unit 1,860/1,860; integration 52/52 (disposable fork); browser
   10/10 + 4/4 + 4/4 with screenshots.
2. **Supplementary Gate 2 pass COMPLETED** (addendum in
   `AI-SEARCH-GATE-2-2026-07-19.md`): PASS stands; G2S-1..11 fixed forward in
   `5afdb33`/`b7ca5dc`.

Recovery context (session death mid-gates, forensics, dirty-patch verdict):
`AI-SEARCH-RECOVERY-2026-07-20.md`. Production enablement remains BLOCKED:
`ASK_STREAM_ANSWER` unset everywhere; cohort rollout operator-gated.
