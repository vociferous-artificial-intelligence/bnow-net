// No "use client" directive on purpose (same pattern as ask-result.tsx): this is
// only ever imported from the client-side AskForm, so it inherits the client
// boundary without becoming an entry file (function props stay legal).
import { Loader2 } from "lucide-react";
import type { RunViewState } from "@/lib/ask/run-controller";
import type { Translate } from "./ask-result";

// Phase 2 evidence-first progress panel. EVERY line here derives from a
// persisted server event — no client-inferred stages, no percentages, no
// invented confidence. Candidate claims are labelled as the provisional
// keyword pass (candidate ≠ selected ≠ cited: three distinct labels).

const PHASE_KEY: Record<Exclude<RunViewState["phase"], "done" | "failed">, string> = {
  starting: "ask.progress.starting",
  retrieving: "ask.progress.retrieving",
  selecting: "ask.progress.selecting",
  answering: "ask.progress.answering",
};

export function RunProgress({
  state,
  t,
  onStop,
}: {
  state: RunViewState;
  t: Translate;
  /** Phase 3: wired to POST /api/ask/runs/[id]/cancel; the orchestrator's
   *  cancel-marker watch makes it effective mid-generation. */
  onStop?: () => void;
}) {
  if (state.phase === "done" || state.phase === "failed") return null;
  const statusKey = PHASE_KEY[state.phase];

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      {/* The live region covers ONLY the status line (Gate 2 inline finding):
          announcing the whole panel would re-read the entire candidate list on
          every event — a screen-reader wall. Candidates/counts below are
          reachable but not force-announced. */}
      <div className="flex items-center justify-between gap-2">
        <div role="status" aria-live="polite" className="flex items-center gap-2">
          <Loader2
            className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{t(statusKey)}</p>
        </div>
        {onStop && state.runId && (
          <button
            type="button"
            onClick={onStop}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("ask.progress.stop")}
          </button>
        )}
      </div>

      {state.retrieval && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          {state.retrieval.candidatesCount} {t("ask.progress.candidates_word")} ·{" "}
          {state.retrieval.uniqueSources} {t("ask.progress.sources_word")}
          {state.retrieval.totalMatching > state.retrieval.candidatesCount && (
            <>
              {" "}
              · {t("ask.progress.sample_prefix")} {state.retrieval.totalMatching}{" "}
              {t("ask.progress.sample_suffix")}
            </>
          )}
          {state.retrieval.currentThrough && (
            <>
              {" "}
              · {t("ask.progress.current_through")} {state.retrieval.currentThrough}
            </>
          )}
        </p>
      )}

      {state.selectedCount !== null && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {state.selectedCount} {t("ask.progress.selected_word")}
        </p>
      )}

      {state.sections.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ask.progress.sections_label")}
          </p>
          <div className="mt-1 space-y-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-200">
            {state.sections.map((sec, i) => (
              <p key={i}>{sec.text}</p>
            ))}
          </div>
        </div>
      )}

      {state.candidates && state.candidates.claims.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ask.progress.candidates_label")}
            {state.candidates.totalMatching > state.candidates.claims.length && (
              <>
                {" "}
                ({t("ask.progress.sample_prefix")} {state.candidates.totalMatching}{" "}
                {t("ask.progress.sample_suffix")})
              </>
            )}
          </p>
          <ul className="mt-1 space-y-1">
            {state.candidates.claims.map((c) => (
              <li key={c.claimId} className="break-words text-xs text-gray-700 dark:text-gray-300">
                <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {c.countryIso2}
                  {c.claimDate ? ` · ${c.claimDate}` : ""} · {c.hedging}
                </span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
