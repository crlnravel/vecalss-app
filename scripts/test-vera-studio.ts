import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma";
import { parseVeraChatRequest, runVeraChat, type VeraChatInput, type VeraSendInput } from "../lib/vera/chat";
import { VERA_EFFORTS, VERA_LIMITS } from "../lib/vera/config";
import { VeraError } from "../lib/vera/errors";
import { setVeraModelForTests } from "../lib/vera/model";
import {
  keepToolLinks,
  studioBubbleText,
  studioModelText,
  studioOptionsSchema,
  studioTitle,
  type StudioOptions,
} from "../lib/vera/studio";
import { getStudioDocument, listStudioDocuments } from "../lib/vera/studio-documents";
import { resolveReviewTarget } from "../lib/vera/studio-targets";

import {
  answerChunks,
  conversationIdFrom,
  findReleasedTryout,
  readEvents,
  scriptedModel,
  streamedText,
  toolCallChunks,
  userInput,
  type StreamPart,
} from "./vera-test-support";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-studio only runs against the local dev database on 127.0.0.1:55432.");
}

const EFFORT = "cepat" as const;
// Phrases from the instructions each write tool gives its model. The model reads them in its turn. The stored answer and the stream never carry them.
const ROUTE_INSTRUCTIONS = "Susun Rute Belajar 7 hari dengan satu judul per hari";
const REVIEW_INSTRUCTIONS = "Bahas soal yang salah dengan struktur ini";
const signal = new AbortController().signal;

/** A model step that answers and then stops for lack of room, as a document cut off part way does. */
function answerCutOff(text: string): StreamPart[] {
  return answerChunks([text]).map((part) =>
    part.type === "finish" ? { ...part, finishReason: { unified: "length" as const, raw: "length" } } : part,
  );
}

/** A dedicated account for one check. Its earlier rows are cleared first, so its burst and daily limits count this check alone. */
async function accountId(label: string) {
  const email = `vera-studio-tools-${label}@vecalss.local`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName: "Vera Studio Tools Test", passwordHash: "test-only" },
    select: { id: true },
  });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: user.id } });
  await prisma.veraConversation.deleteMany({ where: { studentId: user.id } });
  await prisma.veraStudioDocument.deleteMany({ where: { studentId: user.id } });
  return user.id;
}

function textOf(parts: unknown) {
  return (parts as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

/** The stored messages of a session, oldest first. */
function rowsOf(conversationId: string) {
  return prisma.veraMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, parts: true },
  });
}

/** The pointer a stored answer keeps to the document it was saved as, if any. */
function pointerOf(parts: unknown) {
  if (!Array.isArray(parts)) return undefined;
  const found = (parts as Array<{ type: string; data?: unknown }>).find((part) => part.type === "data-vera-studio");
  return found?.data as { documentId: string; tool: string; complete: boolean } | undefined;
}

/** The output a stored answer keeps for one tool call, or an empty object when the answer has no such call. */
function toolOutputOf(parts: unknown, type: string): Record<string, unknown> {
  const part = (parts as Array<{ type: string; output?: Record<string, unknown> }>).find((candidate) => candidate.type === type);
  return part?.output ?? {};
}

/** The options a saved document was written with. The list and read APIs leave them out. */
async function inputOf(documentId: string) {
  const row = await prisma.veraStudioDocument.findUniqueOrThrow({ where: { id: documentId }, select: { input: true } });
  return row.input;
}

