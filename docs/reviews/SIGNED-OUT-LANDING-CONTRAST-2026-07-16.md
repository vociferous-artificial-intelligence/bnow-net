# Signed-out landing contrast (#73) — 2026-07-16

Isolated presentation follow-up to the analyst-experience quick wins
(`docs/reviews/ANALYST-EXPERIENCE-QUICK-WINS-2026-07-16.md`). Branch
`codex/73-signed-out-landing-contrast`, from clean main `4e4743d`.

**Status: implemented and reviewed, NOT deployed.** Awaiting the operator's normal deploy
approval. Zero paid-provider calls; no schema, data, workflow, environment or application
behaviour change.

| | |
|---|---|
| Application commit | `40151b6` — `ui: fix signed-out landing contrast` |
| Files changed | `src/app/page.tsx`, `src/app/page.test.tsx` (+ this note and the docs below) |
| Tests | 1,576 / 135 files (from 1,566 / 135) — the ten new ones are all in `page.test.tsx` |

## What was wrong

The prior pass deliberately scoped itself to the signed-in home and the other analyst
surfaces, so the marketing branch of `src/app/page.tsx` kept bare gray utilities. The
failure is a *pairing* failure, not a "too light" one — each bare shade fails in exactly
the theme the other passes:

| Shade | On `#ffffff` | On `#0a0a0a` |
|---|---|---|
| gray-400 | **2.60:1** ✗ | 7.61:1 ✓ |
| gray-500 | 4.84:1 ✓ | **4.09:1** ✗ |
| gray-600 | 7.56:1 ✓ | 2.62:1 ✗ |
| **gray-600 + dark:gray-400** | **7.56:1** ✓ | **7.61:1** ✓ |

So a light-only fix silently reintroduces a dark failure, and vice versa — which is why
both halves are pinned by test at every site.

## What changed

Eight foregrounds in the signed-out branch move from a bare utility to
`text-gray-600 dark:text-gray-400`: hero subtitle (`home.sub`), collaborative-beta line
(`home.beta.line`), visitor-journey tertiary line, live-theater count (`home.live`), the
reliability / claims / scored feature-card bodies, and the Iran/Gulf body.

The diff is eight `className` strings. No copy, font size, spacing, layout, hover state,
CTA style, query, href, or signed-in rendering changed, and the `stats.activeTheaters > 0`
truth-in-UI conditional (ruling 3) is untouched.

**The private-beta badge was left alone on purpose.** It already carries
`text-gray-500 dark:text-gray-400` — 4.84:1 light / 7.61:1 dark, passing both — and #73 is
scoped to the *failing* unpaired text, not to every gray utility in the repo. A test now
pins the badge as-is so a later uniformity sweep can't churn it.

## Verification

**Gate:** 1,576/1,576 tests / 135 files, `typecheck`, `lint` and `next build` all green.
The `next-env.d.ts` path flip the build generates was reverted; the tree is clean.

**Browser: real Chrome 150 against a production build (`next build` + `next start`), never
`npm run dev`** — OPEN-TASKS #74 means dev-mode React does not hydrate on this box, so a
dev-server check would prove nothing.

Six passes — 1280×900, exactly 390×844, and 320×844 (WCAG 1.4.10 reflow), each in light
and dark. Per pass: 8/8 in-scope sites located and passing, 23 text elements swept with 0
failures, no page-level horizontal overflow (`scrollWidth == clientWidth` at every width),
no console or page errors, both CTAs and all 9 `main` hrefs identical across passes
(`/access` ×2, `/countries` ×2, `/countries/ir`, `/scoreboard` ×4), the hamburger still
toggling `aria-expanded` false→true at 390 and 320, and no signed-in surface (no `/ask`
form, no theater panel) leaking into the signed-out render.

**Worst measured in-scope pair: 7.56:1** (hero subtitle, light) — every in-scope site
measures 7.56:1 light / 7.61:1 dark.

### The measurements are from painted colour, and the checker was checked first

Ratios come from the browser resolving each element's `color` and alpha-compositing every
ancestor background, so a wrong class, an unexpected background or a translucent ancestor
cannot slip through. Tailwind v4 emits oklch and Chrome returns `lab(...)`; those strings
are **not** parsed as RGB (the mistake that produced the discarded first harness in the
prior pass). Each colour is rasterized through a 1×1 canvas so the browser performs the
exact sRGB conversion.

The harness is calibrated against offline oklch→sRGB→WCAG maths computed straight from the
palette this build ships (`node_modules/tailwindcss/theme.css`) before any number is
believed: **48/48 checks agree (8 shades × 6 passes, max drift 0.00)**, and the offline
maths independently reproduces the prior review's published table exactly. The passes also
assert the composited body background really is `#ffffff` / `#0a0a0a` rather than assuming
it, since the whole palette table rests on that.

### The tests can actually fail

The class assertions were mutation-tested, not just observed green: reverting the
Iran/Gulf body to bare `text-gray-500` failed both its pinned site assertion **and** the
sweep, and the suite returned to green on restore. Each site is located by the copy a
reader sees (via the real `en` dictionary) rather than a child index, so `getByText`/
`getByRole` throws if a string is renamed or dropped instead of passing vacuously; the
sweep additionally asserts an element floor and that ≥8 elements carry the pair before
concluding "nothing else fails". The sweep is token-level, not substring — `dark:text-gray-400`
contains `text-gray-400`, and a substring check would flag every correct pair.

## Notes / debt

- The sweep is scoped to the signed-out `main` by design. It does not sweep the global
  footer, legal pages or unrelated components — a repo-wide class test was explicitly out
  of scope, and the prior pass's lesson is that a sweep certifies only what it reads.
- Local-only tooling, no repo effect: the worktree's `node_modules` symlink into the
  primary checkout makes Turbopack fail (`points out of the filesystem root`), so it was
  replaced with a real install; `next build` needs `.env.local` and the
  `scripts/pin-dns.cjs` pin to fetch the Geist font on this WSL2 box. Both are gitignored.
