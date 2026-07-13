"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPERATOR } from "@/lib/legal/policies";

export interface FooterLabels {
  navLabel: string;
  disclaimer: string;
  privacy: string;
  terms: string;
  status: string;
  contact: string;
}

/** Routes that render their own chrome and must not inherit the marketing footer (mirrors
 *  site-header-view.tsx's isChromeless — the admin surface has its own layout). */
function isChromeless(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

const CONTACT_HREF = `mailto:${OPERATOR.legalContact}`;

/**
 * The one global footer. Mounted in the root layout so every ordinary page carries persistent
 * links to the Privacy Notice, Terms of Use, status page, and the legal contact. The home page's
 * former inline footer was removed so this does not duplicate on `/`.
 */
export function SiteFooterView({ labels }: { labels: FooterLabels }) {
  const pathname = usePathname() ?? "/";
  if (isChromeless(pathname)) return null;

  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-gray-400">
        <p className="max-w-3xl">{labels.disclaimer}</p>
        <nav
          aria-label={labels.navLabel}
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <Link href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-300">
            {labels.privacy}
          </Link>
          <Link href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-300">
            {labels.terms}
          </Link>
          <Link href="/health" className="underline hover:text-gray-600 dark:hover:text-gray-300">
            {labels.status}
          </Link>
          <a href={CONTACT_HREF} className="underline hover:text-gray-600 dark:hover:text-gray-300">
            {labels.contact}
          </a>
        </nav>
        <p className="mt-3">
          {OPERATOR.attribution} · {OPERATOR.location}
        </p>
      </div>
    </footer>
  );
}
