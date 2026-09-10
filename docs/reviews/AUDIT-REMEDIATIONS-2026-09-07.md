# Step 23 — remediating the step-17 / step-18 audit registers

One file, two sections. Each lane appends its own; whichever finishes second rebases and
keeps both.

## Lane C

### Scope

- Prompt: `docs/prompts/2026-09-05-48h-23-remediate-audits.md`, lane C (WS-3 register), read
  after `docs/prompts/2026-09-05-48h-COMMON.md`. Lane decided by
  `git rev-parse --show-toplevel` = `/Users/go/code/bnow-net-worktrees/48h-audit-ws3-20260905`,
  as the prompt requires.
- Register: `docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md` (PR #78, `c32213a`),
  §Handoff "For step 23 (remediation), by finding" and §Reproductions R1/R2/R3. Also read:
  `docs/reviews/C5M-PROBES-2026-09-07.md` R.15, `docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md`
  §3.2a, OPEN-TASKS #114 / #116 / #120.
- Base: `origin/main` **`4b8e7e7`** ("docs: launch order 23c -> 23r -> 19…"). The prompt says
  "`f55534e` or later"; `4b8e7e7` is later on the same line.
- Working branch `48h/audit-ws3-20260905-remediate-ws3`, cut from the lane branch, then split
  into four PR branches (below).
- Mode: **Opus / high / plain session, UNATTENDED.** The worktree carried the trimmed
  four-key `.env.local` (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`,
  `NEON_API_KEY`) per COMMON §4.10 — no provider key, no Vercel token, no Postmark token.
- Spend: **$0.** No provider call of any kind. No deploy, no Vercel read or write, no
  environment change, no migration applied to production, no cron invoked, no candidate model
  touched, `docs/evals/analysis/` byte-untouched.

### Decisions relied on

`D-a … D-f` are signed in `AGENTS.md`'s decision log under the title
**"2026-09-09 (D-a … D-f — WS-3 audit register decisions signed)"** — verified present before
any work started, so lane C did not have to print `AWAITING AUTHORIZATION`. C15 (a+) and the
D4 unit decisions C1–C14 were read and are cited where they bind.

### Built

Four PRs — **#90, #91, #92, #94** — **all based on `main`, with disjoint file sets**.
Deliberately NOT a stack: the operator needs no `gh pr edit --base` and can merge them in any
order. Each was pushed through the enforced pre-push gate (typecheck + lint + test) and each is
independently green (per-branch counts in Tests below).

| PR | branch | Findings | Files |
|---|---|---|---|
| **#90** | `48h/audit-ws3-20260905-discovery` | WS3-F01, F02, F03, F05, F07, F08, F09 | `src/lib/isw/edition-discovery.{ts,test.ts}`, `src/lib/conflicts/editions.{ts,test.ts}`, `scripts/isw-refresh.{ts,test.ts}`, `src/app/api/cron/conflict-validate/{route.ts,route.test.ts}`, `src/app/api/cron/validate/route.test.ts`, `src/integration/conflict-edition-discovery.itest.ts` |
| **#91** | `48h/audit-ws3-20260905-gazetteer` | WS3-F06, F10 | `src/lib/validation/gazetteer/{match.ts,index.ts,iran-levant-v1.ts,iran-levant-v1.test.ts}` |
| **#92** | `48h/audit-ws3-20260905-observations` | WS3-F04 | `src/lib/conflicts/observation-store.{ts,test.ts}`, `src/integration/conflict-observations.itest.ts` |
| **#94** | `48h/audit-ws3-20260905-docs` | — | `docs/PROGRESS.md`, `docs/OPEN-TASKS.md`, this report |

WS3-F09 rides the discovery PR because WS3-F01 already touches
`conflict-validate/route.test.ts`; splitting it would have made the two PRs conflict for no
reviewer benefit. One commit per finding throughout, plus two follow-up commits named below.

#### WS3-F01 — a 403 is indeterminate, not a probe failure (major; D-a = (b))

`classifyProbe(probe)` partitions every probe into `edition` / `clean_not_found` /
`indeterminate`. `isCleanNotFound` stays **404-only** and is now pinned in both directions.
`EditionDiscoveryResult` gains `probeIndeterminate`, `probeIndeterminateReasons`
(`{throttled, unparseable_body}`) and `dayStatusReason`; `discoverEditions` carries an explicit
`confirmable = probes.length > 0 && probeIndeterminate === 0` branch instead of letting the
property fall out of `probes.every(isCleanNotFound)`. The route reports
`counts.probeIndeterminate` and `counts.dayStatusReasons` and stamps `dayStatusReason` on the
cells that have one. `runSeriesDiscovery` totals `probeIndeterminate`, `throttledDays`,
`unparseableBodyDays` and prints `reason=…` per day.

`probeFailures` keeps its shipped name and its shipped FORMULA — "probes that were neither a
clean 404 nor a REGISTERED edition" — so a soak threshold written against it still means what
it meant. Precisely: it is that formula evaluated against the post-D-b edition set, so on a day
whose only 200 was a zero-unit body it now reads 1 where it read 0, which is the correct
reading of the same rule once such a body stops being an edition. Today it equals
`probeIndeterminate` by construction; the code comment says so, and says why the two are
nevertheless separate fields.

**No migration.** `benchmark_series_days` keeps its two-value CHECK; the reason lives in the
return shape only, as D-a requires.

#### WS3-F02 — the daily final is selected over stored ∪ discovered (major)

`DiscoveredEdition` now carries the canonical `ReferenceEditionRecord` — parsed through
`parseEditionRecord`, the same authority the repository uses, so the record a caller ranks is
what was (or would have been) stored. `dailyFinalKeyFor(stored, discovered)` ranks the union
keyed by `editionKey`, preferring the stored row where both exist.

#### WS3-F03 — a >10 KB body with no declared takeaway is not an edition (D-b = (a))

An edition requires `units.length > 0`. A zero-unit body is counted indeterminate with reason
`unparseable_body`, the day stays `probe_failed`, and the next sweep re-probes it. Discovery
can therefore no longer mint a `failed` edition at all, so `parseStatus` is unconditionally
`parsed` on that path.

**The accepted cost, stated because D-b names it:** a real-but-unparseable report is no longer
stored for a later re-parse. The reason code is what records that a body was seen at all.

#### WS3-F05 — edition unit signatures use the series' own gazetteer (D-c = (a))

`unitSignaturesFrom(html, gaz)` takes the gazetteer as a **required** argument (no default —
a caller must say which vocabulary it means), and `discoverEditions` resolves it with
`gazetteerFor(series)` before any network call. The stamp becomes
`editionUnitsVersion(gaz)` = `isw-unit-sig-v2-<gazetteer.version>`; a `v1` row is recognisable
by naming no gazetteer at all. It stays inside `EDITION_DERIVED_VERSION_RE`.

`src/lib/validation/isw-extract.ts` is **byte-identical** — it is the production `isw_reports`
path — and only its transient texts are re-scored, in one stack frame. ROCA output does not
move either, because `keywords.extractSignature` IS `extractSignatureWith(RU_UA_V1, …)`; only
its version stamp changes.

**The D-c contingency was verified, not assumed:** production stands at **29 migrations**
(newest `0027_numerous_lord_tyger.sql` plus `9999_claim_source_trigger.sql`) with
`benchmark_report_editions`, `benchmark_series_days`, `conflict_validation_observations` and
`runtime_logs` all **absent**. So zero production rows exist under the old derivation and no
backfill is owed. See "How production was read" below for why this needed a fork.

#### WS3-F06 + WS3-F10 — gazetteer recall and the anchoring invariant (D-e)

Appended variants (append-only; nothing has persisted a result under this version):
`bab-al-mandeb`, `bab-el-mandeb`, `bab el mandeb`, `bab al mandab`, `deir ez zor`,
`dayr az zawr`, `hodeida`, `ayn al-asad`, `al-asad air base`, `taizz`, `be'er sheva`,
`al-qa'im`, `beka'a`, and **`tel-aviv`** (OPEN-TASKS #120). Every canonical KEY and its
declaration order are untouched, so Set insertion order does not move.

The curly-apostrophe family is handled by a **word-mode-only** punctuation fold —
U+2018/U+2019 → `'`, U+2010/U+2011 → `-`, nothing else — applied to the text **and** to each
variant literal. It is placed **after** the `matchMode === "substring"` early return, not at
the `:97` `toLowerCase()` line the register cited: that line sits ABOVE the branch and folding
there would move `ru-ua-v1` with it. Substring mode is byte-identical and the RU/UA snapshot
and legacy-oracle differential stay green.

Not added, on #120's measured precision evidence: `al quds` (the Quds Force, an organization,
×6) and `shirazi` (a surname/demonym, ×7). Both are ruling-20 territory.

WS3-F10: the invariant becomes `/^[a-z0-9](?:[a-z0-9 '-]*[a-z0-9])?\*?$/`, and every declared
variant is asserted to compile left-anchored and either right-anchored or stemmed.
`variantSource` is exported for that assertion — pinning it through a copy would prove nothing.

#### WS3-F07 — `--backfill-from-isw-reports` (D-d = lane C)

`backfillFromIswReports` reads `isw_reports` and writes the 0028 tables through the same merge
authority. Zero network. No HTML ⇒ `parseStatus: "pending"`, empty `derived`, both anchors
`missing` — **exempt by construction from D-b's unit criterion**, and a later discovery run
upgrades the row in place (`mergeEditionRecords` ranks pending < failed < parsed and an empty
incoming `derived` never erases a stored one). Writing `failed` would claim we tried to parse
something.

Per-row typed refusals are counted and never abort: unknown shape, wrong series, and a slug
date that disagrees with the row's `report_date`. Sample capped at 20; the count is not.
Anything that is not a `ConflictDomainError` still propagates.

**The eleven June-2025 rows are IN scope and register**, on WS3-F08's parser shape. #116's
do-not-run instruction concerns a NETWORK discovery backfill and still stands; this mode makes
no request.

`parseSeriesBackfillArgs` is the one dispatch authority — `parseSeriesDiscoveryArgs` returns
null when the flag is present, so a single argv can never run both modes.

#### WS3-F08 — the June-2025 suffix slug (D-f = (b), parser half only)

`normalizeIswEditionUrl` resolves `…-june-14-2025-evening-edition/` onto the SHIPPED
`morning` / `evening` labels, so finality ranks, `NORMALIZED_EDITION_LABELS` and the edition
key are unchanged. Near misses stay refused: unknown edition word, plural suffix, and a URL
carrying both a prefix and a suffix label.

**`git diff origin/main -- src/lib/validation/run.ts` is EMPTY** and a test pins
`iranUpdateUrlCandidatesForDate` at four shapes with no `-edition/` form, so production's
frozen discovery path is untouched.

#### WS3-F04 — an observation is bound to the edition its result names

`OBSERVATION_INSERT_SQL` becomes an `INSERT … SELECT … FROM benchmark_report_editions WHERE
id = $2 AND edition_key = $5 AND series = $3 AND report_date = $4`. Still one statement, still
no `ON CONFLICT`, still one write; zero rows back is a typed `invalid_observation_row` naming
the disagreement. Every parameter carries an explicit cast, because a parameter in a SELECT
list has no target column to take its type from the way a VALUES list does.

**The signature is unchanged** — every value the check needs is already in
`ConflictObservationInput` — so step 19 is unaffected and the hunk lives inside the function
body where a caller cannot collide with it.

#### WS3-F09 — the CRON_SECRET gate order

`conflict-validate` now asserts that an unauthenticated request with malformed parameters gets
**401 and not 400**, with `dbQuery` and `discoverEditions` never called. `validate` has no
parameter validation to reorder past, so its pin is the stronger one: an unauthenticated
request must not reach `withCronRun` at all. Both also pin the fail-closed case (`CRON_SECRET`
unset ⇒ 401 even with a bearer header).

#### Three follow-up commits, named because they are changes the findings implied

1. `isw: bound the N3 backfill with the optional window its sibling mode has`. `--from`/`--to`
   are OPTIONAL and absent means the whole corpus (N3's literal wording); the emitted SELECT is
   byte-identical to the unbounded one when no bound is given. **Why it exists:** without it
   the mode cannot be proven against real Postgres without walking a production fork's entire
   `ir` corpus row by row (1,125 rows, three passes). It also lets the operator run N3 in
   bounded passes — the #116 range is one. A malformed bound is a refusal, never a silent
   whole-corpus sweep.
2. `isw: an undersized 200 is an unusable BODY, not throttling`. **Both halves came from the
   fresh re-check, not from this session's own review**, and both are recorded under "Re-check
   result" below: the `probeFailures` comment overclaimed identity with the shipped formula, and
   an undersized 200 was labelled `throttled` when the host had in fact answered.
3. `conflicts: WS3-F04 — the nonexistent-edition case is a typed refusal, not an FK error`.
   Found by running the fork itest against the fixed statement: with the identity SELECT in
   place, a nonexistent `referenceEditionId` resolves zero rows and the module refuses BEFORE
   the foreign key can fire, so the shipped itest's assertion on the FK constraint name no
   longer described the path it exercised. Rewritten rather than relaxed — the typed refusal is
   asserted where the module is the writer, and the FK is separately proven still present and
   still the backstop for a writer that does not come through this module.

### The pre-fix failing runs

Every fix carries a test that FAILS on the pre-fix code. Captured runs:

| Finding | Pre-fix result |
|---|---|
| WS3-F01 | `Tests  5 failed \| 34 passed (39)` — `classifyProbe` absent; `expected undefined to be null` on `dayStatusReason` for the throttled, gap-confirmed and published cases |
| WS3-F02 | `Tests  5 failed \| 40 passed (45)` — R1 promoted with inverted expectations: `expected 1 to be +0` (the OVERCOUNT direction) and `expected +0 to be 1` (the UNDERCOUNT direction), plus morning+plain, the partially-populated store, and the missing `record` field |
| WS3-F03 | `Tests  6 failed \| 44 passed (50)` — R2 inverted: `expected [ { …(9) } ] to deeply equal []`; `expected [ 'special', 'evening' ] to deeply equal [ 'special' ]`; `expected 'published' to be 'probe_failed'` |
| WS3-F05 | Scratch test over `discoverEditions` only (unchanged signature), so it compiles against the shipped module: **pre-fix `expected +0 to be 8`, post-fix pass.** That is the register's own measurement — 0 toponyms under `ru-ua-v1`, 8 under `iran-levant-v1`, on `fixtures/isw/iran-update-2026-07-24.html`. The scratch file was deleted; the same assertion is now permanent in `edition-discovery.test.ts` ("the STORED Iran edition carries the geography, end to end") |
| WS3-F06 | `Tests  20 failed \| 41 passed (61)` — the 15 measured misses, `tel-aviv`, the two fold tests and the two F10 tests |
| WS3-F07 | `git grep -n "backfill-from-isw-reports\|backfillFromIswReports" 4b8e7e7 -- scripts src` → **no matches.** The register's own reproduction: the N3-authorized operator step pointed at a mode that did not exist |
| WS3-F08 | `Tests  1 failed \| 37 passed (38)` — `invalid_edition_url` on all three real June-2025 URLs |
| WS3-F09 | Mutant **M9** re-run after the fix: `Tests  2 failed \| 17 passed (19)` on `conflict-validate` (`?date=08-26-2026: expected 400 to be 401`). On `validate`, M9 as literally stated is not observable (that route has no parameter validation), so the stronger M9′ — the gate moved below `withCronRun` — was run instead: `Tests  2 failed \| 3 passed (5)`, `expected "spy" to not be called at all, but actually been called 3 times`, i.e. an anonymous GET would have opened a `cron_runs` row. Both routes restored byte-identical afterwards |
| WS3-F10 | `TypeError: (0 , variantSource) is not a function`, then the trailing-space demonstration: `"aden "` passes the shipped invariant, fails the tightened one, compiles without a right anchor, and misses `" strikes near aden. "` |
| WS3-F04 | `Tests  2 failed \| 33 passed (35)` — `expected 'INSERT INTO conflict_validation_obser…' to match /FROM benchmark_report_editions/`; `expected 'insert returned no observation id' to contain '4242'` |

### Tests

| gate | before | after |
|---|---|---|
| `npm test` (all four branches merged into the working branch) | **4,332 / 282 files** | **4,411 / 282 files** (+79) |
| `48h/…-discovery` alone | 4,332 | **4,372** (+40) |
| re-run after the re-check's two fixes | — | **4,372** / **4,411**, both unchanged |
| `48h/…-gazetteer` alone | 4,332 | **4,368** (+36) |
| `48h/…-observations` alone | 4,332 | **4,335** (+3) |
| `npm run typecheck` | clean | clean |
| `npm run lint` | 0 errors, 3 warnings | 0 errors, **the same 3 warnings**, all pre-existing and none introduced here: `hardening.test.ts:11:57`, `cron-run.test.ts:5:44`, and `validate/route.test.ts:7:43` — that last file IS touched by this step, but the warned line (the `_params` mock signature) is byte-identical to `4b8e7e7` |
| fork itests | 52 / 52 (register) | **54 / 54** |

Fork itests: `conflict-edition-discovery` 6 · `conflict-observations` 9 ·
`conflict-reference-repo` 12 · `conflict-feature-off` 24 · `migrations-atomic` 3, on
disposable Neon branch **`br-jolly-silence-atwbs5dd`**, created and **deleted** — and, unlike
the register's weaker form, the deletion was verified by **re-listing the project's branches
against the Neon API** (4 branches remain; the fork's id is absent).

`git diff origin/main -- vercel.json` — **empty**. No environment variable was named as set
anywhere; the session read `.env.local` only through the Neon branch script and the itest
runner.

### How production was read (and a credential finding the operator should see)

The prompt asks lane C to verify the D-c contingency against production. **The pooled
`DATABASE_URL` in this worktree's `.env.local` does not authenticate:** a read-only
`SELECT count(*) FROM _migrations` returns
`NeonDbError: password authentication failed for user 'neondb_owner'`. That is consistent with
the follow-up the 2026-09-08 decision-log entry records as owed — rotate the `neondb_owner`
password and refresh `.env.local` + the Vercel DSNs, which also closes #80. Either the rotation
happened and this file was not refreshed, or the file was written from a stale source. The
values are well-formed (`postgres://…`, unquoted, no stray whitespace — checked without
printing them), so this is a credential fact, not a parsing artifact.

The verification was therefore taken on a **copy-on-write fork of production**, which the Neon
control-plane API creates with a working connection URI (`scripts/neon-branch.ts` reads
`connection_uris[0]` rather than swapping the host into the stale parent URL). A fork is a
snapshot of production, so its `_migrations` IS production's at fork time. Read on
`br-jolly-silence-atwbs5dd`, before any migration was applied to it:

```
PROD-COPY migrations: 29
PROD-COPY latest: 9999_claim_source_trigger.sql 0027_numerous_lord_tyger.sql 0026_lumpy_the_fallen.sql
PROD-COPY new tables present: (NONE — 0028/0029/0030 unapplied)
PROD-COPY isw_reports ir rows: 1125
```

**So D-c is free as signed**, and the same reading independently re-confirms OPEN-TASKS #111
and WS3-N10.

### Rulings touched and how each is satisfied

- **Ruling 1 (no ISW prose).** `derived.units` still carries only ordinal + sha256 + canonical
  gazetteer keys + a length bucket; WS3-F05 changes WHICH closed vocabulary supplies the keys,
  never whether text is stored. The `no multi-word fragment survives` sentinel test is
  unchanged and still green against the real Iran page. WS3-F02's new `record` field is the
  same payload the repository already stores, and a test asserts the fixture's distinctive
  wording is absent from it. The backfill's refusal sample carries URLs, a typed code and the
  domain error's own message — no page body is ever fetched. The gazetteer additions are
  sourced by geography and transliteration, not from any report text; `iran-levant-v1.ts`'s own
  header says so and its no-person-names test still passes.
- **Ruling 5 (migrations additive).** **No migration in this step**, as the prompt requires.
  `drizzle/` is untouched; `git diff origin/main --stat -- drizzle/ src/db/schema.ts` is empty.
  WS3-F01's `dayStatusReason` is return-shape only and `benchmark_series_days` keeps its
  two-value CHECK. `9999_claim_source_trigger.sql` is neither renumbered nor moved.
- **Ruling 4 (spend).** Nothing here reaches a paid provider. `edition-discovery.ts` imports no
  LLM module and the backfill imports no fetcher at all; the script-level test now pins that
  neither `--series` branch reaches `politeFetch`.
- **Ruling 13 (versioned extraction).** `EDITION_UNITS_VERSION` is the edition-unit signature
  stamp, NOT `mapExtractorVersion()`; nothing here touches the map extractor version basis, the
  map activation lock, or `MAP_BASELINE`.
- **Ruling 21 (authorization first).** WS3-F09 extends the page-level discipline to two cron
  routes: the gate is now pinned to run before any parameter validation and before any DB call.
- **Scraper conventions.** No fetch volume was added anywhere. D-f (b) is precisely the
  decision not to add a fifth probe against a host that already throttles at ~20 not-found
  requests, and `run.ts` is byte-identical.
- **C15 (a+) — the `publication_gap` two-run confirmation.** Untouched. `confirmGapEligible`
  keeps its predicate and its honest-limit docstring. WS3-F01 makes confirmation *harder*
  (any indeterminate probe blocks it) and never easier, so the C15 residual is not widened.
  **The (f14)/C15 reopening trigger was NOT exercised here** — no `publication_gap` row was
  written by any real run.

### Citations re-verified (at `4b8e7e7`; corrected where they moved)

| cited | status |
|---|---|
| `edition-discovery.ts:226-228` `isCleanNotFound` | correct at base; now `:323` after the F01 doc block |
| `edition-discovery.ts:359` `probeFailures` formula | correct at base; replaced by the named `probeIndeterminate` derivation |
| `edition-discovery.ts:377-382` gap branch | correct at base; now the explicit `confirmable` branch |
| `edition-discovery.ts:501-504` `finalKey` | correct at base; now `dailyFinalKeyFor(...)` |
| `edition-discovery.ts:74` `MIN_REPORT_BYTES`, `:318` edition criterion, `:342-345` parseStatus | all correct at base |
| `edition-discovery.ts:80` `EDITION_UNITS_VERSION` | correct at base; now `EDITION_UNITS_BASE_VERSION` + `editionUnitsVersion(gaz)` |
| `edition-discovery.test.ts:179-182` vocabulary assertion against `RU_UA_V1` | correct at base — and it did pass for the wrong reason; now asserts the gazetteer that actually scored the page |
| `observation-store.ts:246`, `:295-300` | correct at base |
| `observation-store.test.ts:115-143` "reads every result-determined column OFF the result" | correct at base; it does bind `referenceEditionId: 7` against a `roca:…` golden with no relation to id 7 |
| `conflict-validate/route.ts:47-50`, `:56-79`, `:81`; `route.test.ts:60-67`, `:69-87` | all correct at base |
| `match.ts:53-59` `variantSource`, `match.ts:97` lowercase | both correct at base. The register's INTENT is right and explicit ("in word mode ONLY … substring mode stays byte-identical"), but the line it points at cannot deliver it: `:97` sits ABOVE the `matchMode === "substring"` early return, so a fold there would move `ru-ua-v1` too. The step-23 prompt already caught this; the fold went below the branch, and a test pins substring mode unchanged |
| `iran-levant-v1.ts:78, :114, :127, :148, :161-166`; `iran-levant-v1.test.ts:51` | all correct at base |
| `editions.ts:72-74` `IRAN_SPECIAL_PATH_RE` | at base the declaration is `:72-73` (the regex literal is on `:73`); `:74` is `IRAN_PLAIN_PATH_RE`. Content exactly as cited |
| `editions.ts:575-586` `compareEditionFinality` ignores `parseStatus` | correct at base |
| `reference-repo.ts:346-351` dry `editionsForDay` delegation | correct at base |
| `src/lib/validation/run.ts:31-41`, `:105` | correct at base and **unchanged by this step** |
| `migrations.test.ts:83-129` (0028) and `:131-278` (0030) | correct at base; `runtime_logs` appears only inside the 0030 frozen-table list at `:273`, never as a 0029 pin — WS3-N09 confirmed as the prompt asks |

### Decisions needed

**None blocks this step.** Two items for the operator, both recorded above and neither a code
change:

1. **The stale `neondb_owner` credential** in `.env.local` (and, if the rotation happened, in
   the Vercel DSNs). Everything in this step worked around it via the control-plane fork path,
   but the next session that needs a read-only production query will hit it. This is the
   follow-up the 2026-09-08 entry already owes; #80 closes with it.
2. **WS3-N10's correcting decision-log entry** for C5-m's "READ-ONLY probe of production".
   Re-confirmed on a fork today: production has none of the 0028 tables, so the literal command
   throws on the first day. The log is append-only, so this is the operator's line to write.

### Debt and risks

- **#114 option (c), backoff, is NOT done** and was explicitly not signed by D-a. The labelling
  makes throttling visible; it does not stop the host tripping after ~20 not-found requests. A
  window longer than that still produces indeterminate days — now honestly labelled.
- **`probeFailures == probeIndeterminate` today.** They are two fields because they are two
  claims, not because they differ. If a future class of DEFINITE failure appears, narrow
  `probeIndeterminate` and leave `probeFailures` alone. A reader who sees them equal and
  "simplifies" one away will re-open #114's conflation.
- **D-b's accepted loss:** a real-but-unparseable ISW report is no longer stored for a later
  re-parse. If ISW ships a Key-Takeaways markup change, discovery will report a run of
  `unparseable_body` days rather than a run of `failed` editions. That is the intended signal —
  but it is a signal someone has to read.
- **A backfill/discovery canonical-URL collision is possible in principle.** If the backfill
  registers `iran_update:2025-06-14:evening` from the SUFFIX URL and a later discovery run were
  to find the PREFIX URL for the same day, the two canonical URLs differ under one editionKey
  and `mergeEditionRecords` raises `edition_merge_conflict` — fail-closed and honest, but it
  would abort that cell. Unreachable today because D-f (b) keeps the suffix form out of the
  probe list and #116 forbids a network backfill over that window. Recorded so it is not a
  surprise if WS-3.7 revisits the probe order.
- **No HTML fixture was added for the June-2025 pages.** Normalization takes a URL, and
  fetching those two pages is exactly what #116 forbids; the tests use the real production URL
  strings for 2025-06-14 / 06-18 / 06-24. If a later step wants a parse fixture it must come
  from the existing disk cache, not a fresh fetch.
- **`unitSignaturesFrom` now computes the RU/UA signature and throws it away** for the Iran
  path, because `extractTakeawaysWithText` is left byte-identical on purpose. Pure and fast,
  but wasted work; parameterising `isw-extract.ts` would remove it and would move the
  production `isw_reports` path, which is not this step's to move.
- **`variantSource` still compiles an unanchored literal at runtime.** WS3-F10's fix is
  test-only, as the register marks it, and the tightened invariant scans `iran-levant-v1` ONLY.
  A future word-mode gazetteer inherits the hole unless it copies that test. The structural fix
  — refuse a leading/trailing space in `compileTable`, beside the existing empty-variant refusal
  — is one line and was deliberately not taken here, because it widens scope past the finding.
  Raised by the re-check; a candidate for #119 if step 26 agrees.
- **The recall probe set is R3's reproducible subset, not its 54.** The register enumerates 23
  spellings; the other 31 are not written down. All 23 are covered plus `tel-aviv` and 7 further
  hits. Anyone regenerating the full 54 would need the original script, which is not in the tree.
- **Single-author remediation.** A fresh read-only re-check session confirmed each fixed finding
  CLOSED (below) and found two real defects in the first pass, both fixed. But it read the same
  tree; it is not an independent implementation, and its own tree-wide gate was skipped because
  this session was cutting PR branches under it.

### Fresh re-check

Prompt given to a fresh read-only session (Opus), verbatim, with its confirmations pasted:

> Read-only. Do not edit any file. Against the working tree at
> `/Users/go/code/bnow-net-worktrees/48h-audit-ws3-20260905` on branch
> `48h/audit-ws3-20260905-remediate-ws3`, confirm for each of WS3-F01, F02, F03, F04, F05,
> F06, F07, F08, F09, F10 in `docs/reviews/WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md`:
> (a) the defect the register describes is no longer reachable in the code as written,
> (b) at least one test would fail if the fix were reverted, and (c) the fix did not
> introduce a new fail-open path, widen scope past the finding, add a migration, add fetch
> volume, or move `src/lib/validation/run.ts`. Report CLOSED / NOT CLOSED per finding with
> the file:line you relied on, and list anything you could not verify.

**Re-check result — all ten CLOSED.** Verbatim, against ref `4935fbd`; 267 / 267 green across
the 11 affected files including `ru-ua-v1.test.ts`:

```
WS3-F01: CLOSED — edition-discovery.ts:335 (classifyProbe), :535 (confirmable) — reverting test: "a 403 is counted as indeterminate and does not read as a clean not-found"
WS3-F02: CLOSED — edition-discovery.ts:655 (dailyFinalKeyFor, stored ∪ discovered) — reverting test: "special + evening: the anchor on the NON-final edition reads `not final` in BOTH modes"
WS3-F03: CLOSED — edition-discovery.ts:443 (zero-unit body → unparseable_body, no edition) — reverting test: "does not clear a CONFIRMED publication_gap and never marks the day published"
WS3-F04: CLOSED — observation-store.ts:220 (INSERT … SELECT … WHERE id/edition_key/series/report_date) — reverting test: "the one statement re-reads benchmark_report_editions and matches all four identity columns"
WS3-F05: CLOSED — edition-discovery.ts:290 (gazetteer is a required arg), :104 (editionUnitsVersion) — reverting test: "an Iran Update page yields Iran geography, not the empty RU/UA answer"
WS3-F06: CLOSED — match.ts:134 (fold below the substring return) + iran-levant-v1.ts:93-96,135,148,157,164,169,183,187 — reverting test: "iran-levant-v1 prose recall (WS3-F06)"
WS3-F07: CLOSED — edition-discovery.ts:837 (backfillFromIswReports; no fetch dep) — reverting test: "reads isw_reports READ-ONLY, keyed on the series' theater, and fetches nothing"
WS3-F08: CLOSED — editions.ts:89 (IRAN_SUFFIX_EDITION_PATH_RE), :177 — reverting test: "covers ISW's June-2025 SUFFIX edition slug (WS3-F08 / OPEN-TASKS #116)"
WS3-F09: CLOSED — conflict-validate/route.ts:49 (gate first; order now pinned) — reverting test: "401s BEFORE parameter validation: an unauthenticated malformed request never gets a 400"
WS3-F10: CLOSED — iran-levant-v1.test.ts:56 (tightened invariant), :62 (anchoring assertion) — reverting test: "a trailing-space variant is exactly the hole the tightened invariant closes"
```

Its guard checks, all clean: `run.ts` diff 0 lines; `drizzle/`, `src/db/schema.ts`,
`vercel.json` empty; `backfillFromIswReports` structurally unable to fetch and
`iranUpdateUrlCandidatesForDate` still four shapes; the fold at `match.ts:134` below the
substring return at `:123`, with `compileFor`/`variantSource` reached from one call site inside
the word branch; `OBSERVATION_INSERT_SQL` one statement with no `ON CONFLICT`; ruling 1 — every
`*_HTML` reference in the diff is in a test file, and persisted payloads stay
ordinal / sha256 / canonical keys / chars / URLs / ids / enums.

**Its six concerns, and what was done about each:**

1. **"`probeFailures = probeIndeterminate`'s comment claims identity with the shipped formula;
   post-D-b it is not."** *Correct, and FIXED* in commit `isw: an undersized 200 is an unusable
   BODY, not throttling`. It is the shipped FORMULA evaluated against the post-D-b edition set;
   on a day whose only 200 was a zero-unit body it now reads 1 where it read 0. The comment now
   says so, because a WS-3.6 soak predeclares against that counter.
2. **"An undersized 200 is counted under reason `throttled` — a transport word for a body
   problem."** *Correct, and FIXED* in the same commit. The host answered; it answered with
   something that is not a report, which is D-b's problem one threshold earlier. It now reports
   `unparseable_body`. This stays inside D-a's two signed values and makes `throttled` mean only
   "the host would not talk to us".
3. **"F06 landed 31 recall probes, not the register's 54."** *Correct as stated, and NOT
   changed.* The register's R3 table enumerates 23 spellings — the 15 misses and 8 "hits worth
   recording"; the other 31 probes of its 54 are not written down anywhere reproducible. All 23
   named spellings are covered, plus `tel-aviv` and 7 further hit probes: 31 rows. The claim in
   this report and in PR #90's body is corrected accordingly (PR body edited after the re-check) — this is the reproducible subset
   of R3, not a copy of the 54.
4. **"F10's invariant scans only `iran-levant-v1`; `variantSource` still silently compiles an
   unanchored literal at runtime."** *Correct, and deliberately NOT fixed.* The register marks
   WS3-F10 "test-only" and a runtime refusal in `compileTable` would widen scope past the
   finding. Recorded under Debt and risks below; it is a candidate for #119 if step 26 agrees.
5. **"Nothing was run against a database; F04's guard is proven only by SQL shape."** True of
   the re-check session, which is read-only. This session DID run
   `conflict-observations.itest.ts` on a fork — 9 / 9 including the mismatched-edition case —
   and the numbers are in Tests above.
6. **"The worktree HEAD moved three times mid-audit."** True, and this session's fault: PR
   branches were being cut and pushed while the re-check ran. Everything it reports is anchored
   to ref `4935fbd` and its test run happened while HEAD sat on that SHA, so the finding-level
   conclusions hold — but its tree-wide `npm test` / `typecheck` / `lint` were skipped for that
   reason. Those were run by this session on every branch instead (counts in Tests above), and
   again after the two fixes above.

**One thing the re-check could not do:** verify D-c's production contingency, having no
database access. This session did — see "How production was read".

### Handoff

**For step 25 (docs sync) — what to apply:**

1. **PLAN-WS-3 §3.2a, one sentence, now wrong by one clause.** At `:193`:
   before — `→ \`parseStatus = units.length > 0 ? 'parsed' : 'failed'\``;
   after — `→ an edition is registered only when \`units.length > 0\` (D-b); a >10 KB body
   that declares no unit is an INDETERMINATE probe with reason \`unparseable_body\` and the day
   stays \`probe_failed\`, so discovery never mints a \`failed\` edition`. The neighbouring
   clause "a probe counts as an edition iff `status === 200 && html.length > 10_000`" needs
   "and the body declares at least one Key Takeaway" appended.
   The same §3.2a sentence at `:196-198` ("`probe_failed` if ANY probe was not a clean 404")
   should gain "— reported as `probeIndeterminate` with a `dayStatusReason`, D-a".
2. **The WS-3 register's five "Stale standing text" items are unchanged by this step** and
   still step 25's. One addition: item 2's file count for `src/lib/conflicts/` is unaffected
   (lane C added no file there), and **no AGENTS.md standing line was made wrong by lane C** —
   in particular the `drizzle/` range does not move, because this step adds no migration.
3. **Register ids added to status lines** (already committed on the docs branch, listed here so
   step 25 does not duplicate them): #114 gains a "CLOSED for option (b)" block naming WS3-F01
   and D-a, and an explicit "STILL OPEN: option (c), backoff"; #116 gains a "PARSER HALF
   CLOSED" block naming WS3-F08 and D-f (b), and re-states that the network-backfill
   prohibition still binds. New entry **#119** carries lane C's nine DEFER rows.
4. **The credential item and WS3-N10's correcting entry** under "Decisions needed" above.

**For step 26 (final audit) — what to re-refute:**

- **M9 is dead** on `conflict-validate` (verified by re-running it: 2 of 19 fail). On
  `validate`, M9 as literally stated is unobservable — that route validates no parameters — so
  the stronger M9′ (gate below `withCronRun`) was used and fails 2 of 5. Re-derive rather than
  trust the label.
- **M10 is dead**: `isCleanNotFound` is pinned in both directions and `classifyProbe` has an
  explicit 403 case.
- The register's other 21 mutations were not re-run here. M20 (`break` after the first edition)
  and M15 (`EDITION_SIGNATURE_TOKEN_RE`) touch code this step edited and are worth re-running.
- **New surface worth attacking:** `dailyFinalKeyFor`'s union-preference rule; the
  `probeFailures == probeIndeterminate` identity; the backfill's typed-refusal catch (does any
  non-domain throw abort a long run?); and whether the word-mode fold can widen a match — the
  RU/UA snapshot proves substring mode did not move, but the Iran word path has no snapshot.

**For step 27 (go/no-go) — what must be in front of the operator:**

- Lane C adds **no migration, no environment variable, no cron line, no deploy step**. Nothing
  here changes the release checklist. The `conflict-validate` route stays unscheduled and
  absent from `vercel.json` (pinned).
- **N2 still binds:** a production GET of `/api/cron/conflict-validate` with `CRON_SECRET`
  writes 0028 rows and is forbidden until WS-3.6.
- **Production is at 29 migrations** (verified today on a fork). Deploying any of these four
  PRs changes no production behaviour, because the 0028/0029/0030 tables do not exist there and
  the route is unscheduled.
- The **stale `neondb_owner` credential** is a release-relevant fact: a deploy session that
  needs `npm run db:migrate` will hit it.

**For step 19 (running in parallel):** `persistObservation`'s **signature is unchanged** and
the identity check is inside the function body, so a caller cannot collide with it. If step 19
merges first, the discovery/observations PRs rebase cleanly (disjoint files); if lane C merges
first, step 19 gets the checked statement for free and should resolve the winner's row id from
`edition_key` rather than passing an arbitrary id, because the statement now refuses the
mismatch. Also: `DiscoveredEdition` gained a `record` field and `unitSignaturesFrom` gained a
required gazetteer argument — both additive to callers that do not use them, but a step-19
call site that constructs `DiscoveredEdition` literals will need the field.

**For step 24 (scoreboard / soak prep):** `probe_failed` now carries a `dayStatusReason` when
it has one — render `throttled` as "could not be confirmed (source throttled)" and
`unparseable_body` as "source returned an unusable page", and NEVER either as a gap. The
soak's predeclared thresholds should be written against `probeIndeterminate` and
`dayStatusReasons`, not against `probeFailedDays` alone.
