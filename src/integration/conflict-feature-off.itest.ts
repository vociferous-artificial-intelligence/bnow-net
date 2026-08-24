// Phase 6 conflict surfaces — production-build HTTP body tests (prompt §14):
//
// 1. FEATURE OFF (flag ABSENT — the deployment default): every conflict route
//    must surface NO conflict content in any response body — bare GET, RSC: 1
//    GET, anonymous AND authenticated-accepted — statuses deliberately not
//    trusted (the authz-page-gate lesson: the leaking response was a 307).
// 2. FEATURE ON (CONFLICTS_UI=1 injected EPHEMERALLY into the spawned server
//    process only — never persisted, never written to any env file): the
//    GATED evidence route leaks no published claim text to anonymous bare/RSC
//    requests (ruling 21 + the contract §11 access-tier pin), the anonymous
//    teaser pages render counts/labels but never claim text, and the accepted
//    positive control DOES see the claim text (so a broken server can never
//    pass vacuously). Reference-takeaway prose must appear in NO body at all,
//    including the positive control (ruling 1 analog for the synthetic corpus).
//
// WHY THE GATED CONFLICT ROUTE IS NOT A ROW IN authz-page-gate.itest.ts:
// that harness boots its server with the conflict flag ABSENT (its ten routes
// must stay graded under the production-default env), so its positive control
// (200 + token) can never pass for a feature-off conflict route. The same
// three assertions (anon bare, anon RSC, accepted positive control, asserted
// on the BODY) run here instead, under the flag-on server — see "feature on".
//
// One production build serves both phases: every conflict page is
// force-dynamic and reads the flag per request, so the flag state is a server
// env concern, not a build artifact.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
import { runMigrations } from "../../scripts/migrations-lib";

const URL_ = process.env.INTEGRATION_DATABASE_URL;
if (!URL_) {
  throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
}
process.env.DATABASE_URL = URL_;

// Same layered cost safety as authz-page-gate.itest.ts: keys BLANKED (not
// deleted) in the child so .env.local cannot repopulate them, plus
// LLM_DISABLE=1. Every conflict route reads committed fixture JSON only — no
// provider call exists on any path this suite exercises.
const PAID_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "X_API_KEY",
  "OPENSANCTIONS_API_KEY",
  "POSTMARK_SERVER_TOKEN",
  "RESEND_API_KEY",
] as const;
for (const k of PAID_KEYS) delete process.env[k];

const PORT = 3134;
const BASE = `http://127.0.0.1:${PORT}`;
const USER_EMAIL = "conflict-itest-user@leakprobe.test";
const USER_ID = "conflict-itest-user";
const SESSION_TOKEN = "conflict-itest-session-token-3134";

// Published claim text from the frozen fixture corpus (roca-ua-only-001b,
// claim 9001): renders ONLY on the gated evidence view, flag on, accepted.
const CLAIM_TOKEN = "reportedly repelled Russian mechanized assaults";
// Reference-takeaway prose from the same scenario (unit u0): must appear in
// NO response body under ANY flag/auth state — reference prose never renders.
const UNIT_TOKEN = "retained their positions along the Oskil riverbank";
// Teaser-tier tokens: prove the flag-on teaser actually rendered.
const TEASER_TOKEN = "Key Takeaway benchmark coverage";

// Every token that identifies conflict content; ALL must be absent from every
// feature-off body.
// the ruling-3 disclosure heading — absent from every feature-OFF body
// (it is a CONFLICT_TOKEN below) and REQUIRED in every flag-ON teaser body
const SYNTHETIC_BANNER_TOKEN = "Synthetic review corpus";

const CONFLICT_TOKENS = [
  TEASER_TOKEN,
  "Iran and Regional Conflict",
  "Russia–Ukraine War",
  SYNTHETIC_BANNER_TOKEN,
  CLAIM_TOKEN,
  UNIT_TOKEN,
] as const;

const ROUTES = [
  "/conflicts",
  "/conflicts/russia-ukraine",
  "/conflicts/iran-regional",
  "/conflicts/russia-ukraine/benchmark/roca-ua-only-001b",
  "/conflicts/iran-regional/benchmark/iran-gulf-unavailable-010b",
  "/conflicts/russia-ukraine/benchmark/roca-ua-only-001b/evidence",
] as const;

