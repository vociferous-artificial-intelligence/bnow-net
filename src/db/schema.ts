import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------- enums ----------

export const countryStatusEnum = pgEnum("country_status", [
  "active",
  "scaffolded",
  "deferred",
]);

export const platformEnum = pgEnum("platform", [
  "telegram",
  "x",
  "state_media",
  "independent_media",
  "gov",
  "other",
]);

export const hedgingEnum = pgEnum("hedging", [
  "confirmed",
  "claimed",
  "unverified",
  "assessed",
  "unknown",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "active",
  "decayed",
  "dead",
]);

export const digestStatusEnum = pgEnum("digest_status", [
  "pending",
  "generated",
  "published",
  "failed",
]);

export const planIntervalEnum = pgEnum("plan_interval", ["month", "year"]);

// ---------- core intelligence tables ----------

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  iso2: text("iso2").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: countryStatusEnum("status").notNull().default("scaffolded"),
  // feed URLs, telegram channel lists, digest prompt pack — the "new country playbook" is config
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    domain: text("domain").notNull(),
    platform: platformEnum("platform").notNull().default("other"),
    name: text("name"),
    countryId: integer("country_id").references(() => countries.id),
    citationCount: integer("citation_count").notNull().default(0),
    firstCitedReportDate: date("first_cited_report_date"),
    lastCitedReportDate: date("last_cited_report_date"),
    hedgingConfirmed: integer("hedging_confirmed").notNull().default(0),
    hedgingClaimed: integer("hedging_claimed").notNull().default(0),
    hedgingUnverified: integer("hedging_unverified").notNull().default(0),
    hedgingAssessed: integer("hedging_assessed").notNull().default(0),
    hedgingUnknown: integer("hedging_unknown").notNull().default(0),
    // reliabilityScore is derived from hedging distribution; recomputed on registry materialization
    reliabilityScore: doublePrecision("reliability_score"),
    decayed: boolean("decayed").notNull().default(false),
    status: sourceStatusEnum("status").notNull().default("active"),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sources_canonical_url_idx").on(t.canonicalUrl),
    index("sources_domain_idx").on(t.domain),
    index("sources_platform_idx").on(t.platform),
  ],
);

// Per-theater registry aggregates: a source's citation/hedging profile in ONE
// reference corpus (ru = ROCA, ir = Iran Update). The global columns on `sources`
// aggregate across all theaters; theater pages and detail-page breakdowns read
// from here. Recomputed wholesale by scripts/registry-materialize.ts.
export const sourceTheaterStats = pgTable(
  "source_theater_stats",
  {
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    theater: text("theater").notNull(), // ru|ir
    citationCount: integer("citation_count").notNull().default(0),
    firstCitedReportDate: date("first_cited_report_date"),
    lastCitedReportDate: date("last_cited_report_date"),
    hedgingConfirmed: integer("hedging_confirmed").notNull().default(0),
    hedgingClaimed: integer("hedging_claimed").notNull().default(0),
    hedgingUnverified: integer("hedging_unverified").notNull().default(0),
    hedgingAssessed: integer("hedging_assessed").notNull().default(0),
    hedgingUnknown: integer("hedging_unknown").notNull().default(0),
    reliabilityScore: doublePrecision("reliability_score"),
    decayed: boolean("decayed").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.theater] }),
    index("source_theater_stats_theater_idx").on(t.theater),
  ],
);

export const iswReports = pgTable(
  "isw_reports",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    // reference theater: 'ru' = ROCA (Russia/Ukraine), 'ir' = ISW Iran Update
    theater: text("theater").notNull().default("ru"),
    reportDate: date("report_date").notNull(),
    title: text("title"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    parseStatus: text("parse_status").notNull().default("pending"), // pending|parsed|failed
    endnoteCount: integer("endnote_count").notNull().default(0),
    citationCount: integer("citation_count").notNull().default(0),
    // derived-only data (event/claim skeleton for validation); NEVER report prose
    derived: jsonb("derived").notNull().default({}),
  },
  (t) => [
    uniqueIndex("isw_reports_url_idx").on(t.url),
    uniqueIndex("isw_reports_theater_date_idx").on(t.theater, t.reportDate),
  ],
);

export const sourceCitations = pgTable(
  "source_citations",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => iswReports.id),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    rawUrl: text("raw_url").notNull(),
    endnoteIndex: integer("endnote_index"),
    hedging: hedgingEnum("hedging").notNull().default("unknown"),
    // short matched cue phrase only (e.g. "reportedly"), never sentence-length ISW prose
    hedgingCue: text("hedging_cue"),
  },
  (t) => [
    index("source_citations_report_idx").on(t.reportId),
    index("source_citations_source_idx").on(t.sourceId),
    uniqueIndex("source_citations_dedupe_idx").on(t.reportId, t.rawUrl, t.endnoteIndex),
  ],
);

export const rawDocuments = pgTable(
  "raw_documents",
  {
    id: serial("id").primaryKey(),
    adapter: text("adapter").notNull(), // rss|gdelt|telegram_web|x_api|manual
    sourceId: integer("source_id").references(() => sources.id),
    externalId: text("external_id"),
    url: text("url"),
    title: text("title"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    lang: text("lang"),
    countryIso2: text("country_iso2"), // primary theater tag; multi-tag lives in meta
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    embedding: vector("embedding", { dimensions: 1536 }),
    // MAP-STAGE DISPOSITION FLAG (repurposed 2026-07-09; dead 0-rows-true before).
    // true = the map worker reached a FINAL disposition for this doc: mapped under
    // every applicable track (doc_map_state rows), recorded as a near/exact-dupe
    // mirror (doc_dedup row), or eligible but matching no track lexicon. Docs the
    // worker never selects (out-of-scope theaters, length<40, stubs, held-out
    // channels) stay false. It has no other meaning; the digest path never reads
    // or writes it. An extractor_version bump re-maps via doc_map_state anti-join,
    // not this flag.
    processed: boolean("processed").notNull().default(false),
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [
    uniqueIndex("raw_documents_hash_idx").on(t.contentHash),
    index("raw_documents_adapter_idx").on(t.adapter),
    index("raw_documents_country_idx").on(t.countryIso2),
    index("raw_documents_published_idx").on(t.publishedAt),
    index("raw_documents_processed_idx").on(t.processed),
  ],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id),
    eventDate: date("event_date").notNull(),
    // Same intelligence track as the owning digest. Without it the three tracks
    // of one (country, date) share a key space: the regeneration sweep that
    // clears a track's orphaned events cannot tell them apart, which is a
    // correctness hazard the moment the digest matrix stops running serially.
    track: text("track").notNull().default("military"),
    type: text("type").notNull().default("other"),
    title: text("title").notNull(),
    summary: text("summary"),
    clusterKey: text("cluster_key"),
    confidence: doublePrecision("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_country_date_idx").on(t.countryId, t.eventDate)],
);

