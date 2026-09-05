# Roadmap 09 — standing hygiene batch (opportunistic, never blocking)

Small debt items batched for idle slots. Each is an independent, individually-reviewed
commit; land any subset. None may change product behavior beyond its stated scope. Verify
each item's OPEN-TASKS entry is still open before starting it.

## Items

1. **#69 GramJS CastError noise.** Follow the existing handoff
   `docs/prompts/2026-07-16-gramjs-casterror.md`: find the bundled peer-construction
   path, preserve exact 64-bit identifiers/access hashes, production-shaped regression
   coverage, prove the Vercel error stream clean. Do NOT blanket-suppress
   `console.error` — real GramJS errors must stay visible.
2. **#80 stale unpooled DSN.** Operator re-pulls `DATABASE_URL_UNPOOLED` from the Neon
   console; verify scripts prefer it again (empty-override fallback already handled).
3. **#44 X cap comment reconciliation.** Align the `x-api.ts` code default/comment with
   the actual production `X_DAILY_USD_CAP` so the ledger reads honestly. Comment/docs
   change; no cap value change without operator direction.
4. **#72 buyer-profile label i18n.** Move `PROFILES` labels/descriptions to
   `digest.profile.<key>.*` catalog keys across visible catalogs; the `?profile=` query
   value must NOT change; watch the namespace-coverage test.
5. **#60 dead nav i18n keys.** Remove `nav.group.product` + the six unused `nav.item.*`
   keys across all 7 catalogs; do not drop the last key of a required namespace.
6. **#55 /search nav entry.** Operator decision first (has the surface proven itself?);
   if yes, add `nav.item.search` honoring the frozen-URL + all-locale-label invariants.
7. **#71 evidence-trail card layout below `sm`.** Convert the min-width table to stacked
   cards (source + platform badge, published, title link, reliability); keep the tested
   no-page-overflow guarantee at 390px and 320px.
8. **#49 digest cron slot qualifier.** The parked one-liner (`group ?? slot ?? mode`) +
   a test, if touched files overlap anyway.
9. **#20/#59/#64 i18n native-review inventory refresh.** No translations here — just
   reconcile `UK-NATIVE-REVIEW-2026-07-12.md`'s inventory with the strings that roadmaps
   03/07 added, so the pre-market-launch gate list is accurate.

## Rules

Standard gates per commit (diff-check, typecheck, lint, targeted + full unit tests).
Browser verification against a production build, not the dev server (#74: dev-mode
hydration is broken on the operator's box — a dev-server click test proves nothing).
One fresh reviewer per batch of landed items. No migrations. No paid calls. Update each
OPEN-TASKS entry in place with evidence.

Status: list per item — `done / <commit>`, `skipped / <reason>`, or `blocked`.
