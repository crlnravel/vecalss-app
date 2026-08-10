import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { EnrollmentHandoffMethod } from "@/generated/prisma/client";
import { getAppBaseUrl } from "@/lib/config";

const ENVELOPE_VERSION = 1;
const AAD_VERSION = 1;
const AES_ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const ENVELOPE_FIELDS = [
  "version",
  "keyId",
  "nonce",
  "ciphertext",
  "authTag",
  "aadVersion",
] as const;

type EnrollmentHandoffEnvelope = {
  version: number;
  keyId: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
  aadVersion: number;
};

type EnrollmentHandoffKeyRing = {
  activeKeyId: string;
  keys: Readonly<Record<string, Buffer>>;
};

type EnvelopeContext = {
  handoffId: string;
  userId: string;
  method: EnrollmentHandoffMethod | "invite_link" | "temporary_password";
  envelopeVersion?: number;
  aadVersion?: number;
};

type EnvelopeErrorCode =
  | "missing_key_ring"
  | "invalid_key_ring"
  | "missing_active_key"
  | "invalid_key_size"
  | "unknown_key_id"
  | "invalid_envelope"
  | "invalid_aad"
  | "authentication_failed"
  | "invalid_base_url";

class EnrollmentHandoffCryptoError extends Error {
  readonly code: EnvelopeErrorCode;

  constructor(code: EnvelopeErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentHandoffCryptoError";
    this.code = code;
  }
}

function cryptoError(code: EnvelopeErrorCode, message: string): never {
  throw new EnrollmentHandoffCryptoError(code, message);
}

function decodeBase64(value: unknown, field: string, expectedBytes?: number) {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    cryptoError("invalid_envelope", `${field} is not valid base64.`);
  }

  const decoded = Buffer.from(value, "base64");

  // Buffer.from is intentionally permissive. Round-tripping rejects strings
  // with ignored characters and gives us deterministic fail-closed parsing.
  if (decoded.toString("base64") !== value) {
    cryptoError("invalid_envelope", `${field} is not canonical base64.`);
  }

  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) {
    cryptoError("invalid_envelope", `${field} has an invalid length.`);
  }

  return decoded;
}

function parseKeyRingValue(raw: unknown): Record<string, Buffer> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    cryptoError("invalid_key_ring", "The handoff key ring must be a JSON object.");
  }

  const entries = Object.entries(raw as Record<string, unknown>);

  if (!entries.length) {
    cryptoError("invalid_key_ring", "The handoff key ring must contain at least one key.");
  }

  const keys: Record<string, Buffer> = {};

  for (const [keyId, encodedKey] of entries) {
    if (
      !keyId
      || keyId.length > 120
      || keyId.includes("/")
      || keyId === "__proto__"
      || keyId === "constructor"
      || keyId === "prototype"
    ) {
      cryptoError("invalid_key_ring", "The handoff key ring contains an invalid key ID.");
    }

    if (typeof encodedKey !== "string") {
      cryptoError("invalid_key_size", `Key ${keyId} is not base64 text.`);
    }

    let key: Buffer;
    try {
      key = decodeBase64(encodedKey, `Key ${keyId}`, KEY_BYTES);
    } catch (error) {
      if (error instanceof EnrollmentHandoffCryptoError && error.code === "invalid_envelope") {
        cryptoError("invalid_key_size", `Key ${keyId} must be a base64-encoded 32-byte key.`);
      }

      throw error;
    }

    keys[keyId] = key;
  }

  return keys;
}

function validateEnrollmentHandoffKeyRing(
  input: unknown,
  activeKeyId: string,
): EnrollmentHandoffKeyRing {
  if (typeof activeKeyId !== "string" || !activeKeyId.trim()) {
    cryptoError("missing_active_key", "ENROLLMENT_HANDOFF_ACTIVE_KEY_ID is required.");
  }

  const keys = parseKeyRingValue(input);
  const normalizedActiveKeyId = activeKeyId.trim();

  if (
    !Object.prototype.hasOwnProperty.call(keys, normalizedActiveKeyId)
    || !Buffer.isBuffer(keys[normalizedActiveKeyId])
  ) {
    cryptoError("missing_active_key", "The configured active handoff key is not in the key ring.");
  }

  return {
    activeKeyId: normalizedActiveKeyId,
    keys,
  };
}

