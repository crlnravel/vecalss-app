import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma";
import { setVeraModelForTests } from "../lib/vera/model";
import { VeraLimitError } from "../lib/vera/ledger";
import { resolveMentions, searchMentions } from "../lib/vera/sources/mentions";
import { listTryoutResults } from "../lib/vera/sources/tryout";
import { deleteStudioDocument, getStudioDocument, listStudioDocuments } from "../lib/vera/studio-documents";
import { runVeraStudio } from "../lib/vera/studio-run";
import { keepToolLinks, studioRequestSchema, studioTitle } from "../lib/vera/studio";
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

const createdDocumentIds: string[] = [];
let testStudentId: string | null = null;

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

  console.log("Vera studio checks passed.");
} finally {
  setVeraModelForTests(undefined);
  await prisma.veraUsageEvent.deleteMany({ where: { studioDocumentId: { in: createdDocumentIds } } });
  await prisma.veraStudioDocument.deleteMany({ where: { id: { in: createdDocumentIds } } });
  if (testStudentId) await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudentId } });
  await prisma.$disconnect();
}
