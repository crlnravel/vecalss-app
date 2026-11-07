import "server-only";

import { after } from "next/server";

import { Prisma, RoleName, UserStatus } from "@/generated/prisma/client";
import { createOpaqueToken, hashPassword, hashToken, normalizeEmail } from "@/lib/auth/crypto";
import { getPasswordViolation, type PasswordViolation } from "@/lib/auth/password-policy.mjs";
import { getRequestMetadata } from "@/lib/auth/request";
import { getAppBaseUrl } from "@/lib/config";
import { buildExistingAccountEmail, buildVerificationEmail } from "@/lib/email/verification-email";
import { sendEmail } from "@/lib/email/mailer";
import { checkBlocks } from "@/lib/fraud/blocks";
import { readDeviceCookie } from "@/lib/fraud/device";
import { FraudConfigError } from "@/lib/fraud/errors";
import { flagBlockedSignup } from "@/lib/fraud/signals";
import { getPrivacyPolicy, getTermsOfService } from "@/lib/legal";
import type { LegalDocument } from "@/lib/legal/types";
import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import {
  MAX_EMAIL_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MIN_FULL_NAME_LENGTH,
  VERIFICATION_TOKEN_HOURS,
} from "./constants";
import { continuationQuery, readContinuation } from "./links";
import { getRegistrationStatus } from "./switch";
import { consumeRegistrationAttempt, hashRegistrationEmail } from "./throttle";
import { createTurnstileVerifier, type TurnstileVerifier } from "./turnstile";

/**
 * Student self-registration (MS-21): signup, resending the verification link,
 * and verifying the email. Nothing here tells anyone whether an address has an
 * account: signup answers the same way for a new address, an existing account,
 * a blocked identifier and a refused-by-fraud-rule attempt, and the only place
 * the difference shows up is the email the address's owner receives.
 */

type Env = NodeJS.ProcessEnv;

type RegistrationDeps = {
  env?: Env;
  /** The legal pages in force. Defaults to the current ones; tests supply approved ones. */
  legal?: { privacy: LegalDocument; terms: LegalDocument };
  /** The caller's trusted client address. Defaults to the request's; tests supply their own. */
  getMetadata?: () => Promise<{ ipAddress: string | null }>;
  mailer?: typeof sendEmail;
  now?: () => Date;
  /** The raw device cookie of the request, if it carries one. */
  readDeviceToken?: () => Promise<string | null>;
  /** Runs work after the response. Defaults to Next's after(); tests pass their own to observe it. */
  schedule?: (task: () => Promise<void>) => void;
  verifyTurnstile?: TurnstileVerifier;
};

type SignupInput = {
  ageConfirmed: boolean;
  email: string;
  fullName: string;
  password: string;
  ref?: unknown;
  returnTo?: unknown;
  turnstileToken: string | null;
};

type SignupFieldErrors = {
  ageConfirmed?: true;
  email?: "invalid";
  fullName?: "invalid";
  password?: PasswordViolation;
};

