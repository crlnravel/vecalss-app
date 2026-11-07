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
  removeMessages,
  replaceMessages,
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
import { finalStepControl, trackAnswerUsage } from "./usage-tracker";

// A mention is a source the student pinned with @. The server re-reads each one before it reaches the prompt.
const mentionSchema = z.object({
  type: z.enum(VERA_MENTION_TYPES),
  id: z.string().min(1).max(64),
  // The label the student's menu showed. Kept only for a pin the server refuses.
  label: z.string().max(200).optional(),
});

const messageSchema = z.object({
  // Only a request key. The stored id is assigned by the server, so reuse cannot collide.
  id: z.string().min(1).max(64),
  role: z.literal("user"),
  parts: z
    .array(z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(VERA_LIMITS.maxMessageChars) }))
    .length(1),
});

const effortField = z.enum(VERA_EFFORT_IDS).default("seimbang");
const mentionsField = z.array(mentionSchema).max(VERA_LIMITS.maxMentions).default([]);

const sendRequestSchema = z.object({
  action: z.literal("send"),
  conversationId: z.uuid().optional(),
  message: messageSchema,
  effort: effortField,
  mentions: mentionsField,
});

// Edit replaces one stored user message, and the answer after it, with this message.
const editRequestSchema = z.object({
  action: z.literal("edit"),
  conversationId: z.uuid(),
  userMessageId: z.string().min(1).max(64),
  message: messageSchema,
  effort: effortField,
  mentions: mentionsField,
});

// Regenerate answers again the question before one stored answer. The question's mentions are read from its stored row.
const regenerateRequestSchema = z.object({
  action: z.literal("regenerate"),
  conversationId: z.uuid(),
  assistantMessageId: z.string().min(1).max(64),
  effort: effortField,
});

/** One shape per action, so each action's fields are checked on their own. */
export const veraChatRequestSchema = z.discriminatedUnion("action", [
  sendRequestSchema,
  editRequestSchema,
  regenerateRequestSchema,
]);

export type VeraChatInput = z.infer<typeof veraChatRequestSchema>;
export type VeraSendInput = z.infer<typeof sendRequestSchema>;
type MentionRequest = z.infer<typeof mentionSchema>;
type PinnedSources = Awaited<ReturnType<typeof resolveMentions>>;

/** A request from before the action field existed. It is a send. */
export function parseVeraChatRequest(body: unknown) {
  const withAction = body && typeof body === "object" && !("action" in body) ? { action: "send", ...body } : body;
  return veraChatRequestSchema.safeParse(withAction);
}

const STOPPED_PART_TYPE = "data-vera-status";

/**
 * What one request asks for: the question to answer, the messages before it, and what its stored rows become. The question keeps the id
 * its row is stored under.
 */
