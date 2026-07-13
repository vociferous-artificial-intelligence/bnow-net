import { sql } from "drizzle-orm";
import {
  boolean,
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

export const users = pgTable("users", {
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
});

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
  },
  (t) => [
    index("ask_usage_email_created_idx").on(t.userEmail, t.createdAt),
    index("ask_usage_created_idx").on(t.createdAt),
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
