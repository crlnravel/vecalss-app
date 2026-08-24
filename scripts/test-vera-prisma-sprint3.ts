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
import { InMemoryVeraLeaseStore } from "@/lib/vera-ai/redis-lease";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import { validateStudioOutput, type NormalizedStudioPayload, type VeraStudioToolId } from "@/lib/vera-ai/studio-contracts";
import type { VeraStudioIdentityAuthority } from "@/lib/vera-ai/studio-authority";

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

class AnalysisStudioProvider extends MockProviderAdapter {
  runCount = 0;
  constructor(private readonly topicId: string, private readonly moduleId: string) { super(); }
  override async run(prepared: PreparedProviderTask): Promise<ProviderResult> {
    this.runCount += 1;
    if (prepared.preparedTask.featureKey !== "vera.analysis") return super.run(prepared);
    return {
      kind: "structured",
      text: null,
      structured: {
        title: "Analisis pemulihan",
        summaryMarkdown: "Bukti rasio perlu diperkuat. [^src_ratio]",
        topics: [{ topicId: this.topicId, moduleId: this.moduleId, rank: 1, weaknessScore: 68, confidence: 0.75, evidenceCitationKeys: ["src_ratio"], limitations: "Bukti terbatas.", nextStep: "Ulangi materi rasio." }],
      },
      usage: { inputTokens: 12, outputTokens: 24, quotaUnitsConsumed: 36, tokenUsageState: "known" },
      finishReason: "stop",
      attempts: [{ attemptNo: 1, state: "completed", providerRequestRef: "mock-analysis", observedUpstreamProviderSlug: "mock-decart", errorCode: null, usage: { inputTokens: 12, outputTokens: 24, quotaUnitsConsumed: 36, tokenUsageState: "known" } }],
    };
  }
}

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
assertDisposable(connectionString);
process.env.DATABASE_URL = connectionString;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rootKey = Buffer.alloc(32, 11);
const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
const admission = new VeraPrismaAdmissionService(db, envelope);
const studentId = randomUUID();
const otherStudentId = randomUUID();
const conversationId = randomUUID();
const topicId = randomUUID();
const moduleId = randomUUID();
const secondModuleId = randomUUID();
const subtestId = randomUUID();
const now = new Date();
const policy = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
if (!policy) throw new Error("Disposable policy seed is missing.");

