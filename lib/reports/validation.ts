import "server-only";

import { MentorReportFeature } from "@/generated/prisma/client";

export const REPORT_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const REPORT_ATTACHMENT_MAX_COUNT = 10;
export const REPORT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;

const MAX_TITLE_LENGTH = 160;
const MAX_URL_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 10_000;

const SUPPORTED_FEATURES = new Set<string>(Object.values(MentorReportFeature));

const ATTACHMENT_TYPES = [
  { contentType: "image/jpeg", extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { contentType: "image/png", extension: "png", signature: (bytes: Uint8Array) => (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) },
  { contentType: "image/gif", extension: "gif", signature: (bytes: Uint8Array) => (
    bytes.length >= 6
    && String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a"
    || bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a"
  ) },
  { contentType: "image/webp", extension: "webp", signature: (bytes: Uint8Array) => (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) },
  { contentType: "application/pdf", extension: "pdf", signature: (bytes: Uint8Array) => (
    bytes.length >= 5
    && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
  ) },
] as const;

type ValidatedReportAttachment = {
  bytes: Uint8Array;
  contentType: (typeof ATTACHMENT_TYPES)[number]["contentType"];
  fileName: string;
  sizeBytes: number;
};

type ValidatedMentorReportSubmission = {
  attachments: ValidatedReportAttachment[];
  description: string;
  feature: MentorReportFeature;
  title: string;
  url: string;
};

type MentorReportValidationResult =
  | { ok: true; value: ValidatedMentorReportSubmission }
  | { ok: false; message: string };

function getSingleString(formData: FormData, key: string) {
  const entries = formData.getAll(key);
  return entries.length === 1 && typeof entries[0] === "string" ? entries[0].trim() : null;
}

function isValidReportUrl(value: string) {
  if (!value || value.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }

  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return true;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function safeAttachmentFileName(fileName: string, extension: string) {
  const basename = fileName
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, "_")
    .trim();
  const stem = (basename || "lampiran").replace(/\.[^.]*$/u, "").trim() || "lampiran";
  return `${stem.slice(0, 240)}.${extension}`;
}

async function validateAttachmentEntries(
  formData: FormData,
): Promise<{ ok: true; value: ValidatedReportAttachment[] } | { ok: false; message: string }> {
  const entries = formData.getAll("attachment");
  if (entries.length > REPORT_ATTACHMENT_MAX_COUNT) {
    return { ok: false, message: "Pilih maksimal 10 lampiran." };
  }

  const files: File[] = [];
  let totalSizeBytes = 0;
  for (const entry of entries) {
    if (!(entry instanceof File)) {
      return { ok: false, message: "Lampiran tidak dapat dibaca. Pilih berkas lain dan coba lagi." };
    }
    if (entry.name === "" && entry.size === 0) continue;
    if (entry.size <= 0) {
      return { ok: false, message: "Pilih lampiran yang berisi data." };
    }
    if (entry.size > REPORT_ATTACHMENT_MAX_SIZE_BYTES) {
      return { ok: false, message: "Ukuran setiap lampiran maksimal 10 MB." };
    }

    totalSizeBytes += entry.size;
    if (totalSizeBytes > REPORT_ATTACHMENT_MAX_TOTAL_SIZE_BYTES) {
      return { ok: false, message: "Total ukuran lampiran maksimal 50 MB." };
    }
    files.push(entry);
  }

  const attachments: ValidatedReportAttachment[] = [];
  for (const file of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return { ok: false, message: "Lampiran tidak dapat dibaca. Pilih berkas lain dan coba lagi." };
    }

    if (bytes.byteLength !== file.size) {
      return { ok: false, message: "Lampiran tidak dapat dibaca. Pilih berkas lain dan coba lagi." };
    }

    const detectedType = ATTACHMENT_TYPES.find((type) => type.signature(bytes));
    if (!detectedType) {
      return { ok: false, message: "Gunakan lampiran berupa gambar JPG, PNG, GIF, WebP, atau PDF." };
    }

    attachments.push({
      bytes,
      contentType: detectedType.contentType,
      fileName: safeAttachmentFileName(file.name, detectedType.extension),
      sizeBytes: bytes.byteLength,
    });
  }

  return { ok: true, value: attachments };
}

async function validateMentorReportSubmission(formData: FormData): Promise<MentorReportValidationResult> {
  const title = getSingleString(formData, "title");
  const feature = getSingleString(formData, "feature");
  const url = getSingleString(formData, "url");
  const description = getSingleString(formData, "description");

  if (
    title === null
    || !title
    || title.length > MAX_TITLE_LENGTH
    || feature === null
    || !SUPPORTED_FEATURES.has(feature)
    || url === null
    || !isValidReportUrl(url)
    || description === null
    || !description
    || description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return {
      ok: false,
      message: "Lengkapi judul, fitur, tautan, dan deskripsi laporan dengan data yang valid.",
    };
  }

  const attachmentResult = await validateAttachmentEntries(formData);
  if (!attachmentResult.ok) return attachmentResult;

  return {
    ok: true,
    value: {
      attachments: attachmentResult.value,
      description,
      feature: feature as MentorReportFeature,
      title,
      url,
    },
  };
}

export { validateMentorReportSubmission };
export type { ValidatedMentorReportSubmission, ValidatedReportAttachment };
