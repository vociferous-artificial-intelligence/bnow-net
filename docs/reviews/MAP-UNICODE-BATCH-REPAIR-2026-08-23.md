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
occur at all — the escape is what carries the fault across the wire.)

**The 2026-07-16 onset was provider-side, not runtime-side.** An earlier draft of
this report attributed it to the runtime; that is wrong, and an independent
review disproved it. Well-formed `JSON.stringify` predates the entire corpus, yet
the rate is 0% through 07-15 and 7.1% on 07-16 — and five documents that orphan
under the old truncation were **successfully extracted** between 2026-07-09 and
07-13 (§6). The provider's parser tightened around 2026-07-16; the client-side
defect had been latent since the map stage shipped. That also bounds what the
tests prove: `assertRequestParsable` encodes the provider's behaviour **as of
today**, not a law of nature, and no paid round-trip was made to confirm it (the
first post-deployment cycle is that confirmation).

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
| Every previously successful **well-formed** request stays byte-identical | **PROVEN.** `dropIsolatedSurrogates` returns the input unchanged when no surrogate code unit is present, and reconstructs it identically when all surrogates are paired. Pinned by a test that compares the full 20-document provider request against a frozen copy of the OLD implementation — and that test passes under BOTH implementations, so it is a genuine identity check, not an artifact. |
| The content ceiling is unchanged | **YES.** Still `mapContentChars()` UTF-16 code units, same env, same default 1500. The cap was NOT reinterpreted as code points. |
| Prompt and schema semantics unchanged | **YES.** No prompt constant, no `MAP_USER_FRAME_REV`, no schema field, no `minItems`/`maxItems` change. |
| Changed cases cannot produce a second or competing extraction | **YES — but NOT for the reason an earlier draft gave.** That draft claimed such documents "never produced an extraction under any contract". **That is false**, and an independent review disproved it: because the provider only began rejecting lone-surrogate escapes around 2026-07-16, orphan-carrying requests were ACCEPTED before then. A non-circular scan over all 18,974 ru/ua/ir documents whose `title‖content` exceeds 1,400 characters finds 30 that orphan under the old truncation, and **five of them are mapped** — ids 2263, 622042, 715046, 1163005, 1425485, each orphaning at index 1499, each holding a `doc_map_state` row under the CURRENT version `gpt-4o-mini:d73cc83ed8df`, `mapped_at` 2026-07-09 → 07-13, `claim_count` 1/1/0/0/1 (independently re-verified for this report). The repair is still safe, and the SECOND draft of this reason was also wrong — round 2 caught it. `processed = true` keeps them out of the HOURLY worker's `processed = false` selection, but it is remap's **inclusion** disjunct (`rd.processed = true OR EXISTS (…doc_map_state…)`, `map-worker.ts`; the module says so twice in its own comments), so it cannot exclude anything there. What actually protects them from remap is step 3's current-version anti-join: each of the five holds a current-version `doc_map_state` row for `military`, and `applicableTracks` returns `["military"]` and nothing else for all five (verified by running the repository's own function against the live rows), so `pending` empties and no batch is ever built. Nothing re-extracts them, nothing is re-billed, no second claim set is created — and remap has in any case never been executed and is not authorized by this release. The corpus under `d73cc83ed8df` was ALREADY heterogeneous in truncation behaviour before this change; the repair stops adding to that heterogeneity rather than widening it. |
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

- `src/lib/analysis/map-prompts.test.ts` — grew from **18 to 43** tests. Adds
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

