import "server-only";

import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
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
import {
  keepToolLinks,
  STUDIO_DOCUMENT_PART,
  STUDIO_REQUEST_PART,
  STUDIO_WRITE_TOOLS,
  studioModelText,
  studioOptionsSchema,
  studioTitle,
  studioToolOfWrite,
  type StudioOptions,
} from "./studio";
import { saveStudioDocument } from "./studio-documents";
import { createVeraTools, type StudioWrite } from "./tools";
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
  // A Studio request from the start screen or its options dialog. The message text is the sentence the student sees.
  studio: studioOptionsSchema.optional(),
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
 * its row is stored under. A Studio request carries its options, which the model reads in place of the student's sentence.
 */
type Turn =
  | {
      kind: "send";
      conversationId: string | null;
      history: UIMessage[];
      question: UIMessage;
      mentions: MentionRequest[];
      studio: StudioOptions | null;
    }
  | {
      kind: "edit";
      conversationId: string;
      history: UIMessage[];
      question: UIMessage;
      mentions: MentionRequest[];
      // The edited message and every message after it. The new question takes their place.
      removeIds: string[];
      studio: null;
    }
  | {
      kind: "regenerate";
      conversationId: string;
      history: UIMessage[];
      question: UIMessage;
      mentions: MentionRequest[];
      // The answer this run replaces.
      answerId: string;
      studio: StudioOptions | null;
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
      toModelHistory([...trimHistory(turn.history, Math.max(0, historyBudget)), modelQuestion(turn)]),
    );

    await storeTurn({ conversationId, turn, pinned, now });
  } catch (error) {
    await releaseVeraReservation({ eventId, errorCode: "setup_failed", now });
    if (createdConversationId) await discardEmptyConversation({ studentId, conversationId: createdConversationId });
    throw error;
  }

  // The Studio tool a Studio request names is the first step's only option. Once a Studio tool has been called, the turn writes its
  // document with Mendalam's output room, ceiling, and step count. The reservation stays the chosen effort's.
  const forcedTool = turn.studio ? STUDIO_WRITE_TOOLS[turn.studio.tool] : null;
  const chatControl = finalStepControl({ maxSteps: VERA_LIMITS.maxSteps, effort, prices });
  const studioControl = finalStepControl({ maxSteps: VERA_LIMITS.studioMaxSteps, effort: VERA_EFFORTS.mendalam, prices });
  // The last Studio tool the turn called. Its document is the answer the turn saves.
  let studioWrite: StudioWrite | null = null;
  // The reason the model stopped. A document cut off for room is not complete.
  let finishReason: string | undefined;

  let response: Response;
  try {
    // The first step reads the instructions and the model messages, so its input is estimated from both.
    const usage = trackAnswerUsage({
      eventId,
      prices,
      firstStepInputTokens: estimateTokens(instructions + JSON.stringify(modelMessages)),
    });
    const result = streamText({
      model,
      instructions,
      messages: modelMessages,
      abortSignal: signal,
      maxOutputTokens: effort.maxOutputTokens,
      maxRetries: 1,
      tools: createVeraTools({
        studentId,
        now,
        // The options the student chose. A write tool of the same kind writes them, not the arguments the model passed.
        chosen: turn.studio,
        onWrite: (write) => {
          studioWrite = write;
        },
      }),
      prepareStep: (step) => {
        const studio = isStudioTurn(step.steps);
        return {
          ...(studio ? studioControl : chatControl).prepareStep(step),
          ...(studio ? { maxOutputTokens: VERA_EFFORTS.mendalam.maxOutputTokens } : {}),
          ...(step.stepNumber === 0 && forcedTool ? { toolChoice: { type: "tool" as const, toolName: forcedTool } } : {}),
        };
      },
      stopWhen: [
        ({ steps }) => steps.length >= (isStudioTurn(steps) ? VERA_LIMITS.studioMaxSteps : VERA_LIMITS.maxSteps),
        (options) => (isStudioTurn(options.steps) ? studioControl : chatControl).stopWhen(options),
      ],
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
        if (part.type === "finish") {
          finishReason = (part as { finishReason?: string }).finishReason;
          // The document this turn wrote is named here, so its card can open it as soon as the answer finishes.
          const studio = studioWrite
            ? { documentId: studioWrite.documentId, complete: finishReason !== "length" }
            : undefined;
          return { effort: input.effort, credits: usage.creditsForAnswer(), finishReason, studio };
        }
        return undefined;
      },
      onError: () => "Vera belum bisa menjawab sekarang. Coba kirim lagi.",
      onEnd: async ({ messages, isAborted, isCancelled }) => {
        await persistAnswer({
          studentId,
          eventId,
          conversationId,
          messages,
          effort: input.effort,
          credits: usage.creditsForAnswer(),
          stopped: isAborted || isCancelled === true,
          mentionSources,
          studio: studioWrite,
          complete: usage.outcome() === "completed" && finishReason !== "length",
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
    const studio = input.studio ?? null;
    return {
      kind: "send",
      conversationId: input.conversationId ?? null,
      history,
      question: { id: crypto.randomUUID(), role: "user", parts: questionParts(input.message.parts, studio) },
      mentions: input.mentions,
      studio,
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
    if (storedStudioOf(messages[index])) {
      throw new VeraError("invalid_request", "Permintaan Studio tidak bisa diubah. Kirim permintaan baru dari kartu Studio.");
    }
    return {
      kind: "edit",
      conversationId: input.conversationId,
      history: messages.slice(0, index),
      question: { id: crypto.randomUUID(), role: "user", parts: input.message.parts },
      mentions: input.mentions,
      removeIds: messages.slice(index).map((message) => message.id),
      studio: null,
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
    studio: storedStudioOf(question),
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

/** A question's parts: the sentence the student sees, and for a Studio request the request itself, which Ulangi reads back. */
function questionParts(text: UIMessage["parts"], studio: StudioOptions | null): UIMessage["parts"] {
  return studio ? [...text, { type: STUDIO_REQUEST_PART, data: studio }] : text;
}

/** The Studio request a stored question carries, or null for an ordinary question. */
function storedStudioOf(message: UIMessage): StudioOptions | null {
  const part = message.parts.find((candidate) => candidate.type === STUDIO_REQUEST_PART);
  const parsed = studioOptionsSchema.safeParse(part && "data" in part ? part.data : undefined);
  return parsed.success ? parsed.data : null;
}

/** The question the model answers. A Studio request reads its own sentence and options, not the student's bubble text. */
function modelQuestion(turn: Turn): UIMessage {
  return turn.studio ? { ...turn.question, parts: [{ type: "text", text: studioModelText(turn.studio) }] } : turn.question;
}

/** A turn is a Studio turn once it has called one of the Studio write tools. */
function isStudioTurn(steps: ReadonlyArray<{ toolCalls: ReadonlyArray<{ toolName: string }> }>) {
  return steps.some((step) => step.toolCalls.some((call) => studioToolOfWrite(call.toolName) !== null));
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

/** The text an answer wrote, in order, with the paragraphs between its parts. */
function answerText(parts: UIMessage["parts"]) {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();
}

async function persistAnswer({
  studentId,
  eventId,
  conversationId,
  messages,
  effort,
  credits,
  stopped,
  mentionSources,
  studio,
  complete,
}: {
  studentId: string;
  eventId: string;
  conversationId: string;
  messages: UIMessage[];
  effort: VeraEffortId;
  credits: number | null;
  stopped: boolean;
  mentionSources: VeraSource[];
  // The Studio tool the turn wrote with, if it called one.
  studio: StudioWrite | null;
  complete: boolean;
}) {
  const answer = [...messages].reverse().find((message) => message.role === "assistant");
  try {
    if (answer) {
      const kept = storedParts(answer.parts);
      let parts: UIMessage["parts"] = stopped
        ? [...kept, { type: STOPPED_PART_TYPE, data: { stopped: true } }]
        : kept;
      // A Studio answer is saved as its document, and the answer keeps a pointer to it. A turn that wrote no text saves nothing.
      const pointer = studio
        ? await saveTurnDocument({ studentId, eventId, studio, text: answerText(kept), sources: sourcesOf(kept), credits, complete })
        : null;
      if (pointer) parts = [...parts, pointer];
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

/**
 * Saves a Studio answer as its document and links the usage event that paid for it to that document. Returns the pointer the answer keeps,
 * or null when nothing was saved.
 */
async function saveTurnDocument({
  studentId,
  eventId,
  studio,
  text,
  sources,
  credits,
  complete,
}: {
  studentId: string;
  eventId: string;
  studio: StudioWrite;
  text: string;
  sources: VeraSource[];
  credits: number | null;
  complete: boolean;
}): Promise<UIMessage["parts"][number] | null> {
  if (!text) return null;
  try {
    await saveStudioDocument({
      id: studio.documentId,
      studentId,
      tool: studio.tool,
      title: studioTitle(studio.tool, new Date()),
      markdown: keepToolLinks(text, sources),
      sources,
      input: studio.input,
      credits: credits ?? 0,
      complete,
    });
    await prisma.veraUsageEvent.update({ where: { id: eventId }, data: { studioDocumentId: studio.documentId } });
    return { type: STUDIO_DOCUMENT_PART, data: { documentId: studio.documentId, tool: studio.tool, complete } };
  } catch (error) {
    serverLogger.error("vera.studio.save_failed", error, { area: "vera", operation: "save_studio_document" });
    return null;
  }
}
