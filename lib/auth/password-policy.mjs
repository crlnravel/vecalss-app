/**
 * The one password rule. It is plain JavaScript with no Node or React imports
 * so the server, the seed scripts and the browser forms all run the same code.
 * The server stays the authority: forms only use it to answer sooner.
 *
 * A password must have:
 *  - at least PASSWORD_MIN_LENGTH characters (counted as Unicode code points,
 *    so an emoji is one character),
 *  - at most PASSWORD_MAX_BYTES UTF-8 bytes (bcrypt silently ignores anything
 *    past 72 bytes, so longer input is rejected instead of truncated),
 *  - an uppercase A-Z, a lowercase a-z and a digit 0-9 (ASCII, as before),
 *  - and a symbol: any character that is not a letter, digit, combining mark,
 *    control/format/unassigned character or whitespace in any script. A space
 *    is allowed in a password but never counts as the symbol, and an accented
 *    letter or a combining accent is not one either. Emoji and punctuation do.
 *
 * Passwords are never trimmed or normalized.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const SYMBOL_PATTERN = /[^\p{L}\p{N}\p{M}\p{C}\s]/u;

/** @typedef {"too_short" | "too_long" | "missing_class"} PasswordViolation */

/** @type {Record<PasswordViolation, string>} */
export const PASSWORD_VIOLATION_MESSAGES = {
  missing_class: "Password must include uppercase, lowercase, number, and symbol characters.",
  too_long: `Password must be at most ${PASSWORD_MAX_BYTES} bytes long.`,
  too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
};

/**
 * @param {unknown} password
 * @returns {PasswordViolation | null} the first rule the password breaks.
 */
export function getPasswordViolation(password) {
  if (typeof password !== "string") return "too_short";

  if (Array.from(password).length < PASSWORD_MIN_LENGTH) return "too_short";

  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "too_long";

  if (
    !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !SYMBOL_PATTERN.test(password)
  ) {
    return "missing_class";
  }

  return null;
}

/** Carries only the rule that failed, never the password. */
export class PasswordPolicyError extends Error {
  /** @param {PasswordViolation} violation */
  constructor(violation) {
    super(PASSWORD_VIOLATION_MESSAGES[violation]);
    this.name = "PasswordPolicyError";
    this.violation = violation;
  }
}

/** @param {unknown} password */
export function assertPasswordPolicy(password) {
  const violation = getPasswordViolation(password);
  if (violation) throw new PasswordPolicyError(violation);
}
