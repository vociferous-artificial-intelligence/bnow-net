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
`{ verdict: "confirmed_miss" | "not_a_miss" | "unclear", lane?: ... }`), with
`label_schema_version` persisted per row so old labels never get reinterpreted.

## 3. Storage — additive forward migration (deferred)

A durable table IS genuinely necessary (labels must survive digest
regeneration and eval reruns), so the design is one append-only table:

```sql
CREATE TABLE eval_annotations (
  id            serial PRIMARY KEY,
  subject_type  text NOT NULL,          -- bounded enum, app-validated
  subject_key   text NOT NULL,          -- typed composite key, e.g. "validation_run:411:takeaway:3"
  label         jsonb NOT NULL,         -- structured, per-type schema
  label_schema_version text NOT NULL,
  reviewer_id   text NOT NULL REFERENCES users(id),
  note          varchar(500),           -- concise; NEVER source full text or ISW prose
  supersedes_id integer REFERENCES eval_annotations(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eval_annotations_subject_idx ON eval_annotations (subject_type, subject_key);
CREATE INDEX eval_annotations_supersedes_idx ON eval_annotations (supersedes_id);
```

Rules:

- APPEND-ONLY: the application performs INSERTs only — corrections insert a
  new row with `supersedes_id` pointing at the superseded one; the effective
  label for a subject is the newest non-superseded row. No UPDATE/DELETE path
  exists in application code; history is never rewritten.
- `subject_key` is a typed string (not an FK) because subjects span
  heterogeneous tables AND because claims/events are deleted+reinserted on
  digest regeneration — an FK would cascade away human work. The key embeds
  enough identity to re-resolve (ids plus, for regeneration-fragile subjects,
  the claim text hash — the same text-is-truth convention the Ask eval set
  uses for exactly this reason).
- Data minimization: label + short note only. No source text, no ISW prose,
  no prompt content, no email addresses beyond the reviewer FK.
- Migration mechanics (WHEN implemented): one new numbered forward migration
  on the then-current base; `drizzle/9999_claim_source_trigger.sql` keeps
  applying last and is never renumbered (ruling 5). NO migration number is
  claimed by this design — both this program and the queued conflict
  workstream defer numbering to the operator-selected integration base.

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
- No new nav entry outside the admin console; no sitemap/metadata exposure.

## 5. Export into the eval corpus (deliberate, never automatic)

- A read-only script `scripts/adjudication-export.ts` (no route) emits
  effective (non-superseded) labels as `AnalysisEvalCase`-SHAPED candidate
  JSON: `provenance: "human-adjudicated:<annotation-id>"`, `split` label
  ABSENT — promotion into `development` or `heldout` (and into any released
  dataset version) is a separate human edit of the dataset file, reviewed
  like any dataset change (a new datasetVersion; the control plane's
  datasetContentHash identity makes silent swaps impossible).
- The export never writes into `docs/evals/analysis/`, never touches gates,
  and never marks anything held-out itself. Model-generated or
  model-assisted candidates remain provisional until a human confirms them —
  these are human-authored by construction, but the promotion step is still
  the moment of corpus responsibility.

## 6. What this is NOT

- Not an entity-cleanup or entity-merge tool (propose-only rules 6/61 stand).
- Not a moderation surface for published digests (publication safety already
  owns that; a `publication_safety` annotation is input to a HUMAN follow-up).
- Not a second eval runner, result store, or adjudication mechanism competing
  with the control plane — it feeds the existing dataset contract only.
- Not implemented in this program: no migration, no routes, no code.

## 7. Adversarial review gate for the future implementation

A fresh reviewer must attack: authorization (both routes + the server action;
RSC/redirect body leakage per ruling 21's production-build itest), append-only
history (no UPDATE/DELETE path; supersession cannot orphan or cycle —
`supersedes_id` must point at an existing row of the SAME subject_key, and the
effective-label query must be deterministic), accidental auto-application (no
code path from annotations into claims/events/entities/digests/registries),
and source-text exposure (label schemas + note caps + export output scanned
for prose). Implementation must also add the migration-idempotency proof on a
disposable fork before any deploy.
