import { notFound } from "next/navigation";
import Link from "next/link";
import { rawSql } from "@/db";
import { getProfile, PROFILES } from "@/lib/profiles/config";
import { rankEvents, type RankableEvent } from "@/lib/profiles/rank";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { ClaimSources, type ClaimSourceDoc } from "@/components/claim-sources";

export const dynamic = "force-dynamic";

interface ClaimRow {
  digest_id: number;
  claim_id: number;
  event_id: number;
  event_title: string;
  event_type: string;
  event_summary: string;
  text: string;
  hedging: string;
  confidence: number | null;
  doc_id: number;
  doc_url: string | null;
  doc_title: string | null;
  adapter: string;
  source_id: number | null;
  source_key: string | null;
  reliability: number | null;
  source_platform: string | null;
  doc_at: string | null;
}

interface EntityRow {
  claim_id: number;
  entity_id: number;
  name: string;
  kind: string;
  role: string;
}

const HEDGE_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  assessed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  claimed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  unverified: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const TRACK_LABELS: Record<string, string> = {
  military: "Military situation",
  elite_politics: "Elite politics & prosecutions",
};

export default async function DigestPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; date: string }>;
  searchParams: Promise<{ profile?: string }>;
}) {
  const { country, date } = await params;
  const { profile: profileKey } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z]{2}$/.test(country)) notFound();

  const locale = await getLocale();
  const t = makeT(locale);

  const digestRows = (await rawSql.query(
    `SELECT d.id, d.track, d.status, d.provider, c.name AS country_name
     FROM digests d JOIN countries c ON c.id = d.country_id
     WHERE c.iso2 = $1 AND d.digest_date = $2
     ORDER BY d.track = 'military' DESC`,
    [country, date],
  )) as Array<{ id: number; track: string; status: string; provider: string; country_name: string }>;
  if (digestRows.length === 0) notFound();
  const trackByDigest = new Map(digestRows.map((d) => [d.id, d.track]));

  const digestIds = digestRows.map((d) => d.id);
  const [rowsRaw, entityRowsRaw] = await Promise.all([
    rawSql.query(
      `SELECT cl.digest_id, cl.id AS claim_id, ev.id AS event_id, ev.title AS event_title,
              ev.type AS event_type, ev.summary AS event_summary,
              cl.text, cl.hedging, cl.confidence,
              rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
              s.id AS source_id, s.canonical_url AS source_key, s.reliability_score AS reliability,
              s.platform AS source_platform,
              COALESCE(rd.published_at, rd.fetched_at)::text AS doc_at
       FROM claims cl
       JOIN events ev ON ev.id = cl.event_id
       JOIN claim_sources cs ON cs.claim_id = cl.id
       JOIN raw_documents rd ON rd.id = cs.raw_document_id
       LEFT JOIN sources s ON s.id = rd.source_id
       WHERE cl.digest_id = ANY($1::int[])
       ORDER BY ev.id, cl.id, rd.id`,
      [digestIds],
    ),
    rawSql.query(
      `SELECT ce.claim_id, e.id AS entity_id, e.name, e.kind, ce.role
       FROM claim_entities ce JOIN entities e ON e.id = ce.entity_id
       WHERE ce.claim_id IN (SELECT id FROM claims WHERE digest_id = ANY($1::int[]))`,
      [digestIds],
    ),
  ]);
  const rows = rowsRaw as ClaimRow[];
  const entityRows = entityRowsRaw as EntityRow[];

  const entitiesByClaim = new Map<number, EntityRow[]>();
  for (const e of entityRows)
    entitiesByClaim.set(e.claim_id, [...(entitiesByClaim.get(e.claim_id) ?? []), e]);

  // group per digest: event -> claims -> docs
  const byDigest = new Map<
    number,
    Map<number, {
      title: string; type: string; summary: string;
      claims: Map<number, { text: string; hedging: string; confidence: number | null; docs: ClaimRow[] }>;
    }>
  >();
  // accumulate rankable signal per event (platforms, latest doc time, confidences)
  const evSignal = new Map<number, { platforms: Set<string>; latest: string | null; confs: Set<number>; conf: Map<number, number | null> }>();
  for (const r of rows) {
    if (!byDigest.has(r.digest_id)) byDigest.set(r.digest_id, new Map());
    const events = byDigest.get(r.digest_id)!;
    if (!events.has(r.event_id))
      events.set(r.event_id, {
        title: r.event_title, type: r.event_type, summary: r.event_summary, claims: new Map(),
      });
    const ev = events.get(r.event_id)!;
    if (!ev.claims.has(r.claim_id))
      ev.claims.set(r.claim_id, {
        text: r.text, hedging: r.hedging, confidence: r.confidence, docs: [],
      });
    ev.claims.get(r.claim_id)!.docs.push(r);

    if (!evSignal.has(r.event_id))
      evSignal.set(r.event_id, { platforms: new Set(), latest: null, confs: new Set(), conf: new Map() });
    const sig = evSignal.get(r.event_id)!;
    if (r.source_platform) sig.platforms.add(r.source_platform);
    if (r.doc_at && (sig.latest === null || r.doc_at > sig.latest)) sig.latest = r.doc_at;
    sig.conf.set(r.claim_id, r.confidence);
  }

  // build the profile-ranked event order per digest — recency anchored to the digest's
  // own end-of-day, not the wall clock, so a past digest renders stably forever
  const nowMs = new Date(`${date}T23:59:59Z`).getTime();
  const rankedOrder = new Map<number, number[]>(); // digestId -> ordered eventIds
  for (const [digestId, events] of byDigest) {
    const track = trackByDigest.get(digestId) ?? "military";
    const rankable: RankableEvent[] = [...events.entries()].map(([eventId, ev]) => {
      const sig = evSignal.get(eventId);
      const confs = sig ? [...sig.conf.values()].filter((c): c is number => c !== null) : [];
      return {
        eventId,
        track,
        type: ev.type,
        claimCount: ev.claims.size,
        avgConfidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
        platforms: sig ? [...sig.platforms] : [],
        latestAt: sig?.latest ?? null,
      };
    });
    rankedOrder.set(digestId, rankEvents(rankable, profileKey, nowMs).map((e) => e.eventId));
  }

  // order the track SECTIONS by the profile's track weight (military default first)
  const profile = getProfile(profileKey);
  const orderedDigests = [...digestRows].sort(
    (a, b) =>
      (profile.trackWeights[b.track] ?? 1) - (profile.trackWeights[a.track] ?? 1) ||
      (a.track === "military" ? -1 : 1),
  );

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · daily digest
      </p>
      <h1 className="mb-3 text-2xl font-bold">
        {digestRows[0].country_name} — {date}
      </h1>

      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-gray-400">view for:</span>
        {PROFILES.map((p) => {
          const active = (profileKey ?? "balanced") === p.key;
          const qs = p.key === "balanced" ? "" : `?profile=${p.key}`;
          return (
            <Link
              key={p.key}
              href={`/digests/${country}/${date}${qs}`}
              title={p.description}
              className={`rounded px-2 py-1 ${active ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"}`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {orderedDigests.map((digest) => {
        const events = byDigest.get(digest.id);
        const order = rankedOrder.get(digest.id) ?? [];
        const orderedEvents = events ? order.map((id) => events.get(id)!).filter(Boolean) : [];
        return (
          <div key={digest.id} className="mb-10">
            <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold dark:border-gray-800">
              {TRACK_LABELS[digest.track] ?? digest.track}{" "}
              <span className="text-xs font-normal text-gray-400">· {digest.provider}</span>
            </h2>
            {!events && <p className="text-sm text-gray-400">No events extracted.</p>}
            {events &&
              orderedEvents.map((ev, i) => (
                <section key={i} className="mb-5 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs uppercase dark:bg-gray-700">
                      {ev.type}
                    </span>
                    <h3 className="font-semibold">{ev.title}</h3>
                  </div>
                  <p className="mb-3 text-sm text-gray-500">{ev.summary}</p>
                  <ul className="space-y-3">
                    {[...ev.claims.entries()].map(([claimId, c]) => (
                      // scroll-mt-24 clears the sticky site header (site-header-view.tsx,
                      // `sticky top-0 z-40`) when /ask links straight to #c<claimId> — same
                      // value as the header's other named anchor target (countries/page.tsx).
                      <li key={claimId} id={`c${claimId}`} className="scroll-mt-24 text-sm">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${HEDGE_COLORS[c.hedging] ?? HEDGE_COLORS.unknown}`}>
                          {c.hedging}
                        </span>
                        {c.text}
                        {c.confidence !== null && (
                          <span className="ml-2 text-xs text-gray-400">
                            conf {Number(c.confidence).toFixed(2)}
                          </span>
                        )}
                        {(entitiesByClaim.get(claimId) ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5 pl-1">
                            {entitiesByClaim.get(claimId)!.map((e) => (
                              <Link
                                key={e.entity_id}
                                href={`/entities/${e.entity_id}`}
                                className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200"
                                title={`${e.kind} · ${e.role}`}
                              >
                                {e.name} <span className="opacity-60">({e.role})</span>
                              </Link>
                            ))}
                          </div>
                        )}
                        <ClaimSources
                          docs={c.docs.map(
                            (d): ClaimSourceDoc => ({
                              docId: d.doc_id,
                              url: d.doc_url,
                              sourceId: d.source_id,
                              sourceKey: d.source_key,
                              adapter: d.adapter,
                              platform: d.source_platform,
                              reliability: d.reliability === null ? null : Number(d.reliability),
                              publishedAt: d.doc_at,
                              title: d.doc_title,
                            }),
                          )}
                          showScores
                          t={t}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        );
      })}
      <p className="text-xs text-gray-400">
        Every claim links to its source documents. Traceability is enforced at the
        database level. Factional interpretations are marked as assessments.
      </p>
    </main>
  );
}
