import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma";
import { runVeraChat, veraChatRequestSchema } from "../lib/vera/chat";
import { VERA_LIMITS } from "../lib/vera/config";
import { MENTION_SEARCHES_PER_MINUTE, takeMentionSearch } from "../lib/vera/mention-throttle";
import { setVeraModelForTests } from "../lib/vera/model";
import { hasReadableText } from "../lib/vera/sources/materi";
import { resolveMentions, searchMentions } from "../lib/vera/sources/mentions";
import { materiHref } from "../lib/vera/sources/types";
import { activeMention, withoutMention } from "../modules/vera/mention-model";
import {
  answerChunks,
  conversationIdFrom,
  findReleasedTryout,
  findSectionTopic,
  minimalPdf,
  readEvents,
  scriptedModel,
  streamedText,
  userInput,
  waitFor,
} from "./vera-test-support";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-mentions only runs against the local dev database on 127.0.0.1:55432.");
}

/** The pinned budget in characters: the token budget times the rate the prompt window uses. */
const PINNED_BUDGET_CHARS = VERA_LIMITS.maxPinnedTokens * 4;

const createdConversationIds: string[] = [];
const createdModuleIds: string[] = [];
const token = `vmention${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const past = new Date(Date.now() - 60_000);

async function settleUsage(conversationId: string) {
  await waitFor(
    () =>
      prisma.veraUsageEvent.findFirst({
        where: { conversationId, status: { not: "reserved" } },
        select: { id: true },
      }),
    "the answer's usage to settle",
  );
}

try {
  // Dedicated account: its usage starts clean, so the burst limit only counts this run.
  const testStudent = await prisma.user.upsert({
    where: { email: "vera-mentions-test@vecalss.local" },
    update: {},
    create: { email: "vera-mentions-test@vecalss.local", fullName: "Vera Mentions Test", passwordHash: "test-only" },
    select: { id: true },
  });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: testStudent.id } });
  await prisma.veraConversation.deleteMany({ where: { studentId: testStudent.id } });

  // Another student's released Tryout result is the foreign data every check must keep out of the menu and the prompt.
  const owned = await findReleasedTryout();

  // Kuis: the test student's attempt and another student's attempt on one quiz. Correctness is hidden, so a pin is score facts.
  const subtest = await prisma.subtest.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  assert.ok(subtest, "The dev database has an active subtest");
  const kuisPolicy = { reviewTiming: "immediate", correctAnswerVisibility: "hide" };
  const quiz = await prisma.standaloneQuiz.create({
    data: {
      slug: `vera-mentions-kuis-${token}`,
      title: `Kuis mention ${token}`,
      subtestId: subtest.id,
      status: "published",
      reviewTiming: "immediate",
      correctAnswerVisibility: "hide",
      createdByUserId: testStudent.id,
    },
    select: { id: true },
  });
  const releasedAttempt = async (studentId: string, score: number) => {
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
        correctCount: 3,
        wrongCount: 2,
        unansweredCount: 0,
        releaseAt: past,
        submittedAt: past,
      },
      select: { id: true },
    });
  };
  const ownKuis = await releasedAttempt(testStudent.id, 70);
  const foreignKuis = await releasedAttempt(owned.studentId, 55);

  // Materi: published lessons with a managed PDF in the kapten library, so the catalogue shows them.
  const topic = await findSectionTopic();
  const pdf = minimalPdf(`Materi mention ${token}`);
  const file = await prisma.asset.create({
    data: {
      objectKey: `vera-mentions-test/${token}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: pdf.byteLength,
      originalName: "mention.pdf",
      libraryScope: "kapten",
      state: "ready",
      checksum: token,
    },
    select: { id: true },
  });
  const lastSequence = await prisma.module.aggregate({ where: { topicId: topic.id }, _max: { sequenceNo: true } });
  let sequenceNo = lastSequence._max.sequenceNo ?? 0;
  const createLesson = async (label: string, body: string, status: "published" | "draft" = "published") => {
    sequenceNo += 1;
    const lesson = await prisma.module.create({
      data: {
        topicId: topic.id,
        code: `vera-mentions-${label}-${token}`,
        title: `Persentase ${label} ${token}`,
        sequenceNo,
        status,
        publishedAt: status === "published" ? past : null,
      },
      select: { id: true, code: true },
    });
    createdModuleIds.push(lesson.id);
    await prisma.moduleAsset.create({
      data: {
        moduleId: lesson.id,
        sortOrder: 0,
        assetType: "attachment",
        sourceKind: "managed",
        managedAssetId: file.id,
        mimeType: "application/pdf",
        originalName: "mention.pdf",
      },
    });
    await prisma.moduleAsset.create({ data: { moduleId: lesson.id, sortOrder: 1, assetType: "text", bodyText: body } });
    return lesson;
  };
  const phrase = `Persentase bertingkat ${token}. `;
  const mainLesson = await createLesson("utama", phrase.repeat(40));
  const draftLesson = await createLesson("draf", phrase.repeat(10), "draft");
  await prisma.moduleProgress.create({
    data: { studentId: testStudent.id, moduleId: mainLesson.id, lastOpenedAt: new Date() },
  });

  // The menu offers only what the student could open, and the empty search starts from the Materi opened last.
  const search = await searchMentions({ studentId: testStudent.id, query: token });
  assert.ok(search.kuis.some((candidate) => candidate.id === ownKuis.id), "The student's own Kuis is offered");
  assert.ok(!search.kuis.some((candidate) => candidate.id === foreignKuis.id), "Another student's Kuis is never offered");
  assert.ok(search.materi.some((candidate) => candidate.id === mainLesson.id), "A published Materi that matches is offered");
  assert.ok(!search.materi.some((candidate) => candidate.id === draftLesson.id), "A draft Materi is not offered");
  const recent = await searchMentions({ studentId: testStudent.id, query: "" });
  assert.equal(recent.materi[0]?.id, mainLesson.id, "With an empty search, the Materi opened last comes first");
  assert.ok(!recent.tryout.some((candidate) => candidate.id === owned.id), "Another student's Tryout result is never offered");
  const ownerRecent = await searchMentions({ studentId: owned.studentId, query: "" });
  assert.ok(ownerRecent.tryout.some((candidate) => candidate.id === owned.id), "The owner is offered their own Tryout result");

  // A forged, hidden or malformed id is refused, and nothing reaches the prompt.
  const forged = await resolveMentions({
    studentId: testStudent.id,
    mentions: [
      { type: "kuis", id: foreignKuis.id, label: "Kuis palsu" },
      { type: "tryout", id: owned.id, label: "Tryout palsu" },
      { type: "materi", id: draftLesson.id, label: "Materi palsu" },
      { type: "kuis", id: "not-a-uuid" },
    ],
  });
  assert.equal(forged.accepted.length, 0, "Forged, hidden and malformed sources are not accepted");
  assert.equal(forged.rejected.length, 4);
  assert.deepEqual(forged.pinned, []);
  assert.deepEqual(
    forged.rejected.map((mention) => mention.label),
    ["Kuis palsu", "Tryout palsu", "Materi palsu", "Kuis"],
    "A refused pin keeps only the label the client sent, and a pin without one falls back to its type",
  );
  const refusedJson = JSON.stringify(forged.rejected);
  assert.ok(!refusedJson.includes(`Kuis mention ${token}`), "A refused pin never carries a title the server looked up");
  assert.ok(!refusedJson.includes(owned.tryout.title), "A refused Tryout never carries its title");

  // The student's own sources are pinned: a Kuis as its score facts, a Materi as its text, with its link kept.
  const owncheck = await resolveMentions({
    studentId: testStudent.id,
    mentions: [
      { type: "kuis", id: ownKuis.id },
      { type: "materi", id: mainLesson.id },
    ],
  });
  assert.equal(owncheck.accepted.length, 2);
  assert.ok(owncheck.pinned[0].body.includes("Skor 70"), "A Kuis is pinned as its score facts");
  assert.ok(owncheck.pinned[1].body.includes(`Persentase bertingkat ${token}`), "A Materi is pinned as its text");
  assert.equal(owncheck.accepted[1].source?.href, materiHref(topic.code, mainLesson.code));

  // The budget: three long Materi fit, the third is cut to what is left and says so, and the fourth is refused.
  const long = [];
  for (let index = 0; index < 4; index += 1) {
    long.push(await createLesson(`besar${index}`, `${token}-${index} ${"x".repeat(9_000)}`));
  }
  const budgeted = await resolveMentions({
    studentId: testStudent.id,
    mentions: long.map((lesson) => ({ type: "materi" as const, id: lesson.id })),
  });
  const pinnedChars = budgeted.pinned.reduce((sum, block) => sum + block.body.length, 0);
  assert.ok(pinnedChars <= PINNED_BUDGET_CHARS, `The pinned text stays inside the budget (${pinnedChars} characters)`);
  assert.equal(budgeted.pinned.length, 3, "Three long Materi fit the budget and the fourth is refused");
  assert.ok(budgeted.pinned[2].body.includes("dipangkas"), "The last Materi that fits is cut and says so");
  assert.equal(budgeted.rejected.length, 1);

  // A pinned Materi reaches the model prompt, and the message and its answer keep the pin.
  const pinnedModel = scriptedModel([{ chunks: answerChunks(["Oke, aku pakai materi itu."]) }]);
  setVeraModelForTests(pinnedModel);
  const pinnedEvents = await readEvents(
    await runVeraChat({
      studentId: testStudent.id,
      input: userInput("Jelaskan persentase bertingkat", [{ type: "materi", id: mainLesson.id }]),
      signal: new AbortController().signal,
    }),
  );
  const pinnedConversationId = conversationIdFrom(pinnedEvents);
  createdConversationIds.push(pinnedConversationId);
  assert.equal(streamedText(pinnedEvents), "Oke, aku pakai materi itu.");
  assert.ok(
    JSON.stringify(pinnedModel.doStreamCalls[0]?.prompt ?? []).includes(`Persentase bertingkat ${token}`),
    "The pinned Materi reaches the model prompt",
  );
  const pinnedUser = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: pinnedConversationId, role: "user" },
        select: { mentions: true },
      }),
    "the user message to be saved",
  );
  assert.deepEqual(
    (pinnedUser.mentions as Array<{ id: string; status: string }>).map((mention) => [mention.id, mention.status]),
    [[mainLesson.id, "accepted"]],
    "The user message keeps the accepted pin",
  );
  const pinnedAnswer = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: pinnedConversationId, role: "assistant" },
        select: { sources: true },
      }),
    "the answer to be saved",
  );
  const answerSources = pinnedAnswer.sources as Array<{ type: string; id: string }>;
  assert.ok(
    answerSources.some((source) => source.type === "materi" && source.id === mainLesson.id),
    "The pinned Materi is one of the answer's sources",
  );
  await settleUsage(pinnedConversationId);

  // A forged pin adds nothing to the prompt and is stored as rejected.
  const forgedModel = scriptedModel([{ chunks: answerChunks(["Baik."]) }]);
  setVeraModelForTests(forgedModel);
  const forgedEvents = await readEvents(
    await runVeraChat({
      studentId: testStudent.id,
      input: userInput("Coba lagi", [{ type: "kuis", id: foreignKuis.id }]),
      signal: new AbortController().signal,
    }),
  );
  const forgedConversationId = conversationIdFrom(forgedEvents);
  createdConversationIds.push(forgedConversationId);
  assert.ok(
    !JSON.stringify(forgedModel.doStreamCalls[0]?.prompt ?? []).includes("Skor 55"),
    "A forged source adds nothing to the prompt",
  );
  const forgedUser = await waitFor(
    () =>
      prisma.veraMessage.findFirst({
        where: { conversationId: forgedConversationId, role: "user" },
        select: { mentions: true },
      }),
    "the forged message to be saved",
  );
  assert.deepEqual(
    (forgedUser.mentions as Array<{ id: string; status: string }>).map((mention) => [mention.id, mention.status]),
    [[foreignKuis.id, "rejected"]],
    "A forged pin is stored as rejected",
  );
  await settleUsage(forgedConversationId);

  // The `@` menu reads the caret: a mention starts at a word boundary, may hold spaces, and is taken out whole when picked.
  const typed = "Jelaskan @Persentase Bertingkat";
  assert.deepEqual(activeMention(typed, typed.length), { start: 9, query: "Persentase Bertingkat" });
  assert.equal(activeMention("alamat a@b.com", 14), null, "An @ inside a word is not a mention");
  assert.equal(withoutMention(typed, 9, typed.length), "Jelaskan ", "Picking a source removes the typed @query");

  // The request takes at most five pins.
  const sixPins = Array.from({ length: 6 }, () => ({ type: "materi" as const, id: crypto.randomUUID() }));
  assert.equal(
    veraChatRequestSchema.safeParse({
      message: { id: "msg-limit", role: "user", parts: [{ type: "text", text: "Halo" }] },
      mentions: sixPins,
    }).success,
    false,
    "A message names at most five sources",
  );

  // The `@` menu offers a lesson only when the reader can use its text: a body, or a PDF attachment stored as a managed asset.
  assert.equal(hasReadableText([{ assetType: "text", bodyText: "Isi materi", mimeType: null, managedAsset: null }]), true);
  assert.equal(
    hasReadableText([
      { assetType: "attachment", bodyText: null, mimeType: "application/pdf", managedAsset: { objectKey: "materi.pdf" } },
    ]),
    true,
  );
  assert.equal(
    hasReadableText([
      { assetType: "attachment", bodyText: null, mimeType: "application/pdf", managedAsset: { objectKey: null } },
    ]),
    false,
    "A PDF with no stored file cannot be read",
  );
  assert.equal(
    hasReadableText([{ assetType: "video", bodyText: null, mimeType: "video/mp4", managedAsset: { objectKey: "klip.mp4" } }]),
    false,
    "A video is not a text source",
  );
  assert.equal(
    hasReadableText([{ assetType: "text", bodyText: "   ", mimeType: null, managedAsset: null }]),
    false,
    "Blank text is not text",
  );

  // The mention search allows a student a fixed number of searches a minute, then refuses until the next minute.
  const throttleStart = Date.parse("2026-11-04T03:00:00Z");
  const throttled = crypto.randomUUID();
  for (let search = 0; search < MENTION_SEARCHES_PER_MINUTE; search += 1) {
    assert.equal(takeMentionSearch(throttled, throttleStart), true, "Searches within the limit are allowed");
  }
  assert.equal(takeMentionSearch(throttled, throttleStart + 1_000), false, "The search after the limit is refused in that minute");
  assert.equal(takeMentionSearch(throttled, throttleStart + 60_000), true, "A new minute starts a new allowance");
  assert.equal(takeMentionSearch(crypto.randomUUID(), throttleStart), true, "Another student's searches are counted apart");

  console.log("Vera mentions checks passed.");
} finally {
  setVeraModelForTests(undefined);
  await prisma.veraUsageEvent.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
  await prisma.veraConversation.deleteMany({ where: { id: { in: createdConversationIds } } });
  await prisma.moduleProgress.deleteMany({ where: { moduleId: { in: createdModuleIds } } });
  await prisma.standaloneQuiz.deleteMany({ where: { slug: { startsWith: "vera-mentions-kuis-" } } });
  await prisma.veraMateriText.deleteMany({ where: { moduleId: { in: createdModuleIds } } });
  await prisma.moduleAsset.deleteMany({ where: { moduleId: { in: createdModuleIds } } });
  await prisma.module.deleteMany({ where: { id: { in: createdModuleIds } } });
  await prisma.asset.deleteMany({ where: { objectKey: { startsWith: "vera-mentions-test/" } } });
  await prisma.$disconnect();
}
