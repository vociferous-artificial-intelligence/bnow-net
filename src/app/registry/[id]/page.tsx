import Link from "next/link";
import { notFound } from "next/navigation";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

const HEDGE_ORDER = ["confirmed", "assessed", "unknown", "claimed", "unverified"] as const;
const HEDGE_BAR: Record<string, string> = {
  confirmed: "bg-green-600",
  assessed: "bg-blue-500",
  unknown: "bg-gray-400",
  claimed: "bg-amber-500",
  unverified: "bg-red-500",
};

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const srcRows = (await rawSql.query(`SELECT * FROM sources WHERE id = $1`, [id])) as Array<{
    id: number; canonical_url: string; domain: string; platform: string; name: string | null;
    citation_count: number; first_cited_report_date: string | null;
    last_cited_report_date: string | null; hedging_confirmed: number; hedging_claimed: number;
    hedging_unverified: number; hedging_assessed: number; hedging_unknown: number;
    reliability_score: number | null; decayed: boolean; status: string;
  }>;
  if (srcRows.length === 0) notFound();
  const s = srcRows[0];

  const [byYearRaw, recentCitesRaw, recentDocsRaw] = await Promise.all([
    rawSql.query(
      `SELECT extract(year FROM ir.report_date)::int AS y, count(*)::int AS n
       FROM source_citations sc JOIN isw_reports ir ON ir.id = sc.report_id
       WHERE sc.source_id = $1 GROUP BY 1 ORDER BY 1`,
      [id],
    ),
    rawSql.query(
      `SELECT ir.report_date::text AS d, ir.url, sc.hedging, sc.hedging_cue
       FROM source_citations sc JOIN isw_reports ir ON ir.id = sc.report_id
       WHERE sc.source_id = $1 ORDER BY ir.report_date DESC LIMIT 15`,
      [id],
    ),
    rawSql.query(
      `SELECT id, url, title, fetched_at::text AS f FROM raw_documents
       WHERE source_id = $1 ORDER BY fetched_at DESC LIMIT 10`,
      [id],
    ),
  ]);
  const byYear = byYearRaw as Array<{ y: number; n: number }>;
  const recentCites = recentCitesRaw as Array<{
    d: string; url: string; hedging: string; hedging_cue: string | null;
  }>;
  const recentDocs = recentDocsRaw as Array<{
    id: number; url: string | null; title: string | null; f: string;
  }>;

  const totalH =
    s.hedging_confirmed + s.hedging_assessed + s.hedging_unknown +
    s.hedging_claimed + s.hedging_unverified;
  const hedgeCounts: Record<string, number> = {
    confirmed: s.hedging_confirmed, assessed: s.hedging_assessed, unknown: s.hedging_unknown,
    claimed: s.hedging_claimed, unverified: s.hedging_unverified,
  };
  const maxYear = Math.max(...byYear.map((r) => r.n), 1);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/registry" className="underline">registry</Link> · source #{s.id}
      </p>
      <h1 className="mb-1 font-mono text-2xl font-bold">{s.canonical_url}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {s.platform.replace("_", " ")} · {s.citation_count.toLocaleString()} ISW citations ·{" "}
        {s.first_cited_report_date?.slice(0, 10)} → {s.last_cited_report_date?.slice(0, 10)} ·{" "}
        {s.decayed ? "decayed" : "active"} · reliability{" "}
        <strong>{s.reliability_score !== null ? Number(s.reliability_score).toFixed(2) : "—"}</strong>
      </p>

      <section className="mb-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">How ISW hedges this source</h2>
          {HEDGE_ORDER.map((h) => (
            <div key={h} className="mb-1 flex items-center gap-2 text-xs">
              <span className="w-20">{h}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                <div
                  className={HEDGE_BAR[h]}
                  style={{ width: `${totalH ? (hedgeCounts[h] / totalH) * 100 : 0}%`, height: "100%" }}
                />
              </div>
              <span className="w-14 text-right tabular-nums">
                {hedgeCounts[h]} ({totalH ? Math.round((hedgeCounts[h] / totalH) * 100) : 0}%)
              </span>
            </div>
          ))}
          <p className="mt-2 text-xs text-gray-400">
            Reliability = weighted mean: confirmed 1.0 · assessed .75 · unknown .5 ·
            claimed .4 · unverified .15
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Citations by year</h2>
          {byYear.map((r) => (
            <div key={r.y} className="mb-1 flex items-center gap-2 text-xs">
              <span className="w-10">{r.y}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                <div className="bg-blue-500" style={{ width: `${(r.n / maxYear) * 100}%`, height: "100%" }} />
              </div>
              <span className="w-12 text-right tabular-nums">{r.n}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Recent ISW citations</h2>
        <ul className="space-y-1 text-sm">
          {recentCites.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="tabular-nums text-gray-400">{c.d.slice(0, 10)}</span>
              <span className="rounded bg-gray-100 px-1.5 text-xs leading-5 dark:bg-gray-800">{c.hedging}</span>
              {c.hedging_cue && <span className="text-xs italic text-gray-400">“{c.hedging_cue}”</span>}
              <a href={c.url} rel="nofollow noopener" className="ml-auto text-xs underline">report</a>
            </li>
          ))}
        </ul>
      </section>

      {recentDocs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Recent ingested documents</h2>
          <ul className="space-y-1 text-sm">
            {recentDocs.map((d) => (
              <li key={d.id} className="truncate">
                <span className="text-gray-400">{d.f.slice(0, 10)}</span>{" "}
                {d.url ? (
                  <a href={d.url} rel="nofollow noopener" className="underline">
                    {d.title ?? d.url}
                  </a>
                ) : (
                  d.title ?? `doc #${d.id}`
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
