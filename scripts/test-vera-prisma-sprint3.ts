import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { VeraPrismaAdmissionService } from "@/lib/vera-ai/admission-service";
import { VeraArtifactCommandService } from "@/lib/vera-ai/artifact-commands";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "@/lib/vera-ai/envelope";
import { VeraLearnerService } from "@/lib/vera-ai/learner-service";
import { VeraPrismaChatOrchestrator, readPrismaVeraRequestStatus } from "@/lib/vera-ai/prisma-chat-orchestrator";
import { MockProviderAdapter, type PreparedProviderTask, type ProviderResult } from "@/lib/vera-ai/provider";
import { IORedisVeraLeaseStore, type VeraLeaseStore } from "@/lib/vera-ai/redis-lease";
import { canonicalJson, sha256Hex, type VeraContextSelection } from "@/lib/vera-ai/contracts";
import type { ResolvedContextBlock, VeraContextResolver } from "@/lib/vera-ai/context-pack";
import { createPrismaVeraContextResolver } from "@/lib/vera-ai/prisma-context-resolver";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";
import { validateVeraResult } from "@/lib/vera-ai/output-validator";
import { validateStudioOutput, type NormalizedStudioPayload, type VeraStudioToolId } from "@/lib/vera-ai/studio-contracts";
import type { VeraStudioIdentityAuthority } from "@/lib/vera-ai/studio-authority";
import { parseVeraRequestBody, VeraHttpError } from "@/lib/vera-ai/http";

function assertDisposable(url: string) {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test");
  assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1");
}

class RouteStudioProvider extends MockProviderAdapter {
  runCount = 0;
  constructor(private readonly topicId: string, private readonly moduleId: string) { super(); }
  override async run(prepared: PreparedProviderTask): Promise<ProviderResult> {
    this.runCount += 1;
    if (prepared.preparedTask.featureKey !== "vera.route") return super.run(prepared);
    return {
      kind: "structured",
      text: null,
      structured: {
        title: "Rute belajar tersimpan",
        goal: "Menguatkan rasio secara bertahap.",
        activities: [{ ordinal: 1, action: "Pelajari kembali konsep rasio.", estimatedMinutes: 20, topicIds: [this.topicId], moduleIds: [this.moduleId], sourceIds: [], citationKeys: [] }],
        saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: this.topicId, priority: 80, rationale: "Prioritas dipilih dari bukti belajar yang tersedia." },
      },
      usage: { inputTokens: 12, outputTokens: 30, quotaUnitsConsumed: 42, tokenUsageState: "known" },
      finishReason: "stop",
      attempts: [{ attemptNo: 1, state: "completed", providerRequestRef: "mock-route", observedUpstreamProviderSlug: "mock-decart", errorCode: null, usage: { inputTokens: 12, outputTokens: 30, quotaUnitsConsumed: 42, tokenUsageState: "known" } }],
    };
  }
}

class TupleStudioProvider extends MockProviderAdapter {
  runCount = 0;
  constructor(
    private readonly toolId: VeraStudioToolId,
    private readonly topicId: string,
    private readonly moduleId: string,
    private readonly questionId: string,
    private readonly questionRevisionId: string,
  ) { super(); }
  override async run(prepared: PreparedProviderTask): Promise<ProviderResult> {
    this.runCount += 1;
    if (prepared.preparedTask.featureKey !== `vera.${this.toolId}`) return super.run(prepared);
    const commonUsage = { inputTokens: 12, outputTokens: 30, quotaUnitsConsumed: 42, tokenUsageState: "known" as const };
    let citationKey = `src_${this.moduleId.replaceAll("-", "")}`;
    try {
      const task = JSON.parse(Buffer.from(prepared.preparedTask.taskBytes).toString("utf8")) as {
        blocks?: Array<{ citationKey?: unknown }>;
      };
      const preparedCitationKey = task.blocks?.find((block) => typeof block.citationKey === "string")?.citationKey;
      if (typeof preparedCitationKey === "string") citationKey = preparedCitationKey;
    } catch {
      // The edge-only direct provider call intentionally supplies opaque bytes.
    }
    const structured = this.toolId === "analysis"
      ? { title: "Analisis pemulihan", summaryMarkdown: `Bukti rasio perlu diperkuat. [^${citationKey}]`, topics: [{ topicId: this.topicId, moduleId: this.moduleId, rank: 1, weaknessScore: 68, confidence: 0.75, evidenceCitationKeys: [citationKey], limitations: "Bukti terbatas.", nextStep: "Ulangi materi rasio." }] }
      : this.toolId === "route"
        ? { title: "Rute pemulihan", goal: "Menguatkan rasio secara bertahap.", activities: [{ ordinal: 1, action: "Pelajari kembali konsep rasio.", estimatedMinutes: 20, topicIds: [this.topicId], moduleIds: [this.moduleId], sourceIds: [], citationKeys: [] }], saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic" as const, targetId: this.topicId, priority: 80, rationale: "Prioritas dipilih dari bukti belajar yang tersedia." } }
        : this.toolId === "review"
          ? { title: "Ulasan pemulihan", questionId: this.questionId, questionRevisionId: this.questionRevisionId, misconception: "Rasio perlu dibaca dengan teliti.", explanationSteps: ["Tentukan data.", "Bandingkan hasil."], citationKeys: [citationKey] }
          : this.toolId === "summary"
            ? { title: "Ringkasan pemulihan", focus: "Fokus rasio dan latihan rilis.", decisions: ["Ulangi rasio."], nextActions: ["Kerjakan drill rilis."], limitations: "Bukti berasal dari sumber yang dirilis.", citationKeys: [citationKey] }
            : this.toolId === "ptn"
              ? { title: "Strategi pemulihan", universityId: null, majorId: null, scoreEvidence: 640, assumptions: ["Skor rilis digunakan."], actions: ["Perkuat subtes utama."], disclaimer: "Strategi belajar, bukan prediksi kelulusan.", citationKeys: [] }
              : { title: "Drill pemulihan", topicId: this.topicId, items: [{ ordinal: 1, questionId: this.questionId, questionRevisionId: this.questionRevisionId, topicId: this.topicId, difficulty: "easy" as const, explanationPlan: "Tinjau setelah submit." }] };
    return {
      kind: "structured",
      text: null,
      structured,
      usage: commonUsage,
      finishReason: "stop",
      attempts: [{ attemptNo: 1, state: "completed", providerRequestRef: `mock-${this.toolId}`, observedUpstreamProviderSlug: "mock-decart", errorCode: null, usage: commonUsage }],
    };
  }
}

type ExecutableOperationEdge = {
  operation: "conversation_create" | "ai_request" | "learning_recommendation_create" | "artifact_apply";
  malformed: boolean;
  overlong: boolean;
  empty: boolean;
  missingKey: boolean;
  payloadValidation: boolean;
  unauthorizedKey: boolean;
  replay: boolean;
  conflict: boolean;
  expiry: boolean;
  uniqueLoser: boolean;
  unauthorized: boolean;
  workerCasRecovery: boolean;
  crossOperationTargetIsolation: boolean;
  evidenceDigest: string;
};

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
assertDisposable(connectionString);
process.env.DATABASE_URL = connectionString;
const redisConnectionString = process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL;
if (!redisConnectionString) throw new Error("VERA_DISPOSABLE_REDIS_URL or REDIS_URL is required for the real Redis callback matrix.");
const redisLocation = new URL(redisConnectionString);
assert.ok(["127.0.0.1", "localhost"].includes(redisLocation.hostname));
assert.equal(redisLocation.port, "56379");
assert.equal(redisLocation.pathname.replace(/\/$/u, ""), "/15");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rootKey = Buffer.alloc(32, 11);
const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
const admission = new VeraPrismaAdmissionService(db, envelope);
const leaseStore: VeraLeaseStore = new IORedisVeraLeaseStore(redisConnectionString);
const studentId = randomUUID();
const otherStudentId = randomUUID();
let conversationId: string = randomUUID();
const topicId = randomUUID();
const moduleId = randomUUID();
const secondModuleId = randomUUID();
const subtestId = randomUUID();
const drillQuestionId = randomUUID();
const drillRevisionId = randomUUID();
const drillQuizId = randomUUID();
const drillQuizItemId = randomUUID();
const drillParticipationId = randomUUID();
const standaloneAttemptId = randomUUID();
const tryoutId = randomUUID();
const tryoutReleaseId = randomUUID();
const tryoutDeliverySessionId = randomUUID();
const tryoutAdmissionId = randomUUID();
const tryoutSectionId = randomUUID();
const tryoutItemId = randomUUID();
const tryoutAttemptId = randomUUID();
const tryoutRunId = randomUUID();
const tryoutQuestionId = randomUUID();
const tryoutRevisionId = randomUUID();
const drillRevisionOptions = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
const drillRevisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: drillRevisionOptions, prompt: "Berapa 2 + 2?", questionType: "single_choice" });
const tryoutRevisionOptions = [{ label: "A", content: "6", isCorrect: true, sortOrder: 1 }, { label: "B", content: "7", isCorrect: false, sortOrder: 2 }];
const tryoutRevisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Tiga ditambah tiga adalah enam.", options: tryoutRevisionOptions, prompt: "Berapa 3 + 3?", questionType: "single_choice" });
const now = new Date();
const policy = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
if (!policy) throw new Error("Disposable policy seed is missing.");

