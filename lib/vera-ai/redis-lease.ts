import "server-only";

import { randomUUID } from "node:crypto";

import IORedis from "ioredis";

const VERA_REDIS_OPERATION_TIMEOUT_MS = 1_000;

export type VeraLease = {
  key: string;
  ownerId: string;
  fencingToken: number;
  expiresAt: Date;
};

export type VeraLeaseAcquireInput = {
  studentId: string;
  featureKey: string;
  maxConcurrent: number;
  burstLimit: number;
  burstWindowMs: number;
  ttlMs: number;
  now?: Date;
};

export type VeraRedisFaults = {
  unavailable?: boolean;
  reject?: boolean;
  renewalFailure?: boolean;
  releaseFailure?: boolean;
};

export type VeraLeaseRejectionReason = "burst" | "concurrency";

export type VeraLeaseAcquireOutcome = {
  lease: VeraLease | null;
  rejectionReason?: VeraLeaseRejectionReason;
};

export class VeraRedisUnavailableError extends Error {
  constructor(message = "Vera Redis is unavailable.") {
    super(message);
    this.name = "VeraRedisUnavailableError";
  }
}

export interface VeraLeaseStore {
  acquire(input: VeraLeaseAcquireInput): Promise<VeraLease | null>;
  acquireWithReason?(input: VeraLeaseAcquireInput): Promise<VeraLeaseAcquireOutcome>;
  renew(lease: VeraLease, ttlMs: number, now?: Date): Promise<VeraLease | null>;
  release(lease: VeraLease): Promise<boolean>;
  close?(): Promise<void>;
}

type MemoryBucket = {
  burstCount: number;
  burstWindowStartedAt: number;
  nextFence: number;
  owners: Map<string, { fencingToken: number; expiresAt: number }>;
};

/**
 * Deterministic disposable-Redis substitute. Acquisition is one synchronous
 * critical section, so tests can exercise the same burst/concurrency/fencing
 * contract without using the configured REDIS_URL.
 */
export class InMemoryVeraLeaseStore implements VeraLeaseStore {
  private readonly buckets = new Map<string, MemoryBucket>();
  private readonly released = new Set<string>();

  constructor(private readonly faults: VeraRedisFaults = {}) {}

  async acquire(input: VeraLeaseAcquireInput): Promise<VeraLease | null> {
    return (await this.acquireWithReason(input)).lease;
  }

  async acquireWithReason(input: VeraLeaseAcquireInput): Promise<VeraLeaseAcquireOutcome> {
    this.assertAvailable();
    if (this.faults.reject) return { lease: null, rejectionReason: "concurrency" };
    const now = input.now?.getTime() ?? Date.now();
    const key = leaseKey(input.studentId, input.featureKey);
    const bucket = this.getBucket(key, now, input.burstWindowMs);
    if (bucket.burstWindowStartedAt + input.burstWindowMs <= now) {
      bucket.burstWindowStartedAt = now;
      bucket.burstCount = 0;
    }
    for (const [ownerId, owner] of bucket.owners) {
      if (owner.expiresAt <= now) bucket.owners.delete(ownerId);
    }
    if (bucket.owners.size >= input.maxConcurrent) return { lease: null, rejectionReason: "concurrency" };
    if (bucket.burstCount >= input.burstLimit) return { lease: null, rejectionReason: "burst" };
    bucket.burstCount += 1;
    const ownerId = randomUUID();
    const fencingToken = ++bucket.nextFence;
    const expiresAt = now + input.ttlMs;
    bucket.owners.set(ownerId, { fencingToken, expiresAt });
    return { lease: { key, ownerId, fencingToken, expiresAt: new Date(expiresAt) } };
  }

  async renew(lease: VeraLease, ttlMs: number, now = new Date()): Promise<VeraLease | null> {
    this.assertAvailable();
    if (this.faults.renewalFailure) return null;
    const bucket = this.buckets.get(lease.key);
    const current = bucket?.owners.get(lease.ownerId);
    const timestamp = now.getTime();
    if (!current || current.fencingToken !== lease.fencingToken || current.expiresAt <= timestamp) return null;
    current.expiresAt = timestamp + ttlMs;
    return { ...lease, expiresAt: new Date(current.expiresAt) };
  }

