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
 *  overwrite guard proceeds (priorClaims = 0). `entitySeed` populates the
 *  canonical-identity cache SELECT; `docRows` serves the evidence-recency
 *  raw_documents read (filtered by the requested ids, driver-realistic Dates). */
function fakePool(
  entitySeed: Array<{ id: number; kind: string; name: string }> = [],
  docRows: Array<{ id: number; published_at: Date | string | null; fetched_at: Date | string | null }> = [],
) {
  let ev = 200;
  let cl = 300;
  let ent = 400;
  const client = {
    query: vi.fn(async (sql: string) => {
      if (/INSERT INTO digests/.test(sql)) return { rows: [{ id: 100 }] };
      if (/INSERT INTO events/.test(sql)) return { rows: [{ id: ++ev }] };
      if (/INSERT INTO claims/.test(sql) && /RETURNING id/.test(sql)) return { rows: [{ id: ++cl }] };
      if (/SELECT id, kind, name FROM entities/.test(sql)) return { rows: entitySeed };
      if (/INSERT INTO entities/.test(sql)) return { rows: [{ id: ++ent }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (/FROM raw_documents/.test(sql)) {
        const ids = new Set((params?.[0] as number[]) ?? []);
        return { rows: docRows.filter((r) => ids.has(r.id)) };
      }
      return { rows: [] }; // prior-claims count -> priorClaims 0
    }),
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

const AS_OF = "2026-07-12T00:00:00.000Z"; // exclusive end of the 2026-07-11 UTC day

function argsFor(pool: Pool): PersistDigestArgs {
  return {
    pool,
    countryId: 1,
    countryIso2: "ru",
    date: "2026-07-11",
    track: "military",
    asOf: AS_OF,
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

// ---- entity canonical identity (2026-07-13 remediation) ------------------------

describe("persistDigest entity get-or-create resolves canonical identity", () => {
  const VOROBYOV = { id: 42, kind: "person", name: "Andrey Vorobyov" };

  type EntityKind = NonNullable<PersistEvent["claims"][number]["entities"]>[number]["kind"];

  function eventsWithEntities(
    ...entities: Array<{ name: string; kind: EntityKind }>
  ): PersistEvent[] {
    return [
      {
        title: "Event",
        type: "political",
        summary: "Summary",
        claims: entities.map((e, i) => ({
          text: `claim ${i}`,
          claimType: "factual" as const,
          hedging: "confirmed",
          docIds: [1],
          entities: [{ name: e.name, kind: e.kind, role: "subject" }],
        })),
      },
    ];
  }

  function callsOf(client: { query: ReturnType<typeof vi.fn> }) {
    return client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
  }

  it("a Cyrillic raw spelling reuses the canonical row and appends itself to aliases", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    const out = await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities({ name: "Андрей Воробьёв", kind: "person" }),
    });
    expect(out).toMatchObject({ digestId: 100 });

    const calls = callsOf(client);
    // No duplicate entity row is created…
    expect(calls.some((c) => /INSERT INTO entities/.test(c[0]))).toBe(false);
    // …the claim links to the CANONICAL row…
    const link = calls.find((c) => /INSERT INTO claim_entities/.test(c[0]))!;
    expect(link[1]![1]).toBe(42);
    // …and the raw spelling is retained as an alias on it.
    const alias = calls.find((c) => /UPDATE entities SET aliases/.test(c[0]))!;
    expect(alias[1]).toEqual([42, JSON.stringify(["Андрей Воробьёв"])]);
  });

  it("both Cyrillic ё/е variants resolve to the same canonical entity", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities(
        { name: "Андрей Воробьёв", kind: "person" },
        { name: "Андрей Воробьев", kind: "person" },
      ),
    });
    const calls = callsOf(client);
    const links = calls.filter((c) => /INSERT INTO claim_entities/.test(c[0]));
    expect(links).toHaveLength(2);
    expect(links.map((c) => c[1]![1])).toEqual([42, 42]);
    expect(calls.some((c) => /INSERT INTO entities/.test(c[0]))).toBe(false);
  });

  it("repeated persistence with the stored spelling is idempotent: reuse, no alias write, no insert", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities({ name: "Andrey Vorobyov", kind: "person" }),
    });
    const calls = callsOf(client);
    expect(calls.some((c) => /INSERT INTO entities/.test(c[0]))).toBe(false);
    expect(calls.some((c) => /UPDATE entities SET aliases/.test(c[0]))).toBe(false);
    expect(calls.find((c) => /INSERT INTO claim_entities/.test(c[0]))![1]![1]).toBe(42);
  });

  it("an unrelated same-surname person does NOT merge — it gets its own row", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities({ name: "Pavel Vorobyov", kind: "person" }),
    });
    const calls = callsOf(client);
    const ins = calls.find((c) => /INSERT INTO entities/.test(c[0]))!;
    expect(ins[1]).toEqual(["person", "Pavel Vorobyov"]);
    expect(calls.some((c) => /UPDATE entities SET aliases/.test(c[0]))).toBe(false);
  });

  it("an ambiguous bare surname does NOT auto-merge into the full-name entity", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities({ name: "Vorobyov", kind: "person" }),
    });
    const calls = callsOf(client);
    expect(calls.find((c) => /INSERT INTO entities/.test(c[0]))![1]).toEqual([
      "person",
      "Vorobyov",
    ]);
  });

  it("entity kind is part of the identity: same name, different kind, separate row", async () => {
    const { pool, client } = fakePool([VOROBYOV]);
    await persistDigest({
      ...argsFor(pool),
      events: eventsWithEntities({ name: "Andrey Vorobyov", kind: "org" }),
    });
    const calls = callsOf(client);
    expect(calls.find((c) => /INSERT INTO entities/.test(c[0]))![1]).toEqual([
      "org",
      "Andrey Vorobyov",
    ]);
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
    // a refused persist stores nothing, so it computes nothing: the only pool
    // read is the prior-claims count — no evidence-recency raw_documents read
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ---- evidence-recency wiring (quality foundation, 2026-08-17) ------------------

describe("persistDigest evidence-recency wiring", () => {
  const PUBLISHED = new Date("2026-07-11T09:00:00Z"); // 15h before AS_OF
  const FETCHED = new Date("2026-07-11T10:00:00Z");

  beforeEach(() => {
    embedAndStoreClaimsMock.mockResolvedValue({
      embedded: 1,
      inserted: 1,
      costUsd: 0,
      tokens: 5,
      provider: "openai:m",
    });
  });

  it("persists structured.stats.evidenceRecency additively — caller stats keys survive verbatim", async () => {
    const { pool, client } = fakePool([], [{ id: 1, published_at: PUBLISHED, fetched_at: FETCHED }]);
    const out = await persistDigest({
      ...argsFor(pool),
      structured: { stats: { engine: "mapreduce", docsAnalyzed: 7 } },
    });
    expect(out).toEqual({ digestId: 100, claimCount: 1 });

    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const dInsert = calls.find((c) => /INSERT INTO digests/.test(c[0]))!;
    const structured = JSON.parse(dInsert[1]![3] as string) as { stats: Record<string, unknown> };
    // no existing stats key changes; the two persist-owned keys are appended
    expect(Object.keys(structured.stats)).toEqual([
      "engine",
      "docsAnalyzed",
      "publicationGuard",
      "evidenceRecency",
    ]);
    expect(structured.stats.engine).toBe("mapreduce");
    expect(structured.stats.docsAnalyzed).toBe(7);
    const er = structured.stats.evidenceRecency as Record<string, unknown>;
    expect(er.version).toBe(1);
    expect(er.asOf).toBe(AS_OF);
    expect(er.claimCount).toBe(1);
    expect(er.documentCount).toBe(1);
    expect(er.publishedTimestampUsed).toBe(1);
    expect(er.medianEvidenceAgeHours).toBe(15);
    expect(er.medianIngestionLagHours).toBe(1);
    expect(er.staleClaimsOver48hPct).toBe(0);
  });

  it("excludes stub documents at the query level (ruling 3)", async () => {
    const { pool } = fakePool([], [{ id: 1, published_at: PUBLISHED, fetched_at: FETCHED }]);
    await persistDigest(argsFor(pool));
    const read = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      /FROM raw_documents/.test(c[0] as string),
    )!;
    expect(read[0]).toContain("content NOT LIKE");
    expect((read[1] as unknown[])[1]).toBe("[STUB FIXTURE]%");
  });

  it("measures the POST-guard population: a dropped claim's solely-cited doc leaves it", async () => {
    const { pool, client } = fakePool(
      [],
      [
        { id: 1, published_at: PUBLISHED, fetched_at: FETCHED },
        { id: 7, published_at: PUBLISHED, fetched_at: FETCHED },
      ],
    );
    const mixed: PersistEvent[] = [
      {
        title: "Mixed event",
        type: "political",
        summary: "s",
        claims: [
          { text: "claim one", claimType: "factual", hedging: "confirmed", docIds: [1], entities: [] },
          {
            // single-doc disputed reputational person allegation -> guard R1 drop
            text: "Governor Ivan Petrov was arrested for embezzlement",
            claimType: "factual",
            hedging: "claimed",
            docIds: [7],
            entities: [{ name: "Ivan Petrov", kind: "person", role: "subject" }],
          },
        ],
      },
    ];
    const out = await persistDigest({ ...argsFor(pool), events: mixed });
    expect(out).toEqual({ digestId: 100, claimCount: 1 });

    const read = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      /FROM raw_documents/.test(c[0] as string),
    )!;
    expect((read[1] as unknown[])[0]).toEqual([1]); // doc 7 left the population with its claim

    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const dInsert = calls.find((c) => /INSERT INTO digests/.test(c[0]))!;
    const structured = JSON.parse(dInsert[1]![3] as string) as { stats: Record<string, unknown> };
    const er = structured.stats.evidenceRecency as Record<string, unknown>;
    expect(er.documentCount).toBe(1);
    expect(er.claimCount).toBe(1);
  });

  it("is FAIL-OPEN: a failing recency read warns once and persists without the key", async () => {
    const { pool, client } = fakePool();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if (/FROM raw_documents/.test(sql)) throw new Error("recency read boom");
      return { rows: [] };
    });
    const out = await persistDigest(argsFor(pool));
    expect(out).toEqual({ digestId: 100, claimCount: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("evidence-recency stats failed"));

    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const dInsert = calls.find((c) => /INSERT INTO digests/.test(c[0]))!;
    const structured = JSON.parse(dInsert[1]![3] as string) as { stats: Record<string, unknown> };
    expect(structured.stats.publicationGuard).toBeTruthy();
    expect(structured.stats).not.toHaveProperty("evidenceRecency");
  });

  it("an empty-corpus doc read still yields honest zero/null stats", async () => {
    const { pool, client } = fakePool(); // no docRows -> the read returns []
    const out = await persistDigest(argsFor(pool));
    expect(out).toEqual({ digestId: 100, claimCount: 1 });
    const calls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>;
    const dInsert = calls.find((c) => /INSERT INTO digests/.test(c[0]))!;
    const structured = JSON.parse(dInsert[1]![3] as string) as { stats: Record<string, unknown> };
    const er = structured.stats.evidenceRecency as Record<string, unknown>;
    expect(er.documentCount).toBe(0);
    expect(er.claimCount).toBe(1);
    expect(er.timestampCoveragePct).toBeNull();
    expect(er.unknownAgeClaimPct).toBe(100);
  });
});
