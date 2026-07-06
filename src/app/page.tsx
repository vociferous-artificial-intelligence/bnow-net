import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT, LOCALE_NAMES, type Locale } from "@/i18n/dictionaries";

export const dynamic = "force-dynamic";

const SHOWN_LOCALES: Locale[] = ["en", "uk"];

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
      <nav className="flex flex-wrap items-center justify-between gap-2 py-6 text-sm">
        <span className="font-bold tracking-tight">BNOW.NET</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/countries" className="hover:underline">{t("nav.theaters")}</Link>
          <Link href="/registry" className="hover:underline">{t("nav.ru_registry")}</Link>
          <Link href="/middle-east" className="hover:underline">{t("nav.me_registry")}</Link>
          <Link href="/scoreboard" className="hover:underline">{t("nav.scoreboard")}</Link>
          <Link href="/ask" className="hover:underline">{t("nav.ask")}</Link>
          <Link href="/datadark" className="hover:underline">{t("nav.datadark")}</Link>
          <Link href="/trade" className="hover:underline">{t("nav.trade")}</Link>
          <Link href="/signals" className="hover:underline">{t("nav.signals")}</Link>
          <Link href="/critical-materials" className="hover:underline">{t("nav.materials")}</Link>
          <Link href="/pricing" className="hover:underline">{t("nav.pricing")}</Link>
          <Link href="/signin" className="hover:underline">{t("nav.signin")}</Link>
          <span className="flex gap-1 text-xs text-gray-400">
            {SHOWN_LOCALES.map((l) => (
              <a
                key={l}
                href={`/api/locale?set=${l}`}
                className={l === locale ? "font-semibold text-blue-600" : "hover:underline"}
              >
                {LOCALE_NAMES[l]}
              </a>
            ))}
          </span>
        </div>
      </nav>

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
          <h3 className="mb-2 font-semibold">Reliability, derived not asserted</h3>
          <p className="text-sm text-gray-500">
            {stats.sources.toLocaleString()} sources rated from{" "}
            {stats.citations.toLocaleString()} citations in 4+ years of expert reporting —
            how often each source is confirmed, merely claimed, or never verified.
          </p>
          <Link href="/registry" className="mt-3 inline-block text-sm underline">
            explore the registry →
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="mb-2 font-semibold">Claims you can audit</h3>
          <p className="text-sm text-gray-500">
            {stats.docs.toLocaleString()} raw documents ingested. Every digest claim is
            linked to its source documents at the database level — no black-box analysis.
          </p>
          <Link href="/countries" className="mt-3 inline-block text-sm underline">
            read today&apos;s digest →
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="mb-2 font-semibold">Scored against experts, daily</h3>
          <p className="text-sm text-gray-500">
            {stats.runs.toLocaleString()} validation runs against ISW&apos;s daily
            assessments. Coverage, misses, and leads — published, not hidden.
          </p>
          <Link href="/scoreboard" className="mt-3 inline-block text-sm underline">
            see how we score →
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800">
        BNOW.NET · OSINT data intelligence · analysis derived from open sources; source
        ratings are statistical artifacts of citation behavior, not endorsements.
        <Link href="/health" className="ml-2 underline">status</Link>
      </footer>
    </main>
  );
}