const TEASER_ROUTES = ROUTES.filter((r) => !r.endsWith("/evidence"));
const EVIDENCE_ROUTE = "/conflicts/russia-ukraine/benchmark/roca-ua-only-001b/evidence";

let pool: Pool;
let server: ChildProcess | null = null;
let serverLog = "";
const NEXT_ENV_DTS = join(process.cwd(), "next-env.d.ts");
let nextEnvSnapshot: string | null = null;

function runNext(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.cwd(), "node_modules", ".bin", "next"), args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout!.on("data", (d) => (out += String(d)));
    child.stderr!.on("data", (d) => (out += String(d)));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`next ${args.join(" ")} exited ${code}:\n${out.slice(-4000)}`)),
    );
  });
}

function serverEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...Object.fromEntries(PAID_KEYS.map((k) => [k, ""])),
    NODE_ENV: "production",
    DATABASE_URL: URL_,
    FEATURE_AUTH_GATE: "true",
    AUTH_SECRET: "conflict-feature-off-itest-secret",
    LLM_DISABLE: "1",
    // CONFLICTS_UI is deliberately NOT set here: the base env is the
    // production default (flag absent). Phase 2 injects it EPHEMERALLY via
    // `extra` on the spawned process only.
    ...extra,
  };
}

async function assertPortFree(): Promise<void> {
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return;
  }
  throw new Error(
    `port ${PORT} already answers HTTP — an orphaned "next start" is probably still running. ` +
      `Kill it before re-running.`,
  );
}

