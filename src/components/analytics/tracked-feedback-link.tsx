"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { captureProductEvent } from "@/lib/analytics/client";
import { analyticsTheater, type FeedbackSurface } from "./product-event-model";

export function TrackedFeedbackLink({
  surface,
  theater,
  children,
  ...anchor
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  surface: FeedbackSurface;
  theater?: string;
  children: ReactNode;
}) {
  return (
    <a
      {...anchor}
      onClick={(event) => {
        anchor.onClick?.(event);
        if (event.defaultPrevented) return;
        captureProductEvent("feedback_initiated", {
          surface,
          ...(theater ? { theater: analyticsTheater(theater) } : {}),
        });
      }}
    >
      {children}
    </a>
  );
}
