import "server-only";

export type QuotaLedger = {
  usageDate: string;
  quotaLimitUnitsSnapshot: number;
  usedQuotaUnits: number;
  reservedQuotaUnits: number;
  quotaDebtUnits: number;
  quotaOverrunLockUntil: Date | null;
  quotaTimezone: string;
  quotaTimezonePolicyVersion: string;
  acceptedRequestCount: number;
  finalizedRequestCount: number;
};

export type QuotaReservation = {
  ledger: QuotaLedger;
  reservedUnits: number;
};

export type QuotaSettlement = {
  ledger: QuotaLedger;
  consumedUnits: number;
  overrunUnits: number;
  settlementKind: "result" | "usage_only" | "conservative_reservation" | "missing_stage_unknown";
  usageAccountingState: "known" | "unknown" | "overrun_debt";
};

export class QuotaAdmissionError extends Error {
  readonly code: "quota" | "quota_overrun_lock";

  constructor(code: "quota" | "quota_overrun_lock", message: string = code) {
    super(message);
    this.name = "QuotaAdmissionError";
    this.code = code;
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}_must_be_non_negative_integer`);
}

function assertLedger(ledger: QuotaLedger): void {
  for (const [name, value] of Object.entries({
    quotaLimitUnitsSnapshot: ledger.quotaLimitUnitsSnapshot,
    usedQuotaUnits: ledger.usedQuotaUnits,
    reservedQuotaUnits: ledger.reservedQuotaUnits,
    quotaDebtUnits: ledger.quotaDebtUnits,
    acceptedRequestCount: ledger.acceptedRequestCount,
    finalizedRequestCount: ledger.finalizedRequestCount,
  })) assertNonNegativeInteger(name, value);
  if (ledger.finalizedRequestCount > ledger.acceptedRequestCount) throw new Error("finalized_count_exceeds_accepted_count");
  if (ledger.usedQuotaUnits + ledger.reservedQuotaUnits > ledger.quotaLimitUnitsSnapshot + ledger.quotaDebtUnits) {
    throw new Error("ledger_exposure_exceeds_limit_and_debt");
  }
}

export function reserveQuota(ledger: QuotaLedger, requestedUnits: number, now = new Date()): QuotaReservation {
  assertNonNegativeInteger("requested_units", requestedUnits);
  if (requestedUnits < 1) throw new QuotaAdmissionError("quota", "A positive quota reservation is required.");
  assertLedger(ledger);
  if (ledger.quotaOverrunLockUntil && ledger.quotaOverrunLockUntil > now) {
    throw new QuotaAdmissionError("quota_overrun_lock", "The local quota day is locked after an overrun.");
  }
  if (ledger.usedQuotaUnits + ledger.reservedQuotaUnits + requestedUnits
    > ledger.quotaLimitUnitsSnapshot + ledger.quotaDebtUnits) {
    throw new QuotaAdmissionError("quota", "The certified reservation exceeds available quota exposure.");
  }
  const next = cloneLedger(ledger);
  next.reservedQuotaUnits += requestedUnits;
  next.acceptedRequestCount += 1;
  assertLedger(next);
  return { ledger: next, reservedUnits: requestedUnits };
}

export function settleQuota(
  ledger: QuotaLedger,
  input: {
    reservedUnits: number;
    actualUnits: number | null;
    localDayEnd: Date;
    unknownReason?: "provider_unknown" | "missing_stage_unknown";
  },
): QuotaSettlement {
  assertNonNegativeInteger("reserved_units", input.reservedUnits);
  if (input.reservedUnits < 1 || input.reservedUnits > ledger.reservedQuotaUnits) {
    throw new Error("reserved_units_not_outstanding");
  }
  if (input.actualUnits !== null) assertNonNegativeInteger("actual_units", input.actualUnits);
  assertLedger(ledger);

  const next = cloneLedger(ledger);
  next.reservedQuotaUnits -= input.reservedUnits;
  const unknown = input.actualUnits === null;
  const consumedUnits = input.actualUnits ?? input.reservedUnits;
  const overrunUnits = Math.max(0, consumedUnits - input.reservedUnits);
  next.usedQuotaUnits += consumedUnits;
  next.finalizedRequestCount += 1;
  next.quotaDebtUnits = Math.max(0, next.usedQuotaUnits + next.reservedQuotaUnits - next.quotaLimitUnitsSnapshot);
  if (overrunUnits > 0 || next.quotaDebtUnits > 0) {
    next.quotaOverrunLockUntil = new Date(input.localDayEnd);
  }
  assertLedger(next);
  return {
    ledger: next,
    consumedUnits,
    overrunUnits,
    settlementKind: unknown
      ? input.unknownReason === "missing_stage_unknown" ? "missing_stage_unknown" : "conservative_reservation"
      : input.actualUnits === 0 ? "usage_only" : "result",
    usageAccountingState: unknown ? "unknown" : overrunUnits > 0 || next.quotaDebtUnits > 0 ? "overrun_debt" : "known",
  };
}

function cloneLedger(ledger: QuotaLedger): QuotaLedger {
  return {
    ...ledger,
    quotaOverrunLockUntil: ledger.quotaOverrunLockUntil ? new Date(ledger.quotaOverrunLockUntil) : null,
  };
}

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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = zonedParts(new Date(guess), timeZone);
    const renderedUtc = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
    const offset = renderedUtc - guess;
    const next = Date.UTC(year, month - 1, day) - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

export function quotaDateAndDayEnd(now: Date, timeZone: string): { usageDate: string; dayEnd: Date } {
  const parts = zonedParts(now, timeZone);
  const usageDate = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const dayEnd = zonedMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
  return { usageDate, dayEnd };
}
