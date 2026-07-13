import Link from "next/link";
import { OPERATOR, POLICY_EFFECTIVE_DATE_DISPLAY } from "@/lib/legal/policies";

// Shared chrome for the public legal documents (/privacy, /terms). Provides the "Back to
// BNOW.NET" link, the prominent version + effective-date header, the cross-link to the sibling
// document, and the legal/privacy contact as a mailto — so each page file carries only its body
// copy. The document body itself is authoritative English legal text (content, not chrome), so
// it is not routed through i18n — same posture as digest/claim content.
//
// Depends on NO database query: these pages must render for anonymous visitors and never 500.

const CONTACT_HREF = `mailto:${OPERATOR.legalContact}`;

export function LegalDocument({
  title,
  version,
  intro,
  crossLink,
  children,
}: {
  title: string;
  version: string;
  /** One-line lede shown under the header (optional). */
  intro?: string;
  /** The sibling legal document to cross-link to. */
  crossLink: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-8 text-sm text-gray-500">
        <Link href="/" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Back to BNOW.NET
        </Link>
      </p>

      <article className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-200">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
          Version {version} · Effective date: {POLICY_EFFECTIVE_DATE_DISPLAY}
        </p>
        {intro && <p className="mt-4 text-gray-600 dark:text-gray-300">{intro}</p>}
        <div className="mt-8 space-y-6">{children}</div>
      </article>

      {/* Related-document links — a <nav>, not a <footer>, so the global SiteFooter remains the
          single page footer landmark. */}
      <nav
        aria-label="Related legal documents"
        className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-500 dark:border-gray-800"
      >
        <Link
          href={crossLink.href}
          className="underline hover:text-gray-700 dark:hover:text-gray-300"
        >
          {crossLink.label}
        </Link>
        {" · "}
        <a href={CONTACT_HREF} className="underline hover:text-gray-700 dark:hover:text-gray-300">
          {OPERATOR.legalContact}
        </a>
      </nav>
    </main>
  );
}

// ---- Typographic primitives (no @tailwindcss/typography plugin in this project) ----

/** A numbered/titled section. `id` anchors deep links; the heading is a real <h2>. */
export function LegalSection({ id, heading, children }: {
  id?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{heading}</h2>
      {children}
    </section>
  );
}

export function LegalSubheading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{children}</h3>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-700 dark:text-gray-300">{children}</p>;
}

export function LegalUL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1 pl-6 text-gray-700 dark:text-gray-300">{children}</ul>
  );
}

export function LegalContactBlock({ heading }: { heading?: string }) {
  return (
    <div className="text-gray-700 dark:text-gray-300">
      {heading && <p>{heading}</p>}
      <p className="mt-1">
        <a href={CONTACT_HREF} className="underline hover:text-gray-900 dark:hover:text-white">
          {OPERATOR.legalContact}
        </a>
      </p>
      <p className="mt-1">BNOW.NET</p>
      <p>{OPERATOR.attribution}</p>
      <p>{OPERATOR.location}</p>
    </div>
  );
}
