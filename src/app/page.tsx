import Link from "next/link";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

export default async function Home() {
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
      <nav className="flex items-center justify-between py-6 text-sm">
        <span className="font-bold tracking-tight">BNOW.NET</span>
        <div className="flex gap-5">
          <Link href="/countries" className="hover:underline">theaters</Link>
          <Link href="/registry" className="hover:underline">source registry</Link>
          <Link href="/scoreboard" className="hover:underline">scoreboard</Link>
          <Link href="/datadark" className="hover:underline">data-dark</Link>
          <Link href="/trade" className="hover:underline">trade-evasion</Link>
          <Link href="/signals" className="hover:underline">signals</Link>
          <Link href="/pricing" className="hover:underline">pricing</Link>
          <Link href="/signin" className="hover:underline">sign in</Link>
        </div>
      </nav>

      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Transparent source reliability ratings for conflict-zone OSINT
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
          Per-country intelligence feeds from open news, Telegram and social sources —
          scored for reliability, fused into a daily digest, and{" "}
          <strong>validated every day against expert human analysis</strong>. Every claim
          links to its evidence.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/pricing"
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            Become a founding subscriber
          </Link>
          <Link
            href="/scoreboard"
            className="rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            See the scoreboard
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">Live now: Russia · Ukraine — next: Gulf theaters</p>
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
