// Corpus-v2 admission transform (2026-09-03 maintainer pass).
//
// Pure and deterministic. Input: the FIVE preserved 2026-08-27 draft files
// (byte-identical originals at bnow-net-eval-corpus-v2-draft-20260827, sha256
// manifest-pinned; regenerable by scripts/evals/corpus-v2/build-draft.py).
// Output: the admitted c2 case fragments in the typed contractVersion-2 shape.
//
// EVERY delta between the drafts and the admitted cases lives HERE, explicit
// and reviewable — the generator is kept byte-identical to the preserved
// original so provenance is a single diff:
//   1. free-form draft capacity annotations -> typed capacity metadata
//      (contracts.ts), with descriptive-only keys folded into `notes`
//      (no information dropped, nothing silently tolerated);
//   2. stale fed-cutoff annotations corrected (SCI-N6 landed 2026-08-28 on
//      main AFTER the drafts were written: the shipped scorer applies the
//      production reduceGroupsFed() cutoff, so dig-c2-cap-002's "requires the
//      v2 runner change / FAILS today" claims inverted to true-today, and
//      dig-c2-cap-003 became profile-dependent instead of "runnable today");
//   3. QF-C hardening item 6: heldout fidelity mustNotMatch pins added to the
//      two capacity heldout cases that lacked any negative pattern;
//   4. the numeral instrument (SCI-3b): reference.checkNumerals enabled on
//      the map cases whose gists carry numerals;
//   5. Q12: the gazetteer-risky "red_sea" theater probe replaced by the
//      explicitly synthetic off-gazetteer sentinel "varn_strait" (and the
//      matching takeaway toponym words), so a future gazetteer addition can
//      never silently flip the case's meaning.
//
// Draft `offline.expectation` values are NEVER changed here; dig-c2-cap-003's
// fed-400 requirement is expressed as capacityMeta.exactReduceGroupsFed and
// classified by applicability.ts, not by editing the scorer or the verdict.

import type {
  AnalysisEvalCase,
  DigestEvalCase,
  MapDocFact,
  MapEvalCase,
  ValidationEvalCase,
} from "./contracts";

type Raw = Record<string, unknown>;

export interface DraftFiles {
  mapCapacity: Raw;
  mapAdversarial: Raw;
  reduceCapacity: Raw;
  digestLate: Raw;
  validation: Raw;
}

function rawCases(file: Raw, name: string): Raw[] {
  const cases = file.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`admit: ${name} has no cases`);
  return cases as Raw[];
}

function fail(id: string, msg: string): never {
  throw new Error(`admit: ${id}: ${msg}`);
}

// ---- admission maps (explicit, per adjudication) -------------------------------

/** injection-payload doc per adversarial case (the long payload-bearing doc) */
const INJECTION_DOC: Record<string, { docId: number; offsetU16: number }> = {
  "map-c2-adv-001-inject-tail": { docId: 2202, offsetU16: 1988 },
  "map-c2-adv-002-inject-deeptail-followed": { docId: 2211, offsetU16: 4505 },
};

/** quiet-control docs: the draft's quiet-day doc plus the adversarial
 *  PAYLOAD-BEARING docs, which expect zero claims — the "quiet-doc violation"
 *  failure mode is a candidate producing claims from the injected doc */
const QUIET_DOCS: Record<string, number[]> = {
  "map-c2-typ-003-quiet-day": [2181],
  "map-c2-adv-001-inject-tail": [2202],
  "map-c2-adv-002-inject-deeptail-followed": [2211],
};

/** SCI-3b numeral instrument: map cases whose gists carry numerals (bare
 *  digits / simple single number-words — gistNumeralStyleErrors-clean) */
const CHECK_NUMERALS_CASES = new Set([
  "map-c2-typ-001-pos800-ua",
  "map-c2-typ-002-pos800-ir",
  "map-c2-edge-001-boundary1500-ua",
  "map-c2-edge-002-pos2500-ru",
  "map-c2-edge-003-pos5000-ua",
  "map-c2-edge-004-pos5000-ir-taillost",
  "map-c2-edge-005-neardupe-ua",
  "map-c2-edge-006-neardupe-ru-collapse",
  "map-c2-adv-006-emoji-boundary",
]);

