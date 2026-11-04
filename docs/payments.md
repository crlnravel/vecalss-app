# Payments: orders, the payment inbox, the outbox and purchase limits

Phase A of MS-05 and MS-06. Everything provider-independent is built against a dev-only
stand-in provider. The E2Pay adapter (phase B) plugs in behind the same three
adapter methods. No real payment can be taken yet: with no provider configured,
checkout stays closed.

## How a payment flows

1. The student posts the checkout form. The checkout intent (MS-03) is stored.
2. The server creates one **order** for that intent: amount, currency (IDR),
   package code and title, referral and affiliator, buyer IP with its source,
   provider identity and the expiry (database time plus **15 minutes**, the
   single constant `PAYMENT_EXPIRY_MINUTES`). One intent leads to at most one
   order.
3. The server asks the provider for one payment session, using the order's
   opaque `reference` as the provider's idempotency key, and sends the browser
   to the provider's page. A lost answer, a retry, a second tab or an early
   callback is resolved by that key and by a status lookup, never by creating a
   second payable session.
4. The provider sends signed events to `POST /api/payments/events/<provider>`.
   The adapter verifies the signature on the **raw body** and the timestamp
   (5-minute window, on database time). Then the inbox matches amount, currency,
   buyer, package, merchant account and environment, and the payment id against
   the order.
5. One transaction commits the event record, the order transition, the
   `package_purchases` summary (affiliator conversions), the access grant and
   receipt (MS-08, below), an audit event and the outbox jobs.

The browser's return page (`/pricing/checkout/status/<reference>`) only
displays the order's state. It never proves a payment.

## What each event does

| Event | Order is pending | Order is failed or expired | Order is paid or in review |
| --- | --- | --- | --- |
| succeeded | paid | **review** (never auto-accepted) | same payment: ignored; a different payment: kept and reviewed |
| failed | failed | ignored | ignored |
| expired | expired | ignored | ignored |

Any mismatch (including an unknown reference) is **quarantined**: the event is
stored, the order is untouched, and a `critical_alert` outbox job emails
`MAINTENANCE_ALERT_EMAIL`. A payment captured after a confirmed expiry or a
failure goes to `review` with an alert; it is not dropped and no access follows.

## Tables

- `payment_orders`: snapshot columns are frozen by a trigger; `status` only
  follows pending to paid, failed or expired, and failed or expired to review;
  links (session URL, provider payment id, purchase) are set once; rows are
  never deleted. A paid order must carry its purchase and paid time.
- `payment_events`: append-only. Unique on provider, environment, account and
  event id. Signature and freshness failures never reach it.
- `payment_outbox`: lease, attempt and next-run columns. Jobs are never deleted.
- `stand_in_payments`: the stand-in provider's own state. Only written when the
  stand-in is enabled.
- `package_purchases.provenance`: `incomplete` for every purchase that predates
  orders or comes from the provisional callback (no amount, currency, IP or
  provider evidence, none back-filled); `order` for purchases written from a
  paid order.

## Outbox

Jobs are queued inside the transaction that made the decision. They are
processed right after the response with Next.js `after()`, and the daily
maintenance job (`/api/cron/daily-maintenance`) drains whatever is left and
reconciles orders still open past their expiry through the adapter's status
lookup. Both are idempotent and leased: a job is claimed with a 2-minute lease
(`FOR UPDATE SKIP LOCKED`), retried after 1, 2, 4... minutes (cap 6 hours), and
parked as `dead` after 8 attempts. Kinds: `critical_alert`, `receipt_email` and
`access_grant` (the retry of a grant that could not happen, see MS-08).

## The stand-in provider

- Enabled only by `PAYMENT_PROVIDER=stand-in` **and** `NODE_ENV` other than
  production **and** a `DATABASE_URL` host on this machine (the same rule as
  `isSeedMfaAllowed`). Anywhere else it is treated as no provider.
- The pay page at `/pay/stand-in/<reference>` is plainly marked as a test
  payment and lets the buyer pay, fail or let the payment expire. It then sends
  a signed event to the real inbox in-process.
- Events carry `x-stand-in-timestamp` and `x-stand-in-signature: v1=<hex>`,
  HMAC-SHA256 over `<timestamp>.<raw body>` with `PAYMENT_STAND_IN_SECRET` (a
  fixed test value when unset).
- To try it: set `PAYMENT_PROVIDER=stand-in` and the three
  `PRICING_PACKAGE_CODE_*` values to a published package code, leave
  `CHECKOUT_KILL_SWITCH` off, sign in as the seeded student and use `/pricing`.

