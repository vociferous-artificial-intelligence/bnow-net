"use client";

import { useEffect, useRef } from "react";
import type { AnswerState, RetrievalMode } from "@/lib/ask/types";
import { captureProductEvent } from "@/lib/analytics/client";
import {
  analyticsSignalType,
  analyticsTheater,
  evidenceCountBucket,
  resultCountBucket,
  trackCountBucket,
  type DigestAgeBucket,
} from "./product-event-model";

function useCompletion(key: string, capture: () => void) {
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    capture();
  }, [key, capture]);
}

export function DigestViewedMarker({
  navigationKey,
  theater,
  digestAge,
  trackCount,
}: {
  navigationKey: string;
  theater: string;
  digestAge: DigestAgeBucket;
  trackCount: number;
}) {
  useCompletion(navigationKey, () => {
    captureProductEvent("digest_viewed", {
      theater: analyticsTheater(theater),
      digest_age_bucket: digestAge,
      track_count_bucket: trackCountBucket(trackCount),
    });
  });
  return null;
}

export function SearchCompletedMarker({
  completionKey,
  resultCount,
  windowPresent,
}: {
  completionKey: string;
  resultCount: number;
  windowPresent: boolean;
}) {
  useCompletion(completionKey, () => {
    captureProductEvent("search_completed", {
      has_results: resultCount > 0,
      result_count_bucket: resultCountBucket(resultCount),
      window_present: windowPresent,
    });
  });
  return null;
}

export function AskCompletedMarker({
  completionKey,
  state,
  evidenceCount,
  retrievalMode,
  windowPresent,
}: {
  completionKey: string;
  state: AnswerState;
  evidenceCount: number;
  retrievalMode: RetrievalMode;
  windowPresent: boolean;
}) {
  useCompletion(completionKey, () => {
    captureProductEvent("ask_completed", {
      state,
      evidence_count_bucket: evidenceCountBucket(evidenceCount),
      retrieval_mode: retrievalMode,
      window_present: windowPresent,
    });
  });
  return null;
}

export function SignalDetailViewedMarker({
  navigationKey,
  theater,
  signalType,
  evidenceCount,
}: {
  navigationKey: string;
  theater: string;
  signalType: string;
  evidenceCount: number;
}) {
  const safeType = analyticsSignalType(signalType);
  useCompletion(navigationKey, () => {
    if (!safeType) return;
    captureProductEvent("signal_detail_viewed", {
      theater: analyticsTheater(theater),
      signal_type: safeType,
      evidence_count_bucket: evidenceCountBucket(evidenceCount),
    });
  });
  return null;
}
