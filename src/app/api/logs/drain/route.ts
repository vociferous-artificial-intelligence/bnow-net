import { NextRequest, NextResponse } from "next/server";
import {
  claimSweepSlot,
  drainSecret,
  insertRuntimeLogs,
  maxBodyBytes,
  maxRows,
  normalizeBatch,
  parseDrainBody,
  retentionCutoff,
  retentionDays,
  sweepLimit,
  sweepRuntimeLogs,
  verifyDrainSignature,
  type SqlExec,
} from "@/lib/logs/drain";

export const runtime = "nodejs"; // node:crypto (HMAC + timingSafeEqual)
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Vercel log-drain receiver (OPEN-TASKS #93, docs/designs/LOG-DRAIN.md).
//
// This is a ROUTE, not a page, so standing ruling 21 has no gate to place:
// there is no session and no user. THE DRAIN SIGNATURE IS THE AUTHORIZATION,
// and it is verified before any parse, any allocation past the raw body, and
// any database call. Only POST is exported — a browser GET is a framework 405
// and can leak nothing.
//
// It is also NOT a cron: it opens no cron_runs row, never calls withCronRun,
// and therefore neither runs nor perturbs the #98 timeout sweep or the #103
// map watchdog (ruling 10 untouched).
//
// THE HANDLER IS LOG-SILENT ON EVERY PATH, including errors. The receiver runs
// on the deployment whose logs it ingests, so one console line per failed
// delivery would make each failure generate a line that generates a delivery
// that fails (design §7). Counters travel in the response body; the durable
// signal is what does or does not appear in runtime_logs.
//
// Response policy — always prefer dropping data to blocking or retry-storming:
//   secret unset              -> 503, body never read, nothing written (fail closed)
//   signature missing/wrong   -> 403, nothing written (constant-time compare)
//   oversized/unparseable     -> 200, stored 0   (a non-2xx would be retried forever)
//   database insert failed    -> 500              (the one case a retry helps)
//   anything else thrown      -> 200, stored 0    (bookkeeping never breaks the producer)

async function exec(): Promise<SqlExec> {
  // Lazy: @/db throws at module load without DATABASE_URL, and the secret
  // check above must be able to answer 503 without one.
  const { rawSql } = await import("@/db");
  return (text, params) =>
    rawSql.query(text, params) as Promise<Array<Record<string, unknown>>>;
}

export async function POST(req: NextRequest) {
  const secret = drainSecret();
  if (secret === null) {
    return NextResponse.json({ error: "log drain not configured" }, { status: 503 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: true, received: 0, stored: 0, dropped: 0 }, { status: 200 });
  }

  if (!verifyDrainSignature(raw, req.headers.get("x-vercel-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  // Size cap AFTER the signature so an unauthenticated caller learns nothing
  // from the difference. The body was already bounded by the platform's own
  // request-size limit; this guards against that limit changing.
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > maxBodyBytes()) {
    return NextResponse.json(
      { ok: true, received: 0, stored: 0, dropped: 0, reason: "body_over_cap", bytes },
      { status: 200 },
    );
  }

  const { entries, malformed } = parseDrainBody(raw);
  const batch = normalizeBatch(entries, maxRows());
  const dropped =
    malformed + batch.invalid + batch.selfIngested + batch.overCap + batch.duplicates;

  if (batch.rows.length === 0) {
    return NextResponse.json(
      { ok: true, received: entries.length, stored: 0, dropped },
      { status: 200 },
    );
  }

  let run: SqlExec;
  let stored: number;
  try {
    run = await exec();
    stored = await insertRuntimeLogs(run, batch.rows);
  } catch {
    // Real batch, valid signature, storage failed: this is the one condition
    // where Vercel's retry is useful. Bounded by its own retry policy, and
    // surfaced by its errored-drain notification if it persists.
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  // Retention, at most once an hour per process, AFTER the insert and bounded
  // per pass. Deliberately not hooked into withCronRun/startRun: that path
  // already carries two riders and runs at every cron start (≤15 min), and an
  // unrelated DELETE has no business on the critical path of every scheduled
  // job. The drain route is the table's only writer and runs often enough.
  let swept: number | undefined;
  if (claimSweepSlot()) {
    try {
      swept = await sweepRuntimeLogs(run, retentionCutoff(new Date(), retentionDays()), sweepLimit());
    } catch {
      // Hygiene never breaks ingestion, and never logs (see the file header).
    }
  }

  return NextResponse.json(
    { ok: true, received: entries.length, stored, dropped, ...(swept === undefined ? {} : { swept }) },
    { status: 200 },
  );
}
