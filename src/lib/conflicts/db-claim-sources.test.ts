import { describe, expect, it } from "vitest";
import { mapExtractorVersion } from "../analysis/map-prompts";
import { currentVersionPairs } from "../analysis/map-versions";
import type { QueryFn } from "../isw/load";
import {
  CLAIM_INTAKE_LIMIT,
  DbCorpusRecallClaimSource,
  DbPublishedRetentionClaimSource,
  PUBLISHED_DIGEST_STATUSES,
  corpusRecallClaimSql,
  corpusRecallDocSql,
  designatedRetentionPairs,
  publishedRetentionClaimSql,
  publishedRetentionDocSql,
  sourceDomainOf,
} from "./db-claim-sources";
import { CONFLICT_REGISTRY } from "./definitions";
import { computeEvaluationWindow } from "./evaluation-window";
import {
  EVIDENCE_MAX_INTAKE,
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  type EvidenceRequest,
} from "./evidence-assembler";
import { STUB_ADAPTER_NAMES } from "./evidence-records";

const RU_UA = CONFLICT_REGISTRY.russia_ukraine;
const IRAN = CONFLICT_REGISTRY.iran_regional;

const WINDOW = computeEvaluationWindow({
  reportDate: "2026-08-20",
  cutoffAt: "2026-08-20T19:00:00Z",
  publishedAt: "2026-08-20T22:00:00Z",
});

/** A QueryFn that routes by statement shape and records every call. */
function fakeQuery(handlers: {
  claims?: (sql: string, params: unknown[]) => Array<Record<string, unknown>>;
  docs?: (sql: string, params: unknown[]) => Array<Record<string, unknown>>;
}): QueryFn & { calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const fn = (async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const isDocQuery = /UNION ALL/.test(sql);
    const handler = isDocQuery ? handlers.docs : handlers.claims;
    return handler ? handler(sql, params) : [];
  }) as QueryFn & { calls: Array<{ sql: string; params: unknown[] }> };
  fn.calls = calls;
  return fn;
}

function corpusClaimRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claim_id: 1,
    theater: "ru",
    track: "military",
    text: "Russian forces advanced near Kupyansk.",
    hedging: "confirmed",
    claim_date: "2026-08-20",
    extractor_version: mapExtractorVersion("military", "ru"),
    reliability_score: 0.8,
    ...over,
  };
}

function docRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claim_id: 1,
    doc_id: 10,
    adapter: "rss",
    url: "https://example.org/a",
    published_at: "2026-08-20T10:00:00Z",
    fetched_at: "2026-08-20T11:00:00Z",
    lang: "en",
    platform: "news",
    domain: "example.org",
    mirror_of_doc_id: null,
    ...over,
  };
}

function retentionClaimRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claim_id: 1,
    theater: "ru",
    track: "military",
    digest_id: 500,
    text: "Russian forces advanced near Kupyansk.",
    hedging: "confirmed",
    claim_date: "2026-08-20",
    engine: "mapreduce",
    reliability_score: 0.8,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Query shape — the predicates the contract documents in prose
// ---------------------------------------------------------------------------

