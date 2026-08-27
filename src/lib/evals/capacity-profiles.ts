// Capacity profiles — the knob dimension of the capacity-quality matrix
// (roadmap Phase 6). A profile is a NAMED, reviewed set of env-knob values the
// eval CLI applies process-locally before identity computation, so
// currentEnvKnobs(), prompt building, and the live dispatch all read it
// through the existing knob functions. Nothing here touches production: the
// knobs are read from process.env at call time by src code whose production
// values come from Vercel env (where none of these are set).
//
// The historical constants (map depth 1,500 · legacy 400 · reduce top-200 ·
// 12 events · 6 claims/event) are COST-ERA ASSUMPTIONS being measured, not
// established optima — but K=5 voting (ruling 18), traceability, source
// diversity, publication safety, versioned extraction and fail-closed spend
// remain binding: a profile BY CONSTRUCTION cannot express REDUCE_VOTES (no
// field exists), and live digest evals still refuse K≠5 at the preflight.
//
// Identity semantics: mapContentChars is part of mapExtractorVersion's basis
// (`content=`), so map cells under a non-baseline depth run under their own
// extractor version — correct for an eval (results are keyed per config) and
// EXACTLY why production adoption of a new depth requires the #33 remap path
// first. Every knob here is already recorded in results headers (EvalEnvKnobs)
// and resume-guarded (resumeIdentityMismatch); the profile name additionally
// enters the configKey, so every matrix cell owns its own results file.

export interface CapacityProfile {
  /** Env overrides applied for the run. Absent field = production default. */
  mapContentChars?: number;
  reduceGroupsFed?: number;
  mapOutTokensPerDoc?: number;
  reduceMaxOutputTokens?: number;
  description: string;
}

export const BASELINE_PROFILE = "baseline";

export const CAPACITY_PROFILES: Record<string, CapacityProfile> = {
  [BASELINE_PROFILE]: {
    description: "Production constants — map depth 1500, reduce top-200 (no env overrides).",
  },
  "map-depth-4000": {
    mapContentChars: 4000,
    // deeper docs can carry more claims worth of output
    mapOutTokensPerDoc: 400,
    description: "Map reads the first 4,000 units per doc (vs 1500).",
  },
  "map-depth-full": {
    mapContentChars: 20000,
    mapOutTokensPerDoc: 500,
    description:
      "Selected-full-document: 20,000-unit ceiling covers >p99 of observed corpus doc lengths.",
  },
  "reduce-fed-400": {
    reduceGroupsFed: 400,
    reduceMaxOutputTokens: 9000,
    description: "Reduce feeds the top 400 ranked groups (vs 200; 400 = the production clamp max).",
  },
};

/** Matrix cells that CANNOT be expressed as env profiles today, kept visible
 *  so the matrix report never silently narrows its own design space. */
export const UNIMPLEMENTED_MATRIX_CELLS: Array<{ cell: string; requires: string }> = [
  {
    cell: "reduce-fed-800",
    requires:
      "widening the production clamp in synthesize.ts reduceGroupsFed() (50..400 today) — a reviewed code change, not an env knob",
  },
  {
    cell: "reduce-hierarchical-all",
    requires: "an unimplemented hierarchical reduce stage (design work, own A/B gate per ruling 18)",
  },
  {
    cell: "map-claims-adaptive",
    requires:
      "a map PROMPT revision (the 0-3 claims/doc cap is prompt text, part of mapExtractorVersion's basis) — a versioned prompt change with its own eval",
  },
];

const KNOB_ENV: Record<keyof Omit<CapacityProfile, "description">, string> = {
  mapContentChars: "MAP_CONTENT_CHARS",
  reduceGroupsFed: "REDUCE_GROUPS_FED",
  mapOutTokensPerDoc: "MAP_OUT_TOKENS_PER_DOC",
  reduceMaxOutputTokens: "REDUCE_MAX_OUTPUT_TOKENS",
};

export function capacityProfileNames(): string[] {
  return Object.keys(CAPACITY_PROFILES);
}

/** Applies a profile's knobs to process.env (the eval CLI's own process only).
 *  Returns a restore function for matrix loops. Throws on an unknown name.
 *  The baseline profile deliberately deletes the four knob envs so a stray
 *  shell export cannot masquerade as the baseline. */
export function applyCapacityProfile(name: string): () => void {
  const profile = CAPACITY_PROFILES[name];
  if (!profile) {
    throw new Error(
      `unknown capacity profile "${name}" — known: ${capacityProfileNames().join(", ")}`,
    );
  }
  const saved = new Map<string, string | undefined>();
  for (const [field, env] of Object.entries(KNOB_ENV)) {
    saved.set(env, process.env[env]);
    const v = profile[field as keyof typeof KNOB_ENV];
    if (v === undefined) delete process.env[env];
    else process.env[env] = String(v);
  }
  return () => {
    for (const [env, v] of saved) {
      if (v === undefined) delete process.env[env];
      else process.env[env] = v;
    }
  };
}

/** ConfigKey suffix rule: the baseline keeps every historical key BYTE-EXACT
 *  (committed results stay valid); any other profile suffixes `+<name>` so
 *  each matrix cell owns its own results file and resume identity. */
export function withCapacityProfileKey(configKey: string, profileName: string): string {
  return profileName === BASELINE_PROFILE ? configKey : `${configKey}+${profileName}`;
}
