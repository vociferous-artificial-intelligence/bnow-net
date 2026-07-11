import { describe, expect, it, vi } from "vitest";
import { parseChannelPage } from "./telegram-web";
import {
  TelegramMtprotoAdapter,
  blankState,
  floodWaitSeconds,
  messageToRawDoc,
  resolveBackoffMs,
  type ChannelState,
  type ChannelStateStore,
  type MtprotoDeps,
  type TgClient,
  type TgMessage,
  type TgPeer,
} from "./telegram-mtproto";

// -- harness -----------------------------------------------------------------------

function msg(id: number, text: string, dateUnix = 1_752_000_000, extra: Partial<TgMessage> = {}): TgMessage {
  return { id, text, dateUnix, ...extra };
}

function memStore(initial: ChannelState[] = []): ChannelStateStore & { rows: Map<string, ChannelState> } {
  const rows = new Map(initial.map((s) => [s.channel, s]));
  return {
    rows,
    async load(chs) {
      const out = new Map<string, ChannelState>();
      for (const c of chs) if (rows.has(c)) out.set(c, structuredClone(rows.get(c)!));
      return out;
    },
    async save(s) {
      rows.set(s.channel, structuredClone(s));
    },
  };
}

/** TgClient whose reads serve from a per-channel ascending history. */
function fakeClient(history: Record<string, TgMessage[]>): TgClient & {
  resolveChannel: ReturnType<typeof vi.fn>;
  latestMessages: ReturnType<typeof vi.fn>;
  newerMessages: ReturnType<typeof vi.fn>;
  olderMessages: ReturnType<typeof vi.fn>;
} {
  const peers = new Map(Object.keys(history).map((c, i) => [c, { peerId: String(100 + i), accessHash: "200" }]));
  const byPeer = new Map([...peers.entries()].map(([c, p]) => [p.peerId, history[c]]));
  return {
    connect: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    resolveChannel: vi.fn(async (username: string) => {
      const p = peers.get(username.toLowerCase());
      if (!p) throw new Error("USERNAME_NOT_OCCUPIED");
      return p;
    }),
    latestMessages: vi.fn(async (peer: TgPeer, limit: number) => {
      const h = byPeer.get(peer.peerId) ?? [];
      return h.slice(-limit).reverse(); // newest-first page
    }),
    newerMessages: vi.fn(async (peer: TgPeer, minId: number, limit: number) => {
      const h = byPeer.get(peer.peerId) ?? [];
      return h.filter((m) => m.id > minId).slice(0, limit); // ascending
    }),
    olderMessages: vi.fn(async (peer: TgPeer, offsetId: number, limit: number) => {
      const h = byPeer.get(peer.peerId) ?? [];
      return h
        .filter((m) => (offsetId === 0 ? true : m.id < offsetId))
        .slice(-limit)
        .reverse(); // newest-first
    }),
  };
}

function deps(
  client: TgClient,
  store: ChannelStateStore,
  existing: string[] = [],
): MtprotoDeps {
  return {
    store,
    existingIds: async (ids) => new Set(ids.filter((i) => existing.includes(i))),
    client: async () => client,
    hasSession: () => true,
  };
}

const INSTANT = { spacingMs: 0, sleep: async () => {} };

// -- normalization ------------------------------------------------------------------