## Purchase limits (MS-06 phase A)

Every new checkout passes `lib/payments/risk` inside the order-creation
transaction. Nothing is counted in Redis; the code does not name a cache at all.

**Policy.** `risk_policy_versions` holds the numbers and `risk_policy_activations`
says which version is in force (the newest row). Both are append-only: a change
is a new version plus a new activation, never an edit. An activation with no
version withdraws the policy; with none in force, new checkouts are refused (the
checkout page shows the paused notice) while the inbox, reconciliation and the
outbox keep running. Version 1 is seeded by the migration with the G2 values:

| Rule | Value |
| --- | --- |
| New or unverified, per Asia/Jakarta day | 1 purchase, Rp250.000 |
| Verified, per day | 2 purchases, Rp500.000 |
| Verified means | account at least 7 days old **and** a paid order that stands |
| Open unpaid payments per account | 1 |
| Unpaid checkouts per account per hour | 5 |
| Checkout starts per IP per hour | 20 |

Structural rules, not numbers: a guest has no checkout, and the order amount
must equal the server quote for the intent's plan and pricing month.

**Tier.** `risk_account_tiers` keeps the tier and the facts it was decided from
(account age, the qualifying order, the policy version). A tier change is
audited. Refunds and disputes do not exist yet; `findStandingPaidOrder` in
`risk/tier.ts` is the one seam MS-09 extends so that an order with a refund or
dispute no longer verifies an account.

**Reservation.** The account's tier row is locked first (`FOR UPDATE`), then the
day bucket row; per-IP starts also take an advisory lock on the address. The
checks run in this order: policy, amount, buyer IP, open payment, unpaid per
hour, starts per IP, then the day's count and rupiah. `risk_reservations` holds
one row per order on the day the checkout started (Asia/Jakarta, from database
time, via `risk_jakarta_day`). A database trigger keeps `risk_day_buckets` equal
to the sum of the reservations that count.

| Order moves to | Reservation | Counted |
| --- | --- | --- |
| created (pending) | pending | yes |
| paid | paid | yes |
| failed or expired (confirmed by the provider) | released | no, on its original day |
| review (a payment arrived after that) | review | yes again, even past the cap |
| refund (MS-09) | unchanged | refunds never give the allowance back |

The move happens in the same transaction as the order transition in
`processPaymentEvent`. The next Asia/Jakarta day starts with an empty bucket, so
no cron is involved. Retrying the same intent finds its order again under the
account lock and reuses its reservation.

**Refusals** write only an audit event (`payment.checkout.refused`: reason code,
policy version, tier, intent id and the buyer IP that orders already keep). No
order, reservation, payment session or job is created. The buyer sees a calm
Indonesian message that never names the rule behind it.

**Buyer IP.** A new order needs a trusted buyer IP or an exemption reason. Only
the dev stand-in on a local database is exempt (`stand-in-local-no-trusted-proxy`
is stored on the order); everything else without an IP is refused. A trigger
enforces this on insert.

## Fraud blocks and the case queue (MS-07 phase A)

Code in `lib/fraud`, pages under `/admin/fraud`. Migration
`20261104170000_fraud_blocks_and_cases`.

**Blocks.** Five types, each with a length the database enforces on creation and
renewal (`assert_fraud_block_lifetime`), on database time:

| Type | Matched against | Length | Effect |
| --- | --- | --- | --- |
| Account | user id | until lifted, reviewed every 30 days | deactivation path: sessions end, sign-in and checkout refused |
| Email | normalized email | until lifted, reviewed every 30 days | signup and checkout refused; an existing account also gets an account block |
| Phone | normalized profile phone (unverified) | until lifted, reviewed every 30 days | checkout refused |
| Device | device cookie | at most 30 days | checkout refused |
| IP | buyer IP | at most 7 days | checkout refused from that address only; no account is ever deactivated |
| Automatic | a daily rule hit | 24 hours, pending review | as its type, never an account deactivation |

A block never holds the identifier. `lookup_token` is an HMAC-SHA256 of the
normalized value under `FRAUD_LOOKUP_SECRET` (an account block uses the user
id); `hint` is a masked label. Rotating the secret orphans every token, so it is
a migration. In production a missing or short secret closes checkout and the
signup check (fail closed); outside production a fixed dev value is used.