export const digests = pgTable(
  "digests",
  {
    id: serial("id").primaryKey(),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id),
    digestDate: date("digest_date").notNull(),
    // intelligence track: 'military' (ISW-validated) | 'elite_politics' (Kremlinology)
    track: text("track").notNull().default("military"),
    status: digestStatusEnum("status").notNull().default("pending"),
    // structured: { events: [...], assessments: [...], stats: {...} } — claim ids only, text joined at render
    structured: jsonb("structured").notNull().default({}),
    renderedMd: text("rendered_md"),
    provider: text("provider"), // openai|stub
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("digests_country_date_track_idx").on(t.countryId, t.digestDate, t.track)],
);

export const claims = pgTable(
  "claims",
  {
    id: serial("id").primaryKey(),
    countryId: integer("country_id")
      .notNull()
      .references(() => countries.id),
    digestId: integer("digest_id").references(() => digests.id),
    eventId: integer("event_id").references(() => events.id),
    text: text("text").notNull(),
    claimType: text("claim_type").notNull().default("factual"),
    hedging: hedgingEnum("hedging").notNull().default("unknown"),
    confidence: doublePrecision("confidence"),
    claimDate: date("claim_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("claims_country_date_idx").on(t.countryId, t.claimDate),
    index("claims_digest_idx").on(t.digestId),
    // ASK Tier-2+ (workstream A): the lexical retrieval arm (workstream B) matches
    // the question against claim text via full-text search. Claim text is English
    // digest output. GIN over to_tsvector keeps that ranking cheap at query time.
    index("claims_text_fts_idx").using("gin", sql`to_tsvector('english', ${t.text})`),
  ],
);

// TRACEABILITY INVARIANT: every claim must reference >=1 raw document.
// Enforced by a DEFERRABLE constraint trigger — inserting a claim without a
// claim_sources row in the same transaction fails at COMMIT.
//
// Drizzle cannot model it, so `drizzle-kit generate` neither emits nor preserves
// it. drizzle/9999_claim_source_trigger.sql re-asserts it idempotently after all
// generated DDL, and src/db/migrations.test.ts fails if that file ever stops doing
// so. Do not rely on drizzle/0000_*.sql, which a regeneration could replace.
export const claimSources = pgTable(
  "claim_sources",
  {
    claimId: integer("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    rawDocumentId: integer("raw_document_id")
      .notNull()
      .references(() => rawDocuments.id),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.rawDocumentId] }),
    index("claim_sources_doc_idx").on(t.rawDocumentId),
  ],
);

export const validationRuns = pgTable(
  "validation_runs",
  {
    id: serial("id").primaryKey(),
    digestId: integer("digest_id")
      .notNull()
      .references(() => digests.id),
    iswReportId: integer("isw_report_id")
      .notNull()
      .references(() => iswReports.id),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    coveragePct: doublePrecision("coverage_pct"),
    unsupportedClaimRate: doublePrecision("unsupported_claim_rate"),
    timelinessHours: doublePrecision("timeliness_hours"),
    // [{ ourClaimId?, iswEventKey, kind: 'agreement'|'divergence'|'isw_only'|'ours_only', note }]
    divergences: jsonb("divergences").notNull().default([]),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [uniqueIndex("validation_runs_digest_report_idx").on(t.digestId, t.iswReportId)],
);

// entity graph for elite-politics tracking: who is being prosecuted / promoted /
// stripped of assets, and which network they belong to
export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull().default("person"), // person|agency|company|faction|org
    name: text("name").notNull(), // canonical English name
    aliases: jsonb("aliases").notNull().default([]), // ["Тимур Иванов", ...]
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entities_kind_name_idx").on(t.kind, t.name)],
);

// Ownership / connection graph: directed edges between entities (owns, director,
// PSC, subsidiary, associate). Narrows the Kharon/Sayari gap. Sourced + attributed.
export const entityLinks = pgTable(
  "entity_links",
  {
    id: serial("id").primaryKey(),
    fromEntityId: integer("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: integer("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(), // owns|director|psc|subsidiary|associate|officer
    source: text("source").notNull(), // opensanctions|companies_house|opencorporates|manual
    since: text("since"), // free-text date/context as reported
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_links_key_idx").on(t.fromEntityId, t.toEntityId, t.relation, t.source),
    index("entity_links_from_idx").on(t.fromEntityId),
    index("entity_links_to_idx").on(t.toEntityId),
  ],
);

export const claimEntities = pgTable(
  "claim_entities",
  {
    claimId: integer("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id),
    // defendant|prosecutor|target|beneficiary|appointee|dismissed|patron|other
    role: text("role").notNull().default("other"),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.entityId] }),
    index("claim_entities_entity_idx").on(t.entityId),
  ],
);

// Mirror-trade: partner-country-reported bilateral trade with Russia, used to
// reconstruct RU trade (customs dark since Jan 2022) and flag evasion/rerouting
// through transit hubs. See docs/COMPETITIVE-AND-DEMAND.md §3.
export const tradeFlows = pgTable(
  "trade_flows",
  {
    id: serial("id").primaryKey(),
    reporterCode: integer("reporter_code").notNull(), // UN M49, the reporting country
    reporterName: text("reporter_name").notNull(),
    partnerCode: integer("partner_code").notNull(), // 643 = Russia
    // Upstream Comtrade partnerDesc when supplied (2026-07-13, migration 0019);
    // read path falls back to the deterministic M49 map for legacy/missing rows
    // (src/lib/trade/partners.ts).
    partnerName: text("partner_name"),
    flowCode: text("flow_code").notNull(), // X=export, M=import (reporter's perspective)
    hsCode: text("hs_code").notNull(), // "TOTAL" or HS chapter/heading
    period: text("period").notNull(), // "2023" (annual) or "202312" (monthly)
    valueUsd: doublePrecision("value_usd").notNull(),
    netWeightKg: doublePrecision("net_weight_kg"),
    source: text("source").notNull().default("comtrade"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trade_flows_key_idx").on(
      t.reporterCode,
      t.partnerCode,
      t.flowCode,
      t.hsCode,
      t.period,
    ),
    index("trade_flows_reporter_idx").on(t.reporterCode),
    index("trade_flows_hs_idx").on(t.hsCode),
  ],
);

