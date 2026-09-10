# A17 — Funnel instrumentation spec & implementation

**Phase:** 6 Launch · **Owner:** AGENT · **Depends on:** A13 (routes), A11 §8 (KPIs), the
analytics stack and consent posture in the repo · **Feeds:** O7, A19 · **Budget:** branch
work; no new paid services without operator approval.

(Prepend `COMMON.md`. Fill placeholders.)

## Objective

Make the funnel measurable before launch so that A19 can tell which message, page or step is
failing — with a consent posture that matches the product's privacy notice.

## Inputs

- Analytics library and config already in the repo (or none); privacy notice and consent
  implementation; `A13` route list; `A11` §8 KPIs; access/approval flow code; email
  provider events; server logs available.

## Method

1. **Funnel definition** — the stages, each with the exact event that marks it:
   visit → key proof page viewed → request/sign-up started → submitted → approved/activated
   → first sign-in → first core action (define it for this product) → return in week 2 →
   week 4 retention → (if paid) checkout started/completed. Add segment and source
   properties (UTM, referrer, locale, device).
2. **Event schema** — table: event name, when fired, properties, PII posture (none by
   default), server- vs client-side, consent requirement.
3. **Consent** — what fires with no consent (server-side counts only), what requires opt-in,
   how the notice describes it; update copy if needed (coordinate with A15).
4. **Dashboards** — the funnel view, the weekly cohort view, top pages by proof-page views,
   message test view (if variants), plus the three numbers that go into A19 every month.
5. **Implementation** on a branch: events wired, a test that each fires, a manual
   verification log with timestamps showing events arriving in the tool, and the dashboard
   links or definitions.
6. **Baseline** — record current numbers for the last 30 days (or "no data") so launch has a
   before.

## Output — `<<OUT>>/6-launch/A17-instrumentation-<<DATE>>.md` (+ branch)

COMMON header (Status: SYNTHESIS). Sections 1–6 · Verification log · Sources.

## Done when

Every funnel stage has a firing event verified in the tool; consent posture is documented
and consistent with the notice; dashboards exist; a baseline is recorded.

## Do not

- Do not collect PII in events; identify users only after sign-in and only if the notice
  allows.
- Do not add a paid analytics tier without an operator decision.
