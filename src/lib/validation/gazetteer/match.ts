// Gazetteer-parameterised signature matching (48h step 06).
//
// The algorithm half of what used to live in src/lib/validation/keywords.ts.
// `matchScore` and `MATCH_THRESHOLD` are moved VERBATIM and are gazetteer-free
// (they compare two already-extracted signatures). `extractSignatureWith`'s
// "substring" branch is character-for-character the pre-split extractSignature
// body, so ru-ua-v1 — which declares matchMode "substring" — cannot move by a
// byte no matter what any other gazetteer does.
//
// SIGNATURES ARE NOT SELF-DESCRIBING: `Signature` deliberately carries no
// gazetteer version (score.ts:162-165 and conflicts/keyword-matcher.ts:56
// build Signature object literals, so a required new field would be a compile
// break). Comparing signatures from two different gazetteers is a programmer
// error; ./index.test.ts pins that the two shipped gazetteers have disjoint
// canonical key sets, so a cross-gazetteer comparison can only ever score 0.

import type { Gazetteer, Signature } from "./types";

export const MATCH_THRESHOLD = 0.6; // toponym + action agreement required

/** Match score in [0,1]: toponym overlap dominates, action agreement refines. */
export function matchScore(a: Signature, b: Signature): number {
  const sharedTopo = [...a.toponyms].filter((x) => b.toponyms.has(x)).length;
  const sharedAct = [...a.actions].filter((x) => b.actions.has(x)).length;
  if (sharedTopo === 0 && sharedAct === 0) return 0;
  const topoScore = sharedTopo > 0 ? Math.min(1, sharedTopo / 2) : 0;
  const actScore = sharedAct > 0 ? 0.5 : 0;
  // toponym match alone: 0.5+; toponym+action: up to 1.0; action alone: 0.25
  if (sharedTopo > 0) return Math.min(1, 0.5 + topoScore * 0.25 + actScore * 0.5);
  return 0.25;
}

// ---------------------------------------------------------------------------
// Word-mode compilation (lazy, memoised; the substring path never compiles)
// ---------------------------------------------------------------------------

interface CompiledGazetteer {
  toponyms: [string, RegExp][];
  actions: [string, RegExp][];
}

const compiled = new WeakMap<Gazetteer, CompiledGazetteer>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One variant -> its anchored source. A TRAILING `*` means "prefix/stem
 *  match" and drops the right anchor; anchors are only added where the variant
 *  actually begins or ends with a word character, so a variant like `al-qaim`
 *  anchors on both sides while a hypothetical `-foo` would not gain a
 *  meaningless left anchor. */
function variantSource(variant: string): string {
  const stem = variant.endsWith("*");
  const literal = stem ? variant.slice(0, -1) : variant;
  const left = /^\w/.test(literal) ? "\\b" : "";
  const right = !stem && /\w$/.test(literal) ? "\\b" : "";
  return `${left}${escapeRegExp(literal)}${right}`;
}

function compileTable(table: Readonly<Record<string, readonly string[]>>): [string, RegExp][] {
  return Object.entries(table).map(([canon, variants]) => [
    canon,
    // one alternation per canonical: a single test per canonical, and the
    // alternation is inert to ordering because we only ask "did anything hit"
    new RegExp(variants.map(variantSource).join("|")),
  ]);
}

function compileFor(gaz: Gazetteer): CompiledGazetteer {
  const hit = compiled.get(gaz);
  if (hit !== undefined) return hit;
  const built: CompiledGazetteer = {
    toponyms: compileTable(gaz.toponyms),
    actions: compileTable(gaz.actions),
  };
  compiled.set(gaz, built);
  return built;
}

// ---------------------------------------------------------------------------
// Extraction / expansion
// ---------------------------------------------------------------------------

export function extractSignatureWith(gaz: Gazetteer, text: string): Signature {
  const t = ` ${text.toLowerCase()} `;
  const toponyms = new Set<string>();
  const actions = new Set<string>();
  if (gaz.matchMode === "substring") {
    // VERBATIM pre-split extractSignature body (keywords.ts:125-132)
    for (const [canon, variants] of Object.entries(gaz.toponyms))
      if (variants.some((v) => t.includes(v))) toponyms.add(canon);
    for (const [canon, variants] of Object.entries(gaz.actions))
      if (variants.some((v) => t.includes(v))) actions.add(canon);
    return { toponyms, actions };
  }
  const { toponyms: topoRes, actions: actRes } = compileFor(gaz);
  for (const [canon, re] of topoRes) if (re.test(t)) toponyms.add(canon);
  for (const [canon, re] of actRes) if (re.test(t)) actions.add(canon);
  return { toponyms, actions };
}

/** Expand wide-area toponyms to include their members (for the reference side). */
export function expandToponymsWith(gaz: Gazetteer, toponyms: Set<string>): Set<string> {
  const out = new Set(toponyms);
  for (const t of toponyms) for (const member of gaz.expansions[t] ?? []) out.add(member);
  return out;
}

/** Which theater should be expected to cover a takeaway with these toponyms,
 *  for a gazetteer with an arbitrary theater vocabulary. A 'both' tag, or two
 *  different specific tags, resolves to 'both'; no territorial signal resolves
 *  to 'both' as well (a political/casualties bullet belongs to nobody in
 *  particular). Unknown canonicals are ignored.
 *
 *  ru-ua-v1 keeps its OWN verbatim classifier (`classifyTakeawayTheater`) with
 *  the narrow "ru" | "ua" | "both" return type production depends on; this
 *  generic form is for the wider vocabularies (iran-levant-v1's nine tags). */
export function classifyTheaterWith(gaz: Gazetteer, toponyms: readonly string[]): string {
  const seen = new Set<string>();
  for (const t of toponyms) {
    const tag = gaz.theaterOf[t];
    if (tag === undefined) continue;
    if (tag === "both") return "both";
    seen.add(tag);
  }
  if (seen.size === 1) return [...seen][0];
  return "both";
}