try {
  // Keep the immutable policy trigger intact while preparing this disposable
  // fixture: only draft rows may receive the test effectiveAt normalization.
  const competingPolicyRows = await db.aiPolicyBundle.findMany({
    where: { id: { not: policy.id }, state: { in: ["active", "scheduled"] } },
    select: { id: true },
  });
  for (const competing of competingPolicyRows) {
    await db.aiPolicyBundle.update({ where: { id: competing.id }, data: { state: "draft" } });
  }
  if (policy.state !== "draft") await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "draft" } });
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "active", effectiveAt: new Date(now.getTime() - 60_000) } });
  await db.user.createMany({ data: [
    { id: studentId, email: `vera-s3-${studentId}@example.test`, fullName: "Vera Sprint 3", passwordHash: "fixture" },
    { id: otherStudentId, email: `vera-s3-other-${otherStudentId}@example.test`, fullName: "Vera Sprint 3 Other", passwordHash: "fixture" },
  ] });
  await db.studentProfile.create({ data: { userId: studentId, timezone: "Asia/Jakarta" } });
  await db.studentProfile.create({ data: { userId: otherStudentId, timezone: "Asia/Jakarta" } });
  await db.billingAccount.create({ data: { studentId, planCode: "pro", status: "trial" } });
  await db.billingAccount.create({ data: { studentId: otherStudentId, planCode: "pro", status: "trial" } });
  await db.subtest.create({ data: { id: subtestId, code: `VS3-${subtestId.slice(0, 8)}`, name: "Vera Sprint 3" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `topic-${topicId.slice(0, 8)}`, name: "Rasio" } });
  await db.module.createMany({ data: [
    { id: moduleId, topicId, code: `vera-s3-${moduleId}`, title: "Rasio dasar", summary: "Materi rasio yang telah dirilis untuk pembelajaran.", sequenceNo: 1, status: "published", publishedAt: now },
    { id: secondModuleId, topicId, code: `vera-s3-${secondModuleId}`, title: "Rasio lanjut", summary: "Materi rasio lanjutan yang telah dirilis.", sequenceNo: 2, status: "published", publishedAt: new Date(now.getTime() - 1_000) },
  ] });
  await db.$transaction(async (tx) => {
    await tx.question.create({ data: { id: drillQuestionId, code: `vera-s3-question-${drillQuestionId}`, subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: drillRevisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: drillRevisionId, questionId: drillQuestionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: drillRevisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: drillRevisionOptions } } } });
    await tx.questionRevision.update({ where: { id: drillRevisionId }, data: { status: "ready", readyAt: now } });
    await tx.question.create({ data: { id: tryoutQuestionId, code: `vera-s3-tryout-question-${tryoutQuestionId}`, subtestId, topicId, stem: "Berapa 3 + 3?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: tryoutRevisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: tryoutRevisionId, questionId: tryoutQuestionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 3 + 3?", questionType: "single_choice", difficulty: "easy", explanation: "Tiga ditambah tiga adalah enam.", contentDigest: tryoutRevisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: tryoutRevisionOptions } } } });
    await tx.questionRevision.update({ where: { id: tryoutRevisionId }, data: { status: "ready", readyAt: now } });
  });
  await db.standaloneQuiz.create({ data: { id: drillQuizId, slug: `vera-s3-quiz-${drillQuizId}`, title: "Latihan Sprint 3", description: "Latihan rilis untuk callback evidence.", subtestId, status: "published", reviewTiming: "immediate", correctAnswerVisibility: "show", createdByUserId: studentId } });
  await db.standaloneQuizItem.create({ data: { id: drillQuizItemId, quizId: drillQuizId, sortOrder: 1, prompt: "Berapa 2 + 2?", explanation: "Empat", difficulty: "easy", subtestId, sourceQuestionId: drillQuestionId, sourceQuestionRevisionId: drillRevisionId, sourceContentDigest: drillRevisionDigest, sourceRevisionProvenance: "authored" } });
  const drillPolicySnapshot = { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null };
  await db.standaloneQuizParticipation.create({ data: { id: drillParticipationId, quizId: drillQuizId, studentId, policySnapshot: drillPolicySnapshot } });
  await db.standaloneQuizAttempt.create({ data: { id: standaloneAttemptId, participationId: drillParticipationId, attemptNo: 1, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", releaseAt: now, score: 100, policySnapshot: drillPolicySnapshot, formItemOrder: [drillQuizItemId], formSnapshot: { version: 1, items: [{ id: drillQuizItemId, prompt: "Berapa 2 + 2?", explanation: "Dua ditambah dua adalah empat.", options: [{ choiceKey: "A", content: "4", isCorrect: true }, { choiceKey: "B", content: "5", isCorrect: false }] }] } } });

  // The end-to-end T12 chain uses the same server-owned resolver for all three
  // released source classes.  The Tryout run snapshot is populated because
  // Studio/drill authority must prove the release digest and item revision,
  // not merely resolve a package title.
  const tryoutReleaseDigest = sha256Hex(canonicalJson({ tryoutId, tryoutRevisionDigest, release: "vera-s3-released" }));
  await db.tryoutPackage.create({ data: { id: tryoutId, code: `vera-s3-tryout-${tryoutId}`, title: "Tryout rilis Sprint 3", description: "Tryout owner-scoped yang telah dirilis.", status: "published", publishedAt: now, createdByUserId: studentId } });
  await db.assessmentRelease.create({ data: { id: tryoutReleaseId, tryoutId, releaseNumber: 1, contentDigest: tryoutReleaseDigest, payload: { version: 1, source: "released" }, publishedAt: now, createdByUserId: studentId } });
  await db.tryoutDeliverySession.create({ data: { id: tryoutDeliverySessionId, tryoutId, name: "Sesi rilis Sprint 3", availableFrom: new Date(now.getTime() - 60_000), availableUntil: new Date(now.getTime() + 3_600_000), status: "active", releaseState: "released", releasedAt: now, assessmentReleaseId: tryoutReleaseId, createdByUserId: studentId, updatedByUserId: studentId } });
  await db.tryoutAdmission.create({ data: { id: tryoutAdmissionId, tryoutId, studentId, status: "active", decidedAt: now, decidedByUserId: studentId } });
  await db.tryoutSection.create({ data: { id: tryoutSectionId, tryoutId, subtestId, title: "Rasio Sprint 3", sequenceNo: 1, durationSeconds: 600, questionCount: 1 } });
  await db.tryoutItem.create({ data: { id: tryoutItemId, tryoutId, tryoutSectionId, sourceQuestionId: tryoutQuestionId, sourceQuestionRevisionId: tryoutRevisionId, sourceContentDigest: tryoutRevisionDigest, sourceRevisionProvenance: "authored", sortOrder: 1, prompt: "Prompt Tryout yang dibekukan", explanation: "Penjelasan Tryout yang dirilis.", difficulty: "easy", subtestId, packageCode: `vera-s3-${tryoutId.slice(0, 8)}` } });
  await db.tryoutAttempt.create({ data: { id: tryoutAttemptId, tryoutId, deliverySessionId: tryoutDeliverySessionId, admissionId: tryoutAdmissionId, studentId, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", assessmentReleaseId: tryoutReleaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: tryoutReleaseDigest, serverStartedAt: new Date(now.getTime() - 120_000), serverDeadlineAt: new Date(now.getTime() - 60_000), submittedAt: new Date(now.getTime() - 70_000), releaseAt: now, score: 710, releasePolicySnapshot: { policy: "immediate" }, contentSnapshot: { version: 1, source: "frozen-tryout-release" } } });
  await db.tryoutAttemptTestRun.create({ data: { id: tryoutRunId, attemptId: tryoutAttemptId, tryoutSectionId, sequenceNo: 1, status: "sealed", scoringState: "scored", assessmentReleaseId: tryoutReleaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: tryoutReleaseDigest, serverStartedAt: new Date(now.getTime() - 120_000), serverDeadlineAt: new Date(now.getTime() - 60_000), sealedAt: now, contentSnapshot: { version: 1, items: [{ id: tryoutItemId, prompt: "Prompt Tryout yang dibekukan", explanation: "Penjelasan Tryout yang dirilis.", sourceQuestionId: tryoutQuestionId, sourceQuestionRevisionId: tryoutRevisionId, sourceContentDigest: tryoutRevisionDigest, difficulty: "easy", options: [{ choiceKey: "A", content: "6", isCorrect: true }, { choiceKey: "B", content: "7", isCorrect: false }] }] }, calculationReleaseable: true } });
  // Use the persisted learner command (rather than a fixture-only insert) so
  // the T12 operation matrix proves the public conversation_create replay
  // contract and its durable idempotency target.
  const conversationCreateKey = `sprint3-conversation-create-${conversationId}`;
  const conversationCreate = await new VeraLearnerService(db, envelope, "sprint3-conversation-cursor", "sprint3-conversation-hmac").createConversation({
    studentId,
    clientRequestId: conversationCreateKey,
    conversationType: "vera_chat",
    title: "Sprint 3 durable",
  });
  conversationId = conversationCreate.conversation.id;
  const conversationReplay = await new VeraLearnerService(db, envelope, "sprint3-conversation-cursor", "sprint3-conversation-hmac").createConversation({
    studentId,
    clientRequestId: conversationCreateKey,
    conversationType: "vera_chat",
    title: "Sprint 3 durable",
  });
  assert.equal(conversationReplay.replayed, true);
  assert.equal(conversationReplay.conversation.id, conversationId);

  const prismaContextResolver = createPrismaVeraContextResolver(db);
  const contextResolver: VeraContextResolver = {
    resolve: async (selection: VeraContextSelection, authority): Promise<ResolvedContextBlock> => {
      if (selection.sourceType === "document") throw new Error("document source is disabled in the fixture");
      if ((selection.sourceType === "material" && ([moduleId, secondModuleId] as string[]).includes(selection.sourceId))
        || (selection.sourceType === "practice" && ([standaloneAttemptId, tryoutAttemptId] as string[]).includes(selection.sourceId))) {
        return prismaContextResolver.resolve(selection, { studentId: authority?.studentId ?? studentId });
      }
      return {
        sourceType: selection.sourceType,
        sourceId: selection.sourceId,
        title: "Rasio dasar",
        citationLabel: "Rasio dasar",
        citationKey: "src_ratio",
        content: "Materi rasio yang telah dirilis.",
      };
    },
  };
  const orchestrator = new VeraPrismaChatOrchestrator({
    db,
    admission,
    contextResolver,
    provider: new RouteStudioProvider(topicId, moduleId),
    envelope,
    leaseStore,
    hmacSecret: "sprint3-fixture-hmac",
  });
  const clientRequestId = randomUUID();
  const selection = [{ sourceType: "material" as const, sourceId: moduleId }];
  const response = await orchestrator.sse({ studentId, conversationId, clientRequestId, kind: "studio", toolId: "route", text: "Buat rute belajar.", selection });
  assert.ok(response.headers.get("content-type")?.startsWith("text/event-stream"));
  const wire = await response.text();
  assert.ok(wire.includes("event: progress.updated"));
  assert.ok(wire.includes("event: artifact.ready"));
  assert.ok(wire.includes("event: request.completed"));
  assert.ok(wire.indexOf("event: artifact.ready") < wire.indexOf("event: request.completed"));
  assert.ok(!wire.includes("event: message.delta"));
  assert.ok(!wire.includes("Rute belajar tersimpan"));

  const status = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId }, { admission, envelope });
  assert.equal(status?.state, "succeeded");
  assert.equal(status?.artifact?.artifactType, "route");
  const request = await db.aiRequest.findUnique({ where: { id: status!.requestId }, include: { resultStage: true, artifacts: { include: { lifecycle: true } } } });
  assert.equal(request?.requestType, "vera_chat");
  assert.equal(request?.featureKey, "vera.route");
  assert.equal(request?.outputSchemaVersion, "1");
  assert.equal(request?.outputSchemaId, "vera.route.schema.v1");
  assert.equal(request?.resultStage?.outputSchemaId, request?.outputSchemaId);
  assert.equal(request?.artifacts.length, 1);
  assert.equal(request?.artifacts[0]?.lifecycle?.lifecycleRevision, 0);
  assert.equal(await db.aiArtifact.count({ where: { requestId: request!.id } }), 1);

  const callbackCrashKeys = new Map<VeraStudioToolId, string>();
  const callbackCrashRequests = new Map<VeraStudioToolId, string>();
  const callbackCrashSelections = new Map<VeraStudioToolId, VeraContextSelection[]>();
  const callbackCrashHmacs = new Map<VeraStudioToolId, string>();
  const callbackChatKey = new Map<"chat", string>();
  const callbackChatRequest = new Map<"chat", string>();
  const callbackChatHmac = new Map<"chat", string>();

  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION vera_fixture_crash_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'vera fixture durable insert crash'; END $$`);
  const crashEntries = [
    { toolId: "analysis" as const, table: "weakness_analyses" as const },
    { toolId: "analysis" as const, table: "weakness_analysis_topics" as const },
    { toolId: "route" as const, table: "ai_artifacts" as const },
    { toolId: "review" as const, table: "ai_artifacts" as const },
    { toolId: "summary" as const, table: "ai_artifacts" as const },
    { toolId: "ptn" as const, table: "ptn_strategy_sessions" as const },
    { toolId: "drill" as const, table: "adaptive_practice_sessions" as const },
  ] as const;
  for (const entry of crashEntries) {
    const trigger = `vera_fixture_crash_${entry.toolId}_${entry.table}`;
    await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${entry.table} FOR EACH ROW EXECUTE FUNCTION vera_fixture_crash_insert()`);
    const crashKey = randomUUID();
    const crashProvider = new TupleStudioProvider(entry.toolId, topicId, moduleId, drillQuestionId, drillRevisionId);
    const crashOrchestrator = new VeraPrismaChatOrchestrator({
      db,
      admission: new VeraPrismaAdmissionService(db, envelope),
      contextResolver,
      provider: crashProvider,
      envelope,
      leaseStore,
      hmacSecret: `sprint3-crash-${entry.toolId}-${entry.table}`,
    });
    try {
      const crashSelection = entry.toolId === "review" || entry.toolId === "drill"
        ? [...selection, { sourceType: "practice" as const, sourceId: standaloneAttemptId }]
        : selection;
      const crashResponse = await crashOrchestrator.sse({ studentId, conversationId, clientRequestId: crashKey, kind: "studio", toolId: entry.toolId, text: `Uji crash ${entry.toolId}/${entry.table}.`, selection: crashSelection });
      const crashWire = await crashResponse.text();
      assert.ok(crashWire.includes("request.recovery_pending"));
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON ${entry.table}`);
    }
    const crashRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: crashKey }, include: { resultStage: true } });
    assert.equal(crashProvider.runCount, 1);
    assert.equal(crashRequest.status, "pending");
    assert.equal(crashRequest.resultStage?.state, "available");
    assert.equal(await db.weaknessAnalysis.count({ where: { requestId: crashRequest.id } }), 0);
    assert.equal(await db.aiArtifact.count({ where: { requestId: crashRequest.id } }), 0);
    const recoverAt = new Date(Date.now() + 120_000);
    await db.aiRequest.update({ where: { id: crashRequest.id }, data: { settlementDeadlineAt: new Date(recoverAt.getTime() - 1_000) } });
    const recoveryRace = await Promise.all([
      admission.settleOverdueRequest({ requestId: crashRequest.id, now: recoverAt }),
      new VeraPrismaAdmissionService(db, envelope).settleOverdueRequest({ requestId: crashRequest.id, now: recoverAt }),
    ]);
    assert.equal(recoveryRace.length, 2);
    const recovered = await db.aiRequest.findUniqueOrThrow({ where: { id: crashRequest.id }, include: { resultStage: true } });
    assert.equal(recovered.status, "succeeded");
    assert.equal(recovered.resultStage?.state, "consumed");
    if (entry.toolId === "analysis") assert.equal(await db.weaknessAnalysis.count({ where: { requestId: crashRequest.id } }), 1);
    if (entry.toolId === "ptn") assert.equal(await db.ptnStrategySession.count({ where: { requestId: crashRequest.id } }), 1);
    if (entry.toolId === "drill") assert.equal(await db.adaptivePracticeSession.count({ where: { requestId: crashRequest.id } }), 1);
    assert.equal(await db.aiArtifact.count({ where: { requestId: crashRequest.id } }), 1);
    assert.equal(await db.aiArtifactLifecycle.count({ where: { artifact: { requestId: crashRequest.id } } }), 1);
    callbackCrashKeys.set(entry.toolId, crashKey);
    callbackCrashRequests.set(entry.toolId, crashRequest.id);
    callbackCrashSelections.set(entry.toolId, entry.toolId === "review" || entry.toolId === "drill"
      ? [...selection, { sourceType: "practice" as const, sourceId: standaloneAttemptId }]
      : selection);
    callbackCrashHmacs.set(entry.toolId, `sprint3-crash-${entry.toolId}-${entry.table}`);
  }
  // The closed durable callback registry also contains the non-Studio chat
  // tuple (toolId=null). Exercise that entry independently through all three
  // recovery owners: normal finalization, status-triggered recovery, and the
  // worker/overdue path. The assistant insert trigger proves that callback
  // failure rolls back the stage transaction instead of becoming an
  // accounting-only success; each recovery then proves one message and one
  // ledger finalization, with replay remaining side-effect free.
  const chatNormalizedResult = validateVeraResult({
    text: "Mock Vera response.",
    structured: null,
    kind: "success",
    finishReason: "stop",
    usage: { inputTokens: 12, outputTokens: 16, quotaUnitsConsumed: 40, tokenUsageState: "known" },
    allowedCitationKeys: [],
  });
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION vera_fixture_crash_assistant_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'assistant' THEN RAISE EXCEPTION 'vera fixture chat assistant insert crash'; END IF; RETURN NEW; END $$`);
  for (const recoveryMode of ["normal", "status", "worker"] as const) {
    const chatKey = randomUUID();
    const chatProvider = new MockProviderAdapter();
    const chatOrchestrator = new VeraPrismaChatOrchestrator({
      db,
      admission,
      contextResolver,
      provider: chatProvider,
      envelope,
      leaseStore,
      hmacSecret: `sprint3-chat-crash-${recoveryMode}`,
    });
    const chatTrigger = "vera_fixture_crash_chat_ai_messages";
    await db.$executeRawUnsafe(`CREATE TRIGGER ${chatTrigger} BEFORE INSERT ON ai_messages FOR EACH ROW EXECUTE FUNCTION vera_fixture_crash_assistant_message()`);
    try {
      const chatResponse = await chatOrchestrator.sse({ studentId, conversationId, clientRequestId: chatKey, kind: "chat", text: `Uji crash chat ${recoveryMode}.`, selection });
      const chatWire = await chatResponse.text();
      assert.ok(chatWire.includes("request.recovery_pending"));
      assert.ok(!chatWire.includes("message.committed"));
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${chatTrigger} ON ai_messages`);
    }
    const chatRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: chatKey }, include: { resultStage: true } });
    assert.equal(chatRequest.featureKey, "vera.chat");
    assert.equal(chatRequest.outputSchemaId, "vera.chat.freeform.v1");
    assert.equal(chatProvider.calls.length, 1);
    assert.equal(chatRequest.status, "pending");
    assert.equal(chatRequest.assistantMessageId, null);
    assert.equal(chatRequest.resultStage?.state, "available");
    const beforeDaily = await db.aiUsageDaily.findFirstOrThrow({ where: { studentId, ledgerVersion: "vera_quota_v1" } });

    if (recoveryMode === "normal") {
      await admission.finalizeAcceptedRequest({ requestId: chatRequest.id, normalizedResult: chatNormalizedResult, now: new Date() });
    } else {
      const overdueAt = new Date(Date.now() - 1_000);
      await db.aiRequest.update({ where: { id: chatRequest.id }, data: { settlementDeadlineAt: overdueAt } });
      if (recoveryMode === "status") {
        const statusRecovery = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: chatKey }, { admission, envelope });
        assert.equal(statusRecovery?.state, "succeeded");
        assert.equal(statusRecovery?.resultState, "committed");
      } else {
        await admission.settleOverdueRequest({ requestId: chatRequest.id, now: overdueAt });
      }
    }

    const recoveredChat = await db.aiRequest.findUniqueOrThrow({ where: { id: chatRequest.id }, include: { resultStage: true } });
    assert.equal(recoveredChat.status, "succeeded");
    assert.equal(recoveredChat.resultStage?.state, "consumed");
    assert.ok(recoveredChat.assistantMessageId);
    assert.equal(recoveredChat.quotaUnitsConsumed, 40);
    assert.equal(recoveredChat.usageAccountingState, "known");
    const assistant = await db.aiMessage.findUniqueOrThrow({ where: { id: recoveredChat.assistantMessageId! } });
    assert.equal(assistant.role, "assistant");
    assert.ok(assistant.contentEnvelope);
    const afterDaily = await db.aiUsageDaily.findFirstOrThrow({ where: { studentId, ledgerVersion: "vera_quota_v1" } });
    assert.equal(afterDaily.finalizedRequestCount, beforeDaily.finalizedRequestCount + 1);
    const replay = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: chatKey }, { admission, envelope });
    assert.equal(replay?.state, "succeeded");
    assert.equal(replay?.resultState, "committed");
    const replayDaily = await db.aiUsageDaily.findFirstOrThrow({ where: { studentId, ledgerVersion: "vera_quota_v1" } });
    assert.equal(replayDaily.finalizedRequestCount, afterDaily.finalizedRequestCount);
    if (!callbackChatKey.has("chat")) {
    callbackChatKey.set("chat", chatKey);
    callbackChatRequest.set("chat", chatRequest.id);
    callbackChatHmac.set("chat", `sprint3-chat-crash-${recoveryMode}`);
    }
  }
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_assistant_message()`);

  const recoveryAdmission = new VeraPrismaAdmissionService(db, envelope);
  const normalFinalize = recoveryAdmission.finalizeAcceptedRequest.bind(recoveryAdmission);
  let injectDrift = true;
  recoveryAdmission.finalizeAcceptedRequest = async (input) => {
    if (injectDrift) {
      injectDrift = false;
      await db.module.update({ where: { id: moduleId }, data: { status: "draft" } });
    }
    return normalFinalize(input);
  };
  const recoveryKey = randomUUID();
  const recoveryProvider = new RouteStudioProvider(topicId, moduleId);
  const recoveryOrchestrator = new VeraPrismaChatOrchestrator({
    db,
    admission: recoveryAdmission,
    contextResolver,
    provider: recoveryProvider,
    envelope,
    leaseStore,
    hmacSecret: "sprint3-recovery-hmac",
  });
  const recoveryResponse = await recoveryOrchestrator.sse({ studentId, conversationId, clientRequestId: recoveryKey, kind: "studio", toolId: "route", text: "Uji pemulihan.", selection });
  assert.ok((await recoveryResponse.text()).includes("request.recovery_pending"));
  const recoveryRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: recoveryKey }, include: { resultStage: true } });
  assert.equal(recoveryRequest.status, "pending");
  assert.equal(recoveryRequest.resultStage?.state, "available");
  await assert.rejects(
    () => recoveryOrchestrator.sse({ studentId, conversationId, clientRequestId: randomUUID(), kind: "studio", toolId: "route", text: "Uji pemulihan.", selection, retryOfRequestId: recoveryRequest.id }),
    /retry_target_unavailable/,
  );
  assert.equal(recoveryProvider.runCount, 1);
  const overdueNow = new Date(Date.now() + 120_000);
  await db.aiRequest.update({ where: { id: recoveryRequest.id }, data: { settlementDeadlineAt: new Date(overdueNow.getTime() - 1_000) } });
  const recoveryRacers = await Promise.allSettled([
    recoveryAdmission.settleOverdueRequest({ requestId: recoveryRequest.id, now: overdueNow }),
    new VeraPrismaAdmissionService(db, envelope).settleOverdueRequest({ requestId: recoveryRequest.id, now: overdueNow }),
  ]);
  assert.ok(recoveryRacers.some((result) => result.status === "fulfilled"));
  const terminalRecovery = await db.aiRequest.findUniqueOrThrow({ where: { id: recoveryRequest.id }, include: { resultStage: true } });
  assert.equal(terminalRecovery.status, "failed");
  assert.equal(terminalRecovery.errorCode, "durable_recovery_failed");
  assert.equal(terminalRecovery.usageAccountingState, "unknown");
  assert.equal(terminalRecovery.resultStage?.state, "consumed");
  assert.equal(await db.aiArtifact.count({ where: { requestId: recoveryRequest.id } }), 0);
  await db.module.update({ where: { id: moduleId }, data: { status: "published" } });

  const unauthorizedKey = randomUUID();
  const unauthorizedProvider = new RouteStudioProvider(topicId, secondModuleId);
  const unauthorizedOrchestrator = new VeraPrismaChatOrchestrator({
    db,
    admission,
    contextResolver,
    provider: unauthorizedProvider,
    envelope,
    leaseStore,
    hmacSecret: "sprint3-fixture-hmac",
  });
  const unauthorizedResponse = await unauthorizedOrchestrator.sse({ studentId, conversationId, clientRequestId: unauthorizedKey, kind: "studio", toolId: "route", text: "Gunakan modul lain.", selection });
  const unauthorizedWire = await unauthorizedResponse.text();
  assert.ok(unauthorizedWire.includes("event: request.failed"));
  assert.equal(await db.aiArtifact.count({ where: { request: { clientRequestId: unauthorizedKey } } }), 0);
  const unauthorizedRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: unauthorizedKey }, include: { resultStage: true } });
  assert.equal(unauthorizedRequest.status, "failed");
  assert.equal(unauthorizedRequest.errorCode, "malformed_output");
  assert.equal(unauthorizedRequest.tokenUsageState, "known");
  assert.equal(unauthorizedRequest.usageAccountingState, "known");
  assert.equal(unauthorizedRequest.resultStage, null);
  assert.equal(unauthorizedProvider.runCount, 1);

  const learner = new VeraLearnerService(db, envelope, "cursor-secret", "fingerprint-secret");
  const list = await learner.listConversations({ studentId, limit: 20, cursor: null });
  assert.equal(list.defaultConversationId, conversationId);
  const history = await learner.listArtifacts({ studentId, conversationId, limit: 20, cursor: null });
  assert.ok(history.artifacts.length >= crashEntries.length + 1);
  const routeArtifact = history.artifacts.find((artifact) => artifact.id === request!.artifacts[0]!.id);
  assert.ok(routeArtifact);
  const detail = await learner.getArtifact(studentId, routeArtifact.id);
  assert.equal(detail.artifactType, "route");
  assert.equal(detail.title, "Rute belajar tersimpan");
  assert.ok(detail.applyCapabilities.materializeLearningRecommendation);
  assert.ok(!/(?:digest|hash|schemaHash|rationaleDigest)/u.test(JSON.stringify(detail)));
  await assert.rejects(() => learner.getArtifact(otherStudentId, routeArtifact.id), /target_unavailable/);

  const sourcePage = await learner.listSources({ studentId, type: "material", limit: 1, cursor: null });
  assert.equal(sourcePage.sources.length, 1);
  assert.ok(sourcePage.nextCursor);
  const sourceNext = await learner.listSources({ studentId, type: "material", limit: 1, cursor: sourcePage.nextCursor });
  assert.equal(sourceNext.sources.length, 1);
  assert.notEqual(sourceNext.sources[0]!.sourceId, sourcePage.sources[0]!.sourceId);
  await assert.rejects(() => learner.listSources({ studentId: otherStudentId, type: "material", limit: 1, cursor: sourcePage.nextCursor }), /invalid_cursor/);

  const commands = new VeraArtifactCommandService(db, envelope, "sprint3-command-hmac");
  const createCommandArtifact = async (toolId: VeraStudioToolId, normalized: NormalizedStudioPayload) => {
    const id = randomUUID();
    const scoped = envelope.forClient(db);
    const [titleCiphertext, contentMarkdownCiphertext, payloadCiphertext] = await Promise.all([
      scoped.encryptAsync(normalized.title, `vera-artifact-title:${id}`),
      scoped.encryptAsync(normalized.markdown, `vera-artifact-markdown:${id}`),
      scoped.encryptAsync(canonicalJson(normalized), `vera-artifact-payload:${id}`),
    ]);
    await db.aiArtifact.create({ data: { id, artifactKey: `vera.fixture.${toolId}.${id}`, revision: 1, studentId, conversationId, artifactType: toolId, provenanceKind: "typed_entity", titleCiphertext, contentMarkdownCiphertext, payloadCiphertext, artifactSchemaVersion: "1", sourceEntityType: "Fixture", sourceEntityId: randomUUID(), sourceEntityRevision: 0, sourceEntityDigest: normalized.digest, contentDigest: normalized.digest, renderVersion: "vera-render-v1", retentionPolicyVersion: "vera-retention-v1", lifecycle: { create: { lifecycleRevision: 0 } } } });
    return id;
  };

  // One persisted learner chain carries all released source authorities through
  // the same ai_request admission, retry, Studio artifact, and Apply path.  A
  // separate process-level authority script is useful for resolver unit
  // coverage, but cannot prove that those identities survive the public
  // request lifecycle together.
  const learnerChainSelection: VeraContextSelection[] = [
    { sourceType: "material", sourceId: moduleId },
    { sourceType: "practice", sourceId: standaloneAttemptId },
    { sourceType: "practice", sourceId: tryoutAttemptId },
  ];
  const learnerChainBlocks = await Promise.all(learnerChainSelection.map((source) => prismaContextResolver.resolve(source, { studentId })));
  assert.deepEqual(learnerChainBlocks.map((block) => block.sourceId).sort(), [moduleId, standaloneAttemptId, tryoutAttemptId].sort(), "learner chain must preserve all three source IDs");
  assert.equal(learnerChainBlocks.find((block) => block.sourceId === moduleId)?.content.includes("Materi rasio"), true);
  assert.match(learnerChainBlocks.find((block) => block.sourceId === standaloneAttemptId)?.citationLabel ?? "", /^Latihan:/u);
  assert.match(learnerChainBlocks.find((block) => block.sourceId === tryoutAttemptId)?.citationLabel ?? "", /^Tryout:/u);
  assert.equal(learnerChainBlocks.find((block) => block.sourceId === tryoutAttemptId)?.contentDigest, tryoutReleaseDigest);

  const learnerChainConversation = await learner.createConversation({
    studentId,
    clientRequestId: `sprint3-chain-conversation-${randomUUID()}`,
    conversationType: "vera_chat",
    title: "Rantai sumber rilis Sprint 3",
  });
  const learnerChainConversationId = learnerChainConversation.conversation.id;
  const learnerChainProvider = new RouteStudioProvider(topicId, moduleId);
  const learnerChainOrchestrator = new VeraPrismaChatOrchestrator({
    db,
    admission: new VeraPrismaAdmissionService(db, envelope),
    contextResolver,
    provider: learnerChainProvider,
    envelope,
    leaseStore,
    hmacSecret: "sprint3-learner-chain-hmac",
  });
  const learnerChainText = "Susun rute dari materi, Kuis, dan Tryout yang dirilis.";
  const learnerChainKey = `sprint3-chain-request-${randomUUID()}`;
  const learnerChainResponse = await learnerChainOrchestrator.sse({ studentId, conversationId: learnerChainConversationId, clientRequestId: learnerChainKey, kind: "studio", toolId: "route", text: learnerChainText, selection: learnerChainSelection });
  const learnerChainWire = await learnerChainResponse.text();
  assert.ok(learnerChainWire.includes("event: artifact.ready") && learnerChainWire.includes("event: request.completed"), "learner chain must complete the Studio stream");
  const learnerChainStatus = await readPrismaVeraRequestStatus(db, { studentId, conversationId: learnerChainConversationId, clientRequestId: learnerChainKey }, { admission, envelope });
  assert.equal(learnerChainStatus?.state, "succeeded");
  assert(learnerChainStatus?.artifact?.id, "learner chain must persist one Studio artifact");
  const learnerChainRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: learnerChainKey }, select: { id: true, userMessageId: true } });
  const learnerChainSources = await db.aiRequestSource.findMany({ where: { requestId: learnerChainRequest.id }, select: { sourceType: true, sourceId: true } });
  assert.deepEqual(learnerChainSources.map((source) => `${source.sourceType}:${source.sourceId}`).sort(), learnerChainSelection.map((source) => `${source.sourceType}:${source.sourceId}`).sort(), "ai_request must persist all released source authorities");
  const learnerChainMaterializationKey = `sprint3-chain-recommendation-${randomUUID()}`;
  const learnerChainMaterialized = await commands.materializeLearningRecommendation({ studentId, artifactRevisionId: learnerChainStatus.artifact.id, clientRequestId: learnerChainMaterializationKey, expectedArtifactRevision: learnerChainStatus.artifact.revision, materializationSchemaVersion: "1" });
  if (!("result" in learnerChainMaterialized) || learnerChainMaterialized.replayed || !learnerChainMaterialized.result) throw new Error("learner chain must materialize its route exactly once");
  const learnerChainRecommendation = await db.learningRecommendation.findUnique({ where: { id: learnerChainMaterialized.result.id }, select: { id: true, revision: true } });
  assert(learnerChainRecommendation, "learner chain Apply target must be durable");
  const learnerChainApply = await commands.apply({ studentId, artifactRevisionId: learnerChainStatus.artifact.id, clientRequestId: `sprint3-chain-apply-${randomUUID()}`, registryKey: "learning_recommendation.v1", targetId: learnerChainRecommendation.id, expectedTargetRevision: learnerChainRecommendation.revision });
  assert("result" in learnerChainApply && !learnerChainApply.replayed, "learner chain Apply must use the materialized route target");

  // Retry is exercised against the same source authority and durable user
  // message after a provider-result validation failure. The new key is allowed
  // only once the original request is terminal and carries the exact text.
  const learnerChainFailureKey = `sprint3-chain-failure-${randomUUID()}`;
  const learnerChainFailureProvider = new MockProviderAdapter("malformed");
  const learnerChainFailureOrchestrator = new VeraPrismaChatOrchestrator({ db, admission: new VeraPrismaAdmissionService(db, envelope), contextResolver, provider: learnerChainFailureProvider, envelope, leaseStore, hmacSecret: "sprint3-learner-chain-failure-hmac" });
  const learnerChainFailureResponse = await learnerChainFailureOrchestrator.sse({ studentId, conversationId: learnerChainConversationId, clientRequestId: learnerChainFailureKey, kind: "studio", toolId: "route", text: learnerChainText, selection: learnerChainSelection });
  const learnerChainFailureWire = await learnerChainFailureResponse.text();
  assert.ok(learnerChainFailureWire.includes("event: request.failed"), "malformed chain output must settle a terminal failure");
  const learnerChainFailureRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: learnerChainFailureKey }, select: { id: true, status: true, userMessageId: true } });
  assert.equal(learnerChainFailureRequest.status, "failed");
  const learnerChainRetryProvider = new RouteStudioProvider(topicId, moduleId);
  const learnerChainRetryOrchestrator = new VeraPrismaChatOrchestrator({ db, admission: new VeraPrismaAdmissionService(db, envelope), contextResolver, provider: learnerChainRetryProvider, envelope, leaseStore, hmacSecret: "sprint3-learner-chain-retry-hmac" });
  const learnerChainRetryKey = `sprint3-chain-retry-${randomUUID()}`;
  const learnerChainRetryResponse = await learnerChainRetryOrchestrator.sse({ studentId, conversationId: learnerChainConversationId, clientRequestId: learnerChainRetryKey, kind: "studio", toolId: "route", text: learnerChainText, selection: learnerChainSelection, retryOfRequestId: learnerChainFailureRequest.id });
  assert.ok((await learnerChainRetryResponse.text()).includes("event: request.completed"), "eligible learner chain retry must complete");
  const learnerChainRetryRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: learnerChainRetryKey }, select: { retryOfRequestId: true, userMessageId: true } });
  assert.equal(learnerChainRetryRequest.retryOfRequestId, learnerChainFailureRequest.id);
  assert.equal(learnerChainRetryRequest.userMessageId, learnerChainFailureRequest.userMessageId);
  assert.equal(learnerChainFailureProvider.calls.length, 1);
  assert.equal(learnerChainRetryProvider.runCount, 1);
  console.log(`T12_EVIDENCE learner_chain=material+released-kuis+released-tryout same_ai_request=${learnerChainRequest.id} retry=${learnerChainRetryRequest.retryOfRequestId} studio=artifact.ready apply=learning_recommendation ownership=server-resolver release=true status=pass`);
  const routeCommandAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [moduleId], topicIds: [topicId], moduleIds: [moduleId], questions: [], universityIds: [], majorIds: [] };
  const routeCommandAuthority: VeraStudioIdentityAuthority = { ...routeCommandAuthoritySeed, digest: sha256Hex(canonicalJson(routeCommandAuthoritySeed)) };
  const recommendationCrashPayload = validateStudioOutput({ toolId: "route", structured: { title: "Rute materialisasi crash", goal: "Menguji recovery materialisasi.", activities: [{ ordinal: 1, action: "Pulihkan proyeksi.", estimatedMinutes: 15, topicIds: [topicId], moduleIds: [moduleId], sourceIds: [], citationKeys: [] }], saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: topicId, priority: 70, rationale: "Proyeksi untuk crash recovery." } }, allowedCitationKeys: [], identityAuthority: routeCommandAuthority });
  const recommendationCrashArtifactId = await createCommandArtifact("route", recommendationCrashPayload);
  const recommendationCrashKey = randomUUID();
  const recommendationCommand = new VeraArtifactCommandService(db, envelope, "sprint3-recommendation-crash-hmac");
  const recommendationCrashTrigger = "vera_fixture_crash_learning_recommendations";
  await db.$executeRawUnsafe(`CREATE TRIGGER ${recommendationCrashTrigger} BEFORE INSERT ON learning_recommendations FOR EACH ROW EXECUTE FUNCTION vera_fixture_crash_insert()`);
  try {
    await assert.rejects(
      () => recommendationCommand.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationCrashArtifactId, clientRequestId: recommendationCrashKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" }),
      /vera fixture durable insert crash|materialization_failed|P2002/,
    );
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${recommendationCrashTrigger} ON learning_recommendations`);
  }
  const recommendationRecovered = await recommendationCommand.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationCrashArtifactId, clientRequestId: recommendationCrashKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" });
  assert.ok("result" in recommendationRecovered && !recommendationRecovered.replayed);
  const recommendationRecoveredReplay = await recommendationCommand.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationCrashArtifactId, clientRequestId: recommendationCrashKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" });
  assert.ok("result" in recommendationRecoveredReplay && recommendationRecoveredReplay.replayed);
  assert.equal(await db.learningRecommendation.count({ where: { sourceArtifactRevisionId: recommendationCrashArtifactId } }), 1);
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_insert()`);
  const materializeKey = randomUUID();
  const materialized = await commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: materializeKey, expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" });
  assert.ok("result" in materialized);
  const materializedReplay = await commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: materializeKey, expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" });
  assert.ok("result" in materializedReplay && materializedReplay.replayed);
  const recommendation = await db.learningRecommendation.findUnique({ where: { sourceArtifactRevisionId: detail.id } });
  assert.equal(recommendation?.reason, null);
  assert.ok(recommendation?.rationaleEnvelope);
  const applyKey = randomUUID();
  const applied = await commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId: applyKey, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: recommendation!.revision });
  assert.ok("result" in applied && !applied.replayed);
  assert.equal("result" in applied ? applied.result?.target.revision : null, 1);
  const appliedReplay = await commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId: applyKey, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: recommendation!.revision });
  assert.ok("result" in appliedReplay && appliedReplay.replayed);
  await assert.rejects(
    () => commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId: applyKey, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: 1 }),
    /idempotency_conflict/,
  );
  const applyAudit = await db.aiArtifactApply.findUnique({ where: { idempotencyKeyId: (await db.aiIdempotencyKey.findUniqueOrThrow({ where: { studentId_operation_clientRequestId: { studentId, operation: "artifact_apply", clientRequestId: applyKey } } })).id } });
  assert.equal(applyAudit?.targetEntityType, "LearningRecommendation");
  assert.ok(applyAudit?.targetEntityDigest);
  assert.ok(!JSON.stringify(applied).includes(applyAudit!.targetEntityDigest!));
  const updatedRecommendation = await db.learningRecommendation.findUniqueOrThrow({ where: { id: recommendation!.id } });
  assert.equal(updatedRecommendation.reason, null);
  assert.ok(updatedRecommendation.rationaleEnvelope);
  assert.equal(updatedRecommendation.revision, 1);
  const duplicateMaterialization = await commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: randomUUID(), expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" });
  assert.deepEqual(duplicateMaterialization, { error: "already_materialized", status: 409 });

  // The two artifact commands are independently reachable HTTP command
  // boundaries, so malformed/empty/overlong client keys must fail before a
  // fingerprint or durable idempotency row is created.  Keep these checks on
  // the real Prisma service rather than treating Studio payload validation as
  // a proxy for command input validation.
  const artifactCommandMalformedIds = ["", "x".repeat(121), "bad\u0000key"];
  for (const clientRequestId of artifactCommandMalformedIds) {
    await assert.rejects(
      () => commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId, expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" }),
      /invalid_request/,
    );
    await assert.rejects(
      () => commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: recommendation!.revision }),
      /invalid_request/,
    );
  }

  // A same-key materialization race must have one durable winner and one
  // replay, followed by the same stored result after a process boundary.  The
  // artifact has not been materialized before this race, unlike `detail`.
  const recommendationRaceArtifactId = await createCommandArtifact("route", recommendationCrashPayload);
  const recommendationRaceKey = randomUUID();
  const recommendationRaceResults = await Promise.all([
    commands.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationRaceArtifactId, clientRequestId: recommendationRaceKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" }),
    commands.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationRaceArtifactId, clientRequestId: recommendationRaceKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" }),
  ]);
  assert.equal(recommendationRaceResults.filter((result) => "result" in result && !result.replayed).length, 1, "recommendation materialization race must have one winner");
  assert.equal(recommendationRaceResults.filter((result) => "result" in result && result.replayed).length, 1, "recommendation materialization race loser must replay");
  const recommendationRaceReplay = await commands.materializeLearningRecommendation({ studentId, artifactRevisionId: recommendationRaceArtifactId, clientRequestId: recommendationRaceKey, expectedArtifactRevision: 1, materializationSchemaVersion: "1" });
  assert("result" in recommendationRaceReplay && recommendationRaceReplay.replayed, "recommendation materialization must remain replayable after the race");
  assert.equal(await db.learningRecommendation.count({ where: { sourceArtifactRevisionId: recommendationRaceArtifactId } }), 1, "recommendation materialization race must not duplicate the target");
  const recommendationUnauthorized = await commands.materializeLearningRecommendation({ studentId: otherStudentId, artifactRevisionId: detail.id, clientRequestId: randomUUID(), expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" });
  assert("error" in recommendationUnauthorized && recommendationUnauthorized.error === "target_unavailable", `existing route artifacts must remain owner-scoped for recommendation materialization: ${JSON.stringify(recommendationUnauthorized)}`);
  const applyUnauthorized = await commands.apply({ studentId: otherStudentId, artifactRevisionId: detail.id, clientRequestId: randomUUID(), registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: recommendation!.revision });
  assert("error" in applyUnauthorized && applyUnauthorized.error === "target_unavailable", `existing route artifacts must remain owner-scoped for Apply: ${JSON.stringify(applyUnauthorized)}`);

  const fixtureQuestionId = randomUUID();
  const fixtureRevisionId = randomUUID();
  const fixtureAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [], topicIds: [topicId], moduleIds: [], questions: [{ questionId: fixtureQuestionId, questionRevisionId: fixtureRevisionId, topicId }], universityIds: [], majorIds: [] };
  const fixtureAuthority: VeraStudioIdentityAuthority = { ...fixtureAuthoritySeed, digest: sha256Hex(canonicalJson(fixtureAuthoritySeed)) };
  const drillPayload = validateStudioOutput({ toolId: "drill", structured: { title: "Drill terapan", topicId, items: [{ ordinal: 1, questionId: fixtureQuestionId, questionRevisionId: fixtureRevisionId, topicId, difficulty: "easy", explanationPlan: "Tinjau setelah selesai." }] }, allowedCitationKeys: [], identityAuthority: fixtureAuthority });
  const drillArtifactId = await createCommandArtifact("drill", drillPayload);
  const adaptiveTarget = await db.adaptivePracticeSession.create({ data: { studentId, topicId, sourceConversationId: conversationId, status: "in_progress" } });
  const adaptiveKey = randomUUID();
  const adaptiveApplied = await commands.apply({ studentId, artifactRevisionId: drillArtifactId, clientRequestId: adaptiveKey, registryKey: "adaptive_practice_session.v1", targetId: adaptiveTarget.id, expectedTargetRevision: 0 });
  if (!("result" in adaptiveApplied) || adaptiveApplied.replayed || !adaptiveApplied.result || adaptiveApplied.result.target.revision !== 1) throw new Error("adaptive Apply did not produce its first revision");
  const adaptiveReplay = await commands.apply({ studentId, artifactRevisionId: drillArtifactId, clientRequestId: adaptiveKey, registryKey: "adaptive_practice_session.v1", targetId: adaptiveTarget.id, expectedTargetRevision: 0 });
  assert.ok("result" in adaptiveReplay && adaptiveReplay.replayed);
  const adaptiveRaceTarget = await db.adaptivePracticeSession.create({ data: { studentId, topicId, sourceConversationId: conversationId, status: "in_progress" } });
  const adaptiveRace = await Promise.all([
    commands.apply({ studentId, artifactRevisionId: drillArtifactId, clientRequestId: randomUUID(), registryKey: "adaptive_practice_session.v1", targetId: adaptiveRaceTarget.id, expectedTargetRevision: 0 }),
    commands.apply({ studentId, artifactRevisionId: drillArtifactId, clientRequestId: randomUUID(), registryKey: "adaptive_practice_session.v1", targetId: adaptiveRaceTarget.id, expectedTargetRevision: 0 }),
  ]);
  assert.equal(adaptiveRace.filter((result) => "result" in result).length, 1);
  assert.equal(adaptiveRace.filter((result) => "error" in result && result.error === "target_revision_conflict").length, 1);

  const ptnPayload = validateStudioOutput({ toolId: "ptn", structured: { title: "Strategi terapan", universityId: null, majorId: null, scoreEvidence: 650, assumptions: ["Nilai rilis digunakan."], actions: ["Perkuat subtes utama."], disclaimer: "Strategi belajar, bukan prediksi kelulusan.", citationKeys: [] }, allowedCitationKeys: [], identityAuthority: fixtureAuthority });
  const ptnArtifactId = await createCommandArtifact("ptn", ptnPayload);
  const ptnTarget = await db.ptnStrategySession.create({ data: { studentId, conversationId, disclaimerShown: true } });
  const ptnKey = randomUUID();
  const ptnApplied = await commands.apply({ studentId, artifactRevisionId: ptnArtifactId, clientRequestId: ptnKey, registryKey: "ptn_strategy_session.v1", targetId: ptnTarget.id, expectedTargetRevision: 0 });
  if (!("result" in ptnApplied) || ptnApplied.replayed || !ptnApplied.result || ptnApplied.result.target.revision !== 1) throw new Error("PTN Apply did not produce its first revision");
  const ptnReplay = await commands.apply({ studentId, artifactRevisionId: ptnArtifactId, clientRequestId: ptnKey, registryKey: "ptn_strategy_session.v1", targetId: ptnTarget.id, expectedTargetRevision: 0 });
  assert.ok("result" in ptnReplay && ptnReplay.replayed);
  const ptnConflict = await commands.apply({ studentId, artifactRevisionId: ptnArtifactId, clientRequestId: randomUUID(), registryKey: "ptn_strategy_session.v1", targetId: ptnTarget.id, expectedTargetRevision: 0 });
  assert.deepEqual(ptnConflict, { error: "target_revision_conflict", status: 409 });

  const restartedEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
  const restartedLearner = new VeraLearnerService(db, restartedEnvelope, "cursor-secret", "fingerprint-secret");
  assert.equal((await restartedLearner.getArtifact(studentId, routeArtifact.id)).title, detail.title);

  await db.aiArtifactLifecycle.update({ where: { artifactRevisionId: detail.id }, data: { state: "expired", lifecycleRevision: { increment: 1 } } });
  assert.equal((await restartedLearner.getArtifact(studentId, detail.id)).lifecycle.state, "expired");
  await db.aiArtifactLifecycle.update({ where: { artifactRevisionId: detail.id }, data: { state: "purging", lifecycleRevision: { increment: 1 } } });
  const purging = await restartedLearner.getArtifact(studentId, detail.id);
  assert.equal(purging.lifecycle.state, "purging");
  assert.equal(purging.markdown, null);
  await db.aiArtifactLifecycle.update({ where: { artifactRevisionId: detail.id }, data: { state: "purged", lifecycleRevision: { increment: 1 } } });
  const purged = await restartedLearner.getArtifact(studentId, detail.id);
  assert.equal(purged.lifecycle.state, "purged");
  assert.equal(purged.contextState, "unavailable");
  assert.ok((await restartedLearner.listArtifacts({ studentId, conversationId, limit: 20, cursor: null })).artifacts.some((item) => item.id === detail.id));

  await db.module.update({ where: { id: moduleId }, data: { status: "published" } });
  const retryKey = randomUUID();
  const retryResponse = await recoveryOrchestrator.sse({ studentId, conversationId, clientRequestId: retryKey, kind: "studio", toolId: "route", text: "Uji pemulihan.", selection, retryOfRequestId: recoveryRequest.id });
  assert.ok((await retryResponse.text()).includes("event: request.completed"));
  const retryRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: retryKey } });
  assert.equal(retryRequest.userMessageId, recoveryRequest.userMessageId);
  assert.equal(recoveryProvider.runCount, 2);
  await assert.rejects(
    () => recoveryOrchestrator.sse({ studentId, conversationId, clientRequestId: randomUUID(), kind: "studio", toolId: "route", text: "Teks telah diedit.", selection, retryOfRequestId: recoveryRequest.id }),
    /retry_target_unavailable/,
  );
  assert.equal(recoveryProvider.runCount, 2);

  // T12 consumes a structured operation matrix rather than four happy-path
  // lines.  Every row below is built only after the corresponding persisted
  // command, replay, conflict, expiry, ownership, and recovery assertions
  // complete in this disposable process.
  const edgeLearner = new VeraLearnerService(db, envelope, "sprint3-edge-cursor", "sprint3-edge-hmac");
  const edgeConversationRaceKey = randomUUID();
  const edgeConversationRace = await Promise.all([
    edgeLearner.createConversation({ studentId, clientRequestId: edgeConversationRaceKey, conversationType: "vera_chat", title: "Edge race" }),
    edgeLearner.createConversation({ studentId, clientRequestId: edgeConversationRaceKey, conversationType: "vera_chat", title: "Edge race" }),
  ]);
  assert.equal(edgeConversationRace.length, 2);
  assert.equal(new Set(edgeConversationRace.map((result) => result.conversation.id)).size, 1);
  assert.equal(edgeConversationRace.filter((result) => result.replayed).length, 1, "conversation unique loser must replay the winner");
  const edgeConversationId = edgeConversationRace[0]!.conversation.id;
  let conversationMissingKey = false;
  try {
    await edgeLearner.createConversation({ studentId, clientRequestId: undefined as unknown as string, conversationType: "vera_chat", title: "Edge" });
    assert.fail("conversation_create must reject a missing client key");
  } catch (error) {
    assert(error instanceof Error && "code" in error && (error as { code?: unknown }).code === "invalid_request");
    conversationMissingKey = true;
  }
  let conversationPayloadValidation = false;
  await assert.rejects(
    () => edgeLearner.createConversation({ studentId, clientRequestId: randomUUID(), conversationType: "vera_chat", title: "x".repeat(161) }),
    /invalid_request/,
  );
  conversationPayloadValidation = true;
  const conversationConflict = await (async () => {
    await assert.rejects(
    () => edgeLearner.createConversation({ studentId, clientRequestId: edgeConversationRaceKey, conversationType: "vera_chat", title: "Edited edge race" }),
    /idempotency_conflict/,
    );
    return true;
  })();
  const edgeContextRace = await Promise.allSettled([
    edgeLearner.replaceContext({ studentId, conversationId: edgeConversationId, expectedContextVersion: 0, sources: [] }),
    edgeLearner.replaceContext({ studentId, conversationId: edgeConversationId, expectedContextVersion: 0, sources: [] }),
  ]);
  const isContextConflict = (result: PromiseSettledResult<unknown>): boolean => result.status === "rejected"
    && result.reason instanceof Error
    && "code" in result.reason
    && (result.reason as { code?: unknown }).code === "context_version_conflict";
  assert.equal(edgeContextRace.filter((result) => result.status === "fulfilled").length, 1, "one context writer must win the CAS race");
  const conversationWorkerCasRecovery = edgeContextRace.filter(isContextConflict).length === 1;
  assert.equal(conversationWorkerCasRecovery, true, "the context worker loser must return a typed CAS conflict");
  const conversationUnauthorizedKey = await (async () => {
    await assert.rejects(
      () => edgeLearner.getConversation(otherStudentId, edgeConversationId),
      /target_unavailable/,
    );
    return true;
  })();
  const conversationMalformed = await (async () => {
    await assert.rejects(
      () => edgeLearner.createConversation({ studentId, clientRequestId: "bad\u0000key", conversationType: "vera_chat", title: "Edge" }),
      /invalid_request/,
    );
    return true;
  })();
  const conversationOverlong = await (async () => {
    await assert.rejects(
      () => edgeLearner.createConversation({ studentId, clientRequestId: "x".repeat(121), conversationType: "vera_chat", title: "Edge" }),
      /invalid_request/,
    );
    return true;
  })();
  const conversationEmpty = await (async () => {
    await assert.rejects(
      () => edgeLearner.createConversation({ studentId, clientRequestId: "", conversationType: "vera_chat", title: "Edge" }),
      /invalid_request/,
    );
    return true;
  })();
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "conversation_create", clientRequestId: edgeConversationRaceKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  const conversationExpiry = await (async () => {
    await assert.rejects(
    () => edgeLearner.createConversation({ studentId, clientRequestId: edgeConversationRaceKey, conversationType: "vera_chat", title: "Edge race" }),
    /idempotency_key_expired/,
    );
    return true;
  })();
  await db.aiConversation.delete({ where: { id: edgeConversationId } });
  const conversationCreateCrossKeyRows = await db.aiIdempotencyKey.findMany({ where: { studentId, clientRequestId: conversationCreateKey }, select: { operation: true, resultId: true } });
  assert(conversationCreateCrossKeyRows.some((row) => row.operation === "conversation_create"), "conversation_create key must retain its operation namespace");

  const edgeStudioAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [moduleId], topicIds: [topicId], moduleIds: [moduleId], questions: [], universityIds: [], majorIds: [] };
  const edgeStudioAuthority: VeraStudioIdentityAuthority = { ...edgeStudioAuthoritySeed, digest: sha256Hex(canonicalJson(edgeStudioAuthoritySeed)) };
  const emptyStudioAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [], topicIds: [], moduleIds: [], questions: [], universityIds: [], majorIds: [] };
  const emptyStudioAuthority: VeraStudioIdentityAuthority = { ...emptyStudioAuthoritySeed, digest: sha256Hex(canonicalJson(emptyStudioAuthoritySeed)) };
  const studioEdgeValidation = async (toolId: VeraStudioToolId): Promise<{ malformed: boolean; overlong: boolean; empty: boolean; missingKey: boolean; payloadValidation: boolean; unauthorizedKey: boolean; unauthorized: boolean }> => {
    const invalid = (structured: unknown): boolean => {
      assert.throws(() => validateStudioOutput({ toolId, structured, allowedCitationKeys: [`src_${moduleId.replaceAll("-", "")}`], identityAuthority: edgeStudioAuthority }));
      return true;
    };
    const malformed = invalid({});
    const overlong = invalid({ title: "x".repeat(4_001) });
    const empty = invalid({ title: "" });
    const provider = new TupleStudioProvider(toolId, topicId, moduleId, drillQuestionId, drillRevisionId);
    const prepared = await provider.prepare({ featureKey: `vera.${toolId}`, behaviorVersion: "1", taskBytes: new Uint8Array([1, 2, 3]), contextTaskDigest: `edge-${toolId}`, hardOutputQuotaUnits: 200 });
    const result = await provider.run(prepared);
    const unauthorizedStructured = toolId === "ptn" && result.structured && typeof result.structured === "object"
      ? { ...(result.structured as Record<string, unknown>), universityId: randomUUID() }
      : result.structured;
    const unauthorizedKey = (() => {
      assert.throws(() => validateStudioOutput({ toolId, structured: unauthorizedStructured, allowedCitationKeys: toolId === "summary" ? [] : [`src_${moduleId.replaceAll("-", "")}`], identityAuthority: emptyStudioAuthority }));
      return true;
    })();
    const parseEdgeRequest = (clientRequestId: unknown): boolean => {
      try {
        parseVeraRequestBody({ clientRequestId, kind: "studio", text: `Edge ${toolId}`, sources: [], options: {}, toolId });
        assert.fail("invalid Vera client key must be rejected by the HTTP parser");
      } catch (error) {
        assert(error instanceof VeraHttpError, "invalid Vera client key must use the typed HTTP error");
        assert.equal(error.code, "invalid_request");
      }
      return true;
    };
    const missingKey = [undefined, "", "x".repeat(121), "bad\u0000key"].map(parseEdgeRequest).every(Boolean);
    const payloadValidation = [malformed, overlong, empty].every(Boolean);
    return { malformed, overlong, empty, missingKey, payloadValidation, unauthorizedKey, unauthorized: unauthorizedKey };
  };
  const edgeStudioValidationByTool = new Map<VeraStudioToolId, Awaited<ReturnType<typeof studioEdgeValidation>>>();
  for (const toolId of ["analysis", "route", "review", "summary", "ptn", "drill"] as const) edgeStudioValidationByTool.set(toolId, await studioEdgeValidation(toolId));

  const routeCrashKey = callbackCrashKeys.get("route");
  const routeCrashRequest = callbackCrashRequests.get("route");
  const routeCrashSelection = callbackCrashSelections.get("route") ?? selection;
  const routeCrashHmac = callbackCrashHmacs.get("route");
  assert(routeCrashKey && routeCrashRequest && routeCrashHmac, "route callback edge fixture is missing its persisted request");
  const edgeRequestOrchestrator = new VeraPrismaChatOrchestrator({ db, admission, contextResolver, provider: new MockProviderAdapter(), envelope, leaseStore, hmacSecret: routeCrashHmac });
  const routeStatusReplay = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: routeCrashKey }, { admission, envelope });
  assert.equal(routeStatusReplay?.state, "succeeded");
  const aiRequestConflict = await (async () => {
    await assert.rejects(
      () => edgeRequestOrchestrator.sse({ studentId, conversationId, clientRequestId: routeCrashKey, kind: "studio", toolId: "route", text: "Uji pemulihan diedit.", selection: routeCrashSelection }),
      /idempotency_conflict/,
    );
    return true;
  })();
  const routeExpiredKey = `${routeCrashKey}-expired`;
  const routeExpiredSource = await edgeRequestOrchestrator.sse({ studentId, conversationId, clientRequestId: routeExpiredKey, kind: "studio", toolId: "route", text: "Uji expiry.", selection: routeCrashSelection });
  await routeExpiredSource.text();
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "ai_request", clientRequestId: routeExpiredKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  const routeExpiredReplay = await edgeRequestOrchestrator.sse({ studentId, conversationId, clientRequestId: routeExpiredKey, kind: "studio", toolId: "route", text: "Uji expiry.", selection: routeCrashSelection });
  assert.equal(routeExpiredReplay.status, 409);
  assert.equal((await routeExpiredReplay.json() as { errorCode?: string }).errorCode, "idempotency_key_expired");
  const crossOperationRequest = await edgeRequestOrchestrator.sse({ studentId, conversationId, clientRequestId: conversationCreateKey, kind: "studio", toolId: "route", text: "Kunci operasi berbeda.", selection: routeCrashSelection });
  await crossOperationRequest.text();
  const routeUniqueLoserKey = `${routeCrashKey}-unique-loser`;
  const routeRaceConversation = await learner.createConversation({
    studentId: otherStudentId,
    clientRequestId: `sprint3-route-race-conversation-${randomUUID()}`,
    conversationType: "vera_chat",
    title: "Race owner",
  });
  const routeRaceProvider = new TupleStudioProvider("route", topicId, moduleId, drillQuestionId, drillRevisionId);
  const routeRaceOrchestrators = [0, 1].map(() => new VeraPrismaChatOrchestrator({ db, admission, contextResolver, provider: routeRaceProvider, envelope, leaseStore, hmacSecret: routeCrashHmac }));
  const routeRaceResponses = await Promise.all(routeRaceOrchestrators.map((raceOrchestrator) => raceOrchestrator.sse({ studentId: otherStudentId, conversationId: routeRaceConversation.conversation.id, clientRequestId: routeUniqueLoserKey, kind: "studio", toolId: "route", text: "Uji unique loser.", selection: routeCrashSelection })));
  await Promise.all(routeRaceResponses.map((result) => result.text()));
  assert.equal(routeRaceProvider.runCount, 1, "the absent-key ai_request loser must not invoke the provider");
  assert.equal((await db.aiRequest.count({ where: { studentId: otherStudentId, clientRequestId: routeUniqueLoserKey } })), 1);
  const routeCrossKeyRows = await db.aiIdempotencyKey.findMany({ where: { studentId, clientRequestId: conversationCreateKey }, select: { operation: true, resultId: true } });
  assert(routeCrossKeyRows.some((row) => row.operation === "ai_request"), "ai_request must coexist under a distinct operation namespace");
  const routeRecoveredRequest = await db.aiRequest.findUnique({ where: { id: routeCrashRequest }, include: { resultStage: true } });
  const aiRequestWorkerCasRecovery = routeRecoveredRequest?.status === "succeeded" && routeRecoveredRequest.resultStage?.state === "consumed";
  assert.equal(aiRequestWorkerCasRecovery, true, "the persisted ai_request worker recovery must consume its stage exactly once");

  const recommendationCrossKey = randomUUID();
  const recommendationTarget = await db.learningRecommendation.findUnique({ where: { sourceArtifactRevisionId: detail.id }, select: { id: true, revision: true } });
  assert(recommendationTarget, "recommendation materialization target is required for the operation matrix");
  const recommendationCross = await commands.apply({ studentId, artifactRevisionId: recommendationCrashArtifactId, clientRequestId: recommendationCrossKey, registryKey: "learning_recommendation.v1", targetId: recommendationTarget.id, expectedTargetRevision: recommendationTarget.revision });
  assert("result" in recommendationCross && !recommendationCross.replayed, "recommendation Apply must use its own operation namespace");
  const recommendationCrossRows = await db.aiIdempotencyKey.findMany({ where: { studentId, clientRequestId: recommendationCrossKey }, select: { operation: true, resultId: true } });
  assert.equal(recommendationCrossRows[0]?.operation, "artifact_apply");
  const recommendationMissingKey = await (async () => {
    await assert.rejects(
      () => commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: undefined as unknown as string, expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" }),
      /invalid_request/,
    );
    return true;
  })();
  const applyMissingKey = await (async () => {
    await assert.rejects(
      () => commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId: undefined as unknown as string, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: recommendation!.revision }),
      /invalid_request/,
    );
    return true;
  })();
  const recommendationMaterializationKey = materializeKey;
  const recommendationConflict = await (async () => {
    await assert.rejects(
      () => commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: recommendationMaterializationKey, expectedArtifactRevision: 0, materializationSchemaVersion: "1" }),
      /idempotency_conflict/,
    );
    return true;
  })();
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "learning_recommendation_create", clientRequestId: recommendationMaterializationKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  const recommendationExpiry = await (async () => {
    await assert.rejects(
      () => commands.materializeLearningRecommendation({ studentId, artifactRevisionId: detail.id, clientRequestId: recommendationMaterializationKey, expectedArtifactRevision: detail.revision, materializationSchemaVersion: "1" }),
      /idempotency_key_expired/,
    );
    return true;
  })();

  const applyExpiredKey = applyKey;
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "artifact_apply", clientRequestId: applyExpiredKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  const applyExpiry = await (async () => {
    await assert.rejects(
      () => commands.apply({ studentId, artifactRevisionId: detail.id, clientRequestId: applyExpiredKey, registryKey: "learning_recommendation.v1", targetId: recommendation!.id, expectedTargetRevision: 1 }),
      /idempotency_key_expired/,
    );
    return true;
  })();
  const crossTargetReuse = await commands.apply({ studentId, artifactRevisionId: recommendationCrashArtifactId, clientRequestId: randomUUID(), registryKey: "adaptive_practice_session.v1", targetId: adaptiveTarget.id, expectedTargetRevision: 0 });
  assert("error" in crossTargetReuse && crossTargetReuse.error === "unsupported_target", "an artifact_apply target cannot be reused across operation projections");

  const operationEdgeRows = ([
    {
      operation: "conversation_create",
      malformed: conversationMalformed,
      overlong: conversationOverlong,
      empty: conversationEmpty,
      missingKey: conversationMissingKey,
      payloadValidation: conversationPayloadValidation,
      unauthorizedKey: conversationUnauthorizedKey,
      replay: conversationReplay.replayed === true,
      conflict: conversationConflict,
      expiry: conversationExpiry,
      uniqueLoser: edgeConversationRace.filter((result) => result.replayed).length === 1,
      unauthorized: conversationUnauthorizedKey,
      workerCasRecovery: conversationWorkerCasRecovery,
      crossOperationTargetIsolation: conversationCreateCrossKeyRows.some((row) => row.operation === "conversation_create"),
      evidenceDigest: "",
    },
    {
      operation: "ai_request",
      ...edgeStudioValidationByTool.get("route")!,
      replay: routeStatusReplay?.state === "succeeded",
      conflict: aiRequestConflict,
      expiry: routeExpiredReplay.status === 409,
      uniqueLoser: routeRaceProvider.runCount === 1,
      unauthorized: (await readPrismaVeraRequestStatus(db, { studentId: otherStudentId, conversationId, clientRequestId: routeCrashKey }, { admission, envelope })) === null,
      workerCasRecovery: aiRequestWorkerCasRecovery,
      crossOperationTargetIsolation: routeCrossKeyRows.some((row) => row.operation === "ai_request"),
      evidenceDigest: "",
    },
    {
      operation: "learning_recommendation_create",
      ...edgeStudioValidationByTool.get("route")!,
      missingKey: recommendationMissingKey,
      replay: recommendationRecoveredReplay.replayed === true && materializedReplay.replayed === true,
      conflict: recommendationConflict,
      expiry: recommendationExpiry,
      uniqueLoser: recommendationRaceResults.filter((result) => "result" in result && result.replayed).length === 1,
      unauthorized: "error" in recommendationUnauthorized && recommendationUnauthorized.error === "target_unavailable",
      workerCasRecovery: recommendationRaceReplay.replayed === true && recommendationRecoveredReplay.replayed === true,
      crossOperationTargetIsolation: recommendationCrossRows.some((row) => row.operation === "artifact_apply"),
      evidenceDigest: "",
    },
    {
      operation: "artifact_apply",
      ...edgeStudioValidationByTool.get("route")!,
      missingKey: applyMissingKey,
      replay: appliedReplay.replayed === true && adaptiveReplay.replayed === true && ptnReplay.replayed === true,
      conflict: adaptiveRace.filter((result) => "error" in result && result.error === "target_revision_conflict").length === 1 && "error" in ptnConflict && ptnConflict.error === "target_revision_conflict",
      expiry: applyExpiry,
      uniqueLoser: adaptiveRace.filter((result) => "result" in result).length === 1,
      unauthorized: "error" in applyUnauthorized && applyUnauthorized.error === "target_unavailable",
      workerCasRecovery: adaptiveRace.filter((result) => "error" in result && result.error === "target_revision_conflict").length === 1 && "error" in ptnConflict && ptnConflict.error === "target_revision_conflict",
      crossOperationTargetIsolation: "error" in crossTargetReuse && crossTargetReuse.error === "unsupported_target",
      evidenceDigest: "",
    },
  ] as ExecutableOperationEdge[]).map((row) => ({ ...row, evidenceDigest: sha256Hex(canonicalJson({ ...row, evidenceDigest: undefined })) }));
  for (const row of operationEdgeRows) {
    for (const [field, value] of Object.entries(row)) {
      if (["operation", "evidenceDigest"].includes(field)) continue;
      assert.equal(value, true, `${row.operation} edge ${field} must be exercised`);
    }
  }
  console.log(`T12_EXECUTABLE_OPERATION_EDGE_MATRIX=${Buffer.from(JSON.stringify(operationEdgeRows)).toString("base64url")}`);
  for (const row of operationEdgeRows) {
    console.log(`T12_EVIDENCE operation_edge=${row.operation} actual=true malformed=${row.malformed} overlong=${row.overlong} empty=${row.empty} missing_key=${row.missingKey} payload_validation=${row.payloadValidation} unauthorized_key=${row.unauthorizedKey} replay=${row.replay} conflict=${row.conflict} expiry=${row.expiry} unique_loser=${row.uniqueLoser} unauthorized=${row.unauthorized} worker_cas_recovery=${row.workerCasRecovery} cross_operation_target_isolation=${row.crossOperationTargetIsolation} evidenceDigest=${row.evidenceDigest} status=pass`);
  }

  console.log("PASS vera-prisma-sprint3: Studio route tuple, progress-only SSE and post-commit artifact.ready");
  console.log("PASS vera-prisma-sprint3: one encrypted artifact/lifecycle per request and restart decryptability");
  console.log("PASS vera-prisma-sprint3: authoritative conversation/artifact reads and cross-student privacy");
  console.log("PASS vera-prisma-sprint3: signed source cursor, learner payload privacy, materialization and Apply replay");
  console.log("PASS vera-prisma-sprint3: unauthorized existing identities fail before staging and lifecycle tombstones remain readable");
  console.log("PASS vera-prisma-sprint3: callback drift rolls back, preserves stage before deadline, then terminalizes once under overdue race");
  console.log("PASS vera-prisma-sprint3: all seven persisted callback tuples (chat, analysis, route, review, summary, PTN, drill) roll back under normal/status/worker crash recovery, then exactly-once assistant/result/accounting recovery; recommendation materialization remains a separate crash/replay test");
  console.log("PASS vera-prisma-sprint3: recovery retry waits for terminal failure, preserves exact user-message digest and rejects edited text before provider");
  console.log("PASS vera-prisma-sprint3: all three Apply projections cover populated replay/conflict and two-client adaptive CAS race");
} finally {
  for (const [trigger, table] of [
    ["vera_fixture_crash_analysis_weakness_analyses", "weakness_analyses"],
    ["vera_fixture_crash_analysis_weakness_analysis_topics", "weakness_analysis_topics"],
    ["vera_fixture_crash_route_ai_artifacts", "ai_artifacts"],
    ["vera_fixture_crash_review_ai_artifacts", "ai_artifacts"],
    ["vera_fixture_crash_summary_ai_artifacts", "ai_artifacts"],
    ["vera_fixture_crash_ptn_ptn_strategy_sessions", "ptn_strategy_sessions"],
    ["vera_fixture_crash_drill_adaptive_practice_sessions", "adaptive_practice_sessions"],
    ["vera_fixture_crash_learning_recommendations", "learning_recommendations"],
    ["vera_fixture_crash_chat_ai_messages", "ai_messages"],
  ]) {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
  }
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_insert()`);
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_assistant_message()`);
  const fixtureStudentIds = [studentId, otherStudentId];
  const requestIds = (await db.aiRequest.findMany({ where: { studentId: { in: fixtureStudentIds } }, select: { id: true } })).map((row) => row.id);
  const artifactIds = (await db.aiArtifact.findMany({ where: { studentId: { in: fixtureStudentIds } }, select: { id: true } })).map((row) => row.id);
  const recommendationIds = (await db.learningRecommendation.findMany({ where: { studentId: { in: fixtureStudentIds } }, select: { id: true } })).map((row) => row.id);
  const packIds = (await db.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id);
  const fixtureConversationIds = (await db.aiConversation.findMany({ where: { studentId: { in: fixtureStudentIds } }, select: { id: true } })).map((row) => row.id);
  const messageIds = (await db.aiMessage.findMany({ where: { conversationId: { in: fixtureConversationIds } }, select: { id: true } })).map((row) => row.id);
  const envelopeObjectMarkers = [...requestIds, ...artifactIds, ...recommendationIds, ...packIds, ...messageIds];
  await db.aiArtifactApply.deleteMany({ where: { appliedByStudentId: { in: fixtureStudentIds } } });
  await db.adaptivePracticeSession.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.ptnStrategySession.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.learningRecommendation.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.aiArtifactLifecycle.deleteMany({ where: { artifact: { studentId: { in: fixtureStudentIds } } } });
  await db.aiArtifact.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  const weaknessIds = (await db.weaknessAnalysis.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  await db.weaknessAnalysisTopic.deleteMany({ where: { weaknessAnalysisId: { in: weaknessIds } } });
  await db.weaknessAnalysis.deleteMany({ where: { id: { in: weaknessIds } } });
  await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequest.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.aiMessage.deleteMany({ where: { conversationId: { in: fixtureConversationIds } } });
  await db.aiConversation.deleteMany({ where: { id: { in: fixtureConversationIds } } });
  await db.aiAdmissionEvent.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.aiUsageDaily.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.aiIdempotencyKey.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  if (envelopeObjectMarkers.length) await db.aiEnvelopeKey.deleteMany({ where: { OR: envelopeObjectMarkers.map((id) => ({ objectId: { contains: id } })) } });
  await db.billingAccount.deleteMany({ where: { studentId: { in: fixtureStudentIds } } });
  await db.studentProfile.deleteMany({ where: { userId: { in: fixtureStudentIds } } });
  await db.standaloneQuizAttempt.deleteMany({ where: { id: standaloneAttemptId } });
  await db.standaloneQuizParticipation.deleteMany({ where: { id: drillParticipationId } });
  await db.standaloneQuizItem.deleteMany({ where: { id: drillQuizItemId } });
  await db.standaloneQuiz.deleteMany({ where: { id: drillQuizId } });
  await db.tryoutAttemptTestRun.deleteMany({ where: { id: tryoutRunId } });
  await db.tryoutAttempt.deleteMany({ where: { id: tryoutAttemptId } });
  await db.tryoutItem.deleteMany({ where: { id: tryoutItemId } });
  await db.tryoutSection.deleteMany({ where: { id: tryoutSectionId } });
  await db.tryoutDeliverySession.deleteMany({ where: { id: tryoutDeliverySessionId } });
  await db.tryoutAdmission.deleteMany({ where: { id: tryoutAdmissionId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("ALTER TABLE assessment_releases DISABLE TRIGGER USER");
    await tx.assessmentRelease.deleteMany({ where: { id: tryoutReleaseId } });
    await tx.$executeRawUnsafe("ALTER TABLE assessment_releases ENABLE TRIGGER USER");
  });
  await db.tryoutPackage.deleteMany({ where: { id: tryoutId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey');
    await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: drillRevisionId } });
    await tx.questionRevision.deleteMany({ where: { id: drillRevisionId } });
    await tx.question.deleteMany({ where: { id: drillQuestionId } });
    await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: tryoutRevisionId } });
    await tx.questionRevision.deleteMany({ where: { id: tryoutRevisionId } });
    await tx.question.deleteMany({ where: { id: tryoutQuestionId } });
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options ENABLE TRIGGER USER');
  });
  await db.user.deleteMany({ where: { id: { in: [studentId, otherStudentId] } } });
  await db.module.deleteMany({ where: { id: { in: [moduleId, secondModuleId] } } });
  await db.topic.deleteMany({ where: { id: topicId } });
  await db.subtest.deleteMany({ where: { id: subtestId } });
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "draft" } });
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: policy.state, effectiveAt: policy.effectiveAt } });
  await db.$disconnect();
  await leaseStore.close?.();
}
