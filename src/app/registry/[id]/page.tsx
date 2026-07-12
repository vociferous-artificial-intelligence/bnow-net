import Link from "next/link";
import { notFound } from "next/navigation";
import { rawSql } from "@/db";
import { getT } from "@/i18n/server";
import { currentRole } from "@/lib/gate";
import { registryView } from "@/lib/registry/view-policy";
import { feedbackMailto } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/**
 * Builds the flag-source mailto subject line: prefers the curated name,
 * falling back to the canonical URL when the source has none. Pure so it's
 * unit-testable without a DB.
 */
export function sourceFlagSubject(name: string | null, canonicalUrl: string, id: number): string {
  return `[BNOW source] ${name ?? canonicalUrl} (id ${id})`;
}

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

  // Same moat gate as /registry (view-policy.ts): sequential ids make this
  // detail page id-walkable, so it must independently withhold the score
  // fields for a reduced role rather than relying on the index hiding a link.
  const [role, t] = await Promise.all([currentRole(), getT()]);
  const view = registryView(role);

  const srcRows = (await rawSql.query(`SELECT * FROM sources WHERE id = $1`, [id])) as Array<{
    id: number; canonical_url: string; domain: string; platform: string; name: string | null;
    citation_count: number; first_cited_report_date: string | null;
    last_cited_report_date: string | null; hedging_confirmed: number; hedging_claimed: number;
    hedging_unverified: number; hedging_assessed: number; hedging_unknown: number;
    reliability_score: number | null; decayed: boolean; status: string;
  }>;
  if (srcRows.length === 0) notFound();
  const s = srcRows[0];
  const mailto = feedbackMailto(sourceFlagSubject(s.name, s.canonical_url, s.id));

  const [byYearRaw, recentCitesRaw, recentDocsRaw, theaterRaw] = await Promise.all([
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
    rawSql.query(
      `SELECT theater, citation_count, first_cited_report_date::text AS first,
              last_cited_report_date::text AS last, reliability_score, decayed
       FROM source_theater_stats WHERE source_id = $1 ORDER BY citation_count DESC`,
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
  const theaterStats = theaterRaw as Array<{
    theater: string; citation_count: number; first: string | null; last: string | null;
    reliability_score: number | null; decayed: boolean;
  }>;
  const THEATER_LABEL: Record<string, string> = {
    ru: "Russia/Ukraine (ROCA)",
    ir: "Middle East (Iran Update)",
  };

  const totalH =
    s.hedging_confirmed + s.hedging_assessed + s.hedging_unknown +
    s.hedging_claimed + s.hedging_unverified;
  const hedgeCounts: Record<string, number> = {
    confirmed: s.hedging_confirmed, assessed: s.hedging_assessed, unknown: s.hedging_unknown,
    claimed: s.hedging_claimed, unverified: s.hedging_unverified,
  };
  const maxYear = Math.max(...byYear.map((r) => r.n), 1);

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/registry" className="underline">registry</Link> · source #{s.id}
        {mailto && (
          <>
            {" "}
            · <a href={mailto} className="underline">{t("feedback.flag_source")}</a>
          </>
        )}
      </p>
      <h1 className="mb-1 font-mono text-2xl font-bold">{s.canonical_url}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {s.platform.replace("_", " ")} · {s.citation_count.toLocaleString()} ISW citations ·{" "}
        {s.first_cited_report_date?.slice(0, 10)} → {s.last_cited_report_date?.slice(0, 10)} ·{" "}
        {s.decayed ? "decayed" : "active"}
        {view.showReliability && (
          <>
            {" "}
            · reliability{" "}
            <strong>
              {s.reliability_score !== null ? Number(s.reliability_score).toFixed(2) : "—"}
            </strong>
          </>
        )}
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
          {view.showWeightConstants ? (
            <p className="mt-2 text-xs text-gray-400">
              Reliability = weighted mean: confirmed 1.0 · assessed .75 · unknown .5 ·
              claimed .4 · unverified .15
            </p>
          ) : (
            <p className="mt-2 text-xs text-gray-400">
              {t("registry.detail.weighting_qualitative")}
            </p>
          )}
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

      {theaterStats.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">By reference corpus</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-800">
                  <th className="py-1">theater</th>
                  <th className="text-right">citations</th>
                  {view.showReliability && <th className="text-right">reliability</th>}
                  <th>span</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {theaterStats.map((row) => (
                  <tr key={row.theater} className="border-b border-gray-100 dark:border-gray-900">
                    <td className="py-1">{THEATER_LABEL[row.theater] ?? row.theater}</td>
                    <td className="text-right tabular-nums">{row.citation_count.toLocaleString()}</td>
                    {view.showReliability && (
                      <td className="text-right tabular-nums">
                        {row.reliability_score !== null
                          ? Number(row.reliability_score).toFixed(2)
                          : "—"}
                      </td>
                    )}
                    <td className="text-xs text-gray-500">
                      {row.first?.slice(0, 10)} → {row.last?.slice(0, 10)}
                    </td>
                    <td className="text-xs">{row.decayed ? "decayed" : "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
