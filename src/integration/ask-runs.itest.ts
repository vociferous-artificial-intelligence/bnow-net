import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// AI Search Phase 1 / Gate 1: real-Postgres proof of the atomic allowance +
// provider-reservation contract (docs/designs/ASK-RUNS-RESERVATION-CONTRACT-
// 2026-07-19.md §7). Runs on the disposable Neon fork; the fork inherits the
// PRODUCTION schema, so beforeAll first brings it to this checkout's migration
// head (0021 + 0022). Concurrency cases use Promise.all over separate pool
// connections — genuine parallel transactions, not interleaved mocks.
// Zero paid/provider/network calls; test providers are namespaced itest_*.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL; // the modules under test read DATABASE_URL

const { runMigrations } = await import("../../scripts/migrate");
const {
  reserveProviderSpend,
  settleReservation,
  releaseUnstartedReservation,
  markReservationStarted,
  expireStaleReservations,
} = await import("@/lib/usage/reservations");
const { createRun, reserveAllowance, finalizeRun, expireStaleRuns } = await import("@/lib/ask/runs");
const { askWithLimits } = await import("@/lib/ask/limits");

const ASK = "itest_resv_ask";
const EMBED = "itest_resv_embed";
const CAPS = { totalCapUsd: 100, dailyUsdCap: 1.0, dailyRequestCap: 100, runRequestCap: 10 };

let pool: Pool;
const uuid = () => crypto.randomUUID();

async function cleanup() {
  await pool.query(`DELETE FROM provider_usage_reservations WHERE provider LIKE 'itest_resv_%'`);
  await pool.query(`DELETE FROM provider_usage WHERE provider LIKE 'itest_resv_%'`);
  await pool.query(`DELETE FROM ask_allowance_reservations WHERE user_email LIKE 'itest-runs%'`);
  await pool.query(`DELETE FROM ask_usage WHERE user_email LIKE 'itest-runs%'`);
  await pool.query(`DELETE FROM ask_runs WHERE user_email LIKE 'itest-runs%'`);
}

