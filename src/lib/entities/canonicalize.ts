// Entity-graph canonicalization rules. The extraction LLM creates junk entities
// (collectives like "Five individuals", geography like "Kramatorsk", objects like
// "Su-27") and alias duplicates ("Ayatollah Seyyed Ali Khamenei" / "Khamenei").
// The graph feeds OpenSanctions matching, ownership, /entities, /signals and /ask —
// junk degrades all five. This module is the deterministic layer: every decision
// is rule-derived and auditable. Ambiguous cases go to the LLM proposal route
// (/api/cron/entity-audit) which writes a reviewable plan, never applies directly.

export interface EntityRow {
  id: number;
  kind: string;
  name: string;
  claims: number;
}

export interface DropDecision {
  id: number;
  name: string;
  reason: string;
}

export interface MergeDecision {
  fromId: number;
  fromName: string;
  intoId: number;
  intoName: string;
  reason: string;
}

// ---- drop rules -------------------------------------------------------------

// pure geography — countries, cities, regions observed entering the graph as
// "actors". Exact-match (lowercased) only: "Moscow" drops, "Moscow City Duma"
// would not.
const GEOGRAPHY = new Set([
  // countries / territories
  "russia", "russian federation", "ukraine", "iran", "israel", "palestine",
  "lebanon", "syria", "iraq", "egypt", "qatar", "oman", "uae", "dubai",
  "saudi arabia", "kuwait", "bahrain", "yemen", "turkey", "turkiye", "france",
  "poland", "spain", "portugal", "china", "japan", "australia", "new zealand",
  "india", "sri lanka", "venezuela", "belarus", "united states", "usa", "us",
  "uk", "united kingdom", "gaza", "crimea", "democratic republic of congo", "sudan",
  // cities / oblasts / regions seen in the graph
  "moscow", "kyiv", "st. petersburg", "kramatorsk", "zaporizhzhia", "stavropol",
  "belgorod", "kursk", "ivano-frankivsk", "sumy oblast", "anapa", "isfahan",
  "bushehr", "izki-nizwa", "new york city", "melitopol", "kherson", "donetsk",
  "luhansk", "mariupol", "sevastopol", "odesa", "kharkiv", "novodmytrivka",
  "perm region", "moscow region", "lugansk region", "novosibirsk region",
]);

// weapons/objects/phenomena that are not actors
const NON_ACTORS = new Set([
  "oil tankers", "cargo vessel", "oil market", "ebola", "super typhoon bavi",
  "military logistics facility", "fp-1",
]);
const WEAPON_DESIGNATION = /^(su|mig|tu|s|kh|fab|x)-\d+\w*$/i;

// collective / non-specific actors: never a trackable entity
const COLLECTIVE_WORDS =
  /\b(individuals?|civilians|citizens|officials|activists|mourners|assailants|protesters|soldiers|personnel|commanders|residents|employees|schoolboy|pilots|settlers|partisans|fighters|rebels|troops|units|drones|companies|courts|governments|authorities|positions|national)$/i;
const UNNAMED = /^(unnamed|unidentified|unknown|anonymous|ex-|former)\b/i;
const COUNTED = /^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s/i;

export function junkReason(name: string, kind: string): string | null {
  const n = name.trim().toLowerCase();
  // known alias families take precedence: "Houthi fighters" merges into Houthis
  // (keeping its claim links) rather than dropping as a collective
  if (ALIAS_GROUPS[normalize(name)]) return null;
  if (GEOGRAPHY.has(n)) return "geography";
  if (NON_ACTORS.has(n) || WEAPON_DESIGNATION.test(n)) return "not an actor (object/equipment)";
  if (UNNAMED.test(n)) return "unnamed/role-described individual";
  if (COUNTED.test(n) && kind === "person") return "counted collective";
  if (COLLECTIVE_WORDS.test(n)) return "collective/generic actor";
  // "X in Y" constructions ("Gas Stations in Crimea") are descriptions, not actors
  if (/\s+in\s+/i.test(n) && kind !== "agency") return "descriptive collective";
  return null;
}

// ---- merge rules ------------------------------------------------------------

const HONORIFICS = new Set([
  "ayatollah", "seyyed", "sayyid", "sheikh", "dr", "mr", "mrs", "president",
  "general", "colonel", "grand",
]);

// cyrillic->latin fold for mixed-script names ("Magomet Muцolgov")
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu",
  я: "ya", ь: "", ъ: "",
};