describe("messageToRawDoc", () => {
  it("normalizes to the telegram-web conventions (sourceKey continuity)", () => {
    const d = messageToRawDoc(msg(42, "Численность войск возросла", 1_752_000_000, { views: 7, forwards: 2, hasMedia: true }), "DeepStateUA", "ua");
    expect(d.adapter).toBe("telegram_mtproto");
    expect(d.externalId).toBe("deepstateua/42");
    expect(d.url).toBe("https://t.me/deepstateua/42");
    expect(d.sourceKey).toBe("t.me/deepstateua");
    expect(d.publishedAt).toEqual(new Date(1_752_000_000 * 1000));
    expect(d.meta).toEqual({ views: 7, forwards: 2, hasMedia: true });
    expect(d.title).toBeNull();
  });

  it("shares the sourceKey with a preview-scraped doc of the same channel", () => {
    const html = `<div class="tgme_widget_message" data-post="DeepStateUA/42">
      <div class="tgme_widget_message_text">Ситуація на фронті станом на ранок</div>
      <time datetime="2026-07-09T10:00:00+00:00"></time></div>`;
    const [web] = parseChannelPage(html, "DeepStateUA", "ua");
    const mt = messageToRawDoc(msg(42, "Ситуація на фронті станом на ранок"), "DeepStateUA", "ua");
    expect(mt.sourceKey).toBe(web.sourceKey);
    expect(mt.externalId!.toLowerCase()).toBe(web.externalId!.toLowerCase());
  });

  it("keeps the channel default theater unless the language is unambiguous", () => {
    // Ukrainian overrides -> ua; Persian overrides -> ir (ruling 11)
    expect(messageToRawDoc(msg(1, "Сили оборони знищили ворожий склад боєприпасів"), "rybar", "ru").countryIso2).toBe("ua");
    expect(messageToRawDoc(msg(2, "نیروهای مسلح ایران در مانور شرکت کردند"), "nournews_ir", "ir").countryIso2).toBe("ir");
    // Arabic NEVER routes by language: the Lebanese channel keeps its ir pin
    expect(messageToRawDoc(msg(3, "أعلنت القوات المسلحة عن عملية جديدة في الجنوب"), "mtvlebanonews", "ir").countryIso2).toBe("ir");
  });

  it("preserves original language and truncates at 8000 chars", () => {
    const d = messageToRawDoc(msg(1, "х".repeat(9000)), "rybar", "ru");
    expect(d.lang).toBe("ru");
    expect(d.content.length).toBe(8000);
  });
});

// -- fetchLatest --------------------------------------------------------------------

const CHANNELS = [{ channel: "rybar", countryIso2: "ru" }];

