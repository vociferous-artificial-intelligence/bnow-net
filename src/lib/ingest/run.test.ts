import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

// run.ts transitively imports src/db, which requires DATABASE_URL at module load
// (see stub-isolation.test.ts precedent). db.execute itself is mocked below so no
// real connection is ever attempted.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const dbExecute = vi.fn<(...args: unknown[]) => Promise<{ rows: Array<{ name: string }> }>>(
  async () => ({ rows: [] }),
);
vi.mock("@/db", () => ({
  db: { execute: (...args: unknown[]) => dbExecute(...args) },
  rawSql: {},
  schema: {},
}));

const { telegramChannelRoster, buildIngestAdapters } = await import("./run");
const {
  REGISTRY_TELEGRAM_TOP_N,
  REGISTRY_TELEGRAM_TOP_N_MTPROTO,
  REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER,
  TELEGRAM_CURATED,
} = await import("./config");

const dialect = new PgDialect();
/** Reconstructs {sql, params} from a drizzle SQL fragment so the WHERE-clause
 *  shape and bound values can be asserted without a live database. */
function textOf(sqlObj: unknown) {
  return dialect.sqlToQuery(sqlObj as Parameters<PgDialect["sqlToQuery"]>[0]);
}

describe("registryTelegramChannels theater filter (via telegramChannelRoster)", () => {
  it("adds the ir.theater filter, parameterized, when reportTheater is given", async () => {
    dbExecute.mockClear();
    await telegramChannelRoster({ topN: 10, reportTheater: "ru" });
    expect(dbExecute).toHaveBeenCalledTimes(1);
    const q = textOf(dbExecute.mock.calls[0][0]);
    expect(q.sql).toContain("ir.theater =");
    expect(q.params).toContain("ru");
    expect(q.params).toContain(10);
  });

  it("omits the theater filter when reportTheater is not given (pan-theater ranking)", async () => {
    dbExecute.mockClear();
    await telegramChannelRoster({ topN: 10 });
    const q = textOf(dbExecute.mock.calls[0][0]);
    expect(q.sql).not.toContain("ir.theater =");
    expect(q.params).not.toContain("ru");
  });

  it("omits the theater filter when reportTheater is explicitly null (the 'all' rollback)", async () => {
    dbExecute.mockClear();
    await telegramChannelRoster({ topN: 10, reportTheater: null });
    const q = textOf(dbExecute.mock.calls[0][0]);
    expect(q.sql).not.toContain("ir.theater =");
  });
});

describe("buildIngestAdapters telegram roster wiring", () => {
  it("mtproto builds its roster from the ROCA-only top-N registry query", async () => {
    dbExecute.mockClear();
    await buildIngestAdapters("mtproto");
    expect(dbExecute).toHaveBeenCalledTimes(1);
    const q = textOf(dbExecute.mock.calls[0][0]);
    expect(q.sql).toContain("ir.theater =");
    expect(q.params).toContain(REGISTRY_TELEGRAM_MTPROTO_REPORT_THEATER);
    expect(q.params).toContain(REGISTRY_TELEGRAM_TOP_N_MTPROTO);
  });

  it("web telegram keeps the pan-theater top-50 query unchanged", async () => {
    dbExecute.mockClear();
    await buildIngestAdapters("telegram");
    expect(dbExecute).toHaveBeenCalledTimes(1);
    const q = textOf(dbExecute.mock.calls[0][0]);
    expect(q.sql).not.toContain("ir.theater =");
    expect(q.params).toContain(REGISTRY_TELEGRAM_TOP_N);
  });
});

describe("telegramChannelRoster curated dedupe", () => {
  it("keeps the curated entry's casing and drops the registry's case-insensitive duplicate", async () => {
    dbExecute.mockClear();
    dbExecute.mockResolvedValueOnce({
      rows: [{ name: "RyBar" }, { name: "brand_new_channel" }],
    });
    const roster = await telegramChannelRoster({ topN: 5 });
    expect(TELEGRAM_CURATED.some((c) => c.channel === "rybar")).toBe(true);
    const rybarEntries = roster.filter((c) => c.channel.toLowerCase() === "rybar");
    expect(rybarEntries).toHaveLength(1);
    expect(rybarEntries[0].channel).toBe("rybar");
    expect(roster.some((c) => c.channel === "brand_new_channel")).toBe(true);
  });
});
