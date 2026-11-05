import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import { VERA_LIMITS } from "../lib/vera/config";
import { setVeraModelForTests } from "../lib/vera/model";
import { VeraLimitError } from "../lib/vera/ledger";
import { dayWindow } from "../lib/vera/windows";
import { resolveMentions, searchMentions } from "../lib/vera/sources/mentions";
import { listTryoutResults } from "../lib/vera/sources/tryout";
import { deleteStudioDocument, getStudioDocument, listStudioDocuments } from "../lib/vera/studio-documents";
import { runVeraStudio } from "../lib/vera/studio-run";
import { keepToolLinks, studioRequestSchema, studioTitle, type StudioRequest } from "../lib/vera/studio";
import {
  answerChunks,
  findReleasedTryout,
  readEvents,
  scriptedModel,
  toolCallChunks,
  waitFor,
  type StreamEvent,
} from "./vera-test-support";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-studio only runs against the local dev database on 127.0.0.1:55432.");
}

const parseRequest = (value: unknown) => studioRequestSchema.parse(value);

function documentIdFrom(events: StreamEvent[]) {
  const start = events.find((event) => event.type === "start");
  const metadata = start?.messageMetadata as { documentId?: string } | undefined;
  assert.ok(metadata?.documentId, "The start event names the document it will save");
  return metadata.documentId;
}

/** Reads a run until its first words arrive, then cancels it the way Hentikan does. Returns what the stream sent before it closed. */
async function cutAfterFirstText(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  assert.ok(reader, "A run streams its response");
  const decoder = new TextDecoder();
  let seen = "";
  let aborted = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += decoder.decode(value, { stream: true });
      if (!aborted && seen.includes('"type":"text-delta"')) {
        aborted = true;
        controller.abort();
      }
    }
  } catch {
    // An aborted reader may reject. The saved document is what the checks read.
  }
  return seen;
}

/** The student's Studio usage, oldest first, once `count` runs have settled. */
function settledStudioUsage(studentId: string, count: number) {
  return waitFor(async () => {
    const rows = await prisma.veraUsageEvent.findMany({
      where: { studentId, kind: "studio" },
      orderBy: { createdAt: "asc" },
      select: { status: true, credits: true, errorCode: true },
    });
    return rows.length === count && rows.every((row) => row.status !== "reserved") ? rows : null;
  }, `${count} Studio run(s) to settle`);
}

const createdDocumentIds: string[] = [];
let testStudentId: string | null = null;
let streamStudentId: string | null = null;
let finalStepStudentId: string | null = null;

