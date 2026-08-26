import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  AiAdminReportEventType,
  AiAdminReportOperation,
  AiAdminReportSuppressionState,
  AiPolicyState,
  AiReportReservationState,
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
import { IORedisVeraLeaseStore } from "@/lib/vera-ai/redis-lease";

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
      await previewAdapter.reserveAggregate({ principalId: admin.id, clientRequestId: randomUUID(), requestFingerprint: "rollback-preview-fingerprint", policyBundleVersion: activeForRollback.bundleVersion, costUnits: 3, asOf: new Date(), range, commandId: randomUUID(), transaction: tx });
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
