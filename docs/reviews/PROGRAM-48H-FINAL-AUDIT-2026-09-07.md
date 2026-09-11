# PROGRAM-48H-FINAL-AUDIT — step 26: final adversarial audit of the 48-hour window

**Prompt:** `docs/prompts/2026-09-05-48h-26-final-audit.md` (binding block of 2026-09-09).
**Lane / worktree:** `48h-audit-ws2-20260905`, branch `48h/audit-ws2-20260905-step26-final-audit`.
**Audited tree:** frozen `main` = **`2c66e94`**. Base = **`883e5e3`**. (`origin/main` is `0bc601b`,
one docs-only commit on top of the freeze — the commit that bound this prompt to the SHA.)
**Model gate:** Opus / xhigh, attended, per binding item (1) — deliberately NOT the model that
authored either register it re-checks (step 18's was Fable; step 17's was a Fable orchestration).
**Fan-out, as declared in advance:** ten parallel finders (one per lens), refuters on every
major, one batched verification per PR for the deploy inventory, and the completeness pass
against plan §5.4. No finder or refuter wrote to the repository.
**Spend: $0.** No deploy, no Vercel read or write, no production database contact, no paid
provider call, no candidate model touched, no code change.

---

## 0. Verdict in one paragraph

The window is **sound at the invariant level and merge-faithful end to end**, and the tree is
deployable. **No blockers. No PR is `no-go`. Nothing that gates the deploy is a code change** —
the four `go-after-fix` items are three documentation edits and one `git branch -D`. Merge
fidelity (register gap G12, never checked before) is now **proven twice over for all 49 merges**;
no secret reached the repository; standing rulings 1, 2, 5, 8, 9, 13, 14 and 21 hold under
adversarial reading, and ruling 4 now holds on **every** Ask path for the first time since
2026-07-11. Five majors stand: a third-party PII branch one `git push` from GitHub (AUD-02); a
documentation revert that breaks the operator's own smoke test on their own machine (AUD-03); a
standing env list that omits five of the fifteen variables step 27 is about to verify (AUD-04);
a soak-enablement checklist with no migration gate, which would produce a soak that looks alive
and records nothing (AUD-05); and an OPEN-TASKS entry still instructing a production write that
already ran and would change digest behaviour if repeated (AUD-06). The audit's own headline
candidate — a new presentation layer publishing a likelihood band on the one content class
ruling 19 governs — **was put to two independent refuters and graded down to a minor plus a
decision the operator was never asked** (§4.1). Two further majors were **refuted outright** by
refutation (§4.3). The one never-run check still open is the Vercel environment read-back, which
is correctly step 27's and is carried into the handoff as a hard gate.

---

## 1. The four never-run checks (2026-09-09 plan §5.4) — placed and discharged

| Check | Gap | Assigned to | Status after this step |
|---|---|---|---|
| Tree-wide `npm run build` at the frozen SHA | G4 | card 6.1 | **CLOSED — re-run independently here.** `LLM_DISABLE=1 OPENAI_API_KEY= ANTHROPIC_API_KEY= POSTMARK_SERVER_TOKEN= DATABASE_URL=postgres://x:y@localhost/z npm run build` → **PASS** at `2c66e94`, all routes compiled, `/methodology` and `/api/logs/drain` both register. |
| Merge fidelity `git range-diff` for every merged PR | G12 | step 26 (this step) | **CLOSED — §3.** 49/49 clean by two independent methods. |
| Vercel env read-back in all three environments | G3 | step 27 | **STILL OPEN — correctly.** This session has no Vercel access and did not seek it. **Carried into the handoff as a hard gate**, with a corrected variable list (AUD-04). |
| `runtime-logs.itest.ts` on a fork with 0029 + NUL / int4 / row-cap probes | G5 | step 21, inverted by 23r | **CLOSED.** Verified in-tree: the three characterization cases are now passing proofs (`src/integration/runtime-logs.itest.ts`), and the drain's NUL strip, `int4` clamp and bind-parameter ceiling are each pinned. |

