/**
 * Limits and periods for student self-registration (MS-21). All of the limits
 * live in Postgres (registration_attempts), none in Redis, so they hold when
 * Redis is down and across server instances.
 */
const REGISTRATION_LIMITS = {
  /** Per normalized email: enough for a typo and a retry. */
  email: { max: 3, windowMinutes: 60 },
  /** Per client address. Schools share one address, so this is roomy (matches MS-06). */
  ip: { max: 20, windowMinutes: 60 },
} as const;

/** Verification emails one address can ask for again, per hour. Counted apart from signups. */
const RESEND_LIMITS = {
  email: { max: 3, windowMinutes: 60 },
  ip: { max: 20, windowMinutes: 60 },
} as const;

/** How long the link in the verification email works. */
const VERIFICATION_TOKEN_HOURS = 24;

/** The daily job removes a signup that is still unverified after this many days. */
const UNVERIFIED_SIGNUP_RETENTION_DAYS = 7;

const MAX_FULL_NAME_LENGTH = 120;
const MIN_FULL_NAME_LENGTH = 2;
const MAX_EMAIL_LENGTH = 254;

export {
  MAX_EMAIL_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MIN_FULL_NAME_LENGTH,
  REGISTRATION_LIMITS,
  RESEND_LIMITS,
  UNVERIFIED_SIGNUP_RETENTION_DAYS,
  VERIFICATION_TOKEN_HOURS,
};
