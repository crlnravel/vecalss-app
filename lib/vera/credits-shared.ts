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

const SYSTEM_TOKENS = 1_200;
const MENTION_TOKENS = 1_000;
const MENTION_BUDGET_TOKENS = 6_000;
const LOW_OUTPUT_TOKENS = 300;

/**
 * The composer's estimate before sending. Low assumes a short answer. High
 * assumes the input doubles and the answer uses the effort's full output cap.
 */
export function estimateCreditRange(
  { effort, historyChars, mentionCount }: { effort: VeraEffortId; historyChars: number; mentionCount: number },
  prices: VeraPrices = VERA_DEFAULT_PRICES,
): { low: number; high: number } {
  const mentionTokens = Math.min(MENTION_BUDGET_TOKENS, mentionCount * MENTION_TOKENS);
  const promptTokens = Math.min(
    VERA_LIMITS.maxInputTokensPerStep,
    SYSTEM_TOKENS + Math.ceil(historyChars / 4) + mentionTokens,
  );
  const low = creditsForUsage({ noCacheInputTokens: promptTokens, cachedInputTokens: 0, outputTokens: LOW_OUTPUT_TOKENS }, prices);
  const high = creditsForUsage(
    {
      noCacheInputTokens: Math.min(VERA_LIMITS.maxInputTokensPerStep, promptTokens * 2),
      cachedInputTokens: 0,
      outputTokens: VERA_EFFORTS[effort].maxOutputTokens,
    },
    prices,
  );
  return { low, high };
}

/** Indonesian decimal comma, as the UI shows it: 0,6. */
export function formatCredits(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function formatCreditRange({ low, high }: { low: number; high: number }): string {
  return `≈ ${formatCredits(low)}–${formatCredits(high)} kredit`;
}
