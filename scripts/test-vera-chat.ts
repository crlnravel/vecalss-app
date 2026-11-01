import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import { runVeraChat, type VeraChatInput } from "../lib/vera/chat";
import { VERA_ERROR_STATUS, VeraError } from "../lib/vera/errors";
import { setVeraModelForTests } from "../lib/vera/model";
import { trimHistory } from "../lib/vera/prompt";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-chat only runs against the local dev database on 127.0.0.1:55432.");
}

type StreamEvent = { type: string; [key: string]: unknown };

function answerModel(deltas: string[], chunkDelayInMs = 0) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          ...deltas.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
          { type: "text-end", id: "answer" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: deltas.length, text: deltas.length, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

function userInput(text: string, overrides: Partial<VeraChatInput> = {}): VeraChatInput {
  return {
    message: { id: `msg-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text }] },
    effort: "cepat",
    ...overrides,
  };
}

async function readEvents(response: Response): Promise<StreamEvent[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((block) => block.replace(/^data: /, "").trim())
    .filter((block) => block && block !== "[DONE]")
    .map((block) => JSON.parse(block) as StreamEvent);
}

function streamedText(events: StreamEvent[]) {
  return events
    .filter((event) => event.type === "text-delta")
    .map((event) => String(event.delta))
    .join("");
}

function conversationIdFrom(events: StreamEvent[]) {
  const start = events.find((event) => event.type === "start");
  const metadata = start?.messageMetadata as { conversationId?: string } | undefined;
  assert.ok(metadata?.conversationId, "The start event returns the conversation id");
  return metadata.conversationId;
}

async function waitFor<T>(read: () => Promise<T | null>, label: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const createdConversationIds: string[] = [];

try {
  // Dedicated accounts keep this test's usage away from the seeded students. The main flows make five requests, which is
  // the burst limit, so the provider-failure case runs on its own account.
  const dedicatedStudent = async (email: string) =>
    (
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, fullName: "Vera Chat Test", passwordHash: "test-only" },
        select: { id: true },
      })
    ).id;
  const studentId = await dedicatedStudent("vera-chat-test@vecalss.local");
  const failureStudentId = await dedicatedStudent("vera-chat-test-failure@vecalss.local");
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: { in: [studentId, failureStudentId] } } });
  await prisma.veraConversation.deleteMany({ where: { studentId: { in: [studentId, failureStudentId] } } });

  // Creates a conversation, streams text, and persists the user and assistant messages.
  const firstModel = answerModel(["Halo, ", "aku Vera."]);
  setVeraModelForTests(firstModel);
  const firstEvents = await readEvents(
    await runVeraChat({ studentId, input: userInput("Halo Vera"), signal: new AbortController().signal }),
  );
  const conversationId = conversationIdFrom(firstEvents);
  createdConversationIds.push(conversationId);
  assert.equal(streamedText(firstEvents), "Halo, aku Vera.");
  const firstRows = await prisma.veraMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true },
  });
  assert.deepEqual(firstRows.map((row) => row.role), ["user", "assistant"]);

  // Every answer settles its usage: tokens and cost are recorded, and the assistant message shows the same credits.
  const usage = await prisma.veraUsageEvent.findFirst({
    where: { conversationId },
    select: { status: true, inputTokens: true, outputTokens: true, costUsdMicros: true, credits: true, steps: true },
  });
  assert.equal(usage?.status, "settled", "The answer settles its usage event");
  assert.equal(usage?.inputTokens, 12);
  assert.equal(usage?.outputTokens, 2);
  assert.equal(usage?.steps, 1);
  assert.equal(Number(usage?.costUsdMicros), 3, "Cost is priced from the tokens (12 input at 0.10, 2 output at 0.50 per million)");
  const answerRow = await prisma.veraMessage.findFirst({ where: { conversationId, role: "assistant" }, select: { credits: true } });
  assert.equal(Number(answerRow?.credits), Number(usage?.credits), "The stored answer credits match the settled event");

  // A second message on the same conversation sends the earlier turns back to the model.
  const secondModel = answerModel(["Oke, lanjut."]);
  setVeraModelForTests(secondModel);
  await (
    await runVeraChat({ studentId, input: userInput("Lanjut dong", { conversationId }), signal: new AbortController().signal })
  ).text();
  const sentPrompt = JSON.stringify(secondModel.doStreamCalls[0]?.prompt ?? []);
  assert.ok(sentPrompt.includes("Halo Vera"), "History includes the earlier user message");
  assert.ok(sentPrompt.includes("Halo, aku Vera."), "History includes the earlier assistant answer");
  assert.ok(sentPrompt.includes("Lanjut dong"), "The new user message is sent");

  // Another student's conversation is indistinguishable from a missing one.
  const other = await prisma.user.findFirst({ where: { id: { not: studentId } }, select: { id: true } });
  assert.ok(other, "A second account is needed to check ownership");
  const foreign = await prisma.veraConversation.create({
    data: { studentId: other.id, title: "Sesi milik orang lain" },
    select: { id: true },
  });
  createdConversationIds.push(foreign.id);
  await assert.rejects(
    runVeraChat({
      studentId,
      input: userInput("Halo", { conversationId: foreign.id }),
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof VeraError && error.code === "not_found" && VERA_ERROR_STATUS[error.code] === 404,
  );

  // Two requests that reuse one client message id both succeed. The stored id comes from the server.
  const reusedClientId = `client-${crypto.randomUUID()}`;
  const beforeReuse = await prisma.veraMessage.count({ where: { conversationId } });
  for (const turn of ["Pertama", "Kedua"]) {
    setVeraModelForTests(answerModel([`Jawaban ${turn}.`]));
    const reused = userInput(turn, { conversationId });
    const events = await readEvents(
      await runVeraChat({
        studentId,
        input: { ...reused, message: { ...reused.message, id: reusedClientId } },
        signal: new AbortController().signal,
      }),
    );
    assert.equal(streamedText(events), `Jawaban ${turn}.`, `Reused client id, turn "${turn}" streams its answer`);
  }
  assert.equal(await prisma.veraMessage.count({ where: { conversationId } }), beforeReuse + 4);

  // Without an API key, the request fails with a 503 before anything is written.
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  setVeraModelForTests(undefined);
  await assert.rejects(
    runVeraChat({ studentId, input: userInput("Halo"), signal: new AbortController().signal }),
    (error: unknown) => error instanceof VeraError && error.code === "vera_unavailable" && VERA_ERROR_STATUS[error.code] === 503,
  );
  if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;

  // Stop keeps the partial answer and marks it as stopped.
  setVeraModelForTests(answerModel(["Ini ", "jawaban ", "yang ", "panjang ", "sekali"], 40));
  const controller = new AbortController();
  const stoppedResponse = await runVeraChat({ studentId, input: userInput("Jelaskan panjang"), signal: controller.signal });
  const reader = stoppedResponse.body!.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes("Ini ")) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += decoder.decode(value, { stream: true });
  }
  controller.abort();
  try {
    while (!(await reader.read()).done) {
      // Drain whatever the aborted stream still emits.
    }
  } catch {
    // An aborted reader may reject; the persisted answer is what matters here.
  }
  const stoppedConversationId = seen.match(/"conversationId":"([0-9a-f-]{36})"/)?.[1];
  assert.ok(stoppedConversationId, "The stopped stream still announces its conversation");
  createdConversationIds.push(stoppedConversationId);
  const stoppedAnswer = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: stoppedConversationId, role: "assistant" },
        select: { parts: true },
      }),
    "the stopped answer to be saved",
  );
  assert.ok(JSON.stringify(stoppedAnswer.parts).includes("data-vera-status"), "The partial answer is marked as stopped");
  assert.ok(JSON.stringify(stoppedAnswer.parts).includes("Ini "), "The partial answer keeps the streamed text");

  // Aborting after generation started still charges: the first step was cut off, so the reserve is the charge.
  const stoppedUsage = await waitFor(
    () =>
      prisma.veraUsageEvent
        .findFirst({
          where: { conversationId: stoppedConversationId },
          select: { status: true, credits: true, errorCode: true },
        })
        .then((row) => (row && row.status !== "reserved" ? row : null)),
    "the stopped answer's usage to settle",
  );
  assert.equal(stoppedUsage.status, "settled", "An aborted answer that started generating is settled, not released");
  assert.equal(Number(stoppedUsage.credits), 2, "An aborted first step is charged the cepat reserve");
  assert.equal(stoppedUsage.errorCode, "aborted", "The settled row records why the answer ended early");

  // A provider failure before any output releases the reservation: nothing was generated, so nothing is billed.
  setVeraModelForTests(
    new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("Provider tidak tersedia.");
      },
    }),
  );
  const failedEvents = await readEvents(
    await runVeraChat({ studentId: failureStudentId, input: userInput("Halo gagal"), signal: new AbortController().signal }),
  );
  const failedConversationId = conversationIdFrom(failedEvents);
  createdConversationIds.push(failedConversationId);
  const failedUsage = await waitFor(
    () =>
      prisma.veraUsageEvent
        .findFirst({
          where: { conversationId: failedConversationId },
          select: { status: true, credits: true, errorCode: true },
        })
        .then((row) => (row && row.status !== "reserved" ? row : null)),
    "the failed answer's usage to release",
  );
  assert.equal(failedUsage.status, "released", "A failure before any output releases the reservation");
  assert.equal(Number(failedUsage.credits), 0);
  assert.equal(failedUsage.errorCode, "error");

  // History trimming keeps the newest messages that fit the budget.
  const message = (id: string, length: number) => ({
    id,
    role: "user" as const,
    parts: [{ type: "text" as const, text: "x".repeat(length) }],
  });
  assert.deepEqual(
    trimHistory([message("a", 400), message("b", 400), message("c", 40)], 150).map((item) => item.id),
    ["b", "c"],
  );

  console.log("Vera chat checks passed.");
} finally {
  setVeraModelForTests(undefined);
  if (createdConversationIds.length) {
    await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  }
  await prisma.$disconnect();
}
