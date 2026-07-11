// Live Telegram ingestion over MTProto (gramJS): full channel history with stable
// message ids, replacing the shallow t.me/s/ preview scrape depth-wise. Named
// telegram_mtproto — the fixture stub that held this name was deleted when this
// landed (audit tooling no longer treats the name as contamination).
//
// The spend-guard analog here is flood/ban risk, not dollars (Telegram is free):
//  - peers are resolved ONCE and cached in telegram_channel_state — ResolveUsername
//    is among Telegram's most tightly flood-limited calls; a failed resolve backs
//    off exponentially via next_resolve_at, never a hot loop;
//  - hard per-run caps: channels/run (rotation picks the stalest first),
//    messages/channel, resolves/run, and a wall-clock budget under maxDuration;
//  - FLOOD_WAIT ≤ floodWaitMaxSec is slept and retried once (counted); anything
//    larger aborts the RUN (counted) — the next run resumes from the marks;
//  - strictly sequential fetch, ≥2s spacing between channels (scraper convention).
//
// High-water marks (last_message_id) advance via commitMarks() only after
// runIngest has inserted the docs, so a crash between fetch and insert re-covers
// the window; the cross-adapter external-id pre-filter absorbs the overlap.
// Cross-adapter dedupe CANNOT ride on content_hash — the adapter name is hashed
// in, and t.me preview text renders slightly differently from raw MTProto text —
// so a message already ingested as telegram_web is excluded by lower(external_id)
// lookup before insert; the map stage's doc_dedup near-dupe gate is the backstop.
//
// The StringSession (TELEGRAM_SESSION env, .telegram.session file locally) is a
// full-account bearer credential: it is never logged, never echoed, and absent
// session = warn + empty result (fail-closed), same shape as x-api without a key.

import { readFileSync } from "node:fs";
import { detectLang } from "../analysis/lang";
import { routeTheater } from "../ingest/theater";
import type { BackfillRange, RawDoc, SourceAdapter } from "./types";

export const MTPROTO_ADAPTER = "telegram_mtproto";

// -- MTProto seam (stubbed in tests, gramJS in prod) ------------------------------

export interface TgPeer {
  peerId: string; // Telegram channel id (bigint as decimal string)
  accessHash: string; // session-scoped peer credential (bigint as decimal string)
}

export interface TgMessage {
  id: number;
  text: string; // message text or media caption; "" when media-only
  dateUnix: number;
  views?: number | null;
  forwards?: number | null;
  hasMedia?: boolean;
}

/** The MTProto operations the adapter needs. */
export interface TgClient {
  connect(): Promise<void>;
  destroy(): Promise<void>;
  /** ResolveUsername — tightly flood-limited; call only on a peer-cache miss. */
  resolveChannel(username: string): Promise<TgPeer>;
  /** The newest messages, at most limit (first contact with a channel). */
  latestMessages(peer: TgPeer, limit: number): Promise<TgMessage[]>;
  /** Messages with id > minId in ASCENDING id order, at most limit — gap-free
   *  incremental reads: a burst larger than limit continues next run from the
   *  advanced mark instead of losing the middle. */
  newerMessages(peer: TgPeer, minId: number, limit: number): Promise<TgMessage[]>;
  /** Messages with id < offsetId (0 = from latest), newest-first, at most limit. */
  olderMessages(peer: TgPeer, offsetId: number, limit: number): Promise<TgMessage[]>;
}

/** Seconds Telegram asked us to wait, if this error is a flood/slow-mode wait
 *  (gramJS's whole flood error family carries a numeric `seconds`). */
export function floodWaitSeconds(e: unknown): number | null {
  if (e && typeof e === "object" && "seconds" in e) {
    const s = (e as { seconds: unknown }).seconds;
    if (typeof s === "number" && Number.isFinite(s) && s >= 0) return s;
  }
  return null;
}

// -- channel state (pg-backed in prod, in-memory in tests) -------------------------

export interface ChannelState {
  channel: string; // lowercase username
  peerId: string | null;
  accessHash: string | null;
  lastMessageId: number;
  backfillMinId: number | null;
  backfillDone: boolean;
  resolveFails: number;
  nextResolveAt: Date | null;
  lastFetchAt: Date | null;
  lastError: string | null;
}

