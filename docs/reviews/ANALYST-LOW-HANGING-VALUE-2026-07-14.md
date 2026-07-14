# Low-hanging analyst value — 2026-07-14

Status: product/code-path review only. No application code, database data, schema,
environment, provider call, or deployment changed.

## Conclusion

The strongest small improvement is not a new feature family. It is turning the
existing per-claim citation disclosure into an **evidence trail**: source identity,
publication time, BNOW first-seen time, provenance counts, and a sortable complete
list. The application already queries and server-renders every supporting document
for every digest claim, so this needs no new ingestion, LLM, database table, or API.

The next two small extensions should reuse the same evidence presentation in free
claim search and entity timelines. Together, these changes would make the current
corpus feel investigable without attempting a general knowledge graph or raw-document
browser.

## What exists now

For every final digest claim, the digest query joins:

```text
claim → claim_sources → raw_documents → sources
```

`ClaimSources` receives the complete supporting-document set. Its current behavior:

- eight or fewer documents: render every document as a compact chip;
- more than eight: select six diverse source/channel chips and place every remaining
  document behind a native disclosure;
- choose the visible sources by platform diversity, reliability, then earliest
  source time;
- link every chip to the original external URL.

This means “show all sources” is largely already built. The hidden remainder is not
lazy-loaded or discarded. The analyst problem is that the expanded result remains a
pile of URL-like chips with no visible timestamps and no sorting.

The “complete” set here means every raw document attached to the final claim by
`claim_sources`. It does not mean every semantically similar document anywhere in the
46K-item Russia corpus. Broader recall belongs to search/retrieval, not the claim's
provenance list.

## Measured opportunity

Production SELECT-only snapshot over digest claims from the last 14 days:

| Measure | Result |
|---|---:|
| Final claims | 920 |
| Claim-to-document citation edges | 2,379 |
| Average documents per claim | 2.59 |
| Median / p75 / p90 documents | 1 / 3 / 6 |
| Maximum documents on one claim | 34 |
| Claims with 1 document | 523 (56.8%) |
| Claims with 2–4 documents | 276 (30.0%) |
| Claims with 5–8 documents | 72 (7.8%) |
| Claims with more than 8 | 49 (5.3%) |
| Claims with at least 2 linked channels | 278 (30.2%) |
| Claims with at least 2 platforms | 210 (22.8%) |
| Citation edges with provider publish time | 2,267 (95.3%) |
| Citation edges with a non-empty title | 832 (35.0%) |

Among multi-source claims, the median span from earliest to latest provider
publication was 3.25 hours; p90 was 14.11 hours. The median delay from provider
publication to BNOW ingestion was 0.83 hours. P90 was 64.63 hours, strongly affected
by historical backfills/outages. This makes the distinction between “published” and
“first seen by BNOW” analytically important.

## Recommended first slice: Claim evidence v2

Keep the digest readable. Under each claim, replace the current evidence-chip strip
with two progressive layers.

### Scannable summary

Example:

```text
12 reports · 8 channels · 3 platforms
earliest in BNOW: Jul 13, 9:14 AM ET · first seen: 9:18 AM ET
[six diverse source chips]  [View evidence trail (12)]
```

Use “earliest in BNOW,” not “original source”: the earliest item in BNOW's set is not
proof that it originated the information.

For one-document claims, the same line still adds value: source name, platform,
publication time, first-seen time, and reliability can be understood without hovering
over a cryptic URL.

### Complete sortable evidence trail

The existing disclosure can render a compact table/list containing every attached
document:

| Field | Why it matters |
|---|---|
| Published | Provider/source-declared publication time |
| First seen | Immutable BNOW ingestion time; reveals late backfill |
| Source | Human-readable source name/handle, with domain fallback |
| Platform | X, Telegram, RSS/news, GDELT, etc. |
| Reliability | Existing score where the current role permits it |
| Title | Show when present; only 35% coverage, so never make it the identity |
| Link | Open the original evidence in a new tab |

Sort choices:

