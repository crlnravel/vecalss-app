import "server-only";

import { getAppBaseUrl } from "@/lib/config";
import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import { prisma } from "@/lib/prisma";

import { writeFraudAudit } from "./audit";
import { runDailyFraudSignals, type DailyFraudResult } from "./daily";

type DailySummary = {
  appealsOverdue: number;
  appealsPending: number;
  blocksCreatedLastDay: { automatic: number; manual: number };
  blocksEndingSoon: number;
  casesOpen: { critical: number; high: number; low: number; medium: number; total: number };
  day: string;
};

/** The numbers the owner's daily email reports. Counts only: no identifiers. */
async function buildDailySummary(): Promise<DailySummary> {
  const [row] = await prisma.$queryRaw<Array<{
    appealsOverdue: number;
    appealsPending: number;
    automatic: number;
    critical: number;
    day: string;
    ending: number;
    high: number;
    low: number;
    manual: number;
    medium: number;
    open: number;
  }>>`
    SELECT
      (SELECT count(*) FROM fraud_appeals WHERE state = 'pending' AND due_at < now())::int AS "appealsOverdue",
      (SELECT count(*) FROM fraud_appeals WHERE state = 'pending')::int AS "appealsPending",
      (SELECT count(*) FROM fraud_blocks WHERE source = 'automatic' AND created_at > now() - interval '24 hours')::int AS automatic,
      (SELECT count(*) FROM fraud_blocks WHERE source = 'manual' AND created_at > now() - interval '24 hours')::int AS manual,
      (SELECT count(*) FROM fraud_blocks
        WHERE status = 'active' AND (expires_at IS NULL OR expires_at > clock_timestamp())
          AND COALESCE(expires_at, review_due_at) <= now() + interval '3 days')::int AS ending,
      (SELECT count(*) FROM fraud_cases WHERE state <> 'closed')::int AS open,
      (SELECT count(*) FROM fraud_cases WHERE state <> 'closed' AND severity = 'critical')::int AS critical,
      (SELECT count(*) FROM fraud_cases WHERE state <> 'closed' AND severity = 'high')::int AS high,
      (SELECT count(*) FROM fraud_cases WHERE state <> 'closed' AND severity = 'medium')::int AS medium,
      (SELECT count(*) FROM fraud_cases WHERE state <> 'closed' AND severity = 'low')::int AS low,
      to_char(risk_jakarta_day(now()), 'YYYY-MM-DD') AS day
  `;

  return {
    appealsOverdue: row.appealsOverdue,
    appealsPending: row.appealsPending,
    blocksCreatedLastDay: { automatic: row.automatic, manual: row.manual },
    blocksEndingSoon: row.ending,
    casesOpen: { critical: row.critical, high: row.high, low: row.low, medium: row.medium, total: row.open },
    day: row.day,
  };
}

function summaryHasNews(summary: DailySummary) {
  return summary.casesOpen.total > 0
    || summary.blocksCreatedLastDay.automatic + summary.blocksCreatedLastDay.manual > 0
    || summary.blocksEndingSoon > 0
    || summary.appealsPending > 0;
}

/** The email, in plain Indonesian. It links to the queue and lists no identifiers. */
function buildSummaryEmail(summary: DailySummary, to: string): EmailMessage {
  const { casesOpen } = summary;
  const lines = [
    `Ringkasan fraud Vecalss untuk ${summary.day}.`,
    `Kasus terbuka: ${casesOpen.total} (kritis ${casesOpen.critical}, tinggi ${casesOpen.high}, sedang ${casesOpen.medium}, rendah ${casesOpen.low}).`,
    `Blokir baru dalam 24 jam terakhir: ${summary.blocksCreatedLastDay.manual} manual, ${summary.blocksCreatedLastDay.automatic} otomatis (menunggu tinjauan).`,
    `Blokir yang segera berakhir atau perlu ditinjau dalam 3 hari: ${summary.blocksEndingSoon}.`,
    `Banding menunggu keputusan: ${summary.appealsPending}${summary.appealsOverdue > 0 ? `, ${summary.appealsOverdue} melewati batas 3 hari kerja` : ""}.`,
    `Buka antrean kasus: ${getAppBaseUrl()}/admin/fraud`,
  ];

  return {
    html: lines.map((line) => `<p>${line}</p>`).join(""),
    // One summary per day, so a retried run does not send twice.
    idempotencyKey: `fraud-summary:${summary.day}`,
    subject: `Vecalss: ringkasan fraud ${summary.day}`,
    text: lines.join("\n"),
    to,
  };
}

type FraudMaintenanceResult = {
  daily: DailyFraudResult;
  emailed: boolean;
  summary: DailySummary;
};

type FraudMaintenanceDeps = {
  /** MAINTENANCE_ALERT_EMAIL: where the daily summary goes. Null means it is not sent (and says so in the audit). */
  alertTo: string | null;
  sendEmail: (message: EmailMessage) => Promise<MailResult>;
};

/**
 * The fraud part of the daily job: raise the daily signals, mark lapsed blocks,
 * email the owner a summary when there is anything to report, and leave an audit
 * event as proof the review ran. It is a step of `runDailyMaintenance`.
 */
async function runFraudMaintenance(deps: FraudMaintenanceDeps): Promise<FraudMaintenanceResult> {
  const daily = await runDailyFraudSignals();
  const summary = await buildDailySummary();

  let emailed = false;
  if (deps.alertTo && summaryHasNews(summary)) {
    const result = await deps.sendEmail(buildSummaryEmail(summary, deps.alertTo));
    if (!result.ok) throw new Error(`The fraud summary email was not sent (${result.reason}).`);
    emailed = true;
  }

  await prisma.$transaction((tx) =>
    writeFraudAudit(tx, {
      action: "fraud.daily_review.completed",
      metadata: { automaticBlocks: daily.automaticBlocks, emailed, openCases: summary.casesOpen.total, signals: daily.signals },
      targetId: null,
      targetType: "system",
    }),
  );

  return { daily, emailed, summary };
}

export { buildDailySummary, buildSummaryEmail, runFraudMaintenance, summaryHasNews };
export type { DailySummary, FraudMaintenanceDeps, FraudMaintenanceResult };