// Data-dark tracker: watched Russian statistical publications. A series going
// stale or vanishing is itself intelligence (Rosstat classified 400+ indicators
// since early 2025) — see docs/RUSSIA-DATA-ROADMAP.md §1.
export const watchedSeries = pgTable(
  "watched_series",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(), // stable slug
    label: text("label").notNull(),
    agency: text("agency").notNull(), // Rosstat|MinFin|CBR|Customs|...
    url: text("url").notNull(),
    cadenceDays: integer("cadence_days").notNull().default(30), // expected update interval
    // 'live' = we can fetch + detect freshness; 'classified' = known suppressed (seeded);
    // 'unreachable' = host blocks us but not necessarily classified
    baselineStatus: text("baseline_status").notNull().default("live"),
    note: text("note"),
    // current computed state, refreshed by the cron
    status: text("status").notNull().default("unknown"), // ok|stale|gone|classified|unreachable|unknown
    lastSeenPeriod: text("last_seen_period"), // e.g. "2025-05" or an ISO date string
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    history: jsonb("history").notNull().default([]), // [{at, status, period}]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("watched_series_agency_idx").on(t.agency)],
);

// ---------- auth (Auth.js drizzle adapter shape) ----------

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 'user' | 'analyst' | 'admin' (hierarchy in that order); plain text, not a pg
    // enum, so this migration stays additive (AGENTS.md ruling 5) — see src/lib/gate.ts.
    role: text("role").notNull().default("user"),
    // Optional product analytics is explicitly permissioned. Existing users begin unset;
    // only the authoritative legal/account actions may set granted or denied.
    analyticsPreference: text("analytics_preference").notNull().default("unset"),
    analyticsPreferenceUpdatedAt: timestamp("analytics_preference_updated_at", {
      withTimezone: true,
    }),
  },
  (t) => [
    check(
      "users_analytics_preference_check",
      sql`${t.analyticsPreference} IN ('unset', 'granted', 'denied')`,
    ),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------- legal acceptance (append-only clickwrap record) ----------

// One row per (user, terms_version, privacy_version) the user has accepted. APPEND-ONLY:
// a policy version bump inserts a NEW row, it never updates an old one, so the table is a
// full acceptance history. The unique index makes the first-login insert idempotent. Only
// the minimum evidence is stored — NO IP, user-agent, session/verification token, question
// content, birth date, or physical address (src/lib/legal/acceptance.ts enforces this).
export const policyAcceptances = pgTable(
  "policy_acceptances",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    // Server/DB-generated acceptance instant — the browser clock never sets this.
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    adultAttested: boolean("adult_attested").notNull(),
    privacyAcknowledged: boolean("privacy_acknowledged").notNull(),
    acceptanceMethod: text("acceptance_method").notNull().default("first_login_clickwrap"),
    locale: text("locale"),
  },
  (t) => [
    // Idempotency + the current-version lookup (its leftmost prefix is user_id).
    uniqueIndex("policy_acceptances_user_versions_uq").on(
      t.userId,
      t.termsVersion,
      t.privacyVersion,
    ),
    // History listing by user (a user's full acceptance timeline).
    index("policy_acceptances_user_idx").on(t.userId),
  ],
);

// ---------- billing ----------

export const plans = pgTable("plans", {
  code: text("code").primaryKey(), // standby | full_monthly | full_annual
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  interval: planIntervalEnum("interval").notNull(),
  stripePriceId: text("stripe_price_id"),
  active: boolean("active").notNull().default(true),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    planCode: text("plan_code")
      .notNull()
      .references(() => plans.code),
    status: text("status").notNull().default("pending"), // pending|active|past_due|canceled
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId)],
);

