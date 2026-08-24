import "server-only";

import { randomUUID } from "node:crypto";

import {
  AiArtifactProvenanceKind,
  AiArtifactType,
  AiRequestStatus,
  DifficultyLevel,
  Prisma,
} from "@/generated/prisma/client";

import { canonicalJson } from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import { lockAndRevalidateDrillCandidates, type FrozenDrillAuthority } from "./drill-candidates";
import type { NormalizedVeraResult } from "./output-validator";
import {
  VERA_STUDIO_FEATURES,
  assertNormalizedStudioPayload,
  isVeraStudioToolId,
  type NormalizedStudioPayload,
  type VeraStudioToolId,
} from "./studio-contracts";

type JsonRecord = Record<string, unknown>;

export class VeraDurableResultError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "VeraDurableResultError";
    this.code = code;
  }
}

export type VeraDurableCallbackResult = {
  assistantMessageId?: string | null;
  artifactRevisionId?: string | null;
  sourceEntityId?: string | null;
};

export type VeraDurableResultCallback = (
  tx: Prisma.TransactionClient,
  result: NormalizedVeraResult,
) => Promise<VeraDurableCallbackResult>;

type LockedRequestTuple = {
  id: string;
  studentId: string;
  conversationId: string | null;
  requestType: string;
  featureKey: string;
  behaviorVersion: string;
  outputSchemaVersion: string;
  outputSchemaId: string | null;
  outputSchemaHash: string | null;
  retentionPolicyVersion: string | null;
  version: number;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VeraDurableResultError("typed_result_invalid", `${label} is not an object.`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new VeraDurableResultError("typed_result_invalid", `${label} is missing.`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new VeraDurableResultError("typed_result_invalid", `${label} is missing.`);
  }
  return value;
}

function artifactType(toolId: VeraStudioToolId): AiArtifactType {
  return AiArtifactType[toolId];
}

function assertFeatureTuple(request: LockedRequestTuple, payload: NormalizedStudioPayload): void {
  const contract = VERA_STUDIO_FEATURES[payload.toolId];
  if (request.requestType !== contract.requestType
    || request.featureKey !== contract.featureKey
    || request.behaviorVersion !== contract.behaviorVersion
    || request.outputSchemaVersion !== contract.outputSchemaVersion
    || request.outputSchemaId !== contract.schemaId
    || request.outputSchemaHash !== contract.schemaHash
    || payload.schemaId !== contract.schemaId
    || payload.schemaHash !== contract.schemaHash) {
    throw new VeraDurableResultError("durable_callback_mismatch");
  }
}

async function createArtifact(input: {
  tx: Prisma.TransactionClient;
  envelope: EnvelopeService;
  request: LockedRequestTuple;
  payload: NormalizedStudioPayload;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEntityRevision: number;
  sourceEntityDigest: string;
}) {
  const existing = await input.tx.aiArtifact.findUnique({ where: { requestId: input.request.id } });
  if (existing) {
    if (existing.contentDigest !== input.payload.digest || existing.artifactSchemaVersion !== "1") {
      throw new VeraDurableResultError("artifact_conflict");
    }
    return existing;
  }
  const artifactId = randomUUID();
  const scoped = input.envelope.forClient(input.tx);
  const [titleCiphertext, contentMarkdownCiphertext, payloadCiphertext] = await Promise.all([
    scoped.encryptAsync(input.payload.title, `vera-artifact-title:${artifactId}`),
    scoped.encryptAsync(input.payload.markdown, `vera-artifact-markdown:${artifactId}`),
    scoped.encryptAsync(canonicalJson(input.payload), `vera-artifact-payload:${artifactId}`),
  ]);
  return input.tx.aiArtifact.create({
    data: {
      id: artifactId,
      artifactKey: `vera.${input.payload.toolId}.${input.request.id}`,
      revision: 1,
      requestId: input.request.id,
      studentId: input.request.studentId,
      conversationId: input.request.conversationId,
      artifactType: artifactType(input.payload.toolId),
      provenanceKind: AiArtifactProvenanceKind.typed_entity,
      titleCiphertext: json(titleCiphertext),
      contentMarkdownCiphertext: json(contentMarkdownCiphertext),
      payloadCiphertext: json(payloadCiphertext),
      artifactSchemaVersion: "1",
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      sourceEntityRevision: input.sourceEntityRevision,
      sourceEntityDigest: input.sourceEntityDigest,
      contentDigest: input.payload.digest,
      renderVersion: "vera-render-v1",
      retentionPolicyVersion: input.request.retentionPolicyVersion ?? "unknown",
      lifecycle: { create: { lifecycleRevision: 0 } },
    },
  });
}

async function persistAnalysis(input: {
  tx: Prisma.TransactionClient;
  envelope: EnvelopeService;
  request: LockedRequestTuple;
  result: NormalizedVeraResult;
  payload: NormalizedStudioPayload;
}) {
  const data = object(input.payload.payload, "analysis payload");
  const topics = data.topics;
  if (!Array.isArray(topics)) throw new VeraDurableResultError("typed_result_invalid");
  const parsedTopics = topics.map((entry) => {
    const topic = object(entry, "analysis topic");
    return {
      topicId: stringValue(topic.topicId, "topicId"),
      moduleId: topic.moduleId === null ? null : stringValue(topic.moduleId, "moduleId"),
      rank: numberValue(topic.rank, "rank"),
      weaknessScore: numberValue(topic.weaknessScore, "weaknessScore"),
      confidence: numberValue(topic.confidence, "confidence"),
    };
  });
  const [topicCount, moduleCount] = await Promise.all([
    input.tx.topic.count({ where: { id: { in: parsedTopics.map((topic) => topic.topicId) } } }),
    input.tx.module.count({ where: { id: { in: parsedTopics.flatMap((topic) => topic.moduleId ? [topic.moduleId] : []) } } }),
  ]);
  if (topicCount !== new Set(parsedTopics.map((topic) => topic.topicId)).size
    || moduleCount !== new Set(parsedTopics.flatMap((topic) => topic.moduleId ? [topic.moduleId] : [])).size) {
    throw new VeraDurableResultError("typed_target_unavailable");
  }
  const analysisId = randomUUID();
  const resultEnvelope = await input.envelope.forClient(input.tx).encryptAsync(
    canonicalJson(input.payload),
    `weakness-analysis:${analysisId}`,
  );
  const analysis = await input.tx.weaknessAnalysis.create({
    data: {
      id: analysisId,
      studentId: input.request.studentId,
      conversationId: input.request.conversationId,
      status: input.result.kind === "fallback" ? AiRequestStatus.fallback : AiRequestStatus.succeeded,
      summaryMarkdown: null,
      requestId: input.request.id,
      resultEnvelope: json(resultEnvelope),
      resultDigest: input.payload.digest,
      veraSchemaId: input.payload.schemaId,
      veraSchemaHash: input.payload.schemaHash,
      fallbackUsed: input.result.kind === "fallback",
      topics: {
        create: parsedTopics.map((topic) => ({
          ...topic,
          weaknessScore: new Prisma.Decimal(topic.weaknessScore),
          confidence: new Prisma.Decimal(topic.confidence),
          recommendationText: null,
        })),
      },
    },
  });
  return { sourceEntityType: "WeaknessAnalysis", sourceEntityId: analysis.id, sourceEntityRevision: 0, sourceEntityDigest: input.payload.digest };
}

async function persistPtn(input: {
  tx: Prisma.TransactionClient;
  envelope: EnvelopeService;
  request: LockedRequestTuple;
  payload: NormalizedStudioPayload;
}) {
  const data = object(input.payload.payload, "ptn payload");
  const universityId = data.universityId === null ? null : stringValue(data.universityId, "universityId");
  const majorId = data.majorId === null ? null : stringValue(data.majorId, "majorId");
  const [university, major] = await Promise.all([
    universityId ? input.tx.university.findUnique({ where: { id: universityId }, select: { id: true } }) : null,
    majorId ? input.tx.major.findUnique({ where: { id: majorId }, select: { id: true, universityId: true } }) : null,
  ]);
  if ((universityId && !university) || (majorId && (!major || (universityId && major.universityId !== universityId)))) {
    throw new VeraDurableResultError("typed_target_unavailable");
  }
  const sessionId = randomUUID();
  const resultEnvelope = await input.envelope.forClient(input.tx).encryptAsync(canonicalJson(input.payload), `ptn-strategy:${sessionId}`);
  const session = await input.tx.ptnStrategySession.create({
    data: {
      id: sessionId,
      studentId: input.request.studentId,
      conversationId: input.request.conversationId,
      universityId,
      majorId,
      tryoutAverageScore: new Prisma.Decimal(numberValue(data.scoreEvidence, "scoreEvidence")),
      disclaimerShown: true,
      requestId: input.request.id,
      resultEnvelope: json(resultEnvelope),
      resultDigest: input.payload.digest,
      veraSchemaId: input.payload.schemaId,
      veraSchemaHash: input.payload.schemaHash,
    },
  });
  return { sourceEntityType: "PtnStrategySession", sourceEntityId: session.id, sourceEntityRevision: session.revision, sourceEntityDigest: input.payload.digest };
}

async function persistDrill(input: {
  tx: Prisma.TransactionClient;
  envelope: EnvelopeService;
  request: LockedRequestTuple;
  payload: NormalizedStudioPayload;
  authority: FrozenDrillAuthority;
}) {
  const data = object(input.payload.payload, "drill payload");
  const topicId = stringValue(data.topicId, "topicId");
  const rawItems = data.items;
  if (!Array.isArray(rawItems)) throw new VeraDurableResultError("typed_result_invalid");
  const topic = await input.tx.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) throw new VeraDurableResultError("typed_target_unavailable");
  const requested = rawItems.map((entry) => {
    const item = object(entry, "drill item");
    return {
      ordinal: numberValue(item.ordinal, "ordinal"),
      questionId: stringValue(item.questionId, "questionId"),
      questionRevisionId: stringValue(item.questionRevisionId, "questionRevisionId"),
    };
  });
  const revalidated = await lockAndRevalidateDrillCandidates(input.tx, input.request.studentId, input.authority);
  const candidates: Array<(typeof input.authority.candidates)[number] & { correctOptionKey: string; explanation: string | null }> = [];
  for (const item of requested) {
    const frozen = input.authority.candidates.find((candidate) => candidate.questionRevisionId === item.questionRevisionId);
    const candidate = revalidated.get(item.questionRevisionId);
    const output = object(rawItems[item.ordinal - 1], "drill item");
    if (!frozen || !candidate || frozen.questionId !== item.questionId || frozen.topicId !== stringValue(output.topicId, "topicId") || frozen.difficulty !== stringValue(output.difficulty, "difficulty")) {
      throw new VeraDurableResultError("drill_candidate_unavailable");
    }
    candidates.push(candidate);
  }
  const sessionId = randomUUID();
  const scoped = input.envelope.forClient(input.tx);
  const resultEnvelope = await scoped.encryptAsync(canonicalJson(input.payload), `adaptive-session:${sessionId}`);
  const session = await input.tx.adaptivePracticeSession.create({
    data: {
      id: sessionId,
      studentId: input.request.studentId,
      topicId,
      sourceConversationId: input.request.conversationId,
      difficulty: DifficultyLevel.adaptive,
      status: "in_progress",
      requestId: input.request.id,
      resultEnvelope: json(resultEnvelope),
      resultDigest: input.payload.digest,
      veraSchemaId: input.payload.schemaId,
      veraSchemaHash: input.payload.schemaHash,
    },
  });
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const itemId = randomUUID();
    const [promptEnvelope, optionEnvelope, scoringEnvelope] = await Promise.all([
      scoped.encryptAsync(candidate.prompt, `adaptive-item-prompt:${itemId}`),
      scoped.encryptAsync(canonicalJson(candidate.options), `adaptive-item-options:${itemId}`),
      scoped.encryptAsync(canonicalJson({
        correctOptionKey: candidate.correctOptionKey,
        explanation: candidate.explanationReleaseState === "released" ? candidate.explanation : null,
      }), `adaptive-item-scoring:${itemId}`),
    ]);
    await input.tx.adaptivePracticeItem.create({
      data: {
        id: itemId,
        adaptiveSessionId: session.id,
        ordinal: index + 1,
        questionId: candidate.questionId,
        questionRevisionId: candidate.questionRevisionId,
        questionRevisionDigest: candidate.questionRevisionDigest,
        promptSnapshotCiphertext: json(promptEnvelope),
        optionSnapshotCiphertext: json(optionEnvelope),
        scoringSnapshotCiphertext: json(scoringEnvelope),
        candidateContractVersion: "vera-drill-v1",
        candidateSourceKind: candidate.sourceKind,
        sourceAttemptId: candidate.attemptId,
        sourceAssessmentItemId: candidate.assessmentItemId,
        assessmentReleaseDigest: candidate.assessmentReleaseDigest,
        renderReleaseState: "released",
        answerReleaseState: "released",
        explanationReleaseState: candidate.explanationReleaseState,
      },
    });
  }
  return { sourceEntityType: "AdaptivePracticeSession", sourceEntityId: session.id, sourceEntityRevision: session.revision, sourceEntityDigest: input.payload.digest };
}

