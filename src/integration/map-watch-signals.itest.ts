import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the #103 watchdog's signal queries: the swept-row
// count keys on the exact #98 sweep signature (ok=false, finished_at NULL),
// ages derive from the DB clock, and the eligibility EXISTS matches the map
// worker's predicate family. No email, no state writes — signals only.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;

const { loadMapWatchSignals, mapWatchConfigFromEnv } = await import("@/lib/analysis/map-watch");

let pool: Pool;
const seededRunIds: number[] = [];

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
});

afterAll(async () => {
  if (seededRunIds.length) {
    await pool.query(`DELETE FROM cron_runs WHERE id = ANY($1)`, [seededRunIds]);
  }
  await pool.end();
});

describe("loadMapWatchSignals against a production fork", () => {
  it("counts freshly swept map rows, ignores finished failures, and reads DB-clock ages", async () => {
    const q = (sql: string, params: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows) as Promise<Array<Record<string, unknown>>>;
    const before = await loadMapWatchSignals(q, mapWatchConfigFromEnv());
    expect(before.lastStartAgeSec).not.toBeNull(); // the fork carries real map history
    expect(typeof before.eligibleExists).toBe("boolean");

    // seed one row in the EXACT sweep shape (ok=false, finished_at NULL) and
    // one finished failure that must NOT count
    const swept = await pool.query(
      `INSERT INTO cron_runs (job, ok, error) VALUES ('map', false, 'timeout: itest seed') RETURNING id`,
    );
    seededRunIds.push(swept.rows[0].id);
    const finishedFail = await pool.query(
      `INSERT INTO cron_runs (job, ok, error, finished_at) VALUES ('map', false, 'itest finished failure', now()) RETURNING id`,
    );
    seededRunIds.push(finishedFail.rows[0].id);

    const after = await loadMapWatchSignals(q, mapWatchConfigFromEnv());
    expect(after.sweptRecent).toBe(before.sweptRecent + 1); // swept shape counted
    expect(after.lastStartAgeSec).toBeLessThanOrEqual(60); // the seed just started
  });
});

describe("pgClaimWatchSlot against a production fork", () => {
  it("first claim wins, an immediate second claim throttles, an aged slot re-claims", async () => {
    const { pgClaimWatchSlot } = await import("@/lib/analysis/map-watch");
    const q = (sql: string, params: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows) as Promise<Array<Record<string, unknown>>>;
    await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
    try {
      const t = 1_788_200_000_000;
      expect(await pgClaimWatchSlot(q, t, 600_000)).toBe(true); // fresh row
      expect(await pgClaimWatchSlot(q, t + 1_000, 600_000)).toBe(false); // inside interval
      expect(await pgClaimWatchSlot(q, t + 600_000, 600_000)).toBe(true); // slot aged out
    } finally {
      await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
    }
  });
});

