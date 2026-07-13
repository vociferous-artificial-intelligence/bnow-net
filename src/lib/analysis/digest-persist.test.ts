import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@neondatabase/serverless";
import type { PersistDigestArgs, PersistEvent } from "./digest-persist";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

// The embedding hook is the only ASK Tier-2+ surface in digest-persist. Mock both
// embedding modules so the persist path runs with no real client, DB, or network.
const { embedAndStoreClaimsMock, embedStubReasonMock } = vi.hoisted(() => ({
  embedAndStoreClaimsMock: vi.fn(),
  embedStubReasonMock: vi.fn<() => string | null>(() => null),
}));
vi.mock("../embeddings/persist", () => ({ embedAndStoreClaims: embedAndStoreClaimsMock }));
vi.mock("../embeddings/client", () => ({ embedStubReason: embedStubReasonMock }));

const { persistDigest } = await import("./digest-persist");

/** Fake pool/client covering the persistDigest query sequence. INSERT ... RETURNING
 *  id hands back deterministic ids; the prior-claims SELECT returns empty so the
 *  overwrite guard proceeds (priorClaims = 0). */
function fakePool() {
  let ev = 200;
  let cl = 300;
  let ent = 400;
  const client = {
    query: vi.fn(async (sql: string) => {
      if (/INSERT INTO digests/.test(sql)) return { rows: [{ id: 100 }] };
      if (/INSERT INTO events/.test(sql)) return { rows: [{ id: ++ev }] };
      if (/INSERT INTO claims/.test(sql) && /RETURNING id/.test(sql)) return { rows: [{ id: ++cl }] };
      if (/INSERT INTO entities/.test(sql)) return { rows: [{ id: ++ent }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async () => ({ rows: [] })), // prior-claims count -> priorClaims 0
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { pool, client };
}

const events: PersistEvent[] = [
  {
    title: "Event",
    type: "strike",
    summary: "Summary",
    claims: [
      { text: "claim one", claimType: "factual", hedging: "confirmed", docIds: [1], entities: [] },
    ],
  },
];

function argsFor(pool: Pool): PersistDigestArgs {
  return {
    pool,
    countryId: 1,
    countryIso2: "ru",
    date: "2026-07-11",
    track: "military",
    provider: "openai:test",
    structured: {},
    events,
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  embedAndStoreClaimsMock.mockReset();
  embedStubReasonMock.mockReset();
  embedStubReasonMock.mockReturnValue(null);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("persistDigest embedding hook", () => {
  it("calls the hook AFTER commit with the just-inserted claims on the live path", async () => {
    embedAndStoreClaimsMock.mockResolvedValue({
      embedded: 1,
      inserted: 1,
      costUsd: 0,
      tokens: 5,
      provider: "openai:m",
    });
    const { pool, client } = fakePool();
    const out = await persistDigest(argsFor(pool));
    expect(out).toEqual({ digestId: 100, claimCount: 1 });
    expect(embedAndStoreClaimsMock).toHaveBeenCalledWith(pool, [{ id: 301, text: "claim one" }]);
    const sqls = client.query.mock.calls.map((c) => c[0] as string);
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
  });

  it("is FAIL-OPEN: a throwing hook leaves persistDigest's result unchanged", async () => {
    embedAndStoreClaimsMock.mockRejectedValue(new Error("embed boom"));
    const { pool, client } = fakePool();
    const out = await persistDigest(argsFor(pool));
    expect(out).toEqual({ digestId: 100, claimCount: 1 });
    expect(embedAndStoreClaimsMock).toHaveBeenCalledOnce();
    const sqls = client.query.mock.calls.map((c) => c[0] as string);
    expect(sqls).toContain("COMMIT"); // committed, not rolled back
    expect(sqls).not.toContain("ROLLBACK");
    expect(warn).toHaveBeenCalledOnce(); // one fail-open warn
  });

  it("skips the hook entirely (one warn) on the stub/no-key/disabled path", async () => {
    embedStubReasonMock.mockReturnValue("no OPENAI_API_KEY");
    const { pool } = fakePool();
    const out = await persistDigest(argsFor(pool));
    expect(out).toEqual({ digestId: 100, claimCount: 1 });
    expect(embedAndStoreClaimsMock).not.toHaveBeenCalled(); // no OpenAI, no stub vectors written
    expect(warn).toHaveBeenCalledOnce();
  });
});

// ---- publication guard wiring (Workstream B, 2026-07-13) -----------------------

describe("persistDigest publication-guard wiring", () => {
  const grahamEvents: PersistEvent[] = [
    {
      title: "US Senator Lindsey Graham dies amid corruption scandal",
      type: "political",
      summary: "Reports suggest corruption may have influenced the circumstances of his death.",
      claims: [
        {
          text: "US Senator Lindsey Graham died amid corruption allegations",
          claimType: "factual",
          hedging: "claimed",
          docIds: [1, 2],
          entities: [{ name: "Lindsey Graham", kind: "person", role: "subject" }],
        },
      ],
    },
  ];

  it("persists the GUARDED shape (attributed title/claims) and records guard stats in structured", async () => {
    embedAndStoreClaimsMock.mockResolvedValue({ embedded: 1, inserted: 1, costUsd: 0, tokens: 5, provider: "openai:m" });
    const { pool, client } = fakePool();
    const out = await persistDigest({ ...argsFor(pool), events: grahamEvents });
    expect(out).toEqual({ digestId: 100, claimCount: 1 });

    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const evInsert = calls.find((c) => /INSERT INTO events/.test(c[0]))!;
    const evParams = evInsert[1] ?? [];
    expect(evParams.some((p) => typeof p === "string" && p.startsWith("Sources claim:"))).toBe(true);

    const clInsert = calls.find((c) => /INSERT INTO claims/.test(c[0]))!;
    const clParams = clInsert[1] ?? [];
    expect(clParams.some((p) => typeof p === "string" && p.startsWith("Sources claim:"))).toBe(true);

    const dInsert = calls.find((c) => /INSERT INTO digests/.test(c[0]))!;
    const structured = JSON.parse(dInsert[1]![3] as string) as {
      stats: { publicationGuard: { attributedClaims: number } };
    };
    expect(structured.stats.publicationGuard.attributedClaims).toBe(1);
  });

  it("runs the guard BEFORE the overwrite verdict: a guard-emptied regeneration is refused, keeping the prior digest", async () => {
    const singleDocReputational: PersistEvent[] = [
      {
        title: "Governor arrested",
        type: "political",
        summary: "The governor was arrested for embezzlement.",
        claims: [
          {
            text: "Governor Ivan Petrov was arrested for embezzlement",
            claimType: "factual",
            hedging: "claimed",
            docIds: [7], // below ALLEGATION_MIN_DOCS -> guard drops it
            entities: [{ name: "Ivan Petrov", kind: "person", role: "subject" }],
          },
        ],
      },
    ];
    const { pool, client } = fakePool();
    // Prior digest has 3 claims; the guard leaves ZERO events -> empty-regen refusal.
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ claims: 3 }] });
    const out = await persistDigest({ ...argsFor(pool), events: singleDocReputational });
    expect(out).toMatchObject({ skipped: "empty-regen", priorClaims: 3, newClaims: 0 });
    expect(client.query).not.toHaveBeenCalled(); // no transaction ever opened
  });
});
