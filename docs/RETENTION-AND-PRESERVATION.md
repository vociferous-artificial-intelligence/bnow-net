# Retention and preservation policy

**What this document is.** A statement of what BNOW.NET keeps, for how long, what it
deliberately does not keep, and where preservation is weaker than a reader might assume. It
exists because ICD 206 requires that the sources behind a disseminated analytic product remain
retrievable, and ICS 206-01 (2024-12-02) puts a floor under that: **dynamic sources that
informed a conclusion are preserved for at least one year from the product's issuance.** BNOW
met that floor by accident of design — nothing ever deleted a source document — and this
document turns the accident into a policy that can be quoted to a buyer and a test that fails
if the property lapses.

Companion document: `docs/METHODOLOGY-TRADECRAFT.md`, the requirement-by-requirement crosswalk
against ICD 203 / ICD 206 / ICS 206-01 / ICD 208. This document is what its two preservation
rows point at.

This document covers **source and product data**. Retention of *user* data — accounts, Ask
questions and answers, analytics events — is a separate matter governed by the Privacy Notice
(`src/app/privacy/page.tsx` §9), which sets fixed automatic windows for Ask content (≤30 days),
stream and progress events (≤7 days) and the exact-answer cache (≤7 days). Those sweeps
(`src/lib/ask/retention.ts:58`) touch Ask surfaces only and never reach `raw_documents`,
`claims`, `claim_sources` or `doc_claims`.

---

## 1. What is retained

### 1.1 Source documents — `raw_documents` (`src/db/schema.ts:178-212`)

One row per ingested document, from every live adapter. The columns that carry the citation and
preservation payload:

| Column | Line | What it holds |
|---|---|---|
| `adapter` | `:182` | which ingestion path produced the row (`rss`, `gdelt`, `telegram_web`, `telegram_mtproto`, `x_api`, `procurement`) |
| `source_id` / `external_id` | `:183-184` | the registry source, and the platform's own identifier where one exists |
| `url` | `:185` | the source URL — the citation's locator |
| `title` | `:186` | the document title where the source supplies one |
| `content` | `:187` | the retrieved body text, stored, not merely hashed (see §3.2 for its cap) |
| `content_hash` | `:188` | the dedup key (see the caveat in §3.2 — it is **not** an integrity seal) |
| `lang` | `:189` | detected language |
| `country_iso2` | `:190` | primary theater tag |
| `published_at` | `:191` | the source's own publication timestamp, where the source supplies one |
| `fetched_at` | `:192` | when BNOW retrieved it — the **access date** in ICS 206-01 terms |

`content` is a stored body, not a pointer. That is the property that makes preservation real: if
the origin page is edited, paywalled, geo-blocked or deleted, the text BNOW analysed is still
in the row, alongside the URL and the timestamps needed to say what it was and when it was
retrieved.

### 1.2 The claim-to-document link — `claim_sources` (`src/db/schema.ts:291-305`)

Every published claim is joined to at least one `raw_documents` row. This is standing ruling 2
and it is enforced by the database, not by convention: `drizzle/9999_claim_source_trigger.sql`
installs a `DEFERRABLE INITIALLY DEFERRED` constraint trigger that raises and rolls the whole
transaction back if a claim reaches commit with no source link.

Two facts about this table matter for preservation specifically:

- The foreign key to `raw_documents` is declared **`ON DELETE no action`**
  (`drizzle/0000_superb_ultimates.sql`, constraint
  `claim_sources_raw_document_id_raw_documents_id_fk`). A cited document therefore cannot be
  removed by a cascade from anywhere: any attempt to delete it raises a foreign-key violation
  while a citation exists. This is preservation enforced by a constraint, not by a policy
  sentence — and it is the reason §3.1's regeneration caveat is about *claims*, never about
  *documents*.
- The reverse link (`claim_id`) **is** `ON DELETE cascade`, which is exactly what §3.1
  describes.

### 1.3 What is retained per platform

- **RSS** (`src/lib/adapters/rss.ts:19`) — the feed item's content snippet, content or title,
  trimmed and capped at 8,000 characters, with the item URL and publication date.
- **Telegram, web preview** (`src/lib/adapters/telegram-web.ts:29`) — the message text as it
  appears in the public `t.me/s/<channel>` preview, capped at 8,000 characters. See §3.3.
- **Telegram, MTProto** (`src/lib/adapters/telegram-mtproto.ts:131`) — the message text from the
  protocol client, capped at 8,000 characters.
- **X** (`src/lib/adapters/x-api.ts:163`) — the post text, capped at 8,000 characters, retrieved
  through the third-party `api.twitterapi.io` service rather than the official developer API
  (`src/lib/adapters/x-api.ts:1-2`). See §3.4.
- **GDELT** (`src/lib/adapters/gdelt.ts`) — article metadata and language from the GDELT slice.
- **Procurement** (`src/lib/adapters/procurement.ts:36-37`) — tender subject and customer, capped
  at 4,000 characters. Currently proxy-blocked in production.

