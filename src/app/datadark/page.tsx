import Link from "next/link";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ok: { label: "publishing", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  stale: { label: "stale", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  gone: { label: "gone", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  classified: { label: "classified", cls: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200" },
  unreachable: { label: "unreachable", cls: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  unknown: { label: "unknown", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export default async function DataDarkPage() {
  const rows = (await rawSql.query(
    `SELECT key, label, agency, url, status, baseline_status, note, last_seen_period,
            last_checked_at::text AS checked, last_changed_at::text AS changed
     FROM watched_series
     ORDER BY (status IN ('classified','gone')) DESC, agency, label`,
    [],
  )) as Array<{
    key: string; label: string; agency: string; url: string; status: string;
    baseline_status: string; note: string | null; last_seen_period: string | null;
    checked: string | null; changed: string | null;
  }>;

  const dark = rows.filter((r) => r.status === "classified" || r.status === "gone").length;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · Russia · data transparency
      </p>
      <h1 className="mb-1 text-2xl font-bold">Data-dark tracker</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Russia has classified 400+ statistical indicators since early 2025. When a series
        stops publishing — demographics, fuel output, customs detail — the suppression is
        itself a signal: series tend to go dark just before the numbers turn bad.{" "}
        <strong>{dark}</strong> of {rows.length} tracked series are currently classified or gone.
      </p>

      {/* Wide series table scrolls in its own container (390px audit, 2026-07-13). */}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-2">series</th>
            <th>agency</th>
            <th>status</th>
            <th>latest period</th>
            <th>checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.unknown;
            return (
              <tr key={r.key} className="border-b border-gray-100 align-top dark:border-gray-800">
                <td className="py-2">
                  <a href={r.url} rel="nofollow noopener" className="font-medium hover:underline">
                    {r.label}
                  </a>
                  {r.note && <p className="mt-0.5 text-xs text-gray-500">{r.note}</p>}
                </td>
                <td className="text-xs">{r.agency}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${s.cls}`}>{s.label}</span>
                </td>
                <td className="text-xs tabular-nums">{r.last_seen_period ?? "—"}</td>
                <td className="text-xs tabular-nums text-gray-400">{r.checked?.slice(0, 10) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {rows.length === 0 && (
        <p className="py-8 text-center text-gray-400">Tracker not yet seeded.</p>
      )}
    </main>
  );
}
