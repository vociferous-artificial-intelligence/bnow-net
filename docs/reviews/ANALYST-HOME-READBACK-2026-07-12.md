# Analyst home & Iran prominence sprint — Task 0 readback (2026-07-12)

Plan: `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md` (installed this session from the
planning document; it was not previously in the repo, nor was the executing prompt —
per the plan's own provenance rule, the prompt's compression + this repo verification
are the working basis). Where the plan and the disk disagreed, the disk won; every
amendment is recorded here.

## Preconditions — all PASS

1. **ASK-polish concluded: FULL SHIP.** `docs/reviews/ASK-POLISH-NOTE-2026-07-12.md`
   on main; deploy `bnow-qdesocr6p` aliased; no rollbacks. Binding inputs absorbed:
   the home Ask box EXISTS (signed-in only, zero-JS GET form — compose around it),
   `src/lib/ask/currency.ts` EXISTS (corpus-wide max(claim_date), 5min TTL),
   digest `#c{claimId}` anchors EXIST (`digests/[country]/[date]/page.tsx:226`).
2. **No concurrent session.** main == origin/main at `5ae6609`; only stale merged
   worktrees under `.workstream/` (both branches merged); working tree clean except
   the gitignored-in-spirit `data/embed-backfill-checkpoint.json` (untracked, left alone).
3. **Baseline green.** 956 tests / 74 files pass (~3s).

## Iran quality gate — VERDICT: PASS (public prominence ships)

Verified against prod DB, read-only:

- **Digests exist and are current**: ir has all 3 tracks (military, nuclear,
  elite_politics) generated daily through 2026-07-12, on the mapreduce engine
  since 07-09, rendered_md ~1–3KB each (not thin).
- **Claim counts comparable to peers**: ir 4–11 claims/digest over 07-08→07-12
  vs ru 6–12, ua 4–13.
- **Rendered content presentable**: sampled ir/military 07-11 — multi-event,
  hedging-labeled, doc-linked (Hormuz closure, CENTCOM strikes, southern Lebanon).
- **Validation on par or better**: 07-11 coverage ir 100% vs ru 57.1% / ua 37.5%;
  ir trend 07-08→07-11: 33.3 → 25.0 → 50.0 → 100.0. The 07-10 review's
  "IR parity 57.5% vs RU 74.2%" concern is NOT the current picture; no post-sprint
  Iran-quality emergency follow-up is warranted on this evidence (keep the
  scoreboard watch).

## Workstreams — confirmations and amendments

**W1 quick-strip (CONFIRMED, reshaped by disk).** The signed-in home already has most
of the skeleton: `TheaterStatusPanel` (data-currency from max(fetched_at), docs-24h,
digest link, next update) + `HomeValidationTiles` + Ask box, all fed by inline queries
in `src/app/page.tsx`. So W1 is an upgrade, not a build: render the digest **date**
visibly (fetched as `latestDate` but currently unshown — only `created_at` shows),
add a claims-today count per theater (cheap: `claims` is digest-claims only,
few-thousand rows), add a per-theater scoreboard link (to `/scoreboard/{iso2}/{date}`
of the latest validation run when one exists). Per-theater data-currency stays on
max(fetched_at) (already there); `currency.ts` is corpus-wide and stays ASK's.

**W2 quick-links rail (CONFIRMED).** Net-new section under the hero: latest +
previous digest links (with dates) for ru/ua/ir, then scoreboard / registry /
signals. "Yesterday" implemented as second-most-recent digest_date (never a dead
link). Needs one new inline query (top-2 dates per theater).

