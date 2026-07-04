import "./env";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

// Minimal idempotent migration runner over drizzle/ SQL files.
// Tracks applied files in _migrations; safe to re-run anytime.
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL(_UNPOOLED) not set");
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
