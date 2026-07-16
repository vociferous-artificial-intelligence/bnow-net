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
//
// Watermark rule (OPEN-TASKS #38): lastPollAt is INSERT-GATED — fetchLatest()
// only prepares a pending watermark on a globally COMPLETE pass (every batch
// exhausted its cursors, zero request/parser failures, no budget stop, no page
// truncation); runIngest persists it via commitMarks() strictly AFTER
// insertDocs() succeeded. Anything else leaves the old watermark so the next
// poll re-covers the window (content-hash dedupe absorbs the overlap). Paid X
// work is single-writer via the x_api_lease (src/lib/usage/x-lease.ts): a poll
// that finds the lease held (historical recovery running) makes zero paid calls.

import { randomUUID } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { detectLang, type Lang } from "../analysis/lang";
import { routeTheater } from "../ingest/theater";
import {
  SpendGuard,
  envCap,
  envNum,
  loadProviderState,
  pgUsageStore,
  saveProviderState,
} from "../usage/spend-guard";
import {
  X_LEASE_TTL_MS,
  acquireXLease,
  pgXLeaseDriver,
  type XLeaseDriver,
} from "../usage/x-lease";
import { X_PARK_THRESHOLD_SEC_DEFAULT, type AutoCatchupResult } from "./x-auto-catchup";
import {
  alertDeliveryCode,
  alertKindCode,
  type XHealthContext,
  type XHealthCounters,
  type XHealthOutcome,
} from "./x-health";
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

/** Structurally valid search payload: a tweets array (possibly empty) at either
 *  response shape. A 200 with a junk/error body must NOT read as an exhausted
 *  page — treating it as empty would let a failed pass advance the watermark. */
export function isSearchPayload(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.tweets)) return true;
  const d = o.data;
  return !!d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).tweets);
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
    // same convention as telegram-web: content language overrides the account's
    // dominant theater where unambiguous (uk -> ua, fa -> ir)
    countryIso2: routeTheater(lang, account.countryIso2),
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

/** Guard for the automatic parked-watermark catch-up: the SAME x_api provider,
 *  store, total (X_SPRINT_USD_CAP) and daily (X_DAILY_USD_CAP / X_DAILY_REQUEST_CAP)
 *  caps as the steady poller — spend accounting stays cumulative across the day —
 *  but the per-run request cap is the dedicated, env-tunable auto-catch-up limit
 *  `X_AUTO_CATCHUP_REQUEST_LIMIT`, clamped to never exceed X_RUN_REQUEST_CAP. This
 *  bounds each hourly catch-up slice; a larger backlog resumes next run. There is
 *  no new USD allowance — the existing caps remain the spend authorization. */
export function xAutoCatchupGuardFromEnv(): SpendGuard {
  const runCap = envNum("X_RUN_REQUEST_CAP", 200);
  const autoLimit = Math.max(1, Math.min(envNum("X_AUTO_CATCHUP_REQUEST_LIMIT", runCap), runCap));
  return new SpendGuard(
    {
      provider: X_PROVIDER,
      totalCapUsd: envCap("X_SPRINT_USD_CAP"),
      dailyUsdCap: envNum("X_DAILY_USD_CAP", 1.5),
      dailyRequestCap: envNum("X_DAILY_REQUEST_CAP", 4000),
      runRequestCap: autoLimit,
    },
    pgUsageStore,
  );
}

/** One twitterapi.io GET. Returns parsed JSON, or null on a non-2xx status
 *  (network/timeout errors propagate). Logs path + status only — never the key
 *  or authorization headers. Shared by the adapter and the gap-recovery driver. */
