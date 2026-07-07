// Ad-hoc read-only SQL against the project DB (ops/debugging helper).
// Usage: npx tsx scripts/sqlq.ts "SELECT count(*) FROM raw_documents"
import "./env";
import { neon } from "@neondatabase/serverless";

const query = process.argv[2];
if (!query) {
  console.error('usage: npx tsx scripts/sqlq.ts "SELECT ..."');
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL!);
sql.query(query).then((rows) => {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
