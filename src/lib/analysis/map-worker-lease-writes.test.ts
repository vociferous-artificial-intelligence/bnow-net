import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapLeaseDriver } from "./map-lease";

// ---------------------------------------------------------------------------
// ALWAYS-RUN pins for the two map-write invariants the 2026-08-18 independent
// audit found covered only by the Neon-gated integration suite:
//
//   REMAP-1  remap mode NEVER writes or marks raw_documents.processed. Deleting
//            the `!opts.remap` guard passed the ENTIRE pre-push gate, exactly
//            the shape ruling 21 forced companion unit pins for.
//   L4-1     two of the four lease-gated write paths — the mirror/doc_dedup
//            transaction and the final `processed = true` update — had ZERO
//            lost-lease coverage (persistBatch was the only covered one).
//
// Everything runs against an in-memory Pool: no database, no network, no paid
// provider call. Each protected write is exercised BOTH ways — once with a
// healthy lease (the write happens: the assertion is not vacuous) and once
// with the lease lost at that exact gate (the write must not happen, and
// nothing later may slip through).
// ---------------------------------------------------------------------------

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

type Q = { sql: string; params: unknown[] };

const h = vi.hoisted(() => ({
  poolQueries: [] as Q[],
  clientQueries: [] as Q[],
  /** ordered ledger of the safety-relevant events, for ordering assertions */
  order: [] as string[],
  connects: 0,
  openaiConstructed: 0,
  openaiCalls: 0,
  guardInits: 0,
  reservations: 0,
  meterings: 0,
  /** per-test SQL responder, matched on the query text */
  rowsFor: ((): unknown[] => []) as (sql: string, params: unknown[]) => unknown[],
  /** completion the stub client returns */
  completionContent: "" as string,
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class FakePool {
    // constructor args (the connection string) are deliberately ignored
    async query(sql: string, params: unknown[] = []) {
      h.poolQueries.push({ sql, params });
      h.order.push(`pool.query:${label(sql)}`);
      return { rows: h.rowsFor(sql, params) };
    }
    async connect() {
      h.connects++;
      h.order.push("pool.connect");
      return {
        query: async (sql: string, params: unknown[] = []) => {
          h.clientQueries.push({ sql, params });
          h.order.push(`client.query:${label(sql)}`);
          return { rows: h.rowsFor(sql, params) };
        },
        release: () => {},
      };
    }
    async end() {}
  },
}));

vi.mock("./openai-client", () => ({
  analysisOpenAiClient: () => {
    h.openaiConstructed++;
    h.order.push("openai.construct");
    return {
      chat: {
        completions: {
          create: async () => {
            h.openaiCalls++;
            h.order.push("openai.call");
            return {
              choices: [{ finish_reason: "stop", message: { content: h.completionContent } }],
              usage: { prompt_tokens: 100, completion_tokens: 50 },
            };
          },
        },
      },
    };
  },
}));

vi.mock("../usage/llm-guard", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../usage/llm-guard")>();
  return {
    ...orig,
    mapGuardFromEnv: () => ({
      runStats: { usd: 0, requests: h.reservations },
      init: async () => {
        h.guardInits++;
        h.order.push("guard.init");
      },
      tryReserve: () => {
        h.reservations++;
        h.order.push("guard.reserve");
        return { ok: true } as const;
      },
      record: async () => {
        h.meterings++;
        h.order.push("guard.record");
      },
    }),
  };
});

const { runMapCycle } = await import("./map-worker");
const { mapExtractorVersion } = await import("./map-prompts");

/** short, stable label for the ordering ledger */
function label(sql: string): string {
  if (/canonical_url AS source_key/.test(sql)) return "select-candidates";
  if (/rd\.processed = true/.test(sql) && /AS text2k/.test(sql)) return "select-dedup-refs";
  if (/FROM doc_map_state/.test(sql)) return "select-doc-map-state";
  if (/INSERT INTO doc_dedup/.test(sql)) return "WRITE-doc-dedup";
  if (/INSERT INTO doc_claims/.test(sql)) return "WRITE-doc-claims";
  if (/INSERT INTO doc_map_state/.test(sql)) return "WRITE-doc-map-state";
  if (/UPDATE raw_documents SET processed/.test(sql)) return "WRITE-processed";
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/.test(sql)) return sql.trim();
  return "other";
}

const WRITE = /^(INSERT|UPDATE|DELETE)\b/i;
const allQueries = () => [...h.poolQueries, ...h.clientQueries];
const writes = () => allQueries().filter((q) => WRITE.test(q.sql.trim()));
const matching = (re: RegExp) => allQueries().filter((q) => re.test(q.sql));

