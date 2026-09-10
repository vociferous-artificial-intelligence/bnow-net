import "./env";
import { assertMigrationTarget, runMigrations } from "./migrations-lib";

// CLI wrapper over the side-effect-free runner (scripts/migrations-lib.ts).
// Tracks applied files in _migrations; safe to re-run anytime.
async function main() {
  // OPEN-TASKS #112: refuse before any connection when the two DSN names disagree
  // about which database this is. `import "./env"` above has already run, so a
  // variable the caller UNSET has already been refilled from .env.local — which is
  // exactly how the documented fork idiom selected production instead.
  assertMigrationTarget(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL(_UNPOOLED) not set");
  await runMigrations(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
