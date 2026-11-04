import "server-only";

import { prisma } from "@/lib/prisma";

type Db = Pick<typeof prisma, "$queryRaw">;

type RegisterRule = {
  actionAfter: "delete" | "external" | "keep" | "scrub";
  financial: boolean;
  label: string;
  periodDays: number | null;
  periodMonths: number | null;
  recordClass: string;
  startRule: string;
};

type Register = { rules: RegisterRule[]; version: number };

/** The newest register version and its rules. The maintenance functions read the same rows. */
async function getActiveRegister(db: Db = prisma): Promise<Register> {
  const rules = await db.$queryRaw<Array<RegisterRule & { version: number }>>`
    SELECT r.version, r.record_class AS "recordClass", r.label, r.financial,
           r.period_months AS "periodMonths", r.period_days AS "periodDays",
           r.start_rule AS "startRule", r.action_after AS "actionAfter"
    FROM retention_register_rules r
    WHERE r.version = retention_active_version()
    ORDER BY r.record_class
  `;
  const version = rules[0]?.version ?? 0;
  return { rules: rules.map(({ version: _version, ...rule }) => rule), version };
}

/**
 * The end of a period that starts at `anchor`, on the Asia/Jakarta calendar and
 * database time (the same function the maintenance path uses). Exposed so the
 * calendar rules can be tested at month-ends and leap years.
 */
async function periodEnd(anchor: Date | string, months: number | null, days: number | null, db: Db = prisma): Promise<Date> {
  const [row] = await db.$queryRaw<Array<{ end: Date }>>`
    SELECT retention_period_end(${anchor}::timestamptz, ${months}::int, ${days}::int) AS "end"
  `;
  return row.end;
}

export { getActiveRegister, periodEnd };
export type { Register, RegisterRule };
