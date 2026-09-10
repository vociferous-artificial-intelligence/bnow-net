// Vercel log-drain receiver — pure logic (OPEN-TASKS #93, docs/designs/LOG-DRAIN.md).
//
// The route (src/app/api/logs/drain/route.ts) is thin wiring; everything that
// can be decided without a database lives here so it can be pinned by
// always-run unit tests. Nothing in this module logs: the receiver ingests its
// own deployment's logs, so a single console line on a failure path would make
// every failed delivery generate a line that generates a delivery (§7 of the
// design). Counters travel in the response body instead.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { wellFormedSlice } from "@/lib/text/well-formed-slice";

/** The route's own path. Entries for it are dropped before insert so the
 *  self-ingestion loop can never reach the table. */
export const DRAIN_ROUTE_PATH = "/api/logs/drain";

/** Same clip as cron_runs.error. Applied with wellFormedSlice, never a bare
 *  .slice(): the #86 lone-surrogate defect is a code-unit-slice defect, and
 *  this is a code-unit slice. */
export const DRAIN_MESSAGE_CHARS = 2000;

export const DEFAULT_MAX_ROWS = 1000;
export const DEFAULT_MAX_BODY_BYTES = 4_000_000;
export const DEFAULT_RETENTION_DAYS = 14;
export const DEFAULT_SWEEP_LIMIT = 5000;
/** At most one retention pass per hour per process (the ask-retention pattern:
 *  hygiene rides a path that is already running, no new cron). */
export const DRAIN_SWEEP_INTERVAL_MS = 60 * 60_000;

// Column-width guards. Postgres text is unbounded, but an attacker-shaped or
// malformed entry must not be able to make a row arbitrarily wide.
const MAX_ID = 200;
const MAX_SHORT = 64; // source / level / type / environment
const MAX_MEDIUM = 128; // deploymentId / requestId
const MAX_PATH = 512;

export interface RuntimeLogRow {
  id: string;
  loggedAt: string; // ISO-8601 with an explicit Z
  deploymentId: string | null;
  source: string | null;
  level: string | null;
  type: string | null;
  environment: string | null;
  requestPath: string | null;
  requestId: string | null;
  statusCode: number | null;
  message: string | null;
  messageSha256: string | null;
}

/** A parameterized query runner. Injected so unit tests never need a database
 *  and the route can hand in either the neon HTTP client or a Pool. */
