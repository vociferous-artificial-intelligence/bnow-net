# Implementation note — commercial design & site-structure build (2026-07-11)

**Branch:** `20260711-design-commercial-site` (local only — NOT pushed, NOT merged, NOT
deployed). Built from `main` @ `c49b79f` in the worktree
`.workstream/20260711-design-commercial-site`. Spec inputs:
`docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md` (the 07-11 eval) + the operator's
Decision Register (D1–D5, quoted where applied below).

**Session paid spend: $0.00.** No OpenAI/X/OpenSanctions calls; no Postmark email sent;
all DB access SELECT-only (`scripts/sqlq.ts` + read-only dev-server page renders). The
one generated migration was **not** applied to Neon.

**Verification state at hand-off:** `npm run typecheck` clean · `npm run lint` clean ·
`npm test` **638/638 across 53 files** (baseline before this build: 506/44). Dev-server
checks (port 3788, signed-out, live Neon reads) confirmed: security boundaries (below),
no raw i18n-key leakage, skip link + `id="main"`, digest ClaimSources collapse rendering
live ("+3 more · 3 channels · 3 platforms" on the 2026-07-11 ru digest). Main checkout
untouched (0 modified files, still at `c49b79f`).

---

## 1. What landed (one commit per workstream)

| Commit | Workstream | Routes/components |
|---|---|---|
| `c9df408` | E1 — role model | `drizzle/0014_square_silver_centurion.sql` (**generated, NOT applied**: `ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL`), `users.role` in `src/db/schema.ts`, `Role`/`roleAtLeast`/`currentRole`/`requireRole` in `src/lib/gate.ts` (+24 tests). `requireUser`/`requireAdmin` byte-identical. |
| `bba0eea` | H1 — error boundaries | `src/app/error.tsx`, `src/app/global-error.tsx` (+6 tests). Never renders `error.message`; digest shown as muted reference code. |
| `a1ce392` | A — ClaimSources | `src/components/claim-sources.tsx` (+14 tests), adopted in `src/app/digests/[country]/[date]/page.tsx` (replaces the uncapped chip loop; query gains `s.id AS source_id`). Diversity selection per eval §4. |
| `0edf3cf` | C — theater status panel | `src/components/theater-status-panel.tsx` (+8 tests), `src/lib/cron/next-fire.ts` (+12 tests), signed-in branch of `src/app/page.tsx`. Signed-out marketing cards byte-identical. `home.status.*` en+uk. |
| `e17c673` | F — pricing | `src/app/pricing/page.tsx` rebuilt; `src/lib/pricing/tiers.ts` (+19 tests). Standby + Full analyst (DB-priced), Regional bundles + Enterprise/API (on request). |
| `51bee00` | G — scoreboard/countries | targets-vs-actuals sublines + thin-sourced tile + nonzero-day mean on `/scoreboard` (helpers in `src/lib/scoreboard/summary.ts`, +14 tests incl. median), freshness line on `/countries`, `overflow-x-auto` table wrapper. |
| `1834b2d` | B — signals | `detectPurge` dedupe fix (B1), signed-in server-rendered evidence via ClaimSources inside `<details>`, signed-out count+sign-in only (D3), page chrome i18n'd (B3). +6 tests. |
| `0790723` | D — home validation tiles | `src/components/home-validation-tiles.tsx` (+13 tests) under the theater panel (signed-in only); signed-out buyer-journey tertiary link line (proof → coverage → validation → request access). |
| `f1ddcc4` | E2+E3 — registry moat | `src/lib/registry/view-policy.ts` (+16 tests) consumed by `/registry`, `/registry/[id]`, `/middle-east`; "Scores as of" lines (all roles). |
| `7877921` | H2 — a11y sweep | Skip-to-content link in `src/app/layout.tsx`, `id="main"` on all 10 touched pages, `overflow-x-auto` wrappers on the registry/middle-east tables. |
| `e9fd152` | Wave-3 i18n merge | ~60 en+uk keys merged into `src/i18n/dictionaries.ts`; `i18n.test.ts` interpolation var map extended (`n, channels, platforms, total, pct, amount, time, days`). |
| (final) | supervisor | `src/lib/session.ts` docstring corrected (error boundaries now exist), this note. |

