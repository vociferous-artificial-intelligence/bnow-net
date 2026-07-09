CLAUDE.md — BNOW.NET

Read automatically at the start of every Claude Code session in this repo. It layers on
top of the global ~/CLAUDE.md; where the two differ, the rules here win for this
repository.

Source of truth

The persistent project brain is AGENTS.md (charter, architecture, current state,
decision log, conventions, operating protocol). Read it first, every session.

@AGENTS.md

Scoped exception: deletes, renames, and moves ARE permitted here

The global ~/CLAUDE.md forbids deletes/renames/moves by default and allows them only
where a repository-local CLAUDE.md grants a scoped exception. This file is that
exception. In this repository you may delete, rename, and move files whenever it yields
cleaner, higher-quality code — removing dead code, superseded scripts, obsolete fixtures,
stale docs; renaming for clarity; restructuring directories.

Prefer the change that leaves the tree in the best state, not merely the additive one. Do
not keep a worse structure alive just to avoid a delete.

Guardrails that still bind (these are the quality bar, not obstacles)


Atomic, small, test-covered diffs. npm test green before every deploy.
Migrations stay additive. Never edit or delete an applied migration; evolve
forward with a new one. This is a data-safety rule, not file hygiene — the exception
above does not lift it.
The AGENTS.md decision log is append-only. Correct a wrong entry with a new dated
entry; don't rewrite history.
Legal & schema invariants are absolute: no ISW prose or source full-text in any
user-facing output; every claim keeps ≥1 raw_document link; budget caps and the
truth-in-UI (hide stub/fixture data) policy hold.
No vendor branding in commits, files, PRs, or code comments.
When a delete/rename/move is non-trivial, state what and why in the commit, and update
the directory map in AGENTS.md if it moved.


Reflex before finishing

Self-review the diff adversarially (edge cases, secret leakage, claim-to-source,
rate-limit safety), then run the tests.

