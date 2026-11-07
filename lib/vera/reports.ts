import "server-only";

import { z } from "zod";

import type { VeraMessageReportReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VeraError } from "./errors";

export const VERA_REPORT_REASONS = ["wrong_answer", "not_my_context", "inappropriate", "other"] as const;
export const VERA_REPORT_NOTE_LIMIT = 500;

export const veraReportSchema = z.object({
  reason: z.enum(VERA_REPORT_REASONS),
  note: z.string().trim().max(VERA_REPORT_NOTE_LIMIT).optional(),
});

/**
 * Saves a student's report of one of Vera's answers. A student reports an answer once, so a second report replaces the first. Only an
 * answer in the student's own session can be reported. A question, or an answer in someone else's session, is not found.
 */
export async function saveMessageReport({
  studentId,
  messageId,
  reason,
  note,
}: {
  studentId: string;
  messageId: string;
  reason: VeraMessageReportReason;
  note: string | null;
}) {
  const message = await prisma.veraMessage.findFirst({
    where: { id: messageId, role: "assistant", conversation: { studentId } },
    select: { conversationId: true },
  });
  if (!message) {
    throw new VeraError("not_found", "Jawaban itu tidak ditemukan.");
  }
  await prisma.veraMessageReport.upsert({
    where: { studentId_messageId: { studentId, messageId } },
    create: { studentId, conversationId: message.conversationId, messageId, reason, note },
    update: { reason, note },
    select: { id: true },
  });
}
