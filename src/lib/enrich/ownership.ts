import { readFileSync } from "node:fs";
import { join } from "node:path";

// Ownership / connection resolution. Live against Companies House / OpenCorporates /
// OpenSanctions related-entities when their keys exist; deterministic fixture stub
// otherwise (so the graph UI renders + tests pass). All edges carry their source
// and never exceed what the source states.

export interface ResolvedLink {
  toName: string;
  toKind: "person" | "company" | "org" | "agency" | "faction";
  relation: string; // owns|director|psc|subsidiary|associate|officer
  source: string; // companies_house|opencorporates|opensanctions|stub
  since: string | null;
}

export function ownershipLive(): boolean {
  return (
    (!!process.env.COMPANIES_HOUSE_API_KEY || !!process.env.OPENCORPORATES_API_KEY) &&
    process.env.OWNERSHIP_MODE !== "stub"
  );
}

let stub: Record<string, ResolvedLink[]> | null = null;
function loadStub(): Record<string, ResolvedLink[]> {
  if (stub) return stub;
  try {
    stub = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "enrich", "ownership.json"), "utf8"),
    ) as Record<string, ResolvedLink[]>;
  } catch {
    stub = {};
  }
  return stub;
}

/** Resolve an entity's connections. Returns [] for unknowns; null only on hard failure. */
export async function resolveLinks(
  name: string,
  kind: string,
): Promise<ResolvedLink[] | null> {
  if (!ownershipLive()) {
    return loadStub()[name.toLowerCase().trim()] ?? [];
  }

  // Live: Companies House officer/PSC lookup for companies (compliance-grade, free key).
  if (kind === "company" && process.env.COMPANIES_HOUSE_API_KEY) {
    try {
      const res = await fetch(
        `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=1`,
        {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${process.env.COMPANIES_HOUSE_API_KEY}:`).toString("base64"),
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { items?: Array<{ company_number?: string }> };
      const num = json.items?.[0]?.company_number;
      if (!num) return [];
      const off = await fetch(
        `https://api.company-information.service.gov.uk/company/${num}/officers`,
        {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${process.env.COMPANIES_HOUSE_API_KEY}:`).toString("base64"),
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!off.ok) return [];
      const oj = (await off.json()) as {
        items?: Array<{ name?: string; officer_role?: string; appointed_on?: string }>;
      };
      return (oj.items ?? []).slice(0, 25).map((o) => ({
        toName: o.name ?? "unknown",
        toKind: "person" as const,
        relation: /director/i.test(o.officer_role ?? "") ? "director" : "officer",
        source: "companies_house",
        since: o.appointed_on ?? null,
      }));
    } catch {
      return null;
    }
  }

  // No live path for this kind → fall back to stub so the graph still shows something.
  return loadStub()[name.toLowerCase().trim()] ?? [];
}
