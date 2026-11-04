import "server-only";

import { prisma } from "@/lib/prisma";

import type { Tx } from "./audit";
import { createAutomaticBlock, markLapsedBlocksExpired } from "./blocks";
import { openFraudCase } from "./cases";
import { DAILY_RULES } from "./constants";
import { FraudConflictError } from "./errors";
import { tokenFor } from "./tokens";

/**
 * The signals the daily job raises (decision "Fraud operations rules"). Each is
 * a plain query over the last 24 hours of database time, deduped per signal and
 * subject by the case queue, so running twice raises nothing new. Cases carry
 * ids and counts; the IP and device are only ever held as lookup tokens.
 */

type SignalCounts = {
  blockEnding: number;
  deviceMultiAccount: number;
  ipMultiAccount: number;
  repeatedFailures: number;
  volumeSpike: number;
};

type DailyFraudResult = {
  automaticBlocks: number;
  expiredMarked: number;
  signals: SignalCounts;
};

const MAX_LISTED_ORDERS = 20;

/** Identifiers that three or more accounts paid from within one hour. */
async function findMultiAccountGroups(tx: Tx, column: "buyer_ip" | "device_lookup_token") {
  const rows = column === "buyer_ip"
    ? await tx.$queryRaw<Array<{ accounts: number; key: string; orderIds: string[] }>>`
        SELECT host(a.buyer_ip) AS key, max(w.accounts)::int AS accounts, array_agg(DISTINCT a.id::text) AS "orderIds"
        FROM payment_orders a
        JOIN LATERAL (
          SELECT count(DISTINCT b.buyer_id) AS accounts
          FROM payment_orders b
          WHERE b.buyer_ip = a.buyer_ip AND b.status IN ('paid', 'review')
            AND b.created_at >= a.created_at AND b.created_at < a.created_at + interval '1 hour'
        ) w ON true
        WHERE a.buyer_ip IS NOT NULL AND a.status IN ('paid', 'review') AND a.created_at > now() - interval '24 hours'
          AND w.accounts >= ${DAILY_RULES.accountsPerIdentifier}
        GROUP BY a.buyer_ip
      `
    : await tx.$queryRaw<Array<{ accounts: number; key: string; orderIds: string[] }>>`
        SELECT a.device_lookup_token AS key, max(w.accounts)::int AS accounts, array_agg(DISTINCT a.id::text) AS "orderIds"
        FROM payment_orders a
        JOIN LATERAL (
          SELECT count(DISTINCT b.buyer_id) AS accounts
          FROM payment_orders b
          WHERE b.device_lookup_token = a.device_lookup_token AND b.status IN ('paid', 'review')
            AND b.created_at >= a.created_at AND b.created_at < a.created_at + interval '1 hour'
        ) w ON true
        WHERE a.device_lookup_token IS NOT NULL AND a.status IN ('paid', 'review') AND a.created_at > now() - interval '24 hours'
          AND w.accounts >= ${DAILY_RULES.accountsPerIdentifier}
        GROUP BY a.device_lookup_token
      `;
  return rows;
}

async function raiseIpSignal(): Promise<number> {
  const groups = await findMultiAccountGroups(prisma, "buyer_ip");
  let raised = 0;

  for (const group of groups) {
    // The address becomes a lookup token here; the case never holds it.
    const subjectKey = tokenFor("ip", group.key);
    if (!subjectKey) continue;

    await prisma.$transaction((tx) =>
      openFraudCase(tx, {
        evidence: { accounts: group.accounts, orderIds: group.orderIds.slice(0, MAX_LISTED_ORDERS), windowMinutes: 60 },
        signal: "ip_multi_account",
        subjectKey,
        subjectType: "ip",
      }),
    );
    raised += 1;
  }
  return raised;
}

/** Returns [cases raised, automatic blocks created]. */
async function raiseDeviceSignal(): Promise<[number, number]> {
  const groups = await findMultiAccountGroups(prisma, "device_lookup_token");
  let raised = 0;
  let blocked = 0;

  for (const group of groups) {
    await prisma.$transaction(async (tx) => {
      const opened = await openFraudCase(tx, {
        evidence: { accounts: group.accounts, orderIds: group.orderIds.slice(0, MAX_LISTED_ORDERS), windowMinutes: 60 },
        signal: "device_multi_account",
        subjectKey: group.key,
        subjectType: "device",
      });
      raised += 1;

      // The only automatic block: 24 hours, pending the owner's review, tied to the case.
      try {
        await createAutomaticBlock(tx, {
          caseId: opened.id,
          reason: `Rule device_multi_account: ${group.accounts} accounts paid from one device within an hour.`,
          reasonCode: "multi_account",
          target: { token: group.key, type: "device" },
        });
        blocked += 1;
      } catch (error) {
        // Already blocked (by hand, or by yesterday's run still in force): nothing to add.
        if (!(error instanceof FraudConflictError && error.code === "already_blocked")) throw error;
      }
    });
  }
  return [raised, blocked];
}