/** QF-C hardening item 6: heldout fidelity pins. Both capacity heldout cases
 *  expect only "claimed" hedges and their committed fixtures never say
 *  "confirmed" — the pin is inert offline and catches a live candidate that
 *  fabricates certainty (ruling 16's failure shape as a fidelity pattern). */
const HELDOUT_MUSTNOTMATCH: Record<string, string[]> = {
  "map-c2-edge-004-pos5000-ir-taillost": ["\\bconfirmed\\b"],
  "map-c2-edge-006-neardupe-ru-collapse": ["\\bconfirmed\\b"],
};

/** fed-cutoff decisive events: rank in the deterministic rankGroups order +
 *  the event-title pattern (from the drafts' own reference pins; rank 210's
 *  "fuel convoy" gid rides the culvert event and is stripped under fed 200) */
const DECISIVE_EVENTS: Record<string, Array<{ rank: number; titlePattern: string }>> = {
  "dig-c2-cap-001-fed200-rank185": [{ rank: 185, titlePattern: "sluice gate" }],
  "dig-c2-cap-002-fed200-rank230-dead": [{ rank: 230, titlePattern: "ferry cable" }],
  "dig-c2-cap-003-fed400-tailranks": [
    { rank: 230, titlePattern: "ferry cable" },
    { rank: 255, titlePattern: "munitions cache" },
  ],
  "dig-c2-cap-004-fed-boundary-pair": [
    { rank: 190, titlePattern: "culvert" },
    { rank: 210, titlePattern: "fuel convoy" },
  ],
};

/** Q10: the draft's fused locality rows built with the productive real
 *  Ukrainian toponym suffixes -ivka and -ove collide with real settlements
 *  (Verbove, Berehove, Dubove, Klynove, Verbivka, Piskivka, Kholmivka, …
 *  are all real places). The admission pass substitutes those two rows with
 *  the clearly synthetic -ivask / -ovask rows across each fed-cap case's
 *  whole JSON (claims AND vote fixtures — the head events cite three -ivka
 *  names in their titles). Check scope recorded honestly: repo gazetteers +
 *  maintainer knowledge, NOT an exhaustive worldwide proof. The remaining
 *  eleven suffix rows (-yne, -iede, -opil, -avka, -enky, -ychi, -kove,
 *  -ianka, -utsk, -olia, -ezhi) were screened and kept (Luhyne considered
 *  against the real town Luhyny and kept as a distinct spelling). */
const LOC_BASES = [
  "Klyn", "Horb", "Loz", "Stavk", "Yar", "Hais", "Brod", "Luh", "Verb", "Dub",
  "Most", "Kryn", "Ozer", "Pisk", "Kholm", "Sadk", "Val", "Lan", "Bereh", "Kut",
];
const LOCALITY_SUBSTITUTIONS: Array<[string, string]> = LOC_BASES.flatMap((b) => [
  [`${b}ivka`, `${b}ivask`] as [string, string],
  [`${b}ove`, `${b}ovask`] as [string, string],
]);

function substituteLocalities(caseJson: string): string {
  let out = caseJson;
  for (const [from, to] of LOCALITY_SUBSTITUTIONS) out = out.replaceAll(from, to);
  return out;
}

/** corrected notes for the four fed-cutoff cases (replaces the drafts' stale
 *  pre-SCI-N6 harness narratives; the shared-population description the
 *  drafts carried is preserved in the tail sentence, updated for the Q10
 *  locality substitution) */
const SHARED_POP_NOTE =
  "Shared 260-claim population: 260 textually-distinct single-claim groups " +
  "(verified singleton clustering against the real clusterClaims), reliability " +
  "strictly descending with claim id, publishedAt null everywhere — so " +
  "rankGroups order == id order and 'rank N' means the group of claim id " +
  "10001+N. Locality names are fused SYNTHETIC single tokens; the admission " +
  "pass replaced the draft's -ivka/-ove rows (real-settlement collisions, Q10) " +
  "with the clearly synthetic -ivask/-ovask rows; no named persons. The " +
  "population is byte-identical across the four dig-c2-cap cases by design.";

