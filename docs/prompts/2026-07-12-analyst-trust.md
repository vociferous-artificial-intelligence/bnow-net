# BNOW.NET — Analyst trust sprint: time-model truth, digest-status honesty, home reorder, scoreboard explainer, ISW-cutoff-aligned scoring, registry gating (UNATTENDED-CAPABLE)

**Run in a NEW Claude Code session** in the MAIN checkout `~/code/bnow.net`. Orient from
`AGENTS.md`, `docs/STATUS-REPORT.md`, `docs/OPEN-TASKS.md`, the tail of `docs/PROGRESS.md`,
`docs/reviews/ANALYST-HOME-NOTE-2026-07-12.md`, and
`docs/reviews/ANALYST-HOME-READBACK-2026-07-12.md` (its role-inspection finding matters for W5)
— do not rely on prior-session memory. Live app: https://bnow-net.vercel.app.

**Model: Fable, XHIGH effort (our session default — set it explicitly).** Subagents:
**Fable or Opus 4.8 (high)** for W1 (time model — correctness-critical) and W4 (scoring
methodology — money path + brand-critical numbers); **Sonnet 5 (medium)** for W2/W3/W5. You
review every diff line-by-line on W1 and W4. **Think hard** at: the W0 diagnosis readback, the
W1 status-semantics design, the W4 audit verdict and any re-scoring decision, the W5 gating
mechanism choice, and the deploy decision.

**UNATTENDED-CAPABLE — assume Gregory is away unless he responds.** Decisions come from the
Decision Register (§3); anything it can't answer gets the reversible default + a ledger entry;
irreversible-and-uncovered gets PARKED with a runbook. Workstreams are independent; **any one
may park without blocking the others.** Unacceptable outcomes: a broken deploy left standing;
scoreboard numbers changed without the methodology written down; a money-path change without
its cap; two sessions on one checkout.

**Provenance:** written 2026-07-12 by the planning session from Gregory's live screenshots of
prod (`bnow-jihmibgm6`, ~10:45–11:12 AM ET Jul 12) and his written findings. Every repo-state
claim here is a **hypothesis — the disk is right**; verify, adjust with a ledger entry,
proceed.

---

## 0. THE FINDINGS THIS SPRINT FIXES (from the operator's live smoke)

1. **Digest status is self-contradictory.** Theater cards show `Digest generated: not yet
   generated` while simultaneously showing `Digest claims, today: 14` and `Data current as of
   10:45 AM ET`. Three lines, one card, mutually incompatible under any single definition of
   "today's digest." Suspected: the generated-check keys on the UTC day and/or the 19:30 UTC
   final run, while claims-today counts ET-day intraday output — the UI predates the MR3
   cadence (delta-framed intraday runs + D+1 finalization) and never learned it. DIAGNOSE,
   don't assume (W0).
2. **Times read as wrong to the operator.** `Next update ~Jul 12, 03:30 PM ET` at 10:45 AM ET
   may be technically correct (19:30 UTC cron) but the card fails the glance test — Gregory
   himself read the page as showing wrong times. Whether bug or labeling, it's a defect: the
   home page's entire job is at-a-glance truth (W1).
3. **Signed-in home still leads with marketing.** Full hero headline + CTA buttons before the
   working panels. Gregory's ordered spec is in R3 (W2).
4. **Scoreboard is shown with zero explanation.** Analysts see `57% / 38% / 100%` with no
   statement of what's being measured, why we publish it, or why an analyst should be here
   instead of ISW (W3).
5. **Scoring day-alignment vs ISW is unverified.** ISW has a daily publication cutoff; our
   comparison window may not be anchored to it, and our post-cutoff ingestion (rationed
   Telegram) means our coverage of the same events improves after their cutoff — which is
   currently either mis-scored or invisible (W4).
6. **Source registry is exposed to everyone.** Two problems: `facebook.com` as the top source
   is a platform, not a source (credibility downgrade + segmentation debt), and the enumerated
   registry is the defensible asset (brief §6.2) handed to any smart analyst who wants to
   clone the pipeline. Decision made: admin-only (W5, R5).
7. **Post-auth redirect** should land the analyst on the signed-in home; verify it does (W2).

## 1. PRECONDITIONS (verify, else STOP)

1. Working tree clean on main; no evidence of another active session (dirty tree/lock files →
   hard STOP with a one-paragraph explanation). main == origin/main == deployed
   `bnow-jihmibgm6` per the 07-12 note; if the disk disagrees, reconcile before building.
