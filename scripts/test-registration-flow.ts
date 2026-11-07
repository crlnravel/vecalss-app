import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { hashToken, verifyPassword } from "../lib/auth/crypto";
import { completePasswordReset, getValidPasswordResetRecord, requestPasswordReset } from "../lib/auth/service";
import { changeStudentEnrollmentPassword } from "../lib/admin/enrollment/service";
import type { EmailMessage, MailResult } from "../lib/email/mailer";
import { createAutomaticBlock } from "../lib/fraud/blocks";
import { newDeviceToken } from "../lib/fraud/tokens";
import type { LegalDocument } from "../lib/legal/types";
import { prisma } from "../lib/prisma";
import { closeSharedRedisClient } from "../lib/redis";
import { cleanupUnverifiedSignups } from "../lib/registration/cleanup";
import { REGISTRATION_LIMITS, RESEND_LIMITS } from "../lib/registration/constants";
import {
  isVerificationLinkUsable,
  registerStudent,
  resendVerification,
  verifyEmail,
  type RegistrationDeps,
  type SignupInput,
} from "../lib/registration/service";
import type { TurnstileVerifier } from "../lib/registration/turnstile";

/**
 * MS-21: the signup, resend and verify flows against the local database, with
 * the Turnstile check, the mailer, the clock and the client address supplied by
 * the test (no network, no Resend). Accounts and consent records are never
 * deleted (the database refuses consent deletes), so every run uses fresh
 * addresses and leaves its rows in the disposable local database.
 */

if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:registration-flow only runs against the local dev database on 127.0.0.1:55432.");
}

