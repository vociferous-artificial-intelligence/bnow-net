import { createHash } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import { db, rawSql } from "@/db";
import { canonicalSource } from "../isw/urls";
import { GdeltAdapter } from "../adapters/gdelt";
import { ProcurementAdapter } from "../adapters/procurement";
import { RssAdapter } from "../adapters/rss";
import {
  TelegramMtprotoAdapter,
  mtprotoDepsFromEnv,
  mtprotoOptsFromEnv,
} from "../adapters/telegram-mtproto";
import { TelegramWebAdapter } from "../adapters/telegram-web";
import type { RawDoc } from "../adapters/types";
import { XApiAdapter, registryXAccounts, xGuardFromEnv } from "../adapters/x-api";
import { envNum } from "../usage/spend-guard";
import {
  REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER,
  REGISTRY_TELEGRAM_TOP_N,
  REGISTRY_TELEGRAM_TOP_N_MTPROTO,
  RSS_FEEDS,
  TELEGRAM_CURATED,
  channelTheater,
  type ReportTheater,
} from "./config";

export type IngestWhich = "fast" | "telegram" | "mtproto" | "x" | "all";

export function contentHash(d: RawDoc): string {
  return createHash("sha256")
    .update(`${d.adapter}|${d.externalId ?? d.url ?? ""}|${d.title ?? ""}|${d.content.slice(0, 4000)}`)
    .digest("hex");
}

export interface RegistryTelegramOptions {
  /** how many ranked channels to return (default: web's REGISTRY_TELEGRAM_TOP_N) */
  topN?: number;
  /** restrict ranking to citations from ISW reports of this theater only
   *  ('ru'=ROCA, 'ir'=Iran Update); omit/null for the pan-theater ranking. */
  reportTheater?: ReportTheater | null;
}

/** Top telegram channels by RECENT ISW citations (last 90 days of reports) —
 *  all-time ranking over-weights decayed 2022 channels. reportTheater narrows the
 *  citations counted to one ISW report theater (MTProto's ROCA-only default; web
 *  Telegram never passes it, so it stays pan-theater). */
async function registryTelegramChannels(
  opts: RegistryTelegramOptions = {},
): Promise<Array<{ channel: string; countryIso2: string }>> {
  const topN = opts.topN ?? REGISTRY_TELEGRAM_TOP_N;
  const theaterFilter = opts.reportTheater ? dsql`AND ir.theater = ${opts.reportTheater}` : dsql``;
  try {
    const rows = await db.execute(dsql`
      SELECT s.name, count(*) AS recent_citations
      FROM source_citations sc
      JOIN sources s ON s.id = sc.source_id
      JOIN isw_reports ir ON ir.id = sc.report_id
      WHERE s.platform = 'telegram'
        AND ir.report_date > (SELECT max(report_date) FROM isw_reports) - interval '90 days'
        ${theaterFilter}
      GROUP BY s.name
      ORDER BY recent_citations DESC
      LIMIT ${topN}`);
    return (rows.rows as Array<{ name: string }>).map((r) => ({
      channel: r.name,
      // registry has no country column: per-channel override, else the ru default.
      // Content language re-tags on top of this at parse time (uk->ua, fa->ir).
      countryIso2: channelTheater(r.name),
    }));
  } catch {
    return [];
  }
}

export interface IngestStats {
  adapter: string;
  fetched: number;
  inserted: number;
  errors: number;
  /** adapter-specific run tallies (e.g. mtproto flood waits) for cron_runs counts */
  detail?: Record<string, number>;
}

/** The one telegram channel roster (curated + recently-cited registry channels),
 *  shared by BOTH transports so a channel keeps its sourceKey — and its registry
 *  reliability history — whether a doc arrives via preview scrape or MTProto.
 *  MTProto passes a deeper, ROCA-only registry cut (see buildIngestAdapters). */
export async function telegramChannelRoster(
  opts: RegistryTelegramOptions = {},
): Promise<Array<{ channel: string; countryIso2: string }>> {
  const curated = TELEGRAM_CURATED;
  const fromRegistry = await registryTelegramChannels(opts);
  const seen = new Set(curated.map((c) => c.channel.toLowerCase()));
  return [...curated, ...fromRegistry.filter((c) => !seen.has(c.channel.toLowerCase()))];
}

/** An ingest-runnable adapter: the SourceAdapter surface runIngest needs, plus the
 *  optional post-insert mark commit and run tallies the MTProto adapter provides. */
export interface RunnableAdapter {
  name: string;
  fetchLatest(): Promise<RawDoc[]>;
  live?: boolean;
  /** called only AFTER insertDocs succeeded — watermark advancement is insert-gated */
  commitMarks?(): Promise<void>;
  runStats?: Record<string, number>;
}

