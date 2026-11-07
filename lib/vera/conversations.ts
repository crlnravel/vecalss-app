import "server-only";

import type { UIMessage } from "ai";

import type { Prisma, VeraEffort } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VERA_CONVERSATION_TITLE, type VeraEffortId } from "./config";
import type { ResolvedMention, VeraSource } from "./sources/types";

export type StoredVeraMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessage["parts"];
  effort?: VeraEffortId;
  credits?: number | null;
  mentions?: ResolvedMention[];
  sources?: VeraSource[];
  createdAt: Date;
};

export async function createConversation(studentId: string) {
  const conversation = await prisma.veraConversation.create({
    data: { studentId, title: VERA_CONVERSATION_TITLE },
    select: { id: true },
  });
  return conversation.id;
}

export async function getConversationWithMessages(studentId: string, conversationId: string) {
  const conversation = await prisma.veraConversation.findFirst({
    where: { id: conversationId, studentId },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, parts: true, effort: true, credits: true, mentions: true, sources: true },
      },
    },
  });
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(toUiMessage),
  };
}

/** The row a stored message is written as. Sources and mentions stay unset (NULL) when empty, so an empty list never looks like a choice. */
function storedRow(conversationId: string, message: StoredVeraMessage) {
  return {
    id: message.id,
    conversationId,
    role: message.role,
    parts: message.parts as unknown as Prisma.InputJsonValue,
    effort: message.effort ?? null,
    credits: message.credits ?? null,
    sources: message.sources?.length ? (message.sources as unknown as Prisma.InputJsonValue) : undefined,
    mentions: message.mentions?.length ? (message.mentions as unknown as Prisma.InputJsonValue) : undefined,
    createdAt: message.createdAt,
  };
}

export async function appendMessages(conversationId: string, messages: StoredVeraMessage[]) {
  await prisma.veraMessage.createMany({ data: messages.map((message) => storedRow(conversationId, message)) });
}

/**
 * Edit writes its replacement: it removes the listed messages of this session and stores the new message in their place, in one
 * transaction. The session keeps its title and its usage events.
 */
export async function replaceMessages({
  conversationId,
  removeIds,
  next,
}: {
  conversationId: string;
  removeIds: string[];
  next: StoredVeraMessage;
}) {
  await prisma.$transaction([
    prisma.veraMessage.deleteMany({ where: { conversationId, id: { in: removeIds } } }),
    prisma.veraMessage.create({ data: storedRow(conversationId, next) }),
  ]);
}

/** Removes listed messages of this session, such as the answer that a regenerate replaces. Usage events are not touched. */
export async function removeMessages({ conversationId, ids }: { conversationId: string; ids: string[] }) {
  await prisma.veraMessage.deleteMany({ where: { conversationId, id: { in: ids } } });
}

export async function touchConversation(studentId: string, conversationId: string) {
  await prisma.veraConversation.updateMany({
    where: { id: conversationId, studentId },
    data: { updatedAt: new Date() },
  });
}

/** How many sessions the sidebar lists per view. */
export const SESSION_LIST_LIMIT = 50;

export type VeraSessionSummary = { id: string; title: string; updatedAt: string; archived: boolean };

/**
 * The sessions the sidebar lists, newest first. A session with no message yet is not listed, so an abandoned one never shows.
 */
export async function listSessions({
  studentId,
  archived,
}: {
  studentId: string;
  archived: boolean;
}): Promise<VeraSessionSummary[]> {
  const rows = await prisma.veraConversation.findMany({
    where: { studentId, archivedAt: archived ? { not: null } : null, messages: { some: {} } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: SESSION_LIST_LIMIT,
    select: { id: true, title: true, updatedAt: true, archivedAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    archived: row.archivedAt !== null,
  }));
}

/**
 * Renames and archives or restores one session. The change is scoped to the student, so another student's id changes nothing and
 * reports false, exactly like a missing one.
 */
export async function updateSession({
  studentId,
  conversationId,
  title,
  archived,
  now = new Date(),
}: {
  studentId: string;
  conversationId: string;
  title?: string;
  archived?: boolean;
  now?: Date;
}): Promise<boolean> {
  const result = await prisma.veraConversation.updateMany({
    where: { id: conversationId, studentId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(archived !== undefined ? { archivedAt: archived ? now : null } : {}),
    },
  });
  return result.count === 1;
}

/**
 * Hard-deletes one session. Its messages go with it. Usage events stay, because the ledger keeps what was spent.
 */
export async function deleteSession({ studentId, conversationId }: { studentId: string; conversationId: string }) {
  const result = await prisma.veraConversation.deleteMany({ where: { id: conversationId, studentId } });
  return result.count === 1;
}

/** Removes a session this request created when its first write failed, so an empty session never stays behind. */
export async function discardEmptyConversation({
  studentId,
  conversationId,
}: {
  studentId: string;
  conversationId: string;
}) {
  await prisma.veraConversation.deleteMany({ where: { id: conversationId, studentId, messages: { none: {} } } });
}

function toUiMessage(message: {
  id: string;
  role: "user" | "assistant";
  parts: unknown;
  effort: VeraEffort | null;
  credits: Prisma.Decimal | null;
  mentions: unknown;
  sources: unknown;
}): UIMessage {
  const metadata = {
    ...(message.effort ? { effort: message.effort } : {}),
    ...(message.credits !== null ? { credits: Number(message.credits) } : {}),
    ...(message.mentions ? { mentions: message.mentions } : {}),
    ...(message.sources ? { sources: message.sources } : {}),
  };
  return {
    id: message.id,
    role: message.role,
    parts: message.parts as UIMessage["parts"],
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
