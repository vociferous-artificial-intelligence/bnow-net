import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";
import { formatEtDateTime } from "@/lib/time/format-et";

export const dynamic = "force-dynamic";

// Public, indexable per-theater coverage landing page. Replaces the old
// `/countries#<iso2>` anchor (which only scrolled the index and gave no SEO surface).
// Every field is public-safe aggregate metadata — doc counts, digest counts, the latest
// digest date, coverage % vs ISW — the same class of data the /countries card already
// shows. No claim text, no source URLs (those live behind the FEATURE_AUTH_GATE on
// /digests). Truth-in-UI (ruling 3): all values come from real tables; deferred theaters
// 404 and never render.

interface CountryRow {
  iso2: string;
  name: string;
  status: string;
  latest_digest: string | null;
  docs: number;
  last_fetch: string | null;
  digest_days: number;
}

interface ValidationRow {
  coverage_pct: number | string | null;
  timeliness_hours: number | string | null;
  digest_date: string | null;
}

/** Country row for a valid, non-deferred iso2 — the shared lookup for page + metadata. */
async function loadCountry(iso2: string): Promise<CountryRow | null> {
  if (!/^[a-z]{2}$/.test(iso2)) return null;
  const rows = (await rawSql.query(
    `SELECT c.iso2, c.name, c.status,
            (SELECT max(digest_date) FROM digests d WHERE d.country_id = c.id) AS latest_digest,
            (SELECT count(*) FROM raw_documents rd WHERE rd.country_iso2 = c.iso2)::int AS docs,
            (SELECT max(rd.fetched_at) FROM raw_documents rd WHERE rd.country_iso2 = c.iso2) AS last_fetch,
            (SELECT count(DISTINCT digest_date) FROM digests d WHERE d.country_id = c.id)::int AS digest_days
     FROM countries c
     WHERE c.iso2 = $1 AND c.status != 'deferred'`,
    [iso2],
  )) as CountryRow[];
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ iso2: string }>;
}): Promise<Metadata> {
  const { iso2 } = await params;
  const locale = await getLocale();
  const t = makeT(locale);
  const country = await loadCountry(iso2).catch(() => null);
  if (!country) return { title: "BNOW.NET" };
  // Country name is a proper noun (English in the DB, matching the /countries index and
  // /digests archive) — composed outside t() so no {country} token enters the catalogs.
  return {
    title: `${country.name} — ${t("countries.detail.meta_suffix")} | BNOW.NET`,
    description: `${country.name}: ${t("countries.detail.meta_desc")}`,
  };
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ iso2: string }>;
}) {
  const { iso2 } = await params;
  const locale = await getLocale();
  const t = makeT(locale);

  const country = await loadCountry(iso2);
  if (!country) notFound();

  const active = country.status === "active";
  const latest = country.latest_digest ? String(country.latest_digest).slice(0, 10) : null;

  // Latest validation run (coverage vs ISW) — public-safe aggregate, best-effort.
  let validation: ValidationRow | null = null;
  if (active) {
    try {
      const vrows = (await rawSql.query(
        `SELECT vr.coverage_pct, vr.timeliness_hours, d.digest_date::text AS digest_date
         FROM validation_runs vr
         JOIN digests d ON d.id = vr.digest_id
         JOIN countries c ON c.id = d.country_id
         WHERE c.iso2 = $1
         ORDER BY vr.run_at DESC
         LIMIT 1`,
        [iso2],
      )) as ValidationRow[];
      validation = vrows[0] ?? null;
    } catch {
      // coverage tile just renders "not yet validated"
    }
  }
  const coveragePct = validation?.coverage_pct != null ? Number(validation.coverage_pct) : null;

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">
          BNOW.NET
        </Link>{" "}
        ·{" "}
        <Link href="/countries" className="underline">
          {t("nav.item.all_theaters")}
        </Link>
      </p>

      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{country.name}</h1>
        {active ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
            {t("countries.badge.live")}
          </span>
        ) : (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
            {t("countries.badge.launching")}
          </span>
        )}
      </div>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">{t("countries.detail.subtitle")}</p>

      {active ? (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                {t("countries.detail.ingested_label")}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatNumber(locale, country.docs)}
              </dd>
              {country.last_fetch && formatEtDateTime(country.last_fetch, locale) && (
                <dd className="mt-1 text-xs text-gray-500">
                  {t("countries.data_current", { time: formatEtDateTime(country.last_fetch, locale)! })}
                </dd>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                {t("countries.detail.digests_label")}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatNumber(locale, country.digest_days)}
              </dd>
              <dd className="mt-1 text-xs text-gray-500">
                {coveragePct != null
                  ? t("countries.detail.coverage", { pct: coveragePct.toFixed(1) })
                  : t("home.validation.not_validated")}
              </dd>
            </div>
          </dl>

          <div className="mt-6 space-y-2 text-sm">
            {latest ? (
              <p>
                <Link href={`/digests/${country.iso2}/${latest}`} className="underline">
                  {t("countries.detail.latest_digest", { date: latest })}
                </Link>
              </p>
            ) : (
              <p className="text-gray-400">{t("countries.first_digest_pending")}</p>
            )}
            {country.digest_days > 0 && (
              <p>
                <Link href={`/digests/${country.iso2}`} className="underline">
                  {t("countries.detail.archive")}
                </Link>
              </p>
            )}
            <p>
              <Link href="/scoreboard" className="underline">
                {t("countries.detail.scoreboard")}
              </Link>
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">{t("countries.detail.launching")}</p>
      )}
    </main>
  );
}
