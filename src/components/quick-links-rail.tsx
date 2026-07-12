// Signed-in-only compact nav rail, rendered directly under the hero and above
// TheaterStatusPanel: a keyboard-friendly line of digest deep links (latest + prior
// date per live theater) plus the three standing utility destinations. Pure sync
// server component — no fetch — matching the "Live now" line idiom already on the
// hero (src/app/page.tsx) so it renders directly in jsdom tests.

import Link from "next/link";

export interface QuickLinksTheaterEntry {
  iso2: string;
  /** Pre-localized theater name (t(home.theater.*)), not translated here. */
  name: string;
  /** Latest distinct digest_date for this theater, or null if none exists yet. */
  latestDate: string | null;
  /** Second-latest distinct digest_date, or null if there is no second one (or no first). */
  prevDate: string | null;
}

export interface QuickLinksRailProps {
  t: (key: string, vars?: Record<string, string | number>) => string;
  theaters: QuickLinksTheaterEntry[];
}

const LINK_CLASS = "underline hover:text-gray-600 dark:hover:text-gray-300";

export function QuickLinksRail({ t, theaters }: QuickLinksRailProps) {
  // A theater with no digests at all has nothing to link to — its whole item is
  // omitted rather than rendering a dangling "Russia digest:" with no date after it.
  const theaterItems = theaters.filter((th) => th.latestDate !== null);

  return (
    <section className="pb-6">
      <p className="text-sm text-gray-400">
        {t("home.quicklinks.label")}:{" "}
        {theaterItems.map((th, i) => (
          <span key={th.iso2}>
            {i > 0 && " · "}
            {th.name} {t("home.quicklinks.digest")}:{" "}
            <Link href={`/digests/${th.iso2}/${th.latestDate}`} className={LINK_CLASS}>
              {th.latestDate}
            </Link>
            {th.prevDate && (
              <>
                {" · "}
                <Link href={`/digests/${th.iso2}/${th.prevDate}`} className={LINK_CLASS}>
                  {th.prevDate}
                </Link>
              </>
            )}
          </span>
        ))}
        {theaterItems.length > 0 && " · "}
        <Link href="/scoreboard" className={LINK_CLASS}>
          {t("home.quicklinks.scoreboard")}
        </Link>
        {" · "}
        {/* /registry link removed (R5, 2026-07-12): the source registry is
            admin-only now, so it's not advertised here. */}
        <Link href="/signals" className={LINK_CLASS}>
          {t("home.quicklinks.signals")}
        </Link>
        {" · "}
        <Link href="/search" className={LINK_CLASS}>
          {t("home.quicklinks.search")}
        </Link>
      </p>
    </section>
  );
}
