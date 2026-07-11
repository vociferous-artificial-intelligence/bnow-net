import Link from "next/link";
import { rawSql } from "@/db";
import { getT } from "@/i18n/server";
import { currentRole } from "@/lib/gate";
import { registryView } from "@/lib/registry/view-policy";

export const dynamic = "force-dynamic";

// Middle East source registry — computed LIVE per-theater from Iran-Update citations
// (theater='ir') so it never blends with the Russia registry's global aggregates.
// The Iran Update covers Iran + the non-state-actor network (Hezbollah, Houthis, Hamas,
// Iraqi militias), so their cited media/Telegram surface here naturally.

const PAGE_SIZE = 50;
const PLATFORMS = ["telegram", "x", "state_media", "independent_media", "gov", "other"] as const;

export default async function MiddleEastPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const platform = PLATFORMS.includes(sp.platform as never) ? sp.platform : undefined;
  const q = sp.q?.slice(0, 80);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Same moat gate as /registry (view-policy.ts). Reduced role: the reliability
  // CASE expression is left OUT of the SQL text entirely below, not merely
  // hidden at render time — this page computes the score live from citations,
  // so "don't compute it" is the stronger, more defensible gate.
  const [role, t] = await Promise.all([currentRole(), getT()]);
  const view = registryView(role);
  const reliabilitySelect = view.showReliability
    ? `,
              round(avg(CASE sc.hedging
                WHEN 'confirmed' THEN 1.0 WHEN 'assessed' THEN 0.75 WHEN 'unknown' THEN 0.5
                WHEN 'claimed' THEN 0.4 WHEN 'unverified' THEN 0.15 ELSE 0.5 END)::numeric, 2) AS reliability`
    : "";

  const [statsRows, reportRows, sourceRows] = await Promise.all([
    rawSql.query(
      `SELECT count(DISTINCT sc.source_id)::int AS sources,
              count(*)::int AS citations,
              count(DISTINCT ir.id)::int AS reports
       FROM source_citations sc JOIN isw_reports ir ON ir.id = sc.report_id
       WHERE ir.theater = 'ir'`,
      [],
    ),
    rawSql.query(
      `SELECT min(report_date)::text AS lo, max(report_date)::text AS hi
       FROM isw_reports WHERE theater = 'ir'`,
      [],
    ),
    rawSql.query(
      `SELECT s.id, s.canonical_url, s.platform,
              count(*)::int AS citations,
              min(ir.report_date)::text AS first_cited,
              max(ir.report_date)::text AS last_cited${reliabilitySelect}
       FROM source_citations sc
       JOIN isw_reports ir ON ir.id = sc.report_id
       JOIN sources s ON s.id = sc.source_id
       WHERE ir.theater = 'ir'
         ${platform ? "AND s.platform = $1::platform" : ""}
         ${q ? `AND s.canonical_url ILIKE $${platform ? 2 : 1}` : ""}
       GROUP BY s.id
       ORDER BY citations DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      [platform, q ? `%${q}%` : undefined].filter((x) => x !== undefined),
    ),
  ]);

  const stats = statsRows[0] as { sources: number; citations: number; reports: number };
  const span = reportRows[0] as { lo: string | null; hi: string | null };
  const sources = sourceRows as Array<{
    id: number; canonical_url: string; platform: string; citations: number;
    first_cited: string | null; last_cited: string | null;
    // Absent entirely from the row (not just null) when reliabilitySelect was
    // omitted above — the reduced view must never read this field.
    reliability?: string | null;
  }>;

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ platform, q, page, ...over }))
      if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · Middle East source registry
      </p>
      <h1 className="mb-1 text-2xl font-bold">Middle East Source Registry</h1>
      <p className="mb-1 max-w-3xl text-sm text-gray-500">
        {stats.sources.toLocaleString()} sources from {stats.citations.toLocaleString()}{" "}
        citations across {stats.reports.toLocaleString()} ISW Iran Update reports
        {span.lo && ` (${span.lo.slice(0, 7)} → ${span.hi?.slice(0, 7)})`}. The Iran Update
        covers Iran <em>and</em> the Axis-of-Resistance network — Hezbollah, the Houthis,
        Hamas, and Iraqi militias — so their cited media and Telegram channels appear here.
        Reliability is the hedging-weighted score of how ISW cites each source.
      </p>
      {span.hi && (
        <p className="mb-4 text-xs text-gray-400">
          {t("registry.scores_as_of")} {span.hi}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={qs({ platform: undefined, page: 1 })} className={`rounded px-2 py-1 ${!platform ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}>all</Link>
        {PLATFORMS.map((p) => (
          <Link key={p} href={qs({ platform: p, page: 1 })} className={`rounded px-2 py-1 ${platform === p ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"}`}>
            {p.replace("_", " ")}
          </Link>
        ))}
        <form className="ml-auto" action="/middle-east" method="get">
          {platform && <input type="hidden" name="platform" value={platform} />}
          <input name="q" defaultValue={q ?? ""} placeholder="search…" className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
        </form>
      </div>

      {sources.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          No Middle East sources loaded yet — the Iran Update backfill populates this.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
              <th className="py-2">source</th>
              <th>platform</th>
              <th className="text-right">citations</th>
              {view.showReliability && <th className="text-right">reliability</th>}
              <th>cited</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="max-w-[320px] truncate py-1.5 font-mono text-xs">
                  <Link href={`/registry/${s.id}`} className="hover:underline">{s.canonical_url}</Link>
                </td>
                <td className="text-xs">{s.platform.replace("_", " ")}</td>
                <td className="text-right tabular-nums">{s.citations}</td>
                {view.showReliability && (
                  <td className="text-right tabular-nums">{s.reliability ?? "—"}</td>
                )}
                <td className="whitespace-nowrap text-xs tabular-nums">
                  {s.first_cited?.slice(0, 7)} → {s.last_cited?.slice(0, 7)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center gap-3 text-sm">
        {page > 1 && <Link href={qs({ page: page - 1 })} className="underline">← prev</Link>}
        <span>page {page}</span>
        {sources.length === PAGE_SIZE && <Link href={qs({ page: page + 1 })} className="underline">next →</Link>}
      </div>
    </main>
  );
}
