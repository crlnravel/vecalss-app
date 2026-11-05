import "server-only";

import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";
import { VERA_EFFORT_IDS, VERA_EFFORTS, VERA_LIMITS, type VeraEffortId } from "./config";
import {
  appendMessages,
  createConversation,
  discardEmptyConversation,
  getConversationWithMessages,
  touchConversation,
} from "./conversations";
import { VeraError } from "./errors";
import {
  attachReservationConversation,
  getVeraPrices,
  releaseVeraReservation,
  reserveVeraCredits,
} from "./ledger";
import { getVeraModel, getVeraModelId } from "./model";
import { buildVeraInstructions, estimateTokens, trimHistory } from "./prompt";
import { resolveMentions } from "./sources/mentions";
import { collectSources, uniqueSources, VERA_MENTION_TYPES, type VeraSource } from "./sources/types";
import { createVeraTools } from "./tools";
import { scheduleConversationTitle } from "./titles";
import { trackAnswerUsage } from "./usage-tracker";

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
  // Sources the student pinned with @. The server re-reads each one before it reaches the prompt.
  mentions: z
    .array(
      z.object({
        type: z.enum(VERA_MENTION_TYPES),
        id: z.string().min(1).max(64),
        // The label the student's menu showed. Kept only for a pin the server refuses.
        label: z.string().max(200).optional(),
      }),
    )
    .max(VERA_LIMITS.maxMentions)
    .default([]),
});

export type VeraChatInput = z.infer<typeof veraChatRequestSchema>;

const STOPPED_PART_TYPE = "data-vera-status";

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
  // A refused request throws here, before any pinned source is read, before anything is written, and before the provider is called.
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
  // The pinned sources the server could open. They are read only after the reservation is taken.
  let mentionSources: VeraSource[] = [];
  // Set only when this request created the session, so a failed setup can take that empty session back out.
  let createdConversationId: string | null = null;
  try {
    // Any failure in this block releases the reservation, so a broken setup never holds the student's limit.
    const pinned = await resolveMentions({ studentId, mentions: input.mentions, now });
    mentionSources = pinned.accepted.flatMap((mention) => (mention.source ? [mention.source] : []));
    conversationId = input.conversationId ?? (await createConversation(studentId));
    if (!input.conversationId) {
      createdConversationId = conversationId;
      await attachReservationConversation(eventId, conversationId);
    }

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
    const firstName = student?.fullName?.trim().split(/\s+/)[0] || "siswa";
    instructions = buildVeraInstructions({ firstName, now, pinned: pinned.pinned });
    const historyBudget = VERA_LIMITS.maxInputTokensPerStep - estimateTokens(instructions) - effort.maxOutputTokens;
    modelMessages = await convertToModelMessages(
      toModelHistory([...trimHistory(history, Math.max(0, historyBudget)), userMessage]),
    );

    await appendMessages(conversationId, [
      {
        id: userMessage.id,
        role: "user",
        parts: userMessage.parts,
        mentions: [...pinned.accepted, ...pinned.rejected],
        createdAt: now,
      },
    ]);
  } catch (error) {
    await releaseVeraReservation({ eventId, errorCode: "setup_failed", now });
    if (createdConversationId) await discardEmptyConversation({ studentId, conversationId: createdConversationId });
    throw error;
  }

  let response: Response;
  try {
    const usage = trackAnswerUsage({ eventId, effort, prices });
    const result = streamText({
      model,
      instructions,
      messages: modelMessages,
      abortSignal: signal,
      maxOutputTokens: effort.maxOutputTokens,
      maxRetries: 1,
      tools: createVeraTools({ studentId, now }),
      stopWhen: [isStepCount(VERA_LIMITS.maxSteps), usage.stopWhen],
      providerOptions: {
        openai: { reasoningEffort: effort.openaiReasoningEffort, reasoningSummary: "auto", store: false },
      },
      onChunk: usage.onChunk,
      onStepEnd: usage.onStepEnd,
      onEnd: usage.onEnd,
      onAbort: usage.onAbort,
      onError: usage.onError,
    });

    const stream = toUIMessageStream({
      stream: result.stream,
      originalMessages: [userMessage],
      generateMessageId: () => crypto.randomUUID(),
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { conversationId, effort: input.effort, sources: mentionSources };
        if (part.type === "finish") return { effort: input.effort, credits: usage.creditsForAnswer() };
        return undefined;
      },
      onError: () => "Vera belum bisa menjawab sekarang. Coba kirim lagi.",
      onEnd: async ({ messages, isAborted, isCancelled }) => {
        await persistAnswer({
          studentId,
          conversationId,
          messages,
          effort: input.effort,
          credits: usage.creditsForAnswer(),
          stopped: isAborted || isCancelled === true,
          mentionSources,
        });
      },
    });

    response = createUIMessageStreamResponse({
      stream,
      consumeSseStream: consumeStream,
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    // The stream never started, so nothing else will settle the reservation. Release it here.
    await releaseVeraReservation({ eventId, errorCode: "setup_failed", now });
    if (createdConversationId) await discardEmptyConversation({ studentId, conversationId: createdConversationId });
    throw error;
  }

  // The first answer of a session is titled once the response has finished. Later answers keep the title.
  if (!history.some((message) => message.role === "assistant")) {
    scheduleConversationTitle({ studentId, conversationId });
  }
  return response;
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
  mentionSources,
}: {
  studentId: string;
  conversationId: string;
  messages: UIMessage[];
  effort: VeraEffortId;
  credits: number | null;
  stopped: boolean;
  mentionSources: VeraSource[];
}) {
  const answer = [...messages].reverse().find((message) => message.role === "assistant");
  try {
    if (answer) {
      const kept = storedParts(answer.parts);
      const parts: UIMessage["parts"] = stopped
        ? [...kept, { type: STOPPED_PART_TYPE, data: { stopped: true } }]
        : kept;
      const sources = uniqueSources([...mentionSources, ...sourcesOf(parts)]);
      await appendMessages(conversationId, [
        { id: answer.id, role: "assistant", parts, effort, credits, sources, createdAt: new Date() },
      ]);
    }
    await touchConversation(studentId, conversationId);
  } catch (error) {
    serverLogger.error("vera.chat.persist_failed", error, { area: "vera", operation: "persist_answer" });
  }
}
