// ConflictSnapshotRef — the Phase 5 snapshot-provenance CONTRACT (workstream
// prompt §13; decision register #5).
//
// A ConflictSnapshotRef points at an IMMUTABLE input artifact and records
// everything a later reader needs to decide whether that artifact can prove
// the populations an evaluation was scored against: capture kind, captured-at
// instant, the conflict, the artifact identity (locator + content hash), the
// corpus/output population identity (claim-id sets per population), the
// policy versions the capture ran under, and a bounded provenance label.
//
// REGISTER #5 IS ENFORCED HERE, mechanically: `operational_cutoff`,
// `at_publication`, and `finalized` scoring REFUSES unless a reviewed capture
// path can prove the populations — and no such path exists in this
// workstream, so resolution for those kinds terminates in a refusal even for
// a hash-verified artifact (`population_unproven`). The ONLY satisfiable
// capture kinds today are `fixture` (the frozen committed corpus files —
// byte-hashed, reviewable, immutable by the corpus rules) and
// `retrospective_labeled` (an honest retrospective whose artifact exists and
// hashes). The future application capture path is DESIGNED, not implemented:
// docs/designs/CONFLICT-SNAPSHOT-CAPTURE.md; lifting `population_unproven`
// for the three snapshot kinds requires that path plus its own review and a
// new decision-register entry.
//
// STORED-ERROR DISCIPLINE (Gate-4 legal note, binding on Phase 5): refusals
// are BOUNDED tokens (`SnapshotRefusalDetail`), never free text, and the
// validator's error strings never echo caller-supplied string values
// (locator/provenance/hash could carry arbitrary text) — so nothing built on
// this module can persist error text carrying unvalidated values.
//
// Pure and paid-call-free: no provider SDK, no env reads, no network. The
// only IO lives in the fixture artifact store (local committed files).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTOR_ROSTER_VERSIONS } from "./actor-rosters";
import { CONFLICT_REGISTRY } from "./definitions";
import { SCOPE_VERSIONS } from "./editions";
import { deepFreeze } from "./freeze";
import { CONFLICT_FIXTURE_FILES } from "./fixture-corpus";
import { isIsoInstant } from "./instants";
import { LANE_CLASSIFIER_VERSIONS } from "./lane-classifier";
import {
  METHODOLOGY_EPOCH,
  isConflictId,
  type ConflictId,
  type EvaluationKind,
} from "./vocabulary";

// ---------------------------------------------------------------------------
// Capture kinds
// ---------------------------------------------------------------------------

/** How the referenced artifact was produced. The three snapshot-anchored
 *  kinds mirror the evaluation kinds they would prove; `fixture` and
 *  `retrospective_labeled` are the two kinds this workstream can actually
 *  satisfy (register #5). */
export const SNAPSHOT_CAPTURE_KINDS = deepFreeze([
  "fixture",
  "retrospective_labeled",
  "operational_cutoff",
  "at_publication",
  "finalized",
] as const);
export type SnapshotCaptureKind = (typeof SNAPSHOT_CAPTURE_KINDS)[number];

export function isSnapshotCaptureKind(value: unknown): value is SnapshotCaptureKind {
  return typeof value === "string" && (SNAPSHOT_CAPTURE_KINDS as readonly string[]).includes(value);
}

/** Which capture kinds may back an evaluation of the given kind: a
 *  retrospective may cite a fixture artifact or an honest labeled
 *  retrospective capture; each snapshot-anchored kind accepts ONLY its own
 *  capture kind (an at-publication artifact can never prove a cutoff
 *  population, and vice versa). */
export function snapshotKindsForEvaluation(kind: EvaluationKind): readonly SnapshotCaptureKind[] {
  return kind === "retrospective" ? RETROSPECTIVE_KINDS : ([kind] as const);
}
const RETROSPECTIVE_KINDS = deepFreeze(["fixture", "retrospective_labeled"] as const);

// ---------------------------------------------------------------------------
// The ref shape
// ---------------------------------------------------------------------------

/** Population identity: the exact claim-id sets of BOTH populations at
 *  capture time, sorted ascending, duplicates refused. Empty is legal — a
 *  snapshot can prove an empty population (a real 0/N observation input). */
export interface ConflictSnapshotPopulationsV1 {
  corpusRecallClaimIds: readonly number[];
  publishedRetentionClaimIds: readonly number[];
}

/** Every policy version the capture ran under. v1 rule (deliberate,
 *  fail-closed): these must equal the CURRENT frozen registry values for the
 *  conflict — a ref captured under superseded policy versions cannot prove
 *  populations for current-epoch scoring; a methodology change mints a new
 *  epoch and new refs, never a reinterpreted old ref. */
export interface ConflictSnapshotPolicyVersionsV1 {
  methodologyEpoch: string;
  laneTaxonomyVersion: string;
  evidencePolicyVersion: string;
  actorRosterVersion: string;
  laneClassifierVersion: string;
  scopeVersion: string;
}

