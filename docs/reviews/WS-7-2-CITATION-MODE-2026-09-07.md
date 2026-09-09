# WS-7.2 — ICS 206-01 citation mode on "Copy for report" (48h step 32)

## Scope

- Prompt: `docs/prompts/2026-09-05-48h-32-ws7-citation-mode.md`, plus its 2026-09-08
  relaunch header and the read-only handoff at
  `/Users/go/code/bnow-net-worktrees/logs/step32.readonly-20260908.log`.
- Governing decisions, all SIGNED in `AGENTS.md`: **T2** (access date in citation mode),
  **T4** (tool disclosure built, display withheld on every surface), **T4-b** (build shape
  for the withheld disclosure), **T5** (moat constants withheld — not exercised here).
  Rewrite source: PLAN-WS-7 §3 C1/C4/C9, §4 WS-7.2 and §9.8's step-32 Handoff rewrite;
  addendum §4.2. Where the signed entries and the plan differ, the entries won (INDEX §2.1).
- Lane `48h/ws7-tradecraft-20260905`, step branch
  `48h/ws7-tradecraft-20260905-step32-citation-mode`, worktree
  `/Users/go/code/bnow-net-worktrees/48h-ws7-tradecraft-20260905`.
- Base SHA: `6913c57` (= `origin/main` at session start).
- **Attended** session. Spend **$0** — no provider call, no database, no deploy, no
  environment read or write, no migration.

## Built

One commit, `c0f5998` — `citation: ICS 206-01 copy mode with the AI-tool disclosure built
and dark`, plus the docs commit. Opened as **PR #80** —
https://github.com/vociferous-artificial-intelligence/bnow-net/pull/80

**New**

- `src/lib/citation/ics206.ts` — the citation artifact as data plus its plain and HTML
  serializers, so a later API route emits the same object the clipboard does. Holds the
  ICS 206-01 media-type and PAI maps, the per-stage disclosure builder, `readClaimToolStamp`
  (validates the persisted jsonb field by field rather than trusting it), `isStubToolStamp`,
  and `canonicalClaimUrl` **moved** out of `claim-copy-model.ts` so exactly one URL validator
  survives. Takes a structural input type, so it does not import `claim-copy-model.ts`, which
  imports it.
- `src/lib/citation/disclosure-policy.ts` — the T4 gate. A policy **function** on the
  `src/lib/registry/view-policy.ts` pattern, not a boolean constant, and the only place that
  decides. Keyed on **tier** with `ENTITLED_TIERS` empty; `role` is on the viewer but is never
  the gate, because T4's hold covers signed-in users and admins. Also holds
  `resolveClaimCitationStamp`, which is what makes withheld mean absent (below).
- `src/lib/analysis/attribution-labels.ts` — ruling 19's `ATTRIBUTION_LABEL` /
  `DISPUTED_HEDGING` on a leaf with no imports; `publication-guard.ts` imports and re-exports
  them, so every existing consumer and the guard's own test are untouched and there is still
  one definition. Reason under Rulings below.
- Tests: `ics206.test.ts`, `disclosure-policy.test.ts`, `client-boundary.test.ts`.

**Changed**

- `src/components/claim-copy-model.ts` — fifth `ClaimCopyMode` `citation`; an **optional**
  `citation?: ClaimCitationStamp` payload field; `canCopyIcs206Citation`;
  `citationButtonLabel`; `escapeClaimCopyHtml` re-exported from its new home.
- `src/components/claim-evidence-model.ts` — `escapeClaimCopyHtml` moved here (the shared
  leaf); optional `citationCount`; the two T2-invalidated comments corrected in place.
- `src/components/claim-copy-actions.tsx` — the citation button, its rich-clipboard branch,
  its success status, and `data-copy-mode="citation"` for the page test to find.