/** Controllable lease driver. `failRenewFrom: 1` loses the lease at the FIRST
 *  ownership re-check, `2` at the second, and so on — which is how each write
 *  gate is targeted precisely. */
function leaseDriver(cfg: { busy?: boolean; throwOnRead?: boolean; failRenewFrom?: number } = {}) {
  let renews = 0;
  let lost = false;
  const driver: MapLeaseDriver = {
    async read() {
      if (cfg.throwOnRead) throw new Error("lease read failed (db down)");
      return cfg.busy
        ? {
            owner: "map",
            token: "someone-elses-token",
            fence: 41,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }
        : null;
    },
    async tryAcquire(owner, token) {
      h.order.push("lease.acquire");
      if (cfg.busy) return null;
      return { fence: 42, expiresAt: new Date(Date.now() + 120_000).toISOString(), owner, token } as never;
    },
    async renew() {
      renews += 1;
      const ok = cfg.failRenewFrom === undefined || renews < cfg.failRenewFrom;
      h.order.push(ok ? "lease.renew" : "lease.renew-LOST");
      if (!ok) lost = true;
      return ok;
    },
    async release() {
      // a lost (stale-token) holder's release is a refused no-op
      h.order.push("lease.release");
      return !lost;
    },
  };
  return driver;
}

/** raw_documents row as the candidate SELECTs return it */
const docRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  title: "Front line report",
  content: "Shelling reported near the front line overnight, with no casualties given.",
  adapter: "rss",
  theater: "ru",
  day: "2026-08-01",
  source_key: "example.test/feed",
  reliability: 0.5,
  content_md5: "md5-one",
  text2k: "Front line report Shelling reported near the front line overnight",
  ...over,
});

const MILITARY_RU = mapExtractorVersion("military", "ru");