export function blankState(channel: string): ChannelState {
  return {
    channel: channel.toLowerCase(),
    peerId: null,
    accessHash: null,
    lastMessageId: 0,
    backfillMinId: null,
    backfillDone: false,
    resolveFails: 0,
    nextResolveAt: null,
    lastFetchAt: null,
    lastError: null,
  };
}

export interface ChannelStateStore {
  load(channels: string[]): Promise<Map<string, ChannelState>>;
  save(state: ChannelState): Promise<void>;
}

/** external ids (lowercase) that already exist in raw_documents under EITHER
 *  telegram adapter — the cross-transport double-ingest gate. */
export type ExistingIdsFn = (externalIdsLower: string[]) => Promise<Set<string>>;

// -- normalization (pure) ----------------------------------------------------------

/** Same shape conventions as telegram-web: sourceKey t.me/<chan> (registry
 *  reliability continuity — the transport change must not mint a new source),
 *  externalId <chan>/<id>, theater = per-channel default corrected by content
 *  language (uk→ua, fa→ir; ruling 11). Original language preserved, no translation. */
export function messageToRawDoc(m: TgMessage, channel: string, defaultTheater: string): RawDoc {
  const chan = channel.toLowerCase();
  const text = m.text.trim();
  const lang = detectLang(text);
  return {
    adapter: MTPROTO_ADAPTER,
    externalId: `${chan}/${m.id}`,
    url: `https://t.me/${chan}/${m.id}`,
    title: null,
    content: text.slice(0, 8000),
    lang,
    countryIso2: routeTheater(lang, defaultTheater),
    publishedAt: m.dateUnix ? new Date(m.dateUnix * 1000) : null,
    sourceKey: `t.me/${chan}`,
    meta: {
      views: m.views ?? null,
      forwards: m.forwards ?? null,
      hasMedia: m.hasMedia ?? false,
    },
  };
}

// -- adapter -----------------------------------------------------------------------

export interface MtprotoOpts {
  maxChannelsPerRun?: number; // rotation window (stalest channels first)
  maxMsgsPerChannel?: number; // per run
  maxResolvesPerRun?: number; // ResolveUsername budget per run
  timeBudgetMs?: number; // wall clock, must sit under the route maxDuration
  floodWaitMaxSec?: number; // waits ≤ this are slept in-run; larger aborts the run
  spacingMs?: number; // pause between channels
  now?: () => number; // test hooks
  sleep?: (ms: number) => Promise<void>;
}

export interface MtprotoDeps {
  store: ChannelStateStore;
  existingIds: ExistingIdsFn;
  /** Client factory; called at most once per fetchLatest/backfill invocation. */
  client: () => Promise<TgClient>;
  /** Session presence check — the adapter never sees the value itself. */
  hasSession: () => boolean;
}

/** Resolve-failure backoff: 1h, 2h, 4h … capped at 48h. */
export function resolveBackoffMs(fails: number): number {
  return Math.min(3600_000 * 2 ** Math.max(0, fails - 1), 48 * 3600_000);
}

export class TelegramMtprotoAdapter implements SourceAdapter {
  readonly name = MTPROTO_ADAPTER;
  readonly live = true;

  /** Filled during fetch; persisted by commitMarks() after docs are inserted. */
  private pendingMarks = new Map<string, ChannelState>();
  runStats: Record<string, number> = {};

  constructor(
    private channels: Array<{ channel: string; countryIso2: string }>,
    private deps: MtprotoDeps,
    private opts: MtprotoOpts = {},
  ) {}

  private get o() {
    return {
      maxChannelsPerRun: this.opts.maxChannelsPerRun ?? 25,
      maxMsgsPerChannel: this.opts.maxMsgsPerChannel ?? 300,
      maxResolvesPerRun: this.opts.maxResolvesPerRun ?? 8,
      timeBudgetMs: this.opts.timeBudgetMs ?? 240_000,
      floodWaitMaxSec: this.opts.floodWaitMaxSec ?? 30,
      spacingMs: this.opts.spacingMs ?? 2000,
      now: this.opts.now ?? Date.now,
      sleep: this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    };
  }