**CP5 carry, also discharged.** The gate's verdict on subprocess tests depends on the runner's
`.env.local`; `hardening-cli.test.ts` was green in every worktree only because none held an
`ANTHROPIC_API_KEY` (`25bdd27` blanked it). Run once here on the **full-secret main checkout**
(`/Users/go/code/bnow-net`, which does carry the key): **`npm test` → 4,599 passed / 293 files,
green**, and `hardening-cli.test.ts` alone → 14/14. The `--provider anthropic` "key not set"
refusal is genuinely reachable there: `BLANKED_ENV` sets `ANTHROPIC_API_KEY: ""`
(present-and-empty, which dotenv's no-override load leaves alone), not absent. The fix holds.

**Gate re-measured independently at the frozen tree, not copied from any report:**
typecheck clean · `eslint .` **0 errors, 3 pre-existing `no-unused-vars` warnings** ·
unit **4,599 / 293** · build PASS · 32 `.sql` under `drizzle/`.

---

## 2. Where every register gap G2–G16 now stands

The step-17 register left sixteen coverage gaps, two rated blocker-if-real. Decision A3 accepted
that register "with its stated limits … G2–G16 open", and CP4 §5.4 owed each a placement.

| Gap | Rated | Placement / result |
|---|---|---|
| G2 | blocker | **CLOSED.** The three merges out of step 17's scope (#63, #58, #66) are inside this audit's scope; all 49 merges were inventoried and diffed (§5). |
| G3 | major | **OPEN — step 27.** Correctly deferred; needs Vercel access. See AUD-04 for the corrected name list. |
| G4 | major | **CLOSED.** §1. |
| G5 | major | **CLOSED.** §1. |
| G6 | major | **OPEN — step 27.** The Vercel drain's external contract (the `x-vercel-signature` header shape, delivery semantics, retry behaviour) is vendor documentation this session was not permitted to fetch. It gates *registration*, not deploy. |
| G7 | blocker | **CLOSED — gap real but harmless.** §4, AUD-12/AUD-13. |
| G8 | minor | **CLOSED.** Covered by the mutation pass: `mapreduceTagFrom`'s provider-awareness mutant went RED (§4 method note). |
| G9 | minor | **CLOSED, partially.** The mutation pass ran in its own detached worktree with a cloned `node_modules` from an identical lockfile, serially, one mutation at a time, reverted between each. |
| G10 | minor | **CLOSED — gap real.** §4, AUD-08. |
| G11 | major | **CLOSED — arithmetic reproduces; two explanations do not.** §4, AUD-14/AUD-15. |
| G12 | major | **CLOSED.** §3. |
| G13 | minor | **CLOSED — and it caught a real regression.** §4, AUD-03. |
| G14 | minor | **CLOSED.** `scripts/model-routing-inspect.ts` runs; output in §6. |
| G15 | minor | **CLOSED.** PR #67 given the identity/eval/docs treatment: its `src/db/schema.ts` edit is genuinely comment-only, its `.env.example` edit adds no variable, and `ask_usage.provider`'s writer set is unchanged. |
| G16 | minor | **CLOSED.** §3.3. |

---

## 3. Merge fidelity and window provenance (G12)

### 3.1 Every merge tree recomputes exactly

For each of the 49 merge commits `M` with parents `P1` (main) and `P2` (branch tip), the merge
of `P1` and `P2` was recomputed with `git merge-tree --write-tree` and compared against `M`'s
actual tree. **49 of 49 are byte-identical.** Nothing was introduced at merge time — no
hand-resolution edit, no "while I'm here" change, no content that was not in one of the two
parents. This is a stronger statement than the prompt's per-PR `range-diff` and it covers the
whole window rather than the PRs whose reports happen to name a reviewed tip.

### 3.2 Every merged tip equals the head GitHub recorded

`gh pr view <n> --json headRefOid,mergeCommit` for all 49 PRs: **`headRefOid` equals the merge
commit's second parent in every case**, including #51 and #52, which GitHub shows as `CLOSED`
because they were merged locally and pushed (their tips are `8a24c83` and `dc7d47e`, exactly the
second parents of `6eaef5d` and `d74d588`). Two independent authorities agree, so the literal
`range-diff` against a report-named head is unnecessary — and would in any case have been
unexecutable for most PRs, since closing reports name their *base* SHA, not their own final tip
(the report is itself committed on the branch). **That is worth recording as a correction to the
gap's premise.**

### 3.3 Test-count provenance (G16)

Measured directly at the six merge SHAs the register named, in a detached scratch worktree:

| merge | PR | Test Files | Tests |
|---|---|---|---|
| `8ac41d2` | #57 | 257 | 3,762 |
| `8a00ea2` | #59 | 258 | 3,777 |
| `fed1d03` | #60 | 261 | 3,851 |
| `ef0bba8` | #61 | 261 | 3,854 |
| `7f267bd` | #65 | 258 | 3,808 |
| `1e06112` | #64 | 263 | 3,914 |

These are **first-parent merge points on a moving `main`, not a monotone sequence** — `7f267bd`
(#65) merged before `fed1d03` (#60) in wall-clock order, which is why its count is lower. The
program log's post-merge checkpoint figures (3,808/258 at `2a51f91`, 3,914/263 at `1e06112`,
4,599/293 at `a0d7091`) reconcile exactly with the two rows that overlap them.

Independently, a coverage-shrink scan across the whole window: **test files 272 → 323, declared
`it()`/`test()` blocks 3,365 → 4,226, zero test files deleted.** Three files shrank, all in the
`/conflicts/**` fixture→real-observation migration (PR #95); the dropped assertions are
adjudicated in AUD-11.

### 3.4 What entered `main` without a pull request

82 non-merge commits went directly to `main`, all by the operator. All but five are docs. The
five that are not:

- `25bdd27` — `src/lib/evals/hardening-cli.test.ts`. **The only `src/` file in the entire window
  that reached `main` without a PR.** It is the CP5 gate fix and is recorded in the program log.
- `f85efe2`, `c286db2`, `3941897`, `6913c57` — `scripts/launch/*` (launcher, claim ledger, status
  screen, `env-posture.sh`). Program tooling; production never executes it.
- `3f09757` — `scripts/check-decision-log-move.sh`; `93f718d` — `.gitattributes`.

No production `src/` code bypassed review. Recorded as AUD-19 (note).

---

## 4. Finding register

Format follows step 17's. **Verdict** is this audit's own: `CONFIRMED` = reproduced or proven
from code by at least two independent readers; `NARROWED` = the claim survives in a smaller
form than first stated; `REFUTED` = killed. Every major was put to independent refuters who were
instructed to destroy it.

### Majors

| ID | Sev | Finding | Evidence | Failure scenario | PR | Verdict |
|---|---|---|---|---|---|---|
| **AUD-01** | minor **+ decision needed** | *(see §4.1 — the estimative band and ruling 19; raised as a deploy-gating major, graded down after two independent refuters)* | — | — | #84 | **NARROWED** |
| **AUD-02** | major | `docs/OUTREACH-ROSTER-2026-08-23.md` — 430 lines carrying **19 email addresses and 14 phone-shaped strings** for named third parties — is reachable from local branch `docs/operator-notes-20260905`, and that branch has `remote = origin` and a `merge` refspec configured. | Blob present at `7a6d629`; `git branch --contains` names only that branch; `git config branch.docs/operator-notes-20260905.remote` = `origin`; `git ls-remote origin 'refs/heads/docs/*'` returns only `docs/branding-strategy-20260909`. | One `git push` on that branch — or any `git push --all` — publishes named third parties' work and personal contact details to GitHub. Decision **D1** ("yes remove outreach from git") is honoured where it counts: the file is absent from `2c66e94` and from every window diff. The branch is the residue. | #48 lineage | **CONFIRMED** (two independent readers; I re-verified every step myself) |
| **AUD-03** | major | `docs/SETUP-NEXT-WEEK.md` silently lost PR #50's port-hygiene fix: the smoke test again says `cd ~/code/bnow.net` (a path that does not exist on the Mac) and `date -u -d yesterday` (GNU form). | `docs/SETUP-NEXT-WEEK.md:176,194,195` at `2c66e94`. Fixed by `74c7903` (PR #50, `b62538d`), reverted by `dc7d47e` (PR #52, `d74d588`) — the documented conflict resolution "only `SETUP-NEXT-WEEK.md` conflicted and #52's version was kept" kept #52's *pre-#50* copy of the whole file. | The operator is told to run this smoke test "after EACH key you add" — and step 27 adds `LOG_DRAIN_SECRET` to Production. Two of its six steps fail on their machine. **Proven by execution:** `date -u -d yesterday +%F` → `date: illegal option -- d`. | #52 over #50 | **CONFIRMED** (executed) |
| **AUD-04** | major | `AGENTS.md`'s analysis-routing bullet still enumerates "**All ten** routing envs … are ABSENT in Production, Preview and Development" and never gained the provider dimension. Five variables that now change dispatch are missing from the list. | `AGENTS.md:386-395` vs `src/lib/llm/model-config.ts:78-82`, which declares **fifteen** routing envs — `MAP_PROVIDER`, `REDUCE_PROVIDER`, `DIGEST_PROVIDER`, `VALIDATION_PROVIDER`, `ENTITY_AUDIT_PROVIDER` alongside the ten. `docs/CURRENT-STATE.md:409-418` *was* given the provider block; `AGENTS.md` was not. | Step 27's env read-back (G3) is the one place these are checked, and it will be run against an authoritative-looking list that omits five names — including `DIGEST_PROVIDER`, the single variable that can select a second vendor. | #60 (step 25 missed it) | **CONFIRMED** |
| **AUD-05** | major | The WS-3.6 shadow-soak enablement checklist has **no migration precondition** for 0028 or 0030. Its only `_migrations`/`to_regclass` gate is for 0029 / `runtime_logs` — a different feature. | `docs/reviews/CONFLICT-SHADOW-SOAK-ENABLEMENT-2026-09-07.md:112-197` (§2 is exhaustively env / flags / code / operating rules, no migration item); `:418-419` is the 0029 block, in §8. The document knows the route writes those tables (`:176-181`). | At WS-3.6 the cron line is added and the first scheduled run calls `discoverEditions`, which **fetches first** (politeFetch, ≥2.1 s/host, ~10 probes/run) and writes second; `SqlReferenceReportRepository` has no `to_regclass` preflight, so every cell throws `42P01`, the route catches per cell and calls `markDegraded(…, "nested_errors")` — it does not 500 and does not halt. A soak that looks like it is running, burns the third-party probe budget against a host already known to throttle, and records zero observations, indefinitely. This is decision A2's failure shape reproduced in the sibling workstream. | #96 | **CONFIRMED** |
| **AUD-06** | major | `docs/OPEN-TASKS.md` #79 still instructs an operator to run a production write that was executed on 2026-09-07, with no status line. | `docs/OPEN-TASKS.md:846-852` ("the historical rows need one authorized run: `npx tsx scripts/isw-refresh.ts --theater ru` + a full `registry-materialize`") vs `AGENTS.md:1324-1349` (the EXECUTED entry: ru pending 36 → 0, 5,421 citations, 98 sources) and `docs/OPEN-TASKS.md:1113` (#113 says "#79 closed complete"). | An operator working the Tier-2 list re-runs a 36-report fetch plus a full `DELETE`-and-rebuild of `source_theater_stats`. That materialize rewrites `sources.reliability_score`, which `src/lib/analysis/digest.ts:89,100` orders the digest gather by — so the redundant run is a **live behaviour change**, not a no-op. | step 25 | **CONFIRMED** |
| **AUD-07** | minor | The client-boundary scan guards **2 of the 13** modules in the client graph, so a server-only import can enter a `"use client"` bundle and pass the entire pre-push gate **and** the build. | `src/lib/citation/client-boundary.test.ts:25` scans exactly `["ics206.ts", "../tradecraft/estimative.ts"]`. The real graph from `claim-copy-actions.tsx` (`"use client"`, value-imports `./claim-copy-model` at `:13-20`) is **13 modules**. The 11 unscanned include `claim-copy-model.ts`, `claim-evidence-model.ts`, `@/lib/time/format-et.ts`, `product-event-model.ts` — and `src/lib/analysis/attribution-labels.ts`, *the module created to fix the previous leak this test's own comment describes*. `eslint.config.mjs` has no `no-restricted-imports`; there is no `madge` test; and **`server-only` is neither used nor installed**, so Next.js's build-time poison pill for this class is absent. | **Reproduced, then strengthened.** The originally-proposed mutation (a dead export) is tree-shaken and reaches no browser chunk. A non-shakeable version — the same import referenced inside `citationButtonLabel`, which the client component does import — leaves `client-boundary.test.ts` green (13), the suite green (4,599), typecheck 0, `eslint .` 0 errors, **and `npm run build` exit 0** — while `@/db` ships as a **256 KB async client chunk** containing Drizzle, `@neondatabase/serverless` and the schema (`raw_documents`, `doc_claims`, `provider_usage`, `source_citations`, `ask_usage` all present in `.next/static/`). **No secret leaks** — the DSN appears in no static chunk; only `NEXT_PUBLIC_*` is inlined. Worst case is internal schema disclosure in a publicly fetchable asset plus bundle bloat. Zero active violations today: the test's own six `FORBIDDEN` regexes are clean over all 13 modules. | #80 | **NARROWED** (major → minor) |

### §4.1 AUD-01 — the estimative band on disputed person-allegations

This was raised as the audit's one deploy-gating major. It was put to **two independent
refuters**, both of which executed the real modules. They agree on every fact and split on
severity; this section adjudicates.

**What was claimed.** `ESTIMATIVE_MAP_V1` publishes `likely (55–80%)` — and AJP-2.1 credibility
2, "probably true" — for exactly the disputed named-person allegations ruling 19 exists to keep
unpromoted, re-applying in a different vocabulary the corroboration lift that
`synthesize.ts:409-419` says "must never confirm a reputational allegation about a named person
on its own".

**What both refuters reproduced, by execution.** The mechanism is exact. A `claimed`-hedged,
two-document, named-person embezzlement claim passes `guardPublishedEvents` with
`{attributedClaims: 1, droppedClaims: 0, retitledEvents: 1}`, is published as *"Sources claim:
…"*, summarizes to `{documents: 2, channels: 2, platforms: 2}` = tier C3, and renders
**`Likelihood: likely (55–80%) · Corroboration-derived confidence: moderate`**. The guard does
**not** rewrite `hedging`, so the `claimed` row is genuinely reachable.

**Three facts that narrow it, each measured:**

1. **Ruling 19 is not circumvented — it is inherited.** `synthesize.ts:417-420` recomputes the
   ladder on **native, pre-promotion** hedging for person-allegations, so such a claim enters the
   estimative table on the `claimed` row and can never enter on `confirmed`. Measured over the
   identical claim and documents: `claimed` → `likely (55–80%) / moderate`; `confirmed` →
   `very likely (80–95%) / high`. Ruling 19 still costs the allegation two band steps, a
   confidence step, and AJP-2.1 level 1 (whose definition is literally "confirmed by other
   sources"). The estimative layer sits downstream of the suppression and inherits it.
2. **No public surface.** All four render sites are accepted-user gated — `page.tsx:273`,
   `search/page.tsx:108`, `ask/page.tsx:41`, and on `/signals` the evidence query *and* render
   are both inside `if (accepted)`. There is no anonymous exposure.
3. **The aggravator does not exist.** `Estimate.credibility` is computed and **never rendered**:
   `ics206.ts:103-105` states the AJP-2.1 code is "deliberately ABSENT … a derived EXPORT field
   and never the primary presentation (decision T1)", verified empirically —
   `JSON.stringify(citation).includes("credibility")` is `false`. And the guard's `"Sources
   claim:"` prefix is persisted into `claims.text`, so it travels to every surface including
   `/ask`, which renders no hedging chip of its own.

**The one thing that survives all of that, and it is a decision rather than a defect.** None of
T3's six signed invariants mentions person-allegations, defamation, or ruling 19. The only
harm-shaped constraint — the operator's *"nothing above likely/moderate from a single
uncorroborated document"* — is keyed on **document count, not content class**, so at two
documents every constraint lifts to the row cap for a shell striking a substation and for a
named general accused of embezzlement alike. And the interaction was never posed anywhere:
`allegation` appears zero times in step 34's prompt; `WS-7-4-ESTIMATIVE-2026-09-07.md:197-199`
clears ruling 19 solely on the ground that `publication-guard.ts` "is not touched"; PLAN-WS-7 and
the addendum list the guard only under "must not touch"; `estimative.test.ts` references the
guard twice, both inside the import-hygiene scan that **forbids** importing it. The module is
architecturally incapable of seeing `isPersonAllegation`, and that blindness was pinned by a test
rather than noticed as a gap. The sharp edge: `ALLEGATION_MIN_DOCS = 2` is exactly the evidence
count at which the `claimed` row reaches its ceiling — there is no interval between "barely
publishable as a defamation-grade allegation" and "likely, 55–80%".

**Adjudication.** Not a ruling-19 violation, not deploy-gating, and not a defect against a signed
decision — but a real question the operator was never asked, on the one content class that has
its own standing ruling, in output modes (`reportLines`, `reportHtml`, ICS 206-01) built to be
pasted into client deliverables. Graded **minor, with a decision needed**: put the
`claimed × C2/C3` allegation cell to the operator as a **T3 addendum** before the next program
touches the estimative layer. Nothing persists — the band is presentation, so a V2 changes it
with no backfill. The cheapest remediation already exists in the module and is tested: route a
disputed person-allegation to the `withheld` path (`likelihood: null`, "not assessable"), with
content-sensitivity supplied by a server-passed boolean or a leaf module on the
`attribution-labels.ts` precedent, which preserves the import-hygiene invariant.

**Two novel items surfaced while refuting, both independent of the above:**

- **AUD-49 (minor).** `corroborationTier` **ignores `doc_dedup` mirrors that the pipeline's own
  independence test consults.** Measured over the same two documents: `independentSourceCount`
  with the mirror map = **1** (below the `reduce.ts:367` promotion threshold), while
  `corroborationTier` = **C3** and the band lifts anyway. `reduce-io.ts:118-126` loads `mirrorOf`
  from `doc_dedup`, but `finalizeEvents` unions all group `docIds`, so both mirror documents
  become `claim_sources` rows and `summarizeClaimEvidence` counts two channels. The shipped C2
  rationale — *"ruling 12's ±1-day dedup means these are not mirrors of one post"* — is
  contradicted by `reduce.ts`, which needs a mirror map precisely because distinct domains can be
  mirrors. Up to one band step of over-credit, **all hedging rows**, gated surfaces only.
  `estimative.test.ts` has zero mentions of mirrors or dedup. Plumbing fix; follow-up, not a gate.
- **AUD-50 (note).** `estimateDerivation`'s docstring (`estimative.ts:345`) says it serves "a
  tooltip, an aria-label and the citation artifact". **The aria-label was never wired** —
  `claim-estimative.tsx:59-77` sets `title` only. So the derivation is invisible on touch, absent
  from print (`title` does not print), and absent from copied text; the citation artifact is the
  one place a reader can act on it. WS-7-4's judgment call 4 offers the tooltip as the mitigation
  for `/ask` having no hedging chip — on a phone or in a PDF that mitigation is not there.

### Minors

| ID | Sev | Finding | Evidence | PR | Verdict |
|---|---|---|---|---|---|
| **AUD-08** | minor | A degraded Ask answer (`unscorecarded`, `budget`, `stub`) renders **identically to a full synthesized answer**, with no marker — while `limit`, `error`, `insufficient` and `refused` all disclose. | `src/app/ask/ask-result.tsx:159-243` branches only on `state`; all three degraded providers arrive as `state:"answered"` (`answer.ts:608,631,710,812`) and take the plain body render at `:193-195` plus the deliberately provider-omitting footer at `:222-228`. | #67 | **CONFIRMED** (G10) |
| **AUD-09** | minor | Migration **0029** has no additivity guard, while 0028 and 0030 do. | `src/db/migrations.test.ts` has `describe` blocks for 0027 (`:66`), 0028 (`:83`) and 0030 (`:131`) — none for 0029. The file itself is genuinely additive today. | #64 | **CONFIRMED** |
| **AUD-10** | minor | `assertMigrationTarget` compares **hostnames only**, so two DSNs naming different databases pass, and an unparseable DSN falls back to raw-string comparison that both false-positives *and* prints the credential. | `scripts/migrations-lib.ts:16-24` keys on `new URL(dsn).hostname`, dropping port, database name, role and query string: `…@host:5432/bnow` vs `…@host:5433/bnow`, `…?options=endpoint%3Dep-prod` vs `…%3Dep-fork`, and `…/neondb` vs `…/scratch` all compare EQUAL. Separately, a password containing `#`, `?` or `/` makes `new URL()` throw; the `catch` at `:21-23` returns the whole DSN, so the two differ by `-pooler`, the guard **refuses a correct migration**, and `:57-65` interpolates both DSNs — password included — into the error. | #89 | **CONFIRMED** (reproduced locally, no connection made) |
| **AUD-11** | minor | The `unit-flags-v0` `negative` heuristic can be widened to fire on any occurrence of "no" and the suite stays green: the five false-positive controls contain no standalone `no`/`not`. | Mutation `/\bno\s+(?:confirmed\|significant\|notable\|reported\|verified)\b/i` → `/\bno\b/i` at `src/lib/conflicts/unit-flags.ts:45` left `unit-flags.test.ts:34` GREEN, the 990-test conflicts domain GREEN, the full suite GREEN. `keyword-matcher.ts:112` skips a `negative` unit, so a false positive silently converts a matchable declared unit into a miss — numerator down, denominator unchanged. That heuristic's precision is exactly what WS-3.6's soak will measure. | #92/#93 | **CONFIRMED** |
| **AUD-12** | minor | D-e's "substring mode is byte-identical under the fold" is true in the code but **not pinned by any discriminating test**; a mutant hoisting `foldMatchPunctuation` above the `matchMode === "substring"` early return would survive the suite. | `iran-levant-v1.test.ts:279-301` asserts only that `RU_UA_V1.matchMode === "substring"` (a constant) and that `belgorod` is found in `belgorod‑oblast` — true with or without the fold. The discriminating input (Cyrillic `куп’янськ` with U+2019 against the ASCII-apostrophe variants at `ru-ua-v1.ts:21,26`) appears nowhere in the tree. | #91 | **CONFIRMED** |
| **AUD-13** | minor | WS2-F02's **documentation half never landed**, so half of #62's `fix-before-deploy` verdict is still open and is filed nowhere. | `docs/designs/LOG-DRAIN.md:228-229` and `:562-563` still say the cron discriminator "is recoverable from `cron_runs.job`"; the §9(c) correlation query at `:510-521` hard-codes `/api/cron/map`. But `vercel.json` schedules **four** crons on `/api/cron/ingest` and four on `/api/cron/digest`, distinguished only by the query string the receiver strips (`drain.ts:272-281`), and `cron_runs.job` cannot repair it because the path is identical for all four. OPEN-TASKS #119 files only the code half. | between #89 and #97 | **CONFIRMED** |
| **AUD-14** | minor | §19.6's stated cause of the −37.7% modelled-vs-actual remap divergence is **arithmetically insufficient**. | `MAP-REMAP-RUNBOOK-2026-09-06.md:993-998` attributes it to the chars-based prompt-token approximation over-predicting. But the model's **output term alone** for 701 pairs is `701 × 135 × $0.60/1e6 = $0.056781`, already 22.7% above the measured **total** of $0.046263 — with zero prompt tokens the model still over-predicts. The dominant term is `outTok = pairCount * 135` (`map-worker.ts:834`) against a day where 341 of 701 pairs produced no claims. | #65 / D7 entry | **CONFIRMED** |
| **AUD-15** | minor | The "38 dispatches against 36 modelled batches" overrun is attributed to truncation splits **without evidence**, and 36 is the wrong comparator for an executed run. | `counts.truncationSplits` / `truncatedSingles` are recorded (`map-worker.ts:447-448,1092-1098`) but quoted nowhere in §19. And `batches=36` is the single-shot dry-run figure; the executed run drained in 12 sweeps of ≤400 docs and the route re-batches per call, so the executed modelled count is `Σ ceil(pᵢ/20)` ≥ 36 (up to 47). 38 is consistent with **zero** truncation splits. The underlying code claim ("a truncation split meters its own request") is true and verified. | #65 §19 | **CONFIRMED** |
| **AUD-51** | minor | PR #95's fixture→real-observation rewrite dropped **four** truth-in-UI "empty is not zero" pins without replacement and introduced a **fifth** unpinned, while all five behaviours remain present and correct in the code. | Unpinned: the `zero-eligible-qualifier` ("0 eligible claims in the corpus", `presence-module.tsx:27-36`) and `corpus-recall-incomparable` / `corpus-incomparable-note` (`:47-56,62-70,138-145`) have **zero** test references — and the new suite already renders the exact triggering golden for the second, unasserted; `empty-evidence-note` (`benchmark/[key]/page.tsx:121-133` and `[slug]/page.tsx:136-140`) has none, and the old test for it existed *because the two sites had once disagreed* ("Gate-9 DEFECT-1", quoted in the removed test); and the new `observations-empty` / `noObservationsNote` ("an absence of observations, not a coverage result — it is never a 0%", `product-copy.ts:179-181`) has no component test at all. Cheap to close: two `expect` lines in tests that already render the golden, plus one seeded day using the committed, persistable `cc-state-zero-empty-015` or `roca-retention-gap-008b`. | #95 | **CONFIRMED** (five of nine; four of the nine refuted or obsolete — §4.3) |
| **AUD-16** | minor | Offline eval results can resume across different `ANALYSIS_ROUTING_REGISTRY_VERSION` values into one file whose header claims a single version. | `src/lib/evals/runner.ts:570-581` compares `registryVersion` only when a header is LIVE; `mergeEvalResults` (`:661`) keeps the existing header. Provenance-only: offline dispatches nothing, and all 13 committed offline files uniformly carry `analysis-reg-v1` / `provider: "stub"`. | #61 | **CONFIRMED, harmless** |
| **AUD-17** | minor | The ruling-3 "module graph" guard is a source-substring scan over three fixed file sets, not a module-graph walk, and `db-product-view.ts:7-9`'s claim that the fixture corpus "is unreachable from this module" is already false. | Value-import chain in four hops: `db-product-view.ts:49` → `observation-store.ts:35-43` → `eval-profile.ts:47-51` → `snapshot-ref.ts:40` → `fixture-corpus.ts` (every link a value import, verified twice independently). Scan 1 greps only `db-product-view.ts` for `from\s+"…"` — **blind to the `await import()` form the four pages themselves use** to reach the view, so a dynamic fixture import in the empty-observations branch would pass the whole suite. `result-summary.ts` and `product-copy.ts` are both in the page closure and in none of the scanned sets. | #95 | **NARROWED** — see §4.2 |
| **AUD-18** | minor | Two commit subjects carry model/vendor names outside the D12 carve-out, and 10 of 235 non-merge commits lack the `area:` prefix. | `db43c0a` "Tracker to keep Opus on track"; `c286db2` "… step 26 on Opus; launcher wraps claude in caffeinate". D12 permits model names in `docs/prompts/*`, `docs/reviews/*` and the decision log — "never in commits, PRs, code, or code comments". | operator commits | **CONFIRMED** |

### Notes

| ID | Finding |
|---|---|
| **AUD-19** | One `src/` file reached `main` without a PR (`25bdd27`, `hardening-cli.test.ts`), plus `scripts/launch/*`, `check-decision-log-move.sh` and `.gitattributes`. All operator commits, all recorded in the program log. No production code bypassed review. |
| **AUD-20** | **A `Co-Authored-By: Claude Opus 5` trailer and a `Claude-Session:` URL are in pushed history** at commit `901078a`, against `CLAUDE.md:49-51` and D12. Exactly one commit of 284. Unfixable without a history rewrite; recorded so it is not mistaken for policy. |
| **AUD-21** | `scripts/analysis-eval.ts:63` still tells the operator "only openai is eval-dispatchable in this build"; the runtime refusal prints `allowed: openai\|anthropic` (`live-runner.ts:313-316`). PR #85 widened the constant and left the CLI header. |
| **AUD-22** | The Anthropic provider parses the response body **before** metering it: `anthropic-provider.ts:209` does `parseMessagesResponse(await res.json())` and records at `:213`. `parseMessagesResponse` was deliberately made total *because* the caller meters first (ruling 8) — but `res.json()` itself throws on a non-JSON 200, so a billed response can be discarded unrecorded. Dormant (no Anthropic approval exists). One-line fix: `const body = await res.text()`. |
| **AUD-23** | `VERCEL_TOKEN` is stated **two incompatible ways across five standing documents**, including inside `AGENTS.md` itself: working at `AGENTS.md:1736`, `CURRENT-STATE.md:735-737`, `DECISIONS.md:2968`; expired at `CLAUDE.md:36`, `RELEASE-CHECKLIST.md:79`, `BLOCKERS.md:7-10,121`, and `AGENTS.md:1754`'s open operator to-do. D8 (2026-09-05) is the most recent adjudication and says valid. |
| **AUD-24** | Post-drain registry counts are stale in both snapshots: `AGENTS.md:311` and `CURRENT-STATE.md:218-219` say ~10,015 sources / ir 3,654, against the decision log's own post-drain 10,224 / ir 3,681 (`AGENTS.md:1346-1349`). |
| **AUD-25** | The merged-PR range is wrong in three places (`AGENTS.md:175`, `CURRENT-STATE.md:35,758-759`): "48 further PRs, #49–#96". The window merged **49** PRs by first-parent count; #82 and #83 never merged; the true range at `2c66e94` is **#47, #48 and #49–#97 — 49 merges**. |
| **AUD-26** | `AGENTS.md:265-266` and `:274-275` still say the #33 remap operator "has never been executed", contradicting the same file's own decision entry at `:801-836` and Next-steps at `:1774-1780`. Step 25 corrected four of six places. |
| **AUD-27** | `AGENTS.md:219-220` says `/health` stamps `8a19ade` (correct); `:302-303` says "the LIVE deployment today stamps `143964a`" (stale prose from the 2026-08-24 lineage). |
| **AUD-28** | Ruling 4's cap list omits `REDUCE_USD_CAP_DAILY`, `LLM_MATCH_DAILY_USD_CAP` and `EVAL_USD_CAP_DAILY`, and **wrongly implies `OPENSANCTIONS_CALL_CAP` fails closed**: `src/lib/enrich/run.ts:39-44` builds it with `totalCapUsd: null` and `envNum("OPENSANCTIONS_CALL_CAP", 300)`, so unset yields a silent 300-calls/month allowance. Pre-existing, but it is a false clause in an invariant-grade ruling. |
| **AUD-29** | Ruling 21 states unconditionally that "a new gated route needs a row in that test's ROUTES table"; the window's four `/conflicts/**` routes are deliberately covered by `conflict-feature-off.itest.ts` instead, per memo C10 — genuinely equivalent, but the ruling records no carve-out, so a reader auditing by grepping ROUTES concludes the invariant was violated. |
| **AUD-30** | `docs/BLOCKERS.md:11-17,121-122` still says there is no `ANTHROPIC_API_KEY` and "no action until the #83 wiring lands" — the wiring landed (#81/#85) and the key exists locally per D2 = B. |
| **AUD-31** | Three migrations (0028, 0029, 0030) and two feature PRs (#56 gazetteer, #70 edition discovery) landed with **no decision-log entry**. The only record of the gap is inside the step-25 entry, which is itself headed `UNSIGNED`. Nothing in `OPEN-TASKS.md` tracks it. |
| **AUD-32** | Two source files contain a **raw NUL byte**, so git treats them as binary and `grep -r` skips them silently: `src/lib/conflicts/unit-lanes.test.ts` (added this window by `fee06e2` — its PR diff rendered as `Bin 0 -> 1719 bytes`, i.e. literally unreviewable) and, pre-existing, `src/lib/analysis/digest-persist.ts`. **Consequence for every grep-based register in this program, including parts of this one:** `grep -rn "publication-guard" src` does not list `digest-persist.ts`, so a grep-based check of "who calls `guardPublishedEvents`" reads as "the production persist path no longer guards". It does — `digest-persist.ts:25` imports it and `:94` calls it before the overwrite verdict (verified by reading, not grepping). Tracked as OPEN-TASKS #118. |
| **AUD-33** | Flipping `DIGEST_PROVIDER` to `anthropic` would move digest spend to a ledger row with a fresh $0 cumulative total, granting a **second full** `LLM_DIGEST_USD_CAP` day envelope and a second full `LLM_SPRINT_USD_CAP` backstop. Documented as intended (`llm-guard.ts:28-36`, "ADDITIVE, not shared"), consistent with ruling 4's per-row semantics and the `openai_entity_audit` precedent — but R6's "reuse the existing envelope" reads as a shared ceiling and it is not one. Cannot fire today. |
| **AUD-34** | No vendor→ledger-row mapping exists for `map`, `reduce`, `validation` or `entity_audit`; the per-workload allowlist is the only thing preventing a widened vendor from metering onto an `openai_*` row. Strongly mitigated: the allowlist is spelled out and pinned by `model-config.test.ts:627-640`, so widening requires an explicit diff there. |
| **AUD-35** | A production-wide Ask degradation has **no operator-visible signal**: `audit-cron.ts` reads `cron_runs` only and Ask is not a cron; the sole trace is a `console.warn` plus `ask_usage.provider`, in a deployment whose log drain is built and unregistered. Pairs with AUD-08. |
| **AUD-36** | `src/lib/conflicts/reference-repo.ts:5-8` still calls the SQL repository "integration tests only; durable DB wiring DEFERRED", and `reference-repo-sql.ts:9-10` says "Nothing in production imports this module yet" — both false: three non-test importers exist (`conflict-validate/route.ts:8`, `db-product-view.ts:50`, `db-claim-sources.ts:66`). What holds it back is the `CONFLICTS_UI` flag and the absent cron line — a weaker and differently-shaped guarantee than "no import edge". |
| **AUD-37** | `src/lib/llm/model-config.ts:168` describes the shipped allowlist as "`{openai}`-everywhere" and its refusal branches as "unreachable" — contradicted by `providers.ts:64` (`digest: {openai, anthropic}`) and by this same file's own header at `:20-21`. |
| **AUD-38** | Thirteen lane worktrees remain on disk after their PRs merged, against the AGENTS.md convention "REMOVED in the same session that merges its PR". `git worktree list` shows **0** `/sessions/` gitdir paths and no prunable entry, so binding item (9) is satisfied. One lane branch, `48h/audit-ws3-20260905-remediate-ws3`, is +15 vs `main`; the CP7 log calls these "all equivalent patches already merged", but `git cherry` marks `4935fbd` as **not** equivalent. Its content (OPEN-TASKS #119 WS-3 rows, #114/#116 statuses) **is** present at `2c66e94` via #94/#89 in re-merged form, so nothing is lost — the log's wording is imprecise, not the outcome. |
| **AUD-39** | The isolation test walks `src/` and `scripts/` only; root-level `next.config.ts`, `drizzle.config.ts` and `vitest.config.ts` are unscanned. `next.config.ts` is build-time production config, so a violation there would be real though implausible. |
| **AUD-40** | Smaller doc-truth items, each with doc and code cited: `AGENTS.md:51` says "RSS (29 feeds)" against 34 in `src/lib/ingest/config.ts` and 34 in its own prose at `:315`; `AGENTS.md:60-64`'s diagram still says the map stage leaves the "digest pipeline untouched by it", false since the 2026-07-09 engine flip; `AGENTS.md:3` keeps a "~300 lines" rule against a 1,799-line file while `:11` carries the enforced 150,000-character one; `AGENTS.md:1735` cites `scripts/migrate.ts:7` for a read now at `:12`; `scripts/launch/` and `scripts/evals/` are absent from the directory map; `src/lib/text/` is described as "map+reduce+digest adopted" against thirteen importers; `CLAUDE.md:29` says `npm test` is "~3s" (measured 13.4s); `product-copy.ts:137-139` asserts a synthetic-corpus banner "renders beside this heading on every conflict surface" when `SYNTHETIC_CORPUS_HEADING` has zero consumers; `benchmark-key.ts:4,6` cite `product-view.ts:69`/`:73` after the file shifted. |
| **AUD-41** | `docs/prompts/BUILD-mirror-trade.md:3` still carries `/home/go/code/bnow.net`. PR #50 touched the file but did not fix that line — an incomplete port-hygiene pass, not a revert. |
| **AUD-42** | `live-observation.test.ts`'s double no longer models the WS3-F04 identity `SELECT` after `229d0e6`, so those 12 tests must not be read as evidence for F04. F04 is genuinely covered by `observation-store.test.ts:120-131` and the fork itest — a reading hazard, not a coverage hole. |
| **AUD-43** | `AUDIT-REMEDIATIONS-2026-09-07.md` says "Twenty-nine WS-2 findings are deferred"; OPEN-TASKS #119 carries **32** distinct ids. Every one is filed with a reason; only the prose figure is wrong. |
| **AUD-44** | WS2-F68's pre-deploy env assertion (`ASK_ANSWER_MODEL` / `ASK_RERANK_MODEL` / `ASK_PIPELINE` absent) lives only in the step-27 prompt, not in `RELEASE-CHECKLIST.md`, so it expires with this program — and it matters *more* after PR #88, not less. |
| **AUD-45** | WS2-F06's **pricing half** is unfixed and filed nowhere: `answer.ts:210` resolves the legacy model with no `pricedFor` check and `pricing.ts:71` falls back to `{in:5,out:15}` for an unknown key, so a wrong price now feeds `provider_usage` and the `openai_ask` cap arithmetic. Reachable only with `ASK_PIPELINE=legacy` **and** `OPENAI_MODEL` set, both absent everywhere. |
| **AUD-46** | The `llm_conflict_match` ledger row records **1 token per request** by construction (`llm-match.ts:158`, a verbatim carry-over from production `llm_match`), so any token-based soak accounting on that column is wrong before the soak starts. USD is computed correctly from real usage; the soak's own thresholds are request- and dollar-based. |
| **AUD-47** | `scripts/launch/env-posture.sh:29,44` writes the project-wide Neon admin credential (`NEON_API_KEY`) into each worktree's `.env.local`. The script's intent is protective (`launch.sh:83-89` refuses an unattended launch when spend keys are present) and it prints only variable names — but it does spread a project-admin credential across 14 directories. Recorded so the tradeoff is a chosen one. |
| **AUD-48** | `runtime_logs` gives a durable 14-day home to a pre-existing console line that prints a user's email address (`src/lib/auth-delivery.ts:104`). The magic-link token itself is redacted and `stripQuery` keeps `/ask?q=` out of `request_path`, but the bare identifier before the colon is not redacted. Interacts with the Privacy 1.3 retention disclosure; only live once the drain is registered. |

### What was checked and found clean

Recorded so coverage is legible, not just failures.

- **Ruling 1 (legal).** `benchmark_report_editions.derived` is a closed shape enforced on every
  write and re-validated inside the repository before both the INSERT and the CAS UPDATE;
  `conflict_validation_observations.result` passes `assertNoProseInStoredResult` — every string
  *and object key* matched against a token charset, ≤256 chars, two documented exceptions.
  Takeaway text is genuinely transient: held in memory for the matcher prompt, and only unit
  **ids** are stored. No prose column in 0028 or 0030 (pinned). `evidence-list.tsx:7` renders no
  takeaway text. The ICS 206-01 builder reads a whitelisted metadata set only.
- **Ruling 2 (traceability).** `drizzle/9999_claim_source_trigger.sql` is **byte-unchanged** in
  the window and still sorts last. No production claim-INSERT path was added.
- **Ruling 5 (migrations).** All three new files create only new tables, indexes and constraints
  on those new tables: zero `DROP`, zero `ALTER` of any pre-existing table, no `NOT NULL` on an
  existing table, no backfill, no data statement. Snapshot chain 0027→0028→0029→0030 by `prevId`.
  Per-file atomicity means a failure leaves no partial DDL and no marker.
- **Ruling 4 (spend).** Every new or changed dispatch site reserves before the client is
  constructed: `createLiveMatcher` refuses on an absent `CONFLICT_MATCH_USD_CAP_DAILY` before a
  guard exists; `AnthropicProvider.analyze` gates on `workloadDispatchConfig` then reserves, and
  takes a *second* reservation for a 429 retry; `legacyAnswer` reserves before dispatch and
  meters before the body is interpreted; embeddings refuse an unpriced model before the SDK is
  built. No fail-open cap helper appears in new code — every USD cap uses `envCap`. **Ruling 4
  now holds on all five Ask dispatch sites**, enumerated independently.
- **Ruling 13 (map lock).** `MAP_PROVIDER=anthropic` is refused by the allowlist before any
  reservation; `MAP_CONTENT_CHARS` remains part of the version basis by design; a refused vendor
  keeps the OpenAI-shaped tag, so an Anthropic-synthesized digest cannot be stamped `openai:…`.
  *(One half-implemented edge — see §4.2.)*
- **Ruling 21 (page gates).** Every route added or modified in the window calls its gate as the
  first statement, ahead of `currentRole()` and every query; the four conflict pages import the
  DB client dynamically *after* the flag check.
- **Eval-plane isolation.** Exactly two commits touched `docs/evals/analysis/` — `6644699`
  (step 07's two authorized files) and `63c3620` (step 19's E5 refresh). No third writer.
  `scripts/evals/` unchanged. The E5 regeneration was **reproduced byte-for-byte** (only
  `generatedAt` differs), and the change is confined to one entry gaining
  `insufficientData: ["u1"]`; no threshold, verdict, denominator or score moved. Zero non-test
  imports of `src/lib/evals/` anywhere in `src/`. `bash scripts/evals/corpus-v2/check-regen.sh`
  → PASS, exit 0.
- **Secrets.** All 284 commits' patch text swept for key, token, DSN, JWT and private-key shapes:
  **zero real secrets**. The `neondb_owner` DSN exposed in a chat transcript on 2026-09-08 never
  reached the repo. Every hit is a declared placeholder or test fixture.
- **Dependencies and platform config.** `package-lock.json` byte-identical; no package added,
  removed or bumped; `vercel.json` **byte-identical — no cron line added or moved in the entire
  window**; `src/db/schema.ts` changed only by the three migration PRs plus one comment-only edit.
- **Module-load hazards.** Zero top-level `process.env` reads, DB clients or fetches among the
  window's changed non-test `src/` files; two deliberate lazy imports (`drain/route.ts:47`,
  `conflicts/page.tsx:31`) confirm the discipline.
- **Mutation pass.** Ten randomly drawn pins across eight PRs (seeded shuffle, recorded):
  **8 RED, 2 GREEN**. The whole spend-gate family held — routing allowlist, effort validation,
  cap-unset refusal, the legacy reservation, the provider tag, the append-only observation store.
  Both previously-doubted pins are now real: WS2-F07's exact-cache pin discriminates (three
  assertions flip), and the T4 disclosure-OFF pin survives a tier mutation, a role mutation
  **and** a call-site bypass.
- **Mutants M9 and M10** (step 18, flagged for re-check after lane C) are **both killed**.
- **Register re-check.** All 17 WS-2 and all 10 WS-3 fixes step 23 claims are present at
  `2c66e94` and address the stated defect rather than the symptom. Every deferred finding is
  filed in OPEN-TASKS #119 with a reason. **No claimed fix could not be confirmed.**
- **D-a … D-f compliance** verified clause by clause, including the sharpest (D-e): the fold sits
  below the `matchMode === "substring"` early return, and a source spelling *Куп’янськ* with
  U+2019 is not matched today — shipped behaviour is the unchanged one.

### §4.2 AUD-17 — what the ruling-3 guard proves, and what was refuted

Two independent refuters reached the same narrowed verdict. Recorded here because an
invariant-grade ruling's only stated enforcement mechanism is worth being precise about.

**Survives.** The scan is depth-1 and textual: `db-product-view.test.ts:494-500` greps one file
for `from\s+["'][^"']*<short>["']`, `:502-522` substring-scans `src/app/conflicts/**` and
`src/components/conflicts/**`, and `:524-533` scans tree-wide for `db-view.testkit` alone. It
resolves no import and walks no edge. The `db-product-view → observation-store → eval-profile →
snapshot-ref → fixture-corpus` chain is live and every link is a value import, so
`fixture-corpus.ts` is in the `/conflicts` server bundle — making `db-product-view.ts:7-9`'s
"unreachable from this module" false as written. **A green-suite violation was constructed and
checked against the literal assertion code:** a dynamic `await import("./fixture-corpus")` in
`db-product-view.ts`'s empty-observations branch is missed by all three scans, and that is the
house idiom — all four pages already reach the view that way.

**Refuted, and worth recording as refuted.**

- *"Fixture scenarios would render as fact."* Overstated. Of the five `FIXTURE_MODULES`, only
  `fixture-corpus.ts` is reachable, and the only value crossing that edge is the three-element
  `CONFLICT_FIXTURE_FILES` filename array. `product-view.ts` (the actual fixture provider),
  `goldens.ts`, `fixture-matcher.ts` and `db-view.testkit.ts` are all unreachable;
  `FixtureArtifactStore` has zero construction sites; every `readFileSync` is inside a function.
- *"`src/lib/adapters/stubs.ts` is a bypass because it is not in `FIXTURE_MODULES`."* Refuted —
  it is not value-reachable from the page graph at all, and stub exclusion for this surface is
  done at query level via `STUB_ADAPTER_NAMES`, a stronger mechanism than an import scan.
- *"`parseStoredResult` fails to re-refuse `fixture-oracle` on read while `MATCHER_RUNG_COPY`
  still renders a demo label — a latent ruling-3 hazard."* **Refuted by me against the database
  layer.** Migration 0030 carries `CONSTRAINT conflict_validation_observations_matcher_rung_check
  CHECK (matcher_rung IN ('llm-majority','llm','keyword'))`, and the read path builds
  `matcherRung` from `row.matcher_rung` (`observation-store.ts:470`) — the CHECK-constrained
  column, not the jsonb. A `fixture-oracle` row cannot exist by any path, including direct SQL.
  `schema.ts:1268` documents exactly this intent. Defence in depth at three layers holds.
- *"Two fixture-only components deleted"* — **accurate.** `synthetic-banner.tsx` and
  `benchmark-run-list.tsx` are deleted and nothing imports either.

**Ruling 3 is SAFE today on these surfaces** — the finding is guard/comment accuracy, not a
violation. It would become major the day `CONFLICTS_UI=1`. The repo already contains the right
shape: `matcher-import-hygiene.test.ts` sweeps every file in `src/lib/conflicts` with an
anti-vacuity check and a positive control; applying that shape here would have *surfaced* the
`snapshot-ref` edge rather than hiding it.

### §4.3 Findings REFUTED — recorded, because what an audit kills is evidence too

| Raised as | Verdict | Why it died |
|---|---|---|
| **major** — "`MAP_PROVIDER=anthropic` plus `MAP_MODEL` moves the map extractor-version basis, stranding every `doc_claims` consumer; the guard's comment and pinning test claim otherwise." | **REFUTED** → note | `MAP_PROVIDER` is a **total no-op on the version**. Exhaustive sweep — `MAP_MODEL` × `OPENAI_MODEL` × eight `MAP_PROVIDER` values (including invalid ones) over three (track, theater) pairs: **64 provider settings, 0 mismatches** against the provider-absent baseline. Structural reason: map's allowlist is `{openai}`, so `provider === "openai" \|\| !providerAllowed` is true for *every* value and the second branch is unreachable for map. The two flagged version strings are produced by **`MAP_MODEL` alone** — which is exactly what ruling 13 documents and hard-locks. The pinning test's actual invariant ("a refused provider never changes the *resolved model*") holds in the combined case, and a second dedicated pin the finding did not cite, `map-prompts.test.ts:229` ("the provider dimension is NOT part of the version basis"), sweeps four provider values across four pairs. **And the failure would not be silent:** `workloadDispatchConfig("map")` throws `MAP ACTIVATION BLOCKED` inside `withCronRun`, so `cron_runs.ok=false` hourly and `audit-cron.ts:53` prints it on the FAIL list, with `map_health` staleness as a second channel. Residual: add one combined-case assertion so the branch stays pinned if map's allowlist ever widens. |
| **major, deploy-gating** — "the estimative band re-applies ruling 19's forbidden corroboration lift on disputed person-allegations, publicly, with an AJP-2.1 'probably true' code." | **NARROWED** → minor + decision | Ruling 19 is inherited, not circumvented (`synthesize.ts:417-420` recomputes on native pre-promotion hedging, costing the allegation two band steps, a confidence step and AJP level 1); **no surface is public** (all four are `requireAcceptedUser()`-gated); and the AJP-2.1 code **is never rendered** — verified empirically. §4.1. |
| **part of AUD-17** — "fixture scenarios would render as fact"; "`stubs.ts` is an unguarded bypass"; "`parseStoredResult` fails to re-refuse `fixture-oracle`, a latent demo-labelling hazard." | **REFUTED** (three sub-claims) | Only the `CONFLICT_FIXTURE_FILES` filename array crosses the reachable edge; the four substantive fixture modules are unreachable. `stubs.ts` is not value-reachable and is excluded at query level. The `fixture-oracle` read path is protected by **migration 0030's CHECK constraint** `matcher_rung IN ('llm-majority','llm','keyword')`, and the render path reads that constrained column (`observation-store.ts:470`), not the jsonb — so such a row cannot exist by any path, including direct SQL. §4.2. |
| **part of the dropped-assertions finding** — "`renders an empty union as explicitly empty (retention gap), never invented` lost its pin." | **REFUTED** | Still pinned: `evidence/page.test.tsx:168-171` asserts `getByTestId("evidence-empty")` contains "No published digest claim", with the comment "an empty list is shown as empty, never as 'nothing changed'". Three of the nine dropped assertions are legitimately obsolete (the DB path cannot produce an unavailable result — `persistObservation` and `parseStoredResult` both throw on a non-`scored` state, so a gap day has no observation and its key 404s); one is substantially re-pinned. **Four are genuinely unpinned, and a fifth was introduced unpinned by the same PR** (`observations-empty` / `noObservationsNote`). All five behaviours are present and correct in the code, so this is a coverage regression, not a live defect — recorded as AUD-11's sibling and cheap to close, since the triggering goldens (`cc-state-zero-empty-015`, `roca-retention-gap-008b`) are already committed and persistable. |
| **major** — "`engines.node: \">=22\"` can change the production runtime." | **NARROWED** → minor + one checklist line | Unprovable from the repository and probably a no-op: `>=22` is open-ended, `next@16.2.10` already requires `>=20.9.0`, there is no `.npmrc` or `engine-strict`, and CI is green on Node 22 at this SHA. The documentation failure is real (a build input filed as hygiene under an explicit "no behavior change" claim), and the line has never been evaluated by Vercel's selector in *any* environment — there is no Git integration, `gh api …/deployments` is empty, and CI never runs `npm run build`. Worst realistic case is a loud build failure. §5.2. |

---

## 5. Per-PR deploy verdict

**Read this first: the deploy unit is the TREE, not the PR.** Vercel ships `main`; there is no
mechanism to deploy a subset. This table exists to identify anything that must be **backed out
before the tree ships**, and to give each PR its migration, env, rollback and observation
obligations. **No PR in the window is `no-go`.**

**Verdict key.** `go` = ships as part of the tree with nothing owed. `go-after-fix` = something
must be corrected first (the fix is named). `go + observe` = ships, but changes a production
request and earns a named observation window.

### 5.1 The four `go-after-fix` items — all small, none is a code rollback

| # | Fix | Kind | Why it gates |
|---|---|---|---|
| 1 | **AUD-04** — correct `AGENTS.md:386-395` to list all **fifteen** routing envs (the ten `*_MODEL`/`*_REASONING_EFFORT` plus the five `*_PROVIDER`), and the provider dimension in the fail-closed list. | docs | Step 27's env read-back (G3) is the one place these are checked and it would run against a list missing `DIGEST_PROVIDER` — the single variable that can select a second vendor. |
| 2 | **AUD-03** — restore PR #50's port-hygiene fix in `docs/SETUP-NEXT-WEEK.md:176,194,195` (`cd /Users/go/code/bnow-net`, BSD `date -u -v-1d`). | docs | The operator is told to run that smoke test after each key they add, and step 27 adds `LOG_DRAIN_SECRET`. Two of its six steps fail on their machine today (proven by execution). |
| 3 | **AUD-06** — add a CLOSED/EXECUTED status line to `docs/OPEN-TASKS.md` #79. | docs | An operator working the Tier-2 list would re-run a full `DELETE`-and-rebuild of `source_theater_stats`, which rewrites `sources.reliability_score` and therefore changes which documents enter ru digests. A live behaviour change presented as a pending chore. |
| 4 | **AUD-02** — `git branch -D docs/operator-notes-20260905`. | one command | 430 lines of third-party PII (19 emails, 14 phone-shaped strings) are one `git push` from GitHub on a branch with an `origin` upstream configured. D1 said remove it from git; this is the residue. |

**AUD-05** (the WS-3.6 soak checklist's missing migration gate) is a major, but it gates
**WS-3.6**, not this deploy. Fix it before anyone runs that checklist.

### 5.2 The eight PRs that change a production request

| PR | What changes | Migration first | Env it reads | Rollback | Observation | Verdict |
|---|---|---|---|---|---|---|
| **#60** provider dimension | `dispatchIdentity()` now emits a `provider` field, persisted additively into `digests.structured.stats.*.dispatch` and `cron_runs.counts.dispatch`. Reached by map `:40`, all four digests, validate 07:00, entity-audit. With every `*_PROVIDER` absent it resolves `openai` and the payloads are unchanged. | none | `MAP_/REDUCE_/DIGEST_/VALIDATION_/ENTITY_AUDIT_PROVIDER` (flag; unset ⇒ `openai`, then allowlist + pricing + registry still gate) | plain revert | **3 map cycles + 1 digest cycle** — confirm `mapExtractorVersion()` is stable (no `doc_claims` version split) and `cron_runs.counts.dispatch` carries the new shape | **go + observe** (longest window) |
| **#59** embeddings unpriced-model refusal | On the 02:00 finalize path: `embedTexts` throws `EmbedModelUnpricedError` before the SDK client and before the reservation when the model has no `EMBED_PRICES_PER_MTOK` row. The table holds exactly one key, `text-embedding-3-small`. | none | `ASK_EMBED_MODEL` (existing name, **new refusal consequence**) | plain revert | **first night's 02:00 finalize** — `openai_embed` requests and `claim_embeddings` inserts must be non-zero; then two more nights | **go, after the env read-back** — this is the single item the repo cannot settle |
| **#69** public `/methodology` | **A new public, unauthenticated, indexable page appears**, added to `sitemap.xml`. DB-free and session-free by construction; reads only `crosswalk.ts`. | none | — | plain revert (page 404s again) | first crawl; confirm no hedging weight constants and no reliability score are printed (T5) | **go + observe** |
| **#84** estimative band | A new estimative line renders on **every claim row** of `/digests/*`, `/search`, `/signals`, `/ask` — all accepted-user gated. | none | — | plain revert (presentation only, nothing persists) | 2 days; confirm no numeric confidence score leaks (T3-a) | **go + observe** — and see §4.1's decision |
| **#77** source descriptors | Public digest page gains a "Sources for this digest" section and runs **one additional bounded query** (one row per distinct cited registry source). | none | — | plain revert | 2 days; digest-page TTFB and query count | **go + observe** |
| **#80** citation mode | A fifth copy mode on the digest claim row carrying T2's "Accessed (BNOW ingest)" date; the page SELECT widens to fetch `d.provider` and the dispatch sub-objects, **which are never rendered** (`disclosure-policy.ts:42`, empty entitled set, resolved server-side). | none | — | plain revert | 2 days; **verify no model or provider name appears in the digest HTML or the RSC payload** | **go + observe** |
| **#95** `/scoreboard` relabel | Public `/scoreboard` column header becomes "evidence lens (country)" in all seven locales plus a longer caveat; `robots.txt` gains one Disallow line. Numbers, columns and order unchanged and re-pinned. | 0030/0028 only via `/conflicts`, unreachable while `CONFLICTS_UI` is absent | `CONFLICTS_UI` (flag, absent ⇒ off) | plain revert | 1 day; the six non-English strings are marked "needs native review" in the diff | **go + observe** |
| **#50** port hygiene | `package.json` gains `"engines": {"node": ">=22"}` — **a Vercel build input, filed as dev hygiene under an explicit "no behavior change" claim.** | none | — | plain revert | **first build log: confirm the selected Node version and that the build succeeded** | **go, after one check** (below) |

**On #50, precisely.** This is unprovable from the repository and the audit says so: there is no
Vercel Git integration, `gh api …/deployments` is empty, and CI never runs `npm run build`, so
the line has never been evaluated by Vercel's version selector in any environment. The probable
outcome is a no-op — `>=22` is open-ended, `next@16.2.10` already requires `>=20.9.0`, there is
no `.npmrc` or `engine-strict`, and CI is green on Node 22 at this SHA. The worst realistic case
is a loud build failure. **The operator's one-line check: confirm the Vercel project's Node
setting is already 22.x or newer** (if it is, no-op; if it is below, `engines.node` overrides it
and moves every function's runtime). **Recommendation: pin `22.x` rather than `>=22`** — an
unbounded range lets the same `package.json` resolve to a different runtime on a later deploy
with no repo change.

### 5.3 Runtime but inert — ships with nothing owed

| PRs | The gate that makes each inert |
|---|---|
| #93, #90, #71, #86, #87, #92, #73, #63 | `/api/cron/conflict-validate` is **absent from `vercel.json`** (14 crons, none is it) and the route 401s before `withCronRun` and before the `@/db` import; the tables have no other reader. |
| #95 (conflict half), #86, #87 | `CONFLICTS_UI` absent ⇒ `requireConflictsUi()` is the **first statement** and the DB import is dynamic *after* it. |
| #64, #89 (drain half) | `LOG_DRAIN_SECRET` unset ⇒ the route returns **503 before the body is read**; no drain is registered. |
| #81, #85, #52 | `DIGEST_PROVIDER` absent ⇒ `getProvider()` never selects Anthropic; even set, **zero `analysis-reg-v1` Anthropic approvals** ⇒ `workloadDispatchConfig("digest")` refuses before any reservation. |
| #75, #61, #58 | `src/lib/evals/*` is reached by **no** app route (import closure over all 25 entrypoints: zero hits). |
| #76 | `/api/cron/entity-audit` is not in `vercel.json`; the request object is byte-identical. |
| #91 | The punctuation fold sits **below** the `matchMode === "substring"` early return, and `ru-ua-v1` is substring — the production keyword path cannot move. |
| #67 | The gate is a no-op at the shipped defaults: `gpt-5` carries `v2-k60`, `gpt-5-mini` carries `v2-k60-rerank`. |
| #88 | `ASK_PIPELINE` defaults to `v2`; the changed function is the legacy rollback branch only. |

**Conditional watch on #67 and #88:** both become behaviour changes the moment `ASK_PIPELINE` or
an `ASK_*_MODEL` override is set. The env read-back in §6 covers both. After deploy, a single
`unscorecarded` row in `ask_usage.provider` means an override exists — and per AUD-08 the user
would be shown nothing.

### 5.4 Zero production runtime effect — 20 PRs

**Docs-only (16, each proven by its file list, not its title):** #97, #96, #94, #78, #74, #68,
#66, #62, #55, #54, #53, #49, #47, #48, #72 (its `no-delete.test.ts` is test-only), #51.
**Tooling (2):** #65 (`scripts/map-remap.ts`, operator-run), #58 (eval CLI + two test files).
**Comment-only in a runtime file (1):** #57 — the `x-api.ts` diff adds comments; both
`envNum("X_DAILY_USD_CAP", 1.5)` lines are byte-identical.
**Deleted-component + test rewrite (1):** #50's non-`package.json` half.

All **`go`**, in any order, with no observation window.

---

## 6. What must happen before step 27 deploys

1. The four `go-after-fix` items in §5.1. Three docs edits and one `git branch -D`.
2. **The environment read-back (G3)** — the one never-run check still open, with the corrected
   fifteen-name list from AUD-04, plus the `ASK_EMBED_MODEL` value question that decides whether
   #59 is inert. The full list is in the handoff, §3 item 2.
3. **The Vercel Node-version check** for #50 (§5.2).
4. **Refresh both DSNs** before any local script targets production — and note AUD-10: a new
   password containing `#`, `?` or `/` makes `assertMigrationTarget` refuse a *correct* migration
   and print both DSNs, password included, into the error.
5. Then the signed A2(b) ordering: **backup branch → `db:migrate` (0028, 0029, 0030) → deploy →
   `LOG_DRAIN_SECRET` → register the drain → `audit-cron`.** Apply the migrations away from a
   cron minute: 0028 and 0030 each add a foreign key to a busy table inside one transaction with
   no `lock_timeout`.
6. **Rehearse the migration on a disposable fork first** — the prompt's "a fresh fork applies
   0000–0030 idempotently" check. This audit could not run it (no database access) and it is the
   cheapest possible rehearsal of the one irreversible command in the sequence.

---

## 7. What this audit did NOT establish

Stated plainly, because a bounded audit accepted as evidence must carry its own limits — the
same standard decision A3 applied to step 17.

- **No database was touched.** Production's migration state (0027), the `provider_usage` ledger,
  and D-c's "production still stands at 29 migrations" contingency are all taken from standing
  documents, not verified. If production has been migrated since, D-c's "free as signed"
  conclusion lapses.
- **No Vercel environment was read** (G3) and no vendor documentation was fetched (G6, the
  drain's external contract). Both are step 27's.
- **No integration test was run** — every `*.itest.ts` reaches real Postgres. Their results are
  taken from the reports that ran them on disposable forks.
- **`npm run build` was run with blanked keys and a dummy DSN**, which is the freeze's own
  recipe. It proves the tree compiles and every route registers; it does not exercise a request.
- **Grep-based sweeps in this audit are incomplete by the same defect they found.** Two source
  files carry a raw NUL byte (AUD-32), so `grep -r` skips them silently — `digest-persist.ts` is
  invisible to every grep-based check here. Where it mattered, the file was read rather than
  grepped; elsewhere the gap stands.
- **The comment-truth sweep did not finish**: `src/lib/citation/*`, most of `src/lib/tradecraft/*`,
  `src/lib/ask/*`, `src/lib/evals/contracts.ts`/`runner.ts`, and per-candidate verification of
  `scripts/*.ts` beyond AUD-21 remain unswept.
- **Minors and notes carry one verification each**; only the majors went to refuters. Two of the
  three majors put to refuters came back narrowed, which is the expected rate and a reason to
  read the single-verified items as leads rather than verdicts.
- **Step 18's register remains single-reader.** Its WS3-F01/F02 were treated as confirmed
  (reproduced) and its minors as verified-by-one, per binding item (8). Mutants M9 and M10 were
  re-checked and are both killed.

---

## 8. Proposed AGENTS.md changes (for the operator or a governance step to apply)

Standing-text corrections, each with the file:line and the reason. **This step does not edit
`AGENTS.md`** — the write-lock in INDEX §4 reserves that to steps 01/02/03/15/25 and the operator.

1. `AGENTS.md:386-395` — the routing bullet: fifteen envs, not ten; add the provider dimension to
   the fail-closed list. **(AUD-04 — gates step 27's env check.)**
2. `AGENTS.md:464-473` — ruling 4's cap list: add `REDUCE_USD_CAP_DAILY`,
   `LLM_MATCH_DAILY_USD_CAP`, `EVAL_USD_CAP_DAILY`; correct the `OPENSANCTIONS_CALL_CAP` clause,
   which does **not** fail closed (`envNum(…, 300)`). **(AUD-28 — a false clause in an
   invariant-grade ruling.)**
3. `AGENTS.md:601-603` — ruling 21: record memo C10's carve-out, that the conflict routes are
   discharged by `conflict-feature-off.itest.ts` rather than a ROUTES row. **(AUD-29.)**
4. `AGENTS.md:175` and `CURRENT-STATE.md:35,758-759` — the merged-PR range: **49 merges, PRs #47,
   #48 and #49–#97**. **(AUD-25.)**
5. `AGENTS.md:265-266,274-275` — #33 has been executed on a fork; the remaining two of six
   places. **(AUD-26.)**
6. `AGENTS.md:302-303` — drop the stale "the LIVE deployment today stamps `143964a`". **(AUD-27.)**
7. `AGENTS.md:311` and `CURRENT-STATE.md:218-219` — post-drain registry counts: 10,224 sources,
   ir 3,681. **(AUD-24.)**
8. `AGENTS.md:157-158` — the snapshot header still says `main` verified 2026-09-05. **(AUD-09
   family / F6-09.)**
9. `AGENTS.md:51` (29 → 34 RSS feeds), `:60-64` (the map stage does feed the digest pipeline),
   `:1735` (`scripts/migrate.ts:7` → `:12`), the directory map (add `scripts/launch/`,
   `scripts/evals/`), `:98-99` (`src/lib/text/` has thirteen importers). **(AUD-40.)**
10. `AGENTS.md:3` — the "~300 lines" rule contradicts the enforced 150,000-character one at `:11`.
11. The **`VERCEL_TOKEN` contradiction** (AUD-23) must be resolved in one pass across
    `AGENTS.md:1736` and `:1754`, `CLAUDE.md:36`, `RELEASE-CHECKLIST.md:79`, `BLOCKERS.md:7-10,121`
    — D8 (2026-09-05) is the most recent adjudication and says valid.
12. `docs/BLOCKERS.md:11-17,121-122` — the Anthropic wiring landed; the key exists locally per
    D2 = B. **(AUD-30.)**
13. **A decision-log entry is owed for this step**, and separately for the three migrations and
    two feature PRs that landed with none (AUD-31). File the latter as an OPEN-TASKS item —
    today the only record of the gap is inside an entry that is itself headed `UNSIGNED`.

---

## 9. Closing-report contract (INDEX §7)

**Scope.** Prompt `docs/prompts/2026-09-05-48h-26-final-audit.md` with its 2026-09-09 binding
block. Lane `48h-audit-ws2-20260905`; branch `48h/audit-ws2-20260905-step26-final-audit`. Audited
`2c66e94` against base `883e5e3`. **Attended**, model gate Opus/xhigh — deliberately not the
model behind either register re-checked here. Read-only: no code, schema, env, cap, migration,
flag, deploy or production write. **$0.**

**Built.** Two documents, no code:
- `docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` (this file) — the finding register, the
  per-PR deploy verdict, the G2–G16 placement, and the refuted-findings record.
- `docs/prompts/2026-09-07-next-48h-handoff.md` — verified state, what is code-ahead of
  production, the step-27 deploy sequence, open decisions, label-gated readiness, the WS-3.6
  soak state, the WS-1.5 sizing note, the "what the operator can see working" commands, and a
  Wave-1 draft.

**Tests.** Nothing was added; everything was measured. Unit **4,599 / 293 green**, run twice —
once in this worktree and once on the **full-secret main checkout** (the CP5 carry, which is what
makes `hardening-cli.test.ts`'s Anthropic refusal meaningful). Typecheck clean. `eslint .` 0
errors / 3 pre-existing warnings. `npm run build` **PASS** with blanked keys and a dummy DSN.
Six historical merge SHAs re-measured for G16 (§3.3). No integration test was run (they reach
real Postgres). Fork itests: none — this step touched no database. **Spend $0.**

**Rulings touched and how each is satisfied.** This step changes no code, so it satisfies every
ruling vacuously; what follows is what it *verified*. **1 (legal):** the new edition/observation
write paths store a closed, token-validated shape and no prose; takeaway text is transient.
**2 (traceability):** `9999_claim_source_trigger.sql` byte-unchanged and still last; no new
claim-INSERT path. **3 (truth-in-UI):** safe on the conflict surfaces today; the guard that
enforces it is weaker than its standing sentence claims (AUD-17, §4.2). **4 (spend):** every new
dispatch reserves before the client is built; ruling 4 now holds on all five Ask paths.
**5 (migrations):** all three new files purely additive; chain and 9999-last verified.
**8, 9, 13, 14, 19, 21:** verified per §4's "checked and clean"; ruling 19's interaction with the
new estimative layer is §4.1's decision. **Eval-plane freeze:** exactly the two authorized
writers, and the E5 refresh reproduced byte-for-byte.

**Citations re-verified.** Every `file:line` in this report was read at `2c66e94`, not carried
from an earlier document. Where a cited line had moved, the corrected line is given
(`scripts/migrate.ts:7` → `:12`; `product-view.ts:69`/`:73` → `product-view.ts:54-56`/`:58`).
Two premises in the prompt's own binding block were corrected by measurement: G12's
`range-diff`-against-a-report-named-head is largely unexecutable, because closing reports name
their base SHA and not their tip (§3.2); and binding item (7)'s `--execute-live --provider
anthropic` refusal is reached only after the `EVAL_DATABASE_URL` and `--db-ack` gates, so the
handoff gives the full command.

**Decisions needed.**
1. **T3 addendum — the `claimed × C2/C3` allegation cell** (§4.1). The operator signed a grid
   whose `claimed` row can carry a defamation-grade allegation at `likely (55–80%)`, and none of
   T3's six invariants mentions content class. Recommendation: put the cell to the operator
   before the next program touches the estimative layer; the `withheld` path already exists and
   is tested. Not deploy-gating.
2. **May a `unit-flags-v0` number reach a public surface at `CONFLICTS_UI` flag-on?** Carried
   forward unanswered from step 24. Recommendation: land `compound-v1` first, and fix AUD-11's
   non-discriminating controls in the same PR.
3. **`engines.node`: keep `>=22` or pin `22.x`?** Recommendation: pin, for reproducibility.
4. **Leave the `Co-Authored-By` trailer in `901078a`?** Recommendation: yes — a rewrite of pushed
   history costs more than the violation. Record it; do not repeat it.

**Debt and risks.** The register's minors and notes are the debt list; AUD-04, AUD-23 through
AUD-31, AUD-36, AUD-37 and AUD-40 are a single mechanical docs pass. The structural risks worth
carrying: **(a)** two guards are weaker than the standing sentences that cite them (AUD-07,
AUD-17) — both are the only stated enforcement of an invariant-grade ruling, and both are cheap
to fix by walking the graph instead of grepping a fixed list; **(b)** a raw NUL byte makes a
source file invisible to `grep -r` and renders its PR diff as binary (AUD-32), which silently
weakens every grep-based review in this program; **(c)** three migrations and two feature PRs
landed with no decision-log entry (AUD-31), and the only record of that is inside an entry headed
`UNSIGNED`.

**Handoff.** `docs/prompts/2026-09-07-next-48h-handoff.md`, in full. The short version for
step 27: apply §5.1's four fixes, run the environment read-back with the **corrected fifteen-name
list**, read `ASK_EMBED_MODEL`'s value, check the Vercel Node setting, refresh both DSNs, rehearse
the migration on a disposable fork, then the signed A2(b) ordering. Rollback target
`dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`; never below `52ea272`.

**Program-log line for INDEX §10** (the operator writes it):

> 2026-09-11 — **Step 26 delivered: the window's final adversarial audit.** Frozen `main`
> `2c66e94` audited against `883e5e3`, attended, Opus/xhigh, read-only, **$0**. **Merge fidelity
> (G12) PROVEN for all 49 merges** by two independent methods — every merge tree recomputes from
> its parents, and every PR's GitHub `headRefOid` equals the merge's second parent. Gate
> re-measured independently: typecheck clean, lint 0 errors/3 warnings, unit **4,599/293** (run
> once on the full-secret main checkout, discharging the CP5 carry), `npm run build` **PASS**
> (G4 closed). **G2, G4, G5, G7, G8, G9, G10, G11, G12, G13, G14, G15 and G16 are closed; G3 and
> G6 remain, both correctly step 27's.** Register: **51 findings — 0 blockers, 5 majors, 15 minors, 31 notes**;
> two majors refuted outright and two narrowed by independent refuters, all recorded. **No PR is
> `no-go`; nothing that gates the deploy is a code change** — four `go-after-fix` items, three
> docs edits and one `git branch -D` (a third-party PII branch with an `origin` upstream). One
> decision raised for the operator: a T3 addendum on the `claimed × C2/C3` allegation cell.
> Outputs: `docs/reviews/PROGRAM-48H-FINAL-AUDIT-2026-09-07.md` and
> `docs/prompts/2026-09-07-next-48h-handoff.md`. Nothing deployed, no production write, no
> environment read.
