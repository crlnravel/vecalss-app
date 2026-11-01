import "server-only";

import {
  consumeStream,
  createUIMessageStreamResponse,
  isStepCount,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";
import { VERA_EFFORTS, VERA_LIMITS } from "./config";
import { VeraError } from "./errors";
import { getVeraPrices, reserveVeraCredits } from "./ledger";
import { getVeraModel, getVeraModelId } from "./model";
import { buildVeraInstructions } from "./prompt";
import { getKuisAttemptReview, listKuisAttempts } from "./sources/kuis";
import { getTryoutResultReview, listTryoutResults } from "./sources/tryout";
import { collectSources, uniqueSources, type VeraSource } from "./sources/types";
import { saveStudioDocument } from "./studio-documents";
import {
  keepToolLinks,
  studioInstructions,
  studioRequestText,
  studioTitle,
  type ReviewTarget,
  type StudioRequest,
} from "./studio";
import { createVeraTools } from "./tools";
import { trackAnswerUsage } from "./usage-tracker";

/** The Kuis attempt or Tryout result a review reads, with the link the document keeps to it. */
type ResolvedTarget = ReviewTarget & { source: VeraSource };

/**
 * Runs one Studio tool and streams its document. The reservation is taken before the model is called. The document is saved only
 * when the run completes, so a cancelled or failed run leaves no half-written document. Its usage is settled either way.
 */
export async function runVeraStudio({
  studentId,
  request,
  signal,
  now = new Date(),
}: {
  studentId: string;
  request: StudioRequest;
  signal: AbortSignal;
  now?: Date;
}): Promise<Response> {
  const model = getVeraModel();
  if (!model) {
    throw new VeraError("vera_unavailable", "Vera sedang tidak tersedia. Coba lagi nanti.");
  }

  // A review must name a result the student may read. Nothing is reserved for a request that cannot run.
  const target =
    request.tool === "wrong_answer_review" ? await resolveReviewTarget(studentId, request.input.target, now) : null;
  if (request.tool === "wrong_answer_review" && !target) {
    throw new VeraError("not_found", "Belum ada hasil yang bisa dibahas.");
  }

  const effort = VERA_EFFORTS[request.effort];
  const prices = getVeraPrices();
  // A refused run throws here, before anything is written and before the provider is called.
  const { eventId } = await reserveVeraCredits({
    studentId,
    effort: request.effort,
    model: getVeraModelId(),
    kind: "studio",
    now,
  });

  const documentId = crypto.randomUUID();
  const title = studioTitle(request.tool, now);
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
  const firstName = student?.fullName?.trim().split(/\s+/)[0] || "siswa";
  const instructions = `${buildVeraInstructions({ firstName, now })}\n\n${studioInstructions(request.tool)}`;

  const usage = trackAnswerUsage({ eventId, effort, prices });
  const result = streamText({
    model,
    instructions,
    messages: [{ role: "user", content: studioRequestText(request, target ?? undefined) }],
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
    originalMessages: [] as UIMessage[],
    generateMessageId: () => crypto.randomUUID(),
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { documentId, tool: request.tool, title };
      if (part.type === "finish") return { credits: usage.creditsForAnswer() };
      return undefined;
    },
    onError: () => "Dokumen belum bisa disusun sekarang. Coba lagi.",
    onEnd: async ({ messages }) => {
      if (usage.outcome() !== "completed") return;
      await saveRun({
        studentId,
        eventId,
        documentId,
        request,
        title,
        messages,
        credits: usage.creditsForAnswer() ?? 0,
        extraSources: target ? [target.source] : [],
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
 * The review's target, checked with the readers the student's own pages use. "latest" means the newest result of either kind.
 */
async function resolveReviewTarget(
  studentId: string,
  target: "latest" | ReviewTarget,
  now: Date,
): Promise<ResolvedTarget | null> {
  const chosen = target === "latest" ? await newestResult(studentId, now) : target;
  if (!chosen) return null;
  const review =
    chosen.type === "kuis"
      ? await getKuisAttemptReview({ studentId, attemptId: chosen.id, onlyWrong: true, now })
      : await getTryoutResultReview({ studentId, attemptId: chosen.id, onlyWrong: true, now });
  if ("error" in review) return null;
  return { type: chosen.type, id: chosen.id, source: review.source };
}

async function newestResult(studentId: string, now: Date): Promise<ReviewTarget | null> {
  const [kuis, tryout] = await Promise.all([
    listKuisAttempts({ studentId, limit: 1, now }),
    listTryoutResults({ studentId, limit: 1, now }),
  ]);
  const candidates = [
    ...kuis.map((row) => ({ type: "kuis" as const, id: row.attemptId, date: row.date })),
    ...tryout.map((row) => ({ type: "tryout" as const, id: row.attemptId, date: row.date })),
  ].sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
  const newest = candidates[0];
  return newest ? { type: newest.type, id: newest.id } : null;
}

/** Saves the finished document with the links its tools returned, then records it on the usage event that paid for it. */
async function saveRun({
  studentId,
  eventId,
  documentId,
  request,
  title,
  messages,
  credits,
  extraSources,
}: {
  studentId: string;
  eventId: string;
  documentId: string;
  request: StudioRequest;
  title: string;
  messages: UIMessage[];
  credits: number;
  extraSources: VeraSource[];
}) {
  try {
    const parts = [...messages].reverse().find((message) => message.role === "assistant")?.parts ?? [];
    const text = parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n")
      .trim();
    if (!text) return;
    const outputs = parts.flatMap((part) => (isToolUIPart(part) ? [part.output] : []));
    const sources = uniqueSources([...extraSources, ...collectSources(outputs)]);
    await saveStudioDocument({
      id: documentId,
      studentId,
      tool: request.tool,
      title,
      markdown: keepToolLinks(text, sources),
      sources,
      input: request.input,
      credits,
    });
    await prisma.veraUsageEvent.update({ where: { id: eventId }, data: { studioDocumentId: documentId } });
  } catch (error) {
    serverLogger.error("vera.studio.save_failed", error, { area: "vera", operation: "save_studio_document" });
  }
}
