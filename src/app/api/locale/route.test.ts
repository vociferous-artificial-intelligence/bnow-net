import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const ORIGIN = "https://bnow.net";

function call(query: string, referer?: string) {
  const headers: Record<string, string> = {};
  if (referer) headers.referer = referer;
  return GET(new NextRequest(`${ORIGIN}/api/locale${query}`, { headers }));
}

function setCookie(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("/api/locale switcher", () => {
  it("accepts each new locale and sets the cookie", async () => {
    for (const loc of ["de", "ar", "ja", "pl", "fr"]) {
      const res = await call(`?set=${loc}`, `${ORIGIN}/pricing`);
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(setCookie(res)).toContain(`locale=${loc}`);
    }
  });

  it("still accepts the existing en and uk locales", async () => {
    expect(setCookie(await call("?set=en", `${ORIGIN}/`))).toContain("locale=en");
    expect(setCookie(await call("?set=uk", `${ORIGIN}/`))).toContain("locale=uk");
  });

  it("ignores an invalid locale (no cookie written)", async () => {
    expect(setCookie(await call("?set=zz", `${ORIGIN}/`))).not.toContain("locale=");
    expect(setCookie(await call("?set=de-DE", `${ORIGIN}/`))).not.toContain("locale=");
    expect(setCookie(await call(""))).not.toContain("locale=");
  });

  it("redirects back to the same-origin referring page", async () => {
    const res = await call("?set=fr", `${ORIGIN}/scoreboard`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/scoreboard`);
  });

  it("does NOT open-redirect off-origin (referer, ?to=, or backslash trick)", async () => {
    // cross-origin referer is dropped → home
    const r1 = await call("?set=fr", "https://evil.com/phish");
    expect(new URL(r1.headers.get("location")!).origin).toBe(ORIGIN);
    // explicit off-origin ?to= is dropped → home
    const r2 = await call("?set=fr&to=https://evil.com", `${ORIGIN}/`);
    expect(new URL(r2.headers.get("location")!).origin).toBe(ORIGIN);
    // backslash bypass "/\evil.com" folds to //evil.com — must be rejected
    const r3 = await call(`?set=fr&to=${encodeURIComponent("/\\evil.com")}`, `${ORIGIN}/`);
    expect(new URL(r3.headers.get("location")!).origin).toBe(ORIGIN);
    // protocol-relative
    const r4 = await call(`?set=fr&to=${encodeURIComponent("//evil.com")}`, `${ORIGIN}/`);
    expect(new URL(r4.headers.get("location")!).origin).toBe(ORIGIN);
  });

  it("honors an explicit same-origin ?to= path", async () => {
    const res = await call("?set=de&to=/registry", `${ORIGIN}/`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/registry`);
  });
});
