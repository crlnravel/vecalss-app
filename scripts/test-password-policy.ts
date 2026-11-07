import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import { EnrollmentHandoffMethod, RoleName, SessionStatus } from "../generated/prisma/client";
import {
  changeStudentEnrollmentPassword,
  createAffiliatorEnrollment,
  createKaptenEnrollment,
  createStudentEnrollment,
  EnrollmentServiceError,
} from "../lib/admin/enrollment/service";
import { POST as invitePost } from "../app/api/invite/[token]/route";
import { getTrustedAppBaseUrl } from "../lib/admin/handoffs/envelope";
import { reissueEnrollmentHandoff } from "../lib/admin/handoffs/service";
import { createImportedAccount } from "../lib/admin/imports/processing";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from "../lib/auth/constants";
import {
  createOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  hashUnusableCredential,
  validatePassword,
  verifyPassword,
} from "../lib/auth/crypto";
import {
  PasswordPolicyError,
  getPasswordViolation,
} from "../lib/auth/password-policy.mjs";
import {
  changePasswordForUser,
  completeEnrollmentInvite,
  completePasswordReset,
} from "../lib/auth/service";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_ADMIN,
  DEFAULT_AFFILIATOR,
  DEFAULT_STUDENT,
  DEFAULT_TEMP_STUDENT,
  DEFAULT_TUTOR,
} from "../prisma/seed-core-accounts.mjs";
import { FIRST_LOGIN_TUTOR_PASSWORD } from "../prisma/seed-mentors.mjs";
import { seedPassword } from "../prisma/seed-password-policy.mjs";
import { readPasswordField, readTextField } from "../modules/auth/form-fields";
import {
  describePasswordProblem,
  describePasswordViolation,
} from "../modules/auth/password-copy";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:password-policy only runs against the local dev database on 127.0.0.1:55432.");
}

// Invite and temporary-password handoffs seal their secret with this key ring.
// A throwaway key keeps the test independent of local env files.
if (!process.env.ENROLLMENT_HANDOFF_KEY_RING?.trim() || !process.env.ENROLLMENT_HANDOFF_ACTIVE_KEY_ID?.trim()) {
  process.env.ENROLLMENT_HANDOFF_KEY_RING = JSON.stringify({ "password-policy-test": randomBytes(32).toString("base64") });
  process.env.ENROLLMENT_HANDOFF_ACTIVE_KEY_ID = "password-policy-test";
}

const violation = getPasswordViolation;
const bytes = (value: string) => Buffer.byteLength(value, "utf8");

