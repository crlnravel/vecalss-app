import "server-only";

import IORedis from "ioredis";

const REDIS_CONNECT_TIMEOUT_MS = 1_000;

let sharedRedis: IORedis | null = null;
let sharedRedisUrl: string | null = null;

function getRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("missing_redis_url");
  }

  return redisUrl;
}

function getSharedRedisClient() {
  const redisUrl = getRedisUrl();

  if (sharedRedis && sharedRedisUrl === redisUrl && sharedRedis.status !== "end") {
    return sharedRedis;
  }

  sharedRedis?.disconnect();

  const redis = new IORedis(redisUrl, {
    commandTimeout: REDIS_CONNECT_TIMEOUT_MS,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    enableOfflineQueue: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  // The request path owns the stable fail-closed result. Avoid allowing an
  // unreachable shared backend to surface as an uncaught EventEmitter error.
  redis.on("error", () => undefined);

  sharedRedis = redis;
  sharedRedisUrl = redisUrl;
  return redis;
}

async function closeSharedRedisClient() {
  const redis = sharedRedis;
  sharedRedis = null;
  sharedRedisUrl = null;

  if (!redis) {
    return;
  }

  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export { closeSharedRedisClient, getSharedRedisClient };
