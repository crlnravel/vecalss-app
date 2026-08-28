import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { VeraDrillService } from "@/lib/vera-ai/drill-service";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "@/lib/vera-ai/envelope";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
const parsed = new URL(connectionString);
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 17)));
const service = new VeraDrillService(db, envelope, "vera-drill-service-secret");
const studentId = randomUUID();
const otherStudentId = randomUUID();
const subtestId = randomUUID();
const topicId = randomUUID();
const sessionId = randomUUID();
const itemId = randomUUID();
const questionId = randomUUID();
const revisionId = randomUUID();
const revisionOptions = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
const revisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: revisionOptions, prompt: "Berapa 2 + 2?", questionType: "single_choice" });

try {
  await db.user.createMany({ data: [{ id: studentId, email: `vera-drill-service-${studentId}@example.test`, fullName: "Vera Drill", passwordHash: "fixture" }, { id: otherStudentId, email: `vera-drill-service-other-${otherStudentId}@example.test`, fullName: "Vera Drill Other", passwordHash: "fixture" }] });
  await db.subtest.create({ data: { id: subtestId, code: `VDS-${subtestId.slice(0, 8)}`, name: "Vera Drill Service" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `vds-topic-${topicId.slice(0, 8)}`, name: "Numerasi" } });
  await db.$transaction(async (tx) => {
    await tx.question.create({ data: { id: questionId, code: `vds-q-${questionId}`, subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: revisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: revisionId, questionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: revisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: revisionOptions } } } });
    await tx.questionRevision.update({ where: { id: revisionId }, data: { status: "ready", readyAt: new Date() } });
  });
  const [prompt, options, scoring] = await Promise.all([
    envelope.encryptAsync("Berapa 2 + 2?", `adaptive-item-prompt:${itemId}`),
    envelope.encryptAsync(JSON.stringify([{ key: "A", content: "4" }, { key: "B", content: "5" }]), `adaptive-item-options:${itemId}`),
    envelope.encryptAsync(JSON.stringify({ correctOptionKey: "A", explanation: "Dua ditambah dua adalah empat." }), `adaptive-item-scoring:${itemId}`),
  ]);
  await db.adaptivePracticeSession.create({ data: { id: sessionId, studentId, topicId, status: "in_progress" } });
  await db.adaptivePracticeItem.create({ data: { id: itemId, adaptiveSessionId: sessionId, ordinal: 1, questionId, questionRevisionId: revisionId, questionRevisionDigest: revisionDigest, promptSnapshotCiphertext: prompt as never, optionSnapshotCiphertext: options as never, scoringSnapshotCiphertext: scoring as never, candidateContractVersion: "vera-drill-v1", candidateSourceKind: "standalone_quiz", sourceAttemptId: randomUUID(), sourceAssessmentItemId: randomUUID(), assessmentReleaseDigest: "release-digest", renderReleaseState: "released", answerReleaseState: "released", explanationReleaseState: "unavailable" } });

  const initial = await service.readSession(studentId, sessionId);
  assert.equal(initial.revision, 0);
  assert.equal(initial.items[0]?.prompt, "Berapa 2 + 2?");
  await assert.rejects(() => service.readSession(otherStudentId, sessionId), /target_unavailable/);
  const answerInput = { studentId, sessionId, clientAnswerId: randomUUID(), expectedSessionRevision: 0, adaptivePracticeItemId: itemId, itemRevisionToken: initial.items[0]!.itemRevisionToken, selectedOptionKey: "A" };
  const answered = await service.answer(answerInput);
  assert.equal(answered.sessionRevision, 1);
  assert.equal(answered.replayed, false);
  assert.equal((await service.answer(answerInput)).replayed, true);
  await assert.rejects(() => service.answer({ ...answerInput, selectedOptionKey: "B" }), /answer_idempotency_conflict/);
  await assert.rejects(() => service.answer({ ...answerInput, clientAnswerId: randomUUID() }), /answer_already_recorded/);

  const submission = { studentId, sessionId, clientSubmissionId: randomUUID(), expectedSessionRevision: 1 };
  const scored = await service.submit(submission);
  assert.equal(scored.replayed, false);
  assert.equal(scored.result.score, 100);
  assert.equal(scored.result.items[0]?.correctness, true);
  assert.equal(scored.result.items[0]?.explanationState, "unavailable");
  assert.equal("explanation" in scored.result.items[0]!, false);
  assert.equal((await service.submit(submission)).replayed, true);
  await assert.rejects(() => service.submit({ ...submission, expectedSessionRevision: 2 }), /submission_idempotency_conflict/);
  const terminalOtherKey = await service.submit({ ...submission, clientSubmissionId: randomUUID(), expectedSessionRevision: 999 });
  assert.equal(terminalOtherKey.replayed, true);
  assert.equal(terminalOtherKey.result.score, 100);

  console.log("PASS vera-drill-service-sprint3: item-bound answer HMAC/CAS, replay, conflict and duplicate-item terminal semantics");
  console.log("PASS vera-drill-service-sprint3: exactly-once scoring, terminal submit replay and frozen explanation withholding");
} finally {
  await db.adaptivePracticeAnswer.deleteMany({ where: { adaptiveSessionId: sessionId } });
  await db.adaptivePracticeItem.deleteMany({ where: { adaptiveSessionId: sessionId } });
  await db.adaptivePracticeSession.deleteMany({ where: { id: sessionId } });
  await db.aiEnvelopeKey.deleteMany({ where: { OR: [{ objectId: { contains: itemId } }, { objectId: { contains: sessionId } }] } });
  await db.$transaction(async (tx) => {
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
  await db.user.deleteMany({ where: { id: { in: [studentId, otherStudentId] } } });
  await db.$disconnect();
}