function checkRule() {
  // Length boundary, counted in characters.
  assert.equal(violation("Abc12!x"), "too_short", "7 characters");
  assert.equal(violation("Abc123!x"), null, "8 characters");
  assert.equal(violation(""), "too_short");
  assert.equal(violation(undefined), "too_short");
  assert.equal(violation("Abcde1😀"), "too_short", "an emoji is one character: 7, not 8");
  assert.equal(violation("Abcdef1😀"), null, "8 characters with an emoji symbol");

  // Each missing category.
  assert.equal(violation("Abcdefg1"), "missing_class", "no symbol");
  assert.equal(violation("abcdef1!"), "missing_class", "no uppercase");
  assert.equal(violation("ABCDEF1!"), "missing_class", "no lowercase");
  assert.equal(violation("Abcdefg!"), "missing_class", "no digit");
  assert.equal(violation("12345678"), "missing_class");

  // What counts as the symbol.
  for (const symbol of ["!", "#", "_", "-", ".", "~", "€", "£", "！", "😀", "★"]) {
    assert.equal(violation(`Abcdef1${symbol}`), null, `symbol ${symbol}`);
  }
  for (const notSymbol of [" ", "\t", " ", "　", "é", "ß", "ñ", "中", "٣", "́"]) {
    assert.equal(
      violation(`Abcdef1${notSymbol}`),
      "missing_class",
      `not a symbol: ${JSON.stringify(notSymbol)}`,
    );
  }
  assert.equal(violation("Abcdef 1 "), "missing_class", "spaces only");
  assert.equal(violation("Abc def1!"), null, "a space is allowed next to a real symbol");
  assert.equal(violation("Abcdef1‍"), "missing_class", "a zero-width joiner is not a symbol");
  assert.equal(violation(" Abcdef1!"), null, "edge whitespace is not trimmed away");

  // 72 bytes pass, 73 do not; multibyte characters count by bytes.
  const ascii72 = `Aa1!${"x".repeat(68)}`;
  assert.equal(bytes(ascii72), 72);
  assert.equal(violation(ascii72), null);
  assert.equal(violation(`${ascii72}x`), "too_long");

  const accented72 = `Aa1!${"é".repeat(34)}`;
  assert.equal(bytes(accented72), 72);
  assert.equal([...accented72].length, 38, "far fewer characters than bytes");
  assert.equal(violation(accented72), null);
  assert.equal(violation(`${accented72}x`), "too_long");
  assert.equal(violation(`Aa1!${"é".repeat(35)}`), "too_long", "74 bytes");

  const emoji72 = `Aa1!${"😀".repeat(17)}`;
  assert.equal(bytes(emoji72), 72);
  assert.equal(violation(emoji72), null);
  assert.equal(violation(`${emoji72}😀`), "too_long");
  assert.equal(violation(`Aa1!${"中".repeat(23)}`), "too_long", "73 bytes of 3-byte characters");
  assert.equal(violation(`Aa1!${"中".repeat(22)}`), null, "70 bytes");

  // The message layer never says "bytes" or a backend term to a person.
  for (const code of ["too_short", "too_long", "missing_class"] as const) {
    const copy = describePasswordViolation(code);
    assert.match(copy, /^Kata sandi baru /u);
    assert.doesNotMatch(copy, /byte|UTF|bcrypt|code|error/iu);
  }
  assert.match(describePasswordViolation("too_long"), /terlalu panjang/u);
  assert.match(describePasswordViolation("missing_class", "siswa"), /^Kata sandi siswa /u);
  assert.equal(describePasswordProblem("Abc123!x"), null);
  assert.equal(describePasswordProblem("Abcdefg1"), describePasswordViolation("missing_class"));
  assert.equal(describePasswordProblem("x".repeat(100)), describePasswordViolation("too_long"));

  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_MAX_BYTES, 72);
  assert.equal(validatePassword("Abc123!x"), null);
  assert.match(validatePassword("Abcdefg1") ?? "", /symbol/u);
}

