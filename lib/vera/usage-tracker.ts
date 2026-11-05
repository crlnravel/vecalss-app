import "server-only";

import type { LanguageModelUsage } from "ai";

import { serverLogger } from "@/lib/server-logger";
import { VERA_LIMITS } from "./config";
import { costUsdMicros, creditsFromMicros, settlementCharge, type VeraPrices, type VeraTokenUsage } from "./credits-shared";
import { releaseVeraReservation, settleVeraUsage } from "./ledger";

/** Stream parts the SDK emits itself. Any other part means the provider has started generating output. */
const CONTROL_PART_TYPES = new Set(["start", "start-step", "finish-step", "finish", "abort", "error"]);

/** The stream part fields the tracker reads: the text of a delta, the input of a tool call, and a tool's result. */
type StreamPart = { type: string; text?: unknown; delta?: unknown; output?: unknown };

type UsageTally = VeraTokenUsage & { reasoningTokens: number; steps: number };

const NO_USAGE: UsageTally = { noCacheInputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, steps: 0 };

/** The part of an effort that the usage rules read. */
export type UsageLimits = { ceilingCredits: number; maxOutputTokens: number };

/** How a generation ended. A Studio document is marked complete only when its outcome is "completed". */
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
 * The most input the next step can read, from the steps before it. A step reads everything the last step read and wrote, plus up to
 * one step's worth of tool output. The first step reads at most the per-step input budget.
 */
function nextStepInputTokens(steps: Array<{ usage: LanguageModelUsage }>) {
  const last = steps.at(-1)?.usage;
  return last
    ? (last.inputTokens ?? 0) + (last.outputTokens ?? 0) + VERA_LIMITS.maxToolOutputTokensPerStep
    : VERA_LIMITS.maxInputTokensPerStep;
}

/**
 * Decides how a run ends, and that it ends with written text. Every step before the last may use tools. The last step is the step at
 * `maxSteps`, or the first step after which another step might no longer fit under the ceiling. That step runs with tools off, so the
 * model has to write its answer. A run stops once that step is done, or when not even one more worst-case step fits.
 *
 * A tool step runs only if the step after it still fits. Its input can grow by one step's output and tool output, so the check uses a
 * worst case one step further on. Once a step has run, the next one therefore fits under the ceiling, and so does the final step.
 */
export function finalStepControl({ maxSteps, effort, prices }: { maxSteps: number; effort: UsageLimits; prices: VeraPrices }) {
  const ceilingMicros = effort.ceilingCredits * VERA_LIMITS.microUsdPerCredit;
  const worstStepMicros = (steps: Array<{ usage: LanguageModelUsage }>, extraInputTokens: number) =>
    costUsdMicros(
      {
        noCacheInputTokens: nextStepInputTokens(steps) + extraInputTokens,
        cachedInputTokens: 0,
        outputTokens: effort.maxOutputTokens,
      },
      prices,
    );
  let finalStepNumber: number | null = null;
  return {
    prepareStep: ({ stepNumber, steps }: { stepNumber: number; steps: Array<{ usage: LanguageModelUsage }> }) => {
      const spentMicros = costUsdMicros(tallyOf(steps), prices);
      const nextMicros = worstStepMicros(steps, 0);
      const stepAfterNextMicros = worstStepMicros(steps, effort.maxOutputTokens + VERA_LIMITS.maxToolOutputTokensPerStep);
      if (stepNumber < maxSteps - 1 && spentMicros + nextMicros + stepAfterNextMicros <= ceilingMicros) return {};
      finalStepNumber = stepNumber;
      return { toolChoice: "none" as const, activeTools: [] };
    },
    stopWhen: ({ steps }: { steps: Array<{ usage: LanguageModelUsage }> }) => {
      if (finalStepNumber !== null && steps.length > finalStepNumber) return true;
      return costUsdMicros(tallyOf(steps), prices) + worstStepMicros(steps, 0) > ceilingMicros;
    },
  };
}

function lengthOf(value: unknown) {
  return typeof value === "string" ? value.length : 0;
}

