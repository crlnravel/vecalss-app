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
   `package_purchases` summary (affiliator conversions), an audit event and the
   outbox jobs. `lib/payments/inbox.ts` has a marked place where MS-08 adds the
   access grant to this same transaction.

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
parked as `dead` after 8 attempts. Receipt emails are a stub until MS-08.

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

## Tests

`test:payment-inbox`, `test:payment-orders`, `test:payment-outbox`,
`test:payment-provider`, `test:payment-reconcile`, `test:risk-limits`, plus `test:checkout-intent`,
`test:affiliator`, `test:daily-maintenance` and `test:daily-maintenance-db`. The
payment suites only run against the local database. Orders and payment events
cannot be deleted, so every run leaves its own rows behind there; reseed
(`pnpm db:reset`) to clear them.
