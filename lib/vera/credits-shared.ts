import { VERA_EFFORTS, VERA_LIMITS, type VeraEffortId } from "./config";

/**
 * Pure credit math, shared by the server ledger and the composer. The client
 * uses the default prices; the server may override them from env.
 */

/** USD per one million tokens. That is also micro-USD per token, so the ledger stays integral. */
export type VeraPrices = { input: number; cachedInput: number; output: number };

export const VERA_DEFAULT_PRICES: VeraPrices = { input: 0.1, cachedInput: 0.01, output: 0.5 };

/** `outputTokens` already includes reasoning tokens, as the provider bills them. */
export type VeraTokenUsage = { noCacheInputTokens: number; cachedInputTokens: number; outputTokens: number };

export function costUsdMicros(usage: VeraTokenUsage, prices: VeraPrices = VERA_DEFAULT_PRICES): number {
  return Math.ceil(
    usage.noCacheInputTokens * prices.input +
      usage.cachedInputTokens * prices.cachedInput +
      usage.outputTokens * prices.output,
  );
}

/** Rounded up to 0.1 credit. Every answer costs at least 0.1. */
export function creditsFromMicros(micros: number): number {
  const tenths = Math.ceil((micros * 10) / VERA_LIMITS.microUsdPerCredit);
  return Math.max(1, tenths) / 10;
}

export function creditsForUsage(usage: VeraTokenUsage, prices: VeraPrices = VERA_DEFAULT_PRICES): number {
  return creditsFromMicros(costUsdMicros(usage, prices));
}

export type SettlementCharge = { kind: "release" } | { kind: "settle"; chargedMicros: number };

/**
 * What an answer costs when it ends. Its completed steps cost what the provider
 * reported. A step cut off after it began streaming costs `cutOffMicros`, an
 * estimate of its input and of the output it streamed, because OpenAI bills
 * generation once it starts. An answer that streamed nothing at all is released.
 */
export function settlementCharge({
  actualMicros,
  completedSteps,
  cutOffMicros,
}: {
  actualMicros: number;
  completedSteps: number;
  /** The estimate for the cut-off step, or null when it streamed nothing. */
  cutOffMicros: number | null;
}): SettlementCharge {
  if (completedSteps === 0 && cutOffMicros === null) return { kind: "release" };
  return { kind: "settle", chargedMicros: actualMicros + (cutOffMicros ?? 0) };
}

const SYSTEM_TOKENS = 1_200;
const MENTION_TOKENS = 1_000;
const MENTION_BUDGET_TOKENS = 6_000;
const LOW_OUTPUT_TOKENS = 300;

/**
 * The composer's estimate before sending. Low assumes a one-step short answer.
 * High assumes two steps (a tool call, then the answer), both at the effort's
 * full output cap, and never more than the effort's ceiling, which the server
 * enforces.
 */
export function estimateCreditRange(
  { effort, historyChars, mentionCount }: { effort: VeraEffortId; historyChars: number; mentionCount: number },
  prices: VeraPrices = VERA_DEFAULT_PRICES,
): { low: number; high: number } {
  const { maxOutputTokens, ceilingCredits } = VERA_EFFORTS[effort];
  const mentionTokens = Math.min(MENTION_BUDGET_TOKENS, mentionCount * MENTION_TOKENS);
  const promptTokens = Math.min(
    VERA_LIMITS.maxInputTokensPerStep,
    SYSTEM_TOKENS + Math.ceil(historyChars / 4) + mentionTokens,
  );
  const low = creditsForUsage({ noCacheInputTokens: promptTokens, cachedInputTokens: 0, outputTokens: LOW_OUTPUT_TOKENS }, prices);
  const firstStep = creditsForUsage({ noCacheInputTokens: promptTokens, cachedInputTokens: 0, outputTokens: maxOutputTokens }, prices);
  const secondStep = creditsForUsage(
    {
      noCacheInputTokens: promptTokens + maxOutputTokens + VERA_LIMITS.maxToolOutputTokensPerStep,
      cachedInputTokens: 0,
      outputTokens: maxOutputTokens,
    },
    prices,
  );
  return { low, high: Math.min(ceilingCredits, firstStep + secondStep) };
}

/** Indonesian decimal comma, as the UI shows it: 0,6. */
export function formatCredits(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function formatCreditRange({ low, high }: { low: number; high: number }): string {
  return `≈ ${formatCredits(low)}–${formatCredits(high)} kredit`;
}
