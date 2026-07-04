import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

const TABLES = [
  "countries",
  "sources",
  "isw_reports",
  "source_citations",
  "raw_documents",
  "events",
  "claims",
  "claim_sources",
  "digests",
  "validation_runs",
  "users",
  "subscribe_intents",
] as const;

async function getCounts() {
  const counts: Record<string, number | string> = {};
  for (const t of TABLES) {
    try {
      const rows = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`));
      counts[t] = (rows.rows[0] as { n: number }).n;
    } catch {
      counts[t] = "ERR";
    }
  }
  return counts;
}

export default async function HealthPage() {
  let dbOk = false;
  let counts: Record<string, number | string> = {};
  let error = "";
  try {
    counts = await getCounts();
    dbOk = Object.values(counts).every((v) => v !== "ERR");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-xl p-8 font-mono text-sm">
      <h1 className="mb-4 text-xl font-bold">BNOW.NET · health</h1>
      <div
        className={`mb-6 inline-block rounded px-3 py-1 font-bold ${
          dbOk ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}
        data-testid="db-status"
      >
        DB {dbOk ? "OK" : "DOWN"}
      </div>
      {error && <pre className="mb-4 text-red-500">{error}</pre>}
      <table className="w-full">
        <tbody>
          {Object.entries(counts).map(([t, n]) => (
            <tr key={t} className="border-b border-gray-200 dark:border-gray-800">
              <td className="py-1 pr-4">{t}</td>
              <td className="py-1 text-right tabular-nums">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-xs text-gray-500">
        build {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"} ·{" "}
        {new Date().toISOString()}
      </p>
    </main>
  );
}
