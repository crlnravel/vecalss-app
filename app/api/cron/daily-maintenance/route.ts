import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/mailer";
import { handleDailyMaintenanceRequest, runDailyMaintenance } from "@/lib/maintenance/daily";
import { defaultProbes } from "@/lib/maintenance/readiness";
import { runFraudMaintenance } from "@/lib/fraud/maintenance";
import { defaultHandlers } from "@/lib/payments/drain";
import { runPaymentMaintenance } from "@/lib/payments/maintenance";
import { getPaymentProvider } from "@/lib/payments/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Vercel calls this once a day with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  return handleDailyMaintenanceRequest(request, {
    run: () =>
      runDailyMaintenance({
        alertTo: process.env.MAINTENANCE_ALERT_EMAIL?.trim() || null,
        db: prisma,
        fraud: () =>
          runFraudMaintenance({
            alertTo: process.env.MAINTENANCE_ALERT_EMAIL?.trim() || null,
            sendEmail: (message) => sendEmail(message),
          }),
        payments: () => runPaymentMaintenance({ handlers: defaultHandlers(), provider: getPaymentProvider() }),
        probes: defaultProbes,
        sendAlert: (message) => sendEmail(message),
      }),
    secret: process.env.CRON_SECRET,
  });
}
