# Analyst-beta launch-remediation — implementation note (2026-07-14)

Isolated worktree `bnow.net-analyst-beta-remediation`, branch
`codex/analyst-beta-launch-remediation`, base `b71b39a` (main == origin/main at
start). **Not deployed, not merged** — deploy is gated behind the active X
closeout and needs operator approval. Zero paid provider calls. No
migrations. No OpenSanctions / entity-cleanup work.

## Commits (code; docs are a separate final commit for post-closeout reconciliation)

- `9c7020a` email: brand-correct BNOW sender fallback (WS2)
- `f7f9af9` legal: Privacy 1.2 — correct PostHog copy to the live posture (WS1)
- `a873b7f` ask/scoreboard/i18n: working panel, honest at-publish copy, launch language subset (WS3/WS4/WS5)

## Gate (all green)

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm test` — **1460 passed / 129 files** (baseline was 1456; +4 net)
- `npm run test:integration` (scoped) — **9 passed / 2 files** (`legal-acceptance`,
  `product-analytics-preference`) on a disposable Neon branch
  (`br-restless-dew-at6uk521`, created + deleted; both `DATABASE_URL` and
  `DATABASE_URL_UNPOOLED` overridden to the branch per the standing MERGE-1 trap)
- `npm run build` — clean (all routes `ƒ` dynamic)
- **390px real-browser check** (Chrome CDP, mobile emulation, prod build):
  `/privacy`, `/terms`, `/scoreboard`, and the **injected Ask working panel with a
  120-char unbroken question** all `scrollWidth == clientWidth == 390`
  (`panelRight=366 ≤ 390`). Authenticated-session sweep is a post-deploy operator
  step (see below).

## Operator decisions received this session (via question prompt)

1. **GeoIP: retain + disclose.** PostHog keeps GeoIP on; Privacy 1.2 discloses that
   an approximate city/postal location is derived from the connection IP at
   ingestion while the raw IP is not stored.
2. **Retention: 7 years.** Stated as such in Privacy 1.2 (events; person profiles
   until deletion).
3. **Privacy 1.2: prepare + re-acknowledge.** Bumped in code, not deployed.

## What shipped, per workstream

### WS1 — PostHog privacy (Privacy 1.2)
`src/lib/legal/policies.ts`: `CURRENT_PRIVACY_VERSION` 1.1 → **1.2**, effective date
→ **2026-07-15** (placeholder — OPERATOR sets the actual deploy date; a code
comment marks it). `src/app/privacy/page.tsx`:
- Both false "activation pending" statements removed.
- Analytics stated as active only for signed-in adults who accepted the current
  terms and explicitly granted permission; default-off; reversible from Account.
- Region: dedicated PostHog project **hosted in the United States**.
- GeoIP: raw connection IP not stored; PostHog derives approximate city/postal
  location from it transiently at ingestion, then discards it; coarse location
  added to the §3 collection list.
- Retention: **seven years** (events) / person profiles until deletion.
- Exclusions preserved verbatim (Ask/Search text, claim/source text, URLs, email,
  LinkedIn, auth material, replay, autocapture, advertising, full referrers).
- §7 sharing bullet made present-tense ("uses a dedicated US project").

Re-acknowledgement propagates automatically — every acceptance path and the
`/welcome/legal` screen already read the version constants. Tests updated:
`privacy/page.test.tsx` (1.2 + July 15 + a new "live posture" assertion set that
forbids the stale copy), `account/page.test.tsx` (fixtures → 1.2), both legal
itests (version-agnostic via the constants). **No migration** — the bump is a
constant, not a schema change (0017/0020 already provide the acceptance machinery).

### WS2 — auth sender (code only)
`DEFAULT_FROM` → `BNOW.NET <no-reply@bnow.net>`; the partner-domain fallback,
comment, and test expectation are gone (`from.ts`, `send.ts`, `email.test.ts`).
Production either uses `POSTMARK_FROM_EMAIL` or fails visibly at Postmark — it can
never silently send a BNOW login from another brand's domain. Magic-link tracking
stays disabled (`TrackLinks:None`/`TrackOpens:false`). The token model was not
touched.

### WS3 — Ask waiting experience + model non-disclosure
`src/app/ask/ask-form.tsx`: the tiny pending hint is replaced by a prominent,
responsive working panel (`role=status`, `aria-live=polite`, `aria-busy` retained,
controls disabled). Stage copy ("Searching BNOW evidence…" → "Ranking the most
relevant claims…" → "Preparing an evidence-linked answer…") advances on **client
elapsed time** — an honest estimate of the fixed retrieve→rank→answer order, never
a server-reported stage and never a percentage; the once-per-second elapsed counter
is `aria-hidden` so a screen reader is not spammed. The submitted question is
echoed back verbatim from `useFormStatus().data`. Architecture unchanged:
`useActionState`, single paid path, GET `/ask?q=` still prefills only. Repeated
clicks/Enter are blocked by the disabled controls. `ask-result.tsx`: provider/model
string removed from the subscriber footer (kept in `ask_usage`, telemetry, and the
`AskResultLike` server-side type). Tests prove pending visibility + a11y + one-submit
+ settlement + absence of any provider/model string in the rendered result.

### WS4 — scoreboard truthfulness
`src/i18n/dictionaries.ts` (en + uk) + `scoreboard/page.test.tsx`: "At ISW publish"
→ **"Evidence available at ISW publish (proxy)"**; removed "the apples-to-apples
number" and "the gap is what later ingestion added". The how-to-read line now says
it only checks whether the matched claim's supporting evidence was ingested by ISW
publication and **does not prove the claim was in the historical BNOW digest**, and
discloses that **RU and UA are scored as separate country digests against the same
ROCA report and denominator**. Internal `at-publish.ts` comment corrected to match
(dropped the "lower bound" framing per the 2026-07-14 scoring audit). No scores,
matching, or methodology changed.

### WS5 — mobile/language launch gate
`selectorLocales()` + `LAUNCH_HIDDEN_LOCALES` in `dictionaries.ts` hide **es/he/ko**
(0% own catalog, pure English fallback) from the language picker used by
`site-header.tsx`. They remain valid/parseable (English fallback) so no link 404s;
this also removes the Korean **한국어** tofu risk from the picker. de/fr/pl/ar/ja
(~41% translated, pre-existing "needs native review") are unchanged. 390px verified
(above). SIGNIN_MODE flip stays an operator action.

## Deployment / rollback

- **Deploy target:** not created (staged on the branch). Pre-change prod is
  `dpl_8xh5zXYfnsCwoFwQTM3resTZ2BSP` (the `$identify` fix build) — the rollback
  point for the eventual deploy.
- **PostHog copy rollback** (if disclosure can't be finalized before invitations):
  remove `NEXT_PUBLIC_POSTHOG_KEY` + redeploy — the proven zero-traffic keyless
  state, rather than leaving inaccurate live copy.
- Merge is blocked until the X closeout is pushed and `main == origin/main`; then
  rebase/merge latest main, resolve doc conflicts preserving both histories, rerun
  the full gate, and request approval before deploy.

## Remaining operator decisions / steps

- **WS1:** confirm the Privacy 1.2 effective date (set it to the actual deploy
  date), then deploy — the version bump forces every user to re-acknowledge on next
  visit (expected; no migration). Record the PostHog billing limit + membership
  (still open from #67).
- **WS2:** verify `bnow.net` in Postmark (DKIM + custom Return-Path), prefer a
  dedicated BNOW server/token, set `POSTMARK_FROM_EMAIL="BNOW.NET <no-reply@bnow.net>"`
  in Production, then verify a delivered magic link end-to-end (visible From,
  Return-Path, DKIM/SPF/DMARC pass, direct unrewritten callback URL, callback
  success → session → `/welcome/legal` destination).
- **WS5:** flip `SIGNIN_MODE=invite` + redeploy after the grandfather set is
  confirmed; re-listing es/he/ko is a one-line edit once reviewed catalogs exist.
- **Post-deploy smoke on https://bnow.net (not deployment URLs):** Privacy 1.2 copy
  + re-acknowledgement; anonymous/denied analytics zero-request; Ask pending panel +
  no visible provider/model string; brand-correct auth email; signed-in 390px sweep
  (analyst home, live Ask pending panel, Ask result/evidence, account, `/welcome/legal`,
  signals, digest detail, mobile menu).
