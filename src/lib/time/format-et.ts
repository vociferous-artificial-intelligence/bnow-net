// The shared "short absolute timestamp in ET" formatters (docs/TIME-MODEL.md).
// America/New_York via Intl (never a hardcoded UTC offset, so DST transitions stay
// correct without a redeploy), always suffixed a literal "ET". Null/invalid-safe:
// callers render an honest "no data yet" fallback instead of "Invalid Date".
// These replace the three formatEt copies that used to live in
// theater-status-panel.tsx, home-validation-tiles.tsx and countries/page.tsx.

import type { Locale } from "@/i18n/dictionaries";
import { DISPLAY_TZ, toInstant } from "./day-boundary";

function fmt(
  value: Date | string | null | undefined,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions,
): string | null {
  const d = toInstant(value);
  if (!d) return null;
  return `${new Intl.DateTimeFormat(locale, { timeZone: DISPLAY_TZ, ...opts }).format(d)} ET`;
}

/** "Jul 12, 10:45 AM ET" — month/day + wall-clock time in ET. */
export function formatEtDateTime(
  value: Date | string | null | undefined,
  locale: Locale,
): string | null {
  return fmt(value, locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jul 12, 2026, 10:45 AM ET" — the citation form. Identical to formatEtDateTime
 *  except that it never omits the year: a source citation that cannot be dated to a
 *  year is not reconstructible, which is the whole point of the ICS 206-01 access and
 *  publication fields (src/lib/citation/ics206.ts). Browsing surfaces keep the
 *  shorter year-less form — a digest reader already knows the year from the page. */
export function formatEtDateTimeYear(
  value: Date | string | null | undefined,
  locale: Locale,
): string | null {
  return fmt(value, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "10:45 AM ET" — time-only, for labels that already carry the date. */
export function formatEtTime(
  value: Date | string | null | undefined,
  locale: Locale,
): string | null {
  return fmt(value, locale, { hour: "numeric", minute: "2-digit" });
}