- `src/app/digests/[country]/[date]/page.tsx` — selects `d.provider` and the two dispatch
  sub-objects (not the whole `structured` blob), resolves the viewer, applies the policy, and
  passes only the resolved stamp. The provider is still never rendered.
- `src/lib/time/format-et.ts` — `formatEtDateTimeYear`, the year-bearing formatter a citation
  cannot omit (`formatEtDateTime` emits no year).
- `src/lib/analytics/events.ts:34` + `sanitize.ts:42` — `"citation"` added to both
  `copy_mode` allowlists.
- `src/i18n/dictionaries.ts` — three English-only chrome keys. The artifact itself is
  authoritative English and is not routed through i18n (`legal-document.tsx:8` precedent):
  a citation whose field names or classification vocabulary changed per viewer locale would
  not be reconstructible by the desk that receives it, and T2's exact label
  "Accessed (BNOW ingest)" must survive verbatim. Pinned by a test asserting the `de` and
  `en` artifacts are byte-identical.
- `docs/OPEN-TASKS.md` — new **#117** (extraction provenance; carries the related
  provider-blind `mapreduceProviderTag()` ordering item).

### The one finding that shaped the build

The read-only pass established it and this session implemented it: **T4's "dark" has to mean
ABSENT, not un-rendered.** `ClaimCopyActions` is a `"use client"` component, so every field of
its `payload` prop is serialized into the RSC flight payload embedded in the page HTML. A
`toolStamp` carrying `openai:gpt-4o-mini+mapreduce` would have been readable in view-source by
exactly the people T4 withholds it from. So the policy runs **server-side, before the payload
is built**: `resolveClaimCitationStamp` returns `{ attributable, tools: view.showToolDisclosure
? stamp : null }`, `tools` is `null` for every currently resolvable viewer, and the only thing
that crosses the boundary is the boolean that answers ruling 3. Pinned three ways — at the
policy (`JSON.stringify(resolved)` contains no model name), at the component
(`container.innerHTML`), and at the page (both `textContent` and `innerHTML`, for five tokens,
with the role mock set to `admin` so it is the hardest case rather than the easiest).

### Shape of the artifact

Withheld (what every viewer gets today):

```
BNOW.NET — source citation (ICS 206-01 fields; tool disclosure withheld)

Claim: Ukraine and partners formed a coalition.
Classification: Confirmed
Corroboration: 1 document · 1 channel · 1 platform
Retrieved as of: 13 July 2026
Publisher: BNOW.NET, Russia Daily Digest, claim c4762
Canonical: https://bnow.net/digests/ru/2026-07-13#c4762

Sources
[1] Source 1. "Title 1". news media; publicly available information (PAI).
    Descriptor: news media · coverage lens: ru · ISW-cited 12 times.
    Published: Jul 1, 2026, 8:00 AM ET · Accessed (BNOW ingest): Jul 1, 2026, 9:00 AM ET
    https://source1.example/item

Tool disclosure
tool disclosure withheld
```

Four judgment calls inside it, each pinned by a test:

1. **The headline never claims conformance while the disclosure is withheld**, and the button
   says "Copy source citation" rather than "Copy ICS 206-01 citation" (T4-b rule 4). It still
   says "ICS 206-01 fields", which is true and useful, next to the literal marker. This is
   PLAN-WS-7 §7's option (c) taken deliberately.
2. **Ruling 19's label is a FIELD, not a second prefix.** The publication guard already
   prefixes the claims it governs (`publication-guard.ts:228`, `` `${labelFor(c.hedging)}
   ${text}` ``), so re-prefixing here would double-label published prose. The label is imported
   verbatim, never re-typed, and rendered as `BNOW attribution: "Sources claim:"`. The guard's
   own logic is untouched.
3. **Extraction reads `not recorded for this digest`, always, and is never back-filled** —
   even on the disclosed path (T4-b rule 3, PLAN-WS-7 §3 C1). See #117.
