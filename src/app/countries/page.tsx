import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT, type Locale } from "@/i18n/dictionaries";
import { formatDateTime } from "@/i18n/format";

export const dynamic = "force-dynamic";

// Freshness is labeled "ET" (not the DST-varying EDT/EST abbreviation) because that's the
// stable label the product uses for its US-analyst audience; the IANA zone name still
// drives correct DST math under the hood via formatDateTime, so no offset is ever hardcoded.
function freshnessLabel(locale: Locale, lastFetch: string): string {
  const formatted = formatDateTime(locale, lastFetch, {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatted} ET`;
}

export default async function CountriesPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const rows = (await rawSql.query(
    `SELECT c.iso2, c.name, c.slug, c.status,
            (SELECT max(digest_date) FROM digests d WHERE d.country_id = c.id) AS latest_digest,
            (SELECT count(*) FROM raw_documents rd WHERE rd.country_iso2 = c.iso2)::int AS docs,
            (SELECT max(rd.fetched_at) FROM raw_documents rd WHERE rd.country_iso2 = c.iso2) AS last_fetch
     FROM countries c
     WHERE c.status != 'deferred'
     ORDER BY c.status = 'active' DESC, c.name`,
    [],
  )) as Array<{
    iso2: string; name: string; slug: string; status: string;
    latest_digest: string | null; docs: number; last_fetch: string | null;
  }>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · theaters
      </p>
      <h1 className="mb-6 text-2xl font-bold">{t("countries.title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((c) => (
          <div
            key={c.iso2}
            // Anchor target for the header's Coverage dropdown; scroll-mt clears the sticky header.
            id={c.iso2}
            className={`scroll-mt-24 rounded-xl border p-5 ${
              c.status === "active"
                ? "border-gray-300 dark:border-gray-700"
                : "border-dashed border-gray-200 opacity-70 dark:border-gray-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{c.name}</h2>
              {c.status === "active" ? (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                  live
                </span>
              ) : (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
                  coverage launching
                </span>
              )}
            </div>
            {c.status === "active" ? (
              <div className="mt-3 space-y-1 text-sm">
                {c.last_fetch && (
                  <p className="text-gray-600 dark:text-gray-300">
                    {t("countries.data_current", { time: freshnessLabel(locale, c.last_fetch) })}
                  </p>
                )}
                <p className="text-gray-500">{c.docs.toLocaleString()} documents ingested</p>
                {c.latest_digest ? (
                  <Link
                    href={`/digests/${c.iso2}/${String(c.latest_digest).slice(0, 10)}`}
                    className="underline"
                  >
                    latest digest ({String(c.latest_digest).slice(0, 10)}) →
                  </Link>
                ) : (
                  <p className="text-gray-400">{t("countries.first_digest_pending")}</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-400">
                Config scaffolded — feed roster and registry seeding queued.
              </p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
