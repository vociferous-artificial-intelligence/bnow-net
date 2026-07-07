import Link from "next/link";
import { notFound } from "next/navigation";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const entRows = (await rawSql.query(`SELECT * FROM entities WHERE id = $1`, [id])) as Array<{
    id: number; name: string; kind: string; meta: Record<string, unknown>;
  }>;
  if (entRows.length === 0) notFound();
  const entity = entRows[0];
  const osRaw = (entity.meta?.opensanctions ?? null) as {
    sanctioned?: boolean; topics?: string[]; datasets?: string[]; osId?: string | null;
    caption?: string | null; checkedAt?: string; stub?: boolean;
  } | null;
  // truth-in-UI: stub enrichment is demo data — a fabricated sanctions badge on a
  // real person is unacceptable, so stub-derived results render as nothing at all
  const os = osRaw && !osRaw.stub && !osRaw.osId?.startsWith("NK-stub") ? osRaw : null;

  const [claimsRaw, linksRaw] = await Promise.all([
    rawSql.query(
      `SELECT cl.id, cl.text, cl.hedging, cl.claim_type, cl.claim_date::text AS d,
              ce.role, c.iso2, dg.track
       FROM claim_entities ce
       JOIN claims cl ON cl.id = ce.claim_id
       JOIN countries c ON c.id = cl.country_id
       LEFT JOIN digests dg ON dg.id = cl.digest_id
       WHERE ce.entity_id = $1
       ORDER BY cl.claim_date DESC NULLS LAST, cl.id DESC
       LIMIT 50`,
      [id],
    ),
    rawSql.query(
      `SELECT l.relation, l.source, l.since, e.id AS to_id, e.name AS to_name, e.kind AS to_kind,
              'out' AS dir
       FROM entity_links l JOIN entities e ON e.id = l.to_entity_id
       WHERE l.from_entity_id = $1
       UNION ALL
       SELECT l.relation, l.source, l.since, e.id AS to_id, e.name AS to_name, e.kind AS to_kind,
              'in' AS dir
       FROM entity_links l JOIN entities e ON e.id = l.from_entity_id
       WHERE l.to_entity_id = $1
       ORDER BY relation`,
      [id],
    ),
  ]);
  const claims = claimsRaw as Array<{
    id: number; text: string; hedging: string; claim_type: string;
    d: string | null; role: string; iso2: string; track: string | null;
  }>;
  // stub-sourced edges are demo data — hidden, same policy as the badges
  const links = (linksRaw as Array<{
    relation: string; source: string; since: string | null;
    to_id: number; to_name: string; to_kind: string; dir: string;
  }>).filter((l) => l.source !== "stub");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/entities" className="underline">entity tracker</Link> · {entity.kind}
      </p>
      <h1 className="mb-2 text-2xl font-bold">{entity.name}</h1>

      {os && (os.sanctioned || (os.topics ?? []).length > 0) && (
        <div className="mb-6 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {os.sanctioned && (
              <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold uppercase text-white">
                sanctioned
              </span>
            )}
            {(os.topics ?? []).map((t) => (
              <span key={t} className="rounded bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
                {t}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {os.caption ?? "OpenSanctions match"}
            {(os.datasets ?? []).length > 0 && ` · lists: ${(os.datasets ?? []).join(", ")}`}
            {os.osId && !os.osId.startsWith("NK-stub") && (
              <>
                {" · "}
                <a
                  href={`https://www.opensanctions.org/entities/${os.osId}/`}
                  rel="nofollow noopener"
                  className="underline"
                >
                  OpenSanctions profile →
                </a>
              </>
            )}
          </p>
        </div>
      )}
      {!os && <div className="mb-6" />}

      {links.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">Connections</h2>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <Link
                key={i}
                href={`/entities/${l.to_id}`}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                title={`${l.source}${l.since ? ` · since ${l.since}` : ""}`}
              >
                <span className="text-gray-400">
                  {l.dir === "out" ? `${l.relation} →` : `← ${l.relation}`}
                </span>{" "}
                <span className="font-medium">{l.to_name}</span>{" "}
                <span className="text-gray-400">({l.to_kind})</span>
              </Link>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Ownership / directorship edges, each attributed to its source. Not exhaustive.
          </p>
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
      <ol className="relative space-y-4 border-l border-gray-200 pl-5 dark:border-gray-800">
        {claims.map((c) => (
          <li key={c.id}>
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-purple-400" />
            <p className="text-xs text-gray-400">
              {c.d?.slice(0, 10) ?? "undated"} · role: {c.role} · {c.hedging}
              {c.claim_type === "assessment" && " · analyst assessment"}
            </p>
            <p className="text-sm">
              {c.text}{" "}
              {c.d && (
                <Link
                  href={`/digests/${c.iso2}/${c.d.slice(0, 10)}`}
                  className="text-xs underline"
                >
                  digest →
                </Link>
              )}
            </p>
          </li>
        ))}
      </ol>
      {claims.length === 0 && <p className="text-gray-400">No claims recorded.</p>}
    </main>
  );
}
