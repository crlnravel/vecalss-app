import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import type { PaymentMaintenanceResult } from "@/lib/payments/maintenance";
import { serverLogger } from "@/lib/server-logger";

import { checkDependencies, defaultProbes, isReady, type DependencyProbes, type Readiness } from "./readiness";
import {
  countStaleEditLeases,
  purgeSecurityLogs,
  type SecurityLogTable,
  type TableCleanupResult,
} from "./retention";

type Db = Parameters<typeof purgeSecurityLogs>[0];

export type MaintenanceFailure =
  | "database"
  | "payment_maintenance"
  | "redis"
  | "security_log_cleanup"
  | "stale_state_check";

export type MaintenanceDeps = {
  alertTo: string | null;
  db: Db;
  now?: Date;
  /** Payment step: resolves orders open past expiry and drains the payment outbox. */
  payments?: () => Promise<PaymentMaintenanceResult>;
  probes?: DependencyProbes;
  sendAlert: (message: EmailMessage) => Promise<MailResult>;
};

export type MaintenanceResult = {
  cleanup: Record<SecurityLogTable, TableCleanupResult> | null;
  failures: MaintenanceFailure[];
  ok: boolean;
  /** Absent when the run was given no payment step. */
  payments?: PaymentMaintenanceResult | null;
  readiness: Readiness;
  staleEditLeases: number | null;
};

const failureLabels: Record<MaintenanceFailure, string> = {
  database: "basis data",
  payment_maintenance: "pemeriksaan dan antrean pembayaran",
  redis: "Redis",
  security_log_cleanup: "pembersihan log keamanan",
  stale_state_check: "pemeriksaan status tertinggal",
};

/**
 * Compares the presented bearer token with the configured secret. Both sides
 * are hashed first so the comparison takes the same time whatever the lengths.
 */
export function checkCronAuthorization(
  authorization: string | null,
  secret: string | undefined,
): "ok" | "unauthorized" | "not_configured" {
  if (!secret) return "not_configured";
  if (!authorization) return "unauthorized";

  const presented = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(presented, expected) ? "ok" : "unauthorized";
}

async function alertOwner(deps: MaintenanceDeps, failures: MaintenanceFailure[], now: Date) {
  if (!deps.alertTo) {
    serverLogger.error("maintenance.alert.not_configured", new Error("No maintenance alert address is set."), {
      area: "maintenance",
    });
    return;
  }

  const labels = failures.map((failure) => failureLabels[failure]).join(", ");
  const day = now.toISOString().slice(0, 10);
  const result = await deps.sendAlert({
    html: `<p>Pekerjaan pemeliharaan harian gagal pada: ${labels}.</p><p>Rincian ada di log server.</p>`,
    // One alert per day and failure set, so a retried run does not send twice.
    idempotencyKey: `daily-maintenance:${day}:${failures.join(",")}`,
    subject: "Pemeliharaan harian Vecalss gagal",
    text: `Pekerjaan pemeliharaan harian gagal pada: ${labels}. Rincian ada di log server.`,
    to: deps.alertTo,
  });

  if (!result.ok) {
    serverLogger.error("maintenance.alert.failed", new Error("The owner alert could not be sent."), {
      area: "maintenance",
      code: result.reason,
    });
  }
}

/**
 * One daily pass: dependency checks, then security-log cleanup, then a read-only
 * count of stale edit leases. The owner is emailed only when a step fails.
 */
export async function runDailyMaintenance(deps: MaintenanceDeps): Promise<MaintenanceResult> {
  const now = deps.now ?? new Date();
  const failures: MaintenanceFailure[] = [];

  const readiness = await checkDependencies(deps.probes ?? defaultProbes);
  if (readiness.database !== "up") failures.push("database");
  if (readiness.redis !== "up") failures.push("redis");

  let cleanup: MaintenanceResult["cleanup"] = null;
  try {
    cleanup = await purgeSecurityLogs(deps.db);
  } catch {
    failures.push("security_log_cleanup");
  }

  let staleEditLeases: number | null = null;
  try {
    staleEditLeases = await countStaleEditLeases(deps.db);
  } catch {
    failures.push("stale_state_check");
  }

  let payments: PaymentMaintenanceResult | null = null;
  if (deps.payments) {
    try {
      payments = await deps.payments();
    } catch {
      failures.push("payment_maintenance");
    }
  }

  if (failures.length > 0) {
    serverLogger.error("maintenance.daily.failed", new Error("A daily maintenance step failed."), {
      area: "maintenance",
      code: failures.join(","),
    });
    await alertOwner(deps, failures, now);
  }

  return {
    cleanup,
    failures,
    ok: failures.length === 0 && isReady(readiness),
    payments,
    readiness,
    staleEditLeases,
  };
}

export type CronRequestDeps = {
  run: () => Promise<MaintenanceResult>;
  secret: string | undefined;
};

const jsonHeaders = { "Cache-Control": "no-store" };

/** Runs the job only for a request with the right bearer token. Otherwise nothing runs. */
export async function handleDailyMaintenanceRequest(request: Request, deps: CronRequestDeps) {
  const authorization = checkCronAuthorization(request.headers.get("authorization"), deps.secret);

  if (authorization === "not_configured") {
    return Response.json({ error: "cron_not_configured" }, { headers: jsonHeaders, status: 503 });
  }
  if (authorization === "unauthorized") {
    return Response.json({ error: "unauthorized" }, { headers: jsonHeaders, status: 401 });
  }

  const result = await deps.run();
  return Response.json(
    {
      cleanup: result.cleanup,
      failures: result.failures,
      ok: result.ok,
      payments: result.payments,
      readiness: result.readiness,
      staleEditLeases: result.staleEditLeases,
    },
    { headers: jsonHeaders, status: result.ok ? 200 : 500 },
  );
}
