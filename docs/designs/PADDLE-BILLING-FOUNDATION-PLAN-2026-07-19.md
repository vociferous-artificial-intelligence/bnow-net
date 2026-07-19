# Paddle billing foundation — implementation plan

**Status:** proposed architecture and engineering handoff; no application code or Paddle account
state has been changed.
**Prepared:** 2026-07-19
**Scope:** Paddle Billing foundations for self-service individuals and sales-assisted businesses.
**Not yet authorized:** opening public checkout, publishing final prices, charging a card, issuing
an invoice, changing production access, or replacing the private-beta gate.

## 1. Recommended outcome

Use Paddle Billing as the billing provider and Merchant of Record, but put it behind a
provider-neutral internal billing and entitlement layer. Model every paying relationship as an
**organization account**:

- A person buying for themselves gets an organization of kind `individual` with one owner.
- A company, desk, NGO, or government buyer gets an organization of kind `business` with one or
  more members and separate owner/billing-admin roles.
- Paddle owns payment collection, tax calculation/remittance for supported transactions, invoices,
  payment-method management, and buyer-facing billing documents.
- BNOW owns identities, organization membership, plan semantics, feature entitlements, access
  policy, usage limits, and the audit trail explaining why access was granted.

Paddle webhooks are the authority for Paddle lifecycle state. BNOW's local entitlement store is
the authority for application access. A checkout redirect, browser callback, customer email, or
live Paddle API call must never grant access by itself.

### 1.1 Central integration principle — payment does not propagate through the application

**Paddle events asynchronously update a local access projection in Neon. Application entry
points make one provider-free authorization decision from that projection, then pass an
already-authorized context downstream.** Entitlement logic touches only externally callable paid
operations — never internal application pipelines. Concretely:

- there is **no payment/auth browser parameter** of any kind;
- there is **no Paddle API request during normal content access** — the request path reads the
  local projection only;
- there are **no repeated billing checks inside retrieval, reranking, generation, rendering, or
  persistence** — internal code receives approved limits and organization context as plain data
  (§8.1) and never imports the billing or entitlement modules;
- **no plan, tier, price, organization, or payment state is ever trusted from the client.**

Entitlements are not "an authenticated user must be paid." Authentication and paid authorization
stay separate concepts: a canceled or lapsed user still authenticates normally to reach their
account, invoices, renewal, the billing portal, legal documents, sign-out, and support (§8.2,
§8.6) — they lose paid product execution, nothing else.

This shape supports today's per-organization strategy while allowing a person to purchase without
inventing seat-based pricing. It also keeps an eventual second payment provider possible without a
second entitlement rewrite.

## 2. Phase-zero go/no-go gates

Do these before application implementation. They can run in parallel except where noted.

### 2.1 Obtain written Paddle product approval

BNOW should submit a precise description and representative screenshots to Paddle before investing
in the integration:

- subscription SaaS for source-grounded OSINT monitoring and research;
- no sale of source full text, no unauthorized access, no surveillance tooling, and no personal
  data brokerage;
- named-person and entity views are evidence-linked research outputs, not automated eligibility,
  employment, credit, insurance, or policing decisions;
- coverage includes conflict, sanctions, Russia, Ukraine, and Iran, while buyers in Paddle-blocked
  locations will not be able to transact;
- optional analyst support is ancillary to the software, not a pure consulting product.

This is a real gate. Paddle's current acceptable-use guidance flags some automated categorization
of people and pure human-services offerings, while its supported-country policy blocks buyers in
several countries BNOW covers. Product coverage and buyer location are different, but Paddle should
confirm the model in writing. Do not treat sandbox access as production approval.

Exit criterion: Paddle confirms that BNOW's described product can use Checkout and, separately,
Paddle Invoicing. Save the approval in the operator records.

### 2.2 Approve unit economics

The public Paddle terms currently list a standard Checkout discount of 5% + $0.50 and bank-transfer
invoicing at 3.5%; negotiated terms may differ and can change. At those published rates, the fee is
approximately $20.50 on $400, $150.50 on $3,000, and $990.50 on $19,800 through Checkout. Confirm
that this is acceptable before publishing the existing price sketch, and compare the effective
rate for the expected checkout/invoice mix.

Exit criterion: a dated finance decision records accepted Paddle terms, expected gross-to-net
revenue by offer, refund exposure, payout currency, and reconciliation owner.

### 2.3 Freeze launch packaging

The repository currently seeds `standby` at $400/month, `full_monthly` at $3,000/month, and
`full_annual` at $19,800/year. The business plan instead describes Standby, Professional, and
Enterprise organization licenses, and OPEN-TASKS #12 says regional-bundle packaging is unresolved.
Do not encode that mismatch into the Paddle catalog.

Decide:

1. Whether an individual may buy the existing Standby offer as an organization-of-one, or whether
   a distinct individual product and price is required.
2. Whether Professional self-service is a single all-live-theaters package or a base plan plus
   regional modules.
3. Which offers are monthly, annual, sales-assisted only, or unavailable at launch.
4. Whether trials exist. Recommendation: no automatic trial in v1; use explicit beta/manual grants
   until trial conversion and abuse policy are defined.
5. Whether annual pricing is displayed as a billed annual total or monthly equivalent, and the exact
   renewal/cancellation copy.
6. The past-due grace period. Recommendation: seven days of full access with a billing warning,
   followed by a restricted/read-only state; enterprise invoice terms follow the signed order.

