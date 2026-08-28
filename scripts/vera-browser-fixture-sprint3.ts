import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, selectionDigest, sha256Hex } from "@/lib/vera-ai/contracts";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString || process.env.VERA_DISPOSABLE_DB_ACK !== "1") throw new Error("Disposable database acknowledgement is required.");
const parsed = new URL(connectionString);
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const studentId = "7c525d4a-7663-4f2e-8e18-1f3712d7b301";
const conversationId = "7c525d4a-7663-4f2e-8e18-1f3712d7b302";
const subtestId = "7c525d4a-7663-4f2e-8e18-1f3712d7b303";
const topicId = "7c525d4a-7663-4f2e-8e18-1f3712d7b304";
const moduleId = "7c525d4a-7663-4f2e-8e18-1f3712d7b305";
const questionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b306";
const revisionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b307";
const quizId = "7c525d4a-7663-4f2e-8e18-1f3712d7b308";
const quizItemId = "7c525d4a-7663-4f2e-8e18-1f3712d7b309";
const participationId = "7c525d4a-7663-4f2e-8e18-1f3712d7b310";
const attemptId = "7c525d4a-7663-4f2e-8e18-1f3712d7b311";
const universityId = "7c525d4a-7663-4f2e-8e18-1f3712d7b312";
const majorId = "7c525d4a-7663-4f2e-8e18-1f3712d7b313";
const tryoutId = "7c525d4a-7663-4f2e-8e18-1f3712d7b314";
const tryoutReleaseId = "7c525d4a-7663-4f2e-8e18-1f3712d7b315";
const tryoutSessionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b316";
const tryoutAdmissionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b317";
const tryoutAttemptId = "7c525d4a-7663-4f2e-8e18-1f3712d7b318";
const tryoutSectionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b319";
const tryoutItemId = "7c525d4a-7663-4f2e-8e18-1f3712d7b320";
const tryoutRunId = "7c525d4a-7663-4f2e-8e18-1f3712d7b321";
const tryoutQuestionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b322";
const tryoutRevisionId = "7c525d4a-7663-4f2e-8e18-1f3712d7b323";
const token = "vera-sprint3-browser-session";
const mode = process.argv[2] ?? "setup";

