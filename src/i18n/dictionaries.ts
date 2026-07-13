// Lightweight i18n: an authoritative locale registry + UI-string dictionaries + a t()
// helper. No heavy dependency — App Router + a keyed dictionary is enough for chrome.
// Content (digests/claims/evidence) stays English-first (the analyst lingua franca) and
// is NEVER machine-translated here; on-demand LLM translation is a later, presentation-only
// toggle. See docs/NEXT-PHASE-PLAN.md §2 and docs/PROGRESS.md (2026-07-08 i18n note).
//
// INVARIANT: source names, source URLs, raw evidence, raw document titles, claim IDs,
// confidence/source metadata and the "ISW"/"OSINT" labels are proper nouns / identifiers —
// they are never translated. Only UI chrome (nav, section labels, framing) lives here.

// ---------------------------------------------------------------------------
// Locale registry — single source of truth (code, labels, direction, market
// priority/order, fallback). Everything else (LOCALES, names, RTL set) derives
// from this so there is exactly one place to edit.
// ---------------------------------------------------------------------------

const REGISTRY = {
  en: { label: "English",    nativeLabel: "English",     dir: "ltr", order: 1,  fallback: "en" },
  uk: { label: "Ukrainian",  nativeLabel: "Українська",  dir: "ltr", order: 2,  fallback: "en" },
  de: { label: "German",     nativeLabel: "Deutsch",     dir: "ltr", order: 3,  fallback: "en" },
  fr: { label: "French",     nativeLabel: "Français",    dir: "ltr", order: 4,  fallback: "en" },
  pl: { label: "Polish",     nativeLabel: "Polski",      dir: "ltr", order: 5,  fallback: "en" },
  ar: { label: "Arabic",     nativeLabel: "العربية",     dir: "rtl", order: 6,  fallback: "en" },
  ja: { label: "Japanese",   nativeLabel: "日本語",       dir: "ltr", order: 7,  fallback: "en" },
  es: { label: "Spanish",    nativeLabel: "Español",     dir: "ltr", order: 8,  fallback: "en" },
  he: { label: "Hebrew",     nativeLabel: "עברית",       dir: "rtl", order: 9,  fallback: "en" },
  ko: { label: "Korean",     nativeLabel: "한국어",       dir: "ltr", order: 10, fallback: "en" },
} as const;

export type Locale = keyof typeof REGISTRY;
export type Dir = "ltr" | "rtl";

export interface LocaleMeta {
  code: Locale;
  /** English label, e.g. "German". */
  label: string;
  /** Native label, e.g. "Deutsch". */
  nativeLabel: string;
  dir: Dir;
  /** Market priority (1 = highest); drives selector ordering. */
  order: number;
  /** Locale to fall back to per-key when a translation is missing. */
  fallback: Locale;
}

export const LOCALE_REGISTRY: Record<Locale, LocaleMeta> = Object.fromEntries(
  Object.entries(REGISTRY).map(([code, m]) => [code, { code: code as Locale, ...m }]),
) as Record<Locale, LocaleMeta>;

export const LOCALES = Object.keys(REGISTRY) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";

// Native names, kept for backward compatibility with existing imports.
export const LOCALE_NAMES: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l, REGISTRY[l].nativeLabel]),
) as Record<Locale, string>;

// RTL locales need dir="rtl".
export const RTL_LOCALES = new Set<Locale>(LOCALES.filter((l) => REGISTRY[l].dir === "rtl"));

// Top-level UI namespaces every locale catalog is expected to cover (the prefix
// before the first dot in a message key). Used by tests and by the fallback design.
export const REQUIRED_NAMESPACES = [
  "nav",
  "home",
  "countries",
  "pricing",
  "registry",
  "scoreboard",
  "digest",
  "ask",
  "auth",
  "common",
] as const;

/** Locales in market-priority order (for the language selector). */
export function localesByPriority(): LocaleMeta[] {
  return LOCALES.map((l) => LOCALE_REGISTRY[l]).sort((a, b) => a.order - b.order);
}

