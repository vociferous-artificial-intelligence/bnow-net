// The tradecraft crosswalk, as data — the ONE source both the repo document
// `docs/METHODOLOGY-TRADECRAFT.md` and the public `/methodology` page read.
//
// Why a module and not two hand-maintained copies: the crosswalk is the artifact a
// methodology validator, a government analyst or a grant reviewer audits, so the public
// claim and the repo claim must not be able to drift. `crosswalk.test.ts` parses the
// document's fenced table and asserts it equals CROSSWALK_ROWS field for field, in order.
//
// What lives WHERE, deliberately:
//   - `requirement` and `mechanism` are public-safe prose and are rendered verbatim on the
//     public page. They carry no file path, no repository symbol and no internal task id.
//   - the enforcing file:line column stays in the document ONLY. It is repo-internal.
//   - `closedBy` carries the internal workstream id for the repo document; the public page
//     renders `roadmapLabel()` instead, so no internal step id reaches an anonymous reader.
//
// Moat constraint (registry view policy, `src/lib/registry/view-policy.ts`): no string in
// this module may state a hedging weight constant or a reliability score. The exact weights
// are withheld from every non-privileged surface, and `methodology/page.test.tsx` asserts
// the rendered page contains none of them. Describe the ordering qualitatively instead —
// the same posture as `registry.detail.weighting_qualitative`.

/** The four public IC issuances this crosswalk covers. */
export type TradecraftStandard = "ICD 203" | "ICD 206" | "ICS 206-01" | "ICD 208";

/**
 * BUILT   — the mechanism exists in production code today and a cited file enforces it.
 * PARTIAL — the inputs exist and are enforced, but the requirement is not fully met.
 * GAP     — not built.
 */
export type CrosswalkStatus = "BUILT" | "PARTIAL" | "GAP";

export interface CrosswalkRow {
  standard: TradecraftStandard;
  /** Paraphrased requirement text. Unique within the table — the drift-test key. */
  requirement: string;
  /** Public-safe description of what BNOW does. No paths, symbols or task ids. */
  mechanism: string;
  status: CrosswalkStatus;
  /**
   * Internal workstream step that closes a PARTIAL/GAP row: a `WS-7.x` id, or
   * `"not in WS-7"` when no planned step closes it, or null when the row is BUILT.
   * Never rendered publicly — see `roadmapLabel()`.
   */
  closedBy: string | null;
}

/** Display order on both surfaces; also the order the drift test compares. */
export const STANDARD_ORDER: readonly TradecraftStandard[] = [
  "ICD 203",
  "ICD 206",
  "ICS 206-01",
  "ICD 208",
] as const;

/** Full titles and dates, as published. Rendered on the public page. */
export const STANDARD_TITLES: Readonly<Record<TradecraftStandard, { title: string; date: string }>> = {
  "ICD 203": { title: "Analytic Standards", date: "January 2, 2015" },
  "ICD 206": {
    title: "Sourcing Requirements for Disseminated Analytic Products",
    date: "January 22, 2015",
  },
  "ICD 208": { title: "Maximizing the Utility of Analytic Products", date: "January 9, 2017" },
  "ICS 206-01": {
    title:
      "Citation and Reference for Publicly Available Information, Commercially Available Information, and Open Source Intelligence",
    date: "December 2, 2024",
  },
};