/** Adapters for a production ingest run. Fixture stubs (x/acled) are deliberately
 *  NOT included: stub content must never enter the corpus. x_api (paid) and
 *  mtproto (flood-budgeted) run ONLY on their own explicit groups — never inside
 *  "all" — so a casual local `tsx scripts/ingest.ts` cannot spend money or burn
 *  the telegram account's flood budget, and their crons can't starve rss/telegram. */
export async function buildIngestAdapters(which: IngestWhich): Promise<RunnableAdapter[]> {
  const adapters: RunnableAdapter[] = [];
  if (which === "fast" || which === "all") {
    adapters.push(new RssAdapter(RSS_FEEDS), new GdeltAdapter(["ru", "ua"]));
    adapters.push(new ProcurementAdapter());
  }
  if (which === "x") {
    const topN = envNum("X_ACCOUNTS_TOP_N", 0);
    const accounts = await registryXAccounts(topN > 0 ? topN : undefined);
    adapters.push(new XApiAdapter(accounts, xGuardFromEnv()));
  }
  if (which === "telegram" || which === "all") {
    adapters.push(new TelegramWebAdapter(await telegramChannelRoster()));
  }
  if (which === "mtproto") {
    adapters.push(
      new TelegramMtprotoAdapter(
        await telegramChannelRoster({
          topN: REGISTRY_TELEGRAM_TOP_N_MTPROTO,
          reportTheater: REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER,
        }),
        mtprotoDepsFromEnv(),
        mtprotoOptsFromEnv(),
      ),
    );
  }
  return adapters;
}

export async function runIngest(which: IngestWhich = "all"): Promise<IngestStats[]> {
  const stats: IngestStats[] = [];
  const adapters = await buildIngestAdapters(which);

  for (const adapter of adapters) {
    let fetched = 0,
      inserted = 0,
      errors = 0;
    try {
      const docs = await adapter.fetchLatest();
      fetched = docs.length;
      inserted = await insertDocs(docs);
      // marks advance only once the docs they cover are safely inserted
      if (adapter.commitMarks) await adapter.commitMarks();
    } catch (e) {
      errors++;
      console.error(`${adapter.name}: ${e instanceof Error ? e.message : e}`);
    }
    stats.push({ adapter: adapter.name, fetched, inserted, errors, detail: adapter.runStats });
  }
  return stats;
}

/** Insert docs with hash dedupe; link sourceKey -> sources.id when known. Returns inserted count. */
export async function insertDocs(docs: RawDoc[]): Promise<number> {
  if (docs.length === 0) return 0;

  // resolve sourceKeys to ids in one query
  const keys = [...new Set(docs.map((d) => d.sourceKey).filter(Boolean))] as string[];
  const idByKey = new Map<string, number>();
  if (keys.length > 0) {
    const rows = (await rawSql.query(
      "SELECT id, canonical_url FROM sources WHERE canonical_url = ANY($1::text[])",
      [keys],
    )) as Array<{ id: number; canonical_url: string }>;
    for (const r of rows) idByKey.set(r.canonical_url, r.id);

    // auto-create sources for configured feeds/channels the registry doesn't know
    // yet (e.g. Gulf outlets never cited by ISW) so docs carry source attribution
    const missing = keys.filter((k) => !idByKey.has(k));
    for (const key of missing) {
      const cs = canonicalSource(key.startsWith("t.me/") ? `https://${key}` : `https://${key}/`);
      const created = (await rawSql.query(
        `INSERT INTO sources (canonical_url, domain, platform, name)
         VALUES ($1, $2, $3::platform, $4)
         ON CONFLICT (canonical_url) DO UPDATE SET domain = EXCLUDED.domain
         RETURNING id`,
        [key, cs?.domain ?? key, cs?.platform ?? "other", cs?.name ?? key],
      )) as Array<{ id: number }>;
      idByKey.set(key, created[0].id);
    }
  }

  let inserted = 0;
  for (let i = 0; i < docs.length; i += 100) {
    const chunk = docs.slice(i, i + 100);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((d, j) => {
      const o = j * 10;
      values.push(
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`,
      );
      params.push(
        d.adapter,
        d.sourceKey ? (idByKey.get(d.sourceKey) ?? null) : null,
        d.externalId,
        d.url,
        d.title,
        d.content,
        contentHash(d),
        d.lang,
        d.countryIso2,
        d.publishedAt,
      );
    });
    const res = await rawSql.query(
      `INSERT INTO raw_documents (adapter, source_id, external_id, url, title, content, content_hash, lang, country_iso2, published_at)
       VALUES ${values.join(",")}
       ON CONFLICT (content_hash) DO NOTHING
       RETURNING id`,
      params,
    );
    inserted += (res as unknown[]).length;
  }
  return inserted;
}
