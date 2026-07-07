// Live X/Twitter ingestion via api.twitterapi.io (third-party; header `X-API-Key`,
// NOT the official developer.x.com API — see docs/SETUP-NEXT-WEEK.md §6).
// Named x_api to stay distinct from the fixture stub "x" (stubs.ts), which
// audit tooling treats as contamination if it ever appears in raw_documents.
//
// Cost model (docs.twitterapi.io): $0.15/1k tweets returned, minimum $0.00015
// per request — an empty poll costs the same as one tweet. So steady-state
// polling uses advanced_search with batched `from:a OR from:b` queries and a
// since_time watermark (pay only for NEW tweets + per-request minimums);
// last_tweets (always returns the newest ~20, all billed) is reserved for
// backfill. Every request passes the SpendGuard first; guard refusal stops the
// run cleanly (fail-closed, partial results still returned for insertion).

import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { detectLang, type Lang } from "../analysis/lang";
import {
  SpendGuard,
  envCap,
  envNum,
  loadProviderState,
  pgUsageStore,
  saveProviderState,
} from "../usage/spend-guard";
import type { BackfillRange, RawDoc, SourceAdapter } from "./types";

const BASE = "https://api.twitterapi.io";
export const X_USD_PER_TWEET = 0.00015;
export const X_MIN_USD_PER_REQUEST = 0.00015;
export const X_PROVIDER = "x_api";

const LANGS: ReadonlySet<string> = new Set([
  "ru", "uk", "en", "tt", "ba", "cv", "ce", "fa", "ar",
]);

export interface XAccount {
  userName: string;
  sourceKey: string; // sources.canonical_url, e.g. "x.com/centcom"
  countryIso2: string; // dominant citing theater: ru | ir
  citations: number;
}

/** X accounts ISW cited in the last 90 days, ranked by citation count, tagged
 *  with their dominant citing theater (ru = ROCA -> ru/ua corpus, ir = Iran Update). */
export async function registryXAccounts(limit?: number): Promise<XAccount[]> {
  const rows = await db.execute(dsql`
    SELECT s.name, s.canonical_url,
           count(*)::int AS citations,
           count(*) FILTER (WHERE ir.theater = 'ru')::int AS ru_citations
    FROM source_citations sc
    JOIN sources s ON s.id = sc.source_id
    JOIN isw_reports ir ON ir.id = sc.report_id
    WHERE s.platform = 'x'
      AND ir.report_date > (SELECT max(report_date) FROM isw_reports) - interval '90 days'
    GROUP BY s.id, s.name, s.canonical_url
    ORDER BY citations DESC
    ${limit ? dsql`LIMIT ${limit}` : dsql``}`);
  return (
    rows.rows as Array<{
      name: string;
      canonical_url: string;
      citations: number;
      ru_citations: number;
    }>
  ).map((r) => ({
    userName: r.name,
    sourceKey: r.canonical_url,
    countryIso2: r.ru_citations * 2 >= r.citations ? "ru" : "ir",
    citations: r.citations,
  }));
}

// -- response parsing (pure, fixture-tested) ------------------------------------

export interface XApiTweet {
  id: string;
  text: string;
  url?: string | null;
  twitterUrl?: string | null;
  createdAt?: string | null;
  lang?: string | null;
  isReply?: boolean | null;
  conversationId?: string | null;
  retweetCount?: number | null;
  likeCount?: number | null;
  viewCount?: number | null;
  author?: { userName?: string | null } | null;
  retweeted_tweet?: { text?: string | null; author?: { userName?: string | null } | null } | null;
}

/** Both response shapes: advanced_search has top-level `tweets`, last_tweets
 *  nests them under `data.tweets`. */
export function tweetsFromResponse(json: unknown): XApiTweet[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const arr =
    (Array.isArray(o.tweets) && o.tweets) ||
    (o.data &&
      typeof o.data === "object" &&
      Array.isArray((o.data as Record<string, unknown>).tweets) &&
      (o.data as Record<string, unknown>).tweets) ||
    [];
  return (arr as XApiTweet[]).filter((t) => t && typeof t.id === "string" && !!t.text);
}

