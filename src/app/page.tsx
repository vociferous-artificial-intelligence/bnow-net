import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";
import { currentUserEmail } from "@/lib/session";
import { LIVE_THEATERS, latestDigestHref, theaterHref } from "@/lib/nav/site-nav";
import { TheaterStatusPanel, type TheaterStatusEntry } from "@/components/theater-status-panel";
import { QuickLinksRail, type QuickLinksTheaterEntry } from "@/components/quick-links-rail";
import {
  HomeValidationTiles,
  type TheaterValidationEntry,
  type CorroboratedShare,
} from "@/components/home-validation-tiles";
import { nextFire } from "@/lib/cron/next-fire";
import vercelConfig from "../../vercel.json";

export const dynamic = "force-dynamic";

// Freshest X-adapter fetch older than this (or absent) trips the panel's honest
// "X ingestion paused" footnote — a healthy RSS/Telegram aggregate must not hide the
// cap-frozen adapter behind it (OPEN-TASKS #38; eval §1 truth-in-UI constraint).
const X_STALE_MS = 3 * 60 * 60 * 1000;

interface FreshnessRow {
  iso2: string;
  last_fetch: string | null;
  docs_24h: number;
  last_x: string | null;
}

// Ranked (not aggregated) digest-date row: up to two per theater (rn=1 latest,
// rn=2 previous), from a window function over each theater's distinct digest_date
// values. Feeds both TheaterStatusPanel (rn=1 only) and QuickLinksRail (rn 1+2) from
// one query. last_digest is the theater's max(created_at) across ALL digest rows —
// not scoped to the rn=1 date — repeated on every row for that iso2.
interface DigestDateRow {
  iso2: string;
  digest_date: string;
  rn: number;
  last_digest: string | null;
}

interface ValidationRow {
  iso2: string;
  coverage_pct: number | string | null;
  timeliness_hours: number | string | null;
  run_at: string | null;
  digest_date: string | null;
}

interface CorroboratedRow {
  corroborated: number;
  total: number;
}

interface ClaimsTodayRow {
  iso2: string;
  n: number;
}

interface RecentAskRow {
  question: string;
  last_at: string;
}

const PRIMARY_CTA =
  "rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700";
const SECONDARY_CTA =
  "rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900";

