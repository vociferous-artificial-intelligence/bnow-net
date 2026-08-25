import type { Metadata } from "next";
import Link from "next/link";
import { LegalP, LegalSection, LegalUL } from "@/components/legal-document";
import { OPERATOR } from "@/lib/legal/policies";

// Public, anonymous, DB-free "Pricing & Refunds" page.
//
// This replaces the earlier /pricing → /access 308-redirect. It exists so BNOW.NET can be
// submitted to a payment provider (Paddle) for website verification at the direct URL
// https://bnow.net/pricing. It is DELIBERATELY absent from the header, footer, nav model, and
// sitemap — /access remains the in-product commercial anchor (the private beta's request flow),
// and this page is supplied to the provider by direct link only.
//
// Guardrails baked in here (do not loosen without a decision-log entry):
//  - No Paddle SDK, checkout button, payment form, API call, credential, or env dependency —
//    public checkout is not enabled yet; this is verification copy, not a store.
//  - No database, session, or feature-flag read: a plain synchronous server component that is
//    statically renderable and resilient if the database is unavailable.
//  - Conservative deliverables only (no SLA / uninterrupted-availability / registry-access /
//    unlimited-usage / unsupported-theater promises), matching the Terms of Use.
//  - Authoritative English copy (content, not chrome) — same posture as /terms and /privacy, so
//    it is not routed through i18n.

const CONTACT_HREF = `mailto:${OPERATOR.legalContact}`;
const PADDLE_REFUND_POLICY = "https://www.paddle.com/legal/refund-policy";
const PADDLE_BUYER_SUPPORT = "https://paddle.net";

export const metadata: Metadata = {
  title: "Pricing & Refunds — BNOW.NET",
  description:
    "BNOW.NET subscription pricing for its OSINT and data-intelligence service, plus refund and cancellation information for purchases processed through Paddle.",
};

