/**
 * One-use codes shared by the app, the seed and the operator script: setup
 * codes (typed once at enrollment) and recovery codes (typed instead of an
 * authenticator code). Both are random and stored only as SHA-256 hashes; with
 * 60 bits of entropy and per-account throttling a plain hash is enough.
 */
import { createHash, randomInt } from "node:crypto";

export const RECOVERY_CODE_COUNT = 10;
export const SETUP_CODE_TTL_MINUTES = 30;

// Crockford-style base32: no I, L, O or U, so codes survive being read aloud.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 3;
const GROUP_LENGTH = 4;

export function generateOneUseCode() {
  const groups = [];
  for (let group = 0; group < GROUPS; group += 1) {
    let chunk = "";
    for (let index = 0; index < GROUP_LENGTH; index += 1) chunk += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(chunk);
  }
  return groups.join("-");
}

/** Uppercases and maps look-alikes, so "o" and "0" or "l" and "1" match. Returns null if not code-shaped. */
export function normalizeOneUseCode(value) {
  if (typeof value !== "string") return null;
  const compact = value
    .toUpperCase()
    .replace(/[\s-]/gu, "")
    .replace(/O/gu, "0")
    .replace(/[IL]/gu, "1");
  if (compact.length !== GROUPS * GROUP_LENGTH || ![...compact].every((char) => ALPHABET.includes(char))) return null;
  return compact;
}

export function hashOneUseCode(normalized) {
  return createHash("sha256").update(`vecalss-mfa-code:${normalized}`).digest("hex");
}
