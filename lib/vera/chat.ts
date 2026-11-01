import "server-only";

import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";
import { VERA_EFFORT_IDS, VERA_EFFORTS, VERA_LIMITS, type VeraEffortId } from "./config";
import { costUsdMicros, creditsFromMicros, settlementCharge, type VeraPrices, type VeraTokenUsage } from "./credits-shared";
import { appendMessages, createConversation, getConversationWithMessages, touchConversation } from "./conversations";
import { VeraError } from "./errors";
import {
  attachReservationConversation,
  getVeraPrices,
  releaseVeraReservation,
  reserveVeraCredits,
  settleVeraUsage,
} from "./ledger";
import { getVeraModel, getVeraModelId } from "./model";
import { buildVeraInstructions, estimateTokens, trimHistory } from "./prompt";
import { collectSources, uniqueSources, type VeraSource } from "./sources/types";
import { createVeraTools } from "./tools";

export const veraChatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.object({
    // Only a request key. The stored id is assigned by the server, so reuse cannot collide.
    id: z.string().min(1).max(64),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(VERA_LIMITS.maxMessageChars) }))
      .length(1),
  }),
  effort: z.enum(VERA_EFFORT_IDS).default("seimbang"),
});

export type VeraChatInput = z.infer<typeof veraChatRequestSchema>;

const STOPPED_PART_TYPE = "data-vera-status";

/** Stream parts the SDK emits itself. Any other part means the provider has started generating output. */
const CONTROL_PART_TYPES = new Set(["start", "start-step", "finish-step", "finish", "abort", "error"]);

type UsageTally = VeraTokenUsage & { reasoningTokens: number; steps: number };