4. **Every optional field degrades to a named absence**, never an empty slot: a NULL or absent
   dispatch renders `unstamped — pre-analysis-reg-v1`, a missing timestamp renders
   `not recorded`, a titleless document falls through `claimSourceLabel`'s documented chain.

## Tests

| | Before | After |
|---|---|---|
| Unit tests | 4,082 | **4,121** |
| Test files | 270 | **273** |

`npm test` green (273 files / 4,121 tests, ≈11 s). `npm run typecheck` clean.
`npm run lint` 0 errors, 3 warnings — all three pre-existing on `main`
(`src/lib/usage/cron-run.test.ts` and two siblings; none in a file this PR touches).
No integration test run: this PR touches no schema, no migration and no query result shape
beyond three added SELECT columns, so nothing in `src/integration/` covers it. Spend **$0**.

New or changed test files:

- `src/lib/citation/ics206.test.ts` (18) — jsonb validation and dispatch precedence; ruling-3
  refusals; the exact withheld artifact byte-for-byte; the disclosed artifact; the
  unstamped-label cases; ruling 19 across all five hedging classes plus an out-of-enum value;
  **the ruling-1 sentinel fixture**; the XSS fixture; source-entry degradation.
- `src/lib/citation/disclosure-policy.test.ts` (4) — the disclosure is OFF for every
  currently resolvable role × ten tier values (40 combinations), `admin` and `analyst` resolve
  identically to `anon`, and the withheld resolver strips the stamp.
- `src/lib/citation/client-boundary.test.ts` (7) — the source scan described under Rulings.
- `src/components/claim-copy-model.test.ts` (+4) — refusal on unstamped surfaces; the
  artifact once stamped; `de` == `en`; and a drift pin asserting `canCopyIcs206Citation`
  agrees with the builder across 28 payload combinations.
- `src/components/claim-copy-actions.test.tsx` (+4) — no button without a stamp, none for a
  stub digest, the non-conformant label plus the clipboard contents, and no model name in the
  rendered client output.
- `src/app/digests/[country]/[date]/page.test.tsx` (+2, 1 corrected) — see Citations below.

### The ruling-1 sentinel fixture, since the acceptance criteria name it

The builder is handed a `ClaimSourceDoc` carrying five extra fields (`content`, `rawText`,
`iswTakeaway`, `summary`, `meta.note`), each with a unique marker, and the test asserts the
marker reaches neither serializer nor the JSON object — then asserts the whitelisted metadata
DID survive, so the check is not vacuous. If the module ever starts spreading a doc or reading
a body, this fails.

## Rulings touched and how each is satisfied

- **Ruling 1 (no source full-text or ISW prose).** The module reads a fixed whitelist —
  label, title, URL, platform, two timestamps, citation count — and emits URLs, classifications
  and counts. Enforced by the sentinel fixture above, not by review. Document *titles* are
  emitted, as they already are by the evidence trail and the plan's field list; a title is
  metadata, not full text.
- **Ruling 2 (traceability).** Untouched — this renders the trigger-enforced invariant, it
  writes nothing.
- **Ruling 3 (stub never renders as fact).** `isStubToolStamp` fails closed: a `stub` provider
  tag, a `stub` in the dispatch identity's own `provider` field, and an **unreadable or absent**
  provider all refuse. A refused claim shows no citation button at all — hidden, not
  demo-labelled. Pinned at the module, the component and the page.
- **Ruling 19 (publication safety).** Labels imported verbatim from the guard's own constants
  and carried as a field, per the reasoning above.
