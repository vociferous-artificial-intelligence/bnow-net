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
//    pass vacuously). Reference-unit material must appear in NO body at all,
//    including the positive control (ruling 1).
//
// WS-3.5: THE SURFACES NOW READ REAL ROWS, so this suite SEEDS them —
// migrations 0028/0029/0030, two reference editions, one appended observation
// through the deployed `persistObservation` statement, and one genuine
// published digest claim with its source document. The fixture corpus is
// unreachable from every conflict page (db-product-view.test.ts pins that by
// module graph), so a flag-on teaser that rendered nothing would pass the leak
// assertions VACUOUSLY — which is exactly why the teaser positive control and
// the accepted-session claim-text control below are load-bearing.
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
import { persistObservation } from "@/lib/conflicts/observation-store";
import { UNIT_FLAGS_VERSION } from "@/lib/conflicts/unit-flags";
import {
  IRAN_LEGACY_GOLDEN,
  KEYWORD_GOLDEN,
  resultForEdition,
} from "@/lib/conflicts/db-view.testkit";
import type { ConflictScoredResultV1 } from "@/lib/conflicts/eval-profile";
import { runMigrations } from "../../scripts/migrations-lib";

const URL_ = process.env.INTEGRATION_DATABASE_URL;
if (!URL_) {
  throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
}
process.env.DATABASE_URL = URL_;

// Same layered cost safety as authz-page-gate.itest.ts: keys BLANKED (not
// deleted) in the child so .env.local cannot repopulate them, plus
// LLM_DISABLE=1. Every conflict route is a pure read of the seeded rows — no
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

// The SEEDED published digest claim's text. It lives in `claims`, is reached
// by the evidence view's live join, and renders ONLY there — flag on, accepted.
const CLAIM_TOKEN = "conflict-itest sentinel claim about a river crossing";
// Reference-unit material seeded into the edition row's `derived.units`. It is
// the only unit-derived value that exists anywhere on this fork, so it is the
// honest leak probe now that no fixture takeaway text is loaded: it must appear
// in NO response body under ANY flag/auth state.
const UNIT_TOKEN = "CONFLICTITESTTOPONYM";
// Teaser-tier tokens: prove the flag-on teaser actually rendered.
const TEASER_TOKEN = "Key Takeaway benchmark coverage";
// The memo-C13 banner that REPLACED the fixture build's synthetic-corpus
// disclosure: absent from every feature-OFF body (it is a CONFLICT_TOKEN
// below) and REQUIRED in every flag-ON body that renders a number.
const COMPOUND_BANNER_TOKEN = "Compound handling undetermined";
// The retired banner. It must NEVER reappear: these are real observations, and
// labelling them a synthetic corpus would be the opposite lie.
const RETIRED_SYNTHETIC_TOKEN = "Synthetic review corpus";

const CONFLICT_TOKENS = [
  TEASER_TOKEN,
  "Iran and Regional Conflict",
  "Russia–Ukraine War",
  COMPOUND_BANNER_TOKEN,
  CLAIM_TOKEN,
  UNIT_TOKEN,
] as const;

// Report day inside the view's 30-day window, computed from the wall clock so
// the suite cannot rot into an empty window.
const REPORT_DATE = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
const CLAIM_DAY = REPORT_DATE;
const RU_EDITION_KEY = `roca:${REPORT_DATE}:daily`;
const RU_BENCHMARK_KEY = `roca-${REPORT_DATE}-daily`;
const IR_FINAL_KEY = `iran_update:${REPORT_DATE}:evening`;
const IR_BENCHMARK_KEY = `iran-update-${REPORT_DATE}-evening`;
const TAG = "conflictitest";
const ITEST_JOB = "itest:conflict-feature-off";

const ROUTES = [
  "/conflicts",
  "/conflicts/russia-ukraine",
  "/conflicts/iran-regional",
  `/conflicts/russia-ukraine/benchmark/${RU_BENCHMARK_KEY}`,
  `/conflicts/iran-regional/benchmark/${IR_BENCHMARK_KEY}`,
  `/conflicts/russia-ukraine/benchmark/${RU_BENCHMARK_KEY}/evidence`,
] as const;

const TEASER_ROUTES = ROUTES.filter((r) => !r.endsWith("/evidence"));
const EVIDENCE_ROUTE = `/conflicts/russia-ukraine/benchmark/${RU_BENCHMARK_KEY}/evidence`;

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