**W3 public Iran/Gulf card (CONFIRMED — gate passed).** Additive new section between
the marketing-cards grid and the footer (`page.tsx:335–337`); the 3-card grid is
untouched (a 4th card would break `sm:grid-cols-3` symmetry). Calm regional framing;
links `/countries#ir` (standing ruling 15 — theater pages don't exist) and
`/scoreboard` (public). No hero/CTA changes; signed-out substance otherwise untouched.

**W4 digest archive (CONFIRMED — the hypothesized gap is real).** `/digests` and
`/digests/[country]` both 404 today; nothing enumerates available dates; yesterday's
digest is unreachable except by URL surgery or an ASK/entity deep link. Ship: new
`/digests/[country]` archive index (inherits the existing `requireUser` layout gate
automatically), prev/next date nav on the digest page, breadcrumb to the archive.
Ride-alongs (small, adjacent, ledgered): scoreboard detail page gains a link to the
digest it scores (same URL grammar, currently no cross-link), and the digest page's
hardcoded English strings switch to the catalog keys that already exist for them
(`digest.no_events`, `digest.view_for`, `digest.track.*`; one new key
`digest.track.nuclear`).

**W5 feedback mailtos (CONFIRMED, one addition).** No mailto affordance or support
address exists anywhere in src/. New `FEEDBACK_EMAIL` env (plain, readable) drives
both affordances; when unset the affordances render nothing (fail-closed, additive).
Digest pages: "Flag this digest" with subject prefilled `[BNOW digest] {iso2} {date}`.
Registry detail: "Suggest or flag a source" with source identity in the subject.
Both surfaces are behind `requireUser`, limiting address harvesting.

**W6 recent asks (CONFIRMED feasible — ships).** `ask_usage` stores `user_email` +
`question` (400-char truncated) + `created_at` with a `(user_email, created_at)`
index. Signed-in home gets "your recent questions": last 5 distinct questions →
`/ask?q=` prefill links ($0 by the ASK-polish GET-never-executes rule). No migration.

**W7 free claim search (SEPARABILITY CALL: SHIPS).** Evidence: the ONLY `ask_usage`
writer is `limits.ts` (`askWithLimits`/`logUsage`); `provider_usage` writes happen
only in stage guard `record()` calls; in `retrieveV2` the embed guard is constructed
*inside* the vector-arm branch. The tsvector lexical arm (`retrieve-v2.ts:150–196`)
is $0 and network-free but inline — and calling `retrieveV2` in prod WOULD fire the
paid embed arm (OPENAI_API_KEY present). Design therefore: extract the lexical block
into an exported function in a new module; `retrieveV2` calls it (mechanical move,
existing ask tests must stay byte-green); the new gated `/search` page calls it too.
Hard $0 by construction: no SpendGuard import, no embeddings import, SELECTs only,
no usage-row writes — pinned by tests. Result rows already carry everything a result
needs (`claimId`, `text`, `claimDate`, `countryIso2`, `hedging`, `confidence`) and
deep-link as `/digests/{iso2}/{date}#c{id}` (the ask-result.tsx template).

## Decisions taken this session (reversible defaults; ledger)

1. **FEEDBACK_EMAIL=go@vociferous.nyc** set in Vercel prod+preview+dev (plain,
   readable) + `.env.local`. Rationale: the operator's address; the structured
   feedback feature is deliberately deferred (plan §2.5 Gap 3). Reversal = change
   the env var. Affordance hidden entirely when unset.
2. **Locale strategy for new strings**: en + provisional uk (appended to
   `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md` inventory), other locales fall back
   to en — the ask-polish precedent; the i18n test suite requires placeholder parity
   only for keys a locale actually defines.
3. **Nav untouched.** /search is reachable from the signed-in home rail; adding it
   to the nav Product group is deferred (nav carries frozen-URL and all-locale-label
   invariants; a one-line follow-up once the surface proves itself).
4. **No new role gating.** The repo HAS a role model (user<analyst<admin) but the
   quick-strip/rail/archive/search are navigation + claim text — the same material
   the existing signed-in surfaces already show `user`-role accounts. Registry
   reduced-view continues to gate reliability scores; nothing new leaks them.
5. **Scoreboard→digest cross-link** shipped as a W4 ride-along (one additive line,
   serves the plan's own "retrospective divergence analysis" workflow).
6. The executing prompt's full decision register was not on disk; where its visible
   fragments and the plan didn't answer a question, the reversible default above was
   taken. Nothing irreversible is in scope; migrations remain zero.

## Execution shape

Branch `20260712-analyst-home-iran` from `5ae6609`, tag `pre-analyst-home-20260712`.
I pre-add all new i18n keys + the feedback-email helper (serializing the two
shared files), then three parallel build tracks with disjoint file sets:
A = W4+W5 (digests/**, scoreboard detail, registry detail), B = W1+W2+W3+W6
(page.tsx, theater-status-panel, home tests), C = W7 (lexical extraction + /search).
I review every diff, commit per workstream, run the full gate, deploy if green,
smoke signed-out pages, then write the morning note + AGENTS.md/PROGRESS updates.
LLM spend this sprint: $0 (no paid calls anywhere in scope).
