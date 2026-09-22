import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  AiConversationType,
  AiIdempotencyOperation,
  AiIdempotencyResultKind,
  AiIdempotencyState,
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { VeraAdmissionError } from "./admission";
import {
  assertMvpFeatureEnabled,
  canonicalJson,
  normalizeSelection,
  selectionDigest,
  sha256Hex,
  VERA_MAX_CONTEXT_SOURCES,
  VeraContractError,
  type VeraContextSelection,
} from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";

type DbClient = typeof defaultPrisma;

export class VeraLearnerServiceError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(code);
    this.name = "VeraLearnerServiceError";
  }
}

type CursorPayload = {
  v: "1";
  scope: "conversation-list" | "message-list" | "source-list" | "artifact-history";
  studentId: string;
  conversationId?: string;
  filter?: string;
  createdAt: string;
  id: string;
};

export type VeraConversationDto = {
  id: string;
  conversationType: AiConversationType;
  title: string | null;
  archivedAt: string | null;
  version: number;
  contextVersion: number;
  createdAt: string;
  updatedAt: string;
  messagePreview: { role: "user" | "assistant"; text: string | null; createdAt: string } | null;
};

function normalizeTitle(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const normalized = value.normalize("NFC").trim();
  if (normalized.length > 160 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new VeraLearnerServiceError("invalid_request", 400);
  return normalized;
}

function isSafeClientRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function boundedPreview(value: string | null, maxBytes = 320): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const bytes = Buffer.from(normalized, "utf8");
  if (bytes.byteLength <= maxBytes) return normalized;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return `${bytes.subarray(0, end).toString("utf8").trimEnd()}…`;
}

function limitValue(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw new VeraLearnerServiceError("invalid_request", 400);
  return parsed;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function learnerPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(learnerPayload);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!/(?:digest|hash|cipher|prompt|provider|schema)/iu.test(key)) {
      result[key] = learnerPayload(nested);
    }
  }
  return result;
}

export class VeraLearnerService {
  constructor(
    private readonly db: DbClient,
    private readonly envelope: EnvelopeService,
    private readonly cursorSecret: string,
    private readonly fingerprintSecret: string,
  ) {
    if (!cursorSecret.trim() || !fingerprintSecret.trim()) throw new VeraLearnerServiceError("vera_config_missing", 503);
  }

  static withDefaults(input: { envelope: EnvelopeService; db?: DbClient; cursorSecret: string; fingerprintSecret: string }) {
    return new VeraLearnerService(input.db ?? defaultPrisma, input.envelope, input.cursorSecret, input.fingerprintSecret);
  }

  parseLimit(url: URL, fallback: number) {
    return limitValue(url.searchParams.get("limit"), fallback);
  }