try {
  if (mode === "cleanup") {
    const requestIds = (await db.aiRequest.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
    const envelopeObjectIds = [
      ...(await db.aiMessage.findMany({ where: { conversationId }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiRequestResultStage.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id),
      ...(await db.aiArtifact.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id),
    ];
    await db.authSession.deleteMany({ where: { userId: studentId } });
    await db.roleAssignment.deleteMany({ where: { userId: studentId } });
    await db.aiArtifactLifecycle.deleteMany({ where: { artifact: { studentId } } });
    await db.learningRecommendation.deleteMany({ where: { studentId } });
    await db.aiArtifact.deleteMany({ where: { studentId } });
    const adaptiveSessionIds = (await db.adaptivePracticeSession.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id);
    const weaknessAnalysisIds = (await db.weaknessAnalysis.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id);
    await db.adaptivePracticeAnswer.deleteMany({ where: { adaptiveSessionId: { in: adaptiveSessionIds } } });
    await db.adaptivePracticeItem.deleteMany({ where: { adaptiveSessionId: { in: adaptiveSessionIds } } });
    await db.adaptivePracticeSession.deleteMany({ where: { id: { in: adaptiveSessionIds } } });
    await db.weaknessAnalysisTopic.deleteMany({ where: { weaknessAnalysisId: { in: weaknessAnalysisIds } } });
    await db.weaknessAnalysis.deleteMany({ where: { id: { in: weaknessAnalysisIds } } });
    await db.ptnStrategySession.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.aiRequest.deleteMany({ where: { studentId } });
    await db.aiMessage.deleteMany({ where: { conversationId } });
    await db.aiConversation.deleteMany({ where: { studentId } });
    await db.aiAdmissionEvent.deleteMany({ where: { studentId } });
    await db.aiUsageDaily.deleteMany({ where: { studentId } });
    await db.aiIdempotencyKey.deleteMany({ where: { studentId } });
    if (envelopeObjectIds.length) {
      await db.aiEnvelopeKey.deleteMany({ where: { OR: envelopeObjectIds.map((objectId) => ({ objectId: { contains: objectId } })) } });
    }
    await db.billingAccount.deleteMany({ where: { studentId } });
    await db.studentProfile.deleteMany({ where: { userId: studentId } });
    await db.standaloneQuizAttempt.deleteMany({ where: { id: attemptId } });
    await db.standaloneQuizParticipation.deleteMany({ where: { id: participationId } });
    await db.standaloneQuizItem.deleteMany({ where: { id: quizItemId } });
    await db.standaloneQuiz.deleteMany({ where: { id: quizId } });
    await db.tryoutAttemptTestRun.deleteMany({ where: { id: tryoutRunId } });
    await db.tryoutAttempt.deleteMany({ where: { id: tryoutAttemptId } });
    await db.tryoutItemOption.deleteMany({ where: { tryoutItemId } });
    await db.tryoutItem.deleteMany({ where: { id: tryoutItemId } });
    await db.tryoutSection.deleteMany({ where: { id: tryoutSectionId } });
    await db.tryoutDeliverySession.deleteMany({ where: { id: tryoutSessionId } });
    await db.tryoutAdmission.deleteMany({ where: { id: tryoutAdmissionId } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE assessment_releases DISABLE TRIGGER USER');
      await tx.assessmentRelease.deleteMany({ where: { id: tryoutReleaseId } });
      await tx.$executeRawUnsafe('ALTER TABLE assessment_releases ENABLE TRIGGER USER');
    });
    await db.tryoutPackage.deleteMany({ where: { id: tryoutId } });
    await db.module.deleteMany({ where: { id: moduleId } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE question_revision_options DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe('ALTER TABLE question_revisions DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe('ALTER TABLE questions DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey');
      await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey');
      await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: revisionId } });
      await tx.questionRevision.deleteMany({ where: { id: revisionId } });
      await tx.question.deleteMany({ where: { id: questionId } });
      await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: tryoutRevisionId } });
      await tx.questionRevision.deleteMany({ where: { id: tryoutRevisionId } });
      await tx.question.deleteMany({ where: { id: tryoutQuestionId } });
      await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
      await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
      await tx.$executeRawUnsafe('ALTER TABLE questions ENABLE TRIGGER USER');
      await tx.$executeRawUnsafe('ALTER TABLE question_revisions ENABLE TRIGGER USER');
      await tx.$executeRawUnsafe('ALTER TABLE question_revision_options ENABLE TRIGGER USER');
    });
    await db.topic.deleteMany({ where: { id: topicId } });
    await db.subtest.deleteMany({ where: { id: subtestId } });
    await db.major.deleteMany({ where: { id: majorId } });
    await db.university.deleteMany({ where: { id: universityId } });
    await db.user.deleteMany({ where: { id: studentId } });
    console.log("PASS vera-browser-fixture: cleanup");
  } else {
    const policy = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
    if (!policy) throw new Error("Policy seed missing.");
    await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "active", effectiveAt: new Date(Date.now() - 60_000) } });
    await db.user.upsert({ where: { id: studentId }, update: {}, create: { id: studentId, email: "vera-sprint3-browser@example.test", fullName: "Vera Browser", passwordHash: "fixture" } });
    await db.university.upsert({ where: { id: universityId }, update: {}, create: { id: universityId, name: "Universitas Browser", shortName: "UB" } });
    await db.major.upsert({ where: { id: majorId }, update: {}, create: { id: majorId, universityId, name: "Teknik Browser" } });
    await db.studentProfile.upsert({ where: { userId: studentId }, update: { timezone: "Asia/Jakarta", onboardingStatus: "completed", targetUniversityId: universityId, targetMajorId: majorId }, create: { userId: studentId, timezone: "Asia/Jakarta", onboardingStatus: "completed", targetUniversityId: universityId, targetMajorId: majorId } });
    const role = await db.roleAssignment.findFirst({ where: { userId: studentId, role: "student", revokedAt: null } });
    if (!role) await db.roleAssignment.create({ data: { userId: studentId, role: "student" } });
    await db.billingAccount.upsert({ where: { studentId }, update: { planCode: "pro", status: "trial" }, create: { studentId, planCode: "pro", status: "trial" } });
    await db.subtest.upsert({ where: { id: subtestId }, update: {}, create: { id: subtestId, code: "VERA-BROWSER", name: "Vera Browser" } });
    await db.topic.upsert({ where: { id: topicId }, update: {}, create: { id: topicId, subtestId, code: "vera-browser-topic", name: "Rasio Browser" } });
    await db.module.upsert({ where: { id: moduleId }, update: { status: "published", publishedAt: new Date() }, create: { id: moduleId, topicId, code: "vera-browser-module", title: "Rasio untuk Browser", summary: "Materi rasio yang dirilis untuk bukti browser Vera.", sequenceNo: 1, status: "published", publishedAt: new Date() } });
    const revisionOptions = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
    const revisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: revisionOptions, prompt: "Berapa 2 + 2?", questionType: "single_choice" });
    const tryoutRevisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: revisionOptions, prompt: "Berapa 2 + 2 pada tryout?", questionType: "single_choice" });
    if (!await db.question.findUnique({ where: { id: questionId } })) {
      await db.$transaction(async (tx) => {
        await tx.question.create({ data: { id: questionId, code: "vera-browser-question", subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: revisionId, createdByUserId: studentId, updatedByUserId: studentId } });
        await tx.questionRevision.create({ data: { id: revisionId, questionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: revisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: revisionOptions } } } });
        await tx.questionRevision.update({ where: { id: revisionId }, data: { status: "ready", readyAt: new Date() } });
      });
    }
    if (!await db.question.findUnique({ where: { id: tryoutQuestionId } })) {
      await db.$transaction(async (tx) => {
        await tx.question.create({ data: { id: tryoutQuestionId, code: "vera-browser-tryout-question", subtestId, topicId, stem: "Berapa 2 + 2 pada tryout?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: tryoutRevisionId, createdByUserId: studentId, updatedByUserId: studentId } });
        await tx.questionRevision.create({ data: { id: tryoutRevisionId, questionId: tryoutQuestionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2 pada tryout?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: tryoutRevisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: revisionOptions } } } });
        await tx.questionRevision.update({ where: { id: tryoutRevisionId }, data: { status: "ready", readyAt: new Date() } });
      });
    }
    await db.standaloneQuiz.upsert({ where: { id: quizId }, update: {}, create: { id: quizId, slug: "vera-browser-quiz", title: "Latihan Browser", description: "Latihan rilis untuk Vera.", subtestId, status: "published", reviewTiming: "immediate", correctAnswerVisibility: "show", createdByUserId: studentId } });
    await db.standaloneQuizItem.upsert({ where: { id: quizItemId }, update: {}, create: { id: quizItemId, quizId, sortOrder: 1, prompt: "Berapa 2 + 2?", explanation: "Empat", difficulty: "easy", subtestId, sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: revisionDigest, sourceRevisionProvenance: "authored" } });
    const policySnapshot = { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null };
    await db.standaloneQuizParticipation.upsert({ where: { id: participationId }, update: {}, create: { id: participationId, quizId, studentId, policySnapshot } });
    await db.standaloneQuizAttempt.upsert({ where: { id: attemptId }, update: {}, create: { id: attemptId, participationId, attemptNo: 1, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", releaseAt: new Date(), score: 100, policySnapshot, formItemOrder: [quizItemId], formSnapshot: { version: 1, items: [{ id: quizItemId, prompt: "Berapa 2 + 2?", explanation: "Dua ditambah dua adalah empat.", options: [{ choiceKey: "A", content: "4", isCorrect: true }, { choiceKey: "B", content: "5", isCorrect: false }] }] } } });
    const tryoutReleaseDigest = sha256Hex(`vera-browser-tryout-release:${tryoutId}`);
    await db.tryoutPackage.upsert({ where: { id: tryoutId }, update: {}, create: { id: tryoutId, code: "VERA-BROWSER-TRYOUT", title: "Tryout Browser", status: "published", publishedAt: new Date(), createdByUserId: studentId } });
    await db.assessmentRelease.upsert({ where: { id: tryoutReleaseId }, update: {}, create: { id: tryoutReleaseId, tryoutId, releaseNumber: 1, contentDigest: tryoutReleaseDigest, payload: { version: 1, sections: [] }, publishedAt: new Date(), createdByUserId: studentId } });
    await db.tryoutSection.upsert({ where: { id: tryoutSectionId }, update: {}, create: { id: tryoutSectionId, tryoutId, subtestId, title: "Bagian Rasio", sequenceNo: 1, durationSeconds: 600, questionCount: 1, testType: "cbt" } });
    await db.tryoutItem.upsert({ where: { id: tryoutItemId }, update: {}, create: { id: tryoutItemId, tryoutId, tryoutSectionId, sourceQuestionId: tryoutQuestionId, sourceQuestionRevisionId: tryoutRevisionId, sourceContentDigest: tryoutRevisionDigest, sourceRevisionProvenance: "authored", sortOrder: 1, prompt: "Berapa 2 + 2 pada tryout?", explanation: "Dua ditambah dua adalah empat.", difficulty: "easy", subtestId, packageCode: "VERA-BROWSER-TRYOUT", options: { createMany: { data: [{ choiceKey: "A", content: "4", isCorrect: true, sortOrder: 1 }, { choiceKey: "B", content: "5", isCorrect: false, sortOrder: 2 }] } } } });
    const tryoutRunSnapshot = { version: 1, items: [{ id: tryoutItemId, prompt: "Berapa 2 + 2 pada tryout?", explanation: "Dua ditambah dua adalah empat.", difficulty: "easy", sourceQuestionId: tryoutQuestionId, sourceQuestionRevisionId: tryoutRevisionId, sourceContentDigest: tryoutRevisionDigest, options: [{ choiceKey: "A", content: "4", isCorrect: true }, { choiceKey: "B", content: "5", isCorrect: false }] }] };
    await db.tryoutDeliverySession.upsert({ where: { id: tryoutSessionId }, update: {}, create: { id: tryoutSessionId, tryoutId, name: "Sesi Tryout Browser", availableFrom: new Date(Date.now() - 60_000), availableUntil: new Date(Date.now() + 3_600_000), status: "active", createdByUserId: studentId, updatedByUserId: studentId, assessmentReleaseId: tryoutReleaseId } });
    await db.tryoutAdmission.upsert({ where: { id: tryoutAdmissionId }, update: {}, create: { id: tryoutAdmissionId, tryoutId, studentId, status: "active", decidedAt: new Date(), decidedByUserId: studentId } });
    await db.tryoutAttempt.upsert({ where: { id: tryoutAttemptId }, update: {}, create: { id: tryoutAttemptId, tryoutId, deliverySessionId: tryoutSessionId, admissionId: tryoutAdmissionId, studentId, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", assessmentReleaseId: tryoutReleaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: tryoutReleaseDigest, serverStartedAt: new Date(Date.now() - 120_000), serverDeadlineAt: new Date(Date.now() - 60_000), submittedAt: new Date(Date.now() - 70_000), releaseAt: new Date(), score: 640, releasePolicySnapshot: { policy: "immediate" }, contentSnapshot: tryoutRunSnapshot } });
    await db.tryoutAttemptTestRun.upsert({ where: { id: tryoutRunId }, update: {}, create: { id: tryoutRunId, attemptId: tryoutAttemptId, tryoutSectionId, sequenceNo: 1, status: "sealed", scoringState: "scored", assessmentReleaseId: tryoutReleaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: tryoutReleaseDigest, serverStartedAt: new Date(Date.now() - 120_000), serverDeadlineAt: new Date(Date.now() - 60_000), sealedAt: new Date(Date.now() - 70_000), contentSnapshot: tryoutRunSnapshot, calculationReleaseable: true, correctCount: 1, wrongCount: 0, unansweredCount: 0, maxScore: 1 } });
    await db.aiConversation.upsert({ where: { id: conversationId }, update: {}, create: { id: conversationId, studentId, conversationType: "vera_chat", title: "Ruang belajar Vera" } });
    await db.aiConversationSource.deleteMany({ where: { conversationId } });
    const sources = [
      { sourceType: "material" as const, sourceId: moduleId },
      { sourceType: "practice" as const, sourceId: attemptId },
      { sourceType: "practice" as const, sourceId: tryoutAttemptId },
    ];
    const digest = selectionDigest(sources);
    await db.aiConversationSource.createMany({ data: [
      { conversationId, sourceType: "material", sourceId: moduleId, titleSnapshot: "Rasio untuk Browser", contentDigest: sha256Hex(canonicalJson({ moduleId })), sortOrder: 0, selectionDigest: digest },
      { conversationId, sourceType: "practice", sourceId: attemptId, titleSnapshot: "Latihan Browser", contentDigest: sha256Hex(canonicalJson({ attemptId })), sortOrder: 1, selectionDigest: digest },
      { conversationId, sourceType: "practice", sourceId: tryoutAttemptId, titleSnapshot: "Tryout Browser", contentDigest: sha256Hex(canonicalJson({ tryoutAttemptId, tryoutReleaseDigest })), sortOrder: 2, selectionDigest: digest },
    ] });
    await db.aiConversation.update({ where: { id: conversationId }, data: { contextVersion: { increment: 1 } } });
    await db.authSession.deleteMany({ where: { userId: studentId } });
    await db.authSession.create({ data: { userId: studentId, refreshTokenHash: createHash("sha256").update(token).digest("hex"), status: "active", expiresAt: new Date(Date.now() + 3_600_000), lastSeenAt: new Date() } });
    console.log(`PASS vera-browser-fixture: setup student=${studentId} conversation=${conversationId} token=${token}`);
  }
} finally {
  await db.$disconnect();
}