  async release(lease: VeraLease): Promise<boolean> {
    this.assertAvailable();
    if (this.faults.releaseFailure) return false;
    const bucket = this.buckets.get(lease.key);
    const current = bucket?.owners.get(lease.ownerId);
    const releaseIdentity = `${lease.key}:${lease.ownerId}:${lease.fencingToken}`;
    if (!current) {
      // A repeated release is idempotent until the fencing counter has
      // advanced; an old owner must not be treated as the current owner after
      // TTL expiry/reacquisition.
      if ([...(bucket?.owners.values() ?? [])].some((owner) => owner.fencingToken > lease.fencingToken)) return false;
      return this.released.has(releaseIdentity);
    }
    if (current.fencingToken !== lease.fencingToken) return false;
    bucket?.owners.delete(lease.ownerId);
    this.released.add(releaseIdentity);
    return true;
  }

  private getBucket(key: string, now: number, burstWindowMs: number): MemoryBucket {
    const existing = this.buckets.get(key);
    if (existing) return existing;
    const created: MemoryBucket = {
      burstCount: 0,
      burstWindowStartedAt: now - burstWindowMs,
      nextFence: 0,
      owners: new Map(),
    };
    this.buckets.set(key, created);
    return created;
  }

  private assertAvailable(): void {
    if (this.faults.unavailable) throw new VeraRedisUnavailableError();
  }
}

