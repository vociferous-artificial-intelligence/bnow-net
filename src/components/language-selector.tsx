import { localesByPriority, type Locale } from "@/i18n/dictionaries";

// Language switcher: one link per locale, in market-priority order, labelled in its own
// native script. Plain <a> (not next/link) so the request hits /api/locale, which sets the
// cookie and 302s back to the referring page — preserving the current page when feasible
// and degrading to "/" otherwise. Each item carries its own lang/dir so an RTL native label
// (e.g. العربية) renders correctly even inside an LTR document.
export function LanguageSelector({
  current,
  className,
}: {
  current: Locale;
  className?: string;
}) {
  return (
    <nav
      aria-label="Language"
      className={className ?? "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"}
    >
      {localesByPriority().map((l) => {
        const active = l.code === current;
        return (
          <a
            key={l.code}
            href={`/api/locale?set=${l.code}`}
            hrefLang={l.code}
            lang={l.code}
            dir={l.dir}
            title={l.label}
            aria-current={active ? "true" : undefined}
            className={active ? "font-semibold text-blue-600" : "text-gray-400 hover:underline"}
          >
            {l.nativeLabel}
          </a>
        );
      })}
    </nav>
  );
}