// curated cluster map: observed alias families that pure normalization can't fold.
// key: normalized name -> group key. Conservative; anything else goes to the LLM.
const ALIAS_GROUPS: Record<string, string> = {
  "houthi": "houthis",
  "houthi fighters": "houthis",
  "houthi rebels": "houthis",
  "houthi movement": "houthis",
  "iranian revolutionary guard corps": "islamic revolutionary guard corps",
  "irgc": "islamic revolutionary guard corps",
  "russian forces": "russian armed forces",
  "russian military": "russian armed forces",
  "ukrainian forces": "ukrainian armed forces",
  "ukrainian military": "ukrainian armed forces",
  "ukrainian air defense forces": "ukrainian air defense",
  "irans intelligence ministry": "iranian intelligence ministry",
  "israeli supreme court": "supreme court of israel",
  "un": "united nations",
  "russian ministry of defense": "russian mod",
  "russian defense ministry": "russian mod",
};

/** Normalize for identity comparison: lowercase, cyrillic fold, punctuation
 *  strip, honorific strip, transliteration-variant fold. */
export function normalize(name: string): string {
  let n = name.trim().toLowerCase();
  n = [...n].map((ch) => CYR[ch] ?? ch).join("");
  n = n.replace(/[-–]/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const words = n.split(" ");
  while (words.length > 1 && HONORIFICS.has(words[0])) words.shift();
  // per-token transliteration folds: sergey=sergei, zelenskyy=zelenskiy=zelensky
  const folded = words.map((w) =>
    w.replace(/ey$/, "ei").replace(/yy$/, "y").replace(/iy$/, "y").replace(/ii$/, "i"),
  );
  return folded.join(" ");
}

export function canonicalKey(name: string): string {
  const n = normalize(name);
  return ALIAS_GROUPS[n] ?? n;
}

export interface CleanupPlan {
  drops: DropDecision[];
  merges: MergeDecision[];
}

/** Deterministic cleanup plan:
 *  1. drops by junk rule;
 *  2. merges by shared canonical key (canonical = most claims, then lowest id);
 *  3. surname-only persons merge into the unique full-name person sharing that
 *     surname ("Khamenei" -> "Ali Khamenei"); ambiguous surnames are left alone. */
export function planCleanup(rows: EntityRow[]): CleanupPlan {
  const drops: DropDecision[] = [];
  const keep: EntityRow[] = [];
  for (const r of rows) {
    const reason = junkReason(r.name, r.kind);
    if (reason) drops.push({ id: r.id, name: r.name, reason });
    else keep.push(r);
  }

  const groups = new Map<string, EntityRow[]>();
  for (const r of keep) {
    const key = canonicalKey(r.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const merges: MergeDecision[] = [];
  const mergedIds = new Set<number>();
  const asciiScore = (n: string) => (/^[\x20-\x7e]+$/.test(n) ? 1 : 0);
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    // canonical: most claims; ties prefer a clean-ASCII name (mixed-script
    // extraction bugs like "Muцolgov" must not become the canonical spelling)
    const canonical = [...members].sort(
      (a, b) => b.claims - a.claims || asciiScore(b.name) - asciiScore(a.name) || a.id - b.id,
    )[0];
    for (const m of members) {
      if (m.id === canonical.id) continue;
      merges.push({
        fromId: m.id, fromName: m.name,
        intoId: canonical.id, intoName: canonical.name,
        reason: "same canonical key",
      });
      mergedIds.add(m.id);
    }
  }

  // surname-only -> full-name merge (persons; must be unambiguous)
  const fullNames = keep.filter(
    (r) => r.kind === "person" && !mergedIds.has(r.id) && canonicalKey(r.name).includes(" "),
  );
  for (const r of keep) {
    if (r.kind !== "person" || mergedIds.has(r.id)) continue;
    const key = canonicalKey(r.name);
    if (key.includes(" ")) continue; // multi-token, not a bare surname
    const matches = fullNames.filter((f) => canonicalKey(f.name).endsWith(` ${key}`));
    if (matches.length === 1) {
      merges.push({
        fromId: r.id, fromName: r.name,
        intoId: matches[0].id, intoName: matches[0].name,
        reason: "surname of unique full-name entity",
      });
      mergedIds.add(r.id);
    }
  }

  // path-compress chained merges (A->B, B->C becomes A->C) so applying the plan
  // is order-independent
  const target = new Map(merges.map((m) => [m.fromId, m]));
  for (const m of merges) {
    let t = m.intoId;
    for (let hops = 0; target.has(t) && hops < 10; hops++) {
      const next = target.get(t)!;
      m.intoId = next.intoId;
      m.intoName = next.intoName;
      t = next.intoId;
    }
  }

  return { drops, merges };
}
