import Link from "next/link";
import { getDivergence } from "@/lib/trade/run";
import { fmtM } from "@/lib/trade/divergence";
import { WATCHED_HS } from "@/lib/trade/config";

export const dynamic = "force-dynamic";

const HS_LABEL = new Map(WATCHED_HS.map((h) => [h.code, h.label]));

export default async function TradePage() {
  let rows: Awaited<ReturnType<typeof getDivergence>> = [];
  try {
    rows = await getDivergence("X");
  } catch {
    // table empty until first pull
  }
  const flagged = rows.filter((r) => r.flagged);
  const dualUse = rows.filter((r) => r.hsCode !== "TOTAL");

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · Russia · trade-evasion watch
      </p>
      <h1 className="mb-1 text-2xl font-bold">Mirror-trade &amp; evasion watch</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Russia&apos;s customs service stopped publishing in January 2022. We reconstruct its
        trade from <strong>partner-country reports</strong> — what transit hubs say they
        export to Russia. When a hub&apos;s exports of dual-use goods jump far above their
        pre-war baseline with no domestic-demand basis, it signals rerouting.{" "}
        <strong>{flagged.length}</strong> partner-good series currently flagged.
      </p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No trade data yet — the monthly Comtrade pull populates this.
        </p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold">Flagged dual-use flows (rerouting suspects)</h2>
          {/* Wide data tables scroll inside their own container — the document must
              never scroll horizontally at mobile widths (390px audit, 2026-07-13). */}
          <div className="mb-8 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
                <th className="py-2">transit hub</th>
                <th>good</th>
                <th className="text-right">{rows[0]?.baselineYear}</th>
                <th className="text-right">{rows[0]?.latestYear}</th>
                <th className="text-right">multiple</th>
                <th>signal</th>
              </tr>
            </thead>
            <tbody>
              {dualUse.filter((r) => r.flagged).map((r, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1.5">{r.reporterName}</td>
                  <td className="text-xs">{HS_LABEL.get(r.hsCode) ?? `HS ${r.hsCode}`}</td>
                  <td className="text-right tabular-nums">${fmtM(r.baselineUsd)}</td>
                  <td className="text-right font-semibold tabular-nums">${fmtM(r.latestUsd)}</td>
                  <td className="text-right tabular-nums">
                    {r.multiple !== null ? (
                      <span className={r.multiple >= 3 ? "font-bold text-red-600 dark:text-red-400" : ""}>
                        {r.multiple}×
                      </span>
                    ) : "new"}
                  </td>
                  <td className="text-xs text-gray-500">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Total reconstructed exports to Russia</h2>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
                <th className="py-2">transit hub</th>
                <th className="text-right">{rows[0]?.baselineYear} (pre-war)</th>
                <th className="text-right">{rows[0]?.latestYear}</th>
                <th className="text-right">change</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.hsCode === "TOTAL").sort((a, b) => b.latestUsd - a.latestUsd).map((r, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1.5">{r.reporterName}</td>
                  <td className="text-right tabular-nums">${fmtM(r.baselineUsd)}</td>
                  <td className="text-right tabular-nums">
                    ${fmtM(r.latestUsd)} <span className="text-xs text-gray-400">({r.latestYear})</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {r.multiple !== null ? `${r.multiple}×` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Source: UN Comtrade partner-reported data (reporter exports to Russia). Mirror data
        lags ~2–3 months and only ~30% of country-pairs mirror cleanly; figures are
        estimates of actual flows, not exact. Methodology after S&amp;P Global, CEPR, KSE.
      </p>
    </main>
  );
}