const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

/** Retarget a golden's published-retention union onto ONE real claim id. The
 *  fork is a COPY OF PRODUCTION, so the golden's own claim ids (9xxx) very
 *  likely name real production claims with real production text — leaving them
 *  would make the evidence view render something this suite never seeded and
 *  cannot assert about. */
function retargetUnion(result: ConflictScoredResultV1, claimId: number): ConflictScoredResultV1 {
  for (const agreement of result.agreements?.publishedRetention ?? []) {
    for (const claim of agreement.claims) claim.claimId = claimId;
  }
  for (const item of result.bnowOnly?.publishedRetention.items ?? []) item.claimId = claimId;
  return result;
}

const STAMPS = {
  gazetteerVersion: "ru-ua-v1",
  unitFlagsVersion: UNIT_FLAGS_VERSION,
  editionNormVersion: "isw-edition-norm-v1",
  dailyFinalPolicy: "designated-final-v1",
  registryVersion: "conflict-registry-v1",
} as const;

/** `derived.units` carrying the sentinel toponym. This is the ONLY
 *  reference-unit material on the fork, and no surface may ever render it. */
const SENTINEL_DERIVED = JSON.stringify({
  unitsVersion: "isw-unit-sig-v1",
  units: [
    {
      ordinal: 0,
      sha256: "0".repeat(64),
      toponyms: [UNIT_TOKEN],
      actions: ["advance"],
      chars: 120,
    },
  ],
});

async function insertEdition(
  series: string,
  label: string,
  opts: { derived?: string } = {},
): Promise<number> {
  const [row] = await query(
    `INSERT INTO benchmark_report_editions
       (series, provider, edition_key, edition_label, report_date, norm_version, scope_version,
        cutoff_treatment, published_treatment, parse_status, derived)
     VALUES ($1, 'fixture', $2, $3, $4::date, 'isw-edition-norm-v1', $5,
             'missing', 'missing', 'parsed', $6::jsonb)
     RETURNING id`,
    [
      series,
      `${series}:${REPORT_DATE}:${label}`,
      label,
      REPORT_DATE,
      series === "roca" ? "roca-scope-v1" : "iran-update-scope-v1",
      opts.derived ?? "{}",
    ],
  );
  return Number(row.id);
}

async function clearConflictRows(): Promise<void> {
  await query(`DELETE FROM conflict_validation_observations WHERE report_date = $1::date`, [
    REPORT_DATE,
  ]);
  await query(`DELETE FROM benchmark_report_editions WHERE report_date = $1::date`, [REPORT_DATE]);
  await query(`DELETE FROM cron_runs WHERE job = $1`, [ITEST_JOB]);
  await query(
    `DELETE FROM claim_sources WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content_hash LIKE $1)`,
    [`${TAG}%`],
  );
  await query(`DELETE FROM claims WHERE text LIKE $1`, [`%${CLAIM_TOKEN}%`]);
  await query(`DELETE FROM digests WHERE provider = $1`, [TAG]);
  await query(`DELETE FROM raw_documents WHERE content_hash LIKE $1`, [`${TAG}%`]);
}

/** Two reference editions, one genuine published digest claim with a source
 *  document, and TWO appended observations — one per conflict — written through
 *  the DEPLOYED `persistObservation` statement (never a hand-rolled INSERT, so
 *  the row this suite serves is the row production would write).
 *
 *  The Iran day is deliberately MULTI-EDITION with only the EVENING edition
 *  observed, because evening is the daily final: it proves the C4 read rule
 *  end-to-end over HTTP, not only in unit tests. */
