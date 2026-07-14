"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/dictionaries";
import {
  buildClaimCopyContent,
  canCopyClaimCitation,
  type ClaimCopyLabels,
  type ClaimCopyMode,
  type ClaimCopyPayload,
  type ClaimCopySurface,
} from "./claim-copy-model";

export interface ClaimCopyActionsProps {
  payload: ClaimCopyPayload;
  surface: ClaimCopySurface;
  locale: Locale;
  labels: ClaimCopyLabels;
}

async function writeClipboard(mode: ClaimCopyMode, plain: string, html: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error("clipboard_unavailable");

  if (mode === "report" || mode === "evidence") {
    const ClipboardItemConstructor = globalThis.ClipboardItem;
    if (ClipboardItemConstructor && typeof clipboard.write === "function") {
      try {
        await clipboard.write([
          new ClipboardItemConstructor({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return;
      } catch {
        // Some browsers expose ClipboardItem/write but reject rich formats. The
        // identical plain payload remains a useful, attribution-safe fallback.
      }
    }
  }

  if (typeof clipboard.writeText !== "function") throw new Error("clipboard_unavailable");
  await clipboard.writeText(plain);
}

function successMessage(mode: ClaimCopyMode, labels: ClaimCopyLabels): string {
  if (mode === "report") return labels.reportCopied;
  if (mode === "link") return labels.linkCopied;
  if (mode === "evidence") return labels.evidenceCopied;
  return labels.textCopied;
}

export function ClaimCopyActions({ payload, surface, locale, labels }: ClaimCopyActionsProps) {
  const [pending, setPending] = useState<ClaimCopyMode | null>(null);
  const [status, setStatus] = useState("");
  const writeLock = useRef(false);
  const citationAvailable = canCopyClaimCitation(payload);

  async function copy(mode: ClaimCopyMode) {
    if (writeLock.current) return;
    const content = buildClaimCopyContent(payload, mode, labels, locale);
    if (!content) {
      setStatus(labels.copyFailed);
      return;
    }

    writeLock.current = true;
    setPending(mode);
    setStatus("");
    try {
      await writeClipboard(mode, content.plain, content.html);
      setStatus(successMessage(mode, labels));
    } catch {
      setStatus(labels.copyFailed);
    } finally {
      writeLock.current = false;
      setPending(null);
    }
  }

  const disabled = pending !== null;
  return (
    <div
      className="mt-2 flex flex-wrap items-start gap-2 text-xs"
      data-copy-surface={surface}
      data-print="hide"
    >
      {citationAvailable && (
        <button
          type="button"
          className="rounded border border-blue-300 px-2 py-1 font-medium text-blue-800 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950"
          disabled={disabled}
          aria-busy={pending === "report"}
          onClick={() => void copy("report")}
        >
          {pending === "report" ? labels.copying : labels.copyForReport}
        </button>
      )}

      <details className="relative">
        <summary className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900">
          {labels.moreCopyOptions}
        </summary>
        <div className="mt-1 flex flex-wrap gap-1" aria-label={labels.moreCopyOptions}>
          {citationAvailable && (
            <>
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700"
                disabled={disabled}
                aria-busy={pending === "link"}
                onClick={() => void copy("link")}
              >
                {pending === "link" ? labels.copying : labels.copyLink}
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-2 py-1 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700"
                disabled={disabled}
                aria-busy={pending === "evidence"}
                onClick={() => void copy("evidence")}
              >
                {pending === "evidence" ? labels.copying : labels.copyWithEvidence}
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700"
            disabled={disabled}
            aria-busy={pending === "text"}
            onClick={() => void copy("text")}
          >
            {pending === "text" ? labels.copying : labels.copyTextOnly}
          </button>
        </div>
      </details>
      <span className="self-center text-gray-600 dark:text-gray-400" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
