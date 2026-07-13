import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the private-beta access-request migration (0018). Companion to
// migrations.test.ts (which owns the claim-source trigger invariant — this file
// never touches 9999). The extension must stay strictly additive: old
// subscribe_intents rows and the plans FK are preserved.

const DIR = join(process.cwd(), "drizzle");

function migrationFor(prefix: string): { file: string; sql: string } {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix) && f.endsWith(".sql"));
  if (!file) throw new Error(`no migration file starting with ${prefix}`);
  return { file, sql: readFileSync(join(DIR, file), "utf8") };
}

describe("subscribe_intents beta-request migration (0018)", () => {
  const { sql } = migrationFor("0018_");

  it("adds the four nullable-or-defaulted columns", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+"linkedin_url"\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+"use_case"\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+"request_status"\s+text\s+DEFAULT\s+'new'\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+"source"\s+text/i);
  });

  it("is strictly additive: no DROP/ALTER-of-existing/UPDATE/DELETE", () => {
    expect(sql).not.toMatch(/DROP/i);
    expect(sql).not.toMatch(/UPDATE\s/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    // Every statement is an additive ALTER TABLE … ADD COLUMN on subscribe_intents.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const st of statements) {
      expect(st).toMatch(/^ALTER\s+TABLE\s+"subscribe_intents"\s+ADD\s+COLUMN/i);
    }
  });

  it("stores no requester network/agent metadata (minimal collection)", () => {
    for (const forbidden of ["ip_address", "user_agent", "ip "]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
  });
});
