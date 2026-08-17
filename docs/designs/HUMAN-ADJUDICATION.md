# Bounded human adjudication — reviewed design (Worktree D, 2026-08-17)

Status: DESIGN ONLY. The quality-foundation program's Worktree D clause says to
implement this only if A–C and their reviews pass with substantial time
remaining; the program elected the reviewed-design path (the conflict/region
evaluation workstream was queued behind this program mid-flight, and a rushed
half-authorized admin surface is the exact failure mode the clause forbids).
Nothing in this document is implemented; no migration number is claimed.

## 1. Outcome

A minimal admin-only workflow for STRUCTURED HUMAN LABELS that can grow the
held-out evaluation corpus of the analysis-eval control plane (Worktree C).
It is review/annotation only. It never changes claims, events, sources,
entity matches, digests, model registries, or routing configuration — an
annotation is an opinion ABOUT pipeline output, stored beside it, exported
into eval-dataset-shaped candidates by a deliberate human act.

## 2. Review subjects (bounded enum `subject_type`)

| subject_type | subject identity | typical label questions |
|---|---|---|
| `validation_miss` | validation_runs.id + takeaway index | was the miss real? which lane/track should have covered it? |
| `validation_agreement` | validation_runs.id + takeaway index + claim id | is the agreement genuine (same event) or topical? |
| `map_miss` | raw_document id + track + extractor_version | did the doc contain an extractable claim the map missed? |
| `map_false_positive` | doc_claims.id | is the claim unsupported by its document? |
| `reduce_merge_error` | two doc_claims ids | should these have merged / stayed split? |
| `stale_evidence` | claims.id | is the claim materially stale per its evidence timestamps? |
| `citation_quality` | claims.id | are the citations wrong or insufficient? |
| `publication_safety` | events.id or claims.id | should the guard have dropped/attributed this? |
| `ask_retrieval` | ask_runs.id (id only — content stays in its own store under its own retention) | did retrieval miss obvious evidence? |
| `entity_match_candidate` | entities.id | candidate-identity review, NON-ASSERTIVE — never auto-applied (rulings 6/20; OpenSanctions data stays admin-only screening metadata) |

Labels are structured per subject type (small versioned label schemas, e.g.
`{ verdict: "confirmed_miss" | "not_a_miss" | "unclear" | "unadjudicable", lane?: ... }`),
with `label_schema_version` persisted per row so old labels never get
reinterpreted. Binding schema rules:

- `label_schema_version` is namespaced PER SUBJECT TYPE (`"map_miss-v1"`),
  and consumers must handle a supersession chain whose tip carries an older
  schema version than the current one (render/export by the row's own
  version, never reinterpret).
- Label schema values are CLOSED vocabularies, ids, booleans, or numbers
  ONLY — no free-text field may ever be added to a label schema. `note` is
  the single free-text surface in the whole design, and its 500-char cap is
  therefore the total free-text budget per annotation.
- Every verdict vocabulary includes `"unadjudicable"` — a reviewer who cannot
  responsibly judge (dead source URL, redacted content, insufficient context)
  records that honestly instead of guessing; unadjudicable rows are excluded
  from export by default.

## 3. Storage — additive forward migration (deferred)

A durable table IS genuinely necessary (labels must survive digest
regeneration and eval reruns), so the design is one append-only table:

```sql
CREATE TABLE eval_annotations (
  id            serial PRIMARY KEY,
  subject_type  text NOT NULL,          -- bounded enum, app-validated
  subject_key   text NOT NULL,          -- typed composite key; grammar table below
  label         jsonb NOT NULL,         -- structured, per-type schema (closed vocab)
  label_schema_version text NOT NULL,   -- per-subject-type namespaced, e.g. "map_miss-v1"
  reviewer_id   text NOT NULL REFERENCES users(id),  -- NO ACTION on delete, BY INTENT:
                -- an audit table must block account hard-deletion; any future
                -- account-deletion flow handles annotated reviewers explicitly
  note          varchar(500),           -- concise; NEVER source full text, ISW prose,
                -- or Ask question/answer text (see the ask_retrieval rule below)
  supersedes_id integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (supersedes_id <> id),
  -- same-subject supersession is DB-ENFORCED via a composite FK onto a
  -- redundant unique index — a row can only supersede a row of its own subject
  UNIQUE (id, subject_type, subject_key),
  FOREIGN KEY (supersedes_id, subject_type, subject_key)
    REFERENCES eval_annotations (id, subject_type, subject_key)
);
-- forks refused at the DB: at most one row may supersede any given row
CREATE UNIQUE INDEX eval_annotations_supersedes_unique
  ON eval_annotations (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX eval_annotations_subject_idx ON eval_annotations (subject_type, subject_key);

-- APPEND-ONLY IS DB-ENFORCED, not an app honor system (house precedent:
-- drizzle/9999_claim_source_trigger.sql exists because app discipline is not
-- an invariant). Same idempotent-re-assert style, applied in the same
-- migration:
CREATE OR REPLACE FUNCTION eval_annotations_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'eval_annotations is append-only — supersede, never rewrite'; END;
$$ LANGUAGE plpgsql;
-- CREATE OR REPLACE TRIGGER (PG 14+; fine on Neon) so re-applies stay
-- idempotent, matching the 9999 file's re-assert style
CREATE OR REPLACE TRIGGER eval_annotations_no_rewrite
  BEFORE UPDATE OR DELETE ON eval_annotations
  FOR EACH ROW EXECUTE FUNCTION eval_annotations_immutable();
-- TRUNCATE does not fire row triggers — cover it explicitly, or a cleanup
-- helper could erase the whole history without any constraint firing
CREATE OR REPLACE TRIGGER eval_annotations_no_truncate
  BEFORE TRUNCATE ON eval_annotations
  FOR EACH STATEMENT EXECUTE FUNCTION eval_annotations_immutable();
```

