import Link from "next/link";
import type { AnswerState, TimeWindow } from "@/lib/ask/types";

// Presentational rendering for an /ask result. Extracted from page.tsx so it can be
// unit-tested with @testing-library without a live DB/auth/server-action harness.
//
// Renders BOTH shapes the frozen v2 contract promises (src/lib/ask/types.ts
// AskAnswerV2): today's legacy AskAnswer (v2 fields simply absent) and the full v2
// payload once the Wave-2 answer stage lands. Every v2-only field access below is
// defensive — see deriveAnswerState and the `?? default` reads in AskResult.

/** A cited/related claim resolved to displayable fields (source link, date). */
export interface ResolvedClaim {
  id: number;
  text: string;
  iso2: string;
  date: string | null;
}

/**
 * Narrow shape this component renders against: the fields every /ask payload has
 * always had, plus the v2 fields as optional. Both `AskAnswer` (legacy,
 * src/lib/ask/answer.ts) and `AskAnswerV2` (src/lib/ask/types.ts) satisfy this
 * structurally with no cast — legacy just leaves the optional fields absent.
 */
export interface AskResultLike {
  answer: string;
  citedClaimIds: number[];
  evidenceCount: number;
  provider: string;
  state?: AnswerState;
  relatedClaimIds?: number[];
  window?: TimeWindow | null;
  totalMatching?: number;
  sampled?: boolean;
  /** corpus currency (max claim_date, yyyy-mm-dd), set by the v2 path — optional,
   *  defensive read consistent with the other v2 fields above. */
  dataCurrentThrough?: string;
}

export type Translate = (key: string) => string;

export interface AskResultProps {
  result: AskResultLike;
  cited: ResolvedClaim[];
  related: ResolvedClaim[];
  t: Translate;
}

/** Defensive state derivation for payloads that predate the v2 `state` field. */
export function deriveAnswerState(result: AskResultLike): AnswerState {
  if (result.state) return result.state;
  if (result.provider === "limit") return "limit";
  if (result.evidenceCount === 0) return "insufficient";
  return "answered";
}

/** "Searched claims from X to Y" / "...since X" / "...through Y" — composed from
 *  word-fragment keys (not a {token} template) so the sentence stays grammatical
 *  per-locale without touching makeT's vars-interpolation test fixture. */
function windowEcho(w: TimeWindow, t: Translate): string | null {
  if (w.from && w.to) {
    return `${t("ask.window.prefix")} ${t("ask.window.from")} ${w.from} ${t("ask.window.to")} ${w.to}`;
  }
  if (w.from) return `${t("ask.window.prefix")} ${t("ask.window.since")} ${w.from}`;
  if (w.to) return `${t("ask.window.prefix")} ${t("ask.window.through")} ${w.to}`;
  return null;
}

function ClaimItems({ items }: { items: ResolvedClaim[] }) {
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="rounded border border-gray-100 p-2 text-sm dark:border-gray-800">
          <span className="mr-2 font-mono text-xs text-gray-400">c{c.id}</span>
          {c.text}{" "}
          {c.date && (
            <Link
              href={`/digests/${c.iso2}/${c.date.slice(0, 10)}#c${c.id}`}
              className="text-xs underline"
            >
              digest →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AskResult({ result, cited, related, t }: AskResultProps) {
  const state = deriveAnswerState(result);
  const relatedIds = result.relatedClaimIds ?? [];
  const window = result.window ?? null;
  const sampled = result.sampled ?? false;
  const echo = window ? windowEcho(window, t) : null;
  const currency = result.dataCurrentThrough;
  // No-coverage: the question's window begins entirely after the newest claim, so no
  // evidence can exist yet — a distinct callout from the generic "insufficient" one.
  const noCoverage =
    state === "insufficient" && !!window?.from && !!currency && window.from > currency;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        {sampled && (
          <p className="mb-2 text-xs text-gray-400">
            {t("ask.sampled.prefix")} {result.totalMatching ?? 0} {t("ask.sampled.suffix")}
          </p>
        )}
        {echo && <p className="mb-2 text-xs text-gray-400">{echo}</p>}

        {/* refused: never fall through to a bare answer string (may literally be the
            provider's "(no answer)" placeholder) — the callout below is the whole story */}
        {state !== "refused" && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{result.answer}</div>
        )}

        {state === "insufficient" &&
          (noCoverage && window?.from && currency ? (
            <p className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              {t("ask.nocoverage.prefix")}{" "}
              {window.to && window.to !== window.from
                ? `${window.from}–${window.to}`
                : window.from}
              . {t("ask.nocoverage.currency")} {currency}.
            </p>
          ) : (
            <p className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              {t("ask.state.insufficient")}
              {/* freshness-honest even when the short-circuit env is off: show currency
                  whenever it is known on an insufficient result */}
              {currency ? ` ${t("ask.nocoverage.currency")} ${currency}.` : ""}
            </p>
          ))}
        {state === "refused" && (
          <p className="rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            {t("ask.state.refused")}
          </p>
        )}

        <p className="mt-3 text-xs text-gray-400">
          {result.evidenceCount} evidence rows · {result.citedClaimIds.length} cited ·{" "}
          {result.provider}
        </p>
      </div>

      {cited.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">{t("ask.subtitle")}</h2>
          <ClaimItems items={cited} />
        </div>
      )}

      {relatedIds.length > 0 && related.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">{t("ask.related.title")}</h2>
          <ClaimItems items={related} />
        </div>
      )}
    </div>
  );
}
