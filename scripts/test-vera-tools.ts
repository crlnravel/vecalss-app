import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { getPublishedLesson } from "../lib/materi/repository";
import { prisma } from "../lib/prisma";
import { runVeraChat, type VeraChatInput } from "../lib/vera/chat";
import { setVeraModelForTests } from "../lib/vera/model";
import { getKuisAttemptReview, listKuisAttempts } from "../lib/vera/sources/kuis";
import { pdfWithinLimits, readMateri, searchMateri, withTimeout } from "../lib/vera/sources/materi";
import { getTryoutResultReview, listTryoutResults, readListedRows, type ResultReader } from "../lib/vera/sources/tryout";
import { materiHref } from "../lib/vera/sources/types";
import { guarded } from "../lib/vera/tools";
import { TryoutResultReviewRequiredError } from "../lib/tryout/result-repository";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-tools only runs against the local dev database on 127.0.0.1:55432.");
}

const PART_CHARS = 8_000;

type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>> extends { stream: ReadableStream<infer Part> }
  ? Part
  : never;
type Step = { chunks: StreamPart[]; chunkDelayInMs?: number };
type StreamEvent = { type: string; [key: string]: unknown };
type ToolPart = { type: string; input?: unknown; output?: unknown };

function usageOf([input, output]: [number, number]) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

/** One model step that asks for a tool, in the provider stream protocol the SDK reads. */
function toolCallChunks(toolName: string, input: Record<string, unknown>, usage: [number, number] = [12, 2]): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `call-${crypto.randomUUID()}`, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: usageOf(usage) },
  ];
}

/** One model step that answers in text. */
function answerChunks(deltas: string[], usage: [number, number] = [12, 2]): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "answer" },
    ...deltas.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
    { type: "text-end", id: "answer" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usageOf(usage) },
  ];
}