Rules:

- APPEND-ONLY: corrections insert a new row with `supersedes_id` pointing at
  the superseded one. The trigger above makes UPDATE/DELETE raise for every
  caller (app code, sqlq, future scripts alike). The EFFECTIVE label for a
  subject is the row of that subject_key with no superseding row, ordered by
  `id DESC` as the sole tiebreak authority (`created_at` is display-only —
  same-microsecond inserts must not make the effective label plan-dependent).
  Insert-time rule: superseding a row that is ALREADY superseded is refused
  by the partial unique index; the application surfaces "annotation was
  corrected concurrently — reload and re-apply against the chain tip".
  DUAL-ROOT rule (app-enforced — the DB cannot express it with these
  constraints): when a subject already has ANY annotation, a non-superseding
  insert is refused with the same reload message — every later opinion is a
  supersession, so one subject has exactly one chain. If a parallel root
  nonetheless exists (hand-crafted SQL), the id-DESC effective-label rule
  still resolves deterministically and the export marks the subject
  `multipleChains:true` for human attention. Self-supersession is refused by
  the CHECK; forks by the unique index; cross-subject supersession by the
  composite FK. Multi-row cycles are impossible for all sequential inserts
  given immutability (a row's supersedes_id is fixed at insert and can only
  point at a pre-existing, lower id); a crafted same-statement explicit-id
  cycle is INERT — both rows are superseded, so neither can ever become the
  effective label.
- `subject_key` is a typed string (not an FK to volatile tables) because
  subjects span heterogeneous tables AND because claims/events are
  deleted+reinserted on digest regeneration — an FK would cascade away human
  work. Key grammar and re-resolution are specified PER SUBJECT TYPE:

  | subject_type | key grammar | re-resolution + drift handling |
  |---|---|---|
  | `validation_miss` / `validation_agreement` | `vrun:<validation_runs.id>:tk:<index>[:claim:<id>]:pin:<sha256-12 of the run's divergences JSON + run_at>` | validation_runs rows are UPSERTED in place by revalidation — the pin hash detects it; a pin mismatch renders/exports as `resolved:false` (the annotation described a superseded run state) |
  | `map_miss` | `doc:<raw_documents.id>:track:<track>:ver:<extractor_version>` | raw_documents ids are stable; version names the exact extraction judged |
  | `map_false_positive` | `docclaim:<doc_claims.id>` | doc_claims is append-only; id is durable |
  | `reduce_merge_error` | `docclaim:<idA>:docclaim:<idB>` (ascending) | append-only ids; durable |
  | `stale_evidence` / `citation_quality` | `claim:<claims.id>:h:<sha256-12 of claim text>:d:<theater>:<track>:<claim_date or "none">` | REGENERATION-FRAGILE: on id miss, re-resolve by exact text hash SCOPED to (theater, track, claim_date) — ruling 12's recurring templates make an unscoped text hash resolve to the wrong day; zero or multiple scoped matches ⇒ `resolved:false`. claims.claim_date is nullable: a null-dated claim encodes `d:...:none` and, lacking the day scope, resolves `resolved:false` on any id miss (never a hash-only match) |
  | `publication_safety` | event: `event:<events.id>:h:<sha256-12 of title>:d:<theater>:<track>:<event_date>`; claim: as `claim:` above | REGENERATION-FRAGILE, and guard rewrites can change titles (ruling 19) — a hash miss is EXPECTED and yields `resolved:false`, never a fuzzy match |
  | `ask_retrieval` | `askrun:<ask_runs.id>` | row survives retention (content is redacted, not deleted); a redacted run renders "content redacted per retention" and exports `resolved:false` |
  | `entity_match_candidate` | `entity:<entities.id>` | stable id |

  `resolved:false` annotations are retained forever (they are history),
  rendered with an explicit unresolved banner, and excluded from export
  unless `--include-unresolved` is passed (which still marks each one).
