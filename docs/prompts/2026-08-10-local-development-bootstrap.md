# BNOW.NET local-development bootstrap and operator handoff

**Prepared:** 2026-08-10\
**Repository:** `/Users/go/code/bnow-net`\
**Objective:** Make this checkout reliably usable for safe local development, install only what is actually missing, verify the app end to end, and return one clear list of operator actions that cannot be completed autonomously.

## Authority and safety

Read `AGENTS.md` completely before acting. Its legal, traceability, spend, migration, publication-safety, and page-level authorization rulings are binding.

You are authorized to inspect the local machine and repository, install missing local development dependencies, create or repair gitignored local configuration, link the checkout to the already-confirmed Vercel project, and run safe verification. You may use authenticated browser access to Vercel and Neon when their CLI/API surfaces cannot provide a required parameter.

Do not deploy, push, change production or preview environment variables, rotate/revoke credentials, run paid-provider calls, enable feature flags, run crons, seed or migrate a shared database, accept legal terms for an account, or make production writes. Do not create a cloud database branch or API key without explicit operator approval at action time. Never print, paste into chat, commit, or include secret values in a report; report variable names and set/missing state only.

The database URLs currently in `.env.local` reach the live Neon project. Treat them as read-only until a dedicated development branch is selected. Do not run `npm run db:migrate`, `scripts/seed.ts`, integration tests, sign-in flows, access-request submissions, Ask POSTs, or any other write-bearing action against those URLs.

## Known starting state (verify; do not assume forever)

- Actual checkout: `/Users/go/code/bnow-net` (`~/code/bnow.net` is an old path seen in some docs).
- Branch at preparation: `main` at `e66438b`, synchronized with `origin/main`, clean before the gitignored setup files below were added.
- Runtime: `fnm` is installed at `/opt/homebrew/bin/fnm`; Node `v24.19.0` is installed and satisfies Next.js 16's `>=20.9.0` requirement. Non-interactive Codex shells do not initialize `fnm`, so use `fnm exec --using=v24.19.0 <command>`. Do not reinstall Node merely because `node` is absent from that shell's `PATH`.
- Package manager: npm, with `package-lock.json`. `node_modules` is present and `npm ls --depth=0` passed. Install only if that integrity check fails or the lockfile changed; then use the lockfile-preserving npm command appropriate to the failure.
- Local Vercel link: `.vercel/project.json` points to team `vociferous` (`team_isV2el75K1nGaOLAbOwDnwdp`) and project `bnow-net` (`prj_WhAKF7cFodVORy1mrlpHk2jqUcmZ`). `.vercel/` is gitignored.
- Neon: project `bnow`, project id `crimson-wave-84127605`, organization `Vociferous.AI`, region `us-east-1`, Postgres 17. The signed-in Neon browser can access it. The main branch shown during preparation was `br-lively-haze-atvkarvn`.
- `.env.local` contains only `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_PROJECT_ID`; all three are set. `NEON_API_KEY` is absent. Do not reveal either database URL.
- `.env.development.local` exists and is gitignored. It intentionally sets localhost URL, a local-only Auth secret, `FEATURE_AUTH_GATE=false`, `SIGNIN_MODE=open`, `ANALYSIS_PROVIDER=stub`, and `LLM_DISABLE=1`. Never copy this file to Vercel.
- Vercel's connected project API is authenticated and confirmed the team/project. The in-app browser was not signed into Vercel during preparation. Attempts to bootstrap `vercel@latest` through `npx` hung without output; do not loop on that failure. Prefer the Vercel connector, an already-installed/authenticated CLI if one later exists, or the signed-in browser.
- The Neon browser was signed in. Account settings show the ability to create a personal API key, but no key was created because that is an operator-approved cloud credential action.
- Baseline on Node `v24.19.0`: typecheck PASS, lint PASS, unit tests PASS (`2,055/2,055`, 161 files).
- Local smoke passed with the safety env loaded: Next.js 16.2.10 ready on `http://localhost:3000`; `GET /` returned 200; `GET /health` returned 200 and rendered `DB OK`. No write route or paid-provider route was exercised.

## Execution sequence