const NO_USAGE: UsageTally = { noCacheInputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, steps: 0 };

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
function ceilingReached(
  steps: Array<{ usage: LanguageModelUsage }>,
  effort: { ceilingCredits: number; maxOutputTokens: number },
  prices: VeraPrices,
) {
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

/** Starts one answer and returns the UI message stream. Ownership is checked and a reservation taken before anything is written. */
export async function runVeraChat({
  studentId,
  input,
  signal,
  now = new Date(),
}: {
  studentId: string;
  input: VeraChatInput;
  signal: AbortSignal;
  now?: Date;
}): Promise<Response> {
  const model = getVeraModel();
  if (!model) {
    throw new VeraError("vera_unavailable", "Vera sedang tidak tersedia. Coba lagi nanti.");
  }

  let history: UIMessage[] = [];
  if (input.conversationId) {
    const conversation = await getConversationWithMessages(studentId, input.conversationId);
    if (!conversation) {
      throw new VeraError("not_found", "Sesi tidak ditemukan.");
    }
    history = conversation.messages;
  }

  const effort = VERA_EFFORTS[input.effort];
  const prices = getVeraPrices();
  // A refused request throws here, before the conversation or the message is written and before the provider is called.
  const { eventId } = await reserveVeraCredits({
    studentId,
    effort: input.effort,
    model: getVeraModelId(),
    conversationId: input.conversationId ?? null,
    now,
  });

  const userMessage: UIMessage = { id: crypto.randomUUID(), role: "user", parts: input.message.parts };
  let conversationId: string;
  let instructions: string;
  let modelMessages: ModelMessage[];
  try {
    conversationId = input.conversationId ?? (await createConversation(studentId));
    if (!input.conversationId) {
      await attachReservationConversation(eventId, conversationId);
    }

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
    const firstName = student?.fullName?.trim().split(/\s+/)[0] || "siswa";
    instructions = buildVeraInstructions({ firstName, now });
    const historyBudget = VERA_LIMITS.maxInputTokensPerStep - estimateTokens(instructions) - effort.maxOutputTokens;
    modelMessages = await convertToModelMessages(
      toModelHistory([...trimHistory(history, Math.max(0, historyBudget)), userMessage]),
    );

    await appendMessages(conversationId, [
      { id: userMessage.id, role: "user", parts: userMessage.parts, createdAt: now },
    ]);
  } catch (error) {
    await releaseVeraReservation({ eventId, errorCode: "setup_failed", now });
    throw error;
  }

  // Usage is tallied per completed step. A step that began generating but was cut off is billed at least the reserve,
  // because the provider bills it once generation starts, even though its token counts never arrived.
  let tally: UsageTally = NO_USAGE;
  let unfinishedStepStarted = false;
  let settled = false;
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

  const result = streamText({
    model,
    instructions,
    messages: modelMessages,
    abortSignal: signal,
    maxOutputTokens: effort.maxOutputTokens,
    maxRetries: 1,
    tools: createVeraTools({ studentId, now }),
    stopWhen: [isStepCount(VERA_LIMITS.maxSteps), ({ steps }) => ceilingReached(steps, effort, prices)],
    providerOptions: {
      openai: { reasoningEffort: effort.openaiReasoningEffort, reasoningSummary: "auto", store: false },
    },
    onChunk: ({ chunk }) => {
      if (!CONTROL_PART_TYPES.has(chunk.type)) unfinishedStepStarted = true;
    },
    onStepEnd: (step) => {
      tally = addStepUsage(tally, step.usage);
      unfinishedStepStarted = false;
    },
    onEnd: () => settleOnce(null),
    onAbort: () => settleOnce("aborted"),
    onError: () => settleOnce("error"),
  });

  const stream = toUIMessageStream({
    stream: result.stream,
    originalMessages: [userMessage],
    generateMessageId: () => crypto.randomUUID(),
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { conversationId, effort: input.effort };
      if (part.type === "finish") return { effort: input.effort, credits: creditsForAnswer() };
      return undefined;
    },
    onError: () => "Vera belum bisa menjawab sekarang. Coba kirim lagi.",
    onEnd: async ({ messages, isAborted, isCancelled }) => {
      await persistAnswer({
        studentId,
        conversationId,
        messages,
        effort: input.effort,
        credits: creditsForAnswer(),
        stopped: isAborted || isCancelled === true,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: consumeStream,
    headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Only text goes back to the model. Reasoning and status parts are display-only. A tool call from an earlier turn becomes one
 * line, since its data already reached the student in that turn's answer.
 */
function toModelHistory(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.flatMap((part): UIMessage["parts"] => {
      if (part.type === "text") return [part];
      if (part.type.startsWith("tool-")) {
        return [{ type: "text", text: `[Alat ${part.type.slice("tool-".length)} dipakai pada giliran sebelumnya.]` }];
      }
      return [];
    }),
  }));
}

/** The links that tool results carried. An answer lists only these, so its sources are what the student can open. */
function sourcesOf(parts: UIMessage["parts"]): VeraSource[] {
  return uniqueSources(collectSources(parts.filter(isToolUIPart).map((part) => part.output)));
}

/**
 * A refused tool call stores no input. The ID the model asked for is not data the student was allowed to read, so only the
 * refusal is kept.
 */
function storedParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.map((part) => (isToolUIPart(part) && isToolRefusal(part.output) ? { ...part, input: {} } : part));
}

/** Readers answer a refused lookup with an error object and nothing else. */
function isToolRefusal(output: unknown) {
  return !!output && typeof output === "object" && Object.keys(output).length === 1 && "error" in output;
}

async function persistAnswer({
  studentId,
  conversationId,
  messages,
  effort,
  credits,
  stopped,
}: {
  studentId: string;
  conversationId: string;
  messages: UIMessage[];
  effort: VeraEffortId;
  credits: number | null;
  stopped: boolean;
}) {
  const answer = [...messages].reverse().find((message) => message.role === "assistant");
  try {
    if (answer) {
      const kept = storedParts(answer.parts);
      const parts: UIMessage["parts"] = stopped
        ? [...kept, { type: STOPPED_PART_TYPE, data: { stopped: true } }]
        : kept;
      await appendMessages(conversationId, [
        { id: answer.id, role: "assistant", parts, effort, credits, sources: sourcesOf(parts), createdAt: new Date() },
      ]);
    }
    await touchConversation(studentId, conversationId);
  } catch (error) {
    serverLogger.error("vera.chat.persist_failed", error, { area: "vera", operation: "persist_answer" });
  }
}