export async function xApiRequest(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${BASE}${path}?${qs}`, {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.warn(`${X_PROVIDER} ${path}: HTTP ${res.status}`);
    return null;
  }
  return res.json();
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

/** Injectable seams (pg/fetch in prod, in-memory in tests). */
export interface XApiDeps {
  loadState: typeof loadProviderState;
  saveState: typeof saveProviderState;
  fetchImpl: typeof fetch;
  leaseDriver: XLeaseDriver;
  /** Parked-watermark auto-catch-up. Default (undefined) = the built-in step wired
   *  to prod seams; tests inject a stub to exercise the fetchLatest branch. */
  autoCatchup?: (accounts: XAccount[]) => Promise<AutoCatchupResult>;
  /** Health monitor + operator alert. Default (undefined) = the built-in wired to
   *  prod seams (no email when FEEDBACK_EMAIL is unset); tests inject a stub. */
  healthCheck?: (counters: XHealthCounters, context: XHealthContext) => Promise<XHealthOutcome>;
}

function defaultXApiDeps(): XApiDeps {
  return {
    loadState: loadProviderState,
    saveState: saveProviderState,
    fetchImpl: fetch,
    leaseDriver: pgXLeaseDriver,
  };
}

/** Numeric code for cron_runs.counts.x_api (Record<string, number>): the catch-up
 *  state must be auditable there without a string. */
const AUTO_CATCHUP_STATE_CODE: Record<AutoCatchupResult["state"], number> = {
  not_parked: 0,
  started: 1,
  resumed: 2,
  complete: 3,
  already_complete: 4,
  refused: 5,
  no_roster: 6,
};

export class XApiAdapter implements SourceAdapter {
  readonly name = X_PROVIDER;
  readonly live = true;

  /** Prepared only by a globally COMPLETE fetchLatest pass; persisted by
   *  commitMarks() strictly after runIngest inserted the docs it covers. */
  private pendingLastPollAt: number | null = null;
  /** Per-run tallies, surfaced through cron_runs.counts.x_api (runIngest detail). */
  runStats: Record<string, number> = {};
  private deps: XApiDeps;

  constructor(
    private accounts: XAccount[],
    private guard: SpendGuard,
    private opts: XAdapterOpts = {},
    deps: Partial<XApiDeps> = {},
  ) {
    this.deps = { ...defaultXApiDeps(), ...deps };
  }

  private get apiKey(): string | null {
    return process.env.X_API_KEY || null;
  }

  private request(path: string, params: Record<string, string>): Promise<unknown | null> {
    return xApiRequest(path, params, this.apiKey!, this.deps.fetchImpl);
  }

  /** Incremental poll via advanced_search: batched from: OR-queries since the
   *  persisted watermark. A pass is COMPLETE only when every batch exhausted its
   *  cursors with zero failures — anything else (budget stop, HTTP/parser error,
   *  page ceiling with another cursor pending) returns partial docs for
   *  idempotent insertion but leaves the watermark alone, so the next poll
   *  re-covers the window and the content-hash dedupe absorbs the overlap. */
  async fetchLatest(): Promise<RawDoc[]> {
    this.pendingLastPollAt = null;
    this.runStats = {
      requests: 0,
      units: 0,
      budgetStops: 0,
      pageTruncations: 0,
      requestFailures: 0,
      lockSkips: 0,
      incomplete: 0,
    };
    if (this.accounts.length === 0) return [];
    if (!this.apiKey) {
      console.warn(`${X_PROVIDER}: X_API_KEY unset — skipping (fail-closed)`);
      return [];
    }

    // Self-heal: if the live watermark is parked, run one bounded, resumable,
    // cursor-complete catch-up slice (it inserts internally and advances the
    // watermark on completion) and skip the steady poll this run — steady polling
    // resumes next scheduled run once caught up. #38/#66.
    const catchup = this.deps.autoCatchup
      ? await this.deps.autoCatchup(this.accounts)
      : await this.runAutoCatchupStep();
    if (catchup.ran) {
      this.applyCatchupStats(catchup);
      await this.runHealthStep(catchup.ageSec ?? null, {
        state: catchup.state,
        leaseHeld: catchup.leaseHeld ?? false,
        progressSig: catchup.progressSig ?? null,
        inserted: catchup.counts?.inserted ?? 0,
        watermarkAdvanced: catchup.watermarkAdvanced ?? false,
      });
      return []; // gap engine already inserted; watermark advanced by the catch-up
    }

    // Paid X work is single-writer: if the historical-recovery driver (or another
    // poll) holds the lease, make ZERO paid calls and leave the watermark alone —
    // the next scheduled poll re-covers the window.
    const lease = await acquireXLease(
      `x-poll-${randomUUID()}`,
      X_LEASE_TTL_MS,
      this.deps.leaseDriver,
    );
    let steadyDocs: RawDoc[] = [];
    let steadyWatermarkAgeSec: number | null = null;
    if (!lease) {
      this.runStats.lockSkips = 1;
      this.runStats.incomplete = 1;
      console.warn(`${X_PROVIDER}: provider lease held — skipping poll (no paid calls)`);
    } else {
      try {
        await this.guard.init();

        const {
          spacingMs = 300,
          batchSize = 20,
          maxPagesPerBatch = 5,
          overlapSec = 1800,
          defaultLookbackSec = 24 * 3600,
        } = this.opts;

        const state = await this.deps.loadState<{ lastPollAt?: number }>(X_PROVIDER);
        const pollStartedUnix = Math.floor(Date.now() / 1000);
        steadyWatermarkAgeSec =
          typeof state?.lastPollAt === "number" ? pollStartedUnix - state.lastPollAt : null;
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
          for (let page = 1; ; page++) {
            const r = this.guard.tryReserve();
            if (!r.ok) {
              console.warn(`${X_PROVIDER}: budget stop — ${r.reason}`);
              this.runStats.budgetStops += 1;
              complete = false;
              break outer;
            }
            if (!(await lease.renew())) {
              // lost to a takeover (only possible after a >TTL stall): another job
              // may be spending — stop paid calls immediately, pass is incomplete
              console.warn(`${X_PROVIDER}: lease lost mid-poll — stopping paid calls`);
              this.runStats.lockSkips += 1;
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
              this.runStats.requestFailures += 1;
              complete = false;
              break;
            }
            if (!isSearchPayload(json)) {
              // 200 with a junk body: record the per-request minimum (the provider
              // bills the request) and fail the pass — a junk "empty" page must not
              // read as an exhausted batch.
              await this.guard.record(1, 0, X_MIN_USD_PER_REQUEST);
              this.runStats.requests += 1;
              this.runStats.requestFailures += 1;
              complete = false;
              break;
            }
            const tweets = tweetsFromResponse(json);
            await this.guard.record(
              1,
              tweets.length,
              Math.max(tweets.length * X_USD_PER_TWEET, X_MIN_USD_PER_REQUEST),
            );
            this.runStats.requests += 1;
            this.runStats.units += tweets.length;
            for (const t of tweets) {
              if (seenIds.has(t.id)) continue;
              seenIds.add(t.id);
              const account = byUser.get((t.author?.userName ?? "").toLowerCase());
              if (!account) continue; // defensive: only registry-attributed docs
              docs.push(tweetToRawDoc(t, account));
            }
            const o = json as { has_next_page?: boolean; next_cursor?: string };
            if (!o.has_next_page || !o.next_cursor) break; // batch genuinely exhausted
            if (page >= maxPagesPerBatch) {
              // steady-state page ceiling reached with another cursor pending:
              // visible (counted) and the pass is incomplete, so the watermark
              // cannot advance past the un-fetched tail (the old silent loss).
              this.runStats.pageTruncations += 1;
              complete = false;
              break;
            }
            cursor = o.next_cursor;
            await new Promise((r2) => setTimeout(r2, spacingMs));
          }
          await new Promise((r2) => setTimeout(r2, spacingMs));
        }

        // Never persisted here: runIngest calls commitMarks() after insertDocs().
        if (complete) this.pendingLastPollAt = pollStartedUnix;
        this.runStats.incomplete = complete ? 0 : 1;
        this.runStats.docs = docs.length;
        steadyDocs = docs;
        console.log(
          `${X_PROVIDER}: ${docs.length} docs, run usage ${JSON.stringify(this.guard.runStats)}, complete=${complete}`,
        );
      } finally {
        await lease.release();
      }
    }

    this.runStats.mode = 1; // 1 = steady poll (2 = catch-up, set by applyCatchupStats)
    await this.runHealthStep(steadyWatermarkAgeSec, null);
    return steadyDocs;
  }

  /** Merge a catch-up outcome into runStats as safe numeric fields (no cursor
   *  value, no tweet content) so cron_runs.counts.x_api stays auditable. */
  private applyCatchupStats(catchup: AutoCatchupResult): void {
    const c = catchup.counts;
    this.runStats.mode = 2; // catch-up took over this invocation
    this.runStats.catchupState = AUTO_CATCHUP_STATE_CODE[catchup.state];
    this.runStats.requests = c?.requests ?? 0;
    this.runStats.docs = c?.inserted ?? 0;
    this.runStats.lockSkips = catchup.leaseHeld ? 1 : 0;
    this.runStats.incomplete =
      catchup.state === "complete" || catchup.state === "already_complete" ? 0 : 1;
    this.runStats.catchupBatchIndex = c?.batchIndex ?? 0;
    this.runStats.catchupBatches = c?.batches ?? 0;
    this.runStats.catchupCursorPending = c?.cursorPending ?? 0;
    this.runStats.catchupInserted = c?.inserted ?? 0;
    this.runStats.catchupDuplicates = c?.duplicates ?? 0;
    this.runStats.catchupUnattributed = c?.unattributed ?? 0;
    this.runStats.catchupSpendUsd = c?.spendUsd ?? 0;
    this.runStats.watermarkAdvanced = catchup.watermarkAdvanced ? 1 : 0;
    this.runStats.watermarkAgeSec = catchup.ageSec ?? 0;
  }

  /** Built-in auto-catch-up wired to prod seams (dynamic import breaks the
   *  x-api ⇄ x-auto-catchup module cycle at load time). Given the injected
   *  loadState, an un-parked watermark returns immediately with zero paid calls. */
  private async runAutoCatchupStep(): Promise<AutoCatchupResult> {
    const { runXAutoCatchup, pgXWatermarkDriver } = await import("./x-auto-catchup");
    const key = this.apiKey!;
    return runXAutoCatchup(
      this.accounts,
      {
        guard: xAutoCatchupGuardFromEnv(),
        request: (path, params) => xApiRequest(path, params, key, this.deps.fetchImpl),
        insertDocs: async (docs) => (await import("../ingest/run")).insertDocs(docs),
        loadState: this.deps.loadState,
        saveState: this.deps.saveState,
        leaseDriver: this.deps.leaseDriver,
        watermark: pgXWatermarkDriver,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        log: (l) => console.log(l),
      },
      {
        parkThresholdSec: envNum("X_PARK_THRESHOLD_SEC", X_PARK_THRESHOLD_SEC_DEFAULT),
        batchSize: this.opts.batchSize ?? 20,
        spacingMs: this.opts.spacingMs ?? 300,
        nowMs: Date.now(),
      },
    );
  }

  /** Evaluate health and (on a fire) alert the operator, recording numeric result
   *  codes in runStats. Never throws — a monitor failure must not fail ingestion. */
  private async runHealthStep(
    watermarkAgeSec: number | null,
    catchup: XHealthContext["catchup"],
  ): Promise<void> {
    try {
      const counters: XHealthCounters = {
        requests: this.runStats.requests ?? 0,
        docs: this.runStats.docs ?? 0,
        budgetStops: this.runStats.budgetStops ?? 0,
        pageTruncations: this.runStats.pageTruncations ?? 0,
        requestFailures: this.runStats.requestFailures ?? 0,
        lockSkips: this.runStats.lockSkips ?? 0,
        incomplete: this.runStats.incomplete ?? 0,
      };
      const context: XHealthContext = {
        watermarkAgeSec,
        parkThresholdSec: envNum("X_PARK_THRESHOLD_SEC", X_PARK_THRESHOLD_SEC_DEFAULT),
        catchup,
      };
      const outcome = this.deps.healthCheck
        ? await this.deps.healthCheck(counters, context)
        : await this.defaultHealthCheck(counters, context);
      this.runStats.alertEvaluated = outcome.evaluated ? 1 : 0;
      this.runStats.alertKind = alertKindCode(outcome.alert);
      this.runStats.alertDelivery = alertDeliveryCode(outcome.delivery);
      this.runStats.alertReasons = outcome.reasons.length; // count only — no strings in cron counts
    } catch (e) {
      console.warn(`${X_PROVIDER}: health check failed (ingestion unaffected): ${e instanceof Error ? e.message : e}`);
    }
  }

  private async defaultHealthCheck(
    counters: XHealthCounters,
    context: XHealthContext,
  ): Promise<XHealthOutcome> {
    const { runXHealthCheck, xHealthConfigFromEnv } = await import("./x-health");
    const { feedbackEmail } = await import("../feedback");
    const { sendEmail } = await import("../email/send");
    return runXHealthCheck(
      counters,
      context,
      {
        loadState: this.deps.loadState,
        saveState: this.deps.saveState,
        sendEmail,
        recipient: feedbackEmail,
        now: () => Date.now(),
      },
      xHealthConfigFromEnv(),
    );
  }

  /** Persist the pending watermark — runIngest calls this only AFTER insertDocs
   *  succeeded, so a pass whose docs never landed re-covers its window next run. */
  async commitMarks(): Promise<void> {
    if (this.pendingLastPollAt === null) return;
    await this.deps.saveState(X_PROVIDER, { lastPollAt: this.pendingLastPollAt });
    this.pendingLastPollAt = null;
  }

  /** Backfill via last_tweets pagination (newest first), stopping per account
   *  once tweets are older than range.from — every returned tweet is billed,
   *  so the guard's run cap bounds worst-case spend. */
  async backfill(range: BackfillRange): Promise<RawDoc[]> {
    if (!this.apiKey) {
      console.warn(`${X_PROVIDER}: X_API_KEY unset — skipping backfill (fail-closed)`);
      return [];
    }
    // same single-writer rule as fetchLatest: paid work only under the lease
    const lease = await acquireXLease(
      `x-backfill-${randomUUID()}`,
      X_LEASE_TTL_MS,
      this.deps.leaseDriver,
    );
    if (!lease) {
      this.runStats.lockSkips = (this.runStats.lockSkips ?? 0) + 1;
      console.warn(`${X_PROVIDER}: provider lease held — skipping backfill (no paid calls)`);
      return [];
    }
    try {
      return await this.backfillUnderLease(range, lease);
    } finally {
      await lease.release();
    }
  }

  private async backfillUnderLease(
    range: BackfillRange,
    lease: { renew(): Promise<boolean> },
  ): Promise<RawDoc[]> {
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
        if (!(await lease.renew())) {
          console.warn(`${X_PROVIDER}: lease lost mid-backfill — stopping paid calls`);
          this.runStats.lockSkips = (this.runStats.lockSkips ?? 0) + 1;
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