- **Ruling 21 (the gate is the page's first statement).** No new page. `requireAcceptedUser()`
  is still the first statement; `currentRole()` was added *after* it and authorizes nothing —
  it only shapes what the artifact may disclose. `page.test.tsx` now asserts the gate ran
  before the role lookup as well as before the first query, so a refactor that hoisted the
  role read would be caught.
- **Ruling 4 / 5 / 13** — not touched. No spend path, no migration, no extractor-version basis
  change.

### The client-boundary finding, which is new and worth reading

The citation builder is reachable from a client component
(`claim-copy-actions.tsx → claim-copy-model.ts → citation/ics206.ts`), so its import graph is a
**client bundle graph**. Reading ruling 19's labels straight out of `publication-guard.ts` —
which the handoff explicitly proposed, and which looked safe because the guard's only import is
`import type` — put `src/lib/usage/spend-guard.ts` and `@/db` into that graph: **31 modules
versus 12** after the labels moved to their own leaf (`npx madge` on
`src/components/claim-copy-actions.tsx`, before and after). Nothing would have shipped, because
the bundler erases a type-only import; the hazard is that the **first runtime import added to
the guard** would have made it real and silent. `client-boundary.test.ts` is the guard against
that, on the `src/lib/evals/isolation.test.ts` precedent, and it includes a non-vacuous control
asserting the same scan trips on `publication-guard.ts` itself.

## Citations re-verified

Every file:line below was re-read this session at `6913c57`.

| Cited as | Status |
|---|---|
| `claim-copy-model.ts:16` `ClaimCopyMode` | correct |
| `claim-copy-model.ts:18-28` `ClaimCopyPayload` | correct |
| `claim-copy-model.ts:110-117` `escapeClaimCopyHtml` | correct (now moved) |
| `claim-copy-model.ts:154-181` `canonicalClaimUrl`, module-private | correct (now moved) |
| `claim-evidence-model.ts:112-119` `claimChannelKey` | correct |
| `claim-evidence-model.ts:221-244` `summarizeClaimEvidence` | correct |
| `claim-evidence-model.ts:12-20`, `:185` `fetched_at` comments | correct — **both corrected in place** under T2 |
| `publication-guard.ts:49-59` `DISPUTED_HEDGING` / `ATTRIBUTION_LABEL` | correct (now on a leaf, re-exported) |
| `publication-guard.ts:228` the guard's own `${label} ${text}` prefix | correct |
| `digests/[country]/[date]/page.tsx:186-197` header query | correct |
| `digests/[country]/[date]/page.tsx:187-189` "No d.provider" comment | correct — **rewritten**; provider is now selected and still never rendered |
| `digests/[country]/[date]/page.tsx:202-218` claim query | correct |
| `digests/[country]/[date]/page.tsx:496-506` payload site | correct |
| `page.test.tsx:239` "must not ask the database for it" | correct — **assertion inverted** to `toContain("d.provider")`, and the render-side assertions strengthened from one token/`textContent` to five tokens across `textContent` **and** `innerHTML` |
| `analytics/events.ts:34` + `sanitize.ts:42` `copy_mode` | correct — both extended |
| `format-et.ts:22-32` emits no year | correct — the gap was real; `formatEtDateTimeYear` added |
| `synthesize.ts:443-449` `mapreduceProviderTag()` | correct, including the `openai:` hard-coding |
| `synthesize.ts:701` `stats.reduce.dispatch` | correct |
| `digest.ts:218` `stats.llmDispatch` | correct |
| `model-config.ts:312-330` `AnalysisDispatchIdentity` / `dispatchIdentity` | correct |
| `schema.ts:251` `digests.provider`, `:264` `claims.digest_id` | correct |
| `schema.ts:932` / `:1003` `extractor_version` (C1) | correct — no path from `claims` |
| `registry/view-policy.ts` single-decision pattern | correct |
| `ask/access-context.ts:41-47` tier hard-coded `"beta"` | correct |
| `gate.ts:93-112` `currentRole()` degrades to `"user"`/`"anon"` | correct |
| `legal-document.tsx:8` i18n-exempt content precedent | correct |
| `entities/[id]/page.tsx:46` `currentRole()` on an accepted-user page | correct — the precedent for the added call |

**Correction to the handoff log, minor.** It proposed `readClaimToolStamp` take the two
dispatch sub-objects "so the page does no parsing", which is what shipped; but it also
described `citationDisclosureView(viewer)` as living beside `resolveClaimCitationStamp` in the
policy module while typing the stamp there too. `ClaimCitationStamp` ships in `ics206.ts`
instead, so `claim-copy-model.ts` can type the payload field without importing the server-side
policy module. Same behaviour, one fewer edge into the client graph.

## Decisions needed

**None blocking.** T2, T4, T4-b were all signed before this session and the build follows them.
Three items for the operator's awareness, none of which stops the PR:

1. **`sources.citation_count` now crosses to the client on the digest page.** The descriptor
   stub says "ISW-cited N times", which PLAN-WS-7 §4 and addendum §4.2 both specify. It is not
   a moat field — `view-policy.ts` makes citation ordering the *reduced* view's fallback
   precisely because reliability is the moat — but `/registry` is admin-only today (C3), so in
   practice no non-admin has seen a citation count before now. Flagged rather than assumed. If
   the operator wants it out, it is one line in `descriptorFor` plus one SELECT column.
2. **The digest page now costs one extra role lookup per render** (`currentRole()`: an
   `auth()` call plus one `SELECT role`). It buys nothing *today*, because the gate keys on
   tier and no tier is resolvable — but a hardcoded viewer would make the policy decorative and
   would break silently the day the gate is enabled. `entities/[id]/page.tsx` already pays the
   same cost on an accepted-user page. Cheap to reverse if the operator would rather not pay
   it: make `role` optional on `CitationViewer` and pass `{ tier: null }`.
3. **PAI is asserted for every adapter**, per addendum §4.2 ("every current adapter is PAI").
   X arrives through a paid twitterapi.io contract; the *information* is public, so PAI is
   right, but a reviewer of a formal product may want CAI considered. The map is exhaustive
   rather than defaulted, so adding a CAI source forces the decision at the type level.

## Debt and risks

- **#117 (filed).** The disclosure is digest-scoped; its extraction stage is honest but empty.
  Costs nothing while T4 holds it dark. Carries the provider-blind `mapreduceProviderTag()`
  ordering item for step 20b.
- **The disclosed path has never rendered for a real viewer** — `ENTITLED_TIERS` is empty, so
  it is reachable only by constructing `{ showToolDisclosure: true }` directly, which the tests
  do. That is the intended state, but it means the enabled branch is test-proven, not
  production-observed. Whoever enables it should read the artifact once before shipping it.
- **Only the digest surface is plumbed.** Search, signals, entities and Ask show no citation
  button. That is the fail-closed design, not an oversight, and the optional field is what lets
  each adopt in its own PR. Ask is the interesting one: its claims may span digests, so a
  single per-claim stamp may not be the right shape there.
- **No `next build` was run**, so the client/server boundary is proven by the source scan and
  the madge graph rather than by a real bundle. The scan is the stronger long-term guard; a
  build would be a stronger one-time proof.
- The artifact's field labels are English constants in the module. If the product later needs a
  localized citation, that is a deliberate reversal, not a gap to fill in passing.

## Handoff

- **PR #80 is open against `main`** and the pre-push gate passed on the push (typecheck +
  lint + test). Nothing deploys before step 26's go/no-go regardless.