## 2. Security posture (E2 reviewed line-by-line by the supervisor before commit)

- **D1 (registry moat):** `registryView(role)` in `src/lib/registry/view-policy.ts` is
  the single policy source; only `analyst`/`admin` get the full view; `user`, `anon`,
  and any unknown/degraded role value fail closed to the reduced view. Reduced view
  keeps search/filter/methodology-prose/citation-counts/spans/hedging-mix; removes the
  reliability column, reliability sort (`?sort=reliability` is ignored server-side, not
  just unlinked), the detail-page score values, and the exact weight constants
  (qualitative sentence instead). `/middle-east` goes further: the reliability `CASE`
  expression is spliced out of the SQL for reduced roles (never computed). Detail pages
  re-check the role independently (sequential ids → id-walking defense).
- **D3 (signals):** signed-out `/signals` HTML verified by curl to contain zero claim
  text, zero doc URLs, zero `<details>` — the evidence query does not even run without a
  session. Boundary is `currentUserEmail()` deliberately, NOT `requireUser()` (whose
  gate-off dev bypass would leak evidence to anonymous visitors on a public page).
- **Accepted residuals:** (a) hedging-mix bars + the qualitative weight ordering allow
  coarse score approximation — accepted; D1 explicitly keeps hedging mix. (b) On reduced
  views, `reliability_score` is still fetched into server memory (`select()` all-columns
  on `/registry`, `SELECT *` on `/registry/[id]`) but never rendered; optional hardening
  = explicit column lists. (c) Reliability stays visible in-context on gated digest
  chips for all signed-in users — that is D1's design, not a leak.
- **Not live-verified (needs a real session):** the signed-in renders (home panel +
  tiles, signals evidence expansion, reduced-vs-full registry as a non-admin). Component
  logic is unit-tested and the JSX was line-reviewed (matched header/cell conditional
  pairs); eyeball these after the first deploy.

## 3. Decision Ledger

1. **Prompt-vs-disk corrections (Phase 0):** main checkout was CLEAN (the prompt's
   "uncommitted recon changes" warning was stale) and the eval doc is tracked on `main`
   (no cherry-pick needed). `vercel.json` intraday digest crons now carry `&slot=` params
   the route still ignores — B4 shrank accordingly. Scoreboard UI already said
   "thin-sourced". `subscribe_intents.plan_code` has an FK to `plans.code` — shaped F.