describe("TelegramMtprotoAdapter.fetchLatest", () => {
  it("fails closed without a session: no docs, no client calls", async () => {
    const client = fakeClient({ rybar: [msg(1, "a")] });
    const d = { ...deps(client, memStore()), hasSession: () => false };
    const adapter = new TelegramMtprotoAdapter(CHANNELS, d, INSTANT);
    expect(await adapter.fetchLatest()).toEqual([]);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("first contact reads one newest page; established mark reads ascending increments", async () => {
    const store = memStore();
    const client = fakeClient({
      rybar: [msg(1, "первый"), msg(2, "второй"), msg(3, "третий")],
    });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);

    const first = await adapter.fetchLatest();
    expect(client.latestMessages).toHaveBeenCalledTimes(1);
    expect(client.newerMessages).not.toHaveBeenCalled();
    expect(first.map((d) => d.externalId)).toEqual(
      expect.arrayContaining(["rybar/1", "rybar/2", "rybar/3"]),
    );
    await adapter.commitMarks();
    expect(store.rows.get("rybar")!.lastMessageId).toBe(3);

    // channel gains message 4; the next run fetches ONLY it, via newerMessages(minId=3)
    const client2 = fakeClient({
      rybar: [msg(1, "первый"), msg(2, "второй"), msg(3, "третий"), msg(4, "четвёртый")],
    });
    const adapter2 = new TelegramMtprotoAdapter(CHANNELS, deps(client2, store), INSTANT);
    const second = await adapter2.fetchLatest();
    expect(client2.newerMessages).toHaveBeenCalledWith(expect.anything(), 3, expect.any(Number));
    expect(second.map((d) => d.externalId)).toEqual(["rybar/4"]);
    await adapter2.commitMarks();
    expect(store.rows.get("rybar")!.lastMessageId).toBe(4);
  });

  it("advances the mark past media-only messages without emitting docs", async () => {
    const store = memStore();
    const client = fakeClient({ rybar: [msg(5, "текст"), msg(6, "", 1_752_000_100, { hasMedia: true })] });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);
    const docs = await adapter.fetchLatest();
    expect(docs.map((d) => d.externalId)).toEqual(["rybar/5"]);
    expect(adapter.runStats.skippedEmpty).toBe(1);
    await adapter.commitMarks();
    expect(store.rows.get("rybar")!.lastMessageId).toBe(6); // media-only never refetched
  });

  it("marks advance ONLY via commitMarks (insert-gated), peer cache persists immediately", async () => {
    const store = memStore();
    const client = fakeClient({ rybar: [msg(9, "сообщение")] });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);
    await adapter.fetchLatest();
    // peer cached even though marks are not committed (an insert failure must not
    // force a re-resolve — that is the flood-limited call)
    expect(store.rows.get("rybar")!.peerId).toBe("100");
    expect(store.rows.get("rybar")!.lastMessageId).toBe(0);
    await adapter.commitMarks();
    expect(store.rows.get("rybar")!.lastMessageId).toBe(9);
  });

  it("reuses the cached peer: resolveChannel is never called once peer_id is stored", async () => {
    const store = memStore([
      { ...blankState("rybar"), peerId: "100", accessHash: "200", lastMessageId: 1 },
    ]);
    const client = fakeClient({ rybar: [msg(1, "старое"), msg(2, "новое")] });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);
    const docs = await adapter.fetchLatest();
    expect(client.resolveChannel).not.toHaveBeenCalled();
    expect(docs.map((d) => d.externalId)).toEqual(["rybar/2"]);
  });

  it("a failed resolve backs off with next_resolve_at instead of hot-looping", async () => {
    const store = memStore();
    const client = fakeClient({}); // knows no channels -> resolve throws
    const t0 = 1_752_000_000_000;
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), { ...INSTANT, now: () => t0 });
    expect(await adapter.fetchLatest()).toEqual([]);
    expect(client.resolveChannel).toHaveBeenCalledTimes(1);
    const s = store.rows.get("rybar")!;
    expect(s.resolveFails).toBe(1);
    expect(s.nextResolveAt!.getTime()).toBe(t0 + resolveBackoffMs(1));
    // still backing off -> the channel is not even picked, so no second resolve
    const adapter2 = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), { ...INSTANT, now: () => t0 + 1000 });
    expect(await adapter2.fetchLatest()).toEqual([]);
    expect(client.resolveChannel).toHaveBeenCalledTimes(1);
  });

  it("excludes messages already ingested via the preview scraper (case-insensitive)", async () => {
    const store = memStore();
    const client = fakeClient({ deepstateua: [msg(1, "Перше повідомлення"), msg(2, "Друге повідомлення")] });
    // telegram_web ingested this message as data-post "DeepStateUA/2" -> the
    // existing-id set the pg impl serves is lowercase
    const d = deps(client, store, ["deepstateua/2"]);
    const adapter = new TelegramMtprotoAdapter([{ channel: "DeepStateUA", countryIso2: "ua" }], d, INSTANT);
    const docs = await adapter.fetchLatest();
    expect(docs.map((x) => x.externalId)).toEqual(["deepstateua/1"]);
    expect(adapter.runStats.skippedExisting).toBe(1);
  });

  it("honors a small FLOOD_WAIT (sleep + one retry) and counts it", async () => {
    const store = memStore();
    const client = fakeClient({ rybar: [msg(1, "текст поста")] });
    const flood = Object.assign(new Error("A wait of 5 seconds is required"), { seconds: 5 });
    client.latestMessages.mockRejectedValueOnce(flood);
    const sleeps: number[] = [];
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), {
      spacingMs: 0,
      sleep: async (ms: number) => void sleeps.push(ms),
    });
    const docs = await adapter.fetchLatest();
    expect(docs).toHaveLength(1);
    expect(sleeps).toContain(5000);
    expect(adapter.runStats.floodWaitsHonored).toBe(1);
  });

  it("aborts the RUN on a large FLOOD_WAIT; committed marks cover only fetched channels", async () => {
    const store = memStore();
    const client = fakeClient({ alpha: [msg(1, "первый текст")], beta: [msg(7, "второй текст")] });
    const flood = Object.assign(new Error("A wait of 900 seconds is required"), { seconds: 900 });
    client.latestMessages.mockImplementation(async (peer: TgPeer) => {
      if (peer.peerId === "101") throw flood; // beta
      return [msg(1, "первый текст")];
    });
    const adapter = new TelegramMtprotoAdapter(
      [
        { channel: "alpha", countryIso2: "ru" },
        { channel: "beta", countryIso2: "ru" },
      ],
      deps(client, store),
      INSTANT,
    );
    const docs = await adapter.fetchLatest();
    expect(docs.map((d) => d.externalId)).toEqual(["alpha/1"]);
    expect(adapter.runStats.floodAborts).toBe(1);
    await adapter.commitMarks();
    expect(store.rows.get("alpha")!.lastMessageId).toBe(1);
    expect(store.rows.get("beta")?.lastMessageId ?? 0).toBe(0); // resumes next run
  });

  it("enforces channels/run, msgs/channel and resolves/run caps with stalest-first rotation", async () => {
    const old = new Date("2026-07-01T00:00:00Z");
    const older = new Date("2026-06-01T00:00:00Z");
    const store = memStore([
      { ...blankState("a"), peerId: "100", accessHash: "200", lastMessageId: 1, lastFetchAt: old },
      { ...blankState("b"), peerId: "101", accessHash: "200", lastMessageId: 1, lastFetchAt: older },
      { ...blankState("c"), peerId: "102", accessHash: "200", lastMessageId: 1, lastFetchAt: new Date() },
    ]);
    const client = fakeClient({ a: [msg(2, "aa")], b: [msg(2, "bb")], c: [msg(2, "cc")] });
    const adapter = new TelegramMtprotoAdapter(
      [
        { channel: "a", countryIso2: "ru" },
        { channel: "b", countryIso2: "ru" },
        { channel: "c", countryIso2: "ru" },
      ],
      deps(client, store),
      { ...INSTANT, maxChannelsPerRun: 2, maxMsgsPerChannel: 150 },
    );
    const docs = await adapter.fetchLatest();
    // b (stalest) and a run; c (freshest) rotates out
    expect(docs.map((d) => d.externalId).sort()).toEqual(["a/2", "b/2"]);
    expect(client.newerMessages).toHaveBeenCalledWith(expect.anything(), 1, 150);
    expect(client.newerMessages).toHaveBeenCalledTimes(2);

    // resolve budget: two unresolved channels, budget 1 -> exactly one resolve attempt
    const store2 = memStore();
    const client2 = fakeClient({ x: [msg(1, "xx")], y: [msg(1, "yy")] });
    const adapter2 = new TelegramMtprotoAdapter(
      [
        { channel: "x", countryIso2: "ru" },
        { channel: "y", countryIso2: "ru" },
      ],
      deps(client2, store2),
      { ...INSTANT, maxResolvesPerRun: 1 },
    );
    await adapter2.fetchLatest();
    expect(client2.resolveChannel).toHaveBeenCalledTimes(1);
    expect(adapter2.runStats.resolveBudgetSkips).toBe(1);
  });

  it("stops at the time budget and counts it", async () => {
    let t = 0;
    const store = memStore([
      { ...blankState("a"), peerId: "100", accessHash: "200", lastMessageId: 1 },
      { ...blankState("b"), peerId: "101", accessHash: "200", lastMessageId: 1 },
    ]);
    const client = fakeClient({ a: [msg(2, "aa")], b: [msg(2, "bb")] });
    const adapter = new TelegramMtprotoAdapter(
      [
        { channel: "a", countryIso2: "ru" },
        { channel: "b", countryIso2: "ru" },
      ],
      deps(client, store),
      { ...INSTANT, timeBudgetMs: 100, now: () => (t += 60) }, // 2nd channel check exceeds budget
    );
    const docs = await adapter.fetchLatest();
    expect(docs.length).toBeLessThan(2);
    expect(adapter.runStats.timeBudgetStops).toBe(1);
  });
});

