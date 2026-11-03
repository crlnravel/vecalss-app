/**
 * Paid-access plans and their end dates. Pure functions, no database.
 *
 * Calendar maths follows Asia/Jakarta (UTC+7, no daylight saving), the same
 * zone the pricing schedule uses, so "one month" means one month on a student's
 * wall clock.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type AccessPlan = "monthly" | "full_utbk" | "full_mandiri";
type FullAccessTarget = "utbk" | "mandiri";

const ACCESS_PLANS: Record<AccessPlan, { fullTarget: FullAccessTarget | null; label: string }> = {
  full_mandiri: { fullTarget: "mandiri", label: "Full Access (Ujian Mandiri)" },
  full_utbk: { fullTarget: "utbk", label: "Full Access (UTBK-SNBT)" },
  monthly: { fullTarget: null, label: "Akses Bulanan" },
};

const ACCESS_PLAN_CODES = Object.keys(ACCESS_PLANS) as AccessPlan[];

function isAccessPlan(value: unknown): value is AccessPlan {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCESS_PLANS, value);
}

function accessPlanLabel(planCode: string | null) {
  if (!planCode) return "Paket belum tercatat";
  // Accounts created before these plans existed (the demo seed) keep their own code.
  return isAccessPlan(planCode) ? ACCESS_PLANS[planCode].label : planCode;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds calendar months on the Jakarta wall clock, keeping the time of day and
 * clamping the day to the target month's last day (31 Jan + 1 month = 28 Feb,
 * or 29 Feb in a leap year).
 */
function addCalendarMonths(date: Date, months: number) {
  const local = new Date(date.getTime() + WIB_OFFSET_MS);
  const monthIndex = local.getUTCMonth() + months;
  const year = local.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(local.getUTCDate(), daysInMonth(year, month));

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      local.getUTCHours(),
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    ) - WIB_OFFSET_MS,
  );
}

type FullAccessEnv = Partial<Record<string, string | undefined>>;

const FULL_ACCESS_ENV_KEYS: Record<FullAccessTarget, string> = {
  mandiri: "FULL_ACCESS_ENDS_ON_MANDIRI",
  utbk: "FULL_ACCESS_ENDS_ON_UTBK",
};

/**
 * Full Access runs through the last day the business sets for an exam target
 * (YYYY-MM-DD, Jakarta time), so it ends at the start of the following day.
 *
 * The dates are deliberately not defaulted: they are product decisions that are
 * not in the repository. Until FULL_ACCESS_ENDS_ON_UTBK and
 * FULL_ACCESS_ENDS_ON_MANDIRI are set, Full Access cannot be granted.
 */
function getFullAccessEndsAt(target: FullAccessTarget, env: FullAccessEnv = process.env) {
  const raw = env[FULL_ACCESS_ENV_KEYS[target]]?.trim();
  const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const lastDay = new Date(Date.UTC(year, month, day));
  if (lastDay.getUTCFullYear() !== year || lastDay.getUTCMonth() !== month || lastDay.getUTCDate() !== day) {
    return null;
  }

  return new Date(lastDay.getTime() + DAY_MS - WIB_OFFSET_MS);
}

export {
  ACCESS_PLANS,
  ACCESS_PLAN_CODES,
  FULL_ACCESS_ENV_KEYS,
  accessPlanLabel,
  addCalendarMonths,
  getFullAccessEndsAt,
  isAccessPlan,
};
export type { AccessPlan, FullAccessTarget };
