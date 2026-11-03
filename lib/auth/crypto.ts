import { createHash, randomBytes, randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "./constants";
import {
  PASSWORD_VIOLATION_MESSAGES,
  assertPasswordPolicy,
  getPasswordViolation,
} from "./password-policy.mjs";

const BCRYPT_ROUNDS = 12;
// Look-alike characters (I, O, l, 0, 1) are left out so a temporary password
// can be read aloud or retyped.
const TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_SYMBOLS = "!@#$%";
const TEMP_PASSWORD_ALPHABET =
  TEMP_PASSWORD_UPPER + TEMP_PASSWORD_LOWER + TEMP_PASSWORD_DIGITS + TEMP_PASSWORD_SYMBOLS;
const TEMP_PASSWORD_LENGTH = 14;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createOpaqueToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

/** Returns the English reason a password breaks the rule, or null when it complies. */
function validatePassword(password: string) {
  const violation = getPasswordViolation(password);
  return violation ? PASSWORD_VIOLATION_MESSAGES[violation] : null;
}

/**
 * Hashes a password someone will sign in with. The password rule is enforced
 * here as well, so no write path can store a non-compliant password even if
 * it forgets to validate first. The error names the broken rule, never the
 * password.
 */
async function hashPassword(password: string) {
  assertPasswordPolicy(password);
  return hash(password, BCRYPT_ROUNDS);
}

/**
 * Hashes a random secret nobody knows, for an account whose password is set
 * later through an invite link. It is not a password and skips the rule.
 */
async function hashUnusableCredential(secret: string) {
  return hash(secret, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

function pickFrom(characters: string) {
  return characters[randomInt(characters.length)];
}

/**
 * Builds a temporary password with one character from every required
 * category, fills the rest from the whole alphabet, then shuffles. Every
 * choice uses crypto.randomInt, which has no modulo bias.
 */
function generateTemporaryPassword(length = TEMP_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_BYTES) {
    throw new RangeError(
      `Temporary password length must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_BYTES}.`,
    );
  }

  const characters = [
    pickFrom(TEMP_PASSWORD_UPPER),
    pickFrom(TEMP_PASSWORD_LOWER),
    pickFrom(TEMP_PASSWORD_DIGITS),
    pickFrom(TEMP_PASSWORD_SYMBOLS),
  ];
  while (characters.length < length) characters.push(pickFrom(TEMP_PASSWORD_ALPHABET));

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

export {
  createOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  hashUnusableCredential,
  normalizeEmail,
  validatePassword,
  verifyPassword,
};