type SignupOutcome =
  | { status: "accepted"; deliveredVerificationUrl: string | null }
  | { status: "challenge_failed" }
  | { status: "closed" }
  | { errors: SignupFieldErrors; status: "invalid" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

type ResendOutcome =
  | { status: "accepted"; deliveredVerificationUrl: string | null }
  | { status: "closed" }
  | { status: "invalid" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

type VerifyOutcome = { status: "invalid" } | { status: "unavailable" } | { status: "verified" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function defaultSchedule(task: () => Promise<void>) {
  after(task);
}

/** Checks what the form sent. None of it depends on whether an account exists. */
function validateSignupInput(input: Pick<SignupInput, "ageConfirmed" | "email" | "fullName" | "password">) {
  const errors: SignupFieldErrors = {};
  const fullName = input.fullName.trim().replace(/\s+/gu, " ");
  const email = normalizeEmail(input.email);
  const nameLength = Array.from(fullName).length;

  if (nameLength < MIN_FULL_NAME_LENGTH || nameLength > MAX_FULL_NAME_LENGTH) errors.fullName = "invalid";
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) errors.email = "invalid";
  // The password is read exactly as typed (see lib/auth/password-policy.mjs).
  const violation = getPasswordViolation(input.password);
  if (violation) errors.password = violation;
  if (input.ageConfirmed !== true) errors.ageConfirmed = true;

  return Object.keys(errors).length > 0
    ? { errors, ok: false as const }
    : { email, fullName, ok: true as const };
}

type Consent = { consentedAt: Date; ipAddress: string | null; privacyVersion: string; termsVersion: string };

/** Ends every earlier link of this account and issues a new one carrying the consent. */
async function issueToken(tx: Prisma.TransactionClient, userId: string, consent: Consent, now: Date) {
  await tx.emailVerificationToken.updateMany({
    data: { usedAt: now },
    where: { usedAt: null, userId },
  });

  const rawToken = createOpaqueToken();
  const created = await tx.emailVerificationToken.create({
    data: {
      consentedAt: consent.consentedAt,
      expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_HOURS * 60 * 60 * 1000),
      ipAddress: consent.ipAddress,
      privacyVersion: consent.privacyVersion,
      termsVersion: consent.termsVersion,
      tokenHash: hashToken(rawToken),
      userId,
    },
    select: { id: true },
  });

  return { rawToken, tokenId: created.id };
}

function verifyUrlFor(env: Env, rawToken: string, continuation: ReturnType<typeof readContinuation>) {
  return `${getAppBaseUrl(env)}/daftar/verifikasi/${rawToken}${continuationQuery(continuation)}`;
}

type Plan =
  | { kind: "blocked" }
  | { kind: "existing"; fullName: string }
  | { kind: "none" }
  | { fullName: string; kind: "verify"; rawToken: string; tokenId: string };

function sendLater({
  label,
  message,
  mailer,
  schedule,
}: {
  label: "verification" | "existing";
  mailer: typeof sendEmail;
  message: Parameters<typeof sendEmail>[0];
  schedule: (task: () => Promise<void>) => void;
}) {
  schedule(async () => {
    try {
      await mailer(message);
    } catch (error) {
      // sendEmail does not throw; this only guards the callback itself.
      serverLogger.error(`registration.${label}_email.failed`, error, { area: "registration" });
    }
  });
}

/**
 * Starts a signup. Every branch after the checks that do not depend on the
 * address (the switch, the form, Turnstile, the limits) takes about the same
 * time: the password is hashed first, whatever the address turns out to be.
 */
async function registerStudent(input: SignupInput, deps: RegistrationDeps = {}): Promise<SignupOutcome> {
  const env = deps.env ?? process.env;
  const schedule = deps.schedule ?? defaultSchedule;
  const mailer = deps.mailer ?? sendEmail;
  const now = deps.now ?? (() => new Date());

  // Closed: nothing is read, written or sent.
  if (!getRegistrationStatus({ env, privacy: deps.legal?.privacy, terms: deps.legal?.terms }).open) return { status: "closed" };

  const checked = validateSignupInput(input);
  if (!checked.ok) return { errors: checked.errors, status: "invalid" };
  const { email, fullName } = checked;

  const { ipAddress } = await (deps.getMetadata ?? getRequestMetadata)();

  const challenge = await (deps.verifyTurnstile ?? createTurnstileVerifier({ env }))({
    ipAddress,
    token: input.turnstileToken,
  });
  if (challenge === "unavailable") return { status: "unavailable" };
  if (challenge === "failed") return { status: "challenge_failed" };

  // The limit counts every attempt alike, so it says nothing about accounts.
  if (!(await consumeRegistrationAttempt({ ipAddress, kind: "signup", normalizedEmail: email }))) {
    return { status: "rate_limited" };
  }

  const passwordHash = await hashPassword(input.password);
  const continuation = readContinuation(input);
  const deviceToken = await (deps.readDeviceToken ?? readDeviceCookie)().catch(() => null);
  const consentVersions = {
    privacyVersion: (deps.legal?.privacy ?? getPrivacyPolicy()).version,
    termsVersion: (deps.legal?.terms ?? getTermsOfService()).version,
  };

  const run = () =>
    prisma.$transaction(async (tx): Promise<Plan> => {
      const at = now();
      const user = await tx.user.findUnique({
        select: { emailVerifiedAt: true, fullName: true, id: true, previewPurpose: true, softDeletedAt: true, status: true },
        where: { email },
      });

      const blocks = await checkBlocks(tx, { deviceToken, email, ip: ipAddress, userId: user?.id ?? null });
      if (blocks.blocked) {
        await flagBlockedSignup(tx, { matches: blocks.matches });
        return { kind: "blocked" };
      }

      const consent: Consent = { consentedAt: at, ipAddress, ...consentVersions };

      if (!user) {
        const created = await tx.user.create({
          data: {
            email,
            emailVerifiedAt: null,
            fullName,
            passwordHash,
            passwordUpdatedAt: at,
            roleAssignments: { create: { role: RoleName.student } },
            status: UserStatus.active,
            studentProfile: { create: { displayName: fullName } },
          },
          select: { id: true },
        });
        const token = await issueToken(tx, created.id, consent, at);
        return { fullName, kind: "verify", ...token };
      }

      if (user.previewPurpose !== null) return { kind: "none" };

      const pending =
        user.emailVerifiedAt === null
        && user.softDeletedAt === null
        && (user.status === UserStatus.active || user.status === UserStatus.locked);
      if (!pending) return { fullName: user.fullName, kind: "existing" };

      // An address that was typed in earlier but never verified: the newest signup wins, so
      // whoever can read the inbox (and so can verify) is the one whose password is kept.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      await tx.user.update({
        data: {
          failedLoginCount: 0,
          fullName,
          lockedUntil: null,
          passwordHash,
          passwordUpdatedAt: at,
          status: UserStatus.active,
        },
        where: { id: user.id },
      });
      await tx.studentProfile.updateMany({ data: { displayName: fullName }, where: { userId: user.id } });
      const token = await issueToken(tx, user.id, consent, at);
      return { fullName, kind: "verify", ...token };
    });

  let plan: Plan;
  try {
    try {
      plan = await run();
    } catch (error) {
      // Two signups for one new address at once: the second one finds the first one's account.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") plan = await run();
      else throw error;
    }
  } catch (error) {
    if (error instanceof FraudConfigError) return { status: "unavailable" };
    serverLogger.error("registration.signup.failed", error, { area: "registration", operation: "signup" });
    return { status: "unavailable" };
  }

  let deliveredVerificationUrl: string | null = null;
  const day = now().toISOString().slice(0, 10);

  if (plan.kind === "verify") {
    const verifyUrl = verifyUrlFor(env, plan.rawToken, continuation);
    sendLater({
      label: "verification",
      mailer,
      message: buildVerificationEmail({
        fullName: plan.fullName,
        idempotencyKey: `signup-verify-${plan.tokenId}`,
        to: email,
        verifyUrl,
      }),
      schedule,
    });
    // Outside production the link is also shown on screen, as the password reset does, so the
    // flow can be tried without a mailbox.
    if (env.NODE_ENV !== "production") deliveredVerificationUrl = verifyUrl;
  } else if (plan.kind === "existing") {
    const base = getAppBaseUrl(env);
    sendLater({
      label: "existing",
      mailer,
      message: buildExistingAccountEmail({
        fullName: plan.fullName,
        // One notice per address per day, however many times it is tried.
        idempotencyKey: `signup-existing-${hashRegistrationEmail(email).slice(0, 24)}-${day}`,
        loginUrl: `${base}/login`,
        resetUrl: `${base}/forgot-password`,
        to: email,
      }),
      schedule,
    });
  } else {
    // Blocked or an internal account: same shape as the others, nothing sent.
    schedule(async () => {});
  }

  return { deliveredVerificationUrl, status: "accepted" };
}

