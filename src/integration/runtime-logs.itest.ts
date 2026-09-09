import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import type { SqlExec } from "@/lib/logs/drain";

// Log-drain receiver on REAL Postgres (OPEN-TASKS #93, migration 0029,
// docs/designs/LOG-DRAIN.md): the migration applies additively, the primary
// key makes a redelivery idempotent, the retention sweep deletes on
// received_at and only up to its bound, and a badly signed request writes
// nothing and returns no data. $0 by construction — this path makes no
// provider call of any kind.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}
const SECRET = "itest-drain-secret";
process.env.LOG_DRAIN_SECRET = SECRET;

const { runMigrations } = await import("../../scripts/migrations-lib");
const {
  insertRuntimeLogs,
  sweepRuntimeLogs,
  normalizeBatch,
  resetDrainSweepThrottle,
  DRAIN_ROUTE_PATH,
  DEFAULT_MAX_ROWS,
} = await import("@/lib/logs/drain");
const { POST } = await import("@/app/api/logs/drain/route");

let pool: Pool;
const exec: SqlExec = async (text, params) => (await pool.query(text, params)).rows;

const PREFIX = "itest-drain-";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha1", secret).update(Buffer.from(body, "utf8")).digest("hex");

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `${PREFIX}${Math.random().toString(36).slice(2)}`,
    deploymentId: "dpl_itest",
    source: "lambda",
    timestamp: Date.parse("2026-09-06T12:00:00Z"),
    level: "info",
    type: "stdout",
    environment: "production",
    message: "map: 45 batches, 0 errors",
    requestId: "req-1",
    statusCode: 200,
    path: "/api/cron/map",
    ...over,
  };
}

async function cleanup() {
  await pool.query(`DELETE FROM runtime_logs WHERE id LIKE $1`, [`${PREFIX}%`]);
}

