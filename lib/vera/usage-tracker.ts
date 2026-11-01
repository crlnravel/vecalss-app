import "server-only";

import type { LanguageModelUsage } from "ai";

import { serverLogger } from "@/lib/server-logger";
import { VERA_LIMITS } from "./config";
import { costUsdMicros, creditsFromMicros, settlementCharge, type VeraPrices, type VeraTokenUsage } from "./credits-shared";
import { releaseVeraReservation, settleVeraUsage } from "./ledger";

/** Stream parts the SDK emits itself. Any other part means the provider has started generating output. */
const CONTROL_PART_TYPES = new Set(["start", "start-step", "finish-step", "finish", "abort", "error"]);

type UsageTally = VeraTokenUsage & { reasoningTokens: number; steps: number };

const NO_USAGE: UsageTally = { noCacheInputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, steps: 0 };

/** The part of an effort that the usage rules read. */
export type UsageLimits = { reserveCredits: number; ceilingCredits: number; maxOutputTokens: number };

/** How a generation ended. Only a completed one is saved as a message or a document. */
export type AnswerOutcome = "completed" | "aborted" | "failed" | null;

function addStepUsage(tally: UsageTally, usage: LanguageModelUsage | undefined): UsageTally {
  const input = usage?.inputTokens ?? 0;
  const cached = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
  return {
    noCacheInputTokens:
      tally.noCacheInputTokens + (usage?.inputTokenDetails?.noCacheTokens ?? Math.max(0, input - cached)),
    cachedInputTokens: tally.cachedInputTokens + cached,
    outputTokens: tally.outputTokens + (usage?.outputTokens ?? 0),
    reasoningTokens: tally.reasoningTokens + (usage?.outputTokenDetails?.reasoningTokens ?? 0),
    steps: tally.steps + 1,
  };
}

function tallyOf(steps: Array<{ usage: LanguageModelUsage }>): UsageTally {
  return steps.reduce((tally, step) => addStepUsage(tally, step.usage), NO_USAGE);
}

/**
 * Stops before the next step could carry the answer past its ceiling. A step after a tool call reads everything the last step
 * read and wrote, plus up to one step's worth of tool output, and it may use its full output cap.
 */
export function ceilingReached(steps: Array<{ usage: LanguageModelUsage }>, effort: UsageLimits, prices: VeraPrices) {
  const ceilingMicros = effort.ceilingCredits * VERA_LIMITS.microUsdPerCredit;
  const last = steps.at(-1)?.usage;
  const nextInputTokens = last
    ? (last.inputTokens ?? 0) + (last.outputTokens ?? 0) + VERA_LIMITS.maxToolOutputTokensPerStep
    : VERA_LIMITS.maxInputTokensPerStep;
  const worstStepMicros = costUsdMicros(
    { noCacheInputTokens: nextInputTokens, cachedInputTokens: 0, outputTokens: effort.maxOutputTokens },
    prices,
  );
  return costUsdMicros(tallyOf(steps), prices) >= ceilingMicros - worstStepMicros;
}

/**
 * Tracks one generation's usage and settles its reservation exactly once, however the stream ends. Usage is tallied per completed
 * step. A step that began generating but was cut off is billed at least the reserve, because the provider bills it once generation
 * starts, even though its token counts never arrived. Chat and Studio share these rules.
 */
export function trackAnswerUsage({ eventId, effort, prices }: { eventId: string; effort: UsageLimits; prices: VeraPrices }) {
  let tally: UsageTally = NO_USAGE;
  let unfinishedStepStarted = false;
  let settled = false;
  let outcome: AnswerOutcome = null;

  const chargeForAnswer = () =>
    settlementCharge({
      actualMicros: costUsdMicros(tally, prices),
      completedSteps: tally.steps,
      unfinishedStepStarted,
      reserveCredits: effort.reserveCredits,
    });
  const creditsForAnswer = () => {
    const charge = chargeForAnswer();
    return charge.kind === "release" ? null : creditsFromMicros(charge.chargedMicros);
  };
  const settleOnce = async (errorCode: string | null) => {
    if (settled) return;
    settled = true;
    try {
      const charge = chargeForAnswer();
      if (charge.kind === "release") {
        await releaseVeraReservation({ eventId, errorCode: errorCode ?? "no_output" });
      } else {
        await settleVeraUsage({ eventId, usage: tally, chargedMicros: charge.chargedMicros, errorCode });
      }
    } catch (error) {
      serverLogger.error("vera.usage.settle_failed", error, { area: "vera", operation: "settle_usage" });
    }
  };

  return {
    creditsForAnswer,
    outcome: () => outcome,
    stopWhen: ({ steps }: { steps: Array<{ usage: LanguageModelUsage }> }) => ceilingReached(steps, effort, prices),
    onChunk: ({ chunk }: { chunk: { type: string } }) => {
      if (!CONTROL_PART_TYPES.has(chunk.type)) unfinishedStepStarted = true;
    },
    onStepEnd: (step: { usage: LanguageModelUsage }) => {
      tally = addStepUsage(tally, step.usage);
      unfinishedStepStarted = false;
    },
    onEnd: () => {
      outcome = "completed";
      return settleOnce(null);
    },
    onAbort: () => {
      outcome = "aborted";
      return settleOnce("aborted");
    },
    onError: () => {
      outcome = "failed";
      return settleOnce("error");
    },
  };
}
