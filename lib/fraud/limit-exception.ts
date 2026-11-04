import "server-only";

import { loadPolicyInForce, type RiskPolicy } from "@/lib/payments/risk/policy";
import { prisma } from "@/lib/prisma";

import { writeFraudAudit } from "./audit";
import { requireReason, type OwnerContext } from "./authority";
import { FraudConflictError, FraudValidationError } from "./errors";

/**
 * A limit exception is a new purchase-limit policy version (MS-06), published
 * by the owner with a written reason. It reuses the append-only policy tables
 * as they are: a new version row, then a new activation row that puts it in
 * force. It applies to everyone, not to one account; a per-account override
 * would need its own table and a change to the checkout checks, which this
 * ticket leaves out.
 */

type PolicyValues = Omit<RiskPolicy, "version">;

const FIELDS: Array<keyof PolicyValues> = [
  "maxOpenPayments",
  "maxStartsPerIpHour",
  "maxUnpaidPerAccountHour",
  "unverifiedDailyPurchases",
  "unverifiedDailyRupiah",
  "verifiedDailyPurchases",
  "verifiedDailyRupiah",
  "verifiedMinAccountAgeDays",
];

async function publishPolicyVersion(
  owner: OwnerContext,
  input: { expectedVersionInForce: number | null; reason: string; values: PolicyValues },
) {
  const reason = requireReason(input.reason);
  for (const field of FIELDS) {
    const value = input.values[field];
    const minimum = field === "verifiedMinAccountAgeDays" ? 0 : 1;
    if (!Number.isInteger(value) || value < minimum || value > 100_000_000) {
      throw new FraudValidationError("invalid_duration", `${field} must be a whole number from ${minimum}.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // One publisher at a time, so versions stay consecutive.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('risk-policy-publish', 0))`;

    const inForce = await loadPolicyInForce(tx);
    if ((inForce?.version ?? null) !== input.expectedVersionInForce) {
      throw new FraudConflictError("stale_version", "The policy in force changed. Reload it and try again.");
    }

    const [{ next }] = await tx.$queryRaw<Array<{ next: number }>>`SELECT COALESCE(max(version), 0) + 1 AS next FROM risk_policy_versions`;
    const v = input.values;
    const [created] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO risk_policy_versions (
        version, unverified_daily_purchases, unverified_daily_rupiah, verified_daily_purchases, verified_daily_rupiah,
        verified_min_account_age_days, max_open_payments, max_unpaid_per_account_hour, max_starts_per_ip_hour, note
      )
      VALUES (
        ${next}, ${v.unverifiedDailyPurchases}, ${v.unverifiedDailyRupiah}, ${v.verifiedDailyPurchases}, ${v.verifiedDailyRupiah},
        ${v.verifiedMinAccountAgeDays}, ${v.maxOpenPayments}, ${v.maxUnpaidPerAccountHour}, ${v.maxStartsPerIpHour}, ${reason}
      )
      RETURNING id
    `;
    await tx.$executeRaw`
      INSERT INTO risk_policy_activations (policy_version_id, reason)
      VALUES (${created.id}::uuid, ${`Limit exception by the owner: ${reason}`.slice(0, 200)})
    `;
    await writeFraudAudit(tx, {
      action: "fraud.policy.published",
      actorUserId: owner.userId,
      metadata: { previousVersion: inForce?.version ?? null, version: next },
      targetId: created.id,
      targetType: "system",
    });

    return { version: next };
  });
}

export { publishPolicyVersion };
export type { PolicyValues };