2. **A / ≤8-doc branch (supervisor correction):** the agent deduped channels even when
   nothing collapses, silently dropping evidence links a user could no longer reach.
   Ruling: ≤8 docs → render ALL docs (no dedup, no `<details>`); dedup applies only when
   collapsed, where the remainder stays reachable inside the disclosure. The hidden
   remainder is NOT re-deduped (matches the eval's own worked example "+9 more · 4
   channels"). My spec caused the ambiguity; agent not at fault.
3. **C / placeholder-free i18n convention:** `i18n.test.ts`'s blanket interpolation
   check rejects unknown `{token}` names; C designed `home.status.*` label/value keys
   placeholder-free. For A/F/G's placeholder-bearing keys the supervisor instead
   extended the test's var map at merge time. Both patterns are now legitimate; the var
   map comment says new tokens must be registered there.
4. **F / pricing truth-in-UI:** bundles named by geography only ("Russia – Ukraine",
   "Gulf / Middle East") WITHOUT the brief's full country lists — listing them would
   overclaim currently-shallow coverage. "Upgrade … at pre-agreed pricing" instead of
   the brief's "one-click upgrade" (no such mechanic exists; Stripe is off). Unknown/
   tampered plan codes map to `plan_code NULL` + `[tier:…]` note prefix, allowlisted
   against the LIVE plans query at submit time (FK-safe). Four staged `pricing.*` keys
   (title, cta.subscribe, cta.request, email_placeholder) reused over F's near-identical
   proposals — they already exist in all 7 locale catalogs.
5. **G / median fix (supervisor):** the "median information lead" tile computed a MEAN
   (pre-existing mislabel G flagged per ask-don't-guess). Added `medianLeadHours` and
   wired the tile to it; label unchanged and now truthful; mean helper retained.
6. **E1 semantics:** role is plain text (not a pg enum) to keep migration 0014 trivially
   additive; role never enters a JWT (database sessions); gate-off (`FEATURE_AUTH_GATE
   !== "true"`) resolves `currentRole()` to `admin` — consistent with `requireUser`'s
   existing gate-off-open posture, so no second narrower gate exists in dev.
7. **B scoping:** signal headlines/details remain English — they are generated
   analyst-output templates (data-like), not chrome; page chrome is fully i18n'd.
   Only-purge signals carry claim ids; `evidenceRefs` signals stay text-only.
8. **D metric framing (D2):** corroborated share (≥2 sources) is the surfaced trust
   metric; `unsupported_claim_rate` is never rendered on home under any name; the tiles
   distinguish honest `0%` from "not yet computed" (null).
9. **H1 fallback tables kept:** `FALLBACK_EN` in the error boundaries is now inert
   (keys merged) but retained — an error surface rendering a raw key string during any
   future catalog refactor is the one place belt-and-braces is justified.
10. **D key reuse:** the signed-out buyer-journey line reuses `pricing.cta.request` for
    its "request access" link (exact semantic match already live on `/pricing`).
11. **E2 security review** performed by the supervisor in place of an Opus pass
    (findings in §2); PASSED with the three accepted residuals listed there.

## 4. Parked / deliberately not done

- **B4 (optional stretch — cron slot qualifier):** skipped. `vercel.json` already passes
  `&slot=` on the three intraday digest crons; `digest/route.ts:32`'s qualifier is still
  `group ?? mode`. One-liner (`group ?? slot ?? mode`) + test whenever wanted; low value
  now that the slot is at least visible in the cron URL/path.
- **Live signed-in verification:** needs a real magic-link session (operator mailbox);
  see §2 last bullet.
- **uk pluralization for `sources.more_summary`:** Ukrainian needs count-dependent noun
  forms ("каналів/канали") that flat `{n}` interpolation cannot express; shipped the
  genitive-plural form as the least-wrong constant. Native review below.

## 5. Pending Gregory decisions / actions (BEFORE deploying this branch)

1. **Apply migration 0014 to Neon** (`npm run db:migrate`) before or with the deploy.
   The code degrades safely if you forget (every non-allowlisted account resolves to
   `user` → reduced registry view), but role grants are impossible until it's applied.
2. **Populate `ADMIN_EMAILS` in ALL Vercel envs before the deploy.** It is the bootstrap
   admin path (works pre-migration). Without it, every account — including yours — gets
   the reduced registry view. Note this is fail-closed, not lock-out: no page 403s/
   redirects on role, views just reduce.
3. **Grant analyst roles** (post-migration) to paying/trusted users:
   `UPDATE users SET role='analyst' WHERE email IN (…)`. No UI exists for this yet
   (deliberate — ruling 6 territory; propose-only tooling later).
4. **D5 recommendation (recorded, not built):** make `scripts/registry-materialize.ts` a
   weekly cron (or scheduled operator run) so the new "Scores as of" line stops reading
   8 days stale (currently 2026-07-03 vs reports crawled through 07-10).
5. **uk native review** (all new uk strings are non-native; the flagged-most-uncertain):
   `sources.more_summary` (plural forms), `home.status.x_paused`,
   `home.validation.median_lead_label`, `home.validation.corroborated_label`,
   `signals.intro`, `signals.evidence.*`, the three `registry.*` strings (supervisor-
   authored), and the ~38 `pricing.*` strings.
6. **Post-deploy eyeball list:** signed-in home (panel + validation tiles), `/signals`
   evidence expansion while signed in, `/registry` as a non-admin (reduced) AND as an
   `ADMIN_EMAILS` account (full), a high-chip digest claim's `<details>` behavior.
7. **AGENTS.md/PROGRESS/OPEN-TASKS were deliberately not touched on this branch**
   (collision guard per the session ground rules). On merge, the Current state
   "Surface" line and OPEN-TASKS #11 (targets-vs-actuals: now shipped) warrant the
   usual correct-in-place pass; this note is the source.