describe("corpus recall query", () => {
  it("restricts to the MAPPED contributor theaters only (ruling 14)", () => {
    const { sql, params } = corpusRecallClaimSql(IRAN, WINDOW);
    expect(params).toContain("ir");
    for (const legacy of ["il", "sa", "ae", "qa", "om", "bh", "kw"]) {
      expect(params).not.toContain(legacy);
    }
    expect(sql).toContain("rd.country_iso2 =");
  });

  it("pairs each theater with ITS OWN current version set (ruling 13)", () => {
    const { sql, params } = corpusRecallClaimSql(RU_UA, WINDOW);
    // one AND-ed term per mapped theater, OR-ed together — never a flat OR of
    // every theater's version pairs
    expect(sql.match(/rd\.country_iso2 = \$\d+ AND/g)).toHaveLength(2);
    for (const theater of ["ru", "ua"]) {
      for (const pair of currentVersionPairs(theater)) {
        // only the def's own tracks survive the separate track filter, but the
        // version predicate itself carries the theater's configured pairs
        expect(params).toContain(pair.extractorVersion);
      }
    }
  });

  it("filters the def's contributor tracks and the window day span", () => {
    const { sql, params } = corpusRecallClaimSql(IRAN, WINDOW);
    expect(sql).toContain("dc.track = ANY(");
    expect(params).toContainEqual(["military", "nuclear", "elite_politics"]);
    expect(params).toContain(WINDOW.startDate);
    expect(params).toContain(WINDOW.endDate);
  });

  it("excludes stub adapters at the query (ruling 3) and bounds at intake + 1", () => {
    const { sql, params } = corpusRecallClaimSql(RU_UA, WINDOW);
    expect(sql).toContain("rd.adapter <> ALL(");
    expect(params).toContainEqual([...STUB_ADAPTER_NAMES]);
    expect(params).toContain(CLAIM_INTAKE_LIMIT);
    expect(CLAIM_INTAKE_LIMIT).toBe(EVIDENCE_MAX_INTAKE + 1);
  });

  it("orders by registry reliability then claim id", () => {
    const { sql } = corpusRecallClaimSql(RU_UA, WINDOW);
    expect(sql).toContain("ORDER BY s.reliability_score DESC NULLS LAST, dc.id ASC");
  });

  it("reaches documents only through raw_document_id and doc_dedup (ruling 2)", () => {
    const { sql, params } = corpusRecallDocSql([1, 2]);
    expect(sql).toContain("JOIN raw_documents rd ON rd.id = dc.raw_document_id");
    expect(sql).toContain("JOIN doc_dedup dd ON dd.canonical_doc_id = dc.raw_document_id");
    expect(sql).toContain("dd.canonical_doc_id AS mirror_of_doc_id");
    expect(sql).not.toContain("LIMIT");
    expect(params[0]).toEqual([1, 2]);
    expect(params[1]).toEqual([...STUB_ADAPTER_NAMES]);
  });
});

describe("published retention query", () => {
  it("designates mapped theaters x def tracks plus legacy theaters x military", () => {
    expect(designatedRetentionPairs(RU_UA)).toEqual([
      ["ru", "military"],
      ["ua", "military"],
    ]);
    const iran = designatedRetentionPairs(IRAN);
    expect(iran).toContainEqual(["ir", "nuclear"]);
    expect(iran).toContainEqual(["il", "military"]);
    // memo C8: a legacy theater designates its MILITARY digests only
    expect(iran).not.toContainEqual(["il", "nuclear"]);
  });

  it("accepts only generated/published digests, never pending or failed", () => {
    const { sql, params } = publishedRetentionClaimSql(RU_UA, WINDOW);
    expect(sql).toContain("d.status::text = ANY(");
    expect(params).toContainEqual([...PUBLISHED_DIGEST_STATUSES]);
    expect(PUBLISHED_DIGEST_STATUSES).toEqual(["generated", "published"]);
  });

  it("reads the engine label off the digest's own stats stamp", () => {
    const { sql } = publishedRetentionClaimSql(RU_UA, WINDOW);
    expect(sql).toContain("d.structured->'stats'->>'engine' = 'mapreduce'");
  });

  it("drops a claim carrying ANY stub-adapter document (ruling 3)", () => {
    const { sql, params } = publishedRetentionClaimSql(RU_UA, WINDOW);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("rd2.adapter = ANY(");
    expect(params).toContainEqual([...STUB_ADAPTER_NAMES]);
  });

  it("does NOT filter extractor versions (retention asks what shipped)", () => {
    const { sql } = publishedRetentionClaimSql(RU_UA, WINDOW);
    expect(sql).not.toContain("extractor_version");
  });

  it("joins documents through claim_sources only (ruling 2)", () => {
    const { sql } = publishedRetentionDocSql([7]);
    expect(sql).toContain("JOIN raw_documents rd ON rd.id = cs.raw_document_id");
    expect(sql).toContain("JOIN doc_dedup dd ON dd.canonical_doc_id = cs.raw_document_id");
    expect(sql).not.toContain("LIMIT");
  });
});

// ---------------------------------------------------------------------------
// Mapping — the four disposition-critical booleans and the row-grain rule
// ---------------------------------------------------------------------------

