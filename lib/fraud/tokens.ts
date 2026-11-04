import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { FraudConfigError } from "./errors";
import type { FraudBlockType } from "./constants";

/**
 * Lookup tokens. A block never stores the email, phone number, device cookie or
 * address it covers: it stores an HMAC of the normalized value under a server
 * secret, so the table cannot be read back into identifiers and a leaked copy
 * cannot be searched for a known one. The account block uses the user id.
 *
 * Rotating the secret orphans every stored token, so it is a deliberate
 * migration, not a settings change (docs/payments.md).
 */

const DEV_SECRET = "vecalss-fraud-lookup-dev-only-not-a-secret";
const MIN_SECRET_LENGTH = 32;

type TokenEnv = Partial<Record<string, string | undefined>>;

/** The secret, or a thrown FraudConfigError in production when it is missing or weak. */
function getLookupSecret(env: TokenEnv = process.env) {
  const configured = env.FRAUD_LOOKUP_SECRET?.trim();

  if (configured) {
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new FraudConfigError(`FRAUD_LOOKUP_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    }
    return configured;
  }

  if (env.NODE_ENV === "production") {
    throw new FraudConfigError("FRAUD_LOOKUP_SECRET is required in production.");
  }

  return DEV_SECRET;
}

/** Whether lookups can be trusted here. Checkout stays closed when this is false. */
function isLookupSecretAvailable(env: TokenEnv = process.env) {
  try {
    getLookupSecret(env);
    return true;
  } catch {
    return false;
  }
}

function lookupToken(type: Exclude<FraudBlockType, "account">, normalized: string, env: TokenEnv = process.env) {
  return createHmac("sha256", getLookupSecret(env)).update(`vecalss-fraud-v1:${type}:${normalized}`).digest("hex");
}

function normalizeEmailValue(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) && email.length <= 254 ? email : null;
}

/** Indonesian numbers in one form: digits only, country code 62 first. */
function normalizePhoneValue(value: string) {
  let digits = value.replace(/\D/gu, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 9 && digits.length <= 15 && digits.startsWith("62") ? digits : null;
}

/** One canonical text per address (an IPv4-mapped IPv6 address is the IPv4 one). */
function normalizeIpValue(value: string) {
  const text = value.trim().toLowerCase();
  const kind = isIP(text);
  if (kind === 4) return text;
  if (kind !== 6) return null;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];

  try {
    return new URL(`http://[${text}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** A fresh device cookie value: 32 random bytes, URL-safe. */
function newDeviceToken() {
  return randomBytes(32).toString("base64url");
}

function isValidDeviceToken(value: string | null | undefined): value is string {
  return typeof value === "string" && DEVICE_TOKEN_PATTERN.test(value);
}

function normalizeIdentifier(type: Exclude<FraudBlockType, "account">, raw: string) {
  switch (type) {
    case "email":
      return normalizeEmailValue(raw);
    case "phone":
      return normalizePhoneValue(raw);
    case "ip":
      return normalizeIpValue(raw);
    case "device":
      return isValidDeviceToken(raw.trim()) ? raw.trim() : null;
  }
}

/** The token a stored identifier is looked up by, or null when the value is not valid for its type. */
function tokenFor(type: Exclude<FraudBlockType, "account">, raw: string, env: TokenEnv = process.env) {
  const normalized = normalizeIdentifier(type, raw);
  return normalized === null ? null : lookupToken(type, normalized, env);
}

/** A masked label for the admin list. It cannot be reversed into the identifier. */
function hintFor(type: FraudBlockType, normalizedOrId: string) {
  switch (type) {
    case "account":
      return `Akun ${normalizedOrId.slice(0, 8)}`;
    case "email": {
      const [local, domain] = normalizedOrId.split("@");
      const dot = domain.lastIndexOf(".");
      return `${local.slice(0, 2)}***@${domain.slice(0, 1)}***${domain.slice(dot)}`;
    }
    case "phone":
      return `+${normalizedOrId.slice(0, 2)} ${normalizedOrId.slice(2, 3)}*** ***${normalizedOrId.slice(-2)}`;
    case "ip": {
      if (normalizedOrId.includes(":")) return `${normalizedOrId.split(":").slice(0, 2).join(":")}:****`;
      return `${normalizedOrId.split(".").slice(0, 2).join(".")}.*.*`;
    }
    case "device":
      return `Perangkat ${normalizedOrId.slice(0, 6)}…`;
  }
}

export {
  getLookupSecret,
  hintFor,
  isLookupSecretAvailable,
  isValidDeviceToken,
  lookupToken,
  newDeviceToken,
  normalizeEmailValue,
  normalizeIdentifier,
  normalizeIpValue,
  normalizePhoneValue,
  tokenFor,
};
