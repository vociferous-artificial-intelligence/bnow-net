import { readFileSync } from "node:fs";
import { join } from "node:path";

// OpenSanctions enrichment: candidate-identity screening for BNOW entities.
// Live against api.opensanctions.org when OPENSANCTIONS_API_KEY is set; otherwise a
// deterministic fixture stub (so tests + dev work; stub answers are sanitized before
// persist and never render). Licensing note in docs/BLOCKERS.md — commercial API
// needs a paid key.
//
// SEMANTICS (2026-07-21 match-safety ruling): the query carries name + entity type
// ONLY, so a match is a candidate identity, never proof that BNOW's entity is the
// listed person/org. `score` is the algorithm's identity-match confidence — not risk
// or severity. Assertive fields (topics/datasets/osId/caption/sanctioned) are
// populated ONLY from a result the algorithm ACCEPTED (`match === true`); rejected
// candidates fail closed to a clean unmatched record, optionally keeping
// non-assertive diagnostics in `rejected`.

export interface OsResult {
  /** true ONLY when the OpenSanctions algorithm accepted a result (match === true).
   *  Every consumer must require this before treating any other field as an
   *  accepted-match assertion. */
  matched: boolean;
  /** true ONLY for an accepted result whose topics contain the exact "sanction"
   *  topic. Never derived from a rejected candidate. */
  sanctioned: boolean;
  topics: string[]; // accepted result's topics, e.g. ["sanction", "role.pep"]; [] otherwise
  datasets: string[];
  osId: string | null;
  score: number; // 0-1 ALGORITHMIC IDENTITY-MATCH confidence (never risk/severity)
  caption: string | null;
  checkedAt: string; // ISO; stamped by caller for resume-safety
  /** true = fixture stub answered (no API key). Stub matches are demo/test data:
   *  they must never be persisted as fact or rendered as a badge. */
  stub?: boolean;
  /** Non-assertive diagnostics for the top REJECTED candidate, kept only when the
   *  algorithm accepted nothing. These fields are NOT facts about the BNOW entity —
   *  the algorithm itself rejected the identity — and no consumer may surface them
   *  as topics/sanctions/PEP assertions. Admin candidate-review display only. */
  rejected?: {
    caption: string | null;
    score: number;
    topics: string[];
    osId: string | null;
  };
}

/** What the enrich run is allowed to persist for a stub answer: the check is
 *  recorded (so the run is resumable and a later ?refresh=1 upgrades it) but NO
 *  fabricated sanctions/PEP assertion survives. A fabricated "SANCTIONED" badge
 *  on a real person is a product-integrity failure. */
export function sanitizeForPersist(r: OsResult): OsResult {
  if (!r.stub) return r;
  return {
    matched: false, sanctioned: false, topics: [], datasets: [],
    osId: null, score: 0, caption: null, checkedAt: r.checkedAt, stub: true,
  };
}

const KIND_TO_SCHEMA: Record<string, string> = {
  person: "Person",
  company: "Company",
  org: "Organization",
  agency: "PublicBody",
  faction: "Organization",
};

export function isLive(): boolean {
  return !!process.env.OPENSANCTIONS_API_KEY && process.env.OPENSANCTIONS_MODE !== "stub";
}

let stubData: Record<string, Partial<OsResult>> | null = null;
function loadStub(): Record<string, Partial<OsResult>> {
  if (stubData) return stubData;
  try {
    stubData = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "enrich", "opensanctions.json"), "utf8"),
    ) as Record<string, Partial<OsResult>>;
  } catch {
    stubData = {};
  }
  return stubData;
}

function stubResult(name: string): OsResult {
  const hit = loadStub()[name.toLowerCase().trim()];
  return {
    matched: !!hit,
    sanctioned: hit?.sanctioned ?? false,
    topics: hit?.topics ?? [],
    datasets: hit?.datasets ?? [],
    osId: hit?.osId ?? null,
    score: hit?.score ?? (hit ? 0.9 : 0),
    caption: hit?.caption ?? null,
    checkedAt: "", // caller stamps
    stub: true,
  };
}

/** Match one entity. Returns null only on hard API failure (caller may retry). */
export async function matchEntity(name: string, kind: string): Promise<OsResult | null> {
  if (!isLive()) return stubResult(name);

  const schema = KIND_TO_SCHEMA[kind] ?? "Person";
  try {
    const res = await fetch("https://api.opensanctions.org/match/default?algorithm=best", {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${process.env.OPENSANCTIONS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: { q1: { schema, properties: { name: [name] } } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      responses?: { q1?: { results?: OsMatchResult[] } };
    };
    const results = json.responses?.q1?.results ?? [];
    // FAIL CLOSED: only a result the algorithm ACCEPTED (match === true) may
    // populate assertive fields. The old `?? results[0]` fallback promoted the
    // top REJECTED candidate's topics into a persisted "sanctioned" assertion.
    const accepted = results.find((r) => r.match === true);
    if (!accepted) {
      const top = results[0];
      return {
        matched: false, sanctioned: false, topics: [], datasets: [], osId: null,
        score: 0, caption: null, checkedAt: "",
        // rejected-candidate diagnostics are non-assertive by contract (see OsResult)
        ...(top
          ? {
              rejected: {
                caption: top.caption ?? null,
                score: top.score ?? 0,
                topics: top.properties?.topics ?? [],
                osId: top.id ?? null,
              },
            }
          : {}),
      };
    }
    const topics = accepted.properties?.topics ?? [];
    return {
      matched: true,
      sanctioned: topics.includes("sanction"),
      topics,
      datasets: accepted.datasets ?? [],
      osId: accepted.id ?? null,
      score: accepted.score ?? 0,
      caption: accepted.caption ?? null,
      checkedAt: "",
    };
  } catch {
    return null;
  }
}

interface OsMatchResult {
  id?: string;
  caption?: string;
  score?: number;
  match?: boolean;
  datasets?: string[];
  properties?: { topics?: string[] };
}