### 1.4 The reference corpus — `isw_reports` and `source_citations`

For each expert report BNOW benchmarks against, it retains the report **URL**, theater, report
date, title, fetch timestamp, parse status and the endnote and citation counts
(`src/db/schema.ts:133-153`), plus one `source_citations` row per endnote carrying the cited
**raw URL**, the endnote index, the hedging classification, and a short matched cue phrase
(`src/db/schema.ts:155-176`). See §2 for what is deliberately excluded from that list.

### 1.5 Products — `digests`, `claims`, `events`, `validation_runs`

Digests are retained per country, date and track with their structured statistics and provider
tag (`src/db/schema.ts:237-255`) and are addressable at a stable archive URL. Validation runs —
the daily comparison against the expert benchmark — are retained with coverage,
unsupported-claim rate, timeliness and the itemized divergence list
(`src/db/schema.ts:307-325`). See §3.1 for what regeneration replaces.

## 2. What is NOT retained

**Expert-report prose and source full text are never stored as product content and never
rendered.** This is standing ruling 1, and for the reference corpus it is visible in the schema
itself: `isw_reports.derived` is annotated *"derived-only data (event/claim skeleton for
validation); NEVER report prose"* (`src/db/schema.ts:147`), and `source_citations.hedging_cue`
is annotated *"short matched cue phrase only (e.g. `reportedly`), never sentence-length ISW
prose"* (`src/db/schema.ts:169`). What is kept of an expert report is its URL, its endnote
citation URLs, endnote indices, hedging classifications and short cue phrases, plus counts and
verdicts. Report text may pass through an analysis prompt transiently; only the verdict
persists.

Note the asymmetry, because it is deliberate and a reader should not be surprised by it:
**BNOW retains the body of the primary sources it ingests, and does not retain the body of the
expert product it benchmarks against.** The first is the evidence behind our own claims and must
survive; the second is a third party's copyrighted analysis, which we cite and score but never
republish.

Also not retained: no raw connection IP for analytics (only a coarse derived location, per the
Privacy Notice), and no credentials, payment details or authentication material in any source
row.

## 3. For how long — and the four caveats that keep this honest

**The policy.** Source documents in `raw_documents` are retained **indefinitely**, and in no
case for less than **one year from the issuance of any product that cites them** — the ICS
206-01 floor. There is no expiry job, no archival tier and no scheduled purge. The mechanism is
absence plus enforcement: no production code path deletes a source document, and the
`claim_sources` foreign key makes deleting a cited one an error rather than a policy breach.

**The inventory, verified.** Across `src/` and `scripts/` at the base commit of this document
there are exactly **twelve** statements that delete from `raw_documents`, in **eleven** files:

- `scripts/cleanup-stub-data.ts:60` — the only non-test deleter anywhere. It is a
  truth-in-UI (ruling 3) cleanup, not a retention decision: it runs inside a transaction and is
  guarded by `STUB_LIKE`, so it removes only fixture rows that must never render as fact. It is
  a manual operator script and is on no schedule.
- **11** `*.itest.ts` files — `ask-events`, `authz-page-gate`, `conflict-db-claim-sources`,
  `conflict-feature-off`, `conflict-live-observation`, `enrich-rescore`, `hardening`,
  `map-batch-error-classification` (×2), `map-budget-stop` (×2), `map-flood-bounds`,
  `map-remap` — all seed teardown on **disposable Neon fork branches** that are created and
  deleted per run. They never touch production data.

There is **no** `.delete(rawDocuments)` anywhere, no `TRUNCATE`, and no `DELETE` of any row in
any migration under `drizzle/` (the only `DELETE` tokens there are `ON DELETE` foreign-key
clauses, and `src/db/migrations.test.ts:74,101` already bans destructive statements per
migration). `src/lib/ingest/` contains no deletion and no archival step at all — only
`config.ts`, `run.ts` and `theater.ts`.

This inventory is asserted, not just recorded: **`src/lib/ingest/no-delete.test.ts`** scans every
`.ts`/`.tsx` file under `src/` and `scripts/` for a `raw_documents` deletion, with the two
exemptions above allowed **by path and named individually**, so adding a tenth deleter fails the
pre-push gate until someone acknowledges it in the test.

### 3.1 Caveat — published claims ARE replaced on regeneration

A digest can be regenerated, and regeneration is destructive to claim rows. The shared persist
boundary runs `DELETE FROM claims WHERE digest_id = $1`
(`src/lib/analysis/digest-persist.ts:177`) followed by a track-scoped sweep of the events left
without claims (`:181-185`), then re-inserts. Claims therefore get **fresh ids on every
regeneration**, which the schema records at `src/db/schema.ts:1057-1060`: the per-claim
embedding store cascade-deletes on `claim_id` and is re-filled by the persist hook for exactly
this reason. A digest day is regenerated on the order of eight times
(`src/db/schema.ts:959`).