// Access requests: originally pricing-page interest capture, extended 2026-07-13 for
// private-beta access requests (structured fields, not data packed into `note`).
// linkedin_url is stored exactly as volunteered — never fetched, scraped, or enriched.
// request_status drives the operator review flow ('new' → 'approved'/'declined'); an
// approved row is one of the SIGNIN_MODE=invite eligibility sources. plan_code stays
// NULL for beta requests.
export const subscribeIntents = pgTable("subscribe_intents", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  planCode: text("plan_code").references(() => plans.code),
  note: text("note"),
  linkedinUrl: text("linkedin_url"),
  useCase: text("use_case"),
  requestStatus: text("request_status").notNull().default("new"),
  source: text("source"),
  // First-party acquisition attribution. Values are strictly normalized before insert;
  // arbitrary query strings and full referrer URLs are never stored.
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  landingPath: text("landing_path"),
  referrerHost: text("referrer_host"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// per-question /ask usage: rate limiting (per-user/day + global LLM budget/day)
// now, per-user billing later
export const askUsage = pgTable(
  "ask_usage",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(), // 'anonymous' only when the auth gate is off
    question: text("question").notNull(),
    provider: text("provider"), // openai:<model>|stub|none|error
    promptTokens: integer("prompt_tokens"), // ANSWER-stage prompt tokens (historical meaning kept)
    completionTokens: integer("completion_tokens"), // ANSWER-stage completion tokens (historical meaning kept)
    costUsd: doublePrecision("cost_usd").notNull().default(0), // TOTAL cost across ALL stages (embed+rerank+answer)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // ---- ASK v2 per-stage metering (Tier-2+ sprint, 2026-07-11) ----
    // All additive + nullable. cost_usd above stays the whole-pipeline total (the
    // daily-budget SUM(cost_usd) query must keep covering every stage); these
    // columns break that total down for telemetry/billing. Absent when a legacy
    // (pre-v2) /ask run produced the row.
    retrievalMode: text("retrieval_mode"), // legacy | v2 | v2-lexical-only
    state: text("state"), // answered | insufficient | refused | error | limit
    rerankModel: text("rerank_model"),
    answerModel: text("answer_model"),
    rerankUsed: boolean("rerank_used"),
    embedTokens: integer("embed_tokens"),
    embedCostUsd: doublePrecision("embed_cost_usd"),
    rerankPromptTokens: integer("rerank_prompt_tokens"),
    rerankCompletionTokens: integer("rerank_completion_tokens"),
    rerankCostUsd: doublePrecision("rerank_cost_usd"),
    answerPromptTokens: integer("answer_prompt_tokens"),
    answerCompletionTokens: integer("answer_completion_tokens"),
    answerCostUsd: doublePrecision("answer_cost_usd"),
    candidatesCount: integer("candidates_count"),
    evidenceCount: integer("evidence_count"),
    totalMatching: integer("total_matching"),
    windowFrom: date("window_from"),
    windowTo: date("window_to"),
    // ---- AI Search Phase 0 measurement columns (2026-07-19) ----
    // All additive + nullable; passive (no product code reads them yet). run_id is
    // the request-scoped run identity generated at askWithLimits entry; the entry
    // point (server action / JSON route) patches stage_timings_ms by run_id after
    // the pipeline row is written. first_content_at stays null until Phase 3
    // (validated answer streaming); route_policy until Phase 4 (router).
    runId: uuid("run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stageTimingsMs: jsonb("stage_timings_ms"),
    firstContentAt: timestamp("first_content_at", { withTimezone: true }),
    routePolicy: text("route_policy"),
  },
  (t) => [
    index("ask_usage_email_created_idx").on(t.userEmail, t.createdAt),
    index("ask_usage_created_idx").on(t.createdAt),
    // Postgres unique indexes treat NULLs as distinct, so pre-Phase-0 rows (run_id
    // NULL) coexist; every new run's id must be unique and lookup-fast for the
    // entry-point timing patch.
    uniqueIndex("ask_usage_run_id_idx").on(t.runId),
  ],
);

// ---- AI Search Phase 1: persisted runs + atomic reservations (2026-07-19) ----
// Contract: docs/designs/ASK-RUNS-RESERVATION-CONTRACT-2026-07-19.md. All three
// tables are additive and PASSIVE until ASK_RUNS_ENFORCE=1 (shadow-write first).

// One row per paid /ask run, created BEFORE any work. id = the Phase 0 run_id
// (ask_usage.run_id matches). `result` stores the terminal payload so an
// idempotent replay returns it without any pipeline call.
export const askRuns = pgTable(
  "ask_runs",
  {
    id: uuid("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    question: text("question").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("created"), // created|authorized|running|finished|expired
    state: text("state"), // terminal AnswerState once finished
    result: jsonb("result"), // terminal AskAnswerV2 payload (replay source)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    expired: boolean("expired").notNull().default(false),
    reservedCeilingUsd: doublePrecision("reserved_ceiling_usd"),
    settledCostUsd: doublePrecision("settled_cost_usd"),
    /** AI Search Phase 7: customer-facing analysis units (§9.5) — separate
     *  from vendor cost by design; written at finalize; NULL for pre-Phase-7
     *  rows and refusals. Billing reads the AGGREGATE (units.ts), never
     *  stage internals. */
    units: integer("units"),
    /** Release hardening 2026-07-21 (migration 0027): the Ask-owned billing
     *  policy applied at finalize (e.g. "ask-units-v1:enforce"); NULL for
     *  historical/pre-policy rows and sweep-expired runs. */
    billingPolicy: text("billing_policy"),
    /** Release hardening 2026-07-21 (migration 0027): explicit invoice
     *  eligibility, DEFAULT FALSE — historical, shadow, replay, cache-hit,
     *  degraded, cancelled, and pre-cutover runs can never become billable
     *  by accident. Set true ONLY by units.ts billingEligibility() once the
     *  operator cutover (ASK_BILLING_CUTOVER_AT) exists; billing aggregates
     *  filter on THIS column, never on units alone. */
    billingEligible: boolean("billing_eligible").notNull().default(false),
    errorClass: text("error_class"),
    // Phase 2: the frozen EvidenceSnapshot (claim CONTENT + stable raw_documents
    // ids — F11-safe; contract §3). Same retention class as `result`.
    evidenceSnapshot: jsonb("evidence_snapshot"),
  },
  (t) => [
    uniqueIndex("ask_runs_user_idem_idx").on(t.userEmail, t.idempotencyKey),
    index("ask_runs_status_created_idx").on(t.status, t.createdAt),
    // register #22: the expiry sweep's predicate is finished_at IS NULL — give it
    // a partial index so the per-request sweep stays O(open runs), not O(table).
    index("ask_runs_open_created_idx")
      .on(t.createdAt)
      .where(sql`finished_at IS NULL`),
  ],
);

// Phase 2 (2026-07-19, contract: docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md):
// append-only per-run event log. seq is assigned by the single orchestrating
// invocation; the reconnect route replays WHERE seq > $after ORDER BY seq and
// then tails by bounded polling — no process-local fanout exists. Payloads are
// allowlisted (events.ts); no prose beyond claim text /search already serves.
export const askRunEvents = pgTable(
  "ask_run_events",
  {
    id: serial("id").primaryKey(),
    runId: uuid("run_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => [uniqueIndex("ask_run_events_run_seq_idx").on(t.runId, t.seq)],
);

// One authorized analysis slot per run: UNIQUE(user_email, day, slot) makes the
// last-slot race lose-exactly-one by constraint (lock-free); UNIQUE(run_id)
// makes replays reuse their slot instead of consuming another.
export const askAllowanceReservations = pgTable(
  "ask_allowance_reservations",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    day: date("day").notNull(),
    slot: integer("slot").notNull(),
    runId: uuid("run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ask_allowance_user_day_slot_idx").on(t.userEmail, t.day, t.slot),
    uniqueIndex("ask_allowance_run_idx").on(t.runId),
  ],
);

// One row per paid-stage reservation: reserved -> started -> settled/released,
// every transition a single conditional UPDATE (idempotent). Active
// (reserved|started) ceilings count against the provider caps alongside
// provider_usage's settled actuals, under a per-provider advisory lock.
export const providerUsageReservations = pgTable(
  "provider_usage_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    stage: text("stage").notNull(), // embed | rerank | answer
    attempt: integer("attempt").notNull().default(1),
    provider: text("provider").notNull(), // openai_embed | openai_ask
    day: date("day").notNull(), // UTC day the reservation counts against
    ceilingUsd: doublePrecision("ceiling_usd").notNull(),
    status: text("status").notNull().default("reserved"), // reserved|started|settled|released
    actualUsd: doublePrecision("actual_usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("provider_resv_run_stage_attempt_idx").on(t.runId, t.stage, t.attempt),
    index("provider_resv_provider_status_day_idx").on(t.provider, t.status, t.day),
    index("provider_resv_status_created_idx").on(t.status, t.createdAt),
  ],
);

// AI Search Phase 6: scoped investigation sessions — an ORDERING over
// immutable runs (a session is not a transcript; its continuity unit is the
// EvidenceSnapshot each run froze). Passive until ASK_SESSIONS=1, which
// itself stays off pending the operator retention decision (§7.7).
export const askSessions = pgTable(
  "ask_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userEmail: text("user_email").notNull(),
    /** derived from the first question; owner-editable later */
    title: text("title").notNull(),
    status: text("status").notNull().default("active"), // active | ended
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ask_sessions_user_idx").on(t.userEmail, t.lastActiveAt)],
);

export const askTurns = pgTable(
  "ask_turns",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id").notNull(),
    seq: integer("seq").notNull(),
    runId: uuid("run_id").notNull(),
    /** reuse | expand | new — the SCOPE the turn actually executed with */
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ask_turns_session_seq_idx").on(t.sessionId, t.seq),
    uniqueIndex("ask_turns_run_idx").on(t.runId),
  ],
);

// AI Search Phase 4: the per-user EXACT answer cache. One row per
// (user, cache_key); the key folds in the normalized question, parsed window,
// route-policy/prompt/retrieval versions, and the CORPUS version — digest
// regeneration replaces claim rows (F11), so the entry stores the frozen
// EvidenceSnapshot and cited evidence hydrates from it, never from live claim
// ids. Strictly per-user (cross-user pooling is an unmade operator decision).
// Passive until ASK_EXACT_CACHE=1.
export const askAnswerCache = pgTable(
  "ask_answer_cache",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    cacheKey: text("cache_key").notNull(),
    corpusVersion: text("corpus_version").notNull(),
    question: text("question").notNull(),
    result: jsonb("result").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ask_answer_cache_user_key_idx").on(t.userEmail, t.cacheKey),
    index("ask_answer_cache_created_idx").on(t.createdAt),
  ],
);

// ---------- paid-provider budget accounting ----------

// One row per (provider, UTC day): request/unit counts + estimated spend.
// Spend guards (src/lib/usage/spend-guard.ts) read these to enforce per-day and
// total caps BEFORE each paid call — fail-closed when a cap env var is unset.
export const providerUsage = pgTable(
  "provider_usage",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(), // x_api | opensanctions | ...
    day: date("day").notNull(), // UTC day
    requests: integer("requests").notNull().default(0),
    units: integer("units").notNull().default(0), // tweets returned / match calls / ...
    estUsd: doublePrecision("est_usd").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_usage_provider_day_idx").on(t.provider, t.day)],
);

// One row per scheduled-job invocation. Until this table existed, per-run success
// was unknowable: nothing in the DB distinguished "the cron fired and did nothing"
// from "the cron never fired", because digests.created_at is last-writer-wins.
//
// The row is written at START. A run killed by maxDuration therefore leaves
// finished_at NULL and ok NULL — that IS the timeout signal, not a lost row.
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(), // digest:core | ingest:x | validate | ...
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok"), // null = still running, or killed before it could finish
    error: text("error"),
    counts: jsonb("counts").notNull().default({}), // per-job tallies, e.g. {digests, errors}
  },
  (t) => [index("cron_runs_job_started_idx").on(t.job, t.startedAt)],
);

