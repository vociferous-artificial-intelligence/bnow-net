import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_ROWS,
  DEFAULT_RETENTION_DAYS,
  DRAIN_MESSAGE_CHARS,
  DRAIN_ROUTE_PATH,
  DRAIN_SWEEP_INTERVAL_MS,
  claimSweepSlot,
  drainSecret,
  insertRuntimeLogs,
  isSelfIngestion,
  maxBodyBytes,
  maxRows,
  normalizeBatch,
  normalizeEntry,
  parseDrainBody,
  redactSecrets,
  resetDrainSweepThrottle,
  retentionCutoff,
  retentionDays,
  stripQuery,
  sweepLimit,
  sweepRuntimeLogs,
  verifyDrainSignature,
  type SqlExec,
} from "./drain";

const SECRET = "drain-secret-value";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha1", secret).update(Buffer.from(body, "utf8")).digest("hex");

const ENV_KEYS = [
  "LOG_DRAIN_SECRET",
  "LOG_DRAIN_RETENTION_DAYS",
  "LOG_DRAIN_MAX_ROWS",
  "LOG_DRAIN_MAX_BODY_BYTES",
  "LOG_DRAIN_SWEEP_LIMIT",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetDrainSweepThrottle();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "1573817250283254651097202070",
    deploymentId: "dpl_233NRGRjVZX1caZrXWtz5g1TAksD",
    source: "lambda",
    host: "bnow.net",
    timestamp: 1_757_000_000_000,
    projectId: "gdufoJxB6b9b1fEqr1jUtFkyavUU",
    level: "info",
    message: "map: 45 batches, 0 errors",
    requestId: "643af4e3-975a-4cc7-9e7a-1eda11539d90",
    statusCode: 200,
    path: "/api/cron/map",
    environment: "production",
    type: "stdout",
    ...over,
  };
}

// ------------------------------------------------------------------ signature

