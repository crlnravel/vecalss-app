/**
 * The pure Materi resource contract. Keep this module free of Prisma and
 * Next/server imports so the same validation can be exercised by server and
 * contract tests without a database connection.
 */

const MATERI_DOCUMENT_MIME_TYPE = "application/pdf";

type MateriAssetSourceKind = "hosted" | "managed";

type MateriDocumentInput = {
  /** Alias for managedAssetId used by the media-library picker. */
  assetId?: string | null;
  hostedUrl?: string | null;
  managedAssetId?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
  /** Convenience alias used by a few form adapters. */
  url?: string | null;
};

type MateriDocument = {
  managedAssetId: string | null;
  mimeType: string;
  originalName: string | null;
  sourceKind: MateriAssetSourceKind;
  /** Hosted URLs are safe to expose; managed delivery is resolved later. */
  url: string | null;
};

type MateriVideo = {
  durationSeconds: number;
  mediaUrl: string;
};

type MateriResourceValidationField =
  | "document"
  | "documentMimeType"
  | "documentUrl"
  | "managedAssetId"
  | "videoDuration"
  | "videoUrl"
  | "duration";

type MateriResourceValidationErrors = Partial<
  Record<MateriResourceValidationField, string>
>;

type MateriDocumentValidation =
  | { document: MateriDocument; errors: Record<string, never> }
  | { document: null; errors: MateriResourceValidationErrors };

type MateriVideoValidation =
  | { errors: Record<string, never>; video: MateriVideo | null }
  | { errors: MateriResourceValidationErrors; video: null };

type MateriManagedAssetLike = {
  libraryScope?: string | null;
  mimeType?: string | null;
  objectKey?: string | null;
  originalName?: string | null;
  state?: string | null;
  trashedAt?: Date | null;
  url?: string | null;
};

type MateriResourceLike = {
  assetType: string;
  durationSeconds?: number | null;
  managedAsset?: MateriManagedAssetLike | null;
  managedAssetId?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
  sourceKind?: MateriAssetSourceKind | string | null;
};

type MateriResourceRead = {
  document: MateriDocument | null;
  documentError?: string;
  video: MateriVideo | null;
  videoError?: string;
};

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPdfPath(value: string) {
  try {
    const url = new URL(value.trim());
    return url.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function isValidHostedPdfUrl(value: string, mimeType?: string | null) {
  if (!isHttpUrl(value)) return false;
  // A URL with an explicit PDF MIME can legitimately omit a `.pdf` suffix
  // (for example, a signed object URL). Without that metadata, require the
  // unambiguous PDF extension so malformed/non-PDF links fail closed.
  return isPdfPath(value) || mimeType?.trim().toLowerCase() === MATERI_DOCUMENT_MIME_TYPE;
}

function documentNameFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const candidate = decodeURIComponent(pathname.split("/").pop() ?? "").trim();
    return candidate || null;
  } catch {
    return null;
  }
}

function normalizeMateriDocumentInput(input: MateriDocumentInput | null | undefined): MateriDocumentValidation {
  const hostedUrl = input?.hostedUrl?.trim() || input?.url?.trim() || "";
  const managedAssetId = input?.managedAssetId?.trim() || input?.assetId?.trim() || "";
  const suppliedMimeType = input?.mimeType?.trim().toLowerCase() || "";
  const originalName = input?.originalName?.trim() || null;

  if (hostedUrl && managedAssetId) {
    return {
      document: null,
      errors: { document: "Pilih satu sumber PDF: managed atau URL hosted." },
    };
  }

  if (!hostedUrl && !managedAssetId) {
    return {
      document: null,
      errors: {
        document: "PDF/ebook wajib dipilih atau diisi dengan URL hosted.",
      },
    };
  }

  if (suppliedMimeType && suppliedMimeType !== MATERI_DOCUMENT_MIME_TYPE) {
    return {
      document: null,
      errors: { documentMimeType: "Dokumen Materi harus berformat PDF." },
    };
  }

  if (managedAssetId) {
    return {
      document: {
        managedAssetId,
        mimeType: MATERI_DOCUMENT_MIME_TYPE,
        originalName,
        sourceKind: "managed",
        url: null,
      },
      errors: {},
    };
  }

  if (!isValidHostedPdfUrl(hostedUrl, suppliedMimeType || null)) {
    return {
      document: null,
      errors: {
        documentUrl: "Gunakan URL PDF HTTP atau HTTPS yang valid.",
      },
    };
  }

  return {
    document: {
      managedAssetId: null,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
      originalName: originalName || documentNameFromUrl(hostedUrl),
      sourceKind: "hosted",
      url: hostedUrl,
    },
    errors: {},
  };
}

