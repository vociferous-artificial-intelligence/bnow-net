import Link from "next/link";
import { requireUser } from "@/lib/gate";
import { askWithLimits } from "@/lib/ask/limits";
import { rawSql } from "@/db";
import { getT } from "@/i18n/server";
import { AskResult, type AskResultLike, type ResolvedClaim } from "./ask-result";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Which Russian officials were prosecuted recently?",
  "What is happening with Iran's nuclear enrichment?",
  "Which entities are sanctioned and under pressure?",
  "What strikes were reported in Ukraine this week?",
];

async function runQuery(formData: FormData) {
  "use server";
  const q = String(formData.get("question") ?? "").trim().slice(0, 400);
  const { redirect } = await import("next/navigation");
  redirect(`/ask?q=${encodeURIComponent(q)}`);
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const { q } = await searchParams;
  const question = q?.slice(0, 400);
  const result =
    question && question.length >= 3
      ? await askWithLimits(question, user?.email ?? null)
      : null;

  // resolve cited + related claim ids → source links for click-through. One query for
  // the union of both id sets (relatedClaimIds is a v2-only field, absent on the
  // legacy shape — defensive ?? [] per the frozen contract, src/lib/ask/types.ts).
  let cited: ResolvedClaim[] = [];
  let related: ResolvedClaim[] = [];
  if (result) {
    const relatedIds = (result as AskResultLike).relatedClaimIds ?? [];
    const allIds = [...new Set([...result.citedClaimIds, ...relatedIds])];
    if (allIds.length > 0) {
      const rows = (await rawSql.query(
        `SELECT cl.id, cl.text, c.iso2, cl.claim_date::text AS date
         FROM claims cl JOIN countries c ON c.id = cl.country_id
         WHERE cl.id = ANY($1::int[])`,
        [allIds],
      )) as ResolvedClaim[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      cited = result.citedClaimIds
        .map((id) => byId.get(id))
        .filter((c): c is ResolvedClaim => !!c);
      related = relatedIds.map((id) => byId.get(id)).filter((c): c is ResolvedClaim => !!c);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · ask the data
      </p>
      <h1 className="mb-1 text-2xl font-bold">{t("ask.title")}</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">
        Ask in plain language. Answers are built strictly from our claim database and cite
        the evidence — every fact links back to its source documents. No outside knowledge,
        no speculation.
      </p>

      <form action={runQuery} className="mb-4 flex gap-2">
        <input
          name="question"
          defaultValue={question ?? ""}
          placeholder={t("ask.placeholder")}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {t("ask.submit")}
        </button>
      </form>

      {!result && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Link
              key={e}
              href={`/ask?q=${encodeURIComponent(e)}`}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {e}
            </Link>
          ))}
        </div>
      )}

      {result && <AskResult result={result} cited={cited} related={related} t={t} />}
    </main>
  );
}
