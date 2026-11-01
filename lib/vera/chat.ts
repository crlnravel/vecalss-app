import "server-only";

import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
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
import { costUsdMicros, creditsFromMicros, type VeraPrices, type VeraTokenUsage } from "./credits-shared";
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

/** Stops before another step could carry the answer past its ceiling, assuming that step uses its full caps. */
function ceilingReached(
  steps: Array<{ usage: LanguageModelUsage }>,
  effort: { ceilingCredits: number; maxOutputTokens: number },
  prices: VeraPrices,
) {
  const ceilingMicros = effort.ceilingCredits * VERA_LIMITS.microUsdPerCredit;
  const worstStepMicros = costUsdMicros(
    { noCacheInputTokens: VERA_LIMITS.maxInputTokensPerStep, cachedInputTokens: 0, outputTokens: effort.maxOutputTokens },
    prices,
  );
  return costUsdMicros(tallyOf(steps), prices) >= ceilingMicros - worstStepMicros;
}

function answerCredits(tally: UsageTally, prices: VeraPrices): number | null {
  return tally.steps > 0 ? creditsFromMicros(costUsdMicros(tally, prices)) : null;
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

  // Usage is tallied per step, so an error or an abort still settles with the usage that was spent.
  let tally: UsageTally = NO_USAGE;
  let settled = false;
  const settleOnce = async (errorCode: string | null) => {
    if (settled) return;
    settled = true;
    try {
      if (tally.steps === 0) {
        await releaseVeraReservation({ eventId, errorCode: errorCode ?? "no_usage" });
      } else {
        await settleVeraUsage({ eventId, usage: tally });
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
    stopWhen: [isStepCount(VERA_LIMITS.maxSteps), ({ steps }) => ceilingReached(steps, effort, prices)],
    providerOptions: {
      openai: { reasoningEffort: effort.openaiReasoningEffort, reasoningSummary: "auto", store: false },
    },
    onStepEnd: (step) => {
      tally = addStepUsage(tally, step.usage);
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
      if (part.type === "finish") return { effort: input.effort, credits: answerCredits(tally, prices) };
      return undefined;
    },
    onError: () => "Vera belum bisa menjawab sekarang. Coba kirim lagi.",
    onEnd: async ({ messages, isAborted, isCancelled }) => {
      await persistAnswer({
        studentId,
        conversationId,
        messages,
        effort: input.effort,
        credits: answerCredits(tally, prices),
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

/** Reasoning and status parts are display-only, so only text goes back to the model. */
function toModelHistory(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({ ...message, parts: message.parts.filter((part) => part.type === "text") }));
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
      const parts: UIMessage["parts"] = stopped
        ? [...answer.parts, { type: STOPPED_PART_TYPE, data: { stopped: true } }]
        : answer.parts;
      await appendMessages(conversationId, [
        { id: answer.id, role: "assistant", parts, effort, credits, createdAt: new Date() },
      ]);
    }
    await touchConversation(studentId, conversationId);
  } catch (error) {
    serverLogger.error("vera.chat.persist_failed", error, { area: "vera", operation: "persist_answer" });
  }
}