/** Fallback chain from a locale down to the ultimate default (cycle-safe). */
export function fallbackChain(locale: Locale): Locale[] {
  const chain: Locale[] = [];
  const seen = new Set<Locale>();
  let cur: Locale | undefined = locale;
  while (cur && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    const fb: Locale = LOCALE_REGISTRY[cur].fallback;
    cur = fb === cur ? undefined : fb;
  }
  if (!seen.has(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}

// ---------------------------------------------------------------------------
// Message catalogs (flat, dotted keys; the prefix is the namespace).
// English is the authoritative base; other locales override per-key and fall
// back to English for anything missing. Placeholders use {name} tokens.
// ---------------------------------------------------------------------------

type Dict = Record<string, string>;

const en: Dict = {
  // navigation — the original flat module names. Retained: the values are pinned by
  // tests and the keys stay available to any surface that still wants a short label.
  "nav.home": "home",
  "nav.theaters": "theaters",
  "nav.ru_registry": "RU registry",
  "nav.me_registry": "ME registry",
  "nav.scoreboard": "scoreboard",
  "nav.ask": "ask",
  "nav.datadark": "data-dark",
  "nav.trade": "trade-evasion",
  "nav.signals": "signals",
  "nav.materials": "critical materials",
  "nav.pricing": "pricing",
  "nav.signin": "sign in",
  "nav.language": "Language",

  // global header — buyer-journey grouping (category → coverage → trust → price)
  "nav.group.product": "Product",
  "nav.group.coverage": "Coverage",
  "nav.group.validation": "Validation",
  "nav.group.solutions": "Solutions",
  "nav.group.pricing": "Pricing",
  "nav.group.signals": "Signals",
  "nav.group.ask": "Ask",
  "nav.item.feeds": "Daily intelligence feeds",
  "nav.item.ask": "Ask the data",
  "nav.item.registry": "Source reliability registry",
  "nav.item.me_registry": "Middle East registry",
  "nav.item.signals": "Analyst signals",
  "nav.item.all_theaters": "All theaters",
  "nav.item.sanctions": "Sanctions & trade evasion",
  "nav.item.commodity": "Commodity & supply-chain risk",
  "nav.item.opacity": "Economic data suppression",
  "nav.item.political_risk": "Political risk & signals",
  "nav.account": "Account",
  "nav.signout": "Sign out",
  "nav.menu": "Menu",
  "nav.close": "Close",
  "nav.main": "Main",

  // landing page
  // Signed-in home headline (R3, analyst-home-v2 sprint): the sole hero string —
  // no subtitle, no CTA copy alongside it. Kept short on purpose (pinned by a
  // word-count test in i18n.test.ts) so the compact hero stays one line.
  "home.headline": "Today's intelligence picture",
  "home.tagline": "Transparent source reliability ratings for conflict-zone OSINT",
  "home.sub": "Per-country intelligence feeds from open news, Telegram and social sources — scored for reliability, fused into a daily digest, and validated every day against expert human analysis. Every claim links to its evidence.",
  "home.cta.subscribe": "Become a founding subscriber",
  "home.cta.scoreboard": "See the scoreboard",
  "home.cta.digest": "Read today's digest",
  "home.cta.coverage": "Explore live coverage",
  "home.live": "Live now: {n} theaters — daily depth in Russia, Ukraine and Iran",
  // `home.live` split into its parts so the signed-in home can render the theaters as
  // quick links. The sentence key stays for the signed-out hero (and is pinned by tests).
  "home.live_label": "Live now",
  "home.theater.ru": "Russia",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  // Signed-in per-theater data-state panel (replaces the marketing cards below for
  // signed-in users only). Deliberately NO {placeholder} tokens: values (timestamps,
  // counts) are formatted and composed alongside these labels in the component/page,
  // not interpolated into the string — keeps these label/value rows dense and avoids
  // overloading the catalog-wide interpolation test with a one-off token name.
  "home.status.panel_label": "Data freshness by theater",
  "home.status.data_current": "Data current as of",
  "home.status.docs_24h": "Documents, last 24h",
  // Cadence-aware digest status (analyst-trust sprint, docs/TIME-MODEL.md): the
  // card names the digest bucket it describes and labels its stage; the claims row
  // is keyed to that same bucket via {date}, so it can never contradict the status.
  "home.status.latest_digest": "Latest digest",
  "home.status.stage_intraday": "intraday",
  "home.status.stage_final": "final",
  "home.status.none_today": "no digest yet today",
  "home.status.claims_for": "Digest claims, {date}",
  "home.status.next_update": "Next update",
  "home.status.no_data": "no data yet",
  "home.status.no_digest": "none yet",
  "home.status.x_paused": "X ingestion paused (spend cap reached) — RSS and Telegram continue updating",
  // Signed-in validation snapshot tiles (below the theater status panel). Same
  // placeholder-free convention as home.status.* above.
  "home.validation.panel_label": "Validation vs ISW",
  "home.validation.coverage_suffix": "final coverage",
  "home.validation.not_validated": "not yet validated",
  "home.validation.median_lead_label": "Median info lead vs ISW",
  "home.validation.last_validated_label": "Last validated",
  "home.validation.corroborated_label": "Corroborated share, {date}",
  "home.validation.not_computed": "not yet computed",
  // One-line caption above the tile grid (scoreboard-explainer sprint, W3): sets
  // expectations before the numbers, same voice as scoreboard.explainer below.
  "home.validation.caption":
    "We score our own digests against expert analysis daily — including the misses.",
  // Signed-in analyst quick-strip additions (analyst-home sprint).
  "home.status.scoreboard_link": "scoreboard →",
  // Signed-in quick-links rail: compact known-destination links; digest dates
  // are composed in JSX next to these labels.
  "home.quicklinks.label": "Quick links",
  "home.quicklinks.digest": "digest",
  "home.quicklinks.scoreboard": "scoreboard",
  "home.quicklinks.registry": "registry",
  "home.quicklinks.signals": "signals",
  "home.quicklinks.search": "claim search",
  // Signed-in recent-asks list (links prefill /ask?q= — never auto-executes).
  "home.recent_asks.label": "Your recent questions",
  // Signed-out Iran/Gulf regional-coverage card (additive section; geography
  // framing, not crisis, per the product brief).
  "home.iran.title": "Iran / Gulf theater — live daily intelligence",
  "home.iran.body": "Daily Iran coverage on three tracks — military situation, nuclear program, elite politics — from open news, Telegram and X sources, scored for reliability and validated against expert analysis every day.",
  "home.iran.link": "explore Iran coverage →",
  "home.features.reliability.title": "Reliability, derived not asserted",
  "home.features.reliability.body": "{sources} sources rated from {citations} citations in 4+ years of expert reporting — how often each source is confirmed, merely claimed, or never verified.",
  "home.features.reliability.link": "explore the registry →",
  "home.features.claims.title": "Claims you can audit",
  "home.features.claims.body": "{docs} raw documents ingested. Every digest claim is linked to its source documents at the database level — no black-box analysis.",
  "home.features.claims.link": "read today's digest →",
  "home.features.scored.title": "Scored against experts, daily",
  "home.features.scored.body": "{runs} validation runs against ISW's daily assessments. Coverage, misses, and leads — published, not hidden.",
  "home.features.scored.link": "see how we score →",
  "home.footer": "OSINT data intelligence · analysis derived from open sources; source ratings are statistical artifacts of citation behavior, not endorsements.",

  // country feeds
  "countries.title": "Coverage",
  "countries.subtitle": "Per-country conflict-monitoring feeds, scored and fused daily.",
  "countries.first_digest_pending": "first digest pending",
  "countries.view_digest": "view digest →",
  "countries.empty": "No coverage yet.",
  "countries.data_current": "data current as of {time}",
  "countries.badge.live": "live",
  "countries.badge.launching": "coverage launching",
  "countries.detail.subtitle":
    "Daily conflict-monitoring intelligence — reliability-scored, fused, and validated against expert analysis.",
  "countries.detail.ingested_label": "Documents ingested",
  "countries.detail.digests_label": "Daily digests published",
  "countries.detail.coverage": "{pct}% event coverage vs ISW (latest run)",
  "countries.detail.latest_digest": "Read the latest digest ({date}) →",
  "countries.detail.archive": "Browse the digest archive →",
  "countries.detail.scoreboard": "Open the validation scoreboard →",
  "countries.detail.launching": "Coverage launching — feed roster and registry seeding are queued.",
  "countries.detail.meta_suffix": "conflict monitoring & OSINT intelligence",
  "countries.detail.meta_desc":
    "daily open-source intelligence — reliability-scored feeds, a daily digest, and validation against expert analysis.",

  // pricing / intents
  // Private analyst beta — access-request journey (2026-07-13): /access page,
  // nav "Request access" entry, signed-out hero beta marker. Non-en values are
  // machine translations pending native review (UK-NATIVE-REVIEW inventory).
  "nav.group.access": "Request access",
  "home.beta.badge": "Private analyst beta",
  "home.beta.line": "Built with working analysts. We're inviting a small group to test whether BNOW saves time in daily monitoring — and to tell us where it fails.",
  "home.cta.request_beta": "Request beta access",
  "access.title": "Request analyst beta access",
  "access.meta_desc": "BNOW.NET is onboarding a small group of analysts, researchers, journalists and risk professionals to its private analyst beta.",
  "access.breadcrumb": "request access",
  "access.intro": "We're onboarding a small group of analysts, researchers, journalists and risk professionals. Tell us what you monitor and we'll follow up personally.",
  "access.no_purchase": "No self-service purchase or card is required to request access.",
  "access.expectation": "Beta access is for evaluation and workflow feedback. BNOW remains an analytical aid, not a sole source for operational decisions.",
  "access.email_label": "Work email",
  "access.linkedin_label": "LinkedIn profile or company page",
  "access.linkedin_hint": "A linkedin.com profile or company-page URL. We store the URL you provide and never fetch or enrich it.",
  "access.usecase_label": "What do you monitor day to day?",
  "access.usecase_hint": "A sentence or two is plenty.",
  "access.optional": "optional",
  "access.submit": "Request beta access",
  "access.pending": "Submitting…",
  "access.success.title": "Request received",
  "access.success.body": "Thanks — we review every request personally and will follow up by email.",
  "access.err.email": "Please enter a valid work email address.",
  "access.err.linkedin": "That doesn't look like a linkedin.com URL. You can leave the field empty.",
  "access.err.generic": "Something went wrong on our side. Please try again, or email us instead.",
  "access.fallback": "Prefer email? Write to",
  "pricing.title": "Founding subscriber pricing",
  "pricing.subtitle": "Full access for analysts and desks.",
  "pricing.cta.subscribe": "Subscribe",
  "pricing.cta.request": "Request access",
  "pricing.email_placeholder": "work email",
  "pricing.note": "Founding-subscriber annual: full access, locked-in rate.",
  "pricing.breadcrumb": "pricing",
  "pricing.intro.stripe_on": "Subscribe directly below.",
  "pricing.intro.stripe_off": "Checkout isn't live yet — leave your email and we'll onboard you personally at these rates.",
  "pricing.thanks": "Got it — we'll be in touch within a day.",
  "pricing.err_email": "Please enter a valid email address.",
  "pricing.billed_annually": "billed annually at {total}",
  "pricing.save_pct": "save {pct}%",
  "pricing.save_pct_badge": "save {pct}% annual",
  "pricing.or_monthly": "or {amount}/mo billed monthly",
  "pricing.on_request.label": "Price on request",
  "pricing.cta.monthly_suffix": "monthly",
  "pricing.cta.annual_suffix": "annual (save {pct}%)",
  "pricing.cta.annual_suffix_plain": "annual",
  "pricing.footnote": "Standby and Full analyst prices are live from our current plan list. Regional bundles and Enterprise/API are scoped and quoted per engagement.",
  "pricing.standby.name": "Standby",
  "pricing.standby.blurb": "Monitoring tier for teams that need the signal, not the firehose.",
  "pricing.standby.feature.digests": "Daily digests (RU/UA)",
  "pricing.standby.feature.scoreboard": "Validation scoreboard",
  "pricing.standby.feature.history": "30-day claim history",
  "pricing.standby.feature.upgrade": "Upgrade to full analyst access any time, at pre-agreed pricing",
  "pricing.full.name": "Full analyst",
  "pricing.full.blurb": "Full access for analysts and desks.",
  "pricing.full.feature.everything_standby": "Everything in Standby",
  "pricing.full.feature.registry": "Source-registry explorer + reliability data",
  "pricing.full.feature.drilldown": "Full claim-to-source drill-down & history",
  "pricing.full.feature.new_theaters": "New theaters as they launch",
  "pricing.regional.name": "Regional bundles",
  "pricing.regional.blurb": "Coverage bundled by geography, not by news cycle — a bundle carries into the next crisis instead of expiring with the last one.",
  "pricing.regional.feature.geography": "Multiple countries in one feed, priced as a bundle",
  "pricing.regional.feature.crisis_resilient": "Built to outlast a single news cycle",
  "pricing.regional.bundle.ru_ua": "Russia – Ukraine",
  "pricing.regional.bundle.gulf": "Gulf / Middle East",
  "pricing.enterprise.name": "Enterprise / API",
  "pricing.enterprise.blurb": "For teams integrating BNOW.NET into their own tools and workflows.",
  "pricing.enterprise.feature.api": "API / feed delivery",
  "pricing.enterprise.feature.multiseat": "Multi-seat access",
  "pricing.enterprise.feature.validation_reporting": "Validation reporting",
  "pricing.enterprise.feature.custom_theaters": "Custom theaters",

  // registry explorer
  "registry.title": "Source Registry",
  "registry.search_placeholder": "search…",
  "registry.col.source": "source",
  "registry.col.platform": "platform",
  "registry.col.status": "status",
  "registry.col.cited": "cited",
  "registry.col.hedging_mix": "hedging mix",
  "registry.status.decayed": "decayed",
  "registry.scores_as_of": "Scores as of",
  "registry.reduced.methodology": "Reliability ratings are shown in context wherever a source is cited inside a digest. This index is ordered by citation volume.",
  "registry.detail.weighting_qualitative": "Reliability weights confirmed reporting above assessed, claimed, and unverified reporting",

  // scoreboard
  "scoreboard.title": "Validation Scoreboard",
  "scoreboard.empty": "No validation runs yet.",
  "scoreboard.col.theater": "theater",
  "scoreboard.col.coverage": "coverage",
  "scoreboard.col.lead": "lead (h)",
  "scoreboard.avg_coverage": "avg event coverage vs ISW",
  "scoreboard.median_lead": "median information lead vs ISW publish",
  "scoreboard.thin_sourced": "thin-sourced",
  "scoreboard.avg_thin_sourced": "avg thin-sourced rate",
  "scoreboard.target_coverage": "target ≥ {n}%",
  "scoreboard.target_thin": "target < {n}%",
  "scoreboard.target_lead": "target within ±{n}h",
  "scoreboard.nonzero_day_mean": "nonzero days: {pct}% (n={days})",
  "scoreboard.view_digest": "view this day's digest →",
  // Explainer block (scoreboard-explainer sprint, W3): replaces the old one-line
  // targets note near the top of the page. Substance verified against
  // src/lib/validation/score.ts + src/lib/scoreboard/summary.ts — see the
  // how_to_read.* lines below for the per-metric definitions this must stay
  // consistent with. Per-metric numeric targets stay in the target_* tile
  // sublines above, unchanged by this block.
  "scoreboard.explainer":
    "We score our own output. Every day we compare this system's digest against expert human analysis — ISW's Russian Offensive Campaign Assessment and other baselines — measuring whether we surfaced the same events, how early, and how much of what we published rests on more than one source. We publish the results, including the misses, because analysts should know exactly how much to trust an automated feed. Unlike a finished prose report, every claim here links back to its source document, is searchable, and can land hours earlier — this page shows what that speed costs in coverage.",
  "scoreboard.how_to_read.summary": "How to read these numbers",
  // Coverage: matched / matchable ISW same-day takeaways (score.ts coveragePct).
  "scoreboard.how_to_read.coverage":
    "Coverage % — the share of ISW's same-day takeaways our digest also matched. The headline number scores our finalized digest (published ~10:00 PM ET), after ISW's report is already out.",
  // Dual metric (analyst-trust W4): evidence-in-hand at ISW publish — same
  // denominator as coverage, gated on min(raw_documents.fetched_at) <= ISW's
  // datePublished (src/lib/validation/at-publish.ts). Rendered as a per-row
  // subline in the coverage column.
  "scoreboard.how_to_read.at_publish":
    "At ISW publish — of those same takeaways, the share we had matched with evidence already ingested when ISW's report went out: the apples-to-apples number. The gap to the headline is what later ingestion added.",
  "scoreboard.at_publish": "at ISW publish: {pct}%",
  // Lead: median hours across matched pairs of (ISW publish time − earliest
  // supporting doc's published_at, fallback fetched_at) — score.ts timelinessHours,
  // run.ts earliest_doc_at query.
  "scoreboard.how_to_read.lead":
    "Information lead — median hours between our earliest supporting source document and ISW's publish time, across matched events; positive means we had it first.",
  // Thin-sourced: docCount<2 AND hedging in (claimed, unverified) — score.ts thin
  // filter. NOT literal "unsupported"; every claim keeps >=1 source (ruling 2).
  "scoreboard.how_to_read.thin":
    "Thin-sourced % — the share of our claims resting on a single source while still hedged as claimed or unverified, never stated as settled fact. Lower is better.",
  // Divergence kinds: agreement / isw_only (our miss) / ours_only (potential lead) —
  // score.ts DivergenceEntry.kind.
  "scoreboard.how_to_read.divergence":
    "Agreement / ISW-only / ours-only — events both sides reported, events ISW reported that we missed, and events we reported that ISW didn't carry (a potential lead).",

  // digest page framing
  "digest.no_events": "No events extracted.",
  "digest.view_for": "view for:",
  "digest.sources": "sources",
  "digest.confidence": "confidence",
  "digest.track.military": "Military situation",
  "digest.track.elite": "Elite politics & prosecutions",
  "digest.track.nuclear": "Nuclear program",
  // Digest archive + date navigation (analyst-home sprint). Dates are composed
  // in JSX next to these fragments.
  "digest.nav.prev": "previous",
  "digest.nav.next": "next",
  "digest.nav.archive": "digest archive",
  "digest.archive.intro": "Every daily digest for this theater — newest first. Each claim links to its source documents.",
  "digest.archive.empty": "No digests yet.",
  "digest.archive.col.date": "date",
  "digest.archive.col.tracks": "tracks",
  "digest.archive.col.claims": "claims",

  // signals page framing. Evidence count-line strings are deliberately
  // {placeholder}-free (see home.status.* above for the same convention): the
  // number is composed next to the label in the page, not interpolated, so it can't
  // collide with i18n.test.ts's fixed interpolation-test var set.
  "signals.breadcrumb": "analyst signals",
  "signals.title": "Active signals",
  "signals.intro": "Deterministic cross-cutting flags computed over the entity graph, procurement, data-transparency and trade layers. Each carries the evidence that triggered it — no black-box scoring. Analytical judgments, not confirmed facts.",
  "signals.empty": "No active signals.",
  "signals.evidence.summary": "supporting claim(s) — expand to inspect",
  "signals.evidence.public": "supporting claim(s) · traceable to sources",
  "signals.evidence.signin_prompt": "sign in to inspect the evidence",
  "signals.evidence.accept_prompt": "accept the Terms to inspect the evidence",

  // Claim-source disclosure strip (shared by the digest page and signals evidence).
  "sources.more_summary": "+{n} more · {channels} channels · {platforms} platforms",

  // ask page framing
  "ask.title": "Interrogate the intelligence",
  "ask.subtitle": "Cited evidence",
  "ask.placeholder": "e.g. which oligarchs are under prosecution?",
  "ask.submit": "Ask",
  "ask.examples": "Try one of these",
  // v2 answer-state framing (Tier-2+ sprint) — fragments, not {token} templates: the
  // dynamic count/date values are composed in JSX, not via makeT's vars interpolation,
  // so a new placeholder name here can't collide with i18n.test.ts's fixed vars fixture.
  "ask.state.insufficient": "No sufficient evidence in the covered corpus — try narrowing to a country, actor, or event type.",
  "ask.state.refused": "The model declined to answer this phrasing — rewording usually resolves it.",
  "ask.sampled.prefix": "Evidence sampled from",
  "ask.sampled.suffix": "matching claims — see the digest for full coverage.",
  "ask.window.prefix": "Searched claims",
  "ask.window.from": "from",
  "ask.window.to": "to",
  "ask.window.since": "since",
  "ask.window.through": "through",
  "ask.related.title": "Related claims",
  // no-coverage callout (W1) — fragments, not {token} templates (same reason as the
  // ask.state/window keys above): the window range + currency date are composed in
  // JSX so no new placeholder collides with i18n.test.ts's fixed vars fixture.
  "ask.nocoverage.prefix": "No claims yet cover",
  "ask.nocoverage.currency": "Data current through",
  // pending-state hint (W2: /ask double-submit fix, OPEN-TASKS #48) — shown only
  // while the paid pipeline is running.
  "ask.pending.hint": "Searching the claim database — usually ~10 seconds",

  // Free claim search (/search) — deterministic lexical retrieval, no model
  // calls, no per-query cost. The count line reuses already-established tokens.
  "search.title": "Claim search",
  "search.breadcrumb": "claim search",
  "search.intro": "Free-text search over the claim database. Deterministic matching — no model calls, no query budget. Every result links to its digest and source documents.",
  "search.placeholder": "e.g. Kharkiv drone strikes",
  "search.submit": "Search",
  "search.empty": "No claims match.",
  "search.count": "showing {n} of {total} matching claims",

  // Design-partner feedback affordances (mailto v1, zero backend; hidden
  // entirely when FEEDBACK_EMAIL is unset — see src/lib/feedback.ts).
  "feedback.flag_digest": "Flag an error in this digest",
  "feedback.flag_source": "Suggest or flag a source",

  // auth labels
  "auth.signin": "Sign in",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "Send magic link",
  "auth.sent": "Check your email for a sign-in link.",

  // global footer (SiteFooter) — legal + status links on every ordinary page
  "footer.nav_label": "Legal and site links",
  "footer.privacy": "Privacy Notice",
  "footer.terms": "Terms of Use",
  "footer.contact": "Contact",

  // common loading / empty / error states
  "common.status": "status",
  "common.loading": "Loading…",
  "common.empty": "Nothing here yet.",
  "common.error": "Something went wrong.",
  "common.retry": "Try again",
  "common.back": "Back",
  "common.updated": "Updated",
  "common.learn_more": "Learn more",
  "common.skip_to_content": "Skip to content",

  // Root error boundaries (src/app/error.tsx, global-error.tsx).
  "error.heading": "Something failed while rendering this page.",
  "error.body": "The error has been logged. Retrying usually resolves transient data issues.",
  "error.reference": "Reference",
};

// Ukrainian — live theater; the five original keys are preserved verbatim.
const uk: Dict = {
  "nav.home": "головна",
  "nav.theaters": "театри",
  "nav.ru_registry": "реєстр РФ",
  "nav.me_registry": "реєстр БС",
  "nav.scoreboard": "таблиця оцінок",
  "nav.ask": "запит",
  "nav.datadark": "закриті дані",
  "nav.trade": "торгівля в обхід",
  "nav.signals": "сигнали",
  "nav.materials": "критичні матеріали",
  "nav.pricing": "тарифи",
  "nav.signin": "увійти",
  "nav.language": "Мова",
  "nav.group.product": "Продукт",
  "nav.group.coverage": "Охоплення",
  "nav.group.validation": "Валідація",
  "nav.group.solutions": "Рішення",
  "nav.group.pricing": "Тарифи",
  "nav.group.signals": "Сигнали",
  "nav.group.ask": "Запит",
  "nav.item.feeds": "Щоденні розвідувальні стрічки",
  "nav.item.ask": "Запитати дані",
  "nav.item.registry": "Реєстр надійності джерел",
  "nav.item.me_registry": "Реєстр Близького Сходу",
  "nav.item.signals": "Аналітичні сигнали",
  "nav.item.all_theaters": "Усі театри",
  "nav.item.sanctions": "Санкції та обхід торгівлі",
  "nav.item.commodity": "Ризики сировини та ланцюгів постачання",
  "nav.item.opacity": "Приховування економічних даних",
  "nav.item.political_risk": "Політичні ризики та сигнали",
  "nav.account": "Обліковий запис",
  "nav.signout": "Вийти",
  "nav.menu": "Меню",
  "nav.close": "Закрити",
  "nav.main": "Основна",
  "home.headline": "Сьогоднішня розвідувальна картина", // uk: needs native review
  "home.tagline": "Прозорі рейтинги надійності джерел для OSINT зон конфлікту",
  "home.sub": "Розвідувальні стрічки по країнах з відкритих новин, Telegram та соцмереж — оцінені за надійністю, зведені у щоденний дайджест і щодня звірені з експертним аналізом. Кожне твердження має посилання на доказ.",
  "home.cta.subscribe": "Стати першим передплатником",
  "home.cta.scoreboard": "Переглянути таблицю",
  "home.cta.digest": "Читати сьогоднішній дайджест",
  "home.cta.coverage": "Переглянути активне охоплення",
  "home.live": "У прямому ефірі: {n} театрів — щоденна глибина в Росії, Україні та Ірані",
  "home.live_label": "У прямому ефірі",
  "home.theater.ru": "Росія",
  "home.theater.ua": "Україна",
  "home.theater.ir": "Іран",
  "home.status.panel_label": "Актуальність даних за театрами",
  "home.status.data_current": "Дані станом на",
  "home.status.docs_24h": "Документів за останні 24 год",
  "home.status.latest_digest": "Останній дайджест", // uk: needs native review
  "home.status.stage_intraday": "проміжний", // uk: needs native review
  "home.status.stage_final": "фінальний", // uk: needs native review
  "home.status.none_today": "сьогодні дайджесту ще немає", // uk: needs native review
  "home.status.claims_for": "Тверджень у дайджесті, {date}", // uk: needs native review
  "home.status.next_update": "Наступне оновлення",
  "home.status.no_data": "даних поки немає",
  "home.status.no_digest": "ще немає", // uk: needs native review
  "home.status.x_paused": "Прийом даних з X призупинено (ліміт витрат вичерпано) — RSS і Telegram продовжують оновлюватися",
  "home.validation.panel_label": "Валідація проти ISW",
  "home.validation.coverage_suffix": "фінальне охоплення", // uk: needs native review
  "home.validation.not_validated": "ще не перевірено",
  "home.validation.median_lead_label": "Медіанне випередження ISW",
  "home.validation.last_validated_label": "Востаннє перевірено",
  "home.validation.corroborated_label": "Частка підтверджених, {date}", // uk: needs native review
  "home.validation.not_computed": "ще не обчислено",
  "home.validation.caption":
    "Ми щодня оцінюємо власні дайджести проти експертного аналізу — включно з промахами.", // uk: needs native review
  "home.status.scoreboard_link": "таблиця валідації →", // uk: needs native review
  "home.quicklinks.label": "Швидкі посилання", // uk: needs native review
  "home.quicklinks.digest": "дайджест", // uk: needs native review
  "home.quicklinks.scoreboard": "таблиця валідації", // uk: needs native review
  "home.quicklinks.registry": "реєстр", // uk: needs native review
  "home.quicklinks.signals": "сигнали", // uk: needs native review
  "home.quicklinks.search": "пошук тверджень", // uk: needs native review
  "home.recent_asks.label": "Ваші останні запитання", // uk: needs native review
  "home.iran.title": "Театр Іран / Затока — щоденна розвідка наживо", // uk: needs native review
  "home.iran.body": "Щоденне охоплення Ірану за трьома напрямами — військова ситуація, ядерна програма, політика еліт — з відкритих новин, Telegram і X, з оцінкою надійності та щоденною валідацією проти експертного аналізу.", // uk: needs native review
  "home.iran.link": "переглянути охоплення Ірану →", // uk: needs native review
  "home.features.reliability.title": "Надійність, виведена, а не заявлена",
  "home.features.reliability.body": "{sources} джерел оцінено з {citations} цитувань за понад 4 роки експертної звітності — як часто кожне джерело підтверджене, лише заявлене чи ніколи не перевірене.",
  "home.features.reliability.link": "переглянути реєстр →",
  "home.features.claims.title": "Твердження, які можна перевірити",
  "home.features.claims.body": "{docs} первинних документів завантажено. Кожне твердження дайджесту пов'язане з його джерельними документами на рівні бази даних — жодного аналізу «чорної скриньки».",
  "home.features.claims.link": "читати сьогоднішній дайджест →",
  "home.features.scored.title": "Щодня оцінюється проти експертів",
  "home.features.scored.body": "{runs} прогонів валідації проти щоденних оцінок ISW. Охоплення, пропуски та випередження — опубліковані, не приховані.",
  "home.features.scored.link": "подивитися, як ми оцінюємо →",
  "home.footer": "Розвідка даних OSINT · аналіз виведено з відкритих джерел; оцінки джерел — статистичні артефакти поведінки цитування, а не рекомендації.",
  "countries.title": "Охоплення",
  "countries.subtitle": "Стрічки моніторингу конфлікту по країнах, щодня оцінені та зведені.",
  "countries.first_digest_pending": "перший дайджест готується",
  "countries.view_digest": "переглянути дайджест →",
  "countries.empty": "Поки що немає охоплення.",
  "countries.data_current": "дані станом на {time}",
  "countries.badge.live": "у прямому ефірі",
  "countries.badge.launching": "охоплення запускається",
  "countries.detail.subtitle":
    "Щоденна розвідка моніторингу конфлікту — оцінена за надійністю, зведена та перевірена експертним аналізом.",
  "countries.detail.ingested_label": "Зібрано документів",
  "countries.detail.digests_label": "Опубліковано щоденних дайджестів",
  "countries.detail.coverage": "{pct}% охоплення подій проти ISW (останній запуск)",
  "countries.detail.latest_digest": "Читати останній дайджест ({date}) →",
  "countries.detail.archive": "Переглянути архів дайджестів →",
  "countries.detail.scoreboard": "Відкрити таблицю валідації →",
  "countries.detail.launching": "Охоплення запускається — набір стрічок і засівання реєстру в черзі.",
  "countries.detail.meta_suffix": "моніторинг конфліктів та OSINT-розвідка",
  "countries.detail.meta_desc":
    "щоденна розвідка з відкритих джерел — стрічки з оцінкою надійності, щоденний дайджест і перевірка експертним аналізом.",
  "nav.group.access": "Запросити доступ",
  "home.beta.badge": "Закрита бета для аналітиків",
  "home.beta.line": "Створюється разом із практикуючими аналітиками. Ми запрошуємо невелику групу перевірити, чи економить BNOW час у щоденному моніторингу, — і сказати нам, де він не спрацьовує.",
  "home.cta.request_beta": "Запросити доступ до бети",
  "access.title": "Запит на доступ до аналітичної бети",
  "access.meta_desc": "BNOW.NET запрошує невелику групу аналітиків, дослідників, журналістів і фахівців із ризиків до своєї закритої аналітичної бети.",
  "access.breadcrumb": "запит доступу",
  "access.intro": "Ми підключаємо невелику групу аналітиків, дослідників, журналістів і фахівців із ризиків. Розкажіть, що ви моніторите, і ми звʼяжемося з вами особисто.",
  "access.no_purchase": "Для запиту доступу не потрібні купівля чи банківська картка.",
  "access.expectation": "Бета-доступ призначено для оцінювання та відгуків про робочий процес. BNOW залишається аналітичним інструментом, а не єдиним джерелом для операційних рішень.",
  "access.email_label": "Робоча пошта",
  "access.linkedin_label": "Профіль LinkedIn або сторінка компанії",
  "access.linkedin_hint": "URL профілю чи сторінки компанії на linkedin.com. Ми зберігаємо лише наданий URL і ніколи не завантажуємо та не збагачуємо його.",
  "access.usecase_label": "Що ви моніторите щодня?",
  "access.usecase_hint": "Достатньо одного-двох речень.",
  "access.optional": "необовʼязково",
  "access.submit": "Запросити бета-доступ",
  "access.pending": "Надсилаємо…",
  "access.success.title": "Запит отримано",
  "access.success.body": "Дякуємо — ми особисто розглядаємо кожен запит і відповімо електронною поштою.",
  "access.err.email": "Введіть дійсну робочу електронну адресу.",
  "access.err.linkedin": "Це не схоже на URL linkedin.com. Поле можна залишити порожнім.",
  "access.err.generic": "Щось пішло не так з нашого боку. Спробуйте ще раз або напишіть нам.",
  "access.fallback": "Зручніше поштою? Напишіть на",
  "pricing.title": "Ціни для передплатників-засновників",
  "pricing.subtitle": "Повний доступ для аналітиків і відділів.",
  "pricing.cta.subscribe": "Передплатити",
  "pricing.cta.request": "Запросити доступ",
  "pricing.email_placeholder": "робоча пошта",
  "pricing.note": "Передплатник-засновник, річна: повний доступ, зафіксований тариф.",
  "pricing.breadcrumb": "тарифи",
  "pricing.intro.stripe_on": "Оформіть підписку нижче.",
  "pricing.intro.stripe_off": "Оформлення підписки ще не запущено — залиште email, і ми підключимо вас особисто за цими тарифами.",
  "pricing.thanks": "Дякуємо — ми звʼяжемося з вами протягом доби.",
  "pricing.err_email": "Введіть дійсну електронну адресу.",
  "pricing.billed_annually": "оплата раз на рік: {total}",
  "pricing.save_pct": "економія {pct}%",
  "pricing.save_pct_badge": "економія {pct}% за рік",
  "pricing.or_monthly": "або {amount}/міс. з помісячною оплатою",
  "pricing.on_request.label": "Ціна за запитом",
  "pricing.cta.monthly_suffix": "помісячно",
  "pricing.cta.annual_suffix": "щорічно (економія {pct}%)",
  "pricing.cta.annual_suffix_plain": "щорічно",
  "pricing.footnote": "Ціни тарифів Standby та Full analyst беруться безпосередньо з чинного списку тарифів. Регіональні пакети та Enterprise/API оцінюються індивідуально.",
  "pricing.standby.name": "Standby",
  "pricing.standby.blurb": "Тариф спостереження для команд, яким потрібен сигнал, а не потік усіх даних.",
  "pricing.standby.feature.digests": "Щоденні дайджести (РФ/Україна)",
  "pricing.standby.feature.scoreboard": "Таблиця валідації",
  "pricing.standby.feature.history": "Історія тверджень за 30 днів",
  "pricing.standby.feature.upgrade": "Перехід на повний аналітичний доступ у будь-який час за узгодженою ціною",
  "pricing.full.name": "Full analyst",
  "pricing.full.blurb": "Повний доступ для аналітиків та команд.",
  "pricing.full.feature.everything_standby": "Усе, що входить у Standby",
  "pricing.full.feature.registry": "Реєстр джерел + дані про надійність",
  "pricing.full.feature.drilldown": "Повний перехід від твердження до джерела та історія",
  "pricing.full.feature.new_theaters": "Нові театри дій одразу після запуску",
  "pricing.regional.name": "Регіональні пакети",
  "pricing.regional.blurb": "Покриття пакетується за географією, а не за новинним циклом — пакет переходить у наступну кризу, а не втрачає актуальність після минулої.",
  "pricing.regional.feature.geography": "Кілька країн в одному фіді за пакетною ціною",
  "pricing.regional.feature.crisis_resilient": "Створено на довше, ніж один новинний цикл",
  "pricing.regional.bundle.ru_ua": "Росія – Україна",
  "pricing.regional.bundle.gulf": "Затока / Близький Схід",
  "pricing.enterprise.name": "Enterprise / API",
  "pricing.enterprise.blurb": "Для команд, які інтегрують BNOW.NET у власні інструменти та процеси.",
  "pricing.enterprise.feature.api": "Постачання через API / фід",
  "pricing.enterprise.feature.multiseat": "Багатомісний доступ",
  "pricing.enterprise.feature.validation_reporting": "Звітність з валідації",
  "pricing.enterprise.feature.custom_theaters": "Індивідуальні театри дій",
  "registry.title": "Реєстр джерел",
  "registry.search_placeholder": "пошук…",
  "registry.col.source": "джерело",
  "registry.col.platform": "платформа",
  "registry.col.status": "стан",
  "registry.col.cited": "цитовано",
  "registry.col.hedging_mix": "профіль обережності",
  "registry.status.decayed": "застаріле",
  "registry.scores_as_of": "Оцінки станом на",
  "registry.reduced.methodology": "Рейтинги надійності показуються в контексті — там, де джерело цитується в дайджесті. Цей індекс упорядковано за кількістю цитувань.",
  "registry.detail.weighting_qualitative": "Надійність зважує підтверджені повідомлення вище, ніж оцінені, заявлені чи неперевірені",
  "scoreboard.title": "Таблиця валідації",
  "scoreboard.empty": "Ще немає прогонів валідації.",
  "scoreboard.col.theater": "театр",
  "scoreboard.col.coverage": "охоплення",
  "scoreboard.col.lead": "випередження (год)",
  "scoreboard.avg_coverage": "середнє охоплення подій проти ISW",
  "scoreboard.median_lead": "медіана інформаційного випередження проти публікації ISW",
  "scoreboard.thin_sourced": "слабко підкріплене",
  "scoreboard.avg_thin_sourced": "середній показник слабко підкріплених тверджень",
  "scoreboard.target_coverage": "ціль ≥ {n}%",
  "scoreboard.target_thin": "ціль < {n}%",
  "scoreboard.target_lead": "ціль у межах ±{n} год",
  "scoreboard.nonzero_day_mean": "дні з ненульовим покриттям: {pct}% (n={days})",
  "scoreboard.view_digest": "переглянути дайджест цього дня →", // uk: needs native review
  "scoreboard.explainer":
    "Ми оцінюємо власний результат. Щодня ми порівнюємо дайджест цієї системи з експертним аналізом людей — Russian Offensive Campaign Assessment від ISW та іншими базовими джерелами — і перевіряємо, чи ми зафіксували ті самі події, наскільки рано, і яка частка опублікованого спирається більш ніж на одне джерело. Ми публікуємо результати, включно з промахами, бо аналітики повинні точно знати, наскільки довіряти автоматизованій стрічці. На відміну від готового текстового звіту, кожне твердження тут посилається на вихідний документ, доступне для пошуку і може з'явитися на години раніше — ця сторінка показує, чого коштує ця швидкість у покритті.", // uk: needs native review
  "scoreboard.how_to_read.summary": "Як читати ці цифри", // uk: needs native review
  "scoreboard.how_to_read.coverage":
    "Покриття % — частка тез ISW за той самий день, які також збіглися з нашим дайджестом. Основне число оцінює наш фінальний дайджест (публікується ~22:00 ET), коли звіт ISW уже вийшов.", // uk: needs native review
  "scoreboard.how_to_read.at_publish":
    "На момент публікації ISW — частка тих самих тез, які ми на той час уже підтвердили завантаженими доказами: чесне порівняння один до одного. Різниця з основним числом — внесок пізнішого завантаження.", // uk: needs native review
  "scoreboard.at_publish": "на момент публікації ISW: {pct}%", // uk: needs native review
  "scoreboard.how_to_read.lead":
    "Інформаційне випередження — медіана годин між нашим найранішим підтверджувальним документом-джерелом і часом публікації ISW серед подій, що збіглися; додатне значення означає, що ми дізналися першими.", // uk: needs native review
  "scoreboard.how_to_read.thin":
    "Слабко підкріплені % — частка наших тверджень, що спираються лише на одне джерело і при цьому позначені як заявлені чи неперевірені, а не подані як встановлений факт. Менше — краще.", // uk: needs native review
  "scoreboard.how_to_read.divergence":
    "Збіг / лише ISW / лише ми — події, які повідомили обидві сторони, події, які повідомив ISW, а ми пропустили, і події, які повідомили ми, а ISW не згадав (можливе випередження).", // uk: needs native review
  "digest.no_events": "Подій не виявлено.",
  "digest.view_for": "перегляд для:",
  "digest.sources": "джерела",
  "digest.confidence": "впевненість",
  "digest.track.military": "Військова ситуація",
  "digest.track.elite": "Політика еліт і переслідування",
  "digest.track.nuclear": "Ядерна програма", // uk: needs native review
  "digest.nav.prev": "попередній", // uk: needs native review
  "digest.nav.next": "наступний", // uk: needs native review
  "digest.nav.archive": "архів дайджестів", // uk: needs native review
  "digest.archive.intro": "Усі щоденні дайджести цього театру — від найновіших. Кожне твердження має посилання на джерельні документи.", // uk: needs native review
  "digest.archive.empty": "Дайджестів поки немає.", // uk: needs native review
  "digest.archive.col.date": "дата", // uk: needs native review
  "digest.archive.col.tracks": "напрями", // uk: needs native review
  "digest.archive.col.claims": "твердження", // uk: needs native review
  "signals.breadcrumb": "аналітичні сигнали",
  "signals.title": "Активні сигнали",
  "signals.intro": "Детерміновані наскрізні індикатори, обчислені на основі графа сутностей, закупівель, шарів прозорості даних і торгівлі. Кожен супроводжується доказами, що його спричинили — без чорної скриньки. Аналітичні судження, а не підтверджені факти.",
  "signals.empty": "Активних сигналів немає.",
  "signals.evidence.summary": "підтверджувальних тверджень — розгорнути для перегляду",
  "signals.evidence.public": "підтверджувальних тверджень · простежуються до джерел",
  "signals.evidence.signin_prompt": "увійдіть, щоб переглянути докази",
  "sources.more_summary": "+{n} ще · {channels} каналів · {platforms} платформ",
  "ask.title": "Запитати розвідку",
  "ask.subtitle": "Цитовані докази",
  "ask.placeholder": "напр., яких олігархів переслідують?",
  "ask.submit": "Запитати",
  "ask.examples": "Спробуйте одне з цих",
  "ask.state.insufficient": "Недостатньо доказів у охопленому масиві даних — спробуйте звузити запит до країни, дійової особи чи типу події.", // uk: needs native review
  "ask.state.refused": "Модель відмовилася відповідати на це формулювання — перефразування зазвичай допомагає.", // uk: needs native review
  "ask.sampled.prefix": "Докази вибрано з", // uk: needs native review
  "ask.sampled.suffix": "відповідних тверджень — повне охоплення дивіться в дайджесті.", // uk: needs native review
  "ask.window.prefix": "Пошук тверджень", // uk: needs native review
  "ask.window.from": "з", // uk: needs native review
  "ask.window.to": "по", // uk: needs native review
  "ask.window.since": "з", // uk: needs native review
  "ask.window.through": "по", // uk: needs native review
  "ask.related.title": "Пов'язані твердження", // uk: needs native review
  "ask.nocoverage.prefix": "Ще немає тверджень, що охоплюють", // uk: needs native review
  "ask.nocoverage.currency": "Дані актуальні станом на", // uk: needs native review
  "ask.pending.hint": "Пошук у базі тверджень — зазвичай ~10 секунд", // uk: needs native review
  "search.title": "Пошук тверджень", // uk: needs native review
  "search.breadcrumb": "пошук тверджень", // uk: needs native review
  "search.intro": "Повнотекстовий пошук у базі тверджень. Детермінований збіг — без викликів моделі, без бюджету на запити. Кожен результат має посилання на дайджест і джерельні документи.", // uk: needs native review
  "search.placeholder": "напр., удари дронів по Харкову", // uk: needs native review
  "search.submit": "Шукати", // uk: needs native review
  "search.empty": "Збігів немає.", // uk: needs native review
  "search.count": "показано {n} з {total} відповідних тверджень", // uk: needs native review
  "feedback.flag_digest": "Повідомити про помилку в цьому дайджесті", // uk: needs native review
  "feedback.flag_source": "Запропонувати або позначити джерело", // uk: needs native review
  "auth.signin": "Увійти",
  "auth.email_placeholder": "ви@приклад.ua",
  "auth.send_link": "Надіслати магічне посилання",
  "auth.sent": "Перевірте пошту — там посилання для входу.",
  "common.status": "стан",
  "common.loading": "Завантаження…",
  "common.empty": "Тут поки що порожньо.",
  "common.error": "Щось пішло не так.",
  "common.retry": "Спробувати знову",
  "common.back": "Назад",
  "common.updated": "Оновлено",
  "common.learn_more": "Дізнатися більше",
  "common.skip_to_content": "Перейти до вмісту",
  "error.heading": "Під час показу цієї сторінки сталася помилка.",
  "error.body": "Помилку зафіксовано. Повторна спроба зазвичай усуває тимчасові проблеми з даними.",
  "error.reference": "Довідковий код",
};

// German
const de: Dict = {
  "nav.home": "Start",
  "nav.theaters": "Kriegsschauplätze",
  "nav.ru_registry": "RU-Register",
  "nav.me_registry": "Nahost-Register",
  "nav.scoreboard": "Bewertungstabelle",
  "nav.ask": "Fragen",
  "nav.datadark": "Datenlücken",
  "nav.trade": "Handelsumgehung",
  "nav.signals": "Signale",
  "nav.materials": "kritische Rohstoffe",
  "nav.pricing": "Preise",
  "nav.signin": "Anmelden",
  "nav.language": "Sprache",
  "nav.group.product": "Produkt",
  "nav.group.coverage": "Abdeckung",
  "nav.group.validation": "Validierung",
  "nav.group.solutions": "Lösungen",
  "nav.group.pricing": "Preise",
  "nav.group.signals": "Signale",
  "nav.group.ask": "Fragen",
  "nav.item.feeds": "Tägliche Intelligence-Feeds",
  "nav.item.ask": "Die Daten befragen",
  "nav.item.registry": "Register der Quellenzuverlässigkeit",
  "nav.item.me_registry": "Nahost-Register",
  "nav.item.signals": "Analystensignale",
  "nav.item.all_theaters": "Alle Schauplätze",
  "nav.item.sanctions": "Sanktionen & Handelsumgehung",
  "nav.item.commodity": "Rohstoff- & Lieferkettenrisiko",
  "nav.item.opacity": "Unterdrückung von Wirtschaftsdaten",
  "nav.item.political_risk": "Politisches Risiko & Signale",
  "nav.account": "Konto",
  "nav.signout": "Abmelden",
  "nav.menu": "Menü",
  "nav.close": "Schließen",
  "nav.main": "Haupt",
  "home.tagline": "Transparente Bewertungen der Quellenzuverlässigkeit für OSINT in Konfliktzonen",
  "home.sub": "Länderspezifische Intelligence-Feeds aus offenen Nachrichten, Telegram und sozialen Quellen — nach Zuverlässigkeit bewertet, zu einem täglichen Digest verdichtet und jeden Tag gegen fachkundige menschliche Analyse validiert. Jede Aussage verweist auf ihren Beleg.",
  "home.cta.subscribe": "Gründungsabonnent werden",
  "home.cta.scoreboard": "Zur Bewertungstabelle",
  "home.cta.digest": "Heutigen Digest lesen",
  "home.cta.coverage": "Live-Abdeckung erkunden",
  "home.live": "Jetzt live: {n} Schauplätze — tägliche Tiefe in Russland, Ukraine und Iran",
  "home.live_label": "Jetzt live",
  "home.theater.ru": "Russland",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Zuverlässigkeit, abgeleitet statt behauptet",
  "home.features.reliability.body": "{sources} Quellen bewertet aus {citations} Zitaten aus über 4 Jahren fachkundiger Berichterstattung — wie oft jede Quelle bestätigt, nur behauptet oder nie verifiziert wurde.",
  "home.features.reliability.link": "Register erkunden →",
  "home.features.claims.title": "Aussagen, die Sie prüfen können",
  "home.features.claims.body": "{docs} Rohdokumente erfasst. Jede Digest-Aussage ist auf Datenbankebene mit ihren Quelldokumenten verknüpft — keine Blackbox-Analyse.",
  "home.features.claims.link": "heutigen Digest lesen →",
  "home.features.scored.title": "Täglich gegen Experten bewertet",
  "home.features.scored.body": "{runs} Validierungsläufe gegen die täglichen ISW-Einschätzungen. Abdeckung, Lücken und Vorsprünge — veröffentlicht, nicht verborgen.",
  "home.features.scored.link": "sehen, wie wir bewerten →",
  "home.footer": "OSINT-Datenintelligenz · Analyse abgeleitet aus offenen Quellen; Quellenbewertungen sind statistische Artefakte des Zitierverhaltens, keine Empfehlungen.",
  "countries.title": "Abdeckung",
  "countries.subtitle": "Länderspezifische Konfliktbeobachtungs-Feeds, täglich bewertet und verdichtet.",
  "countries.first_digest_pending": "erster Digest ausstehend",
  "countries.view_digest": "Digest ansehen →",
  "countries.empty": "Noch keine Abdeckung.",
  "nav.group.access": "Zugang anfragen",
  "home.beta.badge": "Private Analysten-Beta",
  "home.beta.line": "Gemeinsam mit aktiven Analysten entwickelt. Wir laden eine kleine Gruppe ein zu testen, ob BNOW im täglichen Monitoring Zeit spart — und uns zu sagen, wo es versagt.",
  "home.cta.request_beta": "Beta-Zugang anfragen",
  "access.title": "Analysten-Beta-Zugang anfragen",
  "access.meta_desc": "BNOW.NET nimmt eine kleine Gruppe von Analysten, Forschern, Journalisten und Risiko-Fachleuten in seine private Analysten-Beta auf.",
  "access.breadcrumb": "Zugang anfragen",
  "access.intro": "Wir nehmen eine kleine Gruppe von Analysten, Forschern, Journalisten und Risiko-Fachleuten auf. Sagen Sie uns, was Sie beobachten, und wir melden uns persönlich.",
  "access.no_purchase": "Für die Zugangs-Anfrage sind kein Kauf und keine Karte erforderlich.",
  "access.expectation": "Der Beta-Zugang dient der Evaluierung und dem Workflow-Feedback. BNOW bleibt ein analytisches Hilfsmittel und keine alleinige Grundlage für operative Entscheidungen.",
  "access.email_label": "Geschäftliche E-Mail",
  "access.linkedin_label": "LinkedIn-Profil oder Unternehmensseite",
  "access.linkedin_hint": "Eine Profil- oder Unternehmensseiten-URL auf linkedin.com. Wir speichern nur die angegebene URL und rufen sie niemals ab.",
  "access.usecase_label": "Was beobachten Sie Tag für Tag?",
  "access.usecase_hint": "Ein bis zwei Sätze genügen.",
  "access.optional": "optional",
  "access.submit": "Beta-Zugang anfragen",
  "access.pending": "Wird gesendet …",
  "access.success.title": "Anfrage erhalten",
  "access.success.body": "Danke — wir prüfen jede Anfrage persönlich und melden uns per E-Mail.",
  "access.err.email": "Bitte geben Sie eine gültige geschäftliche E-Mail-Adresse ein.",
  "access.err.linkedin": "Das sieht nicht nach einer linkedin.com-URL aus. Das Feld kann leer bleiben.",
  "access.err.generic": "Bei uns ist etwas schiefgelaufen. Bitte erneut versuchen oder per E-Mail schreiben.",
  "access.fallback": "Lieber per E-Mail? Schreiben Sie an",
  "pricing.title": "Preise für Gründungsabonnenten",
  "pricing.subtitle": "Voller Zugang für Analysten und Desks.",
  "pricing.cta.subscribe": "Abonnieren",
  "pricing.cta.request": "Zugang anfragen",
  "pricing.email_placeholder": "geschäftliche E-Mail",
  "pricing.note": "Gründungsabonnent, jährlich: voller Zugang, fester Tarif.",
  "registry.title": "Quellenregister",
  "registry.search_placeholder": "suchen…",
  "registry.col.source": "Quelle",
  "registry.col.platform": "Plattform",
  "registry.col.status": "Status",
  "registry.col.cited": "zitiert",
  "registry.col.hedging_mix": "Hedging-Mix",
  "registry.status.decayed": "verfallen",
  "scoreboard.title": "Validierungstabelle",
  "scoreboard.empty": "Noch keine Validierungsläufe.",
  "scoreboard.col.theater": "Schauplatz",
  "scoreboard.col.coverage": "Abdeckung",
  "scoreboard.col.lead": "Vorsprung (Std.)",
  "scoreboard.avg_coverage": "durchschn. Ereignisabdeckung ggü. ISW",
  "scoreboard.median_lead": "medianer Informationsvorsprung ggü. ISW-Veröffentlichung",
  "scoreboard.thin_sourced": "dünn belegt",
  "digest.no_events": "Keine Ereignisse extrahiert.",
  "digest.view_for": "Ansicht für:",
  "digest.sources": "Quellen",
  "digest.confidence": "Konfidenz",
  "digest.track.military": "Militärische Lage",
  "digest.track.elite": "Elitenpolitik & Strafverfolgung",
  "ask.title": "Die Erkenntnisse befragen",
  "ask.subtitle": "Zitierte Belege",
  "ask.placeholder": "z. B. welche Oligarchen werden strafrechtlich verfolgt?",
  "ask.submit": "Fragen",
  "ask.examples": "Probieren Sie eine davon",
  "auth.signin": "Anmelden",
  "auth.email_placeholder": "sie@beispiel.de",
  "auth.send_link": "Magischen Link senden",
  "auth.sent": "Prüfen Sie Ihre E-Mail auf einen Anmeldelink.",
  "common.status": "Status",
  "common.loading": "Wird geladen…",
  "common.empty": "Noch nichts vorhanden.",
  "common.error": "Etwas ist schiefgelaufen.",
  "common.retry": "Erneut versuchen",
  "common.back": "Zurück",
  "common.updated": "Aktualisiert",
  "common.learn_more": "Mehr erfahren",
};

// Arabic (RTL)
const ar: Dict = {
  "nav.home": "الرئيسية",
  "nav.theaters": "مسارح العمليات",
  "nav.ru_registry": "سجل روسيا",
  "nav.me_registry": "سجل الشرق الأوسط",
  "nav.scoreboard": "لوحة التحقق",
  "nav.ask": "اسأل",
  "nav.datadark": "فجوات البيانات",
  "nav.trade": "التحايل التجاري",
  "nav.signals": "إشارات",
  "nav.materials": "المواد الحرجة",
  "nav.pricing": "الأسعار",
  "nav.signin": "تسجيل الدخول",
  "nav.language": "اللغة",
  "nav.group.product": "المنتج",
  "nav.group.coverage": "التغطية",
  "nav.group.validation": "التحقق",
  "nav.group.solutions": "الحلول",
  "nav.group.pricing": "الأسعار",
  "nav.group.signals": "الإشارات",
  "nav.group.ask": "اسأل",
  "nav.item.feeds": "تدفقات استخباراتية يومية",
  "nav.item.ask": "اسأل البيانات",
  "nav.item.registry": "سجل موثوقية المصادر",
  "nav.item.me_registry": "سجل الشرق الأوسط",
  "nav.item.signals": "إشارات المحللين",
  "nav.item.all_theaters": "جميع مسارح العمليات",
  "nav.item.sanctions": "العقوبات والتحايل التجاري",
  "nav.item.commodity": "مخاطر السلع وسلاسل التوريد",
  "nav.item.opacity": "حجب البيانات الاقتصادية",
  "nav.item.political_risk": "المخاطر السياسية والإشارات",
  "nav.account": "الحساب",
  "nav.signout": "تسجيل الخروج",
  "nav.menu": "القائمة",
  "nav.close": "إغلاق",
  "nav.main": "الرئيسية",
  "home.tagline": "تقييمات شفافة لموثوقية المصادر لأغراض OSINT في مناطق النزاع",
  "home.sub": "تدفقات استخباراتية لكل بلد من الأخبار المفتوحة وTelegram والمصادر الاجتماعية — مُقيَّمة حسب الموثوقية، ومدمجة في موجز يومي، ومُتحقَّق منها كل يوم مقابل تحليل بشري خبير. كل ادعاء يرتبط بدليله.",
  "home.cta.subscribe": "كن مشتركًا مؤسسًا",
  "home.cta.scoreboard": "شاهد لوحة التحقق",
  "home.cta.digest": "اقرأ موجز اليوم",
  "home.cta.coverage": "استكشف التغطية المباشرة",
  "home.live": "مباشر الآن: {n} مسارح — تغطية يومية معمّقة في روسيا وأوكرانيا وإيران",
  "home.live_label": "مباشر الآن",
  "home.theater.ru": "روسيا",
  "home.theater.ua": "أوكرانيا",
  "home.theater.ir": "إيران",
  "home.features.reliability.title": "موثوقية مُستنتَجة لا مُدَّعاة",
  "home.features.reliability.body": "{sources} مصدرًا مُقيَّمًا من {citations} اقتباسًا عبر أكثر من 4 سنوات من التقارير الخبيرة — كم مرة يُؤكَّد كل مصدر أو يُدَّعى فقط أو لا يُتحقَّق منه أبدًا.",
  "home.features.reliability.link": "استكشف السجل ←",
  "home.features.claims.title": "ادعاءات يمكنك تدقيقها",
  "home.features.claims.body": "{docs} وثيقة خام مُستوعَبة. كل ادعاء في الموجز مرتبط بوثائق مصدره على مستوى قاعدة البيانات — لا تحليل صندوق أسود.",
  "home.features.claims.link": "اقرأ موجز اليوم ←",
  "home.features.scored.title": "مُقيَّم مقابل الخبراء يوميًا",
  "home.features.scored.body": "{runs} عملية تحقق مقابل تقييمات ISW اليومية. التغطية والإغفالات والأسبقية — منشورة لا مخفية.",
  "home.features.scored.link": "شاهد كيف نُقيّم ←",
  "home.footer": "استخبارات بيانات OSINT · تحليل مُستنتَج من مصادر مفتوحة؛ تقييمات المصادر نتاج إحصائي لسلوك الاقتباس، وليست توصيات.",
  "countries.title": "التغطية",
  "countries.subtitle": "تدفقات مراقبة النزاع لكل بلد، مُقيَّمة ومدمجة يوميًا.",
  "countries.first_digest_pending": "الموجز الأول قيد الإعداد",
  "countries.view_digest": "عرض الموجز ←",
  "countries.empty": "لا توجد تغطية بعد.",
  "nav.group.access": "اطلب الوصول",
  "home.beta.badge": "نسخة تجريبية خاصة للمحللين",
  "home.beta.line": "بُني مع محللين ممارسين. ندعو مجموعة صغيرة لاختبار ما إذا كان BNOW يوفّر الوقت في المتابعة اليومية — ولإخبارنا أين يخفق.",
  "home.cta.request_beta": "اطلب الوصول إلى النسخة التجريبية",
  "access.title": "طلب الوصول إلى النسخة التجريبية للمحللين",
  "access.meta_desc": "يستقبل BNOW.NET مجموعة صغيرة من المحللين والباحثين والصحفيين ومتخصصي المخاطر في نسخته التجريبية الخاصة للمحللين.",
  "access.breadcrumb": "طلب الوصول",
  "access.intro": "نستقبل مجموعة صغيرة من المحللين والباحثين والصحفيين ومتخصصي المخاطر. أخبرنا بما تتابعه وسنتواصل معك شخصيًا.",
  "access.no_purchase": "لا يلزم شراء ذاتي أو بطاقة لطلب الوصول.",
  "access.expectation": "الوصول التجريبي مخصص للتقييم وملاحظات سير العمل. يظل BNOW أداة تحليلية مساعدة، لا مصدرًا وحيدًا للقرارات التشغيلية.",
  "access.email_label": "البريد الإلكتروني للعمل",
  "access.linkedin_label": "ملف LinkedIn الشخصي أو صفحة الشركة",
  "access.linkedin_hint": "رابط ملف شخصي أو صفحة شركة على linkedin.com. نخزّن الرابط الذي تقدمه فقط ولا نجلبه أو نُثريه أبدًا.",
  "access.usecase_label": "ما الذي تتابعه يوميًا؟",
  "access.usecase_hint": "تكفي جملة أو جملتان.",
  "access.optional": "اختياري",
  "access.submit": "اطلب الوصول التجريبي",
  "access.pending": "جارٍ الإرسال…",
  "access.success.title": "تم استلام الطلب",
  "access.success.body": "شكرًا — نراجع كل طلب شخصيًا وسنتابع معك عبر البريد الإلكتروني.",
  "access.err.email": "يرجى إدخال بريد إلكتروني صالح للعمل.",
  "access.err.linkedin": "لا يبدو هذا رابط linkedin.com. يمكنك ترك الحقل فارغًا.",
  "access.err.generic": "حدث خطأ من جانبنا. حاول مرة أخرى أو راسلنا عبر البريد الإلكتروني.",
  "access.fallback": "تفضّل البريد الإلكتروني؟ راسلنا على",
  "pricing.title": "أسعار المشترك المؤسس",
  "pricing.subtitle": "وصول كامل للمحللين والفرق.",
  "pricing.cta.subscribe": "اشترك",
  "pricing.cta.request": "اطلب الوصول",
  "pricing.email_placeholder": "البريد المهني",
  "pricing.note": "مشترك مؤسس سنويًا: وصول كامل بسعر ثابت.",
  "registry.title": "سجل المصادر",
  "registry.search_placeholder": "بحث…",
  "registry.col.source": "المصدر",
  "registry.col.platform": "المنصة",
  "registry.col.status": "الحالة",
  "registry.col.cited": "مُقتبَس",
  "registry.col.hedging_mix": "مزيج التحوّط",
  "registry.status.decayed": "متلاشٍ",
  "scoreboard.title": "لوحة التحقق",
  "scoreboard.empty": "لا توجد عمليات تحقق بعد.",
  "scoreboard.col.theater": "المسرح",
  "scoreboard.col.coverage": "التغطية",
  "scoreboard.col.lead": "الأسبقية (ساعات)",
  "scoreboard.avg_coverage": "متوسط تغطية الأحداث مقابل ISW",
  "scoreboard.median_lead": "وسيط الأسبقية المعلوماتية مقابل نشر ISW",
  "scoreboard.thin_sourced": "ضعيف المصادر",
  "digest.no_events": "لم تُستخرج أحداث.",
  "digest.view_for": "عرض لـ:",
  "digest.sources": "المصادر",
  "digest.confidence": "الثقة",
  "digest.track.military": "الوضع العسكري",
  "digest.track.elite": "سياسة النخبة والملاحقات",
  "ask.title": "استجوب المعلومات الاستخباراتية",
  "ask.subtitle": "أدلة موثَّقة",
  "ask.placeholder": "مثال: أي الأوليغارشيين يخضعون للملاحقة؟",
  "ask.submit": "اسأل",
  "ask.examples": "جرّب أحد هذه",
  "auth.signin": "تسجيل الدخول",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "أرسل رابط الدخول السحري",
  "auth.sent": "تحقق من بريدك للحصول على رابط تسجيل الدخول.",
  "common.status": "الحالة",
  "common.loading": "جارٍ التحميل…",
  "common.empty": "لا شيء هنا بعد.",
  "common.error": "حدث خطأ ما.",
  "common.retry": "أعد المحاولة",
  "common.back": "رجوع",
  "common.updated": "مُحدَّث",
  "common.learn_more": "اعرف المزيد",
};

// Japanese
const ja: Dict = {
  "nav.home": "ホーム",
  "nav.theaters": "戦域",
  "nav.ru_registry": "ロシア登録簿",
  "nav.me_registry": "中東登録簿",
  "nav.scoreboard": "検証スコアボード",
  "nav.ask": "質問",
  "nav.datadark": "データ空白",
  "nav.trade": "貿易迂回",
  "nav.signals": "シグナル",
  "nav.materials": "重要鉱物",
  "nav.pricing": "料金",
  "nav.signin": "サインイン",
  "nav.language": "言語",
  "nav.group.product": "製品",
  "nav.group.coverage": "カバレッジ",
  "nav.group.validation": "検証",
  "nav.group.solutions": "ソリューション",
  "nav.group.pricing": "料金",
  "nav.group.signals": "シグナル",
  "nav.group.ask": "質問",
  "nav.item.feeds": "日次インテリジェンスフィード",
  "nav.item.ask": "データに質問する",
  "nav.item.registry": "情報源信頼性登録簿",
  "nav.item.me_registry": "中東登録簿",
  "nav.item.signals": "アナリストシグナル",
  "nav.item.all_theaters": "すべての戦域",
  "nav.item.sanctions": "制裁と貿易迂回",
  "nav.item.commodity": "コモディティ・サプライチェーンリスク",
  "nav.item.opacity": "経済データの秘匿",
  "nav.item.political_risk": "政治リスクとシグナル",
  "nav.account": "アカウント",
  "nav.signout": "サインアウト",
  "nav.menu": "メニュー",
  "nav.close": "閉じる",
  "nav.main": "メイン",
  "home.tagline": "紛争地域OSINTのための透明な情報源信頼性評価",
  "home.sub": "公開ニュース、Telegram、ソーシャル情報源からの国別インテリジェンスフィード。信頼性で評価し、日次ダイジェストに統合し、専門家による分析と毎日照合します。すべての主張は証拠にリンクしています。",
  "home.cta.subscribe": "創設サブスクライバーになる",
  "home.cta.scoreboard": "スコアボードを見る",
  "home.cta.digest": "今日のダイジェストを読む",
  "home.cta.coverage": "稼働中のカバレッジを見る",
  "home.live": "稼働中：{n} の戦域 — ロシア・ウクライナ・イランを毎日詳細にカバー",
  "home.live_label": "稼働中",
  "home.theater.ru": "ロシア",
  "home.theater.ua": "ウクライナ",
  "home.theater.ir": "イラン",
  "home.features.reliability.title": "主張ではなく導出された信頼性",
  "home.features.reliability.body": "4年以上の専門的報道による{citations}件の引用から{sources}件の情報源を評価 — 各情報源がどれだけ確認され、単に主張され、あるいは一度も検証されなかったか。",
  "home.features.reliability.link": "登録簿を見る →",
  "home.features.claims.title": "検証できる主張",
  "home.features.claims.body": "{docs}件の生文書を取り込み。ダイジェストの各主張はデータベースレベルで情報源文書にリンクされています — ブラックボックス分析はありません。",
  "home.features.claims.link": "今日のダイジェストを読む →",
  "home.features.scored.title": "毎日、専門家と照合して採点",
  "home.features.scored.body": "ISWの日次評価に対する{runs}回の検証実行。カバレッジ、見落とし、先行 — 隠さず公開します。",
  "home.features.scored.link": "採点方法を見る →",
  "home.footer": "OSINTデータインテリジェンス · 公開情報源から導出した分析。情報源評価は引用行動の統計的産物であり、推奨ではありません。",
  "countries.title": "カバレッジ",
  "countries.subtitle": "国別の紛争監視フィード。毎日採点・統合します。",
  "countries.first_digest_pending": "最初のダイジェストを準備中",
  "countries.view_digest": "ダイジェストを見る →",
  "countries.empty": "まだカバレッジがありません。",
  "nav.group.access": "アクセスを申請",
  "home.beta.badge": "アナリスト向けプライベートベータ",
  "home.beta.line": "現役アナリストとともに開発。少人数のグループを招待し、BNOW が日々のモニタリングで時間を節約できるか——そしてどこで失敗するかを検証していただきます。",
  "home.cta.request_beta": "ベータアクセスを申請",
  "access.title": "アナリストベータへのアクセス申請",
  "access.meta_desc": "BNOW.NET は、アナリスト・研究者・ジャーナリスト・リスク専門家の少人数グループをプライベートベータに受け入れています。",
  "access.breadcrumb": "アクセス申請",
  "access.intro": "アナリスト・研究者・ジャーナリスト・リスク専門家の少人数グループを受け入れています。日々何をモニタリングしているかをお聞かせください。個別にご連絡します。",
  "access.no_purchase": "アクセス申請に購入やカードは不要です。",
  "access.expectation": "ベータアクセスは評価とワークフローのフィードバックを目的としています。BNOW は分析の補助ツールであり、運用判断の唯一の情報源ではありません。",
  "access.email_label": "業務用メールアドレス",
  "access.linkedin_label": "LinkedIn プロフィールまたは企業ページ",
  "access.linkedin_hint": "linkedin.com のプロフィールまたは企業ページの URL。ご提供いただいた URL のみを保存し、取得や補完は一切行いません。",
  "access.usecase_label": "日々何をモニタリングしていますか？",
  "access.usecase_hint": "1〜2 文で十分です。",
  "access.optional": "任意",
  "access.submit": "ベータアクセスを申請",
  "access.pending": "送信中…",
  "access.success.title": "申請を受け付けました",
  "access.success.body": "ありがとうございます。すべての申請を個別に確認し、メールでご連絡します。",
  "access.err.email": "有効な業務用メールアドレスを入力してください。",
  "access.err.linkedin": "linkedin.com の URL ではないようです。空欄のままでも構いません。",
  "access.err.generic": "こちら側で問題が発生しました。再試行するか、メールでご連絡ください。",
  "access.fallback": "メールをご希望の場合は、こちらへ:",
  "pricing.title": "創設サブスクライバー料金",
  "pricing.subtitle": "アナリストとデスク向けのフルアクセス。",
  "pricing.cta.subscribe": "購読する",
  "pricing.cta.request": "アクセスを申請",
  "pricing.email_placeholder": "業務用メール",
  "pricing.note": "創設サブスクライバー年額：フルアクセス、固定料金。",
  "registry.title": "情報源登録簿",
  "registry.search_placeholder": "検索…",
  "registry.col.source": "情報源",
  "registry.col.platform": "プラットフォーム",
  "registry.col.status": "状態",
  "registry.col.cited": "被引用",
  "registry.col.hedging_mix": "ヘッジング構成",
  "registry.status.decayed": "減衰",
  "scoreboard.title": "検証スコアボード",
  "scoreboard.empty": "検証実行はまだありません。",
  "scoreboard.col.theater": "戦域",
  "scoreboard.col.coverage": "カバレッジ",
  "scoreboard.col.lead": "先行（時間）",
  "scoreboard.avg_coverage": "ISW比の平均イベントカバレッジ",
  "scoreboard.median_lead": "ISW公開比の情報先行の中央値",
  "scoreboard.thin_sourced": "情報源が乏しい",
  "digest.no_events": "抽出されたイベントはありません。",
  "digest.view_for": "表示対象：",
  "digest.sources": "情報源",
  "digest.confidence": "確信度",
  "digest.track.military": "軍事情勢",
  "digest.track.elite": "エリート政治と訴追",
  "ask.title": "インテリジェンスに問い合わせる",
  "ask.subtitle": "引用付き証拠",
  "ask.placeholder": "例：どのオリガルヒが訴追されていますか？",
  "ask.submit": "質問する",
  "ask.examples": "こちらを試してください",
  "auth.signin": "サインイン",
  "auth.email_placeholder": "you@example.com",
  "auth.send_link": "マジックリンクを送信",
  "auth.sent": "サインインリンクをメールでご確認ください。",
  "common.status": "状態",
  "common.loading": "読み込み中…",
  "common.empty": "まだ何もありません。",
  "common.error": "問題が発生しました。",
  "common.retry": "再試行",
  "common.back": "戻る",
  "common.updated": "更新済み",
  "common.learn_more": "詳細",
};

// Polish
const pl: Dict = {
  "nav.home": "start",
  "nav.theaters": "teatry działań",
  "nav.ru_registry": "rejestr RU",
  "nav.me_registry": "rejestr BW",
  "nav.scoreboard": "tabela walidacji",
  "nav.ask": "zapytaj",
  "nav.datadark": "luki w danych",
  "nav.trade": "obchodzenie sankcji handlowych",
  "nav.signals": "sygnały",
  "nav.materials": "surowce krytyczne",
  "nav.pricing": "cennik",
  "nav.signin": "zaloguj się",
  "nav.language": "Język",
  "nav.group.product": "Produkt",
  "nav.group.coverage": "Pokrycie",
  "nav.group.validation": "Walidacja",
  "nav.group.solutions": "Rozwiązania",
  "nav.group.pricing": "Cennik",
  "nav.group.signals": "Sygnały",
  "nav.group.ask": "Zapytaj",
  "nav.item.feeds": "Codzienne kanały wywiadowcze",
  "nav.item.ask": "Zapytaj dane",
  "nav.item.registry": "Rejestr wiarygodności źródeł",
  "nav.item.me_registry": "Rejestr Bliskiego Wschodu",
  "nav.item.signals": "Sygnały analityczne",
  "nav.item.all_theaters": "Wszystkie teatry działań",
  "nav.item.sanctions": "Sankcje i obchodzenie handlu",
  "nav.item.commodity": "Ryzyko surowcowe i łańcucha dostaw",
  "nav.item.opacity": "Ukrywanie danych gospodarczych",
  "nav.item.political_risk": "Ryzyko polityczne i sygnały",
  "nav.account": "Konto",
  "nav.signout": "Wyloguj się",
  "nav.menu": "Menu",
  "nav.close": "Zamknij",
  "nav.main": "Główna",
  "home.tagline": "Przejrzyste oceny wiarygodności źródeł dla OSINT w strefach konfliktu",
  "home.sub": "Wywiadowcze kanały dla poszczególnych krajów z otwartych wiadomości, serwisu Telegram i źródeł społecznościowych — oceniane pod kątem wiarygodności, łączone w codzienny skrót i codziennie weryfikowane wobec eksperckiej analizy. Każde twierdzenie odsyła do swojego dowodu.",
  "home.cta.subscribe": "Zostań subskrybentem założycielem",
  "home.cta.scoreboard": "Zobacz tabelę walidacji",
  "home.cta.digest": "Przeczytaj dzisiejszy skrót",
  "home.cta.coverage": "Poznaj pokrycie na żywo",
  "home.live": "Na żywo: {n} teatrów — codzienna głębia w Rosji, Ukrainie i Iranie",
  "home.live_label": "Na żywo",
  "home.theater.ru": "Rosja",
  "home.theater.ua": "Ukraina",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Wiarygodność wyprowadzona, nie deklarowana",
  "home.features.reliability.body": "{sources} źródeł ocenionych na podstawie {citations} cytowań z ponad 4 lat eksperckiego dziennikarstwa — jak często każde źródło jest potwierdzone, jedynie deklarowane lub nigdy nie zweryfikowane.",
  "home.features.reliability.link": "przeglądaj rejestr →",
  "home.features.claims.title": "Twierdzenia, które możesz zweryfikować",
  "home.features.claims.body": "{docs} surowych dokumentów pozyskanych. Każde twierdzenie w skrócie jest powiązane ze swoimi dokumentami źródłowymi na poziomie bazy danych — żadnej analizy typu czarna skrzynka.",
  "home.features.claims.link": "przeczytaj dzisiejszy skrót →",
  "home.features.scored.title": "Codziennie oceniane wobec ekspertów",
  "home.features.scored.body": "{runs} przebiegów walidacji wobec codziennych ocen ISW. Pokrycie, braki i przewagi — publikowane, nie ukrywane.",
  "home.features.scored.link": "zobacz, jak oceniamy →",
  "home.footer": "Wywiad danych OSINT · analiza wyprowadzona z otwartych źródeł; oceny źródeł to statystyczne artefakty zachowań cytowania, nie rekomendacje.",
  "countries.title": "Pokrycie",
  "countries.subtitle": "Kanały monitorowania konfliktów dla poszczególnych krajów, oceniane i łączone codziennie.",
  "countries.first_digest_pending": "pierwszy skrót w toku",
  "countries.view_digest": "zobacz skrót →",
  "countries.empty": "Brak pokrycia.",
  "nav.group.access": "Poproś o dostęp",
  "home.beta.badge": "Prywatna beta dla analityków",
  "home.beta.line": "Tworzone z praktykującymi analitykami. Zapraszamy niewielką grupę, aby sprawdzić, czy BNOW oszczędza czas w codziennym monitoringu — i powiedzieć nam, gdzie zawodzi.",
  "home.cta.request_beta": "Poproś o dostęp do bety",
  "access.title": "Prośba o dostęp do bety analitycznej",
  "access.meta_desc": "BNOW.NET przyjmuje niewielką grupę analityków, badaczy, dziennikarzy i specjalistów ds. ryzyka do prywatnej bety analitycznej.",
  "access.breadcrumb": "prośba o dostęp",
  "access.intro": "Przyjmujemy niewielką grupę analityków, badaczy, dziennikarzy i specjalistów ds. ryzyka. Napisz, co monitorujesz, a odezwiemy się osobiście.",
  "access.no_purchase": "Do złożenia prośby o dostęp nie jest wymagany zakup ani karta.",
  "access.expectation": "Dostęp do bety służy ocenie i informacjom zwrotnym o przepływie pracy. BNOW pozostaje narzędziem analitycznym, a nie jedynym źródłem decyzji operacyjnych.",
  "access.email_label": "Służbowy e-mail",
  "access.linkedin_label": "Profil LinkedIn lub strona firmowa",
  "access.linkedin_hint": "Adres URL profilu lub strony firmowej na linkedin.com. Przechowujemy tylko podany URL — nigdy go nie pobieramy ani nie wzbogacamy.",
  "access.usecase_label": "Co monitorujesz na co dzień?",
  "access.usecase_hint": "Wystarczy jedno–dwa zdania.",
  "access.optional": "opcjonalnie",
  "access.submit": "Poproś o dostęp do bety",
  "access.pending": "Wysyłanie…",
  "access.success.title": "Prośba przyjęta",
  "access.success.body": "Dziękujemy — każdą prośbę rozpatrujemy osobiście i odpowiemy e-mailem.",
  "access.err.email": "Podaj prawidłowy służbowy adres e-mail.",
  "access.err.linkedin": "To nie wygląda na adres linkedin.com. Pole można zostawić puste.",
  "access.err.generic": "Coś poszło nie tak po naszej stronie. Spróbuj ponownie lub napisz do nas e-mail.",
  "access.fallback": "Wolisz e-mail? Napisz na",
  "pricing.title": "Cennik dla subskrybentów założycieli",
  "pricing.subtitle": "Pełny dostęp dla analityków i zespołów.",
  "pricing.cta.subscribe": "Subskrybuj",
  "pricing.cta.request": "Poproś o dostęp",
  "pricing.email_placeholder": "e-mail służbowy",
  "pricing.note": "Subskrybent założyciel, rocznie: pełny dostęp, stała stawka.",
  "registry.title": "Rejestr źródeł",
  "registry.search_placeholder": "szukaj…",
  "registry.col.source": "źródło",
  "registry.col.platform": "platforma",
  "registry.col.status": "status",
  "registry.col.cited": "cytowane",
  "registry.col.hedging_mix": "profil ostrożności",
  "registry.status.decayed": "wygasłe",
  "scoreboard.title": "Tabela walidacji",
  "scoreboard.empty": "Brak przebiegów walidacji.",
  "scoreboard.col.theater": "teatr",
  "scoreboard.col.coverage": "pokrycie",
  "scoreboard.col.lead": "przewaga (godz.)",
  "scoreboard.avg_coverage": "śr. pokrycie zdarzeń vs ISW",
  "scoreboard.median_lead": "mediana przewagi informacyjnej vs publikacja ISW",
  "scoreboard.thin_sourced": "słabo udokumentowane",
  "digest.no_events": "Nie wyodrębniono zdarzeń.",
  "digest.view_for": "widok dla:",
  "digest.sources": "źródła",
  "digest.confidence": "pewność",
  "digest.track.military": "Sytuacja militarna",
  "digest.track.elite": "Polityka elit i postępowania karne",
  "ask.title": "Przepytaj dane wywiadowcze",
  "ask.subtitle": "Cytowane dowody",
  "ask.placeholder": "np. którzy oligarchowie są ścigani?",
  "ask.submit": "Zapytaj",
  "ask.examples": "Wypróbuj jedno z tych",
  "auth.signin": "Zaloguj się",
  "auth.email_placeholder": "ty@przyklad.pl",
  "auth.send_link": "Wyślij magiczny link",
  "auth.sent": "Sprawdź e-mail w poszukiwaniu linku do logowania.",
  "common.status": "status",
  "common.loading": "Ładowanie…",
  "common.empty": "Jeszcze nic tu nie ma.",
  "common.error": "Coś poszło nie tak.",
  "common.retry": "Spróbuj ponownie",
  "common.back": "Wstecz",
  "common.updated": "Zaktualizowano",
  "common.learn_more": "Dowiedz się więcej",
};

// French
const fr: Dict = {
  "nav.home": "accueil",
  "nav.theaters": "théâtres",
  "nav.ru_registry": "registre RU",
  "nav.me_registry": "registre MO",
  "nav.scoreboard": "tableau de validation",
  "nav.ask": "interroger",
  "nav.datadark": "zones d'ombre",
  "nav.trade": "contournement commercial",
  "nav.signals": "signaux",
  "nav.materials": "matériaux critiques",
  "nav.pricing": "tarifs",
  "nav.signin": "se connecter",
  "nav.language": "Langue",
  "nav.group.product": "Produit",
  "nav.group.coverage": "Couverture",
  "nav.group.validation": "Validation",
  "nav.group.solutions": "Solutions",
  "nav.group.pricing": "Tarifs",
  "nav.group.signals": "Signaux",
  "nav.group.ask": "Interroger",
  "nav.item.feeds": "Flux de renseignement quotidiens",
  "nav.item.ask": "Interroger les données",
  "nav.item.registry": "Registre de fiabilité des sources",
  "nav.item.me_registry": "Registre Moyen-Orient",
  "nav.item.signals": "Signaux d'analyste",
  "nav.item.all_theaters": "Tous les théâtres",
  "nav.item.sanctions": "Sanctions et contournement commercial",
  "nav.item.commodity": "Risque matières premières et chaîne d'approvisionnement",
  "nav.item.opacity": "Suppression des données économiques",
  "nav.item.political_risk": "Risque politique et signaux",
  "nav.account": "Compte",
  "nav.signout": "Se déconnecter",
  "nav.menu": "Menu",
  "nav.close": "Fermer",
  "nav.main": "Principale",
  "home.tagline": "Évaluations transparentes de la fiabilité des sources pour l'OSINT en zone de conflit",
  "home.sub": "Des flux de renseignement par pays issus de l'actualité ouverte, de Telegram et des sources sociales — notés pour leur fiabilité, fusionnés en un digest quotidien et validés chaque jour face à l'analyse humaine experte. Chaque affirmation renvoie à sa preuve.",
  "home.cta.subscribe": "Devenir abonné fondateur",
  "home.cta.scoreboard": "Voir le tableau de validation",
  "home.cta.digest": "Lire le digest du jour",
  "home.cta.coverage": "Explorer la couverture en direct",
  "home.live": "En direct : {n} théâtres — profondeur quotidienne en Russie, Ukraine et Iran",
  "home.live_label": "En direct",
  "home.theater.ru": "Russie",
  "home.theater.ua": "Ukraine",
  "home.theater.ir": "Iran",
  "home.features.reliability.title": "Une fiabilité déduite, non affirmée",
  "home.features.reliability.body": "{sources} sources notées à partir de {citations} citations sur plus de 4 ans de reportage expert — à quelle fréquence chaque source est confirmée, simplement affirmée ou jamais vérifiée.",
  "home.features.reliability.link": "explorer le registre →",
  "home.features.claims.title": "Des affirmations vérifiables",
  "home.features.claims.body": "{docs} documents bruts ingérés. Chaque affirmation du digest est liée à ses documents sources au niveau de la base de données — aucune analyse boîte noire.",
  "home.features.claims.link": "lire le digest du jour →",
  "home.features.scored.title": "Noté face aux experts, chaque jour",
  "home.features.scored.body": "{runs} cycles de validation face aux évaluations quotidiennes de l'ISW. Couverture, manques et avances — publiés, non dissimulés.",
  "home.features.scored.link": "voir comment nous notons →",
  "home.footer": "Renseignement de données OSINT · analyse issue de sources ouvertes ; les notes de sources sont des artefacts statistiques du comportement de citation, non des recommandations.",
  "countries.title": "Couverture",
  "countries.subtitle": "Flux de suivi des conflits par pays, notés et fusionnés chaque jour.",
  "countries.first_digest_pending": "premier digest en attente",
  "countries.view_digest": "voir le digest →",
  "countries.empty": "Pas encore de couverture.",
  "nav.group.access": "Demander l'accès",
  "home.beta.badge": "Bêta privée pour analystes",
  "home.beta.line": "Construit avec des analystes en activité. Nous invitons un petit groupe à tester si BNOW fait gagner du temps dans la veille quotidienne — et à nous dire où il échoue.",
  "home.cta.request_beta": "Demander l'accès à la bêta",
  "access.title": "Demander l'accès à la bêta analystes",
  "access.meta_desc": "BNOW.NET accueille un petit groupe d'analystes, de chercheurs, de journalistes et de professionnels du risque dans sa bêta privée pour analystes.",
  "access.breadcrumb": "demande d'accès",
  "access.intro": "Nous accueillons un petit groupe d'analystes, de chercheurs, de journalistes et de professionnels du risque. Dites-nous ce que vous surveillez et nous vous répondrons personnellement.",
  "access.no_purchase": "Aucun achat ni carte bancaire n'est requis pour demander l'accès.",
  "access.expectation": "L'accès bêta sert à l'évaluation et aux retours sur le flux de travail. BNOW reste un outil d'aide à l'analyse, et non une source unique pour des décisions opérationnelles.",
  "access.email_label": "E-mail professionnel",
  "access.linkedin_label": "Profil LinkedIn ou page entreprise",
  "access.linkedin_hint": "Une URL de profil ou de page entreprise sur linkedin.com. Nous stockons uniquement l'URL fournie, sans jamais la consulter ni l'enrichir.",
  "access.usecase_label": "Que surveillez-vous au quotidien ?",
  "access.usecase_hint": "Une ou deux phrases suffisent.",
  "access.optional": "facultatif",
  "access.submit": "Demander l'accès à la bêta",
  "access.pending": "Envoi…",
  "access.success.title": "Demande reçue",
  "access.success.body": "Merci — nous examinons chaque demande personnellement et vous répondrons par e-mail.",
  "access.err.email": "Veuillez saisir une adresse e-mail professionnelle valide.",
  "access.err.linkedin": "Cela ne ressemble pas à une URL linkedin.com. Vous pouvez laisser le champ vide.",
  "access.err.generic": "Une erreur s'est produite de notre côté. Réessayez ou écrivez-nous par e-mail.",
  "access.fallback": "Vous préférez l'e-mail ? Écrivez à",
  "pricing.title": "Tarifs abonné fondateur",
  "pricing.subtitle": "Accès complet pour analystes et desks.",
  "pricing.cta.subscribe": "S'abonner",
  "pricing.cta.request": "Demander l'accès",
  "pricing.email_placeholder": "e-mail professionnel",
  "pricing.note": "Abonné fondateur annuel : accès complet, tarif bloqué.",
  "registry.title": "Registre des sources",
  "registry.search_placeholder": "rechercher…",
  "registry.col.source": "source",
  "registry.col.platform": "plateforme",
  "registry.col.status": "statut",
  "registry.col.cited": "cité",
  "registry.col.hedging_mix": "profil de prudence",
  "registry.status.decayed": "obsolète",
  "scoreboard.title": "Tableau de validation",
  "scoreboard.empty": "Aucun cycle de validation pour l'instant.",
  "scoreboard.col.theater": "théâtre",
  "scoreboard.col.coverage": "couverture",
  "scoreboard.col.lead": "avance (h)",
  "scoreboard.avg_coverage": "couverture moyenne des événements vs ISW",
  "scoreboard.median_lead": "avance d'information médiane vs publication ISW",
  "scoreboard.thin_sourced": "peu sourcé",
  "digest.no_events": "Aucun événement extrait.",
  "digest.view_for": "vue pour :",
  "digest.sources": "sources",
  "digest.confidence": "confiance",
  "digest.track.military": "Situation militaire",
  "digest.track.elite": "Politique des élites & poursuites",
  "ask.title": "Interroger le renseignement",
  "ask.subtitle": "Preuves citées",
  "ask.placeholder": "ex. quels oligarques sont poursuivis ?",
  "ask.submit": "Interroger",
  "ask.examples": "Essayez l'une de ces questions",
  "auth.signin": "Se connecter",
  "auth.email_placeholder": "vous@exemple.fr",
  "auth.send_link": "Envoyer le lien magique",
  "auth.sent": "Consultez votre e-mail pour un lien de connexion.",
  "common.status": "statut",
  "common.loading": "Chargement…",
  "common.empty": "Rien pour l'instant.",
  "common.error": "Une erreur s'est produite.",
  "common.retry": "Réessayer",
  "common.back": "Retour",
  "common.updated": "Mis à jour",
  "common.learn_more": "En savoir plus",
};

// Locales with a full catalog. Others (es, he, ko) fall back to English per-key
// until translated.
const DICTS: Partial<Record<Locale, Dict>> = { en, uk, de, ar, ja, pl, fr };

/** Merged dictionary for a locale: fallback chain applied, English as the base. */
export function dict(locale: Locale): Dict {
  const chain = fallbackChain(locale).reverse(); // most-generic first, requested last
  const merged: Dict = {};
  for (const l of chain) Object.assign(merged, DICTS[l] ?? {});
  return merged;
}

/** A locale's OWN catalog with no fallback merge (undefined if untranslated). */
export function ownDict(locale: Locale): Dict | undefined {
  return DICTS[locale];
}

/**
 * Build a translator for a locale. `t(key)` returns the translated string (English
 * fallback, then the key itself). `t(key, vars)` interpolates {name} placeholders.
 */
export function makeT(locale: Locale) {
  const d = dict(locale);
  return (key: string, vars?: Record<string, string | number>): string => {
    const template = d[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    );
  };
}

export function isLocale(x: string | null | undefined): x is Locale {
  return !!x && (LOCALES as string[]).includes(x);
}

/** Validate a `?set=` selector value; returns the Locale or null (route guard). */
export function parseLocaleParam(raw: string | null | undefined): Locale | null {
  return isLocale(raw) ? raw : null;
}

/**
 * Resolve the active locale by priority: explicit (route/selector) → cookie →
 * Accept-Language → default. Pure and side-effect-free so it is unit-testable.
 */
export function resolveLocale(input: {
  explicit?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.explicit)) return input.explicit;
  if (isLocale(input.cookie)) return input.cookie;
  // Rank Accept-Language by q-weight (RFC 7231), not header order; ties keep order
  // (Array.prototype.sort is stable). Then pick the highest-ranked supported locale.
  const ranked = (input.acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        code: tag.split("-")[0].toLowerCase(),
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter((x) => x.code)
    .sort((a, b) => b.weight - a.weight);
  for (const { code } of ranked) {
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}
