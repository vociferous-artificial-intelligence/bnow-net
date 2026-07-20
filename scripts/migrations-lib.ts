// Side-effect-free migration runner core. Deliberately imports NO env loader:
// scripts/migrate.ts (the CLI) layers "./env" on top; the integration suite
// imports THIS module so the vitest worker never side-loads .env.local secrets
// (Gate 1 finding — the itest process must hold only what test-integration.sh
// passes it).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

/** Apply pending drizzle/*.sql files (filename-sorted; 9999 last) to `url`,
 *  tracked in _migrations; idempotent, safe to re-run anytime. */
export async function runMigrations(url: string): Promise<void> {
  const sql = neon(url);

  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const done = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
    if (done.length > 0) continue;
    const body = readFileSync(join(dir, file), "utf8");
    // drizzle-kit uses --> statement-breakpoint as a statement separator
    const statements = body
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`applying ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }
  console.log("migrations up to date");
}
