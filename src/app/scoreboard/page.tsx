import Link from "next/link";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

interface RunRow {
  id: number;
  digest_date: string;
  iso2: string;
  coverage_pct: number | null;
  unsupported_claim_rate: number | null;
  timeliness_hours: number | null;
  divergences: Array<{ kind: string }>;
  provider: string;
}

const TARGETS = { coverage: 80, thin: 2, timeliness: 6 };

function Bar({ pct }: { pct: number }) {
  const color = pct >= TARGETS.coverage ? "bg-green-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-2.5 w-32 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
      <div className={color} style={{ width: `${Math.min(100, pct)}%`, height: "100%" }} />
    </div>
  );
}

export default async function ScoreboardPage() {
  const rows = (await rawSql.query(
    `SELECT vr.id, d.digest_date, c.iso2, vr.coverage_pct, vr.unsupported_claim_rate,
            vr.timeliness_hours, vr.divergences, d.provider
     FROM validation_runs vr
     JOIN digests d ON d.id = vr.digest_id
     JOIN countries c ON c.id = d.country_id
     ORDER BY d.digest_date DESC, c.iso2
     LIMIT 60`,
    [],
  )) as RunRow[];

  const covered = rows.filter((r) => r.coverage_pct !== null);
  const avgCoverage =
    covered.length > 0
      ? covered.reduce((s, r) => s + Number(r.coverage_pct), 0) / covered.length
      : null;
  const timely = rows.filter((r) => r.timeliness_hours !== null);
  const avgLead =
    timely.length > 0
      ? timely.reduce((s, r) => s + Number(r.timeliness_hours), 0) / timely.length
      : null;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Validation Scoreboard</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Every day we score our automated digest against ISW&apos;s Russian Offensive Campaign
        Assessment for the same day. Divergence is a feature: &quot;ours only&quot; entries are
        potential leads, &quot;ISW only&quot; entries are our misses. Targets: coverage ≥
        {TARGETS.coverage}%, thin-sourced &lt; {TARGETS.thin}%, information lead ≥ ±
        {TARGETS.timeliness}h.
      </p>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">
            {avgCoverage !== null ? `${avgCoverage.toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">avg event coverage vs ISW</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">
            {avgLead !== null ? `${avgLead > 0 ? "+" : ""}${avgLead.toFixed(1)}h` : "—"}
          </div>
          <div className="text-xs text-gray-500">median information lead vs ISW publish</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
          <div className="text-xs text-gray-500">validation runs</div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-2">date</th>
            <th>theater</th>
            <th>coverage</th>
            <th className="text-right">thin-sourced</th>
            <th className="text-right">lead (h)</th>
            <th className="text-right">agree / isw-only / ours-only</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const kinds = (r.divergences ?? []).reduce(
              (acc, d) => ((acc[d.kind] = (acc[d.kind] ?? 0) + 1), acc),
              {} as Record<string, number>,
            );
            return (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 tabular-nums">{String(r.digest_date).slice(0, 10)}</td>
                <td className="uppercase">{r.iso2}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <Bar pct={Number(r.coverage_pct ?? 0)} />
                    <span className="tabular-nums">
                      {r.coverage_pct !== null ? `${Number(r.coverage_pct).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                </td>
                <td className="text-right tabular-nums">
                  {r.unsupported_claim_rate !== null
                    ? `${(Number(r.unsupported_claim_rate) * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {r.timeliness_hours !== null
                    ? `${Number(r.timeliness_hours) > 0 ? "+" : ""}${Number(r.timeliness_hours).toFixed(1)}`
                    : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {kinds.agreement ?? 0} / {kinds.isw_only ?? 0} / {kinds.ours_only ?? 0}
                </td>
                <td>
                  <Link
                    href={`/scoreboard/${r.iso2}/${String(r.digest_date).slice(0, 10)}`}
                    className="text-xs underline"
                  >
                    detail
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-gray-400">No validation runs yet.</p>
      )}
    </main>
  );
}