/**
 * Sends the verification link again. Same neutral answer for every address; an
 * address that has no pending signup gets nothing (or, if it has an account,
 * the "you already have an account" email).
 */
async function resendVerification(
  input: { email: string; ref?: unknown; returnTo?: unknown },
  deps: RegistrationDeps = {},
): Promise<ResendOutcome> {
  const env = deps.env ?? process.env;
  const schedule = deps.schedule ?? defaultSchedule;
  const mailer = deps.mailer ?? sendEmail;
  const now = deps.now ?? (() => new Date());

  if (!getRegistrationStatus({ env, privacy: deps.legal?.privacy, terms: deps.legal?.terms }).open) return { status: "closed" };

  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) return { status: "invalid" };

  const { ipAddress } = await (deps.getMetadata ?? getRequestMetadata)();
  if (!(await consumeRegistrationAttempt({ ipAddress, kind: "resend", normalizedEmail: email }))) {
    return { status: "rate_limited" };
  }

  const continuation = readContinuation(input);
  const deviceToken = await (deps.readDeviceToken ?? readDeviceCookie)().catch(() => null);

  let plan: Plan;
  try {
    plan = await prisma.$transaction(async (tx): Promise<Plan> => {
      const at = now();
      const user = await tx.user.findUnique({
        select: { emailVerifiedAt: true, fullName: true, id: true, previewPurpose: true, softDeletedAt: true, status: true },
        where: { email },
      });

      const blocks = await checkBlocks(tx, { deviceToken, email, ip: ipAddress, userId: user?.id ?? null });
      if (blocks.blocked) {
        await flagBlockedSignup(tx, { matches: blocks.matches });
        return { kind: "blocked" };
      }

      if (!user || user.previewPurpose !== null) return { kind: "none" };

      const pending =
        user.emailVerifiedAt === null
        && user.softDeletedAt === null
        && (user.status === UserStatus.active || user.status === UserStatus.locked);
      if (!pending) return { fullName: user.fullName, kind: "existing" };

      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      // What was agreed to at signup moves to the new link unchanged. With no earlier link there is
      // nothing that was agreed to, so nothing is sent.
      const earlier = await tx.emailVerificationToken.findFirst({
        orderBy: { createdAt: "desc" },
        select: { consentedAt: true, ipAddress: true, privacyVersion: true, termsVersion: true },
        where: { userId: user.id },
      });
      if (!earlier) return { kind: "none" };

      const token = await issueToken(tx, user.id, earlier, at);
      return { fullName: user.fullName, kind: "verify", ...token };
    });
  } catch (error) {
    if (error instanceof FraudConfigError) return { status: "unavailable" };
    serverLogger.error("registration.resend.failed", error, { area: "registration", operation: "resend" });
    return { status: "unavailable" };
  }

  let deliveredVerificationUrl: string | null = null;
  const day = now().toISOString().slice(0, 10);

  if (plan.kind === "verify") {
    const verifyUrl = verifyUrlFor(env, plan.rawToken, continuation);
    sendLater({
      label: "verification",
      mailer,
      message: buildVerificationEmail({
        fullName: plan.fullName,
        idempotencyKey: `signup-verify-${plan.tokenId}`,
        to: email,
        verifyUrl,
      }),
      schedule,
    });
    if (env.NODE_ENV !== "production") deliveredVerificationUrl = verifyUrl;
  } else if (plan.kind === "existing") {
    const base = getAppBaseUrl(env);
    sendLater({
      label: "existing",
      mailer,
      message: buildExistingAccountEmail({
        fullName: plan.fullName,
        idempotencyKey: `signup-existing-${hashRegistrationEmail(email).slice(0, 24)}-${day}`,
        loginUrl: `${base}/login`,
        resetUrl: `${base}/forgot-password`,
        to: email,
      }),
      schedule,
    });
  } else {
    schedule(async () => {});
  }

  return { deliveredVerificationUrl, status: "accepted" };
}