Added in review round 2, after both reviewers landed surviving mutants on round 1:
the four surrogate-range EXTREMES (`U+D800`, `U+DBFF`, `U+DC00`, `U+DFFF`) as lone
halves, the first and last astral scalars (`U+10000`, `U+10FFFF`) as pairs, those
six added to the property-sweep alphabet, and a **long-body case** — a >1,500-code-unit body
built entirely from complete astral pairs, asserted byte-identical to the legacy
output when the ceiling falls between pairs and exactly one code unit shorter when
it falls inside one. It closes a real hole: every other identity case was either
short (taking `wellFormedSlice`'s short-circuit branch) or surrogate-free, so a
long, surrogate-dense body had never been exercised at the `mapDocLine` level at
all. (Precisely stated, per round 2: its byte-identical arm returns through the
`keepFrom === 0` shortcut rather than the reconstruction branch — byte-identity
*through* reconstruction is impossible by construction, since reconstruction only
runs when an orphan exists and the output must therefore differ. The case is
load-bearing regardless: it is one of the eight mutation failures.)

**Mutation proof.** Nineteen mutants were constructed across the two reviews and
this pass. The headline: reverting only `mapDocLine` to the raw UTF-16 slice
(helpers left in place) fails **exactly 8 tests** and nothing else — 2,332 pass, 8
fail; restored, 2,340 pass. Two mutants SURVIVED round 1 and are dispositioned:

| Mutant | Round 1 | Now |
|---|---|---|
| `c <= 0xdbff` → `c < 0xdbff` (strips the lead half of every Plane-16 scalar, U+10FC00–U+10FFFF) | **SURVIVED** — found independently by both reviewers | **CAUGHT** (2 failures) by the new range-extreme cases |
| `next <= 0xdfff` → `next < 0xdfff` (breaks the last astral scalar) | not constructed | **CAUGHT** (1 failure) |
| remove `wellFormedSlice` from `mapDocLine`, keeping the outer repair | **SURVIVED** | **STILL SURVIVES — and it is a genuine EQUIVALENT MUTANT, disclosed rather than papered over.** Every template slot in the doc line is separated by literal ASCII, so `dropIsolatedSurrogates` distributes over the concatenation and the two layers produce identical output for every input. No test can distinguish them, and inventing one would be theatre. The inner call is kept deliberately, and the code comment now says exactly this: it binds the code-unit ceiling and well-formedness together AT the point of truncation, so neither call silently becomes load-bearing alone if the other is refactored away. |
| remove the `ANY_SURROGATE_UNIT` fast path | SURVIVED | equivalent by design — the fast path is a pure optimisation |
| remove the `keepFrom === 0` shortcut | SURVIVED | equivalent by design |
| `s.length > limit` → `s.length >= limit` | SURVIVED (found in round 2) | equivalent — `s.slice(0, s.length) === s` |

**Four** mutants survive in total, every one of them provably equivalent and every
one listed here. No non-equivalent survivor was found by either reviewer across two
rounds and roughly forty mutants.

Every other mutant was caught: U+FFFD replacement instead of dropping (12), code-point
reinterpretation of the limit (9), dropping only HIGH halves (3), removing the outer
repair (1), making the fast-path regex `/g` (5), dropping the `!(limit > 0)` guard (1),
widening the low-half bound (1), ignoring low halves entirely (3), removing the `i++`
on a valid pair (11).

Independent fuzzing by reviewer 1, beyond this suite: 400,000 differential cases
against two independently written reference implementations (a spec string-iterator
filter and a global lookaround replace) — zero mismatches, zero ill-formed outputs,
zero growth, subsequence property holding throughout; and 60,000 randomized
`mapDocLine` documents at 1,400–1,620 code units — 1,482 divergences from the legacy,
**all 1,482** cases where the legacy output was ill-formed, **zero** where it was
well-formed.

Exact counts on the candidate tree are recorded in §9.

## 9. Gates, review rounds and identities

### Gates on the candidate tree

Figures are for the round-2 tree, which is what merges. The round-1 candidate
differed only in test count (2,337 / 177) and mutation count (7); the production
delta between the two rounds is a COMMENT, verifiable with
`git diff 8a4d283 d47d73f -- src/lib/analysis/map-prompts.ts`.

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` (eslint) | **0 errors / 0 warnings** |
| Targeted `map-prompts` tests | **43 passed** (was 18 on `origin/main`) |
| Targeted `map-request-wellformed` tests | **6 passed** (new file) |
| Targeted map-worker tests | `map-worker.test.ts` 15 · `map-worker-spend.test.ts` 8 · `map-worker-lease-writes.test.ts` 20 — **43 passed** |
| Map lease tests | `map-lease.test.ts` 12 · `map-lease-sql.test.ts` 9 — **21 passed** |
| Map version tests | `map-versions.test.ts` **4 passed** |
| Map route + drivers | `route.test.ts` 17 · `map-backfill.test.ts` 17 · `map-remap.test.ts` 61 — **95 passed** |
| (all eleven map-related files together) | **212 passed / 11 files** |
| Complete unit suite | **2,340 passed / 2,340 · 177 files** (`origin/main` baseline: 2,309 / 176 — **+31 tests, +1 file**) |
| Production build (`npm run build`) | **PASS** |
| Complete disposable-Neon integration suite | **118 passed / 118 · 19 files**, run TWICE — once on the round-1 candidate (`br-dawn-boat-ateu24ga`) and again on the round-2 tree (`br-muddy-glade-atnmd7vb`); each branch created and deleted by the runner |
| Targeted map real-Postgres integration tests | **13 passed / 13 · 3 files** — `map-lease.itest.ts` 3, `map-remap.itest.ts` 8, `map-budget-stop.itest.ts` 2 (branch `br-dawn-salad-atrsguyl`, created and deleted) |
| Enforced pre-push gate (`.githooks/pre-push`) | green — typecheck + lint + `npm test` |
| Mutation proof | reverting only `mapDocLine` fails **exactly 8** tests and nothing else, 2,332 pass; restored 2,340/2,340. Nineteen mutants total — see §8 for the two equivalent survivors, disclosed |
| Paid provider calls | **zero** — every test injects a stub client; the itest runner blanks provider keys and runs a disposable fork |
| Production writes | **zero** — every production statement in this release was a `SELECT` |

CI's `integration` job clean-SKIPS without `NEON_API_KEY` (this repository has no
Actions secrets), so its green check is **not** evidence. The two local
disposable-Neon runs above are.

### Review rounds

**Round 1**, two fresh independent reviewers against the exact candidate SHA
`8a4d283d330125d38d9d3a736e0927d354c2550f`, working in their own disposable
clones, read-only against production, zero paid calls.

| Reviewer | Scope | Verdict | Findings |
|---|---|---|---|
| 1 | Unicode, serialization, versioning | **PASS-WITH-MINORS** | 1 MEDIUM · 5 MINOR · 3 NOTE |
| 2 | map pipeline, spend, operations | **PASS-WITH-MINORS** | 0 MEDIUM+ · 6 MINOR · 7 NOTE |

Both independently reproduced the production evidence, the gate numbers and the
mutation proof. Reviewer 2 additionally returned **READY TO DEPLOY**.

**The MEDIUM, and why it mattered.** Reviewer 1 disproved §6's fourth
same-version condition as originally written. My scan for affected documents had
filtered on `processed = false` — which is circular for exactly that condition,
since a document with claims is `processed = true` by construction. Its
non-circular scan found five already-mapped orphan documents, and I re-verified
all five against production. The same-version OUTCOME survives, on a different
and correct argument (§6); the false sentence is gone from the report, from the
`mapDocLine` comment, from OPEN-TASKS #86 and from `docs/PROGRESS.md`. This is the
kind of finding that justifies the second reviewer: the conclusion was right and
the reasoning was not.

**Everything applied before merge.** Code and tests: the `mapDocLine` comment
rewritten (well-formed, not merely successful; plus an honest statement that the
inner `wellFormedSlice` is an equivalent-mutant defence-in-depth layer); the four
surrogate-range extremes, both plane-boundary pairs and a long-body astral
identity case added, killing the one mutant both reviewers landed; a vacuous
`ISOLATED_SURROGATE.test(JSON.stringify(params))` assertion fixed — and the FIRST
fix was vacuous too, wrapping the round trip in a second `JSON.stringify` that
re-escapes the surrogate straight back to ASCII, which round 2 caught; the
whole-request check now runs the strict boundary itself, which walks the parsed
object's string fields and is the only form that can actually fail (demonstrated:
`test(JSON.stringify(p))` false, `test(JSON.stringify(JSON.parse(JSON.stringify(p))))`
false, walking the parsed object true); the network-spy test renamed to say
what it really pins. Documentation: the 2026-07-16 onset re-attributed to a
provider parser change rather than the runtime; §8's test and mutation counts
corrected (18 base, not 19; 8 mutation failures and 2,340 restored, not 7 and
2,336); the closure criterion for #86 sharpened from "materially improved" to
**`batchErrors = 0`**; the observation plan extended with residual-error
classification, the renewal re-baseline, a spend tripwire and the twenty named
document ids; and OPEN-TASKS #97 corrected — its "every module" claim was false
and it had missed the live paid Ask path.

**Round 2** re-reviewed the corrected tree; verdicts and SHA are recorded in the
PR and the decision-log entry.

### Identities

*(recorded at merge — PR, reviewed SHA and merge SHA are in the decision-log entry)*

## 9b. Measured evidence, the corpus mechanism, and the observation plan

### Byte-identity, measured over REAL production documents

The strongest form of the §6 condition-1 claim, run read-only (only counts and
document ids extracted — no document text):

| Measure | Value |
|---|---|
| Documents compared (the 10,000 oldest eligible `processed = false`) | 10,000 |
| `mapDocLine` output **byte-identical** old vs new | **9,980** (99.8%) |
| Output changed | **20** |
| — of the changed, whose OLD line already carried an isolated surrogate | **20 / 20** |
| — of the changed, exactly one code unit shorter | **20 / 20** |
| NEW lines still carrying an isolated surrogate | **0** |

Reviewer 2 replicated this independently over the live 1,000-document selection
head and got the same answer; reviewer 1 extended it to 60,000 randomized
1,400–1,620-unit documents and found 1,482 divergences, **all** of them cases
where the legacy output was ill-formed and **none** where it was well-formed.

### The corpus mechanism — why the numbers have been frozen

The worker selects the 1,000 oldest eligible documents each cycle
(`MAP_RUN_DOC_CAP`). Today that is **463 permanently-stuck stragglers dated
2026-07-04 → 08-18 plus 537 fresh documents from the moving front**. For **21
consecutive cycles** (2026-08-22T16:40Z → 08-23T12:40Z) `selected = 1000`,
`batchErrors = 25`, `alreadyMapped = 139` and `processedMarked = 537` have been
*identical* while `mirrors` and `noApplicableTrack` varied widely — the signature
of a fixed loop.

The arithmetic closes exactly. Twenty poisoned documents yield **31 doc-track
pairs** — eleven of the twenty are applicable to BOTH `military` and
`elite_politics` — and those 31 pairs collide into the observed **25** failing
batches. The remaining ~438 stragglers are the collateral of sharing a
20-document batch with one of them. The live log signature confirms the shape:
`map ru/elite_politics batch of 20: 400 Invalid body: failed to parse JSON value`.

All 31 pairs are repaired by the new truncation. **The prediction is therefore
exact, not directional.**

| Signal | Frozen baseline | Expected on the first repaired cycle |
|---|---|---|
| `batchErrors` | **25**, for 21 consecutive cycles | **exactly 0** |
| `llmRequests` vs `batches` | 452 vs 1,041 over the window | **equal, per cycle** |
| `processedMarked` | **537**, frozen | **→ ~1,000** |
| `alreadyMapped` | **139**, frozen | **moves** |
| `selected` | **1,000** | falls below 1,000 within ~1.5–2 days as the backlog clears |
| `llmCalls` | 16–22 | **→ ~43–46** |
| `lease.renewals` | ~64 | **→ ~2 × batches + 2 ≈ 94** — a re-baseline, NOT an anomaly |
| the 20 named ids | `processed = false`, zero `doc_map_state` | processed, with rows under the SAME four versions (eleven of them need TWO rows) |

A **non-zero** `batchErrors` is not "less improvement" — it is a DIFFERENT defect,
and it must be classified from the runtime log before any conclusion is drawn.

**Immediately-pre-deployment cycle, for a clean before/after pair.** The last
cycle on the old build, `2026-08-23T13:40:16Z → 13:43:46Z`: `ok = true`, fence 37,
`selected` 1,000, batches 44, **`batchErrors` 25**, claims 201,
`processedMarked` **537**, `llmCalls` 19, `estUsd` $0.0223, `leaseRenewals` 65 —
and 44 + 19 + 2 = 65, so the QF-B renewal identity holds on the very last
pre-repair cycle too. Every frozen constant is in place.

### Spend consequence, stated before it happens

Cost per successful map request is stable at **$0.0011–0.0012**. Daily
`openai_map` spend has been FALLING as the error rate rose (08-16 $1.1659 → 08-22
$0.5043) precisely because a rejected batch is billed nothing. Restoring the
failed batches roughly doubles it, to **~$1.2–1.3/day** while the backlog drains,
against `MAP_USD_CAP_DAILY = 4` — comfortable.

The ceiling that matters is the all-time one: `openai_map` stands at **$17.06**
against `MAP_SPRINT_USD_CAP = 40`. The eligible backlog is ~26,991 documents
(ir 13,147 / ru 9,684 / ua 4,160) against ~9,000/day intake, so at up to 1,000
dispositions per cycle it drains in roughly **1.5–2 days**, after which spend
settles back toward today's. **No cap is changed by this release.** `SpendGuard`
fails closed on the total cap and, since the 2026-08-15 observability release, a
non-`run_cap` stop records `cron_runs.ok = false` with
`budgetStopCategory = total_usd` and raises an operator alert — exhaustion is
loud, not silent. Escalate if all-time crosses **$25 of $40** or any cycle records
a `budgetStopCategory` other than `run_cap`.

### Post-deployment observation plan

**First natural cycle** (do not invoke it): lease `acquired` at the next expected
fence, `lost = 0`, `released = 1`, `leaseLostDiscards = 0`; residue
`{"fence": N}` with no token; zero advisory locks; baseline dispatch identity; the
same four extractor versions and no fifth; `cron_runs.ok = true` with no
`budgetStop*` key; **zero `400 Invalid body` lines for `/api/cron/map` in the
runtime log**; `batchErrors` against the 56.8% baseline and against the exact
`= 0` prediction; `llmRequests === batches`; `processedMarked`, `claims`,
`llmCalls`, `estUsd`; the twenty named ids reaching a final disposition; and
renewals re-baselined to ~`2 × batches + 2` rather than read as drift.

**24-hour recovery window**, opened at the next clean UTC hour after that cycle
completes: every expected hourly cycle present; zero Unicode/surrogate
`Invalid body` map errors; the twenty ids never re-selected; lease invariants
normal throughout; provider metering and spend stable and inside both caps; no
model/routing/extractor-version drift; materially improved batch success and
processed yield; truthful error accounting — nested `counts.*` swept on EVERY job,
because the map job is itself the #87 swallow pattern in its most extreme form (25
swallowed errors per cycle with `ok = true`, for weeks); map freshness and backlog
trend recorded; and the digest engine selection **observed, not forced** — no
regeneration, no `FORCE_REGEN`. If `openai_reduce` requests reappear, the reduce
site in #97 becomes live and moves up the queue.

Three operational expectations, so a healthy cycle is not misread:

1. **The first repaired cycle will take roughly twice as long.** Cycles run ~200 s at
   ~19 dispatches; at ~44 dispatches with `MAP_CONCURRENCY` unchanged that becomes
   **~6–7 minutes**. That is well inside `maxDuration = 800 s` and
   `MAP_RUN_REQUEST_CAP = 80`, but an operator expecting the habitual `:43:40`
   completion could read a healthy longer cycle as a hang (ruling 10's
   `finished_at IS NULL` signal). Do not conclude a stall before ~`:48`.
2. **`MAP_DAILY_REQUEST_CAP` is the last cap worth naming.** It is SET in Production
   (value encrypted, not read); the code default is **1,500/day**. The projection takes
   daily map requests from ~450 to **~1,056**, just above the historical maximum of
   1,014 on 2026-08-16 and still under the default. A `daily_requests` stop would
   classify as `daily_cap`, not `run_cap`, so it records `ok = false` with a category
   and alerts — loud, and already covered by the escalation rule. Worth a read-only
   check before deployment.
3. **Runtime-log retention bounds the residual-400 plan.** Vercel's log retention is
   short and the CLI caps at 100 records, so a non-zero `batchErrors` on an early cycle
   must be classified PROMPTLY, not retrospectively when the window closes.

**Explicitly not a success criterion:** #88. A single cycle cannot show it and this
release does not claim it.

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
   `400 Invalid body` signature — `src/lib/analysis/synthesize.ts:138-139` on the
   REDUCE path, dormant today only because mapreduce has produced nothing since
   2026-08-16 and liable to become live again precisely as a consequence of this
   repair — and, found by BOTH reviewers and missed by the first draft of #97,
   **the live paid Ask path**: `src/app/ask/actions.ts:28` truncates the
   USER-SUPPLIED question at 400 code units straight into the answer request, so a
   user pasting an emoji across that boundary reproduces #86 on `/ask`, plus
   `src/lib/ask/rerank.ts:41` and `src/lib/ask/sessions.ts:105,111`. That is the
   highest-exposure instance of the family and it is pre-existing, unfixed debt.
2. **#88 is not fixed by this release.** Whether mapreduce resumes depends on
   whether recovered throughput reaches the CURRENT-day window, which is a
   backlog-versus-recency ordering question this change does not touch. #88 stays
   open until a naturally eligible digest uses mapreduce and its own acceptance
   criteria are independently met.
3. **Yield and mirror rates will move.** Documents that never produced claims will
   now produce them, so claims/day, `processedMarked`, spend and dedup mirror
   rates all shift. That is the intended effect, and it is why the baseline in §2
   is recorded before rather than after.
4. **The 20 documents found are a lower bound.** The scan covered the oldest
   eligible documents by the worker's own predicate, not the whole corpus; a
   non-circular sweep of all ru/ua/ir documents over 1,400 characters found 30
   orphaning documents, five of which are already mapped (§6). Documents dense in
   emoji but shorter than 1,400 Postgres characters can still exceed 1,500 UTF-16
   code units and escape both scans, so every count here is a floor.
5. **`cron_runs` cannot distinguish one 400 from another.** `stats.batchErrors` is
   a bare counter; `ok` stays `true`, no category is recorded, and the
   discriminating message goes only to `console.warn`. The map job is #87's
   swallow-into-a-counter pattern in its most extreme form — 25 swallowed errors
   per cycle, `ok = true`, for weeks. The observation plan therefore REQUIRES
   reading the runtime log for the first cycles, and a residual non-zero
   `batchErrors` must be classified by signature before it is attributed to
   anything.
6. **No provider round-trip was made.** Root cause rests on a measured
   serialization behaviour, a reproduction against this repository's own strict
   oracle, and production incidence correlation — strong, mutually independent,
   and reproduced by both reviewers, but none of them is the provider itself. The
   first post-deployment cycle is that proof.
7. **The 2026-07-16 onset was provider-side.** Provider parser strictness can
   change again in either direction; the repair is correct regardless, but the
   test oracle encodes today's behaviour.

**Explicit non-goals.** Not attempted, deliberately: #87, #88, #89, #90, #91,
#97; grapheme-cluster preservation; any change to the content budget, model,
schema, batch size, prompt text, routing, retries, spend caps, schedule or
response validation; any migration, environment or cap change; any remap
(including a dry run); any manual cron invocation; any paid evaluation call; and
the `leaseLostDiscards` undercount, which was filed as #96 by the QF-B closeout
and is not touched here.
