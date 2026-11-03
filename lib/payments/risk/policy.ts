import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient;

/** One version of the purchase limits, as stored. */
type RiskPolicy = {
  maxOpenPayments: number;
  maxStartsPerIpHour: number;
  maxUnpaidPerAccountHour: number;
  unverifiedDailyPurchases: number;
  unverifiedDailyRupiah: number;
  verifiedDailyPurchases: number;
  verifiedDailyRupiah: number;
  verifiedMinAccountAgeDays: number;
  version: number;
};

/**
 * The policy version in force: the newest activation decides. An activation
 * with no version withdraws the policy, and so does an empty table. Callers
 * must treat null as "refuse new checkouts"; nothing else depends on it, so
 * payment ingestion, reconciliation and the outbox keep running.
 */
async function loadPolicyInForce(db: Db): Promise<RiskPolicy | null> {
  const [policy = null] = await db.$queryRaw<RiskPolicy[]>`
    SELECT v.version,
           v.unverified_daily_purchases AS "unverifiedDailyPurchases",
           v.unverified_daily_rupiah AS "unverifiedDailyRupiah",
           v.verified_daily_purchases AS "verifiedDailyPurchases",
           v.verified_daily_rupiah AS "verifiedDailyRupiah",
           v.verified_min_account_age_days AS "verifiedMinAccountAgeDays",
           v.max_open_payments AS "maxOpenPayments",
           v.max_unpaid_per_account_hour AS "maxUnpaidPerAccountHour",
           v.max_starts_per_ip_hour AS "maxStartsPerIpHour"
    FROM (SELECT policy_version_id FROM risk_policy_activations ORDER BY id DESC LIMIT 1) a
    JOIN risk_policy_versions v ON v.id = a.policy_version_id
  `;
  return policy;
}

/** For the checkout page: whether new checkouts can be accepted at all. */
async function isPolicyInForce() {
  return (await loadPolicyInForce(prisma)) !== null;
}

export { isPolicyInForce, loadPolicyInForce };
export type { Db, RiskPolicy };