function parseVideoDurationSeconds(value: string) {
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function validateMateriVideoInput({
  duration,
  durationField = "videoDuration",
  url,
  urlField = "videoUrl",
}: {
  duration?: string | null;
  durationField?: "videoDuration" | "duration";
  url?: string | null;
  urlField?: "videoUrl";
}): MateriVideoValidation {
  const normalizedUrl = url?.trim() || "";
  const normalizedDuration = duration?.trim() || "";
  if (!normalizedUrl && !normalizedDuration) return { errors: {}, video: null };

  const errors: MateriResourceValidationErrors = {};
  if (!normalizedUrl) {
    errors[urlField] = "URL video wajib diisi jika durasi video diisi.";
  } else if (!isHttpUrl(normalizedUrl)) {
    errors[urlField] = "Gunakan URL video HTTP atau HTTPS yang valid.";
  }

  if (!normalizedDuration) {
    errors[durationField] = "Durasi video wajib diisi jika URL video diisi.";
  } else if (!parseVideoDurationSeconds(normalizedDuration)) {
    errors[durationField] = "Gunakan format MM:SS dengan durasi lebih dari 00:00.";
  }

  if (Object.keys(errors).length > 0) return { errors, video: null };
  return {
    errors: {},
    video: {
      durationSeconds: parseVideoDurationSeconds(normalizedDuration)!,
      mediaUrl: normalizedUrl,
    },
  };
}

function toReadDocument(resource: MateriResourceLike): MateriDocument | null {
  if (
    resource.sourceKind
    && resource.sourceKind !== "hosted"
    && resource.sourceKind !== "managed"
  ) {
    return null;
  }
  const isManaged = resource.sourceKind === "managed" || Boolean(resource.managedAssetId);
  if (isManaged) {
    const managed = resource.managedAsset;
    if (
      !resource.managedAssetId
      || !managed
      || managed.libraryScope !== "kapten"
      || managed.state !== "ready"
      || managed.trashedAt
      || managed.mimeType?.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE
      || !managed.objectKey?.trim()
    ) {
      return null;
    }

    return {
      managedAssetId: resource.managedAssetId,
      mimeType: MATERI_DOCUMENT_MIME_TYPE,
      originalName: resource.originalName || managed.originalName || null,
      sourceKind: "managed",
      url: null,
    };
  }

  const url = resource.mediaUrl?.trim() || "";
  if (
    !url
    || resource.mimeType?.trim().toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE
    || !isValidHostedPdfUrl(url, resource.mimeType)
  ) {
    return null;
  }

  return {
    managedAssetId: null,
    mimeType: MATERI_DOCUMENT_MIME_TYPE,
    originalName: resource.originalName || documentNameFromUrl(url),
    sourceKind: "hosted",
    url,
  };
}

function readMateriResources(resources: readonly MateriResourceLike[]): MateriResourceRead {
  const documents = resources.filter((resource) => resource.assetType === "attachment");
  const videos = resources.filter((resource) => resource.assetType === "video");

  if (documents.length === 0) {
    return {
      document: null,
      documentError: "required",
      video: null,
      ...(videos.length > 1 ? { videoError: "ambiguous" } : {}),
    };
  }
  if (documents.length > 1) {
    return {
      document: null,
      documentError: "ambiguous",
      video: null,
      ...(videos.length > 1 ? { videoError: "ambiguous" } : {}),
    };
  }

  const document = toReadDocument(documents[0]);
  const video = videos.length === 1 ? videos[0] : null;
  const validVideo = video
    && isNonBlank(video.mediaUrl)
    && isHttpUrl(video.mediaUrl)
    && typeof video.durationSeconds === "number"
    && Number.isSafeInteger(video.durationSeconds)
    && video.durationSeconds > 0
    ? { durationSeconds: video.durationSeconds, mediaUrl: video.mediaUrl.trim() }
    : null;
  const videoError = videos.length > 1
    ? "ambiguous"
    : video && !validVideo
      ? "invalid"
      : undefined;

  return {
    document,
    ...(document ? {} : { documentError: "invalid" }),
    video: validVideo,
    ...(videoError ? { videoError } : {}),
  };
}

function isMateriReady(title: string, resources: MateriResourceRead) {
  return Boolean(
    title.trim()
    && resources.document
    && !resources.documentError
    && !resources.videoError,
  );
}

export {
  MATERI_DOCUMENT_MIME_TYPE,
  isHttpUrl,
  isMateriReady,
  isPdfPath,
  isValidHostedPdfUrl,
  normalizeMateriDocumentInput,
  parseVideoDurationSeconds,
  readMateriResources,
  validateMateriVideoInput,
};
export type {
  MateriAssetSourceKind,
  MateriDocument,
  MateriDocumentInput,
  MateriDocumentValidation,
  MateriManagedAssetLike,
  MateriResourceLike,
  MateriResourceRead,
  MateriResourceValidationErrors,
  MateriVideo,
  MateriVideoValidation,
};
