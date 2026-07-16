import { notFound } from "next/navigation";
import Link from "next/link";
import { rawSql } from "@/db";
import { getProfile, PROFILES } from "@/lib/profiles/config";
import { rankEvents, type RankableEvent } from "@/lib/profiles/rank";
import { feedbackMailto } from "@/lib/feedback";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { ClaimSources } from "@/components/claim-sources";
import {
  canonicalEvidenceDocs,
  claimSourceLabel,
  evidencePlatformLabel,
  evidenceTitle,
  safeHttpUrl,
  summarizeClaimEvidence,
  type ClaimSourceDoc,
} from "@/components/claim-evidence-model";
import { makeClaimEvidenceLabels } from "@/components/claim-evidence-labels";
import { ClaimCopyActions } from "@/components/claim-copy-actions";
import { claimCopyLabels } from "@/components/claim-copy-model";
import { DigestPrintActions } from "@/components/digest-print-actions";
import { brandSiteBaseUrl } from "@/lib/site-url";
import { digestStage, type DigestStage } from "@/lib/time/digest-status";
import { toInstant } from "@/lib/time/day-boundary";
import { formatEtDateTime } from "@/lib/time/format-et";
import { DigestViewedMarker } from "@/components/analytics/product-event-markers";
import { digestAgeBucket } from "@/components/analytics/product-event-model";
import { TrackedFeedbackLink } from "@/components/analytics/tracked-feedback-link";

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
  source_name: string | null;
  source_key: string | null;
  source_domain: string | null;
  reliability: number | null;
  source_platform: string | null;
  published_at: string | null;
  fetched_at: string;
}

interface DigestRow {
  id: number;
  track: string;
  status: string;
  country_name: string;
  created_at: string;
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

const TRACK_LABEL_KEYS: Record<string, string> = {
  military: "digest.track.military",
  elite_politics: "digest.track.elite",
  nuclear: "digest.track.nuclear",
};

/** Raw shape of the prev/next scalar-subquery row. */
export interface NeighborDatesRow {
  prev_date: string | null;
  next_date: string | null;
}

/**
 * Normalizes the neighbor-date query result into render-ready YYYY-MM-DD
 * strings (or null when no neighbor digest exists in that direction). Pure
 * so it's unit-testable without a DB.
 */
export function shapeNeighborDates(
  row: NeighborDatesRow | undefined,
): { prev: string | null; next: string | null } {
  const norm = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
  return { prev: norm(row?.prev_date), next: norm(row?.next_date) };
}

/**
 * Screen freshness for the page header, from the persisted rows only — no cadence
 * arithmetic. A country/date page can hold several tracks written at different times,
 * so a stage claim is made for the page ONLY when every displayed track agrees; a
 * mixed page reports per-track instead. Labelling a whole page "final" because its
 * military track finalized would tell an analyst the elite-politics section is
 * complete when it is still mid-day. No next-final estimate is produced: the page
 * does not carry one, and re-deriving the cron schedule here would invent it.
 */
export function summarizeDigestFreshness(
  rows: ReadonlyArray<{ created_at: string }>,
  date: string,
): { uniformStage: DigestStage | null; lastUpdatedAt: string | null } {
  if (rows.length === 0) return { uniformStage: null, lastUpdatedAt: null };

  const stages = rows.map((row) => digestStage(date, toInstant(row.created_at)));
  const uniformStage = stages.every((stage) => stage === stages[0]) ? stages[0] : null;

  let lastUpdatedAt: string | null = null;
  let latest = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const at = toInstant(row.created_at);
    if (at && at.getTime() > latest) {
      latest = at.getTime();
      lastUpdatedAt = row.created_at;
    }
  }
  return { uniformStage, lastUpdatedAt };
}

