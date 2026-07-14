# Analyst evidence trail + deliverable handoff — implementation plan (2026-07-14)

Status: engineering handoff only. This document authorizes no application-code,
database, environment, provider, deployment, or production-data change by the
research/planning agent that wrote it.

Source review:
`docs/reviews/ANALYST-LOW-HANGING-VALUE-2026-07-14.md`.

This revision also incorporates the 2026-07-14 rendered analyst-handoff audit:
manual claim selection, native browser print/PDF, print-media CSS, closed evidence
disclosures, and the Terms' permitted-use language were tested against a current
database-backed digest. The audit found that the application is investigable but
not yet deliverable-ready: manual selection loses context and links, while native
print includes product chrome/internal provider labels and omits closed evidence.

## Outcome

Ship one compact analyst-evidence and work-product bundle:

1. Every digest claim shows an honest evidence summary and a complete sortable
   evidence trail.
2. Provider publication time and BNOW ingestion time remain separate from query
   through display; an unknown provider time is never replaced by ingestion time.
3. Source names/handles, not canonical URLs, are the primary evidence labels.
4. Every rendered final claim exposes an attribution-safe **Copy for report**
   action plus **Copy link**, **Copy with evidence**, and deliberately secondary
   **Copy text only** variants.
5. The same copy/evidence contract is reused on digest claims, Ask cited/related
   claims, Search results, accepted-user Signal evidence, and entity timelines.
6. `/search` loads the supporting evidence for all displayed results in one bulk
   SELECT and reuses the same evidence trail.
7. Ask and entity timelines resolve their displayed claims plus evidence in bulk,
   never through one query per claim, and use the owning digest date for stable
   claim links.
8. The existing accepted-user evidence on `/signals` keeps working without
   weakening its anonymous/legal-acceptance data boundary.
9. Digest pages expose a deliberate **Print / Save PDF** workflow with a compact
   brief mode and an optional complete evidence appendix; neither mode prints site
   chrome, buyer-profile controls, internal provider names, or feedback controls.
10. The subsequent PostHog workstream instruments successful copy and initiated
    print actions with privacy-minimized typed events. This branch establishes
    stable action-mode values and testable success boundaries for that follow-on;
    it does not add analytics code or dependencies.

This bundle adds no schema, migration, ingestion work, model/provider call,
embedding, background job, API route, server-generated PDF service, Word/PPT
generator, or new product object. The recent maximum is 34 attached documents per
claim, so disclosure sorting and copy-payload assembly stay local and bounded.

The PostHog provider, consent gate, sanitizer, typed analytics client, event names,
and copy/print call sites belong to the subsequent separate
`docs/prompts/2026-07-14-posthog-product-analytics.md` workstream. Sequence is
binding: merge and verify this analyst bundle first; branch PostHog from that new
main; then instrument the already-stable copy/print components. Do not combine the
workstreams, pre-install `posthog-js`, add a temporary no-op analytics layer, or
delay analyst value on analytics/legal/environment setup.

## Non-negotiable product semantics

- “Evidence” means all `raw_documents` explicitly attached to the final claim by
  `claim_sources`. It does not mean every semantically similar item in the corpus.
- Use **documents**, **channels**, and **platforms**. Never say “independent
  sources”; organizational independence is not represented in the data.
- `Published` is `raw_documents.published_at`, the provider/source-declared time.
- `First seen by BNOW` is `raw_documents.fetched_at`, the ingestion time.
- Never use `COALESCE(published_at, fetched_at)` in a field named `publishedAt` or
  in the Published column. Unknown publication time renders as “Unknown”.
- The claim summary uses the earliest non-null provider publication timestamp and
  the earliest BNOW ingestion timestamp among that claim’s attached documents.
- Source-label fallback order is:
  `sources.name` → `sources.canonical_url` → hostname parsed from the document URL
  → adapter name. Source names, URLs, titles, handles, ids, and scores are proper
  data and are not translated.
- `sources.platform` is partly a source class (`state_media`,
  `independent_media`, `gov`), not always a transport platform. Derive the visible
  Platform value from the transport adapter (`rss` → RSS/news, `gdelt` → GDELT,
  `telegram_web`/`telegram_mtproto` → Telegram, `x_api` → X), while allowing the
  explicit `telegram`/`x` source values to confirm those two cases. Use this visible
  value for the summary platform count. Keep the existing source-platform class in
  the diverse-chip selection so the established selection behavior does not drift.
- Reliability remains governed by the existing `showScores` prop. When false,
  omit the reliability value/column rather than rendering a masked placeholder.
- All external source links retain `target="_blank"` and
  `rel="nofollow noopener"`.
- Display wall-clock timestamps in `America/New_York` with the literal `ET` suffix
  through `src/lib/time/format-et.ts`. Put the exact UTC ISO instant in a
  `title`, visually hidden label, or equivalent accessible description.
- The evidence trail contains **every attached document**, including the documents
  already represented by visible chips. It is not merely the old hidden remainder.
- Preserve the current visible-chip diversity selection: at most six diverse chips
  when the raw count is greater than eight; all chips at eight or fewer. The new
  complete trail replaces the old unsorted hidden-chip remainder.
- `/signals` stays teaser-public/specifics-gated. Anonymous and signed-in-but-
  unaccepted HTML must contain no claim text, document URL, source name, title, or
  other evidence detail.