// -- backfill -----------------------------------------------------------------------

describe("TelegramMtprotoAdapter.backfill", () => {
  const DAY = 86_400;
  const T0 = 1_751_500_800; // window start (unix)
  const range = { from: new Date(T0 * 1000), to: new Date((T0 + 3 * DAY) * 1000) };

  it("pages history down to the window edge, resumably", async () => {
    const store = memStore([{ ...blankState("rybar"), peerId: "100", accessHash: "200" }]);
    // ids 1..6, one per day, oldest BELOW the window so the walk terminates
    const history = [1, 2, 3, 4, 5, 6].map((i) => msg(i, `пост номер ${i}`, T0 + (i - 3) * DAY));
    const client = fakeClient({ rybar: history });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);
    const docs = await adapter.backfill(range);
    // in-window = days 0..3 -> ids 3,4,5,6
    expect(docs.map((d) => d.externalId).sort()).toEqual(["rybar/3", "rybar/4", "rybar/5", "rybar/6"]);
    await adapter.commitMarks();
    expect(store.rows.get("rybar")!.backfillDone).toBe(true);

    // a completed channel is skipped on the next backfill call
    const client2 = fakeClient({ rybar: history });
    const adapter2 = new TelegramMtprotoAdapter(CHANNELS, deps(client2, store), INSTANT);
    expect(await adapter2.backfill(range)).toEqual([]);
    expect(client2.olderMessages).not.toHaveBeenCalled();
  });

  it("resumes from backfill_min_id after an interrupted run", async () => {
    const history = [1, 2, 3, 4, 5, 6].map((i) => msg(i, `пост номер ${i}`, T0 + (i - 3) * DAY));
    const store = memStore([
      { ...blankState("rybar"), peerId: "100", accessHash: "200", backfillMinId: 5 },
    ]);
    const client = fakeClient({ rybar: history });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), INSTANT);
    const docs = await adapter.backfill(range);
    expect(client.olderMessages).toHaveBeenCalledWith(expect.anything(), 5, expect.any(Number));
    expect(docs.map((d) => d.externalId).sort()).toEqual(["rybar/3", "rybar/4"]);
  });

  it("caps messages paged per channel per run", async () => {
    const history = Array.from({ length: 30 }, (_, i) => msg(i + 1, `пост ${i + 1}`, T0 + DAY));
    const store = memStore([{ ...blankState("rybar"), peerId: "100", accessHash: "200" }]);
    const client = fakeClient({ rybar: history });
    const adapter = new TelegramMtprotoAdapter(CHANNELS, deps(client, store), {
      ...INSTANT,
      maxMsgsPerChannel: 10,
    });
    await adapter.backfill(range);
    expect(adapter.runStats.msgsPaged).toBeLessThanOrEqual(10 + 100); // one page overshoot max
    await adapter.commitMarks();
    expect(store.rows.get("rybar")!.backfillDone).toBe(false); // more work remains
    expect(store.rows.get("rybar")!.backfillMinId).toBeGreaterThan(0);
  });
});

// -- helpers ------------------------------------------------------------------------

describe("floodWaitSeconds / resolveBackoffMs", () => {
  it("recognizes gramJS flood errors by their numeric seconds", () => {
    expect(floodWaitSeconds(Object.assign(new Error("flood"), { seconds: 17 }))).toBe(17);
    expect(floodWaitSeconds(new Error("CHANNEL_PRIVATE"))).toBeNull();
    expect(floodWaitSeconds(null)).toBeNull();
    expect(floodWaitSeconds({ seconds: "17" })).toBeNull();
  });

  it("backoff doubles from 1h and caps at 48h", () => {
    expect(resolveBackoffMs(1)).toBe(3600_000);
    expect(resolveBackoffMs(2)).toBe(7200_000);
    expect(resolveBackoffMs(10)).toBe(48 * 3600_000);
  });
});