describe("corpus recall mapping", () => {
  it("SETS all four disposition booleans and carries the version identity", async () => {
    const query = fakeQuery({
      claims: () => [corpusClaimRow()],
      docs: () => [docRow()],
    });
    const [claim] = await new DbCorpusRecallClaimSource(query).corpusRecallCandidates(RU_UA, WINDOW);
    expect(claim.stub).toBe(false);
    expect(claim.published).toBe(false);
    expect(claim.engine).toBe("mapreduce");
    expect(claim.currentExtractorVersion).toBe(true);
    expect(claim.extractorVersion).toBe(mapExtractorVersion("military", "ru"));
    expect(claim.theater).toBe("ru");
    expect(claim.claimDate).toBe("2026-08-20");
    expect(claim.sourceReliability).toBe(0.8);
  });

  it("gives a claim its COMPLETE document list, mirrors labeled", async () => {
    const query = fakeQuery({
      claims: () => [corpusClaimRow()],
      docs: () => [
        docRow(),
        docRow({ doc_id: 11, mirror_of_doc_id: 10, domain: null, url: "https://mirror.example/x" }),
      ],
    });
    const [claim] = await new DbCorpusRecallClaimSource(query).corpusRecallCandidates(RU_UA, WINDOW);
    expect(claim.docs.map((d) => d.docId)).toEqual([10, 11]);
    expect(claim.docs[0].mirrorOfDocId).toBeNull();
    expect(claim.docs[1].mirrorOfDocId).toBe(10);
    expect(claim.docs[1].sourceDomain).toBe("mirror.example");
  });

  it("issues exactly two statements and asks for exactly the selected ids", async () => {
    const query = fakeQuery({
      claims: () => [corpusClaimRow({ claim_id: 3 }), corpusClaimRow({ claim_id: 9 })],
      docs: () => [],
    });
    await new DbCorpusRecallClaimSource(query).corpusRecallCandidates(RU_UA, WINDOW);
    expect(query.calls).toHaveLength(2);
    expect(query.calls[1].params[0]).toEqual([3, 9]);
  });

  it("skips the document round-trip entirely on an empty day", async () => {
    const query = fakeQuery({ claims: () => [] });
    const out = await new DbCorpusRecallClaimSource(query).corpusRecallCandidates(RU_UA, WINDOW);
    expect(out).toEqual([]);
    expect(query.calls).toHaveLength(1);
  });

  it("refuses a claim row with no claim_date rather than coining a day", async () => {
    const query = fakeQuery({
      claims: () => [corpusClaimRow({ claim_date: null })],
      docs: () => [docRow()],
    });
    await expect(
      new DbCorpusRecallClaimSource(query).corpusRecallCandidates(RU_UA, WINDOW),
    ).rejects.toThrow(/claim_date is missing/);
  });

  it("refuses an unknown track or hedging value from the database", async () => {
    const badTrack = fakeQuery({ claims: () => [corpusClaimRow({ track: "weather" })], docs: () => [] });
    await expect(
      new DbCorpusRecallClaimSource(badTrack).corpusRecallCandidates(RU_UA, WINDOW),
    ).rejects.toThrow(/unknown track/);
    const badHedge = fakeQuery({ claims: () => [corpusClaimRow({ hedging: "very sure" })], docs: () => [] });
    await expect(
      new DbCorpusRecallClaimSource(badHedge).corpusRecallCandidates(RU_UA, WINDOW),
    ).rejects.toThrow(/unknown hedging/);
  });
});

