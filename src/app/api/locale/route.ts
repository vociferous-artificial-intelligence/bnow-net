import { NextRequest, NextResponse } from "next/server";
import { parseLocaleParam } from "@/i18n/dictionaries";

// Set the locale cookie, then return the user to the page they came from. Invalid locales
// are ignored (the cookie is left untouched). The return target is constrained to the same
// origin so this can't be turned into an open redirect.
export async function GET(req: NextRequest) {
  const loc = parseLocaleParam(req.nextUrl.searchParams.get("set"));
  const res = NextResponse.redirect(safeReturnTo(req));
  if (loc) {
    res.cookies.set("locale", loc, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true, // only read server-side (getLocale); no client JS needs it
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}

// Prefer an explicit `?to=`, else the Referer, else "/". Both candidates are resolved
// against the request origin and only accepted if the RESOLVED origin matches — a plain
// prefix check is not enough because the URL parser folds "/\\host" (and other backslash
// tricks) into a protocol-relative "//host", which would otherwise redirect off-origin.
function safeReturnTo(req: NextRequest): URL {
  const origin = req.nextUrl.origin;
  for (const candidate of [req.nextUrl.searchParams.get("to"), req.headers.get("referer")]) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate, origin);
      if (u.origin === origin) return u;
    } catch {
      // malformed candidate → try the next one
    }
  }
  return new URL("/", origin);
}
