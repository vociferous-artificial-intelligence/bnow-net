export const ATTRIBUTION_VALUE_MAX = 100;
export const ACCESS_LANDING_PATH = "/access";

export interface AccessAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: typeof ACCESS_LANDING_PATH | null;
  referrerHost: string | null;
}

const CAMPAIGN_VALUE = /^[a-z0-9][a-z0-9._~-]*$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Conservative campaign token: one scalar, normalized lowercase, never arbitrary query text. */
export function normalizeCampaignValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > ATTRIBUTION_VALUE_MAX) return null;
  return CAMPAIGN_VALUE.test(normalized) ? normalized : null;
}

/** Landing attribution is intentionally a one-route allowlist, not a general URL field. */
export function normalizeLandingPath(value: unknown): typeof ACCESS_LANDING_PATH | null {
  return value === ACCESS_LANDING_PATH ? ACCESS_LANDING_PATH : null;
}

/** Accept hostname only. Paths, queries, fragments, credentials, and ports fail closed. */
export function normalizeReferrerHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || /[\s/@:?#]/.test(normalized)) return null;
  return HOSTNAME.test(normalized) ? normalized : null;
}

/** Extract only the hostname from an initial HTTP(S) Referer header. */
export function referrerHostFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return null;
    }
    return normalizeReferrerHost(url.hostname);
  } catch {
    return null;
  }
}

export function accessAttributionFromForm(formData: FormData): AccessAttribution {
  return {
    utmSource: normalizeCampaignValue(formData.get("utm_source")),
    utmMedium: normalizeCampaignValue(formData.get("utm_medium")),
    utmCampaign: normalizeCampaignValue(formData.get("utm_campaign")),
    landingPath: normalizeLandingPath(formData.get("landing_path")),
    referrerHost: normalizeReferrerHost(formData.get("referrer_host")),
  };
}