export default async function Home() {
  const locale = await getLocale();
  const t = makeT(locale);
  const email = await currentUserEmail();
  const signedIn = email !== null;

  let stats = { sources: 0, citations: 0, docs: 0, runs: 0 };
  let ruLatest: string | null = null;
  try {
    const [r] = (await rawSql.query(
      `SELECT
        (SELECT count(*) FROM sources WHERE citation_count > 0)::int AS sources,
        (SELECT count(*) FROM source_citations)::int AS citations,
        (SELECT count(*) FROM raw_documents)::int AS docs,
        (SELECT count(*) FROM validation_runs)::int AS runs,
        (SELECT max(d.digest_date)::text FROM digests d
           JOIN countries c ON c.id = d.country_id WHERE c.iso2 = 'ru') AS ru_latest`,
      [],
    )) as Array<typeof stats & { ru_latest: string | null }>;
    stats = { sources: r.sources, citations: r.citations, docs: r.docs, runs: r.runs };
    ruLatest = r.ru_latest;
  } catch {
    // health page shows details
  }

  // Signed-in-only: the per-theater data-state panel replaces the marketing feature
  // cards below. Skipped entirely for signed-out users so their render pays for
  // nothing beyond the existing `stats` query above.
  let theaterStatus: TheaterStatusEntry[] = [];
  let xPaused = false;
  let nextUpdateLabel = "";
  let validationEntries: TheaterValidationEntry[] = [];
  let corroboratedShare: CorroboratedShare | null = null;
  let quickLinksTheaters: QuickLinksTheaterEntry[] = [];
  let recentAsks: RecentAskRow[] = [];
  if (signedIn) {
    try {
      const [freshnessRows, digestRows, validationRows, corroboratedRows, claimsTodayRows, recentAskRows] = (await Promise.all([
        rawSql.query(
          `SELECT rd.country_iso2 AS iso2,
                  max(rd.fetched_at) AS last_fetch,
                  count(*) FILTER (WHERE rd.fetched_at > now() - interval '24 hours')::int AS docs_24h,
                  max(rd.fetched_at) FILTER (WHERE rd.adapter = 'x_api') AS last_x
           FROM raw_documents rd
           WHERE rd.country_iso2 IN ('ru','ua','ir')
           GROUP BY 1`,
          [],
        ),
        // Top-two distinct digest_dates per theater (rn=1 latest, rn=2 previous),
        // window-ranked so TheaterStatusPanel (rn=1) and QuickLinksRail (rn 1+2) share
        // one query. last_digest (max(created_at) across ALL digest rows for the
        // theater, not just the rn=1 date) is joined onto every ranked row.
        rawSql.query(
          `WITH distinct_dates AS (
             SELECT DISTINCT country_id, digest_date FROM digests
           ),
           ranked AS (
             SELECT c.iso2, dd.digest_date,
                    row_number() OVER (PARTITION BY c.iso2 ORDER BY dd.digest_date DESC) AS rn
             FROM distinct_dates dd
             JOIN countries c ON c.id = dd.country_id
             WHERE c.iso2 IN ('ru','ua','ir')
           ),
           created AS (
             SELECT c.iso2, max(d.created_at) AS last_digest
             FROM digests d JOIN countries c ON c.id = d.country_id
             WHERE c.iso2 IN ('ru','ua','ir')
             GROUP BY 1
           )
           SELECT r.iso2, r.digest_date::text AS digest_date, r.rn, cr.last_digest
           FROM ranked r
           JOIN created cr ON cr.iso2 = r.iso2
           WHERE r.rn <= 2
           ORDER BY r.iso2, r.rn`,
          [],
        ),
        // Latest validation run per theater — DISTINCT ON picks the newest row per
        // iso2 (run_at DESC) instead of an aggregate, so coverage/timeliness stay a
        // matched pair from the same run rather than mixed maxima across runs.
        // digest_date rides along so the panel can deep-link to that run's scoreboard.
        rawSql.query(
          `SELECT DISTINCT ON (c.iso2) c.iso2 AS iso2, vr.coverage_pct, vr.timeliness_hours, vr.run_at,
                  d.digest_date::text AS digest_date
           FROM validation_runs vr
           JOIN digests d ON d.id = vr.digest_id
           JOIN countries c ON c.id = d.country_id
           WHERE c.iso2 IN ('ru','ua','ir')
           ORDER BY c.iso2, vr.run_at DESC`,
          [],
        ),
        // Corroborated share: today's digest claims (any track) across live theaters,
        // counted (not shared) here — the honest 0-vs-not-yet-computed distinction is
        // decided in TS below from `total`.
        rawSql.query(
          `SELECT count(*) FILTER (WHERE doc_count >= 2)::int AS corroborated, count(*)::int AS total
           FROM (
             SELECT cl.id, count(cs.raw_document_id) AS doc_count
             FROM claims cl
             JOIN digests d ON d.id = cl.digest_id
             JOIN countries c ON c.id = d.country_id
             LEFT JOIN claim_sources cs ON cs.claim_id = cl.id
             WHERE c.iso2 IN ('ru','ua','ir') AND d.digest_date = current_date
             GROUP BY cl.id
           ) claim_doc_counts`,
          [],
        ),
        // Claims-today per theater — `claims` holds only digest claims, so this is a
        // cheap direct count, not a join through raw_documents.
        rawSql.query(
          `SELECT c.iso2, count(*)::int AS n
           FROM claims cl JOIN countries c ON c.id = cl.country_id
           WHERE cl.claim_date = current_date AND c.iso2 IN ('ru','ua','ir')
           GROUP BY 1`,
          [],
        ),
        // This user's past /ask questions, most recent first, deduped by question text.
        // Links land on /ask?q=... which only PREFILLS the form — never re-executes the
        // paid pipeline (ask-polish sprint's GET/action split; see the Ask box below).
        rawSql.query(
          `SELECT question, max(created_at) AS last_at
           FROM ask_usage WHERE user_email = $1
           GROUP BY question ORDER BY last_at DESC LIMIT 5`,
          [email],
        ),
      ])) as [FreshnessRow[], DigestDateRow[], ValidationRow[], CorroboratedRow[], ClaimsTodayRow[], RecentAskRow[]];

      const freshnessByIso2 = new Map(freshnessRows.map((r) => [r.iso2, r]));
      const validationByIso2 = new Map(validationRows.map((r) => [r.iso2, r]));
      const claimsTodayByIso2 = new Map(claimsTodayRows.map((r) => [r.iso2, r.n]));

      // Fold the ranked digest-date rows into one entry per theater (latest + prev
      // date, plus the theater-wide last_digest timestamp) for both theaterStatus and
      // quickLinksTheaters below.
      interface DigestDates {
        latest: string | null;
        prev: string | null;
        lastDigestAt: string | null;
      }
      const digestByIso2 = new Map<string, DigestDates>();
      for (const row of digestRows) {
        const cur = digestByIso2.get(row.iso2) ?? { latest: null, prev: null, lastDigestAt: row.last_digest };
        if (row.rn === 1) cur.latest = row.digest_date;
        else if (row.rn === 2) cur.prev = row.digest_date;
        cur.lastDigestAt = row.last_digest;
        digestByIso2.set(row.iso2, cur);
      }

      validationEntries = LIVE_THEATERS.map((th) => {
        const v = validationByIso2.get(th.iso2);
        return {
          iso2: th.iso2,
          name: t(th.labelKey),
          coveragePct: v?.coverage_pct != null ? Number(v.coverage_pct) : null,
          timelinessHours: v?.timeliness_hours != null ? Number(v.timeliness_hours) : null,
          runAt: v?.run_at ?? null,
        };
      });
      const cr = corroboratedRows[0];
      corroboratedShare = cr && cr.total > 0 ? { corroborated: cr.corroborated, total: cr.total } : null;

      theaterStatus = LIVE_THEATERS.map((th) => {
        const f = freshnessByIso2.get(th.iso2);
        const d = digestByIso2.get(th.iso2);
        const v = validationByIso2.get(th.iso2);
        return {
          iso2: th.iso2,
          name: t(th.labelKey),
          lastFetch: f?.last_fetch ?? null,
          docs24h: f?.docs_24h ?? 0,
          lastDigestAt: d?.lastDigestAt ?? null,
          digestHref: latestDigestHref(th.iso2, d?.latest ?? null),
          latestDate: d?.latest ?? null,
          claimsToday: claimsTodayByIso2.get(th.iso2) ?? 0,
          scoreboardHref: v?.digest_date ? `/scoreboard/${th.iso2}/${v.digest_date}` : null,
        };
      });

      quickLinksTheaters = LIVE_THEATERS.map((th) => {
        const d = digestByIso2.get(th.iso2);
        return {
          iso2: th.iso2,
          name: t(th.labelKey),
          latestDate: d?.latest ?? null,
          prevDate: d?.prev ?? null,
        };
      });

      recentAsks = recentAskRows;

      // xPaused reads the freshest x_api fetch across all three theaters, not per-card —
      // one adapter-health signal, not three (eval §1: a truthful footnote, not a claim
      // per theater the adapter never distinguished).
      const freshestX = freshnessRows.reduce<number | null>((acc, r) => {
        if (!r.last_x) return acc;
        const ms = new Date(r.last_x).getTime();
        if (Number.isNaN(ms)) return acc;
        return acc === null || ms > acc ? ms : acc;
      }, null);
      xPaused = freshestX === null || Date.now() - freshestX > X_STALE_MS;

      const digestCronSchedules = (vercelConfig.crons as Array<{ path: string; schedule: string }>)
        .filter((c) => c.path.startsWith("/api/cron/digest"))
        .map((c) => c.schedule);
      const next = nextFire(new Date(), digestCronSchedules);
      const formattedNext = new Intl.DateTimeFormat(locale, {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(next);
      nextUpdateLabel = `~${formattedNext} ET`;
    } catch {
      // panel renders with whatever it got; health page has details
    }
  }

  return (
    <main id="main" className="mx-auto max-w-5xl px-6">
      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t("home.tagline")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">{t("home.sub")}</p>

        {signedIn ? (
          // Working home: utility actions, no subscriber pitch. The flagship theater is
          // hardcoded to RU — there is no per-user default-theater storage to read.
          <>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href={latestDigestHref("ru", ruLatest)} className={PRIMARY_CTA}>
                {t("home.cta.digest")}
              </Link>
              <Link href="/scoreboard" className={SECONDARY_CTA}>
                {t("home.cta.scoreboard")}
              </Link>
              <Link href="/countries" className="self-center text-sm underline">
                {t("home.cta.coverage")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              {t("home.live_label")}:{" "}
              {LIVE_THEATERS.map((th, i) => (
                <span key={th.iso2}>
                  {i > 0 && " · "}
                  <Link href={theaterHref(th.iso2)} className="underline hover:text-gray-600">
                    {t(th.labelKey)}
                  </Link>
                </span>
              ))}
            </p>
          </>
        ) : (
          <>
            <div className="mt-8 flex justify-center gap-4">
              <Link href="/pricing" className={PRIMARY_CTA}>
                {t("home.cta.subscribe")}
              </Link>
              <Link href="/scoreboard" className={SECONDARY_CTA}>
                {t("home.cta.scoreboard")}
              </Link>
            </div>
            {/* Buyer journey tertiary line: proof (registry) -> coverage -> validation ->
                request access. Reuses existing dictionary keys throughout — no new i18n
                surface — and stays a single muted line, not a new section. */}
            <p className="mt-3 text-xs text-gray-400">
              <Link href="/registry" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                {t("home.features.reliability.link")}
              </Link>
              {" · "}
              <Link href="/countries" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                {t("home.cta.coverage")}
              </Link>
              {" · "}
              <Link href="/scoreboard" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                {t("home.cta.scoreboard")}
              </Link>
              {" · "}
              <Link href="/pricing" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                {t("pricing.cta.request")}
              </Link>
            </p>
            <p className="mt-4 text-sm text-gray-400">{t("home.live")}</p>
          </>
        )}
      </section>

      {signedIn ? (
        <>
          <QuickLinksRail t={t} theaters={quickLinksTheaters} />
          <TheaterStatusPanel
            locale={locale}
            t={t}
            entries={theaterStatus}
            nextUpdateLabel={nextUpdateLabel}
            xPaused={xPaused}
          />
          <HomeValidationTiles
            locale={locale}
            t={t}
            entries={validationEntries}
            corroboratedShare={corroboratedShare}
          />
          {/* Zero-JS entry point to /ask: a plain GET form. Landing on /ask only
              prefills the input from ?q= (src/app/ask/page.tsx) — the paid pipeline
              fires solely from that page's own form submission, so this box can never
              trigger a billed call by itself (refresh/back-nav/prefetch-safe). */}
          <section className="pb-10">
            <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <h3 className="mb-2 font-semibold">{t("ask.title")}</h3>
              <form action="/ask" method="get" className="flex flex-wrap gap-3">
                <input
                  type="text"
                  name="q"
                  placeholder={t("ask.placeholder")}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <button type="submit" className={PRIMARY_CTA}>
                  {t("ask.submit")}
                </button>
              </form>
            </div>
          </section>
          {recentAsks.length > 0 && (
            <section className="pb-10">
              <p className="mb-2 text-sm font-semibold">{t("home.recent_asks.label")}</p>
              <ul className="space-y-1 text-sm">
                {recentAsks.map((a) => (
                  <li key={a.question}>
                    <Link
                      href={`/ask?q=${encodeURIComponent(a.question)}`}
                      className="block truncate underline hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {a.question}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="grid gap-6 py-10 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <h3 className="mb-2 font-semibold">{t("home.features.reliability.title")}</h3>
              <p className="text-sm text-gray-500">
                {t("home.features.reliability.body", {
                  sources: formatNumber(locale, stats.sources),
                  citations: formatNumber(locale, stats.citations),
                })}
              </p>
              <Link href="/registry" className="mt-3 inline-block text-sm underline">
                {t("home.features.reliability.link")}
              </Link>
            </div>
            <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <h3 className="mb-2 font-semibold">{t("home.features.claims.title")}</h3>
              <p className="text-sm text-gray-500">
                {t("home.features.claims.body", { docs: formatNumber(locale, stats.docs) })}
              </p>
              <Link href="/countries" className="mt-3 inline-block text-sm underline">
                {t("home.features.claims.link")}
              </Link>
            </div>
            <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <h3 className="mb-2 font-semibold">{t("home.features.scored.title")}</h3>
              <p className="text-sm text-gray-500">
                {t("home.features.scored.body", { runs: formatNumber(locale, stats.runs) })}
              </p>
              <Link href="/scoreboard" className="mt-3 inline-block text-sm underline">
                {t("home.features.scored.link")}
              </Link>
            </div>
          </section>
          {/* Public Iran/Gulf card: additive, calm (no urgency styling), reuses the
              marketing card border above it. Signed-out only — signed-in users get the
              live theater status panel instead, which already covers Iran. */}
          <section className="pb-10">
            <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <h2 className="mb-2 font-semibold">{t("home.iran.title")}</h2>
              <p className="text-sm text-gray-500">{t("home.iran.body")}</p>
              <p className="mt-3 flex flex-wrap gap-4 text-sm">
                <Link href="/countries#ir" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                  {t("home.iran.link")}
                </Link>
                <Link href="/scoreboard" className="underline hover:text-gray-600 dark:hover:text-gray-300">
                  {t("home.features.scored.link")}
                </Link>
              </p>
            </div>
          </section>
        </>
      )}

      <footer className="border-t border-gray-200 py-8 text-xs text-gray-400 dark:border-gray-800">
        BNOW.NET · {t("home.footer")}
        <Link href="/health" className="ms-2 underline">{t("common.status")}</Link>
      </footer>
    </main>
  );
}
