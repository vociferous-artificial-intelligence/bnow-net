import Link from "next/link";
import { rawSql } from "@/db";
import { computeSignals } from "@/lib/analyst/run";
import {
  collectSignalEvidenceIds, evidenceForSignal, groupEvidenceRows, toPublicSignal,
  type EvidenceClaim, type SignalEvidenceRow,
} from "@/lib/analyst/signals";
import { currentUserEmail } from "@/lib/session";
import { hasCurrentAcceptanceByEmail } from "@/lib/legal/acceptance";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { formatDate } from "@/i18n/format";
import { ClaimSources } from "@/components/claim-sources";
import { makeClaimEvidenceLabels } from "@/components/claim-evidence-labels";
import { ClaimCopyActions } from "@/components/claim-copy-actions";
import { claimCopyLabels } from "@/components/claim-copy-model";
import { brandSiteBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const SEV_STYLE: Record<string, string> = {
  elevated: "border-red-400 dark:border-red-700",
  watch: "border-amber-400 dark:border-amber-700",
  info: "border-gray-300 dark:border-gray-700",
};
const SEV_BADGE: Record<string, string> = {
  elevated: "bg-red-600 text-white",
  watch: "bg-amber-500 text-white",
  info: "bg-gray-400 text-white",
};
// Same idiom as the digest page (src/app/digests/[country]/[date]/page.tsx) — kept as a
// local copy rather than a shared import: neither file is in this change's ownership set.
const HEDGE_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  assessed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  claimed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  unverified: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default async function SignalsPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const evidenceLabels = makeClaimEvidenceLabels(t);
  const copyLabels = claimCopyLabels(t);
  // /signals is a PUBLIC page (docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md §0.5,
  // D3) with a teaser-public / specifics-gated split (IA-REFINEMENT-REVIEW.md TASK 3):
  // the headline count + type is public; the `detail` specifics (named individuals,
  // suppressed-series labels, flow lists), claim text and source URLs are a gated
  // benefit. currentUserEmail() (not requireUser()) is the boundary check here on
  // purpose: requireUser()'s dev-mode FEATURE_AUTH_GATE bypass would leak the gated
  // fields to anonymous visitors whenever the gate flag is off, which is fine for the
  // *gated* pages (their layout redirects instead) but wrong for a page that has no
  // redirect at all. The gated specifics require CURRENT legal acceptance, not merely a
  // session — `accepted` gates both the evidence query below and the render, so a
  // signed-in user who has not accepted sees the same safe teaser as an anonymous one.
  const email = await currentUserEmail();
  const signedIn = email !== null;
  const accepted = email ? await hasCurrentAcceptanceByEmail(email) : false;

  let signals: Awaited<ReturnType<typeof computeSignals>> = [];
  try {
    signals = await computeSignals(new Date().toISOString());
  } catch {
    // dependencies may be empty
  }

  // One evidence query for every signal's claim ids combined (spec cap: ids <= ~60).
  let evidenceByClaim = new Map<number, EvidenceClaim>();
  if (accepted) {
    const ids = collectSignalEvidenceIds(signals);
    if (ids.length > 0) {
      try {
        const rows = (await rawSql.query(
          `SELECT cl.id AS claim_id, cl.text, cl.hedging, cl.claim_date::text AS claim_date,
                  c.iso2 AS country_iso2, c.name AS country_name,
                  dg.digest_date::text AS digest_date,
                  rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
                  rd.published_at::text AS published_at, rd.fetched_at::text AS fetched_at,
                  s.id AS source_id, s.name AS source_name,
                  s.canonical_url AS source_key, s.domain AS source_domain,
                  s.reliability_score AS reliability,
                  s.platform AS source_platform
           FROM claims cl
           JOIN countries c ON c.id = cl.country_id
           LEFT JOIN digests dg ON dg.id = cl.digest_id
           JOIN claim_sources cs ON cs.claim_id = cl.id
           JOIN raw_documents rd ON rd.id = cs.raw_document_id
           LEFT JOIN sources s ON s.id = rd.source_id
           WHERE cl.id = ANY($1::int[])
           ORDER BY cl.id, rd.id`,
          [ids],
        )) as SignalEvidenceRow[];
        evidenceByClaim = groupEvidenceRows(rows);
      } catch {
        // degrade to the count-only view rather than a full-page crash — the count
        // above already came back fine from computeSignals, only the drill-down failed
      }
    }
  }

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · {t("signals.breadcrumb")}
      </p>
      <h1 className="mb-1 text-2xl font-bold">{t("signals.title")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">{t("signals.intro")}</p>

      {signals.length === 0 ? (
        <p className="py-8 text-center text-gray-400">{t("signals.empty")}</p>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => {
            // The public projection carries only the safe teaser (severity, theater, kind,
            // headline count, evidence count). For signed-out visitors we render ONLY these
            // fields — `s.detail` (names / suppressed-series labels / flow lists) and the
            // per-claim evidence are referenced solely inside the `signedIn` branch, so they
            // never enter the server-rendered HTML for anonymous clients (data-layer
            // withholding; IA-REFINEMENT-REVIEW.md TASK 3). Signals never share a claim id.
            const pub = toPublicSignal(s);
            const claims = accepted && s.evidenceClaimIds.length > 0 ? evidenceForSignal(s, evidenceByClaim) : [];
            return (
              <div key={pub.key} className={`rounded-lg border-2 p-4 ${SEV_STYLE[pub.severity]}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${SEV_BADGE[pub.severity]}`}>
                    {pub.severity}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                    {pub.theater.toUpperCase()} · {pub.kind}
                  </span>
                  <h2 className="font-semibold">{pub.headline}</h2>
                </div>

                {accepted ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{s.detail}</p>
                    {pub.evidenceCount > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {pub.evidenceCount} {t("signals.evidence.summary")}
                        </summary>
                        <ul className="mt-2 space-y-3 border-l border-gray-200 pl-3 dark:border-gray-800">
                          {claims.map((c) => {
                            const digestDate = c.digestDate?.slice(0, 10) ?? null;
                            const claimUrl = digestDate
                              ? `${brandSiteBaseUrl()}/digests/${c.countryIso2}/${digestDate}#c${c.claimId}`
                              : null;
                            return (
                            <li key={c.claimId} className="text-sm">
                              <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${HEDGE_COLORS[c.hedging] ?? HEDGE_COLORS.unknown}`}>
                                {c.hedging}
                              </span>
                              {c.text}
                              <ClaimSources
                                docs={c.docs}
                                locale={locale}
                                labels={evidenceLabels}
                                showScores={false}
                              />
                              {digestDate && claimUrl && (
                                <ClaimCopyActions
                                  payload={{
                                    claimId: c.claimId,
                                    text: c.text,
                                    hedging: c.hedging,
                                    asOf: formatDate(locale, digestDate),
                                    countryName: c.countryName,
                                    countryIso2: c.countryIso2,
                                    claimUrl,
                                    docs: c.docs,
                                    showScores: false,
                                  }}
                                  surface="signal"
                                  locale={locale}
                                  labels={copyLabels}
                                />
                              )}
                            </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">
                    {pub.evidenceCount > 0 && (
                      <>
                        {pub.evidenceCount} {t("signals.evidence.public")} ·{" "}
                      </>
                    )}
                    {/* Anonymous → sign in; signed-in-but-not-accepted → accept the Terms. Both
                        land the specifics behind the same gate, so neither leaks. */}
                    <Link href={signedIn ? "/welcome/legal" : "/signin"} className="underline">
                      {signedIn
                        ? t("signals.evidence.accept_prompt")
                        : t("signals.evidence.signin_prompt")}
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
