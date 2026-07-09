import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { currentUserEmail } from "@/lib/session";
import { getLocale } from "@/i18n/server";
import { localesByPriority, makeT } from "@/i18n/dictionaries";
import { buildSiteNav } from "@/lib/nav/site-nav";
import { SiteHeaderView } from "./site-header-view";

/**
 * The one global header. Mounted in the root layout, so it renders on every route;
 * the view hides itself on /admin, which has its own chrome.
 *
 * Reading the session here is free: `next build` reports every route as `ƒ` (dynamic),
 * so there is no static or ISR output to invalidate. See
 * docs/reviews/NAV-RESTRUCTURE-REVIEW.md for the rendering decision.
 */
export async function SiteHeader() {
  const locale = await getLocale();
  const t = makeT(locale);
  const email = await currentUserEmail();
  const nav = buildSiteNav(t, { signedIn: email !== null, email });

  async function signOutAction() {
    "use server";
    await signOut({ redirect: false });
    redirect("/");
  }

  return (
    <SiteHeaderView
      nav={nav}
      locale={locale}
      locales={localesByPriority()}
      signOutAction={signOutAction}
      labels={{
        language: t("nav.language"),
        account: t("nav.account"),
        signOut: t("nav.signout"),
        signIn: t("auth.signin"),
        menu: t("nav.menu"),
        close: t("nav.close"),
        mainNav: t("nav.main"),
      }}
    />
  );
}
