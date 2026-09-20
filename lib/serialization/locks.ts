import "server-only";

import { Prisma } from "@/generated/prisma/client";

/**
 * The single lock-order vocabulary used by mutation-capable repositories.
 * Keeping the level on the helper makes a reverse acquisition visible in
 * tests and in development before it can become a production deadlock.
 */
const LOCK_LEVEL = {
  domain: 0,
  edit: 1,
  principal: 2,
  organization: 3,
  aggregate: 4,
  session: 5,
  runtime: 6,
  child: 7,
  audit: 8,
} as const;

type LockLevel = (typeof LOCK_LEVEL)[keyof typeof LOCK_LEVEL];
type SerializationTransaction = Prisma.TransactionClient;

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

class ResourceBusyRetryError extends Error {
  readonly code = "resource_busy_retry" as const;
  readonly status = 409;

  constructor(message = "Resource sedang diproses. Coba lagi.") {
    super(message);
    this.name = "ResourceBusyRetryError";
  }
}

type AcquisitionState = {
  highestLevel: LockLevel | null;
  lastKeyByLevel: Partial<Record<LockLevel, string>>;
};

// Prisma gives each interactive transaction a stable client object. A
// WeakMap keeps the assertion state transaction-local without leaking after a
// transaction completes.
const acquisitionStates = new WeakMap<object, AcquisitionState>();

function stateFor(tx: SerializationTransaction) {
  const key = tx as unknown as object;
  const existing = acquisitionStates.get(key);
  if (existing) return existing;
  const state: AcquisitionState = { highestLevel: null, lastKeyByLevel: {} };
  acquisitionStates.set(key, state);
  return state;
}

function assertLockOrder(
  tx: SerializationTransaction,
  level: LockLevel,
  key: string,
) {
  const state = stateFor(tx);
  if (state.highestLevel !== null && level < state.highestLevel) {
    throw new Error(
      `Invalid mutation lock order: level ${level} (${key}) follows level ${state.highestLevel}.`,
    );
  }
  const previous = state.lastKeyByLevel[level];
  if (previous !== undefined && key < previous) {
    throw new Error(
      `Invalid mutation lock order: ${key} follows ${previous} at level ${level}.`,
    );
  }
  state.highestLevel = state.highestLevel === null
    ? level
    : Math.max(state.highestLevel, level) as LockLevel;
  state.lastKeyByLevel[level] = key;
}

function orderedUnique(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function setTransactionLockTimeout(
  tx: SerializationTransaction,
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Transaction lock timeout must be a positive integer.");
  }
  await tx.$executeRaw`
    SELECT set_config('lock_timeout', ${`${timeoutMs}ms`}, true)
  `;
}

async function acquireAdvisoryLock(
  tx: SerializationTransaction,
  key: string,
  level: LockLevel,
) {
  assertLockOrder(tx, level, key);
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
  `;
}

async function acquireDomainMutex(
  tx: SerializationTransaction,
  key: string,
) {
  return acquireAdvisoryLock(tx, key, LOCK_LEVEL.domain);
}

async function acquireDomainMutexes(
  tx: SerializationTransaction,
  keys: readonly string[],
) {
  for (const key of orderedUnique(keys)) await acquireDomainMutex(tx, key);
}

async function acquireEditKey(
  tx: SerializationTransaction,
  resourceType: string,
  resourceId: string,
) {
  return acquireAdvisoryLock(tx, `${resourceType}:${resourceId}`, LOCK_LEVEL.edit);
}

async function acquireEditKeys(
  tx: SerializationTransaction,
  keys: readonly { resourceId: string; resourceType: string }[],
) {
  const canonicalKeys = orderedUnique(
    keys.map(({ resourceId, resourceType }) => `${resourceType}:${resourceId}`),
  );
  for (const key of canonicalKeys) await acquireAdvisoryLock(tx, key, LOCK_LEVEL.edit);
}

async function acquirePrincipalRuntimeKey(
  tx: SerializationTransaction,
  key: string,
) {
  return acquireAdvisoryLock(tx, key, LOCK_LEVEL.principal);
}

/**
 * Lock a collection by deterministic canonical key. The callback is awaited
 * sequentially, deliberately avoiding Promise.all for row-lock promises.
 */
async function lockOrderedRows(
  tx: SerializationTransaction,
  level: LockLevel,
  keys: readonly string[],
  lockOne: (tx: SerializationTransaction, key: string) => Promise<unknown>,
) {
  for (const key of orderedUnique(keys)) {
    assertLockOrder(tx, level, key);
    await lockOne(tx, key);
  }
}

function isRetryableSerializationFailure(error: unknown) {
  if (error instanceof ResourceBusyRetryError) return true;
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & {
    code?: string;
    meta?: { code?: string; cause?: { code?: string } };
  };
  const code = candidate.code ?? candidate.meta?.code ?? candidate.meta?.cause?.code;
  return code === "55P03" || code === "40P01" || code === "P2034"
    || /lock timeout|deadlock detected|could not serialize/i.test(candidate.message);
}

function toResourceBusyRetry(error: unknown): ResourceBusyRetryError | null {
  return isRetryableSerializationFailure(error)
    ? new ResourceBusyRetryError()
    : null;
}

async function withSerializationLockTimeout<T>(
  tx: SerializationTransaction,
  callback: () => Promise<T>,
) {
  await setTransactionLockTimeout(tx);
  try {
    return await callback();
  } catch (error) {
    throw toResourceBusyRetry(error) ?? error;
  }
}

function tryoutMutexKey(tryoutId: string) {
  return `tryout:${tryoutId}`;
}

function bankOrganizationFoldersMutexKey(purpose: string) {
  return `bank-org:folders:${purpose}`;
}

function bankOrganizationCategoriesMutexKey() {
  return "bank-org:categories";
}

export {
  DEFAULT_LOCK_TIMEOUT_MS,
  LOCK_LEVEL,
  ResourceBusyRetryError,
  acquireAdvisoryLock,
  acquireDomainMutex,
  acquireDomainMutexes,
  acquireEditKey,
  acquireEditKeys,
  acquirePrincipalRuntimeKey,
  isRetryableSerializationFailure,
  lockOrderedRows,
  orderedUnique,
  setTransactionLockTimeout,
  toResourceBusyRetry,
  tryoutMutexKey,
  bankOrganizationFoldersMutexKey,
  bankOrganizationCategoriesMutexKey,
  withSerializationLockTimeout,
};

export type { LockLevel, SerializationTransaction };