- oldest published (default);
- newest published;
- first seen by BNOW;
- reliability;
- source/channel.

Unknown provider publication time should be explicit, with first-seen time as the
fallback. Display ET consistently with the application, and offer the exact UTC value
in a tooltip or accessible label.

The query currently computes one `doc_at` value as
`COALESCE(published_at, fetched_at)` and passes it to a field named `publishedAt`.
That is adequate for ranking but loses provenance semantics. Claim evidence v2 should
select and carry both columns separately.

### Why this is low-hanging

- all supporting document ids and URLs are already queried;
- source platform, canonical URL, and reliability are already queried;
- source name and both timestamps already exist in the joined tables;
- all hidden sources are already present in the rendered page;
- no schema, migration, LLM, embedding, background job, or external API is needed;
- the largest recent set was 34 documents, so client-side sorting is bounded;
- the shared component already serves digests and signed-in signal evidence.

Relative effort: **small**, concentrated in the shared evidence component, the two
existing evidence queries, tests, and i18n copy.

## Other small, high-value extensions

### 1. Make individual claims shareable — extra small

Every digest claim already has a stable `#c<claimId>` anchor because Ask citations
deep-link to it. Add a visible “copy claim link” affordance. This lets an analyst send
another analyst directly to the claim and its evidence trail without designing a new
object/page.

No data work is required.

### 2. Put evidence on free claim-search results — small

`/search` already performs deterministic, $0 lexical search over final claims and
links each result back to its digest. It currently shows no citation count or source
trail.

For each result, show:

- document / distinct-channel / platform counts;
- earliest publication and first-seen times;
- the same expandable `ClaimSources` evidence trail.

Use one bulk evidence query for the returned claim ids, not one query per result.
This turns search from a claim locator into a lightweight research interface while
remaining restricted to traceable final claims. No new retrieval system is needed.

### 3. Add source trails to entity timelines — small

Entity pages already list up to 50 linked final claims in date order. They link back
to the digest but do not show the sources supporting each claim. Reuse the same
evidence summary/disclosure below each timeline item and add a “search all claims for
this name” link to the existing free search.

This makes major-player pages more useful immediately without claiming that BNOW has
a complete relationship graph. Entity-name fragmentation remains a known limitation;
the interface should not aggregate spelling variants until canonicalization improves.

### 4. Expose corroboration honestly — extra small

Add plain counts such as:

```text
9 documents · 6 distinct channels · 3 platforms
```

Do not label these channels “independent sources.” Distinct registry channels and
platforms are measurable; editorial or organizational independence is not yet proven.
This summary can appear even when there is no need for a collapsed source list.

### 5. Add a digest-wide evidence index — medium; defer

A separate “evidence index” for one digest could union all its claim sources and sort
them by time, source, event, or platform. It would be valuable for an analyst reviewing
the day's reporting flow, but it introduces another page/state model and duplicate
handling. Build it only after observing whether analysts use the per-claim trail and
search evidence.

### 6. Evidence export — medium; defer until requested

A CSV export of claim text, source URL, publish time, first-seen time, platform, and
reliability could help professional workflows. It also creates product, access,
escaping, and bulk-enumeration decisions. Do not build it merely because the data is
available; ask beta analysts whether copy links and sortable in-page evidence are
insufficient.

## Recommended order

1. **Claim evidence v2:** summary + separate timestamps + full sortable trail.
2. **Visible copy-link for each claim.**
3. **Reuse the trail in `/search`.**
4. **Reuse it in entity timelines**, after acknowledging identity fragmentation.
5. Observe analyst behavior before building a digest evidence index, exports, or a
   general graph.

This is a coherent small slice: it makes BNOW's existing traceability legible rather
than increasing the quantity of generated analysis.

## Handoff boundary

Implementing any item above is application coding and is outside this agent's role.
If the operator selects a slice, the next step is a separate comprehensive engineering
handoff covering exact files, query shapes, accessibility, i18n, tests, and acceptance
criteria. Do not begin implementation without that selection.