beforeEach(() => {
  h.poolQueries.length = 0;
  h.clientQueries.length = 0;
  h.order.length = 0;
  h.connects = 0;
  h.openaiConstructed = 0;
  h.openaiCalls = 0;
  h.guardInits = 0;
  h.reservations = 0;
  h.meterings = 0;
  h.completionContent = "";
  h.rowsFor = () => [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MAP_MODEL;
});

// ---------------------------------------------------------------------------
// REMAP-1: remap never writes processed (always-run pin)
// ---------------------------------------------------------------------------
describe("remap mode never writes raw_documents.processed (audit REMAP-1)", () => {
  // A PARTIALLY DISPOSITIONED, processed=false document: its military track is
  // already mapped at the current version, but its elite_politics track is not
  // — that remaining track is the HOURLY worker's job. A --track military
  // remap sees only the filtered track set, so marking `processed` from it
  // would falsely finalize the document and starve elite_politics forever
  // (ruling 13).
  const partialFixture = () => {
    const row = docRow({
      // "court" puts elite_politics in the applicable set alongside military
      content: "A court hearing followed the shelling reported near the front line.",
    });
    h.rowsFor = (sql) => {
      if (/canonical_url AS source_key/.test(sql)) return [row];
      if (/FROM doc_map_state/.test(sql)) {
        return [{ raw_document_id: 1, track: "military", extractor_version: MILITARY_RU }];
      }
      return [];
    };
  };

  it("leaves a partially dispositioned processed=false doc unmarked", async () => {
    partialFixture();
    const counts = await runMapCycle({
      remap: true,
      track: "military",
      theaters: ["ru"],
      leaseDriver: leaseDriver(),
    });

    // the doc-track pair WAS finished for the filtered track (that is what
    // would tempt the mark) …
    expect(counts.alreadyMapped).toBe(1);
    // … and yet nothing wrote `processed`
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);
    expect(counts.processedMarked).toBe(0);
    // the lease was healthy — the write was skipped by MODE, not by a lost lease
    expect((counts.lease as Record<string, unknown>).lost).toBe(0);
    expect((counts.lease as Record<string, unknown>).released).toBe(1);
  });

  it("CONTROL: the identical fixture in hourly mode DOES mark it (pin is not vacuous)", async () => {
    partialFixture();
    const counts = await runMapCycle({
      track: "military",
      theaters: ["ru"],
      leaseDriver: leaseDriver(),
    });
    const marks = matching(/UPDATE raw_documents SET processed/);
    expect(marks).toHaveLength(1);
    expect(marks[0].params[0]).toEqual([1]);
    expect(counts.processedMarked).toBe(1);
  });

  it("a remap candidate with no applicable track under --track is still never marked", async () => {
    const row = docRow();
    h.rowsFor = (sql) => (/canonical_url AS source_key/.test(sql) ? [row] : []);
    const counts = await runMapCycle({
      remap: true,
      // nuclear is configured for ir only: a ru doc has zero applicable tracks
      track: "nuclear",
      theaters: ["ru"],
      leaseDriver: leaseDriver(),
    });
    expect(counts.noApplicableTrack).toBe(1);
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);
    expect(counts.processedMarked).toBe(0);
  });

  it("remap never deletes or rewrites historical claims or dispositions", async () => {
    partialFixture();
    await runMapCycle({ remap: true, track: "military", theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(matching(/DELETE\s+FROM\s+doc_claims|UPDATE\s+doc_claims/i)).toHaveLength(0);
    expect(matching(/DELETE\s+FROM\s+doc_map_state|UPDATE\s+doc_map_state/i)).toHaveLength(0);
    // remap also skips the dedup gate entirely: mirror verdicts are permanent
    expect(matching(/INSERT INTO doc_dedup/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// L4-1: the two previously unpinned lost-lease write gates
// ---------------------------------------------------------------------------
describe("lost lease at the mirror / doc_dedup transaction (audit L4-1)", () => {
  // two candidates with identical normalized content on the same theater+day:
  // the second is an exact mirror of the first, so the mirror transaction (the
  // first lease-gated write in the cycle) has real work to do.
  const mirrorFixture = () => {
    const a = docRow({ id: 1 });
    const b = docRow({ id: 2, title: docRow().title, content: docRow().content });
    h.rowsFor = (sql) => (/canonical_url AS source_key/.test(sql) ? [a, b] : []);
  };

  it("makes NO write and lets no later write slip through", async () => {
    mirrorFixture();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ failRenewFrom: 1 }) });

    expect(counts.mirrors).toBe(1); // the write was genuinely pending
    expect(h.connects).toBe(0); // the transaction never even opened
    expect(matching(/INSERT INTO doc_dedup/)).toHaveLength(0);
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);
    // nothing at all was written, anywhere, at any later step
    expect(writes()).toHaveLength(0);
    // and the cycle stopped there: no doc_map_state scan, no dispatch
    expect(matching(/FROM doc_map_state/)).toHaveLength(0);
    expect(h.reservations).toBe(0);
    expect(h.openaiCalls).toBe(0);
    expect(h.meterings).toBe(0); // no billed response existed to meter
    expect((counts.lease as Record<string, unknown>).lost).toBe(1);
    // a stale token's release is a refused no-op, recorded honestly
    expect((counts.lease as Record<string, unknown>).released).toBe(0);
  });

  it("work stays eligible: the mirror keeps processed=false and re-runs cleanly", async () => {
    mirrorFixture();
    await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ failRenewFrom: 1 }) });
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);

    // healthy rerun over the SAME rows: the mirror is written this time, so
    // the work was deferred, never lost
    h.poolQueries.length = 0;
    h.clientQueries.length = 0;
    h.connects = 0;
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(counts.mirrors).toBe(1);
    expect(matching(/INSERT INTO doc_dedup/)).toHaveLength(1);
    const marks = matching(/UPDATE raw_documents SET processed/);
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks[0].params[0]).toEqual([2]); // the mirror doc, inside the txn
  });
});

describe("lost lease at the final processed=true update (audit L4-1)", () => {
  // a doc whose only applicable track (military; ru has no elite lexicon hit
  // here) is already mapped at the CURRENT version — the crash-recovery case
  // where the run's only remaining work is the disposition flag itself.
  const finalFlagFixture = () => {
    h.rowsFor = (sql) => {
      if (/canonical_url AS source_key/.test(sql)) return [docRow()];
      if (/FROM doc_map_state/.test(sql)) {
        return [{ raw_document_id: 1, track: "military", extractor_version: MILITARY_RU }];
      }
      return [];
    };
  };

  it("skips the update and writes nothing at all", async () => {
    finalFlagFixture();
    const counts = await runMapCycle({
      theaters: ["ru"],
      leaseDriver: leaseDriver({ failRenewFrom: 1 }),
    });

    expect(counts.alreadyMapped).toBe(1); // the flag write was genuinely due
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(counts.processedMarked).toBe(0);
    expect((counts.lease as Record<string, unknown>).lost).toBe(1);
    expect((counts.lease as Record<string, unknown>).released).toBe(0);
    // no paid work was in flight, so nothing needed metering-before-discard
    expect(h.reservations).toBe(0);
    expect(h.meterings).toBe(0);
  });

  it("CONTROL: with the lease held the update DOES happen (pin is not vacuous)", async () => {
    finalFlagFixture();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    const marks = matching(/UPDATE raw_documents SET processed/);
    expect(marks).toHaveLength(1);
    expect(marks[0].params[0]).toEqual([1]);
    expect(counts.processedMarked).toBe(1);
    expect((counts.lease as Record<string, unknown>).released).toBe(1);
  });

  it("the doc stays eligible: a healthy rerun marks it", async () => {
    finalFlagFixture();
    await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ failRenewFrom: 1 }) });
    h.poolQueries.length = 0;
    h.clientQueries.length = 0;
    await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(1);
  });
});

