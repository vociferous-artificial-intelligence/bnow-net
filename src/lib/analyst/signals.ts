// Deterministic analytical signals over already-stored data. Pure logic here;
// DB I/O in run.ts. Every signal carries the evidence (claim ids / rows) that
// triggered it — the moat is that nothing is asserted without traceable support.

import type { ClaimSourceDoc } from "@/components/claim-sources";
import { canonicalKey } from "../entities/canonicalize";

export type Severity = "info" | "watch" | "elevated";

export interface Signal {
  key: string; // stable slug for this signal instance
  kind: string; // purge | procurement_surge | data_dark | trade_divergence | pressure_spike
  theater: string; // ru | ir | ...
  severity: Severity;
  headline: string;
  detail: string;
  evidenceClaimIds: number[]; // claims backing this (may be empty for non-claim signals)
  evidenceRefs: string[]; // other refs (entity ids, series keys, trade rows)
  at: string; // ISO (caller-stamped)
}

// --- public projection: the teaser an unauthenticated visitor (and any crawler) may see ---
//
// A signal's `detail` string carries the specifics subscribers pay for — named individuals
// (purge), suppressed-series labels (data_dark), reporter/flow lists (trade_divergence) —
// and `evidenceClaimIds`/`evidenceRefs` back the drill-down. NONE of these may reach an
// unauthenticated client. `toPublicSignal` drops them, keeping only the count-and-type
// teaser (`headline`) plus an aggregate evidence count. The /signals page's signed-out
// render path consumes ONLY this projection, so the sensitive strings never enter the
// server-rendered HTML for anonymous visitors. This is the data-layer withholding required
// by docs/reviews/IA-REFINEMENT-REVIEW.md TASK 3 — not a CSS/DOM hide.
//
// INVARIANT: `headline` must stay a count + type + theater + severity summary — never a
// name, dollar figure, or target/flow list. Every detector below obeys this; a future
// detector that embeds specifics in the headline would leak them through this projection.
export interface PublicSignal {
  key: string;
  kind: string;
  theater: string;
  severity: Severity;
  headline: string;
  evidenceCount: number;
}

export function toPublicSignal(s: Signal): PublicSignal {
  return {
    key: s.key,
    kind: s.kind,
    theater: s.theater,
    severity: s.severity,
    headline: s.headline,
    evidenceCount: s.evidenceClaimIds.length,
  };
}

// --- purge pattern: clustered prosecutions of officials/siloviki in a short window ---
//
// Semantic integrity rework (2026-07-13, private-beta sprint Workstream C). The
// old detector counted every entity with role defendant/target/dismissed — but
// `role` is free text and 'target' is emitted by the nuclear/military tracks for
// STRIKE targets, so the live ir signal was built of air bases, NATO, whole
// countries and the Supreme Court of Israel, and the ru signal absorbed drone
// strikes and the Graham state-media death story. The rework: candidates must be
// PEOPLE (filtered at the query boundary in run.ts AND rechecked here in pure
// logic), qualification is the audited `isPressureClaim` predicate, unique
// people are counted by canonical entity identity, and the evidence list carries
// ONLY qualifying claims.
export interface PressureClaim {
  claimId: number;
  /** entities.id — stable row identity (aliases still have distinct ids; canonicalKey folds those) */
  entityId: number;
  entityName: string;
  entityKind: string;
  role: string;
  claimDate: string | null; // yyyy-mm-dd
  /** claim text — English by pipeline construction; the semantic qualifier input */
  text: string;
  hedging: string;
}

/** Roles the extraction uses reliably for the SUBJECT of elite pressure. */
const PRESSURE_ROLES: ReadonlySet<string> = new Set([
  "defendant",
  "dismissed",
  "accused",
  "suspect",
]);

/** Roles that may qualify when the claim text itself carries pressure semantics.
 *  'target' alone is NOT evidence of prosecution/dismissal — the same role tags
 *  military strike targets. Every other role (prosecutor, patron, appointee,
 *  free-text position titles, …) marks an acting or incidental party and never
 *  qualifies, however the text reads. */
const TEXT_QUALIFIABLE_ROLES: ReadonlySet<string> = new Set(["target", "subject", "other"]);