const FEDCAP_NOTES: Record<string, string> = {
  "dig-c2-cap-001-fed200-rank185":
    "Fed-cutoff control INSIDE the cut: the decisive 'sluice gate' event depends " +
    "solely on the group at rank 185; under the production fed cutoff of 200 " +
    "(applied by the shipped harness since SCI-N6, 2026-08-28) the gid is fed and " +
    "the event must survive. exactReduceGroupsFed: 200 — inapplicable under the " +
    "reduce-fed-400 profile. " + SHARED_POP_NOTE,
  "dig-c2-cap-002-fed200-rank230-dead":
    "Tail-event probe OUTSIDE the cut: the decisive 'ferry cable' event depends " +
    "solely on the group at rank 230. Under the production fed cutoff of 200 the " +
    "gid is never fed, parseVote strips it in all 5 votes (droppedGidRefs 5) and " +
    "the event must DIE. ADMISSION CORRECTION 2026-09-03: the draft annotated " +
    "this as requiring a future v2 runner change — SCI-N6 (2026-08-28) landed " +
    "the production-aligned cutoff in both the prompt builder and the scorer, so " +
    "the reference holds against the SHIPPED harness and offline.expectation " +
    "'pass' is true today under the baseline profile. exactReduceGroupsFed: 200. " +
    SHARED_POP_NOTE,
  "dig-c2-cap-003-fed400-tailranks":
    "400-fed variant: decisive events depend on the groups at ranks 230 and 255; " +
    "with REDUCE_GROUPS_FED=400 (the knob's clamped maximum, the reduce-fed-400 " +
    "profile) both are fed and must survive. ADMISSION CORRECTION 2026-09-03: " +
    "the draft called this 'runnable today' against a no-cutoff harness — the " +
    "shipped harness applies the production cutoff, so under the default fed 200 " +
    "BOTH decisive events die and this case is structurally INAPPLICABLE " +
    "(exactReduceGroupsFed: 400); it scores only in the +reduce-fed-400 results " +
    "file. The scorer is never widened per case. " + SHARED_POP_NOTE,
  "dig-c2-cap-004-fed-boundary-pair":
    "Boundary-straddle pair: decisive gids at ranks 190 (fed under 200) and 210 " +
    "(unfed under 200 — its gid rides the culvert event and parseVote strips it, " +
    "droppedGidRefs 5 across the 5 votes; under fed 400 nothing is stripped). " +
    "Reference pins are harness-invariant under the declared " +
    "exactReduceGroupsFed: 200. " + SHARED_POP_NOTE,
};

/** Q12: the off-gazetteer theater sentinel. "varn_strait" is a synthetic
 *  token that can never legitimately join the real-toponym gazetteer. */
const RED_SEA_CASE = "val-c2-edge-001-off-theater";

// ---- helpers -------------------------------------------------------------------

/** fold leftover draft annotation keys into the notes string, deterministic
 *  key order, so no drafted information is dropped by the strict contract */
function annotationNote(entries: Array<[string, unknown]>): string {
  if (entries.length === 0) return "";
  const body = entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("; ");
  return ` [capacity-annotations: ${body}]`;
}

/** the admission act itself: the drafts carried a "hand-authored-draft …
 *  PENDING human review … not admitted to any dataset" provenance; this
 *  maintainer pass IS that review, so admitted cases record both instants */
const ADMITTED_PROVENANCE =
  "authored-2026-08-27; admitted-2026-09-03 after maintainer review (docs/reviews/CORPUS-V2-ADMISSION-2026-09-03.md)";

function baseFields(c: Raw): Pick<AnalysisEvalCase, "id" | "partition" | "split" | "provenance"> & { notes?: string } {
  const draftProvenance = c.provenance as string;
  if (!draftProvenance.startsWith("hand-authored-draft-2026-08-27")) {
    fail(c.id as string, `unexpected draft provenance: ${draftProvenance}`);
  }
  return {
    id: c.id as string,
    partition: c.partition as AnalysisEvalCase["partition"],
    split: c.split as AnalysisEvalCase["split"],
    provenance: ADMITTED_PROVENANCE,
    ...(typeof c.notes === "string" ? { notes: c.notes } : {}),
  };
}

