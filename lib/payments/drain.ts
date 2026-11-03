import "server-only";

import { after } from "next/server";

import { sendEmail } from "@/lib/email/mailer";
import { serverLogger } from "@/lib/server-logger";

import { createPaymentOutboxHandlers } from "./outbox-handlers";
import { drainOutbox } from "./outbox";

function defaultHandlers() {
  return createPaymentOutboxHandlers({
    alertTo: process.env.MAINTENANCE_ALERT_EMAIL?.trim() || null,
    sendEmail,
  });
}

/**
 * Drains due outbox jobs after the response has been sent. Outside a request
 * (scripts, tests) there is nothing to run after, so this does nothing; the
 * daily maintenance job picks the jobs up either way.
 */
function scheduleOutboxDrain() {
  try {
    after(async () => {
      try {
        await drainOutbox(defaultHandlers());
      } catch (error) {
        serverLogger.error("payments.outbox.drain_failed", error instanceof Error ? error : new Error("drain failed"), {
          area: "payments",
        });
      }
    });
  } catch {
    // Not inside a request scope.
  }
}

export { defaultHandlers, scheduleOutboxDrain };