  /** Stalest-first rotation: never-fetched channels lead, then oldest last_fetch_at.
   *  Channels in resolve backoff (no peer + next_resolve_at in the future) drop out. */
  pickChannels(
    states: Map<string, ChannelState>,
    nowMs: number,
  ): Array<{ channel: string; countryIso2: string; state: ChannelState }> {
    const eligible = this.channels
      .map((c) => ({
        ...c,
        state: states.get(c.channel.toLowerCase()) ?? blankState(c.channel),
      }))
      .filter(
        (c) =>
          c.state.peerId !== null ||
          c.state.nextResolveAt === null ||
          c.state.nextResolveAt.getTime() <= nowMs,
      );
    eligible.sort(
      (a, b) => (a.state.lastFetchAt?.getTime() ?? 0) - (b.state.lastFetchAt?.getTime() ?? 0),
    );
    return eligible.slice(0, this.o.maxChannelsPerRun);
  }

  /** Peer from cache, else one counted resolve. Returns null when the channel must
   *  be skipped this run (resolve budget spent, or resolve failed → backoff). May
   *  throw a flood error for the caller's run-level policy. */
  private async peerFor(
    client: TgClient,
    c: { channel: string; state: ChannelState },
    budget: { resolves: number },
  ): Promise<TgPeer | null> {
    const s = c.state;
    if (s.peerId && s.accessHash) return { peerId: s.peerId, accessHash: s.accessHash };
    if (budget.resolves >= this.o.maxResolvesPerRun) {
      this.bump("resolveBudgetSkips");
      return null;
    }
    budget.resolves++;
    this.bump("resolves");
    try {
      const peer = await client.resolveChannel(c.channel);
      s.peerId = peer.peerId;
      s.accessHash = peer.accessHash;
      s.resolveFails = 0;
      s.nextResolveAt = null;
      s.lastError = null;
      // Persist immediately: the peer cache must survive a later insert failure —
      // re-resolving is exactly the flood-limited call we are avoiding.
      await this.deps.store.save(s);
      return peer;
    } catch (e) {
      if (floodWaitSeconds(e) !== null) throw e; // run-level flood policy decides
      s.resolveFails += 1;
      s.nextResolveAt = new Date(this.o.now() + resolveBackoffMs(s.resolveFails));
      s.lastError = `resolve: ${e instanceof Error ? e.message : String(e)}`;
      await this.deps.store.save(s);
      this.bump("resolveFails");
      return null;
    }
  }

  /** In-run flood policy: sleep + retry once for small waits (budget permitting),
   *  abort the whole run for large ones. Returns "retry" | "abort". */
  private async onFlood(seconds: number, deadline: number): Promise<"retry" | "abort"> {
    const waitMs = seconds * 1000;
    if (seconds <= this.o.floodWaitMaxSec && this.o.now() + waitMs < deadline) {
      this.bump("floodWaitsHonored");
      await this.o.sleep(waitMs);
      return "retry";
    }
    this.bump("floodAborts");
    return "abort";
  }

  async fetchLatest(): Promise<RawDoc[]> {
    this.runStats = {};
    this.pendingMarks.clear();
    if (!this.deps.hasSession()) {
      console.warn(`${MTPROTO_ADAPTER}: no TELEGRAM_SESSION — skipping (fail-closed)`);
      return [];
    }
    const o = this.o;
    const started = o.now();
    const deadline = started + o.timeBudgetMs;

    const states = await this.deps.store.load(
      this.channels.map((c) => c.channel.toLowerCase()),
    );
    const picked = this.pickChannels(states, started);
    this.runStats.channelsPicked = picked.length;

    const docs: RawDoc[] = [];
    let client: TgClient | null = null;
    try {
      client = await this.deps.client();
      await client.connect();
      const budget = { resolves: 0 };

      run: for (const c of picked) {
        if (o.now() >= deadline) {
          this.bump("timeBudgetStops");
          break;
        }
        const s = c.state;
        let msgs: TgMessage[] | null = null; // null = channel skipped or errored
        for (;;) {
          try {
            const peer = await this.peerFor(client, c, budget);
            if (peer === null) break;
            // First contact reads one newest page; established marks read
            // ASCENDING from the mark, so bursts larger than the cap resume
            // next run instead of losing the middle of the gap.
            msgs =
              s.lastMessageId === 0
                ? await client.latestMessages(peer, o.maxMsgsPerChannel)
                : await client.newerMessages(peer, s.lastMessageId, o.maxMsgsPerChannel);
          } catch (e) {
            const wait = floodWaitSeconds(e);
            if (wait !== null) {
              if ((await this.onFlood(wait, deadline)) === "retry") continue;
              break run; // large wait: stop the whole run, marks resume next time
            }
            s.lastError = e instanceof Error ? e.message : String(e);
            await this.deps.store.save(s);
            this.bump("channelErrors");
            break;
          }
          break;
        }
        if (msgs === null) continue;

        docs.push(...(await this.docsFromMessages(msgs, c.channel, c.countryIso2)));
        // Mark covers ALL fetched ids (media-only included) so they are never refetched.
        const maxId = msgs.reduce((m, x) => Math.max(m, x.id), s.lastMessageId);
        this.pendingMarks.set(s.channel, {
          ...s,
          lastMessageId: maxId,
          lastFetchAt: new Date(o.now()),
          lastError: null,
        });
        await o.sleep(o.spacingMs);
      }
    } finally {
      await client?.destroy().catch(() => {});
    }

    this.runStats.docs = docs.length;
    this.runStats.ms = o.now() - started;
    return docs;
  }

