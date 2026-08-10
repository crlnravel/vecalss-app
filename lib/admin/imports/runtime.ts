import os from "node:os";

import {
  EnrollmentHandoffCryptoError,
  validateEnrollmentHandoffConfiguration,
} from "@/lib/admin/handoffs/envelope";

const WORKER_HEARTBEAT_KEY = "admin-import-worker:heartbeat";
const WORKER_HEARTBEAT_TTL_SECONDS = 45;
const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

type WorkerRuntimeConfig = {
  appBaseUrl: string;
  databaseUrl: string;
  heartbeatIntervalMs: number;
  heartbeatKey: string;
  heartbeatTtlSeconds: number;
  keyRing: ReturnType<typeof validateEnrollmentHandoffConfiguration>["keyRing"];
  redisUrl: string;
  workerId: string;
};

type RuntimeConfigErrorCode =
  | "missing_database_url"
  | "invalid_database_url"
  | "missing_redis_url"
  | "invalid_redis_url"
  | "missing_app_base_url"
  | "invalid_app_base_url"
  | "invalid_handoff_key_ring";

class AdminImportRuntimeConfigError extends Error {
  readonly code: RuntimeConfigErrorCode;

  constructor(code: RuntimeConfigErrorCode, message: string) {
    super(message);
    this.name = "AdminImportRuntimeConfigError";
    this.code = code;
  }
}

function parseRequiredUrl(
  value: string | undefined,
  protocols: readonly string[],
  missingCode: RuntimeConfigErrorCode,
  invalidCode: RuntimeConfigErrorCode,
  label: string,
) {
  const raw = value?.trim();
  if (!raw) {
    throw new AdminImportRuntimeConfigError(missingCode, `${label} is required for the import worker.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AdminImportRuntimeConfigError(invalidCode, `${label} must be a valid URL.`);
  }

  if (!protocols.includes(parsed.protocol) || !parsed.hostname || parsed.username && !parsed.password) {
    throw new AdminImportRuntimeConfigError(invalidCode, `${label} has an unsupported URL shape.`);
  }

  return raw;
}

function normalizedWorkerId(value: string | undefined) {
  const candidate = value?.trim() || `${os.hostname()}:${process.pid}`;
  return candidate
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._:-]/gu, "_")
    .slice(0, 120) || "admin-import-worker";
}

function validateAdminImportWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerRuntimeConfig {
  const databaseUrl = parseRequiredUrl(
    env.DATABASE_URL,
    ["postgres:", "postgresql:"],
    "missing_database_url",
    "invalid_database_url",
    "DATABASE_URL",
  );
  const redisUrl = parseRequiredUrl(
    env.REDIS_URL,
    ["redis:", "rediss:"],
    "missing_redis_url",
    "invalid_redis_url",
    "REDIS_URL",
  );
  if (!env.APP_BASE_URL?.trim()) {
    throw new AdminImportRuntimeConfigError(
      "missing_app_base_url",
      "APP_BASE_URL is required for the import worker.",
    );
  }

  let validated: ReturnType<typeof validateEnrollmentHandoffConfiguration>;
  try {
    validated = validateEnrollmentHandoffConfiguration(env);
  } catch (error) {
    if (error instanceof EnrollmentHandoffCryptoError) {
      throw new AdminImportRuntimeConfigError(
        error.code === "invalid_base_url" ? "invalid_app_base_url" : "invalid_handoff_key_ring",
        error.code === "invalid_base_url" ? "APP_BASE_URL is invalid." : "The enrollment handoff key ring is invalid.",
      );
    }
    throw new AdminImportRuntimeConfigError("invalid_app_base_url", "APP_BASE_URL is invalid.");
  }

  return {
    appBaseUrl: validated.baseUrl,
    databaseUrl,
    heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
    heartbeatKey: WORKER_HEARTBEAT_KEY,
    heartbeatTtlSeconds: WORKER_HEARTBEAT_TTL_SECONDS,
    keyRing: validated.keyRing,
    redisUrl,
    workerId: normalizedWorkerId(env.ADMIN_IMPORT_WORKER_ID),
  };
}

function isLocalDisposableHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function validateDisposableSmokeUrls({
  databaseUrl,
  redisUrl,
}: {
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
}) {
  const database = parseRequiredUrl(
    databaseUrl,
    ["postgres:", "postgresql:"],
    "missing_database_url",
    "invalid_database_url",
    "ADMIN_IMPORT_SMOKE_DATABASE_URL",
  );
  const redis = parseRequiredUrl(
    redisUrl,
    ["redis:", "rediss:"],
    "missing_redis_url",
    "invalid_redis_url",
    "ADMIN_IMPORT_SMOKE_REDIS_URL",
  );
  const databaseParsed = new URL(database);
  const redisParsed = new URL(redis);
  if (!isLocalDisposableHost(databaseParsed.hostname) || !isLocalDisposableHost(redisParsed.hostname)) {
    throw new Error("admin_import_smoke_requires_local_disposable_urls");
  }
  if (process.env.DATABASE_URL?.trim() === database || process.env.REDIS_URL?.trim() === redis) {
    throw new Error("admin_import_smoke_must_not_reuse_runtime_urls");
  }
  return { databaseUrl: database, redisUrl: redis };
}

export {
  AdminImportRuntimeConfigError,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
  isLocalDisposableHost,
  validateAdminImportWorkerConfig,
  validateDisposableSmokeUrls,
};

export type {
  RuntimeConfigErrorCode,
  WorkerRuntimeConfig,
};
