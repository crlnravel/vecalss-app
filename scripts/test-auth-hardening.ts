import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getTrustedProxyCount,
  resolveClientIpAddress,
} from "@/lib/auth/request";

import {
  isLocalDatabaseUrl,
  seedPassword,
} from "../prisma/seed-password-policy.mjs";

const asEnv = (env: Record<string, string>) => env as NodeJS.ProcessEnv;
const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

// --- Client address resolution -------------------------------------------

// No trusted proxy: the header is client-controlled, so it is ignored.
assert.equal(resolveClientIpAddress("203.0.113.9", 0), null);
assert.equal(resolveClientIpAddress(null, 1), null);

// One trusted proxy (Vercel style): the proxy-written entry is the last one,
// and anything a client prepends to the header is never used.
assert.equal(resolveClientIpAddress("203.0.113.9", 1), "203.0.113.9");
assert.equal(
  resolveClientIpAddress("6.6.6.6, 203.0.113.9", 1),
  "203.0.113.9",
  "a client-supplied leftmost entry must not win",
);

// Two trusted proxies: the client is the second entry from the right.
assert.equal(
  resolveClientIpAddress("6.6.6.6, 203.0.113.9, 10.0.0.2", 2),
  "203.0.113.9",
);
assert.equal(resolveClientIpAddress("10.0.0.2", 2), null, "chain shorter than the proxy count");

// Values that are not IP addresses never reach the inet column or throttle.
assert.equal(resolveClientIpAddress("not-an-ip", 1), null);
assert.equal(resolveClientIpAddress("203.0.113.9:4711", 1), null);
assert.equal(resolveClientIpAddress("2001:db8::1", 1), "2001:db8::1");

// --- Trusted proxy configuration -------------------------------------------

assert.equal(getTrustedProxyCount(asEnv({})), 0);
assert.equal(getTrustedProxyCount(asEnv({ VERCEL: "1" })), 1);
assert.equal(getTrustedProxyCount(asEnv({ TRUSTED_PROXY_COUNT: "2", VERCEL: "1" })), 2);
assert.equal(getTrustedProxyCount(asEnv({ TRUSTED_PROXY_COUNT: "0", VERCEL: "1" })), 0);
assert.equal(getTrustedProxyCount(asEnv({ TRUSTED_PROXY_COUNT: "abc" })), 0);
assert.equal(getTrustedProxyCount(asEnv({ TRUSTED_PROXY_COUNT: "-1" })), 0);
assert.equal(getTrustedProxyCount(asEnv({ TRUSTED_PROXY_COUNT: "999" })), 10);

// --- Seed password policy --------------------------------------------------

const localEnv = asEnv({ DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/vecalss_dev" });
const remoteEnv = asEnv({ DATABASE_URL: "postgresql://u:p@ep-example.neon.tech/db" });

assert.equal(seedPassword("SEED_ADMIN_PASSWORD", "Default1!", localEnv), "Default1!");
assert.equal(
  seedPassword("SEED_ADMIN_PASSWORD", "Default1!", asEnv({ ...localEnv, SEED_ADMIN_PASSWORD: " Chosen9! " })),
  "Chosen9!",
);
assert.throws(() => seedPassword("SEED_ADMIN_PASSWORD", "Default1!", remoteEnv), /SEED_ADMIN_PASSWORD/);
assert.throws(() => seedPassword("SEED_ADMIN_PASSWORD", "Default1!", asEnv({})), /does not point at localhost/);
assert.throws(
  () => seedPassword("SEED_ADMIN_PASSWORD", "Default1!", asEnv({ ...localEnv, NODE_ENV: "production" })),
  /NODE_ENV=production/,
);
assert.equal(
  seedPassword("SEED_ADMIN_PASSWORD", "Default1!", asEnv({ ...remoteEnv, SEED_ADMIN_PASSWORD: "Chosen9!" })),
  "Chosen9!",
  "an explicit password is always accepted",
);
assert.equal(isLocalDatabaseUrl("postgresql://u:p@localhost.evil.example/db"), false);
assert.equal(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/db"), true);

// --- Login service contracts -----------------------------------------------

const service = read("lib/auth/service.ts");
const loginActions = read("modules/auth/actions.ts");
const access = read("lib/auth/access.ts");

// Locked accounts must answer like a wrong password: the only distinct failure
// code left is the per-client throttle, which says nothing about the account.
assert.doesNotMatch(service, /code:\s*"locked"/u);
assert.doesNotMatch(loginActions, /result\.code === "locked"/u);
assert.match(loginActions, /result\.code === "rate_limited"/u);

// Every early-return path that skips the real password check burns a decoy
// verification first, so unknown or locked emails are not faster to reject.
const decoyCalls = service.match(/await spendPasswordVerificationTime\(password\)/gu) ?? [];
assert.equal(decoyCalls.length, 4, "unknown, preview, inactive and locked paths");

const unknownEmailBranch = service.slice(
  service.indexOf("if (!userRecord) {"),
  service.indexOf("let user = userRecord;"),
);
assert.match(unknownEmailBranch, /spendPasswordVerificationTime\(password\)/u);

// Throttled attempts are not recorded, otherwise one noisy client could keep
// the window open for everyone sharing its address.
const throttleBranch = service.slice(
  service.indexOf("if (await isLoginThrottledForIp(ipAddress))"),
  service.indexOf("const userRecord = await prisma.user.findUnique"),
);
assert.match(throttleBranch, /code: "rate_limited"/u);
assert.doesNotMatch(throttleBranch, /recordLoginAttempt/u);

// Admin guards enforce the forced password change like every other role.
const adminGuard = access.slice(
  access.indexOf("async function requireAdminSession("),
  access.indexOf("/**\n * Preview pages"),
);
assert.equal(
  (adminGuard.match(/mustChangePassword/gu) ?? []).length >= 2,
  true,
  "requireAdminSession and requireAdminReadOnlySession both check mustChangePassword",
);

console.log("Auth hardening contracts passed.");
