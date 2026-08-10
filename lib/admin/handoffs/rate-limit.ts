type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitScope = "invite" | "password_reset";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const RATE_LIMIT_SHARD_COUNT = 256;
const MAX_TRACKED_KEYS_PER_SHARD = 64;
const MAX_IDENTITY_LENGTH = 128;
const FALLBACK_TRUSTED_IDENTITY = "anonymous";
const attemptsByScope: Record<RateLimitScope, Array<Map<string, RateLimitEntry>>> = {
  invite: Array.from({ length: RATE_LIMIT_SHARD_COUNT }, () => new Map()),
  password_reset: Array.from({ length: RATE_LIMIT_SHARD_COUNT }, () => new Map()),
};

/**
 * No shared atomic rate-limit backend is present in this repository. Keep the
 * fallback identity deliberately non-spoofable: route callers must not derive
 * it from a client-controlled proxy header. The token hash remains in the
 * key, and each bearer surface has its own bounded bucket.
 */
function getTrustedInviteIdentity() {
  return FALLBACK_TRUSTED_IDENTITY;
}

function getShardIndex(tokenHash: string) {
  // The token hash is already a canonical 64-character hex digest. Sharding
  // on its final byte keeps the fallback deterministic while preventing one
  // bounded bucket from turning a unique-key flood into global denial.
  return Number.parseInt(tokenHash.slice(-2), 16);
}

function consumeBoundedRateLimit({
  identity,
  now = Date.now(),
  scope,
  tokenHash,
}: {
  identity: string;
  now?: number;
  scope: RateLimitScope;
  tokenHash: string;
}) {
  // The only trusted identity currently available is the fixed fallback. A
  // caller-provided identity is rejected rather than becoming a spoofable
  // dimension of the limiter.
  if (
    identity !== FALLBACK_TRUSTED_IDENTITY
    || identity.length > MAX_IDENTITY_LENGTH
    || !/^[0-9a-f]{64}$/.test(tokenHash)
  ) {
    return false;
  }

  const attempts = attemptsByScope[scope][getShardIndex(tokenHash)];

  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) {
      attempts.delete(key);
    }
  }

  const key = `${identity}:${tokenHash}`;
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS_PER_SHARD && !current) {
      // Fail closed for new keys while retaining every active key already in
      // its deterministic shard. In particular, unique-key flooding cannot
      // evict a hot token and reset its attempt window, or deny keys in every
      // other shard.
      return false;
    }

    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_ATTEMPTS) {
    return false;
  }

  current.count += 1;
  return true;
}

function consumeInviteRateLimit(input: {
  identity: string;
  now?: number;
  tokenHash: string;
}) {
  return consumeBoundedRateLimit({ ...input, scope: "invite" });
}

function consumePasswordResetRateLimit(input: {
  identity: string;
  now?: number;
  tokenHash: string;
}) {
  return consumeBoundedRateLimit({ ...input, scope: "password_reset" });
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
