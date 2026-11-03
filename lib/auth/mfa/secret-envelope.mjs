/**
 * Seals an authenticator secret with AES-256-GCM under the MFA key ring.
 *
 * The shape follows lib/admin/handoffs/envelope.ts (version, key ID, nonce,
 * ciphertext, tag, AAD version) but uses its own environment variables, so a
 * leak of one key ring says nothing about the other. The owner of the factor is
 * bound as authenticated context: an envelope copied onto another account
 * fails authentication. Plain .mjs so the seed and the operator script can
 * share it with the app.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENVELOPE_VERSION = 1;
const AAD_VERSION = 1;
const AES_ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENVELOPE_FIELDS = ["aadVersion", "authTag", "ciphertext", "keyId", "nonce", "version"];

export class MfaSecretError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "MfaSecretError";
    this.code = code;
  }
}

/** @returns {never} */
function fail(code, message) {
  throw new MfaSecretError(code, message);
}

function decodeBase64(value, field, expectedBytes) {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    fail("invalid_envelope", `${field} is not valid base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) fail("invalid_envelope", `${field} is not canonical base64.`);
  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) {
    fail("invalid_envelope", `${field} has an invalid length.`);
  }
  return decoded;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ activeKeyId: string, keys: Record<string, Buffer> }}
 */
export function loadMfaKeyRing(env = process.env) {
  const rawRing = env.MFA_KEY_RING?.trim();
  const activeKeyId = env.MFA_ACTIVE_KEY_ID?.trim();
  if (!rawRing) fail("missing_key_ring", "MFA_KEY_RING is required.");
  if (!activeKeyId) fail("missing_active_key", "MFA_ACTIVE_KEY_ID is required.");

  let parsed;
  try {
    parsed = JSON.parse(rawRing);
  } catch {
    fail("invalid_key_ring", "MFA_KEY_RING must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail("invalid_key_ring", "MFA_KEY_RING must be a JSON object of key ID to base64 key.");
  }

  const keys = Object.create(null);
  for (const [keyId, encoded] of Object.entries(parsed)) {
    if (!keyId || keyId.length > 120 || keyId === "__proto__" || keyId === "constructor" || keyId === "prototype") {
      fail("invalid_key_ring", "MFA_KEY_RING contains an invalid key ID.");
    }
    try {
      keys[keyId] = decodeBase64(encoded, `Key ${keyId}`, KEY_BYTES);
    } catch {
      fail("invalid_key_size", `Key ${keyId} must be a base64-encoded 32-byte key.`);
    }
  }
  if (!Object.keys(keys).length) fail("invalid_key_ring", "MFA_KEY_RING must contain at least one key.");
  if (!Object.prototype.hasOwnProperty.call(keys, activeKeyId)) {
    fail("missing_active_key", "MFA_ACTIVE_KEY_ID is not in MFA_KEY_RING.");
  }

  return { activeKeyId, keys };
}

function aad({ factorId, userId }) {
  if (!factorId || !userId) fail("invalid_aad", "The factor owner is required as authenticated context.");
  return Buffer.from(JSON.stringify({ aadVersion: AAD_VERSION, factorId, purpose: "totp-secret", userId }), "utf8");
}

function keyFor(keyRing, keyId) {
  const key = Object.prototype.hasOwnProperty.call(keyRing.keys, keyId) ? keyRing.keys[keyId] : undefined;
  if (!key) fail("unknown_key_id", "The secret was sealed under a key that is not in the key ring.");
  return key;
}

/**
 * @param {string} plaintext base32 TOTP secret
 * @param {{ factorId: string, userId: string }} context
 */
export function sealMfaSecret(plaintext, context, keyRing = loadMfaKeyRing()) {
  if (typeof plaintext !== "string" || !plaintext) fail("invalid_envelope", "The secret must be non-empty text.");
  const key = keyFor(keyRing, keyRing.activeKeyId);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    aadVersion: AAD_VERSION,
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    keyId: keyRing.activeKeyId,
    nonce: nonce.toString("base64"),
    version: ENVELOPE_VERSION,
  };
}

/**
 * @param {unknown} input
 * @param {{ factorId: string, userId: string }} context
 * @returns {string}
 */
export function openMfaSecret(input, context, keyRing = loadMfaKeyRing()) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail("invalid_envelope", "The envelope must be an object.");
  }
  const value = /** @type {Record<string, unknown>} */ (input);
  const keys = Object.keys(value).sort();
  if (keys.length !== ENVELOPE_FIELDS.length || keys.some((field, index) => field !== ENVELOPE_FIELDS[index])) {
    fail("invalid_envelope", "The envelope shape is invalid.");
  }
  if (value.version !== ENVELOPE_VERSION || value.aadVersion !== AAD_VERSION) {
    fail("invalid_envelope", "The envelope version is unsupported.");
  }
  if (typeof value.keyId !== "string" || !value.keyId || value.keyId.length > 120) {
    fail("invalid_envelope", "The envelope key ID is invalid.");
  }

  const key = keyFor(keyRing, value.keyId);
  const nonce = decodeBase64(value.nonce, "nonce", NONCE_BYTES);
  const ciphertext = decodeBase64(value.ciphertext, "ciphertext");
  const authTag = decodeBase64(value.authTag, "authTag", AUTH_TAG_BYTES);
  const decipher = createDecipheriv(AES_ALGORITHM, key, nonce);

  try {
    decipher.setAAD(aad(context));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    fail("authentication_failed", "The secret failed authentication.");
  }
}

/** Re-seals under the active key, for rotation by key ID. */
export function rewrapMfaSecret(input, context, keyRing = loadMfaKeyRing()) {
  return sealMfaSecret(openMfaSecret(input, context, keyRing), context, keyRing);
}