async function startServer(extra: Record<string, string> = {}): Promise<void> {
  serverLog = "";
  server = spawn(
    join(process.cwd(), "node_modules", ".bin", "next"),
    ["start", "-p", String(PORT)],
    { cwd: process.cwd(), env: serverEnv(extra), stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout!.on("data", (d) => (serverLog += String(d)));
  server.stderr!.on("data", (d) => (serverLog += String(d)));
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early (${server.exitCode}):\n${serverLog.slice(-4000)}`);
    }
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`next start not ready after 90s:\n${serverLog.slice(-4000)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function stopServer(): Promise<void> {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  server = null;
  // wait for the port to actually free before a subsequent start
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1000) });
    } catch {
      return;
    }
    if (Date.now() > deadline) throw new Error("server did not release the port");
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function get(
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

const AUTH_COOKIE =
  `authjs.session-token=${SESSION_TOKEN}; __Secure-authjs.session-token=${SESSION_TOKEN}`;

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, email, email_verified, role) VALUES ($1, $2, now(), 'user')`,
      [USER_ID, USER_EMAIL],
    );
    await client.query(
      `INSERT INTO policy_acceptances (user_id, terms_version, privacy_version,
                                       adult_attested, privacy_acknowledged)
       VALUES ($1, $2, $3, true, true)`,
      [USER_ID, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    );
    await client.query(
      `INSERT INTO sessions (session_token, user_id, expires)
       VALUES ($1, $2, now() + interval '1 day')`,
      [SESSION_TOKEN, USER_ID],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ });
  await runMigrations(URL_!);
  await seed();
  await assertPortFree();
  nextEnvSnapshot = readFileSync(NEXT_ENV_DTS, "utf8");
  // ONE production build, flag absent (the deployment default). Conflict
  // pages are force-dynamic, so the flag is evaluated per request by the
  // server process env — phase 2 injects it into `next start` only.
  await runNext(["build"], serverEnv());
}, 600_000);

afterAll(async () => {
  await stopServer().catch(() => {});
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [USER_ID]); // cascades sessions+acceptances
  } finally {
    await pool.end();
    if (nextEnvSnapshot !== null && readFileSync(NEXT_ENV_DTS, "utf8") !== nextEnvSnapshot) {
      writeFileSync(NEXT_ENV_DTS, nextEnvSnapshot);
    }
  }
}, 120_000);

describe("feature OFF (flag absent — deployment default)", () => {
  beforeAll(async () => {
    await startServer();
  }, 180_000);

  afterAll(async () => {
    await stopServer();
  }, 60_000);

  for (const route of ROUTES) {
    it(`${route}: anonymous bare GET carries no conflict content`, async () => {
      const { status, body } = await get(route);
      expect([200, 307, 308, 404]).toContain(status);
      for (const token of CONFLICT_TOKENS) {
        expect(body.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });

    it(`${route}: anonymous RSC: 1 GET carries no conflict content`, async () => {
      const { status, body } = await get(route, { RSC: "1" });
      expect(status).toBeLessThan(500);
      for (const token of CONFLICT_TOKENS) {
        expect(body.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });

    it(`${route}: an ACCEPTED session gets no conflict content either (flag off is off for everyone)`, async () => {
      const { status, body } = await get(route, { cookie: AUTH_COOKIE });
      expect([200, 307, 308, 404]).toContain(status);
      for (const token of CONFLICT_TOKENS) {
        expect(body.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });
  }
});

describe("feature ON (CONFLICTS_UI=1 injected ephemerally into the server process)", () => {
  beforeAll(async () => {
    await startServer({ CONFLICTS_UI: "1" });
  }, 180_000);

  afterAll(async () => {
    await stopServer();
  }, 60_000);

  it("teaser pages render for anonymous users WITHOUT claim text or takeaway prose", async () => {
    for (const route of TEASER_ROUTES) {
      const { status, body } = await get(route);
      expect(status, route).toBe(200);
      expect(body.toLowerCase(), route).not.toContain(CLAIM_TOKEN.toLowerCase());
      expect(body.toLowerCase(), route).not.toContain(UNIT_TOKEN.toLowerCase());
    }
    // non-vacuous: the benchmark teaser really rendered its module
    const detail = await get("/conflicts/russia-ukraine/benchmark/roca-ua-only-001b");
    expect(detail.body).toContain(TEASER_TOKEN);
  });

  it("every flag-ON teaser body carries the ruling-3 synthetic-corpus disclosure", async () => {
    // the unit tests pin the banner per route; this pins it in the REAL
    // rendered HTML, so a page that renders synthetic numbers can never ship
    // without saying so (Gate-7 safety L-1)
    for (const route of TEASER_ROUTES) {
      const { body } = await get(route);
      expect(body, route).toContain(SYNTHETIC_BANNER_TOKEN);
    }
  });

  it("gated evidence route: anonymous bare GET leaks no claim text (ruling 21 + access tier)", async () => {
    const { status, body } = await get(EVIDENCE_ROUTE);
    expect([307, 308]).toContain(status); // redirect to /signin — body is the boundary
    expect(body.toLowerCase()).not.toContain(CLAIM_TOKEN.toLowerCase());
    expect(body.toLowerCase()).not.toContain(UNIT_TOKEN.toLowerCase());
  });

  it("gated evidence route: anonymous RSC: 1 GET leaks no claim text", async () => {
    const { status, body } = await get(EVIDENCE_ROUTE, { RSC: "1" });
    expect(status).toBeLessThan(500);
    expect(body.toLowerCase()).not.toContain(CLAIM_TOKEN.toLowerCase());
    expect(body.toLowerCase()).not.toContain(UNIT_TOKEN.toLowerCase());
  });

  it("gated evidence route: the accepted session sees the published claim text (positive control)", async () => {
    const { status, body } = await get(EVIDENCE_ROUTE, { cookie: AUTH_COOKIE });
    expect(status).toBe(200);
    expect(body).toContain(CLAIM_TOKEN);
    // reference-takeaway prose renders NOWHERE, even for the authorized user
    expect(body.toLowerCase()).not.toContain(UNIT_TOKEN.toLowerCase());
  });

  it("takeaway prose renders NOWHERE; claim text renders ONLY on the authorized evidence view", async () => {
    const headerSets: Array<Record<string, string> | undefined> = [
      undefined,
      { RSC: "1" },
      { cookie: AUTH_COOKIE },
    ];
    for (const route of ROUTES) {
      for (const headers of headerSets) {
        const { body } = await get(route, headers);
        const label = `${route} ${JSON.stringify(headers)}`;
        expect(body.toLowerCase(), label).not.toContain(UNIT_TOKEN.toLowerCase());
        const isAuthorizedEvidence =
          route === EVIDENCE_ROUTE && headers !== undefined && "cookie" in headers;
        if (!isAuthorizedEvidence) {
          expect(body.toLowerCase(), label).not.toContain(CLAIM_TOKEN.toLowerCase());
        }
      }
    }
  });
});
