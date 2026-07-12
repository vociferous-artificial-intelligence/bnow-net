import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

import robots from "./robots";
import sitemap from "./sitemap";
import { siteBaseUrl } from "@/lib/site-url";

const ORIG = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  queryMock.mockReset();
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIG;
});

// The public marketing/teaser surface that must stay crawlable + in the sitemap.
const PUBLIC = ["/", "/countries", "/scoreboard", "/pricing", "/signals", "/trade", "/critical-materials", "/datadark"];
// Routes that must be disallowed AND never appear in the sitemap.
const GATED = ["/api/", "/admin/", "/account", "/signin", "/digests/", "/ask", "/search", "/entities/", "/registry", "/middle-east", "/health"];

describe("siteBaseUrl", () => {
  it("defaults to the brand host, honoring NEXT_PUBLIC_SITE_URL and trimming a trailing slash", () => {
    expect(siteBaseUrl()).toBe("https://bnow.net");
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com/";
    expect(siteBaseUrl()).toBe("https://preview.example.com");
  });
});

describe("robots.txt policy", () => {
  const rules = () => {
    const r = robots().rules;
    return Array.isArray(r) ? r[0] : r;
  };

  it("allows the root and points at the sitemap on the canonical host", () => {
    const out = robots();
    expect(rules().allow).toBe("/");
    expect(out.sitemap).toBe("https://bnow.net/sitemap.xml");
  });

  it("disallows every gated / non-content route", () => {
    const disallow = rules().disallow as string[];
    for (const g of GATED) expect(disallow, `robots must disallow ${g}`).toContain(g);
  });

  it("does NOT disallow the public teaser pages (they carry only safe content)", () => {
    const disallow = rules().disallow as string[];
    // /signals is public teaser; /countries, /scoreboard, /pricing are marketing.
    for (const p of ["/signals", "/countries", "/scoreboard", "/pricing"]) {
      expect(disallow).not.toContain(p);
    }
  });
});

describe("sitemap.xml", () => {
  it("lists the public paths plus one entry per active theater, all absolute", async () => {
    queryMock.mockResolvedValueOnce([{ iso2: "ru" }, { iso2: "ua" }, { iso2: "ir" }, { iso2: "ae" }]);
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    for (const p of PUBLIC) {
      const want = `https://bnow.net${p === "/" ? "" : p}`;
      expect(urls, `sitemap missing ${p}`).toContain(want);
    }
    for (const iso2 of ["ru", "ua", "ir", "ae"]) {
      expect(urls).toContain(`https://bnow.net/countries/${iso2}`);
    }
    // No gated route leaks into the sitemap.
    for (const g of GATED) expect(urls.some((u) => u.includes(g))).toBe(false);
  });

  it("degrades to the static public set when the DB is unreachable", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toContain("https://bnow.net/countries");
    // no per-country entries, but no throw
    expect(entries.every((e) => !/\/countries\/[a-z]{2}$/.test(e.url))).toBe(true);
  });
});
