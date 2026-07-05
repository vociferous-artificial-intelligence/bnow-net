import Link from "next/link";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

// "Who's on the outs" — entities ranked by recent prosecution/pressure signals.

export default async function EntitiesPage() {
  const rows = (await rawSql.query(
    `SELECT e.id, e.name, e.kind,
            count(DISTINCT ce.claim_id)::int AS claims,
            count(DISTINCT ce.claim_id) FILTER (
              WHERE ce.role IN ('defendant','target','dismissed')
            )::int AS pressure,
            max(cl.claim_date)::text AS last_seen,
            array_agg(DISTINCT ce.role) AS roles
     FROM entities e
     JOIN claim_entities ce ON ce.entity_id = e.id
     JOIN claims cl ON cl.id = ce.claim_id
     GROUP BY e.id
     ORDER BY pressure DESC, claims DESC
     LIMIT 100`,
    [],
  )) as Array<{
    id: number; name: string; kind: string; claims: number;
    pressure: number; last_seen: string | null; roles: string[];
  }>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · elite politics
      </p>
      <h1 className="mb-1 text-2xl font-bold">Entity tracker</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        People, agencies and companies appearing in prosecution, asset-seizure and
        appointment claims. &quot;Pressure&quot; counts claims where the entity is a
        defendant, target, or dismissed official — the raw signal for who is losing cover.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-2">entity</th>
            <th>kind</th>
            <th className="text-right">pressure</th>
            <th className="text-right">claims</th>
            <th>roles seen</th>
            <th>last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1.5">
                <Link href={`/entities/${e.id}`} className="font-medium hover:underline">
                  {e.name}
                </Link>
              </td>
              <td className="text-xs">{e.kind}</td>
              <td className="text-right tabular-nums">
                {e.pressure > 0 ? (
                  <span className="font-semibold text-red-600 dark:text-red-400">{e.pressure}</span>
                ) : (
                  0
                )}
              </td>
              <td className="text-right tabular-nums">{e.claims}</td>
              <td className="text-xs text-gray-500">{e.roles.join(", ")}</td>
              <td className="text-xs tabular-nums">{e.last_seen?.slice(0, 10) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-gray-400">
          No entities yet — the elite-politics digest populates this nightly.
        </p>
      )}
    </main>
  );
}