export interface ConflictSnapshotArtifactV1 {
  /** bounded path-like token naming the immutable artifact (never a URL with
   *  credentials, never prose); stores allowlist what they will read */
  locator: string;
  /** sha256 hex over the artifact bytes */
  contentHash: string;
}

export interface ConflictSnapshotRefV1 {
  version: 1;
  captureKind: SnapshotCaptureKind;
  /** explicit-timezone ISO instant the artifact was captured */
  capturedAt: string;
  conflictId: ConflictId;
  artifact: ConflictSnapshotArtifactV1;
  populations: ConflictSnapshotPopulationsV1;
  policyVersions: ConflictSnapshotPolicyVersionsV1;
  /** bounded machine label (slug-like), NOT narrative text */
  provenance: string;
}

// ---------------------------------------------------------------------------
// Validation (fail-closed; error strings never echo caller-supplied values)
// ---------------------------------------------------------------------------

const HASH_RE = /^[0-9a-f]{64}$/;
const LOCATOR_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const PROVENANCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,119}$/;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function validateClaimIdList(errs: string[], field: string, list: unknown): void {
  if (!Array.isArray(list)) {
    errs.push(`${field}: must be an array of claim ids`);
    return;
  }
  let prev = -1;
  for (const id of list) {
    if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
      errs.push(`${field}: every claim id must be a non-negative integer`);
      return;
    }
    if (id <= prev) {
      errs.push(`${field}: claim ids must be strictly ascending (sorted, unique)`);
      return;
    }
    prev = id;
  }
}

/** Structural + registry-consistency validation. [] = valid. Messages name
 *  the violated rule but NEVER echo locator/provenance/hash/instant values
 *  (stored-error discipline — callers may persist derived diagnostics). */
