import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma";
import { parseVeraChatRequest, runVeraChat } from "../lib/vera/chat";
import { VERA_LIMITS } from "../lib/vera/config";
import { VeraError } from "../lib/vera/errors";
import { VeraLimitError } from "../lib/vera/ledger";
import { setVeraModelForTests } from "../lib/vera/model";

import { answerChunks, conversationIdFrom, readEvents, scriptedModel, streamedText, userInput, type StreamEvent } from "./vera-test-support";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-chat-actions only runs against the local dev database on 127.0.0.1:55432.");
}

const EFFORT = "cepat" as const;
const ACCOUNTS = {
  owner: "vera-actions-test@vecalss.local",
  other: "vera-actions-other@vecalss.local",
  limited: "vera-actions-limit@vecalss.local",
};

/** Every model call from here answers with this text. */
function answerWith(text: string) {
  setVeraModelForTests(scriptedModel([{ chunks: answerChunks([text]) }]));
}

function textOf(parts: unknown) {
  return (parts as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

/** The stored messages of a session, oldest first. */
async function rowsOf(conversationId: string) {
  const rows = await prisma.veraMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, parts: true },
  });
  return rows.map((row) => ({ id: row.id, role: row.role, text: textOf(row.parts) }));
}

/** The answers' usage events of a session, oldest first. Titles are left out, because they are not answers. */
async function answersUsageOf(conversationId: string) {
  const rows = await prisma.veraUsageEvent.findMany({
    where: { conversationId, kind: { not: "title" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, status: true, credits: true, costUsdMicros: true },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    credits: Number(row.credits),
    costUsdMicros: row.costUsdMicros.toString(),
  }));
}

async function titleOf(conversationId: string) {
  return (await prisma.veraConversation.findUniqueOrThrow({ where: { id: conversationId }, select: { title: true } })).title;
}

/** The stored id of the question an answer responds to, as the start event names it. */
function questionIdFrom(events: StreamEvent[]) {
  const start = events.find((event) => event.type === "start");
  const metadata = start?.messageMetadata as { userMessageId?: string } | undefined;
  assert.ok(metadata?.userMessageId, "The start event names the stored id of its question");
  return metadata.userMessageId;
}

async function accountId(email: string) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName: "Vera Actions Test", passwordHash: "test-only" },
    select: { id: true },
  });
  return user.id;
}

function editInput(conversationId: string, userMessageId: string, text: string) {
  return {
    action: "edit" as const,
    conversationId,
    userMessageId,
    message: { id: `msg-${crypto.randomUUID()}`, role: "user" as const, parts: [{ type: "text" as const, text }] },
    effort: EFFORT,
    mentions: [],
  };
}

const createdConversationIds: string[] = [];
const injectedUsageIds: string[] = [];

