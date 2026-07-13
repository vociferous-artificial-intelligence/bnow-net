import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasCurrentAcceptanceByEmail } from "@/lib/legal/acceptance";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
import { safeInternalPath } from "@/lib/legal/safe-next";
import { LegalAcceptanceForm } from "./legal-form";

export const dynamic = "force-dynamic";

// Authenticated legal-acceptance gate. Reached right after a magic-link sign-in
// (/welcome/legal?next=/). Resolves the REAL session directly (not requireUser) so a genuine
// authenticated user reaches it regardless of FEATURE_AUTH_GATE. An already-accepted returning
// user is bounced straight to the safe destination; a new or out-of-date user sees the form.
export const metadata: Metadata = {
  title: "Before you continue — BNOW.NET",
  robots: { index: false, follow: false },
};

export default async function WelcomeLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const { next } = await searchParams;
  const safeNext = safeInternalPath(next);

  // Already accepted the CURRENT version pair → skip the form entirely.
  if (await hasCurrentAcceptanceByEmail(email)) redirect(safeNext);

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        Before you continue
      </h1>
      <p className="mt-4 text-gray-600 dark:text-gray-300">
        BNOW.NET is a professional OSINT and data-intelligence service. Please confirm your
        eligibility and review the documents that govern your use of the service. You can return to
        these documents at any time.
      </p>

      <div className="mt-8 rounded-xl border border-gray-200 p-6 dark:border-gray-800">
        <LegalAcceptanceForm next={safeNext} />
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Review the full{" "}
        <Link href="/terms" target="_blank" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Terms of Use (v{CURRENT_TERMS_VERSION})
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Privacy Notice (v{CURRENT_PRIVACY_VERSION})
        </Link>
        .
      </p>
    </main>
  );
}
