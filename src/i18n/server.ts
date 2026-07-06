import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, makeT, RTL_LOCALES, type Locale } from "./dictionaries";

// Resolve the active locale server-side: explicit cookie wins, else Accept-Language,
// else default. No route restructuring — locale is ambient via cookie.

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const fromCookie = c.get("locale")?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const h = await headers();
  const al = h.get("accept-language") ?? "";
  for (const part of al.split(",")) {
    const code = part.trim().split("-")[0].split(";")[0];
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export async function getT() {
  return makeT(await getLocale());
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
