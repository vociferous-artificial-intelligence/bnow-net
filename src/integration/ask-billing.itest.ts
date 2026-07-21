import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Release hardening 2026-07-21 (migration 0027): billing policy/eligibility on
// REAL Postgres — the migration applies additively, finalize stamps the
// policy, historical rows default ineligible forever, and aggregateUnits'
// invoice-shaped figures expose ONLY billing_eligible rows. $0 by
// construction; no billing/Paddle module exists or is touched.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}

const { runMigrations } = await import("../../scripts/migrations-lib");
const { createRun, finalizeRun } = await import("@/lib/ask/runs");
const { aggregateUnits, ASK_BILLING_POLICY_VERSION, billingEligibility } = await import("@/lib/ask/units");
import type { AskAnswerV2 } from "@/lib/ask/types";

const USER = "itest-billing@x.test";
let pool: Pool;
const uuid = () => crypto.randomUUID();

const ANSWERED: AskAnswerV2 = {
  answer: "Billed answer [c1].", citedClaimIds: [1], evidenceCount: 1, terms: [],
  provider: "openai:gpt-5", state: "answered", relatedClaimIds: [], window: null,
  totalMatching: 1, sampled: false, retrievalMode: "v2",
};

async function cleanup() {
  await pool.query(`DELETE FROM ask_runs WHERE user_email = $1`, [USER]);
}

async function seedFinalized(opts: {
  billing?: { policy: string; eligible: boolean };
  result?: AskAnswerV2;
  units?: number;
}): Promise<string> {
  const runId = uuid();
  await createRun({ runId, userEmail: USER, question: "billing itest q", idempotencyKey: `bk-${runId}` });
  await finalizeRun({
    runId,
    state: (opts.result ?? ANSWERED).state,
    result: opts.result ?? ANSWERED,
    settledCostUsd: 0.01,
    ...(opts.units !== undefined ? { units: opts.units } : {}),
    ...(opts.billing ? { billing: opts.billing } : {}),
  });
  return runId;
}

beforeAll(async () => {
  await runMigrations(URL!); // applies 0027 additively on the disposable fork
  pool = new Pool({ connectionString: URL });
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("migration 0027 + billing stamps on real Postgres", () => {
  it("finalize writes the policy stamp; a stamp-less finalize (historical path) stays NULL/false", async () => {
    const stamped = await seedFinalized({
      billing: billingEligibility({
        units: 1,
        mode: "enforce",
        result: ANSWERED,
        now: new Date(),
      }),
    });
    const bare = await seedFinalized({});
    const rows = (
      await pool.query(
        `SELECT id, billing_policy, billing_eligible FROM ask_runs WHERE id IN ($1, $2)`,
        [stamped, bare],
      )
    ).rows as Array<{ id: string; billing_policy: string | null; billing_eligible: boolean }>;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(stamped)!.billing_policy).toBe(`${ASK_BILLING_POLICY_VERSION}:enforce`);
    expect(byId.get(stamped)!.billing_eligible).toBe(false); // NO cutover env in this suite
    expect(byId.get(bare)!.billing_policy).toBeNull();
    expect(byId.get(bare)!.billing_eligible).toBe(false); // the migration default
  });

  it("aggregateUnits: informational units cover every finalized run; billable figures cover ONLY billing_eligible rows", async () => {
    await cleanup();
    // one eligible row (simulating a post-cutover enforce finalize)
    await seedFinalized({ billing: { policy: `${ASK_BILLING_POLICY_VERSION}:enforce`, eligible: true } });
    // shadow-stamped, replay-shaped, and degraded rows — never billable
    await seedFinalized({ billing: { policy: `${ASK_BILLING_POLICY_VERSION}:shadow`, eligible: false } });
    await seedFinalized({ result: { ...ANSWERED, provider: "stub" } }); // degraded → 0 units, no stamp
    await seedFinalized({ result: { ...ANSWERED, replayed: true } }); // replay-shaped → 0 units

    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const agg = (await aggregateUnits({ from, to, userEmail: USER }))[0];
    expect(agg.runs).toBe(4); // informational: every finalized run
    expect(agg.units).toBe(2); // answered enforce + answered shadow carry 1 unit each
    expect(agg.billableUnits).toBe(1); // ONLY the explicitly eligible row
    expect(agg.billableRuns).toBe(1);
  });
});