**In force** means `status = 'active'` and an end date, if any, still ahead of
the database clock. That is decided when it is read, so a block lapses with no
job; the daily step only marks lapsed rows `expired` and writes their history.
Current state is a guarded row (a trigger freezes the identifier, type, source
and reason, and refuses any change that lacks its history row and the next
version number); history is `fraud_block_events`, append-only, and every change
also writes an audit event.

**Where blocks are checked.**

- Checkout: inside the MS-06 order transaction, after the account lock and
  before the limits, with a shared advisory lock per identifier. Creating a block
  takes the exclusive lock on the same identifier, so a checkout and a block for
  one identifier run one after the other. A refusal shows the calm
  `checkout-blocked` notice and the support contact; it writes an audit event and
  opens/hits a `blocked_attempt` case, and creates no order, reservation, session
  or job.
- Signup: enrolling an account with a blocked email is refused, and accepting an
  invite re-checks the account, email and device. (There is no public signup;
  accounts are created by admins.)
- Sign-in: after the password, an account block gives the neutral blocked
  message. Reactivating a blocked account through enrollment is refused.
- Paid order: when an event would be accepted, the order's buyer, IP and device
  are checked again. If now blocked, or if blocks cannot be read, the money is
  kept: the order goes to `review` (`blocked_buyer`), no purchase or access
  follows, the reservation is held, and cases and the alert are raised. Migration
  note: the order and reservation guards now also allow `pending` to `review`.

**Device cookie.** `vc_device`: 32 random bytes, httpOnly, SameSite=Lax, Secure in
production, a year. It is set at sign-in and when the checkout form is posted
(never to a cross-site request). Only its HMAC is stored, on
`payment_orders.device_lookup_token`. Clearing cookies defeats it, so it is one
signal among several.

**Authority.** The owner is the account whose email is `FRAUD_OWNER_EMAIL`; unset
means nobody is the owner and every owner action is refused. Any admin with a
verified second factor can view and acknowledge. The owner alone creates
manual blocks, lifts and renews them, escalates, closes, reopens and links cases,
files and decides appeals, and publishes limit changes, each with a written
reason (10 to 500 characters). Every action re-authenticates on the server and
carries the version the owner saw; a changed version or state is refused. A limit
exception is a new risk policy version published by the owner (the append-only
policy tables as they are), which applies to everyone; there is no per-account
override.

**Cases.** `fraud_cases` is one open case per signal and subject (a partial
unique index); a repeat adds a hit and can raise severity, a closed case takes
none. Each records evidence (ids, tokens and counts only), rule version, the
purchase-limit policy version, severity, owner, acknowledgement, escalation and
closure. Immediate signals: `payment_quarantined`, `payment_review`,
`blocked_attempt`. Daily signals (`runFraudMaintenance`, a step of
`runDailyMaintenance`): `ip_multi_account` and `device_multi_account` (3+
accounts paying within an hour), `repeated_payment_failures` (3+ failed or
expired in a day), `volume_spike` (3x the previous seven days' daily average,
at least 6 orders), `block_ending` (manual blocks ending or due for review
within 3 days). The device signal also creates the only automatic block. `capture_without_access` is raised by MS-08 (below); the MS-09 `refund_stalled`
signal is declared in `lib/fraud/constants.ts` and only needs `openFraudCase`.

**Appeals.** One per block. The owner records it (the buyer reaches support
through the contact on the blocked screen) and decides within three working days
(Mon to Fri, Asia/Jakarta, no holiday list). Granting lifts the block in the same
transaction. A denied appeal can be reopened on new evidence. All of it is also
written to the block's case.

**Reports.** A daily summary email to `MAINTENANCE_ALERT_EMAIL` (counts only) and
`/admin/fraud/report`, a monthly page of aggregates with no raw IP, email, phone,
device or account id.

## Delivery, receipts, terms and the dispute export (MS-08 phase A)

**Grant in the payment transaction.** `fulfillPaidOrder` (`lib/fulfillment/grant.ts`)
runs inside the transaction that accepts a payment: the MS-04 grant
(`grantPaidAccess` in `lib/billing/service.ts`, source `payment`, key
`order:<id>`), the receipt, the in-app notification, and the receipt email job
commit or roll back with the payment. Plan rules: Monthly extends one calendar
month from the current end while access runs, otherwise from now; Full Access
ends on `FULL_ACCESS_ENDS_ON_<TARGET>` or keeps a later end the account already
has; Monthly is refused at checkout while Full Access runs (`full_access_active`
in `lib/payments/risk/reserve.ts`, shown as a calm notice).

