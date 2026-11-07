import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { verifyPassword } from "../lib/auth/crypto";
import { prisma } from "../lib/prisma";
import { cleanupUnverifiedSignups } from "../lib/registration/cleanup";
import { registerStudent, resendVerification, verifyEmail } from "../lib/registration/service";
import type { RegistrationDeps } from "../lib/registration/service";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55432", "local database only");
const password = "Concurrency-2026!";
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", APP_BASE_URL: "http://localhost:5033", PAYMENT_STAND_IN_LOCAL: "1", REGISTRATION_OPEN: "1", PAID_ACCESS_ENFORCED: "1", TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };
const deps: RegistrationDeps = {
  env, getMetadata: async () => ({ ipAddress: null }), readDeviceToken: async () => null,
  verifyTurnstile: async () => "passed", schedule: () => {},
};
async function fixture() {
  const email = `concurrency-${randomUUID()}@ms21.test`;
  const result = await registerStudent({ email, fullName: "Siswa Uji", ageConfirmed: true, turnstileToken: "test" }, deps);
  assert.equal(result.status, "accepted");
  assert.ok(result.status === "accepted" && result.deliveredVerificationUrl);
  const token = new URL(result.deliveredVerificationUrl).pathname.split("/").at(-1)!;
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { email, token, user };
}

/** Wait for a real database lock wait, rather than hoping a sleep schedules the race. */
async function whenBlocked(pid: number) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))) AS blocked
    `;
    if (row.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("the competing request never waited on the fixture's user lock");
}

async function race<T>(userId: string, competing: () => Promise<T>, mutation: (tx: Prisma.TransactionClient) => Promise<void>) {
  let request: Promise<T> | undefined;
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    request = competing();
    await whenBlocked(row.pid);
    await mutation(tx);
  }, { timeout: 15000 });
  return request!;
}

async function staleSignup() {
  const { email, user } = await fixture();
  const { hashPassword } = await import("../lib/auth/crypto");
  const hash = await hashPassword(password);
  await race(user.id, () => registerStudent({ email, fullName: "Changed Name", ageConfirmed: true, turnstileToken: "test" }, deps), async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), passwordHash: hash } });
  });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(await verifyPassword(password, after.passwordHash), "a signup waiting on verification cannot replace the verified password");
  assert.equal(after.fullName, user.fullName);
  assert.equal(await prisma.emailVerificationToken.count({ where: { userId: user.id } }), 1, "a signup cannot issue a new token after the account was verified while waiting");
}

async function renewedCleanup() {
  const { email, user } = await fixture();
  await prisma.$executeRaw`UPDATE email_verification_tokens SET created_at = now() - interval '8 days' WHERE user_id = ${user.id}::uuid`;
  // Pause at the candidate/locked-deletion boundary and issue a real replacement link.
  let intercepted = false;
  const db = new Proxy(prisma, { get(target, prop) {
    if (prop === "$queryRaw") return async (...args: Parameters<typeof prisma.$queryRaw>) => {
      const rows = await target.$queryRaw(...args);
      if (!intercepted) {
        intercepted = true;
        assert.equal((await resendVerification({ email }, deps)).status, "accepted");
      }
      return rows;
    };
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  await cleanupUnverifiedSignups(db);
  assert.ok(await prisma.user.findUnique({ where: { id: user.id } }), "cleanup must retain a signup renewed after candidate selection");
}

async function lockOrder() {
  const { user, token } = await fixture();
  const result = await race(user.id, () => verifyEmail(token, password), async (tx) => {
    // Rotation owns the user first. Verification must wait without holding a token lock.
    await tx.emailVerificationToken.updateMany({ where: { userId: user.id }, data: { usedAt: new Date() } });
  });
  assert.deepEqual(result, { status: "invalid" }, "verification must recheck the rotated token after obtaining the user lock without deadlocking");
}

async function main() {
  const cases = { "verified-password-race": staleSignup, "cleanup-renewal-race": renewedCleanup, "user-token-lock-order": lockOrder };
  let failed = false;
  for (const [name, run] of Object.entries(cases)) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed = true; console.error(`FAIL ${name}`, error); }
  }
  if (failed) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
