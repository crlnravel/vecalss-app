import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertReservationConservation,
  calculateProviderCostUsdMicros,
  correctUnknownReservation,
  decimalToUsdMicros,
  monthlyExposureUsdMicros,
  parseDecimalLexeme,
  priceMicrosPerMillion,
  settleReservation,
  weightedCreditCost,
  type ReservationAmounts,
} from "@/lib/vera-ai/billing";
import {
  deriveV2WindowKeys,
  ledgerVersionFor,
  reserveV2,
  settleV2,
  toVeraUsageDto,
  VERA_CREDIT_USD_V2,
  VERA_CREDIT_USD_V2_EFFECTIVE_FROM,
  type QuotaWindowSnapshot,
} from "@/lib/vera-ai/quota-v2";
import {
  VERA_RECONCILIATION_BATCH_SIZE,
  VERA_RECONCILIATION_CALL_TIMEOUT_MS,
  VERA_RECONCILIATION_INTERVAL_MS,
  VERA_RECONCILIATION_LEASE_MS,
  VERA_RECONCILIATION_MAX_IN_FLIGHT,
} from "@/workers/vera-ai-reconciliation-worker";

function expectThrow(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof Error && error.message === code);
}

const baseLineage: ReservationAmounts = {
  reservedCredits: 2,
  consumedCredits: 0,
  releasedCredits: 0,
  reservedUsdMicros: 1_680n,
  settledUsdMicros: 0n,
  unknownUsdMicros: 0n,
  releasedUsdMicros: 0n,
  overrunUsdMicros: 0n,
};

// Lossless decimal lexemes: parse once, round upward once, never via Number.
assert.equal(parseDecimalLexeme("4e-7").canonical, "0.0000004");
assert.equal(decimalToUsdMicros("0"), 0n);
assert.equal(decimalToUsdMicros("0.0000004"), 1n);
assert.equal(decimalToUsdMicros("4e-7"), 1n);
assert.equal(decimalToUsdMicros("0.000001"), 1n);
assert.equal(decimalToUsdMicros("0.9999994"), 1_000_000n);
assert.equal(priceMicrosPerMillion("0.10"), 100_000n);
assert.equal(priceMicrosPerMillion("0.30"), 300_000n);
expectThrow(() => parseDecimalLexeme("01"), "invalid_decimal_lexeme");
expectThrow(() => parseDecimalLexeme("-0"), "negative_decimal_not_allowed");
expectThrow(() => parseDecimalLexeme("-1"), "negative_decimal_not_allowed");
expectThrow(() => parseDecimalLexeme("1e999999999"), "decimal_exponent_out_of_range");
expectThrow(() => priceMicrosPerMillion("0.0000001"), "price_has_more_than_six_fractional_usd_digits");

assert.equal(calculateProviderCostUsdMicros({ uncachedPromptTokens: 6_000, completionTokens: 800 }, { prompt: "0.10", completion: "0.30" }), 840n);
assert.equal(calculateProviderCostUsdMicros({ uncachedPromptTokens: 10_000, completionTokens: 1_200 }, { prompt: "0.10", completion: "0.30" }), 1_360n);
assert.equal(weightedCreditCost("chat"), 1);
assert.equal(weightedCreditCost("review"), 1);
assert.equal(weightedCreditCost("analysis"), 2);
assert.equal(weightedCreditCost("route"), 2);

// Terminal outcomes preserve both conservation equations and release-before-
// dispatch does not consume the weighted credit.
const released = settleReservation({ current: baseLineage, outcome: "released" });
assert.deepEqual(released, { ...baseLineage, releasedCredits: 2, releasedUsdMicros: 1_680n });
assertReservationConservation(released);
const known = settleReservation({ current: baseLineage, outcome: "known", chargedUsdMicros: 840n });
assert.deepEqual(known, { ...baseLineage, consumedCredits: 2, settledUsdMicros: 840n, releasedUsdMicros: 840n });
assertReservationConservation(known);
const unknown = settleReservation({ current: baseLineage, outcome: "unknown", unresolvedUsdMicros: 1_680n });
assert.deepEqual(unknown, { ...baseLineage, consumedCredits: 2, unknownUsdMicros: 1_680n });
assertReservationConservation(unknown);
const corrected = correctUnknownReservation({ current: unknown, chargedUsdMicros: 840n });
assert.deepEqual(corrected, known);
assertReservationConservation(corrected);
assert.deepEqual(correctUnknownReservation({ current: known, chargedUsdMicros: 840n }), known);

function window(periodKind: "day" | "iso_week" | "month", key: string, limit: number, costLimitUsdMicros: bigint): QuotaWindowSnapshot {
  return {
    id: `${periodKind}-id`,
    periodKind,
    windowKey: key,
    windowStart: new Date("2026-10-01T00:00:00.000Z"),
    windowEnd: new Date("2026-10-02T00:00:00.000Z"),
    quotaTimezone: "Asia/Jakarta",
    creditLimit: limit,
    costLimitUsdMicros,
    consumedCredits: 0,
    reservedCredits: 0,
    releasedCredits: 0,
    reservedUsdMicros: 0n,
    settledUsdMicros: 0n,
    unknownUsdMicros: 0n,
    releasedUsdMicros: 0n,
    overrunUsdMicros: 0n,
    monetaryDebtState: "clear",
  };
}

