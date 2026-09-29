import "server-only";

import { randomUUID } from "node:crypto";

import {
  deletePrivateReportAttachment,
  putPrivateReportAttachment,
} from "@/lib/media/r2";

import type { ValidatedReportAttachment } from "./validation";

const EXTENSION_BY_CONTENT_TYPE = {
  "application/pdf": "pdf",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SavedReportAttachment = {
  contentType: ValidatedReportAttachment["contentType"];
  fileName: string;
  key: string;
  sizeBytes: number;
};

async function savePrivateReportAttachment(
  reportId: string,
  attachment: ValidatedReportAttachment,
): Promise<SavedReportAttachment> {
  const extension = EXTENSION_BY_CONTENT_TYPE[attachment.contentType];
  const key = `mentor-reports/${reportId}/${randomUUID()}.${extension}`;

  try {
    await putPrivateReportAttachment(key, attachment.bytes, attachment.contentType);
  } catch (error) {
    await deletePrivateReportAttachment(key).catch(() => undefined);
    throw error;
  }

  return {
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    key,
    sizeBytes: attachment.sizeBytes,
  };
}

async function deleteSavedReportAttachment(key: string) {
  await deletePrivateReportAttachment(key);
}

export { deleteSavedReportAttachment, savePrivateReportAttachment };
export type { SavedReportAttachment };
