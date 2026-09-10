import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";

// Real-Postgres proof of the two DB-backed evidence populations (PLAN-WS-3
// §3.3a) against the LIVE tables on a throwaway Neon fork of production.
//
// The unit tests can only assert about statement TEXT. What needs a real
// database is that the statements actually run and actually exclude what the
// contract says they exclude:
//   * a SUPERSEDED extractor version never reaches intake (ruling 13) — the
//     unit tests cannot prove the tuple-IN predicate binds correctly;
//   * a stub-adapter document keeps its claim out of BOTH populations
//     (ruling 3), in the corpus-recall owning-document direction and in the
//     published-retention any-document direction;
//   * a claim arrives with its COMPLETE document list including doc_dedup
//     mirrors, labeled as mirrors (the row-grain rule, Gate-7 safety M-3);
//   * only `generated`/`published` digests contribute retention members, and a
//     legacy-engine digest's claims are MEMBERS, labeled legacy (memo C8);
//   * theatre and track predicates hold per conflict (rulings 11/14).
//
// Everything this test writes is SYNTHETIC and far-future dated (the fork is a
// copy of production, so a real claim date would collide), tagged with a
// sentinel, and deleted afterwards. It writes NOTHING to isw_reports,
// source_citations, validation_runs, benchmark_report_editions or
// conflict_validation_observations, and asserts those counts are unchanged.

const URL_ENV = process.env.INTEGRATION_DATABASE_URL;
if (!URL_ENV) throw new Error("INTEGRATION_DATABASE_URL not set — run via npm run test:integration");
process.env.DATABASE_URL = URL_ENV;

const { runMigrations } = await import("../../scripts/migrations-lib");
const { DbCorpusRecallClaimSource, DbPublishedRetentionClaimSource } = await import(
  "@/lib/conflicts/db-claim-sources"
);
const { CONFLICT_REGISTRY } = await import("@/lib/conflicts/definitions");
const { computeEvaluationWindow } = await import("@/lib/conflicts/evaluation-window");
const { assembleCorpusRecallEvidence, assemblePublishedRetentionEvidence } = await import(
  "@/lib/conflicts/evidence-assembler"
);
const { mapExtractorVersion } = await import("@/lib/analysis/map-prompts");
type EvidenceRequest = import("@/lib/conflicts/evidence-assembler").EvidenceRequest;

const TAG = "ZZITESTWS33";
const DAY = "2027-06-18"; // inside the window of a 2027-06-19 report
const REPORT_DATE = "2027-06-19";
const RU_UA = CONFLICT_REGISTRY.russia_ukraine;
const IRAN = CONFLICT_REGISTRY.iran_regional;

const WINDOW = computeEvaluationWindow({
  reportDate: REPORT_DATE,
  cutoffAt: `${REPORT_DATE}T19:00:00Z`,
  publishedAt: `${REPORT_DATE}T22:00:00Z`,
});

function request(conflictId: "russia_ukraine" | "iran_regional"): EvidenceRequest {
  return {
    conflictId,
    kind: "retrospective",
    report: {
      series: conflictId === "russia_ukraine" ? "roca" : "iran_update",
      editionKey: `${conflictId === "russia_ukraine" ? "roca" : "iran_update"}:${REPORT_DATE}:daily`,
      reportDate: REPORT_DATE,
      cutoffAt: `${REPORT_DATE}T19:00:00Z`,
      publishedAt: `${REPORT_DATE}T22:00:00Z`,
    },
    snapshot: null,
  };
}

let pool: Pool;
const query = (sql: string, params?: unknown[]) =>
  pool.query(sql, params).then((r) => r.rows as Array<Record<string, unknown>>);

const docs: Record<string, number> = {};
const claimIds: number[] = [];
let frozenBaseline: Record<string, number>;