  private signCursor(payload: CursorPayload): string {
    const body = Buffer.from(canonicalJson(payload)).toString("base64url");
    const signature = createHmac("sha256", this.cursorSecret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  private readCursor(value: string | null, expected: Omit<CursorPayload, "createdAt" | "id">): CursorPayload | null {
    if (!value) return null;
    const [body, signature, extra] = value.split(".");
    if (!body || !signature || extra || !safeEqual(signature, createHmac("sha256", this.cursorSecret).update(body).digest("base64url"))) {
      throw new VeraLearnerServiceError("invalid_cursor", 400);
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
      if (parsed.v !== expected.v || parsed.scope !== expected.scope || parsed.studentId !== expected.studentId
        || parsed.conversationId !== expected.conversationId || parsed.filter !== expected.filter
        || !parsed.id || Number.isNaN(new Date(parsed.createdAt).getTime())) throw new Error("scope");
      return parsed;
    } catch {
      throw new VeraLearnerServiceError("invalid_cursor", 400);
    }
  }

  private async decryptText(value: Prisma.JsonValue | null): Promise<string | null> {
    if (!value) return null;
    try {
      return await this.envelope.decryptTextAsync(value as unknown as AiEncryptedPayload);
    } catch {
      return null;
    }
  }

  private async conversationDto(row: {
    id: string;
    conversationType: AiConversationType;
    title: string | null;
    archivedAt: Date | null;
    version: number;
    contextVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<VeraConversationDto> {
    const latest = await this.db.aiMessage.findFirst({
      where: { conversationId: row.id, role: { in: ["user", "assistant"] }, contentState: "encrypted" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { role: true, contentEnvelope: true, createdAt: true },
    });
    return {
      id: row.id,
      conversationType: row.conversationType,
      title: row.title,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      version: row.version,
      contextVersion: row.contextVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messagePreview: latest ? {
        role: latest.role as "user" | "assistant",
        text: boundedPreview(await this.decryptText(latest.contentEnvelope)),
        createdAt: latest.createdAt.toISOString(),
      } : null,
    };
  }

  async listConversations(input: { studentId: string; limit: number; cursor: string | null; includeArchived?: boolean }) {
    const cursor = this.readCursor(input.cursor, { v: "1", scope: "conversation-list", studentId: input.studentId });
    const rows = await this.db.aiConversation.findMany({
      where: {
        studentId: input.studentId,
        deletionState: "active",
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(cursor ? { OR: [{ updatedAt: { lt: new Date(cursor.createdAt) } }, { updatedAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const conversations = await Promise.all(page.map((row) => this.conversationDto(row)));
    const tail = rows.length > input.limit ? page.at(-1) : null;
    return {
      conversations,
      nextCursor: tail ? this.signCursor({ v: "1", scope: "conversation-list", studentId: input.studentId, createdAt: tail.updatedAt.toISOString(), id: tail.id }) : null,
      defaultConversationId: conversations.find((conversation) => conversation.archivedAt === null)?.id ?? null,
    };
  }

  async createConversation(input: { studentId: string; clientRequestId: string; conversationType: AiConversationType; title?: string | null }) {
    const operation = input.conversationType === AiConversationType.vera_chat
      ? "chat"
      : input.conversationType === AiConversationType.weakness_analysis
        ? "analysis"
        : input.conversationType;
    assertMvpFeatureEnabled(operation, "learner.createConversation");
    if (!isSafeClientRequestId(input.clientRequestId)) throw new VeraLearnerServiceError("invalid_request", 400);
    const title = normalizeTitle(input.title);
    const fingerprint = createHmac("sha256", this.fingerprintSecret).update(canonicalJson({
      operation: "conversation_create",
      studentId: input.studentId,
      conversationType: input.conversationType,
      title,
    })).digest("hex");
    const create = async () => this.db.$transaction(async (tx) => {
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now ?? new Date();
      const existing = await tx.aiIdempotencyKey.findUnique({
        where: { studentId_operation_clientRequestId: { studentId: input.studentId, operation: AiIdempotencyOperation.conversation_create, clientRequestId: input.clientRequestId } },
      });
      if (existing) {
        await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${existing.id}::uuid FOR UPDATE`;
        const locked = await tx.aiIdempotencyKey.findUnique({ where: { id: existing.id } });
        if (!locked || locked.expiresAt <= now || locked.state === AiIdempotencyState.expired) throw new VeraLearnerServiceError("idempotency_key_expired", 409);
        if (locked.requestFingerprint !== fingerprint) throw new VeraLearnerServiceError("idempotency_conflict", 409);
        if (!locked.resultId) throw new VeraLearnerServiceError("request_pending", 409);
        const conversation = await tx.aiConversation.findFirst({ where: { id: locked.resultId, studentId: input.studentId, deletionState: "active" } });
        if (!conversation) throw new VeraLearnerServiceError("target_unavailable", 404);
        return { conversation: await this.conversationDto(conversation), replayed: true };
      }
      const key = await tx.aiIdempotencyKey.create({
        data: {
          studentId: input.studentId,
          operation: AiIdempotencyOperation.conversation_create,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          fingerprintKeyVersion: "vera-hmac-v1",
          retentionPolicyVersion: "vera-retention-v1",
          state: AiIdempotencyState.rejected,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
        },
      });
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${key.id}::uuid FOR UPDATE`;
      const conversation = await tx.aiConversation.create({ data: { studentId: input.studentId, conversationType: input.conversationType, title } });
      await tx.aiIdempotencyKey.update({
        where: { id: key.id },
        data: { state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.conversation, resultId: conversation.id, acceptedAt: now, terminalAt: now, version: { increment: 1 } },
      });
      return { conversation: await this.conversationDto(conversation), replayed: false };
    });
    try {
      return await create();
    } catch (error) {
      // A concurrent absent-key loser can observe PostgreSQL's unique
      // violation only after its interactive transaction has aborted.  Never
      // downgrade that loser to a synthetic error: start a fresh transaction,
      // lock/re-read the durable winner, and apply the same expiry/fingerprint
      // rules as the normal replay path.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      return this.db.$transaction(async (tx) => {
        const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
        const now = nowRows[0]?.now ?? new Date();
        const existing = await tx.aiIdempotencyKey.findUnique({
          where: { studentId_operation_clientRequestId: { studentId: input.studentId, operation: AiIdempotencyOperation.conversation_create, clientRequestId: input.clientRequestId } },
        });
        if (!existing) throw error;
        await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${existing.id}::uuid FOR UPDATE`;
        const locked = await tx.aiIdempotencyKey.findUnique({ where: { id: existing.id } });
        if (!locked || locked.expiresAt <= now || locked.state === AiIdempotencyState.expired) throw new VeraLearnerServiceError("idempotency_key_expired", 409);
        if (locked.requestFingerprint !== fingerprint) throw new VeraLearnerServiceError("idempotency_conflict", 409);
        if (!locked.resultId) throw new VeraLearnerServiceError("request_pending", 409);
        const conversation = await tx.aiConversation.findFirst({ where: { id: locked.resultId, studentId: input.studentId, deletionState: "active" } });
        if (!conversation) throw new VeraLearnerServiceError("target_unavailable", 404);
        return { conversation: await this.conversationDto(conversation), replayed: true };
      });
    }
  }

  async getConversation(studentId: string, conversationId: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id: conversationId, studentId, deletionState: "active" } });
    if (!row) throw new VeraLearnerServiceError("target_unavailable", 404);
    return { conversation: await this.conversationDto(row), context: await this.readContext(studentId, conversationId) };
  }

  async renameConversation(input: { studentId: string; conversationId: string; title: string; expectedVersion: number }) {
    const title = normalizeTitle(input.title);
    if (!title || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new VeraLearnerServiceError("invalid_request", 400);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
      const row = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId, deletionState: "active" } });
      if (!row) throw new VeraLearnerServiceError("target_unavailable", 404);
      if (row.version !== input.expectedVersion) {
        throw new VeraLearnerServiceError("conversation_version_conflict", 409, { conversation: await this.conversationDto(row) });
      }
      const updated = await tx.aiConversation.update({ where: { id: row.id }, data: { title, version: { increment: 1 } } });
      return this.conversationDto(updated);
    });
  }

  async setConversationArchived(input: { studentId: string; conversationId: string; archived: boolean; expectedVersion: number }) {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new VeraLearnerServiceError("invalid_request", 400);
    }
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
      const row = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId, deletionState: "active" } });
      if (!row) throw new VeraLearnerServiceError("target_unavailable", 404);
      if (row.version !== input.expectedVersion) {
        throw new VeraLearnerServiceError("conversation_version_conflict", 409, { conversation: await this.conversationDto(row) });
      }
      const isArchived = row.archivedAt !== null;
      if (isArchived === input.archived) return this.conversationDto(row);
      const updated = await tx.aiConversation.update({
        where: { id: row.id },
        data: { archivedAt: input.archived ? new Date() : null, version: { increment: 1 } },
      });
      return this.conversationDto(updated);
    });
  }

  async listMessages(input: { studentId: string; conversationId: string; limit: number; cursor: string | null }) {
    await this.getOwnedConversationId(input.studentId, input.conversationId);
    const cursor = this.readCursor(input.cursor, { v: "1", scope: "message-list", studentId: input.studentId, conversationId: input.conversationId });
    const rows = await this.db.aiMessage.findMany({
      where: {
        conversationId: input.conversationId,
        role: { in: ["user", "assistant"] },
        ...(cursor ? { OR: [{ createdAt: { gt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      include: { userRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, errorCode: true } }, assistantRequest: { select: { id: true, status: true, errorCode: true } } },
    });
    const page = rows.slice(0, input.limit);
    const messages = await Promise.all(page.map(async (row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      text: await this.decryptText(row.contentEnvelope),
      contentState: row.contentState,
      createdAt: row.createdAt.toISOString(),
      request: row.assistantRequest ?? row.userRequests[0] ?? null,
    })));
    const tail = rows.length > input.limit ? page.at(-1) : null;
    return {
      messages,
      nextCursor: tail ? this.signCursor({ v: "1", scope: "message-list", studentId: input.studentId, conversationId: input.conversationId, createdAt: tail.createdAt.toISOString(), id: tail.id }) : null,
    };
  }

  async readContext(studentId: string, conversationId: string) {
    const conversation = await this.db.aiConversation.findFirst({
      where: { id: conversationId, studentId, deletionState: "active" },
      include: { sources: { orderBy: { sortOrder: "asc" } } },
    });
    if (!conversation) throw new VeraLearnerServiceError("target_unavailable", 404);
    return {
      contextVersion: conversation.contextVersion,
      selectionDigest: selectionDigest(conversation.sources.map((source) => ({ sourceType: source.sourceType, sourceId: source.sourceId }))),
      sources: conversation.sources.map((source) => ({ sourceType: source.sourceType, sourceId: source.sourceId, title: source.titleSnapshot, displayOrder: source.sortOrder })),
      maxSources: VERA_MAX_CONTEXT_SOURCES,
      documentPhase: "disabled" as const,
    };
  }

  async replaceContext(input: { studentId: string; conversationId: string; expectedContextVersion: number; sources: VeraContextSelection[] }) {
    const normalized = normalizeSelection(input.sources);
    if (!Number.isInteger(input.expectedContextVersion) || input.expectedContextVersion < 0 || normalized.length > VERA_MAX_CONTEXT_SOURCES
      || normalized.some((source) => source.sourceType === "document")) throw new VeraLearnerServiceError("invalid_request", 400);
    return this.db.$transaction(async (tx) => {
      const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = nowRows[0]?.now;
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new VeraLearnerServiceError("vera_unavailable", 503);
      await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
      const conversation = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId, deletionState: "active", archivedAt: null } });
      if (!conversation) throw new VeraLearnerServiceError("target_unavailable", 404);
      if (conversation.contextVersion !== input.expectedContextVersion) {
        throw new VeraLearnerServiceError("context_version_conflict", 409, { context: await this.readContext(input.studentId, input.conversationId) });
      }
      const resolved: Array<{ sourceType: "material" | "practice"; sourceId: string; title: string; digest: string }> = await Promise.all(
        normalized.map(async (source) => {
          if (source.sourceType === "material") {
            const moduleRow = await tx.module.findFirst({ where: { id: source.sourceId, status: "published", publishedAt: { lte: now } }, select: { id: true, title: true, updatedAt: true } });
            if (!moduleRow) throw new VeraLearnerServiceError("context_release_unavailable", 410);
            return { sourceType: "material" as const, sourceId: moduleRow.id, title: moduleRow.title, digest: sha256Hex(`${moduleRow.id}:${moduleRow.updatedAt.toISOString()}`) };
          } else {
            const attempt = await tx.standaloneQuizAttempt.findFirst({
              where: { id: source.sourceId, status: "scored", scoringState: "scored", releaseState: "released", participation: { studentId: input.studentId } },
              include: { participation: { include: { quiz: { select: { title: true } } } } },
            });
            if (attempt) {
              return { sourceType: "practice" as const, sourceId: attempt.id, title: attempt.participation.quiz.title, digest: sha256Hex(canonicalJson({ formSnapshot: attempt.formSnapshot, policySnapshot: attempt.policySnapshot })) };
            } else {
              const tryout = await tx.tryoutAttempt.findFirst({
                where: { id: source.sourceId, studentId: input.studentId, status: "scored", scoringState: "scored", releaseState: "released", assessmentReleaseId: { not: null }, assessmentReleaseDigest: { not: null } },
                select: { id: true, assessmentReleaseDigest: true, tryout: { select: { title: true } } },
              });
              if (!tryout || !tryout.assessmentReleaseDigest) throw new VeraLearnerServiceError("context_release_unavailable", 410);
              return { sourceType: "practice" as const, sourceId: tryout.id, title: tryout.tryout.title, digest: tryout.assessmentReleaseDigest };
            }
          }
        }),
      );
      const digest = selectionDigest(resolved.map((source) => ({ sourceType: source.sourceType, sourceId: source.sourceId })));
      await tx.aiConversationSource.deleteMany({ where: { conversationId: conversation.id } });
      if (resolved.length) {
        await tx.aiConversationSource.createMany({ data: resolved.map((source, index) => ({
          conversationId: conversation.id,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          titleSnapshot: source.title,
          contentDigest: source.digest,
          sortOrder: index,
          selectionDigest: digest,
        })) });
      }
      const updated = await tx.aiConversation.update({ where: { id: conversation.id }, data: { contextVersion: { increment: 1 }, version: { increment: 1 } } });
      return {
        contextVersion: updated.contextVersion,
        selectionDigest: digest,
        sources: resolved.map((source, displayOrder) => ({ sourceType: source.sourceType, sourceId: source.sourceId, title: source.title, displayOrder })),
        maxSources: VERA_MAX_CONTEXT_SOURCES,
        documentPhase: "disabled" as const,
      };
    });
  }

  async listSources(input: { studentId: string; type: "material" | "practice" | null; limit: number; cursor: string | null }) {
    const filter = input.type ?? "all";
    const cursor = this.readCursor(input.cursor, { v: "1", scope: "source-list", studentId: input.studentId, filter });
    const boundary = cursor ? new Date(cursor.createdAt) : null;
    const sources: Array<{ sourceType: "material" | "practice"; sourceId: string; title: string; subtitle: string; releasedAt: string; orderAt: Date; orderKey: string }> = [];
    if (!input.type || input.type === "material") {
      const modules = await this.db.module.findMany({ where: { status: "published", publishedAt: { lte: boundary ?? new Date() } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: input.limit + 1, select: { id: true, title: true, publishedAt: true, topic: { select: { name: true } } } });
      sources.push(...modules.flatMap((module) => module.publishedAt ? [{ sourceType: "material" as const, sourceId: module.id, title: module.title, subtitle: module.topic.name, releasedAt: module.publishedAt.toISOString(), orderAt: module.publishedAt, orderKey: `material:${module.id}` }] : []));
    }
    if (!input.type || input.type === "practice") {
      const attempts = await this.db.standaloneQuizAttempt.findMany({
        where: { status: "scored", scoringState: "scored", releaseState: "released", updatedAt: boundary ? { lte: boundary } : undefined, participation: { studentId: input.studentId } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        include: { participation: { include: { quiz: { select: { title: true } } } } },
      });
      sources.push(...attempts.map((attempt) => ({ sourceType: "practice" as const, sourceId: attempt.id, title: attempt.participation.quiz.title, subtitle: "Latihan selesai", releasedAt: attempt.releaseAt?.toISOString() ?? attempt.updatedAt.toISOString(), orderAt: attempt.updatedAt, orderKey: `practice:${attempt.id}` })));
      const tryouts = await this.db.tryoutAttempt.findMany({
        where: { studentId: input.studentId, status: "scored", scoringState: "scored", releaseState: "released", assessmentReleaseId: { not: null }, assessmentReleaseDigest: { not: null }, updatedAt: boundary ? { lte: boundary } : undefined },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        select: { id: true, releaseAt: true, updatedAt: true, tryout: { select: { title: true } } },
      });
      sources.push(...tryouts.map((attempt) => ({ sourceType: "practice" as const, sourceId: attempt.id, title: attempt.tryout.title, subtitle: "Tryout selesai", releasedAt: attempt.releaseAt?.toISOString() ?? attempt.updatedAt.toISOString(), orderAt: attempt.updatedAt, orderKey: `practice:${attempt.id}` })));
    }
    const ordered = sources
      .filter((source) => !cursor || source.orderAt < boundary! || (source.orderAt.getTime() === boundary!.getTime() && source.orderKey < cursor.id))
      .sort((left, right) => right.orderAt.getTime() - left.orderAt.getTime() || right.orderKey.localeCompare(left.orderKey));
    const page = ordered.slice(0, input.limit);
    const tail = ordered.length > input.limit ? page.at(-1) : null;
    return {
      sources: page.map((source) => ({ sourceType: source.sourceType, sourceId: source.sourceId, title: source.title, subtitle: source.subtitle, releasedAt: source.releasedAt })),
      nextCursor: tail ? this.signCursor({ v: "1", scope: "source-list", studentId: input.studentId, filter, createdAt: tail.orderAt.toISOString(), id: tail.orderKey }) : null,
      documentPhase: "disabled" as const,
    };
  }

  async listArtifacts(input: { studentId: string; conversationId: string; limit: number; cursor: string | null }) {
    await this.getOwnedConversationId(input.studentId, input.conversationId);
    const cursor = this.readCursor(input.cursor, { v: "1", scope: "artifact-history", studentId: input.studentId, conversationId: input.conversationId });
    const rows = await this.db.aiArtifact.findMany({
      where: {
        studentId: input.studentId,
        conversationId: input.conversationId,
        lifecycle: { isNot: null },
        ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
      },
      include: { lifecycle: true, request: { select: { status: true, contextPack: { select: { provenanceState: true, purgeState: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const artifacts = await Promise.all(page.map(async (artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      revision: artifact.revision,
      title: artifact.lifecycle?.state === "visible" || artifact.lifecycle?.state === "expired" ? await this.decryptText(artifact.titleCiphertext) : null,
      createdAt: artifact.createdAt.toISOString(),
      lifecycleState: artifact.lifecycle?.state ?? "purged",
      lifecycleRevision: artifact.lifecycle?.lifecycleRevision ?? 0,
      resultState: artifact.request?.status ?? "unavailable",
      contextState: artifact.request?.contextPack?.provenanceState === "reconstructable" && artifact.request.contextPack.purgeState === "available" ? "available" : "unavailable",
    })));
    const tail = rows.length > input.limit ? page.at(-1) : null;
    return {
      artifacts,
      nextCursor: tail ? this.signCursor({ v: "1", scope: "artifact-history", studentId: input.studentId, conversationId: input.conversationId, createdAt: tail.createdAt.toISOString(), id: tail.id }) : null,
    };
  }

  async getArtifact(studentId: string, artifactRevisionId: string) {
    const artifact = await this.db.aiArtifact.findFirst({
      where: {
        id: artifactRevisionId,
        studentId,
        lifecycle: { isNot: null },
      },
      include: {
        lifecycle: true,
        request: { include: { contextPack: { select: { provenanceState: true, purgeState: true } }, sources: { orderBy: { ordinal: "asc" }, select: { citationKey: true, citationLabel: true, titleSnapshot: true, snapshotState: true } } } },
      },
    });
    if (!artifact || !artifact.lifecycle) throw new VeraLearnerServiceError("target_unavailable", 404);
    const contentAvailable = (artifact.lifecycle.state === "visible" || artifact.lifecycle.state === "expired")
      && artifact.lifecycle.deletionState === "active";
    const payloadText = contentAvailable ? await this.decryptText(artifact.payloadCiphertext) : null;
    let payload: unknown = null;
    if (payloadText) {
      try { payload = JSON.parse(payloadText); } catch { payload = null; }
    }
    const contextAvailable = contentAvailable && artifact.request?.contextPack?.provenanceState === "reconstructable"
      && artifact.request.contextPack.purgeState === "available";
    const normalized = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    // Deferred mutation registries remain readable through historical artifact
    // payloads, but no new result advertises an apply/materialize capability.
    // The corresponding command services and routes fail with feature_disabled
    // before they can begin an idempotency transaction.
    const applyCapabilities = { materializeLearningRecommendation: false, registryKeys: [], targets: [] };
    return {
      id: artifact.id,
      artifactType: artifact.artifactType,
      revision: artifact.revision,
      title: contentAvailable ? await this.decryptText(artifact.titleCiphertext) : null,
      markdown: contentAvailable ? await this.decryptText(artifact.contentMarkdownCiphertext) : null,
      payload: contentAvailable && normalized ? learnerPayload(normalized.payload) : null,
      createdAt: artifact.createdAt.toISOString(),
      lifecycle: { state: artifact.lifecycle.state, revision: artifact.lifecycle.lifecycleRevision, deletionState: artifact.lifecycle.deletionState },
      resultState: contentAvailable ? artifact.request?.status ?? "unavailable" : "unavailable",
      contextState: contextAvailable ? "available" : "unavailable",
      citations: contextAvailable && artifact.request?.sources
        ? artifact.request.sources.reduce<Array<{ key: string; label: string }>>((acc, source) => {
            if (source.snapshotState === "available") {
              acc.push({ key: source.citationKey, label: source.citationLabel ?? source.titleSnapshot ?? source.citationKey });
            }
            return acc;
          }, [])
        : [],
      applyCapabilities,
      sourceEntity: artifact.sourceEntityId ? { type: artifact.sourceEntityType, id: artifact.sourceEntityId, revision: artifact.sourceEntityRevision } : null,
    };
  }

  private async getOwnedConversationId(studentId: string, conversationId: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id: conversationId, studentId, deletionState: "active" }, select: { id: true } });
    if (!row) throw new VeraLearnerServiceError("target_unavailable", 404);
    return row.id;
  }
}

export function mapLearnerServiceError(error: unknown): { code: string; status: number; details?: Record<string, unknown> } {
  if (error instanceof VeraLearnerServiceError) return { code: error.code, status: error.status, details: error.details };
  if (error instanceof VeraAdmissionError) return { code: error.code, status: error.status, details: error.details };
  if (error instanceof VeraContractError) return { code: error.code, status: error.status, details: error.details };
  return { code: "vera_unavailable", status: 503 };
}