Recommended compact summary copy:

```text
12 documents · 8 channels · 3 platforms
Earliest published: Jul 13, 9:14 AM ET · First seen by BNOW: Jul 13, 9:18 AM ET
[diverse source chips]  [View evidence trail (12)]
```

For a claim with no provider timestamps:

```text
Earliest published: Unknown · First seen by BNOW: Jul 13, 9:18 AM ET
```

### Deliverable-copy semantics

The primary action is **Copy for report**. It writes both `text/plain` and
`text/html` in one clipboard operation when the browser supports multi-format
Clipboard Items; fall back to `writeText` with the same plain-text content when it
does not. Rich copy is for Word, Google Docs, email, and presentation tools. Plain
copy is for Slack, plain-text editors, and systems that strip HTML. The factual
content and ordering must remain equivalent across both representations.

The default payload is self-contained and ordered as:

```text
<claim text>
Status: <Confirmed | Assessed | Claimed | Unverified | Unknown> · As of: <digest date>
Evidence: <N> linked documents · <N> channels · <N> platforms
Source: BNOW.NET, <Country> Daily Digest, claim c<id>
<canonical absolute digest URL>#c<id>
```

Example:

```text
Ukraine and nine European countries have formed a Ballistic Missile Defense Coalition.
Status: Confirmed · As of: 13 July 2026
Evidence: 17 linked documents · 11 channels · 3 platforms
Source: BNOW.NET, Russia Daily Digest, claim c4762
https://bnow.net/digests/ru/2026-07-13#c4762
```

Binding rules:

- Status/hedging and digest date always travel with **Copy for report** and **Copy
  with evidence**. Never flatten `claimed`, `unverified`, `assessed`, or `unknown`
  into unqualified prose.
- “Evidence” uses the measurable document/channel/platform counts defined above;
  it never says “independent sources”.
- The canonical claim link is built server-side with `siteBaseUrl()` plus the
  owning digest path and stable anchor. Do not copy a localhost, Preview,
  deployment, auth, or query-bearing URL. Buyer-profile query parameters only
  reorder the digest and are not part of the canonical citation.
- **Copy link** copies only that canonical absolute anchor URL.
- **Copy with evidence** appends the complete attached-document list in the trail's
  current oldest-published order. Each entry contains human source label, platform,
  Published (or Unknown), First seen by BNOW, and full external URL when present.
  It contains no source full text or ISW prose.
- **Copy text only** is secondary and explicitly labeled. It copies only the claim
  sentence because analysts sometimes need prose inside an already-attributed
  paragraph. Do not make it the primary/default action and do not imply that it is
  a citation-safe payload.
- Never copy hidden application fields, internal provider/model names, confidence
  implementation metadata, entity-chip roles, raw document ids, or reliability
  values into the default report payload. Reliability belongs only in **Copy with
  evidence** when `showScores=true`.
- Clipboard success is the resolved browser write, not the button click. Announce
  the completed mode through one `aria-live="polite"` region. Failure is
  non-destructive and does not replace or select page content.
- The reusable action accepts a serializable payload prepared by the Server
  Component. It must not scrape surrounding DOM text to construct a citation.

### Print/PDF semantics

Provide a visible **Print / Save PDF** control on digest detail pages with two
modes:

1. **Print brief** — digest/event/claim content, status, evidence counts, selected
   human-readable source labels, and canonical claim URLs. It states “Selected
   evidence shown; complete evidence is available at each claim link.”
2. **Print with evidence appendix** — the same brief followed by a complete,
   claim-keyed appendix containing every attached document's source label,
   platform, Published, First seen by BNOW, reliability when permitted, and full
   external URL.

Both modes:

- use the browser print dialog (`window.print`) and therefore support paper or Save
  as PDF without a PDF service or download endpoint;
- render a print-only header with BNOW.NET, country/theater, digest date, digest
  status/stage, generation/as-of time, and the canonical digest URL;
- hide the sticky site header, footer, locale/auth/access controls, previous/next
  navigation, buyer profiles, internal model/provider strings, feedback mailtos,
  interactive disclosure/sort/copy controls, and screen-only explanatory chrome;
- keep event headings with their first claim and avoid splitting ordinary claim
  blocks across pages; a block taller than one page must remain printable rather
  than overflow or disappear;
- remove visual truncation from printed source labels/URLs and allow safe wrapping;
- use light, high-contrast print colors independent of the user's dark-mode
  preference;
- repeat enough claim identity in the evidence appendix to map every evidence row
  back to its claim without exposing a database-only reference as the sole label;
- never print evidence hidden by access policy. `/signals` and other gated surfaces
  do not gain a print route in this branch.

Set a temporary semantic print mode on the document only for the app-initiated
print action, clean it up on `afterprint`, and treat ordinary browser Ctrl/Cmd+P as
brief mode. Do not navigate to a new route or encode claim content in a query
string.

### Analytics follow-on contract (PostHog branch, after this merge)

Recommendation 5 is intentionally sequenced after this feature. The PostHog branch
adds these events through its BNOW-owned analytics abstraction:

