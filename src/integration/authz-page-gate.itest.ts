// HTTP-level authorization regression test for the layout-gate bypass.
//
// WHY THIS EXISTS (2026-08-03): authorization used to live ONLY in layout.tsx
// files. A layout is NOT an authorization boundary in the App Router — layout
// and page render as sibling tasks, so a layout's redirect()/notFound() does not
// cancel the page's render, and the page's serialized output leaks to anonymous
// callers two ways (reported confirmed against production; both reproduced here
// against a production build, and both are what this suite re-checks):
//   1. GET with header `RSC: 1` → HTTP 200 text/x-component flight payload
//      containing the fully rendered page;
//   2. bare GET → the 307 is issued, but the rendered HTML still streams as the
//      307's body (browsers discard it; curl keeps it).
// The fix gates every page component itself (first statement). Unit tests that
// invoke page components directly CANNOT catch this — only a real HTTP round
// trip against a real server exercises the flight/redirect serialization paths.
//
// Mechanics: seeds distinctive privileged tokens into the disposable Neon fork,
// does a production `next build` + `next start` against it (dev mode is unusable
// on this box — see docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md),
// then for each of the ten gated routes asserts the token appears NOWHERE in the
// anonymous response body (bare GET and RSC GET, status deliberately not trusted)
// and DOES appear for a seeded, accepted admin session (positive control, so a
// broken server or unseeded page can never pass vacuously).

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

// Cost safety, in layers. Deleting a key binds THIS vitest process only: `next
// build`/`next start` run @next/env themselves, which loads .env.local (production
// loads it; only NODE_ENV=test skips it) and re-populates anything ABSENT. So the
// child gets these keys BLANKED rather than deleted — @next/env never overrides a
// var that already exists, and "" exists, so .env.local cannot put the real key
// back. Every call site treats "" as no-key. On top of that serverEnv() sets
// LLM_DISABLE=1, and all ten routes under test are deterministic SQL reads with no
// provider call on any path (/search is the $0 lexical arm by construction — see
// src/lib/ask/lexical.ts). No request this suite issues can reach a paid provider.
const PAID_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "X_API_KEY",
  "OPENSANCTIONS_API_KEY",
  "POSTMARK_SERVER_TOKEN",
  "RESEND_API_KEY",
] as const;
for (const k of PAID_KEYS) delete process.env[k];

const PORT = 3132;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = "zq-admin@leakprobe.test";
const ADMIN_SESSION_TOKEN = "authz-itest-admin-session-token-3132";
// Fixture date far outside every real corpus (same idea as hardening.itest.ts's
// TEST_DATE) so no other integration file's queries can collide with these rows.
const DIGEST_DATE = "2030-06-15";

const seeded = {
  countryId: 0,
  digestId: 0,
  eventId: 0,
  entityId: 0,
  sourceId: 0,
  docId: 0,
  reportId: 0,
};

// One privileged token per route, asserted ABSENT (case-insensitive) from every
// anonymous response body and PRESENT for the authorized control. Paths are
// thunks because two of them need ids only known after seeding.
const ROUTES: Array<{ name: string; path: () => string; token: string }> = [
  { name: "/admin/access", path: () => "/admin/access", token: "zqleakprobe-access@example.com" },
  { name: "/admin/ingest", path: () => "/admin/ingest", token: "zqleakprobe doc title" },
  { name: "/digests/[country]", path: () => "/digests/zz", token: "Zzleakprobe Republic" },
  {
    name: "/digests/[country]/[date]",
    path: () => `/digests/zz/${DIGEST_DATE}`,
    token: "Zqleakprobe filler claim",
  },
  {
    name: "/search",
    path: () => "/search?q=zqleakprobe",
    token: "Zqleakprobe filler claim",
  },
  { name: "/entities", path: () => "/entities", token: "Zqleakprobe Vexington" },
  {
    name: "/entities/[id]",
    path: () => `/entities/${seeded.entityId}`,
    token: "Zqleakprobe Vexington",
  },
  {
    name: "/registry",
    path: () => "/registry?q=zqleakprobe",
    token: "t.me/s/zqleakprobe_channel",
  },
  {
    name: "/registry/[id]",
    path: () => `/registry/${seeded.sourceId}`,
    token: "t.me/s/zqleakprobe_channel",
  },
  {
    name: "/middle-east",
    path: () => "/middle-east?q=zqleakprobe",
    token: "t.me/s/zqleakprobe_channel",
  },
];

let pool: Pool;
let server: ChildProcess | null = null;
let serverLog = "";
// `next build` rewrites next-env.d.ts to production-build types; snapshot and
// restore so the working tree is untouched after a test run.
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

function serverEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Every var set here is PRESENT in the child, and @next/env refuses to override
    // a present var — so these all beat the .env.local values `next start` loads.
    ...Object.fromEntries(PAID_KEYS.map((k) => [k, ""])),
    NODE_ENV: "production",
    // The server must talk to the disposable fork, never production.
    DATABASE_URL: URL_,
    FEATURE_AUTH_GATE: "true",
    ADMIN_EMAILS: ADMIN_EMAIL,
    AUTH_SECRET: "authz-page-gate-itest-secret",
    LLM_DISABLE: "1",
  };
}

/** Refuse to run if anything already answers on PORT. Without this, an orphaned
 *  server from an aborted run (vitest SIGKILLed before afterAll) would answer the
 *  readiness poll within milliseconds — before our own `next start` failed with
 *  EADDRINUSE and tripped the exitCode guard — and the whole suite would silently
 *  grade a STALE build against a stale database. That is the one failure mode that
 *  could manufacture a false "fix verified", so it fails loudly instead. */
async function assertPortFree(): Promise<void> {
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // connection refused / timeout — nobody is listening, which is what we want
  }
  throw new Error(
    `port ${PORT} already answers HTTP — an orphaned "next start" is probably still ` +
      `running from an aborted run. Kill it before re-running (the suite refuses to ` +
      `grade an unknown server).`,
  );
}

