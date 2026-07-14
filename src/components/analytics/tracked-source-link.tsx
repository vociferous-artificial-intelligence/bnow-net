"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { captureProductEvent } from "@/lib/analytics/client";
import type { EvidencePlatform } from "@/components/claim-evidence-model";
import {
  analyticsPlatform,
  analyticsTheater,
  type EvidenceAnalyticsContext,
} from "./product-event-model";

export function TrackedSourceLink({
  analytics,
  platform,
  children,
  ...anchor
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  analytics?: EvidenceAnalyticsContext;
  platform: EvidencePlatform;
  children: ReactNode;
}) {
  return (
    <a
      {...anchor}
      onClick={(event) => {
        anchor.onClick?.(event);
        if (event.defaultPrevented) return;
        if (!analytics) return;
        captureProductEvent("source_link_clicked", {
          surface: analytics.surface,
          theater: analyticsTheater(analytics.theater),
          platform: analyticsPlatform(platform),
        });
      }}
    >
      {children}
    </a>
  );
}