export type SqlExec = (text: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

// ---------------------------------------------------------------- env readers

function trimmed(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const v = raw.trim();
  return v === "" ? null : v;
}

/** The drain signature secret. Absent or blank ⇒ the receiver FAILS CLOSED
 *  (503, nothing read, nothing written): an unconfigured receiver must never
 *  accept unauthenticated data. */
export function drainSecret(): string | null {
  return trimmed("LOG_DRAIN_SECRET");
}

function posInt(name: string, fallback: number): number {
  const raw = trimmed(name);
  if (raw === null) return fallback;
  // Floor BEFORE the > 0 test (WS2-F25): checking the un-floored value accepted
  // anything in (0,1) — LOG_DRAIN_RETENTION_DAYS=0.5, a plausible "twelve hours",
  // floored to 0 and was accepted, which contradicts .env.example and would make
  // the sweep cutoff `now` (delete everything).
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Retention window in days. Unlike a spend cap (ruling 4) this deliberately
 *  does NOT fail closed on a bad value: "fail closed" for retention would mean
 *  "keep forever", which is the unsafe direction. */
export function retentionDays(): number {
  return posInt("LOG_DRAIN_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
}
/** Hard ceiling on rows per INSERT. insertRuntimeLogs binds 12 parameters per row
 *  in ONE statement and the PostgreSQL extended protocol caps a Bind message at
 *  65,535 parameters, so 5,462 rows (65,544 parameters) fails outright — measured
 *  on real Postgres, with 5,461 storing cleanly (WS2-F26). The cap is enforced
 *  here rather than by chunking the INSERT: one statement keeps the delivery
 *  atomic, and the overflow is already counted as `overCap` and dropped rather
 *  than lost to a retry loop. 5,000 leaves 461 rows of margin. */
export const MAX_ROWS_CEILING = 5000;

export function maxRows(): number {
  return Math.min(posInt("LOG_DRAIN_MAX_ROWS", DEFAULT_MAX_ROWS), MAX_ROWS_CEILING);
}
export function maxBodyBytes(): number {
  return posInt("LOG_DRAIN_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES);
}
export function sweepLimit(): number {
  return posInt("LOG_DRAIN_SWEEP_LIMIT", DEFAULT_SWEEP_LIMIT);
}

// ------------------------------------------------------------------ signature

/** Vercel signs each drain delivery with `x-vercel-signature`: the hex
 *  HMAC-SHA1 of the RAW request body, keyed by the drain's signature secret
 *  (https://vercel.com/docs/drains/security, read 2026-09-06). SHA-1 is
 *  Vercel's choice, not ours; it is a keyed MAC over a body we then treat as
 *  untrusted data regardless.
 *
 *  Constant-time compare, with the length check done on the DECODED bytes so a
 *  wrong-length header cannot be distinguished by timing from a wrong value —
 *  and so timingSafeEqual is never handed mismatched buffers (it throws). */
export function verifyDrainSignature(
  rawBody: string | Buffer,
  header: string | null,
  secret: string,
): boolean {
  if (typeof header !== "string" || header.length === 0) return false;
  const hex = header.trim();
  // Buffer.from(_, "hex") does not throw on non-hex input, it stops decoding, and
  // it also silently DROPS a dangling nibble — so an odd-length header consisting
  // of the correct 40 hex characters plus one more decoded to the correct 20 bytes
  // and verified TRUE (WS2-F52). Pin the exact SHA-1 hex length instead of "is hex".
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) return false;
  // Over the RAW bytes. A string body would be the UTF-8 RE-ENCODING of a decoded
  // request, so any invalid UTF-8 sequence (already replaced with U+FFFD) would
  // change the signed bytes and fail a legitimately signed delivery (WS2-F54).
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha1", secret).update(body).digest();
  const got = Buffer.from(hex, "hex");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

// ------------------------------------------------------------------ redaction

const REDACTIONS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "postgres://[redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]"],
  [/\bsk_[A-Za-z0-9_-]{8,}/g, "sk_[redacted]"],
  // NO \b before the keyword (WS2-F24). A word boundary there was the whole defect:
  // there is none inside `LOG_DRAIN_SECRET`, `client_secret` or `clientSecret`, so
  // the single most likely accidental leak shape — an identifier ENDING in the
  // keyword, followed by `=` or `:` — passed through untouched. Dropping the anchor
  // fixes every one of those forms, and `MYSECRET=` (no separator at all) with them.
  //
  // It also stays LINEAR, which matters more than it looks: redaction runs on the
  // FULL untruncated message, the body cap is 4 MB, and a slow regex here would
  // time the function out -> non-2xx -> Vercel retries the identical body, which is
  // the permanent retry loop this whole module is built to avoid. The first attempt
  // at this fix put a variable-length identifier scan BEFORE the keyword and was
  // quadratic: 128 KB of a dense separator run took 11 s (measured). Matching the
  // keyword literal first keeps it at ~1 ms per MB.
  //
  // Over-matching is bounded by what FOLLOWS: an 8+ character non-delimiter value
  // after `=` or `:`. "broken=..." does not end in a keyword; "token count 12345"
  // has no assignment.
  [
    /(api[_-]?key|secret|token|session|password|passwd)("?\s*[:=]\s*"?)[^\s"',;)}\]]{8,}/gi,
    "$1$2[redacted]",
  ],
];

/** Safety net, not a licence to log secrets: our code does not log credentials,
 *  but an unhandled driver error can serialize a connection string. Runs
 *  BEFORE hashing and truncation, so message_sha256 is a hash of what we
 *  actually keep the shape of, and a secret can never survive in a hash
 *  preimage we later publish. */
export function redactSecrets(s: string): string {
  let out = s;
  for (const [re, to] of REDACTIONS) out = out.replace(re, to);
  return out;
}

// --------------------------------------------------------------------- parsing

export interface ParsedBody {
  entries: unknown[];
  /** Lines/values that were present but not usable as JSON objects. */
  malformed: number;
}

/** Vercel delivers either a JSON array of log objects or NDJSON, selected at
 *  registration (https://vercel.com/docs/drains/using-drains, read
 *  2026-09-06); the logs reference additionally shows its "JSON" example as
 *  newline-separated objects. All three shapes are accepted here so a format
 *  change in the dashboard cannot silently stop ingestion. A malformed line is
 *  counted and skipped — never thrown, because a throw would turn into a
 *  retry of a body we have already decided we cannot use. */
export function parseDrainBody(raw: string): ParsedBody {
  const body = raw.trim();
  if (body === "") return { entries: [], malformed: 0 };

  try {
    const whole = JSON.parse(body) as unknown;
    if (Array.isArray(whole)) {
      const entries = whole.filter(isPlainObject);
      return { entries, malformed: whole.length - entries.length };
    }
    if (isPlainObject(whole)) return { entries: [whole], malformed: 0 };
    return { entries: [], malformed: 1 };
  } catch {
    // not a single JSON value — fall through to line-delimited
  }

  const entries: unknown[] = [];
  let malformed = 0;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    try {
      const v = JSON.parse(t) as unknown;
      if (isPlainObject(v)) entries.push(v);
      else malformed++;
    } catch {
      malformed++;
    }
  }
  return { entries, malformed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------- normalizing

/** U+0000. PostgreSQL text columns reject it outright ("invalid byte sequence for
 *  encoding UTF8: 0x00"), and the batch is ONE multi-row INSERT, so a single
 *  poisoned entry made the whole delivery unstorable — 500, Vercel retries the
 *  identical body, and the co-batched clean entries are lost permanently rather
 *  than transiently (WS2-F03, measured on real Postgres). wellFormedSlice strips
 *  lone surrogates, not control characters, so this is its own pass. */
const NUL = /\u0000/g;

/** int4 bounds. status_code is an `integer` column; Math.trunc alone let a value
 *  past 2^31-1 through and PostgreSQL failed the WHOLE batch on it (WS2-F03,
 *  second half). Clamping keeps the row — a nonsense status code is worth
 *  strictly more than a permanently rejected delivery.
 *
 *  Scoped to status_code ON PURPOSE. The register's remediation said "int() ->
 *  clamp", but int() also reads `timestamp`, a millisecond epoch that is
 *  legitimately ~1.76e12 and lands in a timestamptz, not an int4: clamping there
 *  moved every logged_at to 1970-01-25. The existing projection test caught it. */
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

function str(v: unknown, limit: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(NUL, "").trim();
  if (t === "") return null;
  return wellFormedSlice(t, limit);
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

/** int() for a value bound for an int4 column. */
function int4(v: unknown): number | null {
  const n = int(v);
  return n === null ? null : Math.min(Math.max(n, INT4_MIN), INT4_MAX);
}

/** Strip the query string and fragment. `proxy.path` is documented as "request
 *  path WITH query parameters"; our own cron URLs carry harmless `?which=`,
 *  but `/ask?q=<user question>` is not harmless — storing it would create an
 *  undisclosed second copy of Ask content outside ASK_CONTENT_RETENTION_DAYS.
 *  The cron discriminator lost here is recoverable from cron_runs.job. */
export function stripQuery(path: string): string {
  const cut = Math.min(
    ...[path.indexOf("?"), path.indexOf("#")].map((i) => (i === -1 ? path.length : i)),
  );
  return path.slice(0, cut);
}

/** Is this entry the receiver's own invocation coming back to it? */
export function isSelfIngestion(requestPath: string | null): boolean {
  if (requestPath === null) return false;
  const p = requestPath.endsWith("/") ? requestPath.slice(0, -1) : requestPath;
  return p === DRAIN_ROUTE_PATH;
}

/** Project one Vercel log entry onto our columns. Returns null when the entry
 *  cannot be stored at all — no id (there is no primary key, so no idempotent
 *  redelivery) or no usable timestamp (there is no window axis).
 *
 *  This is a PROJECTION, deliberately: an unlisted field is not stored, so a
 *  future addition to Vercel's schema cannot start silently landing in our
 *  database. Enum-valued fields are stored as free text rather than validated
 *  against today's value list — a new Vercel `source` should be visible, not
 *  dropped. */
export function normalizeEntry(entry: unknown): RuntimeLogRow | null {
  if (!isPlainObject(entry)) return null;

  const id = str(entry.id, MAX_ID);
  if (id === null) return null;

  const ts = int(entry.timestamp);
  if (ts === null || ts <= 0) return null;
  const loggedAt = new Date(ts);
  if (Number.isNaN(loggedAt.getTime())) return null;

  const proxy = isPlainObject(entry.proxy) ? entry.proxy : null;
  const rawPath = str(entry.path, MAX_PATH) ?? (proxy ? str(proxy.path, MAX_PATH) : null);
  const requestPath = rawPath === null ? null : stripQuery(rawPath) || null;

  let message: string | null = null;
  let messageSha256: string | null = null;
  if (typeof entry.message === "string" && entry.message !== "") {
    const redacted = redactSecrets(entry.message.replace(NUL, ""));
    messageSha256 = createHash("sha256").update(redacted, "utf8").digest("hex");
    message = wellFormedSlice(redacted, DRAIN_MESSAGE_CHARS);
  }

  return {
    id,
    loggedAt: loggedAt.toISOString(),
    deploymentId: str(entry.deploymentId, MAX_MEDIUM),
    source: str(entry.source, MAX_SHORT),
    level: str(entry.level, MAX_SHORT),
    type: str(entry.type, MAX_SHORT),
    environment: str(entry.environment, MAX_SHORT),
    requestPath,
    requestId: str(entry.requestId, MAX_MEDIUM),
    statusCode: int4(entry.statusCode),
    message,
    messageSha256,
  };
}

export interface NormalizedBatch {
  rows: RuntimeLogRow[];
  /** Unusable entries: no id, no timestamp, or not an object. */
  invalid: number;
  /** Entries for the drain route itself (§7 mitigation 1). */
  selfIngested: number;
  /** Entries beyond `limit`, dropped rather than stored. */
  overCap: number;
  /** Repeated ids inside ONE delivery, collapsed to the first occurrence. */
  duplicates: number;
}

export function normalizeBatch(entries: unknown[], limit: number): NormalizedBatch {
  const rows: RuntimeLogRow[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let selfIngested = 0;
  let overCap = 0;
  let duplicates = 0;

  for (const e of entries) {
    const row = normalizeEntry(e);
    if (row === null) {
      invalid++;
      continue;
    }
    if (isSelfIngestion(row.requestPath)) {
      selfIngested++;
      continue;
    }
    if (seen.has(row.id)) {
      duplicates++;
      continue;
    }
    if (rows.length >= limit) {
      overCap++;
      continue;
    }
    seen.add(row.id);
    rows.push(row);
  }
  return { rows, invalid, selfIngested, overCap, duplicates };
}

// ------------------------------------------------------------------ persisting

const COLUMNS = [
  "id",
  "logged_at",
  "deployment_id",
  "source",
  "level",
  "type",
  "environment",
  "request_path",
  "request_id",
  "status_code",
  "message",
  "message_sha256",
] as const;

/** One multi-row INSERT. `ON CONFLICT (id) DO NOTHING` makes a retried
 *  delivery idempotent — Vercel retries on any non-2xx, and a partial batch
 *  must not become duplicated evidence. Returns the number of rows actually
 *  inserted (a redelivery therefore reports 0 stored, truthfully). */
export async function insertRuntimeLogs(exec: SqlExec, rows: RuntimeLogRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const params: unknown[] = [];
  const tuples = rows.map((r) => {
    const vals = [
      r.id,
      r.loggedAt,
      r.deploymentId,
      r.source,
      r.level,
      r.type,
      r.environment,
      r.requestPath,
      r.requestId,
      r.statusCode,
      r.message,
      r.messageSha256,
    ];
    const placeholders = vals.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const text =
    `INSERT INTO runtime_logs (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}` +
    ` ON CONFLICT (id) DO NOTHING RETURNING id`;
  const inserted = await exec(text, params);
  return inserted.length;
}

/** Retention cutoff instant: rows RECEIVED before this are removable. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Bounded delete. Postgres DELETE takes no LIMIT, so the bound is a ctid
 *  subselect: a backlog drains over successive hourly passes instead of one
 *  long statement blocking the delivery that triggered it. */
export async function sweepRuntimeLogs(exec: SqlExec, cutoff: Date, limit: number): Promise<number> {
  const deleted = await exec(
    `DELETE FROM runtime_logs
      WHERE ctid IN (SELECT ctid FROM runtime_logs WHERE received_at < $1 LIMIT $2)
      RETURNING id`,
    [cutoff.toISOString(), limit],
  );
  return deleted.length;
}

let lastSweepMs = 0;

/** Test seam: the throttle is module state by design (one process, one clock). */
export function resetDrainSweepThrottle(): void {
  lastSweepMs = 0;
}

/** True at most once per DRAIN_SWEEP_INTERVAL_MS, and it CLAIMS the slot when
 *  it returns true — so two concurrent deliveries in the same process cannot
 *  both sweep. */
export function claimSweepSlot(now: Date = new Date()): boolean {
  if (now.getTime() - lastSweepMs < DRAIN_SWEEP_INTERVAL_MS) return false;
  lastSweepMs = now.getTime();
  return true;
}
