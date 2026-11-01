import "server-only";

import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";
import { VERA_EFFORT_IDS, VERA_EFFORTS, VERA_LIMITS, type VeraEffortId } from "./config";
import {
  appendMessages,
  createConversation,
  getConversationWithMessages,
  touchConversation,
} from "./conversations";
import { VeraError } from "./errors";
import { getVeraModel } from "./model";
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

/** Starts one answer and returns the UI message stream. Ownership is checked before anything is written. */
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
  const conversationId = input.conversationId ?? (await createConversation(studentId));

  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
  const firstName = student?.fullName?.trim().split(/\s+/)[0] || "siswa";
  const effort = VERA_EFFORTS[input.effort];
  const userMessage: UIMessage = { id: crypto.randomUUID(), role: "user", parts: input.message.parts };
  const instructions = buildVeraInstructions({ firstName, now });
  const historyBudget = VERA_LIMITS.maxInputTokensPerStep - estimateTokens(instructions) - effort.maxOutputTokens;
  const modelMessages = await convertToModelMessages(
    toModelHistory([...trimHistory(history, Math.max(0, historyBudget)), userMessage]),
  );

  await appendMessages(conversationId, [
    { id: userMessage.id, role: "user", parts: userMessage.parts, createdAt: now },
  ]);

  const result = streamText({
    model,
    instructions,
    messages: modelMessages,
    abortSignal: signal,
    maxOutputTokens: effort.maxOutputTokens,
    maxRetries: 1,
    stopWhen: isStepCount(VERA_LIMITS.maxSteps),
    providerOptions: {
      openai: { reasoningEffort: effort.openaiReasoningEffort, reasoningSummary: "auto", store: false },
    },
  });

  const stream = toUIMessageStream({
    stream: result.stream,
    originalMessages: [userMessage],
    generateMessageId: () => crypto.randomUUID(),
    messageMetadata: ({ part }) => (part.type === "start" ? { conversationId, effort: input.effort } : undefined),
    onError: () => "Vera belum bisa menjawab sekarang. Coba kirim lagi.",
    onEnd: async ({ messages, isAborted, isCancelled }) => {
      await persistAnswer({
        studentId,
        conversationId,
        messages,
        effort: input.effort,
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
  stopped,
}: {
  studentId: string;
  conversationId: string;
  messages: UIMessage[];
  effort: VeraEffortId;
  stopped: boolean;
}) {
  const answer = [...messages].reverse().find((message) => message.role === "assistant");
  try {
    if (answer) {
      const parts: UIMessage["parts"] = stopped
        ? [...answer.parts, { type: STOPPED_PART_TYPE, data: { stopped: true } }]
        : answer.parts;
      await appendMessages(conversationId, [
        { id: answer.id, role: "assistant", parts, effort, createdAt: new Date() },
      ]);
    }
    await touchConversation(studentId, conversationId);
  } catch (error) {
    serverLogger.error("vera.chat.persist_failed", error, { area: "vera", operation: "persist_answer" });
  }
}
