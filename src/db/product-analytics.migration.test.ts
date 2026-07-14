import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "drizzle");

function migrationFor(prefix: string): string {
  const file = readdirSync(DIR).find((name) => name.startsWith(prefix) && name.endsWith(".sql"));
  if (!file) throw new Error(`no migration file starting with ${prefix}`);
  return readFileSync(join(DIR, file), "utf8");
}

describe("product analytics preference and access attribution migration (0020)", () => {
  const sql = migrationFor("0020_");

  it("adds a fail-closed preference and a database value constraint", () => {
    expect(sql).toMatch(
      /ADD\s+COLUMN\s+"analytics_preference"\s+text\s+DEFAULT\s+'unset'\s+NOT\s+NULL/i,
    );
    expect(sql).toMatch(/ADD\s+COLUMN\s+"analytics_preference_updated_at"\s+timestamp with time zone/i);
    expect(sql).toMatch(
      /CHECK\s*\(.*"analytics_preference"\s+IN\s*\('unset',\s*'granted',\s*'denied'\).*\)/i,
    );
  });

  it("adds only the approved nullable attribution fields", () => {
    for (const column of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "landing_path",
      "referrer_host",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD\\s+COLUMN\\s+"${column}"\\s+text`, "i"));
    }
  });

  it("is forward-only and stores no requester network or browser fingerprint", () => {
    expect(sql).not.toMatch(/DROP\s/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE\s/i);
    for (const forbidden of ["ip_address", "user_agent", "full_referrer", "session_token"]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
  });
});