- `ask_retrieval` data rule: the run's question/answer content is governed by
  the Ask retention windows (Privacy 1.3, content ≤30d). The subject page
  renders whatever the run row currently holds (post-sweep: the redaction
  markers); the NOTE MUST NOT quote or paraphrase the user's question or the
  answer text — reviewers reference the run id only. This keeps annotations
  from becoming an unswept copy of retention-bound content.
- Data minimization: label + short note only. No source text, no ISW prose,
  no prompt content, no Ask user content, no email addresses beyond the
  reviewer FK.
- Migration mechanics (WHEN implemented): one new numbered forward migration
  on the then-current base carrying the table AND the append-only trigger;
  `drizzle/9999_claim_source_trigger.sql` keeps applying last and is never
  renumbered (ruling 5). NO migration number is claimed by this design —
  both this program and the queued conflict workstream defer numbering to
  the operator-selected integration base.

## 4. Admin surface

- Route: `/admin/adjudication` (queue list, filterable by subject_type) and
  `/admin/adjudication/[subjectKey]` (subject context + label form).
- RULING 21 (invariant-grade): every page calls `requireAdmin()` as the FIRST
  statement of the page component, before ANY query; the admin layout gate
  stays as defense in depth; both routes get rows in
  `src/integration/authz-page-gate.itest.ts`'s ROUTES table (bare GET +
  `RSC: 1` body assertions + accepted-admin positive control); the unit page
  tests mock `@/lib/gate` as a SPY and assert gate-before-first-query call
  order, exactly like the four existing gated pages.
- Subject context renders BNOW-side data only (claim/event text is BNOW
  output and may render to an admin; ISW prose and source full text never
  render — the reviewer follows the URL out if needed).
- Writes go through a server action that re-runs `requireAdmin()` itself
  (actions are separate entry points; the page gate does not cover them),
  validates subject_type/label against the versioned schema, and INSERTs.
  REQUIRED NEGATIVE PROOF for the write path (the ruling-21 itest only
  exercises GET bodies): a production-build test invoking the server action
  anonymously (Next-Action POST) asserting refusal with zero INSERTs, plus a
  unit spy asserting the action's own gate call precedes its INSERT — so a
  refactor to "the page already gates it" fails tests, not silently opens
  the corpus write path.
- OpenSanctions boundary for `entity_match_candidate`: subject context goes
  through the fail-closed `os-read.ts` read model with the admin-only neutral
  candidate-review presentation rules, and these annotations DO NOT
  constitute the "human-review workflow" prerequisite named by the
  OpenSanctions match-safety ruling — restoring any public sanctions/PEP
  assertion still requires stronger identifiers + product review + a NEW
  decision-log entry. Accumulated identity-confirmed annotations must never
  be cited as having satisfied that prerequisite.
- `map_miss` workability: adjudicating extraction misses requires reading the
  source document, which this surface deliberately does not render; when the
  outbound URL is dead the reviewer records `"unadjudicable"` rather than
  guessing (the label vocabularies carry that verdict for exactly this).
- No new nav entry outside the admin console; no sitemap/metadata exposure.

## 5. Export into the eval corpus (deliberate, never automatic)

- A read-only script `scripts/adjudication-export.ts` (no route) emits
  effective (non-superseded, resolved) labels as candidate STUBS — NOT
  complete `AnalysisEvalCase` objects. Field-by-field, a stub carries ONLY:
  `subjectType`, `subjectKey`, `label`, `labelSchemaVersion`,
  `provenance: "human-adjudicated:<annotation-id>"`, `annotatedAt`, and the
  identity hashes embedded in the key. It NEVER carries `raw_documents.content`,
  `claims.text`, event prose, ISW-derived content, or Ask user content — the
  eval corpus's binding content rules (no ISW prose, all persons FICTIONAL,
  no copied source full text) make a mechanical content join a rule
  violation by default, so the export is structurally incapable of it.
