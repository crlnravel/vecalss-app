import "server-only";

import { generateText, type LanguageModelUsage, type UIMessage } from "ai";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";
import { VERA_CONVERSATION_TITLE } from "./config";
import { costUsdMicros, type VeraTokenUsage } from "./credits-shared";
import { getVeraPrices } from "./ledger";
import { getVeraModel, getVeraModelId } from "./model";

const TITLE_CHARS = 60;
const TITLE_OUTPUT_TOKENS = 30;
const CONTEXT_CHARS = 600;
const TITLE_INSTRUCTIONS = [
  "Tulis judul singkat untuk percakapan belajar ini dalam bahasa Indonesia.",
  "Maksimal 6 kata. Tanpa tanda kutip dan tanpa titik di akhir.",
  "Balas hanya judulnya.",
].join("\n");

function textOf(parts: unknown) {
  return (parts as UIMessage["parts"]).map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** One line, no quotes and no closing full stop, at most 60 characters. */
export function cleanTitle(raw: string): string | null {
  const line = raw
    .replace(/\s+/gu, " ")
    .replace(/^["'“”‘’\s]+|["'“”‘’.\s]+$/gu, "")
    .trim();
  return line ? line.slice(0, TITLE_CHARS).trim() : null;
}

function tokensOf(usage: LanguageModelUsage): VeraTokenUsage {
  const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const input = usage.inputTokens ?? 0;
  return {
    noCacheInputTokens: usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, input - cached),
    cachedInputTokens: cached,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/**
 * Titles a session from its first question and answer. The title call costs no credits, so it is logged as a settled title event
 * with zero credits. A failure keeps the default title and reaches no one. A title the student already changed is left alone.
 */
export async function titleConversation({
  studentId,
  conversationId,
  now = new Date(),
}: {
  studentId: string;
  conversationId: string;
  now?: Date;
}): Promise<string | null> {
  try {
    const model = getVeraModel();
    const session = await prisma.veraConversation.findFirst({
      where: { id: conversationId, studentId, title: VERA_CONVERSATION_TITLE },
      select: { id: true },
    });
    if (!model || !session) return null;

    // Only the first answer earns a title: exactly one answer may exist, and the first message is the student's question.
    const answers = await prisma.veraMessage.count({ where: { conversationId, role: "assistant" } });
    if (answers !== 1) return null;
    const [question, answer] = await prisma.veraMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { role: true, parts: true },
    });
    if (question?.role !== "user" || answer?.role !== "assistant") return null;

    const result = await generateText({
      model,
      instructions: TITLE_INSTRUCTIONS,
      prompt: `Pertanyaan siswa: ${textOf(question.parts).slice(0, CONTEXT_CHARS)}\n\nJawaban Vera: ${textOf(answer.parts).slice(0, CONTEXT_CHARS)}`,
      maxOutputTokens: TITLE_OUTPUT_TOKENS,
      providerOptions: { openai: { reasoningEffort: "low", store: false } },
    });

    const tokens = tokensOf(result.usage);
    await prisma.veraUsageEvent.create({
      data: {
        studentId,
        kind: "title",
        status: "settled",
        effort: null,
        model: getVeraModelId(),
        conversationId,
        reservedCredits: 0,
        reservedUsdMicros: 0,
        credits: 0,
        costUsdMicros: costUsdMicros(tokens, getVeraPrices()),
        inputTokens: result.usage.inputTokens ?? 0,
        cachedInputTokens: tokens.cachedInputTokens,
        outputTokens: result.usage.outputTokens ?? 0,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
        steps: 1,
        settledAt: now,
      },
    });

    const title = cleanTitle(result.text);
    if (!title) return null;
    const updated = await prisma.veraConversation.updateMany({
      where: { id: conversationId, studentId, title: VERA_CONVERSATION_TITLE },
      data: { title },
    });
    return updated.count === 1 ? title : null;
  } catch (error) {
    serverLogger.error("vera.title.failed", error, { area: "vera", operation: "title_conversation" });
    return null;
  }
}

/**
 * Schedules the title after the response has finished, so the stream is never held. Outside a request there is no response to wait
 * for, so nothing is scheduled there and the title stays the default.
 */
export function scheduleConversationTitle({ studentId, conversationId }: { studentId: string; conversationId: string }) {
  try {
    after(() => titleConversation({ studentId, conversationId }));
  } catch {
    // Not inside a request, such as a script or a test. The default title stays until something asks for the title.
  }
}