**When the grant cannot happen** (Full Access date unset or passed, access
paused, unknown plan or student, or an unexpected error inside a savepoint) the
order stays `paid`, the receipt stays `pending` with a reason, and an
`access_grant` outbox job retries. The daily maintenance step
(`runFulfillmentMaintenance`) retries every pending receipt itself, then opens
an MS-07 `capture_without_access` case and queues a critical alert for any
receipt still pending after 1 hour (database time). An order held for review
(blocked buyer, late success, second capture) gets no receipt and no grant.

**Receipt.** `payment_receipts`: one per paid order, written pending, moved to
`delivered` once (with the grant event, window and time), never deleted.
`receipt_deliveries` is append-only: the in-app notification (the delivery
evidence of G5) and each email attempt, with at most one `sent` row per channel.
The email goes through Resend (`lib/fulfillment/receipt-email.ts`; outside
production only to `EMAIL_DEV_REDIRECT`); its idempotency key is the receipt.

**Terms.** `lib/fulfillment/terms.ts` holds the "Syarat Pembelian" text and its
version; the public page is `/syarat-pembelian`, linked from pricing and
checkout, and marked as a draft until `status` is set to `approved` by the owner.
Checkout needs the tick; the intent and the order store the version, and a
trigger refuses an order whose intent has none. Change the text and the version
together.

**Usage evidence.** `fulfillment_usage_events`: written by `recordPaidUse` where
a student enters a paid surface (`enterPaidSurface`, whether or not
`PAID_ACCESS_ENFORCED` is on; the switch only decides who is let in), at most
one row per grant per Asia/Jakarta day, only for access that came from a payment
and only while the student's current access is active (paused or revoked access
records nothing). Nothing else writes it.

**Dispute export.** `/admin/fraud/orders/<id>` (a "Pesanan" tab): the owner
(`FRAUD_OWNER_EMAIL`, verified second factor) gives a written reason and gets a
packet for that one order: manifest, financial timeline, grant, receipt and use
evidence, IP and device provenance, the accepted terms, refund and dispute
records with their history, communications (the buyer's refund requests,
receipt deliveries and dispute notices), case summaries, and a SHA-256 over the sorted-key
JSON of the packet. Other students' data and case evidence are left out. Every
export writes a `dispute_exports` row and an audit event in one transaction. The
download link (`/api/admin/dispute-exports/<token>`) works once, for 10 minutes,
only in an owner session; the packet is dropped from the row when it is handed
over or expires, and the row, reason and digest stay.

## Refunds and disputes (MS-09 phase A)

Built against the stand-in; E2Pay's refund and dispute formats are phase B.
Rules are the "Refund eligibility" row of the MS-00 decision record (closed
4 November 2026). Code is in `lib/refunds/*`; the admin screens are on
`/admin/fraud/orders/<id>` and the list `/admin/fraud/refunds`.

**A refund case** (`refund_cases`, history in `refund_case_events`) records the
order and captured payment, the reason (our fault: double charge, wrong amount,
access not delivered, service unavailable; or change of mind), the buyer's
request (channel, date, note), the amount, who prepared it, who approved it and
why, the system's eligibility check, the deadlines (decision: 3 working days
from the request, Mon-Fri Asia/Jakarta, no holiday list; payout: 14 calendar
days from approval), the method, the provider refund id or the manual transfer
(masked destination, holder, reference, proof note), and what the confirmation
did to access.

| Step | Who | What it does |
| --- | --- | --- |
| prepare | any admin with a verified second factor | writes the case and the eligibility check; reserves nothing |
| approve | the owner (`FRAUD_OWNER_EMAIL`) only, written reason | **reserves the balance**; refused for a change of mind that fails the check; stored as `self_approved` when the owner also prepared it |
| reject / cancel | the owner | frees the balance |
| send to provider | the owner | `processing` is committed **before** the call; see "Timeout" |
| manual transfer | the owner | destination (4 digits at most), holder (buyer or parent), reference, proof note; completes the case |
| confirmation | the provider's signed event or status | completes a provider refund |

**Eligibility** (`lib/refunds/eligibility.ts`, repeated by the database at
approval): our-fault reasons are always eligible; change of mind is eligible
only if the buyer's request arrived within 3 days of payment (inclusive) **and**
the order has no `fulfillment_usage_events` row at all. For an order held in
review the first succeeded event stands in for the payment time. A change of
mind may be partial; the policy only says it is owed in full.

