import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

// Release hardening 2026-07-21: atomic migration execution proven on a REAL
// disposable Neon branch. A migration that fails midway must leave NEITHER
// partial DDL NOR a completion marker; fixing the file and re-running applies
// it fresh; a normal rerun over applied files is a no-op. Fixture migrations
// use the itest_mig_ namespace so the fork's real _migrations rows are
// untouched.

const URL = process.env.INTEGRATION_DATABASE_URL;
if (!URL) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "X_API_KEY", "OPENSANCTIONS_API_KEY"]) {
  delete process.env[k];
}

const { runMigrations } = await import("../../scripts/migrations-lib");

const FIXTURES = join(process.cwd(), "fixtures", "migrations-atomic");
let pool: Pool;

async function cleanup() {
  await pool.query(`DROP TABLE IF EXISTS itest_mig_atomic_probe`);
  await pool.query(`DELETE FROM _migrations WHERE name LIKE 'itest_mig_%'`);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL });
  await runMigrations(URL!); // the real drizzle dir — also proves normal rerun
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("runMigrations — per-file atomicity on real Postgres", () => {
  it("a failure midway leaves NO partial DDL and NO marker; the preceding file stays committed", async () => {
    await expect(runMigrations(URL!, { dir: join(FIXTURES, "fail") })).rejects.toThrow();

    // 0000 committed with its marker
    const probe = await pool.query(`SELECT to_regclass('itest_mig_atomic_probe') AS reg`);
    expect((probe.rows[0] as { reg: string | null }).reg).toBe("itest_mig_atomic_probe");
    const markers = await pool.query(`SELECT name FROM _migrations WHERE name LIKE 'itest_mig_%' ORDER BY name`);
    expect(markers.rows.map((r) => (r as { name: string }).name)).toEqual(["itest_mig_0000_base.sql"]);

    // 0001's FIRST statement (ADD COLUMN note) rolled back with the failure
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'itest_mig_atomic_probe'`,
    );
    expect(cols.rows.map((r) => (r as { column_name: string }).column_name)).toEqual(["id"]);
  });

  it("after fixing the file, a rerun applies it fresh (skipping applied files); a further rerun is a no-op", async () => {
    await runMigrations(URL!, { dir: join(FIXTURES, "fixed") });

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'itest_mig_atomic_probe' ORDER BY column_name`,
    );
    expect(cols.rows.map((r) => (r as { column_name: string }).column_name)).toEqual(["id", "note"]);
    const markers = await pool.query(`SELECT name FROM _migrations WHERE name LIKE 'itest_mig_%' ORDER BY name`);
    expect(markers.rows.map((r) => (r as { name: string }).name)).toEqual([
      "itest_mig_0000_base.sql",
      "itest_mig_0001_two_step.sql",
    ]);

    // idempotent rerun: markers unchanged, nothing reapplied (applied_at stable)
    const before = await pool.query(`SELECT name, applied_at FROM _migrations WHERE name LIKE 'itest_mig_%' ORDER BY name`);
    await runMigrations(URL!, { dir: join(FIXTURES, "fixed") });
    const after = await pool.query(`SELECT name, applied_at FROM _migrations WHERE name LIKE 'itest_mig_%' ORDER BY name`);
    expect(after.rows).toEqual(before.rows);
  });

  it("the REAL drizzle chain stays filename-ordered with 9999 last and is rerun-safe", async () => {
    // beforeAll already ran the real chain against this fork; run it again.
    await runMigrations(URL!);
    const { rows } = await pool.query(
      `SELECT name FROM _migrations WHERE name NOT LIKE 'itest_mig_%' ORDER BY name`,
    );
    const names = rows.map((r) => (r as { name: string }).name);
    expect(names[names.length - 1]).toBe("9999_claim_source_trigger.sql");
    expect(names.some((n) => n.startsWith("0027_"))).toBe(true); // the new migration applied
  });
});