async function get(
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

const AUTH_COOKIE =
  // Send the token under both cookie names so the control works whether the
  // server resolved secure or non-secure cookie naming from its env.
  `authjs.session-token=${ADMIN_SESSION_TOKEN}; __Secure-authjs.session-token=${ADMIN_SESSION_TOKEN}`;

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const country = await client.query(
      `INSERT INTO countries (iso2, name, slug, status)
       VALUES ('zz', 'Zzleakprobe Republic', 'zzleakprobe-republic', 'active')
       RETURNING id`,
    );
    seeded.countryId = country.rows[0].id;

    const source = await client.query(
      `INSERT INTO sources (canonical_url, domain, platform, name, citation_count,
                            first_cited_report_date, last_cited_report_date,
                            hedging_confirmed, hedging_assessed, reliability_score)
       VALUES ('t.me/s/zqleakprobe_channel', 't.me', 'telegram', 'zqleakprobe channel', 5,
               '2030-06-01', '2030-06-14', 3, 2, 0.87)
       RETURNING id`,
    );
    seeded.sourceId = source.rows[0].id;

    const report = await client.query(
      `INSERT INTO isw_reports (url, theater, report_date, title, parse_status)
       VALUES ('https://example.org/zqleakprobe-iran-update', 'ir', '2030-06-14',
               'zqleakprobe iran update', 'parsed')
       RETURNING id`,
    );
    seeded.reportId = report.rows[0].id;

    await client.query(
      `INSERT INTO source_citations (report_id, source_id, raw_url, endnote_index, hedging)
       VALUES ($1, $2, 'https://t.me/zqleakprobe_channel/1', 1, 'confirmed')`,
      [seeded.reportId, seeded.sourceId],
    );

    const doc = await client.query(
      `INSERT INTO raw_documents (adapter, source_id, url, title, content, content_hash,
                                  country_iso2, published_at, fetched_at)
       VALUES ('rss', $1, 'https://example.org/zqleakprobe-article', 'zqleakprobe doc title',
               'zqleakprobe content body', 'zqleakprobe-content-hash-0001', 'zz', now(), now())
       RETURNING id`,
      [seeded.sourceId],
    );
    seeded.docId = doc.rows[0].id;

    const digest = await client.query(
      `INSERT INTO digests (country_id, digest_date, track, status, provider)
       VALUES ($1, $2, 'military', 'published', 'openai')
       RETURNING id`,
      [seeded.countryId, DIGEST_DATE],
    );
    seeded.digestId = digest.rows[0].id;

    const event = await client.query(
      `INSERT INTO events (country_id, event_date, track, type, title, summary)
       VALUES ($1, $2, 'military', 'other', 'Zqleakprobe event title', 'Zqleakprobe event summary')
       RETURNING id`,
      [seeded.countryId, DIGEST_DATE],
    );
    seeded.eventId = event.rows[0].id;

    // 250 claims: enough "pressure" links below to keep the seeded entity inside
    // the /entities top-100 ranking regardless of what the production fork holds.
    // The claim-source trigger is DEFERRABLE INITIALLY DEFERRED, so claims and
    // their claim_sources rows commit together in this one transaction.
    await client.query(
      `INSERT INTO claims (country_id, digest_id, event_id, text, claim_type, hedging,
                           confidence, claim_date)
       SELECT $1, $2, $3,
              'Zqleakprobe filler claim #' || g || ' — prosecutors target the network',
              'factual', 'claimed', 0.5, $4
       FROM generate_series(1, 250) AS g`,
      [seeded.countryId, seeded.digestId, seeded.eventId, DIGEST_DATE],
    );
    await client.query(
      `INSERT INTO claim_sources (claim_id, raw_document_id)
       SELECT id, $2 FROM claims WHERE digest_id = $1`,
      [seeded.digestId, seeded.docId],
    );

    const entity = await client.query(
      `INSERT INTO entities (kind, name, meta) VALUES ('person', 'Zqleakprobe Vexington', '{}')
       RETURNING id`,
    );
    seeded.entityId = entity.rows[0].id;
    await client.query(
      `INSERT INTO claim_entities (claim_id, entity_id, role)
       SELECT id, $2, 'defendant' FROM claims WHERE digest_id = $1`,
      [seeded.digestId, seeded.entityId],
    );

    await client.query(
      `INSERT INTO subscribe_intents (email, use_case, request_status)
       VALUES ('zqleakprobe-access@example.com', 'zqleakprobe use case', 'new')`,
    );

    // Authorized-control identity: an accepted admin with a real database
    // session, so the positive-control requests pass every layer the anonymous
    // requests are refused by (allowlist admin + current clickwrap acceptance).
    await client.query(
      `INSERT INTO users (id, email, email_verified, role)
       VALUES ('authz-itest-admin-user', $1, now(), 'admin')`,
      [ADMIN_EMAIL],
    );
    await client.query(
      `INSERT INTO policy_acceptances (user_id, terms_version, privacy_version,
                                       adult_attested, privacy_acknowledged)
       VALUES ('authz-itest-admin-user', $1, $2, true, true)`,
      [CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    );
    await client.query(
      `INSERT INTO sessions (session_token, user_id, expires)
       VALUES ($1, 'authz-itest-admin-user', now() + interval '1 day')`,
      [ADMIN_SESSION_TOKEN],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function cleanupSeed(): Promise<void> {
  // claims delete cascades claim_sources + claim_entities; FK order for the rest.
  await pool.query(`DELETE FROM claims WHERE digest_id = $1`, [seeded.digestId]);
  await pool.query(`DELETE FROM events WHERE id = $1`, [seeded.eventId]);
  await pool.query(`DELETE FROM digests WHERE id = $1`, [seeded.digestId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [seeded.entityId]);
  await pool.query(`DELETE FROM source_citations WHERE source_id = $1`, [seeded.sourceId]);
  await pool.query(`DELETE FROM isw_reports WHERE id = $1`, [seeded.reportId]);
  await pool.query(`DELETE FROM raw_documents WHERE id = $1`, [seeded.docId]);
  await pool.query(`DELETE FROM sources WHERE id = $1`, [seeded.sourceId]);
  await pool.query(`DELETE FROM countries WHERE id = $1`, [seeded.countryId]);
  await pool.query(`DELETE FROM subscribe_intents WHERE email LIKE 'zqleakprobe%'`);
  await pool.query(`DELETE FROM users WHERE id = 'authz-itest-admin-user'`); // cascades sessions + acceptances
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ });
  await runMigrations(URL_!);
  await seed();

  await assertPortFree(); // before the build, so a stale server fails fast
  nextEnvSnapshot = readFileSync(NEXT_ENV_DTS, "utf8");
  await runNext(["build"], serverEnv());

  server = spawn(
    join(process.cwd(), "node_modules", ".bin", "next"),
    ["start", "-p", String(PORT)],
    { cwd: process.cwd(), env: serverEnv(), stdio: ["ignore", "pipe", "pipe"] },
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
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`next start not ready after 90s:\n${serverLog.slice(-4000)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}, 600_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  try {
    if (seeded.digestId) await cleanupSeed();
  } finally {
    await pool.end();
    if (nextEnvSnapshot !== null && readFileSync(NEXT_ENV_DTS, "utf8") !== nextEnvSnapshot) {
      writeFileSync(NEXT_ENV_DTS, nextEnvSnapshot);
    }
  }
}, 120_000);

for (const route of ROUTES) {
  describe(`${route.name}`, () => {
    it("leaks no privileged content to an anonymous bare GET", async () => {
      const { status, body } = await get(route.path());
      // Redirect (307/308) or 404 is the expected refusal; 200 is tolerated only
      // because the body assertion below is the real boundary — a 307 that
      // streams the rendered page as its body MUST fail here.
      expect([200, 307, 308, 404]).toContain(status);
      expect(body.toLowerCase()).not.toContain(route.token.toLowerCase());
    });

    it("leaks no privileged content to an anonymous RSC: 1 GET", async () => {
      const { status, body } = await get(route.path(), { RSC: "1" });
      expect(status).toBeLessThan(500);
      expect(body.toLowerCase()).not.toContain(route.token.toLowerCase());
    });

    it("renders the privileged content for an accepted admin session (positive control)", async () => {
      const { status, body } = await get(route.path(), { cookie: AUTH_COOKIE });
      expect(status).toBe(200);
      expect(body.toLowerCase()).toContain(route.token.toLowerCase());
    });
  });
}