export function validateConflictSnapshotRefV1(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["snapshot ref: not an object"];
  const r = raw;
  if (r.version !== 1) errs.push("version: must be 1");
  if (!isSnapshotCaptureKind(r.captureKind)) {
    errs.push("captureKind: not a member of the bounded capture-kind union");
  }
  if (!isIsoInstant(r.capturedAt)) {
    errs.push("capturedAt: must be an explicit-timezone ISO instant");
  }
  if (!isConflictId(r.conflictId)) {
    errs.push("conflictId: unknown conflict");
    return errs; // policy-version cross-checks below are keyed by the conflict
  }
  const def = CONFLICT_REGISTRY[r.conflictId];

  if (!isRecord(r.artifact)) {
    errs.push("artifact: must be an object");
  } else {
    if (typeof r.artifact.locator !== "string" || !LOCATOR_RE.test(r.artifact.locator) || r.artifact.locator.includes("..")) {
      errs.push("artifact.locator: must be a bounded path-like token (no traversal, <=200 chars)");
    }
    if (typeof r.artifact.contentHash !== "string" || !HASH_RE.test(r.artifact.contentHash)) {
      errs.push("artifact.contentHash: must be 64 lowercase hex chars (sha256)");
    }
  }

  if (!isRecord(r.populations)) {
    errs.push("populations: must be an object");
  } else {
    validateClaimIdList(errs, "populations.corpusRecallClaimIds", r.populations.corpusRecallClaimIds);
    validateClaimIdList(
      errs,
      "populations.publishedRetentionClaimIds",
      r.populations.publishedRetentionClaimIds,
    );
  }

  if (!isRecord(r.policyVersions)) {
    errs.push("policyVersions: must be an object");
  } else {
    const p = r.policyVersions;
    const expect = (field: string, got: unknown, want: string) => {
      if (got !== want) errs.push(`policyVersions.${field}: does not match the conflict's current frozen ${field} (v1 refs must be captured under current policy — a superseded-policy ref cannot prove current-epoch populations)`);
    };
    expect("methodologyEpoch", p.methodologyEpoch, METHODOLOGY_EPOCH);
    expect("laneTaxonomyVersion", p.laneTaxonomyVersion, def.laneTaxonomyVersion);
    expect("evidencePolicyVersion", p.evidencePolicyVersion, def.evidencePolicyVersion);
    expect("actorRosterVersion", p.actorRosterVersion, ACTOR_ROSTER_VERSIONS[r.conflictId]);
    expect("laneClassifierVersion", p.laneClassifierVersion, LANE_CLASSIFIER_VERSIONS[r.conflictId]);
    expect("scopeVersion", p.scopeVersion, SCOPE_VERSIONS[def.referenceSeries]);
  }

  if (typeof r.provenance !== "string" || !PROVENANCE_RE.test(r.provenance)) {
    errs.push("provenance: must be a bounded machine label (slug-like, <=120 chars) — never narrative text");
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Artifact stores
// ---------------------------------------------------------------------------

/** Where immutable artifacts live. Implementations MUST be read-only and
 *  fail-closed: null for anything they cannot prove they hold. */
export interface ConflictSnapshotArtifactStore {
  readArtifact(locator: string): Promise<Uint8Array | null>;
}

/** The one satisfiable store in this workstream: the frozen committed fixture
 *  corpus files, by exact allowlisted name. Anything else is null. */
export class FixtureSnapshotArtifactStore implements ConflictSnapshotArtifactStore {
  constructor(
    private readonly baseDir: string = join(process.cwd(), "fixtures", "conflicts"),
  ) {}

  async readArtifact(locator: string): Promise<Uint8Array | null> {
    if (!(CONFLICT_FIXTURE_FILES as readonly string[]).includes(locator)) return null;
    try {
      return readFileSync(join(this.baseDir, locator));
    } catch {
      return null;
    }
  }
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Mint a fixture-kind ref over concrete artifact bytes (test/offline use;
 *  provenance defaults to the frozen-corpus label). */
export function fixtureSnapshotRef(input: {
  conflictId: ConflictId;
  locator: string;
  artifactBytes: Uint8Array | string;
  populations: ConflictSnapshotPopulationsV1;
  capturedAt: string;
  provenance?: string;
}): ConflictSnapshotRefV1 {
  const def = CONFLICT_REGISTRY[input.conflictId];
  return {
    version: 1,
    captureKind: "fixture",
    capturedAt: input.capturedAt,
    conflictId: input.conflictId,
    artifact: { locator: input.locator, contentHash: sha256Hex(input.artifactBytes) },
    populations: input.populations,
    policyVersions: {
      methodologyEpoch: METHODOLOGY_EPOCH,
      laneTaxonomyVersion: def.laneTaxonomyVersion,
      evidencePolicyVersion: def.evidencePolicyVersion,
      actorRosterVersion: ACTOR_ROSTER_VERSIONS[input.conflictId],
      laneClassifierVersion: LANE_CLASSIFIER_VERSIONS[input.conflictId],
      scopeVersion: SCOPE_VERSIONS[def.referenceSeries],
    },
    provenance: input.provenance ?? "frozen-fixture-corpus-v1",
  };
}

// ---------------------------------------------------------------------------
// Resolution (the refusal wiring; register #5)
// ---------------------------------------------------------------------------

/** BOUNDED refusal details — the machine-readable "why", never free text. */
export const SNAPSHOT_REFUSAL_DETAILS = deepFreeze([
  "missing_ref",
  "invalid_ref",
  "conflict_mismatch",
  "kind_mismatch",
  "artifact_missing",
  "artifact_hash_mismatch",
  "population_unproven",
] as const);
export type SnapshotRefusalDetail = (typeof SNAPSHOT_REFUSAL_DETAILS)[number];

export type ConflictSnapshotResolution =
  | { ok: true; ref: ConflictSnapshotRefV1 | null }
  | { ok: false; reason: "no_proven_snapshot"; detail: SnapshotRefusalDetail };

function refusal(detail: SnapshotRefusalDetail): ConflictSnapshotResolution {
  return { ok: false, reason: "no_proven_snapshot", detail };
}

/** Decide whether scoring may proceed for (conflict, evaluation kind, ref).
 *
 *  - `retrospective` with no ref: OK (the honest labeled retrospective this
 *    workstream already produces — no snapshot claim is being made).
 *  - `retrospective` with a ref: the ref must validate, agree on conflict,
 *    carry a retrospective-compatible capture kind (fixture /
 *    retrospective_labeled), and its artifact must EXIST and HASH — then OK.
 *  - `operational_cutoff` / `at_publication` / `finalized`: every rung must
 *    hold (ref present, valid, conflict + kind agree, artifact exists and
 *    hashes) AND then the resolution still refuses `population_unproven`,
 *    because no reviewed capture path exists in this workstream to attest
 *    population completeness (register #5). Lifting that terminal refusal is
 *    the future capture path's own reviewed change, never a caller flag.
 */
export async function resolveConflictSnapshot(
  conflictId: ConflictId,
  kind: EvaluationKind,
  ref: ConflictSnapshotRefV1 | null,
  store: ConflictSnapshotArtifactStore,
): Promise<ConflictSnapshotResolution> {
  if (ref === null) {
    return kind === "retrospective" ? { ok: true, ref: null } : refusal("missing_ref");
  }
  if (validateConflictSnapshotRefV1(ref).length > 0) return refusal("invalid_ref");
  if (ref.conflictId !== conflictId) return refusal("conflict_mismatch");
  if (!snapshotKindsForEvaluation(kind).includes(ref.captureKind)) return refusal("kind_mismatch");
  const bytes = await store.readArtifact(ref.artifact.locator);
  if (bytes === null) return refusal("artifact_missing");
  if (sha256Hex(bytes) !== ref.artifact.contentHash) return refusal("artifact_hash_mismatch");
  if (kind !== "retrospective") return refusal("population_unproven");
  return { ok: true, ref };
}