// Runtime log lines delivered by the Vercel log drain (OPEN-TASKS #93,
// docs/designs/LOG-DRAIN.md). Written ONLY by src/app/api/logs/drain/route.ts,
// which is a receiver, not a cron: it opens no cron_runs row (ruling 10 is
// untouched) and the drain signature is its whole authorization.
//
// Every soak verdict before this table rested on cron_runs — a job's own
// self-report — plus a `vercel logs` tail that had already expired by closeout.
// This is the independent in-window narrative: what the process said, and
// whether it crashed without answering (status_code = -1).
//
// `id` is Vercel's log-entry id and the PRIMARY KEY, so a retried delivery is
// idempotent (ON CONFLICT DO NOTHING). The column set is a deliberate
// PROJECTION of the v1 log schema, not a copy: an unlisted field is never
// stored, so a future Vercel schema addition cannot start silently landing
// here. Never stored, by design: headers, bodies, proxy.clientIp,
// proxy.userAgent, proxy.referer, ja3/ja4 digests, and query strings
// (request_path is truncated at the first '?' — /ask?q=<user question> must not
// become a second copy of Ask content outside its own retention).
export const runtimeLogs = pgTable(
  "runtime_logs",
  {
    id: text("id").primaryKey(), // Vercel log-entry id
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(), // Vercel `timestamp` (ms)
    deploymentId: text("deployment_id"),
    source: text("source"), // lambda | edge | build | static | external | firewall | redirect
    level: text("level"), // info | warning | error | fatal
    type: text("type"), // stdout | stderr | report | fatal | ...
    environment: text("environment"), // production | preview
    requestPath: text("request_path"), // query string stripped
    requestId: text("request_id"), // correlates every line of one invocation
    statusCode: integer("status_code"), // -1 = crashed with no response (the OOM signature)
    message: text("message"), // redacted, then wellFormedSlice'd to 2000 code units
    messageSha256: text("message_sha256"), // over the pre-truncation redacted message
  },
  (t) => [
    index("runtime_logs_received_idx").on(t.receivedAt), // retention sweep
    index("runtime_logs_deployment_received_idx").on(t.deploymentId, t.receivedAt),
    index("runtime_logs_logged_idx").on(t.loggedAt), // soak windows are logged_at ranges
  ],
);

