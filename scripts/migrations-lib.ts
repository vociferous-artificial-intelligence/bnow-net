// Side-effect-free migration runner core. Deliberately imports NO env loader:
// scripts/migrate.ts (the CLI) layers "./env" on top; the integration suite
// imports THIS module so the vitest worker never side-loads .env.local secrets
// (Gate 1 finding — the itest process must hold only what test-integration.sh
// passes it).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

/** The Neon endpoint a DSN addresses, with the connection-pooler suffix removed.
 *  Neon serves the same endpoint on two hostnames — `ep-x-y-pooler.<region>...`
 *  (pooled) and `ep-x-y.<region>...` (direct) — so the pooled and direct DSNs for
 *  ONE database differ textually while naming the same target. Anything that fails
 *  to parse is returned trimmed and lowercased, which can never equal a real host,
 *  so garbage compares as a MISMATCH rather than as a match. */
export function migrationEndpointId(dsn: string): string {
  try {
    const host = new URL(dsn).hostname.toLowerCase();
    const [first, ...rest] = host.split(".");
    return [first.replace(/-pooler$/, ""), ...rest].join(".");
  } catch {
    return dsn.trim().toLowerCase();
  }
}

/** Refuse when the two DSN variables name DIFFERENT Neon ENDPOINTS (OPEN-TASKS #112).
 *
 *  Endpoint, not database: the comparison is host-only, so two DSNs on the same
 *  endpoint that differ in database name or role compare EQUAL and pass. That is
 *  outside this guard's hazard — a fork and production are always different
 *  endpoints — but it is what the function actually checks, so it is what the
 *  name and this docstring say.
 *
 *  `scripts/migrate.ts` reads `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, and
 *  `scripts/env.ts` loads `.env.local` with dotenv, which declines to overwrite a
 *  variable that is PRESENT and SETS one that is ABSENT. So `env -u
 *  DATABASE_URL_UNPOOLED DATABASE_URL="$FORK" npx tsx scripts/migrate.ts` — the
 *  idiom a runbook recommended — hands the unpooled name straight back from
 *  `.env.local` and migrates PRODUCTION while the operator names a fork. On
 *  2026-09-07 the only thing that stopped it was a stale password (#80), which
 *  makes #80 load-bearing safety by accident: fixing it without fixing this arms
 *  the landmine.
 *
 *  The guard is at the BOUNDARY, before any connection, on the --base-ack pattern
 *  (decision R4): a runner that can silently retarget production from an unset
 *  variable is the hazard, and runbook prose is not where that belongs. Setting
 *  BOTH names to the target — the only form dotenv cannot subvert, because a
 *  present variable is the only variable it will not touch — always passes. */
export function assertMigrationTarget(
  pooled: string | undefined,
  unpooled: string | undefined,
): void {
  if (!pooled || !unpooled) return; // only one name in play: nothing to disagree about
  const a = migrationEndpointId(pooled);
  const b = migrationEndpointId(unpooled);
  if (a === b) return;
  throw new Error(
    `migrate: DATABASE_URL and DATABASE_URL_UNPOOLED name DIFFERENT endpoints ` +
      `("${b}" would be migrated; "${a}" was also named) — refusing.\n` +
      `If this is deliberate, set BOTH to the target: ` +
      `DATABASE_URL="$TARGET" DATABASE_URL_UNPOOLED="$TARGET" npx tsx scripts/migrate.ts\n` +
      `Do NOT use \`env -u DATABASE_URL_UNPOOLED\`: scripts/env.ts loads .env.local and ` +
      `dotenv REFILLS an absent name, so unsetting is what hands production back ` +
      `(OPEN-TASKS #112).`,
  );
}

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
