import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "@/lib/vera-ai/envelope";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import { validateStudioOutput, type NormalizedStudioPayload, type VeraStudioToolId } from "@/lib/vera-ai/studio-contracts";
import type { VeraStudioIdentityAuthority } from "@/lib/vera-ai/studio-authority";

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
const redisUrl = process.env.VERA_DISPOSABLE_REDIS_URL;
if (!connectionString || !redisUrl || process.env.VERA_DISPOSABLE_DB_ACK !== "1") throw new Error("Disposable Postgres/Redis acknowledgement is required.");
const parsedDb = new URL(connectionString);
const parsedRedis = new URL(redisUrl);
assert.ok(["127.0.0.1", "localhost"].includes(parsedDb.hostname));
assert.ok(["127.0.0.1", "localhost"].includes(parsedRedis.hostname));
assert.equal(parsedDb.pathname.replace(/\/$/u, ""), "/vera_test");

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function waitForServer(child: ChildProcess, url: string) {
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => { output = `${output}${chunk}`.slice(-5_000); });
  child.stderr?.on("data", (chunk: Buffer) => { output = `${output}${chunk}`.slice(-5_000); });
  for (let index = 0; index < 160; index += 1) {
    if (child.exitCode !== null) throw new Error(`route server exited: ${output}`);
    try { if ((await fetch(url)).status < 500) return; } catch { /* compiling */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`route server unavailable: ${output}`);
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const studentId = randomUUID();
const otherStudentId = randomUUID();
const conversationId = randomUUID();
const studentToken = `vera-s3-http-${randomUUID()}`;
const otherToken = `vera-s3-http-other-${randomUUID()}`;
const topicId = randomUUID();
const moduleId = randomUUID();
const subtestId = randomUUID();
const rootKey = Buffer.alloc(32, 13);
const fixtureEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
async function createHttpArtifact(toolId: VeraStudioToolId, normalized: NormalizedStudioPayload) {
  const id = randomUUID();
  const scoped = fixtureEnvelope.forClient(db);
  const [titleCiphertext, contentMarkdownCiphertext, payloadCiphertext] = await Promise.all([
    scoped.encryptAsync(normalized.title, `vera-artifact-title:${id}`),
    scoped.encryptAsync(normalized.markdown, `vera-artifact-markdown:${id}`),
    scoped.encryptAsync(canonicalJson(normalized), `vera-artifact-payload:${id}`),
  ]);
  await db.aiArtifact.create({ data: { id, artifactKey: `vera.http.${toolId}.${id}`, revision: 1, studentId, conversationId, artifactType: toolId, provenanceKind: "typed_entity", titleCiphertext, contentMarkdownCiphertext, payloadCiphertext, artifactSchemaVersion: "1", sourceEntityType: "HttpFixture", sourceEntityId: randomUUID(), sourceEntityRevision: 0, sourceEntityDigest: normalized.digest, contentDigest: normalized.digest, renderVersion: "vera-render-v1", retentionPolicyVersion: "vera-retention-v1", lifecycle: { create: { lifecycleRevision: 0 } } } });
  return id;
}
const drillSessionId = randomUUID();
const drillItemId = randomUUID();
const drillQuestionId = randomUUID();
const drillRevisionId = randomUUID();
const standaloneQuizId = randomUUID();
const standaloneItemId = randomUUID();
const standaloneParticipationId = randomUUID();
const standaloneAttemptId = randomUUID();
const tryoutId = randomUUID();
const tryoutReleaseId = randomUUID();
const tryoutSessionId = randomUUID();
const tryoutAdmissionId = randomUUID();
const tryoutAttemptId = randomUUID();
const universityId = randomUUID();
const majorId = randomUUID();
const drillRevisionOptions = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
const drillRevisionDigest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options: drillRevisionOptions, prompt: "Berapa 2 + 2?", questionType: "single_choice" });
const policy = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
if (!policy) throw new Error("Policy seed missing.");
let server: ChildProcess | null = null;

