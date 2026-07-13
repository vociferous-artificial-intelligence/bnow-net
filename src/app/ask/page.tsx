import Link from "next/link";
import { requireAcceptedUser } from "@/lib/gate";
import { getT } from "@/i18n/server";
import { dict } from "@/i18n/dictionaries";
import { AskForm } from "./ask-form";

export const dynamic = "force-dynamic";

// Money-path rule (OPEN-TASKS #48 + the double-billing architecture bug it sits on
// top of): GET /ask?q=... PREFILLS the input and NEVER executes the paid pipeline —
// refresh, back-navigation, shared links, and prefetchers must never re-bill. The
// paid pipeline (askWithLimits) runs ONLY from the askAction server action
// (./actions.ts), fired on explicit form submission. This file must never import
// askWithLimits.

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAcceptedUser(); // page gate matches the layout + action + API (acceptance too)
  const t = await getT();
  const { q } = await searchParams;
  const initialQuestion = q?.slice(0, 400) ?? "";

  // English is the authoritative key superset (dictionaries.ts) — enumerate its
  // `ask.*` keys and resolve each through the active-locale t() so a client
  // component can render them without needing a function prop from this server
  // component.
  const askStrings: Record<string, string> = {};
  for (const key of Object.keys(dict("en"))) {
    if (key.startsWith("ask.")) askStrings[key] = t(key);
  }

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · ask the data
      </p>
      <h1 className="mb-1 text-2xl font-bold">{t("ask.title")}</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">
        Ask in plain language. Answers are built strictly from our claim database and cite
        the evidence — every fact links back to its source documents. No outside knowledge,
        no speculation.
      </p>

      <AskForm initialQuestion={initialQuestion} strings={askStrings} />
    </main>
  );
}