async function frozenCounts(): Promise<Record<string, number>> {
  const [row] = await query(
    `SELECT (SELECT count(*) FROM isw_reports)::int AS reports,
            (SELECT count(*) FROM source_citations)::int AS citations,
            (SELECT count(*) FROM validation_runs)::int AS validations,
            (SELECT count(*) FROM benchmark_report_editions)::int AS editions,
            (SELECT count(*) FROM conflict_validation_observations)::int AS observations`,
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

async function countryId(iso2: string): Promise<number> {
  const [row] = await query(`SELECT id FROM countries WHERE iso2 = $1`, [iso2]);
  if (!row) throw new Error(`fork has no countries row for ${iso2}`);
  return Number(row.id);
}

async function insertDoc(
  key: string,
  adapter: string,
  iso2: string,
  sourceId: number | null,
): Promise<number> {
  const [row] = await query(
    `INSERT INTO raw_documents (adapter, source_id, content, content_hash, country_iso2, url, lang, published_at, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'en', $7::timestamptz, $8::timestamptz)
     RETURNING id`,
    [
      adapter,
      sourceId,
      `${TAG} ${key} document body`,
      `${TAG}${key}`,
      iso2,
      `https://itest.example/${key}`,
      `${DAY}T06:00:00Z`,
      `${DAY}T07:00:00Z`,
    ],
  );
  return Number(row.id);
}

async function insertDocClaim(
  docId: number,
  track: string,
  extractorVersion: string,
  ordinal: number,
  text: string,
): Promise<void> {
  await query(
    `INSERT INTO doc_claims (raw_document_id, track, extractor_version, ordinal, text_en, hedging, claim_date)
     VALUES ($1, $2, $3, $4, $5, 'confirmed', $6::date)`,
    [docId, track, extractorVersion, ordinal, text, DAY],
  );
}

async function insertDigestWithClaim(opts: {
  iso2: string;
  track: string;
  status: string;
  engine: "mapreduce" | "legacy";
  docId: number;
  text: string;
}): Promise<void> {
  const cId = await countryId(opts.iso2);
  const structured =
    opts.engine === "mapreduce" ? { stats: { engine: "mapreduce" } } : { stats: {} };
  const [digest] = await query(
    `INSERT INTO digests (country_id, digest_date, track, status, structured, provider)
     VALUES ($1, $2::date, $3, $4::digest_status, $5::jsonb, 'itest')
     RETURNING id`,
    [cId, DAY, opts.track, opts.status, JSON.stringify(structured)],
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await client.query(
      `INSERT INTO claims (country_id, digest_id, text, hedging, claim_date)
       VALUES ($1, $2, $3, 'confirmed', $4::date) RETURNING id`,
      [cId, digest.id, opts.text, DAY],
    );
    await client.query(`INSERT INTO claim_sources (claim_id, raw_document_id) VALUES ($1, $2)`, [
      claim.rows[0].id,
      opts.docId,
    ]);
    await client.query("COMMIT");
    claimIds.push(Number(claim.rows[0].id));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function clearSynthetic() {
  await query(`DELETE FROM claims WHERE text LIKE $1`, [`${TAG}%`]); // cascades claim_sources
  await query(`DELETE FROM digests WHERE provider = 'itest' AND digest_date = $1::date`, [DAY]);
  await query(
    `DELETE FROM doc_claims WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content_hash LIKE $1)`,
    [`${TAG}%`],
  );
  await query(
    `DELETE FROM doc_dedup WHERE raw_document_id IN (SELECT id FROM raw_documents WHERE content_hash LIKE $1)`,
    [`${TAG}%`],
  );
  await query(`DELETE FROM raw_documents WHERE content_hash LIKE $1`, [`${TAG}%`]);
  await query(`DELETE FROM sources WHERE canonical_url LIKE $1`, [`https://itest.example/%`]);
}

beforeAll(async () => {
  // 0028/0029/0030 are on `main` and unapplied to production (#111), so a fresh
  // fork arrives at 0027; the frozen-table assertion below needs them present.
  await runMigrations(URL_ENV!);
  pool = new Pool({ connectionString: URL_ENV });
  await clearSynthetic();
  frozenBaseline = await frozenCounts();

  const [hi] = await query(
    `INSERT INTO sources (canonical_url, domain, platform, reliability_score)
     VALUES ('https://itest.example/hi', 'hi.itest.example', 'independent_media', 0.9) RETURNING id`,
  );
  const [lo] = await query(
    `INSERT INTO sources (canonical_url, domain, platform, reliability_score)
     VALUES ('https://itest.example/lo', 'lo.itest.example', 'independent_media', 0.2) RETURNING id`,
  );

  docs.ru = await insertDoc("ru", "rss", "ru", Number(hi.id));
  docs.ruMirror = await insertDoc("rumirror", "telegram_web", "ru", Number(lo.id));
  docs.ua = await insertDoc("ua", "rss", "ua", Number(lo.id));
  docs.stub = await insertDoc("stub", "x", "ru", Number(hi.id)); // STUB_ADAPTER_NAMES
  docs.il = await insertDoc("il", "rss", "il", Number(lo.id));
  docs.ir = await insertDoc("ir", "rss", "ir", Number(hi.id));

  await query(
    `INSERT INTO doc_dedup (raw_document_id, canonical_doc_id, method, score) VALUES ($1, $2, 'exact', 1)`,
    [docs.ruMirror, docs.ru],
  );

  // corpus-recall fixtures
  await insertDocClaim(docs.ru, "military", mapExtractorVersion("military", "ru"), 0, `${TAG} Russian forces advanced near Kupiansk in Kharkiv Oblast.`);
  await insertDocClaim(docs.ru, "military", "gpt-4o-mini:0000deadbeef", 1, `${TAG} SUPERSEDED Russian forces advanced near Bakhmut.`);
  await insertDocClaim(docs.ru, "elite_politics", mapExtractorVersion("elite_politics", "ru"), 2, `${TAG} OFFTRACK Moscow officials met to discuss mobilisation.`);
  await insertDocClaim(docs.ua, "military", mapExtractorVersion("military", "ua"), 0, `${TAG} Ukrainian forces repelled assaults near Pokrovsk.`);
  await insertDocClaim(docs.stub, "military", mapExtractorVersion("military", "ru"), 0, `${TAG} STUBDOC Russian forces advanced near Lyman.`);
  await insertDocClaim(docs.ir, "nuclear", mapExtractorVersion("nuclear", "ir"), 0, `${TAG} Iranian officials discussed enrichment work at Isfahan.`);

  // published-retention fixtures
  await insertDigestWithClaim({ iso2: "ru", track: "military", status: "generated", engine: "mapreduce", docId: docs.ru, text: `${TAG} Russian forces shelled positions near Kupiansk.` });
  await insertDigestWithClaim({ iso2: "ua", track: "military", status: "pending", engine: "mapreduce", docId: docs.ua, text: `${TAG} PENDINGDIGEST Ukrainian forces held positions near Pokrovsk.` });
  await insertDigestWithClaim({ iso2: "il", track: "military", status: "generated", engine: "legacy", docId: docs.il, text: `${TAG} Vessels were attacked near the Strait of Hormuz.` });
  await insertDigestWithClaim({ iso2: "ir", track: "nuclear", status: "generated", engine: "mapreduce", docId: docs.stub, text: `${TAG} STUBLINKED Iranian officials met in Tehran.` });
});

afterAll(async () => {
  await clearSynthetic();
  await pool.end();
});

function tagged<T extends { text: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.text.startsWith(TAG));
}

describe("DbCorpusRecallClaimSource against real Postgres", () => {
  it("selects current-version mapped claims only, per theater (rulings 13/14)", async () => {
    const source = new DbCorpusRecallClaimSource(query);
    const rows = tagged(await source.corpusRecallCandidates(RU_UA, WINDOW));
    const texts = rows.map((r) => r.text).sort();
    expect(texts).toEqual([
      `${TAG} Russian forces advanced near Kupiansk in Kharkiv Oblast.`,
      `${TAG} Ukrainian forces repelled assaults near Pokrovsk.`,
    ]);
    // the superseded version, the off-track claim and the stub-adapter claim
    // are all gone at the QUERY, not at the assembler
    expect(texts.join(" ")).not.toContain("SUPERSEDED");
    expect(texts.join(" ")).not.toContain("off-track");
    expect(texts.join(" ")).not.toContain("stub adapter");
    expect(rows.every((r) => r.currentExtractorVersion && r.engine === "mapreduce")).toBe(true);
    expect(rows.every((r) => r.stub === false && r.published === false)).toBe(true);
  });

  it("gives a claim its complete document list with mirrors labeled (ruling 2)", async () => {
    const source = new DbCorpusRecallClaimSource(query);
    const rows = tagged(await source.corpusRecallCandidates(RU_UA, WINDOW));
    const ru = rows.find((r) => r.theater === "ru")!;
    expect(ru.docs.map((d) => d.docId).sort((a, b) => a - b)).toEqual(
      [docs.ru, docs.ruMirror].sort((a, b) => a - b),
    );
    const mirror = ru.docs.find((d) => d.docId === docs.ruMirror)!;
    expect(mirror.mirrorOfDocId).toBe(docs.ru);
    expect(ru.docs.find((d) => d.docId === docs.ru)!.mirrorOfDocId).toBeNull();
    expect(ru.sourceReliability).toBeCloseTo(0.9, 6);
    expect(mirror.sourceDomain).toBe("lo.itest.example");
  });

  it("keeps another conflict's theaters out (iran_regional sees only ir)", async () => {
    const source = new DbCorpusRecallClaimSource(query);
    const rows = tagged(await source.corpusRecallCandidates(IRAN, WINDOW));
    expect(rows.map((r) => r.theater)).toEqual(["ir"]);
    expect(rows[0].track).toBe("nuclear");
  });
});

describe("DbPublishedRetentionClaimSource against real Postgres", () => {
  it("admits generated digests only and labels legacy members (memo C8)", async () => {
    const source = new DbPublishedRetentionClaimSource(query);
    const rows = tagged(await source.publishedRetentionCandidates(IRAN, WINDOW));
    const byText = Object.fromEntries(rows.map((r) => [r.text, r]));
    expect(byText[`${TAG} Vessels were attacked near the Strait of Hormuz.`].engine).toBe("legacy");
    expect(byText[`${TAG} Vessels were attacked near the Strait of Hormuz.`].theater).toBe("il");
    // a PENDING digest contributes nothing, and a claim carrying a stub
    // document is out of the population entirely (ruling 3)
    expect(rows.map((r) => r.text)).not.toContain(`${TAG} PENDINGDIGEST Ukrainian forces held positions near Pokrovsk.`);
    expect(rows.map((r) => r.text)).not.toContain(`${TAG} STUBLINKED Iranian officials met in Tehran.`);
    expect(rows.every((r) => r.published && r.extractorVersion === null)).toBe(true);
  });

  it("reports the contributing digest ids of the call", async () => {
    const source = new DbPublishedRetentionClaimSource(query);
    const rows = await source.publishedRetentionCandidates(IRAN, WINDOW);
    const ids = source.contributingDigestIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("keeps the russia_ukraine designation to ru+ua military", async () => {
    const source = new DbPublishedRetentionClaimSource(query);
    const rows = tagged(await source.publishedRetentionCandidates(RU_UA, WINDOW));
    expect(rows.map((r) => r.text)).toEqual([`${TAG} Russian forces shelled positions near Kupiansk.`]);
    expect(rows[0].engine).toBe("mapreduce");
  });
});

describe("end to end through the assembler", () => {
  it("assembles both populations for russia_ukraine from live rows", async () => {
    const corpus = await assembleCorpusRecallEvidence(
      request("russia_ukraine"),
      new DbCorpusRecallClaimSource(query),
    );
    expect(corpus.status).toBe("assembled");
    if (corpus.status !== "assembled") return;
    const mine = corpus.assembly.records.filter((r) => r.text.startsWith(TAG));
    expect(mine.length).toBeGreaterThan(0);
    const current = new Set([
      mapExtractorVersion("military", "ru"),
      mapExtractorVersion("military", "ua"),
    ]);
    for (const record of mine) expect(current.has(record.extractorVersion!)).toBe(true);

    const retention = await assemblePublishedRetentionEvidence(
      request("russia_ukraine"),
      new DbPublishedRetentionClaimSource(query),
    );
    expect(retention.status).toBe("assembled");
    if (retention.status !== "assembled") return;
    expect(retention.assembly.records.some((r) => r.text.startsWith(TAG))).toBe(true);
  });

  it("discloses the incomparable theaters for iran_regional, with no lane diagnostic invented", async () => {
    const corpus = await assembleCorpusRecallEvidence(
      request("iran_regional"),
      new DbCorpusRecallClaimSource(query),
    );
    expect(corpus.status).toBe("assembled");
    if (corpus.status !== "assembled") return;
    // The honest statement: the DB corpus-recall source CANNOT emit a
    // legacy-incomparable candidate (it reads doc_claims under the current
    // version filter), so `laneDiagnostics` — which is populated only from
    // legacy candidates that reached the assembler — is legitimately empty.
    // Comparability honesty is carried by `incomparableTheaters`, which
    // discloses the whole legacy_only roster on every assembly.
    expect(corpus.assembly.incomparableTheaters).toEqual([
      "il",
      "sa",
      "ae",
      "qa",
      "om",
      "bh",
      "kw",
    ]);
    expect(Object.keys(corpus.assembly.laneDiagnostics)).toEqual([]);

    const retention = await assemblePublishedRetentionEvidence(
      request("iran_regional"),
      new DbPublishedRetentionClaimSource(query),
    );
    expect(retention.status).toBe("assembled");
    if (retention.status !== "assembled") return;
    expect(retention.assembly.legacyMemberCount).toBeGreaterThan(0);
  });

  it("writes nothing to the frozen reference and observation tables", async () => {
    expect(await frozenCounts()).toEqual(frozenBaseline);
  });
});
