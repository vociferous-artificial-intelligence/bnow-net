import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { feedbackEmail } from "@/lib/feedback";
import { AccessForm } from "./access-form";

// Public, indexable beta access-request page — the commercial anchor of the private
// analyst beta (replaces the retired public pricing page; /pricing redirects here).
// DB-free render; the form's server action owns all persistence.

export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLocale());
  return {
    title: `${t("access.title")} | BNOW.NET`,
    description: t("access.meta_desc"),
  };
}

export default async function AccessPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const contact = feedbackEmail();

  return (
    <main id="main" className="mx-auto w-full max-w-xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · {t("access.breadcrumb")}
      </p>
      <h1 className="mb-3 text-2xl font-bold">{t("access.title")}</h1>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("access.intro")}</p>
      {/* Neutral commercial wording — the explicit "no charge" phrasing is an operator
          decision that has not been confirmed (sprint positioning rules). */}
      <p className="mb-6 text-sm text-gray-500">{t("access.no_purchase")}</p>

      <AccessForm
        labels={{
          emailLabel: t("access.email_label"),
          linkedinLabel: t("access.linkedin_label"),
          linkedinHint: t("access.linkedin_hint"),
          usecaseLabel: t("access.usecase_label"),
          usecaseHint: t("access.usecase_hint"),
          optional: t("access.optional"),
          submit: t("access.submit"),
          pending: t("access.pending"),
          successTitle: t("access.success.title"),
          successBody: t("access.success.body"),
          errEmail: t("access.err.email"),
          errLinkedin: t("access.err.linkedin"),
          errGeneric: t("access.err.generic"),
        }}
      />

      <p className="mt-6 text-xs text-gray-400">{t("access.expectation")}</p>

      {contact && (
        <p className="mt-3 text-xs text-gray-400">
          {t("access.fallback")}{" "}
          <a href={`mailto:${contact}`} className="underline">
            {contact}
          </a>
        </p>
      )}
    </main>
  );
}