const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local max_concurrent = tonumber(ARGV[3])
local burst_limit = tonumber(ARGV[4])
local burst_window = tonumber(ARGV[5])
local owner = ARGV[6]
local owners = redis.call('HGETALL', KEYS[1])
local active = 0
local latest_expires = now + ttl
for index = 1, #owners, 2 do
  local candidate = owners[index]
  local raw = owners[index + 1]
  local separator = string.find(raw, ':')
  local expires = tonumber(string.sub(raw, 1, separator and separator - 1 or #raw))
  if expires <= now then
    redis.call('HDEL', KEYS[1], candidate)
  else
    active = active + 1
    if expires > latest_expires then latest_expires = expires end
  end
end
if active >= max_concurrent then return {0, 'concurrency'} end
local burst = tonumber(redis.call('GET', KEYS[2]) or '0')
if burst >= burst_limit then return {0, 'burst'} end
if burst == 0 then redis.call('SET', KEYS[2], 1, 'PX', burst_window) else redis.call('INCR', KEYS[2]) end
local fence = redis.call('INCR', KEYS[3])
local expires = now + ttl
redis.call('HSET', KEYS[1], owner, expires .. ':' .. fence)
redis.call('PEXPIREAT', KEYS[1], latest_expires)
return {1, owner, fence, expires}
`;

const RENEW_SCRIPT = `
local owner = ARGV[1]
local fence = ARGV[2]
local expires = redis.call('HGET', KEYS[1], owner)
if not expires then return {0} end
local separator = string.find(expires, ':')
if not separator or string.sub(expires, separator + 1) ~= fence then return {0} end
local now = tonumber(ARGV[3])
local current_expires = tonumber(string.sub(expires, 1, separator - 1))
if not current_expires or current_expires <= now then
  redis.call('HDEL', KEYS[1], owner)
  return {0}
end
local next_expires = now + tonumber(ARGV[4])
redis.call('HSET', KEYS[1], owner, next_expires .. ':' .. fence)
local owners = redis.call('HGETALL', KEYS[1])
local latest_expires = next_expires
for index = 1, #owners, 2 do
  local candidate = owners[index]
  local raw = owners[index + 1]
  local candidate_separator = string.find(raw, ':')
  local candidate_expires = tonumber(string.sub(raw, 1, candidate_separator and candidate_separator - 1 or #raw))
  if candidate_expires <= now then
    redis.call('HDEL', KEYS[1], candidate)
  elseif candidate_expires > latest_expires then
    latest_expires = candidate_expires
  end
end
redis.call('PEXPIREAT', KEYS[1], latest_expires)
return {1, next_expires}
`;

const RELEASE_SCRIPT = `
local owner = ARGV[1]
local fence = ARGV[2]
local expires = redis.call('HGET', KEYS[1], owner)
if not expires then return 1 end
local separator = string.find(expires, ':')
if not separator or string.sub(expires, separator + 1) ~= fence then return 0 end
redis.call('HDEL', KEYS[1], owner)
return 1
`;

/**
 * Production Redis adapter. It deliberately disables ioredis offline queueing:
 * an admission must fail closed while Redis is unavailable, never replay a
 * queued command after the request's policy/deadline has changed.
 */
export class IORedisVeraLeaseStore implements VeraLeaseStore {
  private readonly redis: IORedis;
  private closed = false;
  private connectPromise: Promise<void> | null = null;

  constructor(url: string) {
    if (!url.trim()) throw new VeraRedisUnavailableError("A Vera Redis URL is required.");
    this.redis = new IORedis(url, {
      commandTimeout: VERA_REDIS_OPERATION_TIMEOUT_MS,
      connectTimeout: VERA_REDIS_OPERATION_TIMEOUT_MS,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    this.redis.on("error", () => undefined);
  }

  async acquire(input: VeraLeaseAcquireInput): Promise<VeraLease | null> {
    return (await this.acquireWithReason(input)).lease;
  }

  async acquireWithReason(input: VeraLeaseAcquireInput): Promise<VeraLeaseAcquireOutcome> {
    const now = input.now?.getTime() ?? Date.now();
    const key = leaseKey(input.studentId, input.featureKey);
    const ownerId = randomUUID();
    const result = await this.evalUnavailableSafe(
      "acquire",
      () => this.redis.eval(
        ACQUIRE_SCRIPT,
        3,
        `${key}:owners`,
        `${key}:burst`,
        `${key}:fence`,
        now,
        input.ttlMs,
        input.maxConcurrent,
        input.burstLimit,
        input.burstWindowMs,
        ownerId,
      ) as Promise<Array<string | number>>,
    );
    if (!result || Number(result[0]) !== 1) {
      const rejectionReason = result?.[1] === "burst" ? "burst" : "concurrency";
      return { lease: null, rejectionReason };
    }
    return {
      lease: {
        key,
        ownerId,
        fencingToken: Number(result[2]),
        expiresAt: new Date(Number(result[3])),
      },
    };
  }

  async renew(lease: VeraLease, ttlMs: number, now = new Date()): Promise<VeraLease | null> {
    const result = await this.evalUnavailableSafe(
      "renew",
      () => this.redis.eval(
        RENEW_SCRIPT,
        1,
        `${lease.key}:owners`,
        lease.ownerId,
        lease.fencingToken,
        now.getTime(),
        ttlMs,
      ) as Promise<Array<string | number>>,
    );
    if (!result || Number(result[0]) !== 1) return null;
    return { ...lease, expiresAt: new Date(Number(result[1])) };
  }

  async release(lease: VeraLease): Promise<boolean> {
    const result = await this.evalUnavailableSafe(
      "release",
      () => this.redis.eval(
        RELEASE_SCRIPT,
        1,
        `${lease.key}:owners`,
        lease.ownerId,
        lease.fencingToken,
      ) as Promise<string | number>,
    );
    return Number(result) === 1;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.redis.status === "wait" || this.redis.status === "end") {
      this.redis.disconnect();
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async evalUnavailableSafe<T>(operation: string, evaluate: () => Promise<T>): Promise<T> {
    try {
      await this.ensureReady();
      return await this.withTimeout(evaluate());
    } catch (error) {
      if (error instanceof VeraRedisUnavailableError) throw error;
      throw new VeraRedisUnavailableError(`Vera Redis ${operation} is unavailable.`);
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.closed) throw new VeraRedisUnavailableError("Vera Redis connection is closed.");
    if (this.redis.status === "ready") return;
    if (!this.connectPromise) this.connectPromise = this.redis.connect();
    const currentAttempt = this.connectPromise;
    try {
      await this.withTimeout(currentAttempt);
      if (!this.isReady()) throw new Error("Redis connection did not become ready.");
    } finally {
      if (this.connectPromise === currentAttempt) this.connectPromise = null;
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            this.redis.disconnect();
            reject(new Error("Vera Redis operation timed out."));
          }, VERA_REDIS_OPERATION_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private isReady(): boolean {
    return this.redis.status === "ready";
  }
}

export function leaseKey(studentId: string, featureKey: string): string {
  return `vera:lease:${studentId}:${featureKey}`;
}
