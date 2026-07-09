# CLAUDE.md — BNOW.NET

Layers on the global `~/CLAUDE.md`; where the two differ, this file wins for this repo.
The persistent project brain — charter, verified snapshot, standing rulings, decision
log — is AGENTS.md, imported here:

@AGENTS.md

## Scoped exception: deletes, renames, and moves ARE permitted here

The global `~/CLAUDE.md` forbids deletes/renames/moves unless a repository-local
CLAUDE.md grants a scoped exception. This file is that exception: delete, rename, and
move freely whenever it leaves the tree in a better state — dead code, superseded
scripts, obsolete fixtures, stale docs, clarity renames. Do not keep a worse structure
alive just to avoid a delete. Two carve-outs the exception does NOT lift: applied
migrations stay additive (AGENTS.md ruling 5) and the decision log stays append-only
(AGENTS.md maintenance rule). When a delete/rename is non-trivial, say what and why in
the commit, and fix the AGENTS.md directory map if anything moved.

All other guardrails — legal/traceability/truth-in-UI invariants, fail-closed spend
caps — are owned by AGENTS.md § Standing rulings; they are not restated here.

## Commands & setup

Once per clone: `npm install`, then `git config core.hooksPath .githooks` (the enforced
pre-push gate: typecheck + lint + test). Local scripts read `.env.local` (mirror prod
vars there when you add them to Vercel).

- All unit tests: `npm test` (vitest run, ~3s)
- One test file: `npx vitest run src/path/to/file.test.ts`
- Typecheck: `npm run typecheck` · Lint: `npm run lint` · Dev server: `npm run dev`
- Integration tests (disposable Neon branch, fork→test→delete): `npm run test:integration`
- Migrations: `npm run db:generate`, apply with `npm run db:migrate`
- Deploy: `npx vercel@latest deploy --prod --yes` (machine CLI session — `VERCEL_TOKEN`
  is expired; deployment URLs are SSO-walled, check https://bnow-net.vercel.app)
- Local LLM/Vercel calls on this WSL2 box need the DNS pin:
  `NODE_OPTIONS="--require ./scripts/pin-dns.cjs" npx tsx scripts/<script>.ts`
  — use it for single-call LLM debugging; bulk LLM work runs via the deployed Vercel
  routes (prod env + metering). Slow/flaky github.com DNS: give git ~30s+ or retry.

## Commit hygiene

`area: imperative summary`, small and atomic, main always builds. Commits, PRs, code
comments, and file contents carry NO vendor branding: no `Co-Authored-By` trailers, no
"Generated with" lines, no model or vendor names. Write commit messages plain.

## Before finishing

Self-review the diff adversarially (edge cases, secret leakage, claim-to-source,
rate-limit safety), then run the tests — green before every commit and deploy.
