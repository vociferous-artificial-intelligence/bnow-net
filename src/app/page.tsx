import Link from "next/link";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { formatNumber } from "@/i18n/format";
import { currentUserEmail } from "@/lib/session";
import { LIVE_THEATERS, latestDigestHref } from "@/lib/nav/site-nav";
import { TheaterStatusPanel, type TheaterStatusEntry } from "@/components/theater-status-panel";
import { QuickLinksRail, type QuickLinksTheaterEntry } from "@/components/quick-links-rail";
import {
  HomeValidationTiles,
  type TheaterValidationEntry,
  type CorroboratedShare,
} from "@/components/home-validation-tiles";
import { nextFire } from "@/lib/cron/next-fire";
import { etToday } from "@/lib/time/day-boundary";
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

// Ranked digest-date row: up to two per theater (rn=1 latest, rn=2 previous), from
// a window function over each theater's digest_date values. Feeds both
// TheaterStatusPanel (rn=1 only) and QuickLinksRail (rn 1+2) from one query.
// last_generated is max(created_at) scoped to THAT date's rows (created_at is
// last-writer-wins), so the panel can tell an intraday write from the finalize.
// rn is cast ::int in SQL AND folded via Number(): the driver returns uncast
// bigint (row_number()) as a STRING, and a strict === against it silently broke
// this fold in prod on 2026-07-12 (the "not yet generated" contradiction).
interface DigestDateRow {
  iso2: string;
  digest_date: string;
  rn: number | string;
  last_generated: string | Date | null;
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

interface ClaimsByDateRow {
  iso2: string;
  d: string;
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

  let stats = { sources: 0, citations: 0, docs: 0, runs: 0, activeTheaters: 0 };
  try {
    const [r] = (await rawSql.query(
      `SELECT
        (SELECT count(*) FROM sources WHERE citation_count > 0)::int AS sources,
        (SELECT count(*) FROM source_citations)::int AS citations,
        (SELECT count(*) FROM raw_documents)::int AS docs,
        (SELECT count(*) FROM validation_runs)::int AS runs,
        (SELECT count(*) FROM countries WHERE status = 'active')::int AS "activeTheaters"`,
      [],
    )) as Array<typeof stats>;
    stats = {
      sources: r.sources, citations: r.citations, docs: r.docs, runs: r.runs,
      // The signed-out "Live now" count is driven from the authoritative live-theater
      // list (countries.status='active'), not a hardcoded three, so it can't drift
      // (IA refinement 2026-07-12: fixes the 3-vs-8 undersell).
      activeTheaters: r.activeTheaters,
    };
  } catch {
    // health page shows details
  }

