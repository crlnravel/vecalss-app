import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { lockAndRevalidateDrillCandidates, prepareFrozenDrillAuthority } from "@/lib/vera-ai/drill-candidates";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
const parsed = new URL(connectionString);
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const studentId = randomUUID();
const subtestId = randomUUID();
const topicId = randomUUID();
const questionId = randomUUID();
const revisionId = randomUUID();
const quizId = randomUUID();
const itemId = randomUUID();
const participationId = randomUUID();
const attemptId = randomUUID();
const revisionOptions = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
const digest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: revisionOptions, prompt: "Berapa 2 + 2?", questionType: "single_choice" });

try {
  await db.user.create({ data: { id: studentId, email: `vera-drill-${studentId}@example.test`, fullName: "Vera Drill Fixture", passwordHash: "fixture" } });
  await db.subtest.create({ data: { id: subtestId, code: `VD-${subtestId.slice(0, 8)}`, name: "Vera Drill" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `vd-topic-${topicId.slice(0, 8)}`, name: "Aljabar" } });
  await db.$transaction(async (tx) => {
    await tx.question.create({ data: { id: questionId, code: `vd-q-${questionId}`, subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: revisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: revisionId, questionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: digest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: revisionOptions } } } });
    await tx.questionRevision.update({ where: { id: revisionId }, data: { status: "ready", readyAt: new Date() } });
  });
  await db.standaloneQuiz.create({ data: { id: quizId, slug: `vd-quiz-${quizId}`, title: "Latihan aljabar", subtestId, status: "published", reviewTiming: "immediate", correctAnswerVisibility: "show", createdByUserId: studentId } });
  await db.standaloneQuizItem.create({ data: { id: itemId, quizId, sortOrder: 1, prompt: "Mutable prompt must not be authority", explanation: "Mutable explanation", difficulty: "easy", subtestId, sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: digest, sourceRevisionProvenance: "authored" } });
  await db.standaloneQuizParticipation.create({ data: { id: participationId, quizId, studentId, policySnapshot: { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null } } });
  await db.standaloneQuizAttempt.create({ data: {
    id: attemptId,
    participationId,
    attemptNo: 1,
    status: "scored",
    attemptState: "submitted",
    scoringState: "scored",
    releaseState: "released",
    score: 100,
    policySnapshot: { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null },
    formItemOrder: [itemId],
    formSnapshot: { version: 1, items: [{ id: itemId, prompt: "Frozen prompt", explanation: "Frozen explanation", promptAssetId: null, explanationAssetId: null, sortOrder: 1, options: [{ id: randomUUID(), choiceKey: "A", content: "4", isCorrect: true, sortOrder: 1, assetId: null }, { id: randomUUID(), choiceKey: "B", content: "5", isCorrect: false, sortOrder: 2, assetId: null }] }] },
  } });

  const authority = await prepareFrozenDrillAuthority(db, studentId, [attemptId]);
  assert.equal(authority.candidates.length, 1);
  assert.equal(authority.candidates[0]?.prompt, "Frozen prompt");
  assert.ok(!/(?:isCorrect|correctOptionKey)/u.test(JSON.stringify(authority)));
  const revalidated = await db.$transaction((tx) => lockAndRevalidateDrillCandidates(tx, studentId, authority));
  assert.equal(revalidated.get(revisionId)?.correctOptionKey, "A");

  await db.questionRevision.update({ where: { id: revisionId }, data: { status: "retired", retiredAt: new Date() } });
  const drifted = await db.$transaction((tx) => lockAndRevalidateDrillCandidates(tx, studentId, authority));
  assert.equal(drifted.size, 0);

  console.log("PASS vera-drill-prisma-sprint3: owned released form snapshot is the only provider candidate authority");
  console.log("PASS vera-drill-prisma-sprint3: answer key stays server-only and retirement drift fails finalization revalidation");
} finally {
  await db.standaloneQuizAttempt.deleteMany({ where: { id: attemptId } });
  await db.standaloneQuizParticipation.deleteMany({ where: { id: participationId } });
  await db.standaloneQuizItem.deleteMany({ where: { id: itemId } });
  await db.standaloneQuiz.deleteMany({ where: { id: quizId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey');
    await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: revisionId } });
    await tx.questionRevision.deleteMany({ where: { id: revisionId } });
    await tx.question.deleteMany({ where: { id: questionId } });
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options ENABLE TRIGGER USER');
  });
  await db.topic.deleteMany({ where: { id: topicId } });
  await db.subtest.deleteMany({ where: { id: subtestId } });
  await db.user.deleteMany({ where: { id: studentId } });
  await db.$disconnect();
}