beforeAll(async () => {
  await runMigrations(URL!);
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function seedSettled(provider: string, dayIso: string, usd: number, requests = 1) {
  await pool.query(
    `INSERT INTO provider_usage (provider, day, requests, units, est_usd)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (provider, day) DO UPDATE SET
       requests = provider_usage.requests + EXCLUDED.requests,
       est_usd = provider_usage.est_usd + EXCLUDED.est_usd`,
    [provider, dayIso, requests, usd],
  );
}

const today = () => new Date().toISOString().slice(0, 10);

describe("provider reservations — atomic caps (contract §1/§2)", () => {
  it("two concurrent reservations straddling the DAILY cap: exactly one wins", async () => {
    await cleanup();
    await seedSettled(ASK, today(), 0.95);
    const [a, b] = await Promise.all([
      reserveProviderSpend({ runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.04, caps: CAPS }),
      reserveProviderSpend({ runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.04, caps: CAPS }),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    const refusals = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(refusals).toHaveLength(1);
    expect((refusals[0] as { code: string }).code).toBe("daily_usd");
  });

  it("two concurrent reservations straddling the ALL-TIME cap: exactly one wins", async () => {
    await cleanup();
    // historical spend on a prior day so only the total cap binds
    await seedSettled(ASK, "2026-01-01", 99.9);
    const [a, b] = await Promise.all([
      reserveProviderSpend({ runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.08, caps: CAPS }),
      reserveProviderSpend({ runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.08, caps: CAPS }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].filter((r) => !r.ok && r.code === "total_usd")).toHaveLength(1);
  });

  it("envelope isolation: an active itest embed reservation never blocks the ask envelope", async () => {
    await cleanup();
    // embed almost at its daily cap via an ACTIVE reservation
    const e = await reserveProviderSpend({
      runId: uuid(), stage: "embed", attempt: 1, provider: EMBED, ceilingUsd: 0.99, caps: CAPS,
    });
    expect(e.ok).toBe(true);
    // ask reservation unaffected
    const a = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.5, caps: CAPS,
    });
    expect(a.ok).toBe(true);
    // but a SECOND embed reservation is blocked by the first's active ceiling
    const e2 = await reserveProviderSpend({
      runId: uuid(), stage: "embed", attempt: 2, provider: EMBED, ceilingUsd: 0.05, caps: CAPS,
    });
    expect(e2.ok).toBe(false);
  });

  it("a run's own SETTLED reservation is not double-counted by its later stage check", async () => {
    await cleanup();
    const runId = uuid();
    // rerank reserves a large ceiling, then settles to a small actual
    const rerank = await reserveProviderSpend({
      runId, stage: "rerank", attempt: 1, provider: ASK, ceilingUsd: 0.6, caps: CAPS, startedImmediately: true,
    });
    expect(rerank.ok).toBe(true);
    expect(await settleReservation((rerank as { reservationId: string }).reservationId, { requests: 1, units: 100, usd: 0.01 })).toBe(true);
    // answer's ceiling 0.6 fits ONLY if the settled rerank counts once (0.01),
    // not ceiling+actual (0.6 + 0.01 + 0.6 = 1.21 > 1 would refuse)
    const answer = await reserveProviderSpend({
      runId, stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.6, caps: CAPS,
    });
    expect(answer.ok).toBe(true);
  });

  it("settlement is idempotent and closes the ceiling exactly once", async () => {
    await cleanup();
    const r = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.2, caps: CAPS, startedImmediately: true,
    });
    expect(r.ok).toBe(true);
    const id = (r as { reservationId: string }).reservationId;
    const [s1, s2] = await Promise.all([
      settleReservation(id, { requests: 1, units: 500, usd: 0.03 }),
      settleReservation(id, { requests: 1, units: 500, usd: 0.03 }),
    ]);
    expect([s1, s2].filter(Boolean)).toHaveLength(1); // one winner
    const { rows } = await pool.query(
      `SELECT requests, est_usd::float AS usd FROM provider_usage WHERE provider = $1 AND day = $2::date`,
      [ASK, today()],
    );
    expect(rows[0].requests).toBe(1); // actuals written exactly once
    expect(rows[0].usd).toBeCloseTo(0.03, 6);
  });

  it("release works for unstarted only; a started reservation must settle", async () => {
    await cleanup();
    const r1 = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.1, caps: CAPS,
    });
    expect(r1.ok).toBe(true);
    const id1 = (r1 as { reservationId: string }).reservationId;
    expect(await releaseUnstartedReservation(id1)).toBe(true);

    const r2 = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.1, caps: CAPS,
    });
    const id2 = (r2 as { reservationId: string }).reservationId;
    expect(await markReservationStarted(id2)).toBe(true);
    expect(await releaseUnstartedReservation(id2)).toBe(false); // started: never vanishes
  });

  it("expiry releases unstarted and ceiling-settles started reservations (conservative)", async () => {
    await cleanup();
    const r1 = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.1, caps: CAPS,
    });
    const r2 = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.2, caps: CAPS, startedImmediately: true,
    });
    const id1 = (r1 as { reservationId: string }).reservationId;
    const id2 = (r2 as { reservationId: string }).reservationId;
    await pool.query(
      `UPDATE provider_usage_reservations SET created_at = now() - interval '2 hours' WHERE id = ANY($1::uuid[])`,
      [[id1, id2]],
    );
    const swept = await expireStaleReservations(60 * 60_000);
    expect(swept.released).toBeGreaterThanOrEqual(1);
    expect(swept.ceilingSettled).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query(`SELECT id, status, actual_usd::float AS a FROM provider_usage_reservations WHERE id = ANY($1::uuid[])`, [[id1, id2]]);
    const byId = new Map(rows.map((r: { id: string; status: string; a: number | null }) => [r.id, r]));
    expect(byId.get(id1)!.status).toBe("released");
    expect(byId.get(id2)!.status).toBe("settled");
    expect(byId.get(id2)!.a).toBeCloseTo(0.2, 6); // settled AT CEILING
  });

  it("cap-unset fails closed with no reservation row and no lock", async () => {
    await cleanup();
    const r = await reserveProviderSpend({
      runId: uuid(), stage: "answer", attempt: 1, provider: ASK, ceilingUsd: 0.1,
      caps: { ...CAPS, totalCapUsd: null },
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("cap_unset");
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM provider_usage_reservations WHERE provider = $1`, [ASK]);
    expect(rows[0].n).toBe(0);
  });
});

describe("allowance slots — atomic last-slot (contract §3)", () => {
  const USER = "itest-runs-allowance@x.test";

  it("two concurrent reservations at the LAST slot: exactly one authorizes", async () => {
    await cleanup();
    // create runs first (authorize updates ask_runs)
    const runA = uuid(); const runB = uuid(); const runSeed = uuid();
    await createRun({ runId: runSeed, userEmail: USER, question: "seed", idempotencyKey: uuid() });
    await createRun({ runId: runA, userEmail: USER, question: "a", idempotencyKey: uuid() });
    await createRun({ runId: runB, userEmail: USER, question: "b", idempotencyKey: uuid() });
    // seed 1 of 2 slots
    expect((await reserveAllowance({ runId: runSeed, userEmail: USER, limit: 2 })).ok).toBe(true);
    const [a, b] = await Promise.all([
      reserveAllowance({ runId: runA, userEmail: USER, limit: 2 }),
      reserveAllowance({ runId: runB, userEmail: USER, limit: 2 }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    const refusal = [a, b].find((r) => !r.ok) as { reason: string };
    expect(refusal.reason).toBe("user_limit");
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM ask_allowance_reservations WHERE user_email = $1`,
      [USER],
    );
    expect(rows[0].n).toBe(2); // never a third slot
  });

  it("a replayed run reuses its slot instead of consuming another", async () => {
    await cleanup();
    const runId = uuid();
    await createRun({ runId, userEmail: USER, question: "q", idempotencyKey: uuid() });
    expect((await reserveAllowance({ runId, userEmail: USER, limit: 5 })).ok).toBe(true);
    expect((await reserveAllowance({ runId, userEmail: USER, limit: 5 })).ok).toBe(true);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM ask_allowance_reservations WHERE run_id = $1`,
      [runId],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("run rows — idempotent create/finalize/expiry (contract §4/§5)", () => {
  const USER = "itest-runs-rows@x.test";

  it("createRun is idempotent per (user, key); finalize terminalizes exactly once", async () => {
    await cleanup();
    const key = uuid();
    const first = await createRun({ runId: uuid(), userEmail: USER, question: "q", idempotencyKey: key });
    expect(first.replayed).toBe(false);
    const second = await createRun({ runId: uuid(), userEmail: USER, question: "q", idempotencyKey: key });
    expect(second.replayed).toBe(true);
    expect(second.run.id).toBe(first.run.id);

    const result = { answer: "stored", citedClaimIds: [], evidenceCount: 0, terms: [], provider: "stub", state: "answered", relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" } as never;
    const [f1, f2] = await Promise.all([
      finalizeRun({ runId: first.run.id, state: "answered", result, settledCostUsd: 0 }),
      finalizeRun({ runId: first.run.id, state: "answered", result, settledCostUsd: 0 }),
    ]);
    expect([f1, f2].filter(Boolean)).toHaveLength(1);

    const replayed = await createRun({ runId: uuid(), userEmail: USER, question: "q", idempotencyKey: key });
    expect(replayed.replayed).toBe(true);
    expect(replayed.run.finishedAt).not.toBeNull();
    expect((replayed.run.result as { answer: string }).answer).toBe("stored");
  });

  it("expiry marks stale non-terminal runs and keeps their allowance slot", async () => {
    await cleanup();
    const runId = uuid();
    await createRun({ runId, userEmail: USER, question: "q", idempotencyKey: uuid() });
    expect((await reserveAllowance({ runId, userEmail: USER, limit: 5 })).ok).toBe(true);
    await pool.query(`UPDATE ask_runs SET created_at = now() - interval '1 hour' WHERE id = $1`, [runId]);
    await expireStaleRuns();
    const { rows } = await pool.query(`SELECT status, expired FROM ask_runs WHERE id = $1`, [runId]);
    expect(rows[0].status).toBe("expired");
    expect(rows[0].expired).toBe(true);
    const slots = await pool.query(`SELECT count(*)::int AS n FROM ask_allowance_reservations WHERE run_id = $1`, [runId]);
    expect(slots.rows[0].n).toBe(1); // no free crash retries
  });
});

describe("askWithLimits enforce mode — end-to-end replay ($0, stub pipeline)", () => {
  const USER = "itest-runs-e2e@x.test";
  const SAVED = { enforce: process.env.ASK_RUNS_ENFORCE, key: process.env.OPENAI_API_KEY };

  it("duplicate submits with one idempotency key: one run, one usage row, stored result replayed, zero provider calls", async () => {
    await cleanup();
    // enforce on; NO OpenAI key -> every stage takes its $0 deterministic path,
    // so this end-to-end run costs nothing and calls no provider.
    process.env.ASK_RUNS_ENFORCE = "1";
    delete process.env.OPENAI_API_KEY;
    try {
      const key = crypto.randomUUID();
      const first = await askWithLimits("What happened in Kherson this week?", USER, { idempotencyKey: key });
      expect(first.runId).toBeTruthy();
      expect(["answered", "insufficient"]).toContain(first.state);

      const replay = await askWithLimits("What happened in Kherson this week?", USER, { idempotencyKey: key });
      expect(replay.runId).toBe(first.runId);
      expect(replay.answer).toBe(first.answer);

      const runs = await pool.query(`SELECT count(*)::int AS n FROM ask_runs WHERE user_email = $1`, [USER]);
      expect(runs.rows[0].n).toBe(1);
      const usage = await pool.query(`SELECT count(*)::int AS n FROM ask_usage WHERE user_email = $1`, [USER]);
      expect(usage.rows[0].n).toBe(1); // the replay logged nothing
      const slots = await pool.query(
        `SELECT count(*)::int AS n FROM ask_allowance_reservations WHERE user_email = $1`,
        [USER],
      );
      expect(slots.rows[0].n).toBe(1); // one gesture, one slot
    } finally {
      if (SAVED.enforce === undefined) delete process.env.ASK_RUNS_ENFORCE;
      else process.env.ASK_RUNS_ENFORCE = SAVED.enforce;
      if (SAVED.key !== undefined) process.env.OPENAI_API_KEY = SAVED.key;
    }
  });
});
