import Link from "next/link";
import { getMaterials } from "@/lib/materials/run";
import { fmtM } from "@/lib/trade/divergence";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = {
  semiconductors: "Semiconductors", batteries: "Batteries", rare_earths: "Rare earths",
  energy: "Energy", pharma: "Pharma", materials: "Materials",
};

export default async function CriticalMaterialsPage() {
  let materials: Awaited<ReturnType<typeof getMaterials>> = [];
  try {
    materials = await getMaterials();
  } catch {
    // trade_flows may be empty until first pull
  }
  const withData = materials.filter((m) => m.latest);
  const newestFetch = materials.reduce<string | null>(
    (acc, m) => (m.fetchedAt && (!acc || m.fetchedAt > acc) ? m.fetchedAt : acc),
    null,
  );
  const concentrated = withData.filter((m) => m.latest?.concentrated).length;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · critical-materials dependency
      </p>
      <h1 className="mb-1 text-2xl font-bold">Critical-materials choke points</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Where US imports of a critical good concentrate in one or few geopolitically-exposed
        suppliers. Concentration (HHI) is the choke-point severity; sensitive-supplier share
        is the exposure. <strong>{concentrated}</strong> of {withData.length} tracked
        materials are highly concentrated. Fused with our live conflict/sanctions signals as
        theater coverage expands.
      </p>

      {withData.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No trade data yet — the monthly Comtrade pull populates this.
        </p>
      ) : (
        <div className="space-y-3">
          {withData.map((m) => {
            const c = m.latest!;
            return (
              <div
                key={m.hsCode}
                className={`rounded-lg border-2 p-4 ${c.concentrated ? "border-red-300 dark:border-red-800" : "border-gray-200 dark:border-gray-800"}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                    {CAT_LABEL[m.category] ?? m.category}
                  </span>
                  <h2 className="font-semibold">{m.label}</h2>
                  <span className="text-xs text-gray-400">HS {m.hsCode} · {c.year}</span>
                  {c.concentrated && (
                    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      choke point
                    </span>
                  )}
                </div>
                <p className="mb-2 text-sm text-gray-500">{m.chokepoint}</p>
                <div className="mb-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    top supplier: <strong>{c.topSupplierName}</strong> ({c.topSharePct}%)
                  </span>
                  <span>top-3: {c.top3SharePct}%</span>
                  <span>HHI: {c.hhi}</span>
                  <span className={c.sensitiveSharePct >= 50 ? "text-red-600 dark:text-red-400" : ""}>
                    exposed-supplier share: {c.sensitiveSharePct}%
                  </span>
                  <span className="text-gray-400">US imports ${fmtM(c.totalUsd)}</span>
                </div>
                {/* supplier share bar */}
                <div className="flex h-2.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                  {c.suppliers.map((s, i) => (
                    <div
                      key={s.code}
                      className={
                        i === 0 ? "bg-red-500" : i === 1 ? "bg-amber-500" : i === 2 ? "bg-blue-500" : "bg-gray-400"
                      }
                      style={{ width: `${s.sharePct}%` }}
                      title={`${s.name}: ${s.sharePct}%`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {c.suppliers.slice(0, 4).map((s) => `${s.name} ${s.sharePct}%`).join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Source:{" "}
        <a
          href="https://comtradeplus.un.org/"
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="underline"
        >
          UN Comtrade
        </a>{" "}
        (official database) — US goods imports (reporter M49 842, flow M), partner breakdown
        per HS code, latest reported year shown on each card
        {newestFetch ? <> · last fetched {newestFetch.slice(0, 10)}</> : null}. Query shape:{" "}
        <a
          href="https://uncomtrade.org/docs/"
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="underline"
        >
          Comtrade documentation
        </a>
        . Dependency data is global; the live geopolitical-stress overlay deepens with
        theater coverage.
      </p>
    </main>
  );
}