  // Signed-in-only: the per-theater data-state panel replaces the marketing feature
  // cards below. Skipped entirely for signed-out users so their render pays for
  // nothing beyond the existing `stats` query above.
  let theaterStatus: TheaterStatusEntry[] = [];
  let xPaused = false;
  let nextIntradayIso: string | null = null;
  let nextFinalizeIso: string | null = null;
  let validationEntries: TheaterValidationEntry[] = [];
  let corroboratedShare: CorroboratedShare | null = null;
  let quickLinksTheaters: QuickLinksTheaterEntry[] = [];
  let recentAsks: RecentAskRow[] = [];
  // One render instant for every day-boundary and next-fire computation on this
  // page (docs/TIME-MODEL.md): "today" means the ET day, computed explicitly —
  // never SQL current_date (the DB session runs UTC) and never implicit-local math
  // (the dev box runs ET, Vercel runs UTC).
  const now = new Date();
  const todayEt = etToday(now);
  if (signedIn) {
    try {
      const [freshnessRows, digestRows, validationRows, corroboratedRows, claimsByDateRows, recentAskRows] = (await Promise.all([
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
        // Top-two digest_dates per theater (rn=1 latest, rn=2 previous),
        // window-ranked so TheaterStatusPanel (rn=1) and QuickLinksRail (rn 1+2)
        // share one query. last_generated is max(created_at) scoped to each date's
        // own rows (across tracks), so the panel can stage-label the latest bucket.
        // rn MUST stay cast ::int — row_number() is bigint and the driver returns
        // uncast bigint as a string (see DigestDateRow above).
        rawSql.query(
          `WITH per_date AS (
             SELECT c.iso2, d.digest_date, max(d.created_at) AS last_generated,
                    row_number() OVER (PARTITION BY c.iso2 ORDER BY d.digest_date DESC) AS rn
             FROM digests d
             JOIN countries c ON c.id = d.country_id
             WHERE c.iso2 IN ('ru','ua','ir')
             GROUP BY c.iso2, d.digest_date
           )
           SELECT iso2, digest_date::text AS digest_date, rn::int AS rn, last_generated
           FROM per_date
           WHERE rn <= 2
           ORDER BY iso2, rn`,
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
        // Corroborated share: the ET-day bucket's digest claims (any track) across
        // live theaters, counted (not shared) here — the honest 0-vs-not-yet-computed
        // distinction is decided in TS below from `total`. The bucket is passed
        // explicitly ($1 = today in ET) — NOT SQL current_date, whose UTC session day
        // rolls at 8 PM ET and would blank the tile every evening.
        rawSql.query(
          `SELECT count(*) FILTER (WHERE doc_count >= 2)::int AS corroborated, count(*)::int AS total
           FROM (
             SELECT cl.id, count(cs.raw_document_id) AS doc_count
             FROM claims cl
             JOIN digests d ON d.id = cl.digest_id
             JOIN countries c ON c.id = d.country_id
             LEFT JOIN claim_sources cs ON cs.claim_id = cl.id
             WHERE c.iso2 IN ('ru','ua','ir') AND d.digest_date = $1
             GROUP BY cl.id
           ) claim_doc_counts`,
          [todayEt],
        ),
        // Claims per (theater, claim_date) over the last week — the panel picks the
        // count for the exact bucket its status line names, so the count can never
        // contradict the digest-status label (R2 hard rule). `claims` holds only
        // digest claims, so this is a cheap direct count.
        rawSql.query(
          `SELECT c.iso2, cl.claim_date::text AS d, count(*)::int AS n
           FROM claims cl JOIN countries c ON c.id = cl.country_id
           WHERE cl.claim_date > current_date - 8 AND c.iso2 IN ('ru','ua','ir')
           GROUP BY 1, 2`,
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
      ])) as [FreshnessRow[], DigestDateRow[], ValidationRow[], CorroboratedRow[], ClaimsByDateRow[], RecentAskRow[]];

      const freshnessByIso2 = new Map(freshnessRows.map((r) => [r.iso2, r]));
      const validationByIso2 = new Map(validationRows.map((r) => [r.iso2, r]));
      const claimsByIso2Date = new Map(claimsByDateRows.map((r) => [`${r.iso2}|${r.d}`, r.n]));

      // Fold the ranked digest-date rows into one entry per theater (latest + prev
      // date, plus the latest bucket's own last-write timestamp) for both
      // theaterStatus and quickLinksTheaters below. Number(row.rn) — never a strict
      // === against the raw value — because the driver delivers uncast bigint as a
      // string; the SQL ::int cast is belt, this is suspenders (regression-pinned in
      // page.test.tsx with string rn fixtures).
      interface DigestDates {
        latest: string | null;
        prev: string | null;
        lastGeneratedAt: string | Date | null;
      }
      const digestByIso2 = new Map<string, DigestDates>();
      for (const row of digestRows) {
        const cur = digestByIso2.get(row.iso2) ?? { latest: null, prev: null, lastGeneratedAt: null };
        if (Number(row.rn) === 1) {
          cur.latest = row.digest_date;
          cur.lastGeneratedAt = row.last_generated;
        } else if (Number(row.rn) === 2) {
          cur.prev = row.digest_date;
        }
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
        const latest = d?.latest ?? null;
        return {
          iso2: th.iso2,
          name: t(th.labelKey),
          lastFetch: f?.last_fetch ?? null,
          docs24h: f?.docs_24h ?? 0,
          latestDate: latest,
          lastGeneratedAt: d?.lastGeneratedAt ?? null,
          // Keyed to the displayed bucket, not an ambient "today" — the R2 invariant.
          claimsForLatest: latest ? (claimsByIso2Date.get(`${th.iso2}|${latest}`) ?? 0) : 0,
          digestHref: latestDigestHref(th.iso2, latest),
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

      // Split the digest crons by mode so the panel can phrase what fires next
      // ("~3:30 PM ET · final ~10:00 PM ET") instead of an unlabeled instant.
      const digestCrons = (vercelConfig.crons as Array<{ path: string; schedule: string }>)
        .filter((c) => c.path.startsWith("/api/cron/digest"));
      const scheduleOf = (mode: string) =>
        digestCrons.filter((c) => c.path.includes(`mode=${mode}`)).map((c) => c.schedule);
      const safeNextFire = (schedules: string[]): string | null => {
        try {
          return schedules.length > 0 ? nextFire(now, schedules).toISOString() : null;
        } catch {
          return null; // unparseable schedule — the panel renders an honest "—"
        }
      };
      nextIntradayIso = safeNextFire(scheduleOf("intraday"));
      nextFinalizeIso = safeNextFire(scheduleOf("finalize"));
    } catch {
      // panel renders with whatever it got; health page has details
    }
  }

  return (
    <main id="main" className="mx-auto max-w-5xl px-6">
      <section className={signedIn ? "py-6 text-center" : "py-20 text-center"}>
        {signedIn ? (
          // Working home: a one-line headline, nothing else. No subtitle, no CTA
          // buttons, no "Live now" line — the quick-links rail + theater panels
          // below supersede all of that (R3, analyst-home-v2 sprint). Kept compact
          // (small vertical padding) so the panels sit above the fold at desktop
          // heights.
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("home.headline")}
          </h1>
        ) : (
          <>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              {t("home.tagline")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">{t("home.sub")}</p>
            <div className="mt-8 flex justify-center gap-4">
              <Link href="/pricing" className={PRIMARY_CTA}>
                {t("home.cta.subscribe")}
              </Link>
              <Link href="/scoreboard" className={SECONDARY_CTA}>
                {t("home.cta.scoreboard")}
              </Link>
            </div>
            {/* Buyer journey tertiary line: coverage -> validation -> request access.
                Reuses existing dictionary keys throughout — no new i18n surface —
                and stays a single muted line, not a new section. The registry link
                that used to lead this line was removed (R5, 2026-07-12): the source
                registry is admin-only now. */}
            <p className="mt-3 text-xs text-gray-400">
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
            {/* Only assert a live-theater count we actually have. On a DB failure the
                catch above leaves activeTheaters at 0; omit the line rather than claim
                "0 theaters" (truth-in-UI, ruling 3) — the rest of the degraded hero
                already shows zeros. */}
            {stats.activeTheaters > 0 && (
              <p className="mt-4 text-sm text-gray-400">{t("home.live", { n: stats.activeTheaters })}</p>
            )}
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
            nowIso={now.toISOString()}
            nextIntradayIso={nextIntradayIso}
            nextFinalizeIso={nextFinalizeIso}
            xPaused={xPaused}
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
          {/* Validation-vs-ISW tiles now sit last, right before the footer (R3,
              analyst-home-v2 sprint): the working surfaces (rail, theater status,
              ask, recent asks) lead; the trust/proof metric follows. */}
          <HomeValidationTiles
            locale={locale}
            t={t}
            entries={validationEntries}
            corroboratedShare={corroboratedShare}
            corroboratedDate={todayEt}
          />
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
              {/* "explore the registry →" link removed (R5, 2026-07-12): the source
                  registry is admin-only now; the card keeps its title/body copy. */}
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
                <Link href="/countries/ir" className="underline hover:text-gray-600 dark:hover:text-gray-300">
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