Exit criterion: one catalog matrix names every launch offer, buyer type, billing interval, base
currency, tax presentation, included theaters/features, usage limits, collection mode, and whether
the offer is public.

### 2.4 Legal and privacy review

Before live checkout, revise the Terms and Privacy Notice to identify Paddle's role, describe the
billing data shared with Paddle, explain renewal and cancellation, link the applicable buyer terms
and refund policy, and distinguish BNOW license terms from Paddle's transaction terms. Confirm the
Data Sharing Addendum, subprocessor treatment, record retention, chargeback handling, sanctions
screening, and whether enterprise order forms override product defaults.

Merchant-of-Record coverage reduces sales-tax operations for supported Paddle transactions; it
does not remove BNOW's corporate accounting, revenue recognition, income-tax, sanctions, export,
or contract-review duties.

## 3. Repository audit and required corrections

| Current condition | Consequence | Planned correction |
|---|---|---|
| `plans` and `subscriptions` contain Stripe-named columns | Provider concerns leak into the domain model | Add provider-neutral billing tables; deprecate Stripe-specific columns after consumers move |
| `subscriptions.user_id` makes one user the billing owner | Cannot represent a company, shared desk, or billing administrator cleanly | Make an organization the subscription subject; users join through memberships |
| `users.role` is `user/analyst/admin` | A paid plan could be accidentally conflated with staff/product privileges | Keep role and entitlement separate; payment never promotes a user role |
| `requireAcceptedUser()` checks authentication + current legal acceptance only | It is not a paid entitlement gate | Add a central entitlement decision after beta grants are seeded |
| Private beta uses active subscription rows for account display and digest recipients | Existing beta users could be cut off during migration | Convert these to explicit `beta` access grants before enforcing billing |
| `/pricing` redirects to `/access`; `FEATURE_STRIPE` controls account wording | No public purchase path exists, which is currently correct | Introduce provider-neutral billing flags; restore pricing only at the launch gate |
| `subscribe_intents` is an access request, not a subscription | Approval could be mistaken for payment | Preserve the distinction; requests may seed a sales lead, never an entitlement |
| Digest email recipients join directly to `subscriptions` | Email access semantics can drift from web access | Select recipients from the same entitlement service/policy snapshot |
| Privacy/Terms anticipate future checkout generically | Paddle-specific disclosures are absent | Version policies before live checkout and require current acceptance |

No applied migration may be edited. All schema work must be forward-only, with
`drizzle/9999_claim_source_trigger.sql` still applied last.

## 4. Target architecture

```text
 Signed-in user + current legal acceptance
                   |
                   v
 organization + membership -----> internal catalog / approved offer
                   |                           |
                   v                           v
        checkout attempt ---- server creates Paddle transaction
                   |             with opaque internal custom_data
                   v                           |
          Paddle Checkout <--------------------+
                   |
                   | browser completion = "payment processing" only
                   v
          verified webhook inbox --dedupe/order--> subscription cache
                   |                                  |
                   |                                  v
                   +--------------------------> entitlement grants
                                                      |
                                                      v
                           page + action + API + email access decisions

 Customer portal link: authenticated billing admin -> short-lived Paddle portal session
 Reconciliation: scheduled job -> Paddle API -> repair local cache/grants + alert on drift
```

The normal product request path reads Neon only. A Paddle outage must not take down sign-in,
content access, or account rendering for users whose last known entitlement remains valid.

## 5. Domain model

Use additive Drizzle tables. Names can be adjusted during implementation, but keep the boundaries.

### 5.1 Organizations and membership

`organizations`

- `id` UUID/text primary key
- `kind`: `individual | business`
- `name`
- `status`: `active | suspended | closed`
- `created_at`, `updated_at`

`organization_memberships`

- `organization_id`, `user_id` unique pair
- `role`: `owner | billing_admin | member`
- `status`: `invited | active | removed`
- `created_at`, `accepted_at`, `removed_at`

Rules:

- An individual organization has exactly one active owner in v1.
- Only an owner or billing admin may start checkout or create a portal session.
- Membership does not imply current paid entitlement.
- `users.role` remains the independent product/staff role. Admin bypass, if retained, is explicit
  and test-covered rather than inferred from billing.
- Business invitations are a separate authenticated flow; never grant membership by matching an
  unverified email from a Paddle event.

### 5.2 Internal catalog

Keep product meaning internal and provider IDs external.

`billing_offers`

- stable `code` such as `standby` or `professional`
- display name, audience, active/public flags
- service level and internal catalog version
- no provider-specific ID

`billing_prices`

- `offer_code`
- `provider`: initially `paddle`
- `environment`: `sandbox | production`
- external product ID and price ID
- interval/frequency, currency, canonical amount, active/effective dates
- unique `(provider, environment, external_price_id)`
- unique active row for an internal offer/interval/environment

`offer_entitlements`

- `offer_code`, `feature_key`
- optional scope and limit JSON (for example theater set, Ask daily limit, history days)
- catalog version/effective dates

Do not authorize from a client-supplied Paddle price ID. The server accepts an internal offer code,
then resolves exactly one active price for the configured environment. Marketing pages should use
Paddle price previews for localized display; the local canonical amount is a catalog-drift check,
not a substitute for Paddle's checkout total.

For v1, favor a small number of package prices over a combinatorial base-plan/module catalog.
Paddle supports multi-product subscriptions, but recurring items in one subscription must share a
billing interval. If regional add-ons launch later, create matching monthly and annual price sets
and test proration explicitly.