/** Output a stream part adds to the step that streams it: a text or reasoning delta, or a tool call's input as it is written. */
function streamedOutputChars(part: StreamPart) {
  if (part.type === "text-delta" || part.type === "reasoning-delta") return lengthOf(part.text);
  if (part.type === "tool-input-delta") return lengthOf(part.delta);
  return 0;
}

/** The characters of a tool result as JSON, which is the text the next step reads back. */
function resultChars(output: unknown) {
  try {
    return (JSON.stringify(output) ?? "").length;
  } catch {
    return 0;
  }
}

/**
 * Tracks one generation's usage and settles its reservation exactly once, however the stream ends. A completed step is charged what the
 * provider reported. A step that streamed output and was then cut off is charged an estimate instead: its input, and the output it
 * streamed at about four characters a token. The input is the step before it, with that step's output and tool results, or the caller's
 * estimate for the first step. Chat and Studio share these rules.
 */
export function trackAnswerUsage({
  eventId,
  effort,
  prices,
  firstStepInputTokens,
}: {
  eventId: string;
  effort: UsageLimits;
  prices: VeraPrices;
  /** The first step's input, estimated from its instructions and model messages. */
  firstStepInputTokens: number;
}) {
  let tally: UsageTally = NO_USAGE;
  // Set once the step in progress streams anything but the SDK's control parts, and cleared when that step completes.
  let unfinishedStepStarted = false;
  // Output the step in progress has streamed, and the tool results it has produced, both in characters.
  let streamedChars = 0;
  let toolResultChars = 0;
  // The last completed step. The step after it reads that step's input, its output, and its tool results.
  let previousStep: { inputTokens: number; outputTokens: number; toolResultChars: number } | null = null;
  let settled = false;
  let outcome: AnswerOutcome = null;

  /** The cut-off step's usage, estimated from what it streamed. Null when it streamed nothing. */
  const cutOffUsage = (): VeraTokenUsage | null => {
    if (!unfinishedStepStarted) return null;
    const inputTokens = previousStep
      ? previousStep.inputTokens + previousStep.outputTokens + Math.ceil(previousStep.toolResultChars / 4)
      : firstStepInputTokens;
    return { noCacheInputTokens: inputTokens, cachedInputTokens: 0, outputTokens: Math.ceil(streamedChars / 4) };
  };
  const chargeForAnswer = () => {
    const cutOff = cutOffUsage();
    return settlementCharge({
      actualMicros: costUsdMicros(tally, prices),
      completedSteps: tally.steps,
      cutOffMicros: cutOff ? costUsdMicros(cutOff, prices) : null,
    });
  };
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
        // The charge includes an estimate for the cut-off step. The token columns keep the completed steps only.
        await settleVeraUsage({ eventId, usage: tally, chargedMicros: charge.chargedMicros, errorCode });
      }
    } catch (error) {
      serverLogger.error("vera.usage.settle_failed", error, { area: "vera", operation: "settle_usage" });
    }
  };

  return {
    creditsForAnswer,
    outcome: () => outcome,
    onChunk: ({ chunk }: { chunk: StreamPart }) => {
      // Once settled, the charge is fixed, so later parts change nothing.
      if (settled) return;
      if (!CONTROL_PART_TYPES.has(chunk.type)) unfinishedStepStarted = true;
      streamedChars += streamedOutputChars(chunk);
      if (chunk.type === "tool-result") toolResultChars += resultChars(chunk.output);
    },
    onStepEnd: (step: { usage: LanguageModelUsage }) => {
      // Once settled, the charge is fixed. The SDK still finishes the step after an error, and that step is not billed again.
      if (settled) return;
      tally = addStepUsage(tally, step.usage);
      previousStep = {
        inputTokens: step.usage?.inputTokens ?? 0,
        outputTokens: step.usage?.outputTokens ?? 0,
        toolResultChars,
      };
      streamedChars = 0;
      toolResultChars = 0;
      unfinishedStepStarted = false;
    },
    onEnd: () => {
      // The SDK also ends the stream after an error part, so an outcome already recorded stays as it is.
      if (outcome === null) outcome = "completed";
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
