import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import type { FraudMaintenanceResult } from "@/lib/fraud/maintenance";
import type { PaymentMaintenanceResult } from "@/lib/payments/maintenance";
import type { RegistrationCleanupResult } from "@/lib/registration/cleanup";
import type { RetentionMaintenanceResult, RoleCheck } from "@/lib/retention/maintenance";
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
  | "fraud_maintenance"
  | "payment_alert_dead"
  | "payment_maintenance"
  | "payment_reconciliation"
  | "redis"
  | "registration_cleanup"
  | "retention_maintenance"
  | "runtime_role"
  | "security_log_cleanup"
  | "stale_state_check";

export type MaintenanceDeps = {
  alertTo: string | null;
  db: Db;
  /** Fraud step: daily signals, lapsed blocks, and the owner's summary email. */
  fraud?: () => Promise<FraudMaintenanceResult>;
  now?: Date;
  /** Payment step: resolves orders open past expiry and drains the payment outbox. */
  payments?: () => Promise<PaymentMaintenanceResult>;
  /** Whether this is a production deployment; the role check only runs there. Defaults to NODE_ENV. */
  production?: boolean;
  probes?: DependencyProbes;
  /** Registration step: deletes self-registered accounts that were never verified. */
  registration?: () => Promise<RegistrationCleanupResult>;
  /** Retention step: scrubs IP and device evidence and deletes what is past its period. */
  retention?: () => Promise<RetentionMaintenanceResult>;
  /** Production readiness: asks whether the connected database role can alter schema or delete evidence. */
  roleCheck?: () => Promise<RoleCheck>;
  sendAlert: (message: EmailMessage) => Promise<MailResult>;
};

export type MaintenanceResult = {
  cleanup: Record<SecurityLogTable, TableCleanupResult> | null;
  failures: MaintenanceFailure[];
  /** Absent when the run was given no fraud step. */
  fraud?: FraudMaintenanceResult | null;
  ok: boolean;
  /** Absent when the run was given no payment step. */
  payments?: PaymentMaintenanceResult | null;
  readiness: Readiness;
  /** Absent when the run was given no registration step. */
  registration?: RegistrationCleanupResult | null;
  /** Absent when the run was given no retention step. */
  retention?: RetentionMaintenanceResult | null;
  /** Absent outside production or when the run was given no role check. */
  runtimeRole?: RoleCheck | null;
  staleEditLeases: number | null;
};

