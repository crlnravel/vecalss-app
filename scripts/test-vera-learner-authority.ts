import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "../lib/vera-ai/envelope";
import { prepareContextPack } from "../lib/vera-ai/context-pack";
import { createPrismaVeraContextResolver } from "../lib/vera-ai/prisma-context-resolver";
import { VeraLearnerService } from "../lib/vera-ai/learner-service";
import { questionRevisionContentDigest } from "../lib/question-bank/revision";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
const parsed = new URL(connectionString);
assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "learner authority fixture requires local PostgreSQL");
assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 57)));
const resolver = createPrismaVeraContextResolver(db);
const learner = new VeraLearnerService(db, envelope, "vera-s5-authority-cursor", "vera-s5-authority-hmac");

const studentId = randomUUID();
const subtestId = randomUUID();
const topicId = randomUUID();
const questionId = randomUUID();
const revisionId = randomUUID();
const quizId = randomUUID();
const quizItemId = randomUUID();
const participationId = randomUUID();
const kuisAttemptId = randomUUID();
const tryoutId = randomUUID();
const releaseId = randomUUID();
const deliverySessionId = randomUUID();
const admissionId = randomUUID();
const sectionId = randomUUID();
const tryoutItemId = randomUUID();
const tryoutAttemptId = randomUUID();
const conversationId = randomUUID();
const optionRows = [
  { label: "A", content: "4", isCorrect: true, sortOrder: 1 },
  { label: "B", content: "5", isCorrect: false, sortOrder: 2 },
];
const questionDigest = questionRevisionContentDigest({
  difficulty: "easy",
  explanation: "Dua ditambah dua adalah empat.",
  options: optionRows,
  prompt: "Berapa 2 + 2?",
  questionType: "single_choice",
});
const now = new Date();