/** External link, safely configured (noopener/noreferrer, new tab) and identifiable to
 *  assistive technology via a visually-hidden "opens in a new tab" note. */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-gray-900 dark:hover:text-white"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function PlanCard({
  name,
  price,
  cadence,
  annual,
  tagline,
  features,
  featured = false,
}: {
  name: string;
  price: string;
  cadence: string;
  /** Optional second billing option shown under the headline price (e.g. the annual plan). */
  annual?: string;
  tagline: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        featured
          ? "border-blue-300 ring-1 ring-blue-200 dark:border-blue-800 dark:ring-blue-900/50"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{name}</h3>
      <p className="mt-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{price}</span>{" "}
        <span className="text-sm text-gray-500">{cadence}</span>
      </p>
      {annual && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{annual}</p>}
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{tagline}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <p className="mb-8 text-sm text-gray-500">
        <Link href="/" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Back to BNOW.NET
        </Link>
      </p>

      <article className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-200">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Pricing &amp; Refunds
        </h1>
        <p className="mt-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
          BNOW.NET · Subscription pricing and refund policy
        </p>
        <p className="mt-4 text-gray-600 dark:text-gray-300">
          BNOW.NET is a subscription OSINT and data-intelligence service for analysts, risk teams,
          journalists, and professional desks. This page summarizes our subscription plans and our
          refund and cancellation policy. BNOW.NET is currently an invite-only private beta, and
          public self-service checkout is not yet enabled.
        </p>

        <div className="mt-10 space-y-10">
          <LegalSection id="product" heading="What BNOW.NET provides">
            <LegalP>
              BNOW.NET collects and analyzes public-source reporting and returns analyst-facing
              intelligence for the conflict theaters we currently cover. A subscription is intended
              to provide:
            </LegalP>
            <LegalUL>
              <li>Source-linked conflict-monitoring digests for the live theaters.</li>
              <li>
                Search across the collected reporting and an evidence-linked Ask that answers from
                cited claims.
              </li>
              <li>
                Signals and validation measurements, including a public scoreboard that scores our
                digests against an expert daily assessment.
              </li>
              <li>Source-reliability and uncertainty labels on source-derived material.</li>
              <li>
                Coverage of the currently live Russia, Ukraine, and Iran theaters. Other theaters
                are shallow or not yet available.
              </li>
            </LegalUL>
            <LegalP>
              BNOW is an analytical aid, not an authoritative record. Sources, models, coverage, and
              usage limits may change, and we do not promise uninterrupted availability or a
              service-level commitment. The full description and limitations are in the{" "}
              <Link href="/terms" className="underline hover:text-gray-900 dark:hover:text-white">
                Terms of Use
              </Link>
              .
            </LegalP>
          </LegalSection>

          <LegalSection id="plans" heading="Subscription plans">
            <LegalP>
              Prices are shown in United States dollars (USD). Applicable taxes may be added at
              checkout.
            </LegalP>
            <div className="grid gap-5 sm:grid-cols-2">
              <PlanCard
                name="Standby"
                price="$400"
                cadence="/ month"
                tagline="Monitoring-oriented access for teams tracking the live theaters."
                features={[
                  "Periodic conflict-monitoring digests and indicator tracking",
                  "Public validation scoreboard",
                  "Source-reliability and uncertainty labels",
                ]}
              />
              <PlanCard
                name="Full analyst"
                price="$3,000"
                cadence="/ month"
                annual="or $19,800 / year — equivalent to $1,650 / month"
                tagline="Full analyst access for the currently live Russia, Ukraine, and Iran theaters."
                features={[
                  "Everything in Standby",
                  "Full source-linked digest and archive access for the live theaters",
                  "Search and evidence-linked Ask, subject to usage limits",
                  "Signals and validation features",
                ]}
                featured
              />
            </div>
            <LegalP>
              Public checkout is not yet enabled. You can{" "}
              <Link href="/access" className="underline hover:text-gray-900 dark:hover:text-white">
                request private-beta access
              </Link>
              . Submitting an access request expresses interest only — it does not create a paid
              subscription or authorize any charge.
            </LegalP>
          </LegalSection>

          <LegalSection id="refunds" heading="Refund and cancellation policy">
            <LegalP>
              When BNOW.NET enables self-service checkout, purchases will be processed by Paddle,
              which will act as the merchant of record for those transactions. The following
              summarizes how refunds and cancellations will work; it does not replace Paddle&apos;s
              own policy or any mandatory consumer-protection rights you have under applicable law.
            </LegalP>
            <LegalUL>
              <li>
                When Paddle checkout is enabled, Paddle acts as the merchant of record for
                self-service purchases and handles billing, receipts, and payment support.
              </li>
              <li>
                Refund eligibility is governed by Paddle&apos;s refund policy in effect for the
                transaction and by any applicable mandatory consumer-protection law.
              </li>
              <li>
                Unless a refund is required by law or by Paddle&apos;s policy, transactions are
                non-refundable.
              </li>
              <li>
                Paddle may consider a discretionary refund request submitted within 14 days of the
                transaction. Submitting a request does not guarantee that it will be approved.
              </li>
              <li>
                To request a refund, use the receipt or manage-subscription link from your Paddle
                order confirmation, or contact Paddle buyer support.
              </li>
              <li>
                You may cancel a recurring subscription at any time to prevent future renewals.
                Cancellation normally takes effect at the end of the current paid billing period,
                and access continues until then.
              </li>
              <li>If a transaction is refunded, the access associated with it may end.</li>
              <li>
                If you believe a purchase is affected by a material product defect, you may also
                contact BNOW.NET first at{" "}
                <a
                  href={CONTACT_HREF}
                  className="underline hover:text-gray-900 dark:hover:text-white"
                >
                  {OPERATOR.legalContact}
                </a>{" "}
                and we will work with you and, where appropriate, with Paddle.
              </li>
            </LegalUL>
            <LegalP>Refund and cancellation resources:</LegalP>
            <LegalUL>
              <li>
                <ExtLink href={PADDLE_REFUND_POLICY}>Paddle refund policy</ExtLink>
              </li>
              <li>
                <ExtLink href={PADDLE_BUYER_SUPPORT}>Paddle buyer support (paddle.net)</ExtLink>
              </li>
              <li>
                <Link href="/terms" className="underline hover:text-gray-900 dark:hover:text-white">
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="underline hover:text-gray-900 dark:hover:text-white"
                >
                  Privacy Notice
                </Link>
              </li>
            </LegalUL>
          </LegalSection>
        </div>
      </article>

      {/* Related links — a <nav>, not a <footer>, so the global SiteFooter remains the single
          page footer landmark (mirrors src/components/legal-document.tsx). */}
      <nav
        aria-label="Pricing-related links"
        className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-500 dark:border-gray-800"
      >
        <Link href="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          Terms of Use
        </Link>
        {" · "}
        <Link href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          Privacy Notice
        </Link>
        {" · "}
        <Link href="/access" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          Request access
        </Link>
        {" · "}
        <a href={CONTACT_HREF} className="underline hover:text-gray-700 dark:hover:text-gray-300">
          {OPERATOR.legalContact}
        </a>
      </nav>
    </main>
  );
}