const failureLabels: Record<MaintenanceFailure, string> = {
  database: "basis data",
  fraud_maintenance: "tinjauan fraud harian",
  payment_alert_dead: "peringatan pembayaran penting yang tidak berhasil terkirim",
  payment_maintenance: "pemeriksaan dan antrean pembayaran",
  payment_reconciliation: "pesanan yang belum terkonfirmasi penyedia lebih dari 24 jam setelah batas bayar",
  redis: "Redis",
  registration_cleanup: "pembersihan pendaftaran yang belum diverifikasi",
  retention_maintenance: "pemangkasan dan pembersihan bukti sesuai kebijakan retensi",
  runtime_role: "peran basis data aplikasi (masih bisa mengubah skema atau menghapus bukti)",
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

type RetentionActivity = { changed: number; lines: string[] };

/** What a retention run actually changed: counts per class, never the records themselves. */
function summarizeRetentionActivity(retention: RetentionMaintenanceResult): RetentionActivity {
  const lines: string[] = [];
  let changed = 0;
  for (const [kind, classes] of [["dibersihkan", retention.scrub], ["dihapus", retention.delete]] as const) {
    for (const entry of classes) {
      const counts = Object.entries(entry.counts).filter(([key, value]) => key !== "failed" && value > 0);
      if (counts.length === 0) continue;
      changed += counts.reduce((sum, [, value]) => sum + value, 0);
      lines.push(`${entry.class} (${kind}): ${counts.map(([key, value]) => `${key} ${value}`).join(", ")}`);
    }
  }
  return { changed, lines };
}

/**
 * Tells the owner whenever a retention run scrubbed or deleted anything, so an
 * unexpected deletion is noticed the day it happens. Counts only. This is a
 * notice, not a failure: a send problem is logged and never fails the run.
 */
async function noticeRetentionActivity(deps: MaintenanceDeps, retention: RetentionMaintenanceResult, now: Date) {
  const { changed, lines } = summarizeRetentionActivity(retention);
  if (changed === 0) return;
  if (!deps.alertTo) {
    serverLogger.error("maintenance.retention_notice.not_configured", new Error("No maintenance alert address is set."), { area: "maintenance" });
    return;
  }

  const day = now.toISOString().slice(0, 10);
  const digest = createHash("sha256").update(lines.join("|")).digest("hex").slice(0, 16);
  const result = await deps.sendAlert({
    html: `<p>Pemeliharaan retensi hari ini membersihkan atau menghapus bukti yang sudah melewati masa simpannya.</p><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul><p>Jumlah saja yang dikirim, tanpa isi catatan. Kalau ini tidak terduga, periksa penahanan hukum dan rincian di tabel retention_runs.</p>`,
    idempotencyKey: `retention-activity:${day}:${digest}`,
    subject: "Retensi Vecalss: bukti dibersihkan atau dihapus",
    text: `Pemeliharaan retensi hari ini membersihkan atau menghapus bukti yang sudah melewati masa simpannya. ${lines.join("; ")}. Jumlah saja yang dikirim, tanpa isi catatan. Kalau ini tidak terduga, periksa penahanan hukum dan rincian di tabel retention_runs.`,
    to: deps.alertTo,
  });
  if (!result.ok) {
    serverLogger.error("maintenance.retention_notice.failed", new Error("The retention notice could not be sent."), { area: "maintenance", code: result.reason });
  }
}

/**
 * Conditions that need their own owner alert: each is emailed once a day by
 * itself, whatever else failed, so later conditions keep their own idempotency
 * key and cannot hide behind an earlier alert.
 */
const STANDALONE_CONDITIONS = ["payment_alert_dead", "payment_reconciliation", "security_log_cleanup"] as const satisfies readonly MaintenanceFailure[];

function isStandaloneCondition(failure: MaintenanceFailure): failure is (typeof STANDALONE_CONDITIONS)[number] {
  return (STANDALONE_CONDITIONS as readonly MaintenanceFailure[]).includes(failure);
}

async function sendOwnerAlert(
  deps: MaintenanceDeps,
  failures: MaintenanceFailure[],
  details: string[],
  idempotencyKey: string,
) {
  if (!deps.alertTo) {
    serverLogger.error("maintenance.alert.not_configured", new Error("No maintenance alert address is set."), {
      area: "maintenance",
    });
    return;
  }

  const labels = failures.map((failure) => failureLabels[failure]).join(", ");
  const result = await deps.sendAlert({
    html: `<p>Pekerjaan pemeliharaan harian gagal pada: ${labels}.</p>${details.map((line) => `<p>${line}</p>`).join("")}<p>Rincian ada di log server.</p>`,
    idempotencyKey,
    subject: "Pemeliharaan harian Vecalss gagal",
    text: `Pekerjaan pemeliharaan harian gagal pada: ${labels}. ${details.join(" ")} Rincian ada di log server.`,
    to: deps.alertTo,
  });

  if (!result.ok) {
    serverLogger.error("maintenance.alert.failed", new Error("The owner alert could not be sent."), {
      area: "maintenance",
      code: result.reason,
    });
  }
}

async function alertOwner(
  deps: MaintenanceDeps,
  failures: MaintenanceFailure[],
  now: Date,
  details: string[] = [],
  conditionDetails: Partial<Record<MaintenanceFailure, string[]>> = {},
) {
  const day = now.toISOString().slice(0, 10);
  const general = failures.filter((failure) => !isStandaloneCondition(failure));

  // One alert per day and failure set, so a retried run does not send twice.
  if (general.length > 0) await sendOwnerAlert(deps, general, details, `daily-maintenance:${day}:${general.join(",")}`);
  for (const condition of failures.filter(isStandaloneCondition)) {
    await sendOwnerAlert(deps, [condition], conditionDetails[condition] ?? [], `daily-maintenance:${day}:${condition}`);
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
    if (Object.values(cleanup).some((table) => !table.complete)) failures.push("security_log_cleanup");
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
      // Not an exception, but not fine either: orders the provider has not
      // answered for since before the previous run, and critical alerts that
      // could not be delivered. One transient failed lookup is not counted.
      if ((payments.reconciliation?.persistentlyUnavailable ?? 0) > 0) failures.push("payment_reconciliation");
      if (payments.deadCriticalAlerts > 0) failures.push("payment_alert_dead");
    } catch {
      failures.push("payment_maintenance");
    }
  }

  let fraud: FraudMaintenanceResult | null = null;
  if (deps.fraud) {
    try {
      fraud = await deps.fraud();
    } catch {
      failures.push("fraud_maintenance");
    }
  }

  let registration: RegistrationCleanupResult | null = null;
  if (deps.registration) {
    try {
      registration = await deps.registration();
      // An account that could not be removed has something unexpected attached to it.
      if (registration.failed > 0) failures.push("registration_cleanup");
    } catch {
      failures.push("registration_cleanup");
    }
  }

  // The retention step and the role check come last, and each one fails on its own,
  // so a problem here never stops the steps above.
  let retention: RetentionMaintenanceResult | null = null;
  if (deps.retention) {
    try {
      retention = await deps.retention();
      if (retention.failedRows > 0) failures.push("retention_maintenance");
      try {
        await noticeRetentionActivity(deps, retention, now);
      } catch (error) {
        serverLogger.error("maintenance.retention_notice.failed", error, { area: "maintenance" });
      }
    } catch {
      failures.push("retention_maintenance");
    }
  }

  let runtimeRole: RoleCheck | null = null;
  if (deps.roleCheck && (deps.production ?? process.env.NODE_ENV === "production")) {
    try {
      runtimeRole = await deps.roleCheck();
      if (!runtimeRole.ok) failures.push("runtime_role");
    } catch {
      failures.push("runtime_role");
    }
  }

  if (failures.length > 0) {
    serverLogger.error("maintenance.daily.failed", new Error("A daily maintenance step failed."), {
      area: "maintenance",
      code: failures.join(","),
    });
    const details = runtimeRole && !runtimeRole.ok ? [`Temuan pada peran basis data: ${runtimeRole.findings.join(", ")}.`] : [];
    const conditionDetails: Partial<Record<MaintenanceFailure, string[]>> = {
      payment_alert_dead: [`Jumlah peringatan yang gagal terkirim dalam beberapa hari terakhir: ${payments?.deadCriticalAlerts ?? 0}. Periksa antrean pembayaran di panel admin.`],
      payment_reconciliation: [`Jumlah pesanan yang statusnya belum bisa dicek ke penyedia pembayaran selama lebih dari 24 jam sejak batas bayarnya lewat: ${payments?.reconciliation?.persistentlyUnavailable ?? 0}. Pesanan itu masih dianggap terbuka sampai statusnya jelas.`],
      security_log_cleanup: Object.entries(cleanup ?? {})
        .filter(([, table]) => !table.complete)
        .map(([name, table]) => `${name}: ${table.deleted} baris (batas batch tercapai).`),
    };
    await alertOwner(deps, failures, now, details, conditionDetails);
  }

  return {
    cleanup,
    failures,
    fraud,
    ok: failures.length === 0 && isReady(readiness),
    payments,
    readiness,
    registration,
    retention,
    runtimeRole,
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
      fraud: result.fraud
        ? { automaticBlocks: result.fraud.daily.automaticBlocks, emailed: result.fraud.emailed, signals: result.fraud.daily.signals }
        : result.fraud,
      ok: result.ok,
      payments: result.payments,
      readiness: result.readiness,
      registration: result.registration,
      retention: result.retention
        ? { complete: result.retention.complete, delete: result.retention.delete, failedRows: result.retention.failedRows, scrub: result.retention.scrub }
        : result.retention,
      // Only whether the role passed and how many findings; the findings stay in the server log and the alert.
      runtimeRole: result.runtimeRole ? { findings: result.runtimeRole.findings.length, ok: result.runtimeRole.ok } : result.runtimeRole,
      staleEditLeases: result.staleEditLeases,
    },
    { headers: jsonHeaders, status: result.ok ? 200 : 500 },
  );
}
