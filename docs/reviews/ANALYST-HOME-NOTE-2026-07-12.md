# Analyst home & Iran prominence sprint — morning note (2026-07-12, unattended)

## ① Outcome

**FULL SHIP — all seven workstreams, nothing parked.** Merged `--no-ff` to main
(`4482669`), deployed **`bnow-jihmibgm6`** (READY, serving on the project domain),
all signed-out prod checks green. **Rollback target recorded before deploy:
`bnow-qdesocr6p`** (`npx vercel@latest rollback bnow-qdesocr6p-vociferous.vercel.app`).
Tag `pre-analyst-home-20260712` on the pre-sprint main. Tests **956 → 996** (74 → 79
files); typecheck/lint/`next build` clean; enforced pre-push gate green. **LLM spend:
$0.00** (nothing in scope makes a paid call — verified live, see ⑤).

Plan `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md` (installed this session) · Task 0
readback `docs/reviews/ANALYST-HOME-READBACK-2026-07-12.md`. Commits, one per
workstream cluster on branch `20260712-analyst-home-iran`: `8c49a10` i18n+feedback
pre-stage · `8def883` digests archive/nav/mailtos · `aa06648` search · `176d2f8` home.

## ② Iran quality gate — PASS (the readback has the full evidence)

ir digests: all 3 tracks daily through 07-12 on the mapreduce engine, 4–11
claims/digest (ru 6–12, ua 4–13), sampled content presentable; validation 07-11
coverage **ir 100%** vs ru 57.1 / ua 37.5. The 07-10 review's "IR parity 57.5 vs RU
74.2" concern is stale — **no post-sprint Iran-quality emergency sprint is warranted**;
keep the standing scoreboard watch. Public prominence shipped on this evidence.

## ③ What shipped, per surface

- **Signed-in home** (`/`): quick-links rail under the hero (latest + previous digest
  dates × ru/ua/ir, then scoreboard / registry / signals / claim search); theater
  cards now lead the digest link with the **digest date** (`2026-07-12 · 09:12 ET`),
  show a **Digest claims, today** row, and carry a per-theater **scoreboard →** deep
  link to the latest validation run; **Your recent questions** under the Ask box —
  last 5 distinct questions as `/ask?q=` prefill links (never auto-executes, the
  ask-polish rule; block omitted when empty).
- **Signed-out home**: one additive Iran/Gulf section after the marketing cards —
  calm regional framing, links `/countries#ir` (ruling 15) + `/scoreboard`. Hero,
  CTAs, live-now line, and all three marketing cards untouched (test-pinned +
  prod-verified).
- **Digest archive** (the plan's "highest value-per-effort"): new `/digests/[country]`
  index (date / tracks / claims table, newest first, auto-gated by the existing
  layout), prev/next date nav + archive breadcrumb on every digest page, and the
  scoreboard detail page now links to the digest it scores. Digest pages also picked
  up their existing-but-unused catalog keys (`digest.no_events`, `digest.view_for`,
  `digest.track.*` + new `nuclear`).
- **Feedback mailtos** (zero backend): "Flag an error in this digest" on digest pages
  (subject `[BNOW digest] {iso2} {date}`) and "Suggest or flag a source" on registry
  detail (subject `[BNOW source] {name} (id N)`). Driven by new env `FEEDBACK_EMAIL`
  — set to `go@vociferous.nyc` in all three Vercel envs (plain type, value verified
  by round-trip) + `.env.local`; affordances render nothing if it's ever unset.
- **Free claim search** `/search` (signed-in): the ASK v2 lexical/tsvector arm,
  extracted to `src/lib/ask/lexical.ts` and shared by `retrieveV2` (mechanical move —
  all 252 pre-existing ask tests green with ZERO edits). Zero-JS GET form; results
  carry hedging badge, theater, date, and `/digests/{iso2}/{date}#c{id}` deep links;
  honest `showing N of TOTAL` line; time-window phrases parse ("strikes since July
  10"). GET-with-q executes here BY DESIGN — it is $0 deterministic SQL, the opposite
  contrast to /ask is documented in the page source so nobody "fixes" it.

## ④ i18n

31 new keys, en + provisional uk (inventoried in
`docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md`); other locales fall back to en.

## ⑤ Verification evidence

- **Gate**: 996 tests / 79 files, typecheck, lint, full `next build` (both new routes
  registered) — all green pre-merge; pre-push hook green on push.
- **Live local drive** (dev server against prod DB, read-only): home Iran card +
  intact marketing cards; archive lists real dates; digest page prev/next + mailto +
  track labels; search returns ranked real claims with working deep links; scoreboard
  cross-link; registry mailto with real source name.
- **$0 proof, live**: five real `/search` queries against prod data moved neither
  `ask_usage` (28 → 28) nor `provider_usage` (343 → 343 requests today). Also pinned
  by tests that make SpendGuard/embeddings/askWithLimits THROW if touched.
- **Prod smoke (signed-out)**: `/` 200 with Iran card + all prior sections; `/health`
  200; `/search` and `/search?q=` 307 → signin (gated, no execution); `/digests/ru`
  307 (new route exists, gated — not 404); `/scoreboard/ru/2026-07-11` 200 with the
  digest cross-link; `/countries` `/signals` `/scoreboard` 200.
- **Deep-link soundness**: verified zero divergence between `claim_date` and
  `digest_date` across all 846 digest claims — the `#c{id}` links are exact today;
  latent coupling filed as OPEN-TASKS #54.

## ⑥ Your interactive checklist (needs a signed-in session)

1. Home: quick-links rail reads naturally at your screen width; theater cards show
   date-led digest links, claims-today, scoreboard →.
2. Recent asks: your smoke questions from last night should appear; click one →
   /ask prefilled, NOT executed (no spinner until you press Ask).
3. Archive: from any digest, "digest archive" → date table → yesterday loads;
   prev/next round-trips.
4. `/search`: try "Hormuz closure since July 9" → results land ON claims in digests
   (anchor + sticky-header clearance).
5. "Flag an error in this digest" opens your mail client with the right subject.
6. Signed-out (incognito): Iran/Gulf card reads calm, not breathless; nothing else
   moved.
7. Dark mode spot-check: rail, archive table, search hedging badges.

## ⑦ Parked / follow-ups (with owners)

- **OPEN-TASKS #54**: claim_date↔digest_date deep-link coupling (both /ask and
  /search) — zero divergence today, fix is one column in two queries if intraday
  framing ever changes.
- **OPEN-TASKS #55**: /search into the nav Product group once it proves itself
  (deferred: nav invariants want all-locale labels).
- **Watch list** (plan §6, unchanged, no prompts): per-user default theater, saved
  claims, day-over-day delta view, digest export, structured source-feedback table
  (trigger: mailto volume), "analyst daily brief" email, Iran/Gulf bundle SKU.
- The uk strings await native review (inventory updated, +31).
- `.workstream/` still holds the two merged worktrees from the 07-11 sprints —
  harmless; prune with `git worktree remove` when convenient.

## ⑧ State for the record

main == origin/main == deployed `bnow-jihmibgm6` (previous prod `bnow-qdesocr6p` is
the rollback). No migrations (prod head stays 0016), no new dependencies, no cap-env
changes; one new env `FEEDBACK_EMAIL` in prod+preview+dev (plain, readable, verified).
Branch `20260712-analyst-home-iran` kept (merged). OpenAI spend this sprint: $0.00.