| Event | Emit when | Allowed properties |
|---|---|---|
| `claim_copied` | Clipboard write resolves successfully | `surface`, `copy_mode` (`report`/`link`/`evidence`/`text`), `theater`, `hedging_class`, coarse `evidence_count_bucket` |
| `digest_print_initiated` | An app print mode is selected immediately before `window.print()` | `theater`, `print_mode` (`brief`/`evidence`), coarse `digest_age_bucket` |

Do not emit on clipboard failure, disclosure open, native Ctrl/Cmd+P, print dialog
cancel/complete (unknowable), or component render. Never send claim/event/source
text, Ask/Search text, entity/source names, URLs, fragments, database ids, document
ids, source ids, clipboard contents, or arbitrary property bags. The stricter
PostHog privacy plan supersedes any temptation to use a claim id merely because it
is smaller than claim text.

## Isolated workstream and branch

### Why isolation is required

At revision time the primary worktree is `/home/go/code/bnow.net` and contains
operator/current-documentation changes, including this untracked plan and its source
review. Commit ids recorded by the earlier draft are already stale. The coding agent
must inspect the then-current `main`, `origin/main`, worktrees, and dirty files and
record the actual selected `BASE_SHA`; never branch from a historical hash copied
from this document.

The coding agent must not switch branches, stash, reset, clean, or commit from that
primary worktree.

### Worktree creation

After the operator chooses the integration baseline (normally the then-current local
`main`, after planning documents are preserved), create a sibling worktree:

```bash
cd /home/go/code/bnow.net
BASE_SHA=$(git rev-parse main)
git worktree add -b codex/analyst-evidence-trail \
  /home/go/code/bnow.net-analyst-evidence "$BASE_SHA"
```

Record `BASE_SHA` in the coding-agent handoff. Do not assume `origin/main` is the
correct base while local main is ahead. Do not pull/rebase the primary dirty
worktree. All application implementation, test runs, and commits happen in:

```text
/home/go/code/bnow.net-analyst-evidence
branch: codex/analyst-evidence-trail
```

Before integration, fetch and rebase this feature branch onto the operator-selected
target `main`, resolve only this branch’s files, rerun the full gate, then merge by
the repository’s normal non-destructive process. Deployment is a separate operator
decision.

This branch must merge before the PostHog product-analytics branch is created. The
analytics branch then instruments the stable copy/print components described here.
Do not run both implementation branches concurrently because their product-event
call sites would overlap these files.

### Workstream file ownership

This workstream exclusively owns the following existing files until merge:

```text
src/components/claim-sources.tsx
src/components/claim-sources.test.tsx
src/app/digests/[country]/[date]/page.tsx
src/app/digests/[country]/[date]/page.test.tsx
src/app/search/page.tsx
src/app/search/page.test.tsx
src/app/ask/actions.ts
src/app/ask/actions.test.ts
src/app/ask/ask-result.tsx
src/app/ask/ask-result.test.tsx
src/app/signals/page.tsx
src/app/signals/page.test.tsx
src/app/entities/[id]/page.tsx
src/lib/analyst/signals.ts
src/lib/analyst/signals.test.ts
src/app/globals.css
src/i18n/dictionaries.ts
src/i18n/i18n.test.ts
```

Expected new files owned by the workstream:

```text
src/components/claim-evidence-model.ts
src/components/claim-evidence-model.test.ts
src/components/claim-evidence-trail.tsx
src/components/claim-evidence-trail.test.tsx
src/components/claim-copy-model.ts
src/components/claim-copy-model.test.ts
src/components/claim-copy-actions.tsx
src/components/claim-copy-actions.test.tsx
src/components/digest-print-actions.tsx
src/components/digest-print-actions.test.tsx
src/app/entities/[id]/page.test.tsx
```

If the coding agent finds a better split, keep the same ownership boundary and
explain it in the commit. Other coding agents may work concurrently only in separate
worktrees/branches and must not edit these files. In particular, do not let another
agent “help” by editing the shared evidence component or dictionaries in parallel;
those are the collision hotspots.

The feature agent must not edit `AGENTS.md`, `docs/PROGRESS.md`, the decision log,
the source review, the PostHog plan, privacy/legal version files, database schema,
analytics provider files, or environment configuration. The integration/
documentation owner corrects standing state and appends the decision record only
after the feature is verified and actually shipped.

## Architecture

Keep database work in App Router Server Components and the existing Ask Server
Action. Push the client boundary down to sorting, clipboard, and print actions:

```text
digest/search/signals/entities Server Component + Ask action/result
  └─ query existing evidence rows
     └─ ClaimSources server wrapper
        ├─ computes serializable translated labels
        └─ ClaimEvidenceTrail client leaf
           ├─ local sort state only
           └─ native details/select/table UI

digest/search/signals/entities Server Component + Ask action/result
  └─ prepare serializable ClaimCopyPayload
     └─ ClaimCopyActions client leaf
        ├─ rich + plain Clipboard API writes
        ├─ report/link/evidence/text modes
        └─ one aria-live success/failure status

digest Server Component
  └─ DigestPrintActions client leaf
     ├─ brief/evidence print mode
     ├─ window.print()
     └─ afterprint cleanup
```

Do not make a page a Client Component. Do not add an API route or lazy evidence
fetch. Do not pass the `t()` function across the Server/Client boundary; functions
are not serializable. The server wrapper should turn dictionary keys into a plain
labels object and pass that object plus the locale and document DTOs to the client
leaf.

