import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("crawl policy", () => {
  const rules = robots().rules as { allow: string; disallow: string[] };

  it("blocks the gated conflict evidence tier but not the public teaser pages", () => {
    // the evidence route renders published digest CLAIM TEXT behind
    // requireAcceptedUser; the teaser pages above it are public when the flag
    // is on and must stay crawlable (feature.ts's feature-off contract)
    expect(rules.disallow).toContain("/conflicts/*/benchmark/*/evidence");
    expect(rules.disallow).not.toContain("/conflicts");
    expect(rules.disallow).not.toContain("/conflicts/");
  });

  it("still blocks every previously gated surface", () => {
    for (const path of ["/api/", "/admin/", "/digests/", "/ask", "/search", "/registry"]) {
      expect(rules.disallow, path).toContain(path);
    }
  });
});
