# OpenSanctions match-safety repair — 2026-07-21

Branch `opensanctions-match-safety` (off `main` 836b46e). Implementation only: **no
deploy, no push, no migrations, no production/database writes, zero paid OpenSanctions
calls** (the live matcher was exercised exclusively through mocked `fetch`). Integration
tests ran on the standard disposable Neon fork (created → 72/72 → deleted).

## Root cause

`src/lib/enrich/opensanctions.ts` selected its persisted result with

    const best = results.find((r) => r.match) ?? results[0];

When the OpenSanctions algorithm rejected every candidate (`match: false` on all
results), the `?? results[0]` fallback promoted the **top rejected candidate** anyway:
its `topics` were persisted at the top level and `sanctioned` was derived from them,
producing rows shaped `matched: false, sanctioned: true, topics: ["sanction"]`.
Every downstream consumer — the `/entities` list SQL, the entity detail panel, and
both Ask retrievals — read `sanctioned`/`topics` while ignoring `matched`, so a
rejected name-only candidate (the query carries name + entity type only) could render
as an unqualified red "sanctioned" badge on a real person and as the categorical word
`SANCTIONED` in Ask evidence prompts.

## Changed surfaces

**A. Matcher (`src/lib/enrich/opensanctions.ts`)** — accepted-only selection:
`results.find((r) => r.match === true)`. No accepted result (including `results: []`)
returns clean-unmatched (`matched:false, sanctioned:false`, empty topics/datasets,
null osId/caption, score 0); the top rejected candidate survives only inside a new
explicitly non-assertive `rejected` nested structure (caption/score/topics/osId),
documented as never being facts about the BNOW entity. `sanctioned` is derived only
from an accepted result containing the exact `"sanction"` topic. Stub sanitization
(`sanitizeForPersist`) and the truth-in-UI invariant are unchanged.

**B. Fail-closed read authority (`src/lib/enrich/os-read.ts`, new)** — every render
path interprets persisted `entities.meta.opensanctions` through `readOsMeta()`. A
usable ACCEPTED match requires **all** of: not stub-derived, not an `NK-stub…` id,
`matched === true`. Neither `sanctioned:true` nor a topic alone is sufficient; the
accepted view re-derives `sanctioned` from the exact topic so a contradictory stored
flag can never widen the assertion. The stale bug shape parses as `rejected` with its
promoted fields demoted to rejected-candidate diagnostics. Malformed/uncertain input
degrades to `none`/`rejected`, never `accepted`. Consumers converted: `/entities`
list (metadata not even selected for non-admins), `/entities/[id]` detail. Ask
consumers were removed outright (D). No production row is mutated or rescored.

**C. Admin-only qualified presentation** — `/entities` and `/entities/[id]` stay on
their existing subscriber gate; only the OpenSanctions material is additionally
gated on `currentRole() === "admin"` (existing gate.ts machinery; role lookup fails
closed to "user"). Non-admins get zero OpenSanctions markup — no badge, PEP label,
tooltip, panel, score, topic, caption, profile link, or freshness field; on the list
the metadata is excluded from the SQL projection entirely. Admins get a neutral
candidate-review panel: accepted/rejected explicitly labelled; score labelled
"identity-match confidence … not risk"; topics rendered as distinct uncollapsed
categories; datasets + OpenSanctions profile link; `Checked YYYY-MM-DD (UTC)`;
and the standing qualification that the query used name and entity type only and has
not been human-reviewed. A rejected candidate is never called sanctioned — its
diagnostics render only under the "diagnostics only — NOT the same identity" label.
The old red categorical badges are gone for every role.

**D. Ask containment** — the OpenSanctions `sanctioned` projection is removed from
`retrieve.ts` and `retrieve-v2.ts` (SQL + mapping) and from `RetrievedEntity` (no
legitimate consumer remained); the `, SANCTIONED` marker is removed from both the
legacy and v2 evidence blocks in `answer.ts`; the sample question "Which entities are
sanctioned and under pressure?" is replaced with the claim-supported "What sanctions
actions were reported recently?". Ordinary source-backed claim text about sanctions
actions still flows through Ask unchanged, and the ruling-20 source-fidelity
validator rules are untouched.

