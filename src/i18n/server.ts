import { cookies, headers } from "next/headers";
import { resolveLocale, makeT, RTL_LOCALES, type Locale } from "./dictionaries";

// Resolve the active locale server-side. Priority (see resolveLocale): an explicit
// selection wins via the "locale" cookie the /api/locale switcher sets, else the browser's
// Accept-Language, else the default. No route restructuring — locale is ambient.

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const h = await headers();
  return resolveLocale({
    cookie: c.get("locale")?.value ?? null,
    acceptLanguage: h.get("accept-language"),
  });
}

export async function getT() {
  return makeT(await getLocale());
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