async function seedConflictRows(): Promise<void> {
  await clearConflictRows();
  const ruEdition = await insertEdition("roca", "daily", { derived: SENTINEL_DERIVED });
  await insertEdition("iran_update", "morning");
  const irEdition = await insertEdition("iran_update", "evening");
  const [run] = await query(`INSERT INTO cron_runs (job) VALUES ($1) RETURNING id`, [ITEST_JOB]);
  const cronRunId = Number(run.id);

  const [country] = await query(`SELECT id FROM countries WHERE iso2 = 'ru'`);
  const [doc] = await query(
    `INSERT INTO raw_documents (adapter, content, content_hash, country_iso2, url, lang, published_at, fetched_at)
     VALUES ('rss', $1, $2, 'ru', 'https://conflict-itest.example/doc', 'en', $3::timestamptz, $4::timestamptz)
     RETURNING id`,
    [`${TAG} body`, `${TAG}doc`, `${CLAIM_DAY}T05:00:00Z`, `${CLAIM_DAY}T05:30:00Z`],
  );
  const [digest] = await query(
    `INSERT INTO digests (country_id, digest_date, track, status, structured, provider)
     VALUES ($1, $2::date, 'military', 'generated', $3::jsonb, $4)
     RETURNING id`,
    [
      Number(country.id),
      CLAIM_DAY,
      JSON.stringify({ stats: { engine: "mapreduce" } }),
      TAG,
    ],
  );

  // the claim + its source link must commit TOGETHER: the deferred
  // claim_must_have_source trigger fires at COMMIT (drizzle/9999)
  let claimId = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query(
      `INSERT INTO claims (country_id, digest_id, text, hedging, claim_date)
       VALUES ($1, $2, $3, 'claimed', $4::date) RETURNING id`,
      [Number(country.id), Number(digest.id), CLAIM_TOKEN, CLAIM_DAY],
    );
    claimId = Number(claim.rows[0].id);
    await client.query(`INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)`, [
      claimId,
      Number(doc.id),
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await persistObservation(query, {
    referenceEditionId: ruEdition,
    result: retargetUnion(
      resultForEdition(KEYWORD_GOLDEN, "roca", REPORT_DATE, "daily"),
      claimId,
    ),
    contributingDigestIds: [Number(digest.id)],
    cronRunId,
    ...STAMPS,
  });
  await persistObservation(query, {
    referenceEditionId: irEdition,
    result: retargetUnion(
      resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", REPORT_DATE, "evening"),
      claimId,
    ),
    cronRunId,
    ...STAMPS,
    gazetteerVersion: "iran-levant-v1",
  });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: URL_ });
  await runMigrations(URL_!); // applies 0028/0029/0030 on a fork that arrives at 0027
  await seed();
  await seedConflictRows();
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
    await clearConflictRows();
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

  it("teaser pages render for anonymous users WITHOUT claim text or reference-unit material", async () => {
    for (const route of TEASER_ROUTES) {
      const { status, body } = await get(route);
      expect(status, route).toBe(200);
      expect(body.toLowerCase(), route).not.toContain(CLAIM_TOKEN.toLowerCase());
      expect(body.toLowerCase(), route).not.toContain(UNIT_TOKEN.toLowerCase());
    }
    // non-vacuous: the benchmark teaser really rendered its module, over the
    // SEEDED observation — the whole suite would pass on an empty view
    // otherwise, because the fixture corpus is no longer reachable
    const detail = await get(`/conflicts/russia-ukraine/benchmark/${RU_BENCHMARK_KEY}`);
    expect(detail.body).toContain(TEASER_TOKEN);
    expect(detail.body).toContain(RU_EDITION_KEY);
  });

  it("every flag-ON teaser body carries the memo-C13 not-soak-eligible disclosure", async () => {
    // the unit tests pin the banner per route; this pins it in the REAL
    // rendered HTML, so a page that renders an over-crediting number can never
    // ship without saying so (the Gate-7 safety L-1 slot, now held by C13)
    for (const route of TEASER_ROUTES) {
      const { body } = await get(route);
      expect(body, route).toContain(COMPOUND_BANNER_TOKEN);
      expect(body, route).toContain(UNIT_FLAGS_VERSION);
      // ...and never the retired synthetic-corpus banner: these rows are real
      expect(body, route).not.toContain(RETIRED_SYNTHETIC_TOKEN);
    }
  });

  it("the Iran day's DAILY FINAL is what renders, over HTTP (memo C4)", async () => {
    // the morning edition exists and is unobserved; the evening edition is the
    // daily final and is the one with an observation
    const { status, body } = await get(`/conflicts/iran-regional/benchmark/${IR_BENCHMARK_KEY}`);
    expect(status).toBe(200);
    expect(body).toContain(IR_FINAL_KEY);
    expect(body).toContain("scored (daily final)");
    // the NON-final edition's key is not addressable
    const morning = await get(
      `/conflicts/iran-regional/benchmark/iran-update-${REPORT_DATE}-morning`,
    );
    expect(morning.status).toBe(404);
    expect(morning.body).not.toContain(TEASER_TOKEN);
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