export const CROSSWALK_ROWS: readonly CrosswalkRow[] = [
  {
    standard: "ICD 203",
    requirement: "Objective; independent of political consideration",
    mechanism:
      "Source standing is derived from ISW's own citation and hedging behaviour, not from an editorial preference; there is no human editorial pass between extraction and publication, which removes an editorial-bias path and equally removes human review",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Timely",
    mechanism:
      "Digests are generated four times a day per theater and track; lag against the expert benchmark is measured, not asserted",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 203",
    requirement: "Based on all available sources",
    mechanism:
      "Multi-adapter ingestion — RSS, GDELT, Telegram web preview, Telegram MTProto, X — into one hash-deduplicated document store, with a per-theater corpus and a source and platform mix cap so one loud platform cannot fill a batch",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Properly describes the quality and credibility of underlying sources",
    mechanism:
      "Every source carries a citation profile and a five-value hedging distribution per theater, the per-claim evidence panel shows the documents behind a claim, and a generated narrative descriptor states the platform, the citation volume and date span in the named reference corpus, the hedging distribution and the registry status; no credibility level is asserted",
    status: "PARTIAL",
    closedBy: "WS-7.4",
  },
  {
    standard: "ICD 203",
    requirement: "Properly expresses and explains uncertainty",
    mechanism:
      "Every rendered claim carries an ICD 203 likelihood band with its published percentage range beside a separately labelled corroboration-derived confidence level, both computed by a signed, versioned mapping from the source's own estimative posture and the independence of the documents behind the claim; the sub-even bands and the highest band are never machine-assigned, because there is no refutation mechanism and no analyst-verified tier yet",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Distinguishes underlying information from assumptions and judgments",
    mechanism:
      "A claim cannot be committed without at least one source document — a deferrable database trigger fails the transaction otherwise — and a deterministic publication guard rebuilds or drops any event whose prose would state a single-document disputed allegation as fact",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 203",
    requirement: "Incorporates analysis of alternatives",
    mechanism:
      "Divergences against the expert benchmark are recorded per run and shown on the scoreboard, but no structured alternative-hypothesis method is implemented",
    status: "GAP",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Demonstrates customer relevance and addresses implications",
    mechanism:
      "Products are scoped per theater and per track so a reader selects the lens rather than filtering a firehose; no explicit implications section is generated",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Uses clear and logical argumentation",
    mechanism:
      "Every rendered claim is a discrete assertion with its own evidence set, hedging label, and copyable citation, rather than an unattributed narrative",
    status: "PARTIAL",
    closedBy: "WS-7.2",
  },
  {
    standard: "ICD 203",
    requirement: "Explains change to or consistency of analytic judgments",
    mechanism:
      "Digests are archived per date and are addressable, so change is inspectable, but no explicit change statement is generated between editions",
    status: "GAP",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Makes accurate judgments and assessments",
    mechanism:
      "Not claimed. What is measured and published is coverage against a named expert benchmark, with the non-independence caveat carried beside the number",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 203",
    requirement: "Incorporates effective visual information",
    mechanism:
      "Hedging-mix bars, per-year citation histograms and scoreboard tables; no map or geospatial rendering",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 206",
    requirement: "Source Reference Citation for every disseminated claim",
    mechanism:
      "A deferrable constraint trigger raises and fails the whole transaction if any claim commits without at least one source-document link; the application layer writes the claim and its links in one transaction; a migration test guards the trigger against regeneration",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 206",
    requirement: "Source descriptors conveying reliability, bias and limitations",
    mechanism:
      "A deterministic template generates a descriptor per source and per reference corpus — platform, citation volume and span, the hedging distribution as shares in the corpus's own vocabulary, registry status, and the caveat that this describes how the benchmark cited the source rather than an independent audit — versioned and labelled as generated, with a pooled platform identity refused a profile and told so. Reliability and limitations are conveyed; the source's bias is not modelled",
    status: "PARTIAL",
    closedBy: "not in WS-7",
  },
  {
    standard: "ICD 206",
    requirement: "Source summary statement for the product as a whole",
    mechanism:
      "A summary statement is generated per digest at read time from the claim-to-document join: distinct documents, channels and platforms, the share of claims resting on two or more of each, the sources supporting the most claims, the count resting on a single unconfirmed document, and the platform and transport mix against the batch cap the digest itself recorded — or an explicit statement that the digest recorded no mix figures",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 206",
    requirement: "Sources preserved and retrievable for the life of the product",
    mechanism:
      "Every document is stored with its URL, body, fetch timestamp and content hash; no production code path deletes one, and a cited document cannot be removed at all because the citation link's foreign key declines to cascade — the property is now a written policy and a test that fails if it lapses",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICS 206-01",
    requirement: "Citation elements per source: author, title, URL, publication date, access date, source type",
    mechanism:
      "URL, title, publication date, adapter and platform are held and plumbed to every claim's evidence payload; the access date is retained but deliberately not presented, and no single standard-conformant citation string is emitted",
    status: "PARTIAL",
    closedBy: "WS-7.2",
  },
  {
    standard: "ICS 206-01",
    requirement: "A brief narrative quality descriptor per source",
    mechanism:
      "Generated per source and per reference corpus from citation volume and hedging distribution, rendered on the source detail surface and beside the digest the source supports, and never a letter grade or a headline score",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICS 206-01",
    requirement: "Disclosure of AI or ML tooling: system name, model version, relevant parameters",
    mechanism:
      "Every extraction row carries a versioned extractor stamp, every synthesized digest carries a provider tag and a durable dispatch identity, and the routing registry version is recorded with it — none of which reaches a reader or the clipboard",
    status: "PARTIAL",
    closedBy: "WS-7.2",
  },
  {
    standard: "ICS 206-01",
    requirement: "Consistent PAI / CAI / OSINT vocabulary",
    mechanism:
      "Every live adapter ingests publicly available information; the distinction is not yet stated in product vocabulary or in any citation output",
    status: "GAP",
    closedBy: "WS-7.2",
  },
  {
    standard: "ICS 206-01",
    requirement: "Dynamic sources preserved at least one year from product issuance",
    mechanism:
      "Stated as policy: source documents are retained indefinitely and never for less than one year from any product citing them, with the four honest caveats — regeneration replaces claim rows, the content hash covers a prefix, a Telegram capture is a snapshot of the preview, and no third-party archival snapshot is taken",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 208",
    requirement: "Key judgments first — BLUF ordering",
    mechanism:
      "Digests lead with events and their supporting claims; the validation scoreboard leads with the benchmark result",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 208",
    requirement: "Consistent, predictable product structure",
    mechanism:
      "One product shape per theater and track, dated, archived and addressable at a stable URL",
    status: "BUILT",
    closedBy: null,
  },
  {
    standard: "ICD 208",
    requirement: "Output a customer can reuse in their own product",
    mechanism:
      "Per-claim copy actions exist for report, link, evidence and text; no standard-conformant citation mode and no public API",
    status: "PARTIAL",
    closedBy: "WS-7.2",
  },
] as const;

/**
 * Public roadmap label for a row. The internal `WS-7.x` ids are repo-internal, so the
 * public page renders intent, not a step number: a row a planned step closes reads
 * "planned"; a row nothing planned closes reads "not planned"; a BUILT row reads "".
 */
export function roadmapLabel(row: CrosswalkRow): string {
  if (row.closedBy === null) return "";
  return row.closedBy === "not in WS-7" ? "not planned" : "planned";
}

/** Rows for one standard, in table order. */
export function rowsForStandard(standard: TradecraftStandard): readonly CrosswalkRow[] {
  return CROSSWALK_ROWS.filter((r) => r.standard === standard);
}

/** Count of rows at a given status, for the page's summary line. */
export function statusCount(status: CrosswalkStatus): number {
  return CROSSWALK_ROWS.filter((r) => r.status === status).length;
}
