import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const locale = await getLocale();
  const t = makeT(locale);
  let stats = { sources: 0, citations: 0, docs: 0, runs: 0 };
  try {
    const [r] = (await rawSql.query(
      `SELECT
        (SELECT count(*) FROM sources WHERE citation_count > 0)::int AS sources,
        (SELECT count(*) FROM source_citations)::int AS citations,
        (SELECT count(*) FROM raw_documents)::int AS docs,
        (SELECT count(*) FROM validation_runs)::int AS runs`,
      [],
    )) as Array<typeof stats>;
    stats = r;
  } catch {
    // health page shows details
  }

  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t("home.tagline")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">{t("home.sub")}</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/pricing"
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            {t("home.cta.subscribe")}
          </Link>
          <Link
            href="/scoreboard"
            className="rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {t("home.cta.scoreboard")}
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">{t("home.live")}</p>
      </section>

      <section className="grid gap-6 py-10 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="mb-2 font-semibold">{t("home.features.reliability.title")}</h3>
          <p className="text-sm text-gray-500">
            {t("home.features.reliability.body", {
              sources: formatNumber(locale, stats.sources),
              citations: formatNumber(locale, stats.citations),
            })}
          </p>
          <Link href="/registry" className="mt-3 inline-block text-sm underline">
            {t("home.features.reliability.link")}
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="mb-2 font-semibold">{t("home.features.claims.title")}</h3>
          <p className="text-sm text-gray-500">
            {t("home.features.claims.body", { docs: formatNumber(locale, stats.docs) })}
          </p>
          <Link href="/countries" className="mt-3 inline-block text-sm underline">
            {t("home.features.claims.link")}
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="mb-2 font-semibold">{t("home.features.scored.title")}</h3>
          <p className="text-sm text-gray-500">
            {t("home.features.scored.body", { runs: formatNumber(locale, stats.runs) })}
          </p>
          <Link href="/scoreboard" className="mt-3 inline-block text-sm underline">
            {t("home.features.scored.link")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800">
        BNOW.NET · {t("home.footer")}
        <Link href="/health" className="ms-2 underline">{t("common.status")}</Link>
      </footer>
    </main>
  );
}