1. Read `AGENTS.md`, `README.md`, `docs/CURRENT-STATE.md`, `docs/BLOCKERS.md`, `docs/HUMAN-SETUP-TODO.md`, `docs/SETUP-NEXT-WEEK.md`, `package.json`, `scripts/env.ts`, `scripts/test-integration.sh`, and `scripts/neon-branch.ts`.
2. Run `git status --short --branch`. Preserve all user changes. Do not edit tracked application code unless a genuine local-bootstrap defect requires it and the operator's request includes fixing it.
3. Verify the runtime with `fnm list` and `fnm exec --using=v24.19.0 node --version`. If the installed version still satisfies the repository and framework requirements, do not install another version.
4. Verify dependencies with `fnm exec --using=v24.19.0 npm ls --depth=0`. Only install when verification identifies a real missing/corrupt dependency. Do not add Vercel CLI to application dependencies; use it ephemerally or through the connected Vercel tooling.
5. Inspect env files by key name and set/missing state only. Compare keys used by the local development path, not every optional production integration. Keep local AI offline unless the operator explicitly authorizes paid testing with all required SpendGuard caps.
6. Confirm `.vercel/project.json` matches the identifiers above. If it is missing, recreate only that gitignored local link. Do not relink to a different team/project without operator direction.
7. Establish database safety before any write-bearing verification:
   - Preferred: after operator approval, create or select a persistent Neon development branch and place its pooled/unpooled URLs in gitignored local development configuration.
   - Integration tests: require a valid `NEON_API_KEY`; the repository runner creates a disposable copy-on-write branch and deletes it on exit.
   - Until a dev branch exists, permit only read-only smoke requests against the existing URLs.
8. If Vercel development variables are needed, query the connected Vercel tools first. Use the browser only for capabilities the connector lacks. Inventory names/scopes without revealing values. Do not overwrite `.env.local`; back it up, pull to a temporary gitignored file, and merge only the variables needed for local development.
9. Run the safe baseline gates:
   - `fnm exec --using=v24.19.0 npm run typecheck`
   - `fnm exec --using=v24.19.0 npm run lint`
   - `fnm exec --using=v24.19.0 npm test`
10. Start the app with `fnm exec --using=v24.19.0 npm run dev`. If port 3000 is occupied, use a documented alternate port. Verify readiness, then use the browser to check `/` and `/health`. Confirm HTTP 200, `DB OK`, and no immediate server/console errors. Do not submit forms or call write/paid routes during the shared-database smoke.
11. Run `npm run test:integration` only after `NEON_API_KEY` is valid and you have verified that the runner will create a disposable branch. Confirm cleanup; if cleanup fails, report the exact branch id for manual deletion.
12. Stop or clearly hand off any process you started. Leave the repository in a usable state and summarize any gitignored files created or changed.

## Required final report

Lead with the local-development result, then include:

- **Runtime:** installed/selected Node and how to invoke it.
- **Dependencies:** verified or installed, with exact command and result.
- **Linked project:** Vercel team/project and whether CLI/browser authentication is usable.
- **Database mode:** read-only shared main, persistent dev branch, or disposable integration branch.
- **Env keys:** counts and names of required-present, required-missing, and optional-deferred keys; never values.
- **Verification:** typecheck, lint, unit/integration counts, server start, `/`, and `/health`.
- **Changes made:** tracked and gitignored files separately.
- **Operator actions required:** one prioritized checklist containing only actions still needed. Each item must state where to act, the exact parameter/key or decision needed, why it is needed, whether it costs money or changes cloud state, and the verification command afterward.

At minimum, adjudicate these likely operator items rather than silently skipping them:

1. Initialize `fnm` in the operator's interactive shell (or document the `fnm exec` command) so `node`/`npm` work outside Codex.
2. Sign into Vercel in the chosen browser or refresh the local CLI/token if Development env inventory/pull is desired. The saved `VERCEL_TOKEN` is documented as expired; never echo a replacement.
3. Approve creation of a narrowly scoped Neon API key and place it as `NEON_API_KEY` in `.env.local` (and GitHub Actions only if CI integration tests are desired).
4. Approve/select a persistent Neon development branch before local write-bearing work; provide its pooled and unpooled connection URLs through a secret-safe handoff.
5. Decide whether local magic-link email or live AI/provider testing is actually required. Default is no: offline/stub local development is already functional. Any live AI test requires explicit spend authorization and every applicable cap.

Do not mix unrelated launch, Stripe, OpenSanctions licensing, procurement, or production deployment tasks into the local-development blocker list unless they directly block the requested local workflow.
