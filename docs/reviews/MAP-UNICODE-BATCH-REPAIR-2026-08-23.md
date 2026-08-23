# Map Unicode batch repair — OPEN-TASKS #86 (2026-08-23)

Isolated repair of the surrogate-splitting truncation in the map stage's prompt
builder. One production function changed, two new pure exported helpers, no
behaviour change for any input that was already valid.

`UNICODE_ROOT_CAUSE=CONFIRMED` · `UNICODE_VERSION_DECISION=SAME_VERSION_JUSTIFIED`

Sections 1–9 were written before the PR was merged and reviewed at the exact
candidate SHA. Sections 10–13 (deployment identity, first natural cycle,
recovery window, closeout) are appended by the post-deployment documentation
pass — this release deliberately separates the code change from its deployment
record, exactly as the QF-B release (PR #7) and its closeout (PR #8) did.

---

## 1. Dependency: the QF-B lease soak had to close first

This repair was gated on the QF-B map-lease soak closing PASS, because a
concurrent map-path change would have confounded it. That soak closed on
2026-08-23 (window 2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z, 24/24 cycles,
fences 2–25, `lost=0`, `released=1`, `leaseLostDiscards=0`, 1,541/1,541
renewals, 3,995 claims reported == 3,995 persisted, independent review PASS) and
was recorded in PR #9 / merge `0a67403`, which also closed OPEN-TASKS #77 and
#38. See `docs/reviews/QF-B-MAP-LEASE-REMAP-RELEASE-2026-08-21.md` §9.

Consequence for this release: the lease is soak-proven and stable, so any change
in map yield observed after this deployment is attributable to the truncation
repair rather than to concurrency.

## 2. Formal pre-deployment baseline

The numbers this repair will be measured against. All are from the QF-B formal
window unless stated.

| Quantity | Baseline |
|---|---|
| Formal window | 2026-08-22T02:00:00Z → 2026-08-23T02:00:00Z |
| Map batches | **1,041** |
| Batch errors | **591** |
| Batch-error rate | **56.8%** (591/1,041 = 56.772%) |
| Claims | **3,995** |
| `processedMarked` | **13,038** |
| LLM calls | **452** (`llmRequests` 452 — one metering per physical dispatch) |
| Per-cycle batch errors | pinned at **22–25**, byte-continuous across the QF-B deploy boundary |
| Daily rate series | 0% through 07-15 · 07-16 first appearance 7.1% · 08-15 4.9% · 08-19 46.6% · 08-20 45.4% · 08-21 52.7% · **08-22 57.0%** |
| Surrogate-boundary documents identified in production | **7** by the QF-B soak reviewer (a 150-document scan); **20** by this release's wider 1,000-document scan (below) |
| #88 | mapreduce has produced NO digest since **2026-08-16T19:32:38Z**; every digest created on or after 2026-08-17 is legacy |
| Backlog (epoch-filtered, eligible) | ir 12,971 · ru 9,550 · ua 4,119 |
| `openai_map` spend | $0.5043 on 08-22 (cap `MAP_USD_CAP_DAILY=4`); $17.0377 all-time (cap `MAP_SPRINT_USD_CAP=40`) |

## 3. Root cause — CONFIRMED, three independent ways

`mapDocLine` truncated the composed document body with a **UTF-16 code-unit
slice**: `body.slice(0, mapContentChars())`. When the ceiling falls between an
astral character's high and low half, the surviving half is an **unpaired
surrogate** — not a Unicode scalar value, with no UTF-8 encoding.

**(a) Serialization.** `JSON.stringify` has emitted well-formed JSON since
ES2019: an unpaired surrogate does not become a raw byte, it becomes the literal
six-character escape `\udXXX`. Measured on the runtime in use:
`JSON.stringify("abc\uD83C")` → `"abc\ud83c"`, whose UTF-8 bytes are
`226162635c756438336322` — pure ASCII carrying a backslash-u escape. A strict
server-side JSON parser rejects a lone surrogate escape, which is exactly the
observed `400 Invalid body: failed to parse JSON value`. (Had the escape not
been emitted, UTF-8 encoding would have substituted U+FFFD and no error would
occur — which is why this defect belongs to the modern runtime.)

**(b) Reproduction on the unpatched base tree** (`0a67403`, synthetic data only —
no production document text was copied anywhere):

```
MAP_CONTENT_CHARS (code units)      : 1500
poisoned body length (code units)   : 1530
last code unit of the truncated body: 0xd83d
truncated body ends unpaired        : true
JSON.stringify tail                 : aaaaaaaaaaaaaaaaa\ud83d"
batch size                          : 20
whole user message unpaired         : true
strict JSON boundary verdict        : REJECT (400 Invalid body) at $.messages[1].content
clean docs alone accepted           : true
```

One poisoned document rejects the **entire 20-document micro-batch**: the
request is a single JSON body, so nothing in it survives.

**(c) Production incidence and permanence** (read-only; only ids, offsets and
booleans were extracted — no document text). Replaying the worker's exact
selection predicate and order over the **1,000 oldest eligible
`processed = false`** documents:

| Measure | Value |
|---|---|
| Documents scanned | 1,000 |
| Documents containing a COMPLETE astral pair | 425 |
| Documents whose 1,500-code-unit slice contains an isolated surrogate | **20** |
| — of those, boundary splits at index 1499 | **20 (all of them)** |
| — of those, pre-existing isolated surrogates elsewhere | **0** |
| Isolated code units observed | `0xD83C`, `0xD83D` only (emoji high halves) |
| Theaters / adapters | ir, ru, ua / `telegram_mtproto`, `telegram_web`, `x_api` |
| Days spanned | 2026-07-16 → 2026-08-18 |

And they never drain. For those same 20 documents:

| Check | Result |
|---|---|
| still `processed = false` | **20 / 20** |
| `doc_map_state` rows (any version) | **0** |
| `doc_claims` rows | **0** |
| `doc_dedup` rows | **0** |
| `doc_map_state` rows under a CURRENT extractor version | **0** |

So they are re-selected every cycle, forever, and they carry **no competing
persisted claims** under any version — which is the fact §6 rests on.

## 4. Implementation — the smallest scalar-safe repair

One file: `src/lib/analysis/map-prompts.ts`. Two new pure exported helpers and
one changed line in `mapDocLine`.

- **`dropIsolatedSurrogates(s)`** — removes every isolated surrogate code unit,
  keeps valid pairs byte-for-byte. Fast-path `return s` when the string contains
  no surrogate code unit at all, so the common case is the identity by
  construction rather than by coincidence.
- **`wellFormedSlice(s, limit)`** — `dropIsolatedSurrogates(s.slice(0, limit))`,
  with a defensive `limit <= 0 || NaN → ""` guard so a bad limit can never
  reverse-slice. **Slice first, repair second**: repairing first could let a pair
  shift across the ceiling and be split again.
- **`mapDocLine`** applies `wellFormedSlice` to the body and then
  `dropIsolatedSurrogates` to the WHOLE composed line, so a malformed
  `sourceKey` cannot poison the request either. Both calls are the identity on
  well-formed input.

Explicit non-goals, all held: no normalization (no NFC/NFKC); no
grapheme-cluster repair (a dangling ZWJ or variation selector left by truncation
is valid Unicode and is preserved); no segmentation dependency; no change to the
content ceiling, the model, the schema, the batch size, the prompt text, the
user framing, routing, retries, spend, schedule, or response validation;
`minItems`/`maxItems` stay exactly equal to the batch size (ruling 7);
`digest.ts` is untouched.

## 5. The Unicode invariant

> Everything `mapDocLine` returns is a **well-formed** UTF-16 string: it contains
> no isolated surrogate code unit, it is never longer than `MAP_CONTENT_CHARS`
> code units of body, and every code unit in it appears in the input in the same
> order (the output is a subsequence — nothing is invented, U+FFFD included).

Scalar validity is promised. **Grapheme integrity is not**: truncation may still
cut a ZWJ sequence or strand a variation selector, and that is deliberate — both
are valid Unicode and neither can produce a `400`.

Dropping rather than replacing is deliberate too: replacement would introduce a
character the source never contained into text the model is asked to quote
character-for-character (map hard rule 4).

## 6. Extractor-version ruling — SAME VERSION, and why that is safe

`mapExtractorVersion()` hashes `[model, mapSystemPrompt(track, theater),
frame=MAP_USER_FRAME_REV, content=mapContentChars()]` (+ a validated effort when
set). It does **not** hash the truncation algorithm. A same-version deployment is
therefore only acceptable if all six conditions below hold. They do:

| Condition | Status |
|---|---|
| Every previously successful, well-formed request stays byte-identical | **PROVEN.** `dropIsolatedSurrogates` returns the input unchanged when no surrogate code unit is present, and reconstructs it identically when all surrogates are paired. Pinned by a test that compares the full 20-document provider request against a frozen copy of the OLD implementation — and that test passes under BOTH implementations, so it is a genuine identity check, not an artifact. |
| The content ceiling is unchanged | **YES.** Still `mapContentChars()` UTF-16 code units, same env, same default 1500. The cap was NOT reinterpreted as code points. |
| Prompt and schema semantics unchanged | **YES.** No prompt constant, no `MAP_USER_FRAME_REV`, no schema field, no `minItems`/`maxItems` change. |
| Changed cases were previously invalid rather than an alternative successful contract | **YES.** A request containing an isolated surrogate is rejected whole by the provider, so those documents never produced an extraction under any contract. |
| Affected documents have no competing persisted claims under the current version | **PROVEN against production** — all 20 identified documents have zero `doc_map_state`, zero `doc_claims`, zero `doc_dedup` rows (§3c). The repair produces their FIRST extraction, not a second one. |
| The fix merely makes the existing contract transport-valid | **YES.** Identical model, identical prompt, identical budget, identical schema — only the bytes that could not be transported are removed. |

Pinned by test: the four extractor versions the deployed corpus was written under
are asserted as literal strings — `gpt-4o-mini:d73cc83ed8df` (military ru/ua),
`gpt-4o-mini:75e0ff6403db` (military ir), `gpt-4o-mini:15a6078371bd`
(elite_politics ru/ir), `gpt-4o-mini:19c06260f149` (nuclear ir) — the same four
observed in production `doc_claims` during the QF-B window. If this change ever
moved the version, that test fails and the release is blocked, because a bump
would require a remap (ruling 13, OPEN-TASKS #33) which is **not authorized
here**. No extractor revision was invented to force a hash change.

## 7. Operational non-regression

The diff touches one function in one prompt-construction module. Nothing in the
lease, persistence, spend, metering, routing, versioning, digest or cron paths is
in the delta. Positively asserted rather than merely assumed:

| Property | How it is held |
|---|---|
| Lease acquire / renew / loss latch / fence / release | `map-lease.ts`, `map-worker.ts` unchanged; `map-lease.test.ts` (12), `map-lease-sql.test.ts` (9), `map-worker-lease-writes.test.ts` (20) all green |
| Transactional persistence + claim→source traceability | `persistBatch` and the `claim_must_have_source` trigger untouched; migrations test green |
| SpendGuard reservations | new test asserts exactly **one** `tryReserve` per physical dispatch on the repaired path; `map-worker-spend.test.ts` (8) green |
| Provider metering | exactly **one** `guard.record` per dispatch, asserted; ruling 8 unchanged |
| Retry count | one `create` call for a clean batch, asserted — no new retry, no reservation amplification |
| Batch split behaviour | truncation-split recursion untouched; `finish_reason === "length"` path unchanged |
| Strict batch cardinality | asserted `minItems === maxItems === 20` on the real dispatched request |
| Extractor-version filtering | `map-versions.ts` untouched; `map-versions.test.ts` (4) green; the four versions are pinned literally |
| Digest / publication safety | `digest.ts`, `digest-persist.ts`, `publication-guard.ts` untouched |
| Cron truthfulness | route unchanged; `route.test.ts` (17) green |

## 8. Tests and exact counts

New coverage, all deterministic and network-free:

- `src/lib/analysis/map-prompts.test.ts` — grew from **19 to 40** tests. Adds
  `dropIsolatedSurrogates` (identity on BMP incl. Cyrillic/Persian/Arabic; pairs
  preserved incl. adjacent pairs and ZWJ sequences; isolated HIGH removed;
  isolated LOW removed; non-adjacent halves never joined; idempotent),
  `wellFormedSlice` (below / exactly at / above the limit; pair ending at the
  boundary; boundary between a pair; orphan high before the boundary; pair
  immediately after the boundary; adjacent astral straddling the boundary; emoji
  + variation selector and ZWJ cut mid-sequence; **fixed-seed bounded property
  sweep** over limits 6–24 × 40 trials asserting no isolated surrogate, length ≤
  limit, and code-unit subsequence; non-positive/NaN limit), `mapDocLine`
  Unicode safety (ceiling splits an emoji; TITLE prefix moves the boundary;
  WHITESPACE COLLAPSE moves the boundary; malformed `sourceKey`; BMP-only
  byte-identity; all-astral-fits byte-identity), and the four production
  extractor-version pins.
- `src/lib/analysis/map-request-wellformed.test.ts` — **new file, 6 tests.**
  Uses a **deterministic fake request boundary**: serialize with
  `JSON.stringify` exactly as the SDK does, parse back (which is where `\udXXX`
  escapes resurface as lone surrogates), and reject any string that an
  **independent** lookaround oracle — deliberately not the production helper —
  finds unpaired. Covers: the OLD truncation is REJECTED; the NEW truncation is
  ACCEPTED; a 20-document batch with one formerly poisoned document completes
  with `batchErrors = 0`, `out.size = 20`, one reserve / one create / one record,
  and `minItems = maxItems = 20`; unaffected batches produce a **byte-identical**
  provider request to the old implementation; every resolved system prompt is
  well-formed; and no network or paid provider request is made.

**Mutation proof.** Reverting only `mapDocLine` to the raw UTF-16 slice (helpers
left in place) fails **exactly 7 tests** — the 4 `mapDocLine` Unicode cases and 3
of the 6 request-boundary cases — and nothing else: 2,329 pass, 7 fail. Restored:
2,336 pass. The two tests that pass under BOTH implementations are the ones that
must (the frozen legacy-rejection case and the byte-identity case), which is what
makes the identity claim credible.

Exact counts on the candidate tree are recorded in §9.

## 9. Gates, review rounds and identities

### Gates on the candidate tree

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` (eslint) | **0 errors / 0 warnings** |
| Targeted `map-prompts` tests | **40 passed** (was 19 on `origin/main`) |
| Targeted `map-request-wellformed` tests | **6 passed** (new file) |
| Targeted map-worker tests | `map-worker.test.ts` 15 · `map-worker-spend.test.ts` 8 · `map-worker-lease-writes.test.ts` 20 — **43 passed** |
| Map lease tests | `map-lease.test.ts` 12 · `map-lease-sql.test.ts` 9 — **21 passed** |
| Map version tests | `map-versions.test.ts` **4 passed** |
| Map route + drivers | `route.test.ts` 17 · `map-backfill.test.ts` 17 · `map-remap.test.ts` 61 — **95 passed** |
| (all eleven map-related files together) | **209 passed / 11 files** |
| Complete unit suite | **2,337 passed / 2,337 · 177 files** (`origin/main` baseline: 2,309 / 176 — **+28 tests, +1 file**) |
| Production build (`npm run build`) | **PASS** |
| Complete disposable-Neon integration suite | **118 passed / 118 · 19 files** (branch `br-dawn-boat-ateu24ga`, created and deleted by the runner) |
| Targeted map real-Postgres integration tests | **13 passed / 13 · 3 files** — `map-lease.itest.ts` 3, `map-remap.itest.ts` 8, `map-budget-stop.itest.ts` 2 (branch `br-dawn-salad-atrsguyl`, created and deleted) |
| Enforced pre-push gate (`.githooks/pre-push`) | green — typecheck + lint + `npm test` |
| Mutation proof | reverting only `mapDocLine` fails **exactly 7** tests (4 + 3), 2,329 pass; restored 2,336/2,336 on that tree |
| Paid provider calls | **zero** — every test injects a stub client; the itest runner blanks provider keys and runs a disposable fork |
| Production writes | **zero** — every production statement in this release was a `SELECT` |

CI's `integration` job clean-SKIPS without `NEON_API_KEY` (this repository has no
Actions secrets), so its green check is **not** evidence. The two local
disposable-Neon runs above are.

### Review rounds

*(recorded before merge — see below)*

### Identities

*(recorded before merge — see below)*

## 10. Deployment identity

*(appended by the post-deployment pass)*

## 11. First natural production cycle

*(appended by the post-deployment pass)*

## 12. Recovery window

*(appended by the post-deployment pass)*

## 13. Rollback, open risks and non-goals

**Rollback.** Pure code rollback, single step, no data component: this release
carries **no migration and no environment change**, and it writes nothing new to
any table — the repaired path produces `doc_claims`/`doc_map_state` rows under
the SAME four extractor versions the old build wrote, so the old build simply
anti-joins them as already-mapped. Rollback target
`dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe` / `23a1280eceeb0bd41eb9302fe8fc7e80f971580b`
(the QF-B release), via
`npx vercel@59.1.4 promote dpl_HjaHYtfZDhoFR2SqfH66XFT6RhJe --scope vociferous`.
Rolling back reinstates the defect and nothing else.

**Open risks.**

1. **The same UTF-16 slice pattern exists at other provider-bound sites and is
   NOT fixed here** (filed as OPEN-TASKS #97). Most importantly
   `src/lib/analysis/openai-provider.ts:153` (`.slice(0, 400)`) — the legacy
   digest doc line, which is the mechanical root of **#87**'s identical
   `400 Invalid body` signature — and `src/lib/analysis/synthesize.ts:138-139`
   on the REDUCE path, which is dormant today only because mapreduce has produced
   nothing since 2026-08-16 and could become live again precisely as a
   consequence of this repair.
2. **#88 is not fixed by this release.** Whether mapreduce resumes depends on
   whether recovered throughput reaches the CURRENT-day window, which is a
   backlog-versus-recency ordering question this change does not touch. #88 stays
   open until a naturally eligible digest uses mapreduce and its own acceptance
   criteria are independently met.
3. **Yield and mirror rates will move.** Documents that never produced claims will
   now produce them, so claims/day, `processedMarked`, spend and dedup mirror
   rates all shift. That is the intended effect, and it is why the baseline in §2
   is recorded before rather than after.
4. **The 20 documents found are a lower bound.** The scan covered the 1,000
   oldest eligible documents, not the whole backlog; the true population of
   boundary-poisoned documents is larger, and the per-cycle error count of 22–25
   suggests roughly that many are re-selected per cycle.

**Explicit non-goals.** Not attempted, deliberately: #87, #88, #89, #90, #91,
#97; grapheme-cluster preservation; any change to the content budget, model,
schema, batch size, prompt text, routing, retries, spend caps, schedule or
response validation; any migration, environment or cap change; any remap
(including a dry run); any manual cron invocation; any paid evaluation call; and
the `leaseLostDiscards` undercount, which was filed as #96 by the QF-B closeout
and is not touched here.
