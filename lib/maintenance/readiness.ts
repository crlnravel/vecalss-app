import "server-only";

import { prisma } from "@/lib/prisma";
import { getSharedRedisClient } from "@/lib/redis";

/** Short on purpose: an uptime monitor should get an answer, not wait for a hung dependency. */
export const READINESS_TIMEOUT_MS = 2_000;

export type DependencyState = "up" | "down";

/** Only up or down per dependency. No versions, hosts or error text. */
export type Readiness = {
  database: DependencyState;
  redis: DependencyState;
};

export type DependencyProbes = {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
};

export const defaultProbes: DependencyProbes = {
  database: () => prisma.$queryRaw`SELECT 1`,
  redis: () => getSharedRedisClient().ping(),
};

export async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeState(probe: () => Promise<unknown>, timeoutMs: number): Promise<DependencyState> {
  try {
    await withTimeout(probe(), timeoutMs);
    return "up";
  } catch {
    // A missing REDIS_URL throws synchronously inside probe(); that is also "down".
    return "down";
  }
}

export async function checkDependencies(
  probes: DependencyProbes = defaultProbes,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<Readiness> {
  const [database, redis] = await Promise.all([
    probeState(probes.database, timeoutMs),
    probeState(probes.redis, timeoutMs),
  ]);
  return { database, redis };
}

export function isReady(readiness: Readiness) {
  return readiness.database === "up" && readiness.redis === "up";
}