**Balance.** `refund_capture_amount` (the order's payment, or an unexpected
second capture held in review) minus approved, processing and completed refunds
minus lost disputes. A trigger takes the order lock and refuses an approval that
would pass the capture, so concurrent and partial refunds cannot exceed it,
whatever the application did. Cases beyond the capture cannot even be prepared.

**Timeout.** A provider call that times out is an unknown outcome, not a
failure: the case is marked `outcome_unknown` and cannot be sent again until
`reconcileRefund` has asked the provider (`getRefundStatus`). No record there
means the request never arrived and sending again is allowed; a record means the
case follows it (pending: wait; succeeded: complete; failed: fail). The
provider is given the case reference as its idempotency key every time. The
daily job reconciles every refund still with the provider, so a lost
confirmation is settled from status.

**Completion** only on a verified confirmation: a refund event that passed the
payment inbox (signature, freshness, merchant, currency, buyer, package, then
reference, payment and amount against the case), the provider's own status, or
the owner confirming a manual transfer. Then, in one transaction: the history
row, the case, the purchase summary (`refunded` when the order's payment is
refunded in full) and the access change.

- A refund that brings the order's refunds to the whole payment revokes access
  (MS-04, G5). A partial refund keeps access unless the owner ticked "akhiri
  akses" at approval. A payment held in review never granted access, so
  refunding it takes none away.
- The MS-06 allowance is never restored: the reservation and the day bucket are
  not touched.
- `findStandingPaidOrder` (the tier seam) stops counting an order once a refund
  on it is approved, or any dispute exists on it, won ones included.
- Terminal states never change (trigger). A refunded or cancelled
  `package_purchases` row can no longer be set back to `succeeded` (trigger),
  the provisional callback refuses it with `purchase_closed`, and a late
  `payment.succeeded`, `failed` or `expired` is ignored on a paid order. A late
  or contradicting refund event on a finished case is kept for review and never
  applied.
- A refund not finished 3 working days after the request (or 14 days after
  approval) opens an MS-07 `refund_stalled` case in the daily payment step.

**Disputes** (`payment_disputes`, history in `payment_dispute_events`). Created
by the owner from a provider notice, or by a `dispute.opened` event from the
inbox. One open dispute per payment. While open: access is paused, and
`evidence_hold` is true; **MS-10's retention job must not delete the order's
evidence while any `evidence_hold` (dispute or open refund case) is true**.
Won: access resumes (only if this dispute paused it and no other open dispute
holds it). Lost: access is revoked and the amount counts against the balance.
A resolved dispute is final; a contradicting event is kept for review.

**The refund-versus-dispute rule.** The order row is locked by every step, so
one happens strictly before the other.

1. While a dispute is open on a payment, no refund on it can be approved, sent
   to the provider or confirmed as a manual transfer (the database refuses it
   too). Preparing and cancelling stay allowed.
2. A refund already with the provider when the dispute opens is **not recalled**:
   it finishes or fails on its own confirmation. The dispute is flagged
   `refund_in_flight`, and the owner gets a `payment_review` case and a critical
   alert to tell the provider. If that dispute is then lost, the owner is alerted
   again because the money went out twice.
3. A refund not sent yet is held. If the dispute is lost the provider already
   took the money back, so unsent cases are cancelled by the system; if won, the
   held refund may go ahead.

**Orders in review** are settled by the owner: accept the payment
(`acceptReviewedOrder`: purchase summary, reservation back to `paid`, then the
MS-08 `fulfillPaidOrder`), or prepare a refund for it. Accepting is refused once a refund is approved or
done, or a dispute is open.

**Stand-in.** `createRefund` and `getRefundStatus` on the adapter; the stand-in
keeps `stand_in_refunds`, is idempotent on the case reference, refuses to refund
more than it captured, and can be told to lose the next call (`failNextRefundCall`).
The console `/pay/stand-in/refund/<reference>` (admin, local database only)
reports a refund as succeeded or failed through the real inbox. Dispute events
are built by `buildSignedDisputeEventFor` in tests; there is no screen for them.

## Tests

`test:payment-inbox`, `test:payment-orders`, `test:payment-outbox`,
`test:payment-provider`, `test:payment-reconcile`, `test:risk-limits`,
`test:fraud-blocks`, `test:fraud-cases`, `test:fulfillment`, `test:dispute-export`,
`test:refunds`, `test:disputes`, plus `test:checkout-intent`,
`test:affiliator`, `test:daily-maintenance` and `test:daily-maintenance-db`. The
payment suites only run against the local database. Orders and payment events
cannot be deleted, so every run leaves its own rows behind there; reseed
(`pnpm db:reset`) to clear them.
