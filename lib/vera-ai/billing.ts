/**
 * Exact billing arithmetic for Vera's USD-micro ledger.
 *
 * Provider costs arrive as JSON decimal lexemes. They must never pass through
 * JavaScript Number: a BigInt coefficient and base-10 scale preserve the
 * original value until the one required upward micro-dollar rounding step.
 */

export const USD_MICROS_PER_USD = 1_000_000n;
export const TOKENS_PER_MILLION = 1_000_000n;
export const MAX_DECIMAL_LEXEME_BYTES = 128;
export const MAX_COEFFICIENT_DIGITS = 38;
export const MAX_ABSOLUTE_EXPONENT = 18;

export type ParsedDecimalLexeme = {
  raw: string;
  coefficient: bigint;
  scale: number;
  canonical: string;
};

const DECIMAL_RE = /^(?<sign>-?)(?<integer>0|[1-9][0-9]*)(?:\.(?<fraction>[0-9]+))?(?:[eE](?<exponent>[+-]?[0-9]+))?$/u;

function fail(code: string): never {
  throw new Error(code);
}

function decimalString(coefficient: bigint, scale: number): string {
  if (coefficient < 0n) fail("negative_decimal_not_allowed");
  if (coefficient === 0n) return "0";
  const digits = coefficient.toString();
  if (scale <= 0) return `${digits}${"0".repeat(-scale)}`;
  if (digits.length <= scale) return `0.${"0".repeat(scale - digits.length)}${digits}`;
  const split = digits.length - scale;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}

/** Parse a JSON decimal number/string without losing its lexeme or precision. */
export function parseDecimalLexeme(value: string): ParsedDecimalLexeme {
  if (typeof value !== "string") fail("decimal_lexeme_must_be_string");
  if (Buffer.byteLength(value, "utf8") > MAX_DECIMAL_LEXEME_BYTES) fail("decimal_lexeme_too_long");
  const match = DECIMAL_RE.exec(value);
  if (!match?.groups) fail("invalid_decimal_lexeme");
  if (match.groups.sign === "-") fail("negative_decimal_not_allowed");
  const integer = match.groups.integer;
  const fraction = match.groups.fraction ?? "";
  const exponentText = match.groups.exponent ?? "0";
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_ABSOLUTE_EXPONENT) fail("decimal_exponent_out_of_range");
  const digits = `${integer}${fraction}`;
  if (digits.length > MAX_COEFFICIENT_DIGITS) fail("decimal_coefficient_too_long");
  const coefficient = BigInt(digits);
  if (coefficient === 0n && match.groups.sign === "-") fail("negative_zero_not_allowed");
  const scale = fraction.length - exponent;
  return {
    raw: value,
    coefficient,
    scale,
    canonical: decimalString(coefficient, scale),
  };
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) fail("division_denominator_must_be_positive");
  if (numerator < 0n) fail("negative_dividend_not_allowed");
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

function scaledNumerator(decimal: ParsedDecimalLexeme, scale: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isInteger(scale) || scale < 0) fail("scale_must_be_nonnegative_integer");
  const delta = scale - decimal.scale;
  if (delta >= 0) return { numerator: decimal.coefficient * 10n ** BigInt(delta), denominator: 1n };
  return { numerator: decimal.coefficient, denominator: 10n ** BigInt(-delta) };
}

/** Convert a provider USD decimal into integer USD micros, always rounding up. */
export function decimalToUsdMicros(value: string | ParsedDecimalLexeme): bigint {
  const decimal = typeof value === "string" ? parseDecimalLexeme(value) : value;
  const scaled = scaledNumerator(decimal, 6);
  return ceilDiv(scaled.numerator, scaled.denominator);
}

/** Convert an exact manifest USD/Million price into integer micros/Million. */
export function priceMicrosPerMillion(value: string | ParsedDecimalLexeme): bigint {
  const decimal = typeof value === "string" ? parseDecimalLexeme(value) : value;
  const scaled = scaledNumerator(decimal, 6);
  if (scaled.numerator % scaled.denominator !== 0n) fail("price_has_more_than_six_fractional_usd_digits");
  return scaled.numerator / scaled.denominator;
}

export type VeraBillableDimensions = {
  uncachedPromptTokens?: number;
  cachedPromptTokens?: number;
  cacheWriteTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  requestCount?: number;
  imageCount?: number;
  audioCount?: number;
  serverToolUnits?: number;
};