  /** Full-history backfill toward range.from, resumable via backfill_min_id.
   *  Pages newest→oldest (the only direction Telegram history supports); the
   *  caller orders inserts by day. Respects the same caps and flood policy. */
  async backfill(range: BackfillRange): Promise<RawDoc[]> {
    this.runStats = {};
    this.pendingMarks.clear();
    if (!this.deps.hasSession()) {
      console.warn(`${MTPROTO_ADAPTER}: no TELEGRAM_SESSION — skipping backfill (fail-closed)`);
      return [];
    }
    const o = this.o;
    const started = o.now();
    const deadline = started + o.timeBudgetMs;
    const pageSize = 100;

    const states = await this.deps.store.load(
      this.channels.map((c) => c.channel.toLowerCase()),
    );
    const docs: RawDoc[] = [];
    let client: TgClient | null = null;
    try {
      client = await this.deps.client();
      await client.connect();
      const budget = { resolves: 0 };

      run: for (const c of this.channels) {
        if (o.now() >= deadline) {
          this.bump("timeBudgetStops");
          break;
        }
        const s = states.get(c.channel.toLowerCase()) ?? blankState(c.channel);
        if (s.backfillDone) continue;

        let peer: TgPeer | null = null;
        for (;;) {
          try {
            peer = await this.peerFor(client, { channel: c.channel, state: s }, budget);
          } catch (e) {
            // peerFor lets only flood errors escape; non-flood failures back off inside it.
            const wait = floodWaitSeconds(e);
            if (wait !== null && (await this.onFlood(wait, deadline)) === "retry") continue;
            break run;
          }
          break;
        }
        if (!peer) continue;

        let offsetId = s.backfillMinId ?? 0;
        let fetched = 0;
        while (fetched < o.maxMsgsPerChannel && o.now() < deadline) {
          let page: TgMessage[];
          try {
            page = await client.olderMessages(peer, offsetId, pageSize);
          } catch (e) {
            const wait = floodWaitSeconds(e);
            if (wait !== null) {
              if ((await this.onFlood(wait, deadline)) === "retry") continue;
              break run;
            }
            s.lastError = e instanceof Error ? e.message : String(e);
            await this.deps.store.save(s);
            this.bump("channelErrors");
            break;
          }
          if (page.length === 0) {
            s.backfillDone = true; // start of channel history
            break;
          }
          fetched += page.length;
          this.bump("msgsPaged", page.length);
          const inRange = page.filter(
            (m) => m.dateUnix * 1000 >= range.from.getTime() && m.dateUnix * 1000 <= range.to.getTime(),
          );
          docs.push(...(await this.docsFromMessages(inRange, c.channel, c.countryIso2)));
          offsetId = page.reduce((m, x) => Math.min(m, x.id), offsetId || Infinity);
          const oldest = page.reduce((m, x) => Math.min(m, x.dateUnix), Infinity);
          if (oldest * 1000 < range.from.getTime()) {
            s.backfillDone = true; // walked past the window
            break;
          }
          await o.sleep(o.spacingMs);
        }
        this.pendingMarks.set(s.channel, {
          ...s,
          backfillMinId: offsetId === 0 ? s.backfillMinId : offsetId,
        });
        await o.sleep(o.spacingMs);
      }
    } finally {
      await client?.destroy().catch(() => {});
    }

    this.runStats.docs = docs.length;
    this.runStats.ms = o.now() - started;
    return docs;
  }