`claim-copy-model.ts` owns pure payload assembly and safe HTML serialization so all
five surfaces produce byte-consistent content and tests do not require a real
clipboard. It accepts only explicit display fields and the evidence DTO; it never
walks the DOM. `ClaimCopyActions` owns browser capability detection and UI state
only. Its parent provides `surface` as one of
`digest | ask_cited | ask_related | search | signal | entity`; these stable values
are for later analytics instrumentation but this branch does not emit them.

`DigestPrintActions` owns print-mode state only. Print content remains ordinary
server-rendered digest/evidence markup controlled by semantic `data-print-*`
attributes plus one `@media print` section in `src/app/globals.css`. Do not clone the
entire digest in client state, use a screenshot library, generate canvas images, or
add a server PDF renderer.

The project explicitly forbids shadcn/ui and Radix. Use the current native
`<details>`, `<summary>`, `<select>`, `<table>`, button, Tailwind, and WAI-ARIA
conventions.

## Data contract

Evolve `ClaimSourceDoc` so its name and timestamps are unambiguous:

```ts
interface ClaimSourceDoc {
  docId: number;
  url: string | null;
  title: string | null;
  adapter: string;
  sourceId: number | null;
  sourceName: string | null;
  sourceKey: string | null;
  sourceDomain: string | null;
  platform: string | null;
  reliability: number | null;
  publishedAt: string | null;
  firstSeenAt: string;
}
```

Add one serializable copy contract shared by every surface:

```ts
type ClaimCopySurface =
  | "digest"
  | "ask_cited"
  | "ask_related"
  | "search"
  | "signal"
  | "entity";

interface ClaimCopyPayload {
  claimId: number;
  text: string;
  hedging: string;
  asOf: string;
  countryName: string;
  countryIso2: string;
  claimUrl: string;
  docs: ClaimSourceDoc[];
  showScores: boolean;
}
```

Pass localized chrome labels separately as a serializable object. `asOf` is the
owning digest date formatted for the active locale; retain the exact ISO digest date
inside the canonical URL. A displayed claim without an owning digest date may still
offer **Copy text only**, but must not offer report/link/evidence modes with a
fabricated date or URL. This should be rare for final claims and must be explicit in
tests.

`firstSeenAt` is non-null because the schema makes `raw_documents.fetched_at`
non-null. Keep the boundary defensive in case a test/legacy row is malformed, but do
not advertise a nullable database contract.

Move pure behavior out of the UI into `claim-evidence-model.ts`:

- channel identity and platform-class helpers;
- human-readable source-label fallback;
- current diverse visible-chip selection;
- summary counts and earliest timestamps;
- deterministic comparators for every sort option;
- stable `docId` final tie-breaker so hydration/test order never varies.

Do not create a generalized repository layer in this slice. The three page/query
owners already use two different database wrappers (`rawSql.query` returns rows;
Neon `Pool.query` returns `{ rows }`). A premature generic query abstraction adds
more surface than the feature needs. Share the serializable DTO and pure grouping
logic; keep SQL next to each page for now.

## UI behavior

### Visible evidence layer

For any non-empty document set, render:

- full-set document/channel/platform counts;
- earliest provider publication and earliest BNOW ingestion times;
- the existing diverse chips, now labeled by human source identity;
- an always-visible `View evidence trail (N)` disclosure, including for one-document
  claims.

A one-document trail is intentional: it exposes both timestamps, title, platform,
and link without forcing those fields into the compact claim line.

For a document without a URL, render its evidence metadata as text in the table; do
not emit `href="#"`, which implies a working link. Preserve the current external-link
attributes for rows that do have URLs.

### Complete trail

Use a native disclosure. Inside it place a labeled native select and a horizontally
contained table (`overflow-x-auto`, a sensible minimum width) with columns:

```text
Published | First seen | Source | Platform | Reliability | Title/link
```

Omit the Reliability column when `showScores=false`. Source is always present via
the fallback chain. Title is secondary: show it when available; otherwise use a
translated “Open source document” link label rather than making a blank cell the
only link target.

Sort options and exact behavior:

1. Oldest published (default): non-null `publishedAt` ascending; unknown last.
2. Newest published: non-null `publishedAt` descending; unknown last.
3. First seen by BNOW: `firstSeenAt` ascending; malformed/unknown last.
4. Reliability: non-null score descending; unknown last.
5. Source/channel: case-insensitive human label ascending.

Every comparator then ties by first-seen time, human label, and `docId` as needed to
remain deterministic. Sorting must not mutate the prop array.

The native select needs a visible label. The disclosure summary and sort control
must be keyboard-operable without custom key handlers. Do not add a modal.

### Claim copy actions

Add `ClaimCopyActions` beside each rendered claim, not inside each source row. It
should:

- expose a real primary `type="button"` labeled “Copy for report”;
- expose report/link/evidence/text variants through a compact native disclosure or
  equally accessible small action group; do not invent a custom untested menu;
- construct all content through the pure copy model and the server-provided
  canonical URL, never from `window.location` or selected DOM text;
- use `ClipboardItem` for equivalent `text/html` + `text/plain` report/evidence
  writes when supported and `navigator.clipboard.writeText` as fallback;
- report mode-specific success (“Report copied”, “Link copied”, “Evidence copied”,
  “Text copied”) through one small `aria-live="polite"` status;