async function raiseFailureSignal(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ buyerId: string; failed: number; orderIds: string[] }>>`
    SELECT buyer_id AS "buyerId", count(*)::int AS failed, array_agg(id::text) AS "orderIds"
    FROM payment_orders
    WHERE status IN ('failed', 'expired') AND created_at > now() - interval '24 hours'
    GROUP BY buyer_id
    HAVING count(*) >= ${DAILY_RULES.failedPaymentsPerAccount}
  `;

  for (const row of rows) {
    await prisma.$transaction((tx) =>
      openFraudCase(tx, {
        evidence: { failedOrders: row.failed, orderIds: row.orderIds.slice(0, MAX_LISTED_ORDERS) },
        signal: "repeated_payment_failures",
        subjectKey: `user:${row.buyerId}`,
        subjectType: "user",
        userId: row.buyerId,
      }),
    );
  }
  return rows.length;
}

/** Whether a day's orders count as a spike against the previous seven days' daily average. */
function isVolumeSpike(ordersToday: number, dailyAverage: number) {
  return ordersToday >= DAILY_RULES.spikeMinimumOrders && ordersToday >= dailyAverage * DAILY_RULES.spikeFactor;
}

async function raiseVolumeSignal(): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ average: number; day: string; today: number }>>`
    SELECT
      count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS today,
      (count(*) FILTER (WHERE created_at <= now() - interval '24 hours') / 7.0)::float8 AS average,
      to_char(risk_jakarta_day(now()), 'YYYY-MM-DD') AS day
    FROM payment_orders
    WHERE created_at > now() - interval '8 days'
  `;

  if (!isVolumeSpike(row.today, row.average)) return 0;

  await prisma.$transaction((tx) =>
    openFraudCase(tx, {
      evidence: {
        dailyAverageLastSevenDays: Math.round(row.average * 10) / 10,
        ordersLast24Hours: row.today,
        spikeFactor: DAILY_RULES.spikeFactor,
      },
      signal: "volume_spike",
      subjectKey: `volume:${row.day}`,
      subjectType: "system",
    }),
  );
  return 1;
}

/**
 * Manual blocks that end, or fall due for review, within three days. Renewal
 * needs a fresh written reason from the owner, so the case is the reminder.
 * Automatic blocks are left out: their own case is already their review.
 */
async function raiseBlockEndingSignal(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ blockType: string; dueAt: Date; id: string; kind: string }>>`
    SELECT id, block_type::text AS "blockType",
           COALESCE(expires_at, review_due_at) AS "dueAt",
           CASE WHEN expires_at IS NOT NULL THEN 'ends' ELSE 'review_due' END AS kind
    FROM fraud_blocks
    WHERE status = 'active' AND source = 'manual'
      AND (expires_at IS NULL OR expires_at > clock_timestamp())
      AND COALESCE(expires_at, review_due_at) <= now() + make_interval(days => ${DAILY_RULES.endingSoonDays})
  `;

  for (const row of rows) {
    await prisma.$transaction((tx) =>
      openFraudCase(tx, {
        evidence: { blockId: row.id, blockType: row.blockType, dueAt: row.dueAt.toISOString(), kind: row.kind },
        signal: "block_ending",
        subjectKey: `block:${row.id}`,
        subjectType: "block",
      }),
    );
  }
  return rows.length;
}

/** Runs every daily signal. A failing one does not stop the others; the run then reports failure. */
async function runDailyFraudSignals(): Promise<DailyFraudResult> {
  const expiredMarked = await markLapsedBlocksExpired();
  const signals: SignalCounts = { blockEnding: 0, deviceMultiAccount: 0, ipMultiAccount: 0, repeatedFailures: 0, volumeSpike: 0 };
  let automaticBlocks = 0;
  const failures: string[] = [];

  const attempt = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch {
      failures.push(name);
    }
  };

  await attempt("ip_multi_account", async () => { signals.ipMultiAccount = await raiseIpSignal(); });
  await attempt("device_multi_account", async () => {
    const [raised, blocked] = await raiseDeviceSignal();
    signals.deviceMultiAccount = raised;
    automaticBlocks = blocked;
  });
  await attempt("repeated_payment_failures", async () => { signals.repeatedFailures = await raiseFailureSignal(); });
  await attempt("volume_spike", async () => { signals.volumeSpike = await raiseVolumeSignal(); });
  await attempt("block_ending", async () => { signals.blockEnding = await raiseBlockEndingSignal(); });

  if (failures.length > 0) {
    throw new Error(`Daily fraud signals failed: ${failures.join(", ")}.`);
  }

  return { automaticBlocks, expiredMarked, signals };
}

export { isVolumeSpike, runDailyFraudSignals };
export type { DailyFraudResult, SignalCounts };
