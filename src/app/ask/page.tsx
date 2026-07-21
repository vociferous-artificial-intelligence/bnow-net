import Link from "next/link";
import { requireAcceptedUser } from "@/lib/gate";
import { getLocale } from "@/i18n/server";
import { dict, makeT } from "@/i18n/dictionaries";
import { makeClaimEvidenceLabels } from "@/components/claim-evidence-labels";
import { claimCopyLabels } from "@/components/claim-copy-model";
import { isAskIntentId } from "@/lib/ask/intent";
import { progressiveAllowedFor } from "@/lib/ask/features";
import { AskForm } from "./ask-form";

export const dynamic = "force-dynamic";

// Phase 0 (2026-07-19): the paid pipeline runs from this page's server action, and a
// server action POSTs to its page's own route — Next folds this segment's config into
// that route's function config (verified against next@16.2.10
// dist/build/utils.js reduceAppConfig), so this pin bounds askAction invocations.
// 60s matches the JSON route's existing pin and covers the measured p50 ≈ 10–13s with
// tail ≈ 30s. Without it a slow run dies at the deployment default with no usage row
// (the Phase 1 run-persistence fix needs this floor under it).
export const maxDuration = 60;

// Money-path rule (OPEN-TASKS #48 + the double-billing architecture bug it sits on
// top of): GET /ask?q=... PREFILLS the input and NEVER executes the paid pipeline —
// refresh, back-navigation, shared links, and prefetchers must never re-bill. The
// paid pipeline (askWithLimits) runs ONLY from the askAction server action
// (./actions.ts), fired on explicit form submission. This file must never import
// askWithLimits.
//
// ?intent= does not weaken that rule. It is an opaque id naming a single-use,
// same-tab sessionStorage entry written by the home Ask box; this render only
// bounds it and hands it to AskForm, which may then press the form's own submit
// button once. Rendering ANY GET here — intent present, replayed, shared, or
// forged — stays free and side-effect-free (src/lib/ask/intent.ts).

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; intent?: string }>;
}) {
  const user = await requireAcceptedUser(); // page gate matches the layout + action + API (acceptance too)
  const locale = await getLocale();
  const t = makeT(locale);
  const { q, intent } = await searchParams;
  const initialQuestion = q?.slice(0, 400) ?? "";
  // Untrusted: anything that isn't a well-formed UUID becomes null and the form
  // renders exactly as it does on a bare GET.
  const askIntent = isAskIntentId(intent) ? intent : null;

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

      <AskForm
        initialQuestion={initialQuestion}
        intent={askIntent}
        // Release hardening: the server-side effective-feature resolver + the
        // per-user cohort policy decide the transport — the SAME check the
        // runs POST boundary enforces, so this prop is presentation only.
        // Off (default/rollback) keeps the server-action path byte-identical.
        progressive={progressiveAllowedFor(user?.email ?? null)}
        strings={askStrings}
        locale={locale}
        evidenceLabels={makeClaimEvidenceLabels(t)}
        copyLabels={claimCopyLabels(t)}
      />
    </main>
  );
}
