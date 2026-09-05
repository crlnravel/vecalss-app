import { createHmac } from "node:crypto";

import { VeraContractError, canonicalJson } from "@/lib/vera-ai/contracts";

import {
  VERA_REPORT_FEATURES,
  VERA_REPORT_GATEWAYS,
  VERA_REPORT_MAX_RANGE_DAYS,
  VERA_REPORT_MODELS,
  VERA_REPORT_OPERATION,
  VERA_REPORT_STATUSES,
  VERA_REPORT_UPSTREAMS,
  type VeraAdminUsageQuery,
  type VeraReportInclude,
} from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DEFAULT_TIMEZONE = "Asia/Jakarta";
const ALL_INCLUDES = ["dailyTrend", "byFeature", "byModel", "byStatus", "incidents", "comparison"] as const;

function invalidQuery(message: string): never {
  throw new VeraContractError("vera_not_active", message, 400, { code: "invalid_report_query" });
}

function parseDate(value: string, field: string): { year: number; month: number; day: number; iso: string } {
  const match = DATE_PATTERN.exec(value);
  if (!match) invalidQuery(`${field} harus berupa tanggal kalender YYYY-MM-DD.`);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
    || year < 1970
    || year > 2200
  ) {
    invalidQuery(`${field} bukan tanggal kalender yang valid.`);
  }
  return { year, month, day, iso: value };
}

const VALID_IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

function assertTimeZone(timezone: string): string {
  const normalized = timezone.trim() || DEFAULT_TIMEZONE;
  if (normalized.length > 64 || normalized.includes("\u0000")) invalidQuery("Zona waktu tidak valid.");
  if (!VALID_IANA_TIMEZONES.has(normalized)) {
    invalidQuery("Zona waktu harus merupakan zona IANA yang valid.");
  }
  return normalized;
}

function partsToValues(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }
  return values;
}

function offsetAt(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = partsToValues(parts);
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return localAsUtc - instant.getTime();
}

/**
 * Convert a local midnight to an instant without assuming a fixed offset.
 * Iterating the zone offset handles 23/25-hour DST days and historical offset
 * changes while retaining the half-open range contract.
 */
export function localDateToUtc(value: string, timezone: string): Date {
  const { year, month, day } = parseDate(value, "date");
  let candidate = new Date(Date.UTC(year, month - 1, day));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const next = new Date(Date.UTC(year, month - 1, day) - offsetAt(candidate, timezone));
    if (next.getTime() === candidate.getTime()) return next;
    candidate = next;
  }
  return candidate;
}

function addDays(value: string, days: number): string {
  const parsed = parseDate(value, "date");
  const result = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${String(result.getUTCFullYear()).padStart(4, "0")}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function dateDifference(from: string, to: string): number {
  const start = parseDate(from, "from");
  const end = parseDate(to, "to");
  return Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000);
}

function oneParam(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) invalidQuery(`Parameter ${name} tidak boleh diulang.`);
  return values[0];
}

function allowlisted<T extends string>(value: string | undefined, allowed: readonly T[], field: string): T | "all" | "unknown" {
  const normalized = value?.trim() || "all";
  if (normalized === "all" || normalized === "unknown") return normalized;
  if ((allowed as readonly string[]).includes(normalized)) return normalized as T;
  invalidQuery(`Filter ${field} tidak dikenal.`);
}

function parseInclude(value: string | undefined): ReadonlySet<VeraReportInclude> {
  if (!value) return new Set();
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0 || values.length > ALL_INCLUDES.length || new Set(values).size !== values.length) {
    invalidQuery("Include laporan tidak valid.");
  }
  if (values.some((item) => !(ALL_INCLUDES as readonly string[]).includes(item))) invalidQuery("Include laporan tidak valid.");
  return new Set(values as VeraReportInclude[]);
}

function defaultRange(now: Date, timezone: string): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = partsToValues(parts);
  const today = `${values.year}-${values.month}-${values.day}`;
  return { from: addDays(today, -6), to: addDays(today, 1) };
}

export function parseAdminUsageQuery(params: URLSearchParams, now = new Date()): VeraAdminUsageQuery {
  const timezone = assertTimeZone(oneParam(params, "timezone") ?? DEFAULT_TIMEZONE);
  const defaults = defaultRange(now, timezone);
  const from = oneParam(params, "from") ?? defaults.from;
  const to = oneParam(params, "to") ?? defaults.to;
  parseDate(from, "from");
  parseDate(to, "to");
  const dayCount = dateDifference(from, to);
  if (dayCount <= 0 || dayCount > VERA_REPORT_MAX_RANGE_DAYS) invalidQuery("Rentang laporan harus 1–31 hari kalender lokal.");

  const feature = allowlisted(oneParam(params, "feature"), VERA_REPORT_FEATURES, "feature");
  const gateway = allowlisted(oneParam(params, "gateway"), VERA_REPORT_GATEWAYS, "gateway");
  const upstreamProvider = allowlisted(oneParam(params, "upstreamProvider"), VERA_REPORT_UPSTREAMS, "upstreamProvider");
  const model = allowlisted(oneParam(params, "model"), VERA_REPORT_MODELS, "model");
  const status = allowlisted(oneParam(params, "status"), VERA_REPORT_STATUSES, "status");
  const include = parseInclude(oneParam(params, "include"));
  const previousFrom = addDays(from, -dayCount);
  const previousTo = from;
  return {
    from,
    to,
    timezone,
    feature: feature as VeraAdminUsageQuery["feature"],
    gateway: gateway as VeraAdminUsageQuery["gateway"],
    upstreamProvider: upstreamProvider as VeraAdminUsageQuery["upstreamProvider"],
    model: model as VeraAdminUsageQuery["model"],
    status: status as VeraAdminUsageQuery["status"],
    include,
    utcStart: localDateToUtc(from, timezone),
    utcEnd: localDateToUtc(to, timezone),
    previousUtcStart: localDateToUtc(previousFrom, timezone),
    previousUtcEnd: localDateToUtc(previousTo, timezone),
    previousFrom,
    previousTo,
    dayCount,
  };
}

export function reportCost(include: ReadonlySet<VeraReportInclude>): number {
  let cost = 1;
  if (include.has("dailyTrend")) cost += 2;
  if (include.has("byFeature")) cost += 1;
  if (include.has("byModel")) cost += 1;
  if (include.has("byStatus")) cost += 1;
  if (include.has("incidents")) cost += 2;
  if (include.has("comparison")) cost += 2;
  return Math.min(12, cost);
}

export function reportFingerprint(query: VeraAdminUsageQuery, secret: string): string {
  const canonical = canonicalJson({
    operation: "admin_report_query",
    from: query.from,
    to: query.to,
    timezone: query.timezone,
    feature: query.feature,
    gateway: query.gateway,
    upstreamProvider: query.upstreamProvider,
    model: query.model,
    status: query.status,
    include: [...query.include].sort(),
  });
  if (!secret.trim()) throw new Error("VERA_IDEMPOTENCY_HMAC_SECRET is required");
  return createHmac("sha256", secret).update(`${VERA_REPORT_OPERATION}:${canonical}`).digest("hex");
}

export function isSafeReportKey(value: string | null): value is string {
  return Boolean(value && value.length >= 1 && value.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(value));
}

export function dateForDisplay(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = partsToValues(parts);
  return `${values.year}-${values.month}-${values.day}`;
}

export { addDays, assertTimeZone, dateDifference, DEFAULT_TIMEZONE };
