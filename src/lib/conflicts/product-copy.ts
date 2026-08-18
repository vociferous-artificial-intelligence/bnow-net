// Phase 6 surface language — the ONE module holding every analyst-facing
// explainer/caveat string the conflict surfaces render (contract §11 required
// explainers; prompt §14 UX rules). Centralized so the legal/product reviewers
// can audit the full vocabulary in one place.
//
// Language rules (binding): the public concept is expert-benchmark COVERAGE —
// never "accuracy", "truth", or endorsement; the headline label is the frozen
// "Key Takeaway benchmark coverage" (contract §3); no ISW prose, no source
// full text, no provider/model names, no internal prompts anywhere in this
// vocabulary. Content strings stay English-first per the i18n house rule
// (identifiers/series names are proper nouns and are never translated);
// catalog integration for UI chrome is an enablement-time follow-up recorded
// in the P6 report.

import type { ReferenceSeriesId } from "./vocabulary";

/** Reference-series display names (proper nouns; presentation only). */
export const REFERENCE_SERIES_LABELS: Readonly<Record<ReferenceSeriesId, string>> = {
  roca: "ISW Russian Offensive Campaign Assessment (ROCA)",
  iran_update: "ISW/CTP Iran Update",
};

/** Contract §0 non-independence caveat — rendered WITHIN the benchmark module,
 *  beside/above the headline score, prominently enough to affect
 *  interpretation (never a footer/footnote). Same sentence as the offline
 *  report so the caveat cannot fork between surfaces. */
export const NON_INDEPENDENCE_CAVEAT =
  "Coverage is agreement with the named expert benchmark; ISW/CTP reads many of the same open sources as BNOW — agreement is not independent confirmation.";

/** Contract §11(b): source country does not define conflict relevance. */
export const SOURCE_COUNTRY_NOTE =
  "Evidence is selected by conflict relevance — actors, event geography, and lanes — not by where a source is based. A source's home country is neither necessary nor sufficient for its reporting to count toward this conflict.";

/** Contract §11(c): the three concepts, explained where first used. */
export const TERMINOLOGY_EXPLAINER = {
  conflict:
    "Conflict/region — the analytical object joining countries, actors, tracks, and transnational developments (e.g. the Russia–Ukraine War). It sits above country pages and replaces none of them.",
  country:
    "Country/theater — the coverage lens where BNOW routes, ingests, and publishes evidence (e.g. ru, ua, ir). Country pages remain the drill-down surface for evidence.",
  benchmark:
    "Benchmark scope — the versioned editorial scope of ONE external reference series (e.g. the ISW Russian Offensive Campaign Assessment). Coverage here means agreement with that series' declared Key Takeaways, nothing broader.",
} as const;

/** Contract §11(d): how the conflict-level score relates to the per-country
 *  scoreboard rows for the same reference report. */
export const SCOREBOARD_COEXISTENCE_NOTE =
  "The validation scoreboard scores the same reference reports per country (one ROCA report produces separate RU and UA rows there). This conflict view scores each report ONCE at conflict level. They are different aggregations of one report — neither contradicts the other.";

/** Contract §7 non-additivity disclosure, rendered beside every contribution
 *  table. */
export const NON_ADDITIVE_NOTE =
  "Contribution is multi-label and NON-ADDITIVE: one matched takeaway may appear in several buckets, so bucket totals can exceed the headline numerator and do not sum to it.";

/** Contract §3 partial semantics, rendered beside any partial count. */
export const PARTIAL_EXPLAINER =
  "A partial is a compound takeaway (several propositions in one bullet) where evidence covers some but not all propositions. Partials count as MISSES in the headline coverage; they are shown separately so compound under-credit stays visible.";

/** Gate-4 binding obligation (a): the headline partial diagnostic is the
 *  UNION of distinct partial takeaways across both populations. */