// ---- map -----------------------------------------------------------------------

interface DraftMapDocMeta {
  docId: number;
  contentLengthU16: number;
  facts?: MapDocFact[];
  requiredMapContentChars?: number;
  requiresContractCap?: number;
  boundaryNote?: string;
  emojiClusterStartU16?: number;
}

function admitMapCase(c: Raw): MapEvalCase {
  const id = c.id as string;
  const meta = (c.capacityMeta ?? {}) as Raw;
  const input = c.input as Raw;
  const reference = c.reference as Raw;
  const docs = input.docs as Array<Raw>;
  const docMetas = new Map<number, DraftMapDocMeta>(
    ((meta.docs ?? []) as DraftMapDocMeta[]).map((d) => [d.docId, d]),
  );
  const quietDocs = new Set(QUIET_DOCS[id] ?? []);
  const injection = INJECTION_DOC[id];
  const nearDupe = meta.nearDupePair === true;
  if (nearDupe && docs.length !== 2) fail(id, "nearDupePair case must have exactly 2 docs");

  const noteExtras: Array<[string, unknown]> = [];
  for (const key of [
    "positionCase", "failureMode", "sharedPrefixU16", "injectionCase", "payloadOffsetU16",
    "positionBucket", "personAllegation", "allegationOffsetU16", "translationCase",
    "emojiBoundary", "unitNote",
  ]) {
    if (meta[key] !== undefined) noteExtras.push([key, meta[key]]);
  }

  let minRequired: number | undefined;
  const admittedDocs = docs.map((d) => {
    const docId = d.docId as number;
    const content = d.content as string;
    const dm = docMetas.get(docId);
    if (dm !== undefined) {
      if (dm.contentLengthU16 !== content.length) {
        fail(id, `doc ${docId}: draft contentLengthU16 ${dm.contentLengthU16} != content.length ${content.length}`);
      }
      if (dm.boundaryNote !== undefined) noteExtras.push([`doc${docId}.boundaryNote`, dm.boundaryNote]);
      if (dm.emojiClusterStartU16 !== undefined) noteExtras.push([`doc${docId}.emojiClusterStartU16`, dm.emojiClusterStartU16]);
      if (dm.requiredMapContentChars !== undefined) {
        minRequired = Math.max(minRequired ?? 0, dm.requiredMapContentChars);
      }
    }
    const capacity = {
      ...(dm?.facts !== undefined ? { facts: dm.facts } : {}),
      ...(dm?.requiredMapContentChars !== undefined ? { requiredMapContentChars: dm.requiredMapContentChars } : {}),
      ...(dm?.requiresContractCap !== undefined ? { requiresContractCap: dm.requiresContractCap } : {}),
      ...(injection?.docId === docId ? { injectionPayloadOffsetU16: injection.offsetU16 } : {}),
      ...(nearDupe ? { nearDupePairId: (docs.find((o) => o.docId !== docId)!.docId as number) } : {}),
      ...(quietDocs.has(docId) ? { quietControl: true } : {}),
    };
    return {
      docId,
      title: (d.title ?? null) as string | null,
      content,
      lang: d.lang as string,
      day: d.day as string,
      ...(Object.keys(capacity).length > 0 ? { capacity } : {}),
    };
  });

  const expected = (reference.expected as Array<Raw>).map((e) => {
    const docId = e.docId as number;
    const facts = docMetas.get(docId)?.facts ?? [];
    return {
      docId,
      claims: (e.claims as Array<Raw>).map((cl) => {
        const { positionBucket, charOffsetU16, ...rest } = cl;
        if (positionBucket === undefined && charOffsetU16 === undefined) return cl as never;
        if (positionBucket === undefined || charOffsetU16 === undefined) {
          fail(id, `expected claim on doc ${docId} has a partial position annotation`);
        }
        const factKey = facts.find((f) => f.startU16 === charOffsetU16)?.key;
        return {
          ...rest,
          capacity: {
            positionBucket,
            charOffsetU16,
            ...(factKey !== undefined ? { factKey } : {}),
          },
        } as never;
      }),
    };
  });

  const mustNotMatch = [
    ...((reference.mustNotMatch as string[] | undefined) ?? []),
    ...(HELDOUT_MUSTNOTMATCH[id] ?? []),
  ];

  const notes =
    ((c.notes as string | undefined) ?? "") +
    (HELDOUT_MUSTNOTMATCH[id] !== undefined
      ? " ADMISSION 2026-09-03: heldout fidelity mustNotMatch pin(s) added (QF-C hardening item 6); inert against the committed fixture, catches live certainty fabrication."
      : "") +
    (CHECK_NUMERALS_CASES.has(id)
      ? " ADMISSION 2026-09-03: checkNumerals enabled (SCI-3b numeral instrument; gists use bare digits / simple single number-words)."
      : "") +
    annotationNote(noteExtras);

  return {
    ...baseFields(c),
    workload: "map",
    notes,
    input: {
      theater: input.theater as string,
      track: input.track as MapEvalCase["input"]["track"],
      docs: admittedDocs,
    },
    reference: {
      ...(CHECK_NUMERALS_CASES.has(id) ? { checkNumerals: true } : {}),
      expected,
      ...(reference.mustMatch !== undefined ? { mustMatch: reference.mustMatch as string[] } : {}),
      ...(mustNotMatch.length > 0 ? { mustNotMatch } : {}),
      ...(reference.injectionPatterns !== undefined ? { injectionPatterns: reference.injectionPatterns as string[] } : {}),
    },
    offline: c.offline as MapEvalCase["offline"],
    ...(minRequired !== undefined || meta.fictionalPersons !== undefined || meta.fictionalOrgs !== undefined
      ? {
          capacityMeta: {
            ...(minRequired !== undefined ? { minMapContentChars: minRequired } : {}),
            ...(meta.fictionalPersons !== undefined ? { fictionalPersons: meta.fictionalPersons as string[] } : {}),
            ...(meta.fictionalOrgs !== undefined ? { fictionalOrgs: meta.fictionalOrgs as string[] } : {}),
          },
        }
      : {}),
  };
}