/** A model whose successive calls follow the given steps, so a test can drive a tool call and then an answer. */
function scriptedModel(steps: Step[]) {
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
function minimalPdf(line: string) {
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

function userInput(text: string): VeraChatInput {
  return {
    message: { id: `msg-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text }] },
    effort: "cepat",
    mentions: [],
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

function toolOutputOf(events: StreamEvent[]) {
  return events.find((event) => event.type === "tool-output-available")?.output;
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

/** Usage settles after the stream ends. Waiting for it keeps the next request from meeting the one-answer concurrency limit. */
async function settledUsage(conversationId: string) {
  return waitFor(
    () =>
      prisma.veraUsageEvent
        .findFirst({
          where: { conversationId },
          select: {
            status: true,
            credits: true,
            errorCode: true,
            steps: true,
            inputTokens: true,
            outputTokens: true,
            costUsdMicros: true,
          },
        })
        .then((row) => (row && row.status !== "reserved" ? row : null)),
    "the answer's usage to settle",
  );
}

function readOf(result: Awaited<ReturnType<typeof readMateri>>) {
  if ("error" in result) throw new Error(`Expected Materi text, got ${JSON.stringify(result)}`);
  return result;
}

function reviewOf(result: Awaited<ReturnType<typeof getKuisAttemptReview>>) {
  if ("error" in result) throw new Error(`Expected a Kuis review, got ${JSON.stringify(result)}`);
  return result;
}

/** A released Tryout result that belongs to someone other than the test student. */
async function findReleasedTryout() {
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
  throw new Error("test:vera-tools needs a released Tryout result in the dev database. Seed the local dev data first.");
}

/** A top-level Materi section topic, so the test lessons sit where the catalogue shows them. */
async function findSectionTopic() {
  const topics = await prisma.topic.findMany({
    where: { code: { startsWith: "materi:" }, parentTopicId: null, isActive: true, subtest: { isActive: true } },
    select: { id: true, code: true },
    take: 200,
  });
  const topic = topics.find((candidate) => /^materi:[a-z0-9-]+:section-[123]$/u.test(candidate.code));
  if (!topic) {
    throw new Error("test:vera-tools needs a Materi section topic in the dev database. Seed the local dev data first.");
  }
  return topic;
}

/**
 * Runs an answer whose first step is a finished tool call and whose second step is cut off mid-text. Returns the conversation.
 */
async function cutOffAfterToolStep(studentId: string, firstStep: [number, number]) {
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("list_tryout_results", { limit: 1 }, firstStep) },
      { chunks: answerChunks(["Ini ", "jawaban ", "terpotong."], [1, 1]), chunkDelayInMs: 40 },
    ]),
  );
  const controller = new AbortController();
  const response = await runVeraChat({
    studentId,
    input: userInput("Hasil Tryout terakhirku apa?"),
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
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
    // An aborted reader may reject; the settled usage row is what matters here.
  }
  const conversationId = seen.match(/"conversationId":"([0-9a-f-]{36})"/)?.[1];
  assert.ok(conversationId, "The cut-off stream still announces its conversation");
  return conversationId;
}

/** One asset row attached to a test lesson. */
type ModuleAssetInput = {
  assetType: "attachment" | "text";
  sourceKind?: "managed" | "hosted";
  managedAssetId?: string;
  mimeType?: string;
  originalName?: string;
  bodyText?: string;
};

const createdConversationIds: string[] = [];
const createdModuleIds: string[] = [];
const token = `vtools${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const past = new Date(Date.now() - 60_000);

try {
  // Dedicated account: its usage starts clean, so the burst limit only counts this run.
  const testStudent = await prisma.user.upsert({
    where: { email: "vera-tools-test@vecalss.local" },
    update: {},
    create: { email: "vera-tools-test@vecalss.local", fullName: "Vera Tools Test", passwordHash: "test-only" },
    select: { id: true },
  });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudent.id } });
  await prisma.veraConversation.deleteMany({ where: { studentId: testStudent.id } });

  // Another student's released Tryout result is the foreign data every check must keep out of reach.
  const owned = await findReleasedTryout();
  assert.notEqual(owned.studentId, testStudent.id, "The foreign Tryout result belongs to another student");

  // Kuis: the test student's attempt hides correctness; the other student's attempt is the foreign one.
  const subtest = await prisma.subtest.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  assert.ok(subtest, "The dev database has an active subtest");
  const kuisPolicy = { reviewTiming: "immediate", correctAnswerVisibility: "hide" };
  const quiz = await prisma.standaloneQuiz.create({
    data: {
      slug: `vera-tools-kuis-${token}`,
      title: `Kuis uji ${token}`,
      subtestId: subtest.id,
      status: "published",
      reviewTiming: "immediate",
      correctAnswerVisibility: "hide",
      createdByUserId: testStudent.id,
    },
    select: { id: true },
  });
  const releasedKuisAttempt = async (studentId: string, score: number) => {
    const participation = await prisma.standaloneQuizParticipation.create({
      data: { quizId: quiz.id, studentId, policySnapshot: kuisPolicy },
      select: { id: true },
    });
    return prisma.standaloneQuizAttempt.create({
      data: {
        participationId: participation.id,
        attemptNo: 1,
        status: "scored",
        attemptState: "submitted",
        scoringState: "scored",
        releaseState: "released",
        policySnapshot: kuisPolicy,
        formItemOrder: [],
        score,
        correctCount: 4,
        wrongCount: 1,
        unansweredCount: 0,
        releaseAt: past,
        submittedAt: past,
      },
      select: { id: true },
    });
  };
  const ownKuis = await releasedKuisAttempt(testStudent.id, 80);
  const foreignKuis = await releasedKuisAttempt(owned.studentId, 60);

  // Materi: one PDF lesson, one lesson with body text, and one draft that must stay invisible.
  const topic = await findSectionTopic();
  const courseSlug = topic.code.split(":")[1];
  const pdf = minimalPdf(`Materi uji ${token} tentang logika`);
  const file = await prisma.asset.create({
    data: {
      objectKey: `vera-tools-test/${token}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: pdf.byteLength,
      originalName: "uji.pdf",
      libraryScope: "kapten",
      state: "ready",
      checksum: token,
    },
    select: { id: true, objectKey: true },
  });
  const lastSequence = await prisma.module.aggregate({ where: { topicId: topic.id }, _max: { sequenceNo: true } });
  let sequenceNo = lastSequence._max.sequenceNo ?? 0;
  const createModule = async ({
    code,
    title,
    status,
    assets,
  }: {
    code: string;
    title: string;
    status: "published" | "draft";
    assets: ModuleAssetInput[];
  }) => {
    sequenceNo += 1;
    const lesson = await prisma.module.create({
      data: {
        topicId: topic.id,
        code,
        title,
        sequenceNo,
        status,
        publishedAt: status === "published" ? past : null,
      },
      select: { id: true, code: true },
    });
    createdModuleIds.push(lesson.id);
    for (const [index, asset] of assets.entries()) {
      await prisma.moduleAsset.create({ data: { moduleId: lesson.id, sortOrder: index, ...asset } });
    }
    return lesson;
  };
  const pdfAsset: ModuleAssetInput = {
    assetType: "attachment",
    sourceKind: "managed",
    managedAssetId: file.id,
    mimeType: "application/pdf",
    originalName: "uji.pdf",
  };
  const plain = await createModule({
    code: `vera-tools-a-${token}`,
    title: `Materi uji ${token} bagian satu`,
    status: "published",
    assets: [pdfAsset],
  });
  const body = `Materi uji ${token}. `.repeat(900);
  const withBody = await createModule({
    code: `vera-tools-b-${token}`,
    title: `Materi uji ${token} dengan teks`,
    status: "published",
    assets: [pdfAsset, { assetType: "text", bodyText: body }],
  });
  const draft = await createModule({
    code: `vera-tools-d-${token}`,
    title: `Materi uji ${token} draf`,
    status: "draft",
    assets: [pdfAsset],
  });

  let storageReads = 0;
  const readPdf = async (objectKey: string) => {
    storageReads += 1;
    assert.equal(objectKey, file.objectKey);
    return pdf;
  };

  // Body text wins over the PDF, and long text is cut into parts of 8 000 characters.
  const parts = Math.ceil(body.length / PART_CHARS);
  const lastPart = readOf(await readMateri({ moduleId: withBody.id, part: parts, readPdf }));
  assert.equal(lastPart.totalParts, parts);
  assert.equal(lastPart.part, parts);
  assert.equal(lastPart.text.length, body.length - (parts - 1) * PART_CHARS, "The last part holds the rest of the text");
  assert.equal(storageReads, 0, "A lesson with body text never reads its PDF");

  // The PDF text is extracted once, then reused from the cache.
  const firstRead = readOf(await readMateri({ moduleId: plain.id, readPdf }));
  assert.ok(
    firstRead.text.includes(`Materi uji ${token} tentang logika`),
    `The PDF text is extracted, got ${JSON.stringify(firstRead.text.slice(0, 300))}`,
  );
  const secondRead = readOf(await readMateri({ moduleId: plain.id, readPdf }));
  assert.equal(secondRead.text, firstRead.text);
  assert.equal(storageReads, 1, "The second read reuses the cached text instead of reading the PDF again");
  const plainAsset = await prisma.moduleAsset.findFirst({ where: { moduleId: plain.id }, select: { id: true } });
  const cached = await prisma.veraMateriText.findUnique({
    where: { moduleAssetId: plainAsset?.id ?? "" },
    select: { moduleId: true },
  });
  assert.equal(cached?.moduleId, plain.id, "The extracted text is stored against its lesson");

  // Search finds published lessons only, and each hit links to a lesson the catalogue opens.
  const hits = await searchMateri({ query: token });
  const hitIds = hits.map((hit) => hit.moduleId);
  assert.ok(hitIds.includes(plain.id) && hitIds.includes(withBody.id), "Published Materi that match are found");
  assert.ok(!hitIds.includes(draft.id), "A draft Materi is invisible to search");
  const plainHit = hits.find((hit) => hit.moduleId === plain.id);
  assert.equal(plainHit?.source.href, materiHref(topic.code, plain.code), "The hit links to the lesson page");
  assert.ok(await getPublishedLesson(courseSlug, plain.code), "The Materi link opens a published lesson");
  assert.deepEqual(await readMateri({ moduleId: draft.id }), { error: "not_found" }, "A draft Materi is invisible to reads");

  // Tryout: a result that is not released yet by its date is invisible, and so is another student's result.
  assert.deepEqual(
    await listTryoutResults({ studentId: owned.studentId, limit: 5, now: new Date(0) }),
    [],
    "A Tryout result that is not released yet is invisible",
  );
  assert.deepEqual(
    await getTryoutResultReview({ studentId: owned.studentId, attemptId: owned.id, now: new Date(0) }),
    { error: "not_found" },
    "A Tryout result that is not released yet cannot be read",
  );
  const unreleased = await prisma.tryoutAttempt.findFirst({
    where: { releaseState: { not: "released" } },
    select: { id: true, studentId: true },
  });
  if (unreleased) {
    assert.deepEqual(
      await getTryoutResultReview({ studentId: unreleased.studentId, attemptId: unreleased.id }),
      { error: "not_found" },
      "An unreleased Tryout result is invisible to its own student",
    );
  }
  assert.deepEqual(
    await getTryoutResultReview({ studentId: testStudent.id, attemptId: owned.id }),
    { error: "not_found" },
    "Another student's Tryout result is not found",
  );
  assert.deepEqual(await listTryoutResults({ studentId: testStudent.id, limit: 5 }), []);
  const ownedReview = await getTryoutResultReview({ studentId: owned.studentId, attemptId: owned.id, onlyWrong: false });
  if ("error" in ownedReview) {
    throw new Error(`The owner can read their own result, got ${JSON.stringify(ownedReview)}`);
  }
  assert.equal(ownedReview.source.href, `/tryout/attempt/${owned.id}/result`);

  // A list keeps every row: a result under review is listed as such, and the reader calls never overlap.
  const reviewAttemptId = crypto.randomUUID();
  let inFlight = 0;
  let peakInFlight = 0;
  const readWithReview: ResultReader = async (attemptId) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (attemptId === reviewAttemptId) throw new TryoutResultReviewRequiredError("Hasil Tryout perlu ditinjau.");
      return { released: true, runs: [{ subtestName: "Penalaran Umum", materializedScore: { normalizedScore: 80 } }] };
    } finally {
      inFlight -= 1;
    }
  };
  const listedRows = await readListedRows(
    [
      { id: owned.id, score: null, releaseAt: past, tryout: { title: "Tryout uji released" } },
      { id: reviewAttemptId, score: null, releaseAt: past, tryout: { title: "Tryout uji ditinjau" } },
    ],
    owned.studentId,
    readWithReview,
  );
  assert.equal(listedRows.length, 2, "Both rows are listed, the one under review included");
  assert.equal(listedRows[0].status, "released");
  assert.deepEqual(listedRows[0].subtests, [{ subtest: "Penalaran Umum", score: 80 }]);
  assert.equal(listedRows[1].status, "under_review");
  assert.equal(listedRows[1].subtests, null, "A result under review has no subtest scores yet");
  assert.equal(peakInFlight, 1, "The reader calls run one after another, never in parallel");

  // A failing tool reports only that it could not read, so its message never reaches the model or the stored answer.
  assert.deepEqual(await guarded("list_kuis_attempts", async () => ({ attempts: [] })), { attempts: [] });
  assert.deepEqual(
    await guarded("list_kuis_attempts", async () => {
      throw new Error("SELECT secret FROM vera_usage_events");
    }),
    { error: "unavailable" },
  );

  // Kuis: another student's attempt is not found, and the test student's hidden correctness returns no item answers.
  assert.deepEqual(
    await getKuisAttemptReview({ studentId: testStudent.id, attemptId: foreignKuis.id }),
    { error: "not_found" },
    "Another student's Kuis attempt is not found",
  );
  const ownKuisList = await listKuisAttempts({ studentId: testStudent.id, limit: 10 });
  assert.ok(ownKuisList.some((row) => row.attemptId === ownKuis.id), "A student's own Kuis attempt is listed");
  assert.ok(!ownKuisList.some((row) => row.attemptId === foreignKuis.id), "Another student's Kuis attempt is not listed");
  const hidden = reviewOf(await getKuisAttemptReview({ studentId: testStudent.id, attemptId: ownKuis.id }));
  assert.equal(hidden.reviewAvailable, true);
  assert.equal(hidden.correctnessVisible, false);
  assert.deepEqual(hidden.items, [], "Hidden correctness returns no item answers");
  assert.match(hidden.limitation ?? "", /Kunci jawaban belum dibuka/, "The limitation says why");
  assert.equal(hidden.correct, 4, "The score facts are still shown");

  // The model asks for the owner's Tryout list, and the answer keeps the link the tool returned.
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("list_tryout_results", { limit: 3 }) },
      { chunks: answerChunks(["Hasil terakhirmu ", "sudah ada."]) },
    ]),
  );
  const listEvents = await readEvents(
    await runVeraChat({
      studentId: owned.studentId,
      input: userInput("Bagaimana hasil Tryout terakhirku?"),
      signal: new AbortController().signal,
    }),
  );
  const listConversationId = conversationIdFrom(listEvents);
  createdConversationIds.push(listConversationId);
  assert.equal(streamedText(listEvents), "Hasil terakhirmu sudah ada.");
  const listed = toolOutputOf(listEvents) as { results?: Array<{ attemptId: string }> } | undefined;
  assert.ok(listed?.results?.some((result) => result.attemptId === owned.id), "The tool lists the student's own Tryout result");
  await settledUsage(listConversationId);
  const listedAnswer = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: listConversationId, role: "assistant" },
        select: { sources: true },
      }),
    "the answer's sources to be saved",
  );
  const sources = listedAnswer.sources as Array<{ type: string; id: string; href: string }> | null;
  assert.ok(
    sources?.some((source) => source.type === "tryout" && source.id === owned.id && source.href === `/tryout/attempt/${owned.id}/result`),
    "The answer keeps the Tryout link the tool returned",
  );

  // The model asks for another student's Tryout result. The loop refuses it, and nothing from that result is stored.
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("get_tryout_result_review", { attemptId: owned.id, onlyWrong: true }) },
      { chunks: answerChunks(["Maaf, hasil itu tidak bisa dibuka."]) },
    ]),
  );
  const foreignEvents = await readEvents(
    await runVeraChat({
      studentId: testStudent.id,
      input: userInput("Buka pembahasan Tryout orang lain"),
      signal: new AbortController().signal,
    }),
  );
  const foreignConversationId = conversationIdFrom(foreignEvents);
  createdConversationIds.push(foreignConversationId);
  assert.deepEqual(toolOutputOf(foreignEvents), { error: "not_found" }, "The loop refuses another student's attempt");
  await settledUsage(foreignConversationId);
  const foreignAnswer = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: foreignConversationId, role: "assistant" },
        select: { parts: true, sources: true },
      }),
    "the refused answer to be saved",
  );
  const storedTools = (foreignAnswer.parts as ToolPart[]).filter((part) => part.type.startsWith("tool-"));
  assert.equal(storedTools.length, 1, "The refused call is stored once");
  assert.deepEqual(storedTools[0].output, { error: "not_found" });
  assert.deepEqual(storedTools[0].input, {}, "A refused call stores no input");
  const storedJson = JSON.stringify(foreignAnswer.parts);
  assert.ok(!storedJson.includes(owned.id), "The stored answer never names the refused attempt");
  assert.ok(!storedJson.includes(owned.tryout.title), "The stored answer never shows the refused result");
  assert.equal(foreignAnswer.sources, null, "The refused answer lists no source");

  // Cut off during a second step. The finished tool step is billed, and the answer is billed at least the cepat reserve (2 credits).
  const shortConversationId = await cutOffAfterToolStep(testStudent.id, [100, 1_000]);
  createdConversationIds.push(shortConversationId);
  const shortFirst = await settledUsage(shortConversationId);
  assert.equal(shortFirst.status, "settled", "An answer cut off after generation started is settled");
  assert.equal(shortFirst.errorCode, "aborted");
  assert.equal(shortFirst.steps, 1, "Only the finished tool step counts as a completed step");
  assert.equal(Number(shortFirst.costUsdMicros), 4_700, "A cut-off step is charged the reserve when the finished step cost less");
  assert.equal(Number(shortFirst.credits), 2);

  // When the finished step cost more than the reserve, the charge is what it actually cost.
  const longConversationId = await cutOffAfterToolStep(testStudent.id, [1_000, 10_000]);
  createdConversationIds.push(longConversationId);
  const longFirst = await settledUsage(longConversationId);
  assert.equal(longFirst.status, "settled");
  assert.equal(longFirst.errorCode, "aborted");
  assert.equal(longFirst.steps, 1);
  assert.equal(Number(longFirst.inputTokens), 1_000);
  assert.equal(Number(longFirst.outputTokens), 10_000);
  assert.equal(Number(longFirst.costUsdMicros), 5_100, "A finished step that cost more than the reserve is charged in full");
  assert.equal(Number(longFirst.credits), 2.2);

  // PDF limits: a file over 25 MB is not read at all. Work that runs past its time limit gives up with null, so the lesson reports
  // that it is not available instead of holding a model call.
  assert.equal(pdfWithinLimits(1_024), true, "A small PDF is read");
  assert.equal(pdfWithinLimits(26 * 1024 * 1024), false, "A PDF over 25 MB is not read");
  assert.equal(await withTimeout(Promise.resolve("selesai"), 1_000), "selesai", "Work inside its time limit keeps its value");
  assert.equal(
    await withTimeout(new Promise<string>((resolve) => setTimeout(() => resolve("terlambat"), 300)), 20),
    null,
    "Work that runs past its time limit reports null",
  );

  console.log("Vera tools checks passed.");
} finally {
  setVeraModelForTests(undefined);
  await prisma.veraUsageEvent.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
  await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  await prisma.standaloneQuiz.deleteMany({ where: { slug: { startsWith: "vera-tools-kuis-" } } });
  await prisma.veraMateriText.deleteMany({ where: { moduleId: { in: createdModuleIds } } });
  await prisma.moduleAsset.deleteMany({ where: { moduleId: { in: createdModuleIds } } });
  await prisma.module.deleteMany({ where: { id: { in: createdModuleIds } } });
  await prisma.asset.deleteMany({ where: { objectKey: { startsWith: "vera-tools-test/" } } });
  await prisma.$disconnect();
}