export const PARTIAL_UNION_NOTE =
  "The headline partial count is the union of distinct partial takeaways across both populations; the per-population counts are shown in the pipeline comparison below.";

/** Register #8 M1: keyword-rung full-denominator divergence, disclosed. */
export const KEYWORD_DENOMINATOR_NOTE =
  "On the keyword rung the full declared-takeaway denominator still applies: takeaways with no keyword signal stay in the denominator as automatic misses and are counted below.";

/** Degraded-rung banners (binding P6 obligation: keyword-rung results render
 *  as DEGRADED; a fixture-oracle result is a synthetic demonstration). */
export const MATCHER_RUNG_COPY = {
  "llm-majority": { label: "LLM majority vote", degraded: false },
  llm: {
    label: "DEGRADED — single usable LLM round (no majority)",
    degraded: true,
  },
  keyword: {
    label: "DEGRADED — keyword fallback (no usable LLM rounds)",
    degraded: true,
  },
  "fixture-oracle": {
    label: "Deterministic fixture oracle (synthetic review corpus)",
    degraded: false,
  },
} as const;

/** Unavailable semantics (contract §6.2): a provenance statement, never zero. */
export const UNAVAILABLE_NOT_ZERO_NOTE =
  "Unavailable means no evaluation exists for this input — it is a statement about provenance, not a score, and is never a 0%.";

export const PUBLICATION_GAP_NOTE =
  "The reference series published no report for this date. A gap is represented, never fabricated: there is no denominator and no score.";

export const NO_PROVEN_SNAPSHOT_NOTE =
  "No immutable snapshot artifact proves what BNOW held at this instant, so this evaluation kind is unavailable until a reviewed capture path exists.";

/** Lane diagnostic (register #8 H1): rendered INSTEAD of a bare count that
 *  would imply comparable-but-missed. */
export const LANE_INCOMPARABLE_LABEL = "unavailable (incomparable evidence)";

export const LANE_INCOMPARABLE_NOTE =
  "A lane marked unavailable (incomparable evidence) has no comparable mapped evidence class — its takeaways remain honest misses in the headline denominator, but the lane's corpus comparison is not a 0% and must not be read as one.";

/** Gate-4 binding obligation (b): timing medians are pair-weighted. */
export const TIMING_PAIR_WEIGHTED_NOTE =
  "Lead medians are pair-weighted over takeaway–claim agreements: a claim matched to two takeaways weighs twice. Ingest-time lead and source-declared publish lead are separate figures, never substituted for each other.";

/** Thin-sourced diagnostic definition (explicit denominator always shown). */
export const THIN_SOURCED_NOTE =
  "Thin-sourced counts claims offered to the matcher with fewer than two independent source documents and a claimed/unverified hedge, out of the population's offered claims.";

/** The two pipeline questions (contract §6.1), never conflated. */
export const PIPELINE_QUESTIONS_NOTE =
  "Corpus recall asks whether the mapped evidence corpus contained the development; published retention asks whether a published digest actually retained a matching claim. Evidence existing in the corpus never implies it was published.";

/** Published-retention population definition (register #4). */
export const PUBLISHED_POPULATION_NOTE =
  "Published output means claims that genuinely appeared in the designated existing country/track digests — never a new conflict synthesis. Legacy-engine digests contribute only to published retention and are labeled legacy.";

/** Truth-in-UI banner for the fixture-backed review build (ruling 3): the
 *  fixture files' own disclaimer marker renders beside this heading on every
 *  conflict surface, so nothing on these pages can read as fact. */
export const SYNTHETIC_CORPUS_HEADING = "Synthetic review corpus";

/** Evidence-view framing (register #4 / prompt §14): a read-only union of
 *  already-published claims, not a new product output. */
export const EVIDENCE_VIEW_NOTE =
  "This is a read-only union of claims that already appeared in the designated published digests, shown with their originating theater/track and source trail. Hedges, confidence, and timestamps are the claims' own — matching never strengthens them. It is not a new conflict digest.";