beforeAll(async () => {
  await runMigrations(URL!); // applies 0029 additively on the disposable fork
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

beforeEach(async () => {
  await cleanup();
  resetDrainSweepThrottle();
});

describe("migration 0029: runtime_logs on real Postgres", () => {
  it("creates the table with the projected columns and no others", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'runtime_logs' ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "deployment_id",
      "environment",
      "id",
      "level",
      "logged_at",
      "message",
      "message_sha256",
      "received_at",
      "request_id",
      "request_path",
      "source",
      "status_code",
      "type",
    ]);
    // The never-stored fields have no home here, structurally.
    for (const forbidden of ["client_ip", "user_agent", "referer", "ja3_digest", "ja4_digest", "host"]) {
      expect(rows.map((r) => r.column_name)).not.toContain(forbidden);
    }
  });

  it("creates the retention, deployment and window indexes", async () => {
    const { rows } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'runtime_logs' ORDER BY indexname`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("runtime_logs_received_idx");
    expect(names).toContain("runtime_logs_deployment_received_idx");
    expect(names).toContain("runtime_logs_logged_idx");
  });

  it("leaves the claim_must_have_source trigger intact (9999 still applies last)", async () => {
    const { rows } = await pool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'claim_must_have_source'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("insert semantics", () => {
  it("stores a batch and round-trips every column", async () => {
    const rows = normalizeBatch([entry({ id: `${PREFIX}one` })], DEFAULT_MAX_ROWS).rows;
    expect(await insertRuntimeLogs(exec, rows)).toBe(1);

    const { rows: got } = await pool.query<{
      deployment_id: string;
      source: string;
      level: string;
      type: string;
      environment: string;
      request_path: string;
      request_id: string;
      status_code: number;
      message: string;
      message_sha256: string;
      logged_epoch: string;
      received_epoch: string;
    }>(
      `SELECT deployment_id, source, level, type, environment, request_path, request_id,
              status_code, message, message_sha256,
              extract(epoch from logged_at)   AS logged_epoch,
              extract(epoch from received_at) AS received_epoch
         FROM runtime_logs WHERE id = $1`,
      [`${PREFIX}one`],
    );
    expect(got).toHaveLength(1);
    const r = got[0];
    expect(r.deployment_id).toBe("dpl_itest");
    expect(r.source).toBe("lambda");
    expect(r.level).toBe("info");
    expect(r.type).toBe("stdout");
    expect(r.environment).toBe("production");
    expect(r.request_path).toBe("/api/cron/map");
    expect(r.request_id).toBe("req-1");
    expect(r.status_code).toBe(200);
    expect(r.message).toBe("map: 45 batches, 0 errors");
    expect(r.message_sha256).toMatch(/^[0-9a-f]{64}$/);
    // Instants compared as epochs, never as driver-rendered strings.
    expect(Number(r.logged_epoch)).toBe(Date.parse("2026-09-06T12:00:00Z") / 1000);
    expect(Math.abs(Number(r.received_epoch) * 1000 - Date.now())).toBeLessThan(120_000);
  });

  it("is idempotent under redelivery: the second insert of the same ids stores 0", async () => {
    const rows = normalizeBatch(
      [entry({ id: `${PREFIX}dup1` }), entry({ id: `${PREFIX}dup2` })],
      DEFAULT_MAX_ROWS,
    ).rows;
    expect(await insertRuntimeLogs(exec, rows)).toBe(2);
    expect(await insertRuntimeLogs(exec, rows)).toBe(0);
    const { rows: count } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM runtime_logs WHERE id LIKE $1`,
      [`${PREFIX}%`],
    );
    expect(Number(count[0].n)).toBe(2);
  });

  it("stores a large batch in one statement", async () => {
    const many = Array.from({ length: 500 }, (_, i) => entry({ id: `${PREFIX}bulk-${i}` }));
    const rows = normalizeBatch(many, DEFAULT_MAX_ROWS).rows;
    expect(rows).toHaveLength(500);
    expect(await insertRuntimeLogs(exec, rows)).toBe(500);
  });

  it("accepts an astral message clipped at the ceiling without a lone surrogate", async () => {
    const msg = "a".repeat(1999) + "🛰" + "b".repeat(100);
    const rows = normalizeBatch([entry({ id: `${PREFIX}astral`, message: msg })], DEFAULT_MAX_ROWS).rows;
    expect(await insertRuntimeLogs(exec, rows)).toBe(1);
    const { rows: got } = await pool.query<{ message: string }>(
      `SELECT message FROM runtime_logs WHERE id = $1`,
      [`${PREFIX}astral`],
    );
    expect(got[0].message).toHaveLength(1999);
    expect(/[\uD800-\uDFFF]/.test(got[0].message)).toBe(false);
  });
});

