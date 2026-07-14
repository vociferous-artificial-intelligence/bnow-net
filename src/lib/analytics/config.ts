export interface AnalyticsPublicConfig { key: string; host: "https://us.i.posthog.com" | "https://eu.i.posthog.com" }
export interface AnalyticsPublicEnv { NEXT_PUBLIC_POSTHOG_KEY?: string; NEXT_PUBLIC_POSTHOG_HOST?: string }

const HOSTS = new Set<AnalyticsPublicConfig["host"]>([
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
]);

// Next.js only substitutes NEXT_PUBLIC values when they are referenced as direct property
// accesses. Do not alias process.env here: doing so leaves a runtime process.env lookup in the
// browser bundle and silently disables analytics even after an operator configures the key.
const CONFIGURED_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const CONFIGURED_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export function analyticsPublicConfig(
  productionDeployment: boolean,
  env?: AnalyticsPublicEnv,
): AnalyticsPublicConfig | null {
  if (!productionDeployment) return null;
  const source = env ?? {
    NEXT_PUBLIC_POSTHOG_KEY: CONFIGURED_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: CONFIGURED_HOST,
  };
  const key = source.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = source.NEXT_PUBLIC_POSTHOG_HOST?.trim() as AnalyticsPublicConfig["host"] | undefined;
  if (!key || !/^phc_[A-Za-z0-9_-]+$/.test(key) || !host || !HOSTS.has(host)) return null;
  return { key, host };
}

export function canonicalAnalyticsRuntime(location: Pick<Location, "hostname" | "protocol">): boolean {
  return location.protocol === "https:" && location.hostname.toLowerCase() === "bnow.net";
}
