import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  AiAdmissionReason,
  AiAdminReportEventType,
  AiAdminReportOperation,
  AiAdminReportSuppressionState,
  AiIdempotencyOperation,
  AiIdempotencyResultKind,
  AiIdempotencyState,
  AiRequestLifecycleState,
  AiPolicyState,
  AiReportReservationState,
  AiTokenUsageState,
  AiUsageAccountingState,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";

import type { AiPolicyBundleDto } from "@/lib/admin/ai-policy/contracts";
import { AiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import {
  createPolicyPreviewReservationAdapter,
  ensureEffectivePolicyBoundary,
  VeraAdminUsageService,
} from "@/lib/admin/ai-usage/service";
import { reportFingerprint, parseAdminUsageQuery } from "@/lib/admin/ai-usage/validation";
import { IORedisVeraLeaseStore, leaseKey } from "@/lib/vera-ai/redis-lease";

function assertLocalDatabase(value: string): void {
  const parsed = new URL(value);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "runtime fixture refuses a non-local database");
  assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test", "runtime fixture requires the vera_test database");
  assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1", "set VERA_DISPOSABLE_DB_ACK=1 for the disposable database");
}

function assertLocalRedis(value: string): void {
  const parsed = new URL(value);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "runtime fixture refuses non-local Redis");
  assert.equal(parsed.pathname.replace(/\/$/u, ""), "/15", "runtime fixture requires isolated Redis database 15");
}