describe("retention sweep", () => {
  async function seedAged(id: string, receivedDaysAgo: number) {
    await pool.query(
      `INSERT INTO runtime_logs (id, received_at, logged_at, source)
       VALUES ($1, now() - make_interval(days => $2), now() - make_interval(days => $2), 'lambda')`,
      [id, receivedDaysAgo],
    );
  }

  it("deletes rows received before the cutoff and keeps the rest", async () => {
    await seedAged(`${PREFIX}old-20`, 20);
    await seedAged(`${PREFIX}old-15`, 15);
    await seedAged(`${PREFIX}fresh-13`, 13);
    await seedAged(`${PREFIX}fresh-0`, 0);

    const cutoff = new Date(Date.now() - 14 * 86_400_000);
    expect(await sweepRuntimeLogs(exec, cutoff, 5000)).toBe(2);

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM runtime_logs WHERE id LIKE $1 ORDER BY id`,
      [`${PREFIX}%`],
    );
    expect(rows.map((r) => r.id)).toEqual([`${PREFIX}fresh-0`, `${PREFIX}fresh-13`]);
  });

  it("honours its bound, so a backlog drains over successive passes", async () => {
    for (let i = 0; i < 7; i++) await seedAged(`${PREFIX}backlog-${i}`, 30);
    const cutoff = new Date(Date.now() - 14 * 86_400_000);
    expect(await sweepRuntimeLogs(exec, cutoff, 3)).toBe(3);
    expect(await sweepRuntimeLogs(exec, cutoff, 3)).toBe(3);
    expect(await sweepRuntimeLogs(exec, cutoff, 3)).toBe(1);
    expect(await sweepRuntimeLogs(exec, cutoff, 3)).toBe(0);
  });

  it("keys on received_at, not logged_at: a row about an old instant stored today survives", async () => {
    await pool.query(
      `INSERT INTO runtime_logs (id, received_at, logged_at, source)
       VALUES ($1, now(), now() - make_interval(days => 90), 'lambda')`,
      [`${PREFIX}late-arrival`],
    );
    const cutoff = new Date(Date.now() - 14 * 86_400_000);
    expect(await sweepRuntimeLogs(exec, cutoff, 5000)).toBe(0);
  });
});

describe("the route against real Postgres", () => {
  const call = (body: string, headers: Record<string, string>) =>
    POST(new NextRequest("https://bnow.net/api/logs/drain", { method: "POST", body, headers }));

  async function storedIds(): Promise<string[]> {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM runtime_logs WHERE id LIKE $1 ORDER BY id`,
      [`${PREFIX}%`],
    );
    return rows.map((r) => r.id);
  }

  it("stores a correctly signed NDJSON batch and drops its own invocations", async () => {
    const body = [
      JSON.stringify(entry({ id: `${PREFIX}route-keep` })),
      JSON.stringify(entry({ id: `${PREFIX}route-self`, path: DRAIN_ROUTE_PATH })),
    ].join("\n");
    const res = await call(body, { "x-vercel-signature": sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, received: 2, stored: 1, dropped: 1 });
    expect(await storedIds()).toEqual([`${PREFIX}route-keep`]);
  });

  it("a bad signature writes NO row and returns NO data", async () => {
    const body = JSON.stringify(entry({ id: `${PREFIX}route-forged`, message: "zqleakprobe" }));
    const res = await call(body, { "x-vercel-signature": sign(body, "not-the-secret") });
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "invalid signature" }));
    for (const token of ["zqleakprobe", "runtime_logs", PREFIX, "dpl_itest"]) {
      expect(text).not.toContain(token);
    }
    expect(await storedIds()).toEqual([]);
  });

  it("an unsigned request writes NO row", async () => {
    const body = JSON.stringify(entry({ id: `${PREFIX}route-unsigned` }));
    expect((await call(body, {})).status).toBe(403);
    expect(await storedIds()).toEqual([]);
  });

  it("a redelivery of the same batch is a no-op at the database", async () => {
    const body = JSON.stringify(entry({ id: `${PREFIX}route-redeliver` }));
    const headers = { "x-vercel-signature": sign(body) };
    expect(await (await call(body, headers)).json()).toMatchObject({ stored: 1 });
    resetDrainSweepThrottle();
    expect(await (await call(body, headers)).json()).toMatchObject({ stored: 0 });
    expect(await storedIds()).toEqual([`${PREFIX}route-redeliver`]);
  });

  it("writes no cron_runs row (it is a receiver, not a cron — ruling 10)", async () => {
    const before = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM cron_runs`);
    const body = JSON.stringify(entry({ id: `${PREFIX}route-noncron` }));
    await call(body, { "x-vercel-signature": sign(body) });
    const after = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM cron_runs`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

// ---------------------------------------------------------------------------
// Register gap G5 (step 21 / CP4 §5.4): WS2-F03 and WS2-F26 were asserted from
// PostgreSQL documentation and never measured. These three are CHARACTERIZATION
// tests — they pin the CURRENT, DEFECTIVE behaviour so the fix has a regression
// net and so the register's claims rest on evidence rather than on a manual.
//
// ***STEP 23 FLIPS THESE.*** When the NUL strip, the int4 clamp and the
// LOG_DRAIN_MAX_ROWS clamp land, each measured failure below becomes a success
// and the comments must be rewritten with it. A failure here after step 23 is
// the fix landing, not a regression.
//
// Why it matters operationally: the receiver answers 500 on a throw, Vercel
// retries the IDENTICAL batch, and the batch is therefore lost permanently
// rather than transiently. None of it is reachable until a drain is registered.
describe("G5 characterization: measured failure modes of the current receiver", () => {
  const NUL = String.fromCharCode(0); // never a literal in source
  const probe = async (rows: Parameters<typeof insertRuntimeLogs>[1]): Promise<string> => {
    try {
      await insertRuntimeLogs(exec, rows);
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  it("WS2-F03: a single U+0000 in one message makes the WHOLE batch unstorable", async () => {
    const { rows } = normalizeBatch(
      [
        entry({ id: `${PREFIX}nul-clean`, message: "map: 45 batches, 0 errors" }),
        entry({ id: `${PREFIX}nul-poison`, message: `map: killed mid${NUL}line` }),
      ],
      DEFAULT_MAX_ROWS,
    );
    // normalizeBatch passes NUL through today — wellFormedSlice strips lone
    // surrogates, not control characters
    expect(rows).toHaveLength(2);
    expect(rows[1].message).toContain(NUL);

    const message = await probe(rows);
    expect(message).not.toBe(""); // MEASURED: PostgreSQL rejects 0x00 in text
    console.log(`[G5/WS2-F03] insert error: ${message.slice(0, 200)}`);

    // all-or-nothing: the CLEAN co-batched entry is lost with the poisoned one,
    // which is what makes the redelivery loop permanent
    const { rows: stored } = await pool.query<{ id: string }>(
      `SELECT id FROM runtime_logs WHERE id LIKE $1`,
      [`${PREFIX}nul-%`],
    );
    expect(stored).toHaveLength(0);
  });

  it("WS2-F03 (second half): a status_code beyond int4 is truncated, not clamped, and the batch fails", async () => {
    const { rows } = normalizeBatch(
      [entry({ id: `${PREFIX}int4`, statusCode: 2_147_483_648 })],
      DEFAULT_MAX_ROWS,
    );
    expect(rows[0].statusCode).toBe(2_147_483_648); // int() truncates the float only

    const message = await probe(rows);
    expect(message).not.toBe(""); // MEASURED: integer out of range
    console.log(`[G5/WS2-F03 int4] insert error: ${message.slice(0, 200)}`);
    const { rows: stored } = await pool.query<{ id: string }>(
      `SELECT id FROM runtime_logs WHERE id = $1`,
      [`${PREFIX}int4`],
    );
    expect(stored).toHaveLength(0);
  });

  it("WS2-F26: 12 bind parameters per row means a batch over 5,461 rows exceeds the 65,535-parameter cap", async () => {
    // DEFAULT_MAX_ROWS (1000 -> 12,000 parameters) is safe; the finding is that
    // LOG_DRAIN_MAX_ROWS has no UPPER clamp, so an operator-set value above
    // 5,461 breaks every delivery larger than that. 5,462 * 12 = 65,544.
    const OVER = 5_462;
    expect(OVER * 12).toBeGreaterThan(65_535);
    const { rows } = normalizeBatch(
      Array.from({ length: OVER }, (_, i) => entry({ id: `${PREFIX}bind-${i}` })),
      OVER, // exactly what maxRows() would return for LOG_DRAIN_MAX_ROWS=5462
    );
    expect(rows).toHaveLength(OVER);

    const message = await probe(rows);
    expect(message).not.toBe(""); // MEASURED: the extended-protocol Bind cap
    console.log(`[G5/WS2-F26] insert error: ${message.slice(0, 200)}`);
    const { rows: count } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM runtime_logs WHERE id LIKE $1`,
      [`${PREFIX}bind-%`],
    );
    expect(Number(count[0].n)).toBe(0);

    // and the row count one BELOW the boundary still stores, so the parameter
    // cap is the whole difference — nothing else about a large batch is broken
    const safe = normalizeBatch(
      Array.from({ length: 5_461 }, (_, i) => entry({ id: `${PREFIX}bindok-${i}` })),
      5_461,
    ).rows;
    expect(await insertRuntimeLogs(exec, safe)).toBe(5_461);
  });
});
