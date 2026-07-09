"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LocaleMeta } from "@/i18n/dictionaries";
import {
  canonicalSection,
  isCurrentPage,
  localeSwitchHref,
  type NavEntry,
  type SiteNav,
} from "@/lib/nav/site-nav";
import { FOCUS_RING, NavDropdown, NavMenuAnchor, NavMenuButton, NavMenuLink } from "./nav-dropdown";

export interface HeaderLabels {
  language: string;
  account: string;
  signOut: string;
  signIn: string;
  menu: string;
  close: string;
  /** Landmark name for the <nav> element; screen readers append the role. */
  mainNav: string;
}

/** Routes that render their own chrome and must not inherit the marketing header. */
function isChromeless(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function SiteHeaderView({
  nav,
  locale,
  locales,
  labels,
  signOutAction,
}: {
  nav: SiteNav;
  locale: string;
  locales: LocaleMeta[];
  labels: HeaderLabels;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const section = canonicalSection(pathname);

  // Same reason as NavDropdown: this header survives navigation, so the sheet must be
  // dismissed on a route change — and dismissed for good, not merely hidden until the
  // user navigates back to the page they opened it on.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  const closeSheet = (returnFocus: boolean) => {
    setMobileOpen(false);
    if (returnFocus) hamburgerRef.current?.focus();
  };

  useEffect(() => {
    if (!mobileOpen) return;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden"; // aria-modal must not lie: no background scroll
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      hamburgerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen]);

  // ...nor may focus escape it.
  const onSheetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>("a[href], button");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (isChromeless(pathname)) return null;

  const pricingCta = nav.entries.find((e) => e.kind === "link" && e.id === "pricing" && e.cta);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3 text-sm">
        <Link href="/" className={`shrink-0 font-bold tracking-tight ${FOCUS_RING}`}>
          BNOW.NET
        </Link>

        {/* desktop */}
        <nav aria-label={labels.mainNav} className="hidden items-center gap-1 md:flex">
          {nav.entries.map((entry) => (
            <DesktopEntry key={entry.id} entry={entry} pathname={pathname} current={section === entry.id} />
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <AuthSlot nav={nav} labels={labels} signOutAction={signOutAction} />
          <LanguageMenu locale={locale} locales={locales} label={labels.language} />
        </div>

        {/* mobile */}
        <button
          ref={hamburgerRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="site-mobile-nav"
          aria-label={labels.menu}
          onClick={() => setMobileOpen(true)}
          className={`rounded p-1.5 md:hidden ${FOCUS_RING}`}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => closeSheet(false)}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            id="site-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label={labels.menu}
            onKeyDown={onSheetKeyDown}
            className="absolute inset-y-0 end-0 w-[min(20rem,85vw)] overflow-y-auto bg-white p-4 dark:bg-gray-950"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">BNOW.NET</span>
              <button
                ref={closeRef}
                type="button"
                aria-label={labels.close}
                onClick={() => closeSheet(true)}
                className={`rounded p-1.5 ${FOCUS_RING}`}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <nav aria-label={labels.mainNav} className="space-y-5">
              {nav.entries.map((entry) =>
                entry.kind === "link" ? (
                  <MobileLink key={entry.id} href={entry.href} label={entry.label} pathname={pathname} />
                ) : (
                  <section key={entry.id}>
                    <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {entry.label}
                    </h2>
                    <ul>
                      {entry.items.map((item) => (
                        <li key={item.id}>
                          <MobileLink href={item.href} label={item.label} pathname={pathname} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </nav>

            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
              {nav.auth.signedIn ? (
                <>
                  <p className="mb-2 truncate text-xs text-gray-500">{nav.auth.email}</p>
                  <MobileLink href={nav.auth.accountHref} label={labels.account} pathname={pathname} />
                  <form action={signOutAction}>
                    <button type="submit" className={`block py-1.5 text-sm ${FOCUS_RING}`}>
                      {labels.signOut}
                    </button>
                  </form>
                </>
              ) : (
                <MobileLink href={nav.auth.signInHref} label={labels.signIn} pathname={pathname} />
              )}
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {labels.language}
              </h2>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {locales.map((l) => (
                  <li key={l.code}>
                    <a
                      href={localeSwitchHref(l.code)}
                      hrefLang={l.code}
                      lang={l.code}
                      dir={l.dir}
                      title={l.label}
                      aria-current={l.code === locale ? "true" : undefined}
                      className={
                        l.code === locale ? "font-semibold text-blue-600" : "text-gray-500 hover:underline"
                      }
                    >
                      {l.nativeLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Signed-out mobile users still see the commercial anchor without opening the sheet. */}
      {pricingCta && (
        <div className="border-t border-gray-100 px-6 py-2 text-center md:hidden dark:border-gray-900">
          <Link href="/pricing" className={`text-sm font-semibold text-blue-600 ${FOCUS_RING}`}>
            {pricingCta.kind === "link" ? pricingCta.label : null}
          </Link>
        </div>
      )}
    </header>
  );
}

function DesktopEntry({
  entry,
  pathname,
  current,
}: {
  entry: NavEntry;
  pathname: string;
  current: boolean;
}) {
  if (entry.kind === "link") {
    const isCurrent = isCurrentPage(pathname, entry.href);
    return (
      <Link
        href={entry.href}
        aria-current={isCurrent ? "page" : undefined}
        className={
          entry.cta
            ? `ms-1 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 ${FOCUS_RING}`
            : `rounded px-2 py-1.5 hover:underline aria-[current=page]:font-semibold ${FOCUS_RING}`
        }
      >
        {entry.label}
      </Link>
    );
  }
  return (
    <NavDropdown triggerContent={entry.label} ariaLabel={entry.label} current={current}>
      {entry.items.map((item) => (
        <NavMenuLink key={item.id} href={item.href} current={isCurrentPage(pathname, item.href)}>
          {item.label}
        </NavMenuLink>
      ))}
    </NavDropdown>
  );
}

function MobileLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  return (
    <Link
      href={href}
      aria-current={isCurrentPage(pathname, href) ? "page" : undefined}
      className={`block py-1.5 text-sm aria-[current=page]:font-semibold ${FOCUS_RING}`}
    >
      {label}
    </Link>
  );
}

function AuthSlot({
  nav,
  labels,
  signOutAction,
}: {
  nav: SiteNav;
  labels: HeaderLabels;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  if (!nav.auth.signedIn) {
    return (
      <Link href={nav.auth.signInHref} className={`rounded px-2 py-1.5 hover:underline ${FOCUS_RING}`}>
        {labels.signIn}
      </Link>
    );
  }
  return (
    <NavDropdown
      align="end"
      ariaLabel={nav.auth.email ?? labels.account}
      triggerContent={
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold dark:bg-gray-800"
        >
          {nav.auth.initial}
        </span>
      }
    >
      <p role="none" className="truncate border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-900">
        {nav.auth.email}
      </p>
      <NavMenuLink href={nav.auth.accountHref}>{labels.account}</NavMenuLink>
      <form action={signOutAction}>
        <NavMenuButton>{labels.signOut}</NavMenuButton>
      </form>
    </NavDropdown>
  );
}

function LanguageMenu({
  locale,
  locales,
  label,
}: {
  locale: string;
  locales: LocaleMeta[];
  label: string;
}) {
  return (
    <NavDropdown
      align="end"
      ariaLabel={label}
      triggerContent={
        <span className="inline-flex items-center gap-1">
          <Globe aria-hidden="true" className="h-4 w-4" />
          <span className="text-xs font-medium uppercase">{locale}</span>
        </span>
      }
    >
      {locales.map((l) => (
        <NavMenuAnchor
          key={l.code}
          href={localeSwitchHref(l.code)}
          hrefLang={l.code}
          lang={l.code}
          dir={l.dir}
          title={l.label}
          aria-current={l.code === locale ? "true" : undefined}
          className={l.code === locale ? "font-semibold text-blue-600" : ""}
        >
          {l.nativeLabel}
        </NavMenuAnchor>
      ))}
    </NavDropdown>
  );
}