### 5.3 Billing accounts and subscriptions

`billing_accounts`

- one active row per organization/provider/environment
- provider customer ID and optional provider business ID
- billing contact email (display/support only, never identity authority)
- sync timestamps and last provider event time

`billing_subscriptions`

- internal ID, organization ID, billing account ID
- provider/environment and unique provider subscription ID
- internal offer code and provider status
- collection mode: `automatic | manual`
- current billing period start/end
- scheduled-change action/effective time
- `past_due_since`, cancellation time, last provider `occurred_at`
- local `provisioning_state`: `pending | entitled | grace | restricted | revoked | review`
- timestamps

`billing_subscription_items`

- provider subscription item ID, subscription ID, external product/price IDs, mapped offer code,
  quantity, item status

`billing_transactions`

- unique provider/environment/transaction ID, billing account and optional subscription ID
- status, collection mode, currency, minimal totals, invoice number, completed/billed timestamps
- last provider `occurred_at`; no payment-attempt or payment-method payload

This lean transaction record supports manual-invoice provisioning, refunds/reconciliation, and a
customer-safe account summary without turning Neon into an accounting-system replica.

Keep a lean cache, not a full Paddle replica. Fetch invoice history and management URLs from Paddle
on demand through authenticated server routes. Never store card, bank-account, or payment-method
details.

Preserve the legacy `subscriptions` table during migration. Stop new writes, move each genuine beta
account to an explicit beta grant, migrate any future real subscription deliberately, move all
consumers, and only then schedule a separate cleanup. Do not reinterpret existing Stripe columns as
Paddle columns.

### 5.4 Entitlements and grants

`entitlement_grants`

- organization ID, feature key, scope/limit JSON
- source type: `paddle_subscription | beta | contract | support_override`
- source ID, status, valid-from/until, created/revoked timestamps
- reason and actor for manual grants; no free-form secrets or customer content

Subscription webhook processing atomically updates the subscription cache and replaces its derived
grants. Manual/beta grants coexist and have explicit expiration. An access decision evaluates all
valid grants and returns both a decision and a machine-readable reason.

Suggested feature keys as the **extensible target** (not a v1 requirement — the first
implementation resolves the coarse organization access projection plus limits, §8.4, and
materializes individual keys incrementally as offers actually diverge):

- `digests.read`, `archive.read`, `scoreboard.read`
- `search.use`, `ask.use`, with per-day limits in grant metadata
- `signals.detail`, `entities.read`, `trade.read`, `materials.read`
- `export.use`, `api.use`, `embedding.use`
- theater/track scope and history depth

Do not commercialize `/registry` or any current admin-only surface merely because an entitlement key
exists. Its standing admin-only policy remains until a separate product/legal decision changes it.

### 5.5 Durable webhook inbox and checkout attempts

`billing_webhook_events`

- provider/environment/event ID unique key
- event type, `occurred_at`, received/processed timestamps
- processing status, attempt count, bounded sanitized error code
- payload JSON while pending/within a short retention window, then redact it while retaining event
  metadata and a payload hash

`billing_checkout_attempts`

- opaque internal ID, organization, actor user, offer/price mapping
- provider transaction ID when known
- state: `created | opened | completed_browser | provisioned | abandoned | failed | review`
- creation/expiry timestamps and acquisition attribution already normalized by BNOW

Use internal IDs in Paddle `custom_data`: schema version, billing-account ID, organization ID,
checkout-attempt ID, and internal offer code. Do not put email, names, URLs, question text, or other
PII into custom data. Paddle copies transaction custom data to a resulting subscription and renewal
transactions, which gives the webhook processor a stable correlation key.

## 6. Checkout and account flows

### 6.1 Individual self-service

1. Prospect sees public offer details and localized Paddle price preview.
2. Purchase requires a verified Auth.js session and acceptance of current BNOW policies.
3. If the user has no organization, create an `individual` organization and owner membership.
4. Server validates the internal offer, resolves the environment-specific Paddle price, creates a
   local checkout attempt, and creates/opens a Paddle transaction with opaque custom data.
5. Paddle.js uses a public client token. The Paddle API key remains server-only.
6. Browser completion redirects to `/checkout/success?attempt=<opaque-id>`. The page says payment is
   processing and reads local status; it does not create a subscription or grant access.
7. Verified Paddle events create/update the subscription and entitlements.
8. The success page becomes active when local provisioning completes, with a bounded delayed-state
   message and support path if the webhook is late.

Require one in-flight attempt per organization/offer for a short window. Do not assume remote create
calls are idempotent unless the selected Paddle API/SDK version explicitly documents an idempotency
contract at implementation time. Persist the intent before the API call and provide an operator
recovery path for an ambiguous timeout.

### 6.2 Business self-service

The buyer creates or selects a business organization first. Only an owner/billing admin can buy.
Paddle Checkout captures or associates business/tax information; BNOW stores Paddle entity IDs and
minimal display data, not tax identifiers unless a later legal requirement justifies it. After
provisioning, all active members receive the organization's entitlements. Member invitations and
removals are BNOW operations, not Paddle customer-email operations.

### 6.3 Sales-assisted enterprise/invoice

Use a separate operator workflow:

1. Signed order/approval creates a business organization and contract record or manual grant.
2. Operator creates/associates Paddle customer, address, and business entities.
3. A manually collected transaction includes agreed items, currency, payment terms, and purchase
   order number, then is issued through Paddle.
