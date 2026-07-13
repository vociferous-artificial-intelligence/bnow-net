import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { SiteFooterView } from "./site-footer-view";

/**
 * Server wrapper for the global footer: resolves the active locale and hands pre-translated
 * labels to the client view (which owns the /admin chromeless check via usePathname). Same
 * server→view split as SiteHeader. Reads no database.
 */
export async function SiteFooter() {
  const locale = await getLocale();
  const t = makeT(locale);
  return (
    <SiteFooterView
      labels={{
        navLabel: t("footer.nav_label"),
        // Reuses the existing, fully-localized site disclaimer (keeps the OSINT label literal).
        disclaimer: t("home.footer"),
        privacy: t("footer.privacy"),
        terms: t("footer.terms"),
        status: t("common.status"),
        contact: t("footer.contact"),
      }}
    />
  );
}
