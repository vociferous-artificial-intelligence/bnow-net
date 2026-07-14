import type { ClaimCopySurface } from "@/components/claim-copy-model";
import type { EvidencePlatform } from "@/components/claim-evidence-model";

export type AnalyticsTheater =
  | "ru"
  | "ua"
  | "ir"
  | "il"
  | "sa"
  | "ae"
  | "qa"
  | "om"
  | "bh"
  | "kw"
  | "other";
export type AnalyticsHedging = "confirmed" | "assessed" | "claimed" | "unverified" | "unknown";
export type ResultCountBucket = "0" | "1-5" | "6-20" | "21+";
export type EvidenceCountBucket = "0" | "1" | "2-5" | "6+";
export type SourceCountBucket = "1" | "2-3" | "4+";
export type TrackCountBucket = "1" | "2-3" | "4+";
export type DigestAgeBucket = "today" | "1-7d" | "older";
export type SignalType = "purge" | "procurement_surge" | "data_dark" | "trade_divergence" | "pressure_spike";
export type FeedbackSurface = "digest_error" | "source_suggestion";

export interface EvidenceAnalyticsContext {
  surface: ClaimCopySurface;
  theater: string;
  hedgingClass: string;
  sourceCount: number;
}

const THEATERS = new Set<AnalyticsTheater>(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw"]);
const HEDGING = new Set<AnalyticsHedging>(["confirmed", "assessed", "claimed", "unverified", "unknown"]);
const SIGNAL_TYPES = new Set<SignalType>(["purge", "procurement_surge", "data_dark", "trade_divergence", "pressure_spike"]);

export function analyticsTheater(value: string): AnalyticsTheater {
  const normalized = value.trim().toLowerCase() as AnalyticsTheater;
  return THEATERS.has(normalized) ? normalized : "other";
}

export function analyticsHedging(value: string): AnalyticsHedging {
  const normalized = value.trim().toLowerCase() as AnalyticsHedging;
  return HEDGING.has(normalized) ? normalized : "unknown";
}

export function analyticsSignalType(value: string): SignalType | null {
  const normalized = value.trim().toLowerCase() as SignalType;
  return SIGNAL_TYPES.has(normalized) ? normalized : null;
}

export function resultCountBucket(count: number): ResultCountBucket {
  if (count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  return "21+";
}

export function evidenceCountBucket(count: number): EvidenceCountBucket {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  return "6+";
}

export function sourceCountBucket(count: number): SourceCountBucket {
  if (count <= 1) return "1";
  if (count <= 3) return "2-3";
  return "4+";
}

export function trackCountBucket(count: number): TrackCountBucket {
  if (count <= 1) return "1";
  if (count <= 3) return "2-3";
  return "4+";
}

export function digestAgeBucket(digestDate: string, now: Date = new Date()): DigestAgeBucket {
  const digestMs = Date.parse(`${digestDate}T00:00:00Z`);
  if (!Number.isFinite(digestMs)) return "older";
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayMs - digestMs) / 86_400_000);
  if (days <= 0) return "today";
  if (days <= 7) return "1-7d";
  return "older";
}

export function analyticsPlatform(value: EvidencePlatform): EvidencePlatform {
  return value;
}