function loadEnrollmentHandoffKeyRing(
  env: NodeJS.ProcessEnv = process.env,
): EnrollmentHandoffKeyRing {
  const rawRing = env.ENROLLMENT_HANDOFF_KEY_RING?.trim();
  const activeKeyId = env.ENROLLMENT_HANDOFF_ACTIVE_KEY_ID?.trim();

  if (!rawRing) {
    cryptoError("missing_key_ring", "ENROLLMENT_HANDOFF_KEY_RING is required.");
  }

  if (!activeKeyId) {
    cryptoError("missing_active_key", "ENROLLMENT_HANDOFF_ACTIVE_KEY_ID is required.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRing);
  } catch {
    cryptoError("invalid_key_ring", "ENROLLMENT_HANDOFF_KEY_RING must be valid JSON.");
  }

  return validateEnrollmentHandoffKeyRing(parsed, activeKeyId);
}

function createAad({
  aadVersion = AAD_VERSION,
  envelopeVersion = ENVELOPE_VERSION,
  handoffId,
  method,
  userId,
}: EnvelopeContext) {
  if (
    !handoffId
    || !userId
    || !["invite_link", "temporary_password"].includes(method)
    || aadVersion !== AAD_VERSION
    || envelopeVersion !== ENVELOPE_VERSION
  ) {
    cryptoError("invalid_aad", "The handoff envelope AAD context is invalid.");
  }

  return Buffer.from(
    JSON.stringify({
      aadVersion,
      envelopeVersion,
      handoffId,
      method,
      userId,
    }),
    "utf8",
  );
}

function parseEnvelope(input: unknown): EnrollmentHandoffEnvelope {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    cryptoError("invalid_envelope", "The handoff envelope must be an object.");
  }

  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const expectedKeys = [...ENVELOPE_FIELDS].sort();

  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    cryptoError("invalid_envelope", "The handoff envelope shape is invalid.");
  }

  if (value.version !== ENVELOPE_VERSION || value.aadVersion !== AAD_VERSION) {
    cryptoError("invalid_envelope", "The handoff envelope version is unsupported.");
  }

  if (typeof value.keyId !== "string" || !value.keyId || value.keyId.length > 120) {
    cryptoError("invalid_envelope", "The handoff envelope key ID is invalid.");
  }

  decodeBase64(value.nonce, "nonce", NONCE_BYTES);
  decodeBase64(value.ciphertext, "ciphertext");
  decodeBase64(value.authTag, "authTag", AUTH_TAG_BYTES);

  return {
    authTag: value.authTag as string,
    aadVersion: value.aadVersion as number,
    ciphertext: value.ciphertext as string,
    keyId: value.keyId,
    nonce: value.nonce as string,
    version: value.version as number,
  };
}

function getKey(keyRing: EnrollmentHandoffKeyRing, keyId: string) {
  const key = Object.prototype.hasOwnProperty.call(keyRing.keys, keyId)
    ? keyRing.keys[keyId]
    : undefined;

  if (!key || !Buffer.isBuffer(key)) {
    cryptoError("unknown_key_id", "The handoff envelope references an unavailable key.");
  }

  if (key.byteLength !== KEY_BYTES) {
    cryptoError("invalid_key_size", "The handoff envelope key has an invalid size.");
  }

  return key;
}