describe("drain signature (the route's ONLY authorization)", () => {
  it("accepts the hex HMAC-SHA1 of the raw body keyed by the secret", () => {
    const body = '{"id":"a"}\n{"id":"b"}';
    expect(verifyDrainSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature computed with a different secret", () => {
    const body = '{"id":"a"}';
    expect(verifyDrainSignature(body, sign(body, "other-secret"), SECRET)).toBe(false);
  });

  it("rejects when the body differs by one byte from what was signed", () => {
    const signed = sign('{"id":"a"}');
    expect(verifyDrainSignature('{"id":"b"}', signed, SECRET)).toBe(false);
  });

  it("rejects a missing, empty, non-hex or wrong-length header", () => {
    const body = '{"id":"a"}';
    expect(verifyDrainSignature(body, null, SECRET)).toBe(false);
    expect(verifyDrainSignature(body, "", SECRET)).toBe(false);
    expect(verifyDrainSignature(body, "not-hex-at-all", SECRET)).toBe(false);
    expect(verifyDrainSignature(body, sign(body).slice(0, 38), SECRET)).toBe(false);
    expect(verifyDrainSignature(body, sign(body) + "ab", SECRET)).toBe(false);
  });

  it("tolerates surrounding whitespace in the header", () => {
    const body = '{"id":"a"}';
    expect(verifyDrainSignature(body, `  ${sign(body)}\n`, SECRET)).toBe(true);
  });

  it("signs the body as UTF-8 bytes, so multi-byte content verifies", () => {
    const body = '{"message":"Харків — 🛰 astral"}';
    expect(verifyDrainSignature(body, sign(body), SECRET)).toBe(true);
  });
});

describe("drainSecret fails closed", () => {
  it("is null when unset, blank or whitespace-only", () => {
    expect(drainSecret()).toBeNull();
    process.env.LOG_DRAIN_SECRET = "";
    expect(drainSecret()).toBeNull();
    process.env.LOG_DRAIN_SECRET = "   ";
    expect(drainSecret()).toBeNull();
  });

  it("trims a configured value", () => {
    process.env.LOG_DRAIN_SECRET = "  s3cret  ";
    expect(drainSecret()).toBe("s3cret");
  });
});

// -------------------------------------------------------------------- parsing

describe("parseDrainBody accepts every documented delivery shape", () => {
  it("NDJSON", () => {
    const p = parseDrainBody('{"id":"a"}\n{"id":"b"}\n');
    expect(p.entries).toHaveLength(2);
    expect(p.malformed).toBe(0);
  });

  it("JSON array", () => {
    const p = parseDrainBody('[{"id":"a"},{"id":"b"}]');
    expect(p.entries).toHaveLength(2);
  });

  it("a single JSON object", () => {
    expect(parseDrainBody('{"id":"a"}').entries).toHaveLength(1);
  });

  it("an empty body yields nothing and no error", () => {
    expect(parseDrainBody("   \n ")).toEqual({ entries: [], malformed: 0 });
  });

  it("counts malformed lines instead of throwing", () => {
    const p = parseDrainBody('{"id":"a"}\nnot json\n{"id":"b"}\n"a string"\n[1,2]');
    expect(p.entries).toHaveLength(2);
    expect(p.malformed).toBe(3);
  });

  it("counts non-object members of a JSON array", () => {
    const p = parseDrainBody('[{"id":"a"},null,7]');
    expect(p.entries).toHaveLength(1);
    expect(p.malformed).toBe(2);
  });
});

// ---------------------------------------------------------------- normalizing

describe("normalizeEntry projects the v1 log schema onto our columns", () => {
  it("keeps the thirteen stored fields", () => {
    const row = normalizeEntry(entry())!;
    expect(row.id).toBe("1573817250283254651097202070");
    expect(row.loggedAt).toBe(new Date(1_757_000_000_000).toISOString());
    expect(row.deploymentId).toBe("dpl_233NRGRjVZX1caZrXWtz5g1TAksD");
    expect(row.source).toBe("lambda");
    expect(row.level).toBe("info");
    expect(row.type).toBe("stdout");
    expect(row.environment).toBe("production");
    expect(row.requestPath).toBe("/api/cron/map");
    expect(row.requestId).toBe("643af4e3-975a-4cc7-9e7a-1eda11539d90");
    expect(row.statusCode).toBe(200);
    expect(row.message).toBe("map: 45 batches, 0 errors");
    expect(row.messageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores NOTHING that is not a declared column — no host, ip, user agent, ja3/ja4", () => {
    const row = normalizeEntry(
      entry({
        ja3Digest: "769c83e5b",
        ja4Digest: "t13d1516h2",
        proxy: {
          clientIp: "120.75.16.101",
          userAgent: ["Mozilla/5.0 (secret-ish)"],
          referer: "https://example.test/private",
          path: "/api/cron/map?which=fast",
        },
      }),
    )!;
    const serialized = JSON.stringify(row);
    for (const forbidden of ["120.75.16.101", "Mozilla", "example.test", "769c83e5b", "t13d1516h2", "bnow.net"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(row).sort()).toEqual(
      [
        "deploymentId",
        "environment",
        "id",
        "level",
        "loggedAt",
        "message",
        "messageSha256",
        "requestId",
        "requestPath",
        "source",
        "statusCode",
        "type",
      ].sort(),
    );
  });

  it("falls back to proxy.path and strips the query string", () => {
    const row = normalizeEntry(
      entry({ path: undefined, proxy: { path: "/ask?q=who%20is%20named%20here" } }),
    )!;
    expect(row.requestPath).toBe("/ask");
  });

  it("strips the query string on the top-level path too, and a fragment", () => {
    expect(normalizeEntry(entry({ path: "/api/cron/ingest?which=fast" }))!.requestPath).toBe(
      "/api/cron/ingest",
    );
    expect(stripQuery("/x#frag")).toBe("/x");
    expect(stripQuery("/x?a=1#frag")).toBe("/x");
    expect(stripQuery("/plain")).toBe("/plain");
  });

  it("refuses an entry with no id (no primary key ⇒ no idempotent redelivery)", () => {
    expect(normalizeEntry(entry({ id: undefined }))).toBeNull();
    expect(normalizeEntry(entry({ id: "" }))).toBeNull();
    expect(normalizeEntry(entry({ id: 42 }))).toBeNull();
  });

  it("refuses an entry with no usable timestamp (no window axis)", () => {
    expect(normalizeEntry(entry({ timestamp: undefined }))).toBeNull();
    expect(normalizeEntry(entry({ timestamp: "1757000000000" }))).toBeNull();
    expect(normalizeEntry(entry({ timestamp: 0 }))).toBeNull();
    expect(normalizeEntry(entry({ timestamp: Number.NaN }))).toBeNull();
    expect(normalizeEntry(entry({ timestamp: -5 }))).toBeNull();
  });

  it("refuses a non-object", () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry("x")).toBeNull();
    expect(normalizeEntry([entry()])).toBeNull();
  });

  it("nulls absent optional fields rather than inventing them", () => {
    const row = normalizeEntry({ id: "a", timestamp: 1_757_000_000_000 })!;
    expect(row.deploymentId).toBeNull();
    expect(row.requestPath).toBeNull();
    expect(row.statusCode).toBeNull();
    expect(row.message).toBeNull();
    expect(row.messageSha256).toBeNull();
  });

  it("keeps statusCode -1 — the crashed-with-no-response signature the soak reads", () => {
    expect(normalizeEntry(entry({ statusCode: -1 }))!.statusCode).toBe(-1);
  });

  it("stores an unknown enum value rather than dropping it (future Vercel sources stay visible)", () => {
    const row = normalizeEntry(entry({ source: "some-new-source", level: "trace" }))!;
    expect(row.source).toBe("some-new-source");
    expect(row.level).toBe("trace");
  });
});

describe("message handling: redact, then hash, then well-formed truncate", () => {
  it("redacts credential shapes", () => {
    const dirty =
      "connect postgres://user:pw@ep-x.neon.tech/db?sslmode=require failed; " +
      "Authorization: Bearer abcdefghijklmnop; key=sk-ABCDEFGHIJKLMNOP; " +
      'api_key="ZYXWVUTSRQPONM"';
    const clean = redactSecrets(dirty);
    expect(clean).not.toContain("ep-x.neon.tech");
    expect(clean).not.toContain("abcdefghijklmnop");
    expect(clean).not.toContain("ABCDEFGHIJKLMNOP");
    expect(clean).not.toContain("ZYXWVUTSRQPONM");
    expect(clean).toContain("[redacted]");
  });

  it("WS2-F03: strips U+0000 from every stored string, so one entry cannot poison the batch", () => {
    const NUL = String.fromCharCode(0); // never a literal in source
    const row = normalizeEntry(
      entry({
        id: `abc${NUL}def`,
        message: `map: killed mid${NUL}line`,
        path: `/api/cron/${NUL}map`,
        requestId: `req${NUL}1`,
      }),
    )!;
    for (const v of [row.id, row.message, row.requestPath, row.requestId]) {
      expect(v).not.toContain(NUL);
    }
    expect(row.message).toBe("map: killed midline");
    // the hash is taken over the cleaned text, so the preimage carries no NUL either
    expect(row.messageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("WS2-F03: a NUL-only string is treated as absent, not stored as an empty one", () => {
    const NUL = String.fromCharCode(0);
    expect(normalizeEntry(entry({ id: NUL }))).toBeNull();
    expect(normalizeEntry(entry({ requestId: NUL }))!.requestId).toBeNull();
  });

  it("WS2-F03: clamps status_code into int4 instead of failing the whole INSERT", () => {
    expect(normalizeEntry(entry({ statusCode: 2_147_483_648 }))!.statusCode).toBe(2_147_483_647);
    expect(normalizeEntry(entry({ statusCode: -2_147_483_649 }))!.statusCode).toBe(-2_147_483_648);
    expect(normalizeEntry(entry({ statusCode: 1e30 }))!.statusCode).toBe(2_147_483_647);
    // ...and an ordinary status is untouched, as is the millisecond timestamp,
    // which is NOT an int4 column and must never be clamped with it
    expect(normalizeEntry(entry({ statusCode: 503 }))!.statusCode).toBe(503);
    expect(normalizeEntry(entry())!.loggedAt).toBe(new Date(1_757_000_000_000).toISOString());
  });

  it("leaves ordinary log prose alone", () => {
    const s = "map: 45 batches, 0 errors, fence 38, released 1";
    expect(redactSecrets(s)).toBe(s);
  });

  it("hashes the redacted message, so no secret survives in the hash preimage", () => {
    const withSecret = normalizeEntry(entry({ message: "url postgres://u:p@h/db here" }))!;
    const redactedSame = normalizeEntry(
      entry({ id: "other", message: "url postgres://[redacted] here" }),
    )!;
    expect(withSecret.messageSha256).toBe(redactedSame.messageSha256);
  });

  it("truncates to DRAIN_MESSAGE_CHARS code units", () => {
    const row = normalizeEntry(entry({ message: "x".repeat(DRAIN_MESSAGE_CHARS + 500) }))!;
    expect(row.message!.length).toBe(DRAIN_MESSAGE_CHARS);
  });

  it("never emits a lone surrogate at the clip boundary (#86 class)", () => {
    // An astral pair straddling the ceiling would be split by a bare .slice().
    const msg = "a".repeat(DRAIN_MESSAGE_CHARS - 1) + "🛰" + "b".repeat(50);
    const row = normalizeEntry(entry({ message: msg }))!;
    expect(row.message!.length).toBe(DRAIN_MESSAGE_CHARS - 1);
    expect(/[\uD800-\uDFFF]/.test(row.message!)).toBe(false);
    expect(() => JSON.parse(JSON.stringify({ m: row.message }))).not.toThrow();
  });

  it("hashes the FULL message, so two long messages differing past the clip differ", () => {
    const a = normalizeEntry(entry({ message: "y".repeat(DRAIN_MESSAGE_CHARS) + "AAA" }))!;
    const b = normalizeEntry(entry({ id: "b", message: "y".repeat(DRAIN_MESSAGE_CHARS) + "BBB" }))!;
    expect(a.message).toBe(b.message);
    expect(a.messageSha256).not.toBe(b.messageSha256);
  });
});

// ------------------------------------------------------------ batch semantics

describe("normalizeBatch: self-ingestion, cap, duplicates", () => {
  it("drops the receiver's own path (with or without a trailing slash) and counts it", () => {
    const b = normalizeBatch(
      [
        entry({ id: "self1", path: DRAIN_ROUTE_PATH }),
        entry({ id: "self2", path: `${DRAIN_ROUTE_PATH}/` }),
        entry({ id: "self3", path: `${DRAIN_ROUTE_PATH}?x=1` }),
        entry({ id: "keep" }),
      ],
      DEFAULT_MAX_ROWS,
    );
    expect(b.selfIngested).toBe(3);
    expect(b.rows.map((r) => r.id)).toEqual(["keep"]);
  });

  it("does not drop a path that merely starts with the drain path", () => {
    expect(isSelfIngestion("/api/logs/drainage")).toBe(false);
    expect(isSelfIngestion("/api/logs")).toBe(false);
    expect(isSelfIngestion(null)).toBe(false);
    expect(isSelfIngestion(DRAIN_ROUTE_PATH)).toBe(true);
  });

  it("stores the first `limit` rows and counts the rest as overCap", () => {
    const many = Array.from({ length: 25 }, (_, i) => entry({ id: `id-${i}` }));
    const b = normalizeBatch(many, 10);
    expect(b.rows).toHaveLength(10);
    expect(b.overCap).toBe(15);
    expect(b.rows.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `id-${i}`));
  });

  it("collapses repeated ids inside one delivery", () => {
    const b = normalizeBatch([entry({ id: "dup" }), entry({ id: "dup" })], DEFAULT_MAX_ROWS);
    expect(b.rows).toHaveLength(1);
    expect(b.duplicates).toBe(1);
  });

  it("counts unusable entries", () => {
    const b = normalizeBatch([entry({ id: undefined }), "x", entry()], DEFAULT_MAX_ROWS);
    expect(b.invalid).toBe(2);
    expect(b.rows).toHaveLength(1);
  });
});

// -------------------------------------------------------------- env + arithmetic

describe("bounds and retention arithmetic", () => {
  it("defaults", () => {
    expect(maxRows()).toBe(DEFAULT_MAX_ROWS);
    expect(maxBodyBytes()).toBe(4_000_000);
    expect(retentionDays()).toBe(DEFAULT_RETENTION_DAYS);
    expect(sweepLimit()).toBe(5000);
  });

  it("honours valid overrides", () => {
    process.env.LOG_DRAIN_MAX_ROWS = "50";
    process.env.LOG_DRAIN_RETENTION_DAYS = "7";
    process.env.LOG_DRAIN_SWEEP_LIMIT = "100";
    process.env.LOG_DRAIN_MAX_BODY_BYTES = "1024";
    expect(maxRows()).toBe(50);
    expect(retentionDays()).toBe(7);
    expect(sweepLimit()).toBe(100);
    expect(maxBodyBytes()).toBe(1024);
  });

  it("falls back to the default on 0, negative, blank and garbage — retention must never mean 'keep forever'", () => {
    for (const bad of ["0", "-3", "", "   ", "abc", "NaN"]) {
      process.env.LOG_DRAIN_RETENTION_DAYS = bad;
      expect(retentionDays()).toBe(DEFAULT_RETENTION_DAYS);
    }
  });

  it("retentionCutoff subtracts whole days from the instant given", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(retentionCutoff(now, 14).toISOString()).toBe("2026-09-06T12:00:00.000Z");
    expect(retentionCutoff(now, 1).toISOString()).toBe("2026-09-19T12:00:00.000Z");
  });
});

describe("sweep throttle", () => {
  it("claims at most one slot per interval and claims it exactly once", () => {
    const t0 = new Date("2026-09-20T12:00:00Z");
    expect(claimSweepSlot(t0)).toBe(true);
    expect(claimSweepSlot(t0)).toBe(false);
    expect(claimSweepSlot(new Date(t0.getTime() + DRAIN_SWEEP_INTERVAL_MS - 1))).toBe(false);
    expect(claimSweepSlot(new Date(t0.getTime() + DRAIN_SWEEP_INTERVAL_MS))).toBe(true);
  });
});

// ---------------------------------------------------------------------- SQL

describe("insertRuntimeLogs", () => {
  it("emits one parameterized multi-row INSERT with ON CONFLICT DO NOTHING", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const exec: SqlExec = async (text, params) => {
      calls.push([text, params]);
      return [{ id: "a" }, { id: "b" }];
    };
    const rows = normalizeBatch([entry({ id: "a" }), entry({ id: "b" })], DEFAULT_MAX_ROWS).rows;
    const stored = await insertRuntimeLogs(exec, rows);

    expect(calls).toHaveLength(1);
    const [text, params] = calls[0];
    expect(text).toContain("INSERT INTO runtime_logs");
    expect(text).toContain("ON CONFLICT (id) DO NOTHING");
    expect(params).toHaveLength(24); // 2 rows x 12 columns
    expect(text).toContain("$24");
    expect(text).not.toContain("$25");
    expect(stored).toBe(2);
  });

  it("reports what the database actually inserted, so a redelivery reports 0", async () => {
    const exec: SqlExec = async () => [];
    const rows = normalizeBatch([entry()], DEFAULT_MAX_ROWS).rows;
    expect(await insertRuntimeLogs(exec, rows)).toBe(0);
  });

  it("does not touch the database for an empty batch", async () => {
    const exec = vi.fn(async () => []);
    expect(await insertRuntimeLogs(exec, [])).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("sweepRuntimeLogs", () => {
  it("bounds the delete with a ctid subselect and a LIMIT", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const exec: SqlExec = async (text, params) => {
      calls.push([text, params]);
      return [{ id: "x" }, { id: "y" }];
    };
    const deleted = await sweepRuntimeLogs(exec, new Date("2026-09-06T12:00:00Z"), 500);
    const [text, params] = calls[0];
    expect(text).toContain("DELETE FROM runtime_logs");
    expect(text).toContain("ctid IN (SELECT ctid FROM runtime_logs WHERE received_at < $1 LIMIT $2)");
    expect(params).toEqual(["2026-09-06T12:00:00.000Z", 500]);
    expect(deleted).toBe(2);
  });

  it("sweeps on received_at, not logged_at (retention is about when WE stored it)", async () => {
    const exec: SqlExec = async (text) => {
      expect(text).not.toContain("logged_at");
      return [];
    };
    await sweepRuntimeLogs(exec, new Date(), 10);
  });
});