  /** Persist high-water/backfill marks — runIngest (or the backfill script) calls
   *  this AFTER the returned docs are safely inserted. */
  async commitMarks(): Promise<void> {
    for (const s of this.pendingMarks.values()) await this.deps.store.save(s);
    this.pendingMarks.clear();
  }

  /** Normalize + drop empties + drop messages already ingested via EITHER
   *  telegram transport (case-insensitive external-id match). */
  private async docsFromMessages(
    msgs: TgMessage[],
    channel: string,
    theater: string,
  ): Promise<RawDoc[]> {
    const withText = msgs.filter((m) => m.text.trim().length > 0);
    this.bump("skippedEmpty", msgs.length - withText.length);
    if (withText.length === 0) return [];
    const candidate = withText.map((m) => messageToRawDoc(m, channel, theater));
    const existing = await this.deps.existingIds(candidate.map((d) => d.externalId!));
    const fresh = candidate.filter((d) => !existing.has(d.externalId!));
    this.bump("skippedExisting", candidate.length - fresh.length);
    this.bump("fetched", fresh.length);
    return fresh;
  }

  private bump(key: string, by = 1): void {
    this.runStats[key] = (this.runStats[key] ?? 0) + by;
  }
}

// -- prod wiring (DB store, dedupe query, gramJS client) ---------------------------

export function loadTelegramSession(): string | null {
  const env = process.env.TELEGRAM_SESSION?.trim();
  if (env) return env;
  try {
    return readFileSync(".telegram.session", "utf8").trim() || null;
  } catch {
    return null;
  }
}

export const pgChannelStateStore: ChannelStateStore = {
  async load(channels) {
    const { rawSql } = await import("@/db");
    const rows = (await rawSql.query(
      `SELECT channel, peer_id, access_hash, last_message_id, backfill_min_id,
              backfill_done, resolve_fails, next_resolve_at, last_fetch_at, last_error
       FROM telegram_channel_state WHERE channel = ANY($1::text[])`,
      [channels],
    )) as Array<{
      channel: string;
      peer_id: string | null;
      access_hash: string | null;
      last_message_id: number;
      backfill_min_id: number | null;
      backfill_done: boolean;
      resolve_fails: number;
      next_resolve_at: string | Date | null;
      last_fetch_at: string | Date | null;
      last_error: string | null;
    }>;
    const map = new Map<string, ChannelState>();
    for (const r of rows) {
      map.set(r.channel, {
        channel: r.channel,
        peerId: r.peer_id,
        accessHash: r.access_hash,
        lastMessageId: r.last_message_id,
        backfillMinId: r.backfill_min_id,
        backfillDone: r.backfill_done,
        resolveFails: r.resolve_fails,
        nextResolveAt: r.next_resolve_at ? new Date(r.next_resolve_at) : null,
        lastFetchAt: r.last_fetch_at ? new Date(r.last_fetch_at) : null,
        lastError: r.last_error,
      });
    }
    return map;
  },
  async save(s) {
    const { rawSql } = await import("@/db");
    await rawSql.query(
      `INSERT INTO telegram_channel_state
         (channel, peer_id, access_hash, last_message_id, backfill_min_id,
          backfill_done, resolve_fails, next_resolve_at, last_fetch_at, last_error, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (channel) DO UPDATE SET
         peer_id = EXCLUDED.peer_id, access_hash = EXCLUDED.access_hash,
         last_message_id = EXCLUDED.last_message_id,
         backfill_min_id = EXCLUDED.backfill_min_id,
         backfill_done = EXCLUDED.backfill_done,
         resolve_fails = EXCLUDED.resolve_fails,
         next_resolve_at = EXCLUDED.next_resolve_at,
         last_fetch_at = EXCLUDED.last_fetch_at,
         last_error = EXCLUDED.last_error, updated_at = now()`,
      [
        s.channel,
        s.peerId,
        s.accessHash,
        s.lastMessageId,
        s.backfillMinId,
        s.backfillDone,
        s.resolveFails,
        s.nextResolveAt,
        s.lastFetchAt,
        s.lastError,
      ],
    );
  },
};