export function createVeraDurableResultCallback(input: {
  requestId: string;
  envelope: EnvelopeService;
}): VeraDurableResultCallback {
  return async (tx, result) => {
    const request = await tx.aiRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        studentId: true,
        conversationId: true,
        requestType: true,
        featureKey: true,
        behaviorVersion: true,
        outputSchemaVersion: true,
        outputSchemaId: true,
        outputSchemaHash: true,
        retentionPolicyVersion: true,
        version: true,
        contextPack: { select: { normalizedTaskCiphertext: true } },
      },
    });
    if (!request) throw new VeraDurableResultError("request_not_found");
    if (request.featureKey === "vera.chat") return {};
    const toolId = request.featureKey.startsWith("vera.") ? request.featureKey.slice(5) : "";
    if (!isVeraStudioToolId(toolId)) throw new VeraDurableResultError("durable_callback_missing");
    const payload = assertNormalizedStudioPayload(result.structured);
    if (payload.toolId !== toolId) throw new VeraDurableResultError("durable_callback_mismatch");
    assertFeatureTuple(request, payload);
    let drillAuthority: FrozenDrillAuthority | null = null;
    if (toolId === "drill") {
      try {
        const task = JSON.parse(await input.envelope.forClient(tx).decryptTextAsync(request.contextPack?.normalizedTaskCiphertext as unknown as AiEncryptedPayload)) as { authority?: { drill?: FrozenDrillAuthority } };
        drillAuthority = task.authority?.drill ?? null;
      } catch {
        drillAuthority = null;
      }
      if (!drillAuthority) throw new VeraDurableResultError("drill_candidate_unavailable");
    }
    const source = toolId === "analysis"
      ? await persistAnalysis({ tx, envelope: input.envelope, request, result, payload })
      : toolId === "ptn"
        ? await persistPtn({ tx, envelope: input.envelope, request, payload })
        : toolId === "drill"
          ? await persistDrill({ tx, envelope: input.envelope, request, payload, authority: drillAuthority! })
          : {
            sourceEntityType: "AiRequest",
            sourceEntityId: request.id,
            sourceEntityRevision: request.version,
            sourceEntityDigest: payload.digest,
          };
    const artifact = await createArtifact({ tx, envelope: input.envelope, request, payload, ...source });
    return { artifactRevisionId: artifact.id, sourceEntityId: source.sourceEntityId };
  };
}