const windows = [
  window("day", "2026-10-01", 15, 0n),
  window("iso_week", "2026-W40", 80, 0n),
  window("month", "2026-10-01", 300, 700_000n),
] as [QuotaWindowSnapshot, QuotaWindowSnapshot, QuotaWindowSnapshot];
const reservation = reserveV2({ windows, creditCost: 2, maxProviderCostUsdMicros: 1_680n });
assert.equal(reservation.windows[0].reservedCredits, 2);
assert.equal(reservation.windows[1].reservedCredits, 2);
assert.equal(reservation.windows[2].reservedCredits, 2);
assert.equal(reservation.windows[0].reservedUsdMicros, 0n);
assert.equal(reservation.windows[1].reservedUsdMicros, 0n);
assert.equal(reservation.windows[2].reservedUsdMicros, 1_680n);
const settled = settleV2({ reservation, outcome: "known", chargedUsdMicros: 840n });
assert.equal(settled.windows[0].consumedCredits, 2);
assert.equal(settled.windows[1].consumedCredits, 2);
assert.equal(settled.windows[2].consumedCredits, 2);
assert.equal(settled.windows[2].settledUsdMicros, 840n);
assert.equal(settled.windows[2].reservedUsdMicros, 0n);
assert.equal(settled.windows[0].settledUsdMicros, 0n);
assert.equal(monthlyExposureUsdMicros({ reservedUsdMicros: 0n, settledUsdMicros: 840n, unknownUsdMicros: 0n }), 840n);
const dto = toVeraUsageDto(settled.windows, "Asia/Jakarta");
assert.equal(dto.ledgerVersion, VERA_CREDIT_USD_V2);
assert.equal(dto.providerSpend.exposureUsdMicros, "840");
assert.equal(dto.providerSpend.remainingUsdMicros, "699160");
assert.deepEqual(dto.windows.map((row) => row.resetAt), dto.windows.map((row) => row.windowEnd));

// Cutover and frozen-timezone window keys are deterministic around the exact
// WIB boundary, including ISO-week and local-month reset semantics.
assert.equal(ledgerVersionFor(new Date("2026-09-30T16:59:59.999Z")), "vera_quota_v1");
assert.equal(ledgerVersionFor(VERA_CREDIT_USD_V2_EFFECTIVE_FROM), VERA_CREDIT_USD_V2);
const cutoverKeys = deriveV2WindowKeys(new Date("2026-09-30T17:00:00.000Z"), "Asia/Jakarta");
assert.equal(cutoverKeys.day.key, "2026-10-01");
assert.equal(cutoverKeys.month.key, "2026-10-01");
assert.match(cutoverKeys.isoWeek.key, /^2026-W[0-9]{2}$/u);

// Migration/package guardrails make the deployable slice reviewable without
// requiring a shared development database.
const root = process.cwd();
const migration = readFileSync(resolve(root, "prisma/migrations/20260921120000_add_vera_usage_windows_costs_and_reservations/migration.sql"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");
const workerSource = readFileSync(resolve(root, "workers/vera-ai-reconciliation-worker.ts"), "utf8");
for (const token of [
  "vera_credit_usd_v2",
  "ai_quota_calendars",
  "ai_usage_windows",
  "ai_request_usage_reservations",
  "ai_billing_correction_events",
  "ai_requests_billing_state_deadline_idx",
  "ai_request_attempts_evidence_lease_idx",
  "ai_request_usage_reservations_usd_conservation_check",
  "vera_quota_calendar_immutable_fields",
  "vera_usage_window_immutable_fields",
  "vera_billing_correction_append_only",
]) assert.match(migration, new RegExp(token, "u"));
assert.match(migration, /"state" = 'reserved' OR "reserved_credits"/u);
assert.match(migration, /"state" = 'reserved' OR "reserved_usd_micros"/u);
assert.match(packageJson, /"vera:reconciliation-worker"/u);
assert.match(workerSource, /FOR UPDATE OF a SKIP LOCKED/u);
assert.match(workerSource, /failAcceptedProviderResult/u);
assert.match(workerSource, /settleOverdueRequest/u);
assert.equal(VERA_RECONCILIATION_BATCH_SIZE, 50);
assert.equal(VERA_RECONCILIATION_MAX_IN_FLIGHT, 10);
assert.equal(VERA_RECONCILIATION_CALL_TIMEOUT_MS, 5_000);
assert.equal(VERA_RECONCILIATION_INTERVAL_MS, 30_000);
assert.equal(VERA_RECONCILIATION_LEASE_MS, 90_000);

console.log("PASS vera-billing-v2: decimal rounding, weighted conservation, cutover windows, DTO shape, migration checks, and worker bounds");
