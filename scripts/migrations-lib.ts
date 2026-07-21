// Side-effect-free migration runner core. Deliberately imports NO env loader:
// scripts/migrate.ts (the CLI) layers "./env" on top; the integration suite
// imports THIS module so the vitest worker never side-loads .env.local secrets
// (Gate 1 finding — the itest process must hold only what test-integration.sh
// passes it).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

/** Apply pending *.sql files (filename-sorted; 9999 last) to `url`, tracked in
 *  _migrations; idempotent, safe to re-run anytime.
 *
 *  ATOMIC PER FILE (release hardening 2026-07-21): each migration's statements
 *  AND its _migrations marker commit in ONE transaction over an interactive
 *  client (the neon HTTP driver ran them statement-by-statement, so a failure
 *  midway left partial DDL with no marker — a state neither a rerun nor a
 *  human could safely reason about). A failure now rolls the WHOLE file back:
 *  no partial DDL, no marker; fixing the file and re-running applies it fresh,
 *  and already-applied files are skipped by their marker as before.
 *
 *  `opts.dir` (tests only) points the runner at a fixture directory; the
 *  default remains the repo's drizzle/ directory. */
export async function runMigrations(url: string, opts?: { dir?: string }): Promise<void> {
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const dir = opts?.dir ?? join(process.cwd(), "drizzle");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const done = await client.query(`SELECT 1 FROM _migrations WHERE name = $1`, [file]);
      if (done.rows.length > 0) continue;
      const body = readFileSync(join(dir, file), "utf8");
      // drizzle-kit uses --> statement-breakpoint as a statement separator
      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      console.log(`applying ${file} (${statements.length} statements)`);
      await client.query("BEGIN");
      try {
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw e;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await pool.end();
  }
}
