import { RoleName } from "@/generated/prisma/client";

import { RECOVERY_CODE_COUNT, SETUP_CODE_TTL_MINUTES } from "./codes.mjs";

/** Roles that must hold a verified second factor before any privilege applies. */
const MFA_REQUIRED_ROLES: readonly RoleName[] = [RoleName.admin, RoleName.developer];

/** A code is asked for at sign-in and again once this much time has passed. */
const MFA_REVERIFY_SECONDS = 12 * 60 * 60;

/** SHA-1, 6 digits, 30 seconds: what every authenticator app understands. */
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
/** One adjacent step of clock drift either way. */
const TOTP_EPOCH_TOLERANCE_SECONDS = TOTP_PERIOD_SECONDS;
const TOTP_ISSUER = "Vecalss";

/** Failed attempts per account and kind inside the window before it is blocked. */
const MFA_MAX_FAILED_ATTEMPTS = 5;
const MFA_ATTEMPT_WINDOW_MINUTES = 15;

type MfaAttemptKind = "challenge" | "recovery" | "setup";

export {
  MFA_ATTEMPT_WINDOW_MINUTES,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_REQUIRED_ROLES,
  MFA_REVERIFY_SECONDS,
  RECOVERY_CODE_COUNT,
  SETUP_CODE_TTL_MINUTES,
  TOTP_DIGITS,
  TOTP_EPOCH_TOLERANCE_SECONDS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
};
export type { MfaAttemptKind };
