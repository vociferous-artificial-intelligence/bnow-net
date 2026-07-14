export type AnalyticsRole = "user" | "analyst" | "admin";
export type AnalyticsTheater = "ru" | "ua" | "ir" | "il" | "sa" | "ae" | "qa" | "om" | "bh" | "kw" | "other";
export type AnalyticsSurface = "digest" | "ask_cited" | "ask_related" | "search" | "signal" | "entity";
export type EntrySurface = "home" | "countries" | "digest" | "scoreboard" | "signals" | "ask" | "search" | "entities" | "trade" | "datadark" | "critical_materials" | "account";
export type DaysSinceSignupBucket = "0" | "1" | "2" | "3-7" | "8-14" | "15+";
export type DigestAgeBucket = "today" | "1-7d" | "older";
export type HedgingClass = "confirmed" | "assessed" | "claimed" | "unverified" | "unknown";
export type EvidenceCountBucket = "0" | "1" | "2-5" | "6+";
export type CountBucket = "1" | "2-3" | "4+";
export type ResultCountBucket = "0" | "1-5" | "6-20" | "21+";
export type EvidencePlatform = "rss_news" | "gdelt" | "telegram" | "x" | "procurement" | "other";

export const ANALYTICS_THEATERS = new Set<string>([
  "ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw",
]);

export interface ProductEventProperties {
  product_session_started: { role: AnalyticsRole; beta_cohort: "private_beta_2026_07"; days_since_signup_bucket: DaysSinceSignupBucket; entry_surface: EntrySurface };
  digest_viewed: { theater: AnalyticsTheater; digest_age_bucket: DigestAgeBucket; track_count_bucket: CountBucket };
  evidence_opened: { surface: AnalyticsSurface; theater: AnalyticsTheater; source_count_bucket: CountBucket; hedging_class: HedgingClass };
  source_link_clicked: { surface: AnalyticsSurface; theater: AnalyticsTheater; platform: EvidencePlatform };
  search_completed: { has_results: boolean; result_count_bucket: ResultCountBucket; window_present: boolean };
  ask_completed: { state: "answered" | "insufficient" | "refused" | "error" | "limit"; evidence_count_bucket: EvidenceCountBucket; retrieval_mode: "legacy" | "v2" | "v2-lexical-only"; window_present: boolean };
  signal_detail_viewed: { theater: AnalyticsTheater; signal_type: "purge" | "procurement_surge" | "data_dark" | "trade_divergence" | "pressure_spike"; evidence_count_bucket: EvidenceCountBucket };
  feedback_initiated: { surface: "digest_error" | "source_suggestion"; theater?: AnalyticsTheater };
  claim_copied: { surface: AnalyticsSurface; copy_mode: "report" | "link" | "evidence" | "text"; theater: AnalyticsTheater; hedging_class: HedgingClass; evidence_count_bucket: EvidenceCountBucket };
  digest_print_initiated: { theater: AnalyticsTheater; print_mode: "brief" | "evidence"; digest_age_bucket: DigestAgeBucket };
}

export type ProductEventName = keyof ProductEventProperties;
export const PRODUCT_EVENT_NAMES = new Set<ProductEventName>([
  "product_session_started", "digest_viewed", "evidence_opened", "source_link_clicked",
  "search_completed", "ask_completed", "signal_detail_viewed", "feedback_initiated",
  "claim_copied", "digest_print_initiated",
]);

const STATIC_ROUTES = new Map<string, EntrySurface>([
  ["/", "home"], ["/countries", "countries"], ["/scoreboard", "scoreboard"],
  ["/signals", "signals"], ["/ask", "ask"], ["/search", "search"],
  ["/entities", "entities"], ["/trade", "trade"], ["/datadark", "datadark"],
  ["/critical-materials", "critical_materials"], ["/account", "account"],
  ["/countries/:theater", "countries"], ["/digests/:theater", "digest"],
  ["/digests/:theater/:date", "digest"], ["/scoreboard/:theater/:date", "scoreboard"],
  ["/entities/:id", "entities"],
]);

export function routeSurface(pathname: string): EntrySurface | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  const exact = STATIC_ROUTES.get(pathname);
  if (exact) return exact;
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "countries" && segments.length === 2 && ANALYTICS_THEATERS.has(segments[1])) return "countries";
  if (segments[0] === "digests" && segments.length === 2 && ANALYTICS_THEATERS.has(segments[1])) return "digest";
  if (segments[0] === "digests" && segments.length === 3 && ANALYTICS_THEATERS.has(segments[1]) && /^\d{4}-\d{2}-\d{2}$/.test(segments[2])) return "digest";
  if (segments[0] === "scoreboard" && segments.length === 3 && ANALYTICS_THEATERS.has(segments[1]) && /^\d{4}-\d{2}-\d{2}$/.test(segments[2])) return "scoreboard";
  if (segments[0] === "entities" && segments.length === 2 && segments[1].length > 0) return "entities";
  return null;
}

export function daysSinceSignupBucket(signupAt: string, now = new Date()): DaysSinceSignupBucket {
  const created = Date.parse(signupAt);
  if (!Number.isFinite(created)) return "15+";
  const days = Math.max(0, Math.floor((now.getTime() - created) / 86_400_000));
  if (days <= 2) return String(days) as "0" | "1" | "2";
  if (days <= 7) return "3-7";
  if (days <= 14) return "8-14";
  return "15+";
}
