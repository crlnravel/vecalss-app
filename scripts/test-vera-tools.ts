import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { getPublishedLesson } from "../lib/materi/repository";
import { prisma } from "../lib/prisma";
import { runVeraChat, type VeraChatInput } from "../lib/vera/chat";
import { setVeraModelForTests } from "../lib/vera/model";
import { getKuisAttemptReview, listKuisAttempts } from "../lib/vera/sources/kuis";
import { pdfWithinLimits, readMateri, searchMateri, withTimeout } from "../lib/vera/sources/materi";
import { newestFirst, newestResultOf, resultTime } from "../lib/vera/sources/result-time";
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

/** A top-level Materi section topic, so the test lessons sit where the catalogue shows them. A course slug picks that course. */
async function findSectionTopic(course?: string) {
  const topics = await prisma.topic.findMany({
    where: {
      code: { startsWith: course ? `materi:${course}:` : "materi:" },
      parentTopicId: null,
      isActive: true,
      subtest: { isActive: true },
    },
    select: { id: true, code: true, subtest: { select: { code: true, name: true } } },
    take: 200,
  });
  const topic = topics.find((candidate) => /^materi:[a-z0-9-]+:section-[123]$/u.test(candidate.code));
  if (!topic) {
    throw new Error(
      `test:vera-tools needs a Materi section topic${course ? ` for ${course}` : ""} in the dev database. Seed the local dev data first.`,
    );
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
  const participationFor = (studentId: string) =>
    prisma.standaloneQuizParticipation.create({
      data: { quizId: quiz.id, studentId, policySnapshot: kuisPolicy },
      select: { id: true },
    });
  /** One attempt under a participation. Its status, scoring and release states decide whether the student can see it. */
  const kuisAttemptFor = (
    participationId: string,
    attemptNo: number,
    score: number,
    state: {
      status: "submitted" | "scored";
      scoringState: "scored" | "review_required";
      releaseState: "released" | "scheduled" | "hidden";
      releaseAt: Date | null;
    },
  ) =>
    prisma.standaloneQuizAttempt.create({
      data: {
        participationId,
        attemptNo,
        ...state,
        attemptState: "submitted",
        policySnapshot: kuisPolicy,
        formItemOrder: [],
        score,
        correctCount: 4,
        wrongCount: 1,
        unansweredCount: 0,
        submittedAt: past,
      },
      select: { id: true },
    });
  const ownParticipation = await participationFor(testStudent.id);
  const ownKuis = await kuisAttemptFor(ownParticipation.id, 1, 80, {
    status: "scored",
    scoringState: "scored",
    releaseState: "released",
    releaseAt: past,
  });
  const foreignParticipation = await participationFor(owned.studentId);
  const foreignKuis = await kuisAttemptFor(foreignParticipation.id, 1, 60, {
    status: "scored",
    scoringState: "scored",
    releaseState: "released",
    releaseAt: past,
  });
  // The test student's other attempts on the same quiz, one for each state that decides whether a student sees a result.
  const immediate = await kuisAttemptFor(ownParticipation.id, 2, 70, {
    status: "submitted",
    scoringState: "scored",
    releaseState: "released",
    releaseAt: null,
  });
  const scheduledDue = await kuisAttemptFor(ownParticipation.id, 3, 70, {
    status: "scored",
    scoringState: "scored",
    releaseState: "scheduled",
    releaseAt: past,
  });
  const scheduledLater = await kuisAttemptFor(ownParticipation.id, 4, 70, {
    status: "scored",
    scoringState: "scored",
    releaseState: "scheduled",
    releaseAt: new Date(Date.now() + 86_400_000),
  });
  const underReview = await kuisAttemptFor(ownParticipation.id, 5, 70, {
    status: "scored",
    scoringState: "review_required",
    releaseState: "released",
    releaseAt: past,
  });
  const stillHidden = await kuisAttemptFor(ownParticipation.id, 6, 70, {
    status: "scored",
    scoringState: "scored",
    releaseState: "hidden",
    releaseAt: past,
  });

  // Result times: an immediate Kuis is dated by its submit time, and a scheduled one by its release time. A later release ranks above an earlier immediate one.
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  const immediateSubmitted = hoursAgo(2);
  const scheduledReleased = hoursAgo(1);
  const earlierImmediate = await prisma.standaloneQuizAttempt.create({
    data: {
      participationId: ownParticipation.id,
      attemptNo: 7,
      status: "submitted",
      attemptState: "submitted",
      scoringState: "scored",
      releaseState: "released",
      releaseAt: null,
      policySnapshot: kuisPolicy,
      formItemOrder: [],
      score: 75,
      correctCount: 3,
      wrongCount: 2,
      unansweredCount: 0,
      submittedAt: immediateSubmitted,
    },
    select: { id: true },
  });
  const laterScheduled = await prisma.standaloneQuizAttempt.create({
    data: {
      participationId: ownParticipation.id,
      attemptNo: 8,
      status: "scored",
      attemptState: "submitted",
      scoringState: "scored",
      releaseState: "scheduled",
      releaseAt: scheduledReleased,
      policySnapshot: kuisPolicy,
      formItemOrder: [],
      score: 85,
      correctCount: 4,
      wrongCount: 1,
      unansweredCount: 0,
      submittedAt: hoursAgo(3),
    },
    select: { id: true },
  });

  // Materi in one course: a PDF lesson, a lesson with body text, a draft, and one with no readable file. The last two stay hidden.
  const topic = await findSectionTopic("penalaran-umum");
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
  const unreadable = await createModule({
    code: `vera-tools-u-${token}`,
    title: `Materi uji ${token} tanpa berkas`,
    status: "published",
    assets: [{ assetType: "attachment", mimeType: "application/pdf", originalName: "belum-ada.pdf" }],
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
  assert.ok(!hitIds.includes(unreadable.id), "A published Materi with no readable text is not offered by search");
  const plainHit = hits.find((hit) => hit.moduleId === plain.id);
  assert.equal(plainHit?.source.href, materiHref(topic.code, plain.code), "The hit links to the lesson page");
  assert.ok(await getPublishedLesson(courseSlug, plain.code), "The Materi link opens a published lesson");
  assert.deepEqual(await readMateri({ moduleId: draft.id }), { error: "not_found" }, "A draft Materi is invisible to reads");

  // A subtest's name finds its readable lessons, even when the lesson's own words do not name it.
  const byName = (await searchMateri({ query: topic.subtest.name })).map((hit) => hit.moduleId);
  assert.ok(byName.includes(plain.id) && byName.includes(withBody.id), "Readable Materi are found by their subtest name");
  // A subtest on its own lists its readable Materi, and leaves out drafts and lessons with no readable text.
  const browse = await searchMateri({ subtest: topic.subtest.code.toLowerCase() });
  const browseIds = browse.map((hit) => hit.moduleId);
  assert.ok(browseIds.includes(plain.id) && browseIds.includes(withBody.id), "A subtest on its own lists its readable Materi");
  assert.ok(browse.every((hit) => hit.subtest === topic.subtest.name), "A subtest listing holds only that subtest's Materi");
  assert.ok(
    !browseIds.includes(draft.id) && !browseIds.includes(unreadable.id),
    "A subtest listing leaves out drafts and Materi with no readable text",
  );
  assert.deepEqual(await searchMateri({ query: " " }), [], "Without words or a subtest, nothing is found");

  // The 24-candidate pool is taken after the readable filter, so 25 newer unreadable matches cannot hide a readable lesson.
  const capToken = `vcap${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const olderReadable = await createModule({
    code: `vera-tools-o-${capToken}`,
    title: `Materi uji ${capToken} lama`,
    status: "published",
    assets: [pdfAsset, { assetType: "text", bodyText: `Materi uji ${capToken} punya isi.` }],
  });
  await prisma.module.update({ where: { id: olderReadable.id }, data: { publishedAt: new Date(past.getTime() - 86_400_000) } });
  for (let index = 0; index < 25; index += 1) {
    await createModule({
      code: `vera-tools-n${index}-${capToken}`,
      title: `Materi uji ${capToken} tanpa berkas ${index}`,
      status: "published",
      assets: [{ assetType: "attachment", mimeType: "application/pdf", originalName: "belum.pdf" }],
    });
  }
  assert.ok(
    (await searchMateri({ query: capToken })).some((hit) => hit.moduleId === olderReadable.id),
    "A readable lesson is still found behind 25 newer unreadable matches",
  );

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
      { id: owned.id, score: null, releaseAt: past, submittedAt: null, createdAt: past, tryout: { title: "Tryout uji released" } },
      { id: reviewAttemptId, score: null, releaseAt: past, submittedAt: null, createdAt: past, tryout: { title: "Tryout uji ditinjau" } },
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
  // The list follows the result pages: released at once, or scheduled and past its release time. Nothing else is listed.
  const listedKuis = new Set(ownKuisList.map((row) => row.attemptId));
  assert.ok(listedKuis.has(immediate.id), "A Kuis released at once, with no release date, is listed");
  assert.ok(listedKuis.has(scheduledDue.id), "A Kuis whose scheduled release time has passed is listed");
  assert.ok(!listedKuis.has(scheduledLater.id), "A Kuis whose release time has not come is not listed");
  assert.ok(!listedKuis.has(underReview.id), "A Kuis still under review is not listed");
  assert.ok(!listedKuis.has(stillHidden.id), "A Kuis whose result is still hidden is not listed");
  const hidden = reviewOf(await getKuisAttemptReview({ studentId: testStudent.id, attemptId: ownKuis.id }));
  assert.equal(hidden.reviewAvailable, true);
  assert.equal(hidden.correctnessVisible, false);
  assert.deepEqual(hidden.items, [], "Hidden correctness returns no item answers");
  assert.match(hidden.limitation ?? "", /Kunci jawaban belum dibuka/, "The limitation says why");
  assert.equal(hidden.correct, 4, "The score facts are still shown");

  // Order: a result is dated by its release time, or by its submit time when it has no release time. The list runs newest first.
  const ordered = await listKuisAttempts({ studentId: testStudent.id, limit: 20 });
  const positionOf = (attemptId: string) => ordered.findIndex((row) => row.attemptId === attemptId);
  assert.ok(positionOf(earlierImmediate.id) >= 0 && positionOf(laterScheduled.id) >= 0, "Both new Kuis results are listed");
  assert.ok(
    positionOf(laterScheduled.id) < positionOf(earlierImmediate.id),
    "A Kuis released later ranks above an immediate one submitted before that release",
  );
  assert.equal(ordered[positionOf(earlierImmediate.id)].date, immediateSubmitted.toISOString(), "An immediate Kuis is dated by its submit time");
  assert.equal(ordered[positionOf(laterScheduled.id)].date, scheduledReleased.toISOString(), "A scheduled Kuis is dated by its release time");
  assert.ok(ordered.every((row) => !Number.isNaN(Date.parse(row.date))), "Every listed Kuis has a date");
  const instants = ordered.map((row) => Date.parse(row.date));
  assert.deepEqual(instants, [...instants].sort((left, right) => right - left), "The Kuis list runs newest first");
  assert.ok(
    (await listTryoutResults({ studentId: owned.studentId, limit: 5 })).every((row) => !Number.isNaN(Date.parse(row.date))),
    "Every listed Tryout result has a date",
  );

  // Across kinds: a Kuis released today ranks above a Tryout released yesterday, and "latest" is the newest result of either kind.
  const yesterdayDate = hoursAgo(26);
  const kuisAboveTryout = newestResultOf([
    { type: "tryout", id: "tryout-kemarin", date: yesterdayDate.toISOString() },
    { type: "kuis", id: earlierImmediate.id, date: immediateSubmitted.toISOString() },
  ]);
  assert.equal(kuisAboveTryout?.id, earlierImmediate.id, "An immediate Kuis submitted today ranks above a Tryout released yesterday");
  const newestOfBoth = newestResultOf([
    { type: "tryout", id: "tryout-kemarin", date: yesterdayDate.toISOString() },
    { type: "kuis", id: earlierImmediate.id, date: immediateSubmitted.toISOString() },
    { type: "kuis", id: laterScheduled.id, date: scheduledReleased.toISOString() },
  ]);
  assert.equal(newestOfBoth?.id, laterScheduled.id, "'Latest' picks the newest result of either kind");

  // A result with no release time is dated by its submit time, and one with neither by when it started. No date is ever missing.
  const startedLongAgo = hoursAgo(48);
  assert.deepEqual(
    newestFirst([
      { id: "dengan-jadwal", releaseAt: scheduledReleased, submittedAt: null, createdAt: startedLongAgo },
      { id: "tanpa-jadwal", releaseAt: null, submittedAt: yesterdayDate, createdAt: startedLongAgo },
      { id: "hanya-mulai", releaseAt: null, submittedAt: null, createdAt: startedLongAgo },
    ]).map((row) => row.id),
    ["dengan-jadwal", "tanpa-jadwal", "hanya-mulai"],
    "A result with no release time is dated by its submit time, then by when it started",
  );
  assert.equal(
    resultTime({ releaseAt: null, submittedAt: null, createdAt: startedLongAgo }).toISOString(),
    startedLongAgo.toISOString(),
    "A result with neither time is dated by when it started",
  );

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

  // Cut off during a second step. The finished tool step is billed at its cost, and the cut-off step adds an estimate on top of it.
  const shortConversationId = await cutOffAfterToolStep(testStudent.id, [100, 1_000]);
  createdConversationIds.push(shortConversationId);
  const shortFirst = await settledUsage(shortConversationId);
  assert.equal(shortFirst.status, "settled", "An answer cut off after generation started is settled");
  assert.equal(shortFirst.errorCode, "aborted");
  assert.equal(shortFirst.steps, 1, "Only the finished tool step counts as a completed step");
  // The finished step alone costs 510 micro-USD (100 input and 1,000 output tokens), so the estimate is what lifts the charge above it.
  assert.ok(Number(shortFirst.costUsdMicros) > 510, "The cut-off step adds its estimate to the finished step's cost");
  assert.ok(Number(shortFirst.credits) < 2, "A short finished step and its estimate cost less than the cepat reserve");

  // A finished step that cost more than the reserve is charged in full, and the cut-off estimate adds to it.
  const longConversationId = await cutOffAfterToolStep(testStudent.id, [1_000, 10_000]);
  createdConversationIds.push(longConversationId);
  const longFirst = await settledUsage(longConversationId);
  assert.equal(longFirst.status, "settled");
  assert.equal(longFirst.errorCode, "aborted");
  assert.equal(longFirst.steps, 1);
  assert.equal(Number(longFirst.inputTokens), 1_000);
  assert.equal(Number(longFirst.outputTokens), 10_000);
  assert.ok(Number(longFirst.costUsdMicros) > 5_100, "The cut-off estimate adds to a finished step that cost more than the reserve");
  assert.ok(Number(longFirst.credits) >= 2.2);

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
