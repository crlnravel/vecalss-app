/**
 * How long a buyer has to pay once an order exists (decision G2). The order's
 * `expires_at` is the database time at creation plus this, and the provider
 * session is created with the same expiry. It may change with E2Pay's API.
 */
const PAYMENT_EXPIRY_MINUTES = 15;

const PAYMENT_CURRENCY = "IDR";

/** How far a signed event's timestamp may sit from database time. */
const EVENT_FRESHNESS_SECONDS = 5 * 60;

/** Largest event body the inbox reads. */
const MAX_EVENT_BODY_BYTES = 32 * 1024;

export { EVENT_FRESHNESS_SECONDS, MAX_EVENT_BODY_BYTES, PAYMENT_CURRENCY, PAYMENT_EXPIRY_MINUTES };