/** Twitter classic format: "Tue Jul 07 17:50:06 +0000 2026". V8 parses it. */
export function parseTwitterDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function tweetToRawDoc(t: XApiTweet, account: XAccount): RawDoc {
  // retweets arrive truncated ("RT @orig: …"); recover the original's full text
  const rt = t.retweeted_tweet;
  const text =
    rt?.text && t.text.startsWith("RT @")
      ? `RT @${rt.author?.userName ?? "?"}: ${rt.text}`
      : t.text;
  const lang: Lang | null =
    t.lang && LANGS.has(t.lang) ? (t.lang as Lang) : detectLang(text);
  return {
    adapter: X_PROVIDER,
    externalId: t.id,
    url: t.url ?? t.twitterUrl ?? `https://x.com/${account.userName}/status/${t.id}`,
    title: null,
    content: text.slice(0, 8000),
    lang,
    // same convention as telegram-web: uk-language content is UA-theater
    countryIso2: lang === "uk" ? "ua" : account.countryIso2,
    publishedAt: parseTwitterDate(t.createdAt),
    sourceKey: account.sourceKey,
    meta: {
      retweetCount: t.retweetCount ?? null,
      likeCount: t.likeCount ?? null,
      viewCount: t.viewCount ?? null,
      isReply: t.isReply ?? null,
      conversationId: t.conversationId ?? null,
    },
  };
}

/** `(from:a OR from:b ...) since_time:N [until_time:M]` per twitterapi.io syntax. */
export function buildSearchQuery(
  accounts: XAccount[],
  sinceUnix: number,
  untilUnix?: number,
): string {
  const froms = accounts.map((a) => `from:${a.userName}`).join(" OR ");
  return `(${froms}) since_time:${sinceUnix}${untilUnix ? ` until_time:${untilUnix}` : ""}`;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function xGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: X_PROVIDER,
      totalCapUsd: envCap("X_SPRINT_USD_CAP"),
      dailyUsdCap: envNum("X_DAILY_USD_CAP", 1.5),
      dailyRequestCap: envNum("X_DAILY_REQUEST_CAP", 4000),
      runRequestCap: envNum("X_RUN_REQUEST_CAP", 200),
    },
    pgUsageStore,
  );
}

// -- adapter ---------------------------------------------------------------------

interface XAdapterOpts {
  spacingMs?: number;
  batchSize?: number; // accounts per OR-query
  maxPagesPerBatch?: number; // 20 tweets/page
  overlapSec?: number; // watermark overlap (dedupe absorbs the repeats)
  defaultLookbackSec?: number; // first run / lost watermark
  maxPagesPerAccount?: number; // backfill depth
}

export class XApiAdapter implements SourceAdapter {
  readonly name = X_PROVIDER;
  readonly live = true;

  constructor(
    private accounts: XAccount[],
    private guard: SpendGuard,
    private opts: XAdapterOpts = {},
  ) {}

  private get apiKey(): string | null {
    return process.env.X_API_KEY || null;
  }

