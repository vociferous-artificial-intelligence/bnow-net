import Link from "next/link";
import { rawSql } from "@/db";
import { currentRole } from "@/lib/gate";
import { readOsMeta } from "@/lib/enrich/os-read";

export const dynamic = "force-dynamic";

// "Who's on the outs" — entities ranked by recent prosecution/pressure signals.
//
// OpenSanctions data on this surface is ADMIN-ONLY (2026-07-21 match-safety
// ruling): it is name+type candidate-identity screening, not human-reviewed fact,
// so non-admins get zero OpenSanctions markup — the metadata is not even selected
// for them. Admins see a neutral candidate indicator (no categorical red badge);
// the qualified candidate-review detail lives on the entity page.

export default async function EntitiesPage() {
  // fail closed: currentRole() degrades to "user" on any lookup uncertainty
  const isAdmin = (await currentRole()) === "admin";

  const rows = (await rawSql.query(
    `SELECT e.id, e.name, e.kind,
            count(DISTINCT ce.claim_id)::int AS claims,
            count(DISTINCT ce.claim_id) FILTER (
              WHERE ce.role IN ('defendant','target','dismissed')
            )::int AS pressure,
            max(cl.claim_date)::text AS last_seen,
            array_agg(DISTINCT ce.role) AS roles${
              isAdmin ? `,\n            e.meta->'opensanctions' AS os` : ""
            }
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
    os?: unknown;
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
          {rows.map((e) => {
            // admin-only, fail-closed: only an ACCEPTED algorithm match shows the
            // neutral indicator; rejected/stale/stub metadata renders nothing here
            const osView = isAdmin ? readOsMeta({ opensanctions: e.os }) : null;
            return (
            <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1.5">
                <Link href={`/entities/${e.id}`} className="font-medium hover:underline">
                  {e.name}
                </Link>
                {osView?.state === "accepted" && (
                  <span
                    className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    title="OpenSanctions accepted a name/type identity candidate — not human-reviewed. Details on the entity page. (Admin-only.)"
                  >
                    OS candidate
                  </span>
                )}
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
            );
          })}
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