describe("lost lease at the persistBatch write (review MEDIUM-1)", () => {
  // The THIRD lease-gated write path, and the only one whose writes come from a
  // BILLED call. The independent review proved this gate had no always-run
  // cover: deleting it left `npm test` fully green, so the enforced pre-push
  // gate could not see it — the same shape as L4-1 and REMAP-1.
  const oneBatch = () => {
    h.rowsFor = (sql) => (/canonical_url AS source_key/.test(sql) ? [docRow()] : []);
    h.completionContent = JSON.stringify({
      results: [
        {
          docId: 1,
          claims: [
            {
              text_en: "Shelling was reported near the front line.",
              quote_orig: null,
              claim_type: "factual",
              hedging: "claimed",
              entities: [],
              event_hint: null,
            },
          ],
        },
      ],
    });
  };

  // renew #1 is the extractBatch keepalive (before the physical attempt);
  // renew #2 is the post-response ownership re-check guarding persistBatch.
  it("discards the parsed batch, writes nothing, and meters the billed call FIRST", async () => {
    oneBatch();
    const counts = await runMapCycle({
      theaters: ["ru"],
      leaseDriver: leaseDriver({ failRenewFrom: 2 }),
    });

    // the call really happened and really cost money
    expect(h.reservations).toBe(1);
    expect(h.openaiCalls).toBe(1);
    // ruling 8: the billed response was METERED BEFORE the lease check discarded it
    expect(h.meterings).toBe(1);
    expect(h.order.indexOf("guard.record")).toBeLessThan(h.order.indexOf("lease.renew-LOST"));

    // …and not one row was written
    expect(matching(/INSERT INTO doc_claims/)).toHaveLength(0);
    expect(matching(/INSERT INTO doc_map_state/)).toHaveLength(0);
    expect(matching(/UPDATE raw_documents SET processed/)).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(h.connects).toBe(0); // the persist transaction never opened

    expect(counts.claims).toBe(0);
    expect(counts.leaseLostDiscards).toBe(1);
    expect((counts.lease as Record<string, unknown>).lost).toBe(1);
    expect((counts.lease as Record<string, unknown>).released).toBe(0);
  });

  it("CONTROL: with the lease held the batch IS persisted (pin is not vacuous)", async () => {
    oneBatch();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(counts.claims).toBe(1);
    expect(matching(/INSERT INTO doc_claims/)).toHaveLength(1);
    expect(matching(/INSERT INTO doc_map_state/)).toHaveLength(1);
    expect(counts.leaseLostDiscards).toBe(0);
  });

  it("the discarded docs stay eligible: a healthy rerun maps and persists them", async () => {
    oneBatch();
    await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ failRenewFrom: 2 }) });
    h.poolQueries.length = 0;
    h.clientQueries.length = 0;
    h.connects = 0;
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(counts.claims).toBe(1);
    expect(matching(/INSERT INTO doc_claims/)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Hard boundaries (B6) — ordering, busy/error safety, version stability
// ---------------------------------------------------------------------------
describe("lease hard boundaries", () => {
  const oneBatchFixture = () => {
    h.rowsFor = (sql) => (/canonical_url AS source_key/.test(sql) ? [docRow()] : []);
    h.completionContent = JSON.stringify({
      results: [
        {
          docId: 1,
          claims: [
            {
              text_en: "Shelling was reported near the front line.",
              quote_orig: null,
              claim_type: "factual",
              hedging: "claimed",
              entities: [],
              event_hint: null,
            },
          ],
        },
      ],
    });
  };

  it("acquires the lease BEFORE any reservation, client construction, or write", async () => {
    oneBatchFixture();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    expect(counts.claims).toBe(1); // the paid path really ran

    const first = (needle: string) => h.order.findIndex((e) => e.startsWith(needle));
    const acquire = first("lease.acquire");
    expect(acquire).toBeGreaterThanOrEqual(0);
    expect(acquire).toBeLessThan(first("guard.init"));
    expect(acquire).toBeLessThan(first("guard.reserve"));
    expect(acquire).toBeLessThan(first("openai.construct"));
    expect(acquire).toBeLessThan(first("openai.call"));
    expect(acquire).toBeLessThan(h.order.findIndex((e) => e.includes("WRITE-")));
    // and a renewal precedes the persist write (the pre-write ownership check)
    const persist = h.order.findIndex((e) => e === "client.query:WRITE-doc-claims");
    expect(h.order.lastIndexOf("lease.renew", persist)).toBeGreaterThan(-1);
    // the extractor version written is the unchanged production authority
    const claimWrite = matching(/INSERT INTO doc_claims/)[0];
    expect(claimWrite.params[2]).toBe(MILITARY_RU);
  });

  it("a busy lease does zero paid calls and zero queries of any kind", async () => {
    oneBatchFixture();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ busy: true }) });
    expect(counts.skipped).toMatch(/holds the lease/);
    expect((counts.lease as Record<string, unknown>).outcome).toBe("busy");
    expect(h.poolQueries).toHaveLength(0);
    expect(h.clientQueries).toHaveLength(0);
    expect(h.reservations).toBe(0);
    expect(h.openaiConstructed).toBe(0);
  });

  it("a lease driver failure fails SAFE, exactly like busy", async () => {
    oneBatchFixture();
    const counts = await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver({ throwOnRead: true }) });
    expect((counts.lease as Record<string, unknown>).outcome).toBe("error");
    expect(counts.skipped).toBeDefined();
    expect(writes()).toHaveLength(0);
    expect(h.reservations).toBe(0);
    expect(h.openaiConstructed).toBe(0);
  });

  it("a dry run REPORTS a configuration the activation lock would refuse", async () => {
    // the pre-execution printout is the operator's decision surface: a dry run
    // must not promise a dispatch the live run will reject (lease review
    // NOTE-A pinned the consumption of this field but not its production)
    oneBatchFixture();
    process.env.MAP_MODEL = "gpt-5";
    const counts = await runMapCycle({ theaters: ["ru"], dryRun: true, leaseDriver: leaseDriver() });
    expect(counts.estModel).toBe("gpt-5");
    expect(counts.estDispatchBlocked).toMatch(/MAP ACTIVATION BLOCKED/);
    // still a dry run: no lease, no spend, no writes
    expect(h.order.filter((e) => e.startsWith("lease."))).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(h.openaiCalls).toBe(0);
  });

  it("a dry run under the BASELINE reports no refusal (pin is not vacuous)", async () => {
    oneBatchFixture();
    const counts = await runMapCycle({ theaters: ["ru"], dryRun: true, leaseDriver: leaseDriver() });
    expect(counts.estModel).toBe("gpt-4o-mini");
    expect(counts.estDispatchBlocked).toBeUndefined();
  });

  it("a dry run takes no lease and writes nothing (provider_state included)", async () => {
    oneBatchFixture();
    const acquireSpy = vi.fn();
    const driver = leaseDriver();
    const counts = await runMapCycle({
      theaters: ["ru"],
      dryRun: true,
      leaseDriver: { ...driver, tryAcquire: acquireSpy as never },
    });
    expect(acquireSpy).not.toHaveBeenCalled();
    expect(h.order.filter((e) => e.startsWith("lease."))).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(h.openaiCalls).toBe(0);
    expect(counts.estUsd).toBeDefined();
  });

  it("remap cannot activate a model: a non-baseline MAP_MODEL refuses before any spend or write", async () => {
    oneBatchFixture();
    process.env.MAP_MODEL = "gpt-5";
    await expect(
      runMapCycle({ remap: true, theaters: ["ru"], leaseDriver: leaseDriver() }),
    ).rejects.toThrow(/MAP ACTIVATION BLOCKED/);
    expect(h.reservations).toBe(0);
    expect(h.openaiConstructed).toBe(0);
    expect(writes()).toHaveLength(0);
  });

  it("hourly selection still gates on processed = false (unchanged behaviour)", async () => {
    oneBatchFixture();
    await runMapCycle({ theaters: ["ru"], leaseDriver: leaseDriver() });
    const candidateSql = matching(/canonical_url AS source_key/)[0].sql;
    expect(candidateSql).toMatch(/rd\.processed = false/);
    expect(candidateSql).not.toMatch(/rd\.id > \$/);
  });
});
