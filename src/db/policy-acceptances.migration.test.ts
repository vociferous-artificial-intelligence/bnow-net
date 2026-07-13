import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the append-only legal-acceptance migration (0017). Companion to migrations.test.ts,
// which owns the claim-source trigger invariant — this file only asserts the new table and
// must not weaken that one (it never touches 9999).

const DIR = join(process.cwd(), "drizzle");

function migrationFor(prefix: string): { file: string; sql: string } {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix) && f.endsWith(".sql"));
  if (!file) throw new Error(`no migration file starting with ${prefix}`);
  return { file, sql: readFileSync(join(DIR, file), "utf8") };
}

describe("policy_acceptances migration (0017)", () => {
  const { sql } = migrationFor("0017_");

  it("creates the policy_acceptances table", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"policy_acceptances"/i);
  });

  it("makes accepted_at database-generated (DEFAULT now())", () => {
    expect(sql).toMatch(/"accepted_at"\s+timestamp[^,]*DEFAULT\s+now\(\)\s+NOT\s+NULL/i);
  });

  it("stores the two attestation booleans and the acceptance method", () => {
    expect(sql).toMatch(/"adult_attested"\s+boolean\s+NOT\s+NULL/i);
    expect(sql).toMatch(/"privacy_acknowledged"\s+boolean\s+NOT\s+NULL/i);
    expect(sql).toMatch(/"acceptance_method"\s+text\s+DEFAULT\s+'first_login_clickwrap'/i);
  });

  it("keys acceptance to users.id with cascade delete (not email)", () => {
    expect(sql).toMatch(/"user_id"\s+text\s+NOT\s+NULL/i);
    expect(sql).toMatch(/REFERENCES\s+"public"\."users"\("id"\)\s+ON\s+DELETE\s+cascade/i);
  });

  it("enforces one row per (user, terms_version, privacy_version) — idempotency", () => {
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?"policy_acceptances_user_versions_uq"[^;]*"user_id","terms_version","privacy_version"/i,
    );
  });

  it("stores NO IP / user-agent / birth-date / token columns (minimal evidence)", () => {
    for (const forbidden of ["ip_address", "user_agent", "birth", "session_token", "ip "]) {
      expect(sql.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("is append-only: no UPDATE or DELETE of acceptance rows in the migration", () => {
    expect(sql).not.toMatch(/UPDATE\s+"?policy_acceptances/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"?policy_acceptances/i);
  });
});
