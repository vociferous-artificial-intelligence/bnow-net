import { createHash } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import { db, rawSql } from "@/db";
import { canonicalSource } from "../isw/urls";
import { GdeltAdapter } from "../adapters/gdelt";
import { ProcurementAdapter } from "../adapters/procurement";
import { RssAdapter } from "../adapters/rss";
import { TelegramWebAdapter } from "../adapters/telegram-web";
import type { RawDoc } from "../adapters/types";
import { XApiAdapter, registryXAccounts, xGuardFromEnv } from "../adapters/x-api";
import { envNum } from "../usage/spend-guard";
import { REGISTRY_TELEGRAM_TOP_N, RSS_FEEDS, TELEGRAM_CURATED, channelTheater } from "./config";

export type IngestWhich = "fast" | "telegram" | "x" | "all";

export function contentHash(d: RawDoc): string {
  return createHash("sha256")
    .update(`${d.adapter}|${d.externalId ?? d.url ?? ""}|${d.title ?? ""}|${d.content.slice(0, 4000)}`)
    .digest("hex");
}

/** Top telegram channels by RECENT ISW citations (last 90 days of reports) —
 *  all-time ranking over-weights decayed 2022 channels. */
async function registryTelegramChannels(): Promise<Array<{ channel: string; countryIso2: string }>> {
  try {
    const rows = await db.execute(dsql`
      SELECT s.name, count(*) AS recent_citations
      FROM source_citations sc
      JOIN sources s ON s.id = sc.source_id
      JOIN isw_reports ir ON ir.id = sc.report_id
      WHERE s.platform = 'telegram'
        AND ir.report_date > (SELECT max(report_date) FROM isw_reports) - interval '90 days'
      GROUP BY s.name
      ORDER BY recent_citations DESC
      LIMIT ${REGISTRY_TELEGRAM_TOP_N}`);
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
}

/** Adapters for a production ingest run. Fixture stubs (telegram_mtproto/x/acled)
 *  are deliberately NOT included: stub content must never enter the corpus. When
 *  their real implementations land (keys in BLOCKERS.md), they get added here.
 *  x_api (paid) runs ONLY on its own explicit group — never inside "all" — so
 *  a casual local `tsx scripts/ingest.ts` cannot spend money, and its cron
 *  can't starve rss/telegram. */
export async function buildIngestAdapters(
  which: IngestWhich,
): Promise<Array<{ name: string; fetchLatest(): Promise<RawDoc[]>; live?: boolean }>> {
  const adapters: Array<{ name: string; fetchLatest(): Promise<RawDoc[]>; live?: boolean }> = [];
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
    const curated = TELEGRAM_CURATED;
    const fromRegistry = await registryTelegramChannels();
    const seen = new Set(curated.map((c) => c.channel.toLowerCase()));
    const channels = [
      ...curated,
      ...fromRegistry.filter((c) => !seen.has(c.channel.toLowerCase())),
    ];
    adapters.push(new TelegramWebAdapter(channels));
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
    } catch (e) {
      errors++;
      console.error(`${adapter.name}: ${e instanceof Error ? e.message : e}`);
    }
    stats.push({ adapter: adapter.name, fetched, inserted, errors });
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
