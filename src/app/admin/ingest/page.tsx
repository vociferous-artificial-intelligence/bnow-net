import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export default async function IngestStatusPage() {
  const [byAdapter, recent, total] = await Promise.all([
    db.execute(dsql`
      SELECT adapter,
             count(*)::int AS docs,
             max(fetched_at) AS last_fetch,
             count(DISTINCT source_id)::int AS sources,
             count(*) FILTER (WHERE fetched_at > now() - interval '24 hours')::int AS last24h
      FROM raw_documents GROUP BY adapter ORDER BY docs DESC`),
    db.execute(dsql`
      SELECT adapter, title, url, published_at, fetched_at, country_iso2
      FROM raw_documents ORDER BY fetched_at DESC LIMIT 25`),
    db.execute(dsql`SELECT count(*)::int AS n FROM raw_documents`),
  ]);

  const adapters = byAdapter.rows as Array<{
    adapter: string; docs: number; last_fetch: string; sources: number; last24h: number;
  }>;
  const docs = recent.rows as Array<{
    adapter: string; title: string | null; url: string | null;
    published_at: string | null; fetched_at: string; country_iso2: string | null;
  }>;

  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
      <h1 className="mb-4 text-xl font-bold">
        /admin/ingest · {(total.rows[0] as { n: number }).n.toLocaleString()} raw documents
      </h1>

      <table className="mb-8 w-full">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-1">adapter</th>
            <th className="text-right">docs</th>
            <th className="text-right">last 24h</th>
            <th className="text-right">sources</th>
            <th>last fetch (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {adapters.map((a) => (
            <tr key={a.adapter} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1">{a.adapter}</td>
              <td className="text-right tabular-nums">{a.docs.toLocaleString()}</td>
              <td className="text-right tabular-nums">{a.last24h.toLocaleString()}</td>
              <td className="text-right tabular-nums">{a.sources}</td>
              <td>{a.last_fetch?.toString().slice(0, 19)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 font-bold">latest 25</h2>
      <ul className="space-y-1">
        {docs.map((d, i) => (
          <li key={i} className="truncate">
            <span className="text-gray-400">[{d.adapter}·{d.country_iso2 ?? "—"}]</span>{" "}
            {d.url ? (
              <a href={d.url} className="underline" rel="nofollow noopener">
                {d.title ?? d.url}
              </a>
            ) : (
              (d.title ?? "(untitled)")
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