4. Issuing an invoice can create a Paddle subscription before cash is received. Therefore
   `subscription.created` for `collection_mode=manual` must **not by itself** prove payment or
   authorize access.
5. Access begins only on `transaction.completed` or an explicit contract grant approved by the
   operator, according to the signed payment terms.

This is essential for net terms and government procurement. Enterprise custom work or human analyst
services should not be placed in Paddle until Paddle confirms they are ancillary, eligible items.

### 6.4 Customer portal

Add an authenticated server action/route that checks owner/billing-admin membership and creates a
short-lived Paddle customer portal session for the organization's stored customer ID. Redirect to
the returned authenticated URL. Do not persist portal URLs. Use the hosted portal for invoices,
payment methods, subscription changes, and cancellation rather than building card/bank UI.

If an organization has multiple subscriptions, pass only subscription IDs owned by that billing
account. A member without billing permission may see BNOW's plan/status summary but cannot obtain a
portal session.

## 7. Webhook contract and lifecycle policy

### 7.1 Ingestion

Create `POST /api/webhooks/paddle` with this fixed sequence:

1. Read the exact raw body once; do not parse/reformat it before verification.
2. Verify `Paddle-Signature` with the environment-specific destination secret using the official
   Node SDK helper.
3. Reject missing/invalid signatures with a non-2xx response and no database mutation.
4. Insert the event into the durable inbox using unique `(provider, environment, event_id)`.
5. Return 2xx within Paddle's five-second deadline after durable acceptance.
6. Process opportunistically with Next `after()` and drain pending rows from a scheduled
   `billing:events` job so a terminated function cannot lose work.

Signature verification is the primary trust boundary. An IP allowlist may be defense-in-depth only
and must come from Paddle's current published ranges; never rely on a copied static list alone.

### 7.2 Event processing

Initial event set:

- `subscription.created` and `subscription.updated`: authoritative subscription/item/status cache.
- `transaction.completed`: successful payment record and manual-invoice provisioning trigger.
- `transaction.past_due` and `transaction.payment_failed`: establish dunning/grace timing and UX.
- refund/adjustment events only after the refund-to-access policy is finalized.

Paddle delivers at least once and does not guarantee order. Every processor must be idempotent by
`event_id` and ignore entity updates whose `occurred_at` is older than the last applied provider
event. A duplicate returns success. An old event is recorded as processed/stale rather than an
error. A newer event updates the lean cache and grants in one DB transaction.

Correlation order:

1. trusted internal ID from validated `custom_data`;
2. known provider customer/subscription ID already bound to a billing account;
3. otherwise quarantine for operator review.

Never bind a payment to a user or organization by email alone.

### 7.3 Access policy by provider state

| Paddle/local condition | Default application policy |
|---|---|
| `trialing` | Full mapped entitlement only if approved trials are enabled |
| `active`, automatic collection | Full mapped entitlement |
| Scheduled cancel/pause in future while status is active | Keep access through effective time; show date |
| `past_due` | Seven-day full-access grace + portal warning; then restricted/read-only (final decision required) |
| `paused` | Revoke interactive paid features; retain account/billing access |
| `canceled` | Revoke subscription-derived grants when status becomes canceled |
| Manual invoice merely `billed` | No payment-derived grant; contract grant may apply |
| Manual invoice `completed` | Grant per contract/catalog if subscription mapping is valid |
| Unknown price, missing correlation, contradictory ownership | Fail closed to `review`; alert operator |

Refunds, credits, disputes, and chargebacks need an explicit policy before their events are enabled.
A refund should not silently leave an uncanceled subscription entitled, nor should a partial service
credit automatically revoke an otherwise valid contract.

### 7.4 Reconciliation

Run a daily `billing:reconcile` job using Paddle's server API in both directions:

- fetch every locally active/grace/paused subscription and compare its current Paddle state;
- paginate all provider subscriptions in nonterminal states (`active`, `trialing`, `past_due`,
  `paused`) so subscriptions that never reached the webhook endpoint are discovered rather than
  remaining invisible; at expected BNOW volume a full nonterminal scan is preferable to inventing
  an unsupported `updated_at` cursor;
- compare provider status, items, price mapping, period end, and scheduled change;
- repair by feeding a synthetic reconciliation record through the same idempotent projection logic;
- never mutate Paddle automatically to match BNOW;
- alert on unknown products, orphan Paddle subscriptions, multiple active base plans, stale webhook
  lag, or local grants without a live source.

Use `cron_runs` at start and finish, following the existing timeout convention. Reconciliation is a
repair loop, not the normal request-path authority.

## 8. Entitlement integration

### 8.1 One decision at the boundary, context everywhere else

Add a provider-free API centered on a single resolution call:

- `resolveAccessContext(session)` -> the one authorization decision per request (below)
- `accessForUser(email)` -> organizations, grants, billing warning state (account rendering)
- `canManageBilling(userId, organizationId)` -> portal/checkout authority

Entitlement checks happen **only at authoritative request boundaries** — the places a client can
independently call:

- paid page/layout entry points (primarily UX: honest state, upsell, warnings);
- paid server actions;
- paid API route handlers;
- **starting** an Ask or Search operation;
- export endpoints and future public API endpoints;
- scheduled email-recipient selection (the job boundary, once per run, not per recipient row).

The handler resolves the decision **once** and passes an already-authorized context downstream:

```ts
interface AccessContext {
  userId: string;
  organizationId: string;
  tier: string;
  features: Set<string>;
  limits: Record<string, number>;
}
```