/** Procedural elite-pressure semantics: actual detention, investigation,
 *  prosecution, dismissal, removal, or sanction. Deliberately verbs/procedures,
 *  NOT topic nouns — "corruption" alone does not qualify (the Graham death story
 *  mentions corruption schemes but reports no proceeding), and battlefield
 *  vocabulary is absent (a strike "targeting" someone is not elite pressure). */
export const PRESSURE_ACTION_RE =
  /\b(arrest\w*|detain\w*|detention|charg(?:ed|es)|indict\w*|prosecut\w*|convict\w*|sentenc\w*|criminal case|treason case|investigat\w*|under investigation|dismiss\w*|removed from (?:office|post|command)|relieved of (?:duty|command|post)|ousted|suspended from|sanction\w*|asset (?:seizure|freeze)|confiscat\w*)\b/i;

/** Pure, audited qualifier: does this claim-entity edge evidence elite pressure
 *  on a named person? Conservative by design — ambiguous items must not create
 *  a signal. */
export function isPressureClaim(c: PressureClaim): boolean {
  if (c.entityKind !== "person") return false;
  if (PRESSURE_ROLES.has(c.role)) return true;
  if (!TEXT_QUALIFIABLE_ROLES.has(c.role)) return false;
  return PRESSURE_ACTION_RE.test(c.text);
}

export function detectPurge(
  claims: PressureClaim[],
  opts: { windowDays: number; minCount: number; theater: string; nowIso: string },
): Signal | null {
  const cutoff = Date.parse(opts.nowIso) - opts.windowDays * 86400e3;
  const qualifying = claims.filter((c) => {
    const t = c.claimDate ? Date.parse(c.claimDate) : NaN;
    return isFinite(t) && t >= cutoff && isPressureClaim(c);
  });
  // Canonical person identity (the entity layer's own fold: case, honorifics,
  // Cyrillic/transliteration variants, curated alias groups) — duplicate
  // spellings of one person cannot inflate the count.
  const uniquePersons = new Set(qualifying.map((c) => canonicalKey(c.entityName)));
  uniquePersons.delete("");
  if (uniquePersons.size < opts.minCount) return null;
  // one claim can name >1 watched entity (claim_entities is an edge table) — dedupe
  // to distinct claim ids or the public evidence count overstates support (B1).
  const evidenceClaimIds = [...new Set(qualifying.map((c) => c.claimId))];
  return {
    key: `purge:${opts.theater}:${opts.windowDays}d`,
    kind: "purge",
    theater: opts.theater,
    severity: uniquePersons.size >= opts.minCount * 2 ? "elevated" : "watch",
    headline: `${uniquePersons.size} officials under prosecution/dismissal in ${opts.windowDays}d`,
    // Role/count language only — no names and no "purge" conclusion in prose: the
    // detector has a count, not evidence of a coordinated campaign, and named-person
    // framing awaits counsel review (OPEN-TASKS #58). Exact claim texts remain in the
    // accepted-user evidence disclosure below, each with its hedge and sources.
    detail:
      `Cluster of recent reported prosecutions/dismissals: ${uniquePersons.size} named officials ` +
      `across ${evidenceClaimIds.length} claims in ${opts.windowDays}d. Analyst review required — ` +
      `this is an automated pattern, not a confirmed campaign; see the evidence below for exact ` +
      `claims with hedging and sources.`,
    evidenceClaimIds,
    evidenceRefs: [],
    at: opts.nowIso,
  };
}

// --- data-dark events: newly classified / gone statistical series ---
export interface DarkSeries {
  key: string;
  label: string;
  status: string; // classified | gone | stale | ...
  changedRecently: boolean;
}

export function detectDataDark(series: DarkSeries[], theater: string, nowIso: string): Signal | null {
  const dark = series.filter((s) => s.status === "classified" || s.status === "gone");
  if (dark.length === 0) return null;
  const recent = dark.filter((s) => s.changedRecently);
  return {
    key: `data_dark:${theater}`,
    kind: "data_dark",
    theater,
    severity: recent.length > 0 ? "elevated" : "info",
    headline: `${dark.length} statistical series classified or gone`,
    detail:
      `Suppressed: ${dark.slice(0, 5).map((s) => s.label).join("; ")}` +
      (recent.length ? ` — ${recent.length} changed recently (leading indicator).` : "."),
    evidenceClaimIds: [],
    evidenceRefs: dark.map((s) => s.key),
    at: nowIso,
  };
}

