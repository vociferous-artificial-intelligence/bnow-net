import { ANALYTICS_THEATERS, PRODUCT_EVENT_NAMES, type ProductEventName, type ProductEventProperties, routeSurface } from "./events";
import type { CaptureResult } from "posthog-js";

const FORBIDDEN = /(^|_)(email|name|linkedin|ip|user_agent|q|query|question|search_text|claim_id|source_id|doc_id|raw_document|token|url|referrer|utm)(_|$)/i;

function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeScalar(value: unknown): value is string | boolean {
  return typeof value === "boolean" || (typeof value === "string" && value.length <= 80 && !/[\r\n]/.test(value));
}

const KEYS: { [K in ProductEventName]: ReadonlyArray<keyof ProductEventProperties[K]> } = {
  product_session_started: ["role", "beta_cohort", "days_since_signup_bucket", "entry_surface"],
  digest_viewed: ["theater", "digest_age_bucket", "track_count_bucket"],
  evidence_opened: ["surface", "theater", "source_count_bucket", "hedging_class"],
  source_link_clicked: ["surface", "theater", "platform"],
  search_completed: ["has_results", "result_count_bucket", "window_present"],
  ask_completed: ["state", "evidence_count_bucket", "retrieval_mode", "window_present"],
  ask_started: ["entry"],
  signal_detail_viewed: ["theater", "signal_type", "evidence_count_bucket"],
  feedback_initiated: ["surface", "theater"],
  claim_copied: ["surface", "copy_mode", "theater", "hedging_class", "evidence_count_bucket"],
  digest_print_initiated: ["theater", "print_mode", "digest_age_bucket"],
};

const ENUMS: Record<ProductEventName, Record<string, ReadonlySet<unknown>>> = {
  product_session_started: {
    role: new Set(["user", "analyst", "admin"]), beta_cohort: new Set(["private_beta_2026_07"]),
    days_since_signup_bucket: new Set(["0", "1", "2", "3-7", "8-14", "15+"]),
    entry_surface: new Set(["home", "countries", "digest", "scoreboard", "signals", "ask", "search", "entities", "trade", "datadark", "critical_materials", "account"]),
  },
  digest_viewed: { theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), digest_age_bucket: new Set(["today", "1-7d", "older"]), track_count_bucket: new Set(["1", "2-3", "4+"]) },
  evidence_opened: { surface: new Set(["digest", "ask_cited", "ask_related", "search", "signal", "entity"]), theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), source_count_bucket: new Set(["1", "2-3", "4+"]), hedging_class: new Set(["confirmed", "assessed", "claimed", "unverified", "unknown"]) },
  source_link_clicked: { surface: new Set(["digest", "ask_cited", "ask_related", "search", "signal", "entity"]), theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), platform: new Set(["rss_news", "gdelt", "telegram", "x", "procurement", "other"]) },
  search_completed: { has_results: new Set([true, false]), result_count_bucket: new Set(["0", "1-5", "6-20", "21+"]), window_present: new Set([true, false]) },
  ask_completed: { state: new Set(["answered", "insufficient", "refused", "error", "limit"]), evidence_count_bucket: new Set(["0", "1", "2-5", "6+"]), retrieval_mode: new Set(["legacy", "v2", "v2-lexical-only"]), window_present: new Set([true, false]) },
  ask_started: { entry: new Set(["form", "intent"]) },
  signal_detail_viewed: { theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), signal_type: new Set(["purge", "procurement_surge", "data_dark", "trade_divergence", "pressure_spike"]), evidence_count_bucket: new Set(["0", "1", "2-5", "6+"]) },
  feedback_initiated: { surface: new Set(["digest_error", "source_suggestion"]), theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]) },
  claim_copied: { surface: new Set(["digest", "ask_cited", "ask_related", "search", "signal", "entity"]), copy_mode: new Set(["report", "link", "evidence", "text"]), theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), hedging_class: new Set(["confirmed", "assessed", "claimed", "unverified", "unknown"]), evidence_count_bucket: new Set(["0", "1", "2-5", "6+"]) },
  digest_print_initiated: { theater: new Set(["ru", "ua", "ir", "il", "sa", "ae", "qa", "om", "bh", "kw", "other"]), print_mode: new Set(["brief", "evidence"]), digest_age_bucket: new Set(["today", "1-7d", "older"]) },
};

export function sanitizeProductProperties<K extends ProductEventName>(
  name: K,
  input: unknown,
): ProductEventProperties[K] | null {
  if (!plain(input)) return null;
  const allowed = new Set<string>(KEYS[name] as string[]);
  const output: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || FORBIDDEN.test(key) || !safeScalar(value)) return null;
    output[key] = value;
  }
  if (Object.keys(output).some((key) => !allowed.has(key))) return null;
  // Event components can only construct closed TypeScript values; this runtime guard also
  // rejects missing/extra keys and obvious attempts to smuggle content through a typed seam.
  const required = name === "feedback_initiated" ? ["surface"] : (KEYS[name] as string[]);
  if (required.some((key) => !(key in output))) return null;
  if (Object.entries(output).some(([key, value]) => !ENUMS[name][key]?.has(value))) return null;
  return output as ProductEventProperties[K];
}