Internal functions receive this context (or just the relevant limits) as plain data. Retrieval,
reranking, generation, evidence hydration, rendering, and persistence code **must not import the
billing or entitlement modules** — enforce with a lint rule or import-graph test, the same
technique the AI Search review specifies for vendor SDK isolation. Page-level checks are UX;
the **authoritative** check is the one on the action/route/run-creation boundary, because those
are independently callable (see the direct-request tests in §11.1).

Do not replace `requireAcceptedUser()` in one step. First seed current beta analysts with explicit
non-Paddle grants and prove parity. Then compose authentication, current legal acceptance, and
the access-context resolution behind `FEATURE_SUBSCRIPTION_ENFORCEMENT`. Keep local/dev behavior
explicit; production must fail closed when entitlement lookup fails — with the scope defined in
§8.6.

### 8.2 Route-policy matrix

| Surface | Required checks |
|---|---|
| Public pages, legal documents, sign-in | None |
| Account page | Authentication + current legal acceptance |
| Checkout creation | Authentication + legal acceptance + organization billing authority (owner/billing admin) |
| Paddle customer portal | Authentication + owner/billing-admin membership; **an active subscription is not required** (canceled users manage billing here) |
| Paid content page | Authentication + legal acceptance + entitlement (UX-grade) |
| Paid action / API route | Authentication + legal acceptance + entitlement, checked **authoritatively** at the boundary |
| Ask run creation | Entitlement + feature/usage limits + SpendGuard (independent layers, §8.5) |
| Ask SSE / polling / result retrieval | **Run ownership only** — do not redo the full billing decision for every event or chunk |
| Admin surfaces | Admin authorization (`users.role`), fully independent of payment |
| Webhooks | Paddle signature verification; no user session |

### 8.3 In-flight-operation policy

- Authorize when a paid operation **begins**.
- An accepted Ask run **finishes** even if the subscription changes during its short execution;
  terminating mid-run buys nothing and creates settlement edge cases.
- Entitlement is checked again when the user starts the **next** question or operation — that is
  where a downgrade, cancellation, or grace transition takes effect.
- SSE/polling/result requests verify **ownership of the existing run**, not payment state.
- Long-running future jobs (asynchronous Deep analysis, large exports) may need a separate
  lease/revalidation policy; the current short Ask flow does not, and none should be built yet.

### 8.4 v1 access model — required now vs deliberately deferred

The v1 decision is a **coarse organization access projection plus limits**, not a generic
per-feature entitlement engine.

Required in v1:

- organization membership;
- current access state: `active | grace | restricted | revoked`;
- tier/offer code;
- theater scope **only if** the frozen launch packaging (§2.3) actually differs by theater;
- Ask/Search/API limits where an offer defines them;
- the source explaining access: Paddle subscription, beta, contract, or operator override;
- effective and expiration timestamps.

Optional / deferred until real plan differences require them:

- a fully generic entitlement engine consulted by every page;
- dozens of individual feature keys before multiple offers actually differ;
- complex grant-merging logic;
- per-module add-ons before the launch catalog is frozen;
- database-driven feature definitions where a version-controlled mapping in code suffices.

`entitlement_grants` (§5.4) remains the extensible target schema; **granular feature
materialization is incremental**, added when packaging demands it — not a launch prerequisite.

### 8.5 Billing entitlement, usage policy, and SpendGuard are independent layers

```text
Subscription entitlement:  is this organization allowed to use Ask at all?
Product usage policy:      how many Ask requests does this tier receive?
SpendGuard:                is BNOW still allowed to pay the model provider?
```

These compose; none substitutes for another. A customer payment must never override a SpendGuard
cap (standing ruling 4). Conversely, a provider budget outage produces the existing graceful
product behavior (deterministic degraded answers, honest budget copy) **without** marking the
customer unsubscribed or mutating any billing state. `ask_usage` remains usage metering; plan
limits are read from the access context.

### 8.6 Failure behavior — what "fail closed" does and does not mean

"Fail closed" applies specifically to **starting paid feature execution**:

- if entitlement state cannot be read, reject starting the paid operation with honest copy;
- do **not** block access to the account page, billing portal, legal documents, sign-out,
  renewal, or support paths — those must keep working precisely when billing is in trouble;
- a **Paddle outage does not affect normal access at all**, because access reads the local
  projection (§1.1); the outage delays lifecycle updates and reconciliation only;
- a **Neon entitlement-read outage** may block new paid operations, but must not invalidate
  accounts, revoke grants, or mutate subscription state — the projection is repaired by webhook
  replay/reconciliation, never degraded by a read failure.

## 9. Modules, routes, and configuration handoff

Suggested implementation boundaries:

```text
src/lib/billing/config.ts             validated env + feature flags
src/lib/billing/provider.ts           provider-neutral interface
src/lib/billing/paddle-client.ts      server-only SDK construction
src/lib/billing/catalog.ts            internal offer -> active price mapping
src/lib/billing/checkout.ts           attempt + transaction orchestration
src/lib/billing/webhook.ts            raw verification + inbox write
src/lib/billing/project-event.ts      idempotent subscription/grant projection
src/lib/billing/entitlements.ts       request-path access decisions
src/lib/billing/reconcile.ts          drift detection/repair
src/app/api/webhooks/paddle/route.ts  public signed webhook endpoint
src/app/api/billing/checkout/route.ts authenticated checkout creation
src/app/api/billing/portal/route.ts   authenticated portal session
src/app/api/cron/billing-events/route.ts    frequent pending-event drain
src/app/api/cron/billing-reconcile/route.ts daily two-way reconciliation
src/app/checkout/page.tsx             approved default-payment-link/Paddle.js host
src/app/checkout/success/page.tsx     local provisioning status
src/app/account/billing/page.tsx      status + manage-billing entry
```