export type VeraPriceSnapshot = {
  prompt?: string;
  completion?: string;
  request?: string;
  image?: string;
  audio?: string;
  cacheRead?: string;
  cacheWrite?: string;
  reasoning?: string;
  serverTool?: string;
};

const PRICE_KEYS: Array<[keyof VeraBillableDimensions, keyof VeraPriceSnapshot]> = [
  ["uncachedPromptTokens", "prompt"],
  ["cachedPromptTokens", "cacheRead"],
  ["cacheWriteTokens", "cacheWrite"],
  ["completionTokens", "completion"],
  ["reasoningTokens", "reasoning"],
  ["requestCount", "request"],
  ["imageCount", "image"],
  ["audioCount", "audio"],
  ["serverToolUnits", "serverTool"],
];

function quantity(value: number | undefined, key: string): bigint {
  if (value === undefined) return 0n;
  if (!Number.isSafeInteger(value) || value < 0) fail(`${key}_must_be_nonnegative_integer`);
  return BigInt(value);
}

/** Sum every enabled dimension, then round upward exactly once. */
export function calculateProviderCostUsdMicros(
  dimensions: VeraBillableDimensions,
  prices: VeraPriceSnapshot,
): bigint {
  let numerator = 0n;
  for (const [dimensionKey, priceKey] of PRICE_KEYS) {
    const amount = quantity(dimensions[dimensionKey], dimensionKey);
    if (amount === 0n) continue;
    const price = prices[priceKey];
    if (price === undefined) fail(`missing_price_${String(priceKey)}`);
    numerator += amount * priceMicrosPerMillion(price);
  }
  return ceilDiv(numerator, TOKENS_PER_MILLION);
}

export function maximumReservationUsdMicros(input: {
  inputTokens: number;
  outputTokens: number;
  maxProviderAttempts?: number;
  prices?: VeraPriceSnapshot;
}): bigint {
  const prices = input.prices ?? { prompt: "0.10", completion: "0.30" };
  const oneAttempt = calculateProviderCostUsdMicros({
    uncachedPromptTokens: input.inputTokens,
    completionTokens: input.outputTokens,
  }, prices);
  const attempts = input.maxProviderAttempts ?? 2;
  if (!Number.isSafeInteger(attempts) || attempts < 1) fail("invalid_provider_attempt_count");
  return oneAttempt * BigInt(attempts);
}

export function weightedCreditCost(operation: "chat" | "review" | "analysis" | "route" | string): 1 | 2 {
  return operation === "analysis" || operation === "route" ? 2 : 1;
}

export type ReservationAmounts = {
  reservedCredits: number;
  consumedCredits: number;
  releasedCredits: number;
  reservedUsdMicros: bigint;
  settledUsdMicros: bigint;
  unknownUsdMicros: bigint;
  releasedUsdMicros: bigint;
  overrunUsdMicros: bigint;
};

function nonnegativeBigInt(value: bigint, name: string): void {
  if (typeof value !== "bigint" || value < 0n) fail(`${name}_must_be_nonnegative_bigint`);
}

/** Validate amount types before a reservation has reached a terminal state. */
export function assertReservationAmountsNonnegative(value: ReservationAmounts): void {
  for (const [name, amount] of Object.entries(value)) {
    if (name.endsWith("Credits")) {
      if (!Number.isSafeInteger(amount) || amount < 0) fail(`${name}_must_be_nonnegative_integer`);
    } else nonnegativeBigInt(amount as bigint, name);
  }
}

/** Assert both lineage conservation equations before a terminal database write. */
export function assertReservationConservation(value: ReservationAmounts): void {
  assertReservationAmountsNonnegative(value);
  if (value.reservedCredits !== value.consumedCredits + value.releasedCredits) fail("credit_conservation_violation");
  if (value.reservedUsdMicros + value.overrunUsdMicros !== value.settledUsdMicros + value.unknownUsdMicros + value.releasedUsdMicros) {
    fail("usd_conservation_violation");
  }
}

export function monthlyExposureUsdMicros(window: Pick<ReservationAmounts, "reservedUsdMicros" | "settledUsdMicros" | "unknownUsdMicros">): bigint {
  return window.reservedUsdMicros + window.settledUsdMicros + window.unknownUsdMicros;
}

