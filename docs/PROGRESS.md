# PROGRESS — append-only heartbeat log

## 2026-07-04 12:50 — Session start / recon

- Verified toolchain: Node 24, pnpm-installed vercel CLI 46, docker.
- Neon API key valid. Vercel env token expired but CLI session (`go-vociferous`) works.
- ISW reachable; site redesigned — reports now at
  `understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-<date>/`.
  robots.txt allows research pages for `User-agent: *` (only wp-admin/wp-json disallowed);
  AI-branded UAs get 600s crawl-delay — we use a custom UA + ≥2s delay, compliant.
- LLM: no Anthropic key; OPENAI_API_KEY present → live provider under $25 cap.
- Original product brief missing → reconstructed docs/PRODUCT-BRIEF.md from prompt.

### Plan: block 1 (≤2h)
1. Foundation docs (brief, BLOCKERS, PROGRESS, AGENTS.md) + first commit.
2. Neon: create `bnow` database/project via API.
3. Next.js 15 scaffold (TS strict, Tailwind, shadcn/ui), Drizzle wired.
4. Initial schema migration (full data-model spine).
5. Health page + first Vercel deploy with env vars.
