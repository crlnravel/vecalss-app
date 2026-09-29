import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

import { deleteSavedReportAttachment, savePrivateReportAttachment } from "./attachments";
import type { ValidatedMentorReportSubmission } from "./validation";

async function createMentorReport(
  authorId: string,
  input: ValidatedMentorReportSubmission,
): Promise<{ id: string }> {
  const id = randomUUID();
  let attachment: Awaited<ReturnType<typeof savePrivateReportAttachment>> | null = null;

  try {
    if (input.attachment) {
      attachment = await savePrivateReportAttachment(id, input.attachment);
    }

    await prisma.mentorReport.create({
      data: {
        attachmentContentType: attachment?.contentType ?? null,
        attachmentFileName: attachment?.fileName ?? null,
        attachmentKey: attachment?.key ?? null,
        attachmentSizeBytes: attachment?.sizeBytes ?? null,
        authorId,
        description: input.description,
        feature: input.feature,
        id,
        title: input.title,
        url: input.url,
      },
    });
  } catch (error) {
    if (attachment) {
      await deleteSavedReportAttachment(attachment.key).catch(() => undefined);
    }
    throw error;
  }

  return { id };
}

export { createMentorReport };