export function assertMonthlyAdmission(input: {
  monetaryDebtState: "clear" | "debt";
  reservedUsdMicros: bigint;
  settledUsdMicros: bigint;
  unknownUsdMicros: bigint;
  costLimitUsdMicros: bigint;
  newReservationUsdMicros: bigint;
}): void {
  if (input.monetaryDebtState !== "clear") fail("monthly_monetary_debt");
  const exposure = monthlyExposureUsdMicros(input);
  if (exposure + input.newReservationUsdMicros > input.costLimitUsdMicros) fail("monthly_monetary_quota_exhausted");
}

export type ReservationOutcome = "known" | "unknown" | "released";

/** Apply one idempotent terminal outcome to a lineage value. */
export function settleReservation(input: {
  current: ReservationAmounts;
  outcome: ReservationOutcome;
  chargedUsdMicros?: bigint;
  unresolvedUsdMicros?: bigint;
  consumedCredits?: number;
}): ReservationAmounts {
  const current = { ...input.current };
  assertReservationAmountsNonnegative(current);
  if (current.consumedCredits > 0 || current.releasedCredits > 0 || current.settledUsdMicros > 0 || current.unknownUsdMicros > 0 || current.releasedUsdMicros > 0) {
    return current;
  }
  // A release happens before the durable dispatching transition, so it must
  // return every weighted credit. Known/unknown outcomes happen after a
  // dispatch intent and therefore consume the full request reservation.
  const consumedCredits = input.consumedCredits ?? (input.outcome === "released" ? 0 : current.reservedCredits);
  if (!Number.isSafeInteger(consumedCredits) || consumedCredits < 0 || consumedCredits > current.reservedCredits) fail("invalid_settlement_credit_amount");
  const next: ReservationAmounts = { ...current, consumedCredits };
  if (input.outcome === "released") {
    next.releasedCredits = current.reservedCredits - consumedCredits;
    next.releasedUsdMicros = current.reservedUsdMicros;
  } else if (input.outcome === "unknown") {
    next.releasedCredits = current.reservedCredits - consumedCredits;
    next.unknownUsdMicros = input.unresolvedUsdMicros ?? current.reservedUsdMicros;
    if (next.unknownUsdMicros < 0n) fail("unknown_cost_must_be_nonnegative");
    next.overrunUsdMicros = next.unknownUsdMicros > current.reservedUsdMicros ? next.unknownUsdMicros - current.reservedUsdMicros : 0n;
  } else {
    const charged = input.chargedUsdMicros ?? 0n;
    nonnegativeBigInt(charged, "charged_usd_micros");
    next.releasedCredits = current.reservedCredits - consumedCredits;
    next.settledUsdMicros = charged;
    next.overrunUsdMicros = charged > current.reservedUsdMicros ? charged - current.reservedUsdMicros : 0n;
    next.releasedUsdMicros = charged < current.reservedUsdMicros ? current.reservedUsdMicros - charged : 0n;
  }
  assertReservationConservation(next);
  return next;
}

/**
 * Apply definitive evidence to a lineage that was previously marked unknown.
 * The immutable reservation total is preserved; the unknown bucket moves to
 * settled (or to diagnostic overrun) and only the unused remainder is
 * released. Repeating the same correction is idempotent.
 */
export function correctUnknownReservation(input: {
  current: ReservationAmounts;
  chargedUsdMicros: bigint;
}): ReservationAmounts {
  const current = { ...input.current };
  assertReservationConservation(current);
  nonnegativeBigInt(input.chargedUsdMicros, "charged_usd_micros");
  if (current.unknownUsdMicros === 0n) {
    if (current.settledUsdMicros === input.chargedUsdMicros) return current;
    if (current.settledUsdMicros > 0n || current.releasedUsdMicros > 0n) return current;
    fail("unknown_cost_missing");
  }
  const next: ReservationAmounts = {
    ...current,
    settledUsdMicros: input.chargedUsdMicros,
    unknownUsdMicros: 0n,
    releasedUsdMicros: input.chargedUsdMicros < current.reservedUsdMicros
      ? current.reservedUsdMicros - input.chargedUsdMicros
      : 0n,
    overrunUsdMicros: input.chargedUsdMicros > current.reservedUsdMicros
      ? input.chargedUsdMicros - current.reservedUsdMicros
      : 0n,
  };
  assertReservationConservation(next);
  return next;
}
