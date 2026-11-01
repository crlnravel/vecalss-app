import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import type { VeraChatInput } from "../lib/vera/chat";
import { listTryoutResults } from "../lib/vera/sources/tryout";

/** Helpers shared by the Vera checks. None of them calls the provider: every model is the AI SDK mock. */

export type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>> extends { stream: ReadableStream<infer Part> }
  ? Part
  : never;
export type StreamEvent = { type: string; [key: string]: unknown };
export type ModelStep = { chunks: StreamPart[]; chunkDelayInMs?: number };

function usageOf([input, output]: [number, number]) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

/** One model step that answers in text. */
export function answerChunks(deltas: string[], usage: [number, number] = [12, 2]): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "answer" },
    ...deltas.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
    { type: "text-end", id: "answer" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usageOf(usage) },
  ];
}

/** A mock model whose successive calls follow the given steps. */
export function scriptedModel(steps: ModelStep[]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call, steps.length - 1)];
      call += 1;
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: step.chunkDelayInMs ?? 0,
          chunks: step.chunks,
        }),
      };
    },
  });
}

/** A one-page PDF with one line of text and a valid cross-reference table, so the extractor reads a real file. */
export function minimalPdf(line: string) {
  const stream = `BT /F1 18 Tf 20 100 Td (${line}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 144] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export function userInput(text: string, mentions: VeraChatInput["mentions"] = []): VeraChatInput {
  return {
    message: { id: `msg-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text }] },
    effort: "cepat",
    mentions,
  };
}

export async function readEvents(response: Response): Promise<StreamEvent[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((block) => block.replace(/^data: /, "").trim())
    .filter((block) => block && block !== "[DONE]")
    .map((block) => JSON.parse(block) as StreamEvent);
}

export function streamedText(events: StreamEvent[]) {
  return events
    .filter((event) => event.type === "text-delta")
    .map((event) => String(event.delta))
    .join("");
}

export function conversationIdFrom(events: StreamEvent[]) {
  const start = events.find((event) => event.type === "start");
  const metadata = start?.messageMetadata as { conversationId?: string } | undefined;
  assert.ok(metadata?.conversationId, "The start event returns the conversation id");
  return metadata.conversationId;
}

export async function waitFor<T>(read: () => Promise<T | null>, label: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** A top-level Materi section topic, so the test lessons sit where the catalogue shows them. */
export async function findSectionTopic() {
  const topics = await prisma.topic.findMany({
    where: { code: { startsWith: "materi:" }, parentTopicId: null, isActive: true, subtest: { isActive: true } },
    select: { id: true, code: true },
    take: 200,
  });
  const topic = topics.find((candidate) => /^materi:[a-z0-9-]+:section-[123]$/u.test(candidate.code));
  if (!topic) {
    throw new Error("The Vera checks need a Materi section topic in the dev database. Seed the local dev data first.");
  }
  return topic;
}

/** A released Tryout result that someone other than the test student owns, so authorization checks have foreign data to refuse. */
export async function findReleasedTryout() {
  const candidates = await prisma.tryoutAttempt.findMany({
    where: { releaseState: "released", assessmentReleaseId: { not: null } },
    orderBy: { releaseAt: "desc" },
    take: 10,
    select: { id: true, studentId: true, tryout: { select: { title: true } } },
  });
  for (const candidate of candidates) {
    const listed = await listTryoutResults({ studentId: candidate.studentId, limit: 5 });
    if (listed.some((result) => result.attemptId === candidate.id)) return candidate;
  }
  throw new Error("The Vera checks need a released Tryout result in the dev database. Seed the local dev data first.");
}
