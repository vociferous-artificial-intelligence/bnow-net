import "./env";
import { runMigrations } from "./migrations-lib";

// CLI wrapper over the side-effect-free runner (scripts/migrations-lib.ts).
// Tracks applied files in _migrations; safe to re-run anytime.
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL(_UNPOOLED) not set");
  await runMigrations(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
