// SourceAdapter: every ingestion channel implements this. Keyless adapters are live;
// keyed adapters ship as deterministic stubs until credentials exist (BLOCKERS.md).

export interface RawDoc {
  adapter: string;
  externalId: string | null;
  url: string | null;
  title: string | null;
  content: string;
  lang: string | null;
  countryIso2: string | null;
  publishedAt: Date | null;
  /** registry key (e.g. "t.me/rybar") when the doc comes from a known source */
  sourceKey: string | null;
  meta: Record<string, unknown>;
}

export interface FetchLatestOptions {
  /** ISO country codes this run cares about (adapter may ignore) */
  countries?: string[];
}

export interface BackfillRange {
  from: Date;
  to: Date;
}

export interface SourceAdapter {
  readonly name: string;
  /** false = stub implementation (no credentials) */
  readonly live: boolean;
  fetchLatest(opts?: FetchLatestOptions): Promise<RawDoc[]>;
  backfill?(range: BackfillRange, opts?: FetchLatestOptions): Promise<RawDoc[]>;
}
