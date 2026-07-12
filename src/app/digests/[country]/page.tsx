import { notFound } from "next/navigation";
import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";

export const dynamic = "force-dynamic";

interface ArchiveRow {
  digest_date: string;
  tracks: number;
  claims: number;
}

export default async function DigestArchivePage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  if (!/^[a-z]{2}$/.test(country)) notFound();

  const locale = await getLocale();
  const t = makeT(locale);

  const countryRows = (await rawSql.query(`SELECT name FROM countries WHERE iso2 = $1`, [
    country,
  ])) as Array<{ name: string }>;
  if (countryRows.length === 0) notFound();
  const countryName = countryRows[0].name;

  const rows = (await rawSql.query(
    `SELECT d.digest_date, count(DISTINCT d.track)::int AS tracks, count(cl.id)::int AS claims
     FROM digests d
     JOIN countries c ON c.id = d.country_id
     LEFT JOIN claims cl ON cl.digest_id = d.id
     WHERE c.iso2 = $1
     GROUP BY d.digest_date
     ORDER BY d.digest_date DESC
     LIMIT 120`,
    [country],
  )) as ArchiveRow[];

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <h1 className="mb-3 text-2xl font-bold">
        {countryName} — {t("digest.nav.archive")}
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">{t("digest.archive.intro")}</p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">{t("digest.archive.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
                <th className="py-2">{t("digest.archive.col.date")}</th>
                <th className="text-right">{t("digest.archive.col.tracks")}</th>
                <th className="text-right">{t("digest.archive.col.claims")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dateStr = String(r.digest_date).slice(0, 10);
                return (
                  <tr key={dateStr} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 tabular-nums">
                      <Link href={`/digests/${country}/${dateStr}`} className="underline">
                        {dateStr}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{r.tracks}</td>
                    <td className="text-right tabular-nums">{r.claims}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