// --- trade divergence: flagged dual-use rerouting through transit hubs ---
export interface DivergenceSignalRow {
  reporterName: string;
  hsLabel: string;
  reason: string;
}

export function detectTradeDivergence(
  flagged: DivergenceSignalRow[],
  nowIso: string,
): Signal | null {
  const dualUse = flagged.filter((r) => r.hsLabel !== "All goods");
  if (dualUse.length === 0) return null;
  return {
    key: "trade_divergence:ru",
    kind: "trade_divergence",
    theater: "ru",
    severity: dualUse.length >= 5 ? "elevated" : "watch",
    headline: `${dualUse.length} dual-use flows rerouting to Russia flagged`,
    detail: dualUse
      .slice(0, 5)
      .map((r) => `${r.reporterName}/${r.hsLabel}: ${r.reason}`)
      .join(" · "),
    evidenceClaimIds: [],
    evidenceRefs: dualUse.map((r) => `${r.reporterName}:${r.hsLabel}`),
    at: nowIso,
  };
}

export function rankSignals(signals: Signal[]): Signal[] {
  const order: Record<Severity, number> = { elevated: 0, watch: 1, info: 2 };
  return [...signals].sort((a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind));
}

// --- evidence expansion (page-level: signed-in users only render this) ---
// Shape mirrors the digest page's claims -> claim_sources -> raw_documents LEFT JOIN
// sources query (src/app/digests/[country]/[date]/page.tsx) so the same row can feed
// the shared ClaimSources component.

export interface SignalEvidenceRow {
  claim_id: number;
  text: string;
  hedging: string;
  claim_date: string | null;
  doc_id: number;
  doc_url: string | null;
  doc_title: string | null;
  adapter: string;
  source_id: number | null;
  source_key: string | null;
  reliability: number | string | null; // numeric columns arrive as strings over the wire
  source_platform: string | null;
  doc_at: string | null;
}

export interface EvidenceClaim {
  claimId: number;
  text: string;
  hedging: string;
  claimDate: string | null;
  docs: ClaimSourceDoc[];
}

/**
 * Union of every signal's evidenceClaimIds, deduped — the single query's `= ANY($1)`
 * set. Signals never share a claim id today (one purge signal per theater), but the
 * union stays correct if that changes.
 */
export function collectSignalEvidenceIds(signals: Signal[]): number[] {
  return [...new Set(signals.flatMap((s) => s.evidenceClaimIds))];
}

/** Group one-row-per-(claim,doc) query results into per-claim evidence, docs in row order. */
export function groupEvidenceRows(rows: SignalEvidenceRow[]): Map<number, EvidenceClaim> {
  const byClaim = new Map<number, EvidenceClaim>();
  for (const r of rows) {
    if (!byClaim.has(r.claim_id)) {
      byClaim.set(r.claim_id, {
        claimId: r.claim_id,
        text: r.text,
        hedging: r.hedging,
        claimDate: r.claim_date,
        docs: [],
      });
    }
    byClaim.get(r.claim_id)!.docs.push({
      docId: r.doc_id,
      url: r.doc_url,
      sourceId: r.source_id,
      sourceKey: r.source_key,
      adapter: r.adapter,
      platform: r.source_platform,
      reliability: r.reliability === null ? null : Number(r.reliability),
      publishedAt: r.doc_at,
      title: r.doc_title,
    });
  }
  return byClaim;
}

/** Claims for one signal, in its own evidenceClaimIds order; ids missing from the map (e.g. a claim deleted between query and render) are skipped rather than rendered blank. */
export function evidenceForSignal(signal: Signal, byClaim: Map<number, EvidenceClaim>): EvidenceClaim[] {
  return signal.evidenceClaimIds
    .map((id) => byClaim.get(id))
    .filter((c): c is EvidenceClaim => c !== undefined);
}
