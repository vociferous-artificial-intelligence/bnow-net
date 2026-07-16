# Coding-agent handoff — #73 signed-out landing contrast

Recommended model: **Claude Opus 4.8**
Effort: **medium**

## Starting point

Worktree: `/home/go/code/bnow.net-73-landing-contrast`

Branch: `codex/73-signed-out-landing-contrast`

Baseline: clean main `4e4743d`. The analyst-experience quick wins are live in production as
`dpl_CdoLhjeyxab4mvZXzN9Vjq8U7pNC`; 1,566 unit tests / 135 files, typecheck, lint, build, and the
production smoke are green. Read `AGENTS.md`, OPEN-TASKS #73, and
`docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md` before editing.

This is a small presentation-only follow-up. Do not deploy. Do not make paid-provider calls.

## Problem

The prior contrast pass deliberately covered the signed-in home and other analyst surfaces, but
not the signed-out marketing branch in `src/app/page.tsx`. Meaningful marketing text still uses
bare `text-gray-500` or `text-gray-400`:

- hero subtitle;
- collaborative-beta line;
- visitor journey tertiary line;
- live-theater count;
- three feature-card bodies;
- Iran/Gulf card body.

Measured against the shipped Tailwind v4 oklch palette and real backgrounds:

- `text-gray-400` on white is 2.60:1 and fails;
- `text-gray-500` on the near-black dark background is 4.09:1 and fails;
- `text-gray-600 dark:text-gray-400` is 7.56:1 light / 7.61:1 dark and passes.

The private-beta badge already uses the paired `text-gray-500 dark:text-gray-400`; do not change
it merely for uniformity. Scope is the known failing unpaired text, not every gray utility in the
repository.

## Allowed files

- `src/app/page.tsx`
- `src/app/page.test.tsx`
- `docs/OPEN-TASKS.md`, `docs/PROGRESS.md`, and a focused review note only as needed to record the
  implementation accurately
- `AGENTS.md` only if its standing snapshot genuinely changes; keep it under approximately 300
  lines and obey the verbatim decision-log archive rule

Do not touch the global footer, legal documents, the legacy `language-selector.tsx`, signed-in
home components, navigation, catalogs, route hrefs, queries, authentication, analytics, database,
ingestion, analysis, validation, provider/spend code, environment files, Vercel configuration, or
`.github/` workflows.

## Implementation

In the signed-out branch of `src/app/page.tsx`, change only these bare utilities:

1. `home.sub`: `text-gray-500` → `text-gray-600 dark:text-gray-400`.
2. `home.beta.line`: same paired replacement.
3. Visitor journey tertiary line: `text-gray-400` → the paired replacement.
4. `home.live`: same paired replacement.
5. Reliability feature body: bare gray-500 → the paired replacement.
6. Claims feature body: bare gray-500 → the paired replacement.
7. Scored/validation feature body: bare gray-500 → the paired replacement.
8. Iran/Gulf body: bare gray-500 → the paired replacement.

Do not change copy, font sizes, spacing, layout, link hover states, CTA styles, the badge, data
queries, signed-in rendering, or conditional truth-in-UI behavior. Do not introduce a helper or a
global CSS override for eight static class corrections unless there is a concrete, demonstrated
benefit; direct explicit classes are easiest to audit here.

## Tests

Update the signed-out page tests so the correction cannot regress silently:

- replace comments saying the marketing branch is “untouched” with accurate scope language;
- render the signed-out home using the existing mocks and assert that each of the eight meaningful
  text sites carries both `text-gray-600` and `dark:text-gray-400`;
- prove the sweep is non-vacuous: the expected marketing strings/elements must exist before their
  classes are checked;
- assert there is no meaningful signed-out marketing foreground left with a bare `text-gray-400`
  or an unpaired `text-gray-500` in the in-scope main content;
- do not write a repository-wide class test that sweeps the footer, legal pages, or unrelated
  components;
- retain the signed-in regression proving marketing hero/feature content is absent there;
- retain all no-Ask/no-paid-pipeline and Iran-card href assertions.

Prefer semantic text/role queries tied to the real English dictionary over brittle child indexes.
If a compact selector sweep is used, first assert the expected count and named elements so it
cannot pass vacuously.

## Browser verification

OPEN-TASKS #74 applies on this WSL2 box: `npm run dev` server-renders but React does not hydrate.
Verify against `next build` + `next start`, not the dev server.

Use real Chrome and check the signed-out `/` page at:

- 1280×900 light and dark;
- exactly 390×844 light and dark;
- 320 CSS px reflow or 200% zoom equivalent.

For every in-scope foreground, verify computed/painted contrast against its actual composited
background. Tailwind v4 emits oklch and Chrome may return `lab(...)`; do not parse those strings as
RGB. Use the already proven approach: rasterize the resolved color through a 1×1 canvas, composite
ancestor backgrounds including alpha, and calibrate the checker against known palette ratios
before trusting it. Record the worst measured in-scope pair.

Also verify:

- zero page-level horizontal overflow;
- no console or page errors;
- both CTAs and every route href are unchanged;
- the mobile menu still opens;
- signed-out content remains signed-out-only;
- the badge remains restrained and unchanged.

## Required gate

Run:

1. targeted `src/app/page.test.tsx` tests;
2. `npm test`;
3. `npm run typecheck`;
4. `npm run lint`;
5. `npm run build`;
6. the production-build Chrome matrix above.

Revert any generated `next-env.d.ts` path flip before committing. The working tree must finish
clean.

## Commit and handoff

Use one focused application commit, for example:

`ui: fix signed-out landing contrast`

A second documentation-only commit is acceptable if it materially improves the implementation
record. Do not mark #73 closed or claim it live before deployment; record it as implemented,
reviewed, and awaiting the operator's normal deploy approval. Report exact test/browser counts,
measured ratios, changed files, commit SHA(s), and confirm zero paid calls and no deployment.

## Acceptance criteria

- All eight known signed-out marketing foregrounds meet at least 4.5:1 in both themes on their
  actual backgrounds.
- No in-scope meaningful marketing text uses bare gray-400 or unpaired gray-500.
- The signed-in home, copy, layout, routes, data behavior, and badge are unchanged.
- Tests are non-vacuous and pin both light and dark class halves.
- Full local gate and production-build Chrome verification are green.
- Scope contains no application behavior, provider/spend, workflow, environment, schema, or data
  change.
- Branch is committed and clean but not deployed.
