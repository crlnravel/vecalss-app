import "server-only";

import type { UIMessage } from "ai";

import type { Prisma, VeraEffort } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VERA_CONVERSATION_TITLE, type VeraEffortId } from "./config";

export type StoredVeraMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessage["parts"];
  effort?: VeraEffortId;
  createdAt: Date;
};

export async function createConversation(studentId: string) {
  const conversation = await prisma.veraConversation.create({
    data: { studentId, title: VERA_CONVERSATION_TITLE },
    select: { id: true },
  });
  return conversation.id;
}

export async function getLatestConversationId(studentId: string) {
  const conversation = await prisma.veraConversation.findFirst({
    where: { studentId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return conversation?.id ?? null;
}

export async function getConversationWithMessages(studentId: string, conversationId: string) {
  const conversation = await prisma.veraConversation.findFirst({
    where: { id: conversationId, studentId },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, parts: true, effort: true },
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

export async function appendMessages(conversationId: string, messages: StoredVeraMessage[]) {
  await prisma.veraMessage.createMany({
    data: messages.map((message) => ({
      id: message.id,
      conversationId,
      role: message.role,
      parts: message.parts as unknown as Prisma.InputJsonValue,
      effort: message.effort ?? null,
      createdAt: message.createdAt,
    })),
  });
}

export async function touchConversation(studentId: string, conversationId: string) {
  await prisma.veraConversation.updateMany({
    where: { id: conversationId, studentId },
    data: { updatedAt: new Date() },
  });
}

function toUiMessage(message: { id: string; role: "user" | "assistant"; parts: unknown; effort: VeraEffort | null }): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts as UIMessage["parts"],
    metadata: message.effort ? { effort: message.effort } : undefined,
  };
}