try {
  const now = new Date();
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: "active", effectiveAt: new Date(now.getTime() - 60_000) } });
  await db.user.createMany({ data: [
    { id: studentId, email: `vera-s3-http-${studentId}@example.test`, fullName: "Vera HTTP", passwordHash: "fixture" },
    { id: otherStudentId, email: `vera-s3-http-other-${otherStudentId}@example.test`, fullName: "Vera HTTP Other", passwordHash: "fixture" },
  ] });
  await db.studentProfile.create({ data: { userId: studentId, timezone: "Asia/Jakarta" } });
  await db.billingAccount.create({ data: { studentId, planCode: "pro", status: "trial" } });
  await db.subtest.create({ data: { id: subtestId, code: `VHTTP-${subtestId.slice(0, 8)}`, name: "Vera HTTP" } });
  await db.topic.create({ data: { id: topicId, subtestId, code: `vhttp-topic-${topicId.slice(0, 8)}`, name: "Rasio" } });
  await db.module.create({ data: { id: moduleId, topicId, code: `vhttp-module-${moduleId}`, title: "Rasio dasar", summary: "Materi rasio yang telah dirilis untuk siswa.", sequenceNo: 1, status: "published", publishedAt: now } });
  await db.university.create({ data: { id: universityId, name: "Universitas Fixture HTTP", shortName: "UFH" } });
  await db.major.create({ data: { id: majorId, universityId, name: "Teknik Fixture HTTP" } });
  await db.$transaction(async (tx) => {
    await tx.question.create({ data: { id: drillQuestionId, code: `vhttp-q-${drillQuestionId}`, subtestId, topicId, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: drillRevisionId, createdByUserId: studentId, updatedByUserId: studentId } });
    await tx.questionRevision.create({ data: { id: drillRevisionId, questionId: drillQuestionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: drillRevisionDigest, createdByUserId: studentId, updatedByUserId: studentId, options: { createMany: { data: drillRevisionOptions } } } });
    await tx.questionRevision.update({ where: { id: drillRevisionId }, data: { status: "ready", readyAt: now } });
  });
  await db.standaloneQuiz.create({ data: { id: standaloneQuizId, slug: `vhttp-quiz-${standaloneQuizId}`, title: "Latihan HTTP", description: "Latihan milik siswa yang telah dirilis.", subtestId, status: "published", reviewTiming: "immediate", correctAnswerVisibility: "show", createdByUserId: studentId } });
  await db.standaloneQuizItem.create({ data: { id: standaloneItemId, quizId: standaloneQuizId, sortOrder: 1, prompt: "Berapa 2 + 2?", explanation: "Empat", difficulty: "easy", subtestId, sourceQuestionId: drillQuestionId, sourceQuestionRevisionId: drillRevisionId, sourceContentDigest: drillRevisionDigest, sourceRevisionProvenance: "authored" } });
  const standalonePolicy = { reviewTiming: "immediate", correctAnswerVisibility: "show", formBehavior: "same", scorePolicy: "latest", attemptsAllowed: 1, retryDelaySeconds: null };
  await db.standaloneQuizParticipation.create({ data: { id: standaloneParticipationId, quizId: standaloneQuizId, studentId, policySnapshot: standalonePolicy } });
  await db.standaloneQuizAttempt.create({ data: { id: standaloneAttemptId, participationId: standaloneParticipationId, attemptNo: 1, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", releaseAt: now, score: 100, policySnapshot: standalonePolicy, formItemOrder: [standaloneItemId], formSnapshot: { version: 1, items: [{ id: standaloneItemId, prompt: "Berapa 2 + 2?", explanation: "Dua ditambah dua adalah empat.", options: [{ choiceKey: "A", content: "4", isCorrect: true }, { choiceKey: "B", content: "5", isCorrect: false }] }] } } });

  const tryoutReleaseDigest = hash(`tryout-release:${tryoutId}`);
  await db.tryoutPackage.create({ data: { id: tryoutId, code: `VHTTP-TO-${tryoutId.slice(0, 8)}`, title: "Tryout HTTP", status: "published", publishedAt: now, createdByUserId: studentId } });
  await db.assessmentRelease.create({ data: { id: tryoutReleaseId, tryoutId, releaseNumber: 1, contentDigest: tryoutReleaseDigest, payload: { version: 1, sections: [] }, publishedAt: now, createdByUserId: studentId } });
  await db.tryoutDeliverySession.create({ data: { id: tryoutSessionId, tryoutId, name: "Sesi HTTP", availableFrom: new Date(now.getTime() - 60_000), availableUntil: new Date(now.getTime() + 3_600_000), status: "active", createdByUserId: studentId, updatedByUserId: studentId, assessmentReleaseId: tryoutReleaseId } });
  await db.tryoutAdmission.create({ data: { id: tryoutAdmissionId, tryoutId, studentId, status: "active", decidedAt: now, decidedByUserId: studentId } });
  await db.tryoutAttempt.create({ data: { id: tryoutAttemptId, tryoutId, deliverySessionId: tryoutSessionId, admissionId: tryoutAdmissionId, studentId, status: "scored", attemptState: "submitted", scoringState: "scored", releaseState: "released", assessmentReleaseId: tryoutReleaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: tryoutReleaseDigest, serverStartedAt: new Date(now.getTime() - 120_000), serverDeadlineAt: new Date(now.getTime() - 60_000), submittedAt: new Date(now.getTime() - 70_000), releaseAt: now, score: 640, releasePolicySnapshot: { policy: "immediate" }, contentSnapshot: { version: 1 } } });
  const emptyAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [], topicIds: [], moduleIds: [], questions: [], universityIds: [], majorIds: [] };
  const emptyAuthority: VeraStudioIdentityAuthority = { ...emptyAuthoritySeed, digest: sha256Hex(canonicalJson(emptyAuthoritySeed)) };
  const unauthorizedExistingOutputs = [
    ["analysis", { title: "Tidak sah", summaryMarkdown: "Tidak sah", topics: [{ topicId, moduleId, rank: 1, weaknessScore: 50, confidence: 0.5, evidenceCitationKeys: ["src_fixture"], limitations: "Tidak sah", nextStep: "Tidak sah" }] }],
    ["route", { title: "Tidak sah", goal: "Tidak sah", activities: [{ ordinal: 1, action: "Tidak sah", estimatedMinutes: 10, topicIds: [topicId], moduleIds: [moduleId], sourceIds: [], citationKeys: [] }], saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: topicId, priority: 50, rationale: "Tidak sah" } }],
    ["review", { title: "Tidak sah", questionId: drillQuestionId, questionRevisionId: drillRevisionId, misconception: "Tidak sah", explanationSteps: ["Tidak sah"], citationKeys: ["src_fixture"] }],
    ["ptn", { title: "Tidak sah", universityId, majorId, scoreEvidence: 650, assumptions: ["Tidak sah"], actions: ["Tidak sah"], disclaimer: "Bukan prediksi kelulusan.", citationKeys: [] }],
    ["drill", { title: "Tidak sah", topicId, items: [{ ordinal: 1, questionId: drillQuestionId, questionRevisionId: drillRevisionId, topicId, difficulty: "easy", explanationPlan: "Tidak sah" }] }],
  ] as const;
  for (const [toolId, structured] of unauthorizedExistingOutputs) {
    assert.throws(() => validateStudioOutput({ toolId, structured, allowedCitationKeys: ["src_fixture"], identityAuthority: emptyAuthority }), /not authorized/);
  }
  const [drillPrompt, drillOptions, drillScoring] = await Promise.all([
    fixtureEnvelope.encryptAsync("Berapa 2 + 2?", `adaptive-item-prompt:${drillItemId}`),
    fixtureEnvelope.encryptAsync(JSON.stringify([{ key: "A", content: "4" }, { key: "B", content: "5" }]), `adaptive-item-options:${drillItemId}`),
    fixtureEnvelope.encryptAsync(JSON.stringify({ correctOptionKey: "A", explanation: "Dua ditambah dua adalah empat." }), `adaptive-item-scoring:${drillItemId}`),
  ]);
  await db.adaptivePracticeSession.create({ data: { id: drillSessionId, studentId, topicId, status: "in_progress" } });
  await db.adaptivePracticeItem.create({ data: { id: drillItemId, adaptiveSessionId: drillSessionId, ordinal: 1, questionId: drillQuestionId, questionRevisionId: drillRevisionId, questionRevisionDigest: drillRevisionDigest, promptSnapshotCiphertext: drillPrompt as never, optionSnapshotCiphertext: drillOptions as never, scoringSnapshotCiphertext: drillScoring as never, candidateContractVersion: "vera-drill-v1", candidateSourceKind: "standalone_quiz", sourceAttemptId: randomUUID(), sourceAssessmentItemId: randomUUID(), assessmentReleaseDigest: "http-release", renderReleaseState: "released", answerReleaseState: "released", explanationReleaseState: "unavailable" } });
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "HTTP Sprint 3" } });
  await db.authSession.createMany({ data: [
    { id: randomUUID(), userId: studentId, refreshTokenHash: hash(studentToken), status: "active", expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now },
    { id: randomUUID(), userId: otherStudentId, refreshTokenHash: hash(otherToken), status: "active", expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now },
  ] });
  const port = 44_000 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const fixture = JSON.stringify({
    "vera.route": {
      title: "Rute HTTP tersimpan",
      goal: "Menguatkan rasio.",
      activities: [{ ordinal: 1, action: "Pelajari kembali konsep rasio.", estimatedMinutes: 20, topicIds: [topicId], moduleIds: [moduleId], sourceIds: [], citationKeys: [] }],
      saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: topicId, priority: 75, rationale: "Bukti belajar menunjukkan topik ini perlu didahulukan." },
    },
  });
  server = spawn("pnpm", ["next", "dev", "--port", String(port)], { cwd: process.cwd(), env: {
    ...process.env,
    APP_BASE_URL: base,
    DATABASE_URL: connectionString,
    REDIS_URL: redisUrl,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    VERA_DISPOSABLE_DB_ACK: "1",
    VERA_ENVELOPE_MASTER_KEY: rootKey.toString("base64url"),
    VERA_IDEMPOTENCY_HMAC_SECRET: "vera-http-sprint3-secret",
    VERA_CURSOR_HMAC_SECRET: "vera-http-sprint3-cursor",
    VERA_MOCK_PROVIDER_ENABLED: "true",
    VERA_MOCK_STUDIO_FIXTURE_JSON: fixture,
    VERA_LIVE_PROVIDER_ENABLED: "false",
  }, stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer(server, `${base}/api/vera-ai/conversations`);
  const studentCookie = `vecalss_session=${studentToken}`;
  const otherCookie = `vecalss_session=${otherToken}`;
  assert.equal((await fetch(`${base}/api/vera-ai/conversations`)).status, 401);
  const listResponse = await fetch(`${base}/api/vera-ai/conversations`, { headers: { cookie: studentCookie } });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as { conversations: Array<{ id: string }>; defaultConversationId: string };
  assert.equal(list.defaultConversationId, conversationId);
  assert.equal((await fetch(`${base}/api/vera-ai/conversations/${conversationId}`, { headers: { cookie: otherCookie } })).status, 404);

  const createKey = randomUUID();
  const createBody = { clientRequestId: createKey, conversationType: "vera_chat", title: "Created over HTTP" };
  const created = await fetch(`${base}/api/vera-ai/conversations`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(createBody) });
  assert.equal(created.status, 201);
  const createdDto = await created.json() as { conversation: { id: string } };
  const replay = await fetch(`${base}/api/vera-ai/conversations`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(createBody) });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as { conversation: { id: string } }).conversation.id, createdDto.conversation.id);

  for (const path of ["messages", "context", "artifacts"]) {
    const response = await fetch(`${base}/api/vera-ai/conversations/${conversationId}/${path}`, { headers: { cookie: studentCookie } });
    assert.equal(response.status, 200, path);
  }
  const contextUpdated = await fetch(`${base}/api/vera-ai/conversations/${conversationId}/context`, {
    method: "PUT",
    headers: { cookie: studentCookie, "content-type": "application/json" },
    body: JSON.stringify({ expectedContextVersion: 0, sources: [{ sourceType: "material", sourceId: moduleId }] }),
  });
  assert.equal(contextUpdated.status, 200);
  assert.equal((await fetch(`${base}/api/vera-ai/sources?limit=50`, { headers: { cookie: studentCookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/vera-ai/usage`, { headers: { cookie: studentCookie } })).status, 200);

  const drillRead = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}`, { headers: { cookie: studentCookie } });
  assert.equal(drillRead.status, 200);
  const drillDto = await drillRead.json() as { revision: number; items: Array<{ id: string; itemRevisionToken: string }> };
  assert.equal((await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}`, { headers: { cookie: otherCookie } })).status, 404);
  const answerBody = { clientAnswerId: randomUUID(), expectedSessionRevision: 0, adaptivePracticeItemId: drillItemId, itemRevisionToken: drillDto.items[0]!.itemRevisionToken, selectedOptionKey: "A" };
  const answerResponse = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}/answers`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(answerBody) });
  assert.equal(answerResponse.status, 201);
  const answerReplay = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}/answers`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(answerBody) });
  assert.equal(answerReplay.status, 200);
  const duplicateAnswer = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}/answers`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ ...answerBody, clientAnswerId: randomUUID() }) });
  assert.equal(duplicateAnswer.status, 409);
  assert.equal((await duplicateAnswer.json() as { error: string }).error, "answer_already_recorded");
  const submissionBody = { clientSubmissionId: randomUUID(), expectedSessionRevision: 1 };
  const submitted = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}/submit`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(submissionBody) });
  assert.equal(submitted.status, 201);
  const resultResponse = await fetch(`${base}/api/vera-ai/adaptive-practice-sessions/${drillSessionId}/result`, { headers: { cookie: studentCookie } });
  assert.equal(resultResponse.status, 200);
  const resultDto = await resultResponse.json() as Record<string, unknown>;
  const resultWire = JSON.stringify(resultDto);
  assert.ok(!/(?:correctOptionKey|questionRevisionDigest|assessmentReleaseDigest)/u.test(resultWire));
  assert.ok(!resultWire.includes('"explanation":'));

  const oversizedKey = await fetch(`${base}/api/vera-ai/conversations/${conversationId}/requests`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: "x".repeat(121), kind: "chat", text: "Batas kunci.", sources: [{ sourceType: "material", sourceId: moduleId }], options: {} }) });
  assert.equal(oversizedKey.status, 400);
  const requestBody = { clientRequestId: randomUUID(), kind: "studio", toolId: "route", text: "Buat rute belajar.", sources: [{ sourceType: "material", sourceId: moduleId }], options: {} };
  const generated = await fetch(`${base}/api/vera-ai/conversations/${conversationId}/requests`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(requestBody) });
  const wire = await generated.text();
  assert.equal(generated.status, 200, wire);
  assert.ok(wire.includes("event: artifact.ready"));
  assert.ok(!wire.includes("event: message.delta"));
  for (const practiceSourceId of [standaloneAttemptId, tryoutAttemptId]) {
    const practiceKey = randomUUID();
    const practiceResponse = await fetch(`${base}/api/vera-ai/conversations/${conversationId}/requests`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: practiceKey, kind: "chat", text: "Jelaskan hasil latihan ini.", sources: [{ sourceType: "practice", sourceId: practiceSourceId }], options: {} }) });
    const practiceWire = await practiceResponse.text();
    assert.equal(practiceResponse.status, 200, practiceWire);
    assert.ok(practiceWire.includes("event: request.completed"));
    const practiceRequest = await db.aiRequest.findFirstOrThrow({ where: { studentId, clientRequestId: practiceKey }, include: { sources: true } });
    assert.equal(practiceRequest.sources.length, 1);
    assert.equal(practiceRequest.sources[0]?.sourceType, "practice");
    assert.equal(practiceRequest.sources[0]?.sourceId, practiceSourceId);
  }
  const artifactList = await (await fetch(`${base}/api/vera-ai/conversations/${conversationId}/artifacts`, { headers: { cookie: studentCookie } })).json() as { artifacts: Array<{ id: string }> };
  assert.equal(artifactList.artifacts.length, 1);
  const artifactId = artifactList.artifacts[0]!.id;
  const detail = await fetch(`${base}/api/vera-ai/artifacts/${artifactId}`, { headers: { cookie: studentCookie } });
  assert.equal(detail.status, 200);
  const detailDto = await detail.json() as Record<string, unknown>;
  assert.equal(detailDto.title, "Rute HTTP tersimpan");
  assert.equal("targetEntityDigest" in detailDto, false);
  assert.ok(!/(?:digest|hash|cipher|schemaHash|rationaleDigest)/u.test(JSON.stringify(detailDto)));
  assert.equal((await fetch(`${base}/api/vera-ai/artifacts/${artifactId}`, { headers: { cookie: otherCookie } })).status, 404);

  const materializeBody = { clientRequestId: randomUUID(), expectedArtifactRevision: 1, materializationSchemaVersion: "1" };
  const materialized = await fetch(`${base}/api/vera-ai/artifacts/${artifactId}/materialize/learning-recommendation`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(materializeBody) });
  assert.equal(materialized.status, 201);
  const materializedReplay = await fetch(`${base}/api/vera-ai/artifacts/${artifactId}/materialize/learning-recommendation`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify(materializeBody) });
  assert.equal(materializedReplay.status, 200);
  const duplicateMaterialization = await fetch(`${base}/api/vera-ai/artifacts/${artifactId}/materialize/learning-recommendation`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ ...materializeBody, clientRequestId: randomUUID() }) });
  assert.equal(duplicateMaterialization.status, 409);
  assert.equal((await duplicateMaterialization.json() as { error: string }).error, "already_materialized");

  const applyOverHttp = async (artifactRevisionId: string, registryKey: string, targetId: string, expectedTargetRevision: number, clientRequestId = randomUUID(), cookie = studentCookie) => fetch(`${base}/api/vera-ai/artifacts/${artifactRevisionId}/apply`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ clientRequestId, registryKey, targetId, expectedTargetRevision }) });
  const recommendation = await db.learningRecommendation.findUniqueOrThrow({ where: { sourceArtifactRevisionId: artifactId } });
  const recommendationApplyKey = randomUUID();
  assert.equal((await applyOverHttp(artifactId, "learning_recommendation.v1", recommendation.id, recommendation.revision, recommendationApplyKey)).status, 201);
  assert.equal((await applyOverHttp(artifactId, "learning_recommendation.v1", recommendation.id, recommendation.revision, recommendationApplyKey)).status, 200);
  assert.equal((await applyOverHttp(artifactId, "learning_recommendation.v1", recommendation.id, 0)).status, 409);

  const commandQuestionId = randomUUID();
  const commandRevisionId = randomUUID();
  const commandAuthoritySeed = { version: "vera-studio-authority-v1" as const, studentId, sourceIds: [], topicIds: [topicId], moduleIds: [moduleId], questions: [{ questionId: commandQuestionId, questionRevisionId: commandRevisionId, topicId }], universityIds: [], majorIds: [] };
  const commandAuthority: VeraStudioIdentityAuthority = { ...commandAuthoritySeed, digest: sha256Hex(canonicalJson(commandAuthoritySeed)) };
  const drillPayload = validateStudioOutput({ toolId: "drill", structured: { title: "Drill HTTP terapan", topicId, items: [{ ordinal: 1, questionId: commandQuestionId, questionRevisionId: commandRevisionId, topicId, difficulty: "easy", explanationPlan: "Tinjau setelah submit." }] }, allowedCitationKeys: [], identityAuthority: commandAuthority });
  const drillArtifactId = await createHttpArtifact("drill", drillPayload);
  const adaptiveTarget = await db.adaptivePracticeSession.create({ data: { studentId, topicId, sourceConversationId: conversationId, status: "in_progress" } });
  const adaptiveApplyKey = randomUUID();
  assert.equal((await applyOverHttp(drillArtifactId, "adaptive_practice_session.v1", adaptiveTarget.id, 0, adaptiveApplyKey)).status, 201);
  assert.equal((await applyOverHttp(drillArtifactId, "adaptive_practice_session.v1", adaptiveTarget.id, 0, adaptiveApplyKey)).status, 200);
  assert.equal((await applyOverHttp(drillArtifactId, "adaptive_practice_session.v1", adaptiveTarget.id, 0)).status, 409);

  const ptnPayload = validateStudioOutput({ toolId: "ptn", structured: { title: "Strategi HTTP terapan", universityId: null, majorId: null, scoreEvidence: 650, assumptions: ["Nilai rilis digunakan."], actions: ["Perkuat subtes utama."], disclaimer: "Strategi belajar, bukan prediksi kelulusan.", citationKeys: [] }, allowedCitationKeys: [], identityAuthority: commandAuthority });
  const ptnArtifactId = await createHttpArtifact("ptn", ptnPayload);
  const ptnTarget = await db.ptnStrategySession.create({ data: { studentId, conversationId, disclaimerShown: true } });
  const ptnApplyKey = randomUUID();
  assert.equal((await applyOverHttp(ptnArtifactId, "ptn_strategy_session.v1", ptnTarget.id, 0, ptnApplyKey)).status, 201);
  assert.equal((await applyOverHttp(ptnArtifactId, "ptn_strategy_session.v1", ptnTarget.id, 0, ptnApplyKey)).status, 200);
  assert.equal((await applyOverHttp(ptnArtifactId, "ptn_strategy_session.v1", ptnTarget.id, 0)).status, 409);

  const raceRoutePayload = validateStudioOutput({ toolId: "route", structured: { title: "Rute HTTP race", goal: "Menguji materialisasi atomik.", activities: [{ ordinal: 1, action: "Jalankan satu proyeksi.", estimatedMinutes: 15, topicIds: [topicId], moduleIds: [moduleId], sourceIds: [], citationKeys: [] }], saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: topicId, priority: 60, rationale: "Satu target kanonik untuk race." } }, allowedCitationKeys: [], identityAuthority: commandAuthority });
  const raceRouteArtifactId = await createHttpArtifact("route", raceRoutePayload);
  const materializationRace = await Promise.all([
    fetch(`${base}/api/vera-ai/artifacts/${raceRouteArtifactId}/materialize/learning-recommendation`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: randomUUID(), expectedArtifactRevision: 1, materializationSchemaVersion: "1" }) }),
    fetch(`${base}/api/vera-ai/artifacts/${raceRouteArtifactId}/materialize/learning-recommendation`, { method: "POST", headers: { cookie: studentCookie, "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: randomUUID(), expectedArtifactRevision: 1, materializationSchemaVersion: "1" }) }),
  ]);
  assert.deepEqual(materializationRace.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
  const adaptiveRaceTarget = await db.adaptivePracticeSession.create({ data: { studentId, topicId, sourceConversationId: conversationId, status: "in_progress" } });
  const adaptiveRace = await Promise.all([
    applyOverHttp(drillArtifactId, "adaptive_practice_session.v1", adaptiveRaceTarget.id, 0),
    applyOverHttp(drillArtifactId, "adaptive_practice_session.v1", adaptiveRaceTarget.id, 0),
  ]);
  assert.deepEqual(adaptiveRace.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
  const ptnRaceTarget = await db.ptnStrategySession.create({ data: { studentId, conversationId, disclaimerShown: true } });
  const ptnRace = await Promise.all([
    applyOverHttp(ptnArtifactId, "ptn_strategy_session.v1", ptnRaceTarget.id, 0),
    applyOverHttp(ptnArtifactId, "ptn_strategy_session.v1", ptnRaceTarget.id, 0),
  ]);
  assert.deepEqual(ptnRace.map((response) => response.status).sort((a, b) => a - b), [201, 409]);

  for (const [privacyArtifactId, registryKey, targetId] of [[artifactId, "learning_recommendation.v1", recommendation.id], [drillArtifactId, "adaptive_practice_session.v1", adaptiveTarget.id], [ptnArtifactId, "ptn_strategy_session.v1", ptnTarget.id]] as const) {
    const crossStudent = await applyOverHttp(privacyArtifactId, registryKey, targetId, 0, randomUUID(), otherCookie);
    const missingArtifact = await applyOverHttp(randomUUID(), registryKey, targetId, 0, randomUUID(), otherCookie);
    assert.equal(crossStudent.status, missingArtifact.status);
    assert.deepEqual(await crossStudent.json(), await missingArtifact.json());
  }

  console.log("PASS vera-http-sprint3: authenticated conversation/detail/messages/context/source/usage handlers");
  console.log("PASS vera-http-sprint3: conversation create replay and cross-student no-existence behavior");
  console.log("PASS vera-http-sprint3: real Studio POST progress-only stream and artifact history/detail privacy");
  console.log("PASS vera-http-sprint3: recommendation materialization handler create/replay/terminal duplicate semantics");
  console.log("PASS vera-http-sprint3: adaptive session/item read, answer replay, duplicate guard, submit and release-gated result handlers");
  console.log("PASS vera-http-sprint3: typed HTTP source authority preserves released standalone and tryout practice identities");
  console.log("PASS vera-http-sprint3: all three Apply handlers cover populated replay/conflict, concurrent route materialization/Adaptive/PTN CAS races, and indistinguishable cross-student privacy");
  console.log("PASS vera-http-sprint3: existing-but-unadmitted Analysis/Route/Review/PTN/Drill identities are rejected");
} finally {
  if (server) await stop(server).catch(() => undefined);
  const conversations = await db.aiConversation.findMany({ where: { studentId }, select: { id: true } });
  const conversationIds = conversations.map((row) => row.id);
  const requestIds = (await db.aiRequest.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const artifactIds = (await db.aiArtifact.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const recommendationIds = (await db.learningRecommendation.findMany({ where: { studentId }, select: { id: true } })).map((row) => row.id);
  const packIds = (await db.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((row) => row.id);
  const messageIds = (await db.aiMessage.findMany({ where: { conversationId: { in: conversationIds } }, select: { id: true } })).map((row) => row.id);
  const envelopeObjectMarkers = [...requestIds, ...artifactIds, ...recommendationIds, ...packIds, ...messageIds, drillItemId, drillSessionId];
  await db.authSession.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
  await db.adaptivePracticeAnswer.deleteMany({ where: { adaptiveSessionId: drillSessionId } });
  await db.adaptivePracticeItem.deleteMany({ where: { adaptiveSessionId: drillSessionId } });
  await db.adaptivePracticeSession.deleteMany({ where: { studentId } });
  await db.ptnStrategySession.deleteMany({ where: { studentId } });
  await db.standaloneQuizAttempt.deleteMany({ where: { id: standaloneAttemptId } });
  await db.standaloneQuizParticipation.deleteMany({ where: { id: standaloneParticipationId } });
  await db.standaloneQuizItem.deleteMany({ where: { id: standaloneItemId } });
  await db.standaloneQuiz.deleteMany({ where: { id: standaloneQuizId } });
  await db.tryoutAttempt.deleteMany({ where: { id: tryoutAttemptId } });
  await db.tryoutDeliverySession.deleteMany({ where: { id: tryoutSessionId } });
  await db.tryoutAdmission.deleteMany({ where: { id: tryoutAdmissionId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE assessment_releases DISABLE TRIGGER USER');
    await tx.assessmentRelease.deleteMany({ where: { id: tryoutReleaseId } });
    await tx.$executeRawUnsafe('ALTER TABLE assessment_releases ENABLE TRIGGER USER');
  });
  await db.tryoutPackage.deleteMany({ where: { id: tryoutId } });
  await db.aiArtifactApply.deleteMany({ where: { appliedByStudentId: studentId } });
  await db.learningRecommendation.deleteMany({ where: { studentId } });
  await db.aiArtifactLifecycle.deleteMany({ where: { artifact: { studentId } } });
  await db.aiArtifact.deleteMany({ where: { studentId } });
  await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
  await db.aiRequest.deleteMany({ where: { studentId } });
  await db.aiMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db.aiConversation.deleteMany({ where: { studentId } });
  await db.aiAdmissionEvent.deleteMany({ where: { studentId } });
  await db.aiUsageDaily.deleteMany({ where: { studentId } });
  await db.aiIdempotencyKey.deleteMany({ where: { studentId: { in: [studentId, otherStudentId] } } });
  if (envelopeObjectMarkers.length) await db.aiEnvelopeKey.deleteMany({ where: { OR: envelopeObjectMarkers.map((id) => ({ objectId: { contains: id } })) } });
  await db.billingAccount.deleteMany({ where: { studentId } });
  await db.studentProfile.deleteMany({ where: { userId: studentId } });
  await db.major.deleteMany({ where: { id: majorId } });
  await db.university.deleteMany({ where: { id: universityId } });
  await db.module.deleteMany({ where: { id: moduleId } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DISABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey');
    await tx.$executeRawUnsafe('ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey');
    await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: drillRevisionId } });
    await tx.questionRevision.deleteMany({ where: { id: drillRevisionId } });
    await tx.question.deleteMany({ where: { id: drillQuestionId } });
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED');
    await tx.$executeRawUnsafe('ALTER TABLE questions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revisions ENABLE TRIGGER USER');
    await tx.$executeRawUnsafe('ALTER TABLE question_revision_options ENABLE TRIGGER USER');
  });
  await db.user.deleteMany({ where: { id: { in: [studentId, otherStudentId] } } });
  await db.topic.deleteMany({ where: { id: topicId } });
  await db.subtest.deleteMany({ where: { id: subtestId } });
  await db.aiPolicyBundle.update({ where: { id: policy.id }, data: { state: policy.state, effectiveAt: policy.effectiveAt } });
  await db.$disconnect();
}