function checkGenerator() {
  const firstCharacters = new Set<string>();
  const seenCharacters = new Set<string>();
  for (let sample = 0; sample < 10_000; sample += 1) {
    const password = generateTemporaryPassword();
    assert.equal(violation(password), null, `sample ${sample} must comply`);
    assert.equal(password.length, 14);
    assert.ok(/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[!@#$%]/.test(password));
    assert.doesNotMatch(password, /[IOl01]/u, "look-alike characters stay out");
    firstCharacters.add(password[0]);
    for (const character of password) seenCharacters.add(character);
  }
  // The shuffle spreads the guaranteed characters; position 0 is not a fixed class.
  assert.ok(firstCharacters.size >= 50, `first characters vary (${firstCharacters.size})`);
  assert.equal(seenCharacters.size, 24 + 25 + 8 + 5, "every alphabet character is used");

  for (const length of [PASSWORD_MIN_LENGTH, 20, PASSWORD_MAX_BYTES]) {
    for (let sample = 0; sample < 200; sample += 1) {
      const password = generateTemporaryPassword(length);
      assert.equal(password.length, length);
      assert.equal(violation(password), null);
    }
  }
  for (const bad of [7, 73, 0, -1, 10.5, Number.NaN]) {
    assert.throws(() => generateTemporaryPassword(bad), RangeError, String(bad));
  }
}

async function checkHashing() {
  await assert.rejects(hashPassword("Abcdefg1"), PasswordPolicyError);
  await assert.rejects(hashPassword("Abc12!x"), PasswordPolicyError);
  await assert.rejects(hashPassword(`${"x".repeat(60)}Aa1!${"x".repeat(9)}`), PasswordPolicyError);
  const rejected = await hashPassword("Sup3rSecretValue").catch((error: unknown) => error);
  assert.ok(rejected instanceof PasswordPolicyError);
  assert.doesNotMatch(rejected.message, /Sup3r|Secret/u, "the error never carries the password");

  const hashed = await hashPassword("Abc123!x");
  assert.equal(await verifyPassword("Abc123!x", hashed), true);
  assert.equal(await verifyPassword("Abc123!y", hashed), false);

  // A random invite placeholder is not a password and skips the rule.
  const placeholder = createOpaqueToken(24);
  assert.equal(await verifyPassword(placeholder, await hashUnusableCredential(placeholder)), true);
}

function checkSeeds() {
  const local = { DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/vecalss_dev" } as unknown as NodeJS.ProcessEnv;
  for (const seeded of [
    DEFAULT_ADMIN,
    DEFAULT_STUDENT,
    DEFAULT_TEMP_STUDENT,
    DEFAULT_TUTOR,
    DEFAULT_AFFILIATOR,
  ]) {
    assert.equal(violation(seeded.password), null, `${seeded.email} seed password complies`);
  }
  assert.equal(violation(FIRST_LOGIN_TUTOR_PASSWORD), null);

  assert.throws(
    () => seedPassword("SEED_ADMIN_PASSWORD", "Admin12345!", { ...local, SEED_ADMIN_PASSWORD: "NoSymbol123" } as unknown as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof Error
      && /SEED_ADMIN_PASSWORD/u.test(error.message)
      && !/NoSymbol123/u.test(error.message),
  );
  assert.throws(
    () => seedPassword("SEED_ADMIN_PASSWORD", "weakdefault", local),
    /SEED_ADMIN_PASSWORD/u,
  );
  assert.equal(seedPassword("SEED_ADMIN_PASSWORD", "Admin12345!", local), "Admin12345!");
}

// ---------------------------------------------------------------------------
// Service boundaries (local dev database)
// ---------------------------------------------------------------------------

const runId = crypto.randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const secretsSeen: string[] = [];

async function createFixtureUser(label: string, role: RoleName, mustChangePassword: boolean) {
  const user = await prisma.user.create({
    data: {
      email: `password-policy-${label}-${runId}@vecalss.local`,
      fullName: `Password Policy ${label}`,
      mustChangePassword,
      passwordHash: await hashPassword("Original1!pw"),
      roleAssignments: { create: { role } },
      status: "active",
    },
    select: { id: true, passwordHash: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createSession(userId: string) {
  return prisma.authSession.create({
    data: {
      expiresAt: new Date(Date.now() + 3_600_000),
      issuedAt: new Date(),
      refreshTokenHash: hashToken(createOpaqueToken()),
      status: SessionStatus.active,
      userId,
    },
    select: { id: true },
  });
}

const WEAK_PASSWORDS: Array<[string, string]> = [
  ["too short", "Ab1!xyz"],
  ["no symbol", "Abcdefg123"],
  ["no uppercase", "abcdefg1!"],
  ["no lowercase", "ABCDEFG1!"],
  ["no digit", "Abcdefg!x"],
  ["space only", "Abcdefg1 "],
  ["too long", `Aa1!${"x".repeat(69)}`],
];

/** Runs `action` while recording everything written to the console and stdio. */
async function withCapturedOutput<T>(action: () => Promise<T>) {
  const chunks: string[] = [];
  const originals = {
    error: console.error, info: console.info, log: console.log, warn: console.warn,
    stderr: process.stderr.write.bind(process.stderr), stdout: process.stdout.write.bind(process.stdout),
  };
  const record = (...args: unknown[]) => { chunks.push(args.map((arg) => String(arg)).join(" ")); };
  console.error = record; console.info = record; console.log = record; console.warn = record;
  process.stdout.write = ((chunk: unknown) => { chunks.push(String(chunk)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { chunks.push(String(chunk)); return true; }) as typeof process.stderr.write;
  try {
    return { output: chunks, value: await action() };
  } finally {
    console.error = originals.error; console.info = originals.info; console.log = originals.log; console.warn = originals.warn;
    process.stdout.write = originals.stdout; process.stderr.write = originals.stderr;
  }
}

async function expectRejection(action: () => Promise<unknown>, secret: string) {
  secretsSeen.push(secret);
  const { output, value } = await withCapturedOutput(() => action().then(() => null, (error: unknown) => error));
  assert.ok(value instanceof Error, "the write path must reject");
  assert.ok(!value.message.includes(secret), "a thrown message never carries the password");
  assert.ok(!output.join("\n").includes(secret), "nothing logs the password");
  return value;
}

async function checkChangePassword() {
  const user = await createFixtureUser("change", RoleName.student, true);
  const current = await createSession(user.id);
  const other = await createSession(user.id);
  const sessionStatus = async (id: string) =>
    (await prisma.authSession.findUniqueOrThrow({ select: { status: true }, where: { id } })).status;

  for (const [label, weak] of WEAK_PASSWORDS) {
    const error = await expectRejection(() => changePasswordForUser(user.id, current.id, weak), weak);
    assert.ok(error instanceof PasswordPolicyError, label);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(after.passwordHash, user.passwordHash, `${label}: hash untouched`);
    assert.equal(after.mustChangePassword, true, `${label}: still flagged`);
    assert.equal(await sessionStatus(other.id), SessionStatus.active, `${label}: no session revoked`);
  }

  const next = "Brand-New1pass";
  secretsSeen.push(next);
  const { output } = await withCapturedOutput(() => changePasswordForUser(user.id, current.id, next));
  assert.ok(!output.join("\n").includes(next));
  const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(changed.mustChangePassword, false);
  assert.equal(await verifyPassword(next, changed.passwordHash), true);
  assert.equal(await verifyPassword("Original1!pw", changed.passwordHash), false);
  assert.equal(await sessionStatus(current.id), SessionStatus.active, "the session that changed it stays signed in");
  assert.equal(await sessionStatus(other.id), SessionStatus.revoked, "every other session is revoked");
}

async function checkPasswordReset() {
  const user = await createFixtureUser("reset", RoleName.student, true);
  const session = await createSession(user.id);
  const rawToken = createOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { expiresAt: new Date(Date.now() + 900_000), tokenHash: hashToken(rawToken), userId: user.id },
  });

  for (const [label, weak] of WEAK_PASSWORDS) {
    const error = await expectRejection(() => completePasswordReset(rawToken, weak), weak);
    assert.ok(error instanceof PasswordPolicyError, label);
  }
  const unused = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
  assert.equal(unused.usedAt, null, "a rejected password does not spend the reset link");

  const next = "Reset-Done9pass";
  secretsSeen.push(next);
  await completePasswordReset(rawToken, next);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await verifyPassword(next, after.passwordHash), true);
  assert.equal(after.mustChangePassword, false);
  assert.equal(
    (await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).status,
    SessionStatus.revoked,
    "a reset signs the user out everywhere",
  );
}

async function checkInviteAndEnrollment(adminId: string) {
  // Invite link: weak passwords are refused and leave the invite usable.
  const invited = await createStudentEnrollment({
    actorUserId: adminId,
    email: `password-policy-invite-${runId}@vecalss.local`,
    fullName: "Password Policy Invite",
    handoffMethod: EnrollmentHandoffMethod.invite_link,
  });
  createdUserIds.push(invited.userId);
  assert.ok(invited.inviteUrl);
  const inviteToken = decodeURIComponent(new URL(invited.inviteUrl).pathname.split("/").pop() ?? "");
  const inviteStatusBefore = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  assert.equal(await verifyPassword("anything", inviteStatusBefore.passwordHash), false, "placeholder login is unusable");

  for (const [label, weak] of WEAK_PASSWORDS) {
    const error = await expectRejection(() => completeEnrollmentInvite(inviteToken, weak), weak);
    assert.ok(error instanceof PasswordPolicyError, label);
  }
  const inviteOk = "Invited-Now1pass";
  secretsSeen.push(inviteOk);
  await completeEnrollmentInvite(inviteToken, inviteOk);
  const invitedUser = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  assert.equal(await verifyPassword(inviteOk, invitedUser.passwordHash), true);
  assert.equal(invitedUser.mustChangePassword, false);

  // Generated temporary passwords comply on every creation path.
  const generated: Array<[string, string | null, string]> = [];
  const student = await createStudentEnrollment({
    actorUserId: adminId,
    email: `password-policy-student-${runId}@vecalss.local`,
    fullName: "Password Policy Student",
  });
  generated.push(["student", student.temporaryPassword, student.userId]);
  const kapten = await createKaptenEnrollment({
    actorUserId: adminId,
    email: `password-policy-kapten-${runId}@vecalss.local`,
    fullName: "Password Policy Kapten",
  });
  generated.push(["kapten", kapten.temporaryPassword, kapten.userId]);
  const affiliator = await createAffiliatorEnrollment({
    actorUserId: adminId,
    email: `password-policy-affiliator-${runId}@vecalss.local`,
    fullName: "Password Policy Affiliator",
    referralCode: `PP-${runId}`.toUpperCase(),
  });
  generated.push(["affiliator", affiliator.temporaryPassword, affiliator.userId]);
  for (const [label, temporaryPassword, userId] of generated) {
    createdUserIds.push(userId);
    assert.ok(temporaryPassword, `${label}: a temporary password is handed over`);
    assert.equal(violation(temporaryPassword), null, `${label}: generated password complies`);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(await verifyPassword(temporaryPassword, row.passwordHash), true, `${label}: it is the stored password`);
    assert.equal(row.mustChangePassword, true, `${label}: new accounts must still replace it`);
  }

  // Reissuing a temporary password also complies.
  const reissued = await reissueEnrollmentHandoff({
    actorUserId: adminId,
    handoffId: student.handoffId,
    method: EnrollmentHandoffMethod.temporary_password,
  });
  assert.ok(reissued.secret);
  assert.equal(violation(reissued.secret), null);
  const reissuedRow = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
  assert.equal(await verifyPassword(reissued.secret, reissuedRow.passwordHash), true);

  // Admin-set student password.
  const studentSession = await createSession(student.userId);
  for (const [label, weak] of WEAK_PASSWORDS) {
    const error = await expectRejection(
      () => changeStudentEnrollmentPassword({ actorUserId: adminId, password: weak, userId: student.userId }),
      weak,
    );
    assert.ok(error instanceof EnrollmentServiceError && error.code === "invalid_field", label);
  }
  const beforeSet = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
  assert.equal(beforeSet.passwordHash, reissuedRow.passwordHash, "rejections leave the password alone");
  const adminSet = "Admin-Chose1pass";
  secretsSeen.push(adminSet);
  await changeStudentEnrollmentPassword({ actorUserId: adminId, password: adminSet, userId: student.userId });
  const afterSet = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
  assert.equal(await verifyPassword(adminSet, afterSet.passwordHash), true);
  assert.equal(
    (await prisma.authSession.findUniqueOrThrow({ where: { id: studentSession.id } })).status,
    SessionStatus.revoked,
    "an admin-set password signs the student out",
  );
}

async function checkInviteRoute(adminId: string) {
  const origin = getTrustedAppBaseUrl();
  const post = (token: string, password: string, confirmPassword = password) =>
    invitePost(
      new Request(`${origin}/api/invite/${token}`, {
        body: JSON.stringify({ confirmPassword, password }),
        headers: { "content-type": "application/json", origin },
        method: "POST",
      }),
      { params: Promise.resolve({ token }) },
    );
  const readBody = async (response: Response) => ({ status: response.status, text: await response.text() });

  const invited = await createStudentEnrollment({
    actorUserId: adminId,
    email: `password-policy-route-${runId}@vecalss.local`,
    fullName: "Password Policy Route",
    handoffMethod: EnrollmentHandoffMethod.invite_link,
  });
  createdUserIds.push(invited.userId);
  assert.ok(invited.inviteUrl);
  const inviteToken = decodeURIComponent(new URL(invited.inviteUrl).pathname.split("/").pop() ?? "");
  const before = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  const handoffBefore = await prisma.enrollmentHandoff.findFirstOrThrow({ where: { userId: invited.userId } });

  const expectedBodies = {
    missing_class: { error: "password_policy", violation: "missing_class" },
    too_long: { error: "password_policy", violation: "too_long" },
    too_short: { error: "password_policy", violation: "too_short" },
  } as const;
  const weakCases: Array<[string, keyof typeof expectedBodies]> = [
    ["Abcdefg123", "missing_class"],
    ["Ab1!xyz", "too_short"],
    [`Aa1!${"x".repeat(69)}`, "too_long"],
  ];

  for (const [weak, violationCode] of weakCases) {
    secretsSeen.push(weak);
    const real = await readBody(await post(inviteToken, weak));
    assert.equal(real.status, 422, violationCode);
    assert.deepEqual(JSON.parse(real.text), expectedBodies[violationCode]);
    assert.ok(!real.text.includes(weak), "the reply never echoes the password");

    // An unknown token gets the identical reply, so it says nothing about the invite.
    const unknown = await readBody(await post(createOpaqueToken(), weak));
    assert.deepEqual(unknown, real, `unknown token, ${violationCode}`);
  }

  // The invite survived every rejection untouched.
  const after = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  assert.equal(after.passwordHash, before.passwordHash);
  assert.equal(after.mustChangePassword, true);
  const handoffAfter = await prisma.enrollmentHandoff.findFirstOrThrow({ where: { userId: invited.userId } });
  assert.equal(handoffAfter.status, handoffBefore.status);
  assert.equal(handoffAfter.completedAt, null, "the invite is not consumed");

  // An unknown token with a compliant password is still just an invalid invite.
  const unknownOk = await readBody(await post(createOpaqueToken(), "Compliant-1pass"));
  assert.equal(unknownOk.status, 400);
  assert.deepEqual(JSON.parse(unknownOk.text), { error: "invalid_invite" });

  // Mismatched confirmation is not a policy answer either.
  const mismatch = await readBody(await post(inviteToken, "Compliant-1pass", "Different-1pass"));
  assert.deepEqual(JSON.parse(mismatch.text), { error: "invalid_invite" });

  // The still-valid invite works with a compliant password.
  const good = await post(inviteToken, "Route-Invite1pass");
  assert.equal(good.status, 200);
  secretsSeen.push("Route-Invite1pass");
  const accepted = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  assert.equal(await verifyPassword("Route-Invite1pass", accepted.passwordHash), true);
  assert.equal(accepted.mustChangePassword, false);
}

// ---------------------------------------------------------------------------
// Passwords are taken exactly as typed (MS-19 C-02)
// ---------------------------------------------------------------------------

function formOf(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function checkEdgeWhitespace(adminId: string) {
  // The two readers: text fields are trimmed, password fields never are.
  const padded = "  Edge-Space1pass \t";
  assert.equal(readTextField(formOf({ email: "  a@b.test " }), "email"), "a@b.test");
  assert.equal(readPasswordField(formOf({ password: padded }), "password"), padded);
  assert.equal(readPasswordField(formOf({}), "password"), "");
  const actionsSource = readFileSync(resolve("modules/auth/actions.ts"), "utf8");
  assert.doesNotMatch(
    actionsSource,
    /readTextField\(formData, "(?:password|confirmPassword)"\)/u,
    "login, reset and change read their password fields without trimming",
  );
  assert.equal((actionsSource.match(/readPasswordField\(formData, "(?:password|confirmPassword)"\)/gu) ?? []).length, 5);

  // Invite: an invitee may choose a password with edge whitespace, and it is stored as typed.
  const origin = getTrustedAppBaseUrl();
  const invited = await createStudentEnrollment({
    actorUserId: adminId,
    email: `password-policy-edge-${runId}@vecalss.local`,
    fullName: "Password Policy Edge",
    handoffMethod: EnrollmentHandoffMethod.invite_link,
  });
  createdUserIds.push(invited.userId);
  assert.ok(invited.inviteUrl);
  const inviteToken = decodeURIComponent(new URL(invited.inviteUrl).pathname.split("/").pop() ?? "");
  const invitePassword = " Edge-Invite1pass  ";
  secretsSeen.push(invitePassword);
  const accepted = await invitePost(
    new Request(`${origin}/api/invite/${inviteToken}`, {
      body: JSON.stringify({ confirmPassword: invitePassword, password: invitePassword }),
      headers: { "content-type": "application/json", origin },
      method: "POST",
    }),
    { params: Promise.resolve({ token: inviteToken }) },
  );
  assert.equal(accepted.status, 200);
  const invitee = await prisma.user.findUniqueOrThrow({ where: { id: invited.userId } });
  assert.equal(await verifyPassword(invitePassword, invitee.passwordHash), true, "stored exactly as typed");
  assert.equal(await verifyPassword(invitePassword.trim(), invitee.passwordHash), false);

  // Login: sign-in compares the typed password with the stored hash and nothing else touches it.
  // (authenticateUser needs a request to read headers, so the comparison is checked directly.)
  const authService = readFileSync(resolve("lib/auth/service.ts"), "utf8");
  assert.doesNotMatch(authService, /password\s*\.\s*trim\(|password\s*=\s*[^;\n]*\.trim\(/u, "sign-in never trims the password");
  assert.equal(await verifyPassword(invitePassword, invitee.passwordHash), true, "the exact password signs in");

  // Reset: the service stores the new password exactly as typed.
  const resetUser = await createFixtureUser("edge-reset", RoleName.student, true);
  const rawToken = createOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { expiresAt: new Date(Date.now() + 900_000), tokenHash: hashToken(rawToken), userId: resetUser.id },
  });
  const resetPassword = "  Reset-Edge1pass ";
  secretsSeen.push(resetPassword);
  await completePasswordReset(rawToken, resetPassword);
  const reset = await prisma.user.findUniqueOrThrow({ where: { id: resetUser.id } });
  assert.equal(await verifyPassword(resetPassword, reset.passwordHash), true, "reset stores exactly what was typed");
  assert.equal(await verifyPassword(resetPassword.trim(), reset.passwordHash), false);

  // No form in the app reads a password-like field through the trimming reader.
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === "node_modules" || entry.name === ".next") return [];
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
    });
  for (const file of ["app", "lib", "modules"].flatMap((dir) => sourceFiles(resolve(dir)))) {
    const text = readFileSync(file, "utf8");
    const trimmed = text.match(/readTextField\(\s*\w+,\s*"[^"]*pass[^"]*"/giu);
    assert.equal(trimmed, null, `${file} reads a password field with the trimming reader`);
    assert.doesNotMatch(text, /get\(\s*"[^"]*pass[^"]*"\s*\)[^;\n]*\.trim\(/iu, `${file} trims a password field`);
  }
  const adminActions = readFileSync(resolve("modules/admin/actions.ts"), "utf8");
  assert.equal((adminActions.match(/readPasswordField\(formData, "(?:password|confirmPassword)"\)/gu) ?? []).length, 2, "the admin set-password form reads exactly what was typed");

  // An admin-set password is stored exactly as typed, too.
  const adminSetUser = await createFixtureUser("edge-adminset", RoleName.student, false);
  const adminSetPassword = "  Admin-Edge1pass ";
  secretsSeen.push(adminSetPassword);
  await changeStudentEnrollmentPassword({ actorUserId: adminId, password: adminSetPassword, userId: adminSetUser.id });
  const adminSet = await prisma.user.findUniqueOrThrow({ where: { id: adminSetUser.id } });
  assert.equal(await verifyPassword(adminSetPassword, adminSet.passwordHash), true, "admin-set password stored as typed");
  assert.equal(await verifyPassword(adminSetPassword.trim(), adminSet.passwordHash), false);

  // Change: changePasswordAction needs a signed-in request, so the reader checks above cover its
  // form handling and this covers what the service stores.
  const changeUser = await createFixtureUser("edge-change", RoleName.student, true);
  const changeSession = await createSession(changeUser.id);
  const changePassword = " Change-Edge1pass  ";
  secretsSeen.push(changePassword);
  await changePasswordForUser(changeUser.id, changeSession.id, changePassword);
  const changed = await prisma.user.findUniqueOrThrow({ where: { id: changeUser.id } });
  assert.equal(await verifyPassword(changePassword, changed.passwordHash), true);
  assert.equal(await verifyPassword(changePassword.trim(), changed.passwordHash), false);
}

async function checkImportedAccounts(adminId: string) {
  const importRow = await prisma.enrollmentImport.create({
    data: {
      contentHash: `password-policy-${runId}`,
      createdByUserId: adminId,
      confirmedByUserId: adminId,
      handoffMethod: EnrollmentHandoffMethod.temporary_password,
      role: "student",
      rowCount: 2,
      sourceFilename: "password-policy.csv",
      status: "queued",
      templateVersion: "students.v1",
    },
    select: { id: true },
  });
  try {
    const rows = [] as Array<{ id: string; email: string }>;
    for (const [index, kind] of ["temp", "invite"].entries()) {
      const email = `password-policy-import-${kind}-${runId}@vecalss.local`;
      const row = await prisma.enrollmentImportRow.create({
        data: { importId: importRow.id, inputJson: { email, full_name: `Import ${kind}` }, normalizedEmail: email, operation: "create", rowNumber: index + 1, status: "processing" },
        select: { id: true },
      });
      rows.push({ email, id: row.id });
    }

    const run = (method: EnrollmentHandoffMethod, row: { id: string; email: string }) =>
      prisma.$transaction((tx) =>
        createImportedAccount(
          tx,
          {
            attemptCount: 1,
            claimExpiresAt: new Date(Date.now() + 60_000),
            claimToken: crypto.randomUUID(),
            claimedBy: "password-policy-test",
            confirmedByUserId: adminId,
            createdByUserId: adminId,
            generation: 1,
            handoffMethod: method,
            id: row.id,
            importId: importRow.id,
            importStatus: "queued",
            inputJson: { email: row.email, full_name: "Import" },
            matchedUserId: null,
            matchedUserUpdatedAt: null,
            normalizedEmail: row.email,
            operation: "create",
            role: "student",
            rowNumber: 1,
            status: "processing",
          } as never,
          { email: row.email, fullName: "Import", targetExamEventId: null },
        ),
      );

    // Temporary-password import: the stored password is the generated, compliant one.
    const temp = await run(EnrollmentHandoffMethod.temporary_password, rows[0]);
    createdUserIds.push(temp.userId);
    const tempUser = await prisma.user.findUniqueOrThrow({ where: { id: temp.userId } });
    assert.equal(tempUser.mustChangePassword, true);
    const released = await openHandoffSecret(temp.handoffId, temp.userId);
    assert.equal(violation(released), null, "the generated import password complies");
    assert.equal(await verifyPassword(released, tempUser.passwordHash), true, "and it is what is stored");

    // Invite import: succeeds (an opaque token would fail the password rule) and stores nothing usable.
    const invite = await run(EnrollmentHandoffMethod.invite_link, rows[1]);
    createdUserIds.push(invite.userId);
    const inviteUser = await prisma.user.findUniqueOrThrow({ where: { id: invite.userId } });
    assert.equal(inviteUser.mustChangePassword, true);
    const inviteHandoff = await prisma.enrollmentHandoff.findUniqueOrThrow({ where: { id: invite.handoffId } });
    assert.ok(inviteHandoff.tokenHash, "the invite carries its token hash");
    assert.equal(await verifyPassword("", inviteUser.passwordHash), false);
    assert.equal(await verifyPassword(inviteHandoff.tokenHash, inviteUser.passwordHash), false);
  } finally {
    await prisma.enrollmentHandoff.deleteMany({ where: { sourceImportRowId: { not: null }, userId: { in: createdUserIds } } });
    await prisma.enrollmentImport.delete({ where: { id: importRow.id } }).catch(() => undefined);
  }
}

/** Opens the sealed temporary password of a pending handoff, the way the release step does. */
async function openHandoffSecret(handoffId: string, userId: string) {
  const { openEnrollmentHandoffSecret } = await import("../lib/admin/handoffs/envelope");
  const handoff = await prisma.enrollmentHandoff.findUniqueOrThrow({ where: { id: handoffId } });
  return openEnrollmentHandoffSecret(handoff.secretEnvelope as never, {
    handoffId,
    method: handoff.method,
    userId,
  });
}

async function checkMigration() {
  const sql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261102150000_force_password_change_for_composition_rule/migration.sql"),
    "utf8",
  );
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const ids: Record<string, string> = {};
    for (const role of ["admin", "tutor", "student", "affiliator"]) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, full_name, password_hash, must_change_password)
         VALUES ($1, $2, 'fixture-hash', false) RETURNING id`,
        [`password-policy-migration-${role}-${runId}@vecalss.local`, `Migration ${role}`],
      );
      ids[role] = inserted.rows[0].id;
      await client.query(`INSERT INTO role_assignments (user_id, role) VALUES ($1, $2::role_name)`, [ids[role], role]);
    }
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at, status)
       VALUES ($1, $2, now() + interval '1 hour', 'active') RETURNING id`,
      [ids.admin, hashToken(createOpaqueToken())],
    );

    await client.query(sql);

    const flags = await client.query<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM users WHERE id = ANY($1::uuid[])`,
      [Object.values(ids)],
    );
    assert.equal(flags.rowCount, 4);
    assert.ok(flags.rows.every((row) => row.must_change_password === true), "every role is flagged, compliant or not");
    const everyone = await client.query<{ unflagged: string }>(
      `SELECT count(*) AS unflagged FROM users WHERE must_change_password = false`,
    );
    assert.equal(everyone.rows[0].unflagged, "0", "no existing user is left unflagged");
    const sessionRow = await client.query<{ status: string }>(`SELECT status FROM auth_sessions WHERE id = $1`, [session.rows[0].id]);
    assert.equal(sessionRow.rows[0].status, "active", "the migration signs nobody out");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

async function main() {
  checkRule();
  checkGenerator();
  await checkHashing();
  checkSeeds();

  const admin = await prisma.user.findFirstOrThrow({ select: { id: true }, where: { email: "admin@vecalss.local" } });
  try {
    await checkChangePassword();
    await checkPasswordReset();
    await checkInviteAndEnrollment(admin.id);
    await checkInviteRoute(admin.id);
    await checkEdgeWhitespace(admin.id);
    await checkImportedAccounts(admin.id);
    await checkMigration();

    // No password was written to the audit trail.
    const audit = await prisma.auditLog.findMany({
      select: { metadata: true },
      where: { targetId: { in: createdUserIds } },
    });
    const auditText = JSON.stringify(audit);
    for (const secret of secretsSeen) assert.ok(!auditText.includes(secret), "audit rows never hold a password");
  } finally {
    await prisma.authSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.enrollmentHandoff.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: createdUserIds } } }).catch(() => undefined);
    await prisma.studentProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.tutorProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.affiliatorProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch((error: unknown) => {
      console.error("Fixture users could not be removed (audit rows are append-only):", (error as Error).message);
    });
    await prisma.$disconnect();
  }

  console.log("Password policy checks passed.");
}

// The shared Redis client used by the rate limiter would keep the process alive.
main().then(() => process.exit(0), (error: unknown) => {
  console.error(error);
  process.exit(1);
});
