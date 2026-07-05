import { notFound } from "next/navigation";
import Link from "next/link";
import { rawSql } from "@/db";

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
  source_key: string | null;
  reliability: number | null;
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
}: {
  params: Promise<{ country: string; date: string }>;
}) {
  const { country, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z]{2}$/.test(country)) notFound();

  const digestRows = (await rawSql.query(
    `SELECT d.id, d.track, d.status, d.provider, c.name AS country_name
     FROM digests d JOIN countries c ON c.id = d.country_id
     WHERE c.iso2 = $1 AND d.digest_date = $2
     ORDER BY d.track = 'military' DESC`,
    [country, date],
  )) as Array<{ id: number; track: string; status: string; provider: string; country_name: string }>;
  if (digestRows.length === 0) notFound();

  const digestIds = digestRows.map((d) => d.id);
  const [rowsRaw, entityRowsRaw] = await Promise.all([
    rawSql.query(
      `SELECT cl.digest_id, cl.id AS claim_id, ev.id AS event_id, ev.title AS event_title,
              ev.type AS event_type, ev.summary AS event_summary,
              cl.text, cl.hedging, cl.confidence,
              rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
              s.canonical_url AS source_key, s.reliability_score AS reliability
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
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · daily digest
      </p>
      <h1 className="mb-6 text-2xl font-bold">
        {digestRows[0].country_name} — {date}
      </h1>

      {digestRows.map((digest) => {
        const events = byDigest.get(digest.id);
        return (
          <div key={digest.id} className="mb-10">
            <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold dark:border-gray-800">
              {TRACK_LABELS[digest.track] ?? digest.track}{" "}
              <span className="text-xs font-normal text-gray-400">· {digest.provider}</span>
            </h2>
            {!events && <p className="text-sm text-gray-400">No events extracted.</p>}
            {events &&
              [...events.values()].map((ev, i) => (
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
                      <li key={claimId} className="text-sm">
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
                        <div className="mt-1 flex flex-wrap gap-2 pl-1">
                          {c.docs.map((d) => (
                            <a
                              key={d.doc_id}
                              href={d.doc_url ?? "#"}
                              rel="nofollow noopener"
                              target="_blank"
                              className="rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                              title={d.doc_title ?? undefined}
                            >
                              {d.source_key ?? d.adapter}#{d.doc_id}
                              {d.reliability !== null && ` · ${Number(d.reliability).toFixed(2)}`}
                            </a>
                          ))}
                        </div>
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
