import "server-only";

import { getSharedRedisClient } from "@/lib/redis";

type RateLimitScope = "invite" | "password_reset";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const RATE_LIMIT_SHARD_COUNT = 256;
const MAX_TRACKED_KEYS_PER_SHARD = 64;
const MAX_IDENTITY_LENGTH = 128;
const FALLBACK_TRUSTED_IDENTITY = "anonymous";
const RATE_LIMIT_KEY_NAMESPACE = process.env.NODE_ENV === "test"
  ? process.env.ADMIN_INVITE_RATE_LIMIT_TEST_NAMESPACE?.trim() || "vecalss:rate-limit:v1"
  : process.env.SCALABILITY_SIMULATION === "1"
    ? process.env.SCALABILITY_RATE_LIMIT_NAMESPACE?.trim() || "vecalss:rate-limit:scalability"
    : "vecalss:rate-limit:v1";

// KEYS[1] is the bounded shard sorted set. KEYS[2] is the token counter.
// Redis TIME is authoritative so separate API processes cannot disagree about
// when a window starts. The optional window argument exists only for the
// disposable integration test; production callers use WINDOW_MS.
const CONSUME_RATE_LIMIT_SCRIPT = `
local time = redis.call("TIME")
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local windowMs = tonumber(ARGV[1])
local maxAttempts = tonumber(ARGV[2])
local maxTrackedKeys = tonumber(ARGV[3])
local tokenPrefix = ARGV[4]
local tokenHash = ARGV[5]

local expired = redis.call("ZRANGEBYSCORE", KEYS[1], "-inf", nowMs)
for _, expiredHash in ipairs(expired) do
  redis.call("ZREM", KEYS[1], expiredHash)
  redis.call("DEL", tokenPrefix .. expiredHash)
end

local current = redis.call("GET", KEYS[2])
local membership = redis.call("ZSCORE", KEYS[1], tokenHash)
local trackedKeys = redis.call("ZCARD", KEYS[1])
if not current then
  -- The counter and membership are deliberately separate keys so the shard
  -- can stay bounded. If either half disappears independently, fail closed
  -- for the rest of that window instead of resetting or re-adding a token.
  if membership ~= false or trackedKeys >= maxTrackedKeys then
    return 0
  end

  redis.call("SET", KEYS[2], "1", "PX", windowMs)
  redis.call("ZADD", KEYS[1], nowMs + windowMs, tokenHash)
  redis.call("PEXPIRE", KEYS[1], windowMs)
  return 1
end

local count = tonumber(current)
if not count or count >= maxAttempts or membership == false or trackedKeys > maxTrackedKeys then
  return 0
end

local nextCount = redis.call("INCR", KEYS[2])
redis.call("PEXPIRE", KEYS[1], windowMs)
return nextCount <= maxAttempts and 1 or 0
`;

function getShardIndex(tokenHash: string) {
  return Number.parseInt(tokenHash.slice(-2), 16) % RATE_LIMIT_SHARD_COUNT;
}

function getRateLimitKeys(scope: RateLimitScope, tokenHash: string) {
  const shard = getShardIndex(tokenHash);
  const slot = `${scope}:${shard}`;
  const prefix = `${RATE_LIMIT_KEY_NAMESPACE}:{${slot}}`;

  return {
    shardKey: `${prefix}:active`,
    tokenKey: `${prefix}:token:${tokenHash}`,
    tokenPrefix: `${prefix}:token:`,
  };
}

async function consumeBoundedRateLimit({
  identity,
  scope,
  tokenHash,
  windowMs = WINDOW_MS,
}: {
  identity: string;
  scope: RateLimitScope;
  tokenHash: string;
  windowMs?: number;
}) {
  // The only trusted identity currently available is the fixed fallback. A
  // caller-provided identity is rejected rather than becoming a spoofable
  // dimension of the limiter.
  if (
    identity !== FALLBACK_TRUSTED_IDENTITY
    || identity.length > MAX_IDENTITY_LENGTH
    || !/^[0-9a-f]{64}$/.test(tokenHash)
    || !Number.isSafeInteger(windowMs)
    || windowMs <= 0
  ) {
    return false;
  }

  const { shardKey, tokenKey, tokenPrefix } = getRateLimitKeys(scope, tokenHash);

  try {
    const result = await getSharedRedisClient().eval(
      CONSUME_RATE_LIMIT_SCRIPT,
      2,
      shardKey,
      tokenKey,
      windowMs,
      MAX_ATTEMPTS,
      MAX_TRACKED_KEYS_PER_SHARD,
      tokenPrefix,
      tokenHash,
    );

    return Number(result) === 1;
  } catch {
    // Redis is the shared security boundary. Never fall back to a process
    // local bucket when it is missing, unavailable, or returns an error.
    return false;
  }
}

async function consumeInviteRateLimit(input: {
  identity: string;
  tokenHash: string;
  windowMs?: number;
}) {
  return consumeBoundedRateLimit({ ...input, scope: "invite" });
}

async function consumePasswordResetRateLimit(input: {
  identity: string;
  tokenHash: string;
  windowMs?: number;
}) {
  return consumeBoundedRateLimit({ ...input, scope: "password_reset" });
}

function getTrustedInviteIdentity() {
  return FALLBACK_TRUSTED_IDENTITY;
}

export {
  consumeInviteRateLimit,
  consumePasswordResetRateLimit,
  getTrustedInviteIdentity,
  MAX_ATTEMPTS as INVITE_RATE_LIMIT_MAX_ATTEMPTS,
  MAX_ATTEMPTS as PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS,
  WINDOW_MS as INVITE_RATE_LIMIT_WINDOW_MS,
  WINDOW_MS as PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
};