- report a non-destructive failure state if the Clipboard API is absent/rejected;
- prevent duplicate writes while one clipboard promise is pending;
- retain the surrounding claim's existing anchor and scroll-margin behavior;
- keep the action itself screen-only in print.

Do not add a claim route. The existing digest anchor is the canonical share target.
The action component is shared unchanged across the five surfaces; only payload,
surface, score policy, and localized labels differ.

### Digest print actions

Add `DigestPrintActions` near the digest title with “Print brief” and “Print with
evidence” modes. The client leaf:

- applies a stable `data-print-page="digest"` marker while the digest component is
  mounted so native Ctrl/Cmd+P receives the digest print stylesheet;
- applies `data-print-mode="brief" | "evidence"` to the document root;
- invokes `window.print()` only after that state is visible to print media;
- removes the attribute on `afterprint`, component unmount, and synchronous print
  failure;
- never claims printing completed or a PDF was saved, because the browser dialog's
  outcome is unknowable;
- does not intercept native Ctrl/Cmd+P, which sees the page marker and renders the
  default brief mode because no evidence-mode attribute is present.

The server page renders one print-only metadata header and one print-only evidence
appendix container using the already-loaded claim/evidence DTOs. The appendix is
shown only for `data-print-mode="evidence"`; the screen disclosure remains the one
interactive evidence trail. Avoid fetching again for print and avoid duplicating
claim/source content into client state.

The `@media print` rules must use explicit `data-print="hide"`,
`data-print="claim"`, `data-print="event"`, `data-print="appendix"`, and related
semantic markers rather than broad selectors that could accidentally hide legal
documents or other routes. Add a conservative root-level rule for the shared site
header/footer only when `data-print-page="digest"` is present.

## Query changes

### Digest page

In `src/app/digests/[country]/[date]/page.tsx`, extend the existing claim/document
SELECT with:

```sql
s.name AS source_name,
s.domain AS source_domain,
rd.published_at::text AS published_at,
rd.fetched_at::text AS fetched_at
```

The page currently selects
`COALESCE(rd.published_at, rd.fetched_at)::text AS doc_at` and maps it into a field
named `publishedAt`. Stop doing that.

Event ranking may retain a separately named publish-or-fetch fallback (for example
`rank_at`) so this UI change does not silently alter profile ranking. It must never
flow into the evidence DTO’s `publishedAt`. Alternatively calculate ranking time as
`published_at ?? fetched_at` in the server grouping loop and name the variable
accordingly.

Render the shared `ClaimCopyActions` at the claim `<li>`. Prepare each payload from
claim text/hedging, country name/iso2, digest date, canonical `siteBaseUrl()` claim
URL, and the complete evidence DTO. Keep claim/entity rendering, publication-safety
output, ranking, and the page’s three parallel query groups otherwise unchanged.

Extend the digest header row with the timestamp/stage data required by the
print-only header (reuse existing `status`; select the persisted generation time
that truthfully describes the rendered digest). Keep provider/model visible on
screen under current behavior but mark it print-hidden. Add semantic print markers
to navigation, buyer profiles, event/claim blocks, source summaries, feedback, and
the complete print-only evidence appendix. No print path may query the database a
second time.

### Signals page

Make the same source/timestamp selections in the accepted-user-only evidence query.
Update `SignalEvidenceRow` and `groupEvidenceRows()` to fill the expanded DTO.

The evidence query must remain inside `if (accepted)`. The rendering branch must
remain keyed to `accepted`, not merely `signedIn`. Query failure should continue to
degrade to count/detail without a full-page crash.

Also join the owning digest/country fields needed for canonical claim URLs. Render
`ClaimCopyActions surface="signal"` only inside the accepted evidence branch and
only for claims with a real owning digest. Anonymous/unaccepted HTML must contain
neither the copy payload nor client props that would serialize its content.

### Search page

Keep `lexicalClaimSearch()` unchanged in this branch. It is shared with the paid Ask
retrieval path and does not need to know about presentation evidence.

While the page’s existing Neon `Pool` remains open:

1. run the current lexical count and result queries;
2. if and only if there are result rows, issue one additional bulk evidence SELECT
   with `WHERE cl.id = ANY($1::int[])` for all displayed result ids;
3. group the rows into `Map<claimId, ClaimSourceDoc[]>`;
4. close the pool in the existing `finally` block.

The bulk query should also select the owning `digests.digest_date`. Use that value
for `/digests/{iso2}/{digest_date}#c{id}` rather than assuming
`claim_date == digest_date`. This fixes the `/search` half of OPEN-TASKS #54. The
Ask change below fixes the remaining half in the same branch; close #54 only after
both paths are tested and the integration/documentation owner records the shipped
result.

Do not issue one query per result. Expected SQL count for a non-empty search is
three calls total: uncapped count, capped lexical page, one evidence batch. Empty
query makes zero calls; zero-result search makes only the existing lexical calls.
No search path may import or call SpendGuard, embeddings, reranking, an LLM/provider,
or usage persistence.

Render `ClaimSources` below each search claim. Keep the direct digest deep link as a
separate action; the trail’s original-document links do not replace it.
Render `ClaimCopyActions surface="search"` from the same bulk DTO; do not add a
second copy-specific query.

### Ask cited and related claims