2. Baseline `typecheck && lint && test` green; record the count (was 996/79 — only goes up).
3. Record the current READY deployment id as the rollback target
   (`npx vercel@latest rollback <id>`). Vercel is NOT git-connected; the deploy is
   `npx vercel@latest deploy --prod --yes`.

## 2. GROUND RULES

1. Feature branch `202607xx-analyst-trust` off main; tag `pre-analyst-trust-<date>`;
   `--no-ff` merge; never force-push. Commit this prompt to `docs/prompts/` first.
2. **Schema:** no migrations EXCEPT W4, which may propose ONE additive-only migration if the
   audit proves dual-score storage impossible without it — and even then it ships only per R6's
   gate. Everything else: zero schema change.
3. **Spend cap: $5 OpenAI total, all of it reserved for W4 re-scoring** (validation matching is
   paid). UI workstreams are $0. Fail-closed: if W4's estimate exceeds the cap, shrink the
   backfill window rather than raising the cap. State actual spend at the end.
4. Prod DB SELECT-only via `scripts/sqlq.ts`; any branch-DB script overrides BOTH
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, echoes hosts, asserts (standing trap).
5. **URLs frozen** (W5's gating changes responses, not routes). i18n first-class: all new
   strings through the catalog, en + provisional uk appended to the uk-review inventory; RTL
   spot-check for layout changes.
6. **Signed-out home:** untouched EXCEPT the nav/quick-link consequences of W5 (registry links
   disappear for non-admins everywhere, including signed-out). Hero, CTAs, marketing cards
   stay byte-stable otherwise; test-pin it.
7. Session resilience: checkpoint file `docs/reviews/.analyst-trust-checkpoint.md`, one commit
   per workstream, push after each, resumable-not-restartable.
8. Ordered abort points: per-workstream park → A2 (merged undeployed: deploy or reset; never
   leave origin/main ahead of prod overnight without a note) → A3 (deployed, red: rollback to
   recorded id, verify, diagnose, stop).

## 3. DECISION REGISTER (pre-answered — Gregory's rulings, 2026-07-12)

- **R1 — One time model, written down.** Deliverable includes `docs/TIME-MODEL.md`: what every
  user-facing timestamp means, where it comes from, and the display rule. Display standard:
  **ET with explicit "ET" suffix everywhere** (the product's operational anchor); storage
  stays UTC; all day-boundary logic ("today", claims-today, digest-for-date) uses ONE shared
  helper with an explicit timezone parameter — no inline `new Date()` day math in components.
  Every timestamp label must say what the time IS ("Final digest published 3:31 PM ET", not
  "Digest generated").
- **R2 — Digest status must be internally consistent and cadence-aware.** The card states
  reality under the MR3 cadence, e.g.: `No digest yet today · next run ~3:30 PM ET` (and then
  claims-today must show 0 or be labeled as yesterday's), or `Intraday update 9:12 AM ET ·
  final ~3:30 PM ET · 14 claims so far`, or `Final digest 3:31 PM ET · 16 claims`, or
  `Finalized (D+1) 3:00 AM ET`. Pick phrasing that matches what the pipeline actually does
  (W0 tells you); the hard rule is **no card may show "not yet generated" next to a nonzero
  claims-today**. If the contradiction turns out to be a genuine day-boundary bug (UTC/ET
  mismatch), fix the bug AND the labels.
- **R3 — Signed-in home order is fixed (Gregory's spec, verbatim intent):** ① compact one-line
  headline, 3–5 words (suggest `Today's intelligence picture` / uk equivalent; no subtitle) —
  the full marketing hero and ALL CTA buttons (`Read today's digest`, `See the scoreboard`,
  `Explore live coverage`) are removed for signed-in users; ② the three theater panels,
  **whole card clickable → that theater's latest digest** (keep the inner `scoreboard →` link;
  ensure nested-link a11y is clean), with the quick-links rail adjacent; ③ Ask box + recent
  questions; ④ the score tiles + scoreboard link; footer. Signed-out home keeps its hero/CTAs
  untouched. Goal: actionable at a glance, zero scroll to the panels on desktop.
- **R4 — Scoreboard ships WITH explanation.** Add a short explainer block to the scoreboard
  page (and a one-line caption above the home tiles). Draft copy to adapt (keep the substance,
  tune to house voice, i18n): *"We score our own output. Every day we compare this system's
  digest against expert human analysis (ISW and other baselines): did we surface the same
  events, how early, and how often are our claims corroborated? We publish the results —
  including the misses — because analysts should know exactly how much to trust an automated
  feed. Unlike a finished-prose report, every claim here links to its source document, is
  searchable, and lands hours earlier; this page tells you what that speed costs in coverage."*
  Add a "How to read this" line per metric (coverage, info lead, corroborated share). No new
  route — this lives on the existing scoreboard page.
- **R5 — Registry goes admin-only.** Mechanism: use the role/entitlement concept the 07-12
  readback found if usable; else an `ADMIN_EMAILS` env allowlist (comma-separated, checked
  against the session email server-side; unset ⇒ nobody is admin ⇒ fail closed). Non-admins
  (signed-in AND signed-out) get **404** on all registry index/detail routes (RU and ME) — not
  a redirect, don't advertise what's gated. Remove registry entries from the public nav,
  the signed-in quick-links rail, and any on-page links (check data-dark / trade-evasion /
  countries pages for registry links). **What stays public:** per-claim citations and hedging
  badges, the scoreboard, and the hero's "transparent source reliability ratings" promise —
  transparency of *ratings* survives; enumeration of *sources* is the asset being protected.
  The registry "Suggest or flag a source" mailto moves to the digest-page footer alongside
  "Flag an error" (subject `[BNOW source] suggestion`). Set `ADMIN_EMAILS=go@vociferous.nyc`
  in all three Vercel envs + `.env.local`, readable-verify like FEEDBACK_EMAIL was.
- **R6 — ISW-cutoff-aligned scoring: audit first, then the cheapest honest implementation.**
  (a) W4 begins read-only: document how a digest day is currently matched to an ISW report,
  what window each covers, and where the mismatch is (this audit goes in the note verbatim).
  (b) Target design: score against the ISW report whose coverage window the digest overlaps,
  anchored to ISW's cutoff, and report **two numbers per day: coverage at-cutoff
  (apples-to-apples) and final coverage after D+1 finalization** — the second number is the
  Telegram-rationing answer and the "our score improves over time" story made visible.
  (c) Implement window alignment + dual display IF derivable from existing validation-run data
  (multiple runs per digest date may already exist) with zero-or-one additive migration;
  re-score backfill limited to the last 7 days within the $5 cap. (d) If it needs more than
  one additive migration, a pipeline restructure, or >$5, **park with a full written design**
  (`docs/designs/ISW-CUTOFF-SCORING.md`) for an attended session — a wrong-but-shipped
  scoreboard methodology is the worst outcome this sprint can produce. Any change to displayed
  historical numbers must be called out in the morning note with before/after.
- **R7 — Post-auth redirect:** magic-link completion must land on `/` (the signed-in home).
  Verify; fix if it lands elsewhere; test.
- **R8 — Facebook/platform segmentation is FILED, not built.** Add an OPEN-TASKS item: registry
  sources that are platforms (facebook.com, t.me root, x.com root) must be segmented to
  page/channel/account level in the ingestion registry; note it's also a registry-credibility
  blocker for ever un-hiding the registry. No pipeline work this sprint.
- **R9 — The X-ingestion-paused banner stays** (it's honest operational transparency). If W1's
  time work touches it, keep semantics identical.
- **General:** not covered → reversible default + ledger; irreversible → park. Never
  deploy-to-find-out.

## 4. W0 — DIAGNOSIS FIRST (read-only; nothing builds before this readback is written)

1. **Reproduce the contradiction from data:** for ru/ua/ir on 2026-07-12, pull digest rows,
   run/track timestamps, and the exact queries feeding "Digest generated", "Digest claims,
   today", "Data current as of", and "Next update". State precisely why the card showed
   `not yet generated` + `14 claims` + `current as of 10:45 AM ET` at ~10:45 ET.
2. **Inventory every user-facing timestamp** (home cards, tiles, digest pages, scoreboard,
   archive) → source field, tz handling, day-boundary logic. Flag every inline date-math site.
3. **Map the actual cadence** post-MR3: which crons run when (UTC and ET), what each writes
   (intraday delta vs final vs D+1 finalization), and what "a digest exists for today" should
   mean for each hour of the day.
4. **W4 audit** per R6(a), including whether existing validation runs already store enough to
   derive at-cutoff vs final coverage without schema change, and ISW's actual publication
   pattern as observable in the stored baseline data (their report timestamps/windows).
5. Write the readback (opening section of the morning note): findings 1–7 each CONFIRMED /
   AMENDED / reshaped, with evidence. Then build on the confirmed set.

## 5. WORKSTREAMS (independent; one commit each)

### W1 — Time-model truth (Fable/Opus high; correctness-critical)
Shared day-boundary + formatting helpers (R1), `docs/TIME-MODEL.md`, cadence-aware digest
status per R2 across home cards AND anywhere else the same status appears, fix any genuine
tz/day bugs found in W0. Tests are the heart: day-boundary matrix (00:30 ET, 10:45 ET,
15:45 ET, 23:30 ET; UTC-rollover hours 20:00–23:59 ET), status-state machine per cadence
stage, claims-today consistency invariant (the R2 hard rule as an executable test), banner
semantics unchanged (R9).

### W2 — Signed-in home reorder + redirect (Sonnet 5)
Implement R3 exactly; verify/fix R7. Tests: section order, headline length (one line at
1280px), CTA absence signed-in / presence signed-out, whole-card link + nested scoreboard
link a11y, redirect target, i18n keys. Signed-out home test-pinned unchanged.

### W3 — Scoreboard explainer (Sonnet 5)
Per R4: explainer block on the scoreboard page, per-metric "how to read" lines, one-line
caption above the home tiles. All i18n'd. Tests: rendering, keys, no layout regression on
scoreboard drill-downs.

### W4 — ISW-cutoff-aligned scoring (Fable/Opus high; money path; per R6)
Audit (done in W0) → implement or park per R6(c)/(d). If implementing: matched-window logic
with tests (synthetic fixtures for window overlap/edge days), dual-metric computation, display
at-cutoff + final on scoreboard (and the home tiles show final, labeled), 7-day capped
backfill on a disposable Neon branch first if it writes anything, before/after table in the
note. If parking: the design doc, plus the cheap subset that IS safe (labeling the existing
number honestly — e.g. "coverage at our 3:30 PM ET publish vs ISW's full day" — costs $0 and
removes the silent apples-to-oranges).

### W5 — Registry gating (Sonnet 5, per R5)
Server-side admin check, 404 for non-admins on all registry routes, nav/rail/on-page link
removal, mailto relocation, env setup + readable-verify. Tests: admin sees registry, non-admin
404s (signed-in and signed-out), nav renders without registry items for non-admins, mailto
present on digest pages, `ADMIN_EMAILS` unset ⇒ everyone 404s (fail closed).

### W6 — Docs ride-along
OPEN-TASKS: add the R8 platform-segmentation item; close/update anything this sprint resolves;
uk strings appended to the review inventory; AGENTS.md decision log + PROGRESS.md.

## 6. VERIFICATION & DEPLOY (you)

1. Full gate green per workstream and assembled (count ≥ baseline); `next build` route table —
   no unintended rendering-mode flips.
2. Local dev-server drive: home shows R3 order with an internally consistent theater card at
   the current real hour; simulate at least one other cadence stage via fixture/mocked clock;
   scoreboard explainer renders; registry 404s without admin email, renders with it; digest
   footer has both mailtos.
3. Merge, push, record READY id, deploy, wait READY.
4. Signed-out prod smoke: `/` 200 hero intact + NO registry nav items; registry routes 404
   signed-out; scoreboard 200 with explainer; digest page 200 with anchors + both mailtos;
   `/search` still 307 signed-out; `/health` 200. Any red → A3.
5. **Morning note** `docs/reviews/ANALYST-TRUST-NOTE-<date>.md`: ① outcome; ② W0 readback (the
   contradiction explained plainly — this is the section Gregory reads first); ③ TIME-MODEL
   summary + what was actually buggy vs mislabeled; ④ W4: audit verdict, what shipped vs
   parked, any number changes before/after; ⑤ registry gating mechanism + how Gregory grants
   admin to someone (one line); ⑥ Gregory's interactive checklist — reload home at a few
   different hours and confirm the card story matches reality each time; click a theater panel
   (whole card) into today's digest; read the scoreboard explainer cold and judge if a
   stranger-analyst gets it; confirm registry 404s in incognito and renders for
   go@vociferous.nyc; sign out/in via magic link and confirm landing on `/`; ⑦ parked items +
   runbooks; ⑧ spend (cap $5; state actual).

## 7. DEFINITION OF DONE

Full ship, partial ship with runbooks (an R6(d)-parked W4 with its design doc is a GOOD
outcome), or rollback with diagnosis — all written up. In all cases: the contradiction from
finding 1 is impossible on the shipped home page (enforced by test), every timestamp's meaning
is documented and labeled, no scoreboard number changed without a written methodology note,
registry fail-closed, spend ≤ $5 stated, ledger complete, nothing guessed.

Begin with §1 preconditions, then W0.
