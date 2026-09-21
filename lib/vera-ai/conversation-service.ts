import "server-only";

import { randomUUID } from "node:crypto";

import {
  IdempotencyService,
  type IdempotencyRecord,
} from "./idempotency";
import {
  VERA_MAX_CONTEXT_SOURCES,
  VERA_MAX_CONVERSATION_PAGE_SIZE,
  assertMvpFeatureEnabled,
  VeraContractError,
  normalizeSelection,
  selectionDigest,
  type VeraContextSelection,
  type VeraOperation,
} from "./contracts";

export type ConversationType = "vera_chat" | "weakness_analysis" | "ptn_strategy" | "smart_drill";

export type ConversationSourceRecord = VeraContextSelection & {
  titleSnapshot: string;
  sortOrder: number;
  selectionDigest: string;
  contentDigest?: string;
};

export type ConversationRecord = {
  id: string;
  studentId: string;
  conversationType: ConversationType;
  title: string | null;
  version: number;
  contextVersion: number;
  createdAt: Date;
  updatedAt: Date;
  sources: ConversationSourceRecord[];
  messagePreview?: { role: "user" | "assistant"; text: string } | null;
};

export type SourceCatalogEntry = {
  sourceType: Exclude<VeraContextSelection["sourceType"], "document">;
  sourceId: string;
  title: string;
  publicationState: "published" | "released";
  ownerStudentId?: string;
  contentDigest?: string;
};

export interface ConversationStore {
  create(input: Omit<ConversationRecord, "sources" | "messagePreview">): Promise<ConversationRecord>;
  get(studentId: string, conversationId: string): Promise<ConversationRecord | null>;
  update(record: ConversationRecord): Promise<ConversationRecord>;
  list(studentId: string): Promise<ConversationRecord[]>;
}

export interface SourceCatalog {
  get(studentId: string, selection: VeraContextSelection): Promise<SourceCatalogEntry | null>;
  list(studentId: string): Promise<SourceCatalogEntry[]>;
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, ConversationRecord>();

  async create(input: Omit<ConversationRecord, "sources" | "messagePreview">): Promise<ConversationRecord> {
    const record: ConversationRecord = { ...input, sources: [], messagePreview: null };
    this.conversations.set(record.id, record);
    return cloneConversation(record);
  }

  async get(studentId: string, conversationId: string): Promise<ConversationRecord | null> {
    const record = this.conversations.get(conversationId);
    return record?.studentId === studentId ? cloneConversation(record) : null;
  }

  async update(record: ConversationRecord): Promise<ConversationRecord> {
    this.conversations.set(record.id, cloneConversation(record));
    return cloneConversation(record);
  }

  async list(studentId: string): Promise<ConversationRecord[]> {
    return [...this.conversations.values()]
      .filter((record) => record.studentId === studentId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map(cloneConversation);
  }
}

export class InMemorySourceCatalog implements SourceCatalog {
  constructor(private readonly entries: SourceCatalogEntry[]) {}

  async get(studentId: string, selection: VeraContextSelection): Promise<SourceCatalogEntry | null> {
    const entry = this.entries.find((candidate) =>
      candidate.sourceType === selection.sourceType
      && candidate.sourceId === selection.sourceId
      && (candidate.ownerStudentId === undefined || candidate.ownerStudentId === studentId)
      && (candidate.publicationState === "published" || candidate.publicationState === "released"));
    return entry ? { ...entry } : null;
  }

  async list(studentId: string): Promise<SourceCatalogEntry[]> {
    const result: SourceCatalogEntry[] = [];
    for (const entry of this.entries) {
      if (
        (entry.ownerStudentId === undefined || entry.ownerStudentId === studentId) &&
        (entry.publicationState === "published" || entry.publicationState === "released")
      ) {
        result.push({ ...entry });
      }
    }
    return result;
  }
}

function cloneConversation(record: ConversationRecord): ConversationRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    sources: record.sources.map((source) => ({ ...source })),
    messagePreview: record.messagePreview ? { ...record.messagePreview } : null,
  };
}

function assertConversationOwner(record: ConversationRecord | null, studentId: string): ConversationRecord {
  if (!record || record.studentId !== studentId) {
    throw new VeraContractError("target_unavailable", "Percakapan tidak tersedia.", 404);
  }
  return record;
}

function isValidServerSourceId(sourceId: string): boolean {
  return Boolean(sourceId) && !sourceId.startsWith("uploaded-") && !sourceId.startsWith("client-");
}