- **Step 33 (WS-7.3 descriptors) replaces `descriptorFor` in `src/lib/citation/ics206.ts`.**
  It is one function returning one string, deliberately isolated, and `Ics206SourceEntry.descriptor`
  is the field to fill. `citationCount` is already on `ClaimSourceDoc` (optional) and already
  selected by the digest claim query, so WS-7.3 does not need to re-plumb it.
- **Step 34 (WS-7.4 estimative mapping) should not add likelihood to the citation artifact
  without an operator sentence.** T3 signs `ESTIMATIVE_MAP_V1` for presentation; whether an
  ICS 206-01 citation carries an ICD 203 band is a separate question, and the artifact
  currently carries the hedging classification only.
- **Step 20b must fix `mapreduceProviderTag()`'s hard-coded `openai:` prefix before the
  Anthropic digest path is enabled** — T4-b already says so; #117 now records it in
  OPEN-TASKS too. This PR's `isStubToolStamp` compensates partially and should not be read as
  making the fix optional.
- **Step 25 applies the AGENTS.md changes below.** This session edited no standing text.

### Proposed AGENTS.md changes

**Standing text — directory map**, `src/lib/…` block. Add one line after the `src/lib/citation/`
alphabetical position (there is no such entry today):

```
src/lib/citation/    ICS 206-01 citation artifact (ics206.ts, pure + client-safe) and the
                     T4 AI-tool-disclosure policy (disclosure-policy.ts, server-side, the
                     one place the gate is decided)
```