try {
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "active", effectiveAt: new Date(now.getTime() - 60_000) } });
  await db.user.createMany({ data: [
    { id: studentId, email: `vera-s3-${studentId}@example.test`, fullName: "Vera Sprint 3", passwordHash: "fixture" },
    { id: otherStudentId, email: `vera-s3-other-${otherStudentId}@example.test`, fullName: "Vera Sprint 3 Other", passwordHash: "fixture" },
  ] });
  await db.studentProfile.create({ data: { userId: studentId, timezone: "Asia/Jakarta" } });
  await db.billingAccount.create({ data: { studentId, planCode: "pro", status: "trial" } });
  await db.subtest.create({ data: { id: subtestId, code: `VS3-${subtestId.slice(0, 8)}`, name: "Vera Sprint 3" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `topic-${topicId.slice(0, 8)}`, name: "Rasio" } });
  await db.module.createMany({ data: [
    { id: moduleId, topicId, code: `vera-s3-${moduleId}`, title: "Rasio dasar", sequenceNo: 1, status: "published", publishedAt: now },
    { id: secondModuleId, topicId, code: `vera-s3-${secondModuleId}`, title: "Rasio lanjut", sequenceNo: 2, status: "published", publishedAt: new Date(now.getTime() - 1_000) },
  ] });
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "Sprint 3 durable" } });

  const contextResolver = { resolve: async (selection: { sourceId: string }) => ({
    sourceType: "material" as const,
    sourceId: selection.sourceId,
    title: "Rasio dasar",
    citationLabel: "Rasio dasar",
    citationKey: "src_ratio",
    content: "Materi rasio yang telah dirilis.",
  }) };
  const orchestrator = new VeraPrismaChatOrchestrator({
    db,
    admission,
    contextResolver,
    provider: new RouteStudioProvider(topicId, moduleId),
    envelope,
    leaseStore: new InMemoryVeraLeaseStore(),
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

  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION vera_fixture_crash_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'vera fixture durable insert crash'; END $$`);
  const durableInsertTables = ["weakness_analyses", "weakness_analysis_topics", "ai_artifacts", "ai_artifact_lifecycles"] as const;
  for (const table of durableInsertTables) {
    const trigger = `vera_fixture_crash_${table}`;
    await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION vera_fixture_crash_insert()`);
    const crashKey = randomUUID();
    const crashProvider = new AnalysisStudioProvider(topicId, moduleId);
    const crashOrchestrator = new VeraPrismaChatOrchestrator({
      db,
      admission: new VeraPrismaAdmissionService(db, envelope),
      contextResolver,
      provider: crashProvider,
      envelope,
      leaseStore: new InMemoryVeraLeaseStore(),
      hmacSecret: `sprint3-crash-${table}`,
    });
    try {
      const crashResponse = await crashOrchestrator.sse({ studentId, conversationId, clientRequestId: crashKey, kind: "studio", toolId: "analysis", text: `Uji crash ${table}.`, selection });
      assert.ok((await crashResponse.text()).includes("request.recovery_pending"));
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
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
    assert.equal(await db.weaknessAnalysis.count({ where: { requestId: crashRequest.id } }), 1);
    assert.equal(await db.aiArtifact.count({ where: { requestId: crashRequest.id } }), 1);
    assert.equal(await db.aiArtifactLifecycle.count({ where: { artifact: { requestId: crashRequest.id } } }), 1);
  }
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_insert()`);

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
    leaseStore: new InMemoryVeraLeaseStore(),
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
    leaseStore: new InMemoryVeraLeaseStore(),
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
  assert.ok(history.artifacts.length >= durableInsertTables.length + 1);
  const routeArtifact = history.artifacts.find((artifact) => artifact.artifactType === "route");
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

  const fixtureQuestionId = randomUUID();
  const fixtureRevisionId = randomUUID();
  const fixtureAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [], topicIds: [topicId], moduleIds: [], questions: [{ questionId: fixtureQuestionId, questionRevisionId: fixtureRevisionId, topicId }], universityIds: [], majorIds: [] };
  const fixtureAuthority: VeraStudioIdentityAuthority = { ...fixtureAuthoritySeed, digest: sha256Hex(canonicalJson(fixtureAuthoritySeed)) };
  const drillPayload = validateStudioOutput({ toolId: "drill", structured: { title: "Drill terapan", topicId, items: [{ ordinal: 1, questionId: fixtureQuestionId, questionRevisionId: fixtureRevisionId, topicId, difficulty: "easy", explanationPlan: "Tinjau setelah selesai." }] }, allowedCitationKeys: [], identityAuthority: fixtureAuthority });
  const drillArtifactId = await createCommandArtifact("drill", drillPayload);
  const adaptiveTarget = await db.adaptivePracticeSession.create({ data: { studentId, topicId, sourceConversationId: conversationId, status: "in_progress" } });
  const adaptiveKey = randomUUID();
  const adaptiveApplied = await commands.apply({ studentId, artifactRevisionId: drillArtifactId, clientRequestId: adaptiveKey, registryKey: "adaptive_practice_session.v1", targetId: adaptiveTarget.id, expectedTargetRevision: 0 });
  assert.ok("result" in adaptiveApplied && !adaptiveApplied.replayed && adaptiveApplied.result.target.revision === 1);
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
  assert.ok("result" in ptnApplied && !ptnApplied.replayed && ptnApplied.result.target.revision === 1);
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

  console.log("PASS vera-prisma-sprint3: Studio route tuple, progress-only SSE and post-commit artifact.ready");
  console.log("PASS vera-prisma-sprint3: one encrypted artifact/lifecycle per request and restart decryptability");
  console.log("PASS vera-prisma-sprint3: authoritative conversation/artifact reads and cross-student privacy");
  console.log("PASS vera-prisma-sprint3: signed source cursor, learner payload privacy, materialization and Apply replay");
  console.log("PASS vera-prisma-sprint3: unauthorized existing identities fail before staging and lifecycle tombstones remain readable");
  console.log("PASS vera-prisma-sprint3: callback drift rolls back, preserves stage before deadline, then terminalizes once under overdue race");
  console.log("PASS vera-prisma-sprint3: typed callback crash-at-each-insert rolls back, then process-loss recovery persists exactly once");
  console.log("PASS vera-prisma-sprint3: recovery retry waits for terminal failure, preserves exact user-message digest and rejects edited text before provider");
  console.log("PASS vera-prisma-sprint3: all three Apply projections cover populated replay/conflict and two-client adaptive CAS race");
} finally {
  for (const table of ["weakness_analyses", "weakness_analysis_topics", "ai_artifacts", "ai_artifact_lifecycles"]) {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS vera_fixture_crash_${table} ON ${table}`);
  }
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS vera_fixture_crash_insert()`);
  const requestIds = (await db.aiRequest.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const artifactIds = (await db.aiArtifact.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const recommendationIds = (await db.learningRecommendation.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const packIds = (await db.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id);
  const messageIds = (await db.aiMessage.findMany({ where: { conversationId }, select: { id: true } })).map((row) => row.id);
  const envelopeObjectMarkers = [...requestIds, ...artifactIds, ...recommendationIds, ...packIds, ...messageIds];
  await db.aiArtifactApply.deleteMany({ where: { appliedByStudentId: studentId } });
  await db.adaptivePracticeSession.deleteMany({ where: { studentId } });
  await db.ptnStrategySession.deleteMany({ where: { studentId } });
  await db.learningRecommendation.deleteMany({ where: { studentId } });
  await db.aiArtifactLifecycle.deleteMany({ where: { artifact: { studentId } } });
  await db.aiArtifact.deleteMany({ where: { studentId } });
  const weaknessIds = (await db.weaknessAnalysis.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  await db.weaknessAnalysisTopic.deleteMany({ where: { weaknessAnalysisId: { in: weaknessIds } } });
  await db.weaknessAnalysis.deleteMany({ where: { id: { in: weaknessIds } } });
  await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequest.deleteMany({ where: { studentId } });
  await db.aiMessage.deleteMany({ where: { conversationId } });
  await db.aiConversation.deleteMany({ where: { id: conversationId } });
  await db.aiAdmissionEvent.deleteMany({ where: { studentId } });
  await db.aiUsageDaily.deleteMany({ where: { studentId } });
  await db.aiIdempotencyKey.deleteMany({ where: { studentId } });
  if (envelopeObjectMarkers.length) await db.aiEnvelopeKey.deleteMany({ where: { OR: envelopeObjectMarkers.map((id) => ({ objectId: { contains: id } })) } });
  await db.billingAccount.deleteMany({ where: { studentId } });
  await db.studentProfile.deleteMany({ where: { userId: studentId } });
  await db.user.deleteMany({ where: { id: { in: [studentId, otherStudentId] } } });
  await db.module.deleteMany({ where: { id: { in: [moduleId, secondModuleId] } } });
  await db.topic.deleteMany({ where: { id: topicId } });
  await db.subtest.deleteMany({ where: { id: subtestId } });
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: policy.state, effectiveAt: policy.effectiveAt } });
  await db.$disconnect();
}
