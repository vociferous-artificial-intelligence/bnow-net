import { NextRequest, NextResponse } from "next/server";
import { isLocale } from "@/i18n/dictionaries";

// Set the locale cookie, then return to the referring page.
export async function GET(req: NextRequest) {
  const loc = req.nextUrl.searchParams.get("set");
  const back = req.headers.get("referer") ?? "/";
  const res = NextResponse.redirect(back);
  if (isLocale(loc ?? undefined)) {
    res.cookies.set("locale", loc!, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