const runId = randomUUID().slice(0, 8);
const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);
let counter = 0;
const emailFor = (label: string) => `reg-${label}-${runId}-${(counter += 1)}@ms21.test`;
const randomIp = () => `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
const PASSWORD = "Sandi-Uji-2026!";

const approved = (title: string, version: string): LegalDocument => ({
  draftedOn: "2026-11-09",
  intro: ["Teks uji tanpa placeholder."],
  sections: [{ heading: "Pasal 1. Uji", paragraphs: ["Isi lengkap."] }],
  status: "approved",
  title,
  version,
});
const LEGAL = { privacy: approved("Privasi uji", `privacy-test-${runId}`), terms: approved("Syarat uji", `terms-test-${runId}`) };

/** A deployed-like environment: production, approved legal pages, everything configured. Nothing is shown on screen. */
const PROD_ENV = {
  APP_BASE_URL: "https://app.example.test",
  EMAIL_FROM: "PTN Pro <no-reply@example.test>",
  FRAUD_LOOKUP_SECRET: process.env.FRAUD_LOOKUP_SECRET,
  NODE_ENV: "production",
  PAID_ACCESS_ENFORCED: "1",
  REGISTRATION_OPEN: "1",
  RESEND_API_KEY: "re_test_key",
  TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
  TURNSTILE_SITE_KEY: "2x00000000000000000000AB",
} as unknown as NodeJS.ProcessEnv;
/** The same on a developer's machine, where the link is also handed back for the page to show. */
const DEV_ENV = { ...PROD_ENV, NODE_ENV: "development", APP_BASE_URL: "http://localhost:5033" } as unknown as NodeJS.ProcessEnv;

const sent: EmailMessage[] = [];
const ok: MailResult = { id: "test", ok: true, redirected: false };

type Harness = { deps: RegistrationDeps; flush: () => Promise<void>; mails: () => EmailMessage[]; turnstileCalls: number };
function harness(options: Partial<RegistrationDeps> & { env?: NodeJS.ProcessEnv; ip?: string | null; turnstile?: Awaited<ReturnType<TurnstileVerifier>> } = {}): Harness {
  const tasks: Array<() => Promise<void>> = [];
  const mine: EmailMessage[] = [];
  const state = { turnstileCalls: 0 };
  const deps: RegistrationDeps = {
    env: options.env ?? PROD_ENV,
    getMetadata: async () => ({ ipAddress: options.ip === undefined ? randomIp() : options.ip }),
    legal: LEGAL,
    mailer: async (message) => {
      mine.push(message);
      sent.push(message);
      return ok;
    },
    now: options.now,
    readDeviceToken: options.readDeviceToken ?? (async () => null),
    schedule: (task) => tasks.push(task),
    verifyTurnstile: async () => {
      state.turnstileCalls += 1;
      return options.turnstile ?? "passed";
    },
  };
  return {
    deps,
    flush: async () => {
      while (tasks.length) await tasks.shift()!();
    },
    mails: () => mine,
    get turnstileCalls() {
      return state.turnstileCalls;
    },
  };
}

function signup(email: string, extra: Partial<SignupInput> = {}): SignupInput {
  return { ageConfirmed: true, email, fullName: "Siswa Uji", turnstileToken: "token", ...extra };
}

async function counts() {
  const [row] = await prisma.$queryRaw<Array<{ attempts: bigint; consents: bigint; tokens: bigint; users: bigint }>>`
    SELECT (SELECT count(*) FROM users) AS users,
           (SELECT count(*) FROM email_verification_tokens) AS tokens,
           (SELECT count(*) FROM registration_attempts) AS attempts,
           (SELECT count(*) FROM registration_consents) AS consents`;
  return { attempts: Number(row.attempts), consents: Number(row.consents), tokens: Number(row.tokens), users: Number(row.users) };
}

function tokenFromUrl(url: string | null) {
  assert.ok(url, "a link was handed back");
  const match = /\/daftar\/verifikasi\/([A-Za-z0-9_-]+)/u.exec(url);
  assert.ok(match, `the link names a verification page: ${url}`);
  return match[1];
}

async function userByEmail(email: string) {
  return prisma.user.findUnique({
    include: { emailVerificationTokens: { orderBy: { createdAt: "asc" } }, registrationConsents: true, roleAssignments: true, studentProfile: true },
    where: { email },
  });
}

async function main() {
  // ---- The switch: closed means nothing is read, written or sent ------------------------------
  {
    const before = await counts();
    for (const env of [
      { ...PROD_ENV, REGISTRATION_OPEN: "" },
      { ...PROD_ENV, PAID_ACCESS_ENFORCED: "" },
      { ...PROD_ENV, RESEND_API_KEY: "" },
      { ...PROD_ENV, TURNSTILE_SECRET_KEY: "" },
    ] as unknown as NodeJS.ProcessEnv[]) {
      const h = harness({ env });
      const outcome = await registerStudent(signup(emailFor("closed")), h.deps);
      assert.deepEqual(outcome, { status: "closed" });
      assert.equal(h.turnstileCalls, 0, "a closed signup does not even call Turnstile");
      await h.flush();
      assert.equal(h.mails().length, 0);
      assert.deepEqual(await resendVerification({ email: emailFor("closed") }, h.deps), { status: "closed" });
    }
    const drafts = harness();
    assert.deepEqual(await registerStudent(signup(emailFor("draft")), { ...drafts.deps, legal: undefined }), { status: "closed" }, "the draft legal pages keep signup closed");
    assert.deepEqual(await counts(), before, "closed signup writes nothing");
    pass("with any precondition missing, or the legal pages in draft, signup is closed and writes nothing");
  }

  // ---- Form validation ---------------------------------------------------------------------------
  {
    const before = await counts();
    const h = harness();
    const bad = await registerStudent({ ageConfirmed: false, email: "bukan-email", fullName: " ", turnstileToken: "t" }, h.deps);
    assert.equal(bad.status, "invalid");
    if (bad.status === "invalid") {
      assert.deepEqual(Object.keys(bad.errors).sort(), ["ageConfirmed", "email", "fullName"]);
    }
    for (const [label, input, key] of [
      ["no age tick", signup(emailFor("v"), { ageConfirmed: false }), "ageConfirmed"],
      ["one-letter name", signup(emailFor("v"), { fullName: "A" }), "fullName"],
      ["a 121-letter name", signup(emailFor("v"), { fullName: "A".repeat(121) }), "fullName"],
      ["no @", signup("tanpa-at.test"), "email"],
    ] as const) {
      const outcome = await registerStudent(input, harness().deps);
      assert.equal(outcome.status, "invalid", label);
      assert.ok(outcome.status === "invalid" && key in outcome.errors, label);
    }
    assert.equal(h.turnstileCalls, 0, "a bad form is refused before Turnstile is asked");
    assert.deepEqual(await counts(), before);
    pass("each form rule is enforced on the server, before Turnstile and before anything is written");
  }

  // ---- Turnstile ----------------------------------------------------------------------------------
  {
    const before = await counts();
    const failed = harness({ turnstile: "failed" });
    assert.deepEqual(await registerStudent(signup(emailFor("t")), failed.deps), { status: "challenge_failed" });
    const down = harness({ turnstile: "unavailable" });
    assert.deepEqual(await registerStudent(signup(emailFor("t")), down.deps), { status: "unavailable" });
    assert.deepEqual(await counts(), before, "a failed check writes no account, no token and no attempt");
    pass("a failed or unavailable Turnstile check refuses the signup and writes nothing, not even an attempt");
  }

  // ---- A new signup, in full (development environment: the link is handed back) ---------------------
  const continuationReturn = "/pricing/checkout?plan=monthly&ref=ABC-123";
  const happyEmail = emailFor("happy");
  const happyIp = randomIp();
  let happyToken = "";
  {
    const h = harness({ env: DEV_ENV, ip: happyIp });
    const outcome = await registerStudent(
      signup(happyEmail.toUpperCase(), { fullName: "  Siti   Aminah ", ref: "AFF-77", returnTo: continuationReturn }),
      h.deps,
    );
    assert.equal(outcome.status, "accepted");
    assert.ok(outcome.status === "accepted" && outcome.deliveredVerificationUrl);
    happyToken = tokenFromUrl(outcome.status === "accepted" ? outcome.deliveredVerificationUrl : null);
    await h.flush();

    const user = await userByEmail(happyEmail);
    assert.ok(user, "the email is normalized to lower case");
    assert.equal(user.emailVerifiedAt, null, "a new account is unverified");
    assert.equal(user.status, "active");
    assert.equal(user.mustChangePassword, false);
    assert.equal(user.fullName, "Siti Aminah", "the name is trimmed and its spaces collapsed");
    assert.deepEqual(user.roleAssignments.map((row) => row.role), ["student"], "self-registration creates a student only");
    assert.equal(user.studentProfile?.displayName, "Siti Aminah");
    assert.equal(user.studentProfile?.onboardingStatus, "not_started");
    assert.equal(user.passwordHash, null, "signup stores no password or hash before inbox ownership is proven");
    await assert.rejects(() => changeStudentEnrollmentPassword({ userId: user.id, actorUserId: user.id, password: PASSWORD }), { code: "email_unverified" }, "admin recovery cannot preset a pending signup credential");
    const reset = await requestPasswordReset(happyEmail, "student", {
      getMetadata: h.deps.getMetadata, mailer: h.deps.mailer, schedule: h.deps.schedule,
    });
    assert.deepEqual(reset, { deliveredResetUrl: null }, "password recovery cannot issue a credential-setting link for a pending signup");
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 0);
    const forgedReset = `pending-reset-${randomUUID()}`;
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(forgedReset), expiresAt: new Date(Date.now() + 60000) } });
    assert.equal(await getValidPasswordResetRecord(forgedReset), null, "even a pre-existing reset token does not make a pending account eligible");
    await assert.rejects(() => completePasswordReset(forgedReset, PASSWORD), /invalid or has already expired/u);
    assert.equal((await userByEmail(happyEmail))!.passwordHash, null);

    assert.equal(user.emailVerificationTokens.length, 1);
    const [token] = user.emailVerificationTokens;
    assert.equal(token.tokenHash, hashToken(happyToken), "only the hash of the link is stored");
    assert.equal(token.usedAt, null);
    assert.equal(token.ipAddress, happyIp);
    assert.equal(token.termsVersion, LEGAL.terms.version);
    assert.equal(token.privacyVersion, LEGAL.privacy.version);
    const hours = (token.expiresAt.getTime() - token.createdAt.getTime()) / 3_600_000;
    assert.ok(hours > 23.9 && hours < 24.1, `the link lasts 24 hours (${hours})`);
    assert.equal(user.registrationConsents.length, 0, "no consent record until the email is verified");

    assert.equal(h.mails().length, 1);
    const [mail] = h.mails();
    assert.equal(mail.to, happyEmail);
    const url = new URL(outcome.status === "accepted" ? outcome.deliveredVerificationUrl! : "");
    assert.equal(url.origin, "http://localhost:5033");
    assert.equal(url.searchParams.get("returnTo"), continuationReturn, "returnTo survives into the link");
    assert.equal(url.searchParams.get("ref"), "AFF-77", "the referral code survives into the link");
    assert.ok(mail.text.includes(url.toString()) && mail.html.includes(url.toString().replace(/&/gu, "&amp;")));
    assert.match(mail.subject, /PTN Pro/u);
    assert.equal(/vecalss/iu.test(`${mail.subject}${mail.text}${mail.html}`), false, "the email says PTN Pro, never Vecalss");
    assert.ok(mail.idempotencyKey.startsWith("signup-verify-"));
    assert.match(mail.text, /24 jam/u);

    // Nothing readable about the address or the link outside the account itself.
    const attempts = await prisma.$queryRaw<Array<{ dump: string }>>`SELECT row_to_json(a)::text AS dump FROM registration_attempts a WHERE ip_address = ${happyIp}::inet`;
    assert.equal(attempts.length, 1, "the attempt is counted");
    assert.ok(!attempts[0].dump.includes(happyEmail.split("@")[0]), "attempts store a hash, not the address");
    pass("a new signup creates an unverified student, one link (hashed, 24 hours), no consent yet, and one email carrying returnTo and ref");
  }

  // ---- Unsafe carry-over is dropped -----------------------------------------------------------------
  {
    const h = harness({ env: DEV_ENV });
    for (const [returnTo, ref] of [
      ["https://evil.example/steal", "ok-code"],
      ["//evil.example", "has space!"],
      ["/admin/fraud", "x"],
      ["/pricing/../admin", "<script>"],
    ]) {
      const outcome = await registerStudent(signup(emailFor("carry"), { ref, returnTo }), h.deps);
      assert.equal(outcome.status, "accepted");
      const url = new URL(outcome.status === "accepted" ? outcome.deliveredVerificationUrl! : "");
      assert.equal(url.searchParams.get("returnTo"), null, `${returnTo} is not carried`);
      if (ref === "ok-code") assert.equal(url.searchParams.get("ref"), "ok-code");
      else assert.equal(url.searchParams.get("ref"), null, `${ref} is not carried`);
    }
    pass("only a pricing or checkout path and a plausible referral code are carried; anything else is dropped");
  }

  // ---- No enumeration: one answer for every kind of address ----------------------------------------
  {
    const verifiedEmail = emailFor("verified");
    const existing = await prisma.user.create({
      data: { email: verifiedEmail, fullName: "Sudah Punya", passwordHash: "x", roleAssignments: { create: { role: "student" } } },
      select: { id: true },
    });
    const pendingEmail = emailFor("pending");
    await registerStudent(signup(pendingEmail), harness().deps);

    const blockedEmail = emailFor("blocked-email");
    const blockedIp = randomIp();
    const blockedDevice = newDeviceToken();
    await prisma.$transaction(async (tx) => {
      await createAutomaticBlock(tx, { reason: "fixture: uji pendaftaran diblokir", reasonCode: "other", target: { type: "email", value: blockedEmail } });
      await createAutomaticBlock(tx, { reason: "fixture: uji pendaftaran diblokir", reasonCode: "other", target: { type: "ip", value: blockedIp } });
      await createAutomaticBlock(tx, { reason: "fixture: uji pendaftaran diblokir", reasonCode: "other", target: { type: "device", value: blockedDevice } });
    });

    const cases: Array<[string, string, Partial<Parameters<typeof harness>[0]>]> = [
      ["new address", emailFor("neutral-new"), {}],
      ["existing verified account", verifiedEmail, {}],
      ["existing unverified signup", pendingEmail, {}],
      ["blocked email", blockedEmail, {}],
      ["blocked address", emailFor("neutral-ip"), { ip: blockedIp }],
      ["blocked device", emailFor("neutral-device"), { readDeviceToken: async () => blockedDevice }],
    ];
    const answers = [];
    const mailCounts: Record<string, number> = {};
    for (const [label, email, options] of cases) {
      const h = harness(options);
      const outcome = await registerStudent(signup(email), h.deps);
      await h.flush();
      answers.push(outcome);
      mailCounts[label] = h.mails().length;
      assert.deepEqual(outcome, { deliveredVerificationUrl: null, status: "accepted" }, `${label}: the same answer`);
    }
    assert.equal(new Set(answers.map((answer) => JSON.stringify(answer))).size, 1, "every answer is identical");
    assert.deepEqual(mailCounts, {
      "blocked address": 0,
      "blocked device": 0,
      "blocked email": 0,
      "existing unverified signup": 1,
      "existing verified account": 1,
      "new address": 1,
    }, "only the owner of an address learns anything, by email");
    pass("a new address, an existing account, a pending signup and three kinds of blocked identifier all get the same answer");

    // The existing account is not touched, gets no link, and is told by email.
    const same = await prisma.user.findUniqueOrThrow({ include: { emailVerificationTokens: true }, where: { id: existing.id } });
    assert.equal(same.passwordHash, "x", "a signup with an existing address changes nothing about the account");
    assert.equal(same.emailVerificationTokens.length, 0);
    const h = harness({ env: DEV_ENV });
    const dev = await registerStudent(signup(verifiedEmail), h.deps);
    await h.flush();
    assert.equal(dev.status === "accepted" && dev.deliveredVerificationUrl, null, "even on screen, no link is handed back for an existing account");
    const [mail] = h.mails();
    assert.equal(mail.to, verifiedEmail);
    assert.match(mail.subject, /sudah punya akun PTN Pro/u);
    assert.match(mail.text, /\/login/u);
    assert.match(mail.text, /\/forgot-password/u);
    assert.equal(/daftar\/verifikasi/u.test(mail.text), false);
    assert.equal(/vecalss/iu.test(`${mail.subject}${mail.text}${mail.html}`), false);
    pass("an existing account gets the \"you already have an account\" email and nothing about it changes");

    // Blocked attempts open an MS-07 case with ids and types only, deduped per block.
    const cases1 = await prisma.$queryRaw<Array<{ dump: string; hit_count: number; subject_key: string; user_id: string | null }>>`
      SELECT row_to_json(c)::text AS dump, hit_count, subject_key, user_id::text AS user_id FROM fraud_cases c
      WHERE signal = 'blocked_attempt' AND subject_type = 'block' AND evidence->>'context' = 'signup'
      ORDER BY opened_at DESC LIMIT 20`;
    assert.ok(cases1.length >= 3, "a case per blocked identifier");
    for (const row of cases1.slice(0, 3)) {
      assert.equal(row.user_id, null, "no account is involved");
      for (const raw of [blockedEmail, blockedIp, blockedDevice]) assert.ok(!row.dump.includes(raw), "the case carries no raw identifier");
    }
    const again = harness();
    await registerStudent(signup(blockedEmail), again.deps);
    const [emailCase] = await prisma.$queryRaw<Array<{ hit_count: number }>>`
      SELECT hit_count FROM fraud_cases WHERE signal = 'blocked_attempt' AND subject_type = 'block' AND state <> 'closed'
        AND evidence->>'matchedTypes' = '["email"]' ORDER BY opened_at DESC LIMIT 1`;
    assert.ok(emailCase.hit_count >= 2, "a repeat attempt adds a hit to the open case instead of a new case");
    assert.equal(await prisma.user.count({ where: { email: blockedEmail } }), 0, "a blocked signup creates no account");
    pass("a blocked signup opens an MS-07 case (block ids and types only), deduped while open, and creates nothing");
  }

  // ---- A pending signup typed again: the newest wins ------------------------------------------------
  {
    const email = emailFor("again");
    const first = harness({ env: DEV_ENV });
    const a = await registerStudent(signup(email, { fullName: "Nama Lama" }), first.deps);
    const tokenA = tokenFromUrl(a.status === "accepted" ? a.deliveredVerificationUrl : null);
    const second = harness({ env: DEV_ENV });
    const b = await registerStudent(signup(email, { fullName: "Nama Baru" }), second.deps);
    const tokenB = tokenFromUrl(b.status === "accepted" ? b.deliveredVerificationUrl : null);
    const user = await userByEmail(email);
    assert.equal(user!.fullName, "Nama Lama", "a repeat signup cannot replace the pending name");
    assert.equal(user!.passwordHash, null, "neither signup can preset a password");
    assert.equal(await isVerificationLinkUsable(tokenA), false, "the older link ended");
    assert.equal(await isVerificationLinkUsable(tokenB), true);
    assert.equal(await prisma.user.count({ where: { email } }), 1);
    pass("a second signup preserves the pending owner's name and empty credential and ends the older link");
  }

  // ---- Concurrent signups for one new address -------------------------------------------------------
  {
    const email = emailFor("race");
    const results = await Promise.all([1, 2, 3].map(() => registerStudent(signup(email), harness().deps)));
    assert.ok(results.every((result) => result.status === "accepted" || result.status === "rate_limited"), JSON.stringify(results));
    assert.equal(await prisma.user.count({ where: { email } }), 1, "never two accounts for one address");
    pass("simultaneous signups for one address make one account");
  }

  // ---- Limits ------------------------------------------------------------------------------------------
  {
    // Per email: three go through, the fourth is refused and not recorded.
    const email = emailFor("limit");
    const ip = randomIp();
    for (let i = 0; i < REGISTRATION_LIMITS.email.max; i += 1) {
      assert.equal((await registerStudent(signup(email), harness({ ip }).deps)).status, "accepted");
    }
    const before = await counts();
    assert.deepEqual(await registerStudent(signup(email), harness({ ip: randomIp() }).deps), { status: "rate_limited" });
    assert.equal((await counts()).attempts, before.attempts, "a refused attempt is not recorded");
    // The same limit applies to an address that has an account: a refusal says nothing about accounts.
    const verified = emailFor("limit-verified");
    await prisma.user.create({ data: { email: verified, fullName: "V", passwordHash: "x", roleAssignments: { create: { role: "student" } } } });
    for (let i = 0; i < REGISTRATION_LIMITS.email.max; i += 1) await registerStudent(signup(verified), harness().deps);
    assert.deepEqual(await registerStudent(signup(verified), harness().deps), { status: "rate_limited" }, "an existing account is limited exactly like a new address");

    // Per address: 20 an hour, shared by every email behind it.
    const crowded = randomIp();
    await prisma.$executeRaw`
      INSERT INTO registration_attempts (kind, email_hash, ip_address)
      SELECT 'signup', md5(random()::text) || md5(random()::text), ${crowded}::inet FROM generate_series(1, ${REGISTRATION_LIMITS.ip.max - 1})`;
    assert.equal((await registerStudent(signup(emailFor("school")), harness({ ip: crowded }).deps)).status, "accepted", "the 20th attempt from one address is let through");
    assert.deepEqual(await registerStudent(signup(emailFor("school")), harness({ ip: crowded }).deps), { status: "rate_limited" }, "the 21st is refused");
    // Attempts older than the window do not count.
    const old = randomIp();
    await prisma.$executeRaw`
      INSERT INTO registration_attempts (kind, email_hash, ip_address, requested_at)
      SELECT 'signup', md5(random()::text) || md5(random()::text), ${old}::inet, now() - interval '61 minutes' FROM generate_series(1, 30)`;
    assert.equal((await registerStudent(signup(emailFor("window")), harness({ ip: old }).deps)).status, "accepted", "the window is an hour");
    assert.equal(REGISTRATION_LIMITS.ip.max, 20);
    assert.equal(REGISTRATION_LIMITS.email.max, 3);
    assert.equal(RESEND_LIMITS.email.max, 3);

    // Resends: three an hour, counted apart from signups.
    const resendEmail = emailFor("resend-limit");
    await registerStudent(signup(resendEmail), harness().deps);
    for (let i = 0; i < RESEND_LIMITS.email.max; i += 1) {
      assert.equal((await resendVerification({ email: resendEmail }, harness().deps)).status, "accepted");
    }
    assert.deepEqual(await resendVerification({ email: resendEmail }, harness().deps), { status: "rate_limited" });
    assert.equal((await resendVerification({ email: "bukan email" }, harness().deps)).status, "invalid");
    pass("20 signups per address, 3 per email and 3 resends per hour; refusals are not recorded and say nothing about accounts");
  }

  // ---- Verifying: GET reads, the button POSTs; one use; 24 hours; consent kept -----------------------
  {
    // The link was handed out in the happy path above.
    const before = await userByEmail(happyEmail);
    assert.equal(before!.emailVerifiedAt, null);
    assert.equal(await isVerificationLinkUsable(happyToken), true);
    assert.equal(await isVerificationLinkUsable(happyToken), true, "looking at the link twice uses nothing up");
    assert.equal((await userByEmail(happyEmail))!.emailVerifiedAt, null, "reading the link (what an email scanner does) verifies nothing");
    assert.equal((await userByEmail(happyEmail))!.emailVerificationTokens[0].usedAt, null);

    // Expired.
    const late = () => new Date(Date.now() + 25 * 3_600_000);
    assert.equal(await isVerificationLinkUsable(happyToken, late()), false);
    assert.deepEqual(await verifyEmail(happyToken, PASSWORD, { now: late }), { status: "invalid" }, "a link older than 24 hours is refused");
    assert.equal((await userByEmail(happyEmail))!.emailVerifiedAt, null);
    assert.deepEqual(await verifyEmail("tidak-ada", PASSWORD), { status: "invalid" });
    let expensiveCalls = 0;
    assert.deepEqual(await verifyEmail("unknown-opaque-token", PASSWORD, { hashPassword: async () => { expensiveCalls += 1; throw new Error("unexpected bcrypt"); } }), { status: "invalid" });
    assert.equal(expensiveCalls, 0, "unknown tokens cannot trigger expensive password hashing");
    assert.deepEqual(await verifyEmail("", PASSWORD), { status: "invalid" });

    // The button.
    for (const badPassword of ["", "short", "alllowercase1", "NoNumbersHere!", "A1!".repeat(30)]) {
      assert.equal((await verifyEmail(happyToken, badPassword)).status, "invalid_password");
      assert.equal((await userByEmail(happyEmail))!.emailVerifiedAt, null);
      assert.equal((await userByEmail(happyEmail))!.passwordHash, null);
      assert.equal(await isVerificationLinkUsable(happyToken), true, "invalid passwords do not consume the token");
    }
    assert.deepEqual(await verifyEmail(happyToken, " Sandi-Uji-2026! "), { status: "verified" });
    assert.equal(await verifyPassword(" Sandi-Uji-2026! ", (await userByEmail(happyEmail))!.passwordHash), true, "verification hashes exactly as typed");
    assert.equal(await verifyPassword("Sandi-Uji-2026!", (await userByEmail(happyEmail))!.passwordHash), false, "no trimming");
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: (await userByEmail(happyEmail))!.id, usedAt: null } }), 0, "verification invalidates any older password recovery links");
    const after = await userByEmail(happyEmail);
    assert.ok(after!.emailVerifiedAt, "the email is verified");
    assert.equal(after!.registrationConsents.length, 1, "the agreement becomes a consent record");
    const [consent] = after!.registrationConsents;
    assert.equal(consent.ageConfirmed, true);
    assert.equal(consent.termsVersion, LEGAL.terms.version);
    assert.equal(consent.privacyVersion, LEGAL.privacy.version);
    assert.equal(consent.ipAddress, happyIp);
    assert.equal(consent.consentedAt.getTime(), after!.emailVerificationTokens[0].consentedAt.getTime(), "the time is when the box was ticked, not when the link was used");
    assert.ok(consent.verifiedAt.getTime() >= consent.consentedAt.getTime());
    assert.ok(after!.emailVerificationTokens.every((token) => token.usedAt !== null));
    const audit = await prisma.auditLog.findFirst({ where: { action: "registration.email_verified", targetId: after!.id } });
    assert.ok(audit, "verification is audited");
    assert.equal(JSON.stringify(audit.metadata).includes(happyEmail), false, "the audit names no address");

    // One use.
    assert.deepEqual(await verifyEmail(happyToken, PASSWORD), { status: "invalid" }, "a link works once");
    assert.equal(await isVerificationLinkUsable(happyToken), false);
    assert.equal((await userByEmail(happyEmail))!.registrationConsents.length, 1, "using it again records nothing more");
    pass("opening a link verifies nothing; the button verifies once, within 24 hours, and writes the consent record");

    // Consent rows are append-only, even for the schema owner.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM registration_consents WHERE user_id = ${after!.id}::uuid`;
    for (const statement of [
      () => prisma.$executeRaw`UPDATE registration_consents SET age_confirmed = true WHERE id = ${rows[0].id}::uuid`,
      () => prisma.$executeRaw`DELETE FROM registration_consents WHERE id = ${rows[0].id}::uuid`,
      () => prisma.$executeRaw`TRUNCATE registration_consents`,
    ]) {
      await assert.rejects(statement, /append-only/u);
    }
    await assert.rejects(
      () => prisma.$executeRaw`INSERT INTO registration_consents (user_id, terms_version, privacy_version, age_confirmed, consented_at) VALUES (${after!.id}::uuid, 'v', 'v', false, now())`,
      /age_confirmed/u,
      "a consent row cannot say the box was not ticked",
    );
    const [registry] = await prisma.$queryRaw<Array<{ record_class: string; runtime_insert: boolean; update_columns: string[] }>>`
      SELECT record_class, runtime_insert, update_columns FROM evidence_tables WHERE table_name = 'registration_consents'`;
    assert.deepEqual(registry, { record_class: "registration_consent", runtime_insert: true, update_columns: [] }, "the MS-10 registry lists it: insert only");
    pass("the consent record is append-only and registered as evidence");

    // Verified accounts: a signup now gets the "already have an account" answer.
    const h = harness();
    const outcome = await registerStudent(signup(happyEmail), h.deps);
    await h.flush();
    assert.equal(outcome.status, "accepted");
    assert.match(h.mails()[0].subject, /sudah punya akun/u);
  }

  // ---- A resend ends the older link and carries the agreement over --------------------------------------
  {
    const email = emailFor("resend");
    const ip = randomIp();
    const first = harness({ env: DEV_ENV, ip });
    const a = await registerStudent(signup(email, { returnTo: "/pricing?plan=full" }), first.deps);
    const tokenA = tokenFromUrl(a.status === "accepted" ? a.deliveredVerificationUrl : null);
    const second = harness({ env: DEV_ENV, ip: randomIp() });
    const b = await resendVerification({ email, ref: "AFF-9", returnTo: "/pricing/checkout?plan=monthly" }, second.deps);
    assert.equal(b.status, "accepted");
    const tokenB = tokenFromUrl(b.status === "accepted" ? b.deliveredVerificationUrl : null);
    await second.flush();
    assert.equal(await isVerificationLinkUsable(tokenA), false, "the first link ended");
    assert.equal(await isVerificationLinkUsable(tokenB), true);
    assert.equal(second.mails().length, 1);
    const user = await userByEmail(email);
    const [t1, t2] = user!.emailVerificationTokens;
    assert.equal(t2.consentedAt.getTime(), t1.consentedAt.getTime(), "the time of the agreement is the original one");
    assert.equal(t2.termsVersion, t1.termsVersion);
    assert.equal(t2.ipAddress, ip, "and so is the address it was made from");
    assert.equal(new URL(b.status === "accepted" ? b.deliveredVerificationUrl! : "").searchParams.get("ref"), "AFF-9");
    // A resend for an address with no signup sends nothing; for an existing account it sends the notice.
    const none = harness();
    assert.deepEqual(await resendVerification({ email: emailFor("nobody") }, none.deps), { deliveredVerificationUrl: null, status: "accepted" });
    await none.flush();
    assert.equal(none.mails().length, 0);
    assert.deepEqual(await resendVerification({ email: happyEmail }, harness().deps), { deliveredVerificationUrl: null, status: "accepted" }, "the same answer for an account that is already verified");
    assert.deepEqual(await verifyEmail(tokenB, PASSWORD), { status: "verified" }, "the newest link verifies");
    assert.deepEqual(await verifyEmail(tokenA, PASSWORD), { status: "invalid" }, "the ended link does not");
    pass("a resend ends the older link, carries the original agreement, and answers the same for every address");
  }

  // ---- Cleaning up unverified signups -------------------------------------------------------------------
  {
    async function pendingSignup(label: string, ageDays: number) {
      const email = emailFor(label);
      await registerStudent(signup(email), harness().deps);
      await prisma.$executeRaw`UPDATE email_verification_tokens SET created_at = now() - make_interval(days => ${ageDays}) WHERE user_id = (SELECT id FROM users WHERE email = ${email})`;
      return (await userByEmail(email))!;
    }
    const old = await pendingSignup("old", 8);
    await prisma.passwordResetToken.create({ data: { expiresAt: new Date(Date.now() + 60_000), tokenHash: randomUUID(), userId: old.id } });
    const recent = await pendingSignup("recent", 6);
    const stuck = await pendingSignup("stuck", 9);
    await prisma.notificationPreference.create({ data: { userId: stuck.id } });
    const verified = await pendingSignup("verified-old", 9);
    await prisma.user.update({ data: { emailVerifiedAt: new Date(), passwordHash: "fixture-only" }, where: { id: verified.id } });
    const adminCreated = await prisma.user.create({ data: { email: emailFor("admin-made"), fullName: "Dibuat admin", passwordHash: "x", roleAssignments: { create: { role: "student" } } } });
    const backdated = await pendingSignup("revived", 9);
    // Someone tried again yesterday: a new link, so the clock restarts.
    await resendVerificationFor(backdated.email);

    async function resendVerificationFor(email: string) {
      const h = harness();
      await resendVerification({ email }, h.deps);
    }

    const result = await cleanupUnverifiedSignups();
    assert.ok(result.deleted >= 1);
    assert.equal(result.failed, 1, "the account with an unexpected record attached is counted, not forced out");
    assert.equal(await prisma.user.count({ where: { id: old.id } }), 0, "an unverified account older than 7 days is deleted");
    assert.equal(await prisma.studentProfile.count({ where: { userId: old.id } }), 0, "with its profile");
    assert.equal(await prisma.roleAssignment.count({ where: { userId: old.id } }), 0, "its role");
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: old.id } }), 0, "its reset links");
    assert.equal(await prisma.emailVerificationToken.count({ where: { userId: old.id } }), 0, "and its verification links");
    assert.equal(await prisma.user.count({ where: { id: recent.id } }), 1, "a signup 6 days old stays");
    assert.equal(await prisma.user.count({ where: { id: stuck.id } }), 1, "an account something else refers to is not forced out");
    assert.equal(await prisma.user.count({ where: { id: verified.id } }), 1, "a verified account stays however old");
    assert.equal(await prisma.user.count({ where: { id: adminCreated.id } }), 1, "an account made by an admin stays");
    assert.equal(await prisma.user.count({ where: { id: backdated.id } }), 1, "a signup tried again recently stays");
    assert.equal(await prisma.registrationConsent.count({ where: { userId: old.id } }), 0);
    // The address can register again.
    const again = await registerStudent(signup(old.email), harness().deps);
    assert.equal(again.status, "accepted");
    assert.ok(await prisma.user.findUnique({ where: { email: old.email } }), "the address registers again after its signup was deleted");
    // Safe to run twice.
    const second = await cleanupUnverifiedSignups();
    assert.equal(second.deleted, 0);
    await prisma.notificationPreference.delete({ where: { userId: stuck.id } });
    pass("the daily cleanup deletes unverified signups older than 7 days, keeps everything else, and the address can register again");
  }

  process.stdout.write("registration flow: all checks passed\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSharedRedisClient();
    await prisma.$disconnect();
  });