Files: `src/lib/enrich/opensanctions.ts`, `src/lib/enrich/os-read.ts` (new),
`src/app/entities/page.tsx`, `src/app/entities/[id]/page.tsx`,
`src/lib/ask/retrieve.ts`, `src/lib/ask/retrieve-v2.ts`, `src/lib/ask/answer.ts`,
`src/app/ask/ask-form.tsx`; tests `opensanctions.test.ts`, `os-read.test.ts` (new),
`entities/page.test.tsx` (new), `entities/[id]/page.test.tsx`, `ask.test.ts`,
`retrieve-v2.test.ts`; docs `AGENTS.md` (decision log), `docs/OPEN-TASKS.md` (#17),
`docs/CURRENT-STATE.md`, `docs/PROGRESS.md`, this review.

## Pre-existing contradictory metadata

Production rows written by the old fallback (`matched:false, sanctioned:true,
topics:["sanction"]`) are **contained, not repaired**: `readOsMeta` classifies them
as `rejected` (public: nothing renders; admin: rejected label + demoted diagnostics),
and Ask no longer reads the metadata at all. No mutation, rescore, or paid re-check
was performed in this task — cleanup/re-match belongs with OPEN-TASKS #61 and needs
separate spend authorization.

## Test results

- Unit: **2,049 / 2,049 passing, 161 files** (was 2,028/159; +21 tests, +2 files).
  New coverage: empty-result and all-rejected fail-closure, accepted-sanction /
  accepted-PEP-only / later-accepted-element selection (mocked fetch, no real
  provider), stub sanitization unchanged, stale-shape containment in `readOsMeta`,
  non-admin zero-markup on list + detail (stale AND accepted rows), admin qualified
  presentation (score semantics, uncollapsed topics, checkedAt, rejected-never-
  sanctioned), no `SANCTIONED`/PEP marker in legacy or v2 prompts, sanctions claim
  text still flowing, v2 entity SQL free of `opensanctions`.
- Integration: **72 / 72 passing, 14 files** on a disposable Neon fork
  (`br-holy-feather-atg4y0ca`, deleted after the run). Spend-guard, claim-linked
  eligibility, rescore-selection, and traceability suites unchanged and green.
- `npm run typecheck` clean · `npm run lint` clean · `npm run build` PASS.

## Adversarial checks on the final diff

- **Information leakage:** non-admin list SQL no longer selects the metadata; detail
  page parses only behind the admin check; jsdom tests assert the rendered HTML has
  no `opensanctions`/`sanctioned`/`PEP`/candidate strings for non-admins.
- **Category laundering:** PEP-only accepted matches assert `sanctioned:false`
  (unit-tested); topics render as distinct chips; the fidelity validator's
  PEP≠sanctioned rules are untouched.
- **Stale-row behavior:** the exact production bug shape is a regression fixture at
  matcher, read-model, list, and detail layers.
- **Stub leakage:** `stub:true` and `NK-stub` ids read as `none` even with
  `matched:true` (tested); `sanitizeForPersist` untouched and re-verified.
- **Accidental provider calls:** all matcher tests stub `fetch` and the env key;
  `isLive()` logic unchanged; no script or test touches api.opensanctions.org.

## Remaining work (separate approvals required)

1. **Human-review workflow + product review** before any sanctions/PEP assertion can
   leave admin-only scope. Restoring a public assertion requires a new AGENTS.md
   decision-log entry.
2. **Stronger identifiers** (DOB, nationality, registration numbers) in the /match
   query before identity can be claimed as verified rather than candidate.
3. **Stale-row cleanup / re-match** of the contained `matched:false` rows — with #61
   kind-safe cleanup and its own spend authorization (paid calls are otherwise
   still gated).
4. Analyst-facing match-review presentation (the non-admin half of the old #17 UI
   requirement) remains an open product decision.

## Release outcome (2026-07-22)

Merged to `main` fast-forward-only (`addd2be..441ee09`, linear, no merge commit; src tree
byte-identical to the reviewed branch) and pushed. Release gates on merged main:
`git diff --check` clean · typecheck clean · lint clean · unit **2,049/2,049 (161 files)** ·
build PASS. (Integration 72/72 was proven on the reviewed branch's disposable Neon fork; not
re-run — no tree drift.)

Deployed to production via the established CLI path (`npx vercel deploy --prod`) as
**`dpl_E5ysiLJSg1ynNmqJkgmpDjrzZD32`**, READY, aliased to bnow.net; `/health` stamps `441ee09`,
DB OK. **No migration** (release touches no `drizzle/`), **no env change** — all Ask flags
preserved (`ASK_RUNS_SHADOW=1`, retention 30/7/7, `ASK_BILLING_CUTOVER_AT` absent, every
enforce/progressive/stream/cache/sessions/router flag absent). The Ask shadow-soak window
**restarted at 2026-07-22T01:10:37Z** because Ask retrieval/evidence code changed.

Smoke (through bnow.net, zero paid calls):

- **Health/availability:** `/health` 200 `441ee09` DB OK; `/`, `/signin` 200; `/entities`,
  `/ask`, `/search` 307→`/signin` (auth gate); no 5xx; runtime logs show only info GETs.
- **Signed-out:** `/entities` and `/ask?q=` both 307→`/signin`; GET redirects before any Ask
  logic (no POST, no paid call).
- **Non-admin (accepted test account) — CRITICAL CONTAINMENT VERIFIED:** on accepted
  (`/entities/4`, `/5`), rejected (`/entities/1`), and the list, **zero** OpenSanctions markers
  (panel / profile link / confidence / accepted-rejected text / screening footnote / topics /
  "OS candidate" badge). Before/after proof: the same account on the pre-release build
  (`836b46e`) received the `opensanctions.org/entities/` profile link on entity 4
  (`profileLink:true`, htmlLen 38 755); on `441ee09` it is gone (`profileLink:false`, htmlLen
  35 594).
- **Admin positive render — NOT live-verified (PARTIAL):** the sole admin identity has not
  accepted Privacy 1.3, so its session redirects 307→`/welcome/legal` before any entity page.
  Per the release authorization an acceptance was **not** manufactured. The admin neutral panel
  is covered by `entities/[id]/page.test.tsx` (rejected labelled "rejected…never sanctioned";
  accepted shows identity-match-confidence-not-risk, uncollapsed topics, datasets, profile link,
  "Checked … (UTC)", "name and entity type only", "not been human-reviewed"). Not a regression —
  an acceptance-gate limitation.
- **Ask/Search:** live signed-in `/ask` shows the new sample "What sanctions actions were
  reported recently?" (old one gone); signed-in `GET /ask?q=` is prefill-only (200, query
  prefilled, zero POSTs); signed-in `/search?q=Rotenberg` deterministic 200, no OpenSanctions
  markup, no `/api/ask`. The `SANCTIONED`/PEP marker omission from both evidence blocks is
  proven by `ask.test.ts` (source-backed sanctions claim text still flows).
- **Invariants:** zero paid provider calls (only a pre-deploy scheduled `openai_map` cron at
  00:41Z); zero `ask_runs` from the GET-only smoke; zero DB writes (session counts unchanged;
  all queries read-only); no cron manually invoked; no migration.

**Data-reality note:** the "production still holds `matched:false, sanctioned:true` rows"
statement in the pre-release sections above (and the branch-only decision-log entry) is
retained verbatim as the recorded rationale, but a read-only audit at release found the current
production `entities.meta.opensanctions` set carries **zero** such contradictory rows and zero
rejected rows with promoted topics (425 clean-rejected / 388 accepted-unsanctioned / 200
accepted-sanctioned). The fail-closed read model is defensively correct regardless.

Rollback target (not needed): the prior Ask release `dpl_5scfsMfttrHZbLFWgdkAKdpBAHFT` /
`836b46e` — additive-only history, no migration/env delta to reverse.

**Verdict: RELEASE VERIFIED** on deployment + the critical non-admin/public containment; the
admin positive-render smoke sub-check is PARTIAL (acceptance-gated, unit-test-covered). Cohort
activation, Ask billing cutover, public sanctions/PEP restoration, and stale-row cleanup/rescore
remain out of scope and separately gated.