Keep the paid pipeline boundary exactly as it is: GET only prefills; the Server
Action executes once on explicit submit; short questions never call the pipeline.
After `askWithLimits()` returns, retain one resolver query for the union of cited
and related claim ids, but extend/group that one query so each `ResolvedClaim`
carries:

- text and hedging;
- country iso2/name;
- owning `digests.digest_date` (not `claim_date` as a substitute);
- complete evidence DTO rows with separate Published/First seen fields.

Joining claim sources repeats claim columns, so group by claim id before restoring
the model's cited/related order. Do not run a resolver query per claim or a second
evidence query per list. The query remains after the paid call and must not cause
re-execution, additional usage rows, or a second provider charge.

Evolve `ResolvedClaim` defensively and render the existing cited/related lists with
the shared evidence trail plus `ClaimCopyActions surface="ask_cited"` or
`"ask_related"`. Do not add a “copy whole Ask answer” feature in this branch: the
answer's inline `[c<ID>]` markers need a separate citation-aware export design.
Insufficient/refused/error/limit results with no claim rows get no copy actions.

This resolver must use the owning digest date for both the existing digest link and
the canonical copy URL, completing OPEN-TASKS #54 together with Search.

### Entity timeline

Bring the previously deferred entity slice into this branch so all final-claim
surfaces share one handoff contract. Preserve the existing 50-claim cap, entity
layout/legal gate, stub exclusion, sanctions badge behavior, and identity-
fragmentation caveat.

The current claim and relationship queries may remain parallel. After the capped
claim list resolves, issue at most one bulk evidence SELECT for all displayed claim
ids, selecting owning digest date/country plus the expanded evidence DTO. Group it
in memory; zero claims make no evidence query. Do not extend the relationship query
or create N+1 claim queries.

Deep-link the existing digest action to `#c<claimId>` using owning digest date,
render the shared trail and `ClaimCopyActions surface="entity"`, and add the already
planned “Search all claims for <entity display name>” link. The link is convenience,
not a claim that canonicalization has captured every alias.

## i18n

Add authoritative English keys for:

- full-set document/channel/platform summary;
- earliest published, first seen by BNOW, and unknown;
- view evidence trail;
- sort label and the five options;
- six table columns;
- untitled/open-source-document fallback;
- copy-for-report primary action;
- copy link, copy with evidence, and copy text only;
- report/link/evidence/text copied statuses and copy failure;
- Status, As of, Evidence, Source, and linked document/channel/platform labels used
  in copy payloads;
- Print / Save PDF, Print brief, Print with evidence, selected-evidence disclosure,
  evidence-appendix heading, print metadata labels, and print failure.

Use the existing interpolation token names (`docs`, `channels`, `platforms`, `n`) so
`src/i18n/i18n.test.ts` needs no new blanket-test fixture tokens. Add Ukrainian
translations marked for native review; other complete catalogs may fall back to
English for these new keys rather than accepting machine-authored translations.
Source data itself remains untranslated.

Copy payload labels follow the active locale, but claim/source data remains in its
stored language. HTML and plain-text variants must use the same localized labels.
Do not hard-code English inside the client copy/print components.

