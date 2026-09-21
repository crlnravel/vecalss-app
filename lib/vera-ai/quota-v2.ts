import {
  assertMonthlyAdmission,
  assertReservationAmountsNonnegative,
  monthlyExposureUsdMicros,
  settleReservation,
  type ReservationAmounts,
} from "./billing";

export const VERA_CREDIT_USD_V2 = "vera_credit_usd_v2" as const;
export const VERA_CREDIT_USD_V2_EFFECTIVE_FROM = new Date("2026-09-30T17:00:00.000Z");
export const VERA_DEFAULT_QUOTA_TIMEZONE = "Asia/Jakarta";
export const VERA_DAILY_CREDIT_WARNING = 10;
export const VERA_DAILY_CREDIT_LIMIT = 15;
export const VERA_WEEKLY_CREDIT_WARNING = 70;
export const VERA_WEEKLY_CREDIT_LIMIT = 80;
export const VERA_MONTHLY_CREDIT_LIMIT = 300;
export const VERA_MONTHLY_COST_WARNING_USD_MICROS = 550_000n;
export const VERA_MONTHLY_COST_LIMIT_USD_MICROS = 700_000n;
export const VERA_BURST_LIMIT_PER_MINUTE = 5;
export const VERA_MAX_CONCURRENT_REQUESTS = 2;

export type QuotaWindowPeriodKind = "day" | "iso_week" | "month";

export type QuotaWindowSnapshot = ReservationAmounts & {
  id: string;
  periodKind: QuotaWindowPeriodKind;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  quotaTimezone: string;
  creditLimit: number;
  costLimitUsdMicros: bigint;
  monetaryDebtState: "clear" | "debt";
};

export type QuotaCalendarSnapshot = {
  studentId: string;
  ledgerVersion: typeof VERA_CREDIT_USD_V2;
  quotaTimezone: string;
  effectiveFrom: Date;
  currentMonthlyWindowId: string;
};

export type V2Reservation = {
  creditCost: number;
  reservedUsdMicros: bigint;
  windows: [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot];
  lineage: [ReservationAmounts, ReservationAmounts, ReservationAmounts];
};

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = zonedParts(new Date(guess), timeZone);
    const renderedUtc = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    const offset = renderedUtc - guess;
    const next = Date.UTC(year, month - 1, day) - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function dateKey(parts: ZonedParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localDateFromParts(parts: ZonedParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function isoWeekParts(parts: ZonedParts): { year: number; week: number; monday: Date } {
  const local = localDateFromParts(parts);
  const day = local.getUTCDay() || 7;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - day + 1);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 1);
  const week = Math.floor((monday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;
  return { year: thursday.getUTCFullYear(), week, monday };
}

export function ledgerVersionFor(now: Date): "vera_quota_v1" | typeof VERA_CREDIT_USD_V2 {
  return now >= VERA_CREDIT_USD_V2_EFFECTIVE_FROM ? VERA_CREDIT_USD_V2 : "vera_quota_v1";
}

export function deriveV2WindowKeys(now: Date, quotaTimezone: string): {
  day: { key: string; start: Date; end: Date };
  isoWeek: { key: string; start: Date; end: Date };
  month: { key: string; start: Date; end: Date };
} {
  const parts = zonedParts(now, quotaTimezone || VERA_DEFAULT_QUOTA_TIMEZONE);
  const dayStart = zonedMidnightUtc(parts.year, parts.month, parts.day, quotaTimezone);
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const dayEnd = zonedMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), quotaTimezone);
  const week = isoWeekParts(parts);
  const weekStart = zonedMidnightUtc(week.monday.getUTCFullYear(), week.monday.getUTCMonth() + 1, week.monday.getUTCDate(), quotaTimezone);
  const weekEndLocal = new Date(week.monday);
  weekEndLocal.setUTCDate(weekEndLocal.getUTCDate() + 7);
  const weekEnd = zonedMidnightUtc(weekEndLocal.getUTCFullYear(), weekEndLocal.getUTCMonth() + 1, weekEndLocal.getUTCDate(), quotaTimezone);
  const monthStart = zonedMidnightUtc(parts.year, parts.month, 1, quotaTimezone);
  const monthEnd = zonedMidnightUtc(parts.month === 12 ? parts.year + 1 : parts.year, parts.month === 12 ? 1 : parts.month + 1, 1, quotaTimezone);
  return {
    day: { key: dateKey(parts), start: dayStart, end: dayEnd },
    isoWeek: { key: `${week.year}-W${String(week.week).padStart(2, "0")}`, start: weekStart, end: weekEnd },
    month: { key: `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-01`, start: monthStart, end: monthEnd },
  };
}