// ---- digest --------------------------------------------------------------------

function admitFedCapCase(rawCase: Raw): DigestEvalCase {
  // Q10 locality substitution applies to the WHOLE case (claims + votes)
  const c = JSON.parse(substituteLocalities(JSON.stringify(rawCase))) as Raw;
  const id = c.id as string;
  const meta = (c.capacityMeta ?? {}) as Raw;
  const notes = FEDCAP_NOTES[id];
  if (notes === undefined) fail(id, "fed-cap case without corrected admission notes");
  const decisive = DECISIVE_EVENTS[id];
  if (decisive === undefined) fail(id, "fed-cap case without a decisive-events map");
  if (JSON.stringify(decisive.map((d) => d.rank)) !== JSON.stringify(meta.decisiveRanks)) {
    fail(id, `decisive ranks drifted from the draft (${JSON.stringify(meta.decisiveRanks)})`);
  }
  return {
    ...baseFields(c),
    workload: "digest",
    notes,
    input: c.input as DigestEvalCase["input"],
    reference: c.reference as DigestEvalCase["reference"],
    offline: c.offline as DigestEvalCase["offline"],
    capacityMeta: {
      exactReduceGroupsFed: meta.targetFedCap as number,
      decisiveEvents: decisive,
    },
  };
}

function admitLateCase(c: Raw): DigestEvalCase {
  const id = c.id as string;
  const meta = (c.capacityMeta ?? {}) as Raw;
  const input = c.input as Raw;
  const claims = input.claims as Array<Raw>;
  // lateClaimIds: the claims published at the case's latest publishedAt
  // instant (deterministic; the draft's latestPublishedAt annotation, where
  // present, must agree)
  const published = claims
    .map((cl) => ({ id: cl.id as number, at: cl.publishedAt as string | null }))
    .filter((x): x is { id: number; at: string } => x.at !== null);
  if (published.length === 0) fail(id, "late case without publishedAt claims");
  const latest = published.map((x) => x.at).sort().at(-1)!;
  if (meta.latestPublishedAt !== undefined && meta.latestPublishedAt !== latest) {
    fail(id, `draft latestPublishedAt ${String(meta.latestPublishedAt)} != derived ${latest}`);
  }
  const lateClaimIds = published.filter((x) => x.at === latest).map((x) => x.id);

  const noteExtras: Array<[string, unknown]> = [];
  for (const key of ["lateDocCase", "failureMode", "latestPublishedAt", "windowEnd", "personAllegation"]) {
    if (meta[key] !== undefined) noteExtras.push([key, meta[key]]);
  }
  return {
    ...baseFields(c),
    workload: "digest",
    notes: ((c.notes as string | undefined) ?? "") + annotationNote(noteExtras),
    input: c.input as DigestEvalCase["input"],
    reference: c.reference as DigestEvalCase["reference"],
    offline: c.offline as DigestEvalCase["offline"],
    capacityMeta: {
      lateClaimIds,
      ...(meta.fictionalPersons !== undefined ? { fictionalPersons: meta.fictionalPersons as string[] } : {}),
    },
  };
}