Use the official `@paddle/paddle-node-sdk` on the server and Paddle.js in the browser. Pin the API
version supported by the integration. Do not call Paddle's server API from a client component.

Configuration:

- `PADDLE_ENV=sandbox|production`
- `PADDLE_API_KEY` (server only, least privilege, rotatable/expiring key)
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (environment-specific public token)
- `PADDLE_WEBHOOK_SECRET` (server only, unique per destination/environment)
- `FEATURE_BILLING_FOUNDATION`
- `FEATURE_PADDLE_CHECKOUT`
- `FEATURE_SUBSCRIPTION_ENFORCEMENT`

Keep price IDs in `billing_prices`, not a growing set of environment variables. Validate that the
configured credential prefixes match the environment and refuse to boot billing routes on a
sandbox/live mismatch. Development/Preview use sandbox credentials; Production alone receives live
credentials. Replace `FEATURE_STRIPE` only after account copy and tests move to provider-neutral
flags.

### 9.1 Paddle dashboard setup checklist

Sandbox and live are separate systems. Never copy a sandbox entity ID or credential into a live
catalog row.

Sandbox:

1. Create the seller sandbox and record its accountable owner.
2. Create least-privilege, expiring/rotatable API credentials plus a client-side token.
3. Create the approved v1 SaaS products/prices with the correct tax category and interval.
4. Configure `/checkout` as the default payment link; localhost/test domains are sandbox-only.
5. Create the webhook destination and save its destination-specific secret.
6. Configure brand, support, receipt, dunning, cancellation, and customer-portal settings.
7. Record all sandbox IDs in `billing_prices` with `environment='sandbox'` and validate them by API.
8. Run the webhook simulator and full test-card matrix.

Live, only after §2 approval:

1. Complete seller identity, business, bank/payout, tax-form, and product reviews.
2. Request and receive approval for `bnow.net`; set `https://bnow.net/checkout` as the default
   payment link.
3. Recreate the approved catalog and insert live product/price mappings through a reviewed operator
   script or admin action.
4. Create a live least-privilege API key, client token, and webhook destination/secret; scope each
   Vercel environment deliberately.
5. Verify customer-facing seller name, statement descriptor, receipts, invoice branding, support
   address, portal behavior, dunning, cancellation, refund settings, payout currency, and finance
   exports.
6. Confirm webhook delivery logs and API access before enabling the checkout allowlist.

When implementation becomes live, correct the standing Stripe references in `AGENTS.md`,
`docs/SETUP-NEXT-WEEK.md`, `docs/HUMAN-SETUP-TODO.md`, and `docs/GTM-STRATEGY.md` in place and append
the required decision-log entry. Do not make those standing-text changes while Paddle remains only a
proposal.

## 10. Security, privacy, and abuse requirements

- Server authorizes the organization, offer, and price; the browser never chooses an arbitrary
  billable ID.
- Checkout and portal creation require verified authentication, current legal acceptance, and
  owner/billing-admin membership.
- Webhooks use exact raw-body signature verification and environment-specific secrets.
- API key never enters `NEXT_PUBLIC_*`, rendered HTML, logs, exceptions, or PostHog.
- Logs use internal IDs and event types; redact email, addresses, tax IDs, payloads, checkout URLs,
  and provider tokens.
- Paddle customer/business/address IDs are confidential operational identifiers even though they
  are not payment credentials.
- Checkout custom data contains opaque IDs only.
- Unknown mapping fails closed; support cannot activate access by editing a Paddle email.
- Manual grants require actor, reason, expiry, and an audit entry.
- Webhook payload retention is short and documented; keep durable hashes/metadata after redaction.
- PostHog receives coarse events such as checkout started/completed/provisioned and offer code only
  when the user's existing analytics consent permits it. Never send price/payment payloads, email,
  tax data, or invoice IDs.
- Rate-limit checkout creation and portal-session creation per user/organization. Reuse an
  in-flight attempt rather than generating transaction spam.
- Maintain the current truth-in-UI rule: a browser-complete checkout may say “processing,” never
  “active,” until local verified state proves it.

## 11. Test plan

### 11.1 Unit/fixture tests

- Valid, missing, malformed, wrong-secret, stale-timestamp, and body-mutated signatures.
- Environment mismatch and absent-secret fail-closed behavior.
- Internal offer allowlist; inactive/unknown/sandbox-vs-live price rejection.
- Custom-data validation and no-email correlation.
- Duplicate event produces one projection and one grant set.
- Out-of-order older event cannot reactivate/cancel/regress newer state.
- Scheduled cancellation retains access until effective status change.
- `past_due`, paused, canceled, trial, and manual-invoice policy table.
- Unknown price/customer/organization goes to review with no grant.
- Membership authorization for owner, billing admin, member, removed member, and cross-org attack.
- Success page/browser callback never grants access.
- Portal URL is returned only to an authorized billing manager and never persisted/logged.
- Legacy beta account parity and provider-neutral account wording.

Use saved Paddle webhook fixtures with synthetic identities and scrubbed values. Do not fetch a live
webhook during the unit suite.