function sealEnrollmentHandoffSecret(
  plaintext: string,
  context: EnvelopeContext,
  keyRing = loadEnrollmentHandoffKeyRing(),
): EnrollmentHandoffEnvelope {
  if (typeof plaintext !== "string" || !plaintext) {
    cryptoError("invalid_envelope", "The handoff secret must be non-empty text.");
  }

  const key = getKey(keyRing, keyRing.activeKeyId);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce);
  cipher.setAAD(createAad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  if (authTag.byteLength !== AUTH_TAG_BYTES) {
    cryptoError("invalid_envelope", "The AEAD provider returned an invalid authentication tag.");
  }

  return {
    authTag: authTag.toString("base64"),
    aadVersion: AAD_VERSION,
    ciphertext: ciphertext.toString("base64"),
    keyId: keyRing.activeKeyId,
    nonce: nonce.toString("base64"),
    version: ENVELOPE_VERSION,
  };
}

function openEnrollmentHandoffSecret(
  input: unknown,
  context: EnvelopeContext,
  keyRing = loadEnrollmentHandoffKeyRing(),
) {
  const envelope = parseEnvelope(input);
  const key = getKey(keyRing, envelope.keyId);
  const nonce = decodeBase64(envelope.nonce, "nonce", NONCE_BYTES);
  const ciphertext = decodeBase64(envelope.ciphertext, "ciphertext");
  const authTag = decodeBase64(envelope.authTag, "authTag", AUTH_TAG_BYTES);
  const decipher = createDecipheriv(AES_ALGORITHM, key, nonce);

  try {
    decipher.setAAD(createAad({ ...context, aadVersion: envelope.aadVersion, envelopeVersion: envelope.version }));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    cryptoError("authentication_failed", "The handoff envelope failed authentication.");
  }
}

function rewrapEnrollmentHandoffSecret(
  input: unknown,
  context: EnvelopeContext,
  keyRing = loadEnrollmentHandoffKeyRing(),
) {
  const plaintext = openEnrollmentHandoffSecret(input, context, keyRing);
  return sealEnrollmentHandoffSecret(plaintext, context, keyRing);
}

function getTrustedAppBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  try {
    return getAppBaseUrl(env);
  } catch (error) {
    cryptoError(
      "invalid_base_url",
      error instanceof Error ? error.message : "APP_BASE_URL is invalid.",
    );
  }
}

function buildEnrollmentInviteUrl(rawToken: string, env: NodeJS.ProcessEnv = process.env) {
  if (!rawToken || typeof rawToken !== "string") {
    cryptoError("invalid_aad", "An invite token is required to build the invite URL.");
  }

  return `${getTrustedAppBaseUrl(env)}/invite/${encodeURIComponent(rawToken)}`;
}

function validateEnrollmentHandoffConfiguration(env: NodeJS.ProcessEnv = process.env) {
  return {
    baseUrl: getTrustedAppBaseUrl(env),
    keyRing: loadEnrollmentHandoffKeyRing(env),
  };
}

const sealHandoffEnvelope = sealEnrollmentHandoffSecret;
const openHandoffEnvelope = openEnrollmentHandoffSecret;
const rewrapHandoffEnvelope = rewrapEnrollmentHandoffSecret;
const validateEnrollmentHandoffEnvelope = parseEnvelope;

export {
  AAD_VERSION,
  AUTH_TAG_BYTES,
  ENVELOPE_VERSION,
  EnrollmentHandoffCryptoError,
  KEY_BYTES,
  NONCE_BYTES,
  buildEnrollmentInviteUrl,
  createAad,
  getTrustedAppBaseUrl,
  loadEnrollmentHandoffKeyRing,
  openEnrollmentHandoffSecret,
  parseEnvelope,
  rewrapEnrollmentHandoffSecret,
  rewrapHandoffEnvelope,
  sealEnrollmentHandoffSecret,
  sealHandoffEnvelope,
  validateEnrollmentHandoffConfiguration,
  validateEnrollmentHandoffEnvelope,
  validateEnrollmentHandoffKeyRing,
  openHandoffEnvelope,
};

export type {
  EnrollmentHandoffEnvelope,
  EnrollmentHandoffKeyRing,
  EnvelopeContext,
  EnvelopeErrorCode,
};
