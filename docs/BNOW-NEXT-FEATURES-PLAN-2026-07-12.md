# BNOW.NET — Next Features Plan: Analyst-First Home & Iran Prominence
**Date:** 2026-07-12 · **Prepared for:** Gregory · **Role lens:** PM + CTO + GTM combined
**Basis:** product brief (2026-07-04), review & plan (2026-07-10), ASK assessment (2026-07-11), nav restructure prompt, ASK-polish sprint prompt (2026-07-12, running now). Written **without repo access** — every repo-state claim below is a hypothesis the executing Claude Code session must verify before acting (same rule as the 2026-07-10 review).

---

## 1. The strategic read

Three facts drive this plan:

1. **Your SME network is Russia/Ukraine.** Jason Smart plus other Ukraine contacts are the people who will actually *use* the product daily and tell you what's wrong with it. They are your design partners, your validation loop, and — per the brief's beachhead math (§6.4) — the prototype of your first paying analyst seat. The product surface they touch every morning should require zero navigation to get to RU/UA material.

2. **Iran is the live crisis, and the brief already told us how to play it.** §6.5 is explicit: crisis attention runs 6–12 weeks acute, ~5 months of budget-holder interest; the move is to treat the spike as a conversion window, **bundle geography not crisis** (sell "Iran / Gulf," never "the Iran war feed"), and never surge-price. So Iran prominence on the public homepage is a *conversion* play with a clock on it, and it must be framed as durable regional coverage. There is one gate: the 2026-07-10 review flagged Iran digest quality as an open debt item (IR parity 57.5% vs RU 74.2%). **We do not market what embarrasses us** — the sprint must verify the Iran surface is presentable before raising its prominence, and if it isn't, fixing it becomes the first task, not the parked one.

3. **The signed-in home is already becoming a workbench — finish the job.** The nav sprint converted signed-in `/` from marketing pitch to working home; the ASK-polish sprint running right now is adding an Ask box to it (W5) plus pending states, citation deep links, and freshness-honest answers. The cheapest high-leverage move is to **evolve that same page into the analyst view** rather than invent a new route. One destination, compounding on work in flight.

Decisions taken (2026-07-12): analyst view = evolved signed-in home (no new route); Iran prominence on **both** public and signed-in surfaces; "analyst role" is a **view design, not a new auth role** — unless the repo already has a role/entitlement concept, in which case the executing session uses it (its call, evidence-based, no new migrations either way).

## 2. What "streamlined analyst view" means concretely

The design target is the **start-of-shift screen**: an analyst signs in at 07:30 and within one screen, zero scrolling on desktop, can reach everything the morning workflow needs. Priority order mirrors the SME network: **Russia/Ukraine first, Iran second, everything else behind the theaters index.**

**A. Theater quick-strip (the core deliverable).** Per-theater cards for RU/UA (primary position) and Iran: link to the **latest digest** with its date visible, a data-currency line ("data through {date}" — reuse the max(claim_date) helper the ASK-polish W1 is building, don't rebuild it), a small claims-today count if it's a cheap query, and a scoreboard link. The card *is* the quick link — one click to today's digest.

**B. Quick-links rail.** Today's and yesterday's RU/UA digest, Iran digest, scoreboard, source registry, signals. Plain links, keyboard-friendly, no widgets. This is the "I know where I'm going" path for repeat users; the cards are the "orient me" path.

**C. The Ask box** (arriving via ASK-polish W5) stays where that sprint put it. This sprint does not move or restyle it — it *composes around* it. If W5 parked, the quick-strip still stands alone and the Ask box remains that sprint's parked item.

**D. Recent asks (stretch, only-if-free).** If `ask_usage` already stores user + question text, a "your recent questions" list (linking to `/ask?q=…` prefill — which per ASK-polish R3 never auto-executes) closes the provenance-recall loop from the ASK assessment §1. If the schema doesn't support it cleanly, park it — **no migrations**.

**E. Design-partner feedback affordance (tiny, GTM-critical).** Jason and the Ukraine contacts will find digest errors no eval catches. A minimal "flag this digest" affordance (mailto with prefilled subject including digest date/theater is acceptable v1 — zero backend) turns their reading into structured feedback. This is deliberately crude; a feedback table is a later sprint if volume justifies it.

## 2.5 Analyst-workflow gap analysis (what the app is missing)

Walking the analyst's day against the current surface (theaters, daily digests, ask, scoreboard, registries, signals) exposes gaps in four buckets:

**Gap 1 — Past-day digests: ESSENTIAL, and cheap. Promoted to core scope.** Digests are already addressable per date (`/digests/{country}/{date}` per the ASK-polish deep-link work), but there is (hypothesis — verify) no archive index or prev/next navigation, meaning yesterday's digest is unreachable except by URL surgery. Analysts need this constantly: catching up after days away, tracing a claim's evolution across the week, citing a specific day's digest in their own reporting, retrospective divergence analysis. It also makes ASK's citation deep-links to older digests navigable once landed on. Estimated effort: prev/next links on digest pages + a per-theater archive index page — about a day if the routing assumption holds. This is the highest value-per-effort item in the sprint.

**Gap 2 — Free claim search: the missing recall layer.** ASK's retrieval already runs a keyword/tsvector match before the paid LLM stage. Exposing that stage alone as a plain search page — query in, matching claims out with reliability, date, and digest deep-links, $0 per query, no LLM — serves the "find the citation I half-remember" workflow (the ASK assessment's own core use case) without touching the ask budget. ASK = paid synthesis; search = free recall. Included as a gated stretch workstream: ships if the retrieval candidate stage is cleanly reusable, parks into its own follow-up sprint if not.

