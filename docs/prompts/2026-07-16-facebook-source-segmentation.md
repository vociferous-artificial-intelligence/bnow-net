# Claude Code handoff — #56 Facebook source segmentation

Recommended model: **Claude Opus 4.8**
Effort: **high**
Reason: this is a data-identity migration with parser edge cases and exact reconciliation
requirements. Use Fable 5 only if available and the operator accepts its higher cost for the
hardest long-running implementation.

## Repository and protocol

Work in `/home/go/code/bnow.net`. Read `AGENTS.md`, `docs/CURRENT-STATE.md`, standing
rulings 1–5, and `docs/reviews/OPEN-TASKS-RESEARCH-2026-07-16.md` before editing. Preserve
all unrelated user changes. Do not edit an applied migration. Do not alter GitHub Actions.

## Objective

Close OPEN-TASKS #56 by segmenting the ISW-derived Facebook registry root into defensible
page/profile identities, migrating existing citations without loss, and proving aggregate
reconciliation. Telegram and X are already segmented and must not regress.

## Evidence to reproduce first

Read-only production results on 2026-07-16:

- `facebook.com`: 1 source, 26,195 citations, 7,081 raw URLs;
- `t.me`: 3,333 channel sources / zero roots;
- `x.com`: 2,703 account sources / zero roots;
- every Facebook citation has a URL path;
- first path segment `GeneralStaff.ua` accounts for 21,073 citations;
- at least 1,977 citations use reserved/non-identity routes (`watch`, `share`, `reel`,
  `permalink.php`, `story.php`, `groups`, `pages`, etc.).

Relevant files:

- `src/lib/isw/urls.ts`
- `src/lib/isw/parse.test.ts`
- `scripts/isw-load.ts`
- `scripts/registry-materialize.ts`
- `src/db/schema.ts` (`sources`, `source_citations`, `source_theater_stats`)

## Required behavior

1. Extend `canonicalSource()` with explicit Facebook URL-shape handling.
2. Direct page/profile paths become a stable normalized key such as
   `facebook.com/generalstaff.ua`, preserving an analyst-readable name.
3. Treat routing/reserved segments fail-closed. Recover an identity only from an explicit,
   documented field in that URL shape (for example a page id query parameter); never use a
   share/reel/watch token as if it were a source identity.
4. Define an auditable unresolved policy. Unresolved URLs must not be pooled into the
   misleading platform root or silently discarded. Prefer a clearly non-ranked unresolved
   identity/status that cannot surface as a source score, or stop and present the operator
   with the exact unresolved classes if the schema cannot express that safely.
5. Add table-driven tests for case normalization, `www`/mobile hosts, direct profiles,
   numeric IDs, posts, photos, groups/pages, share/watch/reel, query-id variants, invalid and
   self URLs. Pin existing Telegram/X behavior.
6. Create a **read-only plan mode** that reports old source id, target key, citation counts,
   unresolved reason counts, collisions, and exact before/after totals.
7. Create a separately gated apply mode. In one transaction: create target sources, repoint
   `source_citations`, recompute or invalidate/rebuild global and theater aggregates, and
   remove the root only when zero citations reference it and totals reconcile exactly.
8. Apply must be idempotent/resumable and refuse any count mismatch. Preserve every
   `raw_url`, report relationship, endnote, hedging label, and cue byte-for-byte.
9. No paid providers and no external Facebook fetches.

## Acceptance criteria

- Unit tests prove the URL matrix and no t.me/x.com regression.
- Disposable-Neon integration test proves transactional migration, idempotent rerun,
  collision handling, aggregate recomputation, and rollback on mismatch.
- Dry run on production reports zero `t.me`/`x.com` roots and a complete Facebook accounting.
- Do **not** apply to production until the operator reviews the dry-run artifact.
- After separately authorized apply: citation total is unchanged; no citation references
  `facebook.com`; aggregate sums reconcile globally and per theater; no unresolved item is
  presented as a ranked page source.
- Update OPEN-TASKS, PROGRESS, CURRENT-STATE, and the decision log with measured evidence.

Run typecheck, lint, unit tests, and the scoped disposable-Neon integration suite. Do not
commit, push, deploy, mutate production, or run an apply mode without explicit authorization.
