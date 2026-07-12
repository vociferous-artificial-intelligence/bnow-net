import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@neondatabase/serverless";
import type { SpendGuard } from "../usage/spend-guard";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// Mock only embedTexts on the client; keep embedModel/EMBED_STUB_PROVIDER real so
// the ON CONFLICT model param and stub-provider constant are the production values.
const { embedTextsMock } = vi.hoisted(() => ({ embedTextsMock: vi.fn() }));
vi.mock("./client", async (orig) => {
  const actual = await orig<typeof import("./client")>();
  return { ...actual, embedTexts: embedTextsMock };
});

const { embedAndStoreClaims } = await import("./persist");

/** Fake pool recording every INSERT; rowCount per call from `rowCounts`. */
function fakePool(rowCounts: number[] = []) {
  const queries: { text: string; params: unknown[] }[] = [];
  let i = 0;
  const pool = {
    query: async (text: string, params: unknown[]) => {
      queries.push({ text, params });
      return { rowCount: rowCounts[i++] ?? 1, rows: [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

/** Pre-initialised guard double (embedTexts is mocked, so it is never consulted). */
const guard = {
  init: async () => {},
  tryReserve: () => ({ ok: true }),
  record: async () => {},
} as unknown as SpendGuard;

beforeEach(() => embedTextsMock.mockReset());

describe("embedAndStoreClaims", () => {
  it("refuses to persist STUB vectors (truth-in-UI analog)", async () => {
    embedTextsMock.mockResolvedValue({
      vectors: [[0.1, 0.2]],
      tokens: 0,
      costUsd: 0,
      provider: "stub",
    });
    const { pool, queries } = fakePool();
    const res = await embedAndStoreClaims(pool, [{ id: 1, text: "x" }], { guard });
    expect(res.skipped).toBe("stub");
    expect(res.inserted).toBe(0);
    expect(queries).toHaveLength(0); // never touched claim_embeddings
  });

  it("short-circuits on empty input without embedding or querying", async () => {
    const { pool, queries } = fakePool();
    const res = await embedAndStoreClaims(pool, [], { guard });
    expect(res.skipped).toBe("empty");
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(queries).toHaveLength(0);
  });

  it("upserts real vectors as pgvector literals, ON CONFLICT DO NOTHING", async () => {
    embedTextsMock.mockResolvedValue({
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      tokens: 10,
      costUsd: 0.0002,
      provider: "openai:text-embedding-3-small",
    });
    const { pool, queries } = fakePool([1, 1]);
    const res = await embedAndStoreClaims(
      pool,
      [
        { id: 11, text: "a" },
        { id: 22, text: "b" },
      ],
      { guard },
    );
    expect(res.inserted).toBe(2);
    expect(res.provider).toContain("openai");
    expect(res.costUsd).toBe(0.0002);
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toContain("INSERT INTO claim_embeddings");
    expect(queries[0].text).toContain("ON CONFLICT (claim_id, model) DO NOTHING");
    expect(queries[0].params[0]).toBe(11); // claim_id
    expect(queries[0].params[1]).toBe("text-embedding-3-small"); // active model
    expect(queries[0].params[2]).toBe(2); // dims = vector length
    expect(queries[0].params[3]).toBe("[0.1,0.2]"); // pgvector text literal
    expect(queries[1].params[3]).toBe("[0.3,0.4]");
  });

  it("counts only rows actually inserted (ON CONFLICT skips return rowCount 0)", async () => {
    embedTextsMock.mockResolvedValue({
      vectors: [[1], [2]],
      tokens: 5,
      costUsd: 0.0001,
      provider: "openai:m",
    });
    const { pool } = fakePool([1, 0]); // second row already present
    const res = await embedAndStoreClaims(
      pool,
      [
        { id: 1, text: "a" },
        { id: 2, text: "b" },
      ],
      { guard },
    );
    expect(res.inserted).toBe(1);
    expect(res.embedded).toBe(2);
  });

  it("honours an explicit model override", async () => {
    embedTextsMock.mockResolvedValue({
      vectors: [[9]],
      tokens: 1,
      costUsd: 0,
      provider: "openai:custom",
    });
    const { pool, queries } = fakePool([1]);
    await embedAndStoreClaims(pool, [{ id: 3, text: "c" }], { guard, model: "custom-model" });
    expect(queries[0].params[1]).toBe("custom-model");
  });
});