describe("published retention mapping", () => {
  it("labels a legacy-engine digest's claims legacy and never version-filters", async () => {
    const query = fakeQuery({
      claims: () => [retentionClaimRow({ engine: "legacy", theater: "il", track: "military" })],
      docs: () => [docRow()],
    });
    const [claim] = await new DbPublishedRetentionClaimSource(query).publishedRetentionCandidates(
      IRAN,
      WINDOW,
    );
    expect(claim.engine).toBe("legacy");
    expect(claim.published).toBe(true);
    expect(claim.currentExtractorVersion).toBe(true);
    expect(claim.extractorVersion).toBeNull();
    expect(claim.stub).toBe(false);
    expect(claim.theater).toBe("il");
  });

  it("reports the distinct contributing digest ids of the last call", async () => {
    const query = fakeQuery({
      claims: () => [
        retentionClaimRow({ claim_id: 1, digest_id: 7 }),
        retentionClaimRow({ claim_id: 2, digest_id: 7 }),
        retentionClaimRow({ claim_id: 3, digest_id: 4 }),
      ],
      docs: () => [],
    });
    const source = new DbPublishedRetentionClaimSource(query);
    expect(source.contributingDigestIds()).toEqual([]);
    await source.publishedRetentionCandidates(RU_UA, WINDOW);
    expect(source.contributingDigestIds()).toEqual([4, 7]);
  });

  it("prefers the mirror form when a document is both a source and a mirror", async () => {
    const query = fakeQuery({
      claims: () => [retentionClaimRow()],
      docs: () => [
        docRow({ doc_id: 10, mirror_of_doc_id: null }),
        docRow({ doc_id: 10, mirror_of_doc_id: 4 }),
      ],
    });
    const [claim] = await new DbPublishedRetentionClaimSource(query).publishedRetentionCandidates(
      RU_UA,
      WINDOW,
    );
    expect(claim.docs).toHaveLength(1);
    expect(claim.docs[0].mirrorOfDocId).toBe(4);
  });
});

describe("sourceDomainOf", () => {
  it("prefers the registry domain, falls back to the URL host, then to a placeholder", () => {
    expect(sourceDomainOf("tass.ru", "https://other.example/x")).toBe("tass.ru");
    expect(sourceDomainOf(null, "https://other.example/x")).toBe("other.example");
    expect(sourceDomainOf(null, "not a url")).toBe("unknown");
    expect(sourceDomainOf(null, null)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// End to end through the assembler — the refusals the sources must trip
// ---------------------------------------------------------------------------

const REQUEST: EvidenceRequest = {
  conflictId: "russia_ukraine",
  kind: "retrospective",
  report: {
    series: "roca",
    editionKey: "roca:2026-08-20:daily",
    reportDate: "2026-08-20",
    cutoffAt: "2026-08-20T19:00:00Z",
    publishedAt: "2026-08-20T22:00:00Z",
  },
  snapshot: null,
};

describe("through the assembler", () => {
  it("the +1 sentinel trips the intake refusal instead of narrowing the day", async () => {
    const rows = Array.from({ length: CLAIM_INTAKE_LIMIT }, (_, i) =>
      corpusClaimRow({ claim_id: i + 1 }),
    );
    const query = fakeQuery({
      claims: () => rows,
      docs: () => rows.map((r) => docRow({ claim_id: r.claim_id, doc_id: 1000 + Number(r.claim_id) })),
    });
    await expect(
      assembleCorpusRecallEvidence(REQUEST, new DbCorpusRecallClaimSource(query)),
    ).rejects.toThrow(/EVIDENCE_MAX_INTAKE/);
  });

  it("assembles a real corpus-recall record from mapped rows", async () => {
    const query = fakeQuery({
      claims: () => [corpusClaimRow()],
      docs: () => [docRow()],
    });
    const out = await assembleCorpusRecallEvidence(REQUEST, new DbCorpusRecallClaimSource(query));
    expect(out.status).toBe("assembled");
    if (out.status !== "assembled") return;
    expect(out.assembly.records).toHaveLength(1);
    expect(out.assembly.records[0].population).toBe("corpus_recall");
    expect(out.assembly.records[0].extractorVersion).toBe(mapExtractorVersion("military", "ru"));
  });

  it("assembles a published-retention record and counts the legacy members", async () => {
    const query = fakeQuery({
      claims: () => [
        retentionClaimRow({ claim_id: 1, engine: "mapreduce" }),
        retentionClaimRow({ claim_id: 2, engine: "legacy" }),
      ],
      docs: () => [
        docRow({ claim_id: 1, doc_id: 10 }),
        docRow({ claim_id: 2, doc_id: 11 }),
      ],
    });
    const out = await assemblePublishedRetentionEvidence(
      REQUEST,
      new DbPublishedRetentionClaimSource(query),
    );
    expect(out.status).toBe("assembled");
    if (out.status !== "assembled") return;
    expect(out.assembly.legacyMemberCount).toBe(1);
    expect(out.assembly.records.every((r) => r.population === "published_retention")).toBe(true);
  });
});