async function main(): Promise<void> {
  await db.user.create({ data: { id: studentId, email: `vera-s5-authority-${studentId}@example.test`, fullName: "Vera authority fixture", passwordHash: "fixture" } });
  await db.subtest.create({ data: { id: subtestId, code: `VS5-${subtestId.slice(0, 8)}`, name: "Vera authority" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `topic-${topicId.slice(0, 8)}`, name: "Rasio" } });
  await db.$transaction(async (tx) => {
    await tx.question.create({ data: { id: questionId, code: `vera-s5-question-${questionId}`, subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: revisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: revisionId, questionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: questionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: optionRows } } } });
    await tx.questionRevision.update({ where: { id: revisionId }, data: { status: "ready", readyAt: now } });
  });
  const policySnapshot = { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null };
  await db.standaloneQuiz.create({ data: { id: quizId, slug: `vera-s5-quiz-${quizId}`, title: "Kuis rilis Vera", description: "Kuis owner-scoped yang sudah dirilis.", subtestId, status: "published", reviewTiming: "immediate", correctAnswerVisibility: "show", createdByUserId: studentId } });
  await db.standaloneQuizItem.create({ data: { id: quizItemId, quizId, sortOrder: 1, prompt: "Prompt mutable yang bukan authority", explanation: "Explanation mutable", difficulty: "easy", subtestId, sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: questionDigest, sourceRevisionProvenance: "authored" } });
  await db.standaloneQuizParticipation.create({ data: { id: participationId, quizId, studentId, policySnapshot } });
  await db.standaloneQuizAttempt.create({ data: { id: kuisAttemptId, participationId, attemptNo: 1, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", releaseAt: now, score: 100, policySnapshot, formItemOrder: [quizItemId], formSnapshot: { version: 1, items: [{ id: quizItemId, prompt: "Frozen Kuis prompt", explanation: "Frozen Kuis explanation", options: [{ choiceKey: "A", content: "4", isCorrect: true }, { choiceKey: "B", content: "5", isCorrect: false }] }] } } });

  const releaseDigest = `vera-s5-tryout-release-${questionDigest}`;
  await db.tryoutPackage.create({ data: { id: tryoutId, code: `VS5-TO-${tryoutId.slice(0, 8)}`, title: "Tryout rilis Vera", description: "Tryout owner-scoped yang sudah dirilis.", status: "published", publishedAt: now, createdByUserId: studentId } });
  await db.assessmentRelease.create({ data: { id: releaseId, tryoutId, releaseNumber: 1, contentDigest: releaseDigest, payload: { version: 1, source: "released" }, publishedAt: now, createdByUserId: studentId } });
  await db.tryoutDeliverySession.create({ data: { id: deliverySessionId, tryoutId, name: "Sesi rilis Vera", availableFrom: new Date(now.getTime() - 60_000), availableUntil: new Date(now.getTime() + 60_000), status: "active", releaseState: "released", releasedAt: now, assessmentReleaseId: releaseId, createdByUserId: studentId, updatedByUserId: studentId } });
  await db.tryoutAdmission.create({ data: { id: admissionId, tryoutId, studentId, status: "active", decidedAt: now, decidedByUserId: studentId } });
  await db.tryoutSection.create({ data: { id: sectionId, tryoutId, subtestId, title: "Rasio", sequenceNo: 1, durationSeconds: 600, questionCount: 1 } });
  await db.tryoutItem.create({ data: { id: tryoutItemId, tryoutId, tryoutSectionId: sectionId, sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: questionDigest, sourceRevisionProvenance: "authored", sortOrder: 1, prompt: "Prompt mutable yang bukan authority", explanation: "Explanation mutable", difficulty: "easy", subtestId, packageCode: "VS5-AUTHORITY" } });
  await db.tryoutAttempt.create({ data: { id: tryoutAttemptId, tryoutId, deliverySessionId, admissionId, studentId, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", assessmentReleaseId: releaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: releaseDigest, serverStartedAt: new Date(now.getTime() - 120_000), serverDeadlineAt: new Date(now.getTime() - 60_000), submittedAt: new Date(now.getTime() - 70_000), releaseAt: now, score: 700, releasePolicySnapshot: { policy: "immediate" }, contentSnapshot: { version: 1, source: "frozen-tryout-release" } } });
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "Authority context" } });

  const kuis = await resolver.resolve({ sourceType: "practice", sourceId: kuisAttemptId }, { studentId });
  assert.equal(kuis.sourceId, kuisAttemptId);
  assert.match(kuis.citationLabel, /^Latihan:/u);
  assert.match(kuis.content, /Skor yang dirilis/u);
  const tryout = await resolver.resolve({ sourceType: "practice", sourceId: tryoutAttemptId }, { studentId });
  assert.equal(tryout.sourceId, tryoutAttemptId);
  assert.match(tryout.citationLabel, /^Tryout:/u);
  assert.equal(tryout.contentDigest, releaseDigest);

  const kuisPack = await prepareContextPack({ studentId, selection: [{ sourceType: "practice", sourceId: kuisAttemptId }], userText: "Gunakan Kuis yang dirilis.", policyVersion: "vera-policy-bundle-v1", promptTemplateHash: "prompt", toolSchemaHash: "schema", systemPolicyHash: "system" }, resolver);
  const tryoutPack = await prepareContextPack({ studentId, selection: [{ sourceType: "practice", sourceId: tryoutAttemptId }], userText: "Gunakan Tryout yang dirilis.", policyVersion: "vera-policy-bundle-v1", promptTemplateHash: "prompt", toolSchemaHash: "schema", systemPolicyHash: "system" }, resolver);
  assert.equal(kuisPack.blocks[0]?.sourceId, kuisAttemptId);
  assert.equal(tryoutPack.blocks[0]?.sourceId, tryoutAttemptId);
  assert.notEqual(kuisPack.selectionDigest, tryoutPack.selectionDigest);

  const kuisContext = await learner.replaceContext({ studentId, conversationId, expectedContextVersion: 0, sources: [{ sourceType: "practice", sourceId: kuisAttemptId }] });
  assert.equal(kuisContext.contextVersion, 1);
  const tryoutContext = await learner.replaceContext({ studentId, conversationId, expectedContextVersion: 1, sources: [{ sourceType: "practice", sourceId: tryoutAttemptId }] });
  assert.equal(tryoutContext.contextVersion, 2);
  const persisted = await learner.readContext(studentId, conversationId);
  assert.equal(persisted.sources[0]?.sourceId, tryoutAttemptId);
  await assert.rejects(
    () => resolver.resolve({ sourceType: "practice", sourceId: tryoutAttemptId }, { studentId: randomUUID() }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "context_release_unavailable",
  );
  console.log(`T12_EVIDENCE learner_authority=prisma-context-resolver kuis=${kuisAttemptId} tryout=${tryoutAttemptId} released=true owner_scoped=true context_pack=typed source_identity=frozen status=pass`);
  console.log("PASS vera-learner-authority: released Kuis and Tryout resolve through Prisma authority and learner context flow");
}

try {
  await main();
} finally {
  await db.aiConversation.deleteMany({ where: { id: conversationId } });
  await db.tryoutAttempt.deleteMany({ where: { id: tryoutAttemptId } });
  await db.tryoutItem.deleteMany({ where: { id: tryoutItemId } });
  await db.tryoutSection.deleteMany({ where: { id: sectionId } });
  await db.tryoutDeliverySession.deleteMany({ where: { id: deliverySessionId } });
  await db.tryoutAdmission.deleteMany({ where: { id: admissionId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("ALTER TABLE assessment_releases DISABLE TRIGGER USER");
    await tx.assessmentRelease.deleteMany({ where: { id: releaseId } });
    await tx.$executeRawUnsafe("ALTER TABLE assessment_releases ENABLE TRIGGER USER");
  });
  await db.tryoutPackage.deleteMany({ where: { id: tryoutId } });
  await db.standaloneQuizAttempt.deleteMany({ where: { id: kuisAttemptId } });
  await db.standaloneQuizParticipation.deleteMany({ where: { id: participationId } });
  await db.standaloneQuizItem.deleteMany({ where: { id: quizItemId } });
  await db.standaloneQuiz.deleteMany({ where: { id: quizId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
    await tx.$executeRawUnsafe("ALTER TABLE question_revision_options DISABLE TRIGGER USER");
    await tx.$executeRawUnsafe("ALTER TABLE question_revisions DISABLE TRIGGER USER");
    await tx.$executeRawUnsafe("ALTER TABLE questions DISABLE TRIGGER USER");
    await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey");
    await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey");
    await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: revisionId } });
    await tx.questionRevision.deleteMany({ where: { id: revisionId } });
    await tx.question.deleteMany({ where: { id: questionId } });
    await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
    await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
    await tx.$executeRawUnsafe("ALTER TABLE questions ENABLE TRIGGER USER");
    await tx.$executeRawUnsafe("ALTER TABLE question_revisions ENABLE TRIGGER USER");
    await tx.$executeRawUnsafe("ALTER TABLE question_revision_options ENABLE TRIGGER USER");
  });
  await db.topic.deleteMany({ where: { id: topicId } });
  await db.subtest.deleteMany({ where: { id: subtestId } });
  await db.user.deleteMany({ where: { id: studentId } });
  await db.$disconnect();
}