type TokenRow = {
  consented_at: Date;
  id: string;
  ip: string | null;
  privacy_version: string;
  terms_version: string;
  user_id: string;
};

/**
 * Whether a link can still be used, without using it. The page that holds the
 * button reads this, so opening the link (an email scanner does) changes nothing.
 */
async function isVerificationLinkUsable(rawToken: string, now: Date = new Date()) {
  const row = await prisma.emailVerificationToken.findFirst({
    select: { id: true },
    where: {
      expiresAt: { gt: now },
      tokenHash: hashToken(rawToken),
      usedAt: null,
      user: { previewPurpose: null, softDeletedAt: null, status: { in: [UserStatus.active, UserStatus.locked] } },
    },
  });
  return row !== null;
}

/**
 * Uses a link: the email is verified, the agreement made at signup becomes an
 * append-only consent record, and every other link of the account ends. Runs
 * only from a POST (the button), once per link.
 */
async function verifyEmail(rawToken: string, deps: Pick<RegistrationDeps, "now"> = {}): Promise<VerifyOutcome> {
  if (!rawToken || rawToken.length > 200) return { status: "invalid" };

  const tokenHash = hashToken(rawToken);
  const now = (deps.now ?? (() => new Date()))();

  try {
    return await prisma.$transaction(async (tx): Promise<VerifyOutcome> => {
      const [token = null] = await tx.$queryRaw<TokenRow[]>`
        SELECT id, user_id, terms_version, privacy_version, consented_at, host(ip_address) AS ip
        FROM email_verification_tokens
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > ${now}
        FOR UPDATE
      `;
      if (!token) return { status: "invalid" };

      const [user = null] = await tx.$queryRaw<Array<{
        email_verified_at: Date | null;
        preview_purpose: string | null;
        soft_deleted_at: Date | null;
        status: UserStatus;
      }>>`
        SELECT email_verified_at, preview_purpose, soft_deleted_at, status
        FROM users WHERE id = ${token.user_id}::uuid FOR UPDATE
      `;
      if (
        !user
        || user.preview_purpose !== null
        || user.soft_deleted_at !== null
        || (user.status !== UserStatus.active && user.status !== UserStatus.locked)
      ) {
        return { status: "invalid" };
      }

      await tx.emailVerificationToken.updateMany({
        data: { usedAt: now },
        where: { usedAt: null, userId: token.user_id },
      });

      // Already verified through another link: nothing more to record.
      if (user.email_verified_at !== null) return { status: "verified" };

      await tx.user.update({ data: { emailVerifiedAt: now }, where: { id: token.user_id } });
      await tx.registrationConsent.create({
        data: {
          ageConfirmed: true,
          consentedAt: token.consented_at,
          ipAddress: token.ip,
          privacyVersion: token.privacy_version,
          termsVersion: token.terms_version,
          userId: token.user_id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "registration.email_verified",
          metadata: {
            privacyVersion: token.privacy_version,
            termsVersion: token.terms_version,
          } as Prisma.InputJsonValue,
          targetId: token.user_id,
          targetType: "user",
        },
      });
      return { status: "verified" };
    });
  } catch (error) {
    serverLogger.error("registration.verify.failed", error, { area: "registration", operation: "verify" });
    return { status: "unavailable" };
  }
}

export { isVerificationLinkUsable, registerStudent, resendVerification, validateSignupInput, verifyEmail };
export type { RegistrationDeps, ResendOutcome, SignupFieldErrors, SignupInput, SignupOutcome, VerifyOutcome };