// ---------------------------------------------------------------------------
// #103 end-to-end on real Postgres (step 21 / O3): the watchdog's detection
// proof was SYNTHETIC — deps-injected unit tests over mocked state. Here the
// slot claim, the state row and the five signal queries are all real Postgres
// on a production fork; only the clock and the mail transport are injected,
// because a test must not send mail and must not wait six hours.
//
// The scenario is the incident's own shape: map runs that die BEFORE their own
// health evaluation, leaving #98-swept rows (ok=false, finished_at still NULL)
// and no in-run alert. `startStaleMs`/`progressStaleMs` are set beyond any
// reachable age so `map_timeouts` is the ONLY problem the evaluation can
// report — otherwise the episode key would depend on how stale the fork
// happens to be when it is cut, and the assertions below would be luck.
describe("runMapWatchCheck end-to-end (#103): detect, throttle, dedupe, recover", () => {
  const CONFIG = {
    checkIntervalMs: 600_000,
    lookbackMs: 4 * 3_600_000,
    startStaleMs: Number.MAX_SAFE_INTEGER,
    progressStaleMs: Number.MAX_SAFE_INTEGER,
    cooldownMs: 6 * 3_600_000,
    emailTimeoutMs: 10_000,
  };
  const t0 = 1_788_400_000_000;

  afterAll(async () => {
    await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
  });

  it("emails once on the swept-timeout episode, throttles the slot, dedupes inside the cooldown, and sends one recovery notice", async () => {
    const { runMapWatchCheck, pgClaimWatchSlot, loadMapWatchSignals } = await import(
      "@/lib/analysis/map-watch"
    );
    const { loadProviderState, saveProviderState } = await import("@/lib/usage/spend-guard");

    const query = (sql: string, params: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows) as Promise<Array<Record<string, unknown>>>;

    await pool.query(`DELETE FROM provider_state WHERE provider = 'map_watch'`);
    // Fork-local neutralization (the flood-bounds itest sets the precedent):
    // push any pre-existing swept map rows — production's, and the first
    // describe's own seed — out of the lookback so the swept count starts at
    // exactly zero and the two rows seeded below are the whole signal. The
    // branch is disposable; nothing is deleted and no instant is fabricated on
    // a row this suite will read again.
    const shifted = await pool.query(
      `UPDATE cron_runs SET started_at = started_at - interval '30 days'
        WHERE job LIKE 'map%' AND ok = false AND finished_at IS NULL
          AND started_at > now() - make_interval(secs => $1) RETURNING id`,
      [Math.floor(CONFIG.lookbackMs / 1000)],
    );
    const baseline = await loadMapWatchSignals(query, CONFIG);
    expect(baseline.sweptRecent).toBe(0);
    // the two thresholds this scenario isolates away must be genuinely
    // inert, not merely large: both signals are present on the fork
    expect(baseline.lastStartAgeSec).not.toBeNull();
    expect(baseline.dispositionAgeSec).not.toBeNull();

    // the incident signature: two map runs that never returned
    const watchRunIds: number[] = [];
    for (const n of [1, 2]) {
      const { rows } = await pool.query(
        `INSERT INTO cron_runs (job, ok, error, started_at)
         VALUES ('map', false, $1, now()) RETURNING id`,
        [`timeout: no finish recorded within the route ceiling (itest seed ${n})`],
      );
      watchRunIds.push(rows[0].id);
      seededRunIds.push(rows[0].id); // the file's afterAll owns the cleanup
    }
    expect((await loadMapWatchSignals(query, CONFIG)).sweptRecent).toBe(2);

    const sent: Array<{ subject: string; text: string }> = [];
    let clock = t0;
    const deps = {
      claimSlot: (nowMs: number, intervalMs: number) => pgClaimWatchSlot(query, nowMs, intervalMs),
      loadState: loadProviderState,
      saveState: saveProviderState,
      sendEmail: async (mail: { subject: string; text: string }) => {
        sent.push({ subject: mail.subject, text: mail.text });
        return { delivered: true, via: "itest" };
      },
      recipient: () => "ops@itest.invalid",
      now: () => clock,
      query,
    };
    const storedState = async () => {
      const { rows } = await pool.query(
        `SELECT state FROM provider_state WHERE provider = 'map_watch'`,
      );
      return rows[0]?.state as Record<string, unknown> | undefined;
    };

    // 1. detection. The claim INSERT seeds a PARTIAL state row, so this call
    //    also exercises the 2026-09-01 first-evaluation hotfix against real
    //    Postgres: a missing episode key must read as "no episode", never as
    //    an episode clearing (which shipped one spurious RECOVERED email).
    const first = await runMapWatchCheck(deps, CONFIG);
    expect(first).toMatchObject({ evaluated: true, throttled: false, alert: "unhealthy" });
    expect(first.reasons).toEqual(["map_timeouts"]);
    expect(first.delivery).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[BNOW] map watchdog unhealthy: map_timeouts");
    expect(sent[0].text).toContain("sweptTimeouts=2");
    // numeric-only contract: no document, prompt or credential text can reach
    // an operator mailbox from this path
    expect(sent[0].text).not.toMatch(/itest seed|SELECT |postgres:\/\//);
    expect(await storedState()).toMatchObject({ episodeKey: "map_timeouts", lastAlertAtMs: t0 });

    // 2. the REAL slot claim throttles a second start inside the interval —
    //    the case a read-then-act throttle would lose, and the reason the
    //    claim is one conditional statement.
    clock = t0 + 1_000;
    const second = await runMapWatchCheck(deps, CONFIG);
    expect(second).toMatchObject({ evaluated: false, throttled: true, alert: null });
    expect(sent).toHaveLength(1);

    // 3. slot aged out, same episode, inside the cooldown: evaluate, do not
    //    re-email. Episode identity survives a round trip through the row.
    clock = t0 + 601_000;
    const third = await runMapWatchCheck(deps, CONFIG);
    expect(third).toMatchObject({ evaluated: true, throttled: false, alert: null });
    expect(third.reasons).toEqual(["map_timeouts"]);
    expect(sent).toHaveLength(1);
    expect(await storedState()).toMatchObject({ episodeKey: "map_timeouts", lastAlertAtMs: t0 });

    // 4. recovery: the swept rows finish, the episode clears, exactly one
    //    RECOVERED notice follows and the state row is cleared.
    await pool.query(`UPDATE cron_runs SET finished_at = now() WHERE id = ANY($1)`, [watchRunIds]);
    expect((await loadMapWatchSignals(query, CONFIG)).sweptRecent).toBe(0);
    clock = t0 + 1_202_000;
    const fourth = await runMapWatchCheck(deps, CONFIG);
    expect(fourth).toMatchObject({ evaluated: true, throttled: false, alert: "recovery" });
    expect(fourth.delivery).toBe("sent");
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toContain("recovered");
    expect(sent[1].text).toContain("RECOVERED");
    expect(await storedState()).toMatchObject({ episodeKey: null });

    console.log(
      `[#103 proof] neutralized ${shifted.rows.length} pre-existing swept map rows; ` +
        `signals baseline lastStartAgeSec=${baseline.lastStartAgeSec} ` +
        `dispositionAgeSec=${baseline.dispositionAgeSec} eligibleWork=${baseline.eligibleExists}`,
    );
  });
});
