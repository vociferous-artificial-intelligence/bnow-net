import "./env";
import { neon } from "@neondatabase/serverless";

// Idempotent reference-data seed: countries + plans. Safe to run repeatedly.
const COUNTRIES: Array<[string, string, string, "active" | "scaffolded" | "deferred"]> = [
  ["ru", "Russia", "russia", "active"],
  ["ua", "Ukraine", "ukraine", "active"],
  ["il", "Israel", "israel", "scaffolded"],
  ["ir", "Iran", "iran", "scaffolded"],
  ["sa", "Saudi Arabia", "saudi-arabia", "scaffolded"],
  ["ae", "UAE", "uae", "scaffolded"],
  ["qa", "Qatar", "qatar", "scaffolded"],
  ["om", "Oman", "oman", "scaffolded"],
  ["bh", "Bahrain", "bahrain", "scaffolded"],
  ["kw", "Kuwait", "kuwait", "scaffolded"],
  ["cn", "China", "china", "deferred"],
];

// brief §6.5 — annual shown at -45% (midpoint of 40-50%) of full monthly $3k midpoint
const PLANS: Array<[string, string, number, "month" | "year"]> = [
  ["standby", "Standby", 40000, "month"],
  ["full_monthly", "Full", 300000, "month"],
  ["full_annual", "Full (Annual)", 1980000, "year"],
];

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  for (const [iso2, name, slug, status] of COUNTRIES) {
    await sql`INSERT INTO countries (iso2, name, slug, status)
      VALUES (${iso2}, ${name}, ${slug}, ${status})
      ON CONFLICT (iso2) DO UPDATE SET name = ${name}, slug = ${slug}, status = ${status}`;
  }
  for (const [code, name, priceCents, interval] of PLANS) {
    await sql`INSERT INTO plans (code, name, price_cents, interval)
      VALUES (${code}, ${name}, ${priceCents}, ${interval})
      ON CONFLICT (code) DO UPDATE SET name = ${name}, price_cents = ${priceCents}, interval = ${interval}`;
  }
  const [c] = await sql`SELECT count(*)::int AS n FROM countries`;
  const [p] = await sql`SELECT count(*)::int AS n FROM plans`;
  console.log(`seeded: ${c.n} countries, ${p.n} plans`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