function pickSdkProductProperties<K extends ProductEventName>(
  name: K,
  input: Record<string, unknown>,
): ProductEventProperties[K] | null {
  const selected: Record<string, unknown> = {};
  for (const key of KEYS[name] as string[]) {
    if (key in input) selected[key] = input[key];
  }
  // SDK-added properties are intentionally discarded here. Product callers already pass the
  // exact-key guard above, so this second pass rebuilds the final network payload without URLs,
  // referrers, campaigns, device fingerprints, or future automatic SDK additions.
  return sanitizeProductProperties(name, selected);
}

function rebuiltCapture(
  input: CaptureResult,
  properties: CaptureResult["properties"],
  personProperties?: Pick<CaptureResult, "$set" | "$set_once">,
): CaptureResult {
  return {
    uuid: input.uuid,
    event: input.event,
    properties,
    ...(personProperties ?? {}),
    ...(input.timestamp ? { timestamp: input.timestamp } : {}),
  };
}

export function normalizedPagePath(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (!path.startsWith("/")) return null;
  if (routeSurface(path) && !path.includes(":")) {
    if (["/", "/countries", "/scoreboard", "/signals", "/ask", "/search", "/entities", "/trade", "/datadark", "/critical-materials", "/account"].includes(path)) return path;
    const segments = path.split("/").filter(Boolean);
    if (segments[0] === "countries" && segments.length === 2 && ANALYTICS_THEATERS.has(segments[1])) return "/countries/:theater";
    if (segments[0] === "digests" && segments.length === 2 && ANALYTICS_THEATERS.has(segments[1])) return "/digests/:theater";
    if (segments[0] === "digests" && segments.length === 3 && ANALYTICS_THEATERS.has(segments[1]) && /^\d{4}-\d{2}-\d{2}$/.test(segments[2])) return "/digests/:theater/:date";
    if (segments[0] === "scoreboard" && segments.length === 3 && ANALYTICS_THEATERS.has(segments[1]) && /^\d{4}-\d{2}-\d{2}$/.test(segments[2])) return "/scoreboard/:theater/:date";
    if (segments[0] === "entities" && segments.length === 2) return "/entities/:id";
  }
  if (["/countries/:theater", "/digests/:theater", "/digests/:theater/:date", "/scoreboard/:theater/:date", "/entities/:id"].includes(path)) return path;
  return null;
}

/** Final SDK boundary: rebuild rather than spread SDK-added URL/campaign/device properties. */
export function sanitizeOutgoingEvent(
  input: CaptureResult | null,
  expectedPublicKey: string,
): CaptureResult | null {
  if (!input) return null;
  const name = input.event;
  const props = plain(input.properties) ? input.properties : {};
  const token = props.token;
  if (token !== expectedPublicKey || !/^phc_[A-Za-z0-9_-]+$/.test(expectedPublicKey)) return null;
  const distinctId = typeof props.distinct_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(props.distinct_id)
    ? props.distinct_id
    : null;
  if (!distinctId) return null;

  if (PRODUCT_EVENT_NAMES.has(name as ProductEventName)) {
    const safe = pickSdkProductProperties(name as ProductEventName, props);
    if (!safe) return null;
    return rebuiltCapture(input, {
      ...safe,
      token,
      distinct_id: distinctId,
      environment: "production",
      site_domain: "bnow.net",
    });
  }
  if (name === "$pageview") {
    const path = normalizedPagePath(String(props.normalized_path ?? ""));
    const surface = typeof props.entry_surface === "string" && routeSurface(path ?? "") === props.entry_surface
      ? props.entry_surface
      : null;
    if (!path || !surface) return null;
    return rebuiltCapture(input, {
      token,
      distinct_id: distinctId,
      normalized_path: path,
      entry_surface: surface,
      $current_url: `https://bnow.net${path}`,
      $pathname: path,
      environment: "production",
      site_domain: "bnow.net",
    });
  }
  if (name === "$identify") {
    const set = plain(input.$set) ? input.$set : {};
    const once = plain(input.$set_once) ? input.$set_once : {};
    const role = set.role;
    const signup = once.signup_at;
    const cohort = once.beta_cohort;
    if (!(["user", "analyst", "admin"] as unknown[]).includes(role) || typeof signup !== "string" || signup.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(signup) || !Number.isFinite(Date.parse(signup)) || cohort !== "private_beta_2026_07") return null;
    return rebuiltCapture(input, {
      token,
      distinct_id: distinctId,
      environment: "production",
      site_domain: "bnow.net",
    }, {
      $set: { role },
      $set_once: { signup_at: signup, beta_cohort: cohort },
    });
  }
  return null;
}