// Tiny per-provider state (poll watermarks etc.) so incremental fetchers survive
// serverless restarts without refetching (and re-paying for) covered windows.
export const providerState = pgTable("provider_state", {
  provider: text("provider").primaryKey(),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-channel MTProto ingest state. Peer id + access_hash are cached because
// ResolveUsername is among Telegram's most tightly flood-limited calls: resolve
// once, reuse forever (a resolve failure backs off via next_resolve_at, never a
// hot loop). last_message_id is the incremental high-water mark — advanced only
// AFTER the fetched docs are inserted, so a killed run re-covers one channel's
// window and the cross-adapter external-id filter absorbs the overlap.
// backfill_min_id walks downward during the one-off history backfill (resumable).
export const telegramChannelState = pgTable("telegram_channel_state", {
  channel: text("channel").primaryKey(), // lowercase public username, no @
  peerId: text("peer_id"), // Telegram channel id (bigint as text)
  accessHash: text("access_hash"), // session-scoped peer credential (bigint as text)
  lastMessageId: integer("last_message_id").notNull().default(0),
  backfillMinId: integer("backfill_min_id"), // lowest message id backfill has reached
  backfillDone: boolean("backfill_done").notNull().default(false),
  resolveFails: integer("resolve_fails").notNull().default(0),
  nextResolveAt: timestamp("next_resolve_at", { withTimezone: true }),
  lastFetchAt: timestamp("last_fetch_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- map stage (SHADOW — the digest pipeline does not read these) ----------

// Persistent per-document claim store: every eligible canonical document has its
// claims extracted ONCE per (track, extractor_version), instead of being re-read
// on each of a digest-day's ~8 regenerations (PIPELINE-AUDIT-2026-07 §11). Each
// claim cites exactly its one owning doc; multi-source corroboration is the
// reduce's job (sprint 3), not the map's.
//
// extractor_version = model id + a hash of the exact map prompt + serialization
// params — the doc-level versioning raw_documents lacks. Same doc, new prompt =>
// new rows; the old rows stay (immutable, append-only).
export const docClaims = pgTable(
  "doc_claims",
  {
    id: serial("id").primaryKey(),
    rawDocumentId: integer("raw_document_id")
      .notNull()
      .references(() => rawDocuments.id),
    track: text("track").notNull(), // military|elite_politics|nuclear
    extractorVersion: text("extractor_version").notNull(),
    // position within this doc's claim list for this (track, version) — makes
    // replays of a crashed batch idempotent via the unique key below
    ordinal: integer("ordinal").notNull(),
    textEn: text("text_en").notNull(), // one atomic assertion, English, <=200 chars
    // supporting span in the SOURCE language (<=300 chars): traceability without
    // translation loss — lets a reader verify the English against the original
    quoteOrig: text("quote_orig"),
    claimType: text("claim_type").notNull().default("factual"), // factual|assessment
    hedging: hedgingEnum("hedging").notNull().default("unknown"),
    entities: jsonb("entities").notNull().default([]), // [{name, kind, role}] per ENTITY_RULES
    // short model-supplied label of the event this claim belongs to — the sprint-3
    // reduce clusters on it (plus text similarity); free text, not a key
    eventHint: text("event_hint"),
    claimDate: date("claim_date"), // the doc's UTC day (worker-set, not model-set)
    // quote_orig verbatim-containment verdict (whitespace/unicode-normalized,
    // src/lib/analysis/quote-verify.ts). Stamped at insert by the map worker;
    // NULL = predates the stamp (backfilled lazily by the reduce loader).
    // Only verified quotes may be rendered as hard traceability evidence
    // (OPEN-TASKS #34); unverified claims fall back to the doc link.
    quoteVerified: boolean("quote_verified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("doc_claims_doc_track_version_ordinal_idx").on(
      t.rawDocumentId,
      t.track,
      t.extractorVersion,
      t.ordinal,
    ),
    // reduce-side access path: all claims for a (track, day), theater via join
    index("doc_claims_track_date_idx").on(t.track, t.claimDate),
  ],
);

// Persistent dedup verdicts, written by the map worker's gate BEFORE any LLM call.
// One row per MIRROR document; canonical docs have no row (absence = canonical).
// Mirrors are never sent to the LLM — their claims live on the canonical doc.
// Mirror membership is breadth (same content re-posted), NOT independent
// corroboration (audit O3): sprint 3 may report it but must not count it as
// independence.
export const docDedup = pgTable(
  "doc_dedup",
  {
    rawDocumentId: integer("raw_document_id")
      .notNull()
      .primaryKey()
      .references(() => rawDocuments.id),
    canonicalDocId: integer("canonical_doc_id")
      .notNull()
      .references(() => rawDocuments.id),
    method: text("method").notNull(), // exact|minhash
    score: doublePrecision("score"), // estimated jaccard for minhash; 1 for exact
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doc_dedup_canonical_idx").on(t.canonicalDocId)],
);

// One row per (doc, track, extractor_version) MAP ATTEMPT THAT COMPLETED — the
// record that distinguishes "mapped, zero track-relevant claims" (normal, cheap)
// from "never mapped". Selection of unmapped work anti-joins this table; claim
// rows alone cannot carry that signal because empty extractions have none.
// Spend itself is metered elsewhere: provider_usage (provider='openai_map') per
// call, cron_runs.counts per run — no separate map_runs table.
export const docMapState = pgTable(
  "doc_map_state",
  {
    rawDocumentId: integer("raw_document_id")
      .notNull()
      .references(() => rawDocuments.id),
    track: text("track").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    claimCount: integer("claim_count").notNull().default(0),
    mappedAt: timestamp("mapped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.rawDocumentId, t.track, t.extractorVersion] }),
    index("doc_map_state_track_version_idx").on(t.track, t.extractorVersion),
  ],
);

// ---------- ASK Tier-2+ embedding infrastructure (workstream A, 2026-07-11) ----------

// Per-claim question-embedding store for the ASK v2 vector-retrieval arm. Claims
// are DELETED and re-inserted with fresh ids on every digest regeneration
// (digest-persist.ts `DELETE FROM claims WHERE digest_id`), so this table
// cascade-deletes on claim_id and is re-filled by the digest persist hook (or the
// scripts/backfill-embeddings.ts one-off). One row per (claim, model): a model
// swap ADDS rows, never overwrites, and the vector arm filters to the active model.
//
// Vectors are 1536-dim (ASK_EMBED_MODEL default text-embedding-3-small). STUB
// vectors (no OPENAI_API_KEY / ANALYSIS_PROVIDER=stub / LLM_DISABLE=1) are NEVER
// written here — the truth-in-UI analog of standing ruling 3, enforced in
// src/lib/embeddings/persist.ts (in-memory-only pseudo-vectors must not persist or
// be queried as fact).
export const claimEmbeddings = pgTable(
  "claim_embeddings",
  {
    claimId: integer("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dims: integer("dims").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // natural key = UNIQUE (claim_id, model); the ON CONFLICT target of the persist path
    primaryKey({ columns: [t.claimId, t.model] }),
    // HNSW, not ivfflat: ivfflat needs list-training data (a representative row
    // sample) and degenerates on a small/empty table — and this table STARTS empty
    // and grows incrementally as digests regenerate. HNSW builds incrementally with
    // no training step, so it is correct from the first inserted row.
    index("claim_embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ---------------------------------------------------------------------------
// Conflict benchmark reference reports (migration 0028)
// ---------------------------------------------------------------------------
//
// Schema option 3 of docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md §2: a
// provider-neutral reference-report EDITION table keyed by the domain
// editionKey, plus a small day-status table. `isw_reports` keeps its two unique
// indexes and stays the citation anchor — it is only ever REFERENCED here
// (nullable FK), never changed, so `source_citations` and both loaders are
// untouched (design §4 item 7). Options 1 (relax the isw_reports unique key)
// and 2 (child table FK'd to isw_reports) were rejected there.
//
// LEGAL (standing ruling 1): no prose column exists here and none may be added.
// Stored strings are URLs, keys, dates, enum values, version identifiers and
// instants only; `derived` holds unit signatures/hashes only (the same rule as
// isw_reports.derived) and `anchor_journal` holds instants + field names only.
export const benchmarkReportEditions = pgTable(
  "benchmark_report_editions",
  {
    id: serial("id").primaryKey(),
    series: text("series").notNull(),
    // 'isw' | 'fixture' (src/lib/conflicts/editions.ts EDITION_PROVIDERS); plain
    // text, not a pg enum, so a future provider stays an additive change
    provider: text("provider").notNull(),
    // the domain identity: `<series>:<report_date>:<edition_label>`
    editionKey: text("edition_key").notNull(),
    editionLabel: text("edition_label").notNull(),
    reportDate: date("report_date").notNull(),
    canonicalUrl: text("canonical_url"),
    normVersion: text("norm_version"),
    scopeVersion: text("scope_version").notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // present | missing | malformed_treated_as_missing
    cutoffTreatment: text("cutoff_treatment").notNull(),
    publishedTreatment: text("published_treatment").notNull(),
    designatedFinal: boolean("designated_final"),
    parseStatus: text("parse_status").notNull().default("pending"),
    // the ISW adapter link to the citation anchor. The FK deliberately keeps the
    // DEFAULT ON DELETE NO ACTION: deleting an anchor row an edition still
    // references must be BLOCKED and visible, never cascaded into silent edition
    // loss nor nulled into a silently unlinked edition (design §4 item 1).
    iswReportId: integer("isw_report_id").references(() => iswReports.id),
    derived: jsonb("derived").notNull().default({}),
    // additive audit columns the design left to the integration phase (§4 last
    // paragraph): DB-side provenance, never domain input.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // append-only anchor-change journal, entries {at, field: cutoff|published,
    // from, to} — instants and field names ONLY (design §5 "Anchor-change
    // journaling"): a present -> present anchor move used to overwrite the old
    // value with no queryable trace.
    anchorJournal: jsonb("anchor_journal").notNull().default([]),
  },
  (t) => [
    // the edition key IS series:report_date:label; the check makes a drifted
    // triple unrepresentable at the DB layer too
    check(
      "benchmark_report_editions_key_shape",
      sql`${t.editionKey} = ${t.series} || ':' || to_char(${t.reportDate}, 'YYYY-MM-DD') || ':' || ${t.editionLabel}`,
    ),
    // treatment/anchor consistency mirrors the app-layer validator
    check(
      "benchmark_report_editions_cutoff_consistent",
      sql`(${t.cutoffTreatment} = 'present') = (${t.cutoffAt} IS NOT NULL)`,
    ),
    check(
      "benchmark_report_editions_published_consistent",
      sql`(${t.publishedTreatment} = 'present') = (${t.publishedAt} IS NOT NULL)`,
    ),
    // labels are lowercase slug words: blocks empty and colon-bearing labels
    // that would still satisfy the concatenation check above
    check("benchmark_report_editions_label_shape", sql`${t.editionLabel} ~ '^[a-z0-9][a-z0-9-]*$'`),
    // a provider edition always carries its canonical URL (mirrors the app-layer
    // rule); a NULL canonical_url is fixture-only
    check(
      "benchmark_report_editions_isw_url",
      sql`${t.provider} <> 'isw' OR ${t.canonicalUrl} IS NOT NULL`,
    ),
    check(
      "benchmark_report_editions_cutoff_treatment_check",
      sql`${t.cutoffTreatment} IN ('present', 'missing', 'malformed_treated_as_missing')`,
    ),
    check(
      "benchmark_report_editions_published_treatment_check",
      sql`${t.publishedTreatment} IN ('present', 'missing', 'malformed_treated_as_missing')`,
    ),
    check(
      "benchmark_report_editions_parse_status_check",
      sql`${t.parseStatus} IN ('pending', 'parsed', 'failed')`,
    ),
    uniqueIndex("benchmark_report_editions_key_idx").on(t.editionKey),
    // partial: fixture rows carry NULL
    uniqueIndex("benchmark_report_editions_url_idx")
      .on(t.canonicalUrl)
      .where(sql`canonical_url IS NOT NULL`),
    index("benchmark_report_editions_series_date_idx").on(t.series, t.reportDate),
    // at most ONE designated-final edition per series/day at the persistence
    // layer too (the DB twin of selectDailyFinal's contradictory-designation
    // refusal — the app throws, and the table cannot hold the contradiction)
    uniqueIndex("benchmark_report_editions_final_idx")
      .on(t.series, t.reportDate)
      .where(sql`designated_final`),
  ],
);

// Day-status rows exist ONLY for days with no edition: a CONFIRMED publication
// gap or a failed discovery probe (the two must never blur — the 2026-08-15
// recovery found six "gaps" that were transient probe failures). `published` is
// always DERIVED from edition existence and is deliberately unrepresentable
// here; the repository deletes a day row when an edition arrives.
export const benchmarkSeriesDays = pgTable(
  "benchmark_series_days",
  {
    series: text("series").notNull(),
    reportDate: date("report_date").notNull(),
    status: text("status").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.series, t.reportDate] }),
    check(
      "benchmark_series_days_status_check",
      sql`${t.status} IN ('publication_gap', 'probe_failed')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Conflict validation observations (migration 0030)
// ---------------------------------------------------------------------------
//
// One row per (conflict, reference edition, cron invocation) — the durable home
// of the conflict evaluator's scored ConflictResultV1
// (docs/reviews/PLAN-WS-3-validation-by-conflict-2026-09-05.md §3.1b).
//
// APPEND-ONLY BY CONSTRUCTION (decision C6 = (b), memo
// docs/reviews/CONFLICT-VALIDATION-DECISION-MEMO-2026-09-05.md:218-244). There
// is deliberately NO unique key on (conflict_id, reference_edition_id) and no
// overwrite path anywhere: the shadow soak grades verdict FLIPS across >=3
// independent runs of the same days, and an overwrite key would destroy exactly
// the variance instrument `run_group_key` exists to group. The "current"
// headline for a day is DERIVED at read time (the latest row per edition, whose
// edition is the day's current daily-final winner), never by mutating an older
// row. The one unique key present is a partial defensive duplicate guard: one
// observation per edition per cron invocation, inert for rows written outside a
// cron (cron_run_id NULL).
//
// LEGAL (standing ruling 1): no prose column exists here and none may be added.
// Stored strings are ids, keys, dates, enum values, version identifiers and
// instants; `result` holds a persistable ConflictResultV1 whose only free-ish
// strings are the fixed headline label and the two bounded raw time anchors —
// enforced fail-closed BEFORE any write by src/lib/conflicts/observation-store.ts.
export const conflictValidationObservations = pgTable(
  "conflict_validation_observations",
  {
    id: serial("id").primaryKey(),
    conflictId: text("conflict_id").notNull(),
    // the edition IS the identity of what was scored; the FK keeps the default
    // ON DELETE NO ACTION so deleting a scored edition is BLOCKED and visible,
    // never cascaded into silent observation loss
    referenceEditionId: integer("reference_edition_id")
      .notNull()
      .references(() => benchmarkReportEditions.id),
    // denormalized for reads (the FK above is the identity)
    series: text("series").notNull(),
    reportDate: date("report_date").notNull(),
    editionKey: text("edition_key").notNull(),
    evaluationKind: text("evaluation_kind").notNull(),
    contributingDigestIds: integer("contributing_digest_ids").array().notNull().default([]),
    // the persistable ConflictResultV1 and nothing else
    result: jsonb("result").notNull(),
    // memo C3: unitId -> contributor-theater attribution. RECORDED beside the
    // result, never a filter and never inside the frozen ConflictResultV1.
    unitAttribution: jsonb("unit_attribution").notNull().default({}),
    // llm-majority | llm | keyword. `fixture-oracle` is excluded on purpose:
    // the live path can never mint one, so the DB cannot hold one either.
    matcherRung: text("matcher_rung").notNull(),
    matcherModel: text("matcher_model"),
    votesK: integer("votes_k"),
    // model/effort/registry/approval identity of the paid rung; NULL on keyword
    dispatch: jsonb("dispatch"),
    methodologyEpoch: text("methodology_epoch").notNull(),
    laneTaxonomyVersion: text("lane_taxonomy_version").notNull(),
    evidencePolicyVersion: text("evidence_policy_version").notNull(),
    laneClassifierVersion: text("lane_classifier_version").notNull(),
    actorRosterVersion: text("actor_roster_version").notNull(),
    scopeVersion: text("scope_version").notNull(),
    // memo C7: the versioned toponym gazetteer the keyword rung scored with
    gazetteerVersion: text("gazetteer_version").notNull(),
    // memo C13: the compound/negative derivation version. Observations under
    // `unit-flags-v0` are never comparable with `compound-v1` ones, so the read
    // view GROUPS by this column and labels v0 rows not soak-eligible.
    unitFlagsVersion: text("unit_flags_version").notNull(),
    editionNormVersion: text("edition_norm_version").notNull(),
    dailyFinalPolicy: text("daily_final_policy").notNull(),
    extractorVersions: text("extractor_versions").array().notNull().default([]),
    registryVersion: text("registry_version").notNull(),
    windowEndSource: text("window_end_source").notNull(),
    // repeated-run/variance grouping key (scorer.ts runGroupKey): identical
    // inputs + matcher config share a key across repeated runs
    runGroupKey: text("run_group_key").notNull(),
    // ruling 10: binds the observation to the cron_runs row that produced it.
    // Nullable because a non-cron caller (a backfill, a test) has no run row.
    cronRunId: integer("cron_run_id").references(() => cronRuns.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "conflict_validation_observations_conflict_id_check",
      sql`${t.conflictId} ~ '^[a-z_]+$'`,
    ),
    check(
      "conflict_validation_observations_evaluation_kind_check",
      sql`${t.evaluationKind} IN ('operational_cutoff', 'at_publication', 'finalized', 'retrospective')`,
    ),
    check(
      "conflict_validation_observations_matcher_rung_check",
      sql`${t.matcherRung} IN ('llm-majority', 'llm', 'keyword')`,
    ),
    check(
      "conflict_validation_observations_window_end_source_check",
      sql`${t.windowEndSource} IN ('cutoff', 'published', 'report_day')`,
    ),
    // the ONLY unique key: one observation per edition per cron invocation.
    // Partial, so append-only rows written outside a cron are unconstrained.
    uniqueIndex("conflict_validation_observations_run_idx")
      .on(t.conflictId, t.referenceEditionId, t.cronRunId)
      .where(sql`cron_run_id IS NOT NULL`),
    index("conflict_validation_observations_conflict_day_idx").on(
      t.conflictId,
      t.reportDate.desc(),
      t.observedAt.desc(),
    ),
    index("conflict_validation_observations_run_group_idx").on(t.runGroupKey),
  ],
);