  private async request(path: string, params: Record<string, string>): Promise<unknown | null> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { "X-API-Key": this.apiKey! },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`${X_PROVIDER} ${path}: HTTP ${res.status}`);
      return null;
    }
    return res.json();
  }

  /** Incremental poll via advanced_search: batched from: OR-queries since the
   *  persisted watermark. Watermark only advances after a complete pass, so an
   *  interrupted (or budget-stopped) run re-covers the window next time and the
   *  content-hash dedupe absorbs the overlap. */
  async fetchLatest(): Promise<RawDoc[]> {
    if (this.accounts.length === 0) return [];
    if (!this.apiKey) {
      console.warn(`${X_PROVIDER}: X_API_KEY unset — skipping (fail-closed)`);
      return [];
    }
    await this.guard.init();

    const {
      spacingMs = 300,
      batchSize = 20,
      maxPagesPerBatch = 5,
      overlapSec = 1800,
      defaultLookbackSec = 24 * 3600,
    } = this.opts;

    const state = await loadProviderState<{ lastPollAt?: number }>(X_PROVIDER);
    const pollStartedUnix = Math.floor(Date.now() / 1000);
    const sinceUnix = Math.max(
      (state?.lastPollAt ?? pollStartedUnix - defaultLookbackSec) - overlapSec,
      pollStartedUnix - 7 * 24 * 3600, // never search further back than a week
    );

    const byUser = new Map(this.accounts.map((a) => [a.userName.toLowerCase(), a]));
    const docs: RawDoc[] = [];
    const seenIds = new Set<string>();
    let complete = true;

    outer: for (const batch of chunk(this.accounts, batchSize)) {
      const query = buildSearchQuery(batch, sinceUnix);
      let cursor = "";
      for (let page = 0; page < maxPagesPerBatch; page++) {
        const r = this.guard.tryReserve();
        if (!r.ok) {
          console.warn(`${X_PROVIDER}: budget stop — ${r.reason}`);
          complete = false;
          break outer;
        }
        let json: unknown | null = null;
        try {
          json = await this.request("/twitter/tweet/advanced_search", {
            query,
            queryType: "Latest",
            cursor,
          });
        } catch (e) {
          console.warn(`${X_PROVIDER} search: ${e instanceof Error ? e.message : e}`);
        }
        if (json === null) {
          complete = false;
          break;
        }
        const tweets = tweetsFromResponse(json);
        await this.guard.record(
          1,
          tweets.length,
          Math.max(tweets.length * X_USD_PER_TWEET, X_MIN_USD_PER_REQUEST),
        );
        for (const t of tweets) {
          if (seenIds.has(t.id)) continue;
          seenIds.add(t.id);
          const account = byUser.get((t.author?.userName ?? "").toLowerCase());
          if (!account) continue; // defensive: only registry-attributed docs
          docs.push(tweetToRawDoc(t, account));
        }
        const o = json as { has_next_page?: boolean; next_cursor?: string };
        if (!o.has_next_page || !o.next_cursor) break;
        cursor = o.next_cursor;
        await new Promise((r2) => setTimeout(r2, spacingMs));
      }
      await new Promise((r2) => setTimeout(r2, spacingMs));
    }

    if (complete) await saveProviderState(X_PROVIDER, { lastPollAt: pollStartedUnix });
    console.log(
      `${X_PROVIDER}: ${docs.length} docs, run usage ${JSON.stringify(this.guard.runStats)}`,
    );
    return docs;
  }

  /** Backfill via last_tweets pagination (newest first), stopping per account
   *  once tweets are older than range.from — every returned tweet is billed,
   *  so the guard's run cap bounds worst-case spend. */
  async backfill(range: BackfillRange): Promise<RawDoc[]> {
    if (!this.apiKey) {
      console.warn(`${X_PROVIDER}: X_API_KEY unset — skipping backfill (fail-closed)`);
      return [];
    }
    await this.guard.init();
    const { spacingMs = 300, maxPagesPerAccount = 6 } = this.opts;
    const docs: RawDoc[] = [];
    const seenIds = new Set<string>();

    outer: for (const account of this.accounts) {
      let cursor = "";
      for (let page = 0; page < maxPagesPerAccount; page++) {
        const r = this.guard.tryReserve();
        if (!r.ok) {
          console.warn(`${X_PROVIDER}: budget stop — ${r.reason}`);
          break outer;
        }
        let json: unknown | null = null;
        try {
          json = await this.request("/twitter/user/last_tweets", {
            userName: account.userName,
            cursor,
          });
        } catch (e) {
          console.warn(`${X_PROVIDER} last_tweets ${account.userName}: ${e instanceof Error ? e.message : e}`);
        }
        if (json === null) break;
        const tweets = tweetsFromResponse(json);
        await this.guard.record(
          1,
          tweets.length,
          Math.max(tweets.length * X_USD_PER_TWEET, X_MIN_USD_PER_REQUEST),
        );
        if (tweets.length === 0) break;
        let oldestInRange = true;
        for (const t of tweets) {
          if (seenIds.has(t.id)) continue;
          seenIds.add(t.id);
          const at = parseTwitterDate(t.createdAt);
          if (at && at < range.from) {
            oldestInRange = false;
            continue;
          }
          if (at && at > range.to) continue;
          docs.push(tweetToRawDoc(t, account));
        }
        const o = json as { has_next_page?: boolean; next_cursor?: string };
        if (!oldestInRange || !o.has_next_page || !o.next_cursor) break;
        cursor = o.next_cursor;
        await new Promise((r2) => setTimeout(r2, spacingMs));
      }
      await new Promise((r2) => setTimeout(r2, spacingMs));
    }
    console.log(
      `${X_PROVIDER} backfill: ${docs.length} docs, run usage ${JSON.stringify(this.guard.runStats)}`,
    );
    return docs;
  }
}
