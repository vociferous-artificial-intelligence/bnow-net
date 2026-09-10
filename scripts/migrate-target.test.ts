import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertMigrationTarget, migrationEndpointId } from "./migrations-lib";

// OPEN-TASKS #112. `scripts/migrate.ts` reads DATABASE_URL_UNPOOLED ?? DATABASE_URL,
// and scripts/env.ts loads .env.local with dotenv, which SETS an absent variable and
// declines to overwrite a present one. The documented fork idiom
// `env -u DATABASE_URL_UNPOOLED DATABASE_URL="$FORK" npx tsx scripts/migrate.ts`
// therefore had the unpooled name handed back from .env.local and selected
// PRODUCTION. On 2026-09-07 the only thing that stopped it was a stale password
// (#80) — safety by accident.

const PROD = "postgres://u:p@ep-prod-aaa-pooler.us-east-2.aws.neon.tech/neondb";
const PROD_DIRECT = "postgres://u:p@ep-prod-aaa.us-east-2.aws.neon.tech/neondb";
const FORK = "postgres://u:p@ep-fork-bbb-pooler.us-east-2.aws.neon.tech/neondb";

describe("migrationEndpointId", () => {
  it("folds the Neon connection-pooler suffix, so one database's two DSNs agree", () => {
    expect(migrationEndpointId(PROD)).toBe(migrationEndpointId(PROD_DIRECT));
    expect(migrationEndpointId(PROD)).toBe("ep-prod-aaa.us-east-2.aws.neon.tech");
  });

  it("distinguishes different endpoints, and folds only a TRAILING -pooler", () => {
    expect(migrationEndpointId(PROD)).not.toBe(migrationEndpointId(FORK));
    expect(migrationEndpointId("postgres://u:p@ep-pooler-x.neon.tech/db")).toBe(
      "ep-pooler-x.neon.tech",
    );
  });

  it("an unparseable DSN can never equal a real host, so garbage compares as a mismatch", () => {
    expect(migrationEndpointId("not a url")).toBe("not a url");
    expect(migrationEndpointId("")).toBe("");
  });
});

describe("assertMigrationTarget (#112 boundary guard)", () => {
  it("refuses when the two names address different endpoints", () => {
    expect(() => assertMigrationTarget(FORK, PROD)).toThrow(/name DIFFERENT endpoints/);
    // the message names which one WOULD have been migrated — the unpooled one
    expect(() => assertMigrationTarget(FORK, PROD)).toThrow(/"ep-prod-aaa[^"]*" would be migrated/);
    expect(() => assertMigrationTarget(FORK, PROD)).toThrow(/OPEN-TASKS #112/);
  });

  it("allows the correct form: BOTH names set to the same target", () => {
    expect(() => assertMigrationTarget(FORK, FORK)).not.toThrow();
    expect(() => assertMigrationTarget(PROD, PROD_DIRECT)).not.toThrow(); // pooled + direct, one DB
  });

  it("compares ENDPOINTS, not databases: same endpoint, different database name, passes", () => {
    // Stated as a known bound rather than left to be discovered. A fork and
    // production are always different endpoints, so this is outside #112's hazard.
    expect(() =>
      assertMigrationTarget(
        "postgres://u:p@ep-prod-aaa-pooler.us-east-2.aws.neon.tech/neondb",
        "postgres://u:p@ep-prod-aaa.us-east-2.aws.neon.tech/scratch",
      ),
    ).not.toThrow();
  });

  it("allows a single name in play — there is nothing to disagree about", () => {
    expect(() => assertMigrationTarget(FORK, undefined)).not.toThrow();
    expect(() => assertMigrationTarget(undefined, PROD)).not.toThrow();
    expect(() => assertMigrationTarget("", PROD)).not.toThrow();
  });
});

describe("scripts/migrate.ts refuses at the boundary, before any connection", () => {
  // Names are SET, never unset: unsetting is the exact failure mode (#112).
  const run = (env: Record<string, string>) =>
    spawnSync(join(process.cwd(), "node_modules", ".bin", "tsx"), [join(process.cwd(), "scripts", "migrate.ts")], {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, ...env },
    });

  it("exits non-zero on a mismatch and never opens a connection", () => {
    const r = run({ DATABASE_URL: FORK, DATABASE_URL_UNPOOLED: PROD });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    expect(r.status).not.toBe(0);
    expect(out).toContain("name DIFFERENT endpoints");
    // it refused BEFORE the runner: no CREATE TABLE, no driver error, no DNS failure
    expect(out).not.toMatch(/applying \d|migrations up to date|ENOTFOUND|password authentication/);
  });
});