Direct-request security tests (the boundary checks of §8.1/§8.2 are only real if independently
callable routes enforce them — page rendering proves nothing):

- a user loads an allowed page, is downgraded, then directly calls the action/API: the operation
  is denied;
- a user calls a paid API route without ever loading its page: denied without entitlement;
- a canceled user can still authenticate and reach account/billing portal, but not paid content
  or paid execution;
- a removed business member retains authentication but loses organization product access;
- a plain member cannot open the organization's Paddle portal;
- a billing admin can open the portal **without** holding any admin product role
  (`users.role` unchanged);
- a subscription change during an in-flight Ask run does not terminate the accepted run; the
  next run resolves the new access state (§8.3);
- the Ask SSE/result endpoint rejects another user's access to the run, and does **not** invoke
  billing authorization per event/chunk (ownership check only);
- client-supplied tier, price, organization, or "paid" fields are ignored everywhere — the
  server resolves all of them from session + local projection.

### 11.2 Real-Postgres integration tests

On a disposable Neon branch:

- additive migration applies and the full migration suite still enforces claim-source invariants;
- webhook inbox insert, event projection, subscription item mapping, and grant replacement are one
  recoverable lifecycle;
- concurrent duplicate delivery cannot duplicate subscriptions or grants;
- stale and newer events racing leave the newest provider state;
- an individual organization and multi-member business resolve the same org-level grant correctly;
- beta-grant migration preserves every currently eligible recipient;
- email-recipient selection matches web/API entitlement decisions;
- pending webhook survives processor failure and is drained by the cron worker;
- reconciliation repairs drift without writing to Paddle.

### 11.3 Paddle sandbox end-to-end

Use Paddle sandbox and the webhook simulator to prove:

1. Successful standard-card purchase.
2. 3DS challenge.
3. Declined card and abandoned checkout.
4. Duplicate and deliberately reordered webhook delivery.
5. Renewal, payment failure/past due, recovery, pause/resume, scheduled cancel, and final cancel.
6. Annual and monthly offer mapping.
7. Business name/tax capture without local sensitive-data leakage.
8. Authenticated customer portal, payment update, invoice download, and cancellation.
9. Manual invoice issue does not grant prematurely; payment or explicit contract grant does.
10. Function interruption after inbox insert is repaired by the scheduled drain.

### 11.4 Production canary

After legal, Paddle, and pricing approval, enable live checkout only for an internal allowlist. A
real charge/refund requires explicit operator authorization. Verify one full lifecycle, invoice and
email branding, bank statement descriptor, webhook latency, local provisioning, portal access,
cancellation, refund policy, payout/reconciliation records, logs, and zero sensitive data in
PostHog. Hold the canary for at least seven days with zero unexplained drift before public rollout.

The repository gate remains typecheck + lint + all unit tests; billing adds its real-Postgres suite
and sandbox evidence as release requirements.

## 12. Observability and operator controls

Record low-cardinality metrics and structured logs for:

- checkout attempts by state and offer;
- webhook received/verified/duplicate/stale/processed/failed;
- receive-to-process and process-to-entitlement lag;
- quarantined/orphan/unknown-price events;
- reconciliation drift and repair;
- entitlement decisions by reason, without user email;
- Paddle API request failures and rate limits;
- portal-session creation success/failure.

Alert when:

- the oldest pending event is older than five minutes;
- any event exhausts processing retries;
- an active Paddle subscription has no local grants or a subscription grant lacks a live source;
- webhook delivery stops during expected activity;
- reconciliation finds an unknown live price or cross-organization ownership mismatch;
- checkout success remains unprovisioned beyond a bounded threshold.

Add an admin read-only billing view showing internal organization/offer/status, last event,
scheduled change, reconciliation state, and safe provider links. Mutations remain explicit operator
runbooks. Include replay, resync, manual-grant, revoke, refund/escalation, and key-rotation procedures.

## 13. Rollout sequence and estimates

Estimates assume one engineer familiar with the codebase and exclude Paddle/legal approval wait.

### Phase A — approval and catalog decisions (2–4 working days + external wait)

- Complete §2 gates, Paddle sandbox/live applications, and economic review.
- Produce final catalog/entitlement matrix and migration mapping for current beta accounts.

Exit: written vendor approval, approved economics, policy draft, frozen v1 catalog.

### Phase B — provider-neutral foundation (4–6 engineering days)

- Add organizations, memberships, catalog, billing accounts/subscriptions/items, grants, inbox, and
  checkout attempts through a new additive migration.
- Implement the **coarse access projection** (§8.4) and **one centralized
  `resolveAccessContext()`** (§8.1); seed beta grants; leave enforcement off. No per-page feature
  keys, no grant-merging engine — the projection plus limits is the v1 read model.
- Move account and digest-recipient reads to the provider-neutral model with parity tests.

Exit: no user-visible change; all current beta access and email eligibility match the baseline.

### Phase C — Paddle adapter and lifecycle projection (4–6 engineering days)

- Add validated configuration, official SDK, signed webhook inbox, projector, pending-event drain,
  reconciliation, metrics, and admin read view.
- Exercise all lifecycle fixtures and disposable-Neon concurrency/out-of-order tests.

Exit: sandbox simulations project correct state with no checkout UI and no production credentials.

### Phase D — checkout, success, portal, and account UX (4–6 engineering days)

- Build approved `/checkout` default payment page, authenticated transaction creation, status page,
  customer portal entry, billing warnings, and localized pricing preview.
