import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import {
  AiArtifactApplyState,
  AiArtifactLifecycleState,
  AiDeletionState,
  AiIdempotencyOperation,
  AiIdempotencyResultKind,
  AiIdempotencyState,
  AiRejectionClass,
  AiTargetLifecycleState,
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { canonicalJson, VERA_FINGERPRINT_KEY_VERSION, sha256Hex } from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import { assertNormalizedStudioPayload } from "./studio-contracts";

type DbClient = typeof defaultPrisma;

export const VERA_APPLY_REGISTRY_KEYS = [
  "learning_recommendation.v1",
  "adaptive_practice_session.v1",
  "ptn_strategy_session.v1",
] as const;
export type VeraApplyRegistryKey = (typeof VERA_APPLY_REGISTRY_KEYS)[number];

const VERA_APPLY_TARGET_TYPES: Readonly<Record<VeraApplyRegistryKey, string>> = {
  "learning_recommendation.v1": "LearningRecommendation",
  "adaptive_practice_session.v1": "AdaptivePracticeSession",
  "ptn_strategy_session.v1": "PtnStrategySession",
};

export class VeraArtifactCommandError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "VeraArtifactCommandError";
  }
}

type BegunKey = {
  id: string;
  version: number;
  state: AiIdempotencyState;
  rejectionClass: AiRejectionClass | null;
  rejectionCode: string | null;
  resultId: string | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class VeraArtifactCommandService {
  constructor(
    private readonly db: DbClient,
    private readonly envelope: EnvelopeService,
    private readonly fingerprintSecret: string,
  ) {}

  private fingerprint(value: unknown): string {
    return createHmac("sha256", this.fingerprintSecret).update(canonicalJson(value)).digest("hex");
  }

  private async beginKey(input: {
    tx: Prisma.TransactionClient;
    studentId: string;
    operation: AiIdempotencyOperation;
    clientRequestId: string;
    fingerprint: string;
    now: Date;
  }): Promise<{ key: BegunKey; replay: boolean; terminalCode?: string }> {
    const key = await input.tx.aiIdempotencyKey.upsert({
      where: { studentId_operation_clientRequestId: { studentId: input.studentId, operation: input.operation, clientRequestId: input.clientRequestId } },
      update: {},
      create: {
        studentId: input.studentId,
        operation: input.operation,
        clientRequestId: input.clientRequestId,
        requestFingerprint: input.fingerprint,
        fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
        retentionPolicyVersion: "vera-retention-v1",
        state: AiIdempotencyState.rejected,
        expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60_000),
      },
    });
    await input.tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${key.id}::uuid FOR UPDATE`;
    const locked = await input.tx.aiIdempotencyKey.findUnique({ where: { id: key.id } });
    if (!locked || locked.expiresAt <= input.now || locked.state === AiIdempotencyState.expired) throw new VeraArtifactCommandError("idempotency_key_expired", 409);
    if (locked.requestFingerprint !== input.fingerprint) throw new VeraArtifactCommandError("idempotency_conflict", 409);
    if (locked.state === AiIdempotencyState.accepted && locked.resultId) return { key: locked, replay: true };
    if (locked.rejectionClass === AiRejectionClass.terminal) return { key: locked, replay: true, terminalCode: locked.rejectionCode ?? "target_unavailable" };
    return { key: locked, replay: false };
  }

  private async rejectTerminal(tx: Prisma.TransactionClient, key: BegunKey, code: string, now: Date) {
    await tx.aiIdempotencyKey.update({
      where: { id: key.id },
      data: { rejectionClass: AiRejectionClass.terminal, rejectionCode: code, terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
    });
    return { error: code, status: 409 as const };
  }

  private async readLockedArtifact(tx: Prisma.TransactionClient, studentId: string, artifactRevisionId: string) {
    await tx.$queryRaw`SELECT id FROM ai_artifacts WHERE id = ${artifactRevisionId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM ai_artifact_lifecycles WHERE artifact_revision_id = ${artifactRevisionId}::uuid FOR SHARE`;
    const artifact = await tx.aiArtifact.findFirst({ where: { id: artifactRevisionId, studentId }, include: { lifecycle: true } });
    if (!artifact || !artifact.lifecycle || artifact.lifecycle.state !== AiArtifactLifecycleState.visible || artifact.lifecycle.deletionState !== AiDeletionState.active) return null;
    if (!artifact.payloadCiphertext) return null;
    try {
      const decoded = JSON.parse(await this.envelope.forClient(tx).decryptTextAsync(artifact.payloadCiphertext as unknown as AiEncryptedPayload));
      return { artifact, payload: assertNormalizedStudioPayload(decoded) };
    } catch {
      return null;
    }
  }

  async apply(input: {
    studentId: string;
    artifactRevisionId: string;
    clientRequestId: string;
    registryKey: VeraApplyRegistryKey;
    targetId: string;
    expectedTargetRevision: number;
  }) {
    const fingerprint = this.fingerprint({ operation: "artifact_apply", ...input });
    return this.db.$transaction(async (tx) => {
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now ?? new Date();
      const begun = await this.beginKey({ tx, studentId: input.studentId, operation: AiIdempotencyOperation.artifact_apply, clientRequestId: input.clientRequestId, fingerprint, now });
      if (begun.terminalCode) return { error: begun.terminalCode, status: 409 as const };
      if (begun.replay && begun.key.resultId) {
        const apply = await tx.aiArtifactApply.findFirst({ where: { id: begun.key.resultId, appliedByStudentId: input.studentId } });
        if (!apply) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
        return { result: await this.applyDto(tx, apply), replayed: true };
      }
      const locked = await this.readLockedArtifact(tx, input.studentId, input.artifactRevisionId);
      if (!locked) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
      const expectedTool = input.registryKey === "learning_recommendation.v1" ? "route" : input.registryKey === "adaptive_practice_session.v1" ? "drill" : "ptn";
      if (locked.payload.toolId !== expectedTool || locked.artifact.sourceEntityId === input.targetId) return this.rejectTerminal(tx, begun.key, "unsupported_target", now);

      let targetRevision: number;
      let targetDigest: string;
      if (input.registryKey === "learning_recommendation.v1") {
        if (!locked.payload.saveProjection) return this.rejectTerminal(tx, begun.key, "unsupported_target", now);
        await tx.$queryRaw`SELECT id FROM learning_recommendations WHERE id = ${input.targetId}::uuid FOR UPDATE`;
        const target = await tx.learningRecommendation.findFirst({ where: { id: input.targetId, studentId: input.studentId } });
        if (!target || target.lifecycleState !== AiTargetLifecycleState.active) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
        if (target.deletionState === AiDeletionState.deletion_pending) return this.rejectTerminal(tx, begun.key, "deletion_pending", now);
        if (target.deletionState !== AiDeletionState.active || target.revision !== input.expectedTargetRevision) return this.rejectTerminal(tx, begun.key, "target_revision_conflict", now);
        const rationaleEnvelope = await this.envelope.forClient(tx).encryptAsync(locked.payload.saveProjection.rationale, `learning-recommendation-rationale:${target.id}:${target.revision + 1}`);
        targetRevision = target.revision + 1;
        targetDigest = sha256Hex(canonicalJson({ id: target.id, revision: targetRevision, artifactId: locked.artifact.id, artifactDigest: locked.artifact.contentDigest, schemaId: locked.payload.schemaId, schemaHash: locked.payload.schemaHash, topicId: locked.payload.saveProjection.topicId, moduleId: locked.payload.saveProjection.moduleId, priority: locked.payload.saveProjection.priority, rationaleDigest: locked.payload.saveProjection.rationaleDigest }));
        await tx.learningRecommendation.update({ where: { id: target.id }, data: { topicId: locked.payload.saveProjection.topicId, moduleId: locked.payload.saveProjection.moduleId, priority: locked.payload.saveProjection.priority, rationaleEnvelope: json(rationaleEnvelope), rationaleDigest: locked.payload.saveProjection.rationaleDigest, veraSchemaId: locked.payload.schemaId, veraSchemaHash: locked.payload.schemaHash, appliedArtifactRevisionId: locked.artifact.id, appliedArtifactDigest: locked.artifact.contentDigest, materializationSchemaVersion: "1", revision: { increment: 1 }, reason: null } });
      } else if (input.registryKey === "adaptive_practice_session.v1") {
        await tx.$queryRaw`SELECT id FROM adaptive_practice_sessions WHERE id = ${input.targetId}::uuid FOR UPDATE`;
        const target = await tx.adaptivePracticeSession.findFirst({ where: { id: input.targetId, studentId: input.studentId } });
        if (!target || target.lifecycleState !== AiTargetLifecycleState.active) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
        if (target.deletionState === AiDeletionState.deletion_pending) return this.rejectTerminal(tx, begun.key, "deletion_pending", now);
        if (target.deletionState !== AiDeletionState.active || target.revision !== input.expectedTargetRevision) return this.rejectTerminal(tx, begun.key, "target_revision_conflict", now);
        const planEnvelope = await this.envelope.forClient(tx).encryptAsync(canonicalJson(locked.payload.payload), `adaptive-session-plan:${target.id}:${target.revision + 1}`);
        targetRevision = target.revision + 1;
        targetDigest = sha256Hex(canonicalJson({ id: target.id, revision: targetRevision, artifactId: locked.artifact.id, artifactDigest: locked.artifact.contentDigest, schemaId: locked.payload.schemaId, schemaHash: locked.payload.schemaHash, planDigest: locked.payload.digest }));
        await tx.adaptivePracticeSession.update({ where: { id: target.id }, data: { appliedArtifactRevisionId: locked.artifact.id, appliedArtifactDigest: locked.artifact.contentDigest, appliedPlanEnvelope: json(planEnvelope), appliedPlanDigest: locked.payload.digest, revision: { increment: 1 } } });
      } else {
        await tx.$queryRaw`SELECT id FROM ptn_strategy_sessions WHERE id = ${input.targetId}::uuid FOR UPDATE`;
        const target = await tx.ptnStrategySession.findFirst({ where: { id: input.targetId, studentId: input.studentId } });
        if (!target || target.lifecycleState !== AiTargetLifecycleState.active) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
        if (target.deletionState === AiDeletionState.deletion_pending) return this.rejectTerminal(tx, begun.key, "deletion_pending", now);
        if (target.deletionState !== AiDeletionState.active || target.revision !== input.expectedTargetRevision) return this.rejectTerminal(tx, begun.key, "target_revision_conflict", now);
        const strategyEnvelope = await this.envelope.forClient(tx).encryptAsync(canonicalJson(locked.payload.payload), `ptn-strategy-apply:${target.id}:${target.revision + 1}`);
        targetRevision = target.revision + 1;
        targetDigest = sha256Hex(canonicalJson({ id: target.id, revision: targetRevision, artifactId: locked.artifact.id, artifactDigest: locked.artifact.contentDigest, schemaId: locked.payload.schemaId, schemaHash: locked.payload.schemaHash, strategyDigest: locked.payload.digest }));
        await tx.ptnStrategySession.update({ where: { id: target.id }, data: { appliedArtifactRevisionId: locked.artifact.id, appliedArtifactDigest: locked.artifact.contentDigest, appliedStrategyEnvelope: json(strategyEnvelope), appliedStrategyDigest: locked.payload.digest, revision: { increment: 1 } } });
      }
      const apply = await tx.aiArtifactApply.create({ data: { idempotencyKeyId: begun.key.id, artifactRevisionId: locked.artifact.id, registryKey: input.registryKey, targetEntityType: VERA_APPLY_TARGET_TYPES[input.registryKey], targetEntityId: input.targetId, expectedTargetRevision: input.expectedTargetRevision, targetEntityRevision: targetRevision, targetEntityDigest: targetDigest, applyState: AiArtifactApplyState.applied, appliedByStudentId: input.studentId } });
      await tx.aiIdempotencyKey.update({ where: { id: begun.key.id }, data: { state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.artifact_apply, resultId: apply.id, acceptedAt: now, terminalAt: now, lastSeenAt: now, version: { increment: 1 } } });
      return { result: await this.applyDto(tx, apply), replayed: false };
    });
  }

  private async applyDto(tx: Prisma.TransactionClient, apply: { id: string; registryKey: string; artifactRevisionId: string; applyState: AiArtifactApplyState; appliedAt: Date; targetEntityId: string; targetEntityRevision: number }) {
    let lifecycleState = "active";
    let deletionState = "active";
    if (apply.registryKey === "learning_recommendation.v1") {
      const target = await tx.learningRecommendation.findUnique({ where: { id: apply.targetEntityId }, select: { lifecycleState: true, deletionState: true } });
      lifecycleState = target?.lifecycleState ?? "deleted";
      deletionState = target?.deletionState ?? "deleted";
    } else if (apply.registryKey === "adaptive_practice_session.v1") {
      const target = await tx.adaptivePracticeSession.findUnique({ where: { id: apply.targetEntityId }, select: { lifecycleState: true, deletionState: true } });
      lifecycleState = target?.lifecycleState ?? "deleted";
      deletionState = target?.deletionState ?? "deleted";
    } else {
      const target = await tx.ptnStrategySession.findUnique({ where: { id: apply.targetEntityId }, select: { lifecycleState: true, deletionState: true } });
      lifecycleState = target?.lifecycleState ?? "deleted";
      deletionState = target?.deletionState ?? "deleted";
    }
    return { applyId: apply.id, registryKey: apply.registryKey, artifactRevisionId: apply.artifactRevisionId, applyState: apply.applyState, appliedAt: apply.appliedAt.toISOString(), target: { id: apply.targetEntityId, revision: apply.targetEntityRevision, lifecycleState, deletionState } };
  }

  async materializeLearningRecommendation(input: { studentId: string; artifactRevisionId: string; clientRequestId: string; expectedArtifactRevision: number; materializationSchemaVersion: "1" }) {
    const fingerprint = this.fingerprint({ operation: "learning_recommendation_create", ...input });
    return this.db.$transaction(async (tx) => {
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now ?? new Date();
      const begun = await this.beginKey({ tx, studentId: input.studentId, operation: AiIdempotencyOperation.learning_recommendation_create, clientRequestId: input.clientRequestId, fingerprint, now });
      if (begun.terminalCode) return { error: begun.terminalCode, status: 409 as const };
      if (begun.replay && begun.key.resultId) {
        const target = await tx.learningRecommendation.findFirst({ where: { id: begun.key.resultId, studentId: input.studentId } });
        if (!target) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
        return { result: { id: target.id, revision: target.revision, lifecycleState: target.lifecycleState, deletionState: target.deletionState, sourceArtifactRevisionId: target.sourceArtifactRevisionId }, replayed: true };
      }
      const locked = await this.readLockedArtifact(tx, input.studentId, input.artifactRevisionId);
      if (!locked || locked.artifact.revision !== input.expectedArtifactRevision || locked.payload.toolId !== "route" || !locked.payload.saveProjection) return this.rejectTerminal(tx, begun.key, "unsupported_target", now);
      const existingMaterialization = await tx.learningRecommendation.findUnique({ where: { sourceArtifactRevisionId: locked.artifact.id }, select: { id: true } });
      if (existingMaterialization) return this.rejectTerminal(tx, begun.key, "already_materialized", now);
      const projection = locked.payload.saveProjection;
      const targetExists = projection.topicId
        ? await tx.topic.findUnique({ where: { id: projection.topicId }, select: { id: true } })
        : projection.moduleId ? await tx.module.findUnique({ where: { id: projection.moduleId }, select: { id: true } }) : null;
      if (!targetExists) return this.rejectTerminal(tx, begun.key, "target_unavailable", now);
      const id = randomUUID();
      const rationaleEnvelope = await this.envelope.forClient(tx).encryptAsync(projection.rationale, `learning-recommendation-rationale:${id}:0`);
      const recommendation = await tx.learningRecommendation.create({ data: { id, studentId: input.studentId, topicId: projection.topicId, moduleId: projection.moduleId, source: "vera.route.v1", reason: null, rationaleEnvelope: json(rationaleEnvelope), rationaleDigest: projection.rationaleDigest, veraSchemaId: locked.payload.schemaId, veraSchemaHash: locked.payload.schemaHash, sourceArtifactRevisionId: locked.artifact.id, sourceArtifactDigest: locked.artifact.contentDigest, materializationSchemaVersion: "1", priority: projection.priority } });
      await tx.aiIdempotencyKey.update({ where: { id: begun.key.id }, data: { state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.learning_recommendation, resultId: recommendation.id, acceptedAt: now, terminalAt: now, lastSeenAt: now, version: { increment: 1 } } });
      return { result: { id: recommendation.id, revision: recommendation.revision, lifecycleState: recommendation.lifecycleState, deletionState: recommendation.deletionState, sourceArtifactRevisionId: recommendation.sourceArtifactRevisionId }, replayed: false };
    });
  }
}
