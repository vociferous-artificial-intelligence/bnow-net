import Link from "next/link";
import { notFound } from "next/navigation";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { oursOnlyPresentation } from "@/lib/validation/ours-only";

export const dynamic = "force-dynamic";

interface Divergence {
  kind: "agreement" | "isw_only" | "ours_only";
  iswIndex?: number;
  iswToponyms?: string[];
  iswActions?: string[];
  claimId?: number;
  claimText?: string;
  score?: number;
  /** ours_only, runs scored 2026-07-13+: hedging frozen at scoring time. */
  hedging?: string;
}

const KIND_STYLE: Record<string, { label: string; cls: string }> = {
  agreement: { label: "agreement", cls: "border-green-300 dark:border-green-800" },
  isw_only: { label: "ISW only (our miss)", cls: "border-red-300 dark:border-red-800" },
  ours_only: { label: "ours only (potential lead)", cls: "border-blue-300 dark:border-blue-800" },
};


export default async function ValidationDetailPage({
  params,
}: {
  params: Promise<{ country: string; date: string }>;
}) {
  const { country, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z]{2}$/.test(country)) notFound();

  const locale = await getLocale();
  const t = makeT(locale);

  const rows = (await rawSql.query(
    `SELECT vr.*, d.digest_date, c.iso2, ir.url AS isw_url
     FROM validation_runs vr
     JOIN digests d ON d.id = vr.digest_id
     JOIN countries c ON c.id = d.country_id
     JOIN isw_reports ir ON ir.id = vr.isw_report_id
     WHERE c.iso2 = $1 AND d.digest_date = $2`,
    [country, date],
  )) as Array<{
    coverage_pct: number | null;
    unsupported_claim_rate: number | null;
    timeliness_hours: number | null;
    divergences: Divergence[];
    details: Record<string, number>;
    isw_url: string;
  }>;
  if (rows.length === 0) notFound();
  const run = rows[0];

  // Hedging for ours_only cards: prefer the value frozen at scoring time; for
  // runs scored before 2026-07-13 fall back to the live claim row (the claim may
  // have been regenerated since — a missing row degrades to the safe label).
  const oursOnly = (run.divergences ?? []).filter((d) => d.kind === "ours_only");
  const needLookup = oursOnly
    .filter((d) => d.hedging === undefined && d.claimId !== undefined)
    .map((d) => d.claimId as number);
  const hedgeByClaimId = new Map<number, string>();
  if (needLookup.length > 0) {
    try {
      const hedgeRows = (await rawSql.query(
        `SELECT id, hedging FROM claims WHERE id = ANY($1)`,
        [needLookup],
      )) as Array<{ id: number; hedging: string }>;
      for (const r of hedgeRows) hedgeByClaimId.set(Number(r.id), r.hedging);
    } catch {
      // degrade to the safe non-endorsing label
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/scoreboard" className="underline">scoreboard</Link> · divergence detail ·{" "}
        <Link href={`/digests/${country}/${date}`} className="underline">
          {t("scoreboard.view_digest")}
        </Link>
      </p>
      <h1 className="mb-2 text-2xl font-bold">
        {country.toUpperCase()} — {date}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        coverage {run.coverage_pct !== null ? `${Number(run.coverage_pct).toFixed(0)}%` : "—"} ·
        thin-sourced {(Number(run.unsupported_claim_rate ?? 0) * 100).toFixed(0)}% · lead{" "}
        {run.timeliness_hours !== null ? `${Number(run.timeliness_hours).toFixed(1)}h` : "—"} ·{" "}
        <a href={run.isw_url} className="underline" rel="nofollow noopener">
          ISW report
        </a>{" "}
        (matched on derived keywords only)
      </p>

      <div className="space-y-3">
        {(run.divergences ?? []).map((d, i) => {
          const style = KIND_STYLE[d.kind] ?? KIND_STYLE.agreement;
          const ours =
            d.kind === "ours_only"
              ? oursOnlyPresentation(
                  d.hedging ?? (d.claimId !== undefined ? hedgeByClaimId.get(d.claimId) : undefined),
                )
              : null;
          return (
            <div key={i} className={`rounded-lg border-2 p-3 text-sm ${style.cls}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{ours ? ours.label : style.label}</span>
                <span className="text-xs text-gray-400">
                  {ours && <span className="me-2 rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">{ours.hedge}</span>}
                  {d.score !== undefined && <>match {d.score}</>}
                </span>
              </div>
              {d.iswIndex !== undefined && (
                <p className="text-xs text-gray-500">
                  ISW takeaway #{d.iswIndex + 1} · keywords:{" "}
                  {[...(d.iswToponyms ?? []), ...(d.iswActions ?? [])].join(", ") || "(none)"}
                </p>
              )}
              {d.claimText && <p className="mt-1">{d.claimText}</p>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