**Gap 3 — Source feedback channel: crude by design, structured version deferred.** A "recommend a source / downgrade a source" typed-input feature is premature — Jason telling Gregory directly is higher-bandwidth than any form, and the structured version needs storage, a review workflow, and abuse consideration. V1 is the mailto affordance (§2E) extended with a second variant on registry pages ("Suggest / flag a source", prefilled subject with source name). The structured feature moves to the watch list with an explicit trigger: build it when mailto volume or a second design partner makes the human channel lossy.

**Gap 4 — Considered and deliberately deferred** (each with its trigger): saved/pinned claims and bookmarks (needs per-user storage; trigger: analysts asking for it); day-over-day "what changed since yesterday" delta view (real value, but heavier synthesis work and MR3's intraday delta framing partially covers it; trigger: after archive nav ships and usage shows multi-day reading); copy-claim-with-citation button (cheap polish, ride-along candidate for any future digest-page sprint); entity/topic timeline views (heavy; trigger: enterprise conversations); indicator alerting (brief Phase-3, correctly parked); digest PDF/export (trigger: a design partner asks to attach one to their own report).

## 3. Iran prominence, both surfaces

**Public homepage (signed-out):** Iran is already in the "Live now" line post-nav-sprint. Raise it one level: an Iran/Gulf coverage card or hero mention that links to the Iran theater page, framed as regional coverage ("Iran / Gulf theater — live daily intelligence"), not a named-crisis banner. Copy discipline: current, sourced, validated — the three brand words — and no breathless war framing (a provenance brand sells calm). This is conversion-sensitive real estate being touched by two sprints in one weekend, so the change is **additive and minimal**: no hero redesign, no CTA changes, signed-out page substance otherwise untouched.

**Signed-in home:** Iran card in the quick-strip (per §2A) in second position.

**The quality gate (binding):** before shipping either, the session verifies the Iran theater page and latest Iran digests are presentable — recent digest exists, renders, isn't visibly thin or broken. If the Iran surface fails the smoke, public prominence is **parked with a written diagnosis** and the signed-in card ships with whatever honest state exists (an analyst tolerates "thin coverage, improving"; a prospect doesn't). The open "Iran digest quality" debt item from the hardening sweep should be scheduled immediately after this sprint if the smoke confirms it's still weak — that's the real fix; homepage copy is not.

**Explicitly out of scope now (watch list):** an Iran/Gulf bundle SKU on the pricing page (do it when the standby tier is real), surge/crisis pricing (never, per brief), a named-crisis landing page (inherits expiration, per brief §6.5.3).

## 4. Sequencing and collision management

The ASK-polish sprint is running **right now** against main and deploys to prod. Nothing in this plan may run concurrently. Hard sequence:

1. **ASK-polish completes** → its note `docs/reviews/ASK-POLISH-NOTE-<date>.md` lands on main. Its outcome changes this sprint's ground truth (did W5 ship the home Ask box? did W1 ship the data-currency helper? did anything roll back?). The prompt does not hard-fail if the note isn't there yet: it **waits and re-checks every 30 minutes (up to 12 hours)**, doing read-only preparation in the meantime, and proceeds automatically once the note lands.
2. **This sprint runs next**, with a mandatory Task 0 that reads that note plus the two merge notes, reconciles actual home-page structure, and only then builds.
3. **After this sprint:** Iran digest quality work (if the smoke confirmed weakness), then the still-open recon/hardening items from the 2026-07-10 review, then MTProto ingest per its existing prompt.

The delivered prompt encodes all of this as verified preconditions — if the ASK-polish note is absent from main, the session STOPS rather than building on a moving target.

## 5. Why this is the right next sprint (PM/CTO/GTM cross-check)

**PM:** it's the highest-leverage UI work available — every component reuses existing pages, queries, and the in-flight Ask work; no new backend; it converts three prior sprints (nav, design merge, ASK v2) into one coherent daily-use surface.

**CTO:** zero migrations, zero new dependencies, near-zero LLM spend, additive rendering changes only, and it respects every standing invariant (URLs frozen, i18n through the existing mechanism, fail-closed budgets untouched). Risk is concentrated in one place — the signed-in home file two sprints just touched — which is exactly why Task 0 re-reads the disk instead of trusting any prompt's description of it.

**GTM:** session frequency is the anti-churn metric (brief §6.5; ASK assessment §5.2 — pull features survive the crisis-decay cycle). The analyst home is the pull surface for the people most likely to become your first referenceable users, and the Iran card catches the conversion window while it's open. The design-partner feedback loop starts turning SME attention into product improvement this week, not after an enterprise deal.

## 6. Watch list additions (no prompt, deliberately)

Per-user default-theater preference (needs storage — wait for evidence analysts want non-RU/UA defaults). Real role/entitlement system (wait for a second user class). Iran/Gulf bundle SKU + standby tier on pricing (wait for the first pricing conversation, or the crisis window forcing it). Structured source recommend/downgrade feature + feedback table and review workflow (wait for mailto volume or a second design partner — §2.5 Gap 3). Saved/pinned claims, day-over-day delta view, copy-claim-with-citation, entity timelines, digest export, indicator alerting (§2.5 Gap 4, each with its stated trigger). "Analyst daily brief" email digest of the quick-strip (wait for the home page to prove the layout). Phase-2 validation report as a sales doc (unchanged from 2026-07-10 review).

---

## 7. Delivered alongside this plan

`CLAUDE-CODE-ANALYST-HOME-IRAN-PROMPT.md` — the executing prompt. House style: verify-first Task 0, decision register with pre-answered rulings, independent parkable workstreams, session-resilience rules, spend cap, deploy + rollback procedure, morning note with your interactive checklist. Its first duty is to **review this plan against the actual repo and the ASK-polish outcome, confirm or amend the steps with a written readback, then execute** — where the plan and the disk disagree, the disk is right.
