import { and, count, desc, eq, ilike, sql as dsql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const PLATFORMS = ["telegram", "x", "state_media", "independent_media", "gov", "other"] as const;

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; q?: string; page?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const platform = PLATFORMS.includes(params.platform as never)
    ? (params.platform as (typeof PLATFORMS)[number])
    : undefined;
  const q = params.q?.slice(0, 80);
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort = params.sort === "reliability" ? "reliability" : "citations";

  const where = and(
    dsql`${schema.sources.citationCount} > 0`,
    platform ? eq(schema.sources.platform, platform) : undefined,
    q ? ilike(schema.sources.canonicalUrl, `%${q}%`) : undefined,
  );

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(schema.sources)
      .where(where)
      .orderBy(
        sort === "reliability"
          ? desc(schema.sources.reliabilityScore)
          : desc(schema.sources.citationCount),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(schema.sources).where(where),
  ]);
  const total = totalRow[0].n;

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ platform, q, sort, page, ...over }))
      if (v !== undefined && v !== "") p.set(k, String(v));
    return `?${p.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Source Registry</h1>
      <p className="mb-4 text-sm text-gray-500">
        {total.toLocaleString()} sources derived from ISW Russian Offensive Campaign
        Assessment citations. Reliability = hedging-weighted score of how ISW cites each
        source (methodology on each source page).
      </p>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={qs({ platform: undefined, page: 1 })}
          className={`rounded px-2 py-1 ${!platform ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}
        >
          all
        </Link>
        {PLATFORMS.map((p) => (
          <Link
            key={p}
            href={qs({ platform: p, page: 1 })}
            className={`rounded px-2 py-1 ${platform === p ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}
          >
            {p.replace("_", " ")}
          </Link>
        ))}
        <form className="ml-auto" action="/registry" method="get">
          {platform && <input type="hidden" name="platform" value={platform} />}
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="search…"
            className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          />
        </form>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
            <th className="py-2">source</th>
            <th>platform</th>
            <th className="text-right">
              <Link href={qs({ sort: "citations", page: 1 })} className="underline">
                citations
              </Link>
            </th>
            <th className="text-right">
              <Link href={qs({ sort: "reliability", page: 1 })} className="underline">
                reliability
              </Link>
            </th>
            <th>hedging mix</th>
            <th>cited</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const totalH =
              s.hedgingConfirmed + s.hedgingClaimed + s.hedgingUnverified +
              s.hedgingAssessed + s.hedgingUnknown;
            return (
              <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="max-w-[280px] truncate py-1.5 font-mono text-xs">
                  <Link href={`/registry/${s.id}`} className="hover:underline">
                    {s.canonicalUrl}
                  </Link>
                </td>
                <td className="text-xs">{s.platform.replace("_", " ")}</td>
                <td className="text-right tabular-nums">{s.citationCount}</td>
                <td className="text-right tabular-nums">
                  {s.reliabilityScore?.toFixed(2) ?? "—"}
                </td>
                <td>
                  <div className="flex h-2 w-28 overflow-hidden rounded bg-gray-200 dark:bg-gray-800" title={`confirmed ${pct(s.hedgingConfirmed, totalH)}% · assessed ${pct(s.hedgingAssessed, totalH)}% · claimed ${pct(s.hedgingClaimed, totalH)}% · unverified ${pct(s.hedgingUnverified, totalH)}%`}>
                    <div className="bg-green-600" style={{ width: `${pct(s.hedgingConfirmed, totalH)}%` }} />
                    <div className="bg-blue-500" style={{ width: `${pct(s.hedgingAssessed, totalH)}%` }} />
                    <div className="bg-gray-400" style={{ width: `${pct(s.hedgingUnknown, totalH)}%` }} />
                    <div className="bg-amber-500" style={{ width: `${pct(s.hedgingClaimed, totalH)}%` }} />
                    <div className="bg-red-500" style={{ width: `${pct(s.hedgingUnverified, totalH)}%` }} />
                  </div>
                </td>
                <td className="whitespace-nowrap text-xs tabular-nums">
                  {s.firstCitedReportDate?.slice(0, 7)} → {s.lastCitedReportDate?.slice(0, 7)}
                </td>
                <td className="text-xs">
                  {s.decayed ? <span className="text-amber-600">decayed</span> : "active"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-3 text-sm">
        {page > 1 && (
          <Link href={qs({ page: page - 1 })} className="underline">
            ← prev
          </Link>
        )}
        <span>
          page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        {page * PAGE_SIZE < total && (
          <Link href={qs({ page: page + 1 })} className="underline">
            next →
          </Link>
        )}
      </div>
    </main>
  );
}