try {
  // Each tool accepts its own options and refuses anything else.
  assert.equal(studioRequestSchema.safeParse({ tool: "weakness_analysis", input: {} }).success, true);
  assert.equal(
    studioRequestSchema.safeParse({ tool: "weakness_analysis", input: { subtest: "" } }).success,
    false,
    "An empty subtest is refused",
  );
  assert.equal(studioRequestSchema.safeParse({ tool: "study_route", input: { minutesPerDay: 30 } }).success, true);
  assert.equal(
    studioRequestSchema.safeParse({ tool: "study_route", input: { minutesPerDay: 25 } }).success,
    false,
    "A study route comes in 20, 30, 45 or 60 minutes",
  );
  assert.equal(studioRequestSchema.safeParse({ tool: "wrong_answer_review", input: { target: "latest" } }).success, true);
  assert.equal(
    studioRequestSchema.safeParse({
      tool: "wrong_answer_review",
      input: { target: { type: "materi", id: crypto.randomUUID() } },
    }).success,
    false,
    "A review reads a Kuis or a Tryout result only",
  );
  assert.equal(
    studioRequestSchema.safeParse({ tool: "study_route", input: { minutesPerDay: 30 }, effort: "super" }).success,
    false,
  );
  assert.equal(parseRequest({ tool: "weakness_analysis", input: {} }).effort, "mendalam", "Studio defaults to Mendalam");

  // A document links only to pages the tools returned. Any other link keeps its text and loses its target.
  const returned = [{ type: "kuis" as const, id: "a", label: "Kuis", href: "/quiz/pu/x/result?attemptId=a" }];
  assert.equal(
    keepToolLinks(
      "Lihat [hasil](/quiz/pu/x/result?attemptId=a), [palsu](/courses/palsu/x), dan [luar](https://contoh.id).",
      returned,
    ),
    "Lihat [hasil](/quiz/pu/x/result?attemptId=a), palsu, dan luar.",
  );
  assert.ok(studioTitle("study_route", new Date()).startsWith("Rute Belajar 7 Hari · "), "The title names the tool and the date");

  const testStudent = await prisma.user.upsert({
    where: { email: "vera-studio-test@vecalss.local" },
    update: {},
    create: { email: "vera-studio-test@vecalss.local", fullName: "Vera Studio Test", passwordHash: "test-only" },
    select: { id: true },
  });
  testStudentId = testStudent.id;
  await prisma.veraStudioDocument.deleteMany({ where: { studentId: testStudent.id } });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudent.id } });

  // The owner of a released Tryout result runs the tools, so the tools have real results to read and link.
  const owned = await findReleasedTryout();
  const ownerId = owned.studentId;
  // The released Tryout belongs to the demo student, and the day's limit counts each student's own runs. Clear that student's usage
  // from today first, so the limit reflects these checks alone and cannot refuse them.
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: ownerId, createdAt: { gte: dayWindow(new Date()).start } } });
  const latest = (await listTryoutResults({ studentId: ownerId, limit: 1 }))[0];
  assert.ok(latest, "The owner has a released result to review");

  // Analisis Kelemahan: the model reads the tryout list, then writes a document that keeps only the link the tools returned.
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("list_tryout_results", { limit: 5 }) },
      {
        chunks: answerChunks([
          `## Ringkasan\nHasilmu sudah tercatat. Lihat [hasil tryout](/tryout/attempt/${owned.id}/result) dan [materi palsu](/courses/palsu/materi).`,
        ]),
      },
    ]),
  );
  const weaknessEvents = await readEvents(
    await runVeraStudio({
      studentId: ownerId,
      request: parseRequest({ tool: "weakness_analysis", input: {} }),
      signal: new AbortController().signal,
    }),
  );
  const weaknessId = documentIdFrom(weaknessEvents);
  createdDocumentIds.push(weaknessId);
  const weakness = await waitFor(
    () => getStudioDocument({ studentId: ownerId, id: weaknessId }),
    "the Analisis Kelemahan document to be saved",
  );
  assert.equal(weakness.tool, "weakness_analysis");
  assert.match(weakness.title, /^Analisis Kelemahan · /, "The title names the tool and the date");
  assert.ok(weakness.markdown.includes(`(/tryout/attempt/${owned.id}/result)`), "A link the tools returned is kept");
  assert.ok(!weakness.markdown.includes("/courses/palsu"), "A link the tools did not return is dropped");
  assert.ok(weakness.sources.some((source) => source.type === "tryout" && source.id === owned.id), "The document lists its source");
  assert.ok(weakness.credits > 0, "The document shows a credit charge");

  // The charge is a settled Studio usage event, and it points at the document it paid for.
  const weaknessUsage = await waitFor(
    () =>
      prisma.veraUsageEvent.findFirst({
        where: { studioDocumentId: weaknessId },
        select: { kind: true, status: true, credits: true },
      }),
    "the Studio usage to be recorded",
  );
  assert.equal(weaknessUsage.kind, "studio");
  assert.equal(weaknessUsage.status, "settled");
  assert.equal(Number(weaknessUsage.credits), weakness.credits, "The charge on the document matches the settled usage");

  // Bahas Soal Salah on the latest result: the review is read, and the reviewed result is always a source of the document.
  setVeraModelForTests(
    scriptedModel([
      { chunks: toolCallChunks("get_tryout_result_review", { attemptId: latest.attemptId, onlyWrong: true }) },
      {
        chunks: answerChunks([
          `### Soal 1\nLangkah kedua terlewat. Pola yang perlu diingat: periksa basis perubahan.\nRujukan: [hasil tryout](/tryout/attempt/${latest.attemptId}/result).`,
        ]),
      },
    ]),
  );
  const reviewEvents = await readEvents(
    await runVeraStudio({
      studentId: ownerId,
      request: parseRequest({ tool: "wrong_answer_review", input: { target: "latest" } }),
      signal: new AbortController().signal,
    }),
  );
  const reviewId = documentIdFrom(reviewEvents);
  createdDocumentIds.push(reviewId);
  const review = await waitFor(() => getStudioDocument({ studentId: ownerId, id: reviewId }), "the review document to be saved");
  assert.match(review.title, /^Bahas Soal Salah · /);
  assert.ok(review.markdown.includes("### Soal 1"), "Each wrong item is a heading");
  assert.ok(
    review.sources.some((source) => source.type === "tryout" && source.id === latest.attemptId),
    "The reviewed result is a source of the document",
  );

  // Another student cannot read or delete the owner's documents.
  assert.equal(await getStudioDocument({ studentId: testStudent.id, id: weaknessId }), null, "Another student cannot read a document");
  assert.equal(await deleteStudioDocument({ studentId: testStudent.id, id: weaknessId }), false, "Another student cannot delete a document");
  assert.ok(await getStudioDocument({ studentId: ownerId, id: weaknessId }), "The owner still has the document");
  const listed = await listStudioDocuments({ studentId: ownerId });
  assert.ok(listed.some((document) => document.id === weaknessId) && listed.some((document) => document.id === reviewId));
  const times = listed.map((document) => Date.parse(document.createdAt));
  assert.deepEqual(times, [...times].sort((left, right) => right - left), "Documents are listed newest first");

  // Studio documents can be pinned with @: the owner can, another student cannot.
  const pinnedOwn = await resolveMentions({ studentId: ownerId, mentions: [{ type: "studio", id: weaknessId }] });
  assert.equal(pinnedOwn.accepted.length, 1, "The student's own document pins");
  assert.ok(pinnedOwn.pinned[0].body.includes("Ringkasan"), "The pinned body is the document's markdown");
  const pinnedForeign = await resolveMentions({ studentId: testStudent.id, mentions: [{ type: "studio", id: weaknessId }] });
  assert.equal(pinnedForeign.accepted.length, 0, "Another student's document cannot be pinned");
  const menuOwn = await searchMentions({ studentId: ownerId, query: "Analisis" });
  assert.ok(menuOwn.studio.some((candidate) => candidate.id === weaknessId), "The owner's document is offered");
  const menuForeign = await searchMentions({ studentId: testStudent.id, query: "Analisis" });
  assert.ok(!menuForeign.studio.some((candidate) => candidate.id === weaknessId), "Another student's document is not offered");

  // A run's stream ends in one of three ways. Each settles its reservation once, and saves a document only when it wrote some text.
  const streamStudent = await prisma.user.upsert({
    where: { email: "vera-studio-stream-test@vecalss.local" },
    update: {},
    create: { email: "vera-studio-stream-test@vecalss.local", fullName: "Vera Studio Stream Test", passwordHash: "test-only" },
    select: { id: true },
  });
  const streamId = streamStudent.id;
  streamStudentId = streamId;
  await prisma.veraStudioDocument.deleteMany({ where: { studentId: streamId } });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: streamId } });
  const studyRoute = parseRequest({ tool: "study_route", input: { minutesPerDay: 30 } });

  // A provider failure before any text saves no document and releases the reservation: nothing was written, so nothing is billed.
  setVeraModelForTests(
    new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("Provider tidak tersedia.");
      },
    }),
  );
  await readEvents(await runVeraStudio({ studentId: streamId, request: studyRoute, signal: new AbortController().signal }));
  const [failedRun] = await settledStudioUsage(streamId, 1);
  assert.ok(failedRun, "The failed run's usage is recorded");
  assert.equal(failedRun.status, "released", "A failure before any text releases the reservation");
  assert.equal(Number(failedRun.credits), 0);
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: streamId } }), 0, "A failure before any text saves nothing");

  // A run that fails after its reservation and before it streams (here, a tool the Studio does not know) releases the reservation.
  // Without the release, the student would stay blocked until the stale sweep, and then be charged the whole reserve. This block
  // runs after the count above, because its own usage row would otherwise change that count.
  setVeraModelForTests(scriptedModel([{ chunks: answerChunks(["Tidak pernah dipakai."]) }]));
  const setupSince = new Date(Date.now() - 1_000);
  await assert.rejects(
    runVeraStudio({
      studentId: streamId,
      request: { tool: "unknown_tool", input: {}, effort: "mendalam" } as unknown as StudioRequest,
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof TypeError,
    "A tool the Studio does not know fails during setup",
  );
  const setupUsage = await prisma.veraUsageEvent.findFirst({
    where: { studentId: streamId, kind: "studio", createdAt: { gte: setupSince } },
    orderBy: { createdAt: "desc" },
    select: { status: true, errorCode: true, credits: true },
  });
  assert.equal(setupUsage?.status, "released", "A setup failure after the reservation releases it");
  assert.equal(setupUsage?.errorCode, "setup_failed", "The released row records the setup failure");
  assert.equal(Number(setupUsage?.credits), 0, "A released setup failure is charged nothing");
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: streamId } }), 0, "A setup failure saves no document");

  // A run cut off after its first words keeps them as an incomplete document, and is charged the Mendalam reserve.
  setVeraModelForTests(
    scriptedModel([{ chunks: answerChunks(["Bagian pertama dokumen ", "yang belum selesai ditulis."]), chunkDelayInMs: 40 }]),
  );
  const cut = new AbortController();
  const cutBody = await cutAfterFirstText(await runVeraStudio({ studentId: streamId, request: studyRoute, signal: cut.signal }), cut);
  const cutId = cutBody.match(/"documentId":"([0-9a-f-]{36})"/)?.[1];
  assert.ok(cutId, "The cut-off run still names its document");
  createdDocumentIds.push(cutId);
  const cutDocument = await waitFor(() => getStudioDocument({ studentId: streamId, id: cutId }), "the cut-off document to be saved");
  assert.equal(cutDocument.complete, false, "A run cut off after some text is kept as incomplete");
  assert.ok(cutDocument.markdown.includes("Bagian pertama dokumen"), "The words written before the cut are kept");
  assert.equal(cutDocument.credits, 5, "A cut-off run is charged the Mendalam reserve");
  const cutUsage = await waitFor(
    () =>
      prisma.veraUsageEvent.findFirst({
        where: { studioDocumentId: cutId },
        select: { status: true, credits: true, errorCode: true },
      }),
    "the cut-off run's usage to be linked",
  );
  assert.equal(cutUsage.status, "settled", "A cut-off run that wrote text is settled, not released");
  assert.equal(Number(cutUsage.credits), cutDocument.credits, "The charge on the document matches the settled usage");
  assert.equal(cutUsage.errorCode, "aborted", "The settled row records that the run was cut off");

  // A provider failure after some text keeps those words as an incomplete document, charged the same way.
  setVeraModelForTests(
    scriptedModel([
      {
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "Rute yang sempat tersusun " },
          { type: "error", error: new Error("Penyedia terputus.") },
        ],
      },
    ]),
  );
  const brokenEvents = await readEvents(
    await runVeraStudio({ studentId: streamId, request: studyRoute, signal: new AbortController().signal }),
  );
  const brokenId = documentIdFrom(brokenEvents);
  createdDocumentIds.push(brokenId);
  const broken = await waitFor(() => getStudioDocument({ studentId: streamId, id: brokenId }), "the interrupted document to be saved");
  assert.equal(broken.complete, false, "A failure after some text is kept as incomplete");
  assert.ok(broken.markdown.includes("Rute yang sempat tersusun"), "The words written before the failure are kept");
  assert.equal(broken.credits, 5, "A failed run that wrote text is charged the Mendalam reserve");
  const brokenUsage = await waitFor(
    () =>
      prisma.veraUsageEvent.findFirst({
        where: { studioDocumentId: brokenId },
        select: { status: true, credits: true, errorCode: true },
      }),
    "the interrupted run's usage to be linked",
  );
  assert.equal(brokenUsage.status, "settled", "A failed run that wrote text is settled, not released");
  assert.equal(Number(brokenUsage.credits), broken.credits, "The charge on the document matches the settled usage");
  assert.equal(brokenUsage.errorCode, "error", "The settled row records the failure");

  // The day's limit applies to Studio runs: a refused run saves nothing and reaches no model.
  await prisma.veraUsageEvent.create({
    data: {
      studentId: testStudent.id,
      kind: "chat",
      status: "settled",
      model: "test",
      reservedCredits: 0,
      reservedUsdMicros: BigInt(0),
      credits: 15,
      costUsdMicros: BigInt(0),
      settledAt: new Date(),
    },
  });
  await assert.rejects(
    runVeraStudio({
      studentId: testStudent.id,
      request: parseRequest({ tool: "study_route", input: { minutesPerDay: 30 } }),
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof VeraLimitError && error.code === "daily_limit",
    "The day's limit refuses a Studio run",
  );
  assert.equal(await prisma.veraStudioDocument.count({ where: { studentId: testStudent.id } }), 0, "A refused run saves nothing");

  // A model that asks for a tool on every step it is offered tools for. The last step is offered none, so the document still ends
  // with its text, and it is saved complete after the full Studio step count.
  const finalStudent = await prisma.user.upsert({
    where: { email: "vera-studio-final-step-test@vecalss.local" },
    update: {},
    create: { email: "vera-studio-final-step-test@vecalss.local", fullName: "Vera Studio Final Step Test", passwordHash: "test-only" },
    select: { id: true },
  });
  finalStepStudentId = finalStudent.id;
  await prisma.veraStudioDocument.deleteMany({ where: { studentId: finalStudent.id } });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: finalStudent.id } });
  const offeredTools: number[] = [];
  setVeraModelForTests(
    new MockLanguageModelV4({
      doStream: async (options) => {
        const offered = options.tools?.length ?? 0;
        offeredTools.push(offered);
        const chunks =
          offered > 0 ? toolCallChunks("get_learning_overview", {}) : answerChunks(["## Hari 1\n\nDokumen akhir tanpa alat."]);
        return { stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks }) };
      },
    }),
  );
  const finalEvents = await readEvents(
    await runVeraStudio({
      studentId: finalStudent.id,
      request: parseRequest({ tool: "study_route", input: { minutesPerDay: 30 } }),
      signal: new AbortController().signal,
    }),
  );
  const finalDocumentId = documentIdFrom(finalEvents);
  createdDocumentIds.push(finalDocumentId);
  const finalDocument = await waitFor(
    () => getStudioDocument({ studentId: finalStudent.id, id: finalDocumentId }),
    "the final-step document to be saved",
  );
  assert.equal(finalDocument.complete, true, "A run that ends on its text step is saved complete");
  assert.ok(finalDocument.markdown.includes("Dokumen akhir tanpa alat"), "The text written on the last step is saved");
  assert.equal(offeredTools.length, VERA_LIMITS.studioMaxSteps, "The run takes its full Studio step count");
  assert.equal(offeredTools.at(-1), 0, "The last step is offered no tools");
  assert.ok(offeredTools.slice(0, -1).every((count) => count > 0), "Every earlier step is offered its tools");

  console.log("Vera studio checks passed.");
} finally {
  setVeraModelForTests(undefined);
  await prisma.veraUsageEvent.deleteMany({ where: { studioDocumentId: { in: createdDocumentIds } } });
  await prisma.veraStudioDocument.deleteMany({ where: { id: { in: createdDocumentIds } } });
  if (testStudentId) await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudentId } });
  if (streamStudentId) {
    await prisma.veraStudioDocument.deleteMany({ where: { studentId: streamStudentId } });
    await prisma.veraUsageEvent.deleteMany({ where: { studentId: streamStudentId } });
  }
  if (finalStepStudentId) {
    await prisma.veraStudioDocument.deleteMany({ where: { studentId: finalStepStudentId } });
    await prisma.veraUsageEvent.deleteMany({ where: { studentId: finalStepStudentId } });
  }
  await prisma.$disconnect();
}
