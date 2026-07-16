# Open-task research audit — 2026-07-16

Scope: #19, #42, #45, #54, #56, #69. Read-only database/code/package inspection plus the
separate authenticated #65 browser proof. No application source, production data, provider
state, workflow, environment, or deployment was changed.

## #19 and #42 — corpus and citation concentration

Completed-day window: 2026-07-09 through 2026-07-15.

Iran military map input is no longer as thin as the July 1–5 snapshot: 5,537 distinct
military documents produced map claims, including 1,100 non-X documents (600 Telegram web,
485 RSS, 15 MTProto). However, X still supplied 4,437 documents, or **80.1%** of the eligible
military corpus.

The reduced/published evidence is more concentrated than the input:

| Theater | X share of claim→document links | Next largest adapters |
| --- | ---: | --- |
| Iran | **73.1%** (612 links) | RSS 15.9%; Telegram web 10.8%; MTProto 0.2% |
| Russia | **36.9%** (268) | Telegram web 30.7%; MTProto 17.4%; RSS 13.2% |
| Ukraine | **31.5%** (68) | MTProto 22.7%; Telegram web 19.4%; GDELT 17.1% |

Across all three theaters, 948 X evidence links came from 131 source identities. Account
concentration within X is moderate (top 1 = 6.3%, top 5 = 22.6%, top 10 = 37.1%, HHI
0.0217); the larger risk is **platform dependence**, especially Iran, rather than one X
account monopolizing the evidence. The leading X identities were Iran International EN
(60 links), Mario Nawfal (51), OSINT613 (36), Iran International Persian (34), and
IranIntlBrk (33).

Conclusion: keep both tasks open. #19's old “2–9 non-X docs/day” evidence is superseded,
but the problem is not solved: Iran has more non-X input now, yet it converts into only
26.9% of cited evidence. The next research should compare map eligibility → ranked claim
groups → final cited evidence by adapter and source, then distinguish a lexicon/yield issue
from a reduce-ranking issue before adding feeds blindly.

## #45 — metric truthfulness

Resolved at the product boundary. `scoreDigest*` names the value `thinSourcedRate`, its
comments define the exact proxy, the scoreboard UI and translations say “thin-sourced,”
and tests pin that copy. The persisted column remains `unsupported_claim_rate` as a legacy
internal schema name; renaming it would require a migration without changing semantics and
is not justified by itself.

Production has 67 validation runs; the legacy column's mean is 0.3825. This value must
continue to be described as the share of claims with fewer than two supporting documents
and hedging `claimed|unverified`, never as a literal hallucination or zero-source rate.
True independent-source corroboration and source calibration remain separate future
dimensions (#14).

## #54 — digest links

Resolved in current code. Both `src/app/ask/actions.ts` and `src/app/search/page.tsx` select
`dg.digest_date` through the owning `digest_id` and use it for the deep link. Tests cover
the resolver behavior. Production recount: 1,263 claims, zero rows where `claim_date` differs
from owning `digest_date`; one legacy claim has no digest and therefore correctly receives
no digest deep link.

## #56 — social source segmentation

The task is partly stale and partly severe:

- Telegram is already segmented: 3,333 `t.me/<channel>` sources, 179,258 citations, zero
  `t.me` root sources.
- X is already segmented: 2,703 `x.com/<account>` sources, 46,595 citations, zero `x.com`
  root sources.
- Facebook is not segmented: one `facebook.com` source pools **26,195 citations across
  7,081 distinct raw URLs**.

All 26,195 Facebook citations have path data. The first path segment provides a direct page
identity for most rows: `GeneralStaff.ua` alone accounts for 21,073 citations. At least
1,977 citations use non-identity routes such as `watch`, `share`, `reel`, `permalink.php`,
`story.php`, `groups`, or `pages`; those require URL-shape-specific extraction, query-id
recovery, or a fail-closed unresolved bucket. Never invent a page identity from a share ID.

This blocks #14 calibration because a platform-wide historical mean is not a source score.
It also requires a controlled forward migration: inserting page sources, repointing
`source_citations`, recomputing theater/global aggregates, preserving raw URLs, and deleting
the root only after the count reconciles exactly.

## #69 — GramJS error-stream noise

Fresh 24-hour production evidence: 24/24 scheduled MTProto runs finished successfully,
1,251 documents were inserted, 960 channel selections ran, and recorded channel errors were
zero. All 145 cached channel rows have `last_error IS NULL`.

Package inspection:

- installed and current npm version: `telegram` 2.26.22;
- adapter reconstructs `Api.InputPeerChannel` with `big-integer` values parsed from text,
  preserving 64-bit identifiers;
- local construction and serialization with production-shaped signed 64-bit values did not
  reproduce a `CastError`;
- GramJS's generated TL validator logs type mismatches through `console.error` and then
  continues serialization, which matches the non-fatal production symptom.

The exact cause therefore remains unproven. A coding fix must first capture the offending
value type/class at the narrow peer construction/invocation boundary in production-shaped
tests or a controlled live run. Do not globally wrap or suppress `console.error`; that would
hide genuine Telegram failures. The handoff requires a zero-noise Vercel proof after the
targeted change while retaining real errors.

## #65 — authenticated 390px proof

Closed by live operator-authorized proof. A new production magic link was delivered to the
standing test inbox at 2026-07-16 13:08Z; Gmail showed DKIM, SPF, and DMARC pass. The same
single-use link authenticated successfully.

At an exact 390×844 CSS viewport, the signed-in home had `clientWidth == scrollWidth == 390`.
The header/drawer, quick links, all three theater cards, Ask control, recent question,
validation tiles, and footer were visually inspected. The mobile drawer showed the account
identity, Account, Sign out, all navigation groups, and language options without horizontal
overflow. The account was signed out and the temporary Chrome profile removed.
