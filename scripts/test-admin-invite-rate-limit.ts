import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const TEST_WINDOW_MS = 1_000;
const CONCURRENT_WINDOW_MS = 10_000;
const RATE_LIMIT_SHARD_COUNT = 256;
const LOCAL_REDIS_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function indexedToken(prefix: string, index: number) {
  return `${prefix}${index.toString(16).padStart(48, "0")}`;
}

function tokenForShard(prefix: string, index: number, suffix: string) {
  const bodyLength = 64 - prefix.length - suffix.length;
  return `${prefix}${index.toString(16).padStart(bodyLength, "0")}${suffix}`;
}

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function redisTargetIdentity(redisUrl: string) {
  const parsed = new URL(redisUrl);
  const defaultPort = parsed.protocol === "rediss:" ? "6380" : "6379";
  const rawDatabase = parsed.pathname.replace(/^\/+/, "") || "0";
  const database = /^\d+$/.test(rawDatabase) ? String(Number(rawDatabase)) : rawDatabase;
  return [
    parsed.protocol,
    parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
    parsed.port || defaultPort,
    database,
  ].join("|");
}

function validateDedicatedRedisTarget(testRedisUrl: string, runtimeRedisUrl: string | undefined) {
  let parsed: URL;
  try {
    parsed = new URL(testRedisUrl);
  } catch {
    throw new Error("ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL must be a valid Redis URL");
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL must use redis:// or rediss://");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("refusing to run the rate-limit integration test in production");
  }

  if (runtimeRedisUrl && redisTargetIdentity(testRedisUrl) === redisTargetIdentity(runtimeRedisUrl)) {
    throw new Error("ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL must not target runtime REDIS_URL");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const explicitlyDisposable = process.env.ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_DISPOSABLE === "1";
  if (!LOCAL_REDIS_HOSTS.has(hostname) && !explicitlyDisposable) {
    throw new Error(
      "non-local test Redis requires ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_DISPOSABLE=1; use a disposable instance/database",
    );
  }
}

function getRateLimitKeys(namespace: string, scope: "invite" | "password_reset", tokenHash: string) {
  const shard = Number.parseInt(tokenHash.slice(-2), 16) % RATE_LIMIT_SHARD_COUNT;
  const prefix = `${namespace}:{${scope}:${shard}}`;

  return {
    shardKey: `${prefix}:active`,
    tokenKey: `${prefix}:token:${tokenHash}`,
  };
}

async function main() {
  const testRedisUrl = process.env.ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL?.trim();

  // Do not import the server limiter or issue a valid request before the
  // dedicated integration target is selected. This keeps a developer's
  // ambient runtime REDIS_URL completely out of the skipped test path.
  if (!testRedisUrl) {
    if (process.env.CI) {
      throw new Error(
        "ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL is required in CI; refusing to silently skip the Redis integration test",
      );
    }

    console.log(
      "admin invite/reset rate-limit Redis integration skipped: set ADMIN_INVITE_RATE_LIMIT_TEST_REDIS_URL; runtime REDIS_URL is never used.",
    );
    return;
  }

  const originalRedisUrl = process.env.REDIS_URL;
  const originalNamespace = process.env.ADMIN_INVITE_RATE_LIMIT_TEST_NAMESPACE;
  validateDedicatedRedisTarget(testRedisUrl, originalRedisUrl?.trim());
  if (process.env.NODE_ENV !== "test") {
    throw new Error("run the rate-limit integration test with NODE_ENV=test");
  }

  const namespace = `vecalss:rate-limit:test:${randomUUID()}`;
  process.env.REDIS_URL = testRedisUrl;
  process.env.ADMIN_INVITE_RATE_LIMIT_TEST_NAMESPACE = namespace;

  const rateLimit = await import("@/lib/admin/handoffs/rate-limit");
  const { closeSharedRedisClient, getSharedRedisClient } = await import("@/lib/redis");

  try {
    assert.equal(rateLimit.getTrustedInviteIdentity(), "anonymous");
    assert.equal(
      await rateLimit.consumeInviteRateLimit({ identity: "untrusted-client", tokenHash: "a".repeat(64) }),
      false,
    );
    assert.equal(
      await rateLimit.consumeInviteRateLimit({ identity: "anonymous", tokenHash: "not-a-hash" }),
      false,
    );

    const concurrentInviteToken = indexedToken(randomBytes(8).toString("hex"), 0xbbbb);
    const inviteResults = await Promise.all(
      Array.from({ length: rateLimit.INVITE_RATE_LIMIT_MAX_ATTEMPTS * 2 }, () =>
        rateLimit.consumeInviteRateLimit({
          identity: "anonymous",
          tokenHash: concurrentInviteToken,
          windowMs: CONCURRENT_WINDOW_MS,
        }),
      ),
    );
    assert.equal(
      inviteResults.filter(Boolean).length,
      rateLimit.INVITE_RATE_LIMIT_MAX_ATTEMPTS,
      "concurrent invite calls must allow exactly the configured number of attempts",
    );
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: concurrentInviteToken,
        windowMs: CONCURRENT_WINDOW_MS,
      }),
      false,
    );

    const shardPrefix = randomBytes(8).toString("hex");
    const capacityResults = await Promise.all(
      Array.from({ length: 65 }, (_, index) =>
        rateLimit.consumeInviteRateLimit({
          identity: "anonymous",
          tokenHash: tokenForShard(shardPrefix, index, "aa"),
          windowMs: CONCURRENT_WINDOW_MS,
        }),
      ),
    );
    assert.equal(
      capacityResults.filter(Boolean).length,
      64,
      "a shard must never track more than 64 token keys under concurrent creation",
    );

    const deletedShardToken = indexedToken(randomBytes(8).toString("hex"), 0xbbbb);
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: deletedShardToken,
        windowMs: CONCURRENT_WINDOW_MS,
      }),
      true,
    );
    const deletedShardKeys = getRateLimitKeys(namespace, "invite", deletedShardToken);
    await getSharedRedisClient().del(deletedShardKeys.shardKey);
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: deletedShardToken,
        windowMs: TEST_WINDOW_MS * 100,
      }),
      false,
      "a surviving counter without shard membership must fail closed",
    );

    const deletedCounterToken = indexedToken(randomBytes(8).toString("hex"), 0xcccc);
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: deletedCounterToken,
        windowMs: TEST_WINDOW_MS * 100,
      }),
      true,
    );
    const deletedCounterKeys = getRateLimitKeys(namespace, "invite", deletedCounterToken);
    await getSharedRedisClient().del(deletedCounterKeys.tokenKey);
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: deletedCounterToken,
        windowMs: TEST_WINDOW_MS * 100,
      }),
      false,
      "surviving shard membership without a counter must fail closed",
    );

    const expiringInviteToken = indexedToken(randomBytes(8).toString("hex"), 0xdddd);
    for (let attempt = 0; attempt < rateLimit.INVITE_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      assert.equal(
        await rateLimit.consumeInviteRateLimit({
          identity: "anonymous",
          tokenHash: expiringInviteToken,
          windowMs: TEST_WINDOW_MS,
        }),
        true,
      );
    }
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: expiringInviteToken,
        windowMs: TEST_WINDOW_MS,
      }),
      false,
    );
    await wait(TEST_WINDOW_MS + 100);
    assert.equal(
      await rateLimit.consumeInviteRateLimit({
        identity: "anonymous",
        tokenHash: expiringInviteToken,
        windowMs: TEST_WINDOW_MS,
      }),
      true,
    );

    const concurrentResetToken = indexedToken(randomBytes(8).toString("hex"), 0xeeee);
    const resetResults = await Promise.all(
      Array.from({ length: rateLimit.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS * 2 }, () =>
        rateLimit.consumePasswordResetRateLimit({
          identity: "anonymous",
          tokenHash: concurrentResetToken,
          windowMs: CONCURRENT_WINDOW_MS,
        }),
      ),
    );
    assert.equal(
      resetResults.filter(Boolean).length,
      rateLimit.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS,
      "concurrent password-reset calls must allow exactly the configured number of attempts",
    );
    assert.equal(
      await rateLimit.consumePasswordResetRateLimit({
        identity: "untrusted-client",
        tokenHash: concurrentResetToken,
        windowMs: CONCURRENT_WINDOW_MS,
      }),
      false,
    );

    console.log("admin invite/reset rate-limit Redis integration checks passed");
  } finally {
    await closeSharedRedisClient();
    restoreEnvironmentVariable("REDIS_URL", originalRedisUrl);
    restoreEnvironmentVariable("ADMIN_INVITE_RATE_LIMIT_TEST_NAMESPACE", originalNamespace);
  }
}

await main();