function bundleResult(response: { result: unknown }): AiPolicyBundleDto {
  const result = response.result;
  assert(result && typeof result === "object" && "id" in result && "state" in result, "policy command did not return a bundle DTO");
  return result as AiPolicyBundleDto;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const databaseUrl = process.env.VERA_DISPOSABLE_DATABASE_URL;
const redisUrl = process.env.VERA_DISPOSABLE_REDIS_URL;
if (!databaseUrl) throw new Error("VERA_DISPOSABLE_DATABASE_URL is required.");
if (!redisUrl) throw new Error("VERA_DISPOSABLE_REDIS_URL is required.");
assertLocalDatabase(databaseUrl);
assertLocalRedis(redisUrl);
process.env.DATABASE_URL = databaseUrl;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const redis = new IORedisVeraLeaseStore(redisUrl);
const hmacSecret = "vera-sprint4-runtime-secret";
const previewAdapter = createPolicyPreviewReservationAdapter({ db, leaseStore: redis, hmacSecret });
const policyService = new AiPolicyCommandService(db, { fingerprintSecret: hmacSecret, previewReservation: previewAdapter });
const reportService = new VeraAdminUsageService({ db, leaseStore: redis, hmacSecret });

const admin = await db.user.findFirstOrThrow({ where: { email: "admin@vecalss.local" }, select: { id: true } });
const approver = await db.user.findFirstOrThrow({ where: { email: "tutor@vecalss.local" }, select: { id: true } });
const adminActor = { id: admin.id, roles: ["admin"] as const, capabilities: ["canManageAiPolicy", "canManageAiGovernance"] as const };
const approverActor = { id: approver.id, roles: ["admin"] as const, capabilities: ["canManageAiPolicy", "canManageAiGovernance"] as const };
const seed = await db.aiPolicyBundle.findFirstOrThrow({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
const fixtureNow = new Date();

try {
  // The seed is scheduled in the future and is deliberately incomplete for
  // approval metadata. Normalize only this disposable fixture through draft;
  // production immutability remains enforced by the migration trigger.
  const competingBoundaries = await db.aiPolicyBundle.findMany({
    where: { id: { not: seed.id }, state: { in: [AiPolicyState.active, AiPolicyState.scheduled] } },
    select: { id: true },
  });
  for (const competing of competingBoundaries) {
    // State-only normalization is intentionally separate from any content
    // update: it is safe under the production immutability trigger and keeps
    // repeated disposable runs from colliding with the one-active constraint.
    await db.aiPolicyBundle.update({ where: { id: competing.id }, data: { state: AiPolicyState.draft } });
  }
  if (seed.state !== AiPolicyState.draft) {
    await db.aiPolicyBundle.update({ where: { id: seed.id }, data: { state: AiPolicyState.draft } });
  }
  await db.aiPolicyBundle.update({ where: { id: seed.id }, data: { state: AiPolicyState.active, effectiveAt: new Date(fixtureNow.getTime() - 60_000) } });
  await ensureEffectivePolicyBoundary(db, new Date());

  // The disposable fixture is allowed to normalize its state before tests,
  // but the production trigger must still reject content mutation once the
  // row is active. This guards the forward migration's fixture compatibility
  // exception from becoming a production bypass.
  const immutableBefore = await db.aiPolicyBundle.findUniqueOrThrow({ where: { id: seed.id }, select: { quotaConfig: true } });
  const quota = immutableBefore.quotaConfig as Record<string, unknown>;
  await assert.rejects(
    () => db.aiPolicyBundle.update({
      where: { id: seed.id },
      data: { quotaConfig: { ...quota, defaultDailyLimit: Number(quota.defaultDailyLimit ?? 0) + 1 } as Prisma.InputJsonValue },
    }),
    /non-draft policy bundle content is immutable/u,
  );
  const immutableAfter = await db.aiPolicyBundle.findUniqueOrThrow({ where: { id: seed.id }, select: { quotaConfig: true } });
  assert.deepEqual(immutableAfter.quotaConfig, immutableBefore.quotaConfig, "active policy content changed despite the immutability trigger");

  // A duplicate command key must be resolved after the losing insert
  // transaction aborts. Exactly one request creates the draft and the other
  // replays the durable winner; a changed payload gets the shared typed
  // fingerprint conflict rather than a generic transaction failure.
  const commandRaceKey = `runtime-command-race-${randomUUID()}`;
  const [commandRaceA, commandRaceB] = await Promise.all([
    policyService.createDraft(adminActor, { clientRequestId: commandRaceKey, reason: "Concurrent command winner A" }),
    policyService.createDraft(adminActor, { clientRequestId: commandRaceKey, reason: "Concurrent command winner A" }),
  ]);
  assert.equal([commandRaceA, commandRaceB].filter((item) => !item.replayed).length, 1, "exactly one concurrent command should create the draft");
  assert.equal([commandRaceA, commandRaceB].filter((item) => item.replayed).length, 1, "the concurrent loser should replay the winner");
  assert.equal(commandRaceA.result && "id" in commandRaceA.result ? commandRaceA.result.id : null, commandRaceB.result && "id" in commandRaceB.result ? commandRaceB.result.id : null, "concurrent command replay changed the result target");
  await assert.rejects(
    () => policyService.createDraft(adminActor, { clientRequestId: commandRaceKey, reason: "Changed command payload" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "idempotency_conflict",
    "changed command payload must return typed idempotency_conflict",
  );

  const draftResponse = await policyService.createDraft(adminActor, { clientRequestId: randomUUID(), reason: "Runtime T10 preview evidence" });
  let draft = bundleResult(draftResponse);
  assert.equal(draft.state, AiPolicyState.draft);
  const edited = await policyService.editDraft(adminActor, {
    bundleId: draft.id,
    expectedRevision: draft.revision,
    clientRequestId: randomUUID(),
    patch: { quotaConfig: { ...draft.quotaConfig, defaultDailyLimit: draft.quotaConfig.defaultDailyLimit + 100 } },
    reason: "Runtime quota preview fixture",
  });
  draft = bundleResult(edited);
  const validated = await policyService.validateDraft(adminActor, { bundleId: draft.id, expectedRevision: draft.revision, clientRequestId: randomUUID() });
  draft = bundleResult(validated);
  assert.equal(draft.state, AiPolicyState.pending_approval);

  const range = { from: "2026-08-01", to: "2026-08-08", timezone: "Asia/Jakarta" } as const;
  const previewInput = { bundleId: draft.id, expectedRevision: draft.revision, validationDigest: draft.validationDigest, mode: "aggregate" as const, range, clientRequestId: randomUUID() };
  const preview = await policyService.previewDraft(adminActor, previewInput);
  const previewDto = preview.result as { state: string; reservationId?: string; effects: Record<string, { state: string }> };
  assert.equal(previewDto.state, "suppressed", "empty aggregate evidence must be suppressed, not fabricated ready/zero");
  assert(previewDto.reservationId, "aggregate preview did not persist its reservation reference");
  const reservation = await db.aiReportReservation.findUniqueOrThrow({ where: { id: previewDto.reservationId } });
  assert.equal(reservation.operation, AiAdminReportOperation.admin_policy_preview);
  assert.equal(reservation.state, AiReportReservationState.completed);
  assert.equal(reservation.resultKind, "policy_preview");
  const reservationAudit = await db.aiAdminReportAudit.findFirstOrThrow({ where: { reservationId: reservation.id, eventType: AiAdminReportEventType.reservation } });
  assert.equal(reservationAudit.displayTimezone, range.timezone);
  assert.deepEqual(reservationAudit.localDateSpan, { from: range.from, to: range.to });
  const command = await db.aiAdminCommandLedger.findFirstOrThrow({ where: { id: preview.commandId } });
  assert.equal(command.previewReservationUuid, reservation.id);
  assert.equal(command.state, "accepted");
  const budgetBeforeReplay = await db.aiReportBudgetWindow.findMany({ where: { principalKey: admin.id }, select: { id: true, usedBudgetUnits: true, consumedUnits: true, requestCount: true, consumedRequests: true } });
  const replay = await policyService.previewDraft(adminActor, previewInput);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, preview.result);
  const budgetAfterReplay = await db.aiReportBudgetWindow.findMany({ where: { principalKey: admin.id }, select: { id: true, usedBudgetUnits: true, consumedUnits: true, requestCount: true, consumedRequests: true } });
  assert.deepEqual(budgetAfterReplay, budgetBeforeReplay, "preview replay charged the budget twice");

  const activeForRollback = await db.aiPolicyBundle.findFirstOrThrow({ where: { state: AiPolicyState.active }, select: { bundleVersion: true } });
  const reservationsBeforeRollback = await db.aiReportReservation.count({ where: { adminPrincipalId: admin.id, operation: AiAdminReportOperation.admin_policy_preview } });
  await assert.rejects(
    () => db.$transaction(async (tx) => {
      const rollbackReservation = await previewAdapter.reserveAggregate({ principalId: admin.id, clientRequestId: randomUUID(), requestFingerprint: "rollback-preview-fingerprint", policyBundleVersion: activeForRollback.bundleVersion, costUnits: 3, asOf: new Date(), range, commandId: randomUUID(), transaction: tx });
      const rollbackRow = await tx.aiReportReservation.findUnique({ where: { id: rollbackReservation.reservationId }, select: { recoveryLeaseOwner: true, recoveryFenceToken: true, recoveryDeadlineAt: true } });
      assert(rollbackRow?.recoveryLeaseOwner && rollbackRow.recoveryFenceToken !== null, "rollback fixture did not persist its fenced lease identity");
      // The caller owns the surrounding transaction.  Release the fenced
      // Redis lease before intentionally aborting that transaction so the
      // disposable rollback proof also covers the no-orphan-lease boundary.
      await redis.release({ key: leaseKey(admin.id, "admin_report_query"), ownerId: rollbackRow.recoveryLeaseOwner, fencingToken: rollbackRow.recoveryFenceToken, expiresAt: rollbackRow.recoveryDeadlineAt });
      throw new Error("runtime preview rollback sentinel");
    }),
  );
  assert.equal(await db.aiReportReservation.count({ where: { adminPrincipalId: admin.id, operation: AiAdminReportOperation.admin_policy_preview } }), reservationsBeforeRollback, "outer preview rollback left a charged reservation");

  const approved = await policyService.approveDraft(approverActor, { bundleId: draft.id, expectedRevision: draft.revision, validationDigest: draft.validationDigest, clientRequestId: randomUUID(), reason: "Runtime second-operator approval" });
  draft = bundleResult(approved);
  const scheduledAt = new Date(Date.now() + 350);
  const scheduled = await policyService.scheduleDraft(approverActor, { bundleId: draft.id, expectedRevision: draft.revision, validationDigest: draft.validationDigest, effectiveAt: scheduledAt, clientRequestId: randomUUID(), reason: "Runtime DB-clock boundary" });
  draft = bundleResult(scheduled);
  assert.equal(draft.state, AiPolicyState.scheduled);
  assert.notEqual(draft.validationDigest, approved.result && typeof approved.result === "object" && "validationDigest" in approved.result ? approved.result.validationDigest : "", "scheduled digest did not include its effective boundary");
  await sleep(650);
  await ensureEffectivePolicyBoundary(db, new Date(), admin.id);
  const promoted = await db.aiPolicyBundle.findUniqueOrThrow({ where: { id: draft.id } });
  const retired = await db.aiPolicyBundle.findUniqueOrThrow({ where: { id: seed.id } });
  assert.equal(promoted.state, AiPolicyState.active);
  assert.equal(retired.state, AiPolicyState.retired);
  assert.equal(await db.aiPolicyAuditEvent.count({ where: { bundleId: draft.id, action: "activated" } }), 1);

  // Populate the disposable database with durable request/admission rows so
  // T9 evidence exercises the real Prisma report query.  The two periods use
  // disjoint student cohorts: comparison suppression must therefore be based
  // on the union/complement, not on the current-period count alone.
  const reportFeatures = ["vera.chat", "vera.analysis", "vera.route", "vera.review", "vera.ptn", "vera.summary", "vera.drill"] as const;
  const reportStatuses = [AiRequestLifecycleState.succeeded, AiRequestLifecycleState.fallback, AiRequestLifecycleState.failed, AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] as const;
  const reportModels = ["z-ai/glm-5.2:free", "mock", null] as const;
  const reportGateways = ["openrouter", "mock", null] as const;
  const reportUpstreams = ["decart", "mock", null] as const;
  const admissionReasons = [AiAdmissionReason.quota, AiAdmissionReason.burst, AiAdmissionReason.concurrency, AiAdmissionReason.redis_unavailable, AiAdmissionReason.quota_overrun_lock] as const;
  const reportStudents = Array.from({ length: 70 }, () => randomUUID());
  await db.user.createMany({ data: reportStudents.map((id, index) => ({ id, email: `vera-report-${id}@example.test`, fullName: `Vera Report Fixture ${index + 1}`, passwordHash: "fixture" })) });
  const reportRequests: Array<{
    id: string;
    studentId: string;
    idempotencyKeyId: string;
    featureKey: string;
    status: AiRequestLifecycleState;
    model: string | null;
    gateway: string | null;
    upstreamProvider: string | null;
    createdAt: Date;
    inputTokens: number | null;
    outputTokens: number | null;
    tokenUsageState: AiTokenUsageState;
    usageAccountingState: AiUsageAccountingState;
    quotaUnitsConsumed: number;
    quotaOverrunUnits: number;
  }> = [];
  const reportKeys: Array<{
    id: string;
    studentId: string;
    clientRequestId: string;
    requestFingerprint: string;
    acceptedAt: Date;
    terminalAt: Date | null;
    expiresAt: Date;
  }> = [];
  const reportRequestData = (studentId: string, index: number, periodStart: Date): void => {
    const requestId = randomUUID();
    const idempotencyKeyId = randomUUID();
    const day = index % 7;
    const createdAt = new Date(periodStart.getTime() + day * 86_400_000 + 3 * 3_600_000);
    const status = reportStatuses[index % reportStatuses.length]!;
    const inputTokens = index % 4 === 0 ? null : 12 + (index % 3);
    const outputTokens = index % 4 === 0 ? null : 30 + (index % 5);
    const usageKnown = inputTokens !== null && outputTokens !== null;
    const quotaOverrunUnits = index % 5 === 0 ? 2 : 0;
    const terminal = status === AiRequestLifecycleState.succeeded || status === AiRequestLifecycleState.fallback || status === AiRequestLifecycleState.failed;
    const acceptedAt = createdAt;
    const model = reportModels[index % reportModels.length]!;
    const gateway = reportGateways[index % reportGateways.length]!;
    const upstreamProvider = reportUpstreams[index % reportUpstreams.length]!;
    reportRequests.push({ id: requestId, studentId, idempotencyKeyId, featureKey: reportFeatures[index % reportFeatures.length]!, status, model, gateway, upstreamProvider, createdAt, inputTokens, outputTokens, tokenUsageState: usageKnown ? AiTokenUsageState.known : AiTokenUsageState.unknown, usageAccountingState: !terminal ? AiUsageAccountingState.unknown : quotaOverrunUnits > 0 ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.known, quotaUnitsConsumed: terminal ? 42 : 0, quotaOverrunUnits });
    reportKeys.push({ id: idempotencyKeyId, studentId, clientRequestId: `vera-report-fixture-${requestId}`, requestFingerprint: requestId.replaceAll("-", ""), acceptedAt, terminalAt: terminal ? new Date(createdAt.getTime() + 120_000) : null, expiresAt: new Date(createdAt.getTime() + 90 * 86_400_000) });
  };
  const currentPeriod = new Date("2026-08-01T00:00:00.000Z");
  const previousPeriod = new Date("2026-07-25T00:00:00.000Z");
  reportStudents.slice(0, 35).forEach((studentId, index) => reportRequestData(studentId, index, currentPeriod));
  reportStudents.slice(35).forEach((studentId, index) => reportRequestData(studentId, index, previousPeriod));
  await db.aiIdempotencyKey.createMany({ data: reportKeys.map((key) => ({ id: key.id, studentId: key.studentId, operation: AiIdempotencyOperation.ai_request, clientRequestId: key.clientRequestId, requestFingerprint: key.requestFingerprint, fingerprintKeyVersion: "vera-report-fixture-v1", policyBundleVersion: promoted.bundleVersion, state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.request, firstSeenAt: key.acceptedAt, lastSeenAt: key.acceptedAt, acceptedAt: key.acceptedAt, terminalAt: key.terminalAt, expiresAt: key.expiresAt })) });
  await db.aiRequest.createMany({ data: reportRequests.map((request) => ({ id: request.id, studentId: request.studentId, requestType: "vera_chat" as const, model: request.model, inputTokens: request.inputTokens, outputTokens: request.outputTokens, status: request.status, latencyMs: 120 + (request.id.charCodeAt(0) % 30), clientRequestId: `vera-report-request-${request.id}`, requestFingerprint: request.id.replaceAll("-", ""), fingerprintKeyVersion: "vera-report-fixture-v1", idempotencyKeyId: request.idempotencyKeyId, featureKey: request.featureKey, behaviorVersion: "1", outputSchemaVersion: "1", contextPackVersion: "1", gateway: request.gateway, upstreamProvider: request.upstreamProvider, upstreamProviderSlug: request.upstreamProvider ? `${request.upstreamProvider}-slug` : null, observedUpstreamProviderSlug: request.upstreamProvider ? `${request.upstreamProvider}-slug` : null, policyBundleVersion: promoted.bundleVersion, settlementDeadlineAt: request.status === AiRequestLifecycleState.pending || request.status === AiRequestLifecycleState.staged ? new Date(request.createdAt.getTime() - 60_000) : new Date(request.createdAt.getTime() + 300_000), quotaUnitsReserved: 42, quotaUnitsConsumed: request.quotaUnitsConsumed, quotaOverrunUnits: request.quotaOverrunUnits, tokenUsageState: request.tokenUsageState, usageAccountingState: request.usageAccountingState, startedAt: request.createdAt, firstTokenAt: new Date(request.createdAt.getTime() + 100), completedAt: request.status === AiRequestLifecycleState.pending || request.status === AiRequestLifecycleState.staged ? null : new Date(request.createdAt.getTime() + 120_000), timeToFirstTokenMs: 100, finalizedAt: request.status === AiRequestLifecycleState.pending || request.status === AiRequestLifecycleState.staged ? null : new Date(request.createdAt.getTime() + 120_000), createdAt: request.createdAt })) });
  await db.aiAdmissionEvent.createMany({ data: reportRequests.slice(0, 35).map((request, index) => ({ id: randomUUID(), studentId: request.studentId, occurredAt: request.createdAt, localQuotaDate: new Date("2026-08-01T00:00:00.000Z"), quotaTimezone: "Asia/Jakarta", quotaTimezonePolicyVersion: "vera-quota-v1", policyBundleVersion: promoted.bundleVersion, quotaOffsetMinutes: 420, featureKey: request.featureKey, behaviorVersion: "1", gateway: request.gateway, upstreamProvider: request.upstreamProvider, upstreamProviderSlug: request.upstreamProvider ? `${request.upstreamProvider}-slug` : null, model: request.model, reason: admissionReasons[index % admissionReasons.length]!, idempotencyKeyId: request.idempotencyKeyId })) });

  const populatedQuery = parseAdminUsageQuery(new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone, include: "dailyTrend,byFeature,byModel,byStatus,incidents,comparison" }), new Date());
  const populatedReport = await reportService.getReport({ adminPrincipalId: admin.id, idempotencyKey: `report-populated-${randomUUID()}`, params: new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone, include: "dailyTrend,byFeature,byModel,byStatus,incidents,comparison" }) });
  assert.equal(populatedReport.status, 200, "populated report should be a durable HTTP-200 DTO");
  const populatedDto = populatedReport.body as { summary?: { state: string }; dailyTrend?: { state: string }; byFeature?: { state: string }; byModel?: { state: string }; byStatus?: { state: string }; comparison?: { state: string }; range?: { from: string; to: string; timezone: string } };
  assert.equal(populatedDto.range?.from, populatedQuery.from);
  assert.equal(populatedDto.range?.timezone, populatedQuery.timezone);
  assert.equal(populatedDto.summary?.state, "ready");
  assert.equal(populatedDto.dailyTrend?.state, "ready");
  assert.equal(populatedDto.byFeature?.state, "ready");
  assert.equal(populatedDto.byModel?.state, "ready");
  assert.equal(populatedDto.byStatus?.state, "ready");
  assert.equal(populatedDto.comparison?.state, "ready");
  assert(!JSON.stringify(populatedDto).includes("vera-report-"), "aggregate DTO must not expose student fixture identities");
  const unknownReport = await reportService.getReport({ adminPrincipalId: admin.id, idempotencyKey: `report-unknown-${randomUUID()}`, params: new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone, model: "unknown", gateway: "unknown", upstreamProvider: "unknown" }) });
  assert.equal(unknownReport.status, 200, "unknown identity filter should remain aggregate-only");
  const populatedFilter = await reportService.getReport({ adminPrincipalId: admin.id, idempotencyKey: `report-filter-${randomUUID()}`, params: new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone, feature: "vera.chat", status: "succeeded", gateway: "mock", upstreamProvider: "mock", model: "mock", include: "byFeature" }) });
  assert.equal(populatedFilter.status, 200, "bounded report filters should be accepted");
  console.log("PASS vera-prisma-sprint4-runtime: populated persisted AiRequest/AiAdmissionEvent report is ready, filtered, comparison-safe, and identifier-free");

  const reportQuery = parseAdminUsageQuery(new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone }), new Date());
  const reportKey = randomUUID();
  const reportFingerprintValue = reportFingerprint(reportQuery, hmacSecret);
  const processLostId = randomUUID();
  const processLostNow = new Date();
  await db.aiReportReservation.create({
    data: {
      id: processLostId,
      adminPrincipalId: admin.id,
      operation: AiAdminReportOperation.admin_report_query,
      idempotencyKey: reportKey,
      requestFingerprint: reportFingerprintValue,
      fingerprintKeyVersion: "vera-report-hmac-v1",
      policyBundleVersion: promoted.bundleVersion,
      costUnits: 1,
      state: AiReportReservationState.reserved,
      reservedAt: new Date(processLostNow.getTime() - 60_000),
      recoveryDeadlineAt: new Date(processLostNow.getTime() - 1_000),
      expiresAt: new Date(processLostNow.getTime() + 86_400_000),
    },
  });
  await db.aiAdminReportAudit.create({
    data: {
      actorId: admin.id,
      adminPrincipalId: admin.id,
      reservationId: processLostId,
      eventType: AiAdminReportEventType.reservation,
      operation: AiAdminReportOperation.admin_report_query,
      policyBundleVersion: promoted.bundleVersion,
      queryFingerprint: reportFingerprintValue,
      queryShapeDigest: reportFingerprintValue,
      displayTimezone: range.timezone,
      rangeStart: new Date(`${range.from}T00:00:00.000Z`),
      rangeEnd: new Date(`${range.to}T00:00:00.000Z`),
      localDateSpan: range,
      costUnits: 1,
      suppressionState: AiAdminReportSuppressionState.not_evaluated,
      suppressionApplied: false,
    },
  });
  const processLost = await reportService.getReport({ adminPrincipalId: admin.id, idempotencyKey: reportKey, params: new URLSearchParams({ from: range.from, to: range.to, timezone: range.timezone }) });
  assert.equal(processLost.status, 503);
  assert.equal((processLost.body as { code?: string }).code, "report_process_lost");
  const processLostAudit = await db.aiAdminReportAudit.findFirstOrThrow({ where: { reservationId: processLostId, eventType: AiAdminReportEventType.outcome } });
  assert.equal(processLostAudit.queryShapeDigest, reportFingerprintValue);
  assert.equal(processLostAudit.displayTimezone, range.timezone);
  assert.deepEqual(processLostAudit.localDateSpan, { from: range.from, to: range.to });
  assert.equal(processLostAudit.suppressionState, AiAdminReportSuppressionState.process_lost);

  console.log("PASS vera-prisma-sprint4-runtime: transactional aggregate preview reservation/outcome/command linkage, suppressed empty evidence, replay, and rollback");
  console.log("PASS vera-prisma-sprint4-runtime: DB-clock due successor promotion validates approval snapshot, digest, single active, and audit CAS");
  console.log("PASS vera-prisma-sprint4-runtime: report process-loss recovery restores exact range/timezone/query-shape metadata without fabricated epoch values");
} finally {
  await redis.close().catch(() => undefined);
  await db.$disconnect();
}