try {
  const owner = await accountId(ACCOUNTS.owner);
  const other = await accountId(ACCOUNTS.other);
  const limited = await accountId(ACCOUNTS.limited);
  const all = [owner, other, limited];
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: { in: all } } });
  await prisma.veraConversation.deleteMany({ where: { studentId: { in: all } } });

  // A request from before the action field is a send. Edit and regenerate must name the message they replace.
  const legacy = parseVeraChatRequest({
    message: { id: "msg-legacy", role: "user", parts: [{ type: "text", text: "Halo" }] },
    effort: EFFORT,
  });
  assert.equal(legacy.success && legacy.data.action, "send", "A request with no action is a send");
  assert.equal(
    parseVeraChatRequest({
      action: "edit",
      conversationId: crypto.randomUUID(),
      message: { id: "msg-x", role: "user", parts: [{ type: "text", text: "Halo" }] },
    }).success,
    false,
    "An edit names the message it replaces",
  );
  assert.equal(
    parseVeraChatRequest({ action: "regenerate", conversationId: crypto.randomUUID() }).success,
    false,
    "A regenerate names the answer it replaces",
  );

  // The first question and its answer. The session is titled after the answer, so the title is read once it has settled.
  answerWith("Halo, aku Vera.");
  const firstEvents = await readEvents(
    await runVeraChat({ studentId: owner, input: userInput("Halo Vera"), signal: new AbortController().signal }),
  );
  const conversationId = conversationIdFrom(firstEvents);
  createdConversationIds.push(conversationId);
  const [firstUser, firstAnswer] = await rowsOf(conversationId);
  assert.deepEqual([firstUser.role, firstAnswer.role], ["user", "assistant"]);
  assert.equal(questionIdFrom(firstEvents), firstUser.id, "The answer names the stored id of its question");
  assert.equal(streamedText(firstEvents), "Halo, aku Vera.");
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const titleAfterFirst = await titleOf(conversationId);
  const titlesBefore = await prisma.veraUsageEvent.count({ where: { conversationId, kind: "title" } });
  const firstUsage = await answersUsageOf(conversationId);
  assert.equal(firstUsage.length, 1, "The first answer has one usage event");
  assert.equal(firstUsage[0].status, "settled", "The first answer settles its usage");

  // Ulangi on the last answer: the old answer leaves the stored session, a new one takes its place, and both usage events stay.
  answerWith("Jawaban kedua.");
  const regenerated = await readEvents(
    await runVeraChat({
      studentId: owner,
      input: { action: "regenerate", conversationId, assistantMessageId: firstAnswer.id, effort: EFFORT },
      signal: new AbortController().signal,
    }),
  );
  const afterRegenerate = await rowsOf(conversationId);
  assert.deepEqual(afterRegenerate.map((row) => row.role), ["user", "assistant"], "Ulangi keeps one answer for the question");
  assert.equal(afterRegenerate[0].id, firstUser.id, "The question keeps its stored row");
  assert.equal(afterRegenerate[1].text, "Jawaban kedua.", "The new answer is stored");
  assert.notEqual(afterRegenerate[1].id, firstAnswer.id, "The answer it replaces is gone");
  assert.equal(streamedText(regenerated), "Jawaban kedua.");
  assert.equal(questionIdFrom(regenerated), firstUser.id, "The new answer names the question it answers");
  const usageAfterRegenerate = await answersUsageOf(conversationId);
  assert.equal(usageAfterRegenerate.length, 2, "Ulangi is charged as a new answer");
  assert.deepEqual(usageAfterRegenerate[0], firstUsage[0], "The replaced answer's usage stays as it was");
  assert.equal(usageAfterRegenerate[1].kind, "chat", "Ulangi reserves as a chat answer");

  // A second question makes the first answer an older one, and an older answer cannot be regenerated.
  answerWith("Pertanyaan kedua dijawab.");
  await readEvents(
    await runVeraChat({
      studentId: owner,
      input: { ...userInput("Pertanyaan kedua"), conversationId },
      signal: new AbortController().signal,
    }),
  );
  const beforeRefusal = await rowsOf(conversationId);
  assert.deepEqual(beforeRefusal.map((row) => row.role), ["user", "assistant", "user", "assistant"]);
  const usageBeforeRefusal = await answersUsageOf(conversationId);
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: { action: "regenerate", conversationId, assistantMessageId: beforeRefusal[1].id, effort: EFFORT },
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_latest",
    "Only the newest answer can be regenerated",
  );
  assert.deepEqual(await rowsOf(conversationId), beforeRefusal, "A refused Ulangi changes nothing");
  assert.equal((await answersUsageOf(conversationId)).length, usageBeforeRefusal.length, "A refused Ulangi reserves nothing");

  // Edit on the last question: it and the answer after it are replaced, and the new question is answered as a new answer.
  answerWith("Jawaban untuk pertanyaan yang diperbaiki.");
  const lastQuestion = beforeRefusal[2];
  const edited = await readEvents(
    await runVeraChat({
      studentId: owner,
      input: editInput(conversationId, lastQuestion.id, "Pertanyaan yang diperbaiki"),
      signal: new AbortController().signal,
    }),
  );
  const afterEdit = await rowsOf(conversationId);
  assert.deepEqual(
    afterEdit.map((row) => row.role),
    ["user", "assistant", "user", "assistant"],
    "Edit replaces the question and the answer after it",
  );
  assert.equal(afterEdit[1].id, beforeRefusal[1].id, "Earlier messages are kept");
  assert.equal(afterEdit[2].text, "Pertanyaan yang diperbaiki", "The edited question is stored");
  assert.notEqual(afterEdit[2].id, lastQuestion.id, "The edited question has a new stored row");
  assert.equal(afterEdit[3].text, "Jawaban untuk pertanyaan yang diperbaiki.");
  assert.equal(questionIdFrom(edited), afterEdit[2].id, "The answer names the stored id of the edited question");
  const usageAfterEdit = await answersUsageOf(conversationId);
  assert.equal(usageAfterEdit.length, usageBeforeRefusal.length + 1, "Edit is charged as a new answer");
  assert.deepEqual(usageAfterEdit.slice(0, usageBeforeRefusal.length), usageBeforeRefusal, "Earlier usage stays as it was");

  // An older question cannot be edited, and nothing changes when it is refused.
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: editInput(conversationId, firstUser.id, "Pertanyaan lama"),
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_latest",
    "Only the newest question can be edited",
  );
  assert.deepEqual(await rowsOf(conversationId), afterEdit, "A refused edit changes nothing");

  // Ownership: another student's session is not found, and an id from another session does not match this one.
  answerWith("Halo dari akun lain.");
  const otherEvents = await readEvents(
    await runVeraChat({ studentId: other, input: userInput("Halo"), signal: new AbortController().signal }),
  );
  const otherConversationId = conversationIdFrom(otherEvents);
  createdConversationIds.push(otherConversationId);
  const [otherQuestion, otherAnswer] = await rowsOf(otherConversationId);
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: { action: "regenerate", conversationId: otherConversationId, assistantMessageId: otherAnswer.id, effort: EFFORT },
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_found",
    "Another student's answer is not found",
  );
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: editInput(otherConversationId, otherQuestion.id, "Coba ubah"),
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_found",
    "Another student's question is not found",
  );
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: editInput(conversationId, otherQuestion.id, "Coba ubah"),
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_found",
    "A question from another session is not found in this one",
  );
  await assert.rejects(
    runVeraChat({
      studentId: owner,
      input: { action: "regenerate", conversationId, assistantMessageId: afterEdit[2].id, effort: EFFORT },
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraError && error.code === "not_found",
    "A question cannot be regenerated as an answer",
  );

  // A day at its limit refuses Ulangi, and the answer it would replace stays in place.
  answerWith("Jawaban sebelum batas.");
  const limitedEvents = await readEvents(
    await runVeraChat({ studentId: limited, input: userInput("Halo batas"), signal: new AbortController().signal }),
  );
  const limitedConversationId = conversationIdFrom(limitedEvents);
  createdConversationIds.push(limitedConversationId);
  const limitedRows = await rowsOf(limitedConversationId);
  const blocking = await prisma.veraUsageEvent.create({
    data: {
      studentId: limited,
      kind: "chat",
      status: "settled",
      model: "test",
      reservedCredits: 0,
      credits: VERA_LIMITS.day.hardCredits,
      reservedUsdMicros: BigInt(0),
      costUsdMicros: BigInt(0),
      createdAt: new Date(),
      settledAt: new Date(),
    },
    select: { id: true },
  });
  injectedUsageIds.push(blocking.id);
  answerWith("Seharusnya tidak pernah dibuat.");
  await assert.rejects(
    runVeraChat({
      studentId: limited,
      input: { action: "regenerate", conversationId: limitedConversationId, assistantMessageId: limitedRows[1].id, effort: EFFORT },
      signal: new AbortController().signal,
    }),
    (error) => error instanceof VeraLimitError && error.code === "daily_limit",
    "A day at its limit refuses Ulangi",
  );
  assert.deepEqual(await rowsOf(limitedConversationId), limitedRows, "A refused Ulangi keeps the answer it would replace");
  assert.equal((await answersUsageOf(limitedConversationId)).length, 1, "A refused Ulangi reserves nothing");

  // Ulangi and Edit never title the session again.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await titleOf(conversationId), titleAfterFirst, "The session keeps its title through Ulangi and Edit");
  assert.equal(
    await prisma.veraUsageEvent.count({ where: { conversationId, kind: "title" } }),
    titlesBefore,
    "Ulangi and Edit do not add a title event",
  );

  console.log("Vera chat actions checks passed.");
} finally {
  setVeraModelForTests(undefined);
  if (injectedUsageIds.length) {
    await prisma.veraUsageEvent.deleteMany({ where: { id: { in: injectedUsageIds } } });
  }
  if (createdConversationIds.length) {
    await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  }
  await prisma.$disconnect();
}
