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

export const iswReports = pgTable(
  "isw_reports",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
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
    uniqueIndex("isw_reports_date_idx").on(t.reportDate),
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
    adapter: text("adapter").notNull(), // rss|gdelt|telegram_web|telegram_mtproto|x|acled|manual
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
  ],
);

// TRACEABILITY INVARIANT: every claim must reference >=1 raw document.
// Enforced by a DEFERRABLE constraint trigger added in the initial migration SQL
// (see drizzle/0000_*.sql) — inserting a claim without a claim_sources row in the
// same transaction fails at COMMIT.
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

// captures interest while Stripe is feature-flagged off
export const subscribeIntents = pgTable("subscribe_intents", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  planCode: text("plan_code").references(() => plans.code),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