export class ConversationService {
  constructor(
    private readonly store: ConversationStore,
    private readonly sourceCatalog: SourceCatalog,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(input: {
    studentId: string;
    clientRequestId: string;
    conversationType: ConversationType;
    title?: string | null;
    now?: Date;
  }): Promise<{ conversation: ConversationRecord; replayed: boolean }> {
    const feature = input.conversationType === "vera_chat"
      ? "chat"
      : input.conversationType === "weakness_analysis"
        ? "analysis"
        : input.conversationType;
    // Keep this guard before idempotency.begin: disabled legacy mutations must
    // have zero durable admission even when a caller reuses an old key.
    assertMvpFeatureEnabled(feature, "conversation-service.create");
    const operation: VeraOperation = "conversation_create";
    const begin = await this.idempotency.begin({
      studentId: input.studentId,
      operation,
      clientRequestId: input.clientRequestId,
      payload: { conversationType: input.conversationType, title: input.title ?? null },
      now: input.now,
    });

    if (begin.kind === "conflict") throw new VeraContractError("idempotency_conflict", "Kunci permintaan sudah digunakan untuk data lain.");
    if (begin.kind === "expired") throw new VeraContractError("idempotency_key_expired", "Buat kunci permintaan baru.", 409);
    if (begin.kind === "replay") {
      if (begin.record.resultKind !== "conversation" || !begin.record.resultId) {
        throw new VeraContractError("target_unavailable", "Target replay percakapan tidak tersedia.", 410);
      }
      return { conversation: assertConversationOwner(await this.store.get(input.studentId, begin.record.resultId), input.studentId), replayed: true };
    }

    const now = input.now ?? new Date();
    const conversation = await this.store.create({
      id: randomUUID(),
      studentId: input.studentId,
      conversationType: input.conversationType,
      title: input.title?.normalize("NFC") ?? null,
      version: 0,
      contextVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    await this.idempotency.accept(begin.record, { kind: "conversation", id: conversation.id }, now);
    return { conversation, replayed: false };
  }

  async rename(input: { studentId: string; conversationId: string; title: string | null; expectedVersion: number }): Promise<ConversationRecord> {
    const current = assertConversationOwner(await this.store.get(input.studentId, input.conversationId), input.studentId);
    if (current.version !== input.expectedVersion) {
      throw new VeraContractError("conversation_version_conflict", "Percakapan berubah di tab lain.", 409, { conversation: current });
    }
    const next = {
      ...current,
      title: input.title?.normalize("NFC") ?? null,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    return this.store.update(next);
  }

  async replaceContext(input: { studentId: string; conversationId: string; selection: VeraContextSelection[]; expectedContextVersion: number }): Promise<ConversationRecord> {
    const current = assertConversationOwner(await this.store.get(input.studentId, input.conversationId), input.studentId);
    if (current.contextVersion !== input.expectedContextVersion) {
      throw new VeraContractError("context_version_conflict", "Sumber percakapan berubah di tab lain.", 409, { conversation: current });
    }
    const selection = normalizeSelection(input.selection);
    if (selection.some(({ sourceId }) => !isValidServerSourceId(sourceId))) {
      throw new VeraContractError("context_release_unavailable", "Sumber harus berasal dari katalog server.", 422);
    }
    const catalog = await Promise.all(selection.map((entry) => this.sourceCatalog.get(input.studentId, entry)));
    if (catalog.some((entry) => !entry || !["published", "released"].includes(entry.publicationState))) {
      throw new VeraContractError("context_release_unavailable", "Sumber tidak lagi tersedia.", 410);
    }
    const digest = selectionDigest(selection);
    const sources = selection.map((entry, index) => ({
      ...entry,
      titleSnapshot: catalog[index]?.title ?? "Sumber Vera",
      contentDigest: catalog[index]?.contentDigest,
      sortOrder: index,
      selectionDigest: digest,
    }));
    return this.store.update({
      ...current,
      sources,
      contextVersion: current.contextVersion + 1,
      updatedAt: new Date(),
    });
  }

  async get(studentId: string, conversationId: string): Promise<ConversationRecord> {
    return assertConversationOwner(await this.store.get(studentId, conversationId), studentId);
  }

  async list(studentId: string, input?: { limit?: number; cursor?: string }): Promise<{
    conversations: ConversationRecord[];
    nextCursor: string | null;
    defaultConversationId: string | null;
  }> {
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), VERA_MAX_CONVERSATION_PAGE_SIZE);
    const records = await this.store.list(studentId);
    const start = input?.cursor ? Math.max(0, records.findIndex((record) => record.id === input.cursor) + 1) : 0;
    const page = records.slice(start, start + limit);
    return {
      conversations: page,
      nextCursor: start + limit < records.length ? page.at(-1)?.id ?? null : null,
      defaultConversationId: records[0]?.id ?? null,
    };
  }

  async sourceCatalogRead(studentId: string): Promise<{
    sources: SourceCatalogEntry[];
    documentPhase: "disabled";
    maxSources: number;
  }> {
    return {
      sources: await this.sourceCatalog.list(studentId),
      documentPhase: "disabled",
      maxSources: VERA_MAX_CONTEXT_SOURCES,
    };
  }
}

export function replayTargetId(record: IdempotencyRecord): string | null {
  return record.resultId;
}
