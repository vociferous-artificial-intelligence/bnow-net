// WS-7.3 purity pins. The descriptor and summary templates are presentation over data the
// pipeline already produced (PLAN-WS-7 §1: legibility before new judgment), so they must be
// unable to reach a database, a provider, the spend machinery or the environment. Two
// complementary guards, the shape of `src/lib/conflicts/matcher-import-hygiene.test.ts`:
//
//   1. SOURCE SCAN — no env read, no db/provider/usage import, no fetch, no clock. The clock
//      matters as much as the network here: a descriptor whose text depends on when it was
//      rendered is not reproducible, and a citation a customer cannot reproduce is worthless.
//   2. BLANKED-ENV IMPORT — the module graph imports and RENDERS with every provider, spend
//      and database variable deleted. Import-time coupling anywhere in the transitive graph
//      (the templates import the shared evidence model and the source-mix constant) fails here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const TRADECRAFT_MODULES = ["descriptor.ts", "source-summary.ts", "crosswalk.ts"] as const;

const FORBIDDEN_SOURCE = [
  /process\.env/,
  /from\s+["']openai["']/,
  /from\s+["']@anthropic/,
  /from\s+["']@\/db/,
  /from\s+["'].*\/usage\//,
  /\brequire\s*\(/,
  /\bfetch\s*\(/,
  /new Date\s*\(/,
  /Date\.now\s*\(/,
] as const;

describe("tradecraft module purity", () => {
  for (const file of TRADECRAFT_MODULES) {
    it(`${file} reads no env, no database, no provider, no spend ledger and no clock`, () => {
      const source = readFileSync(join(process.cwd(), "src", "lib", "tradecraft", file), "utf8");
      for (const pattern of FORBIDDEN_SOURCE) {
        expect(pattern.test(source), `${file} matches forbidden ${String(pattern)}`).toBe(false);
      }
    });
  }

  it("renders both templates under a fully blanked environment", async () => {
    const BLANKED = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "LLM_SPRINT_USD_CAP",
      "LLM_DIGEST_USD_CAP",
      "LLM_DISABLE",
      "ANALYSIS_PROVIDER",
    ] as const;
    const saved = new Map<string, string | undefined>();
    for (const key of BLANKED) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    try {
      vi.resetModules();
      const [{ describeSource }, { summarizeDigestSources }] = await Promise.all([
        import("./descriptor"),
        import("./source-summary"),
      ]);
      const descriptor = describeSource(
        {
          canonicalUrl: "https://example.org/desk",
          domain: "example.org",
          platform: "independent_media",
          status: "active",
          decayed: false,
        },
        {
          citationCount: 2,
          firstCitedReportDate: "2026-01-01",
          lastCitedReportDate: "2026-02-01",
          hedging: { confirmed: 1, assessed: 0, unknown: 1, claimed: 0, unverified: 0 },
        },
        { kind: "theater", theater: "ru" },
      );
      expect(descriptor.text).toContain("Cited in the ISW Russian Offensive Campaign Assessment");

      const summary = summarizeDigestSources(
        [
          {
            hedging: "confirmed",
            docs: [
              {
                docId: 1,
                url: "https://example.org/a",
                title: null,
                adapter: "rss",
                sourceId: 1,
                sourceName: "Example News",
                sourceKey: "https://example.org",
                sourceDomain: "example.org",
                platform: "independent_media",
                reliability: 0.7,
                publishedAt: "2026-02-01T00:00:00Z",
                firstSeenAt: "2026-02-01T01:00:00Z",
              },
            ],
          },
        ],
        null,
      );
      expect(summary.text).toContain("This digest publishes 1 claim");
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    }
  });

  it("is reproducible: the same input renders the same text twice", async () => {
    const { summarizeDigestSources } = await import("./source-summary");
    const input = {
      hedging: "claimed",
      docs: [
        {
          docId: 7,
          url: "https://example.org/a",
          title: null,
          adapter: "telegram",
          sourceId: 4,
          sourceName: "Channel",
          sourceKey: "https://t.me/channel",
          sourceDomain: "t.me",
          platform: "telegram",
          reliability: null,
          publishedAt: null,
          firstSeenAt: "2026-02-01T01:00:00Z",
        },
      ],
    };
    expect(summarizeDigestSources([input], null).text).toBe(
      summarizeDigestSources([input], null).text,
    );
  });
});