export const pgExistingIds: ExistingIdsFn = async (ids) => {
  if (ids.length === 0) return new Set();
  const { rawSql } = await import("@/db");
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = (await rawSql.query(
      `SELECT lower(external_id) AS eid FROM raw_documents
       WHERE adapter IN ('telegram_web', $2) AND lower(external_id) = ANY($1::text[])`,
      [ids.slice(i, i + 500).map((x) => x.toLowerCase()), MTPROTO_ADAPTER],
    )) as Array<{ eid: string }>;
    for (const r of rows) found.add(r.eid);
  }
  return found;
};

/** gramJS-backed TgClient. Everything from the ONE root module — mixing `telegram`
 *  with subpath imports gives the bundler two module instances and gramJS rejects
 *  the foreign StringSession (probe finding, 2026-07-11). */
export async function gramjsTgClient(session: string): Promise<TgClient> {
  const { TelegramClient, Api, sessions } = await import("telegram");
  const { default: bigInt } = await import("big-integer");

  const apiId = Number(process.env.TELEGRAM_API_ID ?? "");
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("TELEGRAM_API_ID/HASH unset");
  }
  const client = new TelegramClient(new sessions.StringSession(session), apiId, apiHash, {
    connectionRetries: 2,
    useWSS: process.env.TG_MTPROTO_WSS === "1", // TCP default; WSS proven too (probe)
    deviceModel: "BNOW ingest",
    appVersion: "0.1.0",
    floodSleepThreshold: 0, // flood policy is OURS: counted sleeps, run-level aborts
  });
  client.setLogLevel("error" as Parameters<typeof client.setLogLevel>[0]);

  const inputPeer = (p: TgPeer) =>
    new Api.InputPeerChannel({ channelId: bigInt(p.peerId), accessHash: bigInt(p.accessHash) });
  const toTg = (msgs: Array<InstanceType<typeof Api.Message> | unknown>): TgMessage[] =>
    msgs
      .filter((m): m is InstanceType<typeof Api.Message> => m instanceof Api.Message)
      .map((m) => ({
        id: m.id,
        text: typeof m.message === "string" ? m.message : "",
        dateUnix: m.date,
        views: m.views ?? null,
        forwards: m.forwards ?? null,
        hasMedia: !!m.media,
      }));

  return {
    connect: async () => {
      await client.connect();
    },
    destroy: () => client.destroy(),
    async resolveChannel(username) {
      const e = await client.getInputEntity(username);
      if (!(e instanceof Api.InputPeerChannel)) {
        throw new Error(`@${username} resolves to ${e.className}, not a channel`);
      }
      return { peerId: e.channelId.toString(), accessHash: e.accessHash.toString() };
    },
    async latestMessages(peer, limit) {
      return toTg(await client.getMessages(inputPeer(peer), { limit }));
    },
    async newerMessages(peer, minId, limit) {
      // reverse iteration: ascending ids starting just above offsetId (telethon
      // semantics) — the gap-free incremental read newerMessages() promises.
      return toTg(await client.getMessages(inputPeer(peer), { reverse: true, offsetId: minId, limit }));
    },
    async olderMessages(peer, offsetId, limit) {
      return toTg(await client.getMessages(inputPeer(peer), { offsetId, limit }));
    },
  };
}

/** Production dependency set: pg store + pg dedupe + gramJS over the saved session. */
export function mtprotoDepsFromEnv(): MtprotoDeps {
  return {
    store: pgChannelStateStore,
    existingIds: pgExistingIds,
    hasSession: () => loadTelegramSession() !== null,
    client: () => gramjsTgClient(loadTelegramSession() ?? ""),
  };
}

/** Cap knobs, env-overridable like every other guard's. */
export function mtprotoOptsFromEnv(): MtprotoOpts {
  const num = (k: string, d: number) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    maxChannelsPerRun: num("TG_MTPROTO_CHANNELS_PER_RUN", 25),
    maxMsgsPerChannel: num("TG_MTPROTO_MSGS_PER_CHANNEL", 300),
    maxResolvesPerRun: num("TG_MTPROTO_RESOLVES_PER_RUN", 8),
    timeBudgetMs: num("TG_MTPROTO_TIME_BUDGET_MS", 240_000),
    floodWaitMaxSec: num("TG_MTPROTO_FLOOD_WAIT_MAX_SEC", 30),
    spacingMs: num("TG_MTPROTO_SPACING_MS", 2000),
  };
}
