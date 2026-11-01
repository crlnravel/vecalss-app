const PRICING_TIME_ZONE = "Asia/Jakarta";

type PricingPlanId = "monthly" | "full";
type FullAccessTarget = "utbk" | "mandiri";

type PricingScheduleEntry = {
  /** Calendar month in Asia/Jakarta, formatted as YYYY-MM. */
  month: string;
  monthlyPrice: number;
  fullPrice: number;
  fullTarget: FullAccessTarget;
};

type PricingResolution = {
  entry: PricingScheduleEntry | null;
  /** "upcoming" reuses the first scheduled month before the schedule starts. */
  status: "active" | "upcoming" | "closed";
};

const PRICING_SCHEDULE: readonly PricingScheduleEntry[] = [
  { month: "2026-11", monthlyPrice: 49_000, fullPrice: 200_000, fullTarget: "utbk" },
  { month: "2026-12", monthlyPrice: 59_000, fullPrice: 250_000, fullTarget: "utbk" },
  { month: "2027-01", monthlyPrice: 59_000, fullPrice: 250_000, fullTarget: "utbk" },
  { month: "2027-02", monthlyPrice: 59_000, fullPrice: 200_000, fullTarget: "utbk" },
  { month: "2027-03", monthlyPrice: 59_000, fullPrice: 150_000, fullTarget: "utbk" },
  { month: "2027-04", monthlyPrice: 59_000, fullPrice: 200_000, fullTarget: "mandiri" },
];

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const FULL_TARGET_LABELS: Record<FullAccessTarget, string> = {
  mandiri: "Ujian Mandiri",
  utbk: "UTBK-SNBT",
};

function getJakartaMonthKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: PRICING_TIME_ZONE,
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function resolvePricing(
  now: Date = new Date(),
  schedule: readonly PricingScheduleEntry[] = PRICING_SCHEDULE,
): PricingResolution {
  const monthKey = getJakartaMonthKey(now);
  const current = schedule.find((entry) => entry.month === monthKey);

  if (current) return { entry: current, status: "active" };
  if (schedule.length > 0 && monthKey < schedule[0].month) {
    return { entry: schedule[0], status: "upcoming" };
  }

  return { entry: null, status: "closed" };
}

function formatPricingMonth(month: string) {
  const [year, monthNumber] = month.split("-");

  return `${MONTH_NAMES[Number(monthNumber) - 1]} ${year}`;
}

function formatRupiah(amount: number) {
  return `Rp${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ".")}`;
}

function getPlanPrice(entry: PricingScheduleEntry, plan: PricingPlanId) {
  return plan === "monthly" ? entry.monthlyPrice : entry.fullPrice;
}

function getPlanValidityLabel(entry: PricingScheduleEntry, plan: PricingPlanId) {
  return plan === "monthly"
    ? "Akses 1 bulan"
    : `Akses sampai ${FULL_TARGET_LABELS[entry.fullTarget]}`;
}

function isPricingPlanId(value: unknown): value is PricingPlanId {
  return value === "monthly" || value === "full";
}

export {
  FULL_TARGET_LABELS,
  PRICING_SCHEDULE,
  PRICING_TIME_ZONE,
  formatPricingMonth,
  formatRupiah,
  getJakartaMonthKey,
  getPlanPrice,
  getPlanValidityLabel,
  isPricingPlanId,
  resolvePricing,
};
export type {
  FullAccessTarget,
  PricingPlanId,
  PricingResolution,
  PricingScheduleEntry,
};
