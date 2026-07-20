import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { formatDate } from "@/i18n/format";
import { brandSiteBaseUrl } from "@/lib/site-url";
import type { ClaimSourceDoc } from "@/components/claim-evidence-model";
import type { AskResultLike, ResolvedClaim } from "@/app/ask/ask-result";
import type { AskAnswerV2 } from "./types";
import type { EvidenceSnapshot, SnapshotClaim } from "./events";

// Phase 2 extraction: the post-answer source-hydration query the server action
// has always run, shared verbatim with the progressive result endpoint so the
// two render paths cannot drift. One union query; grouping restores the
// model's order. $0 — reads only.

interface ResolvedClaimRow {
  id: number;
  text: string;
  hedging: string;
  iso2: string;
  country_name: string;
  digest_date: string | null;
  doc_id: number;
  doc_url: string | null;
  doc_title: string | null;
  adapter: string;
  source_id: number | null;
  source_name: string | null;
  source_key: string | null;
  source_domain: string | null;
  source_platform: string | null;
  reliability: number | string | null;
  published_at: string | null;
  fetched_at: string;
}

function sourceDoc(row: ResolvedClaimRow): ClaimSourceDoc {
  return {
    docId: row.doc_id,
    url: row.doc_url,
    title: row.doc_title,
    adapter: row.adapter,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceKey: row.source_key,
    sourceDomain: row.source_domain,
    platform: row.source_platform,
    reliability: row.reliability === null ? null : Number(row.reliability),
    publishedAt: row.published_at,
    firstSeenAt: row.fetched_at,
  };
}

export interface HydratedClaims {
  cited: ResolvedClaim[];
  related: ResolvedClaim[];
}

/** Resolve cited + related claim ids, owning digests, and every attached source
 *  document — exactly the action's historical behavior. Cache-hit payloads
 *  (Phase 4, `cacheStatus: "exact"`) resolve from the run's frozen
 *  EvidenceSnapshot instead: digest regeneration replaces claim rows (F11), so
 *  live-id hydration would silently drop or MIS-attribute the cached answer's
 *  citations; snapshot content + stable raw_documents ids stay correct. */
export async function hydrateResultClaims(result: AskAnswerV2): Promise<HydratedClaims> {
  if (result.cacheStatus === "exact" && result.runId) {
    const fromSnapshot = await hydrateFromRunSnapshot(result);
    if (fromSnapshot) return fromSnapshot;
    // snapshot unavailable (lost row): fall through to live hydration — ids
    // that still resolve render; vanished ids drop (the pre-cache behavior)
  }
  let cited: ResolvedClaim[] = [];
  let related: ResolvedClaim[] = [];
  const relatedIds = (result as AskResultLike).relatedClaimIds ?? [];
  const allIds = [...new Set([...result.citedClaimIds, ...relatedIds])];
  if (allIds.length === 0) return { cited, related };

  const rows = (await rawSql.query(
    `SELECT cl.id, cl.text, cl.hedging, c.iso2, c.name AS country_name,
            dg.digest_date::text AS digest_date,
            rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
            s.id AS source_id, s.name AS source_name, s.canonical_url AS source_key,
            s.domain AS source_domain, s.platform::text AS source_platform,
            s.reliability_score AS reliability,
            rd.published_at::text AS published_at,
            rd.fetched_at::text AS fetched_at
     FROM claims cl
     JOIN countries c ON c.id = cl.country_id
     LEFT JOIN digests dg ON dg.id = cl.digest_id
     JOIN claim_sources cs ON cs.claim_id = cl.id
     JOIN raw_documents rd ON rd.id = cs.raw_document_id
     LEFT JOIN sources s ON s.id = rd.source_id
     WHERE cl.id = ANY($1::int[])
     ORDER BY cl.id, rd.id`,
    [allIds],
  )) as ResolvedClaimRow[];
  const locale = await getLocale();
  const byId = new Map<number, ResolvedClaim>();
  for (const row of rows) {
    let claim = byId.get(row.id);
    if (!claim) {
      const digestDate = row.digest_date?.slice(0, 10) ?? null;
      const claimUrl = digestDate
        ? `${brandSiteBaseUrl()}/digests/${row.iso2}/${digestDate}#c${row.id}`
        : null;
      claim = {
        id: row.id,
        text: row.text,
        hedging: row.hedging,
        iso2: row.iso2,
        countryName: row.country_name,
        digestDate,
        copyPayload: {
          claimId: row.id,
          text: row.text,
          hedging: row.hedging,
          asOf: digestDate ? formatDate(locale, digestDate) : null,
          countryName: row.country_name,
          countryIso2: row.iso2,
          claimUrl,
          docs: [],
          showScores: true,
        },
      };
      byId.set(row.id, claim);
    }
    claim.copyPayload.docs.push(sourceDoc(row));
  }
  cited = result.citedClaimIds.map((id) => byId.get(id)).filter((c): c is ResolvedClaim => !!c);
  related = relatedIds.map((id) => byId.get(id)).filter((c): c is ResolvedClaim => !!c);
  return { cited, related };
}

