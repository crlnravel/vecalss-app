# Payments: orders, the payment inbox and the outbox

Phase A of MS-05. Everything provider-independent is built against a dev-only
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

## Tests

`test:payment-inbox`, `test:payment-orders`, `test:payment-outbox`,
`test:payment-provider`, `test:payment-reconcile`, plus `test:checkout-intent`,
`test:affiliator`, `test:daily-maintenance` and `test:daily-maintenance-db`. The
payment suites only run against the local database. Orders and payment events
cannot be deleted, so every run leaves its own rows behind there; reseed
(`pnpm db:reset`) to clear them.