/** The usage events of a session's answers, oldest first. Titles are left out, because they are not answers. */
function answerUsageOf(conversationId: string) {
  return prisma.veraUsageEvent.findMany({
    where: { conversationId, kind: { not: "title" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, status: true, studioDocumentId: true },
  });
}

/** A Studio request as the chat sends it: the sentence the student sees, and the options the turn is held to. */
function studioInput(options: StudioOptions): VeraSendInput {
  return { ...userInput(studioBubbleText(options)), studio: options };
}

function editInput(conversationId: string, userMessageId: string, text: string): VeraChatInput {
  return {
    action: "edit",
    conversationId,
    userMessageId,
    message: { id: `msg-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text }] },
    effort: EFFORT,
    mentions: [],
  };
}

const createdConversationIds: string[] = [];
const createdDocumentIds: string[] = [];

try {
  // The request shapes. A Studio request is a send that carries its options, and a route takes only the four listed minute counts.
  assert.equal(
    studioOptionsSchema.safeParse({ tool: "weakness_analysis", input: {} }).success,
    true,
    "A weakness analysis takes no options",
  );
  assert.equal(
    studioOptionsSchema.safeParse({ tool: "study_route", input: { minutesPerDay: 25 } }).success,
    false,
    "A route takes 20, 30, 45, or 60 minutes",
  );
  assert.equal(
    studioOptionsSchema.safeParse({ tool: "wrong_answer_review", input: { target: "latest" } }).success,
    true,
    "A review takes the latest result",
  );
  const sendWithStudio = parseVeraChatRequest({
    message: { id: "msg-studio", role: "user", parts: [{ type: "text", text: "Rute" }] },
    studio: { tool: "study_route", input: { minutesPerDay: 30 } },
  });
  assert.equal(sendWithStudio.success && sendWithStudio.data.action, "send", "A Studio request is a send");
  assert.equal(
    parseVeraChatRequest({
      message: { id: "msg-studio", role: "user", parts: [{ type: "text", text: "Rute" }] },
      studio: { tool: "study_route", input: { minutesPerDay: 25 } },
    }).success,
    false,
    "A Studio request with an unlisted minute count is refused",
  );

  // The bubble names the choice in words and never shows the result's id. The model is told which result to read.
  const reviewId = crypto.randomUUID();
  const reviewOptions: StudioOptions = { tool: "wrong_answer_review", input: { target: { type: "kuis", id: reviewId } } };
  assert.equal(
    studioBubbleText(reviewOptions, "Latihan Penalaran").includes(reviewId),
    false,
    "The sentence the student sees never shows an id",
  );
  assert.ok(studioModelText(reviewOptions).includes(reviewId), "The model is told which result to read");

  // A document keeps only the links its tools returned, and its title names its tool and date.
  const kept = keepToolLinks("[Materi](/courses/a/b) dan [palsu](/courses/palsu).", [
    { type: "materi", id: "materi-1", label: "Materi", href: "/courses/a/b" },
  ]);
  assert.equal(kept, "[Materi](/courses/a/b) dan palsu.", "A link the tools did not return keeps its text only");
  assert.ok(
    studioTitle("study_route", new Date("2026-11-07T03:00:00Z")).startsWith("Rute Belajar 7 Hari · "),
    "A document is titled by its tool and date",
  );

  // A route request. The model asks for 20 minutes, but the student chose 30. The first step must call the route tool, the turn writes
  // its document with Mendalam's output room once that tool has been called, and the answer is saved as that document.
  const routeOwner = await accountId("route");
  const routeBubble = studioBubbleText({ tool: "study_route", input: { minutesPerDay: 30 } });
  const routeModel = scriptedModel([
    { chunks: toolCallChunks("write_study_route", { minutesPerDay: 20 }) },
    { chunks: answerChunks(["## Hari 1\n\nBaca Materi persentase bertingkat.\n"]) },
  ]);
  setVeraModelForTests(routeModel);
  const routeEvents = await readEvents(
    await runVeraChat({
      studentId: routeOwner,
      input: studioInput({ tool: "study_route", input: { minutesPerDay: 30 } }),
      signal,
    }),
  );
  const routeConversationId = conversationIdFrom(routeEvents);
  createdConversationIds.push(routeConversationId);
  const [routeQuestion, routeAnswer] = await rowsOf(routeConversationId);
  assert.equal(textOf(routeQuestion.parts), routeBubble, "The student's own message is the plain sentence");
  assert.deepEqual(
    routeModel.doStreamCalls[0]?.toolChoice,
    { type: "tool", toolName: "write_study_route" },
    "The first step must call the route tool",
  );
  assert.equal(
    routeModel.doStreamCalls[0]?.maxOutputTokens,
    VERA_EFFORTS.cepat.maxOutputTokens,
    "Before a Studio tool is called, the chosen effort's output room applies",
  );
  assert.equal(
    routeModel.doStreamCalls[1]?.maxOutputTokens,
    VERA_EFFORTS.mendalam.maxOutputTokens,
    "After a Studio tool is called, the output room is Mendalam's",
  );
  const routePrompt = JSON.stringify(routeModel.doStreamCalls[0]?.prompt);
  assert.ok(routePrompt.includes("Buat Rute Belajar 7 hari dengan 30 menit per hari."), "The model reads the request the student chose");
  assert.equal(routePrompt.includes(routeBubble), false, "The model does not read the bubble in place of the request");
  const routeDocumentId = pointerOf(routeAnswer.parts)?.documentId;
  assert.ok(routeDocumentId, "The answer keeps a pointer to its document");
  createdDocumentIds.push(routeDocumentId);
  const routeDocument = await getStudioDocument({ studentId: routeOwner, id: routeDocumentId });
  assert.equal(routeDocument?.tool, "study_route");
  assert.equal(routeDocument?.complete, true, "A finished document is complete");
  assert.ok(routeDocument?.markdown.includes("## Hari 1"), "The document is the answer the model wrote");
  assert.deepEqual(await inputOf(routeDocumentId), { minutesPerDay: 30 }, "The document keeps the options the student chose");
  assert.equal(pointerOf(routeAnswer.parts)?.complete, true, "The pointer says the document is complete");
  assert.equal(textOf(routeAnswer.parts).includes(routeDocumentId), false, "The answer's words never show the document's id");
  // The instructions reach the model in this turn. The stored answer and the stream never carry them, and the stored output keeps the document and the tool.
  assert.ok(
    JSON.stringify(routeModel.doStreamCalls[1]?.prompt).includes(ROUTE_INSTRUCTIONS),
    "The model reads its document's instructions in the same turn",
  );
  assert.equal(JSON.stringify(routeAnswer.parts).includes(ROUTE_INSTRUCTIONS), false, "The stored answer keeps no instructions");
  assert.equal(JSON.stringify(routeEvents).includes(ROUTE_INSTRUCTIONS), false, "The student's stream carries no instructions");
  assert.deepEqual(
    Object.keys(toolOutputOf(routeAnswer.parts, "tool-write_study_route")).sort(),
    ["documentId", "tool"],
    "A write tool's stored output keeps its document and its tool",
  );
  assert.equal((await listStudioDocuments({ studentId: routeOwner })).length, 1, "The Studio answer is saved as one document");
  const routeUsage = await answerUsageOf(routeConversationId);
  assert.equal(routeUsage.length, 1, "A Studio turn is one chat answer");
  assert.equal(routeUsage[0].kind, "chat", "A Studio document is charged as a chat answer");
  assert.equal(routeUsage[0].studioDocumentId, routeDocumentId, "The usage event points at the document it paid for");

  // Edit on a Studio request is refused: the request is its options, so a new one comes from the card, and nothing changes.
  await assert.rejects(
    runVeraChat({ studentId: routeOwner, input: editInput(routeConversationId, routeQuestion.id, "Ubah"), signal }),
    (error) => error instanceof VeraError && error.code === "invalid_request",
    "A Studio request cannot be edited",
  );
  assert.equal((await rowsOf(routeConversationId)).length, 2, "A refused edit changes nothing");

  // A typed request forces no tool. The model's own arguments are kept, and the document it writes is saved like any other.
  const typedOwner = await accountId("typed");
  const typedModel = scriptedModel([
    { chunks: toolCallChunks("write_weakness_analysis", { subtest: "PU" }) },
    { chunks: answerChunks(["## Ringkasan\n\nPola hasil belum tetap.\n"]) },
  ]);
  setVeraModelForTests(typedModel);
  const typedEvents = await readEvents(
    await runVeraChat({
      studentId: typedOwner,
      input: userInput("Buat Analisis Kelemahan dari hasil terakhirku."),
      signal,
    }),
  );
  createdConversationIds.push(conversationIdFrom(typedEvents));
  assert.notEqual(typedModel.doStreamCalls[0]?.toolChoice?.type, "tool", "A typed request forces no tool");
  const [typedDocument] = await listStudioDocuments({ studentId: typedOwner });
  assert.equal(typedDocument?.tool, "weakness_analysis", "A write tool a typed request calls is saved as a document");
  createdDocumentIds.push(typedDocument.id);
  assert.deepEqual(await inputOf(typedDocument.id), { subtest: "PU" }, "A typed request keeps the arguments the model chose");

  // A review of a released Tryout result that the student chose. The model asks for "latest", and that is ignored. The link the review
  // tool returned is kept, a link it did not return is dropped, and the document is written for the result the student chose.
  const released = await findReleasedTryout();
  const releasedTarget = await resolveReviewTarget(released.studentId, { type: "tryout", id: released.id }, new Date());
  assert.ok(releasedTarget, "The released result is readable by its owner");
  const reviewModel = scriptedModel([
    { chunks: toolCallChunks("write_wrong_answer_review", { target: "latest" }) },
    {
      chunks: answerChunks([
        `### Soal 1\n\nLihat [pembahasan](${releasedTarget.source.href}) dan [contoh lain](/courses/palsu).`,
      ]),
    },
  ]);
  setVeraModelForTests(reviewModel);
  const reviewEvents = await readEvents(
    await runVeraChat({
      studentId: released.studentId,
      input: studioInput({ tool: "wrong_answer_review", input: { target: { type: "tryout", id: released.id } } }),
      signal,
    }),
  );
  const reviewConversationId = conversationIdFrom(reviewEvents);
  createdConversationIds.push(reviewConversationId);
  const [, reviewAnswer] = await rowsOf(reviewConversationId);
  const reviewDocumentId = pointerOf(reviewAnswer.parts)?.documentId;
  assert.ok(reviewDocumentId, "The review is saved as a document");
  createdDocumentIds.push(reviewDocumentId);
  const review = await getStudioDocument({ studentId: released.studentId, id: reviewDocumentId });
  assert.ok(review?.markdown.includes(`(${releasedTarget.source.href})`), "A link the review tool returned is kept");
  assert.equal(review?.markdown.includes("/courses/palsu"), false, "A link the review tool did not return is dropped");
  assert.ok(
    review?.sources.some((source) => source.href === releasedTarget.source.href),
    "The document lists the result it reviews",
  );
  assert.deepEqual(
    await inputOf(reviewDocumentId),
    { target: { type: "tryout", id: released.id } },
    "The document reviews the result the student chose",
  );
  // The model reads the review's instructions and the result to review in this turn. The stored output keeps the document, the tool and the link.
  const reviewToolResult = JSON.stringify(reviewModel.doStreamCalls[1]?.prompt.find((message) => message.role === "tool") ?? null);
  assert.ok(reviewToolResult.includes(REVIEW_INSTRUCTIONS), "The model reads the review's instructions in the same turn");
  assert.ok(reviewToolResult.includes(`"id":"${released.id}"`), "The model is told which result to review");
  assert.equal(JSON.stringify(reviewAnswer.parts).includes(REVIEW_INSTRUCTIONS), false, "The stored answer keeps no review instructions");
  assert.deepEqual(
    Object.keys(toolOutputOf(reviewAnswer.parts, "tool-write_wrong_answer_review")).sort(),
    ["documentId", "source", "tool"],
    "A review's stored output keeps its document, its tool and its link",
  );

  // A review of a result this student may not read is refused by the tool. Nothing is saved, and the answer says so.
  const refusedOwner = await accountId("refused");
  const refusedModel = scriptedModel([
    { chunks: toolCallChunks("write_wrong_answer_review", { target: { type: "tryout", id: released.id } }) },
    { chunks: answerChunks(["Belum ada hasil yang bisa dibahas."]) },
  ]);
  setVeraModelForTests(refusedModel);
  const refusedEvents = await readEvents(
    await runVeraChat({
      studentId: refusedOwner,
      input: studioInput({ tool: "wrong_answer_review", input: { target: { type: "tryout", id: released.id } } }),
      signal,
    }),
  );
  const refusedConversationId = conversationIdFrom(refusedEvents);
  createdConversationIds.push(refusedConversationId);
  assert.equal(refusedModel.doStreamCalls.length, 2, "The model still answers after a refused review");
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: refusedOwner } }), 0, "A refused review saves nothing");
  assert.equal(pointerOf((await rowsOf(refusedConversationId)).at(-1)?.parts), undefined, "A refused review keeps no pointer");
  assert.equal(streamedText(refusedEvents), "Belum ada hasil yang bisa dibahas.", "The answer still says what happened");

  // A document cut off for room is kept, marked incomplete, and its answer says so.
  const cutOwner = await accountId("cut");
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("write_study_route", { minutesPerDay: 20 }) },
      { chunks: answerCutOff("## Hari 1\n\nSebagian rute") },
    ]),
  );
  const cutEvents = await readEvents(
    await runVeraChat({
      studentId: cutOwner,
      input: studioInput({ tool: "study_route", input: { minutesPerDay: 20 } }),
      signal,
    }),
  );
  const cutConversationId = conversationIdFrom(cutEvents);
  createdConversationIds.push(cutConversationId);
  const [, cutAnswer] = await rowsOf(cutConversationId);
  const cutDocumentId = pointerOf(cutAnswer.parts)?.documentId;
  assert.ok(cutDocumentId, "A document cut off for room is still saved");
  createdDocumentIds.push(cutDocumentId);
  assert.equal((await getStudioDocument({ studentId: cutOwner, id: cutDocumentId }))?.complete, false, "A cut-off document is incomplete");
  assert.equal(pointerOf(cutAnswer.parts)?.complete, false, "The answer's pointer says the document is incomplete");

  // A Studio turn that wrote no text saves nothing.
  const emptyOwner = await accountId("empty");
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("write_study_route", { minutesPerDay: 60 }) },
      { chunks: answerChunks([""]) },
    ]),
  );
  const emptyEvents = await readEvents(
    await runVeraChat({
      studentId: emptyOwner,
      input: studioInput({ tool: "study_route", input: { minutesPerDay: 60 } }),
      signal,
    }),
  );
  const emptyConversationId = conversationIdFrom(emptyEvents);
  createdConversationIds.push(emptyConversationId);
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: emptyOwner } }), 0, "A turn that wrote no text saves nothing");
  assert.equal(pointerOf((await rowsOf(emptyConversationId)).at(-1)?.parts), undefined, "A turn that wrote no text keeps no pointer");

  // Ulangi on a Studio answer asks for the same document again. The first document stays, and the second is saved beside it.
  const regenOwner = await accountId("regen");
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("write_study_route", { minutesPerDay: 45 }) },
      { chunks: answerChunks(["## Hari 1\n\nRute pertama.\n"]) },
    ]),
  );
  const firstEvents = await readEvents(
    await runVeraChat({
      studentId: regenOwner,
      input: studioInput({ tool: "study_route", input: { minutesPerDay: 45 } }),
      signal,
    }),
  );
  const regenConversationId = conversationIdFrom(firstEvents);
  createdConversationIds.push(regenConversationId);
  const [, firstAnswer] = await rowsOf(regenConversationId);
  const firstDocumentId = pointerOf(firstAnswer.parts)?.documentId;
  assert.ok(firstDocumentId, "The first Studio answer is saved as a document");
  createdDocumentIds.push(firstDocumentId);

  const regenModel = scriptedModel([
    { chunks: toolCallChunks("write_study_route", { minutesPerDay: 45 }) },
    { chunks: answerChunks(["## Hari 1\n\nRute kedua.\n"]) },
  ]);
  setVeraModelForTests(regenModel);
  await readEvents(
    await runVeraChat({
      studentId: regenOwner,
      input: { action: "regenerate", conversationId: regenConversationId, assistantMessageId: firstAnswer.id, effort: EFFORT },
      signal,
    }),
  );
  assert.deepEqual(
    regenModel.doStreamCalls[0]?.toolChoice,
    { type: "tool", toolName: "write_study_route" },
    "Ulangi asks for the same Studio tool first",
  );
  const [, secondAnswer] = await rowsOf(regenConversationId);
  const secondDocumentId = pointerOf(secondAnswer.parts)?.documentId;
  assert.ok(secondDocumentId && secondDocumentId !== firstDocumentId, "Ulangi saves a second document");
  createdDocumentIds.push(secondDocumentId);
  assert.ok((await getStudioDocument({ studentId: regenOwner, id: firstDocumentId }))?.markdown.includes("Rute pertama."), "The first document is kept");
  assert.ok((await getStudioDocument({ studentId: regenOwner, id: secondDocumentId }))?.markdown.includes("Rute kedua."), "The second document holds the new answer");
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: regenOwner } }), 2, "Both documents are listed");

  // A Studio turn may take eight steps, so a route can finish its reads and then write. A chat turn with no Studio tool keeps its five.
  const stepsOwner = await accountId("steps");
  const stepsModel = scriptedModel([
    { chunks: toolCallChunks("write_study_route", { minutesPerDay: 60 }) },
    { chunks: toolCallChunks("get_learning_overview", {}) },
  ]);
  setVeraModelForTests(stepsModel);
  const stepsEvents = await readEvents(
    await runVeraChat({
      studentId: stepsOwner,
      input: studioInput({ tool: "study_route", input: { minutesPerDay: 60 } }),
      signal,
    }),
  );
  createdConversationIds.push(conversationIdFrom(stepsEvents));
  assert.equal(stepsModel.doStreamCalls.length, VERA_LIMITS.studioMaxSteps, "A Studio turn runs its full step count");

  const chatModel = scriptedModel([{ chunks: toolCallChunks("get_learning_overview", {}) }]);
  setVeraModelForTests(chatModel);
  const chatEvents = await readEvents(await runVeraChat({ studentId: stepsOwner, input: userInput("Ringkas hasilku"), signal }));
  createdConversationIds.push(conversationIdFrom(chatEvents));
  assert.equal(chatModel.doStreamCalls.length, VERA_LIMITS.maxSteps, "A chat turn with no Studio tool keeps its five steps");

  console.log("Vera Studio tools checks passed.");
} finally {
  setVeraModelForTests(undefined);
  // Usage events record their session only as a column, so they are removed with the session they were charged to.
  if (createdConversationIds.length) {
    await prisma.veraUsageEvent.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
    await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  }
  if (createdDocumentIds.length) {
    await prisma.veraStudioDocument.deleteMany({ where: { id: { in: createdDocumentIds } } });
  }
  await prisma.$disconnect();
}