// ---- validation ----------------------------------------------------------------

function admitValidationCase(c: Raw): ValidationEvalCase {
  const id = c.id as string;
  let raw = c;
  let sentinelNote = "";
  if (id === RED_SEA_CASE) {
    // Q12: swap the real-region probe for the synthetic off-gazetteer
    // sentinel. Textual swap only — the takeaway still matches no claim
    // (labels/expectKeyword pins unchanged and re-verified by the offline
    // machinery run at admission).
    const json = JSON.stringify(c);
    if (!json.includes("red_sea")) fail(id, "expected the red_sea probe in the draft");
    const swapped = json
      .replaceAll("red_sea", "varn_strait")
      .replaceAll("Red Sea", "Varn Strait"); // takeaway text + the notes prose
    if (swapped.includes("Red Sea")) fail(id, "a Red Sea mention survived the sentinel swap");
    raw = JSON.parse(swapped) as Raw;
    sentinelNote =
      " ADMISSION 2026-09-03 (Q12): the draft's off-gazetteer probe used the real region token red_sea, whose meaning would silently flip if the gazetteer ever gained it; replaced with the synthetic sentinel varn_strait (probe expect 'both' unchanged; the takeaway still matches no claim).";
  }
  const base = baseFields(raw);
  return {
    ...(raw as unknown as ValidationEvalCase),
    ...base,
    ...(sentinelNote !== "" ? { notes: (base.notes ?? "") + sentinelNote } : {}),
  };
}

// ---- entry ---------------------------------------------------------------------

export interface AdmittedFragments {
  map: MapEvalCase[];
  digest: DigestEvalCase[];
  validation: ValidationEvalCase[];
}

export function admitCorpusC2(drafts: DraftFiles): AdmittedFragments {
  const map = [
    ...rawCases(drafts.mapCapacity, "map-capacity").map(admitMapCase),
    ...rawCases(drafts.mapAdversarial, "map-adversarial").map((c) => {
      const admitted = admitMapCase(c);
      if (admitted.id === "map-c2-adv-005-translation-denial-ar") {
        admitted.notes =
          (admitted.notes ?? "") +
          " ADMISSION 2026-09-03 (Q13): Arabic prose verified only through the real verifyQuote NFKC path and non-native review — NO native-speaker linguistic/safety review has occurred; the case is diagnostic (development split) until a human native-speaker review is recorded in a decision-log entry.";
      }
      return admitted;
    }),
  ];
  const digest = [
    ...rawCases(drafts.reduceCapacity, "reduce-capacity").map(admitFedCapCase),
    ...rawCases(drafts.digestLate, "digest-late").map(admitLateCase),
  ];
  const validation = rawCases(drafts.validation, "validation").map(admitValidationCase);
  if (map.length !== 16 || digest.length !== 7 || validation.length !== 3) {
    throw new Error(
      `admit: inventory drift — expected 16 map / 7 digest / 3 validation, got ${map.length}/${digest.length}/${validation.length}`,
    );
  }
  return { map, digest, validation };
}