- Preserve `/access` for sales-assisted/non-public offers.

Exit: individual sandbox lifecycle passes; no redirect/callback can grant access.

### Phase E — business and invoice path (4–7 engineering days)

- Organization creation/member management, billing-admin authorization, business checkout, manual
  invoice projection, and contract/manual-grant audit path.

Exit: multi-member business and manual-invoice scenarios pass without early provisioning.

### Phase F — enforcement and controlled production rollout (3–5 engineering days + 7-day soak)

- Version legal policies, accept current versions, configure live catalog/domain/webhook/portal,
  run allowlisted canary, and enable subscription enforcement for the canary.
- Apply enforcement to **one vertical slice first — Ask** — at its page and execution boundaries
  (run creation is the authoritative check; SSE/result endpoints check run ownership only, §8.2).
  Prove the direct-route security tests, the in-flight cancellation behavior (§8.3), and that
  account/portal access survives for non-entitled users **before** expanding.
- Expand enforcement to other paid surfaces one at a time after the pattern is measured. **Do not
  require every existing gated page to migrate simultaneously** — pages not yet migrated keep the
  current beta gate until their turn.
- Add granular theater/module entitlements only when the frozen packaging actually requires them
  (§8.4).
- Open Standby first if approved; keep Professional/Enterprise sales-assisted until evidence supports
  self-service.

Exit: seven days with zero unexplained reconciliation drift, tested rollback, finance reconciliation,
support runbook, and explicit operator go-live approval.

Expected engineering total: roughly **19–30 days** for complete individual + business foundations.
The smaller individual-only foundation through Phase D is roughly **12–18 days** after approvals.

## 14. Feature flags and rollback

Use independent switches:

1. `FEATURE_BILLING_FOUNDATION`: schema/reads/admin visibility; no checkout.
2. `FEATURE_PADDLE_CHECKOUT`: allows transaction creation for an allowlist or public catalog.
3. `FEATURE_SUBSCRIPTION_ENFORCEMENT`: paid entitlement gates application features.

Rollback order:

- Disable checkout first so no new purchases start.
- Keep the webhook endpoint, event processor, and reconciliation running; disabling lifecycle sync
  during a rollback creates billing/access drift.
- Disable enforcement only if necessary, falling back to explicit beta/manual grants rather than
  anonymous access.
- Do not delete provider IDs, event history, subscription rows, or active grants during incident
  response.
- Restore the last known UI deployment while the provider-neutral cache continues to receive events.

## 15. Acceptance criteria for “foundations in place”

The milestone is complete only when all are true:

- Paddle has approved the product/use case and bnow.net checkout domain.
- Internal catalog and entitlements are provider-neutral and organization-owned.
- Individuals and businesses can be represented without changing `users.role` or counting seats.
- Current beta users have explicit audited grants and no access regression.
- Checkout offer/price selection is server-authorized.
- Webhooks are raw-body verified, durable, idempotent, ordered by `occurred_at`, and repairable.
- Application access is derived from local grants, never browser success or billing email.
- Manual invoices cannot provision early by accident.
- Customer portal access is short-lived and billing-admin authorized.
- Reconciliation detects and repairs missed-event drift.
- Sensitive payment/tax data is absent from BNOW storage, logs, and analytics.
- Unit, disposable-Neon, sandbox, security, and lifecycle test matrices are green.
- Checkout and enforcement can be enabled/disabled independently without losing billing state.
- Legal copy, support procedures, finance reconciliation, and operator runbooks are approved.

## 16. Decisions still required from the operator

1. Confirm Paddle as the intended primary provider after the AUP/product review.
2. Approve current Paddle economics or obtain negotiated terms.
3. Decide whether “individual” means an organization-of-one Standby buyer or a new lower-priced SKU.
4. Freeze the v1 offer/bundle/annual matrix and whether Professional is self-service.
5. Approve the past-due grace/restriction policy.
6. Define refunds, partial credits, disputes, chargebacks, and enterprise net-term access.
7. Choose whether business member invitations are part of the first paid launch or are
   operator-managed initially.

## 17. Official references verified for this plan

- [Paddle Node SDK](https://developer.paddle.com/sdks/libraries/node/)
- [Provision access from subscription state](https://developer.paddle.com/build/subscriptions/provision-access-webhooks/)
- [Webhook signature verification](https://developer.paddle.com/webhooks/about/signature-verification/)
- [Webhook delivery, ordering, and retries](https://developer.paddle.com/webhooks/about/respond-to-webhooks/)
- [Webhook event model and idempotency](https://developer.paddle.com/webhooks/about/how-webhooks-work/)
- [Custom data propagation](https://developer.paddle.com/build/transactions/custom-data/)
- [Create and issue invoices](https://developer.paddle.com/build/invoices/create-issue-invoices/)
- [Customer portal sessions](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/)
- [Default payment link and live domain approval](https://developer.paddle.com/build/transactions/default-payment-link/)
- [Sandbox behavior](https://developer.paddle.com/sdks/sandbox/)
- [Products, prices, intervals, and trials](https://developer.paddle.com/build/products/create-products-prices/)
- [Supported markets and Merchant-of-Record tax handling](https://developer.paddle.com/concepts/sell/supported-countries-locales/)
- [Current prohibited/restricted-business guidance](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle)
- [Current buyer-country restrictions](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)
- [Paddle Master Services Agreement](https://www.paddle.com/legal/terms)