interface SnapshotDocRow {
  doc_id: number;
  doc_url: string | null;
  doc_title: string | null;
  adapter: string;
  source_id: number | null;
  source_name: string | null;
  source_key: string | null;
  source_domain: string | null;
  source_platform: string | null;
  reliability: number | string | null;
  published_at: string | null;
  fetched_at: string;
}

/** Phase 4 (F11): resolve a cache-hit's cited/related evidence from the run's
 *  frozen EvidenceSnapshot. Claim CONTENT comes from the snapshot verbatim
 *  ("as retrieved"); source documents resolve live by their STABLE
 *  raw_documents ids. No digest anchor is linked (the live claim id may have
 *  churned — §7.4's rule). Returns null when no snapshot exists. */
async function hydrateFromRunSnapshot(result: AskAnswerV2): Promise<HydratedClaims | null> {
  const rows = (await rawSql.query(`SELECT evidence_snapshot FROM ask_runs WHERE id = $1`, [
    result.runId,
  ])) as Array<{ evidence_snapshot: EvidenceSnapshot | null }>;
  const snapshot = rows[0]?.evidence_snapshot;
  if (!snapshot || !Array.isArray(snapshot.candidates)) return null;

  const byId = new Map<number, SnapshotClaim>(snapshot.candidates.map((c) => [c.claimId, c]));
  const relatedIds = (result as AskResultLike).relatedClaimIds ?? [];
  const wantedIds = [...new Set([...result.citedClaimIds, ...relatedIds])].filter((id) =>
    byId.has(id),
  );
  if (wantedIds.length === 0) return { cited: [], related: [] };

  const docIds = [
    ...new Set(wantedIds.flatMap((id) => byId.get(id)!.sourceDocIds ?? [])),
  ];
  // Country display names resolve by STABLE iso2 (Gate 4 polish: the snapshot
  // carries only the code; rendering "UA" where the live path shows "Ukraine"
  // made cached and fresh renderings visibly diverge).
  const isoCodes = [...new Set(wantedIds.map((id) => byId.get(id)!.countryIso2))];
  const countryRows = (await rawSql.query(
    `SELECT iso2, name FROM countries WHERE iso2 = ANY($1::text[])`,
    [isoCodes],
  )) as Array<{ iso2: string; name: string }>;
  const countryName = new Map(countryRows.map((r) => [r.iso2, r.name]));
  const docRows =
    docIds.length === 0
      ? []
      : ((await rawSql.query(
          `SELECT rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
                  s.id AS source_id, s.name AS source_name, s.canonical_url AS source_key,
                  s.domain AS source_domain, s.platform::text AS source_platform,
                  s.reliability_score AS reliability,
                  rd.published_at::text AS published_at,
                  rd.fetched_at::text AS fetched_at
           FROM raw_documents rd
           LEFT JOIN sources s ON s.id = rd.source_id
           WHERE rd.id = ANY($1::int[])`,
          [docIds],
        )) as SnapshotDocRow[]);
  const docById = new Map<number, ClaimSourceDoc>(
    docRows.map((row) => [
      row.doc_id,
      {
        docId: row.doc_id,
        url: row.doc_url,
        title: row.doc_title,
        adapter: row.adapter,
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceKey: row.source_key,
        sourceDomain: row.source_domain,
        platform: row.source_platform,
        reliability: row.reliability === null ? null : Number(row.reliability),
        publishedAt: row.published_at,
        firstSeenAt: row.fetched_at,
      },
    ]),
  );

  const locale = await getLocale();
  const resolve = (id: number): ResolvedClaim | null => {
    const c = byId.get(id);
    if (!c) return null;
    const asOf = c.claimDate ? formatDate(locale, c.claimDate) : null;
    const name = countryName.get(c.countryIso2) ?? c.countryIso2.toUpperCase();
    return {
      id: c.claimId,
      text: c.text,
      hedging: c.hedging,
      iso2: c.countryIso2,
      countryName: name,
      digestDate: null, // no live digest anchor — the claim id is unstable (F11)
      copyPayload: {
        claimId: c.claimId,
        text: c.text,
        hedging: c.hedging,
        asOf,
        countryName: name,
        countryIso2: c.countryIso2,
        claimUrl: null,
        docs: (c.sourceDocIds ?? [])
          .map((d) => docById.get(d))
          .filter((d): d is ClaimSourceDoc => !!d),
        showScores: true,
      },
    };
  };
  return {
    cited: result.citedClaimIds.map(resolve).filter((c): c is ResolvedClaim => !!c),
    related: relatedIds.map(resolve).filter((c): c is ResolvedClaim => !!c),
  };
}