**What this means for a citation.** The *evidence* is preserved — `raw_documents` is never
touched by any of this, and the `ON DELETE no action` foreign key in §1.2 prevents it from being
touched — but a **claim row id is not a stable identifier across regeneration**. A citation
BNOW emits preserves the *document*, not the claim row. Anyone building a durable reference
should cite the document URL, hash and fetch date, not an internal claim id.

### 3.2 Caveat — `content_hash` is a dedup key over a prefix, not an integrity seal

`content_hash` is computed over
`adapter | external_id-or-url | title | content.slice(0, 4000)`
(`src/lib/ingest/run.ts:29-33`) while `raw_documents.content` stores up to **8,000** characters
for the Telegram, RSS and X adapters (`telegram-web.ts:29`, `rss.ts:19`, `x-api.ts:163`,
`telegram-mtproto.ts:131`). Insertion is `ON CONFLICT (content_hash) DO NOTHING`
(`src/lib/ingest/run.ts:221`) against the unique index at `src/db/schema.ts:206`.

Two consequences, stated rather than glossed:

- The hash covers the **first 4,000 characters** of the body. Two documents differing only after
  that point collapse to one row. That is correct for its purpose — suppressing re-posts and
  re-polls — and it is **not** a checksum you can use to prove the stored 8,000 characters are
  unaltered.
- The hash is not a hash of the origin page. It is a hash of what BNOW extracted, in BNOW's
  normalisation, at fetch time.

If a cryptographic seal over the stored body is ever needed for evidentiary use, it is new work,
not a re-reading of this column.

### 3.3 Caveat — a Telegram capture is a snapshot of the preview, not of the post

The web adapter reads the public `t.me/s/<channel>` **preview**, not the Telegram post
(`src/lib/adapters/telegram-web.ts`). What is preserved is what that preview rendered at fetch
time: text only, capped at 8,000 characters, without media, without edits made afterwards,
without replies or reactions, and without any indication that the post was later edited or
deleted. The MTProto adapter reads the protocol directly and is closer to the post, but the same
text-only, fetch-time snapshot caveat applies.

If the channel deletes the post, BNOW still holds its own capture and can say what it retrieved
and when — but it cannot demonstrate that the live post ever matched, because no independent
archival snapshot is taken. See §4.

### 3.4 Caveat — X retention depends on a third party's terms

X posts are retrieved through `api.twitterapi.io`, a third-party service, not the official
developer API (`src/lib/adapters/x-api.ts:1-2`). BNOW stores the retrieved text in its own
`raw_documents` row on the same terms as any other adapter, so preservation of the *capture*
does not depend on that service continuing to exist. What does depend on X's and the
intermediary's terms is whether BNOW may continue to *retrieve* posts, whether a cited post
remains publicly resolvable at its URL, and what may be redistributed. A citation to an X post
should be read as "BNOW retrieved this text at this URL at this time", not as a guarantee that a
reader can retrieve it now.

## 4. What a preservation gap looks like

Concretely, the shapes a reviewer should expect and press on:

1. **No independent archival snapshot exists.** There is no Wayback-style capture step anywhere
   in `src/lib/ingest/`. Preservation is BNOW's own copy of the extracted text. If a source page
   changes, BNOW can show what it retrieved but cannot show a third-party-attested capture of
   the original. Filed as OPEN-TASKS #108 (design only).
2. **Media is not preserved.** Every adapter stores text. Images, video and documents attached
   to a post are not retrieved, hashed or stored, so a claim resting on visual evidence
   preserves the *report* of that evidence, never the evidence.
3. **Content beyond the cap is truncated at ingest** — 8,000 characters for the text adapters,
   4,000 for procurement. A long article is preserved in part.
4. **A claim row id does not survive regeneration** (§3.1).
5. **The disk cache is not the archive.** Fetched pages are cached under `data/` during
   crawling, which is gitignored and local to whichever machine ran the crawl. It is a
   politeness and rate-limit mechanism (never fetch the same URL twice), not a retention tier.
   The database row is the record.

## 5. Standing rulings this policy rests on

- **Ruling 1** — no expert prose and no source full text in any user-facing output. §2 states
  what is stored of the reference corpus and what is not, with the schema annotations that say
  so.
- **Ruling 2** — every claim keeps at least one source link, enforced by the deferrable trigger
  and the non-cascading foreign key. §1.2.
- **Ruling 3** — stub and fixture data never persists or renders as fact. The one non-test
  deleter exists to enforce exactly this and is exempted on that basis, named in the test. §3.
- **Ruling 5** — migrations are forward-only and additive; `9999_claim_source_trigger.sql`
  always applies last. No migration deletes a row, which is separately asserted by
  `src/db/migrations.test.ts`.

## 6. Changing this policy

Any change that would make a source document deletable — a purge job, a storage tier with an
expiry, a per-source takedown path — has to do three things, in this order: state the ICS 206-01
one-year floor it will honour, amend this document, and amend
`src/lib/ingest/no-delete.test.ts`'s named exemption list in the same commit. The test is the
gate; the intent is that removing a preservation guarantee cannot be done quietly.