The current flat interpolation system cannot perform Ukrainian plural selection
(OPEN-TASKS #50). Do not expand scope into a pluralization engine. Use the same
least-wrong compact count pattern already accepted for `sources.more_summary`, and
record the new keys in the native-review note during documentation closeout.

## Implementation sequence and commits

Keep the branch bisectable. Suggested commits:

1. `feat: add evidence trail model and client disclosure`
   - expanded DTO, pure summary/sort/label logic, server wrapper, client trail;
   - component/model tests and English/Ukrainian chrome.
2. `feat: add reusable analyst copy payloads`
   - pure rich/plain report/link/evidence/text builders;
   - shared clipboard action leaf, capability fallback, accessibility, and tests.
3. `feat: add digest copy and print-ready briefs`
   - digest query/map/canonical URL changes and copy actions;
   - print metadata, brief/evidence modes, appendix, print CSS, and browser tests.
4. `feat: add evidence handoff to search and ask`
   - Search's one evidence query, exact digest date, trail/copy actions;
   - Ask's one grouped cited+related resolver, exact digest date, trail/copy actions;
   - money-path and query-count regression tests.
5. `feat: reuse evidence handoff on signals and entities`
   - accepted-only Signal query/type/copy mapping and no-leak coverage;
   - capped entity timeline evidence batch, deep links, Search link, and page tests.
6. `test: verify analyst copy and print workflow`
   - cross-surface payload equivalence, Clipboard API fallback, print-media DOM/PDF
     assertions, accessibility, narrow-screen, and final full gate.

If the shared component commit temporarily breaks its current consumers, combine
commits 1 and 2 rather than checking in a red intermediate state. Do not use a
format-all command that rewrites unrelated files.

After this branch merges and is verified, the separate PostHog branch adds
`claim_copied` and `digest_print_initiated` to its typed event contract and wires
the already-stable action success/mode boundaries. That is not a commit in this
branch.

## Test plan

### Pure model tests

Cover:

- counts use all raw document edges;
- channel/platform counts use the established identity rules;
- source-name fallback order;
- earliest published ignores nulls and never falls back to first-seen;
- earliest first-seen is independent of published time;
- all five sort modes, null-last rules, tie-break determinism, and immutability;
- current diverse-chip behavior at 8 vs 9 documents and same-channel repeats.

For the copy model, cover:

- exact plain and HTML **Copy for report** payloads;
- HTML escaping of claim/source strings without changing plain text;
- mandatory status/date/evidence/BNOW attribution in report and evidence modes;
- canonical `https://bnow.net/digests/<iso2>/<date>#c<id>` URL with no profile,
  query, localhost, Preview, deployment, or auth material;
- **Copy with evidence** contains every attached document exactly once in
  deterministic trail order, uses full external URLs, and preserves Unknown
  Published separately from First seen;
- `showScores=false` removes reliability from evidence copy;
- **Copy text only** contains exactly the claim sentence;
- report copy excludes provider/model, raw document ids, confidence implementation
  metadata, entity roles, and hidden UI labels;
- missing owning digest metadata disables citation-bearing modes rather than
  fabricating an as-of date or URL.

### Component tests

With Testing Library + user-event:

- one document still gets a trail disclosure;
- the summary uses full-set counts;
- the trail includes every document, not only the hidden remainder;
- default order is oldest published and changing the native select reorders rows;
- unknown Published renders explicitly as Unknown beside a real First seen time;
- human source name is primary and canonical URL is only fallback/link metadata;
- `showScores=false` omits reliability values/column;
- external links retain target/rel and missing URLs do not become `#` links;
- long names/titles/table stay horizontally contained at narrow widths;
- details, select, table headers, and status messages have accessible names.

### Copy tests

Mock Clipboard APIs and assert:

- primary report action writes equivalent `text/plain` and `text/html` payloads;
- browsers without `ClipboardItem` fall back to the exact plain payload through
  `writeText`;
- link/evidence/text modes call the correct pure builder once;
- mode-specific success is announced only after the promise resolves;
- buttons prevent duplicate writes while pending and re-enable afterward;
- missing/rejected clipboard announces failure without throwing or deleting page
  content;
- all variants are keyboard reachable and the compact disclosure/action group has
  an accessible name;
- the digest anchor id and scroll-margin regression test remains green.

### Print tests

Mock `window.print` and `afterprint` and assert:

- brief/evidence actions set the correct semantic mode before invoking print;
- the attribute is removed after `afterprint`, unmount, and synchronous failure;
- print failure is accessible and non-destructive;
- print-only metadata and appendix markup are server-rendered from the same DTOs;
- evidence appendix mode contains every attached document and brief mode contains
  the selected-evidence disclosure instead;
- explicit print-hide markers cover nav, profiles, provider names, feedback, copy,
  sort, and interactive disclosures;
- long source names/full URLs use print wrapping rather than screen truncation;
- CSS defines light colors, useful page margins, heading/claim break rules, and an
  escape hatch for blocks taller than a page.

### Page/query tests

- Digest mock rows carry separate `published_at` and `fetched_at`; rendered output
  proves they are not conflated.
- Search’s non-empty result path makes one bulk evidence query for all result ids,
  never N queries, and closes the pool.
- Search still proves every paid Ask dependency is untouched.
- Search links use owning digest date from the evidence batch.
- No-query search makes no DB calls; zero-result search makes no evidence call.
- Ask preserves exactly one `askWithLimits` execution and one resolver query for the
  cited+related union; multiple evidence rows group without duplicating claims or
  changing model order.
- Ask's short/no-question paths remain zero-provider/zero-resolver; no-result states
  render no copy actions.
- Ask links/copy payloads use owning digest date and close its half of OPEN-TASKS
  #54 without changing the GET/action billing boundary.
- Anonymous `/signals` makes no evidence SELECT and leaks no claim/source/title/URL.
- Signed-in-but-unaccepted `/signals` has the same no-leak behavior.
- Accepted `/signals` renders the trail but still hides reliability because its
  current `showScores` policy is false.
- Evidence-query failure on `/signals` preserves the existing graceful degradation.
- Entity timeline retains the 50-claim cap, makes at most one evidence batch after
  the capped list, makes no evidence query for zero claims, preserves stub
  exclusions, and uses owning digest dates/anchors.
- Copy payloads appear on all five accepted/authorized surfaces with the correct
  surface mode but never serialize into unauthorized Signal HTML.

### Required gate

Run from the isolated worktree:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The repository’s pre-push hook mirrors typecheck + lint + unit tests. Build is added
here because the Server/Client serialization boundary is a feature-specific risk.
No integration database suite is required unless the agent introduces a shared SQL
helper or changes schema/query semantics beyond the specified SELECT columns.

Then run a visual browser check against a local dev server at desktop and ~390px:

- a one-source claim;
- a claim with more than eight documents;
- a document with unknown publication time;
- each sort option;
- all four copy modes plus success/failure/pending state;
- a non-empty search page with several result trails;
- an Ask answer with cited and related claims, proving one paid execution;
- an entity timeline with several claim trails;
- `/signals` accepted and anonymous/unaccepted states;
- digest Print brief and Print with evidence at Letter and A4.

Generate both digest PDFs with Chromium and inspect screenshots plus extracted PDF
text. The brief must exclude site chrome, buyer profiles, provider strings, feedback,
and closed-disclosure UI; it must include status/date/attribution and the selected-
evidence statement. The evidence PDF must contain a known hidden source from a
greater-than-eight-document claim, proving the appendix is complete. Inspect page
boundaries for orphan headings, ordinary split claim cards, clipped URLs, dark
backgrounds, and blank/overflow pages.

For clipboard output, paste the captured rich payload into a local contenteditable
fixture and the plain payload into a textarea. Verify readable spacing, working
hyperlinks in rich output, no concatenated badge/entity/source-chip text, and
equivalent factual content. Actual Word/Google Docs/PowerPoint acceptance belongs to
the first design-partner smoke after deploy, not an automated external write in this
branch.

Check the browser console for hydration/serialization errors. A client component
receiving the server `t()` function is an automatic failure.

## Acceptance criteria

The bundle is done only when all are true:

1. Every digest claim with evidence shows full-set counts, earliest provider time,
   earliest BNOW first-seen time, human source labels, and a complete trail.
2. A null provider publication timestamp is visibly Unknown and is never populated
   with `fetched_at`.
3. The complete trail contains exactly the attached `claim_sources` document set and
   defaults to oldest provider publication time with unknowns last.
4. All five local sort modes are deterministic and require no request/API call.
5. Every eligible claim on digest, Ask cited/related, Search, accepted Signal
   evidence, and entity timeline surfaces exposes the same four copy modes.
6. Copy for report produces equivalent rich/plain content with claim, mandatory
   status, digest date, honest evidence counts, BNOW attribution, and canonical
   anchor URL; it contains no internal/UI-only data.
7. Copy link, evidence, and text variants match their exact contracts; all clipboard
   modes have accessible pending/success/failure behavior and graceful fallback.
8. `/search` uses one evidence batch for the displayed page, makes no paid call, and
   links to the owning digest date.
9. Ask executes the paid pipeline once, resolves cited+related evidence in one query,
   preserves order, and uses owning digest dates.
10. `/signals` anonymous and unaccepted HTML remains evidence-free; accepted evidence
    continues to render under its existing policy.
11. Entity evidence stays capped, bulk-loaded, gated, stub-free, and honest about
    identity fragmentation.
12. Print brief and evidence modes produce readable Letter/A4 PDFs with intentional
    metadata, attribution, page breaks, and evidence scope; prohibited chrome and
    provider internals do not print, and the evidence appendix includes every
    attached document.
13. No analytics/PostHog, database/schema/env/provider/deployment change exists in
    the branch.
14. Typecheck, lint, unit tests, build, and the targeted browser/PDF pass are green.
15. The branch touches only its declared ownership set plus expected new files.

## Explicitly deferred

- semantic recall beyond `claim_sources`;
- entity graph/canonicalization changes;
- raw-document browser;
- digest-wide evidence dashboard/index;
- CSV/export/bulk enumeration;
- server-generated PDF, DOCX, PPTX, or file-download endpoints;
- copy-as-image/slide-card rendering;
- saved claim collections or a brief builder;
- copying an entire Ask answer with resolved inline citations;
- server-side sort parameters or API endpoints;
- reliability methodology changes;
- source-independence inference;
- navigation promotion for `/search`;
- print/export controls on Ask, Search, Signals, or entity pages beyond per-claim
  clipboard actions;
- PostHog provider/consent/legal/env work and the two copy/print event call sites;
- deployment and production data checks.

## Required follow-on: PostHog instrumentation

After this branch merges and the copy/print behavior is verified, create the PostHog
worktree from the new main and execute
`docs/prompts/2026-07-14-posthog-product-analytics.md`. Add the two events specified
in this plan to that workstream's approved typed event table, tests, privacy
allowlist, and dashboards.

The analytics agent may edit `claim-copy-actions.tsx` and
`digest-print-actions.tsx` only to call the merged BNOW analytics abstraction at the
success/initiation boundaries. It must not alter payload text, copy modes, print
modes, query behavior, or acceptance semantics. Update the private-beta dashboard
with copy-mode adoption and print initiation trends; do not mislabel print
initiation as PDF creation or successful printing.

## Coding-agent handoff prompt

Implement the “Outcome” in this document on the isolated
`codex/analyst-evidence-trail` worktree. Treat every “Non-negotiable product
semantics,” query boundary, security boundary, acceptance criterion, and explicit
deferral above as binding. Read `AGENTS.md`, this plan, the source review, and
`docs/TIME-MODEL.md` before editing. Do not edit or commit from the primary dirty
worktree. Do not alter schema, migrations, ingestion, LLM/provider paths, spending
guards, analytics/PostHog files, privacy/legal versions, environment variables, or
deployment state. Preserve the `/signals` accepted-user evidence gate at both query
and rendering layers. Keep pages as Server Components and preserve Ask's one-submit
Server Action money boundary; place only local sorting, clipboard behavior, and
print-mode state in client leaves, and pass serializable translated labels rather
than `t()` functions. Implement the shared evidence/copy contract on digest, Ask
cited/related, Search, accepted Signal evidence, and entity timelines; implement
digest brief/evidence print modes without a PDF service. Run the full gate and
targeted browser/clipboard/PDF matrix, then report changed files, exact query count
behavior, Ask charge-count evidence, security/no-leak evidence, print exclusions and
appendix completeness, test/build results, and remaining deferred items. Do not add
analytics call sites, merge, or deploy.
