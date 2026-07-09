// Locale-aware formatting via the platform Intl APIs — never hand-rolled. All helpers
// degrade safely to an em dash on non-finite numbers / invalid dates so a bad value can
// never crash a server-rendered page.
//
// Date/time helpers default to timeZone "UTC" because the values we render (digest dates,
// ISW publish dates) are date-only and must render identically regardless of the server's
// wall-clock zone. Callers can override via opts.

import { type Locale } from "./dictionaries";

// Our short codes map 1:1 onto BCP-47 language tags that Intl understands; this indirection
// is here so a code that needs regioning (e.g. a future "pt-BR") has one place to live.
const BCP47: Partial<Record<Locale, string>> = {};

function tag(locale: Locale): string {
  return BCP47[locale] ?? locale;
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DASH = "—";
const DEFAULT_TZ = "UTC";

export function formatNumber(
  locale: Locale,
  value: number,
  opts?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat(tag(locale), opts).format(value);
}

/** ratio is a fraction: 0.175 → "17.5%". */
export function formatPercent(
  locale: Locale,
  ratio: number,
  opts?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(ratio)) return DASH;
  return new Intl.NumberFormat(tag(locale), {
    style: "percent",
    maximumFractionDigits: 1,
    ...opts,
  }).format(ratio);
}

export function formatDate(
  locale: Locale,
  value: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  if (!d) return DASH;
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeZone: DEFAULT_TZ,
    ...opts,
  }).format(d);
}

export function formatTime(
  locale: Locale,
  value: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  if (!d) return DASH;
  return new Intl.DateTimeFormat(tag(locale), {
    timeStyle: "short",
    timeZone: DEFAULT_TZ,
    ...opts,
  }).format(d);
}

export function formatDateTime(
  locale: Locale,
  value: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  if (!d) return DASH;
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DEFAULT_TZ,
    ...opts,
  }).format(d);
}