**Standing text — Quality/ops bullet.** `3,590 unit tests / 246 files` is stale by several
merges; this branch measures **4,121 / 273**. Step 25 should take whatever `main` reads at
merge time rather than this figure.

**Proposed decision-log entry** (not applied — AGENTS.md write-lock):

> - **2026-09-08 (WS-7.2 — ICS 206-01 citation mode shipped; the AI-tool disclosure is BUILT
>   and DARK)** The fifth `ClaimCopyMode` `citation` ships on the digest surface under the
>   signed T2/T4/T4-b entries. **Citation mode itself renders**, carrying T2's
>   "Accessed (BNOW ingest)" date; the **AI-tool disclosure does not**, on any surface. The
>   gate is a policy function keyed on **tier** with an empty entitled set
>   (`src/lib/citation/disclosure-policy.ts`, the `view-policy.ts` pattern) — never on role,
>   since T4's hold covers signed-in users and admins, and a test pins `admin` and `analyst`
>   resolving identically to `anon` across ten tier values. **The policy is applied
>   server-side, before the copy payload is built**, because `ClaimCopyActions` is a client
>   boundary and anything on its payload is serialized into the page HTML: withheld therefore
>   means ABSENT, not un-rendered, and no model name crosses the boundary for any viewer. The
>   withheld artifact carries the literal `tool disclosure withheld` marker and the button is
>   labelled "Copy source citation", never "ICS 206-01 citation" — PLAN-WS-7 §7 option (c),
>   taken deliberately. The disclosure is **per stage**: synthesis from the digest dispatch
>   identity, extraction always `not recorded for this digest` and **never back-filled**,
>   because `claims` carries no extractor column and the stamp is digest-scoped, not
>   claim-scoped (§3 C1) — now OPEN-TASKS **#117**, which also records that
>   `mapreduceProviderTag()`'s hard-coded `openai:` prefix must be fixed before the Anthropic
>   digest path is enabled. The 2026-07-16 provider-hiding decision **stands unreversed**: the
>   digest page now SELECTs `d.provider` for the stamp and still renders it nowhere, and the
>   page test's assertion moved from "does not ask the database" to "no provider, model or
>   registry token reaches the rendered output or the serialized client payload", with the
>   viewer mocked as `admin`. Ruling 19's labels moved to a leaf
>   (`src/lib/analysis/attribution-labels.ts`, re-exported by `publication-guard.ts`) after
>   `madge` showed the citation module's import of the guard put `spend-guard.ts` and `@/db`
>   into a client component's graph — 31 modules versus 12; the edge was type-only and the
>   bundler erased it, but the first runtime import added to the guard would have made it
>   real, so `client-boundary.test.ts` now scans for it. Ruling 3 fails closed on a `stub`
>   tag, a `stub` dispatch provider, and an unreadable provider alike. $0, no migration, no
>   environment change, no deploy; only the digest surface is plumbed and the other five
>   payload sites are untouched by design.
