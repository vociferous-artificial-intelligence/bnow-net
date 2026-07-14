"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { PostHogConfig } from "posthog-js";
import { analyticsPublicConfig, canonicalAnalyticsRuntime } from "@/lib/analytics/config";
import { captureManualPageview, captureProductEvent, clearAnalyticsClient, failAnalyticsInitialization, installAnalyticsResetListener, isAnalyticsInitializationCurrent, prepareAnalyticsInitialization, registerAnalyticsClient, resetAnalyticsClient, shouldStartProductSession } from "@/lib/analytics/client";
import { daysSinceSignupBucket, routeSurface } from "@/lib/analytics/events";
import type { AnalyticsIdentity } from "@/lib/analytics/identity";
import { normalizedPagePath, sanitizeOutgoingEvent } from "@/lib/analytics/sanitize";

export function PostHogProvider({ children, identity, productionDeployment }: { children: React.ReactNode; identity: AnalyticsIdentity | null; productionDeployment: boolean }) {
  const pathname = usePathname() ?? "/";
  const initialized = useRef(false);
  const initializationGeneration = useRef(0);
  const previousDistinctId = useRef<string | null>(null);
  const config = analyticsPublicConfig(productionDeployment);
  const surface = routeSurface(pathname);
  const allowedRoute = surface !== null;
  const eligible = Boolean(identity && config && allowedRoute);
  const configKey = config?.key ?? null;
  const configHost = config?.host ?? null;
  const distinctId = identity?.distinctId ?? null;
  const role = identity?.role ?? null;
  const signupAt = identity?.signupAt ?? null;
  const betaCohort = identity?.betaCohort ?? null;
  const eligibilityFingerprint = eligible
    ? [distinctId, role, signupAt, betaCohort, configKey, configHost, "allowed"].join("|")
    : "ineligible";

  // This only primes a bounded in-memory queue of already-sanitized coarse events. It runs before
  // child effects, which can otherwise beat the provider's dynamic import on the first render.
  useLayoutEffect(() => {
    if (previousDistinctId.current && previousDistinctId.current !== distinctId) {
      resetAnalyticsClient(true, distinctId === null);
    }
    previousDistinctId.current = distinctId;
    initialized.current = false;
    initializationGeneration.current = prepareAnalyticsInitialization(eligible);
  }, [distinctId, eligibilityFingerprint, eligible]);

  useEffect(() => installAnalyticsResetListener(() => {
    initialized.current = false;
  }), []);

  useEffect(() => {
    if (!distinctId || !role || !signupAt || !betaCohort || !configKey || !configHost || !allowedRoute || !canonicalAnalyticsRuntime(window.location)) {
      if (initialized.current) resetAnalyticsClient(!distinctId, !distinctId);
      else clearAnalyticsClient();
      initialized.current = false;
      return;
    }
    const initialPath = normalizedPagePath(window.location.pathname);
    const initialSurface = routeSurface(window.location.pathname);
    if (!initialPath || !initialSurface) {
      clearAnalyticsClient();
      return;
    }
    const generation = initializationGeneration.current;
    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      const stillCurrent = () => !cancelled && isAnalyticsInitializationCurrent(generation);
      const resetStaleSdk = () => {
        try { posthog.reset(true); } catch {}
        try { posthog.opt_out_capturing(); } catch {}
      };
      if (!stillCurrent()) return;
      const sdkConfig: Partial<PostHogConfig> = {
        api_host: configHost,
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        persistence: "memory",
        save_referrer: false,
        save_campaign_params: false,
        custom_campaign_params: [],
        disable_capture_url_hashes: true,
        disableDeviceModel: true,
        cross_subdomain_cookie: false,
        secure_cookie: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_external_dependency_loading: true,
        disable_web_experiments: true,
        enable_heatmaps: false,
        rageclick: false,
        advanced_disable_flags: true,
        opt_out_capturing_by_default: true,
        before_send: (event) => sanitizeOutgoingEvent(event, configKey),
      };
      try {
        if (!stillCurrent()) return;
        posthog.init(configKey, sdkConfig);
        if (!stillCurrent()) return resetStaleSdk();
        posthog.opt_in_capturing();
        if (!stillCurrent()) return resetStaleSdk();
        posthog.identify(distinctId, { role }, { signup_at: signupAt, beta_cohort: betaCohort });
        if (!stillCurrent()) return resetStaleSdk();
        if (!registerAnalyticsClient(posthog, generation)) return resetStaleSdk();
        initialized.current = true;
        if (shouldStartProductSession()) {
          captureProductEvent("product_session_started", {
            role,
            beta_cohort: betaCohort,
            days_since_signup_bucket: daysSinceSignupBucket(signupAt),
            entry_surface: initialSurface,
          });
        }
        posthog.capture("$pageview", { normalized_path: initialPath, entry_surface: initialSurface });
      } catch {
        resetStaleSdk();
        failAnalyticsInitialization(generation);
      }
    }).catch(() => failAnalyticsInitialization(generation));
    return () => { cancelled = true; };
  }, [allowedRoute, betaCohort, configHost, configKey, distinctId, role, signupAt]);

  useEffect(() => {
    if (!initialized.current) return;
    const path = normalizedPagePath(pathname);
    const surface = routeSurface(pathname);
    if (!path || !surface || !canonicalAnalyticsRuntime(window.location)) {
      resetAnalyticsClient();
      initialized.current = false;
      return;
    }
    // Manual only: no query, fragment, referrer, campaign, token, or user input.
    // The final before_send hook rebuilds the payload again.
    captureManualPageview(path, surface);
  }, [pathname]);

  return children;
}
