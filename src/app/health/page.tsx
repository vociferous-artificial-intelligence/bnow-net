import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated page — these counts are readable by anyone. It exists to answer
 * "is the database reachable and is the pipeline populated", which the rows below do.
 *
 * Deliberately NOT listed (2026-07-16): `users` and `subscribe_intents` published our
 * private-beta size and inbound demand to competitors; `validation_runs` and
 * `isw_reports` published how much scoring/corpus work exists, which is business detail
 * a liveness check does not need. Add a row here only if a stranger may know it.
 *
 * `sources` is the deduplicated registry count and `raw_documents` the much larger
 * ingested-item count — the gap between them is expected, not a fault.
 */
const TABLES = [
  "countries",
  "sources",
  "source_citations",
  "raw_documents",
  "events",
  "claims",
  "claim_sources",
  "digests",
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