function toClaimSourceDoc(row: ClaimRow): ClaimSourceDoc {
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
    firstSeenAt: row.fetched_at ?? "",
  };
}

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
  const evidenceLabels = makeClaimEvidenceLabels(t);
  const copyLabels = claimCopyLabels(t);
  const asOf = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const brandBase = brandSiteBaseUrl();
  const canonicalDigestUrl = `${brandBase}/digests/${country}/${date}`;
  const digestMailto = feedbackMailto(`[BNOW digest] ${country} ${date}`);
  // Relocated from the (now admin-only) registry detail page, R5 (2026-07-12):
  // a general "suggest or flag a source" affordance, not tied to one source row,
  // so the subject is a fixed string rather than a per-source one.
  const sourceMailto = feedbackMailto("[BNOW source] suggestion");

  const digestRows = (await rawSql.query(
    // No d.provider: which model wrote a digest is pipeline detail, not analyst
    // information, and it was rendering beside every track heading (2026-07-16).
    `SELECT d.id, d.track, d.status, d.created_at::text AS created_at,
            c.name AS country_name
     FROM digests d JOIN countries c ON c.id = d.country_id
     WHERE c.iso2 = $1 AND d.digest_date = $2
     ORDER BY d.track = 'military' DESC`,
    [country, date],
  )) as DigestRow[];
  if (digestRows.length === 0) notFound();
  const trackByDigest = new Map(digestRows.map((d) => [d.id, d.track]));

  const digestIds = digestRows.map((d) => d.id);
  const [rowsRaw, entityRowsRaw, neighborRaw] = await Promise.all([
    rawSql.query(
      `SELECT cl.digest_id, cl.id AS claim_id, ev.id AS event_id, ev.title AS event_title,
              ev.type AS event_type, ev.summary AS event_summary,
              cl.text, cl.hedging, cl.confidence,
              rd.id AS doc_id, rd.url AS doc_url, rd.title AS doc_title, rd.adapter,
              s.id AS source_id, s.name AS source_name, s.canonical_url AS source_key,
              s.domain AS source_domain, s.reliability_score AS reliability,
              s.platform AS source_platform,
              rd.published_at::text AS published_at,
              rd.fetched_at::text AS fetched_at
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
    rawSql.query(
      `SELECT
         (SELECT max(dd.digest_date) FROM digests dd JOIN countries cc ON cc.id = dd.country_id
          WHERE cc.iso2 = $1 AND dd.digest_date < $2) AS prev_date,
         (SELECT min(dd.digest_date) FROM digests dd JOIN countries cc ON cc.id = dd.country_id
          WHERE cc.iso2 = $1 AND dd.digest_date > $2) AS next_date`,
      [country, date],
    ),
  ]);
  const rows = rowsRaw as ClaimRow[];
  const entityRows = entityRowsRaw as EntityRow[];
  const { prev: prevDate, next: nextDate } = shapeNeighborDates(
    (neighborRaw as NeighborDatesRow[])[0],
  );

  const entitiesByClaim = new Map<number, EntityRow[]>();
  for (const e of entityRows)
    entitiesByClaim.set(e.claim_id, [...(entitiesByClaim.get(e.claim_id) ?? []), e]);

  // group per digest: event -> claims -> docs
  const byDigest = new Map<
    number,
    Map<number, {
      id: number;
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
        id: r.event_id,
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
    // Ranking intentionally keeps its original publish-or-fetch recency fallback;
    // evidence provenance exposes the two timestamps separately.
    const rankAt = r.published_at ?? r.fetched_at;
    if (rankAt && (sig.latest === null || rankAt > sig.latest)) sig.latest = rankAt;
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
  const digestAge = digestAgeBucket(date);
  const freshness = summarizeDigestFreshness(digestRows, date);
  const stageLabel = (stage: DigestStage) => t(`home.status.stage_${stage}`);
  const updatedLabel = (createdAt: string | null) =>
    `${t("digest.freshness.updated")} ${formatEtDateTime(createdAt, locale) ?? t("sources.unknown")}`;
  const orderedDigests = [...digestRows].sort(
    (a, b) =>
      (profile.trackWeights[b.track] ?? 1) - (profile.trackWeights[a.track] ?? 1) ||
      (a.track === "military" ? -1 : 1),
  );

  return (
    <main id="main" data-print="digest" className="mx-auto max-w-3xl p-6">
      <DigestViewedMarker
        navigationKey={`${country}:${date}:${profile.key}`}
        theater={country}
        digestAge={digestAge}
        trackCount={digestRows.length}
      />
      <header data-print-only data-print="metadata">
        <p className="text-sm font-semibold tracking-wide">BNOW.NET</p>
        <h1 className="mt-1 text-2xl font-bold">
          {digestRows[0].country_name} — {date}
        </h1>
        <p className="mt-1 text-xs" data-print="source">
          {t("digest.print.canonical_url")}: {canonicalDigestUrl}
        </p>
        <div className="mt-3 space-y-2">
          {orderedDigests.map((digest) => (
            <dl key={digest.id} className="text-xs">
              <dt className="font-semibold">
                {TRACK_LABEL_KEYS[digest.track] ? t(TRACK_LABEL_KEYS[digest.track]) : digest.track}
              </dt>
              <dd>{t("digest.print.status")}: {digest.status}</dd>
              <dd>
                {t("digest.print.stage")}: {t(`home.status.stage_${digestStage(date, new Date(digest.created_at))}`)}
              </dd>
              <dd>{t("digest.print.generated")}: {formatEtDateTime(digest.created_at, locale) ?? t("sources.unknown")}</dd>
            </dl>
          ))}
        </div>
      </header>

      <p data-print="hide" className="mb-1 text-sm text-gray-600 dark:text-gray-400">
        <Link href="/" className="underline">BNOW.NET</Link> · daily digest
      </p>
      {/* Title and the print disclosure share one action row: side by side once there is
          room, stacked below 640px. min-w-0 lets a long country name wrap instead of
          shoving the disclosure off the row. */}
      <div
        data-print="hide"
        data-testid="digest-header-row"
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {digestRows[0].country_name} — {date}
          </h1>
          {/* Page-level stage only when every track agrees; the mixed case reports on each
              track heading instead (see summarizeDigestFreshness). */}
          {freshness.uniformStage && (
            <p data-testid="digest-freshness" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{stageLabel(freshness.uniformStage)}</span>
              {" · "}
              {updatedLabel(freshness.lastUpdatedAt)}
            </p>
          )}
        </div>

        <DigestPrintActions
          theater={country}
          digestAge={digestAge}
          labels={{
            actions: t("digest.print.actions"),
            brief: t("digest.print.brief"),
            evidence: t("digest.print.evidence"),
            failure: t("digest.print.failed"),
          }}
        />
      </div>

      <nav data-print="hide" className="mb-4 flex items-center gap-3 text-sm">
        {prevDate && (
          <Link
            href={`/digests/${country}/${prevDate}`}
            aria-label={t("digest.nav.prev")}
            className="underline"
          >
            ← {prevDate}
          </Link>
        )}
        <Link href={`/digests/${country}`} className="underline">
          {t("digest.nav.archive")}
        </Link>
        {nextDate && (
          <Link
            href={`/digests/${country}/${nextDate}`}
            aria-label={t("digest.nav.next")}
            className="underline"
          >
            {nextDate} →
          </Link>
        )}
      </nav>

      {/* 14px, not 12px: this is a control, and its label states what the buttons do. */}
      <div data-print="hide" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="me-1 text-gray-600 dark:text-gray-400">{t("digest.view_for")}</span>
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
              {TRACK_LABEL_KEYS[digest.track] ? t(TRACK_LABEL_KEYS[digest.track]) : digest.track}
              {/* Only when the tracks disagree — otherwise the page-level line said it
                  once already and repeating it per track is noise. */}
              {!freshness.uniformStage && (
                <span
                  data-print="hide"
                  data-testid="track-freshness"
                  className="ms-2 text-sm font-normal text-gray-600 dark:text-gray-400"
                >
                  {stageLabel(digestStage(date, toInstant(digest.created_at)))}
                  {" · "}
                  {updatedLabel(digest.created_at)}
                </span>
              )}
            </h2>
            {!events && <p className="text-sm text-gray-600 dark:text-gray-400">{t("digest.no_events")}</p>}
            {events &&
              orderedEvents.map((ev) => (
                <section key={ev.id} data-print="event" className="mb-5 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs uppercase dark:bg-gray-700">
                      {ev.type}
                    </span>
                    <h3 className="font-semibold">{ev.title}</h3>
                  </div>
                  {/* Core summary prose — carries the event, so it reads at full strength. */}
                  <p data-print="event-summary" className="mb-3 text-sm text-gray-700 dark:text-gray-300">{ev.summary}</p>
                  <ul className="space-y-3">
                    {[...ev.claims.entries()].map(([claimId, c]) => {
                      const claimDocs = c.docs.map(toClaimSourceDoc);
                      return (
                        // scroll-mt-24 clears the sticky site header (site-header-view.tsx,
                        // `sticky top-0 z-40`) when /ask links straight to #c<claimId> — same
                        // value as the header's other named anchor target (countries/page.tsx).
                        <li key={claimId} id={`c${claimId}`} data-print="claim" className="scroll-mt-24 text-sm">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${HEDGE_COLORS[c.hedging] ?? HEDGE_COLORS.unknown}`}>
                          {c.hedging}
                        </span>
                        {c.text}
                        {/* No "conf 0.82": the score is uncalibrated, so two decimals
                            implied a precision it does not have. It still ranks events
                            (rank.ts avgConfidence) and stays on the claim row. A
                            High/Medium/Low replacement waits on calibrated thresholds
                            — OPEN-TASKS #14. */}
                        {(entitiesByClaim.get(claimId) ?? []).length > 0 && (
                          <div data-print="hide" className="mt-1 flex flex-wrap gap-1.5 pl-1">
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
                        <ClaimCopyActions
                          payload={{
                            claimId,
                            text: c.text,
                            hedging: c.hedging,
                            asOf,
                            countryName: digestRows[0].country_name,
                            countryIso2: country,
                            claimUrl: `${canonicalDigestUrl}#c${claimId}`,
                            docs: claimDocs,
                            showScores: true,
                          }}
                          surface="digest"
                          locale={locale}
                          labels={copyLabels}
                        />
                        <ClaimSources
                          docs={claimDocs}
                          showScores
                          locale={locale}
                          labels={evidenceLabels}
                          analytics={{
                            surface: "digest",
                            theater: country,
                            hedgingClass: c.hedging,
                            sourceCount: summarizeClaimEvidence(claimDocs).channels,
                          }}
                        />
                        <p data-print-only data-print="claim-url" className="mt-1 text-xs">
                          {canonicalDigestUrl}#c{claimId}
                        </p>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
          </div>
        );
      })}
      <p data-print-only data-print="brief-note" className="mb-4 text-xs text-gray-600">
        {t("digest.print.selected_note")}
      </p>
      <section data-print-only data-print="appendix" aria-labelledby="digest-evidence-appendix">
        <h2 id="digest-evidence-appendix" data-print="appendix-heading" className="mb-4 text-xl font-bold">
          {t("digest.print.appendix")}
        </h2>
        {orderedDigests.map((digest) => {
          const events = byDigest.get(digest.id);
          const order = rankedOrder.get(digest.id) ?? [];
          const orderedEvents = events ? order.map((id) => events.get(id)!).filter(Boolean) : [];
          return (
            <div key={`appendix-${digest.id}`} className="mb-6">
              <h3 className="mb-2 text-base font-semibold">
                {TRACK_LABEL_KEYS[digest.track] ? t(TRACK_LABEL_KEYS[digest.track]) : digest.track}
              </h3>
              {orderedEvents.flatMap((event) => [...event.claims.entries()]).map(([claimId, claim]) => (
                <article key={`appendix-claim-${claimId}`} data-print="appendix-row" data-print-break={claim.docs.length > 8 ? "auto" : undefined} className="mb-4 border-b border-gray-300 pb-3">
                  <h4 className="font-semibold">#{claimId} · {claim.text}</h4>
                  <p className="mb-1 text-xs">
                    {t("copy.status")}: {copyLabels.statuses[claim.hedging as keyof typeof copyLabels.statuses] ?? copyLabels.statuses.unknown}
                  </p>
                  <ul className="space-y-1.5">
                    {canonicalEvidenceDocs(claim.docs.map(toClaimSourceDoc)).map((doc) => {
                      const safeUrl = safeHttpUrl(doc.url);
                      const label = claimSourceLabel(doc);
                      const platformLabel = evidencePlatformLabel(doc, evidenceLabels);
                      const published = formatEtDateTime(doc.publishedAt, locale) ?? t("sources.unknown");
                      // Same transport-aware link text as the on-screen trail — a printed
                      // appendix is read away from the app, where "Open source document"
                      // is even less recoverable.
                      const title = evidenceTitle(doc, evidenceLabels);
                      return (
                        <li key={doc.docId} data-print="source" className="text-xs">
                          <span className="font-semibold">{label}</span> · {platformLabel}
                          {doc.reliability !== null && Number.isFinite(doc.reliability)
                            ? ` · ${doc.reliability.toFixed(2)}`
                            : ""}
                          <br />
                          {t("sources.col.published")}: {published}
                          <br />
                          {safeUrl ? (
                            <a href={safeUrl} rel="nofollow noopener" target="_blank">{title} · {safeUrl}</a>
                          ) : (
                            <span>{title}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          );
        })}
      </section>
      {digestMailto && (
        <p data-print="hide" className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          <TrackedFeedbackLink
            href={digestMailto}
            surface="digest_error"
            theater={country}
            className="underline"
          >
            {t("feedback.flag_digest")}
          </TrackedFeedbackLink>
        </p>
      )}
      {sourceMailto && (
        <p data-print="hide" className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          <TrackedFeedbackLink
            href={sourceMailto}
            surface="source_suggestion"
            theater={country}
            className="underline"
          >
            {t("feedback.flag_source")}
          </TrackedFeedbackLink>
        </p>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Every claim links to its source documents. Traceability is enforced at the
        database level. Factional interpretations are marked as assessments.
      </p>
    </main>
  );
}
