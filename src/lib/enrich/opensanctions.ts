import { readFileSync } from "node:fs";
import { join } from "node:path";

// OpenSanctions enrichment: resolve BNOW entities to sanctions/PEP status.
// Live against api.opensanctions.org when OPENSANCTIONS_API_KEY is set; otherwise a
// deterministic fixture stub (so tests + dev work, entity badges still render for
// seeded names). Licensing note in docs/BLOCKERS.md — commercial API needs a paid key.

export interface OsResult {
  matched: boolean;
  sanctioned: boolean;
  topics: string[]; // e.g. ["sanction", "role.pep"]
  datasets: string[];
  osId: string | null;
  score: number; // 0-1 match confidence
  caption: string | null;
  checkedAt: string; // ISO; stamped by caller for resume-safety
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
    const best = results.find((r) => r.match) ?? results[0];
    if (!best) {
      return { matched: false, sanctioned: false, topics: [], datasets: [], osId: null, score: 0, caption: null, checkedAt: "" };
    }
    const topics = best.properties?.topics ?? [];
    return {
      matched: !!best.match,
      sanctioned: topics.includes("sanction"),
      topics,
      datasets: best.datasets ?? [],
      osId: best.id ?? null,
      score: best.score ?? 0,
      caption: best.caption ?? null,
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
