import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import {
  meanCoveragePct,
  medianLeadHours,
  meanThinSourcedPct,
  nonzeroDayCoverage,
} from "@/lib/scoreboard/summary";

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
  const locale = await getLocale();
  const t = makeT(locale);
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

  const avgCoverage = meanCoveragePct(rows);
  const avgThin = meanThinSourcedPct(rows);
  const medianLead = medianLeadHours(rows);
  const nonzero = nonzeroDayCoverage(rows);

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold">{t("scoreboard.title")}</h1>
      <div className="mb-6 max-w-2xl rounded-lg border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
        <p>{t("scoreboard.explainer")}</p>
        <p className="mt-3 mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          {t("scoreboard.how_to_read.summary")}
        </p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-gray-500 dark:text-gray-400">
          <li>{t("scoreboard.how_to_read.coverage")}</li>
          <li>{t("scoreboard.how_to_read.lead")}</li>
          <li>{t("scoreboard.how_to_read.thin")}</li>
          <li>{t("scoreboard.how_to_read.divergence")}</li>
        </ul>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">
            {avgCoverage !== null ? `${avgCoverage.toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">{t("scoreboard.avg_coverage")}</div>
          <div className="mt-1 text-xs text-gray-400">
            {t("scoreboard.target_coverage", { n: TARGETS.coverage })}
            {nonzero.meanPct !== null &&
              ` · ${t("scoreboard.nonzero_day_mean", {
                pct: nonzero.meanPct.toFixed(0),
                days: nonzero.days,
              })}`}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">
            {avgThin !== null ? `${avgThin.toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">{t("scoreboard.avg_thin_sourced")}</div>
          <div className="mt-1 text-xs text-gray-400">
            {t("scoreboard.target_thin", { n: TARGETS.thin })}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">
            {medianLead !== null ? `${medianLead > 0 ? "+" : ""}${medianLead.toFixed(1)}h` : "—"}
          </div>
          <div className="text-xs text-gray-500">{t("scoreboard.median_lead")}</div>
          <div className="mt-1 text-xs text-gray-400">
            {t("scoreboard.target_lead", { n: TARGETS.timeliness })}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
          <div className="text-xs text-gray-500">validation runs</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
              <th className="py-2">date</th>
              <th>{t("scoreboard.col.theater")}</th>
              <th>{t("scoreboard.col.coverage")}</th>
              <th className="text-right">{t("scoreboard.thin_sourced")}</th>
              <th className="text-right">{t("scoreboard.col.lead")}</th>
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
      </div>
      {rows.length === 0 && (
        <p className="py-8 text-center text-gray-400">{t("scoreboard.empty")}</p>
      )}
    </main>
  );
}