- Promotion is therefore an AUTHORING act, not a copy: a human writes
  README-compliant synthetic/paraphrased `input`/`reference`/`offline`
  content inspired by the adjudicated subject, keeps the stub's provenance
  string, and lands it as a normal dataset change (new datasetVersion; the
  control plane's datasetContentHash identity makes silent swaps
  impossible). The ONLY alternative path is an explicit, reviewed amendment
  to `docs/evals/analysis/README.md` defining a production-derived
  provenance class with its own legal/person rules BEFORE any such case
  lands — absent that amendment, production-derived content is refused.
- The export writes to STDOUT ONLY — no output-path parameter exists, so no
  flag or refactor can land its output inside `docs/evals/analysis/` (the
  promotion boundary is structural, not behavioral). It never touches gates
  and never marks anything held-out.
- Selection-bias caveat (stated so promotion reviewers weigh it): cases
  born from production adjudication are biased toward the CURRENT model's
  observed failures; a heldout split grown only this way becomes a moving
  target tuned to one candidate's weaknesses. Promotion reviewers assign
  split/partition deliberately, keeping heldout growth mixed with
  independently authored cases.

## 6. What this is NOT

- Not an entity-cleanup or entity-merge tool (propose-only rules 6/61 stand).
- Not a moderation surface for published digests (publication safety already
  owns that; a `publication_safety` annotation is input to a HUMAN follow-up).
- Not a second eval runner, result store, or adjudication mechanism competing
  with the control plane — it feeds the existing dataset contract only.
- Not implemented in this program: no migration, no routes, no code.

## 7. Adversarial review gate for the future implementation

A fresh reviewer must attack: authorization (both routes + the server action
including the anonymous Next-Action POST proof; RSC/redirect body leakage per
ruling 21's production-build itest), append-only history (the UPDATE/DELETE
trigger verified BY MUTATION on a disposable fork — attempt an UPDATE and
assert it raises; supersession fork/self-reference/cross-subject attempts
refused by the constraints; effective-label determinism under same-instant
inserts), accidental auto-application (no code path from annotations into
claims/events/entities/digests/registries), and source-text exposure (label
schemas closed-vocabulary-only, note caps, Ask-content note rule, export
stub output scanned for prose). Implementation must also add the
migration-idempotency proof on a disposable fork before any deploy.

## 8. Design review record (2026-08-17)

A fresh adversarial design review (authorization / append-only / auto-
application / prose-exposure / schema-contract lenses) returned FAIL on the
first revision with four MAJORs — each a case where the design stated a
guarantee without REQUIRING its mechanism — plus five MINORs and four NOTEs.
All were remediated in this revision as document-level requirements:

1. (MAJOR) Export/promotion vs the corpus content rules → the export now
   emits content-free candidate STUBS; promotion is an authoring act; a
   production-derived provenance class requires a prior README amendment.
2. (MAJOR) Append-only honor system → DB-enforced BEFORE UPDATE OR DELETE
   trigger required in the same migration (9999-trigger house precedent),
   mutation-proof in the gate.
3. (MAJOR) Supersession fork/self-reference/cross-subject/nondeterminism →
   partial unique index on supersedes_id, CHECK (supersedes_id <> id),
   composite same-subject FK, id-DESC effective-label authority, and the
   refuse-and-retry insert rule.
4. (MAJOR) Subject identity one-liner → the per-subject-type key-grammar
   table with scoped text hashes (ruling-12 template safety), validation-run
   content pins (upsert drift), guard-rewrite expectations (ruling 19), and
   the explicit `resolved:false` disposition.
5. (MINORs) anonymous server-action negative proof; closed-vocabulary label
   schemas with note as the only free text; Ask retention/dangling-content
   handling incl. the no-question-quoting note rule; stdout-only export;
   the OpenSanctions prerequisite disclaimer. (NOTEs) reviewer FK NO ACTION
   intent; `unadjudicable` verdicts; per-type schema-version namespace;
   heldout selection-bias caveat.

The focused re-review of the remediation returned **PASS-WITH-MINORS**:
every disposition verified as a genuine requirement (mechanisms named, DDL
specified, proofs demanded); the composite same-subject FK confirmed valid
PostgreSQL (targets the declared UNIQUE constraint, MATCH SIMPLE roots-free
semantics intended); the supersede race confirmed fully closed. Its two new
MINORs and three NOTEs were folded into this revision: the TRUNCATE trigger
(row triggers do not fire on TRUNCATE), the app-enforced dual-root refusal
rule with `multipleChains:true` export marking, `CREATE OR REPLACE TRIGGER`
idempotency, the inert-crafted-cycle wording, and the nullable-claim_date
key encoding. The design stands as the Worktree D reviewed-design
deliverable; implementation remains a separately authorized future program.
