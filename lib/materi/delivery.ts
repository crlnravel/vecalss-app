import "server-only";

import {
  ContentStatus,
  MediaAssetState,
  MediaLibraryScope,
  ModuleAssetSourceKind,
  ModuleAssetType,
} from "@/generated/prisma/client";
import {
  createMediaPreviewUrl,
  headMediaObject,
  PREVIEW_URL_TTL_SECONDS,
  R2ConfigurationError,
} from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import {
  MATERI_DOCUMENT_MIME_TYPE,
  isValidHostedPdfUrl,
} from "./contract";
import {
  assertMateriLessonAdmitted,
  MateriProgressError,
} from "./progress";
import { materiSubjects } from "./repository";

type MateriDocumentDeliveryErrorCode =
  | "forbidden"
  | "locked"
  | "missing"
  | "not_found"
  | "replaced"
  | "trashed"
  | "unauthorized"
  | "unavailable";

type MateriDocumentDelivery = {
  documentUrl: string;
  downloadUrl?: string;
  expiresInSeconds: number | null;
  managedAssetId: string | null;
  mimeType: typeof MATERI_DOCUMENT_MIME_TYPE;
  originalName: string | null;
  sourceKind: "hosted" | "managed";
};

class MateriDocumentDeliveryError extends Error {
  code: MateriDocumentDeliveryErrorCode;
  status: number;

  constructor(
    code: MateriDocumentDeliveryErrorCode,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "MateriDocumentDeliveryError";
    this.code = code;
    this.status = status;
  }
}

const canonicalTopicCodes = (subjectSlug: string) =>
  [1, 2, 3].map((sectionNo) => `materi:${subjectSlug}:section-${sectionNo}`);

const deliveryError = (
  code: MateriDocumentDeliveryErrorCode,
  message: string,
  status: number,
) => new MateriDocumentDeliveryError(code, message, status);

const resolvePublishedMateriDocument = async ({
  courseSlug,
  expectedManagedAssetId,
  lessonCode,
  studentId,
}: {
  courseSlug: string;
  expectedManagedAssetId?: string | null;
  lessonCode: string;
  studentId: string;
}): Promise<MateriDocumentDelivery> => {
  const subject = materiSubjects.find((candidate) => candidate.slug === courseSlug);
  if (!subject) {
    throw deliveryError("not_found", "Materi tidak ditemukan.", 404);
  }

  try {
    await assertMateriLessonAdmitted(studentId, courseSlug, lessonCode);
  } catch (error) {
    if (error instanceof MateriProgressError) {
      if (error.code === "locked") {
        // Keep admission failures non-leaking: do not reveal whether a later
        // unit has a valid source or expose any managed/hosted URL.
        throw deliveryError("locked", "Dokumen Materi belum tersedia.", 403);
      }
      throw deliveryError(
        error.code === "not_found" ? "not_found" : "unavailable",
        error.message,
        error.status,
      );
    }
    throw error;
  }

  const lesson = await prisma.module.findFirst({
    where: {
      code: lessonCode,
      status: ContentStatus.published,
      topic: {
        code: { in: canonicalTopicCodes(subject.slug) },
        isActive: true,
        parentTopicId: null,
        subtest: { code: subject.code, isActive: true },
      },
    },
    select: {
      assets: {
        where: { assetType: ModuleAssetType.attachment },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          managedAssetId: true,
          managedAsset: {
            select: {
              libraryScope: true,
              mimeType: true,
              objectKey: true,
              originalName: true,
              sizeBytes: true,
              state: true,
              trashedAt: true,
            },
          },
          mediaUrl: true,
          mimeType: true,
          originalName: true,
          sourceKind: true,
        },
      },
    },
  });

  if (!lesson) {
    throw deliveryError("not_found", "Materi tidak tersedia untuk siswa.", 404);
  }

  if (lesson.assets.length === 0) {
    throw deliveryError("missing", "Dokumen PDF Materi tidak ditemukan.", 404);
  }

  if (lesson.assets.length > 1) {
    throw deliveryError("unavailable", "Dokumen PDF Materi memiliki lebih dari satu sumber.", 409);
  }

  const attachment = lesson.assets[0];
  const expectedId = expectedManagedAssetId?.trim() || null;
  const currentManagedAssetId = attachment.managedAssetId?.trim() || null;

  if (expectedId && expectedId !== currentManagedAssetId) {
    throw deliveryError(
      "replaced",
      "Dokumen Materi sudah diganti. Muat ulang halaman untuk membuka dokumen terbaru.",
      409,
    );
  }

  const isManaged = attachment.sourceKind === ModuleAssetSourceKind.managed || Boolean(currentManagedAssetId);
  if (!isManaged) {
    const hostedUrl = attachment.mediaUrl?.trim() || "";
    if (
      attachment.mimeType?.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE
      || !isValidHostedPdfUrl(hostedUrl, attachment.mimeType)
    ) {
      throw deliveryError("unavailable", "URL PDF hosted Materi tidak tersedia.", 409);
    }

    return {
      documentUrl: hostedUrl,
      expiresInSeconds: null,
      managedAssetId: null,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
      originalName: attachment.originalName || null,
      sourceKind: "hosted",
    };
  }

  if (!currentManagedAssetId) {
    throw deliveryError("missing", "Referensi dokumen PDF managed tidak ditemukan.", 404);
  }

  const managedAsset = attachment.managedAsset;
  if (!managedAsset) {
    throw deliveryError("missing", "Dokumen PDF managed sudah tidak tersedia.", 404);
  }

  if (managedAsset.state === MediaAssetState.trashed || managedAsset.trashedAt) {
    throw deliveryError("trashed", "Dokumen PDF Materi sudah dipindahkan ke Sampah.", 410);
  }

  if (
    managedAsset.libraryScope !== MediaLibraryScope.kapten
    || managedAsset.mimeType?.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE
    || managedAsset.state !== MediaAssetState.ready
    || !managedAsset.objectKey
  ) {
    throw deliveryError("unavailable", "Dokumen PDF Materi belum tersedia untuk dibaca.", 503);
  }

  try {
    const head = await headMediaObject(managedAsset.objectKey);
    if (
      head.ContentLength !== managedAsset.sizeBytes
      || head.ContentType?.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE
    ) {
      throw deliveryError("unavailable", "Dokumen PDF Materi tidak cocok dengan metadata tersimpan.", 503);
    }
    const documentUrl = await createMediaPreviewUrl(managedAsset.objectKey);
    const downloadUrl = await createMediaPreviewUrl(managedAsset.objectKey, {
      contentDisposition: "attachment",
      fileName: attachment.originalName || managedAsset.originalName || "materi.pdf",
    });
    return {
      documentUrl,
      downloadUrl,
      expiresInSeconds: PREVIEW_URL_TTL_SECONDS,
      managedAssetId: currentManagedAssetId,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
      originalName: attachment.originalName || managedAsset.originalName || null,
      sourceKind: "managed",
    };
  } catch (error) {
    if (error instanceof MateriDocumentDeliveryError) throw error;
    if (error instanceof R2ConfigurationError) {
      throw deliveryError("unavailable", "Penyimpanan dokumen PDF belum dikonfigurasi.", 503);
    }
    serverLogger.error("materi.document_delivery.signing.failed", error, {
      area: "materi.document_delivery",
      operation: "sign_document_urls",
    });
    throw deliveryError("unavailable", "Dokumen PDF belum dapat dibuka. Coba lagi.", 503);
  }
};

export {
  MateriDocumentDeliveryError,
  resolvePublishedMateriDocument,
};
export type { MateriDocumentDelivery, MateriDocumentDeliveryErrorCode };