type Turn =
  | { kind: "send"; conversationId: string | null; history: UIMessage[]; question: UIMessage; mentions: MentionRequest[] }
  | {
      kind: "edit";
      conversationId: string;
      history: UIMessage[];
      question: UIMessage;
      mentions: MentionRequest[];
      // The edited message and every message after it. The new question takes their place.
      removeIds: string[];
    }
  | {
      kind: "regenerate";
      conversationId: string;
      history: UIMessage[];
      question: UIMessage;
      mentions: MentionRequest[];
      // The answer this run replaces.
      answerId: string;
    };

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

  // Ownership and the last-message rules are checked before anything is reserved or written.
  const turn = await planTurn(studentId, input);

  const effort = VERA_EFFORTS[input.effort];
  const prices = getVeraPrices();
  // A refused request throws here, before any pinned source is read, before anything is written, and before the provider is called.
  const { eventId } = await reserveVeraCredits({
    studentId,
    effort: input.effort,
    model: getVeraModelId(),
    conversationId: turn.conversationId,
    now,
  });

  let conversationId: string;
  let instructions: string;
  let modelMessages: ModelMessage[];
  // The pinned sources the server could open. They are read only after the reservation is taken.
  let mentionSources: VeraSource[] = [];
  // Set only when this request created the session, so a failed setup can take that empty session back out.
  let createdConversationId: string | null = null;
  try {
    // Any failure in this block releases the reservation, so a broken setup never holds the student's limit.
    const pinned = await resolveMentions({ studentId, mentions: turn.mentions, now });
    mentionSources = pinned.accepted.flatMap((mention) => (mention.source ? [mention.source] : []));
    conversationId = turn.conversationId ?? (await createConversation(studentId));
    if (!turn.conversationId) {
      createdConversationId = conversationId;
      await attachReservationConversation(eventId, conversationId);
    }

    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
    const firstName = student?.fullName?.trim().split(/\s+/)[0] || "siswa";
    instructions = buildVeraInstructions({ firstName, now, pinned: pinned.pinned });
    const historyBudget = VERA_LIMITS.maxInputTokensPerStep - estimateTokens(instructions) - effort.maxOutputTokens;
    modelMessages = await convertToModelMessages(
      toModelHistory([...trimHistory(turn.history, Math.max(0, historyBudget)), turn.question]),
    );

    await storeTurn({ conversationId, turn, pinned, now });
  } catch (error) {
    await releaseVeraReservation({ eventId, errorCode: "setup_failed", now });
    if (createdConversationId) await discardEmptyConversation({ studentId, conversationId: createdConversationId });
    throw error;
  }

  let response: Response;
  try {
    // The first step reads the instructions and the model messages, so its input is estimated from both.
    const usage = trackAnswerUsage({
      eventId,
      prices,
      firstStepInputTokens: estimateTokens(instructions + JSON.stringify(modelMessages)),
    });
    const finalStep = finalStepControl({ maxSteps: VERA_LIMITS.maxSteps, effort, prices });
    const result = streamText({
      model,
      instructions,
      messages: modelMessages,
      abortSignal: signal,
      maxOutputTokens: effort.maxOutputTokens,
      maxRetries: 1,
      tools: createVeraTools({ studentId, now }),
      prepareStep: finalStep.prepareStep,
      stopWhen: [isStepCount(VERA_LIMITS.maxSteps), finalStep.stopWhen],
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
      originalMessages: [turn.question],
      generateMessageId: () => crypto.randomUUID(),
      messageMetadata: ({ part }) => {
        // The question's stored id travels with the answer, so the page can match its own copy of the question to the stored one.
        if (part.type === "start") {
          return { conversationId, effort: input.effort, sources: mentionSources, userMessageId: turn.question.id };
        }
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

  // The first answer of a session is titled once the response has finished. Later answers keep the title, and so does an edit.
  if (turn.kind === "send" && !turn.history.some((message) => message.role === "assistant")) {
    scheduleConversationTitle({ studentId, conversationId });
  }
  return response;
}

/**
 * Works out what a request asks for and checks that the student owns it. Edit and regenerate only act on the newest message of their
 * kind, so a stale screen cannot replace an older answer. Nothing is reserved or written until this passes.
 */
async function planTurn(studentId: string, input: VeraChatInput): Promise<Turn> {
  if (input.action === "send") {
    const history = input.conversationId ? await loadHistory(studentId, input.conversationId) : [];
    return {
      kind: "send",
      conversationId: input.conversationId ?? null,
      history,
      question: { id: crypto.randomUUID(), role: "user", parts: input.message.parts },
      mentions: input.mentions,
    };
  }

  const messages = await loadHistory(studentId, input.conversationId);
  if (input.action === "edit") {
    const index = messages.findIndex((message) => message.id === input.userMessageId);
    if (index === -1 || messages[index].role !== "user") {
      throw new VeraError("not_found", "Pesan yang mau diubah sudah tidak ada.");
    }
    if (index !== messages.map((message) => message.role).lastIndexOf("user")) {
      throw new VeraError("not_latest", "Hanya pesan terakhir yang bisa diubah.");
    }
    return {
      kind: "edit",
      conversationId: input.conversationId,
      history: messages.slice(0, index),
      question: { id: crypto.randomUUID(), role: "user", parts: input.message.parts },
      mentions: input.mentions,
      removeIds: messages.slice(index).map((message) => message.id),
    };
  }

  const index = messages.findIndex((message) => message.id === input.assistantMessageId);
  if (index === -1 || messages[index].role !== "assistant") {
    throw new VeraError("not_found", "Jawaban yang mau dibuat ulang sudah tidak ada.");
  }
  if (index !== messages.length - 1) {
    throw new VeraError("not_latest", "Hanya jawaban terakhir yang bisa dibuat ulang.");
  }
  const question = messages[index - 1];
  if (!question || question.role !== "user") {
    throw new VeraError("invalid_request", "Jawaban ini tidak bisa dibuat ulang.");
  }
  return {
    kind: "regenerate",
    conversationId: input.conversationId,
    history: messages.slice(0, index - 1),
    question,
    mentions: storedMentions(question),
    answerId: input.assistantMessageId,
  };
}

async function loadHistory(studentId: string, conversationId: string) {
  const conversation = await getConversationWithMessages(studentId, conversationId);
  if (!conversation) {
    throw new VeraError("not_found", "Sesi tidak ditemukan.");
  }
  return conversation.messages;
}

/** The mentions a question was sent with, read back from its stored row. They are checked again, as they are for any send. */
function storedMentions(question: UIMessage): MentionRequest[] {
  const parsed = z.array(mentionSchema).safeParse((question.metadata as { mentions?: unknown } | undefined)?.mentions ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Writes the request's own rows before the answer streams. Regenerate drops the answer it replaces, and edit replaces its message with the
 * new question. A send only adds its question.
 */
async function storeTurn({
  conversationId,
  turn,
  pinned,
  now,
}: {
  conversationId: string;
  turn: Turn;
  pinned: PinnedSources;
  now: Date;
}) {
  if (turn.kind === "regenerate") {
    await removeMessages({ conversationId, ids: [turn.answerId] });
    return;
  }
  const row = {
    id: turn.question.id,
    role: "user" as const,
    parts: turn.question.parts,
    mentions: [...pinned.accepted, ...pinned.rejected],
    createdAt: now,
  };
  if (turn.kind === "edit") await replaceMessages({ conversationId, removeIds: turn.removeIds, next: row });
  else await appendMessages(conversationId, [row]);
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
