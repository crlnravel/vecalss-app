import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import {
  PasswordPolicyError,
  getPasswordViolation,
  type PasswordViolation,
} from "@/lib/auth/password-policy.mjs";

const PASSWORD_REQUIREMENTS_COPY = `Gunakan minimal ${PASSWORD_MIN_LENGTH} karakter, dengan huruf besar, huruf kecil, angka, dan satu simbol seperti ! atau #.`;

/**
 * What a person reads when the password misses the rule. `subject` is the
 * password being set: "baru" for your own, "siswa" for a student's.
 */
function describePasswordViolation(violation: PasswordViolation, subject: "baru" | "siswa" = "baru") {
  if (violation === "too_short") {
    return `Kata sandi ${subject} harus terdiri dari minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }

  if (violation === "too_long") {
    return `Kata sandi ${subject} terlalu panjang. Persingkat sedikit, lalu coba lagi.`;
  }

  return `Kata sandi ${subject} harus memuat huruf besar, huruf kecil, angka, dan satu simbol seperti ! atau #. Spasi tidak dihitung sebagai simbol.`;
}

/** Answers before sending, using the same rule the server applies. */
function describePasswordProblem(password: string, subject: "baru" | "siswa" = "baru") {
  const violation = getPasswordViolation(password);
  return violation ? describePasswordViolation(violation, subject) : null;
}

function isPasswordPolicyError(error: unknown): error is PasswordPolicyError {
  return error instanceof PasswordPolicyError;
}

export {
  PASSWORD_REQUIREMENTS_COPY,
  describePasswordProblem,
  describePasswordViolation,
  isPasswordPolicyError,
};