export function deriveV2MonthWindow(year: number, month: number, quotaTimezone: string): { key: string; start: Date; end: Date } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("invalid_month");
  const start = zonedMidnightUtc(year, month, 1, quotaTimezone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = zonedMidnightUtc(nextYear, nextMonth, 1, quotaTimezone);
  return { key: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`, start, end };
}

export function parseMonthWindowKey(windowKey: string): { year: number; month: number } {
  const match = /^(?<year>[0-9]{4})-(?<month>0[1-9]|1[0-2])-01$/u.exec(windowKey);
  if (!match?.groups) throw new Error("invalid_month_window_key");
  return { year: Number(match.groups.year), month: Number(match.groups.month) };
}

export function nextMonthWindow(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export type VeraUsageDtoWindow = {
  periodKind: QuotaWindowPeriodKind;
  windowKey: string;
  windowStart: string;
  windowEnd: string;
  resetAt: string;
  creditLimit: number;
  consumedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  costLimitUsdMicros: string;
  reservedUsdMicros: string;
  settledUsdMicros: string;
  unknownUsdMicros: string;
  overrunUsdMicros: string;
  monetaryDebtState: "clear" | "debt";
};

export type VeraUsageDto = {
  ledgerVersion: typeof VERA_CREDIT_USD_V2;
  quotaTimezone: string;
  creditLimit: number;
  consumedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  monetaryDebtState: "clear" | "debt";
  providerSpend: {
    costLimitUsdMicros: string;
    settledUsdMicros: string;
    reservedUsdMicros: string;
    unknownUsdMicros: string;
    overrunUsdMicros: string;
    exposureUsdMicros: string;
    remainingUsdMicros: string;
  };
  windows: VeraUsageDtoWindow[];
};

export function toVeraUsageDto(windows: QuotaWindowSnapshot[], quotaTimezone: string): VeraUsageDto {
  const month = windows.find((window) => window.periodKind === "month");
  if (!month) throw new Error("monthly_window_missing");
  const consumedCredits = Math.max(...windows.map((window) => window.consumedCredits));
  const reservedCredits = Math.max(...windows.map((window) => window.reservedCredits));
  const toDto = (window: QuotaWindowSnapshot): VeraUsageDtoWindow => ({
    periodKind: window.periodKind,
    windowKey: window.windowKey,
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
    resetAt: window.windowEnd.toISOString(),
    creditLimit: window.creditLimit,
    consumedCredits: window.consumedCredits,
    reservedCredits: window.reservedCredits,
    remainingCredits: Math.max(0, window.creditLimit - window.consumedCredits - window.reservedCredits),
    costLimitUsdMicros: window.costLimitUsdMicros.toString(),
    reservedUsdMicros: window.reservedUsdMicros.toString(),
    settledUsdMicros: window.settledUsdMicros.toString(),
    unknownUsdMicros: window.unknownUsdMicros.toString(),
    overrunUsdMicros: window.overrunUsdMicros.toString(),
    monetaryDebtState: window.monetaryDebtState,
  });
  const exposure = monthlyExposure(month);
  return {
    ledgerVersion: VERA_CREDIT_USD_V2,
    quotaTimezone,
    creditLimit: month.creditLimit,
    consumedCredits,
    reservedCredits,
    remainingCredits: Math.max(0, month.creditLimit - month.consumedCredits - month.reservedCredits),
    monetaryDebtState: month.monetaryDebtState,
    providerSpend: {
      costLimitUsdMicros: month.costLimitUsdMicros.toString(),
      settledUsdMicros: month.settledUsdMicros.toString(),
      reservedUsdMicros: month.reservedUsdMicros.toString(),
      unknownUsdMicros: month.unknownUsdMicros.toString(),
      overrunUsdMicros: month.overrunUsdMicros.toString(),
      exposureUsdMicros: exposure.toString(),
      remainingUsdMicros: (month.costLimitUsdMicros > exposure ? month.costLimitUsdMicros - exposure : 0n).toString(),
    },
    windows: windows.map(toDto),
  };
}

/** Read-only zero projection used by the usage endpoint before first v2 use. */
export function emptyV2UsageDto(now: Date, quotaTimezone: string): VeraUsageDto {
  const keys = deriveV2WindowKeys(now, quotaTimezone || VERA_DEFAULT_QUOTA_TIMEZONE);
  const windows: [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot] = [
    {
      id: `empty-day-${keys.day.key}`,
      periodKind: "day",
      windowKey: keys.day.key,
      windowStart: keys.day.start,
      windowEnd: keys.day.end,
      quotaTimezone,
      creditLimit: VERA_DAILY_CREDIT_LIMIT,
      costLimitUsdMicros: 0n,
      consumedCredits: 0,
      reservedCredits: 0,
      releasedCredits: 0,
      reservedUsdMicros: 0n,
      settledUsdMicros: 0n,
      unknownUsdMicros: 0n,
      releasedUsdMicros: 0n,
      overrunUsdMicros: 0n,
      monetaryDebtState: "clear",
    },
    {
      id: `empty-week-${keys.isoWeek.key}`,
      periodKind: "iso_week",
      windowKey: keys.isoWeek.key,
      windowStart: keys.isoWeek.start,
      windowEnd: keys.isoWeek.end,
      quotaTimezone,
      creditLimit: VERA_WEEKLY_CREDIT_LIMIT,
      costLimitUsdMicros: 0n,
      consumedCredits: 0,
      reservedCredits: 0,
      releasedCredits: 0,
      reservedUsdMicros: 0n,
      settledUsdMicros: 0n,
      unknownUsdMicros: 0n,
      releasedUsdMicros: 0n,
      overrunUsdMicros: 0n,
      monetaryDebtState: "clear",
    },
    {
      id: `empty-month-${keys.month.key}`,
      periodKind: "month",
      windowKey: keys.month.key,
      windowStart: keys.month.start,
      windowEnd: keys.month.end,
      quotaTimezone,
      creditLimit: VERA_MONTHLY_CREDIT_LIMIT,
      costLimitUsdMicros: VERA_MONTHLY_COST_LIMIT_USD_MICROS,
      consumedCredits: 0,
      reservedCredits: 0,
      releasedCredits: 0,
      reservedUsdMicros: 0n,
      settledUsdMicros: 0n,
      unknownUsdMicros: 0n,
      releasedUsdMicros: 0n,
      overrunUsdMicros: 0n,
      monetaryDebtState: "clear",
    },
  ];
  return toVeraUsageDto(windows, quotaTimezone || VERA_DEFAULT_QUOTA_TIMEZONE);
}

export function monthlyExposure(window: Pick<QuotaWindowSnapshot, "reservedUsdMicros" | "settledUsdMicros" | "unknownUsdMicros">): bigint {
  return monthlyExposureUsdMicros(window);
}

function creditExposure(window: QuotaWindowSnapshot): number {
  return window.reservedCredits + window.consumedCredits;
}

export function reserveV2(input: {
  windows: [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot];
  creditCost: number;
  maxProviderCostUsdMicros: bigint;
}): V2Reservation {
  const [day, isoWeek, month] = input.windows;
  if (!Number.isSafeInteger(input.creditCost) || input.creditCost < 1) throw new Error("invalid_credit_cost");
  if (day.periodKind !== "day" || isoWeek.periodKind !== "iso_week" || month.periodKind !== "month") throw new Error("quota_windows_wrong_order");
  if (day.monetaryDebtState !== "clear" || isoWeek.monetaryDebtState !== "clear" || month.monetaryDebtState !== "clear") throw new Error("quota_monetary_debt");
  for (const window of input.windows) {
    if (creditExposure(window) + input.creditCost > window.creditLimit) throw new Error(`quota_exhausted_${window.periodKind}`);
  }
  assertMonthlyAdmission({
    monetaryDebtState: month.monetaryDebtState,
    reservedUsdMicros: month.reservedUsdMicros,
    settledUsdMicros: month.settledUsdMicros,
    unknownUsdMicros: month.unknownUsdMicros,
    costLimitUsdMicros: month.costLimitUsdMicros,
    newReservationUsdMicros: input.maxProviderCostUsdMicros,
  });
  const nextWindows = input.windows.map((window) => ({
    ...window,
    reservedCredits: window.reservedCredits + input.creditCost,
    reservedUsdMicros: window.periodKind === "month" ? window.reservedUsdMicros + input.maxProviderCostUsdMicros : 0n,
  })) as [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot];
  const lineage = input.windows.map((window) => ({
    reservedCredits: input.creditCost,
    consumedCredits: 0,
    releasedCredits: 0,
    reservedUsdMicros: window.periodKind === "month" ? input.maxProviderCostUsdMicros : 0n,
    settledUsdMicros: 0n,
    unknownUsdMicros: 0n,
    releasedUsdMicros: 0n,
    overrunUsdMicros: 0n,
  })) as [ReservationAmounts, ReservationAmounts, ReservationAmounts];
  lineage.forEach(assertReservationAmountsNonnegative);
  return { creditCost: input.creditCost, reservedUsdMicros: input.maxProviderCostUsdMicros, windows: nextWindows, lineage };
}

export function settleV2(input: {
  reservation: V2Reservation;
  outcome: "known" | "unknown" | "released";
  chargedUsdMicros?: bigint;
}): { windows: [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot]; lineage: [ReservationAmounts, ReservationAmounts, ReservationAmounts] } {
  const [day, isoWeek, month] = input.reservation.windows;
  const lineages = input.reservation.lineage.map((lineage) => settleReservation({
    current: lineage,
    outcome: input.outcome,
    chargedUsdMicros: input.outcome === "known" ? input.chargedUsdMicros ?? 0n : undefined,
    unresolvedUsdMicros: input.outcome === "unknown" && lineage.reservedUsdMicros > 0n
      ? input.reservation.reservedUsdMicros
      : undefined,
  })) as [ReservationAmounts, ReservationAmounts, ReservationAmounts];
  const windows = [day, isoWeek, month].map((window, index) => {
    const lineage = lineages[index];
    const next: QuotaWindowSnapshot = {
      ...window,
      reservedCredits: Math.max(0, window.reservedCredits - lineage.reservedCredits),
      consumedCredits: window.consumedCredits + lineage.consumedCredits,
      reservedUsdMicros: window.periodKind === "month"
        ? (window.reservedUsdMicros > lineage.reservedUsdMicros ? window.reservedUsdMicros - lineage.reservedUsdMicros : 0n)
        : 0n,
      settledUsdMicros: window.periodKind === "month" ? window.settledUsdMicros + lineage.settledUsdMicros : 0n,
      unknownUsdMicros: window.periodKind === "month" ? window.unknownUsdMicros + lineage.unknownUsdMicros : 0n,
      overrunUsdMicros: window.periodKind === "month" ? window.overrunUsdMicros + lineage.overrunUsdMicros : 0n,
      monetaryDebtState: window.periodKind === "month" && lineage.overrunUsdMicros > 0n ? "debt" : window.monetaryDebtState,
    };
    return next;
  }) as [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot];
  return { windows, lineage: lineages };
}
