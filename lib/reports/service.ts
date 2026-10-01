import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

import {
  deleteSavedReportAttachment,
  savePrivateReportAttachment,
  type SavedReportAttachment,
} from "./attachments";
import type { ValidatedMentorReportSubmission } from "./validation";

async function createMentorReport(
  authorId: string,
  input: ValidatedMentorReportSubmission,
): Promise<{ id: string }> {
  const id = randomUUID();
  const attachments: SavedReportAttachment[] = [];

  try {
    for (const attachment of input.attachments) {
      attachments.push(await savePrivateReportAttachment(id, attachment));
    }

    await prisma.mentorReport.create({
      data: {
        authorId,
        description: input.description,
        feature: input.feature,
        id,
        title: input.title,
        url: input.url,
        attachments: {
          create: attachments.map(({ contentType, fileName, key, sizeBytes }, sortOrder) => ({
            contentType,
            fileName,
            sizeBytes,
            storageKey: key,
            sortOrder,
          })),
        },
      },
    });
  } catch (error) {
    await Promise.allSettled(attachments.map(({ key }) => deleteSavedReportAttachment(key)));
    throw error;
  }

  return { id };
}

export { createMentorReport };
