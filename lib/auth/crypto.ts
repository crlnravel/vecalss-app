import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";

import { PASSWORD_MIN_LENGTH } from "./constants";

const BCRYPT_ROUNDS = 12;
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
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

function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include uppercase, lowercase, and number characters.";
  }

  return null;
}

async function hashPassword(password: string) {
  return hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

function generateTemporaryPassword(length = TEMP_PASSWORD_LENGTH) {
  const bytes = randomBytes(length);
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += TEMP_PASSWORD_ALPHABET[bytes[index] % TEMP_PASSWORD_ALPHABET.length];
  }

  if (!/[a-z]/.test(password)) {
    password = `a${password.slice(1)}`;
  }

  if (!/[A-Z]/.test(password)) {
    password = `A${password.slice(1)}`;
  }

  if (!/[0-9]/.test(password)) {
    password = `${password.slice(0, -1)}7`;
  }

  return password;
}

export {
  createOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
  verifyPassword,
};
