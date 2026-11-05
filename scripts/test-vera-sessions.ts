import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import { runVeraChat } from "../lib/vera/chat";
import { VERA_CONVERSATION_TITLE } from "../lib/vera/config";
import {
  appendMessages,
  createConversation,
  deleteSession,
  discardEmptyConversation,
  listSessions,
  updateSession,
} from "../lib/vera/conversations";
import { setVeraModelForTests } from "../lib/vera/model";
import { cleanTitle, titleConversation } from "../lib/vera/titles";
import { answerChunks, conversationIdFrom, findReleasedTryout, readEvents, userInput } from "./vera-test-support";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-sessions only runs against the local dev database on 127.0.0.1:55432.");
}

const token = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const createdConversationIds: string[] = [];
let testStudentId: string | null = null;

/** A model whose answers stream normally and whose title call either returns the given text or fails. */
function sessionModel(title: string | null) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks: answerChunks(["Halo."]) }),
    }),
    doGenerate: async () => {
      if (title === null) throw new Error("Penyedia judul tidak tersedia.");
      return {
        content: [{ type: "text", text: title }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 4, text: 4, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

/** A session with a question and an answer, the way a finished first turn leaves it. */
async function finishedSession(studentId: string, title?: string) {
  const conversationId = await createConversation(studentId);
  createdConversationIds.push(conversationId);
  const now = new Date();
  await appendMessages(conversationId, [
    { id: `u-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text: `Pertanyaan ${token}` }], createdAt: now },
    { id: `a-${crypto.randomUUID()}`, role: "assistant", parts: [{ type: "text", text: "Jawaban" }], createdAt: now },
  ]);
  if (title) await updateSession({ studentId, conversationId, title });
  return conversationId;
}

/** A session whose first question is saved. An answer is saved too when one is given, and an empty answer is a stopped one with no text. */
async function questionSession(studentId: string, question: string, answer?: string) {
  const conversationId = await createConversation(studentId);
  createdConversationIds.push(conversationId);
  const asked = new Date();
  await appendMessages(conversationId, [
    { id: `u-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text: question }], createdAt: asked },
  ]);
  if (answer !== undefined) {
    await appendMessages(conversationId, [
      {
        id: `a-${crypto.randomUUID()}`,
        role: "assistant",
        parts: answer ? [{ type: "text", text: answer }] : [],
        createdAt: new Date(asked.getTime() + 1_000),
      },
    ]);
  }
  return conversationId;
}

try {
  const testStudent = await prisma.user.upsert({
    where: { email: "vera-sessions-test@vecalss.local" },
    update: {},
    create: { email: "vera-sessions-test@vecalss.local", fullName: "Vera Sessions Test", passwordHash: "test-only" },
    select: { id: true },
  });
  testStudentId = testStudent.id;
  await prisma.veraConversation.deleteMany({ where: { studentId: testStudent.id } });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudent.id } });

  // Another student's session is the foreign data: no change from this student may reach it.
  const owned = await findReleasedTryout();
  const foreign = await finishedSession(owned.studentId, "Sesi orang lain");

  const first = await finishedSession(testStudent.id, "Latihan PK");
  const second = await finishedSession(testStudent.id);
  const archived = await finishedSession(testStudent.id, "Arsip lama");
  const empty = await createConversation(testStudent.id);
  createdConversationIds.push(empty);
  await updateSession({ studentId: testStudent.id, conversationId: archived, archived: true });

  // The sidebar lists only sessions with messages, newest first, and the archive keeps the archived ones apart.
  const active = await listSessions({ studentId: testStudent.id, archived: false });
  const activeIds = active.map((session) => session.id);
  assert.ok(activeIds.includes(first) && activeIds.includes(second), "Active sessions with messages are listed");
  assert.ok(!activeIds.includes(empty), "A session with no message is not listed");
  assert.ok(!activeIds.includes(archived), "An archived session is not in the active list");
  assert.ok(!activeIds.includes(foreign), "Another student's session is never listed");
  const updates = active.map((session) => Date.parse(session.updatedAt));
  assert.deepEqual(updates, [...updates].sort((left, right) => right - left), "Sessions come newest first");
  const archivedList = await listSessions({ studentId: testStudent.id, archived: true });
  assert.deepEqual(archivedList.map((session) => session.id), [archived], "The archive lists the archived session");
  assert.equal(archivedList[0].archived, true);

  // Rename: the student's own session changes, and another student's id changes nothing and reports false.
  assert.equal(await updateSession({ studentId: testStudent.id, conversationId: first, title: "Judul baru" }), true);
  const renamed = await listSessions({ studentId: testStudent.id, archived: false });
  assert.equal(renamed.find((session) => session.id === first)?.title, "Judul baru");
  assert.equal(
    await updateSession({ studentId: testStudent.id, conversationId: foreign, title: "Diubah" }),
    false,
    "Renaming another student's session reports not found",
  );
  const foreignRow = await prisma.veraConversation.findUnique({ where: { id: foreign }, select: { title: true } });
  assert.equal(foreignRow?.title, "Sesi orang lain", "Another student's session keeps its title");

  // Archive and restore move a session between the two views.
  assert.equal(await updateSession({ studentId: testStudent.id, conversationId: second, archived: true }), true);
  assert.ok(
    (await listSessions({ studentId: testStudent.id, archived: true })).some((session) => session.id === second),
    "An archived session shows in the archive",
  );
  assert.ok(
    !(await listSessions({ studentId: testStudent.id, archived: false })).some((session) => session.id === second),
    "An archived session leaves the active list",
  );
  assert.equal(await updateSession({ studentId: testStudent.id, conversationId: second, archived: false }), true);
  assert.ok(
    (await listSessions({ studentId: testStudent.id, archived: false })).some((session) => session.id === second),
    "A restored session is back in the active list",
  );

  // Discarding removes only a session with no message, and never a session that has messages.
  await discardEmptyConversation({ studentId: testStudent.id, conversationId: empty });
  assert.equal(await prisma.veraConversation.findUnique({ where: { id: empty } }), null, "An empty session is discarded");
  await discardEmptyConversation({ studentId: testStudent.id, conversationId: second });
  assert.ok(await prisma.veraConversation.findUnique({ where: { id: second } }), "A session with messages is kept");

  // Delete: another student's session is not found, and the student's own session goes with its messages but keeps its usage.
  const usageAt = new Date();
  await prisma.veraUsageEvent.create({
    data: {
      studentId: testStudent.id,
      kind: "chat",
      status: "settled",
      model: "test",
      conversationId: archived,
      reservedCredits: 0,
      reservedUsdMicros: 0,
      credits: 1,
      costUsdMicros: 2_350,
      settledAt: usageAt,
    },
  });
  assert.equal(await deleteSession({ studentId: testStudent.id, conversationId: foreign }), false, "Deleting another student's session is refused");
  assert.ok(await prisma.veraConversation.findUnique({ where: { id: foreign } }), "Another student's session survives");
  assert.equal(await deleteSession({ studentId: testStudent.id, conversationId: archived }), true);
  assert.equal(await prisma.veraConversation.findUnique({ where: { id: archived } }), null, "A deleted session is gone");
  assert.equal(await prisma.veraMessage.count({ where: { conversationId: archived } }), 0, "Its messages go with it");
  assert.equal(
    await prisma.veraUsageEvent.count({ where: { conversationId: archived } }),
    1,
    "The usage event stays in the ledger after its session is deleted",
  );

  // Titles: a failed title call keeps the default and logs nothing for the student.
  setVeraModelForTests(sessionModel(null));
  const titled = await runVeraChat({
    studentId: testStudent.id,
    input: userInput("Bagaimana cara menghitung persentase bertingkat?"),
    signal: new AbortController().signal,
  });
  const titledEvents = await readEvents(titled);
  const titledId = conversationIdFrom(titledEvents);
  createdConversationIds.push(titledId);
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: titledId }),
    null,
    "A failed title call returns nothing",
  );
  const stillDefault = await prisma.veraConversation.findUnique({ where: { id: titledId }, select: { title: true } });
  assert.equal(stillDefault?.title, VERA_CONVERSATION_TITLE, "A failed title keeps the default title");
  assert.equal(
    await prisma.veraUsageEvent.count({ where: { conversationId: titledId, kind: "title" } }),
    0,
    "A failed title writes no title event",
  );

  // A working title call names the session once, costs no credits, and is logged as a settled title event.
  setVeraModelForTests(sessionModel("Persentase Bertingkat."));
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: titledId }),
    "Persentase Bertingkat",
    "The title is one clean line",
  );
  const titleEvent = await prisma.veraUsageEvent.findFirst({
    where: { conversationId: titledId, kind: "title" },
    select: { status: true, credits: true, settledAt: true },
  });
  assert.equal(titleEvent?.status, "settled");
  assert.equal(Number(titleEvent?.credits), 0, "The title call costs no credits");
  assert.ok(titleEvent?.settledAt, "The title event is settled");
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: titledId }),
    null,
    "A session is titled once",
  );
  assert.equal(await prisma.veraUsageEvent.count({ where: { conversationId: titledId, kind: "title" } }), 1);

  // A title model that reasons before it writes still names the session. Its cap must leave room for the title after the
  // reasoning. A cap no larger than the reasoning leaves no text, and so no title.
  const REASONING_TOKENS = 60;
  const reasoningFirst = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const writes = (options.maxOutputTokens ?? 0) > REASONING_TOKENS;
      return {
        content: writes ? [{ type: "text", text: "Latihan Persentase" }] : [],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
          outputTokens: {
            total: writes ? REASONING_TOKENS + 4 : REASONING_TOKENS,
            text: writes ? 4 : 0,
            reasoning: REASONING_TOKENS,
          },
        },
        warnings: [],
      };
    },
  });
  const reasoningSession = await finishedSession(testStudent.id);
  setVeraModelForTests(reasoningFirst);
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: reasoningSession }),
    "Latihan Persentase",
    "A title call that reasons first still names the session",
  );

  // A title the student already set is left alone.
  const renamedFirst = await finishedSession(testStudent.id, "Nama sendiri");
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: renamedFirst }),
    null,
    "A session the student named keeps its name",
  );
  const kept = await prisma.veraConversation.findUnique({ where: { id: renamedFirst }, select: { title: true } });
  assert.equal(kept?.title, "Nama sendiri");

  // A stopped first answer can leave only the question saved, or an answer with no text. Either way the session is titled from the question.
  const questionOnly = await questionSession(testStudent.id, `Pertanyaan ${token} tanpa jawaban`);
  setVeraModelForTests(sessionModel("Judul dari pertanyaan"));
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: questionOnly }),
    "Judul dari pertanyaan",
    "A session with only the question is titled from it",
  );
  const questionEvent = await prisma.veraUsageEvent.findFirst({
    where: { conversationId: questionOnly, kind: "title" },
    select: { status: true, credits: true },
  });
  assert.equal(questionEvent?.status, "settled");
  assert.equal(Number(questionEvent?.credits), 0, "The title from the question costs no credits");
  const emptyAnswer = await questionSession(testStudent.id, `Pertanyaan ${token} dengan jawaban kosong`, "");
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: emptyAnswer }),
    "Judul dari pertanyaan",
    "A stopped answer with no text is titled from the question",
  );
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: questionOnly }),
    null,
    "A session titled from the question is not titled again",
  );
  assert.equal(await prisma.veraUsageEvent.count({ where: { conversationId: questionOnly, kind: "title" } }), 1);
  const renamedQuestion = await questionSession(testStudent.id, `Pertanyaan ${token} diganti`);
  await updateSession({ studentId: testStudent.id, conversationId: renamedQuestion, title: "Nama sendiri" });
  assert.equal(
    await titleConversation({ studentId: testStudent.id, conversationId: renamedQuestion }),
    null,
    "A session the student renamed keeps the student's name",
  );

  // The title is one clean line, no quotes, no closing full stop, at most 60 characters.
  assert.equal(cleanTitle('  "Persentase  bertingkat".  '), "Persentase bertingkat");
  assert.equal(cleanTitle("x".repeat(100))?.length, 60);
  assert.equal(cleanTitle("   "), null);

  console.log("Vera sessions checks passed.");
} finally {
  setVeraModelForTests(undefined);
  await prisma.veraUsageEvent.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
  await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  if (testStudentId) await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudentId } });
  await prisma.$disconnect();
}
